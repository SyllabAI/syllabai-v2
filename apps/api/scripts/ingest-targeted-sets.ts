/**
 * T-SM-EDX-INGEST-R1 lane tooling — ingest-targeted-sets.ts
 *
 * The SLICE-SCOPED completion ingest: applies ONLY the sets named in a
 * filter file (one set slug per line). Composition identical to
 * ingest-bundle-chunked.ts (frozen shim buildSmePackage + frozen
 * SmeQuestionIngestService ADR-026 evidence-safe replace, one SET-CHUNK per
 * transaction, image-normalization law, honest empty-package skip); the ONLY
 * delta is the set filter — the ADR-026 replace is slice-scoped by law
 * ("deactivation of exactly the re-emitted refs + fresh insert; idempotent"),
 * so a filtered slice is law-conformant: the slices it re-emits are exactly
 * its own sets' ref spaces.
 *
 * Usage:
 *   bun apps/api/scripts/ingest-targeted-sets.ts <slug> <setsFile> --apply [questionsPerChunk=120]
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import type { BundleCurriculum, BundleQuestionSet } from "../src/services/curriculum/bundle-seed";
import {
  buildSmePackage,
  bundleQuestionsZip,
  type BundleQuestionSet as ShimSet,
} from "../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../src/services/sme/index";
import type { SubmitClock } from "../src/services/selfmark";
import { flattenTxForFrozenServices } from "./cie-phase4-apply";

const slug = process.argv[2];
const setsFile = process.argv[3];
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
const perChunk = Number(process.argv[5] ?? process.argv[4] ?? "") || 120;
if (!slug || !setsFile || !mode) {
  console.error("usage: bun ingest-targeted-sets.ts <slug> <setsFile> (--apply | --dry-run) [questionsPerChunk=120]");
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
  generatedUtc: string;
  importSource: { repo: string; ref: string };
};
const allSets = JSON.parse(readFileSync(join(base, "questions.json"), "utf8")) as unknown as ShimSet[];
const filter = new Set(
  readFileSync(setsFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean),
);
const sets = allSets.filter((s) => filter.has(String(s.slug ?? "")));
console.log(`[targeted] ${slug}: filter=${filter.size} matched=${sets.length}`);
if (sets.length === 0) {
  console.error("[targeted] no sets matched the filter — nothing to do");
  process.exit(2);
}
const source = { slug, importRepo: manifest.importSource.repo, importRef: manifest.importSource.ref.replace(/^main@/, ""), schema: manifest.schema };

const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };

// ── the ingest-time image normalization (the DB-bound copy only) ──
const IMG_MD = /!\[[\s\S]*?\]\(assets\/([^)\s]+)\)/g;
function describeAsset(name: string): string {
  const words = name
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/^\d{3,4}-/, "")
    .split("-")
    .filter(Boolean)
    .join(" ");
  return "[image: " + words + "]";
}
function normalizeMd(value: unknown): unknown {
  if (typeof value === "string") return value.replace(IMG_MD, (_m, name: string) => describeAsset(name));
  return value;
}
function normalizeSets(setsIn: ShimSet[]): ShimSet[] {
  return JSON.parse(JSON.stringify(setsIn), (k, v) =>
    /Md$/.test(k) || k === "stem" || k === "solution" ? normalizeMd(v) : v,
  ) as ShimSet[];
}

const emptySets = sets.filter((s) => (s.questions ?? []).length === 0).length;
const ingestable = sets.filter((s) => (s.questions ?? []).length > 0);
if (emptySets > 0) console.log(`[targeted] ${slug}: ${emptySets} empty set(s) skipped (honest-empty)`);
const chunks: ShimSet[][] = [];
let cur: ShimSet[] = [];
let curQ = 0;
for (const s of ingestable) {
  const n = (s.questions ?? []).length;
  if (cur.length > 0 && curQ + n > perChunk) {
    chunks.push(cur);
    cur = [];
    curQ = 0;
  }
  cur.push(s);
  curQ += n;
}
if (cur.length > 0) chunks.push(cur);
console.log(`[targeted] ${slug}: ${sets.length} sets -> ${chunks.length} chunks (<=${perChunk} questions each)`);

const stateDir = process.env.CHUNK_STATE_DIR ?? "/tmp/ingest-chunks";
mkdirSync(stateDir, { recursive: true });
const stateFile = join(stateDir, `ingest-${slug}-targeted.txt`);
const done = new Set<string>(existsSync(stateFile) ? readFileSync(stateFile, "utf8").split("\n").filter(Boolean) : []);
const appliedHere = new Set<string>();
const budgetMs = Number(process.env.CHUNK_BUDGET_MS ?? "0");
const tStart = Date.now();

const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
try {
  for (let i = 0; i < chunks.length; i++) {
    const label = `chunk-${i + 1}`;
    if (done.has(label) || appliedHere.has(label)) {
      console.log(`[targeted] ${label}: already applied (state) — skipped`);
      continue;
    }
    if (budgetMs > 0 && Date.now() - tStart > budgetMs) {
      console.log(`[targeted] ${slug}: budget exhausted — resuming on the next invocation`);
      break;
    }
    const t0 = Date.now();
    let pkg;
    try {
      pkg = buildSmePackage({
        courseSlug: slug,
        curriculum: bundle,
        sets: normalizeSets(chunks[i]),
        generatedUtc: manifest.generatedUtc,
        importRef: manifest.importSource.ref.replace(/^main@/, ""),
      });
    } catch (e) {
      console.error(`[targeted] chunk ${i + 1}: SHIM LAW VIOLATION:`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
    const zip = bundleQuestionsZip(pkg);
    const nq = pkg.questions?.length ?? 0;
    if (nq === 0) {
      appendFileSync(stateFile, label + "\n");
      appliedHere.add(label);
      console.log(`[targeted] ${label}/${chunks.length} SKIPPED (no bank-bearing questions in the chunk)`);
      continue;
    }
    if (mode === "dry-run") {
      const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL");
      try {
        await sql.begin(async (tx) => {
          const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
          const summary = await service.ingest(zip);
          console.log(`[targeted] ${label}/${chunks.length} dry-run (rolled back): questions=${nq} summary=${JSON.stringify(summary)}`);
          throw sentinel;
        });
        throw new Error("dry-run sentinel did not fire");
      } catch (e) {
        if (e !== sentinel) throw e;
      }
    } else {
      const summary = await sql.begin(async (tx) => {
        const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
        return service.ingest(zip);
      });
      appendFileSync(stateFile, label + "\n");
      appliedHere.add(label);
      console.log(`[targeted] ${label}/${chunks.length} APPLIED: questions=${nq} in ${Date.now() - t0}ms summary=${JSON.stringify(summary)}`);
    }
  }
  const allDone = chunks.every((_, k) => done.has(`chunk-${k + 1}`) || appliedHere.has(`chunk-${k + 1}`));
  console.log(allDone ? `[targeted] ${slug}: ALL CHUNKS APPLIED` : `[targeted] ${slug}: PARTIAL — resuming`);
} finally {
  await sql.end();
}
