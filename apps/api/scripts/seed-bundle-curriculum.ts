/**
 * T-MIG-134 band 134c — the second-subject seed runner (the of-record
 * reproducible apply path).
 *
 * Applies the bundle→KG curriculum seed (services/curriculum/bundle-seed.ts)
 * against a Postgres/Neon target, inside ONE transaction (the frozen seed
 * law's @Transactional — the createSql adapter's begin/commit/rollback seam;
 * a mid-seed failure rolls the whole dimension back).
 *
 * Modes:
 *   bun apps/api/scripts/seed-bundle-curriculum.ts <slug> --dry-run
 *       — runs the EXACT statement sequence inside a transaction and throws
 *         a sentinel at the end (ROLLBACK): zero persistence, full proof
 *         the seed executes clean against the target schema.
 *   bun apps/api/scripts/seed-bundle-curriculum.ts <slug> --apply
 *       — the real apply; prints the seed summary (created/reused counters;
 *         re-running on a seeded store is the structural no-op of record).
 *
 * Target: SEED_DATABASE_URL env (inline-only credential law — the pooled
 * connection uri is read from the environment, never printed, never
 * persisted; this script's own output is scrub-asserted).
 *
 * Bundle of record: apps/hub/content/<slug>/curriculum.json + manifest.json
 * (the manifest's importSource feeds the provenance line of record).
 *
 * created_by law: the lane apply passes no user uuid — author lands
 * "bundle-seed-v1" (the seed's author() law), disclosed in the receipt.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import {
  seedBundleCurriculum,
  type BundleCurriculum,
  type BundleSeedSummary,
} from "../src/services/curriculum/bundle-seed";

const slug = process.argv[2];
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
if (!slug || !mode) {
  console.error("usage: bun apps/api/scripts/seed-bundle-curriculum.ts <slug> (--apply | --dry-run)");
  process.exit(2);
}
const uri = process.env.SEED_DATABASE_URL;
if (!uri) {
  console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
  process.exit(2);
}

const base = join(import.meta.dir, "../../../apps/hub/content", slug);
const bundle = JSON.parse(readFileSync(join(base, "curriculum.json"), "utf8")) as BundleCurriculum;
const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")) as {
  schema: string;
  importSource: { repo: string; ref: string };
};
const ref = manifest.importSource.ref.replace(/^main@/, "");
const source = {
  slug,
  importRepo: manifest.importSource.repo,
  importRef: ref,
  schema: manifest.schema,
};

const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
let summary: BundleSeedSummary;
try {
  if (mode === "apply") {
    summary = await sql.begin(async (tx) =>
      seedBundleCurriculum({ sql: tx, clock: { now: () => new Date() } }, bundle, source, null),
    );
  } else {
    // the dry-run: the exact statement sequence, rolled back at the end
    const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL (expected — the transaction is discarded)");
    try {
      await sql.begin(async (tx) => {
        await seedBundleCurriculum({ sql: tx, clock: { now: () => new Date() } }, bundle, source, null);
        throw sentinel;
      });
      throw new Error("dry-run sentinel did not fire — transaction committed unexpectedly");
    } catch (e) {
      if (e !== sentinel) throw e;
    }
    summary = {
      curriculumVersionId: "(rolled back)",
      subjectId: "(rolled back)",
      rootNodeId: "(rolled back)",
      units: -1,
      topics: -1,
      specPoints: -1,
      nodesCreated: -1,
      nodesReused: -1,
      edgesCreated: -1,
      edgesReused: -1,
      applicabilityWrites: -1,
      alreadyActive: false,
    };
    console.log(JSON.stringify({ mode, slug, source, dryRun: "statement sequence executed clean; transaction rolled back — zero persistence" }));
  }
} finally {
  await sql.end({ timeout: 5 });
}

if (summary) {
  const out = JSON.stringify({ mode, slug, source, summary }, null, 1);
  for (const pat of ["postgres://", "neon.tech", "napi_", "ghp_", "vcp_"]) {
    if (out.includes(pat)) {
      console.error("SCRUB FAIL: output contains " + pat);
      process.exit(3);
    }
  }
  console.log(out);
}
