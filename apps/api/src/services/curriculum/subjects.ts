/**
 * SubjectRepository port — the OBSERVED query surface of the frozen
 * SubjectRepository.java against the Flyway-owned `subjects` table
 * (V2__curriculum_knowledge.sql:19-26; R-M-LAZY doctrine).
 *
 * Frozen callers:
 *   - CurriculumController.subjects(:48-55): versionId == null
 *     -> findAllByOrderByCode(); else findByCurriculumVersionIdOrderByCode(id)
 *   - CurriculumController.subject(:57-61): findById(id) -> orElseThrow
 *     NotFoundException("subject", id) — message "subject <uuid> not found"
 *     (NotFoundException.java:16-19), rendered by the route layer as the
 *     captured ApiError 404 envelope (curriculum-subject-unknown-404).
 *   - CurriculumReviewService.versions()/nodes(): subjects ordered by code
 *     per version — the iteration spine of the teacher read surface.
 *
 * Every listing method carries the @EntityGraph(attributePaths =
 * "curriculumVersion") fetch (SubjectRepository.java:13-31): the LAZY
 * ManyToOne is materialised within the frozen transaction, so the port
 * JOINs curriculum_versions in the same statement — SubjectView.from
 * (SubjectView.java:11-18) then never touches a lazy proxy.
 *
 * View shape mirrors packages/contracts/src/curriculum.ts subjectViewSchema
 * (R1's T-MIG-005 branch 0cd5e93); knowledgeNodeId nullable (V2 column allows
 * null — a subject without a KG root; capture shows the populated case).
 */
import type { SqlFn } from "./sql";
import { mapVersionRow, type CurriculumVersionRow, type CurriculumVersionView, versionView } from "./versions";

/** subjects row joined with its curriculum_versions row (snake_case as stored). */
export interface SubjectJoinedRow {
  id: string;
  curriculumVersionId: string;
  code: string;
  name: string;
  knowledgeNodeId: string | null;
  createdAt: Date;
  version: CurriculumVersionRow;
}

/** SubjectView.java:11-18 — the wire shape (camelCase, nested version view). */
export interface SubjectView {
  id: string;
  code: string;
  name: string;
  knowledgeNodeId: string | null;
  curriculumVersion: CurriculumVersionView;
}

// NOTE: column lists are inlined in each template's static text on purpose —
// in a tagged template every ${} slot is a BIND PARAMETER, never SQL text, so
// a shared fragment constant would be sent as a value and break both the
// prepared statement and the stub's query-text pinning.

export function mapSubjectJoinedRow(r: Record<string, unknown>): SubjectJoinedRow {
  return {
    id: String(r.id),
    curriculumVersionId: String(r.curriculum_version_id),
    code: String(r.code),
    name: String(r.name),
    knowledgeNodeId: r.knowledge_node_id == null ? null : String(r.knowledge_node_id),
    createdAt: new Date(r.created_at as string),
    version: mapVersionRow({
      id: r.v_id,
      board: r.board,
      qualification: r.qualification,
      code: r.v_code,
      title: r.v_title,
      status: r.v_status,
      created_at: r.v_created_at,
    }),
  };
}

export function subjectView(s: SubjectJoinedRow): SubjectView {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    knowledgeNodeId: s.knowledgeNodeId,
    curriculumVersion: versionView(s.version),
  };
}

export class SubjectsRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findAllByOrderByCode() — the unfiltered /subjects path (EntityGraph join in-statement). */
  async findAllByOrderByCode(): Promise<SubjectJoinedRow[]> {
    const rows = await this.sql`
      select s.id, s.curriculum_version_id, s.code, s.name, s.knowledge_node_id, s.created_at,
             v.id as v_id, v.board, v.qualification, v.code as v_code, v.title as v_title,
             v.status as v_status, v.created_at as v_created_at
      from subjects s
      join curriculum_versions v on v.id = s.curriculum_version_id
      order by s.code`;
    return rows.map(mapSubjectJoinedRow);
  }

  /** findByCurriculumVersionIdOrderByCode(versionId) — the /subjects?versionId= path and the review-service spine. */
  async findByCurriculumVersionIdOrderByCode(versionId: string): Promise<SubjectJoinedRow[]> {
    const rows = await this.sql`
      select s.id, s.curriculum_version_id, s.code, s.name, s.knowledge_node_id, s.created_at,
             v.id as v_id, v.board, v.qualification, v.code as v_code, v.title as v_title,
             v.status as v_status, v.created_at as v_created_at
      from subjects s
      join curriculum_versions v on v.id = s.curriculum_version_id
      where s.curriculum_version_id = ${versionId}
      order by s.code`;
    return rows.map(mapSubjectJoinedRow);
  }

  /** findById(id) — the /subjects/{id} path; null maps to the route-layer 404 (NotFoundException format). */
  async findById(id: string): Promise<SubjectJoinedRow | null> {
    const rows = await this.sql`
      select s.id, s.curriculum_version_id, s.code, s.name, s.knowledge_node_id, s.created_at,
             v.id as v_id, v.board, v.qualification, v.code as v_code, v.title as v_title,
             v.status as v_status, v.created_at as v_created_at
      from subjects s
      join curriculum_versions v on v.id = s.curriculum_version_id
      where s.id = ${id}`;
    const row = rows[0];
    return row ? mapSubjectJoinedRow(row) : null;
  }
}
