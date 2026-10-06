/**
 * CurriculumReviewService READ port — the observed query surface of the frozen
 * teacher validation-workflow reads (CurriculumReviewService.java; the write
 * flows — ingest/validate/reject/activate/archive — are OUT of this tranche's
 * fence, T-MIG-021 scopes the read surfaces per the dossier + contracts note).
 *
 * Frozen read methods (R-M-LAZY: call sequence is the port):
 *   versions()  :48-72  — for every curriculum_versions row (created_at desc):
 *                         for every subject (code asc): treeCounts(root) —
 *                         sum VALIDATED/SUGGESTED/UNVALIDATED over the
 *                         subject's PART_OF subtree — then CurriculumOverview.
 *   nodes()     :75-90  — for every subject (code asc) of the version:
 *                         findSubtreeIds(root), per-node fetch + optional
 *                         status filter, NodeView.from(node, parentIdOf) —
 *                         then ONE in-memory sort by node code (:89).
 *   treeCounts  :181-194 — null root contributes nothing (:183-185 guard).
 *   parentIdOf  :164-169 — the PART_OF edge out of the node, else null.
 *
 * Subtree definition = KnowledgeNodeRepository.findSubtreeIds' recursive CTE,
 * carried VERBATIM (KnowledgeNodeRepository.java:436-444: seed row UNION
 * PART_OF children, child->parent edge direction). Parity decisions (all
 * observable-equivalent, disclosed in receipt run-001-tranche1):
 *   1. treeCounts' per-node findById N+1 -> one aggregation over the same
 *      CTE (the null-node skip is unobservable in SQL; counts identical).
 *   2. parentIdOf's per-node edge lookup -> LEFT JOIN in the same statement
 *      (findBySourceIdAndRelationType returns Optional — at most one PART_OF
 *      parent per node is a frozen-system invariant).
 *   3. Java's post-fetch status filter -> WHERE on the same exact-match
 *      predicate.
 *   4. The final in-memory sort by code is PRESERVED in TypeScript (:89) —
 *      codes are unique (uq_knowledge_node_code) so stability is moot, but
 *      the ordering itself is load-bearing parity (String.compareTo ==
 *      JS default string order for the ASCII code domain).
 *
 * View shapes mirror packages/contracts/src/curriculum.ts
 * (curriculumOverviewSchema, knowledgeNodeViewSchema — R1's T-MIG-005 branch
 * 0cd5e93); nodeType/validationStatus are the stored strings — the DB CHECKs
 * constrain them, not this layer (V2:28-31/34-37; V15's CONCEPT addition is
 * migration-owned; same doctrine as T-MIG-020's kind treatment).
 */
import type { SqlFn } from "./sql";
import {
  CurriculumVersionsRepository,
  type CurriculumVersionRow,
  type CurriculumVersionView,
} from "./versions";
import { SubjectsRepository } from "./subjects";

export type KnowledgeNodeValidationStatus = "UNVALIDATED" | "SUGGESTED" | "VALIDATED";

export interface CurriculumOverview {
  id: string;
  board: string;
  qualification: string;
  code: string;
  title: string;
  status: CurriculumVersionView["status"];
  validatedNodes: number;
  suggestedNodes: number;
  unvalidatedNodes: number;
}

export interface KnowledgeNodeView {
  id: string;
  code: string;
  nodeType: string;
  title: string;
  validationStatus: KnowledgeNodeValidationStatus;
  provenance: string | null;
  parentId: string | null;
}

/** CurriculumReviewService.java:214-217 record shape (Status.name() as string). */
export function overviewOf(
  v: CurriculumVersionRow,
  counts: { validated: number; suggested: number; unvalidated: number },
): CurriculumOverview {
  return {
    id: v.id,
    board: v.board,
    qualification: v.qualification,
    code: v.code,
    title: v.title,
    status: v.status,
    validatedNodes: counts.validated,
    suggestedNodes: counts.suggested,
    unvalidatedNodes: counts.unvalidated,
  };
}

/** The teacher review READ surface (versions() + nodes()), CurriculumReviewService.java:48-90. */
export class CurriculumReviewReader {
  constructor(
    private readonly sql: SqlFn,
    private readonly versions: CurriculumVersionsRepository,
    private readonly subjects: SubjectsRepository,
  ) {}

  private async treeCounts(
    rootId: string | null,
  ): Promise<{ validated: number; suggested: number; unvalidated: number }> {
    if (rootId === null) return { validated: 0, suggested: 0, unvalidated: 0 };
    // BIND-SLOT LAW (T-MIG-067 P1 500-class): a plain-string interpolation
    // inside the sql template renders a bind parameter, not SQL text — the
    // former leading `${""}` comment slot sent the statement as
    // "$1\n select n.validation_status …" and Postgres rejected it with
    // 42601 "syntax error at or near $1" (position 8 = the leading
    // newline+indent), 500-ing teacher-curriculum-versions on the live
    // instrument (run #11 boot log). Keep prose comments OUT of the template.
    const rows = await this.sql`
      select n.validation_status, count(*)::int as count
      from knowledge_nodes n
      where n.id in (
        with recursive subtree as (
          select n.id from knowledge_nodes n where n.id = ${rootId}
          union
          select e.source_node_id from knowledge_edges e
          join subtree s on e.target_node_id = s.id
          where e.relation_type = 'PART_OF'
        )
        select id from subtree
      )
      group by n.validation_status`;
    const counts = { validated: 0, suggested: 0, unvalidated: 0 };
    for (const r of rows) {
      const n = Number(r.count);
      switch (String(r.validation_status)) {
        case "VALIDATED":
          counts.validated += n;
          break;
        case "SUGGESTED":
          counts.suggested += n;
          break;
        default:
          counts.unvalidated += n;
      }
    }
    return counts;
  }

  /**
   * versions() :48-72 — per-version overview rows, versions newest-first,
   * counts summed across the version's subjects (code asc).
   */
  async overviewRows(): Promise<CurriculumOverview[]> {
    const out: CurriculumOverview[] = [];
    for (const v of await this.versions.findAllByOrderByCreatedAtDesc()) {
      const totals = { validated: 0, suggested: 0, unvalidated: 0 };
      for (const subject of await this.subjects.findByCurriculumVersionIdOrderByCode(v.id)) {
        const counts = await this.treeCounts(subject.knowledgeNodeId);
        totals.validated += counts.validated;
        totals.suggested += counts.suggested;
        totals.unvalidated += counts.unvalidated;
      }
      out.push(overviewOf(v, totals));
    }
    return out;
  }

  /**
   * nodes() :75-90 — review queue for one version; unknown version yields []
   * (subjects query is empty — NO existence check, the captured F-1 posture),
   * optional exact-match status filter, final in-memory sort by code.
   */
  async nodeRows(
    curriculumVersionId: string,
    status?: KnowledgeNodeValidationStatus,
  ): Promise<KnowledgeNodeView[]> {
    const views: KnowledgeNodeView[] = [];
    for (const subject of await this.subjects.findByCurriculumVersionIdOrderByCode(
      curriculumVersionId,
    )) {
      if (subject.knowledgeNodeId === null) continue; // treeCounts guard parity (:183-185)
      let rows: Array<Record<string, unknown>>;
      if (status === undefined) {
        // unfiltered queue — Java fetches all and skips non-matching post-fetch
        rows = await this.sql`
      select n.id, n.code, n.node_type, n.title, n.validation_status, n.provenance,
             pe.target_node_id as parent_id
      from knowledge_nodes n
      left join knowledge_edges pe
        on pe.source_node_id = n.id and pe.relation_type = 'PART_OF'
      where n.id in (
        with recursive subtree as (
          select n.id from knowledge_nodes n where n.id = ${subject.knowledgeNodeId}
          union
          select e.source_node_id from knowledge_edges e
          join subtree s on e.target_node_id = s.id
          where e.relation_type = 'PART_OF'
        )
        select id from subtree
      )`;
      } else {
        // status-filtered queue — the exact-match predicate pushed into the
        // same statement (observable parity with the post-fetch skip, :84)
        rows = await this.sql`
      select n.id, n.code, n.node_type, n.title, n.validation_status, n.provenance,
             pe.target_node_id as parent_id
      from knowledge_nodes n
      left join knowledge_edges pe
        on pe.source_node_id = n.id and pe.relation_type = 'PART_OF'
      where n.id in (
        with recursive subtree as (
          select n.id from knowledge_nodes n where n.id = ${subject.knowledgeNodeId}
          union
          select e.source_node_id from knowledge_edges e
          join subtree s on e.target_node_id = s.id
          where e.relation_type = 'PART_OF'
        )
        select id from subtree
      )
      and n.validation_status = ${status}`;
      }
      for (const r of rows) {
        views.push({
          id: String(r.id),
          code: String(r.code),
          nodeType: String(r.node_type),
          title: String(r.title),
          validationStatus: String(r.validation_status) as KnowledgeNodeValidationStatus,
          provenance: r.provenance == null ? null : String(r.provenance),
          parentId: r.parent_id == null ? null : String(r.parent_id),
        });
      }
    }
    views.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return views;
  }
}
