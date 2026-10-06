/**
 * Shared fixture kit for the T-MIG-043 learner-me tranche-2 tests (the
 * helpers.ts precedent — NOT a *.test.ts file, so bun test never picks it
 * up). The fixed 8-node subject graph + the route set every NBA/route test
 * stubs, so the engine pins and the route pins exercise the SAME fixture
 * world (fleet convention: one captured-shape fixture kit per test dir).
 */
import type { Route } from "../assessment/helpers";

// ── fixed ids (fleet captured-shape style) ──────────────────────────────────

export const LEARNER = "aa000000-0000-4000-8000-000000000001";
export const SUBJECT = "20000000-0000-4000-8000-0000000000a1"; // code 4CH1 (SUBJECT root)
export const NODE_UNIT = "20000000-0000-4000-8000-0000000000a2"; // 4CH1-U1 UNIT
export const NODE_T1 = "20000000-0000-4000-8000-0000000000a3"; // 4CH1-T1 TOPIC
export const NODE_T2 = "20000000-0000-4000-8000-0000000000a4"; // 4CH1-T2 TOPIC
export const NODE_T3 = "20000000-0000-4000-8000-0000000000a5"; // 4CH1-T3 TOPIC (uncovered)
export const NODE_S1 = "20000000-0000-4000-8000-0000000000a6"; // 4CH1-S1 SUBTOPIC (under T1)
export const NODE_M1 = "20000000-0000-4000-8000-0000000000a7"; // 4CH1-M1 MISCONCEPTION
export const NODE_M2 = "20000000-0000-4000-8000-0000000000a9"; // 4CH1-M2 MISCONCEPTION (folded into T2)
export const NODE_C1 = "20000000-0000-4000-8000-0000000000a8"; // 4CH1-C1 CONCEPT (under S1)
export const NODE_OUT = "20000000-0000-4000-8000-0000000000ff"; // 4CH1-OUT TOPIC (out of subtree)
export const QUESTION_1 = "40000000-0000-4000-8000-000000000001";
export const QUESTION_2 = "40000000-0000-4000-8000-000000000002";
export const QUESTION_3 = "40000000-0000-4000-8000-000000000003";
export const ANSWER_1 = "60000000-0000-4000-8000-000000000001";
export const ANSWER_2 = "60000000-0000-4000-8000-000000000002";
export const ANSWER_3 = "60000000-0000-4000-8000-000000000003";
export const SERIES_A = "1a000000-0000-4000-8000-000000000001";
export const ASSIGNMENT_A = "3a000000-0000-4000-8000-000000000001";

export const NOW_TEXT = "2026-10-06T07:45:00Z";
export const NOW_ISO = "2026-10-06T07:45:00.000Z";
export const T_PAST = "2026-10-02T10:00:00Z"; // overdue review / past evidence
export const T_FUTURE = "2026-10-09T10:00:00Z"; // future-due review

export const CLOCK = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => new Date(NOW_TEXT),
};

// ── fixture row builders ─────────────────────────────────────────────────────

export interface NodeRowLike {
  id: string;
  code: string;
  node_type: string;
  title: string;
}

export const NODE_ROWS: NodeRowLike[] = [
  { id: SUBJECT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" },
  { id: NODE_UNIT, code: "4CH1-U1", node_type: "UNIT", title: "Unit 1" },
  { id: NODE_T1, code: "4CH1-T1", node_type: "TOPIC", title: "Topic One" },
  { id: NODE_T2, code: "4CH1-T2", node_type: "TOPIC", title: "Topic Two" },
  { id: NODE_T3, code: "4CH1-T3", node_type: "TOPIC", title: "Topic Three" },
  { id: NODE_S1, code: "4CH1-S1", node_type: "SUBTOPIC", title: "Sub One" },
  { id: NODE_M1, code: "4CH1-M1", node_type: "MISCONCEPTION", title: "Confused Ions" },
  { id: NODE_M2, code: "4CH1-M2", node_type: "MISCONCEPTION", title: "Second Misconception" },
  { id: NODE_C1, code: "4CH1-C1", node_type: "CONCEPT", title: "Concept One" },
];

export const SUBTREE = [SUBJECT, NODE_UNIT, NODE_T1, NODE_T2, NODE_T3, NODE_S1, NODE_C1];

export const PART_OF: Array<{ source_node_id: string; target_node_id: string }> = [
  { source_node_id: NODE_UNIT, target_node_id: SUBJECT },
  { source_node_id: NODE_T1, target_node_id: NODE_UNIT },
  { source_node_id: NODE_T2, target_node_id: NODE_UNIT },
  { source_node_id: NODE_T3, target_node_id: NODE_UNIT },
  { source_node_id: NODE_S1, target_node_id: NODE_T1 },
  { source_node_id: NODE_C1, target_node_id: NODE_S1 },
];

/** M1 folds into T1, M2 into T2 (the V6 MISCONCEPTION_OF contract shape). */
export const FAMILY = [
  {
    source_node_id: NODE_M1,
    target_node_id: NODE_T1,
    relation_type: "MISCONCEPTION_OF",
    source_code: "4CH1-M1",
    source_title: "Confused Ions",
    source_type: "MISCONCEPTION",
  },
  {
    source_node_id: NODE_M2,
    target_node_id: NODE_T2,
    relation_type: "MISCONCEPTION_OF",
    source_code: "4CH1-M2",
    source_title: "Second Misconception",
    source_type: "MISCONCEPTION",
  },
];

export const skillRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  node_id: NODE_T1,
  mastery: 0.3,
  attempts: 2,
  correct_count: 1,
  last_practiced_at: NOW_TEXT, // anchored at the clock → decayed == stored
  procedural_fluency_gap: null,
  ...over,
});

export const misRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  misconception_node_id: NODE_M1,
  probability: 0.9,
  evidence_count: 3,
  last_evidence_at: NOW_TEXT, // anchored → effective == stored
  ...over,
});

export const reviewRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  node_id: NODE_T1,
  due_at: T_PAST,
  reason: "DECAY_CROSSED_THRESHOLD",
  ...over,
});

export const answerRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: ANSWER_1,
  marking_state: "SMART_MARKED",
  marks_awarded: 0,
  created_at: T_PAST,
  part_marks: 2,
  part_label: "a",
  question_id: QUESTION_1,
  primary_topic_node_id: NODE_T1,
  ...over,
});

/** the primary-topic mapping the T3 servable fixtures use. */
export const QUESTION_TOPICS: Record<string, string> = {
  [QUESTION_1]: NODE_T1,
  [QUESTION_2]: NODE_T2,
  [QUESTION_3]: NODE_T3,
};

export const servableQuestionRow = (qid: string, topicId: string): Record<string, unknown> => ({
  id: qid,
  external_ref: null,
  question_type: "MCQ_SINGLE",
  stem: "stem",
  marks: 2,
  difficulty: 1,
  expected_time_seconds: 60,
  command_word: null,
  primary_topic_node_id: topicId,
  exam_paper_id: null,
  provenance: "SEED_DEMO",
  active: true,
});

// ── the route set (every read the engine + routes can issue) ────────────────

export interface NbaFixture {
  subtree?: string[];
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  prereqEdges?: Array<{ source_node_id: string; target_node_id: string }>;
  reviews?: Array<Record<string, unknown>>;
  answers?: Array<Record<string, unknown>>;
  asks?: Array<{ node_id: string; ask_count: number }>;
  signals?: Array<{ node_id: string; signal_type: string; ask_count: number }>;
  /** topics whose questions select returns one servable MCQ (default: none) */
  topicsWithServable?: string[];
  /** records every topic whose servable count is queried (cache pins) */
  onTopicCount?: (topicId: string) => void;
  /** questions the single findById read resolves (default: none) */
  servableQuestionIds?: string[];
}

export function nbaRoutes(f: NbaFixture): Route[] {
  const topics = new Set(f.topicsWithServable ?? []);
  const servableIds = new Set(f.servableQuestionIds ?? []);
  return [
    {
      match: /^select id from knowledge_nodes where id = \?$/,
      rows: [],
      rowsFor: (p) => (p[0] === SUBJECT ? [{ id: SUBJECT }] : []),
    },
    {
      // the recursive CTE, whitespace-collapsed
      match: /WHERE n\.id IN \(SELECT id FROM subtree\)$/,
      rows: [],
      rowsFor: (p) => (p[0] === SUBJECT ? (f.subtree ?? SUBTREE).map((id) => ({ id })) : []),
    },
    {
      match: /^select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
      rows: [],
      rowsFor: (p) =>
        (p[0] as string[])
          .map((id) => NODE_ROWS.find((n) => n.id === id))
          .filter((n): n is NodeRowLike => n !== undefined),
    },
    {
      match: /^select source_node_id, target_node_id from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any\( \? ::uuid\[\]\) and target_node_id = any\( \? ::uuid\[\]\)$/,
      rows: PART_OF,
    },
    {
      match: /^select e\.source_node_id, e\.target_node_id, e\.relation_type, n\.code as source_code/,
      rows: FAMILY,
    },
    {
      match: /^select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap/,
      rows: f.skills ?? [],
    },
    {
      match: /^select misconception_node_id, probability, evidence_count, last_evidence_at/,
      rows: f.misconceptions ?? [],
    },
    {
      match: /^select source_node_id, target_node_id from knowledge_edges where relation_type = 'REQUIRES_PREREQUISITE' and source_node_id = any\( \? ::uuid\[\]\) and target_node_id = any\( \? ::uuid\[\]\)$/,
      rows: f.prereqEdges ?? [],
    },
    {
      match: /^select node_id, due_at, reason from review_schedules/,
      rows: f.reviews ?? [],
    },
    {
      match: /^select a\.id, a\.marking_state, a\.marks_awarded, a\.created_at,/,
      rows: f.answers ?? [],
    },
    {
      match: /^select node_id, count\(\*\)::int as ask_count/,
      rows: f.asks ?? [],
    },
    {
      match: /^select node_id, coalesce\(signal_type, 'TOPIC_ENGAGEMENT'\) as signal_type/,
      rows: f.signals ?? [],
    },
    // ── the servable composition (questions module) ──
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = \? or exists/,
      rows: [],
      rowsFor: (p) => {
        const topicId = String(p[0]);
        f.onTopicCount?.(topicId);
        return topics.has(topicId) ? [servableQuestionRow(QUESTION_1, topicId)] : [];
      },
    },
    {
      match: /from questions q where q\.id = \?$/,
      rows: [],
      rowsFor: (p) =>
        servableIds.has(String(p[0]))
          ? [servableQuestionRow(String(p[0]), QUESTION_TOPICS[String(p[0])] ?? NODE_T1)]
          : [],
    },
    { match: /from exam_papers p where p\.validation_state in \('REJECTED', 'FLAGGED'\)$/, rows: [] },
    { match: /from question_options o where o\.question_id = any/, rows: [] },
    { match: /from question_versions v left join question_parts p on p\.question_version_id = v\.id where v\.question_id = \? order by v\.version desc$/, rows: [] },
    { match: /from question_versions v left join question_parts p on p\.question_version_id = v\.id where v\.question_id = any/, rows: [] },
    { match: /from question_spec_points qsp join knowledge_nodes kn/, rows: [] },
  ];
}

/** The agenda composition's own reads (empty evidence). */
export const AGENDA_ROUTES: Route[] = [
  { match: /from assignment_submissions where learner_id = \? order by occurred_at desc limit \?$/, rows: [] },
  { match: /from assignments order by created_at desc limit \?$/, rows: [] },
  { match: /target_series_id is not null$/, rows: [] },
  { match: /select id, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/, rows: [] },
  { match: /select id, node_id, card_id, rating, occurred_at from flashcard_ratings/, rows: [] },
];

/** The write-surface anchor reads: the deck/note anchor by CODE (tranche-1). */
export const ANCHOR_ROUTES: Route[] = [
  {
    match: /select id, node_type from knowledge_nodes where code = \?$/,
    rows: [],
    rowsFor: (p) => {
      const code = String(p[0]);
      const node = NODE_ROWS.find((n) => n.code === code);
      return node ? [{ id: node.id, node_type: node.node_type }] : [];
    },
  },
  { match: /insert into flashcard_ratings/, rows: [] },
  { match: /insert into note_votes/, rows: [] },
];
