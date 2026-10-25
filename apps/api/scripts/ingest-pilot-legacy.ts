/**
 * T-SM-EDX-INGEST-R1 lane tooling — ingest-pilot-legacy.ts
 *
 * The PILOT (igcse-chemistry-19) ghost-repair ingest under the LEGACY ref law.
 *
 * The hub's pilot join (apps/hub/src/app/api/core/questions/route.ts) branches
 * per course: the pilot's stored core refs keep the LEGACY law
 * `sme-eq-<topicSlug>-q<N>` byte-identical (its original ingest pre-dates the
 * tier-scoped smeQuestionRef law); every other course derives refs through the
 * shared law. The NEON-DB-LOSS r017 restore wiped the pilot's question rows —
 * this tool re-ingests the CURRENT pilot bundle emitting the LEGACY refs the
 * hub joins, so the pilot surface lights again.
 *
 * Composition law (mirrors ingest-bundle-chunked.ts exactly):
 *   - the frozen shim (buildSmePackage) and the frozen service
 *     (SmeQuestionIngestService, ADR-026 evidence-safe replace) are UNCHANGED;
 *   - each SET-CHUNK is one transaction (slice-scoped replace; idempotent);
 *   - the DB-bound package normalizes image markdown to bracketed
 *     descriptions (packages ship no assets — question_asset wholesale
 *     replacement would wipe the serving pilot assets);
 *   - the ONLY delta: each package question's externalRef is REWRITTEN from
 *     the tier-scoped shape to the legacy shape BEFORE the zip. The rewrite
 *     is positionally anchored: the script re-derives the shim's inclusion
 *     law (anchor part / part-sum / dup-order) and its tier-scoped ref per
 *     included question, asserts BYTE-EQUALITY with the package's own ref,
 *     then substitutes `sme-eq-<topicSlug>-q<order>`. Any drift fails loud
 *     before a single row is written.
 *
 * Usage:
 *   bun apps/api/scripts/ingest-pilot-legacy.ts --dry-run
 *   bun apps/api/scripts/ingest-pilot-legacy.ts --apply [questionsPerChunk=120]
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import { smeQuestionRef, smeMemberSuffixReserve } from "../../../packages/shared/src/smeRef";
import type { BundleCurriculum, BundleQuestionSet } from "../src/services/curriculum/bundle-seed";
import {
  buildSmePackage,
  bundleQuestionsZip,
  type BundleQuestionSet as ShimSet,
} from "../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../src/services/sme/index";
import type { SubmitClock } from "../src/services/selfmark";
import { flattenTxForFrozenServices } from "./cie-phase4-apply";

const slug = "igcse-chemistry-19";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null;
const perChunk = Number(process.argv[3] ?? process.argv[2] ?? "") || 120;
if (!mode) {
  console.error("usage: bun ingest-pilot-legacy.ts (--apply | --dry-run) [questionsPerChunk=120]");
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
const questionsDoc = JSON.parse(readFileSync(join(base, "questions.json"), "utf8")) as BundleQuestionSet[];
const sets = questionsDoc as unknown as ShimSet[];

// ── the mirror of the shim's inclusion law (anchor / part-sum / dup-order) ──
type Included = { topicSlug: string; order: number; tierScoped: string; legacy: string };
const included: Included[] = [];
let mirrorUnmapped = 0, mirrorBadSum = 0, mirrorDup = 0;
for (const s of sets) {
  if (!s.topicSlug || String(s.topicSlug).trim() === "") continue;
  const seenOrders = new Set<number>();
  for (const q of s.questions ?? []) {
    const parts = (q.parts ?? []) as Array<{ specPointCodes?: string[]; marks: number; choices?: unknown[] | null }>;
    if (!parts.some((p) => (p.specPointCodes ?? []).length > 0)) { mirrorUnmapped++; continue; }
    const sum = parts.reduce((a, p) => a + (p.marks ?? 0), 0);
    if (sum !== q.totalMarks) { mirrorBadSum++; continue; }
    if (seenOrders.has(q.order)) { mirrorDup++; continue; }
    seenOrders.add(q.order);
    const reserve = smeMemberSuffixReserve(q.parts);
    const tierScoped = smeQuestionRef(slug, s.topicSlug, q.order, reserve);
    const legacy = `sme-eq-${s.topicSlug}-q${q.order}`;
    if (legacy.length > 80) throw new Error(`legacy ref exceeds 80: ${legacy}`);
    included.push({ topicSlug: s.topicSlug, order: q.order, tierScoped, legacy });
  }
}
console.log(`[pilot-legacy] mirror: ${included.length} included (unmapped=${mirrorUnmapped} badSum=${mirrorBadSum} dup=${mirrorDup})`);

// ── the ingest-time image normalization (the DB-bound copy only) — the SAME
// law as ingest-bundle-chunked.ts: packages ship no assets ──
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

// ── chunking by set question counts (a set never splits) ──
const emptySets = sets.filter((s) => (s.questions ?? []).length === 0).length;
const ingestable = sets.filter((s) => (s.questions ?? []).length > 0);
if (emptySets > 0) console.log(`[pilot-legacy] ${slug}: ${emptySets} empty set(s) skipped (honest-empty)`);
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
console.log(`[pilot-legacy] ${slug}: ${sets.length} sets -> ${chunks.length} chunks (<=${perChunk} questions each)`);

// ── resumability (state file shared with the lane namespace; no prior file
// exists for the pilot — the tier-scoped tool never ran on it) ──
const stateDir = process.env.CHUNK_STATE_DIR ?? "/tmp/ingest-chunks";
mkdirSync(stateDir, { recursive: true });
const stateFile = join(stateDir, `ingest-${slug}.txt`);
const done = new Set<string>(existsSync(stateFile) ? readFileSync(stateFile, "utf8").split("\n").filter(Boolean) : []);
const appliedHere = new Set<string>();
const budgetMs = Number(process.env.CHUNK_BUDGET_MS ?? "0");
const tStart = Date.now();
const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };

const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
try {
  for (let i = 0; i < chunks.length; i++) {
    const label = `chunk-${i + 1}`;
    if (done.has(label) || appliedHere.has(label)) {
      console.log(`[pilot-legacy] ${label}: already applied (state) — skipped`);
      continue;
    }
    if (budgetMs > 0 && Date.now() - tStart > budgetMs) {
      console.log(`[pilot-legacy] ${slug}: budget exhausted — resuming on the next invocation`);
      break;
    }
    const t0 = Date.now();
    const chunkIncluded = included.filter((x) => chunks[i].some((s) => s.topicSlug === x.topicSlug && (s.questions ?? []).some((q) => q.order === x.order)));
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
      console.error(`[pilot-legacy] chunk ${i + 1}: SHIM LAW VIOLATION:`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
    if ((pkg.questions?.length ?? 0) === 0) {
      // every question excluded by the shim's laws inside this chunk — the
      // honest-skip class (record + continue), same as the tier-scoped tool
      appendFileSync(stateFile, label + "\n");
      appliedHere.add(label);
      console.log(`[pilot-legacy] ${label}/${chunks.length} SKIPPED (no bank-bearing questions in the chunk)`);
      continue;
    }
    // the positional anchor: re-derive the shim's tier-scoped ref per package
    // question in ORDER and assert byte-equality, then rewrite to LEGACY
    if (pkg.questions.length !== chunkIncluded.length) {
      console.error(`[pilot-legacy] chunk ${i + 1}: MIRROR DRIFT — package has ${pkg.questions.length} questions, mirror has ${chunkIncluded.length}`);
      process.exit(1);
    }
    for (let k = 0; k < pkg.questions.length; k++) {
      const mine = chunkIncluded[k];
      const pkgRef = pkg.questions[k]!.externalRef as string;
      if (pkgRef !== mine.tierScoped) {
        console.error(`[pilot-legacy] chunk ${i + 1} q${k}: REF DRIFT\n  pkg:  ${pkgRef}\n  mine: ${mine.tierScoped}`);
        process.exit(1);
      }
      pkg.questions[k]!.externalRef = mine.legacy;
    }
    const zip = bundleQuestionsZip(pkg);
    const nq = pkg.questions.length;
    if (mode === "dry-run") {
      const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL");
      try {
        await sql.begin(async (tx) => {
          const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
          const summary = await service.ingest(zip);
          console.log(`[pilot-legacy] ${label}/${chunks.length} dry-run (rolled back): questions=${nq} summary=${JSON.stringify(summary)}`);
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
      console.log(`[pilot-legacy] ${label}/${chunks.length} APPLIED: questions=${nq} in ${Date.now() - t0}ms summary=${JSON.stringify(summary)}`);
    }
  }
  const allDone = chunks.every((_, k) => done.has(`chunk-${k + 1}`) || appliedHere.has(`chunk-${k + 1}`));
  console.log(allDone
    ? `[pilot-legacy] ${slug}: ALL CHUNKS ${mode === "dry-run" ? "PROVEN (rolled back)" : "APPLIED"}`
    : `[pilot-legacy] ${slug}: PARTIAL — resuming on the next invocation`);
} finally {
  await sql.end();
}
