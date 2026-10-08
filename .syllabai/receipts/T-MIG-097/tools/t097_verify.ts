/**
 * T-MIG-097 run-001 — CLA flip-disposition golden-verify (LLM-free legs only).
 *
 * The CLA path (POST /api/v1/learners/me/cla/ask) is shared by deterministic
 * refusals AND generation-reaching kinds. On the v2 zero-key deploy the
 * generation-reaching leg of the pipeline 503s (the dormant seam law,
 * TutorGenerationError -> tutor_unavailable) where the live core serves 200.
 * A path flip would therefore 503 real user asks — the flip is
 * BLOCKED-ON-LLM-ENABLEMENT (the operator's section-3 lever) unless and
 * until the served kinds are proven generation-free on the deployed v2.
 *
 * This run golden-verifies the DETERMINISTIC-REFUSAL wire (the legs that
 * never reach generation — the cla.ts law: "deterministic refusals NEVER
 * 503") dual-replayed live core 6cad6ef94 vs the live v2 deploy. 092 run-003
 * pattern; probe learner fresh; token never persisted.
 *
 * Run: bun t097_verify.ts [--out FILE]
 * Exit 0 iff ALL PASS.
 *
 * T-MIG-097 run-003 vehicle (r7a, operator chain order trace
 * 1a119df7d930b609 "desk merge -> deploy recipe -> live run-003 -> ..."):
 * the harness is now DUAL-PROBE and env-overridable — the core legs use a
 * token minted by a probe registered on the LIVE CORE, the v2 legs a token
 * minted by a probe registered on the v2 target (the refusal bodies are
 * identity-free, so the two probes need not be the same learner; this is
 * what lets a CI-booted v2 verify against the live core without any secret
 * sharing). Defaults preserved: CORE = the frozen Render core, V2 = the
 * api-of-record alias. Override T097_CORE / T097_V2 for CI-boot postures.
 */

const CORE = process.env.T097_CORE ?? "https://syllabai-core.onrender.com";
const V2 = process.env.T097_V2 ?? "https://syllabai-v2.vercel.app";

function argFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = argFlag("--out", "/tmp/syllabai-v2/.syllabai/receipts/T-MIG-097/run-001-golden-verify-r0.json");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function normalize(x: unknown): unknown {
  if (typeof x === "string") {
    if (ISO_TS_RE.test(x)) return "<TS>";
    return x;
  }
  if (Array.isArray(x)) return x.map(normalize);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>).sort()) {
      if (k === "timestamp") continue;
      out[k] = normalize((x as Record<string, unknown>)[k]);
    }
    return out;
  }
  return x;
}

async function registerProbe(base: string, label: string): Promise<string> {
  const email = `t097-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: `T097-${label}#${Date.now().toString(36)}x`,
      displayName: `T-MIG-097 ${label} probe`,
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`probe register failed on ${base}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { accessToken?: string; token?: string };
  const token = body.accessToken ?? body.token;
  if (!token) throw new Error(`probe register returned no token on ${base}`);
  return token;
}

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
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(50000),
  });
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

type Leg = { leg: string; name: string; method: string; path: string; body?: unknown; auth: boolean };
const ASK = "/api/v1/learners/me/cla/ask";

const LEGS: Leg[] = [
  { leg: "L01", name: "empty-body-first-blank", method: "POST", path: ASK, body: {}, auth: true },
  { leg: "L02", name: "kind-closed-enum", method: "POST", path: ASK, body: { kind: "BOGUS_KIND_097", mode: "EXPLAIN", question: "What is electrolysis?" }, auth: true },
  { leg: "L03", name: "mode-closed-enum", method: "POST", path: ASK, body: { kind: "SPECIFICATION_POINT", mode: "BOGUS_MODE_097", question: "What is electrolysis?" }, auth: true },
  { leg: "L04", name: "question-blank", method: "POST", path: ASK, body: { kind: "SPECIFICATION_POINT", mode: "EXPLAIN", question: "   " }, auth: true },
  { leg: "L05", name: "deferral-smart-lesson-400", method: "POST", path: ASK, body: { kind: "SMART_LESSON", mode: "EXPLAIN", question: "Explain topic X" }, auth: true },
  { leg: "L06", name: "deferral-note-section-400", method: "POST", path: ASK, body: { kind: "NOTE_SECTION", mode: "HINT", question: "Summarize my note" }, auth: true },
  { leg: "L07", name: "spec-point-missing-ref", method: "POST", path: ASK, body: { kind: "SPECIFICATION_POINT", mode: "EXPLAIN", question: "Explain it" }, auth: true },
  { leg: "L08", name: "spec-point-unknown-ref", method: "POST", path: ASK, body: { kind: "SPECIFICATION_POINT", mode: "EXPLAIN", question: "Explain it", specCode: "unknown-spec-anchor-097" }, auth: true },
  { leg: "L09", name: "kg-topic-missing-ref", method: "POST", path: ASK, body: { kind: "KG_TOPIC", mode: "SUMMARIZE", question: "Summarize it" }, auth: true },
  { leg: "L10", name: "unauthed-401", method: "POST", path: ASK, body: { kind: "SPECIFICATION_POINT", mode: "EXPLAIN", question: "q" }, auth: false },
];

async function main(): Promise<number> {
  // dual probe: each wire verifies with a token its own issuer minted (the
  // refusal bodies compared are identity-free — see the header note)
  const coreToken = await registerProbe(CORE, "core");
  const v2Token = await registerProbe(V2, "v2");
  // Render cold-start warm-up: the known 60-120s free-tier class — wake the
  // core BEFORE the matrix so a cold boot does not masquerade as a hang.
  for (let i = 0; i < 4; i++) {
    try {
      const w = await call(CORE, "GET", "/actuator/health", null);
      if (w.status === 200) {
        console.log(`core warm after ${i + 1} probe(s)`);
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const legs: unknown[] = [];
  let allPass = true;

  for (const s of LEGS) {
    let core: { status: number; body: unknown };
    let v2: { status: number; body: unknown };
    try {
      core = await call(CORE, s.method, s.path, s.auth ? coreToken : null, s.body);
    } catch (e) {
      core = { status: -1, body: `core call error: ${String(e).slice(0, 120)}` };
    }
    try {
      v2 = await call(V2, s.method, s.path, s.auth ? v2Token : null, s.body);
    } catch (e) {
      v2 = { status: -1, body: `v2 call error: ${String(e).slice(0, 120)}` };
    }
    const statusMatch = core.status === v2.status;
    const coreBody = normalize(core.body);
    const v2Body = normalize(v2.body);
    const bodyMatch = JSON.stringify(coreBody) === JSON.stringify(v2Body);
    const verdict = statusMatch && bodyMatch ? "PASS" : "FAIL";
    if (verdict === "FAIL") allPass = false;
    legs.push({
      leg: s.leg, name: s.name, method: s.method, path: s.path,
      core_status: core.status, v2_status: v2.status,
      status_match: statusMatch, body_match: bodyMatch, verdict,
      core_body: coreBody, v2_body: v2Body,
    });
    console.log(`${s.leg} ${s.name}: core=${core.status} v2=${v2.status} ${verdict}`);
  }

  const receipt = {
    card: "T-MIG-097",
    receipt: process.env.T097_RECEIPT_NAME ?? "run-003-refusal-verify",
    lane: "r7a",
    created_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    operator_trace: "1a119df7d930b609 (chain order: desk merge -> deploy -> live run-003 -> section-3 -> rider -> flip)",
    method:
      "T-MIG-097 run-001 pattern, DUAL-PROBE vehicle: the deterministic-refusal matrix (10 LLM-free legs, NO generation-reaching leg) dual-replayed CORE vs V2, each wire verified with a token its own issuer minted (core-registered probe for the core legs, v2-registered probe for the v2 legs; refusal bodies are identity-free). CORE and V2 are T097_CORE/T097_V2-overridable; defaults = live frozen core + the api-of-record alias. Normalization: Boot envelope timestamp dropped + ISO timestamps -> <TS>.",
    disposition:
      "POST-REPAIR POSTURE (run-002 landed via PR #151 bc4ec31): the refusal wire was repaired to the captured law (L01-L06 verbatim; PR #151 evidence). This run is the live re-verify: ALL PASS = the 10-leg deterministic-refusal matrix is frozen-identical end-to-end, closing the refusal half of the BLOCKED-of-record flip. The generation half rides the section-3 lever state (the #144 real-adapter chain is landed on main and wired via chainAsLlmProvider; keys are configured on the api-of-record env of record) + the post-enablement generation-wire verify rider.",
    verdict: allPass ? "ALL PASS" : "FAIL",
    legs,
  };
  await Bun.write(OUT, JSON.stringify(receipt, null, 1) + "\n");
  console.log(allPass ? "VERDICT: ALL PASS (refusal wire)" : "VERDICT: FAIL");
  return allPass ? 0 : 1;
}

process.exit(await main());
