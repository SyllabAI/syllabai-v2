/**
 * Shared test helper for the assessment module's stubbed-sql unit tests
 * (T-MIG-030 tranche 1). NOT a test file (bun test only picks up *.test.ts).
 * Mirrors apps/api/test/curriculum/helpers.ts (r7a's T-MIG-021 tranche 1/2).
 */
import type { SqlFn } from "../../src/services/assessment/sql";

export type Route = {
  match: RegExp;
  rows: Array<Record<string, unknown>>;
  /** Optional param-aware override — wins over `rows` when present. */
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

/**
 * Builds a SqlFn stub that dispatches on the rendered query text. Whitespace
 * is collapsed to single spaces (template literals carry indentation noise);
 * every issued query is recorded so tests can pin the SQL shape. Use
 * `rowsFor` when the result depends on a bound parameter (id lookups that
 * must distinguish known from unknown ids).
 */
export function fakeSql(routes: Route[]): SqlFn & { queries: string[] } {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join(" ? ")
      .replace(/\s+/g, " ")
      .trim();
    queries.push(text);
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

// ── Captured-shape fixtures (fixed-constant uuids; golden law @ 6cad6ef) ────

/** The captured MCQ submit law (w3-attempt-mcq-happy-201): chosen A, correct C. */
export const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
export const MISCONCEPTION_ID = "30000000-0000-0000-0000-000000000001";
export const TOPIC_NODE_ID = "20000000-0000-0000-0000-000000000012";
export const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
export const OPTION_A_ID = "50000000-0000-0000-0000-00000000000a";
export const OPTION_B_ID = "50000000-0000-0000-0000-00000000000b";
export const OPTION_C_ID = "50000000-0000-0000-0000-00000000000c";

/** questions row — plain column names as submit.ts selects them. */
export const QUESTION_ROW = {
  id: QUESTION_ID,
  question_type: "MCQ_SINGLE",
  marks: 1,
  exam_paper_id: null,
  active: true,
};

/** question_options rows — submit.ts / history.ts select shape. */
export const OPTION_ROWS = [
  {
    id: OPTION_A_ID,
    question_id: QUESTION_ID,
    label: "A",
    is_correct: false,
    misconception_node_id: MISCONCEPTION_ID,
  },
  {
    id: OPTION_B_ID,
    question_id: QUESTION_ID,
    label: "B",
    is_correct: false,
    misconception_node_id: null,
  },
  {
    id: OPTION_C_ID,
    question_id: QUESTION_ID,
    label: "C",
    is_correct: true,
    misconception_node_id: null,
  },
];

/** attempts JOIN questions row — the alias shape of history.ts's page query. */
export const ATTEMPT_JOINED_ROW = {
  id: "519421f0-385f-484d-93ee-f3c426ed86c5",
  question_id: QUESTION_ID,
  chosen_option_id: OPTION_A_ID,
  correct: false,
  marks_awarded: 0,
  response_time_ms: 25000,
  confidence_level: 4,
  self_doubt_flag: false,
  timed_condition: false,
  marking_state: "AUTO_GRADED",
  evidence_emitted: true,
  created_at: "2026-10-05T06:47:12.304192Z",
  q_question_type: "MCQ_SINGLE",
  q_external_ref: "SEED-WCH11-001",
  q_command_word: "Calculate",
  q_stem: "What is the mass of 0.25 mol of calcium carbonate, CaCO3 (Mr = 100.1)?",
  q_marks: 1,
  q_primary_topic_node_id: TOPIC_NODE_ID,
};

/** knowledge_nodes row — the captured topic resolution (w3-history-after-submit-200). */
export const NODE_ROW = {
  id: TOPIC_NODE_ID,
  code: "WCH11-T1.1",
  title: "Mole calculations and reacting masses",
};

/** question_topics row — evidence event payload only (not wire-visible). */
export const SECONDARY_TOPIC_ROWS = [
  { node_id: TOPIC_NODE_ID },
];

/** question_parts row shape (submit.ts select). */
export function partRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "60000000-0000-0000-0000-000000000001",
    label: "(a)",
    marks: 3,
    ...overrides,
  };
}

/** answers JOIN question_parts row shape (history.ts structured leg). */
export function answerPartRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    question_part_id: "60000000-0000-0000-0000-000000000001",
    marks_awarded: null,
    marking_state: "PENDING",
    label: "(a)",
    marks: 3,
    ...overrides,
  };
}

/** Deterministic clock for submit tests. */
export const FIXED_CLOCK = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => new Date("2026-10-05T07:45:00Z"),
};

/**
 * Spy publisher capturing publishMcq events (Observer seam pin).
 * Claims true (E-1: a real publisher fired the event) — the service must
 * then issue the guarded evidence flip; tests pin both postures.
 */
export function spyPublisher() {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    publishMcq: async (e: Record<string, unknown>) => {
      events.push(e);
      return true;
    },
  };
}
