/**
 * T-MIG-092 run-003 — post-fix golden-verify re-run (the wire proof gate for
 * the narrow widen; flip law: widening stays gated on the family
 * golden-verified surface).
 *
 * Method of record (run-002 pattern): the 14-leg LLM-free matrix replayed
 * against the LIVE v2 deploy with a FRESH probe learner (registered on the v2
 * plane — shared-secret token, seam verified closed, trace 1a1177d16bbd0a49);
 * the core side is the FROZEN fixture set of record
 * (golden-captures/t-mig-092/, captured from live frozen core 6cad6ef94).
 * Comparison: status equality + normalized body deep-equality (RFC 8259 key
 * canonicalization; uuid-map: each plane's freshly created session id ->
 * PROBE_SESSION_1; ISO-8601 timestamps -> <TS>; envelope-timestamp key
 * dropped per the run-002 normalization law — NO field widening beyond that).
 *
 * Discipline (R-LLM): LLM-free legs only — sessions CRUD + binding-time 400
 * + pre-flight 404s; NO valid-shape /ask leg. Write legs = probe-learner-owned
 * create+delete, net zero rows. The probe token is NEVER persisted; the probe
 * email is redacted from the receipt.
 *
 * Run: bun run-003-verify.ts [--fixtures-dir DIR] [--out FILE] [--v2-base URL]
 * Exit: 0 iff ALL PASS.
 */

const CORE_BASE = "https://syllabai-core.onrender.com";
const V2_BASE = "https://syllabai-v2.vercel.app";
const UNKNOWN_SESSION = "3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab"; // fixed pre-flight 404 id, both planes
const EMAIL_DOMAIN = "example.invalid";

function argFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const V2 = argFlag("--v2-base", V2_BASE).replace(/\/$/, "");
const FIXTURES = argFlag("--fixtures-dir", "/tmp/syllabai-v2/golden-captures/t-mig-092");
const OUT = argFlag("--out", "/tmp/syllabai-v2/.syllabai/receipts/T-MIG-092/run-003-golden-verify-r0.json");

interface LegResult {
  leg: string;
  name: string;
  method: string;
  path: string;
  v2_status: number;
  core_status: number;
  status_match: boolean;
  body_match: boolean;
  verdict: "PASS" | "FAIL";
  v2_body: unknown;
  core_body: unknown;
}

// ---------- normalization (run-002 law: envelope-timestamp + uuid-map only) ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function mapInString(s: string, map: Map<string, string>): string {
  let out = s;
  for (const [uuid, sym] of map) out = out.split(uuid).join(sym);
  return out;
}

function normalize(x: unknown, map: Map<string, string>): unknown {
  if (typeof x === "string") {
    if (UUID_RE.test(x) && map.has(x)) return map.get(x) as string;
    if (ISO_TS_RE.test(x)) return "<TS>";
    return map.size > 0 ? mapInString(x, map) : x;
  }
  if (Array.isArray(x)) return x.map((v) => normalize(v, map));
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>).sort()) {
      if (k === "timestamp") continue; // envelope-timestamp emission field
      out[k] = normalize((x as Record<string, unknown>)[k], map);
    }
    return out;
  }
  return x;
}

// ---------- probe learner (fresh, v2-registered; never persisted) ----------

async function registerProbe(): Promise<string> {
  const email = `r0-092run3-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${EMAIL_DOMAIN}`;
  const res = await fetch(`${V2}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: `R0-092-run3#${Date.now().toString(36)}x`,
      displayName: "R0 T-MIG-092 run-003 probe",
    }),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`probe register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { accessToken?: string; token?: string };
  const token = body.accessToken ?? body.token;
  if (!token) throw new Error("probe register returned no token");
  return token;
}

// ---------- leg runner ----------

async function call(
  base: string,
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

async function main(): Promise<number> {
  const token = await registerProbe();
  const coreMap = new Map<string, string>(); // fixture (core) uuid -> PROBE_SESSION_1
  const v2Map = new Map<string, string>(); // v2-created uuid -> PROBE_SESSION_1
  const legs: LegResult[] = [];

  type Step = { leg: string; name: string; method: string; path: () => string; body?: unknown; auth: boolean };
  const steps: Step[] = [
    { leg: "L01", name: "list-initial", method: "GET", path: () => `/api/v1/tutor/sessions`, auth: true },
    { leg: "L02", name: "latest-initial-204", method: "GET", path: () => `/api/v1/tutor/sessions/latest`, auth: true },
    { leg: "L03", name: "unknown-session-404", method: "GET", path: () => `/api/v1/tutor/sessions/${UNKNOWN_SESSION}`, auth: true },
    { leg: "L04", name: "list-unauthed-401", method: "GET", path: () => `/api/v1/tutor/sessions`, auth: false },
    { leg: "L05", name: "create-201", method: "POST", path: () => `/api/v1/tutor/sessions`, auth: true },
    { leg: "L06", name: "list-one-summary-200", method: "GET", path: () => `/api/v1/tutor/sessions`, auth: true },
    { leg: "L07", name: "latest-200", method: "GET", path: () => `/api/v1/tutor/sessions/latest`, auth: true },
    { leg: "L08", name: "transcript-200", method: "GET", path: () => `/api/v1/tutor/sessions/${[...v2Map.keys()][0] ?? "PENDING"}`, auth: true },
    { leg: "L09", name: "ask-blank-400", method: "POST", path: () => `/api/v1/tutor/ask`, body: { history: [], question: "   " }, auth: true },
    { leg: "L10", name: "ask-unknown-session-404", method: "POST", path: () => `/api/v1/tutor/ask`, body: { history: [], question: "What is 2+2?", sessionId: UNKNOWN_SESSION }, auth: true },
    { leg: "L11", name: "delete-204", method: "DELETE", path: () => `/api/v1/tutor/sessions/${[...v2Map.keys()][0] ?? "PENDING"}`, auth: true },
    { leg: "L12", name: "get-deleted-404", method: "GET", path: () => `/api/v1/tutor/sessions/${[...v2Map.keys()][0] ?? "PENDING"}`, auth: true },
    { leg: "L13", name: "list-after-delete-200", method: "GET", path: () => `/api/v1/tutor/sessions`, auth: true },
    { leg: "L14", name: "latest-after-delete-204", method: "GET", path: () => `/api/v1/tutor/sessions/latest`, auth: true },
  ];

  for (const s of steps) {
    // v2 live replay
    const v2r = await call(V2, s.method, s.path(), s.auth ? token : null, s.body);
    if (s.leg === "L05") {
      const vb = v2r.body as { sessionId?: string } | null;
      if (vb?.sessionId) v2Map.set(vb.sessionId, "PROBE_SESSION_1");
    }
    // core frozen fixture of record (file naming: leg-NN-<name>.json)
    const legNum = s.leg.slice(1).padStart(2, "0");
    const fixture = (await Bun.file(`${FIXTURES}/leg-${legNum}-${s.name}.json`).json()) as {
      status: number;
      response_body: unknown;
    };
    const coreStatus = fixture.status;
    const coreBodyRaw = fixture.response_body;
    if (s.leg === "L05") {
      const cb = coreBodyRaw as { sessionId?: string } | null;
      if (cb?.sessionId) coreMap.set(cb.sessionId, "PROBE_SESSION_1");
    }
    const coreBody = normalize(coreBodyRaw, coreMap);
    const v2Body = normalize(v2r.body, v2Map);
    const statusMatch = v2r.status === coreStatus;
    const bodyMatch = JSON.stringify(v2Body) === JSON.stringify(coreBody);
    const shownV2 = [...v2Map.keys()][0];
    legs.push({
      leg: s.leg,
      name: s.name,
      method: s.method,
      path: shownV2 ? s.path().replace(shownV2, "PROBE_SESSION_1") : s.path(),
      v2_status: v2r.status,
      core_status: coreStatus,
      status_match: statusMatch,
      body_match: bodyMatch,
      verdict: statusMatch && bodyMatch ? "PASS" : "FAIL",
      v2_body: v2Body,
      core_body: coreBody,
    });
    console.log(`${s.leg} ${s.name}: v2=${v2r.status} core=${coreStatus} ${legs[legs.length - 1]!.verdict}`);
  }

  const allPass = legs.every((l) => l.verdict === "PASS");
  const receipt = {
    card: "T-MIG-092",
    receipt: "run-003-golden-verify-r0",
    lane: "r0",
    created_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    operator_trace: "1a11790a99a3cb19 (rider) / 1a117b373fb79e01 (direct merge order)",
    method:
      "run-002 pattern post-fix re-run: 14-leg LLM-free matrix vs the live v2 deploy with a FRESH v2-registered probe learner (token never persisted, email redacted); core side = frozen fixtures of record (golden-captures/t-mig-092/, live frozen core 6cad6ef94). Normalization: envelope-timestamp key dropped + ISO timestamps -> <TS> + uuid-map (fresh per-plane session ids -> PROBE_SESSION_1). NO field widening.",
    target_of_record: {
      v2: V2,
      core_frozen_ref: "6cad6ef94",
      fix_under_proof: "T-MIG-093 (PR #141 merge a356a7d): session-store list() scalar-param IN law",
    },
    verdict: allPass ? "ALL PASS" : "FAIL",
    legs,
  };
  await Bun.write(OUT, JSON.stringify(receipt, null, 1) + "\n");
  console.log(allPass ? "VERDICT: ALL PASS (14/14)" : "VERDICT: FAIL");
  return allPass ? 0 : 1;
}

process.exit(await main());
