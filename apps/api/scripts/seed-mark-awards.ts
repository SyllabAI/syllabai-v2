/**
 * Seed script — T-MG-AWARDS-1 run-001 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.2, the "seed data from an internal
 * marking dry-run" bullet).
 *
 * Idempotent upsert of mark_awards rows (+ their mark_working_blocks
 * evidence) from a JSON manifest, resolving:
 *   - the paper by paperCode + sessionLabel (uq_exam_paper_identity law),
 *   - the learner by email (users.email; zero or multiple hits fail loud),
 *   - each award's markPointRef against the paper's mark_points (1:1,
 *     loud-fail on 0/N hits — the RECT-1 seed resolution law; null ref =
 *     a free-form award, mark_point_id NULL, the plan §3.2 null-law).
 *
 * UPSERT (NOT the DC-7 claim): the seed is a fixture GROUNDER, not a
 * pipeline publish — re-running a manifest re-grounds the same rows in
 * place (on conflict do update, the RECT-1 seed posture). The once-only
 * claim law belongs to the pipeline write path
 * (createPaperAwardPublisher); this divergence is disclosed, deliberate.
 *
 * DRY RUN: --dry-run validates the manifest + all resolutions and writes
 * NOTHING.
 *
 * HONESTY NOTE: the checked-in fixture
 * scripts/fixtures/mark-awards-dryrun.json is a DRY-RUN rehearsal
 * manifest — its paperCode/sessionLabel/learnerEmail/markPointRef values
 * are placeholders aligned to the live corpus before the first real run
 * (the script fails loudly if a placeholder doesn't resolve). The
 * regionKey values are the DERIVED keys of the target paper (the §3.1
 * law) — the seed writes the ledger directly and never re-derives.
 *
 * Usage:
 *   DATABASE_URL=... bun apps/api/scripts/seed-mark-awards.ts \
 *     scripts/fixtures/mark-awards-dryrun.json [--dry-run]
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../src/services/identity/users";

const feedbackSchema = z.object({
  attempt: z.string().min(1),
  chatMessage: z.string(),
  pointsScored: z.array(z.string()),
  pointsNotScored: z.array(z.string()),
  thoughtProcess: z.string(),
  strategiesForImprovement: z.array(z.string()),
});

const awardSchema = z.object({
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointRef: z.string().min(1).nullable(),
  page: z.number().int().min(1).nullable(),
  pipelineVersion: z.string().min(1),
  feedback: feedbackSchema,
});

const regionSchema = z.object({
  regionKey: z.string().min(1),
  awards: z.array(awardSchema.extend({ working: z.object({ kind: z.enum(["ink", "text", "structure"]), content: z.unknown() }).optional() })).min(1),
});

const manifestSchema = z.object({
  paperCode: z.string().min(1),
  sessionLabel: z.string().min(1),
  learnerEmail: z.string().email(),
  note: z.string().min(1),
  regions: z.array(regionSchema).min(1),
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const manifestPath = args.find((a) => !a.startsWith("--"));
  if (!manifestPath) {
    console.error("usage: seed-mark-awards.ts <manifest.json> [--dry-run]");
    process.exit(2);
  }
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (!parsed.success) {
    console.error("manifest invalid:", JSON.stringify(parsed.error.issues, null, 2));
    process.exit(2);
  }
  const manifest = parsed.data;

  const sql = createSql(requireDatabaseUrl({ DATABASE_URL: process.env.DATABASE_URL }));

  // paper identity (uq_exam_paper_identity — zero or multiple hits fail loud)
  const papers = (await sql`
    select id from exam_papers
    where paper_code = ${manifest.paperCode} and session_label = ${manifest.sessionLabel}
  `) as unknown as Array<{ id: string }>;
  if (papers.length !== 1) {
    console.error(`paper resolution failed: ${papers.length} rows for ${manifest.paperCode} / ${manifest.sessionLabel} (identity law: exactly 1)`);
    process.exit(3);
  }
  const paperId = papers[0]!.id;

  // learner identity (email — zero or multiple hits fail loud)
  const learners = (await sql`
    select id from users where email = ${manifest.learnerEmail}
  `) as unknown as Array<{ id: string }>;
  if (learners.length !== 1) {
    console.error(`learner resolution failed: ${learners.length} rows for ${manifest.learnerEmail}`);
    process.exit(3);
  }
  const learnerId = learners[0]!.id;

  // markPointRef → mark_points.id, scoped to the paper's question tree
  // (1:1 law: join through the paper's questions; 0/N hits fail loud)
  const pointCache = new Map<string, string>();
  async function resolvePoint(ref: string): Promise<string> {
    const hit = pointCache.get(ref);
    if (hit) return hit;
    const rows = (await sql`
      select mp.id from mark_points mp
      join mark_schemes ms on ms.id = mp.mark_scheme_id
      join question_parts qp on qp.id = ms.question_part_id
      join question_versions qv on qv.id = qp.question_version_id
      join questions q on q.id = qv.question_id
      where q.exam_paper_id = ${paperId} and mp.ref = ${ref}
    `) as unknown as Array<{ id: string }>;
    if (rows.length !== 1) {
      console.error(`markPointRef resolution failed: ${rows.length} rows for ref ${ref} within paper ${paperId} (1:1 law)`);
      process.exit(3);
    }
    pointCache.set(ref, rows[0]!.id);
    return rows[0]!.id;
  }

  let awardCount = 0;
  let blockCount = 0;
  if (dryRun) {
    for (const region of manifest.regions) {
      for (const award of region.awards) {
        if (award.markPointRef !== null) await resolvePoint(award.markPointRef);
        awardCount += 1;
        if (award.working) blockCount += 1;
      }
    }
    console.log(`DRY RUN OK: paper ${paperId} learner ${learnerId}; ${manifest.regions.length} regions, ${awardCount} awards, ${blockCount} working blocks — NOTHING written`);
    return;
  }

  for (const region of manifest.regions) {
    for (const award of region.awards) {
      const markPointId = award.markPointRef !== null ? await resolvePoint(award.markPointRef) : null;
      let workingRef: string | null = null;
      if (award.working) {
        workingRef = randomUUID();
        await sql`
          insert into mark_working_blocks (id, learner_id, document_ref_type, document_ref_id, region_key, kind, content)
          values (${workingRef}, ${learnerId}, 'paper_asset', ${paperId}, ${region.regionKey}, ${award.working.kind}, ${JSON.stringify(award.working.content)}::jsonb)
          on conflict (id) do update set content = excluded.content, kind = excluded.kind
        `;
        blockCount += 1;
      }
      await sql`
        insert into mark_awards (id, learner_id, document_ref_type, document_ref_id, region_key,
          mark_point_id, page, code, awarded, score, max_score, ordinal, working_ref, pipeline_version, feedback)
        values (gen_random_uuid(), ${learnerId}, 'paper_asset', ${paperId}, ${region.regionKey},
          ${markPointId}, ${award.page}, ${award.code}, ${award.awarded}, ${award.score}, ${award.maxScore},
          ${award.ordinal}, ${workingRef}, ${award.pipelineVersion}, ${JSON.stringify(award.feedback)}::jsonb)
        on conflict (learner_id, document_ref_id, region_key, code, ordinal) do update set
          mark_point_id = excluded.mark_point_id,
          page = excluded.page,
          awarded = excluded.awarded,
          score = excluded.score,
          max_score = excluded.max_score,
          working_ref = excluded.working_ref,
          pipeline_version = excluded.pipeline_version,
          feedback = excluded.feedback
      `;
      awardCount += 1;
    }
  }
  console.log(`SEEDED: paper ${paperId} learner ${learnerId}; ${manifest.regions.length} regions, ${awardCount} awards, ${blockCount} working blocks`);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
