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
  mapBundleNodes,
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

/**
 * The markdown asset-ref law — the FROZEN ingest's own ASSET_REF
 * (services/sme/index.ts :68) mirrored byte-for-byte: the repair pre-pass and
 * the validator must never disagree about what an asset ref is.
 */
const ASSET_REF: RegExp = /\(assets\/([^)\s]+)\)/g;

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
  // the SERVABLE census (the run-006 re-base): the fleet's floors and drift
  // checks measure the SHIM'S OWN admission output — buildSmePackage is the
  // single admission law (zero-DB, deterministic), so the roster can never
  // diverge from what the ingest will admit, by construction
  expectedQuestions: number;
  expectedParts: number;
  // the RAW bundle census (disclosure of record: the phase-2 anchor gap)
  rawQuestions: number;
  rawParts: number;
  // the shim's own exclusion counters (the honest disclosure class)
  shimExclusions?: { unmapped: number; badSum: number; dupOrder: number };
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
    let rawQuestions = 0;
    let rawParts = 0;
    let shimExclusions: { unmapped: number; badSum: number; dupOrder: number } | undefined;
    try {
      const sets = JSON.parse(
        readFileSync(join(dir, "questions.json"), "utf8"),
      ) as BundleQuestionSet[];
      questionSets = Array.isArray(sets) ? sets.length : 0;
      for (const set of Array.isArray(sets) ? sets : []) {
        for (const q of set.questions ?? []) {
          rawQuestions += 1;
          rawParts += q.parts?.length ?? 0;
        }
      }
      // the servable-truth census (the run-006 class): the tranche-2
      // "anchored" pre-count mirrored only the anchor law and diverged from
      // the ingest by the shim's OTHER honest exclusion classes (badSum,
      // dupOrder — the run-006 COW proof caught 1+1+3+14 of drift on four
      // banks). The census now measures the shim's OWN output:
      // buildSmePackage is the single admission law (zero-DB,
      // deterministic) — the roster can never diverge from what the ingest
      // will admit, by construction.
      if (questionSets > 0) {
        const manifest = JSON.parse(
          readFileSync(join(dir, "manifest.json"), "utf8"),
        ) as { generatedUtc: string; importSource: { repo: string; ref: string } };
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
          if (e instanceof BundleQuestionsError) throw new Error("SHIM LAW VIOLATION (roster): " + e.message);
          throw e;
        }
        if (pkg.counts == null || pkg.questions == null) {
          throw new Error("SHIM LAW VIOLATION (roster): buildSmePackage returned an empty package for " + slug);
        }
        expectedQuestions = pkg.counts.questions ?? 0;
        expectedParts = pkg.counts.parts ?? 0;
        shimExclusions = { unmapped: pkg.counts.unmapped ?? 0, badSum: pkg.counts.badSum ?? 0, dupOrder: pkg.counts.dupOrder ?? 0 };
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("SHIM LAW VIOLATION")) throw e;
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
        questionSets, expectedQuestions, expectedParts, rawQuestions: expectedQuestions, rawParts: expectedParts, nodes,
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
      questionSets, expectedQuestions, expectedParts, rawQuestions, rawParts, shimExclusions, nodes,
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

/**
 * The tx-flatten seam (the run-002 repair program, defect class "tx-seam" —
 * 16 slugs): the frozen ingest service expects a full Sql seam (tagged
 * template + .transaction, services/sme/index.ts :50-52); the fleet runs each
 * slug's leg inside ONE orchestrator-level sql.begin transaction, and a
 * postgres.js transaction object carries no .transaction (no nesting).
 * The shim forwards the tagged template to the slug tx and flattens
 * .transaction(body) to body(shim) — every statement JOINS the slug tx,
 * per-slug isolation is preserved (no nested BEGIN), zero frozen-service
 * edits. Nested .transaction calls flatten recursively to the same tx.
 */
export type FlattenedTxSeam = SqlFn & {
  transaction: <T>(body: (tx: FlattenedTxSeam) => Promise<T>) => Promise<T>;
};

export function flattenTxForFrozenServices(tx: SqlFn): FlattenedTxSeam {
  const shim = ((strings: TemplateStringsArray, ...params: unknown[]) =>
    (tx as unknown as (s: TemplateStringsArray, ...p: unknown[]) => Promise<Array<Record<string, unknown>>>)(
      strings,
      ...params,
    )) as FlattenedTxSeam;
  shim.transaction = <T>(body: (inner: FlattenedTxSeam) => Promise<T>): Promise<T> => body(shim);
  return shim;
}

// ── the bare-asset-ref externalization (the run-002 repair program, asset class) ──
//
// The phase-2 corpus build emitted QUESTION-IMAGE refs in two forms: full
// hotlink URLs (raw.githubusercontent.com/SyllabAI/syllabai-resources@<ref>/
// SME-ExamQuestion/<slug>/.../assets/<file> — the hub's https rendering law)
// and, for a minority (29 refs on 3 slugs — the committed per-slug
// asset-map.json files of record), BARE relative `(assets/<file>)` targets.
// The frozen ingest fail-closes on any bare ref (validate :640-642: the
// package must carry the bytes) and the frozen question_asset store is a
// GLOBAL wholesale-replace table (ADR-026 :325-333) — carrying ~1.9GB of CIE
// images through it would wipe the 4CH1 pilot's assets on the first
// asset-bearing package and blow the store's storage class. The repair: the
// orchestrator completes the corpus's OWN hotlink form for the bare refs
// (the same pinned importSource ref the provenance line carries), so the
// package ships ZERO assets, the frozen validation passes on its own law,
// the serving store is untouched (the layer-3 note of record), and the hub's
// existing https hotlink branch renders every image.

interface AssetMapFile {
  schema: string;
  slug: string;
  importRef: string;
  upstreamRepo: string;
  refs: Record<string, string>;
}

/** Read + law-check the per-slug asset-map of record (null = none committed). */
export function loadAssetMap(dir: string, manifest: { slug: string; importRef: string }): AssetMapFile | null {
  let raw: string;
  try {
    raw = readFileSync(join(dir, "asset-map.json"), "utf8");
  } catch {
    return null; // no map committed — the corpus carries no bare refs
  }
  const map = JSON.parse(raw) as AssetMapFile;
  if (map.schema !== "syllabai-demo.asset-map/1.0") {
    throw new Error("asset-map law violation: unexpected schema " + map.schema + " for " + manifest.slug);
  }
  if (map.slug !== manifest.slug) {
    throw new Error("asset-map law violation: map slug " + map.slug + " != bundle slug " + manifest.slug);
  }
  if (map.importRef !== manifest.importRef) {
    throw new Error(
      "asset-map law violation: map importRef " + map.importRef + " != manifest pin " + manifest.importRef +
        " for " + manifest.slug,
    );
  }
  if (map.upstreamRepo !== "SyllabAI/syllabai-resources") {
    throw new Error("asset-map law violation: unexpected upstream repo " + map.upstreamRepo);
  }
  return map;
}

/** Deep in-place rewrite of the bundle sets' markdown strings (freshly
 *  JSON.parse'd per slug — the input is owned by this call). Fail-closed:
 *  a bare ref absent from the map throws BEFORE any DB contact. */
export function externalizeBareAssetRefs(value: unknown, map: AssetMapFile): void {
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (typeof v === "string") {
        value[i] = rewriteMd(v, map, JSON.stringify(v).slice(0, 80));
      } else if (v != null && typeof v === "object") {
        externalizeBareAssetRefs(v, map);
      }
    }
    return;
  }
  if (value != null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      const v = record[k];
      if (typeof v === "string") {
        record[k] = rewriteMd(v, map, JSON.stringify(k));
      } else if (v != null && typeof v === "object") {
        externalizeBareAssetRefs(v, map);
      }
    }
  }
}

function rewriteMd(md: string, map: AssetMapFile, label: string): string {
  if (!md.includes("(assets/")) return md;
  return md.replace(ASSET_REF, (whole, name: string) => {
    const upstream = map.refs[name];
    if (upstream == null) {
      throw new Error(
        "asset-map law violation: bare asset ref not in the map of record: " + name + " (context " + label + ")",
      );
    }
    return "(https://raw.githubusercontent.com/" + map.upstreamRepo + "/" + map.importRef + "/" + upstream + ")";
  });
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
    // the bare-ref externalization pre-pass (the run-002 asset class): the
    // manifest pins the map's own ref — the loader law-checks it fail-closed
    const assetMap = loadAssetMap(dir, {
      slug: entry.slug,
      importRef: manifest.importSource.ref.replace(/^main@/, ""),
    });
    if (assetMap != null) externalizeBareAssetRefs(sets, assetMap);
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
      // the tx-flatten seam: the frozen service gets a full Sql seam whose
      // .transaction flattens onto this slug's tx (per-slug isolation kept)
      const service = new SmeQuestionIngestService(flattenTxForFrozenServices(db as SqlFn) as never, clock);
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

// ── the map-law census (the optionA identity laws — operator ruling A, trace
//    1a15b161bf960249; the hold receipt's point 5) ─────────────────────────
//
// Zero-DB offline proof that the fleet's mapBundleNodes output is
// identity-clean BEFORE any COW is created — the floors of record cannot
// catch the identity defect class (the reuse law defines cross-bank dbCode
// collisions as correct; the floors count rows, not identities), so the
// census is the gate that does:
//   (a) no intra-bundle dbCode collisions (two bundle codes -> one dbCode);
//   (b) any cross-bundle shared dbCode carries ONE node_type and ONE title
//       everywhere it appears (the offline form of the seed's title-drift
//       refusal — the 9709 graft class is a RED here);
//   (c) the varchar(40) store law (knowledge_nodes.code);
//   and reports the family facts of record: the shared subject roots (the
//   same-version component families joining per the build receipt's join
//   matrix) and any shared UNITs (legitimate only where the official
//   sections genuinely coincide — e.g. the 0460 pair, two banks of the same
//   2025-2026 generation).

export interface MapLawCensusShared {
  dbCode: string;
  nodeType: string;
  title: string;
  slugs: string[];
}

export interface MapLawCensus {
  green: boolean;
  bundlesMapped: number;
  nodesMapped: number;
  maxDbCodeLength: number;
  storeLawLimit: number;
  sharedCodes: MapLawCensusShared[];
  sharedSubjectRoots: string[];
  reds: string[];
}

export function mapLawCensus(roster: Roster, base: string = HUB_CONTENT): MapLawCensus {
  const byDbCode = new Map<string, { nodeType: string; title: string; slugs: string[] }>();
  const reds: string[] = [];
  let bundlesMapped = 0;
  let nodesMapped = 0;
  let maxDbCodeLength = 0;
  for (const entry of roster.entries) {
    if (entry.cls === "skeleton") continue;
    const bundle = JSON.parse(
      readFileSync(join(base, entry.slug, "curriculum.json"), "utf8"),
    ) as BundleCurriculum;
    const mapped = mapBundleNodes(bundle, entry.code + " official specification structure");
    bundlesMapped += 1;
    const intra = new Map<string, number>();
    for (const m of mapped.values()) {
      nodesMapped += 1;
      intra.set(m.dbCode, (intra.get(m.dbCode) ?? 0) + 1);
      if (m.dbCode.length > maxDbCodeLength) maxDbCodeLength = m.dbCode.length;
      const seen = byDbCode.get(m.dbCode);
      if (seen == null) {
        byDbCode.set(m.dbCode, { nodeType: m.nodeType, title: m.title, slugs: [entry.slug] });
      } else if (!seen.slugs.includes(entry.slug)) {
        if (seen.nodeType !== m.nodeType) {
          reds.push(
            entry.slug + ": dbCode " + m.dbCode + " lands node_type " + m.nodeType +
              " but " + seen.slugs[0] + " landed " + seen.nodeType,
          );
        } else if (seen.title !== m.title) {
          reds.push(
            entry.slug + ": dbCode " + m.dbCode + " maps title '" + m.title +
              "' but " + seen.slugs[0] + " mapped '" + seen.title + "' (cross-bank tree drift)",
          );
        } else {
          seen.slugs.push(entry.slug);
        }
      }
    }
    for (const [dbCode, n] of intra) {
      if (n > 1) reds.push(entry.slug + ": intra-bundle dbCode collision " + dbCode + " x" + n);
    }
  }
  if (maxDbCodeLength > 40) {
    reds.push("max dbCode length " + maxDbCodeLength + " exceeds the varchar(40) store law (knowledge_nodes.code)");
  }
  const sharedCodes = [...byDbCode.entries()]
    .filter(([, v]) => v.slugs.length > 1)
    .map(([dbCode, v]) => ({ dbCode, nodeType: v.nodeType, title: v.title, slugs: [...v.slugs].sort() }))
    .sort((a, b) => a.dbCode.localeCompare(b.dbCode));
  const sharedSubjectRoots = sharedCodes
    .filter((s) => s.nodeType === "SUBJECT")
    .map((s) => s.dbCode);
  return {
    green: reds.length === 0,
    bundlesMapped,
    nodesMapped,
    maxDbCodeLength,
    storeLawLimit: 40,
    sharedCodes,
    sharedSubjectRoots,
    reds,
  };
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

  // the optionA map-law census — the fleet-wide offline identity proof, run
  // BEFORE any DB contact in EVERY mode (the fail-closed pre-flight: the
  // hold receipt's "--census proves the fleet offline before any COW"; the
  // floors cannot catch the identity defect class, this gate does). Exit 3
  // on red — zero connections are ever opened.
  const mapLaw = mapLawCensus(roster);
  if (!mapLaw.green) {
    console.error("[census] MAP-LAW RED: " + mapLaw.reds.length + " violation(s), zero DB contact:");
    for (const r of mapLaw.reds) console.error("  - " + r);
    process.exit(3);
  }
  console.log(
    "[census] map-law GREEN: bundles=" + mapLaw.bundlesMapped + " nodes=" + mapLaw.nodesMapped +
      " maxDbCode=" + mapLaw.maxDbCodeLength + "/" + mapLaw.storeLawLimit +
      " shared=" + mapLaw.sharedCodes.length + " (subject roots " + mapLaw.sharedSubjectRoots.length + ": " +
      mapLaw.sharedSubjectRoots.join(", ") + ")",
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
          if (entry.cls === "real" && entry.expectedQuestions > 0) {
            result.ingest = await ingestSlug(entry, sql, m);
            if (mode === "apply" && result.ingest.questions !== entry.expectedQuestions) {
              throw new Error(
                "post-apply count drift: ingested " + result.ingest.questions + " != bundle census " + entry.expectedQuestions,
              );
            }
          } else {
            result.skipped =
              entry.cls === "stub"
                ? "EQ honest-empty (stub — zero question sets of record); seed-only per the roster law"
                : "EQ axis honestly empty of record (0 spec-anchored of " + entry.rawQuestions +
                  " bundle questions — the phase-2 anchor gap, the CIE lane's follow-up); seed-only";
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
  const appliedRealSeedOnly = results.filter((r) => r.ok && r.cls === "real" && r.seed && !r.ingest).length;
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
    mapLaw: {
      law: "optionA identity-stable namespace/UNIT/title laws (operator ruling A, trace 1a15b161bf960249)",
      green: mapLaw.green,
      bundlesMapped: mapLaw.bundlesMapped,
      nodesMapped: mapLaw.nodesMapped,
      maxDbCodeLength: mapLaw.maxDbCodeLength,
      storeLawLimit: mapLaw.storeLawLimit,
      sharedSubjectRoots: mapLaw.sharedSubjectRoots,
      sharedNonRootJoins: mapLaw.sharedCodes.filter((s) => s.nodeType !== "SUBJECT").length,
      reds: mapLaw.reds,
      ...(census ? { sharedCodesFull: mapLaw.sharedCodes } : {}),
    },
    summary: {
      selected: targets.length,
      realApplied: appliedReal,
      realSeedOnly: appliedRealSeedOnly,
      stubsSeeded: appliedStubs,
      skeletonsSkipped: skippedSkeletons,
      failures: failures.length,
      questionsIngested,
      partsIngested,
      optionsIngested,
    },
    // the floors RE-BASED on the servable truth (the run-003 anchor law): the
    // raw phase-3 census bytes (19,097 questions / 25,663 parts) over-counted
    // what the frozen ingest can serve — only spec-anchored questions join
    // (primaryTopicCode is REQUIRED by validate). The anchor gap is the CIE
    // lane's phase-2 follow-up, disclosed per slug below.
    expectedOfRecord: { realBanks: 40, questionsFloor: 6618, partsFloor: 9158, rawCensusOfRecord: { questions: 19097, parts: 25663 } },
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
