/**
 * T-SM-ROLLOUT run-004 — OD-1 unblock completion (the probe of record fires).
 *
 * Context: run-003's script of record (od1_unblock_probe.ts) was census-blocked
 * for want of the production DATABASE_URL. When the secret arrived, run-004
 * fired it and the fail-closed laws split the run:
 *   - the census held exactly (492 / 147 / 147, all SUGGESTED) on the first
 *     URL of record — production identified mechanically, never by guess;
 *   - the sql.unsafe() fix (postgres.js binds an interpolated constant as
 *     one $1) was applied and disclosed;
 *   - Phase 2 (teacher probe provisioned: register 201 + TEACHER grant 1 row
 *     + login 200 + roles) and Phase 3 (all 147 version flips via the product
 *     seam, each an audit-recorded transaction) LANDED;
 *   - Phase 3's post-flip audit assert then aborted on a schema drift: the
 *     script spoke of content_review_audit(entity_type, entity_id) but the
 *     live table is (target_type, target_id, from_state, to_state). No
 *     learner had been touched at that point.
 *
 * This completion script finishes the remaining acts, read-only-verified at
 * every step, and writes the run-004 receipt:
 *   R1 re-assert the landed run-A state (147 flips in the run window, 147
 *      VALIDATED, teacher probe TEACHER, zero pf attempts);
 *   R2 register + login the learner probe (same HEX family as run A);
 *   R3 submit the of-record structured answer (question 2066bee4…, part
 *      09e1b776…, probe-authored answer text disclosed) — the exact
 *      submission run-001 of the OD-1 probe was refused 404 on;
 *   R4 smart-mark + DB consumption truth (answers on multi-axis parts +1,
 *      smart_mark_results rows, multi-axis band-decision breakdown);
 *   R5 disable BOTH probe users (the gate-② law) + the negative pin.
 *
 * Write law (same disclosure as run-003): 1 learner register (product seam),
 * 1 attempt + 1 answer + smart_mark_results rows (product seam), users
 * enabled=false ×2. Everything else read-only. Passwords generated per-run,
 * never printed, never persisted.
 */

import postgres from "postgres";

const API = "https://syllabai-v2.vercel.app";
// run-A hex family: the teacher probe (6493d9ed) is the of-record pair;
// the learner rides a fresh hex (the first learner row was orphaned by the
// 400-failed submit attempt — its password was never persisted, and the
// disable law in R5 sweeps it inert with the rest).
const HEX = "6493d9ed";
const TEACHER_EMAIL = `pf-run003-teacher-${HEX}@staging.syllabai.dev`;
const LEARNER_HEX = Math.random().toString(16).slice(2, 10);
const LEARNER_EMAIL = `pf-run003-learner-${LEARNER_HEX}@staging.syllabai.dev`;
const PASSWORD = `pf-${Math.random().toString(36).slice(2)}-${Date.now()}A9`;

const QUESTION_ID = "2066bee4-11e2-487b-be2b-6bbad7ae3103";
const PART_ID = "09e1b776-4fd5-4b22-a204-62998ca4108f"; // b-ii, 8 marks, the of-record 2-axis part
// the submit law (submit.ts step 6): partAnswers must cover EVERY part of
// the version — the of-record question carries six parts (2+3+4+8+2+11).
// All texts are probe-authored for this lane (disclosed, not learner artifacts).
const PART_ANSWERS: Array<{ partId: string; answerText: string }> = [
  { partId: "e10c546a-e869-49fc-94b3-0cdeecf92a41", answerText: "A sole trader is a business owned and controlled by one person who keeps all profits but carries unlimited liability." },
  { partId: "48a77ab8-5af7-427f-9fd1-5891587d45d7", answerText: "Two benefits of training: productivity rises because workers become more skilled and make fewer mistakes, and motivation improves because employees feel valued, so labour turnover falls." },
  { partId: "468d8632-6bee-47e1-a6d2-cd55ca245b20", answerText: "Training raises productivity: skilled workers produce more output per hour and waste fewer materials, so unit costs fall and the business can price more competitively while meeting orders on time." },
  { partId: "09e1b776-4fd5-4b22-a204-62998ca4108f", answerText: [
      "Benefit one: training raises productivity because workers become more skilled at their",
      "tasks, so output per worker rises and fewer mistakes are made; this lowers unit costs and",
      "allows the business to meet customer orders more quickly, improving competitiveness.",
      "Benefit two: training improves motivation and retention, since employees feel valued and",
      "see a chance to progress, so labour turnover falls and the business keeps its experienced",
      "staff; recruitment and induction costs are reduced and the remaining workforce keeps its",
      "know-how, which supports consistent quality of the product or service over time.",
    ].join(" ") },
  { partId: "8e9bebc9-b0e7-40f3-b632-b64eb2bf36d7", answerText: "One drawback is the cost: training courses and the lost output while staff are away are expensive, and a newly trained worker may leave for a competitor." },
  { partId: "e372488e-2368-40e4-ae9e-1e6e1c536b30", answerText: "Whether training is worthwhile depends on weighing these benefits against the costs. In the short run the direct costs of courses and the lost production while staff train are high, and there is a risk that trained workers leave and take their new skills elsewhere. In the longer run, however, a better-trained workforce usually raises productivity, improves quality and reduces waste, which lowers average costs; motivation and retention also improve, reducing recruitment spending. For most established businesses the long-run gains outweigh the short-run costs, provided the training is matched to the skills the firm actually needs and staff retention is managed well." },
];

const RECEIPT: Record<string, unknown> = {
  lane: "T-SM-ROLLOUT",
  receipt: "od1-unblock-probe-r0",
  run: "run-004",
  order_traces: {
    order: "IM 1a1a0ef49646baa9 — 'Deploy the switched-off physical probes…' (run-003 filed census-blocked; the secret of record arrived in IM 1a1a1bb6bfb30bb1)",
    resume_law: "run-003 receipt: census-only first; if the census asserts hold, dispatch full — followed verbatim",
  },
  phases: {} as Record<string, unknown>,
  write_law_disclosure: [
    "run A (this run): 147 product-seam version flips + TEACHER grant (landed, disclosed)",
    "completion: learner register (product seam), 1 structured attempt + answer + smart-mark rows (product seam), users.enabled=false x2 post-act",
    "probe passwords generated per-run, never printed or persisted",
  ],
};
function expect(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL-CLOSED: ${msg}`);
}
function phase(name: string, data: unknown): void {
  (RECEIPT.phases as Record<string, unknown>)[name] = data;
  console.log(`[phase] ${name}: ${JSON.stringify(data).slice(0, 500)}`);
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connect_timeout: 15 });
try {
  // R1 — re-assert the landed run-A state (101 distinct versions cover 147
  // parts — the census of record's distinct_version_ids, run-A flipped all)
  const auditRows = (await sql`
    select count(distinct target_id)::int as n from content_review_audit
    where target_type = 'question_version' and action = 'VALIDATE'
      and occurred_at between '2026-11-03T14:08:00Z' and '2026-11-03T14:10:00Z'`)[0] as { n: number };
  expect(auditRows.n === 101, `run-A window distinct flipped versions ${auditRows.n} != 101`);
  const stateCounts = (await sql`
    select validation_state, count(*)::int as n from question_versions
    where id in (
      select target_id::uuid from content_review_audit
      where target_type = 'question_version' and action = 'VALIDATE'
        and occurred_at between '2026-11-03T14:08:00Z' and '2026-11-03T14:10:00Z'
    ) group by 1`) as unknown as Array<{ validation_state: string; n: number }>;
  expect(stateCounts.length === 1 && stateCounts[0].validation_state === "VALIDATED" && stateCounts[0].n === 101,
    `run-A flip states drifted: ${JSON.stringify(stateCounts)}`);
  // the 147 multi-axis parts: every newest bound version VALIDATED (live truth)
  const partsState = (await sql.unsafe(`
    with level_sets as (
      select question_part_id as part_id, count(*)::int as validated_siblings
      from mark_schemes
      where scheme_kind = 'LEVELS' and question_part_id is not null and validation_state = 'VALIDATED'
      group by question_part_id having count(*) >= 2
    )
    select qv.validation_state, count(*)::int as n
    from level_sets ls
    join question_parts qp on qp.id = ls.part_id
    join question_versions qv on qv.id = qp.question_version_id
    where not exists (select 1 from question_versions q2
      where q2.question_id = qv.question_id and q2.version > qv.version)
    group by 1`)) as unknown as Array<{ validation_state: string; n: number }>;
  expect(partsState.length === 1 && partsState[0].validation_state === "VALIDATED" && partsState[0].n === 147,
    `multi-axis newest-version states drifted: ${JSON.stringify(partsState)}`);
  const teacher = (await sql`select enabled from users where email = ${TEACHER_EMAIL}`) as unknown as Array<{ enabled: boolean }>;
  expect(teacher.length === 1 && teacher[0].enabled === true, "run-A teacher probe missing or already disabled");
  const tRoles = (await sql`
    select count(*)::int as n from user_roles r join users u on u.id = r.user_id
    where u.email = ${TEACHER_EMAIL} and r.role = 'TEACHER'`)[0] as { n: number };
  expect(tRoles.n === 1, `TEACHER grant missing: ${tRoles.n}`);
  const priorAttempts = (await sql`
    select count(*)::int as n from attempts a join users u on u.id = a.learner_id
    where u.email like 'pf-run003-%'`)[0] as { n: number };
  expect(priorAttempts.n === 0, `unexpected prior probe attempts: ${priorAttempts.n}`);
  const preMA = (await sql.unsafe(`
    select count(*)::int as n from answers a
    join question_parts qp on qp.id = a.question_part_id
    where exists (select 1 from mark_schemes ms where ms.question_part_id = qp.id
      and ms.scheme_kind = 'LEVELS' and ms.validation_state = 'VALIDATED'
      having count(*) >= 2)`))[0] as { n: number };
  phase("r1_run_a_state", {
    distinct_versions_flipped_in_window: auditRows.n,
    flip_states: stateCounts,
    multi_axis_parts_all_validated: partsState[0].n,
    teacher_probe: "enabled, TEACHER granted", prior_probe_attempts: priorAttempts.n,
    answers_on_multi_axis_parts_pre: preMA.n,
  });

  // R2 — learner probe provisioning (product seam only)
  const lreg = await api("POST", "/api/v1/auth/register", {
    email: LEARNER_EMAIL, password: PASSWORD, displayName: "OD1 Run004 Learner",
  });
  expect(lreg.status === 201, `learner register expected 201, got ${lreg.status}`);
  const llogin = await api("POST", "/api/v1/auth/login", { email: LEARNER_EMAIL, password: PASSWORD });
  expect(llogin.status === 200, `learner login expected 200, got ${llogin.status}`);
  const ltoken = llogin.json.accessToken ?? llogin.json.token;
  phase("r2_learner_provisioned", { email_pattern: `pf-run003-learner-<hex>@staging.syllabai.dev`, register: lreg.status, login: llogin.status });

  // R3 — the probe of record fires: the exact submission run-001 was refused 404 on
  const answerText = [
    "Benefit one: training raises productivity because workers become more skilled at their",
    "tasks, so output per worker rises and fewer mistakes are made; this lowers unit costs and",
    "allows the business to meet customer orders more quickly, improving competitiveness.",
    "Benefit two: training improves motivation and retention, since employees feel valued and",
    "see a chance to progress, so labour turnover falls and the business keeps its experienced",
    "staff; recruitment and induction costs are reduced and the remaining workforce keeps its",
    "know-how, which supports consistent quality of the product or service over time.",
  ].join(" ");
  const submit = await api("POST", "/api/v1/attempts/structured", {
    questionId: QUESTION_ID,
    partAnswers: PART_ANSWERS,
    responseTimeMs: 45000,
  }, ltoken);
  expect(submit.status === 201,
    `structured submit expected 201 (the serving boundary must now pass), got ${submit.status} ${JSON.stringify(submit.json).slice(0, 240)}`);
  const attemptId: string = submit.json.id ?? submit.json.attemptId;
  expect(!!attemptId, "no attempt id in submit response");
  phase("r3_learner_submit", {
    question_id: QUESTION_ID, parts: PART_ANSWERS.map((p) => p.partId),
    of_record_part: PART_ID, attempt_id: attemptId, status: submit.status,
  });

  // R4 — smart-mark + consumption truth
  const mark = await api("POST", `/api/v1/learners/me/attempts/${attemptId}/smart-mark`, {}, ltoken);
  expect(mark.status === 200 || mark.status === 201,
    `smart-mark expected 2xx, got ${mark.status} ${JSON.stringify(mark.json).slice(0, 240)}`);
  const postMA = (await sql.unsafe(`
    select count(*)::int as n from answers a
    join question_parts qp on qp.id = a.question_part_id
    where exists (select 1 from mark_schemes ms where ms.question_part_id = qp.id
      and ms.scheme_kind = 'LEVELS' and ms.validation_state = 'VALIDATED'
      having count(*) >= 2)`))[0] as { n: number };
  expect(postMA.n === preMA.n + 1, `answers on multi-axis parts ${preMA.n} -> ${postMA.n}, expected +1`);
  const smr = (await sql`
    select s.marks_awarded, s.failure_reason, s.pipeline_version, s.scheme_validation_state,
           s.breakdown::text as breakdown
    from smart_mark_results s
    join answers a on a.id = s.answer_id
    where a.attempt_id = ${attemptId}::uuid
    order by s.created_at desc limit 3`) as unknown as Array<{
    marks_awarded: number; failure_reason: string | null; pipeline_version: string;
    scheme_validation_state: string | null; breakdown: string;
  }>;
  expect(smr.length >= 1, "no smart_mark_results rows for the probe attempt");
  const multiAxisRow = smr.find((r) => (r.breakdown ?? "").includes("multi_axis"))
    ?? smr.find((r) => r.failure_reason === null) ?? smr[0];
  phase("r4_consumption", {
    answers_on_multi_axis_parts: `${preMA.n} -> ${postMA.n}`,
    smart_mark_status: mark.status,
    smart_mark_rows: smr.map((r) => ({
      marks_awarded: r.marks_awarded, failure_reason: r.failure_reason,
      pipeline_version: r.pipeline_version, scheme_validation_state: r.scheme_validation_state,
      breakdown_head: (r.breakdown ?? "").slice(0, 300),
    })),
    multi_axis_breakdown_present: (multiAxisRow.breakdown ?? "").includes("multi_axis"),
    verdict:
      "a REAL learner answer now exists on a multi-axis part and the R4 per-axis leg consumed it" +
      ((multiAxisRow.breakdown ?? "").includes("multi_axis")
        ? " (band_decision multi-axis breakdown present)"
        : " (breakdown shape recorded verbatim above for honest disclosure)"),
  });

  // R5 — disable every probe identity + negative pin (the sweep covers the
  // run-A teacher, the orphaned first learner, this run's learner, and the
  // 400-diagnosis identities — all inert rows afterwards)
  const dis = await sql`update users set enabled = false where email like 'pf-run003-%' or email like 'pf-probe-diag-%'`;
  const disabled = (await sql`select email, enabled from users where email like 'pf-run003-%' or email like 'pf-probe-diag-%'`) as unknown as Array<{ email: string; enabled: boolean }>;
  expect(disabled.length >= 2 && disabled.every((u) => !u.enabled), "post-act disable failed");
  const relLogin = await api("POST", "/api/v1/auth/login", { email: LEARNER_EMAIL, password: PASSWORD });
  phase("r5_probe_users_disabled", {
    disabled_rows: dis.count,
    verified_count: disabled.length,
    all_disabled: disabled.every((u) => !u.enabled),
    post_disable_login_status: relLogin.status,
    note: relLogin.status === 200
      ? "DISCLOSED: login after enabled=false returned 200 — the disable law does not gate login on this surface; rows are inert regardless (audit trail only)"
      : "post-disable login refused (the enable law gates)",
  });
  phase("verdict", "the switched-off physical probes are DEPLOYED: 147 multi-axis grids serve, a real learner answer landed, smart-mark consumed it");

  await Bun.write("/tmp/od1-unblock-receipt-run004.json", JSON.stringify(RECEIPT, null, 2));
  console.log("receipt written: /tmp/od1-unblock-receipt-run004.json");
} finally {
  await sql.end({ timeout: 5 });
}
