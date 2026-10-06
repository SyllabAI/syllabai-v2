/**
 * T-MIG-053 tranche-1 CLOSE — the F-072 class knowledge-graph heatmap trio
 * (frozen law @ 6cad6ef, syllabai-core), ported line-against-line:
 *
 *   - ClassKnowledgeGraphController.java :37-113 → classGraph / classNodeStudents /
 *     classLearnerKnowledgeGraph (3 GETs over
 *     /api/v1/teacher/classes/{classId}/knowledge-graph — tranche-2 routes;
 *     the deep-audit M5 TEACHER/ADMIN shell is the route layer's law; the
 *     §17 per-object OWNERSHIP gate is THIS module's).
 *   - LearnerKnowledgeGraphService.java :49-147 → learnerGraphFor — the
 *     F-034 personalized read model the third leg DELEGATES to.
 *
 * PLACEMENT DISCLOSURE: the frozen F-034 service lives in
 * com.syllabai.learner; the V2 builder lands in services/knowledge because
 * this task's tranche-1 fence scopes services/knowledge/**. The
 * student-facing /api/v1/learners/me/knowledge-graph route (the
 * LearnerStateController :178-181 surface — the 041 band's controller,
 * currently unported) MUST consume THIS builder when it lands — the frozen
 * one-graph-implementation law, never a second KG.
 *
 * FROZEN LAWS PINNED (verbatim, see class-graph.test.ts for the pins):
 *   - Gate ORDER (controller :63/:83/:100): class exists (404 "class not
 *     found") → this teacher's (403 "this class belongs to another
 *     teacher") → root node 404-first via the tree read ("knowledge node
 *     <id> not found"). There is deliberately NO archived-class gate on any
 *     read: 409 is a WRITE gate — a teacher may inspect a past class's
 *     heatmap (the controller docstring pins it).
 *   - THE INDEPENDENT-STUDENT RULE (non-negotiable): the aggregation roster
 *     is EXACTLY this class's enabled member rows — a student without a
 *     membership row in this class never moves a single aggregated number;
 *     a disabled member's account drops out the same way. On the third leg
 *     the roster IS the privacy boundary: a non-member (or disabled member)
 *     learner is a 404 "learner is not a member of this class" — an absent
 *     membership neither confirms nor denies any other enrollment, and the
 *     membership check short-circuits BEFORE any user lookup.
 *   - nodeStudents subject isolation: the node must belong to the root's
 *     PART_OF subtree — outside is a 404 "node is not part of this subject
 *     subtree", never a silent cross-subject hop.
 *   - Class heatmap evidence semantics: per-student EFFECTIVE (decayed)
 *     mastery evaluated at ONE pinned asOf instant, banded by the shared
 *     vocabulary (bandOf — 3 states, LOW | DEVELOPING | SECURE); the cell
 *     exposes the §13.3 DISTRIBUTION, not just the mean (a polarized class
 *     must not hide behind an average). Unmeasured is honest:
 *     learnersMeasured = 0, null meanMastery, "UNMEASURED" band, zero
 *     counts — nothing fabricated (meanBand is the 4-state union and is
 *     NEVER null; meanMastery IS null when nobody measured). The mean is
 *     rounded to 4 decimal places (:551 round()).
 *   - Coverage semantics: spec points (the V39 invariant predicate —
 *     SUBTOPIC-typed with non-null applicability, the SAME gate the
 *     coverage marking contract uses, so coverage and heatmap can never
 *     disagree) report their recorded row verbatim ("taught" | "not-taught"
 *     | "unrecorded"); every other node DERIVES from its descendant spec
 *     points with the counts exposed, memoized bottom-up
 *     (taught > recorded > unrecorded precedence). Grey on the graph means
 *     ABSENT TEACHING COVERAGE — never low understanding (TFA-03).
 *   - Misconception prevalence: keyed by the MISCONCEPTION node ids — never
 *     the parent topic ids; distinct members with an ACTIVE (BDT)
 *     staleness-relaxed estimate (relaxedToPrior, MED-2/ADR-032) on any
 *     misconception node attached under the node.
 *   - prerequisiteRelations (:246-262): REQUIRES_PREREQUISITE edges with
 *     BOTH endpoints inside the PART_OF subtree; the edge convention is
 *     source = the DEPENDENT node, target = the PREREQUISITE it requires,
 *     so the view records (prerequisiteId = target, nodeId = source).
 *     Unknown ids are graph inconsistencies — skipped, never guessed. No
 *     ORDER BY upstream — pass-through order (disclosed, like
 *     misconceptions).
 *   - nodeStudents detail: per-student rows carry the SAME per-node
 *     semantics the student KG shows (raw + effective mastery, shared band
 *     vocabulary), misconception estimates on nodes attached under THIS
 *     node (a state whose misconception node is not attached here is a
 *     graph inconsistency — skipped, not guessed), and a bounded slice of
 *     recent attempts mapped to this node (primary_topic OR question_topics
 *     mapping, createdAt DESC scan capped at 120, first 3 kept per student).
 *     Weakest MEASURED students sort first (ascending effective), unmeasured
 *     sit at the end with honest nulls, then display name (case-folded),
 *     then learner id — deterministic.
 *   - The F-034 read model (graphFor :49-90): the tree walk covers EVERY
 *     node INCLUDING misconception nodes (the class heatmap's collect()
 *     excludes them from structure — the two walks differ on purpose);
 *     unpractised nodes carry ALL-null state (never zeros, never a
 *     fabricated band); the misconception overlay carries the
 *     staleness-RELAXED probability, active = effective >= activeThreshold;
 *     the review overlay carries the EARLIEST PENDING review per node
 *     (merge keeps the strictly-earlier dueAt — ties keep the first, the
 *     rows arrive dueAt-ascending); applicability rides along VERBATIM
 *     (T-C28), never merged with any learner state.
 *
 * CLOCK DISCLOSURE (ADR-031): the frozen code reads Instant.now() per
 * relaxed()/misconceptionReadings() call in ADDITION to the one pinned
 * graph anchor; the port evaluates every now()-dependent value from the
 * SINGLE injected anchor (the 041 state.ts posture — numerically identical
 * within a read and replayable). JS Date resolves to milliseconds vs the
 * core's nanoseconds — the precision note from state.ts carries over.
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; multi-id lookups use `= any(${ids}::uuid[])`; Instant
 * rendering = `new Date(x).toISOString()`.
 */
import {
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  coverageStatusWire,
  dbStatusToEnum,
  knowledgeTree,
  type KnowledgeDeps,
  type NodeView,
} from "./index";
import {
  LEARNER_ENGINE_PAPER_DEFAULTS,
  bandOf,
  decayedMastery,
  relaxedToPrior,
  type LearnerBdtParams,
  type LearnerDecayParams,
} from "../learner";

const iso = (x: string | Date): string => new Date(x).toISOString();
const mapDate = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));

/** most recent attempts scanned per node-students read, before grouping */
export const ATTEMPT_SCAN_CAP = 120;
/** recent attempts kept per student in the node detail panel */
export const EVIDENCE_PER_STUDENT = 3;

export type ClassGraphEngineParams = { decay: LearnerDecayParams; bdt: LearnerBdtParams };
export type ClassGraphDeps = KnowledgeDeps & { engine?: ClassGraphEngineParams };

const engineOf = (deps: ClassGraphDeps): ClassGraphEngineParams =>
  deps.engine ?? LEARNER_ENGINE_PAPER_DEFAULTS;

// ── wire views (mirrors dto/ClassKnowledgeGraphViews.java + the F-034 view) ──

export type ClassGraphNodeView = {
  id: string;
  code: string;
  type: string;
  title: string;
  description: string | null;
  childIds: string[];
  coverageState: "taught" | "not-taught" | "unrecorded";
  specPoints: number;
  recordedSpecPoints: number;
  taughtSpecPoints: number;
  learnersMeasured: number;
  meanMastery: number | null;
  meanBand: "LOW" | "DEVELOPING" | "SECURE" | "UNMEASURED";
  strugglingCount: number;
  developingCount: number;
  proficientCount: number;
  attempts: number;
  correctCount: number;
  learnersWithActiveMisconception: number;
};

export type ClassGraphEdgeView = {
  prerequisiteId: string;
  prerequisiteCode: string;
  nodeId: string;
  nodeCode: string;
};

export type ClassKnowledgeGraphView = {
  classId: string;
  className: string;
  rootId: string;
  rootCode: string;
  rootTitle: string;
  learnersEnrolled: number;
  asOf: string;
  nodes: ClassGraphNodeView[];
  prerequisiteEdges: ClassGraphEdgeView[];
};

export type StudentMisconceptionView = {
  misconceptionNodeId: string;
  code: string;
  title: string;
  probability: number;
  active: boolean;
};

export type StudentEvidenceItemView = {
  attemptId: string;
  questionId: string;
  questionRef: string;
  correct: boolean;
  marksAwarded: number | null;
  questionMarks: number;
  markingState: string;
  createdAt: string;
};

export type ClassNodeStudentView = {
  learnerId: string;
  displayName: string;
  mastery: number | null;
  effectiveMastery: number | null;
  band: "LOW" | "DEVELOPING" | "SECURE" | null;
  attempts: number | null;
  correctCount: number | null;
  lastPracticedAt: string | null;
  misconceptions: StudentMisconceptionView[];
  recentAttempts: StudentEvidenceItemView[];
};

export type ClassNodeStudentsView = {
  classId: string;
  className: string;
  rootId: string;
  nodeId: string;
  nodeCode: string;
  nodeTitle: string;
  nodeType: string;
  coverageState: "taught" | "not-taught" | "unrecorded";
  learnersEnrolled: number;
  strugglingCount: number;
  developingCount: number;
  proficientCount: number;
  asOf: string;
  students: ClassNodeStudentView[];
};

// ── shared internals ─────────────────────────────────────────────────────────

/** the §17 gate (:104-112) with the projection the trio needs (the name). */
async function graphOwnedClass(
  deps: KnowledgeDeps,
  teacherId: string,
  classId: string,
): Promise<{ id: string; name: string; status: string }> {
  const rows = await deps.sql`
    select id, name, status, teacher_id from classes where id = ${classId}::uuid`;
  const c = rows[0] as { id: string; name: string; status: string; teacher_id: string } | undefined;
  if (!c) throw new KnowledgeNotFoundError("class not found");
  if (c.teacher_id !== teacherId) {
    throw new KnowledgeForbiddenError("this class belongs to another teacher");
  }
  return c;
}

/** the roster: member student ids, enrolled_at asc (the class scope source). */
async function memberStudentIds(deps: KnowledgeDeps, classId: string): Promise<string[]> {
  const rows = (await deps.sql`
    select student_id from class_members where class_id = ${classId}::uuid order by enrolled_at asc`) as Array<{
    student_id: string;
  }>;
  return rows.map((r) => r.student_id);
}

/** the enabled roster: member ids resolved against accounts, ENABLED only —
 *  the independent-student rule's account half. */
async function enabledRoster(
  deps: KnowledgeDeps,
  memberIds: string[],
): Promise<{ roster: string[]; names: Map<string, string> }> {
  const names = new Map<string, string>();
  const roster: string[] = [];
  if (memberIds.length > 0) {
    const users = (await deps.sql`
      select id, display_name, enabled from users where id = any(${memberIds}::uuid[])`) as Array<{
      id: string;
      display_name: string;
      enabled: boolean;
    }>;
    for (const u of users) {
      if (u.enabled) {
        roster.push(u.id);
        names.set(u.id, u.display_name);
      }
    }
  }
  return { roster, names };
}

type ClassStructure = {
  structureById: Map<string, NodeView>; // insertion order = the curriculum pre-order
  childrenOf: Map<string, NodeView[]>; // STRUCTURE children only (misconceptions excluded)
  misconceptionsOf: Map<string, NodeView[]>;
  miscoNodeIds: Set<string>;
};

/**
 * collect (:413-432): the tree walk that splits STRUCTURE from the
 * misconception registry. MISCONCEPTION-typed nodes are registered under
 * their parent and never become structure (the class heatmap's walk — the
 * F-034 walk below differs on purpose).
 */
function collectClassStructure(tree: NodeView): ClassStructure {
  const structureById = new Map<string, NodeView>();
  const childrenOf = new Map<string, NodeView[]>();
  const misconceptionsOf = new Map<string, NodeView[]>();
  const miscoNodeIds = new Set<string>();
  const walk = (node: NodeView): void => {
    structureById.set(node.id, node);
    const structureChildren: NodeView[] = [];
    for (const child of node.children) {
      if (child.type === "MISCONCEPTION") {
        const list = misconceptionsOf.get(node.id) ?? [];
        list.push(child);
        misconceptionsOf.set(node.id, list);
        miscoNodeIds.add(child.id);
      } else {
        structureChildren.push(child);
        walk(child);
      }
    }
    childrenOf.set(node.id, structureChildren);
  };
  walk(tree);
  return { structureById, childrenOf, misconceptionsOf, miscoNodeIds };
}

/** the V39 invariant as a predicate — the exact spec-point gate (:548-550). */
function isSpecPoint(node: NodeView): boolean {
  return node.type === "SUBTOPIC" && node.applicability != null;
}

type CoverageCounts = [specPoints: number, recorded: number, taught: number];

/**
 * coverageCounts (:436-476): {specPoints, recordedSpecPoints,
 * taughtSpecPoints} over the node and its descendants, memoized. A row
 * bumps the recorded count WHEREVER it sits (the counts don't re-check the
 * predicate for the row); the predicate only decides whether the node
 * itself starts as a spec point.
 */
function coverageCounts(
  nodeId: string,
  structure: ClassStructure,
  coverageRows: Map<string, { status: string }>,
  memo: Map<string, CoverageCounts>,
): CoverageCounts {
  const cached = memo.get(nodeId);
  if (cached) return cached;
  const node = structure.structureById.get(nodeId);
  const counts: CoverageCounts = node != null && isSpecPoint(node) ? [1, 0, 0] : [0, 0, 0];
  const row = coverageRows.get(nodeId);
  if (row != null) {
    counts[1] += 1;
    if (row.status === "TAUGHT") counts[2] += 1;
  }
  for (const child of structure.childrenOf.get(nodeId) ?? []) {
    const childCounts = coverageCounts(child.id, structure, coverageRows, memo);
    counts[0] += childCounts[0];
    counts[1] += childCounts[1];
    counts[2] += childCounts[2];
  }
  memo.set(nodeId, counts);
  return counts;
}

/** the coverage-state derivation, shared by the heatmap cell and the
 *  node-students panel (spec points verbatim; everything else derived
 *  taught > recorded > unrecorded). */
function coverageStateOf(
  node: NodeView,
  coverageRows: Map<string, { status: string }>,
  counts: CoverageCounts,
): "taught" | "not-taught" | "unrecorded" {
  if (isSpecPoint(node)) {
    const row = coverageRows.get(node.id);
    return row == null ? "unrecorded" : coverageStatusWire(dbStatusToEnum(row.status));
  }
  return counts[2] > 0 ? "taught" : counts[1] > 0 ? "not-taught" : "unrecorded";
}

/** round (:551-553): the 4-decimal-place mean. */
const round4 = (v: number): number => Math.round(v * 10000.0) / 10000.0;

/** the band switch with the config-drift refusal (:532-541/:356-368):
 *  the band vocabulary is exactly these three; anything else refuses to
 *  bucket rather than misfile a student. */
function bandCounts(effective: number, decay: LearnerDecayParams): "LOW" | "DEVELOPING" | "SECURE" {
  const b: string = bandOf(effective, decay);
  if (b === "LOW") return "LOW";
  if (b === "DEVELOPING") return "DEVELOPING";
  if (b === "SECURE") return "SECURE";
  throw new Error(`unexpected mastery band: ${b}`);
}

/**
 * prerequisiteRelations (KnowledgeGraphService :246-262): the subtree CTE
 * re-run (the frozen code queries the subtree a second time — the call
 * sequence is ported, not fused), then the REQUIRES_PREREQUISITE edges with
 * BOTH endpoints inside. Returns the DRAWABLE relations already mapped
 * target→prerequisite / source→dependent.
 */
async function prerequisiteRelations(
  deps: KnowledgeDeps,
  rootId: string,
  structure: ClassStructure | null,
  byId: Map<string, { id: string; code: string }> | null,
): Promise<ClassGraphEdgeView[]> {
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
  if (ids.length === 0) return [];
  const edgeRows = (await deps.sql`
    select e.source_node_id, e.target_node_id from knowledge_edges e
    where e.relation_type = 'REQUIRES_PREREQUISITE'
      and e.source_node_id = any(${ids}::uuid[]) and e.target_node_id = any(${ids}::uuid[])`) as Array<{
    source_node_id: string;
    target_node_id: string;
  }>;
  const edges: ClassGraphEdgeView[] = [];
  for (const e of edgeRows) {
    // edge convention (V6 seed + T-C11 authored graph): source = the
    // DEPENDENT node, target = the PREREQUISITE it requires
    const prerequisite = byId != null ? byId.get(e.target_node_id) : structure?.structureById.get(e.target_node_id);
    const dependent = byId != null ? byId.get(e.source_node_id) : structure?.structureById.get(e.source_node_id);
    if (prerequisite != null && dependent != null) {
      edges.push({
        prerequisiteId: prerequisite.id,
        prerequisiteCode: prerequisite.code,
        nodeId: dependent.id,
        nodeCode: dependent.code,
      });
    }
  }
  return edges;
}

// ── endpoint 1: the class KG heatmap (graph :180-263) ────────────────────────

export async function classGraph(
  deps: ClassGraphDeps,
  teacherId: string,
  classId: string,
  rootId: string,
): Promise<ClassKnowledgeGraphView> {
  const { decay, bdt } = engineOf(deps);
  const c = await graphOwnedClass(deps, teacherId, classId);
  const now = deps.clock.now(); // ONE clock read: the decay + provenance anchor

  const tree = await knowledgeTree(deps, rootId, true); // the root 404-first lives here
  const structure = collectClassStructure(tree);

  // the roster: exactly this class's enabled members (the independent-
  // student gate — membership rows are the single source of class scope)
  const memberIds = await memberStudentIds(deps, classId);
  const { roster } = await enabledRoster(deps, memberIds);
  const sortedRoster = [...roster].sort(); // the frozen roster is id-sorted for the batch reads

  // one batched query per evidence table for the whole roster × scope
  const scopeIds = [...structure.structureById.keys()];
  const statesByNode = new Map<string, Array<{ learner_id: string; mastery: number; attempts: number; correct_count: number; last_practiced_at: string | Date }>>();
  if (sortedRoster.length > 0) {
    const rows = (await deps.sql`
      select learner_id, node_id, mastery, attempts, correct_count, last_practiced_at
      from skill_states
      where learner_id = any(${sortedRoster}::uuid[]) and node_id = any(${scopeIds}::uuid[])`) as Array<{
      learner_id: string;
      node_id: string;
      mastery: number;
      attempts: number;
      correct_count: number;
      last_practiced_at: string | Date;
    }>;
    for (const s of rows) {
      const list = statesByNode.get(s.node_id) ?? [];
      list.push(s);
      statesByNode.set(s.node_id, list);
    }
  }
  const miscoByNode = new Map<string, Array<{ learner_id: string; probability: number; last_evidence_at: string | Date }>>();
  if (sortedRoster.length > 0 && structure.miscoNodeIds.size > 0) {
    // keyed by the MISCONCEPTION node ids — never the parent topic ids
    const rows = (await deps.sql`
      select learner_id, misconception_node_id, probability, last_evidence_at
      from misconception_states
      where learner_id = any(${sortedRoster}::uuid[]) and misconception_node_id = any(${[...structure.miscoNodeIds]}::uuid[])`) as Array<{
      learner_id: string;
      misconception_node_id: string;
      probability: number;
      last_evidence_at: string | Date;
    }>;
    for (const m of rows) {
      const list = miscoByNode.get(m.misconception_node_id) ?? [];
      list.push(m);
      miscoByNode.set(m.misconception_node_id, list);
    }
  }

  // the recorded coverage rows for this class (absence = unrecorded)
  const coverageRows = new Map<string, { status: string }>();
  const covRows = (await deps.sql`
    select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at
    from teaching_coverage where class_id = ${classId}::uuid order by spec_point_node_id asc`) as Array<{
    spec_point_node_id: string;
    status: string;
  }>;
  for (const row of covRows) coverageRows.set(row.spec_point_node_id, row);

  // coverage counts per node, memoized bottom-up (descendant-or-self)
  const memo = new Map<string, CoverageCounts>();
  for (const id of structure.structureById.keys()) {
    coverageCounts(id, structure, coverageRows, memo);
  }

  const nodes: ClassGraphNodeView[] = [];
  for (const node of structure.structureById.values()) {
    const children = structure.childrenOf.get(node.id) ?? [];
    const counts = memo.get(node.id) as CoverageCounts;
    const states = statesByNode.get(node.id) ?? [];
    const learnersMeasured = states.length;
    let meanMastery: number | null = null;
    let meanBand: "LOW" | "DEVELOPING" | "SECURE" | "UNMEASURED" = "UNMEASURED";
    let struggling = 0;
    let developing = 0;
    let proficient = 0;
    let attempts = 0;
    let correct = 0;
    if (learnersMeasured > 0) {
      let total = 0;
      for (const s of states) {
        const effective = decayedMastery(
          Number(s.mastery),
          mapDate(s.last_practiced_at),
          now,
          decay,
        );
        total += effective;
        switch (bandCounts(effective, decay)) {
          case "LOW":
            struggling += 1;
            break;
          case "DEVELOPING":
            developing += 1;
            break;
          case "SECURE":
            proficient += 1;
            break;
        }
      }
      meanMastery = round4(total / learnersMeasured);
      meanBand = bandOf(meanMastery, decay);
    }
    // misconception prevalence: distinct members with an ACTIVE (BDT)
    // estimate on any misconception node attached under this node
    let learnersWithActiveMisconception = 0;
    const attached = structure.misconceptionsOf.get(node.id) ?? [];
    if (attached.length > 0) {
      const affected = new Set<string>();
      for (const misco of attached) {
        for (const m of miscoByNode.get(misco.id) ?? []) {
          const effective = relaxedToPrior(
            Number(m.probability),
            bdt.prior,
            mapDate(m.last_evidence_at),
            now,
            bdt.stalenessTauDays,
          );
          if (effective >= bdt.activeThreshold) affected.add(m.learner_id);
        }
      }
      learnersWithActiveMisconception = affected.size;
    }
    for (const s of states) {
      attempts += Number(s.attempts);
      correct += Number(s.correct_count);
    }
    nodes.push({
      id: node.id,
      code: node.code,
      type: node.type,
      title: node.title,
      description: node.description,
      childIds: children.map((ch) => ch.id),
      coverageState: coverageStateOf(node, coverageRows, counts),
      specPoints: counts[0],
      recordedSpecPoints: counts[1],
      taughtSpecPoints: counts[2],
      learnersMeasured,
      meanMastery,
      meanBand,
      strugglingCount: struggling,
      developingCount: developing,
      proficientCount: proficient,
      attempts,
      correctCount: correct,
      learnersWithActiveMisconception,
    });
  }

  const prerequisiteEdges = await prerequisiteRelations(deps, rootId, structure, null);

  return {
    classId: c.id,
    className: c.name,
    rootId: tree.id,
    rootCode: tree.code,
    rootTitle: tree.title,
    learnersEnrolled: roster.length,
    asOf: iso(now),
    nodes,
    prerequisiteEdges,
  };
}

// ── endpoint 2: the node drill-down (nodeStudents :269-392) ──────────────────

export async function classNodeStudents(
  deps: ClassGraphDeps,
  teacherId: string,
  classId: string,
  rootId: string,
  nodeId: string,
): Promise<ClassNodeStudentsView> {
  const { decay, bdt } = engineOf(deps);
  const c = await graphOwnedClass(deps, teacherId, classId);
  const now = deps.clock.now(); // ONE clock read: decay + provenance anchor

  const tree = await knowledgeTree(deps, rootId, true);
  const structure = collectClassStructure(tree);
  const node = structure.structureById.get(nodeId);
  if (node == null) {
    // not under this root (or not a structure node) — subject isolation
    throw new KnowledgeNotFoundError("node is not part of this subject subtree");
  }

  // the roster: exactly this class's enabled members (the heatmap's gate)
  const memberIds = await memberStudentIds(deps, classId);
  const { roster, names } = await enabledRoster(deps, memberIds);

  // one batched query per evidence table, whole roster × this node
  const stateByLearner = new Map<string, { mastery: number; attempts: number; correct_count: number; last_practiced_at: string | Date }>();
  if (roster.length > 0) {
    const rows = (await deps.sql`
      select learner_id, mastery, attempts, correct_count, last_practiced_at
      from skill_states
      where learner_id = any(${roster}::uuid[]) and node_id = any(${[nodeId]}::uuid[])`) as Array<{
      learner_id: string;
      mastery: number;
      attempts: number;
      correct_count: number;
      last_practiced_at: string | Date;
    }>;
    for (const s of rows) stateByLearner.set(s.learner_id, s);
  }
  const nodeMisconceptions = structure.misconceptionsOf.get(nodeId) ?? [];
  const miscoByLearner = new Map<string, Array<{ misconception_node_id: string; probability: number; last_evidence_at: string | Date }>>();
  if (roster.length > 0 && nodeMisconceptions.length > 0) {
    const rows = (await deps.sql`
      select learner_id, misconception_node_id, probability, last_evidence_at
      from misconception_states
      where learner_id = any(${roster}::uuid[]) and misconception_node_id = any(${nodeMisconceptions.map((m) => m.id)}::uuid[])`) as Array<{
      learner_id: string;
      misconception_node_id: string;
      probability: number;
      last_evidence_at: string | Date;
    }>;
    for (const m of rows) {
      const list = miscoByLearner.get(m.learner_id) ?? [];
      list.push(m);
      miscoByLearner.set(m.learner_id, list);
    }
  }
  const recentByLearner = new Map<string, Array<{
    id: string;
    question_id: string;
    external_ref: string | null;
    correct: boolean;
    marks_awarded: number | null;
    marks: number;
    marking_state: string;
    created_at: string | Date;
  }>>();
  if (roster.length > 0) {
    const rows = (await deps.sql`
      select a.id, a.learner_id, a.question_id, q.external_ref, a.correct, a.marks_awarded, q.marks, a.marking_state, a.created_at
      from attempts a join questions q on q.id = a.question_id
      where (q.primary_topic_node_id = ${nodeId}::uuid or exists (
          select 1 from question_topics qt
          where qt.question_id = a.question_id and qt.node_id = ${nodeId}::uuid))
        and a.learner_id = any(${roster}::uuid[])
      order by a.created_at desc
      limit ${ATTEMPT_SCAN_CAP}`) as Array<{
      id: string;
      learner_id: string;
      question_id: string;
      external_ref: string | null;
      correct: boolean;
      marks_awarded: number | null;
      marks: number;
      marking_state: string;
      created_at: string | Date;
    }>;
    for (const a of rows) {
      const slice = recentByLearner.get(a.learner_id) ?? [];
      if (slice.length < EVIDENCE_PER_STUDENT) slice.push(a);
      recentByLearner.set(a.learner_id, slice);
    }
  }

  // coverage state for THIS node, the heatmap's own derivation
  const coverageRows = new Map<string, { status: string }>();
  const covRows = (await deps.sql`
    select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at
    from teaching_coverage where class_id = ${classId}::uuid order by spec_point_node_id asc`) as Array<{
    spec_point_node_id: string;
    status: string;
  }>;
  for (const row of covRows) coverageRows.set(row.spec_point_node_id, row);
  const counts = coverageCounts(nodeId, structure, coverageRows, new Map());
  const coverageState = coverageStateOf(node, coverageRows, counts);

  // the §13.3 band distribution, restated from the same states the rows show
  let struggling = 0;
  let developing = 0;
  let proficient = 0;
  for (const s of stateByLearner.values()) {
    const effective = decayedMastery(Number(s.mastery), mapDate(s.last_practiced_at), now, decay);
    switch (bandCounts(effective, decay)) {
      case "LOW":
        struggling += 1;
        break;
      case "DEVELOPING":
        developing += 1;
        break;
      case "SECURE":
        proficient += 1;
        break;
    }
  }

  const students: ClassNodeStudentView[] = [];
  for (const learnerId of roster) {
    const s = stateByLearner.get(learnerId);
    let mastery: number | null = null;
    let effective: number | null = null;
    let band: "LOW" | "DEVELOPING" | "SECURE" | null = null;
    let attemptCount: number | null = null;
    let correctCount: number | null = null;
    let lastPracticed: string | null = null;
    if (s != null) {
      mastery = Number(s.mastery);
      effective = decayedMastery(mastery, mapDate(s.last_practiced_at), now, decay);
      band = bandCounts(effective, decay);
      attemptCount = Number(s.attempts);
      correctCount = Number(s.correct_count);
      lastPracticed = iso(s.last_practiced_at);
    }
    const misconceptions: StudentMisconceptionView[] = [];
    for (const m of miscoByLearner.get(learnerId) ?? []) {
      const miscoNode = nodeMisconceptions.find((nv) => nv.id === m.misconception_node_id) ?? null;
      // structural invariant: the state's node came from THIS node's
      // attached misconception set — a miss would be a graph
      // inconsistency, so it is skipped, not guessed
      if (miscoNode == null) continue;
      const relaxed = relaxedToPrior(
        Number(m.probability),
        bdt.prior,
        mapDate(m.last_evidence_at),
        now,
        bdt.stalenessTauDays,
      );
      misconceptions.push({
        misconceptionNodeId: miscoNode.id,
        code: miscoNode.code,
        title: miscoNode.title,
        probability: relaxed,
        active: relaxed >= bdt.activeThreshold,
      });
    }
    const recentAttempts: StudentEvidenceItemView[] = (recentByLearner.get(learnerId) ?? []).map(
      (a) => ({
        attemptId: a.id,
        questionId: a.question_id,
        questionRef: a.external_ref ?? "",
        correct: Boolean(a.correct),
        marksAwarded: a.marks_awarded == null ? null : Number(a.marks_awarded),
        questionMarks: Number(a.marks),
        markingState: a.marking_state,
        createdAt: iso(a.created_at),
      }),
    );
    students.push({
      learnerId,
      displayName: names.get(learnerId) ?? "unknown",
      mastery,
      effectiveMastery: effective,
      band,
      attempts: attemptCount,
      correctCount,
      lastPracticedAt: lastPracticed,
      misconceptions,
      recentAttempts,
    });
  }
  // weakest first (the teacher opens this panel BECAUSE the node is weak),
  // unmeasured last, then display name, then id — deterministic
  students.sort((a, b) => {
    const aUnmeasured = a.effectiveMastery == null ? 1 : 0;
    const bUnmeasured = b.effectiveMastery == null ? 1 : 0;
    if (aUnmeasured !== bUnmeasured) return aUnmeasured - bUnmeasured;
    const ae = a.effectiveMastery ?? 0.0;
    const be = b.effectiveMastery ?? 0.0;
    if (ae !== be) return ae - be;
    const an = (a.displayName ?? "").toLowerCase();
    const bn = (b.displayName ?? "").toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.learnerId < b.learnerId ? -1 : a.learnerId > b.learnerId ? 1 : 0;
  });

  return {
    classId: c.id,
    className: c.name,
    rootId,
    nodeId: node.id,
    nodeCode: node.code,
    nodeTitle: node.title,
    nodeType: node.type,
    coverageState,
    learnersEnrolled: roster.length,
    strugglingCount: struggling,
    developingCount: developing,
    proficientCount: proficient,
    asOf: iso(now),
    students,
  };
}

// ── the F-034 read model (LearnerKnowledgeGraphService :49-147) ──────────────

export type NodeWithStateView = {
  id: string;
  code: string;
  type: string;
  title: string;
  description: string | null;
  childIds: string[];
  mastery: number | null;
  effectiveMastery: number | null;
  band: "LOW" | "DEVELOPING" | "SECURE" | null;
  attempts: number | null;
  correctCount: number | null;
  lastPracticedAt: string | null;
  proceduralFluencyGap: number | null;
  reviewDueAt: string | null;
  reviewReason: string | null;
  misconceptionProbability: number | null;
  misconceptionActive: boolean | null;
  applicability: Record<string, unknown> | null;
};

export type LearnerKnowledgeGraphView = {
  learnerId: string;
  rootId: string;
  rootCode: string;
  rootTitle: string;
  asOf: string;
  nodes: NodeWithStateView[];
  prerequisiteEdges: ClassGraphEdgeView[];
};

/**
 * graphFor (:49-90): the SAME F-034 read model the student themselves sees
 * — the teacher lens adds only gates, never a second graph implementation.
 * The walk covers EVERY node INCLUDING misconception nodes (unlike the
 * class heatmap's collect()); childIds ride from the FULL tree children.
 */
export async function learnerGraphFor(
  deps: ClassGraphDeps,
  learnerId: string,
  rootId: string,
): Promise<LearnerKnowledgeGraphView> {
  const { decay, bdt } = engineOf(deps);
  const now = deps.clock.now(); // ONE injected anchor (see the clock disclosure)

  const tree = await knowledgeTree(deps, rootId, true);

  const skills = new Map<string, {
    mastery: number;
    attempts: number;
    correct_count: number;
    last_practiced_at: string | Date;
    procedural_fluency_gap: number | null;
  }>();
  const skillRows = (await deps.sql`
    select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap
    from skill_states where learner_id = ${learnerId} order by last_practiced_at desc`) as Array<{
    node_id: string;
    mastery: number;
    attempts: number;
    correct_count: number;
    last_practiced_at: string | Date;
    procedural_fluency_gap: number | null;
  }>;
  for (const s of skillRows) skills.set(s.node_id, s);

  // the readings: raw rows probability DESC, then RE-SORTED by the
  // staleness-relaxed effective probability DESC ("a fresh 0.6 diagnosis
  // must outrank a stale 0.9 one") — MED-2/ADR-032. graphFor keys by node
  // id, so the re-sort is call-sequence fidelity, not wire order.
  const readings = new Map<string, { effective: number }>();
  const rawRows = (await deps.sql`
    select misconception_node_id, probability, last_evidence_at
    from misconception_states where learner_id = ${learnerId} order by probability desc`) as Array<{
    misconception_node_id: string;
    probability: number;
    last_evidence_at: string | Date;
  }>;
  const relaxedRows = rawRows
    .map((m) => ({
      node_id: m.misconception_node_id,
      effective: relaxedToPrior(
        Number(m.probability),
        bdt.prior,
        mapDate(m.last_evidence_at),
        now,
        bdt.stalenessTauDays,
      ),
    }))
    .sort((a, b) => b.effective - a.effective);
  for (const r of relaxedRows) readings.set(r.node_id, r);

  // earliest PENDING review per node (the repository returns dueAt-ascending)
  const earliestReview = new Map<string, { due_at: string | Date; reason: string }>();
  const reviewRows = (await deps.sql`
    select node_id, due_at, reason
    from review_schedules where learner_id = ${learnerId} and status = ${"PENDING"}
    order by due_at asc`) as Array<{ node_id: string; due_at: string | Date; reason: string }>;
  for (const r of reviewRows) {
    const prev = earliestReview.get(r.node_id);
    if (prev == null) {
      earliestReview.set(r.node_id, r);
    } else {
      // merge keeps the strictly-earlier dueAt (ties keep the incumbent —
      // the rows arrive dueAt-ascending, so first-seen wins ties)
      if (!(mapDate(prev.due_at) < mapDate(r.due_at))) earliestReview.set(r.node_id, r);
    }
  }

  const nodes: NodeWithStateView[] = [];
  const byId = new Map<string, NodeWithStateView>();
  const walk = (node: NodeView): void => {
    const skill = skills.get(node.id);
    let mastery: number | null = null;
    let effective: number | null = null;
    let band: "LOW" | "DEVELOPING" | "SECURE" | null = null;
    let attempts: number | null = null;
    let correctCount: number | null = null;
    let lastPracticed: string | null = null;
    let fluencyGap: number | null = null;
    if (skill != null) {
      mastery = Number(skill.mastery);
      effective = decayedMastery(mastery, mapDate(skill.last_practiced_at), now, decay);
      band = bandCounts(effective, decay);
      attempts = Number(skill.attempts);
      correctCount = Number(skill.correct_count);
      lastPracticed = iso(skill.last_practiced_at);
      fluencyGap = skill.procedural_fluency_gap == null ? null : Number(skill.procedural_fluency_gap);
    }
    const reading = readings.get(node.id);
    const misconceptionProbability = reading == null ? null : reading.effective;
    const misconceptionActive =
      reading == null ? null : reading.effective >= bdt.activeThreshold;
    const review = earliestReview.get(node.id);
    const view: NodeWithStateView = {
      id: node.id,
      code: node.code,
      type: node.type,
      title: node.title,
      description: node.description,
      childIds: node.children.map((ch) => ch.id),
      mastery,
      effectiveMastery: effective,
      band,
      attempts,
      correctCount,
      lastPracticedAt: lastPracticed,
      proceduralFluencyGap: fluencyGap,
      reviewDueAt: review == null ? null : iso(review.due_at),
      reviewReason: review == null ? null : review.reason,
      misconceptionProbability,
      misconceptionActive,
      // curriculum metadata rides along verbatim (T-C28) — never merged
      // with, or overwritten by, any learner state below
      applicability: node.applicability,
    };
    nodes.push(view);
    byId.set(view.id, view);
    for (const child of node.children) walk(child);
  };
  walk(tree);

  const prerequisiteEdges = await prerequisiteRelations(deps, rootId, null, byId);

  return {
    learnerId,
    rootId: tree.id,
    rootCode: tree.code,
    rootTitle: tree.title,
    asOf: iso(now),
    nodes,
    prerequisiteEdges,
  };
}

// ── endpoint 3: the teacher-authorized learner graph (:394-412) ──────────────

export async function classLearnerKnowledgeGraph(
  deps: ClassGraphDeps,
  teacherId: string,
  classId: string,
  learnerId: string,
  rootId: string,
): Promise<LearnerKnowledgeGraphView> {
  await graphOwnedClass(deps, teacherId, classId);
  // the §17 privacy boundary: the learner must be an ENABLED member of THIS
  // class — the membership check short-circuits BEFORE any user lookup (the
  // frozen OR's left leg), and an absent membership neither confirms nor
  // denies any other enrollment
  const memberRows = (await deps.sql`
    select 1 as one from class_members where class_id = ${classId}::uuid and student_id = ${learnerId}::uuid`) as Array<{
    one: number;
  }>;
  if (memberRows.length === 0) {
    throw new KnowledgeNotFoundError("learner is not a member of this class");
  }
  const userRows = (await deps.sql`
    select id, enabled from users where id = ${learnerId}::uuid`) as Array<{ id: string; enabled: boolean }>;
  const user = userRows[0] as { id: string; enabled: boolean } | undefined;
  if (user == null || !user.enabled) {
    throw new KnowledgeNotFoundError("learner is not a member of this class");
  }
  return learnerGraphFor(deps, learnerId, rootId);
}
