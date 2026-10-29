/**
 * T-SM-EDX-INGEST slice-resume runner (sandbox-cap adaptation, DISCLOSED
 * DEVIATION from apps/api/scripts/ingest-bundle-questions.ts).
 *
 * The of-record runner wraps the WHOLE course ingest in ONE transaction.
 * This sandbox executes agent tool calls under a hard ~10-minute wall and
 * reaps all background children between calls, so a 324-489 question course
 * (thousands of Neon roundtrips) can never complete inside one call.
 *
 * This runner preserves every frozen law EXCEPT the atomicity envelope:
 *   - same shim (buildSmePackage) on the FULL curriculum + ONE set per slice;
 *   - same frozen SmeQuestionIngestService via the same flattenTx seam;
 *   - ADR-026's replace stays slice-scoped by construction (deactivation of
 *     exactly the re-emitted refs = exactly this slice's refs);
 *   - idempotent per slice; resume ledger survives tool-call boundaries;
 *   - end-state equivalence is verified by census after the last slice.
 *
 *   bun apps/api/scripts/slice-ingest-bundle-questions.ts <slug> --dry-run-one
 *   bun apps/api/scripts/slice-ingest-bundle-questions.ts <slug> --apply --max-ms 480000
 *
 * SEED_DATABASE_URL inline-only, never printed. Ledger under
 * /home/z/my-project/scripts/recon/ (outside the repo).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
import { flattenTxForFrozenServices } from "./cie-phase4-apply";

const slug = process.argv[2];
const mode = process.argv.includes("--dry-run-one")
  ? "dry-run-one"
  : process.argv.includes("--apply")
    ? "apply"
    : null;
const maxMs = Number(process.argv[process.argv.indexOf("--max-ms") + 1] ?? 480000) || 480000;
if (!slug || !mode) {
  console.error("usage: slice-ingest-bundle-questions.ts <slug> (--dry-run-one | --apply [--max-ms N])");
  process.exit(2);
}

const LEDGER_DIR = "/home/z/my-project/scripts/recon";
const LEDGER = join(LEDGER_DIR, `slice-ledger-${slug}-${mode}.json`);

const base = join(import.meta.dir, "../../../apps/hub/content", slug);
const allSets = JSON.parse(readFileSync(join(base, "questions.json"), "utf8")) as BundleQuestionSet[];
const curriculum = JSON.parse(readFileSync(join(base, "curriculum.json"), "utf8")) as BundleCurriculum;
const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")) as {
  schema: string;
  generatedUtc: string;
  importSource: { repo: string; ref: string };
};

const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };
const bundleQuestionsZip = (await import("../src/services/sme/bundle-questions")).bundleQuestionsZip;

function buildSlice(sets: BundleQuestionSet[]) {
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
  return pkg;
}

type Ledger = { slug: string; mode: string; totalSets: number; completed: Record<string, unknown> };
let ledger: Ledger = { slug, mode, totalSets: allSets.length, completed: {} };
if (existsSync(LEDGER)) ledger = JSON.parse(readFileSync(LEDGER, "utf8"));

const t0 = Date.now();
const uri = process.env.SEED_DATABASE_URL;
if (!uri) {
  console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
  process.exit(2);
}
const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });

if (mode === "dry-run-one") {
  const set = allSets[0];
  const pkg = buildSlice([set]);
  const zip = bundleQuestionsZip(pkg);
  const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL (expected — the transaction is discarded)");
  try {
    await sql.begin(async (tx) => {
      const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
      const summary = await service.ingest(zip);
      console.log(`[dry-run-one] set=${set.slug} summary:`, JSON.stringify(summary));
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
  console.log(`[dry-run-one] GREEN for set 1/${allSets.length} — statements prove against the live schema`);
  process.exit(0);
}

// apply mode: loop sets, one tx per set, resume-safe
let done = 0, skipped = 0;
for (const set of allSets) {
  if (ledger.completed[set.slug] != null) { skipped++; continue; }
  const elapsed = Date.now() - t0;
  if (elapsed > maxMs) {
    console.log(`[apply] time-guard: ${elapsed}ms elapsed — exiting cleanly, resume with the same command`);
    console.log(`[apply] progress: ${Object.keys(ledger.completed).length}/${allSets.length} sets committed`);
    await sql.end();
    process.exit(0);
  }
  const pkg = buildSlice([set]);
  const zip = bundleQuestionsZip(pkg);
  const s0 = Date.now();
  try {
    const summary = await sql.begin(async (tx) => {
      const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
      return service.ingest(zip);
    });
    ledger.completed[set.slug] = { at: new Date().toISOString(), ms: Date.now() - s0, summary };
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
    done++;
    console.log(`[apply] set=${set.slug} OK (${ledger.completed[set.slug].ms}ms) — ${Object.keys(ledger.completed).length}/${allSets.length}`);
  } catch (e) {
    console.error(`[apply] set=${set.slug} FAILED (rolled back):`, e instanceof Error ? e.message : e);
    await sql.end();
    process.exit(1);
  }
}
await sql.end();
console.log(`[apply] COMPLETE for ${slug}: ${done} slices this run, ${skipped} skipped (already done), ${Object.keys(ledger.completed).length}/${allSets.length} total`);
