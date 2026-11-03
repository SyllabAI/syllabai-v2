/**
 * T-MIG-088/089/091 golden-verify — leg replay harness (evidence-only).
 *
 * Serves apps/api/src/index.ts (working tree at main 990d37a — the #138
 * tranche-B mounts of record) with the T-MIG-022 harness-owned envelope,
 * CAPTURE posture + ZERO-KEY law (no LLM credentials in env — asserted,
 * exit 4). Substrate: local scratch Postgres 17.11 user-tree (db
 * syllabai_v2_verify, pgvector 0.8.0) on 127.0.0.1:5433 — the T-MIG-014
 * dispatch rule puts any non-neon host on postgres.js TCP. Zero prod /
 * Neon contact.
 *
 * Legs (golden-captures/t-mig-088|089|091/, capture of record = r4b
 * local-boot of frozen core 6cad6ef, receipts run-001-capture-r4b.json) —
 * 9 + 6 + 7 = 22 legs; the exact requests are the capture-driver.py
 * definitions of record (scripts/capture-driver.py, trace 1a1151442250feb1):
 *   088: enumerate/fetch/topics — 401/403 shells, empty-result 200s, the
 *        404-first law on unknown question …0025 (GET+POST), 400 bad body
 *   089: glm-ocr pairs/findings — 401/403 shells, the catch-all-500 law on
 *        {} and all-null canonical (the Jackson-wide binding semantics),
 *        404-first on unknown paper …0026 (teacher + admin)
 *   091: exam-series import — 401/403 shells, 409 no-board, 400 bad qual,
 *        valid 200 {imported:1,unchanged:0,updated:0} then repeat
 *        {imported:0,unchanged:1,updated:0} (teacher + admin)
 * Diffs vs captures: status + body deep-equal (envelope timestamp dropped —
 * the 082 run-003 method; order-insensitive canonical JSON). Header deltas
 * disclosed per-leg (api-wide default cache-posture class, 082 run-003).
 */
import app from "/home/z/my-project/repos/syllabai-v2/apps/api/src/index.ts";
import { JwtService } from "/home/z/my-project/repos/syllabai-v2/apps/api/src/services/identity/jwt";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 8901);
const BASE = "http://127.0.0.1:" + PORT;
const CAP = "/home/z/my-project/repos/syllabai-v2/golden-captures";
const ROOT = "00000000-0000-4000-8000-000000000001"; // 084 substrate root (primaryNodeId never reaches wire: 404-first on question)

// ── ZERO-KEY boot law ──
const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) {
  console.error("harness: ZERO-KEY law violated — LLM credentials present in env:", FORBIDDEN);
  process.exit(4);
}
console.log("harness: ZERO-KEY boot law asserted (no LLM credentials in env)");

Bun.serve({ port: PORT, idleTimeout: 60, fetch: app.fetch });
console.log(`harness: serving api on :${PORT}`);

// ── tokens (harness secret = boot secret; HS256 44+ byte law) ──
const SECRET = process.env.SYLLABAI_JWT_SECRET!;
const jwt = new JwtService(SECRET, "PT15M");
const tok = (id: string, email: string, roles: string[]) =>
  jwt.issueAccessToken({ id, email, tokenVersion: 1, roles });

const LEARNER = tok("08800000-0000-4000-8000-000000000001", "t088-learner@verify.local", ["STUDENT"]);
const TEACHER = tok("08800000-0000-4000-8000-000000000002", "t088-teacher@verify.local", ["TEACHER"]);
const ADMIN = tok("08800000-0000-4000-8000-000000000003", "t088-admin@verify.local", ["ADMIN"]);

// wait for boot
let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } }
  catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }

// ── the request definitions of record (capture-driver.py) ──
const UUID25 = "00000000-0000-4000-8000-000000000025";
const UUID26 = "00000000-0000-4000-8000-000000000026";
const P088 = "/api/v1/teacher/content";
const P089 = "/api/v1/teacher/content/glm-ocr";
const P091 = "/api/v1/teacher/curriculum/exam-series";

const VALID_IMPORT = {
  board: "Edexcel", retrievedAt: "2026-10-07T00:00:00Z",
  series: [{ qualification: "IAL", seriesCode: "jan-2026", label: "January 2026",
             windowStart: "2026-01-06", windowEnd: "2026-01-24",
             published: true, sourceUrl: "https://example.invalid/capture" }],
};
const BAD_QUAL = {
  board: "Edexcel", retrievedAt: "2026-10-07T00:00:00Z",
  series: [{ qualification: "NOT_A_QUAL", seriesCode: "x", label: "x",
             windowStart: "2026-01-06", windowEnd: "2026-01-24",
             published: true, sourceUrl: "https://example.invalid/x" }],
};
const NULL_CANON = { qpCanonical: null, msCanonical: null, qpDraft: null, msDraft: null, reconciliation: null };

type Req = { path: string; method?: string; token?: string; rawbody?: string; body?: unknown };
const PLAN: Array<[string, string, Req]> = [ // [family, capture-file, request]
  // T-MIG-088 (9)
  ["088", "leg-01-enumerate-no-token-401.json", { path: P088 + "/enumerate" }],
  ["088", "leg-02-enumerate-learner-403.json", { path: P088 + "/enumerate", token: LEARNER }],
  ["088", "leg-03-enumerate-200.json", { path: P088 + "/enumerate?query=physics", token: TEACHER }],
  ["088", "leg-04-enumerate-structured-200.json", { path: P088 + "/enumerate/structured?nodeCode=cap-node&axis=topic", token: TEACHER }],
  ["088", "leg-05-fetch-empty-200.json", { path: P088 + "/fetch?query=physics", token: TEACHER }],
  ["088", "leg-06-fetch-unknown-query-200or400.json", { path: P088 + "/fetch?query=zzz-no-such-paper", token: TEACHER }],
  ["088", "leg-07-topics-rnd-q-200or404.json", { path: `${P088}/questions/${UUID25}/topics`, token: TEACHER }],
  ["088", "leg-08-topics-post-rnd-q-404.json", { path: `${P088}/questions/${UUID25}/topics`, method: "POST", token: TEACHER, body: { primaryNodeId: ROOT, secondaryNodeIds: [] } }],
  ["088", "leg-09-topics-post-bad-body-400.json", { path: `${P088}/questions/${UUID25}/topics`, method: "POST", token: TEACHER, body: { unexpected: true } }],
  // T-MIG-089 (6)
  ["089", "leg-01-pairs-no-token-401.json", { path: P089 + "/pairs", method: "POST" }],
  ["089", "leg-02-pairs-learner-403.json", { path: P089 + "/pairs", method: "POST", token: LEARNER, rawbody: "{}" }],
  ["089", "leg-03-pairs-empty-body-400.json", { path: P089 + "/pairs", method: "POST", token: TEACHER, rawbody: "{}" }],
  ["089", "leg-04-pairs-null-canonical-400.json", { path: P089 + "/pairs", method: "POST", token: TEACHER, body: NULL_CANON }],
  ["089", "leg-05-findings-rnd-paper-200or404.json", { path: `${P089}/papers/${UUID26}/findings`, token: TEACHER }],
  ["089", "leg-06-findings-admin-200.json", { path: `${P089}/papers/${UUID26}/findings`, token: ADMIN }],
  // T-MIG-091 (7)
  ["091", "leg-01-import-no-token-401.json", { path: P091, method: "POST" }],
  ["091", "leg-02-import-learner-403.json", { path: P091, method: "POST", token: LEARNER, rawbody: "{}" }],
  ["091", "leg-03-import-empty-400.json", { path: P091, method: "POST", token: TEACHER, rawbody: "{}" }],
  ["091", "leg-04-import-bad-qual-400.json", { path: P091, method: "POST", token: TEACHER, body: BAD_QUAL }],
  ["091", "leg-05-import-valid-200.json", { path: P091, method: "POST", token: TEACHER, body: VALID_IMPORT }],
  ["091", "leg-06-import-valid-repeat-200or409.json", { path: P091, method: "POST", token: TEACHER, body: VALID_IMPORT }],
  ["091", "leg-07-import-admin-200.json", { path: P091, method: "POST", token: ADMIN, body: VALID_IMPORT }],
];

// order-insensitive canonical JSON (GOLDEN_MASTER diff semantics)
function replacer(this: any, _k: string, v: any) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return v;
}
const canon = (v: unknown) => JSON.stringify(v, replacer);
const norm = (b: any) => {
  if (b && typeof b === "object" && !Array.isArray(b) && "timestamp" in b) {
    const { timestamp, ...rest } = b;
    return rest;
  }
  return b;
};

const RESULTS: any[] = [];
async function runLeg(family: string, file: string, req: Req) {
  const leg = JSON.parse(readFileSync(`${CAP}/t-mig-${family}/${file}`, "utf8"));
  const headers: Record<string, string> = { accept: "application/json" };
  if (req.token) headers.authorization = `Bearer ${req.token}`;
  let body: string | undefined;
  if (req.rawbody !== undefined) {
    headers["content-type"] = "application/json";
    body = req.rawbody;
  } else if (req.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(req.body);
  }
  const res = await fetch(BASE + req.path, { method: req.method ?? "GET", headers, body });
  const rawText = await res.text();
  let actual: any;
  try { actual = JSON.parse(rawText); } catch { actual = { __unparsed: rawText.slice(0, 200) }; }
  const statusMatch = res.status === leg.status;
  const bodyMatch = canon(norm(leg.body)) === canon(norm(actual));
  const hDiffs: string[] = [];
  for (const [k, v] of Object.entries(leg.response_headers ?? {})) {
    const a = res.headers.get(k);
    if (a !== v) hDiffs.push(`${k}: capture=${v} actual=${a ?? "<absent>"}`);
  }
  RESULTS.push({
    family, leg: file, path: req.path,
    expected_status: leg.status, actual_status: res.status,
    status_match: statusMatch, body_match: bodyMatch, header_diffs: hDiffs,
    actual_body: actual, expected_body: leg.body,
  });
  console.log(
    `[${family}] ${file}: status ${res.status}/${leg.status} ${statusMatch ? "OK" : "MISMATCH"} | body ${bodyMatch ? "DEEP-EQUAL" : "DIFF"}` +
      (hDiffs.length ? ` | header-diffs: ${hDiffs.join("; ")}` : " | headers clean"),
  );
  if (!bodyMatch) {
    console.log(`   expected: ${JSON.stringify(norm(leg.body)).slice(0, 300)}`);
    console.log(`   actual  : ${JSON.stringify(norm(actual)).slice(0, 300)}`);
  }
}

console.log("── replay (22 legs, capture order) ──");
for (const [family, file, req] of PLAN) await runLeg(family, file, req);

const pass = RESULTS.filter((r) => r.status_match && r.body_match).length;
console.log(`GOLDEN-VERIFY: ${pass}/${RESULTS.length} ${pass === RESULTS.length ? "PASS" : "FAIL"}`);
await Bun.write("/home/z/build/t088-091-verify-results.json", JSON.stringify({ results: RESULTS, verdict: pass === RESULTS.length ? "PASS" : "FAIL" }, null, 1));
process.exit(pass === RESULTS.length ? 0 : 1);
