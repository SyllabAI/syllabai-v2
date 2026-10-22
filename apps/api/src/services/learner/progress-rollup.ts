/**
 * DC-7 — Progress Attribution rollup (spec §3.7; prereg of record
 * docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md, launch trace 1a1649ff76417ae9).
 *
 * THE LAW (spec §3.7, verbatim): "Every progress-bearing act publishes an
 * evidence event, and every progress display is a projection of those
 * events - never a local counter." A rollup derives three display levels
 * mirroring the observed ring tree — binary completion on the leaf, a
 * fraction ring on the set or subtopic, and a fraction ring on the topic —
 * with SEPARATE dimensions per resource type (notes versus questions), and
 * the study plan subscribes to the same rollup with per-task-type
 * thresholds: a Revise task auto-completes when its note is checked; a
 * Practise task auto-completes on a marked-parts threshold (five marked
 * parts is the proposed default), not on a single submit.
 *
 * THE SUBSTRATE (all pre-existing, verified first-hand at lane open on
 * main 568f6024 — §1 of the prereg): the persisted event facts of record
 * are `ai_mark_events` (one row per AI-marked part), `attempts` (one row
 * per submitted attempt, `evidence_emitted` once-only claim upstream) and
 * `revision_note_viewed` (one row per checked note, unique per user+note).
 * The identity bridge is `knowledge_nodes` (uuid ↔ unique curriculum code ↔
 * node_type) + `knowledge_edges` (PART_OF, source=child → target=parent,
 * the hierarchy law of record). Question→node facts ride `question_topics`
 * and `question_spec_points` (active questions only — the serving filter
 * of record, `questions.active`); note→node facts ride
 * `revision_note.spec_point_codes` (comma-separated codes — the parse law
 * of record, `string_to_array(spec_point_codes, ',')`).
 *
 * THE ROLLUP IS A QUERY-TIME PROJECTION — no new event store, no migration
 * (prereg §1/§2.5): the events are already durable rows; the projection
 * reads them and derives the fractions. Deterministic per ADR-031: the day
 * boundary is computed from the INJECTED clock (UTC day — the honest
 * deterministic default, disclosed in the prereg) and is never persisted.
 *
 * DETERMINISM / PURENESS: this module WRITES NOTHING. Every display
 * consumer (rings, plan projection, dashboard copy) reads the same
 * projection, so the tree and the plan can never disagree (acceptance (c)).
 * The plan projection CALLS the progress projection internally — one build,
 * one `today`, by construction.
 */

import { NotFoundError } from "../selfmark";
import type { SqlFn } from "../tutor/sql";

/** the spec's proposed default, pinned as the constant of record (prereg §2.1) */
export const PROGRESS_PLAN_THRESHOLD_PRACTISE = 5;

/** the ancestor relation of record (teaching-toolkit.ts:764 law) */
const PART_OF = "PART_OF";

/** the three tree-relevant node types (the observed ring tree's levels) */
const TREE_NODE_TYPES = new Set(["SUBJECT", "UNIT", "TOPIC", "SUBTOPIC", "SPEC_POINT"]);

export interface ProgressNodeFraction {
  done: number;
  total: number;
  /** fraction 0..1, rounded to 3 dp for a stable wire shape */
  fraction: number;
  /** binary leaf completion (a note read / a question answered) */
  leafDone: boolean;
}

export interface ProgressNodeEntry {
  notes: ProgressNodeFraction;
  questions: ProgressNodeFraction;
}

export interface ProgressToday {
  notesChecked: number;
  markedParts: number;
  mcqSubmitted: number;
}

export interface ProgressProjection {
  courseSlug: string;
  /** keyed by knowledge_nodes.code — the code the spec tree renders verbatim */
  nodes: Record<string, ProgressNodeEntry>;
  today: ProgressToday;
  builtAt: string;
}

export interface PlanTaskRef {
  taskId: string;
  type: "REVISE" | "PRACTISE";
  /** REVISE: the note the task revises */
  noteId?: string;
  /** PRACTISE: the node code whose subtree the task practises */
  nodeCode?: string;
}

export interface PlanTaskDecision {
  taskId: string;
  type: "REVISE" | "PRACTISE";
  complete: boolean;
  autoCompletedBy: "NOTE_CHECK" | "MARKED_PARTS" | null;
  /** PRACTISE only: the measured counter and the threshold it is read against */
  markedParts?: number;
  threshold?: number;
}

export interface PlanProjection {
  courseSlug: string;
  tasks: PlanTaskDecision[];
  thresholds: { practise: number };
  /** the SAME today the progress projection derives (acceptance (c)) */
  today: ProgressToday;
  builtAt: string;
}

/** UTC day start of the injected instant (deterministic default, disclosed). */
export function dayStartOf(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const frac = (done: number, total: number): ProgressNodeFraction => ({
  done,
  total,
  fraction: total > 0 ? Math.round((done / total) * 1000) / 1000 : 0,
  leafDone: done > 0,
});

const bump = (sets: Map<string, Set<string>>, key: string, value: string): void => {
  const cur = sets.get(key);
  if (cur) cur.add(value);
  else sets.set(key, new Set([value]));
};

interface CourseUniverse {
  subjectCode: string;
  idByCode: Map<string, string>;
  codeById: Map<string, string>;
  /** node id -> node_type (the level law of record) */
  typeById: Map<string, string>;
  /** child id -> parent id (PART_OF edges inside the course universe) */
  parentOf: Map<string, string>;
}

interface QuestionLinks {
  /** node id -> distinct active question ids touching it */
  byNode: Map<string, Set<string>>;
}

interface NoteLinks {
  /** node id -> distinct note ids touching it (via spec point codes) */
  byNode: Map<string, Set<string>>;
}

async function loadUniverse(sql: SqlFn, courseSlug: string): Promise<CourseUniverse> {
  const courseRows = (await sql`
    select code, curriculum_code from course_registry where course_slug = ${courseSlug}
  `) as unknown as Array<{ code: string; curriculum_code: string | null }>;
  if (courseRows.length === 0) throw new NotFoundError("course", courseSlug);
  const subjectCode = courseRows[0]!.code;

  const nodeRows = (await sql`
    select id, code, node_type from knowledge_nodes
    where code = ${subjectCode} or code like ${subjectCode + "-%"}
  `) as unknown as Array<{ id: string; code: string; node_type: string }>;

  const idByCode = new Map<string, string>();
  const codeById = new Map<string, string>();
  const typeById = new Map<string, string>();
  const nodeIds = new Set<string>();
  for (const n of nodeRows) {
    if (!TREE_NODE_TYPES.has(n.node_type)) continue;
    idByCode.set(n.code, n.id);
    codeById.set(n.id, n.code);
    typeById.set(n.id, n.node_type);
    nodeIds.add(n.id);
  }

  const edgeRows = (await sql`
    select source_node_id, target_node_id from knowledge_edges where relation_type = ${PART_OF}
  `) as unknown as Array<{ source_node_id: string; target_node_id: string }>;
  const parentOf = new Map<string, string>();
  for (const e of edgeRows) {
    if (nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)) {
      parentOf.set(e.source_node_id, e.target_node_id);
    }
  }

  return { subjectCode, idByCode, codeById, typeById, parentOf };
}

/** ancestors of a node id, inclusive of the node itself, walking PART_OF upward */
function withAncestors(id: string, parentOf: Map<string, string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur: string | undefined = id;
  while (cur) {
    out.push(cur);
    cur = parentOf.get(cur);
    if (cur === undefined || seen.has(cur)) break;
    seen.add(cur);
  }
  return out;
}

async function loadQuestionLinks(sql: SqlFn, universe: CourseUniverse): Promise<QuestionLinks> {
  const byNode = new Map<string, Set<string>>();
  const topicRows = (await sql`
    select qt.node_id as node_id, q.id as question_id
    from question_topics qt join questions q on q.id = qt.question_id
    where q.active
  `) as unknown as Array<{ node_id: string; question_id: string }>;
  for (const r of topicRows) {
    if (universe.codeById.has(r.node_id)) bump(byNode, r.node_id, r.question_id);
  }
  const specRows = (await sql`
    select qsp.spec_point_node_id as node_id, q.id as question_id
    from question_spec_points qsp join questions q on q.id = qsp.question_id
    where q.active
  `) as unknown as Array<{ node_id: string; question_id: string }>;
  for (const r of specRows) {
    if (universe.codeById.has(r.node_id)) bump(byNode, r.node_id, r.question_id);
  }
  return { byNode };
}

async function loadNoteLinks(sql: SqlFn, universe: CourseUniverse): Promise<NoteLinks> {
  const byNode = new Map<string, Set<string>>();
  const noteRows = (await sql`
    select note_id, spec_point_codes from revision_note
  `) as unknown as Array<{ note_id: string; spec_point_codes: string }>;
  for (const r of noteRows) {
    const codes = (r.spec_point_codes ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    for (const code of codes) {
      const nodeId = universe.idByCode.get(code);
      if (nodeId !== undefined) bump(byNode, nodeId, r.note_id);
    }
  }
  return { byNode };
}

/**
 * THE projection (acceptance (a)'s event→projection integration law):
 * the persisted event facts move exactly the nodes they should — a marked
 * part moves its question's topic/spec-point nodes and their PART_OF
 * ancestors, a checked note moves the note's spec-point nodes and theirs,
 * a submitted attempt moves its question's nodes — and NOTHING else.
 */
export async function buildProgressProjection(
  sql: SqlFn,
  learnerId: string,
  courseSlug: string,
  now: Date,
): Promise<ProgressProjection> {
  const universe = await loadUniverse(sql, courseSlug);
  const qLinks = await loadQuestionLinks(sql, universe);
  const nLinks = await loadNoteLinks(sql, universe);

  const attemptRows = (await sql`
    select a.question_id as question_id, a.created_at as created_at,
           q.question_type as question_type
    from attempts a join questions q on q.id = a.question_id
    where a.learner_id = ${learnerId}
  `) as unknown as Array<{ question_id: string; created_at: string; question_type: string }>;
  const markRows = (await sql`
    select question_id, created_at from ai_mark_events where learner_id = ${learnerId}
  `) as unknown as Array<{ question_id: string; created_at: string }>;
  const viewedRows = (await sql`
    select note_id, viewed_at from revision_note_viewed where user_id = ${learnerId}
  `) as unknown as Array<{ note_id: string; viewed_at: string }>;

  // ── event → node fan-out (the once-per-(event,node) distinct law) ─────────
  // question-level graded facts: distinct questions with ANY graded event —
  // an attempt (the MCQ submit law: "a submitted MCQ ... lit green dots on
  // the tree") or an AI-marked part ("each Smart Mark advanced the topic
  // tree visibly") — both are the leaf events of record for the questions
  // dimension; the marks additionally feed the plan threshold separately.
  const gradedQuestions = new Set([
    ...attemptRows.map((r) => r.question_id),
    ...markRows.map((r) => r.question_id),
  ]);

  // per node: totals + done counters per dimension (distinct-by-construction:
  // a question/note increments a node at most once via its node-set walk)
  const qTotal = new Map<string, Set<string>>();
  const qDone = new Map<string, Set<string>>();
  for (const [nodeId, questions] of qLinks.byNode) {
    for (const qid of questions) {
      for (const n of withAncestors(nodeId, universe.parentOf)) {
        bump(qTotal, n, qid);
        if (gradedQuestions.has(qid)) bump(qDone, n, qid);
      }
    }
  }
  const nTotal = new Map<string, Set<string>>();
  const nDone = new Map<string, Set<string>>();
  for (const [nodeId, notes] of nLinks.byNode) {
    for (const nid of notes) {
      for (const n of withAncestors(nodeId, universe.parentOf)) {
        bump(nTotal, n, nid);
      }
    }
  }
  const viewedSet = new Set(viewedRows.map((r) => r.note_id));
  for (const [nodeId, notes] of nLinks.byNode) {
    for (const nid of notes) {
      if (!viewedSet.has(nid)) continue;
      for (const n of withAncestors(nodeId, universe.parentOf)) {
        bump(nDone, n, nid);
      }
    }
  }

  // ── the node payload, keyed by the curriculum code the tree renders ──────
  const nodes: Record<string, ProgressNodeEntry> = {};
  for (const [nodeId, code] of universe.codeById) {
    const nT = nTotal.get(nodeId)?.size ?? 0;
    const nD = nDone.get(nodeId)?.size ?? 0;
    const qT = qTotal.get(nodeId)?.size ?? 0;
    const qD = qDone.get(nodeId)?.size ?? 0;
    nodes[code] = {
      notes: frac(nD, nT),
      questions: frac(qD, qT),
    };
  }

  // ── the day-scoped today counts (acceptance (c)'s shared counter) ─────────
  const dayStart = dayStartOf(now);
  const dayStartIso = dayStart.toISOString();
  const today: ProgressToday = {
    notesChecked: viewedRows.filter((r) => r.viewed_at >= dayStartIso).length,
    markedParts: markRows.filter((r) => r.created_at >= dayStartIso).length,
    mcqSubmitted: attemptRows.filter(
      (r) => r.created_at >= dayStartIso && r.question_type.startsWith("MCQ"),
    ).length,
  };

  return {
    courseSlug,
    nodes,
    today,
    builtAt: now.toISOString(),
  };
}

/**
 * The plan projection — the study plan subscribes to the rollup with
 * per-task-type thresholds (spec §3.7): a REVISE task auto-completes when
 * its note is checked; a PRACTISE task auto-completes on the marked-parts
 * threshold (five marked parts, the proposed default of record), NOT on a
 * single submit (the observed product's strongest link, pinned in tests).
 * With no task list supplied (the P2 builder's future input), the
 * projection derives the honest default: one REVISE task per note in the
 * course, one PRACTISE task per subtopic node.
 */
export async function buildPlanProjection(
  sql: SqlFn,
  learnerId: string,
  courseSlug: string,
  now: Date,
  tasks?: readonly PlanTaskRef[],
): Promise<PlanProjection> {
  const projection = await buildProgressProjection(sql, learnerId, courseSlug, now);
  const universe = await loadUniverse(sql, courseSlug);
  const qLinks = await loadQuestionLinks(sql, universe);

  const markRows = (await sql`
    select question_id, created_at from ai_mark_events where learner_id = ${learnerId}
  `) as unknown as Array<{ question_id: string; created_at: string }>;

  // marked PARTS per node subtree: each ai_mark_events row IS one marked
  // part (the spec's unit — "five marked parts is the proposed default";
  // "2 to 5 to 7 percent across three parts"), NOT one distinct question.
  // A mark counts for every node its question touches and their PART_OF
  // ancestors (same walk as the rings — one projection, never a second
  // counter).
  const nodesOfQuestion = new Map<string, Set<string>>();
  for (const [nodeId, questions] of qLinks.byNode) {
    for (const qid of questions) {
      for (const n of withAncestors(nodeId, universe.parentOf)) {
        bump(nodesOfQuestion, qid, n);
      }
    }
  }
  const markedByNode = new Map<string, number>();
  for (const row of markRows) {
    for (const n of nodesOfQuestion.get(row.question_id) ?? []) {
      markedByNode.set(n, (markedByNode.get(n) ?? 0) + 1);
    }
  }

  const noteRows = (await sql`
    select note_id, spec_point_codes from revision_note
  `) as unknown as Array<{ note_id: string; spec_point_codes: string }>;
  const viewedRows = (await sql`
    select note_id, viewed_at from revision_note_viewed where user_id = ${learnerId}
  `) as unknown as Array<{ note_id: string; viewed_at: string }>;
  const viewedSet = new Set(viewedRows.map((r) => r.note_id));

  const resolved: PlanTaskRef[] =
    tasks && tasks.length > 0
      ? [...tasks]
      : [
          ...noteRows.map((r) => ({ taskId: `revise:${r.note_id}`, type: "REVISE" as const, noteId: r.note_id })),
          ...[...universe.codeById]
            .filter(([id]) => universe.typeById.get(id) === "SUBTOPIC")
            .map(([, code]) => ({ taskId: `practise:${code}`, type: "PRACTISE" as const, nodeCode: code })),
        ];

  const decisions: PlanTaskDecision[] = resolved.map((t) => {
    if (t.type === "REVISE") {
      const checked = t.noteId !== undefined && viewedSet.has(t.noteId);
      return {
        taskId: t.taskId,
        type: "REVISE",
        complete: checked,
        autoCompletedBy: checked ? "NOTE_CHECK" : null,
      };
    }
    const nodeId = t.nodeCode !== undefined ? universe.idByCode.get(t.nodeCode) : undefined;
    const markedParts = nodeId !== undefined ? (markedByNode.get(nodeId) ?? 0) : 0;
    const complete = markedParts >= PROGRESS_PLAN_THRESHOLD_PRACTISE;
    return {
      taskId: t.taskId,
      type: "PRACTISE",
      complete,
      autoCompletedBy: complete ? "MARKED_PARTS" : null,
      markedParts,
      threshold: PROGRESS_PLAN_THRESHOLD_PRACTISE,
    };
  });

  return {
    courseSlug,
    tasks: decisions,
    thresholds: { practise: PROGRESS_PLAN_THRESHOLD_PRACTISE },
    today: projection.today,
    builtAt: now.toISOString(),
  };
}
