/**
 * Test-builder SQL — the frozen query laws this surface needs that the
 * shared questions/curriculum modules do not already expose. Everything
 * mirrors the frozen sources (syllabai-core @ 6cad6ef) query-for-query:
 *   - KnowledgeNodeRepository.findSubtreeIds — PART_OF closure (inclusive),
 *     same CTE shape the T-MIG-021 curriculum port verified (review.ts).
 *   - KnowledgeGraphService.node — findById orElseThrow NotFound("knowledge
 *     node", id) (:160-163).
 *   - QuestionVersionRepository.findByQuestionIdOrderByVersionDesc — the
 *     current version fetch (explicit @Query "order by v.version desc").
 *   - MarkSchemeRepository.findFirstByQuestionVersionIdOrderByCreatedAtDesc
 *     + points with questionPart label (the answer-key fetch; the frozen
 *     entity orders points @OrderBy("ordering") — MarkScheme.java:73).
 *   - QuestionTopicRepository.findByQuestionIdIn — secondary topic mappings
 *     for the weakness targeting counts (primary+secondary builder rule).
 *
 * Servable serving itself goes through the ONE serving boundary — the
 * T-MIG-031 ServableQuestions class (activeByTopic/activeWithin), consumed
 * read-only; countServableByTopic is activeByTopic(topic).size() in the
 * frozen core too (ServableQuestionService.java:171-173).
 */
import type { SqlFn } from "../questions/sql";

export interface KnowledgeNodeRow {
  id: string;
  code: string;
  title: string;
}

export interface CurrentVersionRow {
  id: string;
  question_id: string;
  validation_state: string;
}

export interface MarkSchemeRow {
  id: string;
  validation_state: string;
}

export interface MarkPointRow {
  ref: string | null;
  text: string;
  marks: number;
  acceptance_criteria: string[] | null;
  part_label: string | null;
}

export interface QuestionTopicRow {
  node_id: string;
  question_id: string;
}

/** KnowledgeGraphService.subtreeIds — node 404 check + PART_OF closure. */
export async function findSubtreeIds(sql: SqlFn, rootId: string): Promise<string[]> {
  const rows = (await sql`
    with recursive subtree as (
      select n.id from knowledge_nodes n where n.id = ${rootId}
      union
      select e.source_node_id from knowledge_edges e
      join subtree s on e.target_node_id = s.id
      where e.relation_type = 'PART_OF'
    )
    select id from subtree
  `) as unknown as Array<{ id: string }>;
  return rows.map((r) => String(r.id));
}

/** KnowledgeGraphService.node — 404 contract (:164-166). */
export async function findNode(
  sql: SqlFn,
  id: string,
): Promise<KnowledgeNodeRow | null> {
  const rows = (await sql`
    select id, code, title from knowledge_nodes where id = ${id}
  `) as unknown as KnowledgeNodeRow[];
  const first = rows[0];
  return first === undefined ? null : first;
}

/**
 * QuestionVersionRepository.findByQuestionIdOrderByVersionDesc — ALL
 * versions of the question, latest first (the service takes findFirst()).
 * Mirror of the explicit @Query order law (version desc).
 */
export async function findVersionsByQuestionDesc(
  sql: SqlFn,
  questionId: string,
): Promise<CurrentVersionRow[]> {
  return (await sql`
    select id, question_id, validation_state
    from question_versions
    where question_id = ${questionId}
    order by version desc
  `) as unknown as CurrentVersionRow[];
}

/**
 * MarkSchemeRepository.findFirstByQuestionVersionIdOrderByCreatedAtDesc —
 * the current scheme for the version, points + part labels eagerly.
 */
export async function findSchemeWithPoints(
  sql: SqlFn,
  versionId: string,
): Promise<{ scheme: MarkSchemeRow; points: MarkPointRow[] } | null> {
  const schemeRows = (await sql`
    select id, validation_state
    from mark_schemes
    where question_version_id = ${versionId}
    order by created_at desc
    limit 1
  `) as unknown as MarkSchemeRow[];
  const scheme = schemeRows[0];
  if (scheme === undefined) return null;
  const points = (await sql`
    select mp.ref, mp.text, mp.marks, mp.acceptance_criteria,
           qp.label as part_label
    from mark_points mp
    left join question_parts qp on qp.id = mp.question_part_id
    where mp.mark_scheme_id = ${scheme.id}
    order by mp.ordering
  `) as unknown as MarkPointRow[];
  return { scheme: scheme as MarkSchemeRow, points };
}

/**
 * QuestionTopicRepository.findByQuestionIdIn — secondary mappings for the
 * targeting counts (batched; §14 no per-topic queries).
 */
export async function findQuestionTopicsIn(
  sql: SqlFn,
  questionIds: string[],
): Promise<QuestionTopicRow[]> {
  if (questionIds.length === 0) return [];
  return (await sql`
    select node_id, question_id from question_topics
    where question_id = any(${questionIds}::uuid[])
  `) as unknown as QuestionTopicRow[];
}
