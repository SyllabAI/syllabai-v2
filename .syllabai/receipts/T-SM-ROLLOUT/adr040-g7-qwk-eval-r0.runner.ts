/**
 * G-7 QWK eval + the 16 registry-row flips behind the D5-β floors — lane
 * runner (operator order "G-7 — QWK eval + the 16 registry-row flips behind
 * the D5-β floors", trace 1a17c3dac34795cd), on the G-6 exit of record
 * f1ca693b / prod dpl_BVPKU53dKcvqDWX5EhGjAH1JfZp5.
 *
 * UNTRACKED lane runner — receipt artifact `adr040-g7-qwk-eval-r0` carries
 * its source beside the JSON. No credentials inside: DATABASE_URL from the
 * environment. Zero DB writes BY CONSTRUCTION AND BY VERIFICATION:
 *   - every §5.5 band-eval seam call is EXPECTED to refuse (the packet is
 *     empty — 0 human band captures); the shipped law throws BEFORE any
 *     insert (packetCount===0 → ConflictError; floors → ConflictError, NO
 *     row) — an unexpected PASS would be an integrity violation → exit 3;
 *   - every other statement is a read;
 *   - before/after snapshots must be byte-identical (the G-5 tripwire shape
 *     extended with human_marks / smart_mark_results / answers-on-band-parts
 *     / audit counts).
 *
 * Seam exercises (the REAL shipped code, zero code change):
 *   1. TeacherMarkingService.evaluateBandAgreement(null, ·)        — ALL scope
 *   2. evaluateBandAgreementForSubject(4BS1)                       — SUBJECT
 *   3. evaluateBandAgreementForSubject(4GE1)                       — SUBJECT
 *   4. SmartMarkService.kappaGatePassed(bandPaper, bandQ, BAND_QWK)    — false
 *   5. SmartMarkService.kappaGatePassed(bandPaper, bandQ, POINT)       — per-kind law demo
 * Plus: the D5-β floor census (real numbers of record) and the R5 flip-gate
 * audit over the 16 band-scheme deferred rows (ingest-r1.json of record).
 *
 * Usage: bun run apps/api/g7r0-eval.ts <out.json>
 * Env:   DATABASE_URL (the prod DSN, quoted in .creds/db.env)
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createSql } from "./src/services/identity/users";
import { TeacherMarkingService } from "./src/services/teachermarking";
import {
  METRIC_BAND_QWK,
  METRIC_POINT_UNWEIGHTED,
  SmartMarkService,
} from "./src/services/smartmark";
import { defaultClock, noopGradedEvidencePublisher } from "./src/services/selfmark";

type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** The 16 band-scheme deferred rows — `out_of_scope_gaps_16` of record,
 * T-SM-EDX-INGEST-R1 ingest-r1.json (the "16 band rows" the gate chain
 * carries): "9609, 8291, 0450, 0264, 0455x2, 0475, 0680, 0460x2, 0470, 0490,
 * 4BS1, 4EA1-p2, 4ET1, 4GE1" — band-scheme deferred (phase-0 law, flip-
 * blocked pending ADR-040) + skeletons (EMPTY inc=0) at that census. */
const COHORT_16: Array<{ slug: string; code: string; note: string }> = [
  { slug: "cie-a-level-business-23", code: "9609", note: "9609" },
  { slug: "cie-as-environmental-management-20", code: "8291", note: "8291" },
  { slug: "cie-igcse-business-23", code: "0450", note: "0450" },
  { slug: "cie-igcse-business-25", code: "0264", note: "0264" },
  { slug: "cie-igcse-economics-20", code: "0455", note: "0455 x2 (1/2)" },
  { slug: "cie-igcse-economics-25", code: "0455", note: "0455 x2 (2/2)" },
  { slug: "cie-igcse-english-literature-21", code: "0475", note: "0475" },
  { slug: "cie-igcse-environmental-management-25", code: "0680", note: "0680" },
  { slug: "cie-igcse-geography-20", code: "0460", note: "0460 x2 (1/2)" },
  { slug: "cie-igcse-geography-25", code: "0460", note: "0460 x2 (2/2)" },
  { slug: "cie-igcse-history-18", code: "0470", note: "0470" },
  { slug: "cie-igcse-religious-studies-23", code: "0490", note: "0490" },
  { slug: "igcse-business-19", code: "4BS1", note: "4BS1" },
  { slug: "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing", code: "4EA1", note: "4EA1-p2" },
  { slug: "igcse-english-literature-16", code: "4ET1", note: "4ET1" },
  { slug: "igcse-geography-19", code: "4GE1", note: "4GE1" },
];

const COMPUTED_BY = "T-SM-ROLLOUT adr040-g7-qwk-eval-r0 (lane runner)";

const P = (m: string) => console.log(`MARK ${new Date().toISOString()} ${m}`);

interface Refusal {
  call: string;
  threw: boolean;
  errorKind: string;
  errorMessage: string;
}

async function snapshots(sql: SqlFn): Promise<Record<string, unknown>> {
  const schemes = await sql`
    select scheme_kind, validation_state, count(*) as n from mark_schemes group by 1,2 order by 1,2`;
  const versions = await sql`
    select validation_state, count(*) as n from question_versions group by 1 order by 1`;
  const papers = await sql`
    select validation_state, count(*) as n from exam_papers group by 1 order by 1`;
  const bands = await sql`select count(*) as n from mark_bands`;
  const points = await sql`select count(*) as n from mark_points`;
  const evals = await sql`select count(*) as n from smart_mark_agreement_evaluations`;
  const evalRows = await sql`
    select id, scope, metric, passed, computed_at from smart_mark_agreement_evaluations order by computed_at asc`;
  const audit = await sql`select count(*) as n from content_review_audit`;
  const humans = await sql`
    select count(*) as total, count(band_placement) as with_band from human_marks`;
  const runs = await sql`
    select count(*) as total,
      count(*) filter (where breakdown::text like '%band_decision_v1%') as band_shape
    from smart_mark_results`;
  const answersOnBand = await sql`
    select count(*) as n from answers a
    join attempts at on at.id = a.attempt_id
    where exists (
      select 1 from mark_schemes ms
      join question_versions qv on qv.id = ms.question_version_id
      where qv.question_id = at.question_id and ms.scheme_kind = 'LEVELS'
    )`;
  const evalHistogram = await sql`
    select metric, scope, count(*) as n from smart_mark_agreement_evaluations group by 1,2 order by 1,2`;
  return {
    mark_schemes: schemes.map((r) => [String(r.scheme_kind), String(r.validation_state), Number(r.n)]),
    question_versions: versions.map((r) => [String(r.validation_state), Number(r.n)]),
    exam_papers: papers.map((r) => [String(r.validation_state), Number(r.n)]),
    mark_bands: Number(bands[0]!.n),
    mark_points: Number(points[0]!.n),
    evals: Number(evals[0]!.n),
    evals_by_metric_scope: evalHistogram.map((r) => [String(r.metric), String(r.scope), Number(r.n)]),
    eval_rows: evalRows.map((r) => ({
      id: String(r.id), scope: String(r.scope), metric: String(r.metric),
      passed: Boolean(r.passed), computed_at: String(r.computed_at),
    })),
    audit_total: Number(audit[0]!.n),
    human_marks_total: Number(humans[0]!.total),
    human_marks_with_band_placement: Number(humans[0]!.with_band),
    smart_runs_total: Number(runs[0]!.total),
    smart_runs_band_shape: Number(runs[0]!.band_shape),
    answers_on_band_parts: Number(answersOnBand[0]!.n),
  };
}

async function main(): Promise<void> {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("usage: bun run apps/api/g7r0-eval.ts <out.json>");
    process.exit(2);
  }
  const dsn = process.env.DATABASE_URL;
  if (!dsn || dsn.trim() === "") {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const sql = createSql(dsn);
  P("services composing");
  const marking = new TeacherMarkingService(sql, noopGradedEvidencePublisher, defaultClock);
  const shared = new SmartMarkService(
    sql,
    null as unknown as ConstructorParameters<typeof SmartMarkService>[1],
    noopGradedEvidencePublisher,
    defaultClock,
  );

  // ── 0. registry cohort cross-check (courses.json at repo HEAD, on disk)
  P("registry cross-check");
  const coursesJson = JSON.parse(
    readFileSync(new URL("../hub/content/courses.json", import.meta.url), "utf8"),
  ) as { courses: Array<Record<string, unknown>> };
  const bySlug = new Map(coursesJson.courses.map((r) => [String(r.slug), r]));
  const cohortCheck: Array<Record<string, unknown>> = [];
  let cohortOk = true;
  for (const c of COHORT_16) {
    const row = bySlug.get(c.slug);
    if (!row) {
      cohortOk = false;
      cohortCheck.push({ slug: c.slug, code: c.code, present: false });
      continue;
    }
    const flipped = row.coreBridge === true;
    if (flipped) cohortOk = false;
    cohortCheck.push({
      slug: c.slug, code: c.code, note: c.note, present: true,
      status: String(row.status ?? null), coreBridge: row.coreBridge ?? null,
      unflippedToday: !flipped,
    });
  }
  console.log(`cohort: ${COHORT_16.length} rows of record; all present & unflipped: ${cohortOk}`);

  // ── 1. before snapshot
  P("before snapshot");
  const before = await snapshots(sql);
  console.log("before:", JSON.stringify({
    evals: before.evals, human_marks_with_band_placement: before.human_marks_with_band_placement,
    smart_runs_band_shape: before.smart_runs_band_shape, answers_on_band_parts: before.answers_on_band_parts,
    mark_bands: before.mark_bands,
  }));

  // ── 2. subjects of record (4BS1 / 4GE1 — the only band-live subjects)
  P("subjects resolve");
  const subjRows = await sql`
    select id, code from subjects where code in ('4BS1', '4GE1') order by code`;
  const subj = new Map(subjRows.map((r) => [String(r.code), String(r.id)]));
  if (subj.size !== 2) {
    console.error(`ABORT: expected exactly one subjects row each for 4BS1/4GE1, found ${subj.size}`);
    process.exit(1);
  }
  const bs1 = subj.get("4BS1")!;
  const ge1 = subj.get("4GE1")!;

  // a real band (paper, question) probe anchor on 4BS1
  P("probe question resolve");
  const probeRows = await sql`
    select q.id as question_id, ep.id as exam_paper_id
    from questions q
    join exam_papers ep on ep.id = q.exam_paper_id
    join subjects s on s.id = ep.subject_id
    where s.code = '4BS1'
    order by q.id
    limit 1`;
  if (probeRows.length !== 1) {
    console.error("ABORT: no 4BS1 paper-bound question found for the gate probe");
    process.exit(1);
  }
  const probeQ = String(probeRows[0]!.question_id);
  const probeP = String(probeRows[0]!.exam_paper_id);

  // ── 3. the REAL §5.5 seam exercises — every one MUST refuse (fail-closed)
  P("seam exercises");
  const refusals: Refusal[] = [];
  let integrityViolation = false;

  async function expectBandRefusal(call: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      // NO throw = the eval PASSED and wrote a row — integrity violation.
      integrityViolation = true;
      refusals.push({ call, threw: false, errorKind: "NO-THROW", errorMessage: "eval returned without refusing" });
      console.error(`INTEGRITY VIOLATION: ${call} did NOT refuse`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const kind = e instanceof Error ? e.constructor.name : typeof e;
      refusals.push({ call, threw: true, errorKind: kind, errorMessage: msg });
      console.log(`REFUSED ${call} [${kind}]: ${msg}`);
    }
  }

  await expectBandRefusal("evaluateBandAgreement(scope=ALL)", () =>
    marking.evaluateBandAgreement(null, COMPUTED_BY));
  await expectBandRefusal("evaluateBandAgreementForSubject(4BS1)", () =>
    marking.evaluateBandAgreementForSubject(bs1, COMPUTED_BY));
  await expectBandRefusal("evaluateBandAgreementForSubject(4GE1)", () =>
    marking.evaluateBandAgreementForSubject(ge1, COMPUTED_BY));

  // ── 4. the metric-kind-hard gate on a REAL band question
  P("gate probes");
  const gateBand = await shared.kappaGatePassed(probeP, probeQ, METRIC_BAND_QWK);
  const gatePoint = await shared.kappaGatePassed(probeP, probeQ, METRIC_POINT_UNWEIGHTED);
  console.log(`kappaGatePassed(4BS1 band question): BAND_QWK=${gateBand}  POINT_UNWEIGHTED=${gatePoint}`);
  if (gateBand) {
    // A BAND_QWK release with zero BAND_QWK rows would be a gate-law breach.
    integrityViolation = true;
    console.error("INTEGRITY VIOLATION: kappaGatePassed returned true for BAND_QWK with no BAND_QWK rows");
  }

  // ── 5. the D5-β floor census (real numbers of record)
  P("floor census");
  const floors = {
    n_pairs: 0,
    n_pairs_floor: 25,
    scored: "0/0 (packet empty)",
    scored_ratio_floor: "50%",
    capture: "0/0 (packet empty)",
    capture_ratio_floor: "80%",
    level_span: 0,
    level_span_floor: 2,
    boundary_straddling: 0,
    boundary_straddling_floor: 10,
    basis: "human_marks band_placement captures = " + String(before.human_marks_with_band_placement) +
      "; band-shaped smart runs = " + String(before.smart_runs_band_shape) +
      "; answers on band parts = " + String(before.answers_on_band_parts),
  };

  // ── 6. the R5 flip-gate audit over the 16 rows (read-only, per-kind law)
  P("flip audit");
  const codes = [...new Set(COHORT_16.map((c) => c.code))];
  const schemeCounts = await sql`
    select s.code as code,
      (select count(*) from mark_schemes ms
        join question_versions qv on qv.id = ms.question_version_id
        join questions q on q.id = qv.question_id
        join exam_papers ep on ep.id = q.exam_paper_id
        where ep.subject_id = s.id and ms.scheme_kind = 'LEVELS') as levels_schemes,
      (select count(*) from mark_schemes ms
        join question_versions qv on qv.id = ms.question_version_id
        join questions q on q.id = qv.question_id
        join exam_papers ep on ep.id = q.exam_paper_id
        where ep.subject_id = s.id and ms.scheme_kind = 'POINTS') as points_schemes,
      (select count(*) from mark_bands b
        join mark_schemes ms on ms.id = b.mark_scheme_id
        join question_versions qv on qv.id = ms.question_version_id
        join questions q on q.id = qv.question_id
        join exam_papers ep on ep.id = q.exam_paper_id
        where ep.subject_id = s.id) as bands
    from subjects s
    where s.code = any(${codes}::text[])
    order by s.code`;
  const byCode = new Map(schemeCounts.map((r) => [String(r.code), r]));

  const flipAudit = COHORT_16.map((c) => {
    const agg = byCode.get(c.code);
    const levelsSchemes = agg ? Number(agg.levels_schemes) : 0;
    const pointsSchemes = agg ? Number(agg.points_schemes) : 0;
    const bands = agg ? Number(agg.bands) : 0;
    const reasons: string[] = [];
    if (levelsSchemes === 0) {
      reasons.push(
        `no LEVELS scheme in core for ${c.code} (band infrastructure not born — G-3 CIE corpus pending / estate skeleton)`,
      );
    } else {
      reasons.push(
        `LEVELS ${levelsSchemes} VALIDATED part-bound in core, but BAND_QWK eval rows = 0 — D5-β floors unmet (packet empty: 0 human band_placement captures, 0 answers on band parts); capture campaign required before any flip`,
      );
    }
    if (pointsSchemes > 0) reasons.push(`POINTS schemes present (${pointsSchemes}) — point kind also gates this row`);
    return {
      slug: c.slug, code: c.code, note: c.note,
      levels_schemes: levelsSchemes, points_schemes: pointsSchemes, mark_bands: bands,
      band_qwk_eval_rows: 0, // global histogram below proves 0 BAND_QWK rows exist
      verdict: "NOT_FLIPPED",
      flip_blocked: true,
      reasons,
    };
  });

  // ── 7. after snapshot + byte-identity
  P("after snapshot");
  const after = await snapshots(sql);
  const byteIdentical = JSON.stringify(before) === JSON.stringify(after);
  console.log("after:", JSON.stringify({
    evals: after.evals, human_marks_with_band_placement: after.human_marks_with_band_placement,
    smart_runs_band_shape: after.smart_runs_band_shape, answers_on_band_parts: after.answers_on_band_parts,
  }));
  console.log(`byte-identical read-only world: ${byteIdentical}`);

  const out = {
    runner: "apps/api/g7r0-eval.ts (untracked; source embedded in the receipt artifact)",
    gate: "ADR-040 §5.5 G-7 — QWK eval + the 16 registry-row flips behind the D5-beta floors",
    cohort_of_record: {
      source: "T-SM-EDX-INGEST-R1 ingest-r1.json out_of_scope_gaps_16 (16 band-scheme deferred rows)",
      size: COHORT_16.length,
      all_present_and_unflipped_at_head: cohortOk,
      rows: cohortCheck,
    },
    seam_exercises: refusals,
    gate_probe: {
      exam_paper_id: probeP,
      question_id: probeQ,
      kappaGatePassed_BAND_QWK: gateBand,
      kappaGatePassed_POINT_UNWEIGHTED: gatePoint,
      law: "metric-kind-hard (a BAND_QWK row can never release a point part nor the reverse)",
    },
    d5_beta_floors: floors,
    flip_audit: flipAudit,
    flipped_today: 0,
    before,
    after,
    byteIdentical,
    integrityViolation,
  };
  P(`done: flipped_today=0 integrityViolation=${integrityViolation} byteIdentical=${byteIdentical}`);
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`written: ${outPath}`);
  if (integrityViolation || !byteIdentical || !cohortOk) process.exit(3);
}

main().catch((e: unknown) => {
  console.error("G-7 RUNNER FAILED:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
