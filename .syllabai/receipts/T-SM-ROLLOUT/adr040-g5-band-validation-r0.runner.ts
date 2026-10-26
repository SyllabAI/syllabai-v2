/**
 * G-5 band validation r0 — the R4 flip runner over the 431 part-bound
 * SUGGESTED LEVELS schemes born by adr040-g4-levels-birth-r1 (operator order
 * "proceed with G-5", trace 1a179ec453e4fb01).
 *
 * UNTRACKED lane runner — receipt artifact `adr040-g5-band-validation-r0`
 * carries its source beside the JSON. No credentials inside: DATABASE_URL
 * from the environment. NO deviations from shipped behavior: every flip
 * goes through the REAL seam `ContentReviewWriteService.validateMarkScheme`
 * (review-writes.ts) — the R4 band-coverage gate (assertBandsTileForFlip,
 * ruling-A part-marks resolution) runs fail-closed BEFORE the flip, and the
 * AUDIT contract writes ONE content_review_audit row per flip in the SAME
 * transaction (actor null → actor_label "system", the lane convention).
 * criteria=null, guidance=null → validate as-is, general_guidance untouched.
 *
 * Scope discipline: schemes ONLY. question_versions / exam_papers states
 * are snapshotted before/after and must be byte-identical — G-5 is band
 * validation, not the §7 paper-level workflow.
 *
 * Usage: bun run apps/api/g5r0-validate.ts <out.json>
 * Env:   DATABASE_URL (the prod DSN, quoted in .creds/db.env)
 */
import { writeFileSync } from "node:fs";
import { Client } from "@neondatabase/serverless";
import { createSql } from "./src/services/identity/users";
import { ContentReviewWriteService } from "./src/services/content/review-writes";
import { ConflictException, NotFoundException } from "./src/services/identity/errors";

interface Row {
  [k: string]: unknown;
}
type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

// statement tracing on failure (lane tool only — never shipped)
const origQuery = (Client.prototype as { query: (...a: unknown[]) => Promise<unknown> }).query;
(Client.prototype as { query: (...a: unknown[]) => Promise<unknown> }).query = async function (...args: unknown[]) {
  try {
    return await origQuery.apply(this, args);
  } catch (e) {
    const first = args[0] as { text?: string } | string | undefined;
    const text = typeof first === "string" ? first : first?.text ?? "";
    console.error("FAILED SQL STATEMENT:\n" + String(text).slice(0, 2000));
    throw e;
  }
};

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
  const audit = await sql`select count(*) as n from content_review_audit`;
  const auditValidate = await sql`
    select count(*) as n from content_review_audit where action = 'VALIDATE' and target_type = 'mark_scheme'`;
  return {
    mark_schemes: schemes.map((r) => [String(r.scheme_kind), String(r.validation_state), Number(r.n)]),
    question_versions: versions.map((r) => [String(r.validation_state), Number(r.n)]),
    exam_papers: papers.map((r) => [String(r.validation_state), Number(r.n)]),
    mark_bands: Number(bands[0]!.n),
    mark_points: Number(points[0]!.n),
    evals: Number(evals[0]!.n),
    audit_total: Number(audit[0]!.n),
    audit_validate_mark_scheme: Number(auditValidate[0]!.n),
  };
}

async function main(): Promise<void> {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("usage: bun run apps/api/g5r0-validate.ts <out.json>");
    process.exit(2);
  }
  const dsn = process.env.DATABASE_URL;
  if (!dsn || dsn.trim() === "") {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const sql = createSql(dsn);
  const service = new ContentReviewWriteService({ sql, clock: { now: () => new Date() } });

  // ── the cohort: every SUGGESTED LEVELS scheme, part-bound, deterministic order
  const cohort: Array<Row> = await sql`
    select id, question_version_id, question_part_id
    from mark_schemes
    where scheme_kind = 'LEVELS' and validation_state = 'SUGGESTED'
    order by id`;
  console.log("cohort: SUGGESTED LEVELS schemes =", cohort.length);
  const unbound = cohort.filter((r) => r.question_part_id == null).length;
  // RESUME-SAFE: the runner selects SUGGESTED only, so a re-run picks up
  // exactly the unflipped remainder (first run, killed at the 10-min shell
  // timeout, had flipped 318/431 with their audit rows — each flip is one
  // complete tx). Guards: unbound schemes refuse; >431 means the estate
  // grew beyond the G-4 of-record cohort — abort clean.
  if (cohort.length > 431 || unbound !== 0) {
    console.error(`ABORT: expected ≤431 part-bound SUGGESTED LEVELS schemes, found ${cohort.length} (${unbound} unbound)`);
    process.exit(1);
  }
  if (cohort.length === 0) {
    console.log("nothing to flip — cohort empty (already complete?)");
    const after0 = await snapshots(sql);
    writeFileSync(outPath, JSON.stringify({ cohort: { found: 0, flipped: 0, refused: 0 }, after: after0 }, null, 1));
    process.exit(0);
  }

  const before = await snapshots(sql);
  console.log("before:", JSON.stringify(before));

  // ── the flip: one REAL-seam validateMarkScheme per scheme (its own tx)
  const flipped: string[] = [];
  const refusals: Array<{ schemeId: string; error: string; kind: string }> = [];
  const startedAt = new Date().toISOString();
  for (const row of cohort) {
    const schemeId = String(row.id);
    try {
      await service.validateMarkScheme(schemeId, null, null, null);
      flipped.push(schemeId);
      if (flipped.length % 50 === 0) console.log(`  flipped ${flipped.length}/${cohort.length}`);
    } catch (e) {
      const kind =
        e instanceof ConflictException ? "ConflictException(409)" :
        e instanceof NotFoundException ? "NotFoundException(404)" : "Error(500)";
      const msg = e instanceof Error ? e.message : String(e);
      refusals.push({ schemeId, error: msg, kind });
      console.error(`  REFUSED ${schemeId} [${kind}]: ${msg.slice(0, 300)}`);
    }
  }
  const finishedAt = new Date().toISOString();

  // ── post tripwires
  const after = await snapshots(sql);
  console.log("after:", JSON.stringify(after));

  const byteIdentical =
    JSON.stringify(before.mark_schemes.filter((r) => r[0] !== "LEVELS")) ===
      JSON.stringify(after.mark_schemes.filter((r) => r[0] !== "LEVELS")) &&
    JSON.stringify(before.question_versions) === JSON.stringify(after.question_versions) &&
    JSON.stringify(before.exam_papers) === JSON.stringify(after.exam_papers) &&
    before.mark_bands === after.mark_bands &&
    before.mark_points === after.mark_points &&
    before.evals === after.evals;

  const out = {
    runner: "apps/api/g5r0-validate.ts (untracked; source embedded in the receipt artifact)",
    seam: "ContentReviewWriteService.validateMarkScheme(schemeId, null, null, null) — review-writes.ts; R4 gate assertBandsTileForFlip fail-closed pre-flip; audit row per flip, actor_label system",
    gate: "ADR-040 §5.3 R4 band validation (G-5)",
    cohort: {
      expected: 431,
      found: cohort.length,
      unbound: unbound,
      flipped: flipped.length,
      refused: refusals.length,
    },
    refusals,
    before,
    after,
    byteIdenticalNonLevelsWorld: byteIdentical,
    auditDelta: {
      total: after.audit_total - before.audit_total,
      validate_mark_scheme: after.audit_validate_mark_scheme - before.audit_validate_mark_scheme,
    },
    startedAt,
    finishedAt,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`FLIPPED: ${flipped.length}  REFUSED: ${refusals.length}  non-LEVELS world byte-identical: ${byteIdentical}`);
  console.log(`written: ${outPath}`);
  if (refusals.length > 0) process.exit(3); // refusals are findings of record, not silent
}

main().catch((e: unknown) => {
  console.error("G-5 RUNNER FAILED:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
