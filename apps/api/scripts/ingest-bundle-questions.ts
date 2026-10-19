/**
 * T-MIG-135b — the bundle-questions ingest runner (the reproducible apply
 * path for the 1.1 content bundles through the frozen ADR-026 replace).
 *
 *   bun apps/api/scripts/ingest-bundle-questions.ts <slug> --dry-run
 *       — builds the 1.0 package through the shim (services/sme/
 *         bundle-questions.ts), prints the mapping census, then runs the
 *         REAL SmeQuestionIngestService.ingest inside a transaction that is
 *         rolled back at the end (the 134c seed dry-run pattern): full
 *         statement proof against the target schema, ZERO persistence.
 *   bun apps/api/scripts/ingest-bundle-questions.ts <slug> --apply
 *       — the real ADR-026 evidence-safe replace (slice-scoped deactivation
 *         of exactly the re-emitted refs + fresh insert; idempotent).
 *
 * Target: SEED_DATABASE_URL env (inline-only credential law — never printed,
 * never persisted). Requires the curriculum seed of the bundle's spec to be
 * present (validate resolves primaryTopicCode/specPoints against
 * knowledge_nodes — seed-bundle-curriculum.ts first).
 *
 * Bundle of record: apps/hub/content/<slug>/{questions,curriculum,manifest}.json
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import type { BundleCurriculum } from "../src/services/curriculum/bundle-seed";
import {
  BundleQuestionsError,
  buildSmePackage,
  type BundleQuestionSet,
} from "../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../src/services/sme/index";
import type { SubmitClock } from "../src/services/selfmark";

const slug = process.argv[2];
const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;
if (!slug || !mode) {
  console.error("usage: bun apps/api/scripts/ingest-bundle-questions.ts <slug> (--apply | --dry-run)");
  process.exit(2);
}

const base = join(import.meta.dir, "../../../apps/hub/content", slug);
const sets = JSON.parse(readFileSync(join(base, "questions.json"), "utf8")) as BundleQuestionSet[];
const curriculum = JSON.parse(
  readFileSync(join(base, "curriculum.json"), "utf8"),
) as BundleCurriculum;
const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")) as {
  schema: string;
  generatedUtc: string;
  importSource: { repo: string; ref: string };
};

let pkg;
try {
  pkg = buildSmePackage({
    courseSlug: slug,
    curriculum,
    sets,
    generatedUtc: manifest.generatedUtc,
    importRef: manifest.importSource.ref.replace(/^main@/, ""),
  });
} catch (e) {
  if (e instanceof BundleQuestionsError) {
    console.error("SHIM LAW VIOLATION:", e.message);
    process.exit(1);
  }
  throw e;
}

const questions = pkg.questions ?? [];
const specCount = questions.reduce((s, q) => s + (q.specPoints?.length ?? 0), 0);
const primaryCount = questions.reduce(
  (s, q) => s + (q.specPoints?.filter((sp) => sp.role === "PRIMARY").length ?? 0),
  0,
);
const timeSeconds = questions.reduce((s, q) => s + q.expectedTimeSeconds, 0);
console.log(
  `[shim] ${slug}: sets=${sets.length} questions=${questions.length} parts=${pkg.counts?.parts} options=${pkg.counts?.options} specPoints=${specCount} (primary ${primaryCount}) timeSum=${timeSeconds}s`,
);
console.log(`[shim] source=${pkg.source} corpusVersion=${pkg.corpusVersion}`);
console.log(`[shim] ref law: sme-eq-${slug}-<topicSlug>-q<order> (max len ${Math.max(...questions.map((q) => (q.externalRef ?? "").length))})`);

const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };
const zip = (await import("../src/services/sme/bundle-questions")).bundleQuestionsZip(pkg);

if (mode === "dry-run") {
  const uri = process.env.SEED_DATABASE_URL;
  if (!uri) {
    console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
    process.exit(2);
  }
  const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
  const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL (expected — the transaction is discarded)");
  try {
    await sql.begin(async (tx) => {
      const service = new SmeQuestionIngestService(tx as never, clock);
      const summary = await service.ingest(zip);
      console.log("[dry-run] ingest summary (rolled back):", JSON.stringify(summary));
      throw sentinel;
    });
    throw new Error("dry-run sentinel did not fire — transaction committed unexpectedly");
  } catch (e) {
    if (e !== sentinel) {
      console.error("DRY-RUN FAILED (rolled back):", e instanceof Error ? e.message : e);
      await sql.end();
      process.exit(1);
    }
  }
  await sql.end();
  console.log("[dry-run] GREEN — the exact statement sequence executed and rolled back");
} else {
  const uri = process.env.SEED_DATABASE_URL;
  if (!uri) {
    console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
    process.exit(2);
  }
  const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
  try {
    const summary = await sql.begin(async (tx) => {
      const service = new SmeQuestionIngestService(tx as never, clock);
      return service.ingest(zip);
    });
    console.log("[apply] ingest summary:", JSON.stringify(summary));
  } finally {
    await sql.end();
  }
}
