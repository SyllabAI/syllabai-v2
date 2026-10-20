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
 *      serve across curricula).
 *
 * PER-LEARNER SELECTOR (stage 2 — TUTOR-REPAIR, trace 1a15a472c9c07531
 * "proceed with the repair directly (e.g., using the learner's subject as
 * the scope resolver)"): the forcing function above DID fire — the
 * 4MA1/4MB1 paper-bank wave (T-MIG-136/138) made a second/third ACTIVE
 * curriculum own surface, so the global path returns null for EVERY
 * courseRef-less ask and the legacy /tutor entry refuses deterministically
 * (the live outage of 10-20/21). Stage 2 lands the per-learner selector the
 * frozen header reserved learnerId for, WITHOUT weakening the fail-closed
 * law:
 *   1. the GLOBAL single-owner test runs first and UNCHANGED — a
 *      single-curriculum world resolves exactly as before, learner-
 *      independent, zero extra queries;
 *   2. only when the global test fails (zero or ≥2 owners) and a learnerId
 *      is present, the learner's OWN subject footprint nominates the
 *      candidate curricula: the subject-anchor node ids recorded by the
 *      explicit learner-footprint tables (tutor_topic_engagements.node_id —
 *      the ask history; skill_states.node_id — the practice history;
 *      struggle_inferences.topic_node_id — the measured-struggle history),
 *      walked UP the PART_OF graph to the subject roots they sit under
 *      (subjects.knowledge_node_id), joined to ACTIVE versions;
 *   3. the SAME singleOwnerScope ownership test runs over the learner's
 *      candidates — exactly one owner → its scope; zero or ≥2 → null, the
 *      identical refusal as today (a learner studying two subjects still
 *      fails closed; the per-course path remains their deterministic
 *      route). Anchors are explicit FK paths only — never slug parsing,
 *      never derived hub-registry data (the ADR-030 "never derived" law).
 *      No footprint → no nomination → the honest refusal (a cold-start
 *      learner's first ask stays gated exactly as before; the course-scoped
 *      /tutor?course= entry and the tutor's own engagement rows are the
 *      intended bootstraps).
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
   * Global path (resolveActive :98-103) + the per-learner selector (stage
   * 2 — see the class header). The global single-owner test runs
   * byte-identical to the frozen law; only its NULL outcome consults the
   * learner's subject footprint, and a null learnerId (anonymous previews,
   * the bank-bands surface) keeps the pre-selector behavior exactly.
   */
  async resolveActive(learnerId: string | null): Promise<CurriculumScope | null> {
    const rows: Row[] = await this.sql`
      select id, code from curriculum_versions
      where status = 'ACTIVE'
      order by created_at desc`;
    const global = await this.singleOwnerScope(
      rows.map((r) => ({ id: String(r.id), code: String(r.code) })),
    );
    if (global != null || learnerId == null) return global;
    return this.learnerSubjectScope(learnerId);
  }

  /**
   * Stage-2 anchor cap — the three footprint reads are bounded so a
   * pathological history cannot turn the selector into an unbounded CTE
   * (400 anchors each is orders of magnitude past any real learner window;
   * the most-recent rows are the strongest subject signal, and the
   * candidate query's UNION dedupes).
   */
  private static readonly LEARNER_ANCHOR_LIMIT = 400;

  /** The learner's subject-anchor node ids — three batched reads over the
   *  explicit footprint tables (ask history, practice history, struggle
   *  history). All three are optional evidence: any one non-empty set
   *  suffices to nominate candidates. */
  private async learnerAnchorNodeIds(learnerId: string): Promise<string[]> {
    const anchorLimit = CurriculumScopeResolver.LEARNER_ANCHOR_LIMIT;
    const [engagementRows, skillRows, struggleRows] = (await Promise.all([
      this.sql`select node_id from tutor_topic_engagements
        where learner_id = ${learnerId}
        order by occurred_at desc limit ${anchorLimit}`,
      this.sql`select node_id from skill_states
        where learner_id = ${learnerId}
        order by last_practiced_at desc limit ${anchorLimit}`,
      this.sql`select topic_node_id as node_id from struggle_inferences
        where learner_id = ${learnerId}
        order by generated_at desc limit ${anchorLimit}`,
    ])) as [Row[], Row[], Row[]];
    const ids = new Set<string>();
    for (const rows of [engagementRows, skillRows, struggleRows]) {
      for (const r of rows) {
        const id = r.node_id == null ? null : String(r.node_id);
        if (id != null) ids.add(id);
      }
    }
    return [...ids];
  }

  /** The learner's candidate ACTIVE curricula: the anchor nodes walked UP
   *  the PART_OF graph (children are the SOURCE of a PART_OF edge whose
   *  TARGET is the parent — the same edge direction the subtree CTE walks
   *  down) to the subject roots recorded in subjects.knowledge_node_id,
   *  joined to their ACTIVE curriculum_versions. Deterministic order:
   *  curriculum created_at desc — the same candidate ordering law the
   *  global path reads with. Subjects without a KG root contribute nothing
   *  (the intentSurface null-root guard). */
  private async learnerCandidateVersions(
    learnerId: string,
  ): Promise<Array<{ id: string; code: string }>> {
    const anchorIds = await this.learnerAnchorNodeIds(learnerId);
    if (anchorIds.length === 0) return [];
    const rows: Row[] = await this.sql`
      WITH RECURSIVE ancestry AS (
          SELECT n.id, n.id AS anchor_id
          FROM knowledge_nodes n
          WHERE n.id = ANY(${anchorIds}::uuid[])
          UNION
          SELECT e.target_node_id, a.anchor_id
          FROM knowledge_edges e
          JOIN ancestry a ON e.source_node_id = a.id
          WHERE e.relation_type = 'PART_OF'
      )
      SELECT DISTINCT cv.id, cv.code, cv.created_at
      FROM ancestry a
      JOIN subjects s ON s.knowledge_node_id = a.id
      JOIN curriculum_versions cv ON cv.id = s.curriculum_version_id
      WHERE cv.status = 'ACTIVE'
      ORDER BY cv.created_at DESC`;
    const seen = new Set<string>();
    const candidates: Array<{ id: string; code: string }> = [];
    for (const r of rows) {
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, code: String(r.code) });
    }
    return candidates;
  }

  /** The per-learner scope: the learner's own subject footprint nominates
   *  the candidate curricula, then the SAME singleOwnerScope ownership
   *  test decides — exactly one owner serves, zero or ≥2 refuse. No
   *  footprint → no nomination → null (the honest refusal; never a
   *  cross-corpus fallback). */
  private async learnerSubjectScope(learnerId: string): Promise<CurriculumScope | null> {
    const candidates = await this.learnerCandidateVersions(learnerId);
    if (candidates.length === 0) return null;
    return this.singleOwnerScope(candidates);
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
