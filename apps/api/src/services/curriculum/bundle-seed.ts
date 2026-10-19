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
 *   - bundle SPEC_POINT (195, code "1.1")      → SUBTOPIC `4PH1-1.1`,
 *     P-suffixed points verbatim (`4PH1-1.2P`) — the physics P-suffix law is
 *     the exact mirror of the chemistry C-suffix law (both = paper-2-only
 *     content, not shared with Science Double Award 4SD0); the bundle's
 *     applicability object ({papers, double_award_shared, rule}) is the
 *     verbatim passthrough (the T-C24 law, identical jsonb shape of record).
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

function requireSeedNode(node: NodeRow, code: string, provenance: string): void {
  if (node.provenance !== provenance) {
    throw new BundleSeedConflictError(
      "knowledge node " + code + " already exists with different provenance ('" +
        node.provenance + "' vs seed '" + provenance + "') — resolve manually, never re-seed over it",
    );
  }
}

function requireSeedEdge(what: string, provenance: string, edgeProvenance: string | null): void {
  if (edgeProvenance !== provenance) {
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
  nodeType: "SUBJECT" | "UNIT" | "TOPIC" | "SUBTOPIC";
  title: string;
  description: string;
  applicability: Record<string, unknown> | null;
  parentBundleCode: string | null;
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
      // the DB code is the of-record subject code (4PH1)
      const subjectName = bundle.subject + " (" + subjectCode + ")";
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: subjectCode,
        nodeType: "SUBJECT",
        title: bound(subjectName, 200),
        description: bound(bundlesTitle(bundle), 1000),
        applicability: null,
        parentBundleCode: null,
      });
      continue;
    }
    const parent = n.parents.length === 1 ? n.parents[0] : null;
    if (parent == null || !bundleHas(bundle, parent)) {
      throw new BundleSeedConflictError(
        "bundle node " + n.code + " does not resolve exactly one in-bundle parent",
      );
    }
    if (n.family === "TOPIC") {
      // sections land as UNITs: S{order}
      if (n.order < 1) throw new BundleSeedConflictError("bundle TOPIC " + n.code + " order < 1");
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: subjectCode + "-S" + n.order,
        nodeType: "UNIT",
        title: bound(n.title, 200),
        description: bound(descriptionPrefix + " (section): " + n.title, 1000),
        applicability: null,
        parentBundleCode: parent,
      });
      continue;
    }
    if (n.family === "SUBTOPIC") {
      // topics land as TOPICs: S{section}-{letter} — the letter comes from
      // the bundle code's own :SUBx suffix, never re-derived from order
      const m = /:SUB([a-z])$/.exec(n.code);
      if (m == null) {
        throw new BundleSeedConflictError(
          "bundle SUBTOPIC " + n.code + " does not carry the :SUBx letter suffix",
        );
      }
      const parentMapped = byCode.get(parent);
      if (parentMapped == null || parentMapped.nodeType !== "UNIT") {
        throw new BundleSeedConflictError(
          "bundle SUBTOPIC " + n.code + " parent " + parent + " is not a mapped UNIT",
        );
      }
      byCode.set(n.code, {
        bundleCode: n.code,
        dbCode: parentMapped.dbCode + "-" + m[1],
        nodeType: "TOPIC",
        title: bound(n.title, 200),
        description: bound(descriptionPrefix + " (subsection): " + n.title, 1000),
        applicability: null,
        parentBundleCode: parent,
      });
      continue;
    }
    // SPEC_POINT lands as SUBTOPIC: {code}-{specNumber} — the official spec
    // number verbatim (4PH1-1.1, 4PH1-1.2P), applicability verbatim (T-C24)
    if (!/^[0-9]/.test(n.code)) {
      throw new BundleSeedConflictError(
        "bundle SPEC_POINT " + n.code + " does not carry a numeric spec code",
      );
    }
    const parentMapped = byCode.get(parent);
    if (parentMapped == null || parentMapped.nodeType !== "TOPIC") {
      throw new BundleSeedConflictError(
        "bundle SPEC_POINT " + n.code + " parent " + parent + " is not a mapped TOPIC",
      );
    }
    byCode.set(n.code, {
      bundleCode: n.code,
      dbCode: subjectCode + "-" + n.code,
      nodeType: "SUBTOPIC",
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
  if (bundle.level !== "IGCSE") {
    throw new BundleSeedConflictError(
      "bundle level '" + bundle.level + "' is outside the International GCSE family of record — refusing to guess",
    );
  }
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

  const version = await resolveVersion(deps, curriculumCode, curriculumTitle, now);
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
    if (m.nodeType === "SUBTOPIC") {
      await resolveNode(deps, resolved, m.bundleCode, m.dbCode, "SUBTOPIC", m.title, m.description, "VALIDATED", provenance, activatedBy, counters, m.applicability, now);
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
    specPoints: [...mapped.values()].filter((m) => m.nodeType === "SUBTOPIC").length,
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
  code: string,
  title: string,
  now: string,
): Promise<VersionRow> {
  const existing = (await deps.sql`
    select id, status from curriculum_versions
    where board = ${BUNDLE_BOARD_OF_RECORD} and qualification = ${BUNDLE_QUALIFICATION} and code = ${code}`) as VersionRow[];
  if (existing[0] != null) return existing[0];
  const id = randomUUID();
  await deps.sql`
    insert into curriculum_versions (id, board, qualification, code, title, status, created_at)
    values (${id}::uuid, ${BUNDLE_BOARD_OF_RECORD}, ${BUNDLE_QUALIFICATION}, ${code}, ${title}, 'DRAFT', ${now}::timestamptz)`;
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
    requireSeedNode(root, rootMapped.dbCode, provenance);
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
    requireSeedNode(existing, code, provenance);
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
