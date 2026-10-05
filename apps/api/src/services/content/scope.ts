/**
 * CurriculumScopeResolver port (T-MIG-020) — the serving-scope resolution
 * every search ask runs through (T-C07). Source:
 * curriculum/CurriculumScopeResolver.java @ 6cad6ef (resolution policy
 * javadoc :20-45, resolveActive, resolveForCourse:121-129,
 * singleOwnerScope + STRUCTURE_NODE_TYPES:63-66).
 *
 * Resolution policy — deterministic, read-only, fail-closed:
 *   1. Candidates: curriculum_versions with status ACTIVE.
 *   2. A candidate OWNS serving surface when any of its subjects has a KG
 *      subject root whose PART_OF subtree contains ≥1 VALIDATED structure
 *      node (UNIT/TOPIC/SUBTOPIC — the pinned list, CONCEPT can never leak),
 *      OR owns ≥1 exam paper (the chunk surface, via subjects.subject_id).
 *   3. Exactly one owner → its scope. Zero or ≥2 → EMPTY (refuse, never
 *      serve across curricula).
 */
import { createSql } from "../identity/users";

type Sql = ReturnType<typeof createSql>;

export interface CurriculumScope {
  curriculumVersionId: string;
  code: string;
  subjectRootIds: string[];
}

/**
 * The recursive PART_OF subtree walk re-states the KnowledgeNodeRepository
 * findSubtreeIds CTE (the single source of truth); the owns-surface test is
 * the batched predicate from KnowledgeNodeRepository.java:58-61 — any
 * UNIT/TOPIC/SUBTOPIC node with VALIDATED status inside the subject's
 * subtree. Inlined into the correlated EXISTS (NeonSql is a tagged-template
 * session — no sql.raw composition). No semantics invented here.
 */

export class CurriculumScopeResolver {
  constructor(private sql: Sql) {}

  private async activeCandidates(): Promise<Array<{ id: string; code: string }>> {
    return (await this.sql`
      select id, code from curriculum_versions where status = 'ACTIVE'`) as Array<{
      id: string;
      code: string;
    }>;
  }

  /** ownsSurface(versionId) — the KG intent surface OR the chunk surface. */
  private async ownsSurface(versionId: string): Promise<boolean> {
    const rows = await this.sql`
      select exists(
        select 1 from subjects s
        where s.curriculum_version_id = ${versionId}::uuid
          and s.knowledge_node_id is not null
          and exists (
            with recursive subtree as (
              select kn.id, kn.node_type, kn.validation_status
              from knowledge_nodes kn
              where kn.id = s.knowledge_node_id
              union all
              select kn.id, kn.node_type, kn.validation_status
              from knowledge_nodes kn
              join knowledge_edges e on e.source_node_id = kn.id
              join subtree st on e.target_node_id = st.id
              where e.relation_type = 'PART_OF'
            )
            select 1 from subtree
            where node_type in ('UNIT','TOPIC','SUBTOPIC')
              and validation_status = 'VALIDATED'
          )
      ) or exists (
        select 1 from exam_papers p
        join subjects s2 on s2.id = p.subject_id
        where s2.curriculum_version_id = ${versionId}::uuid
      ) as owns`;
    return rows[0]?.owns === true;
  }

  /** singleOwnerScope — exactly one surface-owning candidate serves. */
  private async singleOwnerScope(
    candidates: Array<{ id: string; code: string }>,
  ): Promise<CurriculumScope | null> {
    const owners: Array<{ id: string; code: string }> = [];
    for (const c of candidates) {
      if (await this.ownsSurface(c.id)) {
        if (owners.length > 0) return null; // ambiguous → refuse
        owners.push(c);
      }
    }
    const owner = owners[0];
    if (owner === undefined) return null;
    const roots = (await this.sql`
      select knowledge_node_id as id from subjects
      where curriculum_version_id = ${owner.id}::uuid and knowledge_node_id is not null
      order by code`) as Array<{ id: string }>;
    return {
      curriculumVersionId: owner.id,
      code: owner.code,
      subjectRootIds: roots.map((r) => r.id),
    };
  }

  /** resolveActive — learner-independent by design (the learnerId hook is
   *  reserved for the future per-learner selector). */
  async resolveActive(_requesterId: string): Promise<CurriculumScope | null> {
    return this.singleOwnerScope(await this.activeCandidates());
  }

  /** resolveForCourse (V53 / ADR-030) — exact ACTIVE code match on the core's
   *  OWN registry, same ownsSurface test; zero or ambiguous → null. */
  async resolveForCourse(courseRef: string): Promise<CurriculumScope | null> {
    const ref = courseRef.trim();
    if (ref === "") return null;
    const candidates = (await this.sql`
      select id, code from curriculum_versions
      where code = ${ref} and status = 'ACTIVE'`) as Array<{ id: string; code: string }>;
    return this.singleOwnerScope(candidates);
  }
}
