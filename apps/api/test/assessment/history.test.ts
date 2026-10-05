/**
 * AttemptHistoryReader unit tests (T-MIG-030 tranche 1) — stubbed sql via
 * fakeSql; each test pins BOTH the query shape (parity with the frozen
 * AttemptRepository/AttemptHistoryService law) and the assembled wire
 * behavior (captured w3-history-after-submit-200 law).
 */
import { describe, expect, test } from "bun:test";
import { AttemptHistoryReader, clampLimit, excerpt } from "../../src/services/assessment/history";
import {
  fakeSql,
  ATTEMPT_JOINED_ROW,
  NODE_ROW,
  OPTION_ROWS,
  LEARNER_ID,
  TOPIC_NODE_ID,
  QUESTION_ID,
  answerPartRow,
  type Route,
} from "./helpers";

const PAGE_MATCH = /select a\.id, a\.question_id, a\.chosen_option_id.*from attempts a join questions q on q\.id = a\.question_id where a\.learner_id = \? order by a\.created_at desc limit \?/;
const COUNT_MATCH = /select count\(\*\) as total from attempts where learner_id = \?/;
const OPTIONS_MATCH = /select id, question_id, label, is_correct, misconception_node_id from question_options where question_id = any\( \? ::uuid\[\]\)/;
const PARTS_MATCH = /select ans\.question_part_id, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const NODES_MATCH = /select id, code, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/;

function baseRoutes(attemptRows: Array<Record<string, unknown>>): Route[] {
  return [
    { match: PAGE_MATCH, rows: attemptRows, rowsFor: (p: unknown[]) => attemptRows.slice(0, Number(p[1])) },
    { match: COUNT_MATCH, rows: [{ total: String(attemptRows.length) }] },
    { match: OPTIONS_MATCH, rows: OPTION_ROWS },
    { match: NODES_MATCH, rows: [NODE_ROW] },
  ];
}

describe("clampLimit (AttemptHistoryService.java:134-143)", () => {
  test("null → default 50", () => {
    expect(clampLimit(null)).toBe(50);
    expect(clampLimit(undefined)).toBe(50);
  });
  test("below 1 → default 50 (advisory, never a pagination protocol)", () => {
    expect(clampLimit(0)).toBe(50);
    expect(clampLimit(-3)).toBe(50);
  });
  test("capped at MAX_LIMIT 100", () => {
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(100)).toBe(100);
  });
  test("in-range passes through", () => {
    expect(clampLimit(7)).toBe(7);
  });
});

describe("excerpt (AttemptHistoryService.java:122-129)", () => {
  test("short stem: strip + collapse only", () => {
    expect(excerpt("  What is   the mass?\n")).toBe("What is the mass?");
  });
  test("exactly 220 chars is unchanged", () => {
    const s = "x".repeat(220);
    expect(excerpt(s)).toBe(s);
  });
  test("221+ chars: truncate to 219 + ellipsis (U+2026)", () => {
    const s = "y".repeat(230);
    expect(excerpt(s)).toBe("y".repeat(219) + "…");
  });
});

describe("historyFor — MCQ attempt assembly (w3-history-after-submit-200 law)", () => {
  test("assembles the captured item: labels, misconception, topic, marks", async () => {
    const sql = fakeSql(baseRoutes([ATTEMPT_JOINED_ROW]));
    const reader = new AttemptHistoryReader(sql);
    const view = await reader.historyFor(LEARNER_ID, null);

    expect(view).toEqual({
      learnerId: LEARNER_ID,
      total: 1,
      returned: 1,
      attempts: [
        {
          attemptId: "519421f0-385f-484d-93ee-f3c426ed86c5",
          questionId: QUESTION_ID,
          questionType: "MCQ_SINGLE",
          externalRef: "SEED-WCH11-001",
          commandWord: "Calculate",
          stemExcerpt: "What is the mass of 0.25 mol of calcium carbonate, CaCO3 (Mr = 100.1)?",
          marksTotal: 1,
          topicNodeId: TOPIC_NODE_ID,
          topicCode: "WCH11-T1.1",
          topicTitle: "Mole calculations and reacting masses",
          correct: false,
          marksAwarded: 0,
          markingState: "AUTO_GRADED",
          evidenceEmitted: true,
          chosenOptionLabel: "A",
          correctOptionLabel: "C",
          implicatedMisconceptionIds: ["30000000-0000-0000-0000-000000000001"],
          selfDoubtFlag: false,
          timedCondition: false,
          confidenceLevel: 4,
          responseTimeMs: 25000,
          attemptedAt: "2026-10-05T06:47:12.304Z",
          parts: [],
        },
      ],
    });
  });

  test("pins the page query shape: join questions in-statement, created_at desc, limit bound", async () => {
    const sql = fakeSql(baseRoutes([ATTEMPT_JOINED_ROW]));
    await new AttemptHistoryReader(sql).historyFor(LEARNER_ID, 25);
    expect(sql.queries[0]).toMatch(PAGE_MATCH);
    expect(sql.queries[1]).toMatch(COUNT_MATCH);
    expect(sql.queries[2]).toMatch(OPTIONS_MATCH);
    expect(sql.queries[3]).toMatch(NODES_MATCH);
  });

  test("limit clamps to 100 in the bound parameter (PageRequest parity)", async () => {
    let boundLimit: unknown = null;
    const routes = [
      {
        match: PAGE_MATCH,
        rows: [ATTEMPT_JOINED_ROW],
        rowsFor: (p: unknown[]) => {
          boundLimit = p[1];
          return [ATTEMPT_JOINED_ROW];
        },
      },
      { match: COUNT_MATCH, rows: [{ total: "1" }] },
      { match: OPTIONS_MATCH, rows: OPTION_ROWS },
      { match: NODES_MATCH, rows: [NODE_ROW] },
    ];
    await new AttemptHistoryReader(fakeSql(routes)).historyFor(LEARNER_ID, 500);
    expect(boundLimit).toBe(100);
  });

  test("empty history: no options/nodes queries issued (batch guards)", async () => {
    const sql = fakeSql(baseRoutes([]));
    const view = await new AttemptHistoryReader(sql).historyFor(LEARNER_ID, null);
    expect(view).toEqual({ learnerId: LEARNER_ID, total: 0, returned: 0, attempts: [] });
    expect(sql.queries.length).toBe(2);
    expect(sql.queries[0]).toMatch(PAGE_MATCH);
    expect(sql.queries[1]).toMatch(COUNT_MATCH);
  });

  test("missing topic node → NotFound 404 parity (graph.node contract)", async () => {
    const routes = baseRoutes([ATTEMPT_JOINED_ROW]);
    routes[3] = { match: NODES_MATCH, rows: [] }; // node lookup misses
    const sql = fakeSql(routes);
    let thrown: unknown = null;
    try {
      await new AttemptHistoryReader(sql).historyFor(LEARNER_ID, null);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(`knowledge node ${TOPIC_NODE_ID} not found`);
  });
});

describe("historyFor — structured attempts (parts settle rule)", () => {
  const structuredRow = {
    ...ATTEMPT_JOINED_ROW,
    chosen_option_id: null,
    correct: true,
    marks_awarded: null,
    marking_state: "SMART_MARKED",
    evidence_emitted: true,
    q_question_type: "STRUCTURED",
    q_external_ref: null,
    q_command_word: null,
    q_stem: "Explain the trend.",
  };

  test("pending parts: marksAwarded null, correct null, parts rendered", async () => {
    const routes = baseRoutes([structuredRow]);
    // insert the parts route between options and nodes (per-attempt leg)
    routes.splice(3, 0, {
      match: PARTS_MATCH,
      rows: [answerPartRow({ marks_awarded: null })],
    });
    const view = await new AttemptHistoryReader(fakeSql(routes)).historyFor(LEARNER_ID, null);
    const item = view.attempts[0]!;
    expect(item.chosenOptionLabel).toBeNull();
    expect(item.correctOptionLabel).toBeNull();
    expect(item.implicatedMisconceptionIds).toEqual([]);
    expect(item.marksAwarded).toBeNull();
    expect(item.correct).toBeNull();
    expect(item.parts).toEqual([
      {
        partId: "60000000-0000-0000-0000-000000000001",
        label: "(a)",
        marksPossible: 3,
        marksAwarded: null,
        markingState: "PENDING",
      },
    ]);
  });

  test("all parts settled: marksAwarded = part sum, correct = attempt row value", async () => {
    const routes = baseRoutes([structuredRow]);
    routes.splice(3, 0, {
      match: PARTS_MATCH,
      rows: [
        answerPartRow({ question_part_id: "60000000-0000-0000-0000-000000000001", marks_awarded: 2, marking_state: "SMART_MARKED" }),
        answerPartRow({ question_part_id: "60000000-0000-0000-0000-000000000002", marks_awarded: 1, marking_state: "SMART_MARKED", label: "(b)", marks: 1 }),
      ],
    });
    const view = await new AttemptHistoryReader(fakeSql(routes)).historyFor(LEARNER_ID, null);
    const item = view.attempts[0]!;
    expect(item.marksAwarded).toBe(3);
    expect(item.correct).toBe(true);
    expect(item.parts.map((p) => p.partId)).toEqual([
      "60000000-0000-0000-0000-000000000001",
      "60000000-0000-0000-0000-000000000002",
    ]);
  });
});
