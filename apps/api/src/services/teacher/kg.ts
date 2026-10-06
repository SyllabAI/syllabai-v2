/**
 * T-MIG-053 tranche-2 (r3a) — the teacher band's KnowledgeGraphService seam.
 * Port of the frozen law (syllabai-core @ 6cad6ef):
 *
 *   - KnowledgeGraphService.node(:164) + subtreeIds(:174-180): the same 404
 *     contract as the other read methods, then the recursive PART_OF CTE
 *     (KnowledgeNodeRepository :41-46) — root + every source pointing into
 *     the subtree;
 *   - prerequisiteChain(:119-122) = findPrerequisiteClosure
 *     (KnowledgeNodeRepository :78-93): transitive REQUIRES_PREREQUISITE
 *     closure with BFS depth (1 = direct), depth < 10, MAX(depth) per node,
 *     ORDER BY depth DESC, node_id — deepest first so callers present
 *     remediation paths; PrerequisiteView(id, code, type, title, depth);
 *   - conceptAnchorsWithin(:193-201) = findConceptAnchorEdgesWithin
 *     (KnowledgeEdgeRepository :146-160): PART_OF edges SOURCED at CONCEPT
 *     nodes with BOTH endpoints inside the subtree — the T-C11 projection
 *     basis for structure-keyed read models (a concept is never directly
 *     measured); sorted by source code then target code; the root's 404
 *     runs first (same contract as subtreeIds);
 *   - findMisconceptionFamilyEdgesWithin (KnowledgeEdgeRepository
 *     :114-124): edges whose TARGET is inside the node set and relation in
 *     (MISCONCEPTION_OF, REMEDIATED_BY, WRONG_ANSWER_PATTERN) — the V15
 *     scope widening so remediation/wrong-answer edges stay visible (the
 *     session-56 fix; the settled store carried 29 such edges);
 *   - findSemanticEdgesWithin (KnowledgeEdgeRepository :130-139): every
 *     non-PART_OF edge with BOTH endpoints inside the set.
 *
 * SEAM DISCLOSURE (reuse-not-redeclare): the subtree CTE also exists as
 * private copies in nba.ts (043-t2, learner seam) and content/scope.ts
 * (T-C23 resolver seam) and graphs.ts (the t1 heatmap seam, re-run per the
 * frozen call sequence). Each band ports its own occurrence of the frozen
 * seam with the SQL verbatim rather than widening another band's private
 * helper across the fence — the t1 graphs.ts precedent (prerequisiteRelations
 * re-runs the CTE "the frozen code queries the subtree a second time — the
 * call sequence is ported, not fused").
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; multi-id lookups use `= any(${ids}::uuid[])`.
 */
import type { KnowledgeDeps } from "../knowledge";
import { KnowledgeNotFoundError } from "../knowledge";

export type KgNodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
};

/** KnowledgeGraphService.node(:164-172) — the 404-first contract. */
export async function kgNode404(deps: KnowledgeDeps, id: string): Promise<KgNodeRow> {
  const rows = (await deps.sql`
    select id, code, node_type, title from knowledge_nodes where id = ${id}::uuid`) as KgNodeRow[];
  const row = rows[0];
  if (row == null) {
    // NotFoundException("knowledge node", id) — the frozen two-arg shape
    throw new KnowledgeNotFoundError("knowledge node not found: " + id);
  }
  return row;
}

/** the recursive PART_OF subtree CTE (KnowledgeNodeRepository :41-46) */
export async function subtreeIds(deps: KnowledgeDeps, rootId: string): Promise<string[]> {
  await kgNode404(deps, rootId);
  const rows = (await deps.sql`
    with recursive subtree as (
        select n.id from knowledge_nodes n where n.id = ${rootId}::uuid
        union
        select e.source_node_id from knowledge_edges e
        join subtree s on e.target_node_id = s.id
        where e.relation_type = 'PART_OF'
    )
    select n.id from knowledge_nodes n where n.id in (select id from subtree)`) as Array<{
    id: string;
  }>;
  return rows.map((r) => r.id);
}

export type PrerequisiteView = {
  id: string;
  code: string;
  type: string;
  title: string;
  depth: number;
};

/** prerequisiteChain(:119-122) — the closure CTE, deepest-first, depth<10. */
export async function prerequisiteChain(
  deps: KnowledgeDeps,
  nodeId: string,
): Promise<PrerequisiteView[]> {
  const rows = (await deps.sql`
    with recursive prereq as (
        select e.target_node_id as node_id, 1 as depth
        from knowledge_edges e
        where e.source_node_id = ${nodeId}::uuid and e.relation_type = 'REQUIRES_PREREQUISITE'
        union
        select e.target_node_id, p.depth + 1
        from knowledge_edges e
        join prereq p on e.source_node_id = p.node_id
        where e.relation_type = 'REQUIRES_PREREQUISITE' and p.depth < 10
    )
    select node_id, max(depth) as depth
    from prereq
    group by node_id
    order by depth desc, node_id`) as Array<{ node_id: string; depth: number }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.node_id);
  const nodeRows = (await deps.sql`
    select id, code, node_type, title from knowledge_nodes where id = any(${ids}::uuid[])`) as KgNodeRow[];
  const byId = new Map(nodeRows.map((n) => [n.id, n]));
  const out: PrerequisiteView[] = [];
  for (const r of rows) {
    const n = byId.get(r.node_id);
    if (n == null) continue; // unknown id — skipped, never guessed
    out.push({ id: n.id, code: n.code, type: n.node_type, title: n.title, depth: Number(r.depth) });
  }
  return out;
}

export type KgEdgeRow = {
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  validation_status: string;
  provenance: string;
  rationale: string;
  source_code: string;
  source_title: string;
  source_node_type: string;
  source_validation_status: string;
  target_code: string;
  target_title: string;
  target_node_type: string;
  target_validation_status: string;
};

// NOTE: the three edge reads below repeat the SELECT verbatim instead of
// sharing a fragment — the fleet's fakeSql harness pins the rendered query
// text, so every route is a full literal (no .raw() composition).

/** findMisconceptionFamilyEdgesWithin(:114-124) — target inside the set. */
export async function misconceptionFamilyEdgesWithin(
  deps: KnowledgeDeps,
  nodeIds: string[],
): Promise<KgEdgeRow[]> {
  if (nodeIds.length === 0) return [];
  return (await deps.sql`
    select e.source_node_id, e.target_node_id, e.relation_type, e.validation_status,
           e.provenance, e.rationale,
           s.code as source_code, s.title as source_title,
           s.node_type as source_node_type, s.validation_status as source_validation_status,
           t.code as target_code, t.title as target_title,
           t.node_type as target_node_type, t.validation_status as target_validation_status
    from knowledge_edges e
    join knowledge_nodes s on s.id = e.source_node_id
    join knowledge_nodes t on t.id = e.target_node_id
    where e.target_node_id = any(${nodeIds}::uuid[])
      and e.relation_type in ('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN')`) as KgEdgeRow[];
}

/** findSemanticEdgesWithin(:130-139) — non-PART_OF, BOTH endpoints inside. */
export async function semanticEdgesWithin(
  deps: KnowledgeDeps,
  nodeIds: string[],
): Promise<KgEdgeRow[]> {
  if (nodeIds.length === 0) return [];
  return (await deps.sql`
    select e.source_node_id, e.target_node_id, e.relation_type, e.validation_status,
           e.provenance, e.rationale,
           s.code as source_code, s.title as source_title,
           s.node_type as source_node_type, s.validation_status as source_validation_status,
           t.code as target_code, t.title as target_title,
           t.node_type as target_node_type, t.validation_status as target_validation_status
    from knowledge_edges e
    join knowledge_nodes s on s.id = e.source_node_id
    join knowledge_nodes t on t.id = e.target_node_id
    where e.relation_type <> 'PART_OF'
      and e.source_node_id = any(${nodeIds}::uuid[])
      and e.target_node_id = any(${nodeIds}::uuid[])`) as KgEdgeRow[];
}

/** findConceptAnchorEdgesWithin(:146-160) — PART_OF sourced at CONCEPT,
 *  both endpoints inside; code-ordered (source, target). */
export async function conceptAnchorsWithin(
  deps: KnowledgeDeps,
  rootId: string,
): Promise<KgEdgeRow[]> {
  const ids = await subtreeIds(deps, rootId);
  if (ids.length === 0) return [];
  const rows = (await deps.sql`
    select e.source_node_id, e.target_node_id, e.relation_type, e.validation_status,
           e.provenance, e.rationale,
           s.code as source_code, s.title as source_title,
           s.node_type as source_node_type, s.validation_status as source_validation_status,
           t.code as target_code, t.title as target_title,
           t.node_type as target_node_type, t.validation_status as target_validation_status
    from knowledge_edges e
    join knowledge_nodes s on s.id = e.source_node_id
    join knowledge_nodes t on t.id = e.target_node_id
    where e.relation_type = 'PART_OF'
      and s.node_type = 'CONCEPT'
      and e.source_node_id = any(${ids}::uuid[])
      and e.target_node_id = any(${ids}::uuid[])`) as KgEdgeRow[];
  return rows.sort(
    (a, b) =>
      a.source_code.localeCompare(b.source_code) ||
      a.target_code.localeCompare(b.target_code),
  );
}
