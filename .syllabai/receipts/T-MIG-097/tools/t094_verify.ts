/**
 * T-MIG-094 run-001 — learner-me HEART golden-verify (live-core vs live-v2
 * dual replay; T-MIG-092 run-003 pattern).
 *
 * The 092 chain proved the live v2 deploy (dpl_5VuNMyfq5vknZSEsMkyFrUCgmcbL,
 * built from main ec3bb4c) serves the frozen wire — main has advanced only by
 * .syllabai/hub flip-table content since, zero api/packages changes, so the
 * live deploy IS the of-record mounted implementation this flip routes to.
 * The live core is the frozen wire (6cad6ef94 autoDeploy identity re-verified
 * same-day of record).
 *
 * Matrix: 18 LLM-free legs — empty-state reads, validation/existence error
 * wires, authz shells. NO generation-reaching legs. Net DB rows: one probe
 * learner (registered on v2, shared-secret token — seam closed, of record).
 * Token NEVER persisted; probe email redacted.
 *
 * Run: bun t094_verify.ts [--out FILE]
 * Exit 0 iff ALL PASS.
 */

const CORE = "https://syllabai-core.onrender.com";
const V2 = "https://syllabai-v2.vercel.app";
const FAKE_UUID = "3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab"; // fixed pre-flight id, both planes
const FAKE_SLUG = "igcse-physics-does-not-exist-094";

function argFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = argFlag("--out", "/tmp/syllabai-v2/.syllabai/receipts/T-MIG-094/run-001-golden-verify-r0.json");

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
      if (k === "timestamp") continue; // Boot envelope emission field
      out[k] = normalize((x as Record<string, unknown>)[k]);
    }
    return out;
  }
  return x;
}

async function registerProbe(): Promise<string> {
  const email = `r0-094-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
  const res = await fetch(`${V2}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: `R0-094#${Date.now().toString(36)}x`,
      displayName: "R0 T-MIG-094 probe",
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

type Leg = {
  leg: string;
  name: string;
  method: string;
  path: string;
  body?: unknown;
  auth: boolean;
};

const LEGS: Leg[] = [
  { leg: "L01", name: "agenda-empty", method: "GET", path: "/api/v1/learners/me/agenda", auth: true },
  { leg: "L02", name: "agenda-unknown-root", method: "GET", path: `/api/v1/learners/me/agenda?rootId=${FAKE_UUID}`, auth: true },
  { leg: "L03", name: "recommendations-missing-root", method: "GET", path: "/api/v1/learners/me/recommendations", auth: true },
  { leg: "L04", name: "recommendations-unknown-root", method: "GET", path: `/api/v1/learners/me/recommendations?rootId=${FAKE_UUID}`, auth: true },
  { leg: "L05", name: "trail-empty", method: "GET", path: "/api/v1/learners/me/flashcard-rating-trail", auth: true },
  { leg: "L06", name: "trail-limit-law", method: "GET", path: "/api/v1/learners/me/flashcard-rating-trail?limit=10000", auth: true },
  { leg: "L07", name: "review-schedule-empty", method: "GET", path: "/api/v1/learners/me/flashcard-review-schedule", auth: true },
  { leg: "L08", name: "flashcard-rating-blank", method: "POST", path: "/api/v1/learners/me/flashcard-ratings", body: {}, auth: true },
  { leg: "L09", name: "flashcard-rating-unknown-card", method: "POST", path: "/api/v1/learners/me/flashcard-ratings", body: { flashcardId: FAKE_UUID, rating: "GOOD" }, auth: true },
  { leg: "L10", name: "note-vote-blank", method: "POST", path: "/api/v1/learners/me/note-votes", body: {}, auth: true },
  { leg: "L11", name: "exam-series-empty", method: "GET", path: "/api/v1/learners/me/exam-series", auth: true },
  { leg: "L12", name: "target-series-unknown-slug-put", method: "PUT", path: `/api/v1/learners/me/courses/${FAKE_SLUG}/target-series`, body: { seriesId: FAKE_UUID }, auth: true },
  { leg: "L13", name: "target-series-unknown-slug-delete", method: "DELETE", path: `/api/v1/learners/me/courses/${FAKE_SLUG}/target-series`, auth: true },
  { leg: "L14", name: "assignments-empty", method: "GET", path: "/api/v1/learners/me/assignments", auth: true },
  { leg: "L15", name: "submission-unknown-assignment", method: "POST", path: `/api/v1/learners/me/assignments/${FAKE_UUID}/submissions`, body: {}, auth: true },
  { leg: "L16", name: "state", method: "GET", path: "/api/v1/learners/me/state", auth: true },
  { leg: "L17", name: "course-stats", method: "GET", path: "/api/v1/learners/me/course-stats", auth: true },
  { leg: "L18", name: "agenda-unauthed-401", method: "GET", path: "/api/v1/learners/me/agenda", auth: false },
];

async function main(): Promise<number> {
  const token = await registerProbe();
  const legs: unknown[] = [];
  let allPass = true;

  for (const s of LEGS) {
    const core = await call(CORE, s.method, s.path, s.auth ? token : null, s.body);
    const v2 = await call(V2, s.method, s.path, s.auth ? token : null, s.body);
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
    card: "T-MIG-094",
    receipt: "run-001-golden-verify-r0",
    lane: "r0",
    created_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    operator_trace: "1a117ee8fb5b520d (flip queue: CLA, learner-me heart, teacher surfaces)",
    method:
      "T-MIG-092 run-003 pattern: 18-leg LLM-free matrix dual-replayed LIVE against the frozen core (6cad6ef94 autoDeploy identity, re-verified same-day of record) and the live v2 deploy (dpl_5VuNMyfq5vknZSEsMkyFrUCgmcbL = main ec3bb4c content; main has advanced only by .syllabai/hub flip-table content since — zero api/packages changes). One fresh v2-registered probe learner (shared-secret token, seam closed of record; token never persisted, email redacted). Normalization: Boot envelope timestamp key dropped + ISO timestamps -> <TS>; uuid-map machinery unused (no create-201 legs — all writes ride error wires by design; the 201/204 write wires carry the mounts' unit pins, disclosed). NO field widening.",
    verdict: allPass ? "ALL PASS" : "FAIL",
    legs,
  };
  await Bun.write(OUT, JSON.stringify(receipt, null, 1) + "\n");
  console.log(allPass ? "VERDICT: ALL PASS (18/18)" : "VERDICT: FAIL");
  return allPass ? 0 : 1;
}

process.exit(await main());
