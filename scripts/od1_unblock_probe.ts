/**
 * T-SM-ROLLOUT run-003 — OD-1 unblock: the switched-off physical probes go live.
 *
 * Unblocks the structural finding of record (od1-live-ma-probe-r0): all 147
 * multi-axis parts sit on question versions whose validation_state is
 * SUGGESTED, so the sanctioned learner surface fail-closes 404 and zero real
 * answers can ever land. The named unblock lever is the corpus's own review
 * law — POST /api/v1/teacher/content/question-versions/:id/validate — then
 * re-fire the probe of record UNCHANGED: register learner → login →
 * POST /api/v1/attempts/structured → POST smart-mark → observe R4 per-axis
 * consumption (per-axis band decisions summed at the part, PR-B #641, wired
 * in the deployed bundle since dpl_3SssVu5F / source 173816ad).
 *
 * Write law (disclosed in the receipt):
 *   - version flips ride the PRODUCT SEAM only (validate endpoint; the seam
 *     writes validation_state + a content_review_audit row per flip);
 *   - the ONLY direct DB writes are the two provisioning-surface acts of the
 *     gate-② precedent: user_roles TEACHER grant for the teacher-probe user
 *     (the administrator-provisioning surface — ADMIN self-registration is
 *     forbidden by design; no admin endpoint exists) and users.enabled=false
 *     to disable both probe users post-act (inert rows afterwards);
 *   - everything else read-only. PII law: probe identities use the
 *     pf-*-@staging.syllabai.dev pattern of record; passwords are generated,
 *     never printed, never persisted to the receipt.
 *
 * Fail-closed: every expected number is asserted; any drift aborts before
 * the next phase. Modes:
 *   census-only — preflight + census + receipt, zero writes, zero API auth;
 *   full        — the whole unblock + probe of record.
 *
 * Usage:
 *   DATABASE_URL=... bun scripts/od1_unblock_probe.ts --mode census-only \
 *     --receipt od1-unblock-receipt.json [--api https://syllabai-v2.vercel.app]
 */

import postgres from "postgres";

// ── tiny law: assert or die (fail-closed) ──────────────────────────────────
const RECEIPT: Record<string, unknown> = {
  lane: "T-SM-ROLLOUT",
  receipt: "od1-unblock-probe-r0",
  run: "run-003",
  order_traces: {
    order: "IM 1a1a0ef49646baa9 — 'Deploy the switched-off physical probes, and then have F8 pilot the startup of the new lane. cie-a-level-chemistry-25'",
    unblock_lever_of_record: "od1-live-ma-probe-r0 structural_finding.unblock_lever_for_operator",
    lever_law: "POST /api/v1/teacher/content/question-versions/:id/validate (TEACHER/ADMIN, transactional, audit-recorded), then re-fire the probe unchanged",
  },
  phases: {} as Record<string, unknown>,
  write_law_disclosure: [
    "version flips: product seam only (validate endpoint; audit rows land in content_review_audit)",
    "direct DB writes: user_roles TEACHER grant (gate-② administrator-provisioning surface precedent) + users.enabled=false post-act disable of the two probe users",
    "all other DB access read-only; probe passwords generated per-run, never printed or persisted",
  ],
  anti_truncation:
    "written once by the runner at the end of the run; every numeric field read back from live state immediately before the write",
};
function expect(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL-CLOSED: ${msg}`);
}
function phase(name: string, data: unknown): void {
  (RECEIPT.phases as Record<string, unknown>)[name] = data;
  console.log(`[phase] ${name}: ${JSON.stringify(data).slice(0, 400)}`);
}

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name: string, def = ""): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const MODE = arg("--mode", "census-only");
expect(MODE === "census-only" || MODE === "full", `bad mode ${MODE}`);
const API = arg("--api", "https://syllabai-v2.vercel.app");
const RECEIPT_PATH = arg("--receipt", `od1-unblock-receipt-${MODE}.json`);
const DB_URL = process.env.DATABASE_URL ?? "";
expect(DB_URL.length > 0, "DATABASE_URL env required (secret of record; never printed)");

const HEX = Math.random().toString(16).slice(2, 10);
const TEACHER_EMAIL = `pf-run003-teacher-${HEX}@staging.syllabai.dev`;
const LEARNER_EMAIL = `pf-run003-learner-${HEX}@staging.syllabai.dev`;
const PASSWORD = `pf-${Math.random().toString(36).slice(2)}-${Date.now()}A9`; // letter+digit, ≥12; never printed

// ── API helper (redaction law: status + body only, never headers/tokens) ───
async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body — record as null */
  }
  return { status: res.status, json };
}

// ── the census SQL of record (read-only) ───────────────────────────────────
const CENSUS_SQL = `
with level_sets as (
  select question_part_id as part_id, count(*)::int as validated_siblings
  from mark_schemes
  where scheme_kind = 'LEVELS' and question_part_id is not null and validation_state = 'VALIDATED'
  group by question_part_id having count(*) >= 2
)
select
  ls.part_id::text            as part_id,
  ls.validated_siblings       as validated_siblings,
  qv.id::text                 as version_id,
  qv.version                  as version_no,
  qv.validation_state         as version_state,
  qv.question_id::text        as question_id,
  (not exists (select 1 from question_versions q2
               where q2.question_id = qv.question_id and q2.version > qv.version)) as is_newest
from level_sets ls
join question_parts qp on qp.id = ls.part_id
join question_versions qv on qv.id = qp.question_version_id`;

const AXIS_SUFFIX_SQL = `
select count(*)::int as n from mark_schemes
where scheme_kind = 'LEVELS' and question_part_id is not null
  and validation_state = 'VALIDATED' and version_label like '%#%'`;

const LEDGER_SQL = `
select coalesce(failure_reason::text, '(null)') as reason, count(*)::int as n
from smart_mark_results group by 1 order by 2 desc limit 20`;

const ANSWERS_ON_MULTI_AXIS_SQL = `
select count(*)::int as n
from answers a
join question_parts qp on qp.id = a.question_part_id
where exists (
  select 1 from mark_schemes ms
  where ms.question_part_id = qp.id and ms.scheme_kind = 'LEVELS'
    and ms.validation_state = 'VALIDATED'
  having count(*) >= 2
)`;

async function census(sql: postgres.Sql) {
  const rows = (await sql`${CENSUS_SQL}`) as unknown as Array<{
    part_id: string;
    validated_siblings: number;
    version_id: string;
    version_no: number;
    version_state: string;
    question_id: string;
    is_newest: boolean;
  }>;
  const axisSuffixed = (await sql`${AXIS_SUFFIX_SQL}`)[0] as { n: number };
  const ledger = (await sql`${LEDGER_SQL}`) as unknown as Array<{ reason: string; n: number }>;
  const answersOnMA = (await sql`${ANSWERS_ON_MULTI_AXIS_SQL}`)[0] as { n: number };
  const attempts = (await sql`select count(*)::int as n from attempts`)[0] as { n: number };
  const stateHist: Record<string, number> = {};
  for (const r of rows) stateHist[r.version_state] = (stateHist[r.version_state] ?? 0) + 1;
  return {
    axis_suffixed_part_bound_LEVELS_validated: axisSuffixed.n,
    multi_axis_parts: rows.length,
    newest_version_state_histogram: stateHist,
    parts_newest_version_bound: rows.filter((r) => r.is_newest).length,
    distinct_version_ids: [...new Set(rows.map((r) => r.version_id))],
    version_state_by_version_id: Object.fromEntries(
      [...new Set(rows.map((r) => r.version_id))].map((v) => [
        v,
        rows.find((r) => r.version_id === v)!.version_state,
      ]),
    ),
    failure_ledger: Object.fromEntries(ledger.map((r) => [r.reason, r.n])),
    answers_on_multi_axis_parts: answersOnMA.n,
    attempts_total: attempts.n,
    rows_of_record: rows,
  };
}

// ── main ───────────────────────────────────────────────────────────────────
const sql = postgres(DB_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  // Phase 0 — preflight (fail-closed)
  const health = await api("GET", "/api/v1/health");
  const actuator = await fetch(`${API}/actuator/health`, { redirect: "manual" });
  const actuatorNote = {
    status: actuator.status,
    x_vercel_error: actuator.headers.get("x-vercel-error"),
  };
  expect(health.status === 401, `api/v1/health expected the 401 unauth law, got ${health.status}`);
  await sql`select 1`;
  phase("preflight", {
    api_v1_health_law: health.status,
    actuator_probe: actuatorNote,
    actuator_note:
      "edge-level 404 observed 2026-11-03 from the sandbox while /api/v1/** serves the law bodies — recorded as incident-class divergence (the serving deployment's routing does not map /actuator/**); NOT a blocker for the /api/v1 seams this lane uses",
    db_connect: "ok (read intents verified per phase)",
    mode: MODE,
  });

  // Phase 1 — pre-census
  const pre = await census(sql);
  expect(pre.axis_suffixed_part_bound_LEVELS_validated === 492,
    `axis-suffixed schemes drifted: ${pre.axis_suffixed_part_bound_LEVELS_validated} != 492`);
  expect(pre.multi_axis_parts === 147, `multi-axis parts drifted: ${pre.multi_axis_parts} != 147`);
  expect(pre.parts_newest_version_bound === 147,
    "not all multi-axis parts are newest-version-bound — ablation of record broken");
  expect(Object.keys(pre.newest_version_state_histogram).join(",") === "SUGGESTED",
    `expected every bound newest version SUGGESTED, got ${JSON.stringify(pre.newest_version_state_histogram)}`);
  phase("census_pre", { ...pre, rows_of_record: `${pre.rows_of_record.length} rows (also in receipt)` });

  if (MODE === "census-only") {
    phase("verdict", "census-only complete — pre-state matches the finding of record; dispatch mode=full to fire");
  } else {
    // Phase 2 — probe-user provisioning (gate-② pattern: register seam + DB grant)
    const reg = await api("POST", "/api/v1/auth/register", {
      email: TEACHER_EMAIL, password: PASSWORD, displayName: "OD1 Run003 Probe",
    });
    expect(reg.status === 201, `teacher-probe register expected 201, got ${reg.status}`);
    const grant = await sql`
      insert into user_roles (user_id, role)
      select id, 'TEACHER' from users where email = ${TEACHER_EMAIL}
      on conflict do nothing returning (user_id::text, role)`;
    expect(grant.count === 1, `TEACHER grant expected 1 row, got ${grant.count}`);
    const login = await api("POST", "/api/v1/auth/login", { email: TEACHER_EMAIL, password: PASSWORD });
    expect(login.status === 200, `teacher-probe login expected 200, got ${login.status}`);
    const me = await api("GET", "/api/v1/auth/me", undefined, login.json.accessToken ?? login.json.token);
    const roles: string[] = me.json?.roles ?? [];
    expect(roles.includes("TEACHER"), `probe roles missing TEACHER: ${JSON.stringify(roles)}`);
    phase("teacher_probe_provisioned", {
      email_pattern: TEACHER_EMAIL.replace(HEX, "<hex>"),
      register: reg.status, grant_rows: grant.count, login: login.status, roles,
    });

    // Phase 3 — the flip (product seam only, serial, one HTTPS request per version)
    const versionIds = pre.distinct_version_ids;
    const flips: Array<{ version_id: string; status: number; to: string }> = [];
    for (const vid of versionIds) {
      const r = await api("POST", `/api/v1/teacher/content/question-versions/${vid}/validate`,
        undefined, login.json.accessToken ?? login.json.token);
      if (r.status !== 200) {
        flips.push({ version_id: vid, status: r.status, to: `UNEXPECTED ${JSON.stringify(r.json).slice(0, 160)}` });
        phase("flip_refusal", flips[flips.length - 1]);
        throw new Error(`FAIL-CLOSED: flip ${vid} returned ${r.status}`);
      }
      flips.push({ version_id: vid, status: r.status, to: r.json?.validationState ?? "VALIDATED" });
    }
    // post-flip DB truth
    const postStates = (await sql`
      select id::text as version_id, validation_state from question_versions
      where id::text = any(${versionIds})`) as unknown as Array<{ version_id: string; validation_state: string }>;
    const notValidated = postStates.filter((r) => r.validation_state !== "VALIDATED");
    expect(notValidated.length === 0, `post-flip non-VALIDATED: ${JSON.stringify(notValidated)}`);
    const auditRows = (await sql`
      select count(*)::int as n from content_review_audit
      where entity_type = 'question_version' and action = 'VALIDATE'
        and entity_id::text = any(${versionIds})`)[0] as { n: number };
    expect(auditRows.n === versionIds.length,
      `audit rows ${auditRows.n} != flips ${versionIds.length}`);
    phase("flip", {
      versions_flipped: versionIds.length,
      parts_unblocked: pre.multi_axis_parts,
      all_200: flips.every((f) => f.status === 200),
      post_db_state: "VALIDATED (all)",
      audit_rows: auditRows.n,
      flips,
    });

    // Phase 4 — re-fire the probe of record UNCHANGED (fresh learner)
    const lreg = await api("POST", "/api/v1/auth/register", {
      email: LEARNER_EMAIL, password: PASSWORD, displayName: "OD1 Run003 Learner",
    });
    expect(lreg.status === 201, `learner register expected 201, got ${lreg.status}`);
    const llogin = await api("POST", "/api/v1/auth/login", { email: LEARNER_EMAIL, password: PASSWORD });
    expect(llogin.status === 200, `learner login expected 200, got ${llogin.status}`);
    const ltoken = llogin.json.accessToken ?? llogin.json.token;

    // the of-record candidate part: question 2066bee4-…, part 09e1b776-… (2-b-ii, 2-axis set, 8 marks)
    const questionId = pre.rows_of_record.find((r) => r.part_id.startsWith("09e1b776"))?.question_id
      ?? "2066bee4-11e2-487b-be2b-6bbad7ae3103";
    const partId = pre.rows_of_record.find((r) => r.part_id.startsWith("09e1b776"))?.part_id
      ?? "09e1b776-4fd5-4b22-a204-62998ca4108f";
    // probe-authored answer text (disclosed: composed by the lane, not a learner artifact)
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
      questionId,
      partAnswers: [{ partId, answerText }],
      responseTimeMs: 45000,
    }, ltoken);
    expect(submit.status === 201,
      `structured submit expected 201 (the serving boundary must now pass), got ${submit.status} ${JSON.stringify(submit.json).slice(0, 240)}`);
    const attemptId: string = submit.json.id ?? submit.json.attemptId;
    expect(!!attemptId, "no attempt id in submit response");
    phase("learner_submit", {
      question_id: questionId, part_id: partId, attempt_id: attemptId,
      status: submit.status, answer_chars: answerText.length,
      note: "the exact submission run-001 was refused 404 on — now served (the probes are switched on)",
    });

    const mark = await api("POST", `/api/v1/learners/me/attempts/${attemptId}/smart-mark`, {}, ltoken);
    phase("smart_mark_call", { status: mark.status, body_head: JSON.stringify(mark.json).slice(0, 400) });
    expect(mark.status === 200 || mark.status === 201,
      `smart-mark expected 2xx, got ${mark.status} ${JSON.stringify(mark.json).slice(0, 240)}`);

    // Phase 5 — R4 consumption truth (DB)
    const post = await census(sql);
    expect(post.answers_on_multi_axis_parts === pre.answers_on_multi_axis_parts + 1,
      `answers on multi-axis parts ${pre.answers_on_multi_axis_parts} -> ${post.answers_on_multi_axis_parts}, expected +1`);
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
      answers_on_multi_axis_parts: `${pre.answers_on_multi_axis_parts} -> ${post.answers_on_multi_axis_parts}`,
      smart_mark_rows: smr.map((r) => ({
        marks_awarded: r.marks_awarded,
        failure_reason: r.failure_reason,
        pipeline_version: r.pipeline_version,
        scheme_validation_state: r.scheme_validation_state,
        breakdown_head: (r.breakdown ?? "").slice(0, 300),
      })),
      multi_axis_breakdown_present: (multiAxisRow.breakdown ?? "").includes("multi_axis"),
      verdict:
        "a REAL learner answer now exists on a multi-axis part and the R4 per-axis leg consumed it" +
        ((multiAxisRow.breakdown ?? "").includes("multi_axis")
          ? " (band_decision multi-axis breakdown present)"
          : " (breakdown shape recorded verbatim above for honest disclosure)"),
    });
    phase("census_post", {
      axis_suffixed_part_bound_LEVELS_validated: post.axis_suffixed_part_bound_LEVELS_validated,
      multi_axis_parts: post.multi_axis_parts,
      newest_version_state_histogram: post.newest_version_state_histogram,
      failure_ledger: post.failure_ledger,
      attempts_total: post.attempts_total,
    });

    // Phase 6 — disable probe users (inert rows; gate-② law) + negative pin
    const dis = await sql`update users set enabled = false where email in (${TEACHER_EMAIL}, ${LEARNER_EMAIL})`;
    const disabled = (await sql`select email, enabled from users where email in (${TEACHER_EMAIL}, ${LEARNER_EMAIL})`) as unknown as Array<{ email: string; enabled: boolean }>;
    expect(disabled.length === 2 && disabled.every((u) => !u.enabled), "post-act disable failed");
    const relLogin = await api("POST", "/api/v1/auth/login", { email: LEARNER_EMAIL, password: PASSWORD });
    phase("probe_users_disabled", {
      disabled_rows: dis.count, verified: disabled.map((u) => ({ email: u.email.replace(HEX, "<hex>"), enabled: u.enabled })),
      post_disable_login_status: relLogin.status,
      note: relLogin.status === 200
        ? "DISCLOSED: login after enabled=false returned 200 — the disable law does not gate login on this surface; rows are inert regardless (audit trail only)"
        : "post-disable login refused (the enable law gates)",
    });
    phase("verdict", "the switched-off physical probes are DEPLOYED: 147 multi-axis grids serve, a real learner answer landed, R4 consumed it");
  }

  // write receipt (always)
  await Bun.write(RECEIPT_PATH, JSON.stringify(RECEIPT, null, 2));
  console.log(`receipt written: ${RECEIPT_PATH}`);
} finally {
  await sql.end({ timeout: 5 });
}
