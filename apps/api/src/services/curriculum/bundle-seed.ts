/**
 * T-MIG-134 band 134a — the SECOND-SUBJECT curriculum seed (content bundle →
 * knowledge graph). Mirrors the frozen 4CH1 seed law (T-MIG-053 tranche-2,
 * services/teacher/concept-seed.ts, syllabai-core @ 6cad6ef
 * ConceptGraphSeedService) statement-for-statement, with the INPUT swapped:
 * instead of the 4CH1 graph-as-code YAML store, the source of record is the
 * operator-authorized hub content bundle (apps/hub/content/<slug>/
 * curriculum.json, schema syllabai-demo.content-bundle/2.0, importSource
 * SyllabAI/syllabai-resources — the manifest carries the exact ref).
 *
 * WHY: the DB of record is single-subject (census of record, trace
 * 1a15365796ce1e75: 1 ACTIVE curriculum 4CH1-2017, 435 nodes, all Chemistry).
 * The four AI subsystems (smart mark, CLA, tutor, learner model) are
 * node/question-keyed and subject-agnostic by construction — CLA is
 * root-subject-keyed by contract, the learner model is node-keyed, smart
 * mark is question-keyed. The second subject therefore needs the SUBJECT
 * DIMENSION: a curriculum version + subject + the PART_OF tree, and every
 * subsystem then serves it without code changes. This seed materializes
 * that dimension from the bundle of record.
 *
 * CODE MAPPING (the of-record 4CH1 scheme, mirrored — the DB hierarchy is
 * SUBJECT → UNIT → TOPIC → SUBTOPIC, where SUBTOPIC codes ARE the official
 * spec-point numbers, e.g. 4CH1-1.1):
 *   - bundle SUBJECT  (code igcse-physics-19)  → SUBJECT  `4PH1`
 *   - bundle TOPIC    (8 sections, T1..T8)     → UNIT     `4PH1-S1`..
 *   - bundle SUBTOPIC (30, code T1:SUBa)       → TOPIC    `4PH1-S1-a`..
 *     (T-MIG-135a TWO-SHAPED + T-MIG-136a THREE-SHAPED — the physics LETTER
 *     suffix `:SUBa`, the maths DOTTED suffix `:SUB1.1` (igcse-maths-a-*:
 *     official 4MA1 topic numbering) and the maths-b PLACEHOLDER suffix
 *     `:SUB_` (igcse-maths-b-16: the SME exporter's single-subtopic form —
 *     every 4MB1 section IS its topic, so the exporter emits one unnamed
 *     subtopic per section and the spec points hang directly off it). All
 *     three land as `<spec>-S<order>-<suffix>` verbatim: `4PH1-S1-a`,
 *     `4MA1-S1-1.1`, `4MB1-S1-_` — the separator is the law's own, the
 *     suffix byte is the bundle's. The letter shape stays byte-identical;
 *     the dotted/placeholder shapes are the maths bundles' own official
 *     identities, never re-derived from order.)
 *   - bundle SPEC_POINT (195, code "1.1")      → SUBTOPIC `4PH1-1.1`,
 *     P-suffixed points verbatim (`4PH1-1.2P`) — the physics P-suffix law is
 *     the exact mirror of the chemistry C-suffix law (both = paper-2-only
 *     content, not shared with Science Double Award 4SD0); the bundle's
 *     applicability object ({papers, double_award_shared, rule}) is the
 *     verbatim passthrough (the T-C24 law, identical jsonb shape of record).
 *     T-MIG-136a second code law beside it: the 4MB1 ALNUM series
 *     ('1A'..'10N' — digit+letter, the section-scoped official alphabet,
 *     algebra ^\d{1,2}[A-Z]$) lands `{grandparent-UNIT}-{code}` —
 *     `4MB1-S1-1A` — because the section digit alone does not self-locate
 *     the point in the DB tree the way a hierarchical number does; the
 *     section is made explicit via the S-form. Dormant for every existing
 *     bundle (no live spec code matches the algebra — all carry a dot),
 *     provably byte-identical on physics/chemistry/maths-a.
 *
 * IDEMPOTENCE + CONFLICTS (the seed law, unchanged): node identity is the
 * store code (uq_knowledge_node_code) — same code + same provenance ⇒ reuse,
 * same code + different provenance ⇒ loud conflict ("resolve manually, never
 * re-seed over it"). Edge identity is the EXACT (source, target, relation)
 * triple (uq_edge). Re-running on a seeded store is a structural no-op. The
 * curriculum version lands ACTIVE (the V6 SQL-seed precedent).
 *
 * SERVING POSTURE (disclosed decision): tree nodes + structure PART_OF edges
 * land VALIDATED — the 4CH1 substrate's own posture of record (census:
 * UNIT/TOPIC/SUBTOPIC predominantly VALIDATED; the CLA/tutor validation gate
 * serves only VALIDATED nodes). The bundle's RULE_DERIVED provenanceTier is
 * carried verbatim in the provenance line; the operator gate is this repo's
 * PR (the gate:operator-git-PR line).
 *
 * FAIL-CLOSED LAWS: bundle relations other than PART_OF refuse to guess;
 * unresolvable edge endpoints refuse; mapped-code collisions refuse; the
 * bundle level must be "IGCSE" (the Edexcel International GCSE family of
 * record — anything else refuses rather than inventing a qualification
 * string). Titles bound 200, descriptions bound 1000, provenance bound 300
 * (the store column laws).
 */
import { randomUUID } from "node:crypto";

import type { SqlFn } from "./sql";

// ── bundle input shapes (syllabai-demo.content-bundle/2.0 curriculum.json) ──

export interface BundleNode {
  code: string;
  family: "SUBJECT" | "TOPIC" | "SUBTOPIC" | "SPEC_POINT";
  title: string | null;
  description: string | null;
  parents: string[];
  provenanceTier: string;
  order: number;
  applicability?: {
    papers?: string[];
    double_award_shared?: boolean;
    rule?: string;
  } | null;
}

export interface BundleEdge {
  source: string;
  relation: string;
  target: string;
  provenanceTier: string;
}

export interface BundleCurriculum {
  board: string;
  level: string;
  subject: string;
  code: string;
  syllabusVersion: string;
  nodes: BundleNode[];
  edges: BundleEdge[];
}

/** the manifest's importSource descriptor — the provenance line's source of record. */
export interface BundleSourceDescriptor {
  slug: string;
  importRepo: string;
  importRef: string;
  schema: string;
}

export interface BundleSeedDeps {
  sql: SqlFn;
  clock: { now(): Date };
}

export interface BundleSeedSummary {
  curriculumVersionId: string;
  subjectId: string;
  rootNodeId: string;
  units: number;
  topics: number;
  specPoints: number;
  nodesCreated: number;
  nodesReused: number;
  edgesCreated: number;
  edgesReused: number;
  applicabilityWrites: number;
  alreadyActive: boolean;
}

/** the seed law's loud conflict — same identity, different provenance. */
export class BundleSeedConflictError extends Error {}

// ── the of-record constants (mirror the 4CH1 rows in curriculum_versions) ────

export const BUNDLE_QUALIFICATION = "International GCSE (9-1)";
export const BUNDLE_BOARD_OF_RECORD = "Edexcel";

// ── the board/qualification vocabulary of record (the phase-4 CIE widening) ──
//
// The 134a seed was built for the Edexcel International GCSE family of record;
// CIE-INTEGRATION phase 4 (scope receipt cie-frontend-integration-scope-r0,
// executionPlan phase "4 — DB plane"; the 138a unit-vocabulary-widening
// precedent class) generalizes the seed to the committed CIE spine vocabulary
// — VOCABULARY-DRIVEN and FAIL-CLOSED: anything outside the pinned map refuses
// rather than inventing a board/qualification string. The Edexcel path is
// BYTE-IDENTICAL (the same constants, so existing (board, qualification, code)
// version keys resolve unchanged — the chemistry/physics control law).
// Cambridge qualification strings follow the board's own family names of
// record (the bundles carry level IGCSE / A-LEVEL / A-Level / AS; the registry
// normalized the spine's 'A-LEVEL' to 'A-Level', phase-3 receipt).

export const CIE_BOARD_OF_RECORD = "Cambridge International";
export const CIE_QUALIFICATION_IGCSE = "Cambridge IGCSE";
export const CIE_QUALIFICATION_AS_A_LEVEL = "Cambridge International AS & A Level";

const BUNDLE_BOARD_BY_UPSTREAM: Record<string, string> = {
  // the Edexcel bundles carry 'Pearson Edexcel' upstream; the store board of
  // record (the 134a constant, mirrored from the 4CH1 rows) is 'Edexcel'
  "Pearson Edexcel": BUNDLE_BOARD_OF_RECORD,
  "Edexcel": BUNDLE_BOARD_OF_RECORD,
  [CIE_BOARD_OF_RECORD]: CIE_BOARD_OF_RECORD,
};

export function bundleBoardAndQualification(
  bundle: Pick<BundleCurriculum, "board" | "level">,
): { board: string; qualification: string } {
  const board = BUNDLE_BOARD_BY_UPSTREAM[bundle.board];
  if (!board) {
    throw new BundleSeedConflictError(
      "bundle board '" + bundle.board + "' is outside the board vocabulary of record — refusing to guess",
    );
  }
  if (bundle.level === "IGCSE") {
    return {
      board,
      qualification: board === BUNDLE_BOARD_OF_RECORD ? BUNDLE_QUALIFICATION : CIE_QUALIFICATION_IGCSE,
    };
  }
  if (
    board === CIE_BOARD_OF_RECORD &&
    (bundle.level === "A-LEVEL" || bundle.level === "A-Level" || bundle.level === "AS")
  ) {
    return { board, qualification: CIE_QUALIFICATION_AS_A_LEVEL };
  }
  throw new BundleSeedConflictError(
    board === CIE_BOARD_OF_RECORD
      ? "bundle level '" + bundle.level + "' is outside the Cambridge International family of record (IGCSE / AS / A-Level) — refusing to guess"
      : "bundle level '" + bundle.level + "' is outside the International GCSE family of record — refusing to guess",
  );
}

// ── bound laws (concept-seed :414-439) ───────────────────────────────────────

function bound(text: string | null, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function author(activatedBy: string | null): string {
  return activatedBy ?? "bundle-seed-v1";
}

// ── row shapes (the store rows the seed resolves/creates) ────────────────────

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

type VersionRow = { id: string; status: string };
type SubjectRow = { id: string; knowledge_node_id: string | null };

interface Counters {
  nodesCreated: number;
  nodesReused: number;
  edgeCreated: number;
  edgesReused: number;
  applicabilityWrites: number;
}

// ── the seed law's reuse/conflict guards (requireSeedNode/:384-398) ──────────

/**
 * The shared-code reuse law (the phase-4 run-002 repair program, defect class
 * "provenance conflict"): the shared-code join matrix (9709 x5, 0973 x3,
 * 0653 x3, 0580/0455/0500/0460/0607 x2 — the orchestrator's determinism law,
 * "seeded into ONE subject tree by the seed's resolve-or-create") seeds the
 * SHARED nodes (the SUBJECT root, per-spec shared UNITs) from the FIRST bank;
 * a sibling bank's seed carries a provenance line differing ONLY in the
 * bundle:<slug> segment — that delta is the shared-resolve case, and the row
 * is REUSED (never re-seeded over). Every other delta (src ref, schema, tier,
 * gate) is still the loud conflict — the drift guard holds at full strength.
 */
export function sameSeedExceptBundle(existing: string | null, seed: string): boolean {
  if (existing === null) return false;
  const a = existing.split("|");
  const b = seed.split("|");
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i]!.startsWith("bundle:") && b[i]!.startsWith("bundle:")) continue;
    return false;
  }
  // byte-equal lines (no delta at all) are the trivial same-seed case — the
  // guard's !== clause short-circuits them before this helper is ever called;
  // the helper's honest contract is "the same seed lineage".
  return true;
}

function requireSeedNode(node: NodeRow, code: string, provenance: string, expectedTitle: string | null): void {
  if (node.provenance !== provenance && !sameSeedExceptBundle(node.provenance, provenance)) {
    throw new BundleSeedConflictError(
      "knowledge node " + code + " already exists with different provenance ('" +
        node.provenance + "' vs seed '" + provenance + "') — resolve manually, never re-seed over it",
    );
  }
  // the optionA title-drift refusal (the operator ruling A, trace
  // 1a15b161bf960249): a shared dbCode whose stored title disagrees with the
  // seed's mapped title is cross-bank tree drift — the sibling-reuse law
  // alone absorbed such collisions SILENTLY (the 9709 graft class: the
  // second bank's section resolved onto the first bank's node under the
  // first bank's title). Honest red, resolve manually, never re-seed over it.
  if (expectedTitle != null && node.title !== expectedTitle) {
    throw new BundleSeedConflictError(
      "knowledge node " + code + " carries title '" + node.title +
        "' but the seed maps '" + expectedTitle +
        "' — tree drift on a shared code; resolve manually, never re-seed over it",
    );
  }
}

function requireSeedEdge(what: string, provenance: string, edgeProvenance: string | null): void {
  if (edgeProvenance !== provenance && !sameSeedExceptBundle(edgeProvenance, provenance)) {
    throw new BundleSeedConflictError(
      "knowledge edge " + what + " already exists with different provenance ('" +
        edgeProvenance + "' vs seed '" + provenance + "') — resolve manually, never re-seed over it",
    );
  }
}

// ── the code mapping (the of-record 4CH1 scheme, mirrored) ───────────────────

/**
 * Canonical JSON form — key-order-INSENSITIVE and transport-form-INSENSITIVE.
 * The T-C24 content-equality guard must compare jsonb CONTENT, not string
 * forms: (a) real jsonb normalizes key order on read-back, and (b) the
 * store may hand the column back as RAW TEXT (driver-dependent type parsing
 * — prod-probe of record: typeof row.applicability === 'string' on the
 * pooled syllabai_v2_app path). So: JSON-shaped strings are parsed before
 * canonicalizing; object keys sort; arrays keep order (semantic). A raw
 * comparison would re-write identical values on every re-run (prod-
 * disclosed: applies 2-3 performed 195 content-neutral UPDATEs each before
 * this law landed).
 */
function canonicalJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return canonicalJson(JSON.parse(value) as unknown);
    } catch {
      return JSON.stringify(value) ?? "null";
    }
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(record[k])).join(",") + "}";
}

interface MappedNode {
  bundleCode: string;
  dbCode: string;
  nodeType: "SUBJECT" | "UNIT" | "TOPIC" | "SPEC_POINT";
  title: string;
  description: string;
  applicability: Record<string, unknown> | null;
  parentBundleCode: string | null;
}

/**
 * The optionA identity namespace (the operator ruling A, trace
 * 1a15b161bf960249): the CIE node namespace is VERSION-SCOPED — every node
 * dbCode hangs under <code>-<syllabusVersion> (the curriculumCode symmetry,
 * :539), which splits the cross-version pairs (0452 2023-2025 vs 2027-2029;
 * 0455/0500/0460 the 20-vs-25 generations — their spec-code STRINGS overlap
 * with different tree positions) while the same-version component families
 * join exactly per the build receipt's join matrix. The Edexcel namespace is
 * BYTE-IDENTICAL (the 134a law, the chemistry control).
 */
function identityNamespaceCode(bundle: BundleCurriculum): string {
  if (BUNDLE_BOARD_BY_UPSTREAM[bundle.board] === CIE_BOARD_OF_RECORD) {
    return bundle.code + "-" + bundle.syllabusVersion;
  }
  return bundle.code;
}

/**
 * Maps the bundle's four node families onto the of-record DB hierarchy.
 * Deterministic order: SUBJECT first, then UNIT/TOPIC/SUBTOPIC by
 * (order, code) — the insert sequence is stable across runs.
 */
export function mapBundleNodes(
  bundle: BundleCurriculum,
  descriptionPrefix: string,
): Map<string, MappedNode> {
  const subjectCode = bundle.code;
  const nsCode = identityNamespaceCode(bundle);
  const byCode = new Map<string, MappedNode>();
  const nodes = [...bundle.nodes].sort((a, b) =>
    a.family === b.family
      ? a.order - b.order || a.code.localeCompare(b.code)
      : familyRank(a.family) - familyRank(b.family),
  );
  for (const n of nodes) {
    if (byCode.has(n.code)) {
      throw new BundleSeedConflictError("bundle node code collision: " + n.code);
    }
    if (n.family === "SUBJECT") {
      // the SUBJECT node's bundle code is the COURSE SLUG (igcse-physics-19),
      // not the spec code — the slug gate is the seed's own rootMapped
      // lookup (mapped.get(source.slug)), which fail-closes on a mismatch;
      // the DB code is the of-record subject code (4PH1) — version-scoped
      // for CIE (the optionA namespace law)
      const subjectName = bundle.subject + " (" + subjectCode + ")";
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: nsCode,
        nodeType: "SUBJECT",
        title: bound(subjectName, 200),
        description: bound(bundlesTitle(bundle), 1000),
        applicability: null,
        parentBundleCode: null,
      });
      continue;
    }
    let parent: string | null = n.parents.length === 1 ? (n.parents[0] ?? null) : null;
    // lane C leg 3 (ruling A of record, trace 1a15beb5881f7f31): the pre-order
    // Edexcel generation attaches each SPEC_POINT to BOTH the container UNIT
    // and the SUBTOPIC (['4CH1-S1','4CH1-S1-a']). Tolerated ONLY for
    // SPEC_POINT + exactly two in-bundle parents; the TOPIC parent wins the
    // mapping and the UNIT co-parent must map to a UNIT (asserted in the
    // SPEC_POINT branch). Every other shape keeps the single-parent law.
    const dualSpecParents: readonly string[] | null =
      n.family === "SPEC_POINT" && n.parents.length === 2 ? n.parents : null;
    if (dualSpecParents != null) {
      for (const p of dualSpecParents) {
        if (!bundleHas(bundle, p)) {
          throw new BundleSeedConflictError(
            "bundle node " + n.code + " does not resolve exactly one in-bundle parent",
          );
        }
      }
    } else if (parent == null || !bundleHas(bundle, parent)) {
      throw new BundleSeedConflictError(
        "bundle node " + n.code + " does not resolve exactly one in-bundle parent",
      );
    }
    if (n.family === "TOPIC") {
      if (n.order != null && n.order < 1) throw new BundleSeedConflictError("bundle TOPIC " + n.code + " order < 1");
      // the optionA UNIT law: for CIE the UNIT identity is the TOPIC code's
      // own official -T tail, FAIL-CLOSED — the order digit is NOT an
      // identity (the 9709 census of record: six banks, every bank's one
      // TOPIC at order 1, official sections T1..T6 — the order law grafted
      // them all onto 9709-S1 under the first bank's title). The tail is the
      // syllabus's own section vocabulary: T<n> -> S<n> (9709 S1..S6
      // disjoint, 0452 plain digits), TB/TC/TP -> SB/SC/SP (0653/0973),
      // TC/TE -> SC/SE (0580/0607 core-extended), TS -> SS (0500). Edexcel
      // stays byte-identical on the order law (S{order}).
      //
      // TRAILING-VARIANT extension (the ci-repair of record; main's verify
      // lane RED since e024c11c): the corpus's own SYNTHESIZED history-18
      // convention — the spine builder's TS<order> TOPIC family (T + S +
      // digits, the shape 0500 shares) — grew the T-SPECS-TS4-REPAIR-1
      // sub-split: the glued TS4 run's Core B members moved to their own
      // TOPICs TS4L (League, S4.012-028) and TS4H (Hitler foreign policy,
      // S4.029-042) with every sibling code byte-stable. Shape: T + S +
      // digits + ONE trailing uppercase letter — the same trailing-variant
      // letter position the SPEC_POINT sixth shape already carries
      // ('C4.1.1a'/'P1.5.1b'). The tail group admits at most one trailing
      // uppercase letter AFTER the digits: every previously-matching tail
      // captures BYTE-IDENTICALLY (greedy digits + an optional letter only
      // extend at the end), so all pre-existing UNIT identities are
      // untouched; the sub-split lands its own version-scoped UNITS
      // SS4 / SS4L / SS4H — pairwise distinct, the order still never
      // consulted, the refusal message verbatim (order-only and non-tail
      // shapes still refuse).
      let unitDbCode: string;
      // lane C leg 2 (ruling A of record): the pre-order Edexcel generation
      // self-locates the section in the TOPIC code itself ('4CH1-S1'..'S4' —
      // no order field exists on those nodes). Non-CIE-gated; landed VERBATIM
      // (byte-identical with the seeded UNIT dbCodes 4CH1-S1..S4 of the lane C
      // probe of record). A present order that disagrees with the code's own
      // S<n> refuses fail-closed; the order law stays the ONLY path for
      // bundles without self-locating codes (physics igcse-physics-T1 etc.).
      const isCie = BUNDLE_BOARD_BY_UPSTREAM[bundle.board] === CIE_BOARD_OF_RECORD;
      const selfSection = isCie ? null : /^([A-Z0-9]+)-S(\d+)$/.exec(n.code);
      if (isCie) {
        const m = /-T([A-Z]?[0-9]+[A-Z]?)$/.exec(n.code);
        if (m == null) {
          throw new BundleSeedConflictError(
            "bundle TOPIC " + n.code +
              " does not carry the official -T tail — refusing to derive a CIE UNIT identity from order",
          );
        }
        unitDbCode = nsCode + "-S" + m[1];
      } else if (selfSection != null) {
        unitDbCode = n.code;
        if (n.order != null && n.order !== Number(selfSection[2])) {
          throw new BundleSeedConflictError(
            "bundle TOPIC " + n.code + " order " + n.order +
              " disagrees with the code's own S" + selfSection[2] + " — refusing the mismatch",
          );
        }
      } else {
        if (n.order == null) {
          throw new BundleSeedConflictError(
            "bundle TOPIC " + n.code + " carries neither a self-locating -S<n> code nor an order",
          );
        }
        unitDbCode = subjectCode + "-S" + n.order;
      }
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: unitDbCode,
        nodeType: "UNIT",
        title: bound(n.title, 200),
        description: bound(descriptionPrefix + " (section): " + n.title, 1000),
        applicability: null,
        parentBundleCode: parent,
      });
      continue;
    }
    if (n.family === "SUBTOPIC") {
      // topics land as TOPICs: S{section}-{suffix} — the suffix comes from
      // the bundle code's own :SUBx tail, never re-derived from order.
      // T-MIG-135a TWO-shape grammar (physics LETTER `:SUBa`, maths DOTTED
      // `:SUB1.1` — the official 4MA1 topic number, optionally two-segment);
      // T-MIG-136a THIRD shape: the maths-b PLACEHOLDER tail `:SUB_` (the
      // SME exporter's single-subtopic form — every 4MB1 section IS its
      // topic, so the exporter emits one unnamed subtopic per section and
      // the spec points hang directly off it). FOURTH shape (the phase-4
      // run-002 repair program, defect class "SUBTOPIC dbCode law"): the CIE
      // LETTER-PREFIXED official tails — `:SUBE1.1` (0580 extended),
      // `:SUBC1.1` (0580 core), the 0973/0653 component sciences — the
      // official component-scoped identity, the tail byte is still the
      // bundle's. All land `<spec>-S<order>-<tail>` verbatim: `4PH1-S1-a`,
      // `4MA1-S1-1.1`, `4MB1-S1-_`, `0580-S1-E1.1`. The first three shapes
      // keep byte-identical dbCodes; the uppercase-led fourth is disjoint
      // from the lowercase/dotted/placeholder vocabularies.
      // FIFTH shape (lane C ruling A of record, trace 1a15beb5881f7f31): the
      // Edexcel bare S-series tail — `4CH1-S1-a` — the pre-:SUB exporter
      // generation's official identity, admitted NON-CIE-gated and landed
      // VERBATIM (dbCode = the bundle code itself): the lane C probe of
      // record proved all 28 seeded knowledge_nodes TOPIC dbCodes
      // (4CH1-S1-a..4CH1-S4-h) are byte-identical with the bundle codes, so
      // the verbatim landing is a no-op against the DB of record. A derived
      // code that is not verbatim means the parent UNIT disagrees with the
      // code's own S<n> — refused fail-closed. The refusal message below is
      // kept verbatim (test-pinned twice); the fifth shape lives in this
      // comment, not in the message.
      const m = /:SUB([a-z]|\d+(?:\.\d+)?|_|[A-Z]\d+(?:\.\d+)?)$/.exec(n.code);
      const bare =
        BUNDLE_BOARD_BY_UPSTREAM[bundle.board] === CIE_BOARD_OF_RECORD
          ? null
          : /^([A-Z0-9]+)-S(\d+)-([a-z])$/.exec(n.code);
      if (m == null && bare == null) {
        throw new BundleSeedConflictError(
          "bundle SUBTOPIC " + n.code +
            " does not carry the :SUBx letter, dotted, placeholder, or letter-prefixed suffix",
        );
      }
      if (parent == null) {
        throw new BundleSeedConflictError(
          "bundle node " + n.code + " does not resolve exactly one in-bundle parent",
        );
      }
      const parentMapped = byCode.get(parent);
      if (parentMapped == null || parentMapped.nodeType !== "UNIT") {
        throw new BundleSeedConflictError(
          "bundle SUBTOPIC " + n.code + " parent " + parent + " is not a mapped UNIT",
        );
      }
      const subTail = m != null ? m[1] : bare![3];
      const subDbCode = parentMapped.dbCode + "-" + subTail;
      if (m == null && subDbCode !== n.code) {
        throw new BundleSeedConflictError(
          "bundle SUBTOPIC " + n.code +
            " bare-tail dbCode " + subDbCode + " is not verbatim — refusing the parent UNIT mismatch",
        );
      }
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: subDbCode,
        nodeType: "TOPIC",
        title: bound(n.title, 200),
        description: bound(descriptionPrefix + " (subsection): " + n.title, 1000),
        applicability: null,
        parentBundleCode: parent,
      });
      continue;
    }
    // SPEC_POINT lands as SPEC_POINT — the F.5 §7 gate-G2 CONVERGED landing
    // (T-MIG-139; pre-139 both paths collapsed it to SUBTOPIC by the of-record
    // 4CH1 scheme). Two dbCode laws, both "the official
    // identity verbatim, never re-derived":
    //   (a) hierarchical numbers (T-MIG-134a, unchanged): `{subject}-{code}`
    //       (4PH1-1.1, 4PH1-1.2P, 4MA1-1.6E) — the official number is
    //       globally unique per course and self-locating in the tree;
    //       applicability verbatim (T-C24).
    //   (b) T-MIG-136a: the 4MB1 ALNUM series ('1A'..'10N', digit+letter,
    //       the section-scoped official alphabet, algebra ^\d{1,2}[A-Z]$) —
    //       `{grandparent UNIT dbCode}-{code}` (4MB1-S1-1A): the section
    //       digit alone does not self-locate the point in the DB tree, so
    //       the section is made explicit via the parent UNIT's S-form. The
    //       branch is dormant for every existing bundle (no live spec code
    //       matches the algebra — all carry a dot) — physics/chemistry/
    //       maths-a byte-identical by construction, re-proven by tests.
    const alnum = /^\d{1,2}[A-Z]$/.test(n.code);
    // FIFTH shape (the phase-4 run-002 repair program, defect class
    // "SPEC_POINT numeric-code law"): the CIE letter-prefixed unit.seq codes
    // — 'S1.001' (0500/0475/0470/8021, the English/history vocabulary) — the
    // official identity verbatim: `{subject}-{code}` (0500-S1.001),
    // self-locating via the embedded unit number. Disjoint from the numeric,
    // ALNUM, and SUBTOPIC-tail vocabularies by construction.
    // SIXTH shape (the optionA re-land census catch — the run-003 fleet would
    // have fail-closed mid-seed on 462 points across 7 banks): the
    // letter-prefixed code with the official trailing VARIANT letter
    // ('C4.1.1a', 'P1.5.1b' — 0580/0607 maths, 0490 RS, 0653/0973 sciences).
    // The suffix is part of the official identity: `{ns}-{code}` verbatim,
    // disjoint from the unsuffixed vocabulary by the trailing [a-z].
    const letterPrefixed = /^[A-Z]\d+(?:\.\d+)*[a-z]?$/.test(n.code);
    if (!/^[0-9]/.test(n.code) && !alnum && !letterPrefixed) {
      throw new BundleSeedConflictError(
        "bundle SPEC_POINT " + n.code + " does not carry a numeric or letter-prefixed spec code",
      );
    }
    if (dualSpecParents != null) {
      const kinds = dualSpecParents.map((p) => byCode.get(p)?.nodeType ?? null);
      const topicIdx = kinds.indexOf("TOPIC");
      const unitIdx = kinds.indexOf("UNIT");
      if (
        topicIdx < 0 ||
        unitIdx < 0 ||
        topicIdx === unitIdx ||
        kinds.some((k) => k !== "TOPIC" && k !== "UNIT")
      ) {
        throw new BundleSeedConflictError(
          "bundle SPEC_POINT " + n.code +
            " dual parents do not resolve to exactly one mapped TOPIC + one mapped UNIT",
        );
      }
      parent = dualSpecParents[topicIdx] ?? null;
    }
    if (parent == null) {
      throw new BundleSeedConflictError(
        "bundle node " + n.code + " does not resolve exactly one in-bundle parent",
      );
    }
    const parentMapped = byCode.get(parent);
    if (parentMapped == null || parentMapped.nodeType !== "TOPIC") {
      throw new BundleSeedConflictError(
        "bundle SPEC_POINT " + n.code + " parent " + parent + " is not a mapped TOPIC",
      );
    }
    // lane C leg 4 (ruling A of record, trace 1a15beb5881f7f31): the pre-law
    // Edexcel generation self-namespaces the spec codes ('4CH1-1.1' — the
    // bundle code already carries the subject namespace, unlike the bare
    // physics/maths generation). Landed VERBATIM (byte-identical with the
    // seeded SPEC_POINT dbCodes 4CH1-1.1.. of the lane C probe of record);
    // the hierarchical {subject}-{code} law stays the path for bare codes.
    let specDbCode = n.code.startsWith(nsCode + "-") ? n.code : nsCode + "-" + n.code;
    if (alnum) {
      const grandparent =
        parentMapped.parentBundleCode == null
          ? null
          : byCode.get(parentMapped.parentBundleCode);
      if (grandparent == null || grandparent.nodeType !== "UNIT") {
        throw new BundleSeedConflictError(
          "bundle SPEC_POINT " + n.code +
            " alnum parent chain does not resolve to a mapped UNIT",
        );
      }
      specDbCode = grandparent.dbCode + "-" + n.code;
    }
    byCode.set(n.code, {
      bundleCode: n.code,
      dbCode: specDbCode,
      nodeType: "SPEC_POINT",
      title: bound(n.title, 200),
      description: bound(descriptionPrefix + " (spec point): " + n.title, 1000),
      applicability: (n.applicability ?? null) as Record<string, unknown> | null,
      parentBundleCode: parent,
    });
  }
  return byCode;
}

function familyRank(f: BundleNode["family"]): number {
  return f === "SUBJECT" ? 0 : f === "TOPIC" ? 1 : f === "SUBTOPIC" ? 2 : 3;
}

function bundleHas(bundle: BundleCurriculum, code: string): boolean {
  return bundle.nodes.some((n) => n.code === code);
}

function bundlesTitle(bundle: BundleCurriculum): string {
  // the board-aware title law (the run-002 repair rider, disclosed): the
  // frozen 134a string was the Edexcel family of record verbatim — the CIE
  // widening kept seeding Pearson-branded titles onto Cambridge
  // qualifications. The Edexcel path is byte-identical (the same constant
  // shape); the CIE path carries the board's own family name (the same
  // vocabulary bundleBoardAndQualification already pins — a hostile board
  // refused there before this is ever reached).
  if (BUNDLE_BOARD_BY_UPSTREAM[bundle.board] === CIE_BOARD_OF_RECORD) {
    const family = bundle.level === "IGCSE" ? "Cambridge IGCSE" : "Cambridge International AS & A Level";
    return family + " " + bundle.subject + " (" + bundle.code + ", " + bundle.syllabusVersion + " specification)";
  }
  return (
    "Pearson Edexcel International GCSE (9-1) " + bundle.subject +
    " (" + bundle.code + ", " + bundle.syllabusVersion + " specification)"
  );
}

/** the provenance line of record — ≤300 (the store column law). */
export function bundleProvenance(source: BundleSourceDescriptor): string {
  const line =
    "bundle:" + source.slug +
    "|src:" + source.importRepo + "@" + source.importRef +
    "|schema:" + source.schema +
    "|tier:RULE_DERIVED|gate:operator-git-PR";
  if (line.length > 300) {
    throw new BundleSeedConflictError("provenance line exceeds the 300-char store law");
  }
  return line;
}

// ── the seed (mirrors activateConceptGraph :113-234 statement-for-statement) ──

export async function seedBundleCurriculum(
  deps: BundleSeedDeps,
  bundle: BundleCurriculum,
  source: BundleSourceDescriptor,
  activatedBy: string | null,
): Promise<BundleSeedSummary> {
  // the board/qualification vocabulary gate (the phase-4 CIE widening; the
  // Edexcel IGCSE path byte-identical — see bundleBoardAndQualification)
  const { board, qualification } = bundleBoardAndQualification(bundle);
  const relations = new Set(bundle.edges.map((e) => e.relation));
  if (relations.size > 1 || (relations.size === 1 && !relations.has("PART_OF"))) {
    throw new BundleSeedConflictError(
      "bundle relations [" + [...relations].join(", ") + "] outside PART_OF — refusing to guess",
    );
  }

  const curriculumCode = bundle.code + "-" + bundle.syllabusVersion;
  const curriculumTitle = bundlesTitle(bundle);
  const subjectCode = bundle.code;
  const subjectName = bundle.subject + " (" + subjectCode + ")";
  const provenance = bundleProvenance(source);
  const now = deps.clock.now().toISOString();
  const counters: Counters = {
    nodesCreated: 0,
    nodesReused: 0,
    edgeCreated: 0,
    edgesReused: 0,
    applicabilityWrites: 0,
  };

  const version = await resolveVersion(deps, board, qualification, curriculumCode, curriculumTitle, now);
  const subject = await resolveSubject(deps, version.id, subjectCode, subjectName, now);

  const mapped = mapBundleNodes(bundle, subjectCode + " official specification structure");
  const rootMapped = mapped.get(source.slug);
  if (rootMapped == null || rootMapped.nodeType !== "SUBJECT") {
    throw new BundleSeedConflictError(
      "bundle does not carry a SUBJECT node under the slug " + source.slug,
    );
  }
  const root = await resolveRoot(deps, subject, rootMapped, provenance, activatedBy, counters, now);

  const resolved = new Map<string, NodeRow>([[rootMapped.bundleCode, root]]);

  // curriculum structure: units → topics → spec points (deterministic order)
  const unitNodes = new Map<string, NodeRow>();
  const topicNodes = new Map<string, NodeRow>();
  for (const m of mapped.values()) {
    if (m.nodeType === "UNIT") {
      const node = await resolveNode(deps, resolved, m.bundleCode, m.dbCode, "UNIT", m.title, m.description, "VALIDATED", provenance, activatedBy, counters, null, now);
      unitNodes.set(m.bundleCode, node);
    } else if (m.nodeType === "TOPIC") {
      const node = await resolveNode(deps, resolved, m.bundleCode, m.dbCode, "TOPIC", m.title, m.description, "VALIDATED", provenance, activatedBy, counters, null, now);
      topicNodes.set(m.bundleCode, node);
    }
  }
  for (const m of mapped.values()) {
    if (m.nodeType === "SPEC_POINT") {
      // T-MIG-139 (F.5 §7 gate G2): the spec-point pass resolves with the node's
      // OWN converged type. Pre-convergence rows reuse-refuse via the guard
      // (the G3/G5 receipt-keyed backfill is the only retyping authority).
      await resolveNode(deps, resolved, m.bundleCode, m.dbCode, "SPEC_POINT", m.title, m.description, "VALIDATED", provenance, activatedBy, counters, m.applicability, now);
    }
  }

  // the PART_OF edges — THE STORE DIRECTION LAW OF RECORD: the frozen
  // attach(child, parent) materializes source=DESCENDANT, target=ANCESTOR
  // ("source PART_OF target" — the chemistry census: 4CH1-S1→4CH1,
  // 4CH1-S1-a→4CH1-S1, 4CH1-1.1→4CH1-S1-a). The BUNDLE's own edge list
  // carries the OPPOSITE (ancestor→descendant: source=root, target=child),
  // so the endpoints are NORMALIZED on materialize: child = e.target,
  // parent = e.source. The normalization is NOT assumed — it is
  // CROSS-CHECKED against the mapping's own validated parent chain (every
  // non-root node carries exactly one in-bundle parent with enforced
  // family types); any disagreement between the bundle edge list and the
  // parent chain fails closed as store drift, never a guessed direction.
  const fromMapping = new Set<string>();
  for (const m of mapped.values()) {
    if (m.nodeType === "SUBJECT" || m.parentBundleCode == null) continue;
    fromMapping.add(m.bundleCode + "<<<" + m.parentBundleCode);
  }
  const fromBundle = new Set<string>();
  for (const e of bundle.edges) {
    if (!resolved.has(e.source) || !resolved.has(e.target)) {
      throw new BundleSeedConflictError(
        "bundle edge " + e.source + " -> " + e.target + " does not resolve — store drift",
      );
    }
    fromBundle.add(e.target + "<<<" + e.source);
  }
  if (fromMapping.size !== fromBundle.size || [...fromMapping].some((k) => !fromBundle.has(k))) {
    throw new BundleSeedConflictError(
      "bundle edge list disagrees with the node parent chain (" +
        fromMapping.size + " mapping pairs vs " + fromBundle.size +
        " normalized bundle pairs) — store drift",
    );
  }
  for (const key of fromMapping) {
    const idx = key.indexOf("<<<");
    const child = resolved.get(key.slice(0, idx));
    const parent = resolved.get(key.slice(idx + 3));
    if (child == null || parent == null) {
      throw new BundleSeedConflictError(
        "edge " + key + " does not resolve — store drift",
      );
    }
    await attach(deps, child, parent, "bundle structure (PART_OF)", provenance, activatedBy, counters, now);
  }

  // the curriculum version lands ACTIVE (:211-213)
  if (version.status !== "ACTIVE") {
    await deps.sql`
      update curriculum_versions set status = 'ACTIVE' where id = ${version.id}::uuid`;
  }

  return {
    curriculumVersionId: version.id,
    subjectId: subject.id,
    rootNodeId: root.id,
    units: unitNodes.size,
    topics: topicNodes.size,
    specPoints: [...mapped.values()].filter((m) => m.nodeType === "SPEC_POINT").length,
    nodesCreated: counters.nodesCreated,
    nodesReused: counters.nodesReused,
    edgesCreated: counters.edgeCreated,
    edgesReused: counters.edgesReused,
    applicabilityWrites: counters.applicabilityWrites,
    alreadyActive: counters.nodesCreated === 0 && counters.edgeCreated === 0,
  };
}

// ── idempotent resolution (the concept-seed SQL shapes, mirrored) ────────────

async function resolveVersion(
  deps: BundleSeedDeps,
  board: string,
  qualification: string,
  code: string,
  title: string,
  now: string,
): Promise<VersionRow> {
  const existing = (await deps.sql`
    select id, status from curriculum_versions
    where board = ${board} and qualification = ${qualification} and code = ${code}`) as VersionRow[];
  if (existing[0] != null) return existing[0];
  const id = randomUUID();
  await deps.sql`
    insert into curriculum_versions (id, board, qualification, code, title, status, created_at)
    values (${id}::uuid, ${board}, ${qualification}, ${code}, ${title}, 'DRAFT', ${now}::timestamptz)`;
  return { id, status: "DRAFT" };
}

async function resolveSubject(
  deps: BundleSeedDeps,
  versionId: string,
  code: string,
  name: string,
  now: string,
): Promise<SubjectRow> {
  const existing = (await deps.sql`
    select id, knowledge_node_id from subjects
    where curriculum_version_id = ${versionId}::uuid and code = ${code}`) as SubjectRow[];
  if (existing[0] != null) return existing[0];
  const id = randomUUID();
  await deps.sql`
    insert into subjects (id, curriculum_version_id, code, name, knowledge_node_id, created_at)
    values (${id}::uuid, ${versionId}::uuid, ${code}, ${name}, null, ${now}::timestamptz)`;
  return { id, knowledge_node_id: null };
}

async function resolveRoot(
  deps: BundleSeedDeps,
  subject: SubjectRow,
  rootMapped: MappedNode,
  provenance: string,
  activatedBy: string | null,
  counters: Counters,
  now: string,
): Promise<NodeRow> {
  let root: NodeRow | null = (await findByCode(deps, rootMapped.dbCode))[0] ?? null;
  if (root == null && subject.knowledge_node_id != null) {
    const linked = (await deps.sql`
      select id, code, node_type, title, validation_status, provenance, applicability
      from knowledge_nodes where id = ${subject.knowledge_node_id}::uuid`) as NodeRow[];
    root = linked[0] ?? null;
    if (root != null && root.code !== rootMapped.dbCode) {
      throw new BundleSeedConflictError(
        "subject " + rootMapped.dbCode + " is linked to KG node " + root.code +
          ", expected the seed root " + rootMapped.dbCode,
      );
    }
  }
  if (root != null) {
    requireSeedNode(root, rootMapped.dbCode, provenance, rootMapped.title);
    counters.nodesReused++;
  } else {
    const id = randomUUID();
    await deps.sql`
      insert into knowledge_nodes (id, code, node_type, title, description, validation_status, provenance, created_by, created_at)
      values (${id}::uuid, ${rootMapped.dbCode}, 'SUBJECT', ${rootMapped.title}, ${rootMapped.description}, 'VALIDATED', ${provenance}, ${author(activatedBy)}, ${now}::timestamptz)`;
    counters.nodesCreated++;
    root = {
      id,
      code: rootMapped.dbCode,
      node_type: "SUBJECT",
      title: rootMapped.title,
      validation_status: "VALIDATED",
      provenance,
      applicability: null,
    };
  }
  if (root.id !== subject.knowledge_node_id) {
    await deps.sql`
      update subjects set knowledge_node_id = ${root.id}::uuid where id = ${subject.id}::uuid`;
  }
  return root;
}

async function findByCode(deps: BundleSeedDeps, code: string): Promise<NodeRow[]> {
  return (await deps.sql`
    select id, code, node_type, title, validation_status, provenance, applicability
    from knowledge_nodes where code = ${code}`) as NodeRow[];
}

/**
 * Idempotent node resolution by the store code (concept-seed :281-300) + the
 * T-C24 applicability overload (:311-341): on create the field is set BEFORE
 * the single insert; on reuse a content-equality guard makes the write a
 * one-time idempotent backfill — no other field is ever touched.
 */
async function resolveNode(
  deps: BundleSeedDeps,
  byBundleCode: Map<string, NodeRow>,
  bundleCode: string,
  code: string,
  nodeType: string,
  title: string,
  description: string,
  status: string,
  provenance: string,
  activatedBy: string | null,
  counters: Counters,
  applicability: Record<string, unknown> | null,
  now: string,
): Promise<NodeRow> {
  let existing = byBundleCode.get(bundleCode) ?? null;
  if (existing == null) existing = (await findByCode(deps, code))[0] ?? null;
  if (existing != null) {
    requireSeedNode(existing, code, provenance, title);
    // T-MIG-139 drift guard: the seed's identity contract is (code → node_type).
    // A row landed under the pre-convergence law (SUBTOPIC where this seed now
    // maps SPEC_POINT) is a G3/G5-protected state — refuse, never absorb.
    if (existing.node_type !== nodeType) {
      throw new BundleSeedConflictError(
        "knowledge node " + code + " landed node_type '" + existing.node_type +
          "' but the seed law maps '" + nodeType +
          "' — pre-convergence row: apply the F.5 §7 receipt-keyed backfill or rebaseline the branch; never re-seed over it",
      );
    }
    if (
      applicability != null &&
      canonicalJson(applicability) !== canonicalJson(existing.applicability ?? null)
    ) {
      await deps.sql`
        update knowledge_nodes set applicability = ${JSON.stringify(applicability)}::jsonb
        where id = ${existing.id}::uuid`;
      counters.applicabilityWrites++;
    }
    counters.nodesReused++;
    byBundleCode.set(bundleCode, existing);
    return existing;
  }
  const id = randomUUID();
  await deps.sql`
    insert into knowledge_nodes (id, code, node_type, title, description, validation_status, provenance, created_by, created_at, applicability)
    values (${id}::uuid, ${code}, ${nodeType}, ${title}, ${description}, ${status}, ${provenance}, ${author(activatedBy)}, ${now}::timestamptz, ${applicability == null ? null : JSON.stringify(applicability)}::jsonb)`;
  counters.nodesCreated++;
  if (applicability != null) counters.applicabilityWrites++;
  const created: NodeRow = {
    id,
    code,
    node_type: nodeType,
    title,
    validation_status: status,
    provenance,
    applicability,
  };
  byBundleCode.set(bundleCode, created);
  return created;
}

/**
 * Idempotent PART_OF attachment by EXACT (child, parent) edge identity
 * (concept-seed :343-363) — the identity check is the edge itself.
 */
async function attach(
  deps: BundleSeedDeps,
  child: NodeRow,
  parent: NodeRow,
  rationale: string,
  provenance: string,
  activatedBy: string | null,
  counters: Counters,
  now: string,
): Promise<void> {
  const existing = (await deps.sql`
    select id, provenance from knowledge_edges
    where source_node_id = ${child.id}::uuid and target_node_id = ${parent.id}::uuid
      and relation_type = 'PART_OF'`) as Array<{ id: string; provenance: string | null }>;
  if (existing[0] != null) {
    requireSeedEdge("PART_OF " + child.code + " -> " + parent.code, provenance, existing[0].provenance);
    counters.edgesReused++;
    return;
  }
  await deps.sql`
    insert into knowledge_edges (id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at)
    values (${randomUUID()}::uuid, ${child.id}::uuid, ${parent.id}::uuid, 'PART_OF', null, ${rationale}, 'VALIDATED', ${provenance}, ${author(activatedBy)}, ${now}::timestamptz)`;
  counters.edgeCreated++;
}
