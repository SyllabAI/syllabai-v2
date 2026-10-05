/**
 * View mappings for the curriculum read port (T-MIG-021 tranche 1) — the
 * exact response shapes the frozen core serves, pinned by the 13 curriculum
 * golden cases (T-MIG-004 run-002 capture, fixed-uuid V6 seed).
 *
 * Ports:
 *   - dto/CurriculumVersionView.java   → CurriculumVersionView
 *   - dto/SubjectView.java             → SubjectView (nests CurriculumVersionView)
 *   - CurriculumReviewService.CurriculumOverview → CurriculumOverview
 *   - CurriculumReviewService.NodeView → NodeView
 *
 * Jackson renders the Java records camelCase with nulls INCLUDED — the
 * golden cases pin `knowledgeNodeId: null`-style fields, so optional keys
 * are always present (mapped from snake_case columns, `?? null`).
 * Enum-ish columns (status, node_type, validation_status) are kept as the
 * stored strings — the DB CHECKs constrain them (T-MIG-020 precedent:
 * "the DB constrains, not this layer").
 */
import type { Row } from "./sql";

/** CurriculumVersionView.java — 6 fields, NO createdAt (golden-pinned). */
export interface CurriculumVersionView {
  id: string;
  board: string;
  qualification: string;
  code: string;
  title: string;
  status: string;
}

/** SubjectView.java — knowledgeNodeId nullable; nests the version view. */
export interface SubjectView {
  id: string;
  code: string;
  name: string;
  knowledgeNodeId: string | null;
  curriculumVersion: CurriculumVersionView;
}

/** CurriculumReviewService.CurriculumOverview record (:214-217). */
export interface CurriculumOverview {
  id: string;
  board: string;
  qualification: string;
  code: string;
  title: string;
  status: string;
  validatedNodes: number;
  suggestedNodes: number;
  unvalidatedNodes: number;
}

/** CurriculumReviewService.NodeView record (:228-229). */
export interface NodeView {
  id: string;
  code: string;
  nodeType: string;
  title: string;
  validationStatus: string;
  provenance: string | null;
  parentId: string | null;
}

const str = (v: unknown): string => String(v);

export function curriculumVersionView(r: Row): CurriculumVersionView {
  return {
    id: str(r.id),
    board: str(r.board),
    qualification: str(r.qualification),
    code: str(r.code),
    title: str(r.title),
    status: str(r.status),
  };
}

export function subjectView(r: Row): SubjectView {
  return {
    id: str(r.id),
    code: str(r.code),
    name: str(r.name),
    knowledgeNodeId: r.knowledge_node_id === null || r.knowledge_node_id === undefined ? null : str(r.knowledge_node_id),
    curriculumVersion: {
      id: str(r.cv_id),
      board: str(r.cv_board),
      qualification: str(r.cv_qualification),
      code: str(r.cv_code),
      title: str(r.cv_title),
      status: str(r.cv_status),
    },
  };
}

export function nodeView(r: Row, parentId: string | null): NodeView {
  return {
    id: str(r.id),
    code: str(r.code),
    nodeType: str(r.node_type),
    title: str(r.title),
    validationStatus: str(r.validation_status),
    provenance: r.provenance === null || r.provenance === undefined ? null : str(r.provenance),
    parentId,
  };
}
