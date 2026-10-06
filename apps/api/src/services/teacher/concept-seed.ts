/**
 * T-MIG-053 tranche-2 (r3a) — the teacher-side 4CH1 concept-graph seed.
 * Port of the frozen law (syllabai-core @ 6cad6ef,
 * teacher/ConceptGraphSeedService.java :23-471):
 *
 * Materializes the pinned curriculum substrate + the settled T-C11 graph
 * into the EXISTING Postgres knowledge graph — the same knowledge_nodes /
 * knowledge_edges tables the V6 seed, the curriculum review workflow and
 * the learner loop already use. No second store, no Neo4j, no LLM.
 *
 * ACTIVATION IS DETERMINISTIC AND IDEMPOTENT (:30-38): the input is the
 * SHA-256-pinned snapshot; node/edge identity is the store's own codes;
 * every row is resolved by code — same code + same provenance ⇒ reuse,
 * same code + different provenance ⇒ loud conflict (409). Re-running the
 * seed with the same snapshot is a structural no-op: the counts report
 * reused rows. The ONE deliberate exception (T-C24, V39) is the verbatim
 * applicability column on spec-point nodes — written on create,
 * content-equality-guarded on reuse (a one-time backfill of rows seeded
 * before V39), never touching any other field.
 *
 * STATUSES PRESERVE THE STORE'S EPISTEMIC STATE (:40-61, §8A.4 — validation
 * never erases provenance):
 *   - curriculum structure (root, 4 sections, 28 subsections, 182 spec
 *     points, 12 practicals) + structure PART_OF edges land VALIDATED;
 *   - concept/misconception nodes land SUGGESTED (the settled store's own
 *     node status);
 *   - the 211 concept→SP anchor PART_OF edges land SUGGESTED;
 *   - the 272 HUMAN_VALIDATED semantic edges land VALIDATED with T-C11
 *     provenance naming the extraction pass and the operator validation.
 * The 3 pilot HOLD and 2 REVIEW_REQUIRED edges never reach the KG — the
 * loader fail-closes on their count (snapshot.ts). The curriculum version
 * lands ACTIVE (the V6 SQL-seed precedent).
 *
 * NODE/EDGE IDENTITY (:276-300 + :343-382): nodes resolve by code (the
 * store's canonical identity, uq_knowledge_node_code); edges resolve by the
 * EXACT (source, target, relation) triple (uq_edge) — 34 settled concepts
 * legitimately anchor under more than one spec point, so the identity check
 * is the edge itself, never a single-parent lookup. Provenance mismatch on
 * either = loud ConflictException ("resolve manually, never re-seed over
 * it").
 *
 * RELATION MAPPING (:400-412): the settled store's seven relations map
 * strictly; anything else refuses to guess.
 *
 * BOUND LAWS (:414-439): titles bound 200, descriptions bound 1000,
 * provenance bound 300 (store column), author = the activated-by uuid
 * bound 100 (or "concept-graph-seed-v1" when absent).
 *
 * STORE-NOTE (disclosed): the V2 knowledge_edges column carrying the
 * settled store's confidence double is named `strength`; null confidence
 * stays null. created_at/created_by render from the clock/activatedBy
 * exactly like the frozen audit fields.
 */
import { randomUUID } from "node:crypto";

import type { KnowledgeDeps } from "../knowledge";
import { loadConceptGraphSnapshot, type ConceptGraphSnapshot } from "./snapshot";

// ── seed identity constants (:73-88) ─────────────────────────────────────────

export const BOARD = "Edexcel";
export const QUALIFICATION = "International GCSE (9-1)";
export const CURRICULUM_CODE = "4CH1-2017";
export const CURRICULUM_TITLE =
  "Pearson Edexcel International GCSE (9-1) Chemistry (4CH1, Issue 3)";
export const SUBJECT_CODE = "4CH1";
export const SUBJECT_NAME = "Chemistry (4CH1)";
export const ROOT_NODE_CODE = "4CH1";
export const SEED_IDENTITY = "concept-graph-seed-v1";

export const STRUCTURE_PROVENANCE =
  "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py";
export const CONCEPT_PROVENANCE =
  "t-c11:settled|tier:AI_SUGGESTED|identity:operator-reviewed";
export const ANCHOR_PROVENANCE = "t-c11:settled|anchor:AI_SUGGESTED";

/** the loud conflict — the frozen ConflictException, wire 409 */
export class SeedConflictError extends Error {}

const bound = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : value.slice(0, maxLength);

const author = (activatedBy: string | null): string =>
  activatedBy == null ? SEED_IDENTITY : bound(activatedBy, 100);

function structureDescription(kind: string, title: string): string {
  return bound("4CH1 official specification structure (" + kind + "): " + title, 1000);
}

function spDescription(sp: ConceptGraphSnapshot["specPoints"][number]): string {
  let sb = "Official spec point " + sp.officialCode + " — " + sp.wording;
  if (sp.cPoint) sb += " [C point: Chemistry-only content, not in Science (Double Award)]";
  if (sp.practical) sb += " [has required practical]";
  return bound(sb, 1000);
}

// ── counters (:441-447) ──────────────────────────────────────────────────────

interface Counters {
  nodesCreated: number;
  nodesReused: number;
  edgeCreated: number;
  edgesReused: number;
  applicabilityWrites: number;
}

// ── row shapes ───────────────────────────────────────────────────────────────

type NodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

type VersionRow = {
  id: string;
  status: string;
};

type SubjectRow = {
  id: string;
  knowledge_node_id: string | null;
};

/** requireSeedNode(:384-390) — same code + same provenance ⇒ reuse. */
function requireSeedNode(node: NodeRow, code: string, provenance: string): void {
  if (node.provenance !== provenance) {
    throw new SeedConflictError(
      "knowledge node " + code + " already exists with different provenance ('" +
        node.provenance + "' vs seed '" + provenance + "') — resolve manually, never re-seed over it",
    );
  }
}

/** requireSeedEdge(:392-398) */
function requireSeedEdge(what: string, provenance: string, edgeProvenance: string | null): void {
  if (edgeProvenance !== provenance) {
    throw new SeedConflictError(
      "knowledge edge " + what + " already exists with different provenance ('" +
        edgeProvenance + "' vs seed '" + provenance + "') — resolve manually, never re-seed over it",
    );
  }
}

// ── the seed (activate :113-234) ─────────────────────────────────────────────

/**
 * Materializes (or verifies, on re-run) the 4CH1 curriculum + settled
 * concept graph. The frozen runs in ONE @Transactional — this port issues
 * the same statement sequence on the caller's connection/transaction
 * (the route layer owns the transaction boundary; the fakeSql pins the
 * resolution and counter logic).
 */
export async function activateConceptGraph(
  deps: KnowledgeDeps,
  activatedBy: string | null,
): Promise<{
  curriculumVersionId: string;
  subjectId: string;
  rootNodeId: string;
  sections: number;
  subsections: number;
  specPoints: number;
  practicals: number;
  conceptNodes: number;
  validatedSemanticEdges: number;
  nodesCreated: number;
  nodesReused: number;
  edgesCreated: number;
  edgesReused: number;
  alreadyActive: boolean;
}> {
  const snapshot = loadConceptGraphSnapshot();
  const now = deps.clock.now().toISOString();
  const counters: Counters = {
    nodesCreated: 0,
    nodesReused: 0,
    edgeCreated: 0,
    edgesReused: 0,
    applicabilityWrites: 0,
  };

  const version = await resolveVersion(deps, now);
  const subject = await resolveSubject(deps, version.id, now);
  // the counters must see the root too (:119-122)
  const root = await resolveRoot(deps, subject, activatedBy, counters, now);

  const byCode = new Map<string, NodeRow>([[root.code, root]]);

  // curriculum structure: sections → subsections → spec points (:129-162)
  const sectionNodes = new Map<string, NodeRow>();
  for (const section of snapshot.sections) {
    const node = await resolveNode(deps, byCode, section.code, "UNIT", bound(section.title, 200), structureDescription("section", section.title), "VALIDATED", STRUCTURE_PROVENANCE, activatedBy, counters, null, now);
    sectionNodes.set(section.code, node);
    await attach(deps, node, root, "spec structure (section)", STRUCTURE_PROVENANCE, "VALIDATED", activatedBy, counters, now);
  }
  const subsectionNodes = new Map<string, NodeRow>();
  for (const subsection of snapshot.subsections) {
    const node = await resolveNode(deps, byCode, subsection.code, "TOPIC", bound(subsection.title, 200), structureDescription("subsection", subsection.title), "VALIDATED", STRUCTURE_PROVENANCE, activatedBy, counters, null, now);
    subsectionNodes.set(subsection.code, node);
    await attach(deps, node, sectionNodes.get(subsection.sectionCode)!, "spec structure (subsection)", STRUCTURE_PROVENANCE, "VALIDATED", activatedBy, counters, now);
  }
  const specPointNodes = new Map<string, NodeRow>();
  for (const sp of snapshot.specPoints) {
    const node = await resolveNode(deps, byCode, sp.code, "SUBTOPIC", bound(sp.wording, 200), spDescription(sp), "VALIDATED", STRUCTURE_PROVENANCE, activatedBy, counters, sp.applicability, now);
    specPointNodes.set(sp.code, node);
    await attach(deps, node, subsectionNodes.get(sp.subsectionCode)!, "spec structure (spec point)", STRUCTURE_PROVENANCE, "VALIDATED", activatedBy, counters, now);
  }

  // required practicals: official spec content anchored on their SP (:164-174)
  for (const practical of snapshot.practicals) {
    const node = await resolveNode(deps, byCode, practical.code, "SUBTOPIC", bound("Required practical: " + practical.summary, 200), structureDescription("required practical", practical.summary), "VALIDATED", STRUCTURE_PROVENANCE, activatedBy, counters, null, now);
    await attach(deps, node, specPointNodes.get(practical.specPointCode)!, "required practical anchor", STRUCTURE_PROVENANCE, "VALIDATED", activatedBy, counters, now);
  }

  // the settled T-C11 layer (:176-209)
  for (const record of snapshot.conceptNodes) {
    const type = record.family === "MISCONCEPTION" ? "MISCONCEPTION" : "CONCEPT";
    const description = record.aliases.length === 0
      ? "T-C11 settled " + record.family.toLowerCase() + " (no recorded aliases)"
      : "T-C11 settled " + record.family.toLowerCase() + " — aliases: " + record.aliases.join("; ");
    await resolveNode(deps, byCode, record.code, type, bound(record.title, 200), bound(description, 1000), "SUGGESTED", CONCEPT_PROVENANCE, activatedBy, counters, null, now);
  }
  for (const anchor of snapshot.anchorEdges) {
    const concept = byCode.get(anchor.conceptCode);
    const specPoint = specPointNodes.get(anchor.specPointCode);
    if (concept == null || specPoint == null) {
      throw new SeedConflictError(
        "anchor edge " + anchor.conceptCode + " -> " + anchor.specPointCode + " does not resolve — store drift",
      );
    }
    await attach(deps, concept, specPoint, "concept anchor (role " + anchor.role + ")", ANCHOR_PROVENANCE, "SUGGESTED", activatedBy, counters, now);
  }
  for (const edge of snapshot.validatedSemanticEdges) {
    const source = byCode.get(edge.source);
    const target = byCode.get(edge.target);
    if (source == null || target == null) {
      throw new SeedConflictError(
        "semantic edge " + edge.source + " -> " + edge.target + " does not resolve — store drift",
      );
    }
    await resolveSemanticEdge(deps, source, target, edge, activatedBy, counters, now);
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
    sections: snapshot.sections.length,
    subsections: snapshot.subsections.length,
    specPoints: snapshot.specPoints.length,
    practicals: snapshot.practicals.length,
    conceptNodes: snapshot.conceptNodes.length,
    validatedSemanticEdges: snapshot.validatedSemanticEdges.length,
    nodesCreated: counters.nodesCreated,
    nodesReused: counters.nodesReused,
    edgesCreated: counters.edgeCreated,
    edgesReused: counters.edgesReused,
    alreadyActive: counters.nodesCreated === 0 && counters.edgeCreated === 0,
  };
}

// ── idempotent resolution (the CurriculumIngestionService contract) ──────────

async function resolveVersion(deps: KnowledgeDeps, now: string): Promise<VersionRow> {
  const existing = (await deps.sql`
    select id, status from curriculum_versions
    where board = ${BOARD} and qualification = ${QUALIFICATION} and code = ${CURRICULUM_CODE}`) as VersionRow[];
  if (existing[0] != null) return existing[0];
  const id = randomUUID();
  await deps.sql`
    insert into curriculum_versions (id, board, qualification, code, title, status, created_at)
    values (${id}::uuid, ${BOARD}, ${QUALIFICATION}, ${CURRICULUM_CODE}, ${CURRICULUM_TITLE}, 'DRAFT', ${now}::timestamptz)`;
  return { id, status: "DRAFT" };
}

async function resolveSubject(deps: KnowledgeDeps, versionId: string, now: string): Promise<SubjectRow> {
  const existing = (await deps.sql`
    select id, knowledge_node_id from subjects
    where curriculum_version_id = ${versionId}::uuid and code = ${SUBJECT_CODE}`) as SubjectRow[];
  if (existing[0] != null) return existing[0];
  const id = randomUUID();
  await deps.sql`
    insert into subjects (id, curriculum_version_id, code, name, knowledge_node_id, created_at)
    values (${id}::uuid, ${versionId}::uuid, ${SUBJECT_CODE}, ${SUBJECT_NAME}, null, ${now}::timestamptz)`;
  return { id, knowledge_node_id: null };
}

async function resolveRoot(
  deps: KnowledgeDeps,
  subject: SubjectRow,
  activatedBy: string | null,
  counters: Counters,
  now: string,
): Promise<NodeRow> {
  let root: NodeRow | null = (await findByCode(deps, ROOT_NODE_CODE))[0] ?? null;
  if (root == null && subject.knowledge_node_id != null) {
    const linked = (await deps.sql`
      select id, code, node_type, title, validation_status, provenance, applicability
      from knowledge_nodes where id = ${subject.knowledge_node_id}::uuid`) as NodeRow[];
    root = linked[0] ?? null;
    if (root != null && root.code !== ROOT_NODE_CODE) {
      throw new SeedConflictError(
        "subject " + SUBJECT_CODE + " is linked to KG node " + root.code +
          ", expected the seed root " + ROOT_NODE_CODE,
      );
    }
  }
  if (root != null) {
    requireSeedNode(root, ROOT_NODE_CODE, STRUCTURE_PROVENANCE);
    counters.nodesReused++;
  } else {
    const id = randomUUID();
    await deps.sql`
      insert into knowledge_nodes (id, code, node_type, title, description, validation_status, provenance, created_by, created_at)
      values (${id}::uuid, ${ROOT_NODE_CODE}, 'SUBJECT', ${SUBJECT_NAME}, ${CURRICULUM_TITLE}, 'VALIDATED', ${STRUCTURE_PROVENANCE}, ${author(activatedBy)}, ${now}::timestamptz)`;
    counters.nodesCreated++;
    root = {
      id,
      code: ROOT_NODE_CODE,
      node_type: "SUBJECT",
      title: SUBJECT_NAME,
      validation_status: "VALIDATED",
      provenance: STRUCTURE_PROVENANCE,
      applicability: null,
    };
  }
  if (root.id !== subject.knowledge_node_id) {
    await deps.sql`
      update subjects set knowledge_node_id = ${root.id}::uuid where id = ${subject.id}::uuid`;
  }
  return root;
}

async function findByCode(deps: KnowledgeDeps, code: string): Promise<NodeRow[]> {
  return (await deps.sql`
    select id, code, node_type, title, validation_status, provenance, applicability
    from knowledge_nodes where code = ${code}`) as NodeRow[];
}

/**
 * Idempotent node resolution by the store code (:281-300) + the T-C24
 * applicability overload (:311-341): on create the field is set BEFORE the
 * single save; on reuse a content-equality guard makes the write a one-time
 * idempotent backfill of rows seeded before V39 — no other field is ever
 * touched (the reuse contract's only deliberate exception).
 */
async function resolveNode(
  deps: KnowledgeDeps,
  byCode: Map<string, NodeRow>,
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
  let existing = byCode.get(code) ?? null;
  if (existing == null) existing = (await findByCode(deps, code))[0] ?? null;
  if (existing != null) {
    requireSeedNode(existing, code, provenance);
    if (
      applicability != null &&
      JSON.stringify(applicability) !== JSON.stringify(existing.applicability ?? null)
    ) {
      await deps.sql`
        update knowledge_nodes set applicability = ${JSON.stringify(applicability)}::jsonb
        where id = ${existing.id}::uuid`;
      counters.applicabilityWrites++;
    }
    counters.nodesReused++;
    byCode.set(code, existing);
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
  byCode.set(code, created);
  return created;
}

/**
 * Idempotent PART_OF attachment by EXACT (child, parent) edge identity
 * (:343-363) — 34 settled concepts legitimately anchor under more than one
 * spec point, so the seed's identity check is the edge itself.
 */
async function attach(
  deps: KnowledgeDeps,
  child: NodeRow,
  parent: NodeRow,
  rationale: string,
  provenance: string,
  status: string,
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
    values (${randomUUID()}::uuid, ${child.id}::uuid, ${parent.id}::uuid, 'PART_OF', null, ${rationale}, ${status}, ${provenance}, ${author(activatedBy)}, ${now}::timestamptz)`;
  counters.edgeCreated++;
}

/** Idempotent semantic-edge resolution by the (source, target, relation) identity (:365-382). */
async function resolveSemanticEdge(
  deps: KnowledgeDeps,
  source: NodeRow,
  target: NodeRow,
  edge: { relation: string; confidence: number | null; rationale: string; provenance: string },
  activatedBy: string | null,
  counters: Counters,
  now: string,
): Promise<void> {
  const existing = (await deps.sql`
    select id, provenance from knowledge_edges
    where source_node_id = ${source.id}::uuid and target_node_id = ${target.id}::uuid
      and relation_type = ${edge.relation}`) as Array<{ id: string; provenance: string | null }>;
  if (existing[0] != null) {
    requireSeedEdge(edge.relation + " " + source.code + " -> " + target.code, edge.provenance, existing[0].provenance);
    counters.edgesReused++;
    return;
  }
  await deps.sql`
    insert into knowledge_edges (id, source_node_id, target_node_id, relation_type, strength, rationale, validation_status, provenance, created_by, created_at)
    values (${randomUUID()}::uuid, ${source.id}::uuid, ${target.id}::uuid, ${edge.relation}, ${edge.confidence}, ${edge.rationale}, 'VALIDATED', ${edge.provenance}, ${author(activatedBy)}, ${now}::timestamptz)`;
  counters.edgeCreated++;
}
