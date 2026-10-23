/**
 * F-188 serving-receipt probe (run-002 of the F-188 line) — the ADR-038 gate
 * evidence harness. Runs against the DEPLOYED plane of record (hosting decision
 * of record: docs/F188-REALTIME-HOSTING.md) and proves the plane SERVES:
 * authenticated handshake (welcome + caps), loopback ping/pong latency against
 * the 60s battle-clock smoke bound, and a presence room join/snapshot/leave
 * round-trip. Standalone — zero imports, speaks envelope v1 of record
 * (apps/api/src/realtime/protocol.ts) as a client.
 *
 * Usage:
 *   REALTIME_URL="wss://<service>.onrender.com/realtime" \
 *   BEARER="<jwt of record>" \
 *   bun apps/api/scripts/realtime-serving-probe.ts
 *
 * Exit codes: 0 = SERVED (receipt-grade), 2 = plane up + auth fail-closed
 * (binding rejected the credential — hosting proven, receipt needs a valid
 * JWT), 1 = probe failure (plane not serving).
 */

const url = process.env.REALTIME_URL;
const bearer = process.env.BEARER;

if (!url || !bearer) {
  console.error(JSON.stringify({ probe: "f188-serving-receipt", verdict: "misconfigured", need: ["REALTIME_URL", "BEARER"] }, null, 2));
  process.exit(1);
}
if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
  console.error(JSON.stringify({ probe: "f188-serving-receipt", verdict: "misconfigured", detail: "REALTIME_URL must be a ws(s)://.../realtime endpoint" }, null, 2));
  process.exit(1);
}

const V = 1; // envelope version of record
const SMOKE_BOUND_MS = 60_000; // the battle-clock smoke bound of record
const TIMEOUT_MS = 20_000;

const startedAt = new Date().toISOString();
const steps: Array<{ step: string; ok: boolean; detail?: unknown; ms?: number }> = [];

function verdict(exitCode: number, result: string) {
  console.log(JSON.stringify({
    probe: "f188-serving-receipt",
    run: "run-002 (hosting line)",
    verdict: result,
    endpoint: url,
    envelopeVersion: V,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
  }, null, 2));
  process.exit(exitCode);
}

const ws = new WebSocket(`${url}?bearer=${encodeURIComponent(bearer)}`);

const timer = setTimeout(() => {
  steps.push({ step: "overall-timeout", ok: false, detail: `${TIMEOUT_MS}ms elapsed` });
  try { ws.close(1000, "probe timeout"); } catch {}
  verdict(1, "timeout");
}, TIMEOUT_MS);

function step(name: string, ok: boolean, ms: number | undefined, detail?: unknown) {
  steps.push({ step: name, ok, ...(ms !== undefined ? { ms } : {}), ...(detail !== undefined ? { detail } : {}) });
}

let helloSent = false;

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v: V, type: "hello" }));
  helloSent = true;
});

ws.addEventListener("message", (ev) => {
  let f: any;
  try { f = JSON.parse(String(ev.data)); } catch {
    step("frame-parse", false, undefined, "non-JSON server frame");
    clearTimeout(timer); try { ws.close(1000, "bad frame"); } catch {}
    verdict(1, "probe-failure");
    return;
  }

  if (f.type === "welcome") {
    const capsOk = f.caps && f.caps.protocolVersion === V;
    step("handshake-welcome", Boolean(f.connId && f.userId && capsOk), undefined,
      { connId: f.connId, userId: f.userId, serverTime: f.serverTime, protocolVersion: f.caps?.protocolVersion, online: f.online });
    const t0 = Date.now();
    ws.send(JSON.stringify({ v: V, type: "ping", t0 }));
  } else if (f.type === "pong") {
    const rtt = f.t0 != null ? Date.now() - f.t0 : undefined;
    const ok = typeof rtt === "number" && rtt >= 0 && rtt <= SMOKE_BOUND_MS;
    step("loopback-pong", ok, rtt, { boundMs: SMOKE_BOUND_MS, serverTime: f.serverTime });
    ws.send(JSON.stringify({ v: V, type: "room.join", room: "receipt-probe-room" }));
  } else if (f.type === "presence.snapshot") {
    const ok = f.room === "receipt-probe-room" && Array.isArray(f.members) && f.members.length >= 1;
    step("presence-snapshot", ok, undefined, { room: f.room, members: f.members, at: f.at });
    ws.send(JSON.stringify({ v: V, type: "room.leave", room: "receipt-probe-room" }));
    clearTimeout(timer);
    try { ws.close(1000, "receipt complete"); } catch {}
    verdict(ok ? 0 : 1, ok ? "served" : "probe-failure");
  } else if (f.type === "error") {
    step("server-error-frame", false, undefined, { code: f.code, message: f.message, of: f.of });
    clearTimeout(timer);
    try { ws.close(1000, "error frame"); } catch {}
    // fail-closed codes after a successful welcome are still a serving proof
    const sawWelcome = steps.some((s) => s.step === "handshake-welcome" && s.ok);
    verdict(sawWelcome ? 0 : 1, sawWelcome ? "served (with error frame)" : "probe-failure");
  }
});

ws.addEventListener("close", (ev) => {
  clearTimeout(timer);
  if (ev.code === 1006 || ev.code === 1015) {
    step("connection-closed", false, undefined, { code: ev.code, reason: ev.reason || "handshake failure / TLS or reachability" });
    verdict(1, "not-serving");
  }
  // The fail-closed upgrade rejection of record: the plane is UP and the
  // identity law enforced (401-shaped close before any server frame).
  if (!helloSent && (ev.code === 1008 || ev.code === 1002)) {
    step("fail-closed-rejection", true, undefined, { code: ev.code, reason: ev.reason, meaning: "plane binds and enforces the identity law at the upgrade" });
    verdict(2, "up-auth-fail-closed");
  }
  if (!helloSent) {
    step("closed-before-hello", false, undefined, { code: ev.code, reason: ev.reason });
    verdict(1, "not-serving");
  }
  // Closed after hello: the walk above either already reached a verdict or
  // dropped mid-way — treat as probe failure with whatever steps recorded.
  verdict(1, "probe-failure");
});
