/**
 * CurriculumScopeResolver port — the serving-scope resolution every content
 * read surface shares (T-C07). Ported from the frozen
 * curriculum/CurriculumScopeResolver.java (verified 2026-10-05, T-MIG-020).
 *
 * Resolution policy (CurriculumScopeResolver.java:21-41 — deterministic,
 * read-only, fail-closed):
 *   1. Candidates: curriculum_versions with status ACTIVE.
 *   2. A candidate OWNS serving surface when any of its subjects has a KG
 *      subject root whose PART_OF subtree contains a VALIDATED
 *      UNIT/TOPIC/SUBTOPIC node, OR owns ≥1 exam paper.
 *   3. Exactly one owner → its scope. Zero or ≥2 → EMPTY (refuse, never
 *      serve across curricula). This is the deliberate forcing function —
 *      when a second curriculum gains surface the resolver stops resolving
 *      until a per-learner selector lands.
 *
 * V53 per-course resolution (ADR-030, :121-129): resolveForCourse(ref) —
 * EXACT code match among ACTIVE versions (no prefix, no normalization, no
 * fuzzy variants), then the SAME ownsSurface test. Blank/unmatched/
 * ambiguous → empty; callers refuse deterministically. NO fallback to the
 * global scope (a wrong-corpus answer is worse than a refusal).
 *
 * M3 memo: the subject-root subtree CTE runs at most once per root per
 * resolution (memoized in the resolution frame, never shared across
 * requests) — byte-identical decisions to the pre-M3 flow.
 */
import type { SqlFn } from "../identity/users";

export interface CurriculumScope {
  curriculumVersionId: string;
  code: string;
  /** KG intent surface: union of the PART_OF subtree ids under the version's subject roots. */
  surface: Set<string>;
}

type Row = Record<string, unknown>;

export class CurriculumScopeResolver {
  constructor(private readonly sql: SqlFn) {}

  /** Verbatim port of KnowledgeNodeRepository.findSubtreeIds (recursive CTE). */
  private async subtreeIds(rootId: string, memo: Map<string, string[]>): Promise<string[]> {
    const hit = memo.get(rootId);
    if (hit) return hit;
    const rows: Row[] = await this.sql`
      WITH RECURSIVE subtree AS (
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
    const ids = rows.map((r) => String(r.id));
    memo.set(rootId, ids);
    return ids;
  }

  /**
   * T-C32 batched ownership predicate over an already-resolved subtree id
   * set (:200-206): a subtree owns KG surface iff it contains a
   * UNIT/TOPIC/SUBTOPIC node whose validation is VALIDATED; an empty
   * subtree fails closed without touching the predicate.
   */
  private async hasValidatedStructure(subtree: string[]): Promise<boolean> {
    if (subtree.length === 0) return false;
    const rows: Row[] = await this.sql`
      select exists (
        select 1 from knowledge_nodes
        where id = any(${subtree}::uuid[])
          and node_type in ('UNIT', 'TOPIC', 'SUBTOPIC')
          and validation_status = 'VALIDATED'
      ) as present`;
    return rows[0]?.present === true;
  }

  /** Ownership test (:178-189): KG intent surface or exam-paper surface. */
  private async ownsSurface(versionId: string, memo: Map<string, string[]>): Promise<boolean> {
    const subjects: Row[] = await this.sql`
      select id, knowledge_node_id from subjects
      where curriculum_version_id = ${versionId}
      order by code`;
    for (const subject of subjects) {
      const rootId = subject.knowledge_node_id == null ? null : String(subject.knowledge_node_id);
      if (rootId !== null && (await this.hasValidatedStructure(await this.subtreeIds(rootId, memo)))) {
        return true;
      }
      const paperRows: Row[] = await this.sql`
        select exists (select 1 from exam_papers where subject_id = ${String(subject.id)}) as present`;
      if (paperRows[0]?.present === true) return true;
    }
    return false;
  }

  /** KG intent surface (:166-175): union of PART_OF subtrees under subject roots. */
  private async intentSurface(versionId: string, memo: Map<string, string[]>): Promise<Set<string>> {
    const surface = new Set<string>();
    const subjects: Row[] = await this.sql`
      select id, knowledge_node_id from subjects
      where curriculum_version_id = ${versionId}
      order by code`;
    for (const subject of subjects) {
      const rootId = subject.knowledge_node_id == null ? null : String(subject.knowledge_node_id);
      if (rootId !== null) {
        for (const id of await this.subtreeIds(rootId, memo)) surface.add(id);
      }
    }
    return surface;
  }

  /** Shared fail-closed tail of both resolution paths (:143-163). */
  private async singleOwnerScope(
    candidates: Array<{ id: string; code: string }>,
  ): Promise<CurriculumScope | null> {
    const memo = new Map<string, string[]>();
    const owners: Array<{ id: string; code: string }> = [];
    for (const version of candidates) {
      if (await this.ownsSurface(version.id, memo)) owners.push(version);
    }
    if (owners.length !== 1) return null;
    const version = owners[0]!;
    return {
      curriculumVersionId: version.id,
      code: version.code,
      surface: await this.intentSurface(version.id, memo),
    };
  }

  /**
   * Global path (resolveActive :98-103). `learnerId` is reserved for the
   * future per-learner selector — today the resolution is learner-
   * independent by design; the parameter is accepted for call-site parity
   * and ignored.
   */
  async resolveActive(_learnerId: string | null): Promise<CurriculumScope | null> {
    const rows: Row[] = await this.sql`
      select id, code from curriculum_versions
      where status = 'ACTIVE'
      order by created_at desc`;
    return this.singleOwnerScope(rows.map((r) => ({ id: String(r.id), code: String(r.code) })));
  }

  /** V53 per-course path (resolveForCourse :121-129) — exact ACTIVE code match. */
  async resolveForCourse(courseRef: string | null | undefined): Promise<CurriculumScope | null> {
    if (courseRef == null || courseRef.trim() === "") return null;
    const ref = courseRef.trim();
    const rows: Row[] = await this.sql`
      select id, code from curriculum_versions
      where code = ${ref} and status = 'ACTIVE'`;
    return this.singleOwnerScope(rows.map((r) => ({ id: String(r.id), code: String(r.code) })));
  }
}
