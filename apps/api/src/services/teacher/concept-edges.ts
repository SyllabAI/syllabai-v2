/**
 * T-MIG-053 tranche-2 (r3a) — the teacher concept-graph semantic read model.
 * Port of the frozen law (syllabai-core @ 6cad6ef,
 * TeacherConceptGraphController.java :61-103 + :105-136):
 *
 *   - GET /api/v1/teacher/concept-graph/edges?rootId= — the graph-derived
 *     semantic edges within a subject subtree. The split of surfaces is
 *     deliberate: the curriculum tree is served by the knowledge tree read
 *     model; this adds exactly what the tree cannot express — the semantic
 *     edges BETWEEN nodes (prerequisite chains, remediation, wrong-answer
 *     patterns, commonly-confused pairs).
 *   - THE SCOPE WIDENING (:79-94): the endpoint scope is the PART_OF subtree
 *     PLUS the misconceptions that attach to it through misconception-family
 *     edges (they are edge SOURCES, not PART_OF members — the same widening
 *     the tree fold applies). Without them the read model dropped every
 *     REMEDIATED_BY / WRONG_ANSWER_PATTERN / MISCONCEPTION_OF edge of the
 *     settled store (29 of 153; the session-56 pilot-readiness fix).
 *   - PART_OF IS EXCLUDED from the edges (:75-77): curriculum structure is
 *     the tree read model's authority; this carries only conceptual
 *     relationships, each with its validation status and T-C11 provenance
 *     intact. (The exception is the anchor set — PART_OF edges scoped at
 *     CONCEPT sources participate in the WIDENING only, they never come
 *     back as edges.)
 *   - DETERMINISTIC ORDER (:97-100): relation, then source code, then
 *     target code.
 *   - THE POLICY MARKER (:101): "concept-graph-teacher/v1".
 *   - ROOT 404-FIRST (:89-90): an unknown root is NotFoundException
 *     ("knowledge node", rootId) — the same contract the other read
 *     methods carry (kg.ts kgNode404).
 *
 * NO routes/mounts — the t2 tranche is contracts+services+fakeSql pins.
 */
import type { KnowledgeDeps } from "../knowledge";
import { KnowledgeNotFoundError } from "../knowledge";
import {
  misconceptionFamilyEdgesWithin,
  semanticEdgesWithin,
  subtreeIds,
  type KgEdgeRow,
} from "./kg";

/** TeacherConceptGraphController :101 — the read-model marker. */
export const CONCEPT_GRAPH_TEACHER_POLICY = "concept-graph-teacher/v1";

export type ConceptEdgeNodeView = {
  nodeId: string;
  code: string;
  title: string;
  nodeType: string;
  validationStatus: string;
};

export type ConceptGraphEdgeWireView = {
  source: ConceptEdgeNodeView;
  target: ConceptEdgeNodeView;
  relation: string;
  validationStatus: string;
  provenance: string;
  rationale: string;
};

function edgeNodeOf(row: KgEdgeRow, side: "source" | "target"): ConceptEdgeNodeView {
  return {
    nodeId: side === "source" ? row.source_node_id : row.target_node_id,
    code: side === "source" ? row.source_code : row.target_code,
    title: side === "source" ? row.source_title : row.target_title,
    nodeType: side === "source" ? row.source_node_type : row.target_node_type,
    validationStatus: side === "source" ? row.source_validation_status : row.target_validation_status,
  };
}

function edgeViewOf(row: KgEdgeRow): ConceptGraphEdgeWireView {
  return {
    source: edgeNodeOf(row, "source"),
    target: edgeNodeOf(row, "target"),
    relation: row.relation_type,
    validationStatus: row.validation_status,
    provenance: row.provenance ?? "",
    rationale: row.rationale ?? "",
  };
}

export async function teacherConceptEdges(
  deps: KnowledgeDeps,
  rootId: string,
): Promise<{
  rootId: string;
  rootCode: string;
  policy: string;
  edges: ConceptGraphEdgeWireView[];
}> {
  const rootRows = (await deps.sql`
    select id, code from knowledge_nodes where id = ${rootId}::uuid`) as Array<{
    id: string;
    code: string;
  }>;
  const root = rootRows[0];
  if (root == null) {
    // NotFoundException("knowledge node", rootId) — 404-first
    throw new KnowledgeNotFoundError("knowledge node not found: " + rootId);
  }
  const subtree = await subtreeIds(deps, root.id);

  // the scope widening (:92-94): misconception-family edge SOURCES join the
  // scope — they attach into the subtree, they are not PART_OF members
  const family = await misconceptionFamilyEdgesWithin(deps, subtree);
  const scope = [...subtree];
  for (const e of family) scope.push(e.source_node_id);

  // the semantic read model: non-PART_OF, BOTH endpoints inside the scope
  const semantic = await semanticEdgesWithin(deps, scope);
  const views = semantic.map(edgeViewOf).sort(
    (a, b) =>
      a.relation.localeCompare(b.relation) ||
      a.source.code.localeCompare(b.source.code) ||
      a.target.code.localeCompare(b.target.code),
  );

  return {
    rootId: root.id,
    rootCode: root.code,
    policy: CONCEPT_GRAPH_TEACHER_POLICY,
    edges: views,
  };
}
