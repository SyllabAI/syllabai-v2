/**
 * CurriculumVersionRepository port — the OBSERVED query surface of the frozen
 * CurriculumVersionRepository.java against the Flyway-owned `curriculum_versions`
 * table (V2__curriculum_knowledge.sql:8-17; R-M-LAZY doctrine: port the
 * repository call sequence, not the entity map).
 *
 * Frozen callers (CurriculumController.java:39-46):
 *   - versions(includeArchived=false) -> findByStatusOrderByCreatedAtDesc(ACTIVE)
 *   - versions(includeArchived=true)  -> findAllByOrderByCreatedAtDesc()
 * Both orderings are load-bearing parity (newest seed row first) and are
 * pinned by the stubbed-sql tests.
 *
 * View: CurriculumVersionView.java:6-14 — {id, board, qualification, code,
 * title, status(Status.name())}. Shape mirrors packages/contracts/src/
 * curriculum.ts curriculumVersionViewSchema (R1's T-MIG-005 branch 0cd5e93,
 * constraint-for-constraint); the contract import swap happens at tranche 2
 * when T-MIG-005 lands — local types here keep tranche 1 contract-independent.
 *
 * Status is treated as the stored string — the DB CHECK
 * (ck_curriculum_status: 'DRAFT'|'ACTIVE'|'ARCHIVED') constrains it, not
 * this layer (same doctrine as T-MIG-020's kind treatment).
 */
import type { SqlFn } from "./sql";

export type CurriculumVersionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Row as stored (snake_case columns of curriculum_versions, V2:8-17). */
export interface CurriculumVersionRow {
  id: string;
  board: string;
  qualification: string;
  code: string;
  title: string;
  status: CurriculumVersionStatus;
  createdAt: Date;
}

/** CurriculumVersionView.java:6-14 — the wire shape (camelCase). */
export interface CurriculumVersionView {
  id: string;
  board: string;
  qualification: string;
  code: string;
  title: string;
  status: CurriculumVersionStatus;
}

export function mapVersionRow(r: Record<string, unknown>): CurriculumVersionRow {
  return {
    id: String(r.id),
    board: String(r.board),
    qualification: String(r.qualification),
    code: String(r.code),
    title: String(r.title),
    status: String(r.status) as CurriculumVersionStatus,
    createdAt: new Date(r.created_at as string),
  };
}

export function versionView(v: CurriculumVersionRow): CurriculumVersionView {
  return {
    id: v.id,
    board: v.board,
    qualification: v.qualification,
    code: v.code,
    title: v.title,
    status: v.status,
  };
}

export class CurriculumVersionsRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findByStatusOrderByCreatedAtDesc(CurriculumVersion.Status.ACTIVE) — the default versions() path. */
  async findActiveByOrderByCreatedAtDesc(): Promise<CurriculumVersionRow[]> {
    const rows = await this.sql`
      select id, board, qualification, code, title, status, created_at
      from curriculum_versions
      where status = ${"ACTIVE"}
      order by created_at desc`;
    return rows.map(mapVersionRow);
  }

  /** findAllByOrderByCreatedAtDesc() — the includeArchived=true path. */
  async findAllByOrderByCreatedAtDesc(): Promise<CurriculumVersionRow[]> {
    const rows = await this.sql`
      select id, board, qualification, code, title, status, created_at
      from curriculum_versions
      order by created_at desc`;
    return rows.map(mapVersionRow);
  }
}
