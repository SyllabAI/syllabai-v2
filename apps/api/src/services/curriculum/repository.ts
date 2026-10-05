/**
 * Curriculum read-model repositories (T-MIG-021 tranche 1) — the OBSERVED
 * query surface of the frozen core's CurriculumVersionRepository.java,
 * SubjectRepository.java and the knowledge read paths
 * CurriculumReviewService actually exercises (R-M-LAZY: port the observed
 * behaviour, not the entity mappings).
 *
 * Flyway-owned tables referenced in SQL only — zero DDL, zero writes
 * (BASELINE_DB.md §4.1). Table/column names verified against the T-MIG-002
 * drizzle baseline (curriculum_versions, subjects, knowledge_nodes,
 * knowledge_edges).
 *
 * Every query is a full literal tagged template: interpolations carry
 * VALUES only (identifiers/column lists cannot be parameterized), and
 * keeping each statement self-contained is what lets the unit tests pin
 * the SQL shape — order-by clauses and gate predicates are load-bearing
 * parity, not implementation detail.
 */
import type { SqlFn, Row } from "./sql";

/** Subject row joined with its curriculum version (SubjectView nest). */
export interface SubjectWithVersionRow extends Row {
  id: string;
  code: string;
  name: string;
  knowledge_node_id: string | null;
  cv_id: string;
  cv_board: string;
  cv_qualification: string;
  cv_code: string;
  cv_title: string;
  cv_status: string;
}

export class CurriculumVersionsRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findAllByOrderByCreatedAtDesc (CurriculumVersionRepository.java:13).
   * The view omits created_at, so the column slice is the 6 view fields.
   */
  async findAllByOrderByCreatedAtDesc(): Promise<Row[]> {
    return this.sql`select id, board, qualification, code, title, status from curriculum_versions order by created_at desc`;
  }

  /** findByStatusOrderByCreatedAtDesc (:11) — status is the stored string. */
  async findByStatusOrderByCreatedAtDesc(status: string): Promise<Row[]> {
    return this.sql`select id, board, qualification, code, title, status from curriculum_versions where status = ${status} order by created_at desc`;
  }
}

export class SubjectsRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findAllByOrderByCode (SubjectRepository.java:21). SubjectRepository's
   * @EntityGraph(attributePaths = "curriculumVersion") fetches the parent
   * version alongside every subject row — the view nests it, so the port
   * issues the join directly. INNER join is response-identical to
   * Hibernate's left-join fetch because subjects.curriculum_version_id is
   * NOT NULL (T-MIG-002 baseline). The joined column list is inlined in
   * full in each of the three subject queries (identifiers cannot be
   * parameterized through the SqlFn tag).
   */
  async findAllByOrderByCode(): Promise<SubjectWithVersionRow[]> {
    return this.sql`select s.id, s.code, s.name, s.knowledge_node_id, cv.id as cv_id, cv.board as cv_board, cv.qualification as cv_qualification, cv.code as cv_code, cv.title as cv_title, cv.status as cv_status from subjects s join curriculum_versions cv on cv.id = s.curriculum_version_id order by s.code` as unknown as Promise<SubjectWithVersionRow[]>;
  }

  /** findByCurriculumVersionIdOrderByCode (:12). */
  async findByCurriculumVersionIdOrderByCode(versionId: string): Promise<SubjectWithVersionRow[]> {
    return this.sql`select s.id, s.code, s.name, s.knowledge_node_id, cv.id as cv_id, cv.board as cv_board, cv.qualification as cv_qualification, cv.code as cv_code, cv.title as cv_title, cv.status as cv_status from subjects s join curriculum_versions cv on cv.id = s.curriculum_version_id where s.curriculum_version_id = ${versionId} order by s.code` as unknown as Promise<SubjectWithVersionRow[]>;
  }

  /** findWithVersionById — the joined read model (subject-by-id path). */
  async findWithVersionById(id: string): Promise<SubjectWithVersionRow | null> {
    const rows = await this.sql`select s.id, s.code, s.name, s.knowledge_node_id, cv.id as cv_id, cv.board as cv_board, cv.qualification as cv_qualification, cv.code as cv_code, cv.title as cv_title, cv.status as cv_status from subjects s join curriculum_versions cv on cv.id = s.curriculum_version_id where s.id = ${id}`;
    return (rows[0] as SubjectWithVersionRow) ?? null;
  }
}

/**
 * Knowledge-node read model over knowledge_nodes/knowledge_edges — ONLY the
 * read paths CurriculumReviewService's GET surface exercises
 * (CurriculumReviewService.java:57-93, :169-182). This is a SLICE of the
 * knowledge domain, scoped to what the 13 curriculum golden cases gate; the
 * full knowledge port is Wave 5 (T-MIG-05x) and stays out of this fence.
 */
export class KnowledgeStructureRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findSubtreeIds (KnowledgeNodeRepository.java:33-46) — the recursive CTE
   * ported VERBATIM. The Java comment pins the doctrine: "the subtree id
   * set still comes from findSubtreeIds, which stays the single source of
   * truth for the subtree definition — the recursive CTE is never
   * duplicated". Only the :rootId bind parameter is named ($1 here).
   */
  async findSubtreeIds(rootId: string): Promise<string[]> {
    const rows = await this.sql`WITH RECURSIVE subtree AS (
                SELECT n.id
                FROM knowledge_nodes n
                WHERE n.id = ${rootId}
                UNION
                SELECT e.source_node_id
                FROM knowledge_edges e
                JOIN subtree s ON e.target_node_id = s.id
                WHERE e.relation_type = 'PART_OF'
            )
            SELECT n.id FROM knowledge_nodes n WHERE n.id IN (SELECT id FROM subtree)`;
    return rows.map((r) => String(r.id));
  }

  /**
   * Batched node fetch for the subtree walk. The Java service does one
   * findById per subtree id (CurriculumReviewService.java:83-84, :175-177 —
   * an N+1); the RESPONSE-IDENTICAL port selects the same rows in one
   * statement (documented deviation, receipt run-001: N+1 collapse, no
   * response or ordering effect — callers sort deterministically).
   * Empty input short-circuits (Java would loop zero times).
   */
  async findNodesByIds(ids: string[]): Promise<Row[]> {
    if (ids.length === 0) return [];
    return this.sql`select id, code, node_type, title, validation_status, provenance from knowledge_nodes where id = any(${ids}::uuid[])`;
  }

  /**
   * PART_OF parent lookup, batched over the node set — the batched twin of
   * parentIdOf's findBySourceIdAndRelationType(node.id, PART_OF)
   * (KnowledgeEdgeRepository derived query; CurriculumReviewService.java:154-158).
   * Java returns Optional and would throw on multiple rows; the schema keeps
   * one PART_OF parent per node structurally, so first-row-wins is
   * response-identical for every reachable state (noted in receipt).
   */
  async findPartOfParentsBySources(sourceIds: string[]): Promise<Record<string, string>> {
    if (sourceIds.length === 0) return {};
    const rows = await this.sql`select source_node_id, target_node_id from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any(${sourceIds}::uuid[])`;
    const map: Record<string, string> = {};
    for (const r of rows) {
      const src = String(r.source_node_id);
      if (!(src in map)) map[src] = String(r.target_node_id);
    }
    return map;
  }
}
