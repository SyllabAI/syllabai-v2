/**
 * T-MIG-053 tranche 1 — knowledge-graph + teaching-coverage services
 * (frozen law @ 6cad6ef, syllabai-core), ported line-against-line:
 *
 *   - TeachingCoverageController.java :56-192 → coverageList / coverageHistory /
 *     coverageMark (3 endpoints over /api/v1/teacher/classes/{classId}/coverage —
 *     tranche-2 routes; the deep-audit M5 TEACHER/ADMIN shell is the route
 *     layer's law; the per-object OWNERSHIP gate §17 is THIS module's).
 *   - KnowledgeController.java :17-46 → knowledgeNode / knowledgeTree /
 *     knowledgePrerequisites / knowledgeMisconceptions (4 GETs over
 *     /api/v1/knowledge — read-only over the V2 knowledge spine).
 *
 * FROZEN LAWS PINNED (verbatim, see knowledge.test.ts for the pins):
 *   - TeachingCoverage.Status.parse (TeachingCoverage.java :43-50): null →
 *     null; trim+lowercase; "taught" → TAUGHT; "not-taught"|"not_taught" →
 *     NOT_TAUGHT; else null → 400 "status must be 'taught' or
 *     'not-taught'". .wire() = canonical kebab lowercase served to clients.
 *   - normalizeNote (:184-189): trim; empty → null (the wire's honest
 *     absence).
 *   - The §17 ownership gate (ownedClass, :169-175): 404 "class not found"
 *     / 403 "this class belongs to another teacher" — reads and write alike.
 *   - coverageMark gate ORDER (:116-160): 404 class → 403 ownership → 409
 *     "this class is archived — reopen it before marking coverage" → 400
 *     status parse → 404 "specification point not found" → 400 "that node
 *     is not a specification point" (the V39 invariant: node_type must be
 *     SUBTOPIC AND applicability non-null — refuse everything else
 *     fail-closed, no guessing) → normalizeNote → identical re-mark
 *     (same parsed status AND same normalized note) = the idempotent no-op
 *     it honestly is → any information change appends EXACTLY one audit
 *     event (previous_status null on the trail's first event) and moves the
 *     state row in the same transaction. created_at is FIRST-MARKED and
 *     never mutates on reassert; marked_at is the reassert instant.
 *   - GET list serves only RECORDED rows ordered spec_point_node_id asc —
 *     the API never fabricates NOT_TAUGHT rows for a whole curriculum;
 *     absent rows are the honest "unrecorded" state. A node vanished since
 *     marking (the V30 NO-ACTION FK lets a curriculum refresh delete a
 *     node) serves code/title as null — the identity is the stored node id.
 *   - node(id) 404-first: NotFoundException("knowledge node", id) renders
 *     "knowledge node <id> not found" (shared NotFoundException :14-16).
 *   - Tree (KnowledgeGraphService :278-345): subtree = the frozen recursive
 *     CTE (findSubtreeIds — the PART_OF walk, target → source), nodes
 *     batched by id (the JPA impl's findAllById pass); children grouped by
 *     edge TARGET (child = source, parent = target), sorted by source code;
 *     dangling edges skipped (the walk contract). treeWithMisconceptions
 *     (:301-330): the fold covers TOPIC/SUBTOPIC (MISCONCEPTION_OF edges
 *     only) and CONCEPT nodes (the V15 family: MISCONCEPTION_OF /
 *     REMEDIATED_BY / WRONG_ANSWER_PATTERN); attachments sorted by source
 *     code, deduped per node (a concept may connect to the same
 *     misconception through several family edges); misconception sources
 *     are NOT subtree members — they resolve through the join-fetched edge
 *     source and attach as FLAT views (children []). The 30s TTL snapshot
 *     cache (:72-107) is a Java-internal perf device — wire-invisible, not
 *     ported (disclosed).
 *   - prerequisiteChain (:119-122 + KnowledgeNodeRepository :75-93): the
 *     frozen recursive CTE — the REQUIRES_PREREQUISITE walk capped at depth
 *     10, MAX(depth) per node, ORDER BY depth DESC, node_id (deepest first
 *     = the remediation walk-back order). Node existence rides node().
 *   - misconceptions (:140-143 + JpaKnowledgeGraphRepository :84-98): the
 *     topic node is 404-first (requireNode), then MISCONCEPTION_OF edges
 *     POINTING AT the topic (source = the misconception — the §7 seed
 *     contract; the pre-fix live bug had both directions inverted) map to
 *     their sources in edge-query order (no ORDER BY upstream —
 *     pass-through, pinned as such).
 *
 * HONESTY RULES (V52 header, carried verbatim): this module writes only
 * its own two tables (teaching_coverage, teaching_coverage_events) and
 * reads knowledge_nodes; NOTHING in the learner model (BKT, SkillState,
 * misconception evidence, review schedule) is touched. NOT_TAUGHT is not a
 * mastery state; grey on the class graph means ABSENT TEACHING COVERAGE,
 * never low understanding. Course refs stay hub-owned opaque strings.
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; multi-id lookups use `= any(${ids}::uuid[])`; Instant
 * rendering = `new Date(x).toISOString()` (ISO-8601 UTC, the fleet
 * posture); the CTE bodies inline as static template text exactly as
 * frozen (the recursive CTE is never duplicated across methods).
 *
 * OUT OF FENCE (still tranche-1, next commit): the F-072 class knowledge-
 * graph heatmap trio (ClassKnowledgeGraphController :37-113 — graph /
 * node students / learner KG) — it integrates the 041/043 learner-state
 * effective-mastery machinery and lands as tranche-1's closing commit.
 * Routes + mounts are tranche-2 (flagged, 041/043/052 doctrine). NO
 * hub-flip in this task. Analytics/concept-graph/notes/smart-lesson are
 * tranches 2-4.
 */
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, ConflictError, type SubmitClock } from "../selfmark";

// ── error surfaces (route layer maps these in tranche-2; classroom pattern) ──

/** 404 not_found (e.message verbatim). */
export class KnowledgeNotFoundError extends Error {}
/** 403 forbidden (e.message verbatim). */
export class KnowledgeForbiddenError extends Error {}

// ── the coverage status parse/wire law (TeachingCoverage.java :39-56) ────────

export type CoverageStatus = "TAUGHT" | "NOT_TAUGHT";

/** tolerant parse for the hub's wire forms — null means "refuse" (400). */
export function parseCoverageStatus(raw: string | null | undefined): CoverageStatus | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === "taught") return "TAUGHT";
  if (s === "not-taught" || s === "not_taught") return "NOT_TAUGHT";
  return null;
}

/** canonical wire form served to clients. */
export function coverageStatusWire(status: CoverageStatus): "taught" | "not-taught" {
  return status === "TAUGHT" ? "taught" : "not-taught";
}

/** normalizeNote (:184-189): trim; empty → null. */
export function normalizeNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ── sql row shapes (plain column names as the selects render them) ──────────

export type KnowledgeNodeRow = {
  id: string;
  code: string;
  node_type: string;
  title: string;
  description: string | null;
  validation_status: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
};

/** a PART_OF child edge joined with its source's code (the sort key). */
export type ChildEdgeRow = {
  source_node_id: string;
  target_node_id: string;
  source_code: string;
};

/** a misconception-family edge joined with the FULL source node row (the
 *  join-fetch contract: sources are not subtree members). */
export type FamilyEdgeRow = KnowledgeNodeRow & {
  edge_source_node_id: string;
  edge_target_node_id: string;
  source_code: string;
};

export type CoverageRow = {
  class_id: string;
  spec_point_node_id: string;
  status: string;
  marked_by: string;
  marked_at: string | Date;
  note: string | null;
  created_at: string | Date;
};

export type CoverageEventRow = {
  status: string;
  previous_status: string | null;
  actor_id: string;
  note: string | null;
  created_at: string | Date;
};

const iso = (x: string | Date): string => new Date(x).toISOString();

// ── the module ───────────────────────────────────────────────────────────────

export type KnowledgeDeps = { sql: SqlFn; clock: SubmitClock };

/** the NodeView wire shape (NodeView.java — the recursive projection). */
export type NodeView = {
  id: string;
  code: string;
  type: string;
  title: string;
  description: string | null;
  validationStatus: string;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
  children: NodeView[];
};

const flatNode = (n: KnowledgeNodeRow): NodeView => ({
  id: n.id,
  code: n.code,
  type: n.node_type,
  title: n.title,
  description: n.description,
  validationStatus: n.validation_status,
  provenance: n.provenance,
  applicability: n.applicability,
  children: [],
});

/** the V52 CHECK stores the enum NAME; views map it through .wire().
 *  (exported for graphs.ts — the F-072 trio shares the coverage overlay.) */
export function dbStatusToEnum(dbStatus: string): CoverageStatus {
  return dbStatus === "NOT_TAUGHT" ? "NOT_TAUGHT" : "TAUGHT";
}

export type CoverageRowView = {
  specPointNodeId: string;
  code: string | null;
  title: string | null;
  status: "taught" | "not-taught";
  markedBy: string;
  markedAt: string;
  note: string | null;
  firstMarkedAt: string;
};

const rowView = (r: CoverageRow, node: KnowledgeNodeRow | undefined): CoverageRowView => ({
  specPointNodeId: r.spec_point_node_id,
  code: node?.code ?? null,
  title: node?.title ?? null,
  status: coverageStatusWire(dbStatusToEnum(r.status)),
  markedBy: r.marked_by,
  markedAt: iso(r.marked_at),
  note: r.note,
  firstMarkedAt: iso(r.created_at),
});

/** §17 gate (:169-175): the class must exist AND be owned by this teacher.
 *  404 "class not found" / 403 "this class belongs to another teacher". */
async function covOwnedClass(
  deps: KnowledgeDeps,
  teacherId: string,
  classId: string,
): Promise<{ id: string; status: string }> {
  const rows = await deps.sql`
    select id, status, teacher_id from classes where id = ${classId}::uuid`;
  const c = rows[0] as { id: string; status: string; teacher_id: string } | undefined;
  if (!c) throw new KnowledgeNotFoundError("class not found");
  if (c.teacher_id !== teacherId) {
    throw new KnowledgeForbiddenError("this class belongs to another teacher");
  }
  return c;
}

// ── teaching coverage reads (:66-92) ─────────────────────────────────────────

/** GET coverage — only what teachers asserted, spec_point_node_id asc. */
export async function coverageList(
  deps: KnowledgeDeps,
  teacherId: string,
  classId: string,
): Promise<CoverageRowView[]> {
  await covOwnedClass(deps, teacherId, classId);
  const rows = (await deps.sql`
    select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at
    from teaching_coverage where class_id = ${classId}::uuid order by spec_point_node_id asc`) as CoverageRow[];
  const nodeIds = [...new Set(rows.map((r) => r.spec_point_node_id))];
  const nodeById = new Map<string, KnowledgeNodeRow>();
  if (nodeIds.length > 0) {
    const nodes = (await deps.sql`
      select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any(${nodeIds}::uuid[])`) as KnowledgeNodeRow[];
    for (const n of nodes) nodeById.set(n.id, n);
  }
  return rows.map((r) => rowView(r, nodeById.get(r.spec_point_node_id)));
}

/** GET history — the per-point audit trail, newest first, verbatim. */
export async function coverageHistory(
  deps: KnowledgeDeps,
  teacherId: string,
  classId: string,
  specPointNodeId: string,
): Promise<Array<{ status: "taught" | "not-taught"; previousStatus: "taught" | "not-taught" | null; actorId: string; note: string | null; createdAt: string }>> {
  await covOwnedClass(deps, teacherId, classId);
  const rows = (await deps.sql`
    select status, previous_status, actor_id, note, created_at
    from teaching_coverage_events
    where class_id = ${classId}::uuid and spec_point_node_id = ${specPointNodeId}::uuid
    order by created_at desc`) as CoverageEventRow[];
  return rows.map((e) => ({
    status: coverageStatusWire(dbStatusToEnum(e.status)),
    previousStatus: e.previous_status
      ? coverageStatusWire(dbStatusToEnum(e.previous_status))
      : null,
    actorId: e.actor_id,
    note: e.note,
    createdAt: iso(e.created_at),
  }));
}

// ── teaching coverage marking (:116-160) ─────────────────────────────────────

/** PUT coverage — the full fail-closed gate chain, the idempotent re-mark. */
export async function coverageMark(
  deps: KnowledgeDeps,
  teacherId: string,
  classId: string,
  specPointNodeId: string,
  request: { status: string; note?: string | null },
): Promise<CoverageRowView> {
  const c = await covOwnedClass(deps, teacherId, classId);
  if (c.status !== "ACTIVE") {
    throw new ConflictError("this class is archived — reopen it before marking coverage");
  }
  const parsed = parseCoverageStatus(request.status);
  if (parsed == null) {
    throw new BadRequestError("status must be 'taught' or 'not-taught'");
  }
  const nodeRows = (await deps.sql`
    select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = ${specPointNodeId}::uuid`) as KnowledgeNodeRow[];
  const node = nodeRows[0] as KnowledgeNodeRow | undefined;
  if (!node) {
    throw new KnowledgeNotFoundError("specification point not found");
  }
  if (node.node_type !== "SUBTOPIC" || node.applicability == null) {
    // the V39 invariant IS the spec-point gate: applicability is populated
    // only on seed-owned spec-point rows — refuse everything else instead
    // of guessing
    throw new BadRequestError("that node is not a specification point");
  }
  const note = normalizeNote(request.note ?? null);

  const existing = (await deps.sql`
    select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at
    from teaching_coverage
    where class_id = ${classId}::uuid and spec_point_node_id = ${specPointNodeId}::uuid`) as CoverageRow[];
  const row = existing[0] as CoverageRow | undefined;

  if (!row) {
    const now = deps.clock.now();
    await deps.sql`
      insert into teaching_coverage (class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at)
      values (${classId}::uuid, ${specPointNodeId}::uuid, ${parsed}, ${teacherId}::uuid, ${now.toISOString()}, ${note}, ${now.toISOString()})`;
    await insertCoverageEvent(deps, classId, specPointNodeId, parsed, null, teacherId, note);
    return {
      specPointNodeId,
      code: node.code,
      title: node.title,
      status: coverageStatusWire(parsed),
      markedBy: teacherId,
      markedAt: now.toISOString(),
      note,
      firstMarkedAt: now.toISOString(),
    };
  }
  if (dbStatusToEnum(row.status) === parsed && row.note === note) {
    return rowView(row, node); // identical re-mark: honest no-op
  }
  const previous = dbStatusToEnum(row.status);
  const now = deps.clock.now();
  await deps.sql`
    update teaching_coverage set status = ${parsed}, marked_by = ${teacherId}::uuid, marked_at = ${now.toISOString()}, note = ${note}
    where class_id = ${classId}::uuid and spec_point_node_id = ${specPointNodeId}::uuid`;
  await insertCoverageEvent(deps, classId, specPointNodeId, parsed, previous, teacherId, note);
  return {
    specPointNodeId,
    code: node.code,
    title: node.title,
    status: coverageStatusWire(parsed),
    markedBy: teacherId,
    markedAt: now.toISOString(),
    note,
    firstMarkedAt: iso(row.created_at), // FIRST-MARKED, never mutates
  };
}

async function insertCoverageEvent(
  deps: KnowledgeDeps,
  classId: string,
  specPointNodeId: string,
  status: CoverageStatus,
  previousStatus: CoverageStatus | null,
  actorId: string,
  note: string | null,
): Promise<void> {
  await deps.sql`
    insert into teaching_coverage_events (id, class_id, spec_point_node_id, status, previous_status, actor_id, note, created_at)
    values (${deps.clock.newId()}::uuid, ${classId}::uuid, ${specPointNodeId}::uuid, ${status}, ${previousStatus}, ${actorId}::uuid, ${note}, ${deps.clock.now().toISOString()})`;
}

// ── knowledge node reads (KnowledgeController :17-46) ────────────────────────

/** node() 404-first (:164-167): "knowledge node <id> not found". */
async function node404(deps: KnowledgeDeps, id: string): Promise<KnowledgeNodeRow> {
  const rows = (await deps.sql`
    select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = ${id}::uuid`) as KnowledgeNodeRow[];
  const n = rows[0] as KnowledgeNodeRow | undefined;
  if (!n) throw new KnowledgeNotFoundError(`knowledge node ${id} not found`);
  return n;
}

/** GET /nodes/{id} — the flat projection (NodeView.flat, :20-24). */
export async function knowledgeNode(deps: KnowledgeDeps, id: string) {
  return flatNode(await node404(deps, id));
}

/** GET /nodes/{id}/tree (:63-69 + :278-345) — the PART_OF subtree with the
 *  optional misconception fold. The 30s TTL snapshot cache is
 *  wire-invisible and not ported (disclosed in the header). */
export async function knowledgeTree(
  deps: KnowledgeDeps,
  rootId: string,
  includeMisconceptions: boolean,
): Promise<NodeView> {
  const root = await node404(deps, rootId);

  // the frozen subtree CTE (KnowledgeNodeRepository :38-46) — never duplicated
  const subtreeIdRows = (await deps.sql`
    with recursive subtree as (
        select n.id from knowledge_nodes n where n.id = ${rootId}::uuid
        union
        select e.source_node_id from knowledge_edges e
        join subtree s on e.target_node_id = s.id
        where e.relation_type = 'PART_OF'
    )
    select n.id from knowledge_nodes n where n.id in (select id from subtree)`) as Array<{ id: string }>;
  const ids = subtreeIdRows.map((r) => r.id);
  const byId = new Map<string, KnowledgeNodeRow>();
  if (ids.length > 0) {
    const nodes = (await deps.sql`
      select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any(${ids}::uuid[])`) as KnowledgeNodeRow[];
    for (const n of nodes) byId.set(n.id, n);
  }

  // children grouped by edge TARGET (child = source, parent = target)
  const childrenByParent = new Map<string, ChildEdgeRow[]>();
  if (ids.length > 0) {
    const edges = (await deps.sql`
      select e.source_node_id, e.target_node_id, s.code as source_code
      from knowledge_edges e join knowledge_nodes s on s.id = e.source_node_id
      where e.target_node_id = any(${ids}::uuid[]) and e.relation_type = 'PART_OF'`) as ChildEdgeRow[];
    for (const e of edges) {
      const list = childrenByParent.get(e.target_node_id) ?? [];
      list.push(e);
      childrenByParent.set(e.target_node_id, list);
    }
  }

  // the V15 misconception-family fold (only when asked)
  const attachmentsByTarget = new Map<string, FamilyEdgeRow[]>();
  if (includeMisconceptions && ids.length > 0) {
    const edges = (await deps.sql`
      select s.id, s.code, s.node_type, s.title, s.description, s.validation_status, s.provenance, s.applicability,
             e.source_node_id as edge_source_node_id, e.target_node_id as edge_target_node_id, s.code as source_code
      from knowledge_edges e join knowledge_nodes s on s.id = e.source_node_id
      where e.target_node_id = any(${ids}::uuid[])
        and e.relation_type in ('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN')`) as FamilyEdgeRow[];
    for (const e of edges) {
      const list = attachmentsByTarget.get(e.edge_target_node_id) ?? [];
      list.push(e);
      attachmentsByTarget.set(e.edge_target_node_id, list);
    }
  }

  const byCode = (a: { source_code: string }, b: { source_code: string }) =>
    a.source_code < b.source_code ? -1 : a.source_code > b.source_code ? 1 : 0;

  const assemble = (node: KnowledgeNodeRow): NodeView => {
    const kids = [...(childrenByParent.get(node.id) ?? [])].sort(byCode);
    const children: NodeView[] = [];
    for (const e of kids) {
      const child = byId.get(e.source_node_id);
      if (child != null) {
        // dangling edge → skipped, matching the walk contract
        children.push(assemble(child));
      }
    }
    if (includeMisconceptions) {
      const topicLike = node.node_type === "TOPIC" || node.node_type === "SUBTOPIC";
      if (topicLike || node.node_type === "CONCEPT") {
        const attached = new Set<string>();
        const list = [...(attachmentsByTarget.get(node.id) ?? [])].sort(byCode);
        for (const e of list) {
          // dedupe: a concept may be connected to the same misconception
          // through several family edges — the per-node DISTINCT query did.
          // (Java's Set.add returns true when the element was absent; the
          // JS Set.add returns the set — the law needs has/add split.)
          if (!attached.has(e.id)) {
            attached.add(e.id);
            children.push(flatNode(e)); // NOT subtree members — flat views
          }
        }
      }
    }
    return { ...flatNode(node), children };
  };
  return assemble(root);
}

/** GET /nodes/{id}/prerequisites (:119-122) — the frozen closure CTE,
 *  deepest first then node id (the remediation walk-back order). */
export async function knowledgePrerequisites(
  deps: KnowledgeDeps,
  nodeId: string,
): Promise<Array<{ id: string; code: string; type: string; title: string; depth: number }>> {
  await node404(deps, nodeId);
  const closure = (await deps.sql`
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
    select node_id, max(depth) as depth from prereq group by node_id order by depth desc, node_id`) as Array<{
    node_id: string;
    depth: number;
  }>;
  if (closure.length === 0) return [];
  const ids = closure.map((r) => r.node_id);
  const byId = new Map<string, KnowledgeNodeRow>();
  const nodes = (await deps.sql`
    select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any(${ids}::uuid[])`) as KnowledgeNodeRow[];
  for (const n of nodes) byId.set(n.id, n);
  return closure.map((r) => {
    const n = byId.get(r.node_id);
    return {
      id: r.node_id,
      code: n?.code ?? "",
      type: n?.node_type ?? "",
      title: n?.title ?? "",
      depth: Number(r.depth),
    };
  });
}

/** GET /nodes/{id}/misconceptions (:140-143) — the topic node is 404-first;
 *  MISCONCEPTION_OF edges pointing AT the topic map to their sources in
 *  edge-query order (no ORDER BY upstream — pass-through). */
export async function knowledgeMisconceptions(deps: KnowledgeDeps, topicNodeId: string) {
  await node404(deps, topicNodeId);
  const rows = (await deps.sql`
    select s.id, s.code, s.node_type, s.title, s.description, s.validation_status, s.provenance, s.applicability
    from knowledge_edges e join knowledge_nodes s on s.id = e.source_node_id
    where e.target_node_id = ${topicNodeId}::uuid and e.relation_type = 'MISCONCEPTION_OF'`) as KnowledgeNodeRow[];
  return rows.map(flatNode);
}

// the F-072 class-KG heatmap trio + the F-034 read model (graphs.ts) —
// tranche-1's closing slice (T-MIG-053 r3a); single graph implementations
export * from "./graphs";
