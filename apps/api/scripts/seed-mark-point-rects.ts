/**
 * Seed script — T-MG-MP-RECT-1 run-001 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.1, the "seed subset" bullet).
 *
 * Idempotent upsert of mark_point_rects rows from a JSON manifest, resolving
 * each manifest row's markPointRef against ONE exam paper (paper_code +
 * session_label identity, the uq_exam_paper_identity law).
 *
 * RESOLUTION LAW: a manifest row names `markPointRef` (mark_points.ref,
 * varchar(20)) scoped to the target paper's question tree; the script
 * resolves exactly one mark_points row per ref — zero hits and multiple
 * hits BOTH fail loudly (ambiguity never silently resolves). Geometry is
 * carried verbatim from the manifest (normalized 0..1; the DB CHECK
 * constraints are the second gate).
 *
 * IDEMPOTENCE: insert ... on conflict (mark_point_id, ordinal) do update —
 * re-running a manifest re-grounds the same rows in place; no duplicates
 * (uq_mark_point_rect_point_ordinal), no orphans (FK cascade).
 *
 * DRY RUN: `--dry-run` validates the manifest + resolutions and writes
 * NOTHING (the rehearsal posture for the first real corpus pass).
 *
 * HONESTY NOTE: the checked-in fixture
 * scripts/fixtures/mark-point-rects-joinproof.json is a JOIN-PROOF
 * rehearsal manifest — its markPointRef values are placeholders aligned to
 * the live corpus before the first real run (the script fails loudly if a
 * placeholder doesn't resolve). Extraction TRUTH (real page-anchored
 * geometry from the paper PDFs) is T-MG-MP-RECT-2's content lane, per plan
 * §3.1 "Backfill".
 *
 * Usage:
 *   DATABASE_URL=... bun apps/api/scripts/seed-mark-point-rects.ts \
 *     scripts/fixtures/mark-point-rects-joinproof.json [--dry-run]
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../src/services/identity/users";

const manifestSchema = z.object({
  paperCode: z.string().min(1),
  sessionLabel: z.string().min(1),
  note: z.string().min(1),
  rects: z
    .array(
      z.object({
        markPointRef: z.string().min(1).max(20),
        regionKey: z.string().min(1),
        page: z.number().int().min(1),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
        ordinal: z.number().int().min(0),
        extractionConfidence: z.number().min(0).max(1).nullable(),
      }),
    )
    .min(1),
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const manifestPath = args.find((a) => !a.startsWith("--"));
  if (!manifestPath) {
    console.error("usage: bun seed-mark-point-rects.ts <manifest.json> [--dry-run]");
    process.exit(1);
  }

  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  console.log(`manifest: ${manifestPath} — paper ${manifest.paperCode} / ${manifest.sessionLabel}, ${manifest.rects.length} rect row(s)`);
  console.log(`note: ${manifest.note}`);
  if (dryRun) console.log("DRY RUN — no writes");

  const sql = createSql(requireDatabaseUrl(process.env as { DATABASE_URL?: string }));

  // (A) the paper — uq_exam_paper_identity (paper_code, session_label)
  const papers = (await sql`
    select p.id from exam_papers p
    where p.paper_code = ${manifest.paperCode}
      and p.session_label = ${manifest.sessionLabel}`) as Array<{ id: string }>;
  if (papers.length !== 1) {
    console.error(`FAIL: paper ${manifest.paperCode}/${manifest.sessionLabel} resolved ${papers.length} row(s) — exactly one required`);
    process.exit(2);
  }
  const paperId = papers[0]!.id;
  console.log(`paper: ${paperId}`);

  // (B) per-rect resolution: exactly one mark_points row per ref within the
  // paper's tree (ref scoped by the exam_paper_id join — never global).
  const resolved: Array<{ ref: string; regionKey: string; pointId: string } & (typeof manifest.rects)[number]> = [];
  for (const rect of manifest.rects) {
    const hits = (await sql`
      select mp.id
      from mark_points mp
      join mark_schemes ms on ms.id = mp.mark_scheme_id
      join question_versions v on v.id = ms.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}
        and mp.ref = ${rect.markPointRef}`) as Array<{ id: string }>;
    if (hits.length !== 1) {
      console.error(`FAIL: markPointRef ${rect.markPointRef} (${rect.regionKey}) resolved ${hits.length} mark_points row(s) within the paper — exactly one required`);
      process.exit(3);
    }
    resolved.push({ ref: rect.markPointRef, regionKey: rect.regionKey, pointId: hits[0]!.id, ...rect });
  }
  console.log(`resolution: ${resolved.length}/${manifest.rects.length} refs resolved 1:1`);
  for (const r of resolved) console.log(`  ${r.regionKey} → ${r.pointId} (page ${r.page}, ord ${r.ordinal})`);

  if (dryRun) {
    console.log("DRY RUN complete — resolutions verified, nothing written");
    return;
  }

  // (C) idempotent upsert (uq_mark_point_rect_point_ordinal).
  for (const r of resolved) {
    await sql`
      insert into mark_point_rects
        (id, mark_point_id, page, x, y, width, height, ordinal, extraction_confidence)
      values (${randomUUID()}, ${r.pointId}, ${r.page}, ${r.x}, ${r.y}, ${r.width}, ${r.height}, ${r.ordinal}, ${r.extractionConfidence})
      on conflict (mark_point_id, ordinal) do update set
        page = excluded.page,
        x = excluded.x,
        y = excluded.y,
        width = excluded.width,
        height = excluded.height,
        extraction_confidence = excluded.extraction_confidence`;
  }
  console.log(`seeded: ${resolved.length} rect row(s) upserted onto ${paperId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
