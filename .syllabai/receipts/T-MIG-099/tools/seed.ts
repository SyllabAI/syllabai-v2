/**
 * T-MIG-099 real-wire proof leg — seed ONE minimal VALIDATED-scheme wire on
 * the LOCAL scratch PG (127.0.0.1:5433, db syllabai_v2_verify; zero prod/Neon
 * contact). Idempotent upserts. The t083-seed user pattern + the wire the
 * SmartMarkService/StudentSmartMarkService pipeline reads:
 *
 *   learner (STUDENT) → question (STRUCTURED) → question_version v1
 *     → part A (marks 3) + part B (marks 2)
 *     → attempt (PENDING, provenance SELF, correct=false)
 *     → answers (A non-blank = markable; B non-blank but POINTLESS)
 *     → mark_schemes (validation_state VALIDATED)
 *     → mark_points: TWO rows on part A (ordering 0,1; marks 1+2=3), NONE on B
 *
 * Expected ZERO-KEY law once the fixed point-rows SQL serves:
 *   part A → markable → the LLM chain refuses → failure_reason
 *     PROVIDER_UNAVAILABLE, marksPossible = 3 (read back from mark_points);
 *   part B → zero in-scope points → deterministic NO_SCHEME_POINTS refusal,
 *     marksPossible = 0;
 *   nothing marked (answers/attempts stay PENDING), one smart_mark_results
 *   row per part stamped with the VALIDATED scheme id.
 */
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.SCRATCH_URL!, { max: 1, connect_timeout: 30 });

const ID = (n: number) => `09900000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEARNER = ID(1);
const QUESTION = ID(10);
const VERSION = ID(11);
const PART_A = ID(20);
const PART_B = ID(21);
const ATTEMPT = ID(30);
const ANS_A = ID(40);
const ANS_B = ID(41);
const SCHEME = ID(50);
const POINT_A1 = ID(60);
const POINT_A2 = ID(61);

await sql`
  insert into users (id, email, password_hash, display_name, enabled, token_version, created_at)
  values (${LEARNER}, ${"t099-learner@verify.local"}, ${"bcrypt-harness-no-login"}, ${"T099 STUDENT"}, true, 1, now())
  on conflict (id) do update set enabled = true, token_version = 1`;
// roles is the FK target of user_roles.role (of-record law on this baseline)
await sql`
  insert into roles (name, description) values (${"STUDENT"}, ${"T099 harness role"}) on conflict (name) do nothing`;
await sql`
  insert into user_roles (user_id, role) values (${LEARNER}, ${"STUDENT"}) on conflict do nothing`;

await sql`
  insert into questions (id, stem, marks, difficulty, expected_time_seconds, question_type, created_at)
  values (${QUESTION}, ${"T099 proof-leg stem (structured)"}, 5, 1, 60, ${"STRUCTURED"}, now())
  on conflict (id) do nothing`;
await sql`
  insert into question_versions (id, question_id, version, stem, marks, difficulty, expected_time_seconds, created_at)
  values (${VERSION}, ${QUESTION}, 1, ${"T099 proof-leg stem (structured)"}, 5, 1, 60, now())
  on conflict (id) do nothing`;

await sql`
  insert into question_parts (id, question_version_id, label, prompt, marks, ordering, created_at)
  values (${PART_A}, ${VERSION}, ${"a"}, ${"T099 part a prompt"}, 3, 0, now())
  on conflict (id) do nothing`;
await sql`
  insert into question_parts (id, question_version_id, label, prompt, marks, ordering, created_at)
  values (${PART_B}, ${VERSION}, ${"b"}, ${"T099 part b prompt"}, 2, 1, now())
  on conflict (id) do nothing`;

await sql`
  insert into attempts (id, learner_id, question_id, correct, response_time_ms, provenance, marking_state, evidence_emitted, created_at)
  values (${ATTEMPT}, ${LEARNER}, ${QUESTION}, false, 1000, ${"SELF"}, ${"PENDING"}, false, now())
  on conflict (id) do update set marking_state = ${"PENDING"}, evidence_emitted = false, marks_awarded = null`;
await sql`
  insert into answers (id, attempt_id, question_part_id, answer_text, marks_awarded, marking_state, created_at)
  values (${ANS_A}, ${ATTEMPT}, ${PART_A}, ${"The student wrote a substantive answer exercising the LLM seam."}, null, ${"PENDING"}, now())
  on conflict (id) do update set answer_text = excluded.answer_text, marking_state = ${"PENDING"}, marks_awarded = null`;
await sql`
  insert into answers (id, attempt_id, question_part_id, answer_text, marks_awarded, marking_state, created_at)
  values (${ANS_B}, ${ATTEMPT}, ${PART_B}, ${"Part b answer (no scheme points seeded on this part)."}, null, ${"PENDING"}, now())
  on conflict (id) do update set answer_text = excluded.answer_text, marking_state = ${"PENDING"}, marks_awarded = null`;

await sql`
  insert into mark_schemes (id, question_version_id, validation_state, created_at)
  values (${SCHEME}, ${VERSION}, ${"VALIDATED"}, now())
  on conflict (id) do update set validation_state = ${"VALIDATED"}`;

await sql`
  insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, created_at)
  values (${POINT_A1}, ${SCHEME}, ${PART_A}, ${"a(i)"}, 0, ${"states the first required point"}, 1, now())
  on conflict (id) do update set marks = 1, ordering = 0`;
await sql`
  insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, created_at)
  values (${POINT_A2}, ${SCHEME}, ${PART_A}, ${"a(ii)"}, 1, ${"explains the second required point"}, 2, now())
  on conflict (id) do update set marks = 2, ordering = 1`;

const census = await sql`
  select
    (select count(*) from mark_points where mark_scheme_id = ${SCHEME}) as points_total,
    (select count(*) from mark_points where question_part_id = ${PART_A}) as points_part_a,
    (select count(*) from mark_points where question_part_id = ${PART_B}) as points_part_b,
    (select validation_state from mark_schemes where id = ${SCHEME}) as scheme_state,
    (select marking_state from attempts where id = ${ATTEMPT}) as attempt_state`;
console.log("SEED:", JSON.stringify({
  learner: LEARNER, attempt: ATTEMPT, scheme: SCHEME,
  part_a: PART_A, part_b: PART_B,
  ...census[0]!,
}));
await sql.end({ timeout: 5 });
console.log("SEED DONE");
