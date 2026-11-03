/**
 * T-MIG-099 real-wire proof leg — the smart-mark run (evidence-only harness).
 *
 * Serves apps/api/src/index.ts (the #144 merge tree of record) with the
 * T-MIG-022 harness envelope + ZERO-KEY law (no LLM credentials in env —
 * asserted, exit 4), then fires exactly ONE learner smart-mark:
 *
 *   POST /api/v1/learners/me/attempts/{attemptId}/smart-mark
 *
 * through the REAL pipeline against the REAL scratch Postgres — the request
 * crosses the (ex-ghost) point-rows query BEFORE the LLM seam, so the
 * observed response class arbitrates the band:
 *   pre-fix  → SQL-class 500 (relation "mark_scheme_points" does not exist)
 *   post-fix → 200 with the LLM-seam's own ZERO-KEY refusal law
 *              (PROVIDER_UNAVAILABLE) + the mark_points rows law visible in
 *              each part's marksPossible.
 *
 * Post-flight DB asserts close the loop (results rows, nothing marked).
 */
import app from "/home/z/my-project/work/wt-099/apps/api/src/index.ts";
import { JwtService } from "/home/z/my-project/work/wt-099/apps/api/src/services/identity/jwt";
import postgres from "postgres";

// ── ZERO-KEY boot law (t084 harness verbatim class) ──
const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) {
  console.error("harness: ZERO-KEY law violated — LLM credentials present in env:", FORBIDDEN);
  process.exit(4);
}
console.log("harness: ZERO-KEY boot law asserted (no LLM credentials in env)");
if (!process.env.SCRATCH_URL?.includes("127.0.0.1:5433")) {
  console.error("harness: SCRATCH_URL must be the local scratch — refusing");
  process.exit(2);
}

const PORT = Number(process.env.PORT ?? 8901);
const BASE = "http://127.0.0.1:" + PORT;
const ID = (n: number) => `09900000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEARNER = ID(1);
const ATTEMPT = ID(30);
const SCHEME = ID(50);
const PART_A = ID(20);
const PART_B = ID(21);
const ANS_A = ID(40);
const ANS_B = ID(41);

Bun.serve({ port: PORT, idleTimeout: 60, fetch: app.fetch });
console.log(`harness: serving api on :${PORT}`);

// ── harness-minted token (boot secret; HS256 44+ byte law) ──
const SECRET = process.env.SYLLABAI_JWT_SECRET!;
if (SECRET.length < 44) {
  console.error("harness: SYLLABAI_JWT_SECRET below the 44+ byte law");
  process.exit(2);
}
const jwt = new JwtService(SECRET, "PT15M");
const TOKEN = jwt.issueAccessToken({
  id: LEARNER,
  email: "t099-learner@verify.local",
  tokenVersion: 1,
  roles: ["STUDENT"],
});

let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } }
  catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }
console.log("harness: api up (actuator/health green)");

// ── THE leg: one real learner smart-mark, body-less per the frozen law ──
const res = await fetch(`${BASE}/api/v1/learners/me/attempts/${ATTEMPT}/smart-mark`, {
  method: "POST",
  headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` },
});
const body = await res.json().catch(() => null);
console.log(`harness: smart-mark -> HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));

// ── post-flight DB asserts (scratch only) ──
const sql = postgres(process.env.SCRATCH_URL!, { max: 1, connect_timeout: 30 });
// latest result row per answer (re-run safe: prior legs' rows accumulate)
const results = (await sql`
  select distinct on (answer_id) answer_id, pipeline_version, model_id, marks_awarded,
         validation_passed, failure_reason, mark_scheme_id, scheme_validation_state
  from smart_mark_results where answer_id in (${ANS_A}, ${ANS_B})
  order by answer_id, created_at desc`) as any[];
const states = await sql`
  select
    (select marking_state from attempts where id = ${ATTEMPT}) as attempt_state,
    (select marks_awarded from attempts where id = ${ATTEMPT}) as attempt_marks,
    (select string_agg(id::text || '=' || marking_state, ', ') from answers where attempt_id = ${ATTEMPT}) as answer_states,
    (select count(*) from smart_mark_results where mark_scheme_id = ${SCHEME}) as result_rows`;
await sql.end({ timeout: 5 });

console.log("harness: results-rows:", JSON.stringify(results, null, 2));
console.log("harness: post-flight states:", JSON.stringify(states[0]!));

const a = body?.parts?.find((p: any) => p.partId === PART_A);
const b = body?.parts?.find((p: any) => p.partId === PART_B);
const asserts = {
  http_200: res.status === 200,
  scheme_validated: body?.schemeValidationState === "VALIDATED",
  attempt_marks_possible_5: body?.marksPossible === 5,
  part_a_marks_possible_3: a?.marksPossible === 3,
  part_a_refusal_provider_unavailable: a?.failureReason === "PROVIDER_UNAVAILABLE",
  part_a_not_marked: a?.validationPassed === false && a?.marksAwarded === 0,
  part_b_marks_possible_0: b?.marksPossible === 0,
  part_b_refusal_no_scheme_points: b?.failureReason === "NO_SCHEME_POINTS",
  two_result_rows: results.length === 2,
  part_a_result_row: results.find((r) => r.answer_id === ANS_A)?.failure_reason === "PROVIDER_UNAVAILABLE",
  part_b_result_row: results.find((r) => r.answer_id === ANS_B)?.failure_reason === "NO_SCHEME_POINTS",
  results_stamped_with_scheme: results.every((r) => r.mark_scheme_id === SCHEME && r.scheme_validation_state === "VALIDATED"),
  nothing_marked: states[0]!.attempt_state === "PENDING" && states[0]!.attempt_marks === null
    && states[0]!.answer_states === `${ANS_A}=PENDING, ${ANS_B}=PENDING`,
  two_rows_per_part_states: Number(states[0]!.result_rows) >= 2,
};
console.log("harness: asserts:", JSON.stringify(asserts, null, 2));
const pass = Object.values(asserts).every(Boolean);
console.log(pass ? "PROOF-LEG RUN: ALL ASSERTS PASS" : "PROOF-LEG RUN: ASSERTS FAILED");
process.exit(pass ? 0 : 5);
