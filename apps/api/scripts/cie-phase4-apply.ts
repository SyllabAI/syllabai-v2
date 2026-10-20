/**
 * CIE-INTEGRATION phase 4 — the per-slug DB-plane fleet runner (the of-record
 * reproducible apply path for the 45 "Cambridge International" registry rows:
 * 40 real banks + 4 honest-empty stubs + 1 catalog skeleton).
 *
 * Mandate of record:
 *   - scope receipt CIE-INTEGRATION/cie-frontend-integration-scope-r0.json,
 *     executionPlan phase "4 — DB plane (operator-gated)": "Per CIE spec:
 *     seed-bundle-curriculum; per slug: ingest-bundle-questions dry-run
 *     (rollback proof) -> COW-proof -> prod apply under the ADR-026
 *     evidence-safe replace; 40 real banks become SME-ingestable".
 *   - T-MIG-138 run-003 receipt (alternatives_disclosed_not_fired): "CIE
 *     phase-4 DB plane (40 banks) — no phase-4 machinery exists of record
 *     (no per-slug seed/ingest workflow; no phase-4 receipts); build = the
 *     next lane act on operator re-key".
 *   - Operator re-key (trace 1a15a0a3e414f9d5): "build the phase-4 plane".
 *
 * This runner is a THIN ORCHESTRATOR over the frozen instruments of record —
 * zero service edits, zero schema edits, zero LLM spend:
 *   - the curriculum seed: services/curriculum/bundle-seed.ts
 *     (seedBundleCurriculum, the T-MIG-134a frozen concept-seed law; the
 *     createSql adapter's begin/commit/rollback seam; re-run on a seeded
 *     store is the structural no-op of record — nodes reused by the stable
 *     (order, code) insert sequence);
 *   - the questions ingest: services/sme/bundle-questions.ts (the 1.1 -> 1.0
 *     versioned shim) driving the REAL SmeQuestionIngestService.ingest
 *     (ADR-026 evidence-safe replace: slice-scoped deactivation of exactly
 *     the re-emitted refs + fresh insert; idempotent).
 *
 * Modes:
 *   bun apps/api/scripts/cie-phase4-apply.ts --census [--slugs all|a,b,c] [--receipt p.json]
 *       — ZERO-DB offline census: registry-driven roster resolution +
 *         classification + expected fleet counts; the sandbox/CI proof that
 *         the plane's inputs are coherent. No SEED_DATABASE_URL needed.
 *   bun apps/api/scripts/cie-phase4-apply.ts --mode dry [--slugs …] [--receipt p.json]
 *       — per slug, the EXACT statement sequence (seed + shim + ingest) inside
 *         one transaction rolled back at the end (the 134c/135c dry-run
 *         sentinel pattern): full statement proof against the target schema,
 *         ZERO persistence. Requires SEED_DATABASE_URL.
 *   bun apps/api/scripts/cie-phase4-apply.ts --mode apply [--slugs …] [--receipt p.json]
 *       — the real per-slug apply: seed transaction, then ingest transaction,
 *         then postverify counts; per-slug isolation (a slug failure is
 *         recorded honestly and the fleet continues; the run exits 1 iff any
 *         slug failed). Idempotent by the seed's structural no-op + the
 *         ADR-026 replace. Requires SEED_DATABASE_URL.
 *
 * Roster law (never invented): the registry apps/hub/content/courses.json is
 * the sole roster source — rows with board "Cambridge International" in
 * registry order. Classification is per-bundle content, fail-closed:
 *   real     — questions.json carries >= 1 set                     -> seed + ingest
 *   stub     — official-spine curriculum present, 0 question sets  -> seed only (EQ honest-empty)
 *   skeleton — 0 curriculum nodes AND 0 question sets (the catalog
 *              honest-empty form; no SUBJECT root exists so the seed's own
 *              law would refuse)                                  -> skipped honestly
 *
 * Credential law: SEED_DATABASE_URL env, inline-only (never printed, never
 * persisted); the receipt output is scrub-asserted. The workflow gate
 * (.github/workflows/cie-phase4-db-plane.yml, the 134c COW-proof protocol)
 * is the only sanctioned prod path — the sandbox stays DRY of Neon.
 *
 * Determinism law: slugs are processed in registry order; the 9709/0973/0653
 * shared-code spaces (5/3/3 component banks) are seeded into ONE subject tree
 * by the seed's resolve-or-create — order-stable by the frozen (order, code)
 * insert sequence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

import {
  seedBundleCurriculum,
  type BundleCurriculum,
  type BundleSeedSummary,
} from "../src/services/curriculum/bundle-seed";
import type { SqlFn } from "../src/services/curriculum/sql";
import {
  buildSmePackage,
  BundleQuestionsError,
  type BundleQuestionSet,
} from "../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../src/services/sme/index";
import type { SubmitClock } from "../src/services/selfmark";

export const CIE_BOARD = "Cambridge International";

const HUB_CONTENT = join(import.meta.dir, "../../../apps/hub/content");
const SCRUB_PATTERNS = ["postgres://", "postgresql://", "neon.tech", "napi_", "ghp_", "vcp_"];

export type SlugClass = "real" | "stub" | "skeleton";

export interface RosterEntry {
  slug: string;
  board: string;
  level: string;
  subject: string;
  code: string; // the syllabus code (bundle.code == registry code, verified)
  syllabusVersion: string;
  cls: SlugClass;
  questionSets: number;
  expectedQuestions: number;
  expectedParts: number;
  nodes: number;
}

export interface Roster {
  entries: RosterEntry[];
  cieRows: number;
  real: number;
  stubs: number;
  skeletons: number;
}

interface RegistryRow {
  slug: string;
  board?: string;
  level?: string;
  subject?: string;
  code?: string;
  status?: string;
}

/** Pure roster resolution + classification (zero DB, fail-closed). */
export function loadRoster(base: string = HUB_CONTENT): Roster {
  const registry = JSON.parse(
    readFileSync(join(base, "courses.json"), "utf8"),
  ) as { courses?: RegistryRow[] } | RegistryRow[];
  const rows: RegistryRow[] = Array.isArray(registry) ? registry : (registry.courses ?? []);
  const cie = rows.filter((r) => r.board === CIE_BOARD);
  if (cie.length === 0) {
    throw new Error("roster law violation: zero " + CIE_BOARD + " rows in the registry");
  }

  const entries: RosterEntry[] = [];
  for (const row of cie) {
    const slug = row.slug;
    if (!slug || /[A-Z]/.test(slug)) {
      throw new Error("roster law violation: registry slug is missing or non-canonical: " + String(slug));
    }
    const dir = join(base, slug);
    const curriculum = JSON.parse(
      readFileSync(join(dir, "curriculum.json"), "utf8"),
    ) as BundleCurriculum;
    if (curriculum.code !== row.code) {
      throw new Error(
        "roster law violation: registry code " + String(row.code) + " != bundle code " + String(curriculum.code) + " for " + slug,
      );
    }
    if (!curriculum.code || !curriculum.syllabusVersion) {
      throw new Error("roster law violation: bundle missing code/syllabusVersion for " + slug);
    }
    // the seed's own SUBJECT-root gate, pre-flighted offline (mapBundleNodes
    // fail-closes on mapped.get(slug) == null)
    const subjectRoot = curriculum.nodes.find((n) => n.family === "SUBJECT" && n.code === slug);
    let questionSets = 0;
    let expectedQuestions = 0;
    let expectedParts = 0;
    try {
      const sets = JSON.parse(
        readFileSync(join(dir, "questions.json"), "utf8"),
      ) as BundleQuestionSet[];
      questionSets = Array.isArray(sets) ? sets.length : 0;
      for (const set of Array.isArray(sets) ? sets : []) {
        for (const q of set.questions ?? []) {
          expectedQuestions += 1;
          expectedParts += q.parts?.length ?? 0;
        }
      }
    } catch {
      // no questions.json = zero sets (the honest-empty form)
    }
    const nodes = curriculum.nodes.length;
    if (nodes === 0 && questionSets === 0) {
      if (subjectRoot) {
        throw new Error("roster law violation: skeleton classification but SUBJECT root present for " + slug);
      }
      entries.push({
        slug, board: CIE_BOARD, level: row.level ?? curriculum.level ?? "",
        subject: row.subject ?? curriculum.subject ?? "", code: curriculum.code,
        syllabusVersion: curriculum.syllabusVersion, cls: "skeleton",
        questionSets, expectedQuestions, expectedParts, nodes,
      });
      continue;
    }
    if (!subjectRoot) {
      throw new Error(
        "roster law violation: no SUBJECT root under the slug in curriculum.json for " + slug + " (the seed would refuse)",
      );
    }
    const cls: SlugClass = questionSets > 0 ? "real" : "stub";
    entries.push({
      slug, board: CIE_BOARD, level: row.level ?? curriculum.level ?? "",
      subject: row.subject ?? curriculum.subject ?? "", code: curriculum.code,
      syllabusVersion: curriculum.syllabusVersion, cls,
      questionSets, expectedQuestions, expectedParts, nodes,
    });
  }

  return {
    entries,
    cieRows: entries.length,
    real: entries.filter((e) => e.cls === "real").length,
    stubs: entries.filter((e) => e.cls === "stub").length,
    skeletons: entries.filter((e) => e.cls === "skeleton").length,
  };
}

export function resolveSlugFilter(roster: Roster, filter: string | undefined): RosterEntry[] {
  if (!filter || filter === "all") return roster.entries;
  const wanted = new Set(filter.split(",").map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((s) => !roster.entries.some((e) => e.slug === s));
  if (unknown.length > 0) {
    throw new Error("unknown slug(s) not in the " + CIE_BOARD + " roster (never invented): " + unknown.join(", "));
  }
  return roster.entries.filter((e) => wanted.has(e.slug));
}

interface SlugResult {
  slug: string;
  code: string;
  cls: SlugClass;
  ok: boolean;
  skipped?: string;
  seed?: BundleSeedSummary;
  ingest?: { questions: number; parts: number; options: number; deactivated: number; specPointMappings: number; topicMappings: number };
  postverify?: { subjectNodes: number; activeQuestions: number };
  error?: string;
}

function scrubAssert(text: string, what: string): void {
  for (const pat of SCRUB_PATTERNS) {
    if (text.includes(pat)) {
      console.error("SCRUB FAIL in " + what + ": output contains " + pat);
      process.exit(3);
    }
  }
}

async function seedSlug(entry: RosterEntry, sql: postgres.Sql, mode: "dry" | "apply"): Promise<BundleSeedSummary> {
  const dir = join(HUB_CONTENT, entry.slug);
  const bundle = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as BundleCurriculum;
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    schema: string;
    importSource: { repo: string; ref: string };
  };
  const source = {
    slug: entry.slug,
    importRepo: manifest.importSource.repo,
    importRef: manifest.importSource.ref.replace(/^main@/, ""),
    schema: manifest.schema,
  };
  if (mode === "apply") {
    return sql.begin((tx) =>
      // the tx-as-SqlFn seam cast: the frozen drivers pass the postgres.js
      // transaction raw (they sit outside the tsc graph); this script is
      // import-graphed by the roster test, so the seam is cast explicitly
      seedBundleCurriculum({ sql: tx as unknown as SqlFn, clock: { now: () => new Date() } }, bundle, source, null),
    );
  }
  // dry: the exact statement sequence, rolled back at the end (the 134c sentinel)
  const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL (expected — the transaction is discarded)");
  try {
    await sql.begin(async (tx) => {
      await seedBundleCurriculum({ sql: tx as unknown as SqlFn, clock: { now: () => new Date() } }, bundle, source, null);
      throw sentinel;
    });
    throw new Error("dry-run sentinel did not fire — transaction committed unexpectedly");
  } catch (e) {
    if (e !== sentinel) throw e;
  }
  return {
    curriculumVersionId: "(rolled back)", subjectId: "(rolled back)", rootNodeId: "(rolled back)",
    units: -1, topics: -1, specPoints: -1, nodesCreated: -1, nodesReused: -1,
    edgesCreated: -1, edgesReused: -1, applicabilityWrites: -1, alreadyActive: false,
  };
}

async function ingestSlug(entry: RosterEntry, sql: postgres.Sql, mode: "dry" | "apply") {
  const dir = join(HUB_CONTENT, entry.slug);
  const sets = JSON.parse(readFileSync(join(dir, "questions.json"), "utf8")) as BundleQuestionSet[];
  const curriculum = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as BundleCurriculum;
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    generatedUtc: string;
    importSource: { repo: string; ref: string };
  };
  let pkg;
  try {
    pkg = buildSmePackage({
      courseSlug: entry.slug,
      curriculum,
      sets,
      generatedUtc: manifest.generatedUtc,
      importRef: manifest.importSource.ref.replace(/^main@/, ""),
    });
  } catch (e) {
    if (e instanceof BundleQuestionsError) throw new Error("SHIM LAW VIOLATION: " + e.message);
    throw e;
  }
  const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };
  const zip = (await import("../src/services/sme/bundle-questions")).bundleQuestionsZip(pkg);

  const run = (): Promise<{
    questions: number; parts: number; options: number; deactivated: number;
    specPointMappings: number; topicMappings: number;
  }> => {
    const runner = async (db: unknown) => {
      const service = new SmeQuestionIngestService(db as never, clock);
      const summary = await service.ingest(zip);
      return {
        questions: summary.questions, parts: summary.parts, options: summary.options,
        deactivated: summary.deactivated, specPointMappings: summary.specPointMappings,
        topicMappings: summary.topicMappings,
      };
    };
    if (mode === "apply") return sql.begin((tx) => runner(tx));
    // dry: real service, real statements, rolled back (the 135c pattern)
    return (async () => {
      const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL (expected — the transaction is discarded)");
      try {
        let captured!: { questions: number; parts: number; options: number; deactivated: number; specPointMappings: number; topicMappings: number };
        await sql.begin(async (tx) => {
          captured = await runner(tx);
          throw sentinel;
        });
        throw new Error("dry-run sentinel did not fire — transaction committed unexpectedly");
      } catch (e) {
        if (e !== sentinel) throw e;
      }
      return { questions: -1, parts: -1, options: -1, deactivated: -1, specPointMappings: -1, topicMappings: -1 };
    })();
  };
  return run();
}

async function postverifySlug(entry: RosterEntry, sql: postgres.Sql): Promise<{ subjectNodes: number; activeQuestions: number }> {
  const subjectNodes = await sql`
    select count(*)::int as n from knowledge_nodes
    where code = ${entry.code} or code like ${entry.code + "-%"}`;
  const activeQuestions = await sql`
    select count(*)::int as n from questions
    where active = true and external_ref like ${"sme-eq-" + entry.slug + "-%"}`;
  return { subjectNodes: Number(subjectNodes[0]?.n ?? 0), activeQuestions: Number(activeQuestions[0]?.n ?? 0) };
}

export function resolveMode(args: string[]): "apply" | "dry" | null {
  // The CI gate (cie-phase4-db-plane.yml) invokes `--mode apply` / `--mode dry`
  // as TWO argv tokens (shell word-splitting); the equals/joined forms are the
  // sandbox shapes. All five spellings resolve; anything else is null (the
  // usage + exit-2 honest refusal, BEFORE any DB contact).
  const modeFlagIdx = args.indexOf("--mode");
  const modeValue = modeFlagIdx >= 0 ? args[modeFlagIdx + 1] : undefined;
  if (args.includes("--apply") || args.includes("--mode=apply") || args.includes("--mode apply") || modeValue === "apply") {
    return "apply";
  }
  if (args.includes("--mode=dry") || args.includes("--mode dry") || modeValue === "dry") {
    return "dry";
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const census = args.includes("--census");
  const mode = census ? null : resolveMode(args);
  const slugsIdx = args.indexOf("--slugs");
  const slugFilter = slugsIdx >= 0 ? (args[slugsIdx + 1] ?? "all") : "all";
  const receiptIdx = args.indexOf("--receipt");
  const receiptPath = receiptIdx >= 0 ? args[receiptIdx + 1] : undefined;

  if (!census && !mode) {
    console.error("usage: cie-phase4-apply.ts (--census | --mode dry | --mode apply) [--slugs all|a,b,c] [--receipt p.json]");
    process.exit(2);
  }

  const roster = loadRoster();
  const targets = resolveSlugFilter(roster, slugFilter);
  console.log(
    `[roster] CIE rows=${roster.cieRows} (real ${roster.real} / stubs ${roster.stubs} / skeletons ${roster.skeletons}) | selected=${targets.length} | filter=${slugFilter}`,
  );

  const results: SlugResult[] = [];
  let sql: postgres.Sql | null = null;

  if (mode) {
    const uri = process.env.SEED_DATABASE_URL;
    if (!uri) {
      console.error("SEED_DATABASE_URL missing (inline env only — never persisted)");
      process.exit(2);
    }
    sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
  }

  try {
    for (const entry of targets) {
      const result: SlugResult = { slug: entry.slug, code: entry.code, cls: entry.cls, ok: false };
      try {
        if (entry.cls === "skeleton") {
          result.skipped = "honest-empty catalog skeleton (zero nodes, zero question sets) — nothing to seed or ingest";
          result.ok = true;
        } else if (sql) {
          const m: "dry" | "apply" = mode === "apply" ? "apply" : "dry";
          result.seed = await seedSlug(entry, sql, m);
          if (entry.cls === "real") {
            result.ingest = await ingestSlug(entry, sql, m);
            if (mode === "apply" && result.ingest.questions !== entry.expectedQuestions) {
              throw new Error(
                "post-apply count drift: ingested " + result.ingest.questions + " != bundle census " + entry.expectedQuestions,
              );
            }
          } else {
            result.skipped = "EQ honest-empty (stub — zero question sets of record); seed-only per the roster law";
          }
          if (m === "apply") {
            result.postverify = await postverifySlug(entry, sql);
          }
          result.ok = true;
        } else {
          result.skipped = "no database target in census mode";
          result.ok = true;
        }
      } catch (e) {
        result.ok = false;
        result.error = e instanceof Error ? e.message : String(e);
      }
      results.push(result);
      const seedNote = result.seed
        ? " nodes +" + Math.max(result.seed.nodesCreated, 0) + "/=" + Math.max(result.seed.nodesReused, 0)
        : "";
      const ingestNote = result.ingest
        ? " q=" + result.ingest.questions + " parts=" + result.ingest.parts
        : "";
      const postNote = result.postverify ? " | postverify nodes=" + result.postverify.subjectNodes + " activeQ=" + result.postverify.activeQuestions : "";
      console.log(
        "[" + (mode ?? "census") + "] " + entry.slug + " (" + entry.cls + ", " + entry.code + ") ok=" + result.ok
        + seedNote + ingestNote + postNote + (result.skipped ? " | " + result.skipped : "")
        + (result.error ? " | ERROR: " + result.error : ""),
      );
    }
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }

  const appliedReal = results.filter((r) => r.ok && r.cls === "real" && r.ingest).length;
  const appliedStubs = results.filter((r) => r.ok && r.cls === "stub" && r.seed && !r.ingest).length;
  const skippedSkeletons = results.filter((r) => r.ok && r.cls === "skeleton").length;
  const failures = results.filter((r) => !r.ok);
  const questionsIngested = results.reduce((s, r) => s + (r.ingest && r.ingest.questions > 0 ? r.ingest.questions : 0), 0);
  const partsIngested = results.reduce((s, r) => s + (r.ingest && r.ingest.parts > 0 ? r.ingest.parts : 0), 0);
  const optionsIngested = results.reduce((s, r) => s + (r.ingest && r.ingest.options > 0 ? r.ingest.options : 0), 0);

  const receipt = {
    receipt: "CIE-INTEGRATION/cie-phase4-fleet-" + (mode ?? "census") + ".json",
    generatedUtc: new Date().toISOString(),
    mode: mode ?? "census",
    slugFilter,
    roster: { cieRows: roster.cieRows, real: roster.real, stubs: roster.stubs, skeletons: roster.skeletons },
    summary: {
      selected: targets.length,
      realApplied: appliedReal,
      stubsSeeded: appliedStubs,
      skeletonsSkipped: skippedSkeletons,
      failures: failures.length,
      questionsIngested,
      partsIngested,
      optionsIngested,
    },
    expectedOfRecord: { realBanks: 40, questionsFloor: 19000, partsFloor: 25600 },
    failures: failures.map((f) => ({ slug: f.slug, error: f.error })),
    perSlug: results,
  };

  const out = JSON.stringify(receipt, null, 1);
  scrubAssert(out, "fleet receipt");
  if (receiptPath) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(receiptPath, out + "\n", { mode: 0o600 });
  }
  console.log("[fleet] " + JSON.stringify(receipt.summary));
  if (failures.length > 0) {
    console.error("FLEET HONEST RED: " + failures.length + " slug(s) failed: " + failures.map((f) => f.slug).join(", "));
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("FATAL:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
