/**
 * ServableQuestions law tests (T-MIG-031 tranche 1).
 * Frozen law: ServableQuestionService.java + ServableQuestionSpec.java +
 * QuestionRepository.java @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import { ServableQuestions } from "../../src/services/questions/servable";
import {
  BLOCKED_ID,
  BLOCKED_ROW,
  BY_ID,
  INACTIVE_ROW,
  LIST_ALL,
  LIST_BY_TOPIC,
  LIST_WITHIN,
  MCQ_ID,
  MCQ_ROW,
  PAPER_OK_ID,
  PAPER_REJECTED_ID,
  STRUCTURED_ID,
  STRUCTURED_ROW,
  UNKNOWN_ID,
  fakeSql,
  servableRoutes,
} from "./helpers";

function build(extra: Parameters<typeof servableRoutes>[0] = []) {
  const sql = fakeSql(servableRoutes(extra));
  return { sql, servable: new ServableQuestions(sql) };
}

const ALL_ROWS_ROUTE: Parameters<typeof servableRoutes>[0] = [
  {
    match: LIST_ALL,
    rows: [MCQ_ROW, STRUCTURED_ROW, BLOCKED_ROW, INACTIVE_ROW],
  },
];

describe("servability boundary (the ONE owner)", () => {
  test("allActive: inactive filtered, STRUCTURED without VALIDATED current filtered, blocked papers dropped", async () => {
    const { servable } = build(ALL_ROWS_ROUTE);
    const out = await servable.allActive();
    // INACTIVE: active=false -> spec rejects. BLOCKED: paper REJECTED -> V20
    // gate drops (even though its v2 is VALIDATED). MCQ: paper-less -> serves.
    // STRUCTURED: v2 VALIDATED under the VALIDATED paper -> serves.
    expect(out.map((q) => q.id)).toEqual([MCQ_ID, STRUCTURED_ID]);
    // list ordering: by difficulty (MCQ d2 before STRUCTURED d4)
    expect(out[0]!.difficulty).toBeLessThanOrEqual(out[1]!.difficulty);
  });

  test("V20 paper-level gate: a question under a REJECTED paper never serves even with a VALIDATED version", async () => {
    const { servable } = build(ALL_ROWS_ROUTE);
    const out = await servable.allActive();
    expect(out.find((q) => q.id === BLOCKED_ID)).toBeUndefined();
  });

  test("blockingPaperIds selects exactly REJECTED/FLAGGED papers", async () => {
    const { servable, sql } = build();
    const blocked = await servable.blockingPaperIds();
    expect(blocked.has(PAPER_REJECTED_ID)).toBe(true);
    expect(blocked.has(PAPER_OK_ID)).toBe(false);
    expect(sql.queries[0]).toMatch(/validation_state in \('REJECTED', 'FLAGGED'\)/);
  });
});

describe("projection (StudentQuestionView construction laws)", () => {
  test("MCQ from(): options ordered, parts empty, stem from the question row", async () => {
    const { servable } = build(ALL_ROWS_ROUTE);
    const out = await servable.allActive();
    const mcq = out.find((q) => q.id === MCQ_ID)!;
    expect(mcq.stem).toBe("  What  is the state symbol? "); // raw row stem — no excerpting on this surface
    expect(mcq.options.map((o) => o.label)).toEqual(["A", "B"]);
    expect(mcq.options[0]).toEqual({ id: "50000000-0000-4000-8000-00000000000a", label: "A", text: "solid" });
    expect(mcq.parts).toEqual([]);
    expect(mcq.specPoints).toEqual([]); // no spec-point rows -> honest-absent empty
    expect(mcq.specPointCodes).toEqual([]);
    expect(mcq.examPaperId).toBeNull();
  });

  test("STRUCTURED structured(): current version fields win, stem/marks fallbacks, parts in order", async () => {
    const { servable } = build(ALL_ROWS_ROUTE);
    const structured = (await servable.allActive()).find((q) => q.id === STRUCTURED_ID)!;
    expect(structured.stem).toBe("v2 stem"); // version.stem non-null wins
    expect(structured.marks).toBe(6); // version.marks > 0 wins over q.marks 3
    expect(structured.difficulty).toBe(4); // version.difficulty (no fallback)
    expect(structured.commandWord).toBe("v2 cw"); // version.commandWord (no fallback)
    expect(structured.options).toEqual([]); // structured projection carries no options
    expect(structured.parts.map((p) => p.id)).toEqual([
      "60000000-0000-4000-8000-000000000001",
      "60000000-0000-4000-8000-000000000002",
    ]); // part ordering 1, 2
    expect(structured.parts[0]).toEqual({
      id: "60000000-0000-4000-8000-000000000001",
      label: "a",
      prompt: "part one",
      commandWord: "state",
      marks: 4,
    });
  });

  test("specPointRefs: PRIMARY first then SECONDARY, code-ordered; codes derived in-step", async () => {
    const { servable } = build(ALL_ROWS_ROUTE);
    const structured = (await servable.allActive()).find((q) => q.id === STRUCTURED_ID)!;
    expect(structured.specPoints.map((r) => r.role)).toEqual(["PRIMARY", "SECONDARY"]);
    expect(structured.specPointCodes).toEqual(["4CH1-1.15", "4CH1-2.3"]);
    expect(structured.specPoints[0]).toEqual({
      code: "4CH1-1.15",
      role: "PRIMARY",
      applicability: { papers: ["4CH1"] },
    });
  });
});

describe("scoping (topic / subject subtree)", () => {
  test("activeByTopic: primary OR secondary question_topics mapping, difficulty-ordered", async () => {
    const { servable, sql } = build([
      { match: LIST_BY_TOPIC, rows: [MCQ_ROW] },
    ]);
    const out = await servable.activeByTopic("20000000-0000-4000-8000-000000000012");
    expect(out.map((q) => q.id)).toEqual([MCQ_ID]);
    const q = sql.queries.find((t) => t.includes("from questions q"))!;
    expect(q).toMatch(/q\.primary_topic_node_id = \? or exists/);
    expect(q).toMatch(/from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \?/);
    expect(q).toMatch(/order by q\.difficulty/);
  });

  test("activeWithin: IN-lists bind via any(...::uuid[]) (bind-slot discipline)", async () => {
    const { servable, sql } = build([
      { match: LIST_WITHIN, rows: [MCQ_ROW] },
    ]);
    await servable.activeWithin(["20000000-0000-4000-8000-000000000012"]);
    const q = sql.queries.find((t) => t.includes("from questions q"))!;
    expect(q).toMatch(/any\(\s*\?\s*::uuid\[\]\s*\)/);
    expect(LIST_WITHIN.test(q)).toBe(true);
  });
});

describe("findById (single-question fast path)", () => {
  test("unknown id -> null (never throws)", async () => {
    const { servable } = build([
      { match: BY_ID, rows: [] },
    ]);
    expect(await servable.findById(UNKNOWN_ID)).toBeNull();
  });

  test("known MCQ -> projected with spec points; paper-less orphan skips the blocking consult", async () => {
    const { servable, sql } = build([
      { match: BY_ID, rows: [MCQ_ROW] },
    ]);
    const out = await servable.findById(MCQ_ID);
    expect(out).not.toBeNull();
    expect(out!.id).toBe(MCQ_ID);
    expect(out!.options.map((o) => o.label)).toEqual(["A", "B"]);
    // paper-less: blockingPaperIds NOT consulted (fast path), only options +
    // versions + spec points
    expect(sql.queries.some((t) => t.includes("from exam_papers"))).toBe(false);
  });

  test("question under a blocked paper -> null (gate before projection)", async () => {
    const { servable } = build([
      { match: BY_ID, rows: [BLOCKED_ROW] },
    ]);
    expect(await servable.findById(BLOCKED_ID)).toBeNull();
  });

  test("the options read selects o.option_text (column law QuestionOption.java:33 @ 6cad6ef — the o.text 42703 regression, T-MIG-067)", async () => {
    // The bare `o.text` selected a nonexistent column: Postgres 42703
    // "column o.text does not exist", 500-ing the families/topics reads on
    // the live instrument (runs #10/#11). The alias keeps the OptionRow
    // mapping unchanged; this pin fails if the column law regresses.
    const { servable, sql } = build([
      { match: BY_ID, rows: [MCQ_ROW] },
    ]);
    await servable.findById(MCQ_ID);
    const optionsQuery = sql.queries.find((q) => q.includes("from question_options o"));
    expect(optionsQuery).toBeDefined();
    // intake reconciliation (desk, PR #109): main's merged T-MIG-067 fix
    // selects o.option_text WITHOUT the alias — pin the of-record text
    expect(optionsQuery).toContain("o.option_text");
    expect(optionsQuery).not.toContain("o.text,");
  });
});
