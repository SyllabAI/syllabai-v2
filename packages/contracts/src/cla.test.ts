/**
 * Contracts pins for the CLA wire shapes (T-MIG-067 tranche-1a).
 * The deterministic laws: the closed enums, the request admission discipline
 * (sizes, blank-question rejection, unknown kind/mode rejection), the
 * ContextView identity block round-trip, the tool-trace shape (no tool
 * output text on the wire), and the FIXED §7.3 attempt-required refusal text.
 */
import { describe, expect, it } from "bun:test";
import {
  CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE,
  claAnswerViewSchema,
  claAskRequestSchema,
  claContextViewSchema,
  claKindSchema,
  claModeSchema,
  claToolTraceSchema,
} from "./cla.js";

describe("contracts/cla — the closed enums", () => {
  it("kind is the frozen six-member closed enum (ResourceContext.Kind :172-187)", () => {
    expect(claKindSchema.options).toEqual([
      "SPECIFICATION_POINT",
      "KG_TOPIC",
      "NOTE_SECTION",
      "QUESTION_PART",
      "SMART_LESSON",
      "PAST_PAPER_QUESTION",
    ]);
  });

  it("mode is the frozen four-member enum — the mode is DATA, not a model judgment", () => {
    expect(claModeSchema.options).toEqual(["EXPLAIN", "SUMMARIZE", "HINT", "CHECK"]);
  });

  it("undeclared kind and mode values are rejected 400-side ( ClaController :66 law)", () => {
    expect(claKindSchema.safeParse("KG_TOPIC").success).toBe(true);
    expect(claKindSchema.safeParse("FREEFORM").success).toBe(false);
    expect(claModeSchema.safeParse("EXPLAIN").success).toBe(true);
    expect(claModeSchema.safeParse("TEACH").success).toBe(false);
  });
});

describe("contracts/cla — the ask request admission (ClaAskRequest :69-89)", () => {
  const base = {
    kind: "KG_TOPIC",
    mode: "EXPLAIN",
    question: "why does the rate plateau?",
  };

  it("accepts the minimal KG_TOPIC ask", () => {
    const parsed = claAskRequestSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("a blank question is rejected (the @NotBlank discriminator — zod min(1))", () => {
    expect(claAskRequestSchema.safeParse({ ...base, question: "" }).success).toBe(false);
  });

  it("a question over 2000 chars is rejected (@Size(max = 2000))", () => {
    expect(
      claAskRequestSchema.safeParse({ ...base, question: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      claAskRequestSchema.safeParse({ ...base, question: "x".repeat(2000) }).success,
    ).toBe(true);
  });

  it("specCode over 80 chars is rejected (@Size(max = 80))", () => {
    expect(
      claAskRequestSchema.safeParse({ ...base, kind: "SPECIFICATION_POINT", specCode: "x".repeat(81) })
        .success,
    ).toBe(false);
    expect(
      claAskRequestSchema.safeParse({ ...base, kind: "SPECIFICATION_POINT", specCode: "4CH1-1.18" })
        .success,
    ).toBe(true);
  });

  it("noteId over 256 chars is rejected (@Size(max = 256))", () => {
    expect(
      claAskRequestSchema.safeParse({ ...base, kind: "NOTE_SECTION", noteId: "n".repeat(257) })
        .success,
    ).toBe(false);
  });

  it("malformed uuid references are rejected", () => {
    expect(claAskRequestSchema.safeParse({ ...base, rootId: "not-a-uuid" }).success).toBe(false);
    expect(
      claAskRequestSchema.safeParse({
        ...base,
        rootId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0aa",
      }).success,
    ).toBe(true);
  });

  it("undeclared fields are rejected (strict — the two-envelope law)", () => {
    expect(claAskRequestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("contracts/cla — the ContextView identity block (:46-88)", () => {
  const context = {
    kind: "PAST_PAPER_QUESTION",
    reference: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a1",
    topicNodeId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a2",
    rootId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a3",
    subjectCode: "4CH1",
    topicCode: "IALCHEM2018-U1-T3",
    topicTitle: "Empirical formulae",
    curriculumVersion: "IALCHEM2018",
    curriculumBoard: "Edexcel",
    curriculumQualification: "International GCSE",
    validationState: "VALIDATED",
    mode: "HINT",
    questionStem: "A sample of iron oxide contains 70 g Fe…",
    questionCommandWord: "Explain",
    questionMarks: 4,
    paperCode: "4CH1-1C",
    attempted: true,
    partLabel: null,
    lessonAction: null,
    noteId: null,
    noteTitle: null,
  };

  it("round-trips the full question-anchored identity exactly as resolved", () => {
    const parsed = claContextViewSchema.parse(context);
    expect(parsed.kind).toBe("PAST_PAPER_QUESTION");
    expect(parsed.validationState).toBe("VALIDATED");
    expect(parsed.questionMarks).toBe(4);
    expect(parsed.attempted).toBe(true);
  });

  it("the lesson action carries the ladder's decision as strings, honest reason detail", () => {
    const withAction = {
      ...context,
      kind: "SMART_LESSON" as const,
      questionStem: null,
      questionCommandWord: null,
      attempted: null,
      paperCode: null,
      lessonAction: {
        actionType: "PRACTISE_QUESTIONS",
        reasonCode: "INSUFFICIENT_COVERAGE",
        targetNodeId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a4",
        targetCode: "IALCHEM2018-U1-T4",
        targetTitle: "The mole",
        reasonDetail: "coverage below the ladder's threshold",
        servableQuestionCount: 12,
      },
    };
    const parsed = claContextViewSchema.parse(withAction);
    expect(parsed.lessonAction?.actionType).toBe("PRACTISE_QUESTIONS");
    expect(parsed.lessonAction?.servableQuestionCount).toBe(12);
  });

  it("KG_TOPIC contexts carry the honest nulls (stem/commandWord/attempted/paper)", () => {
    const kg = {
      ...context,
      kind: "KG_TOPIC" as const,
      questionStem: null,
      questionCommandWord: null,
      questionMarks: 0,
      paperCode: null,
      attempted: null,
    };
    const parsed = claContextViewSchema.parse(kg);
    expect(parsed.questionStem).toBeNull();
    expect(parsed.attempted).toBeNull();
    expect(parsed.questionMarks).toBe(0);
  });
});

describe("contracts/cla — the tool audit trace (:110-117)", () => {
  it("carries tool name, argument REFERENCES, sizes and latencies — never output text", () => {
    const trace = claToolTraceSchema.parse({
      tool: "GET_SPECIFICATION_CONTEXT",
      args: "root=0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a3,topic=0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a2",
      resultSize: 3,
      latencyMs: 4,
    });
    expect(trace.resultSize).toBe(3);
    expect(trace.latencyMs).toBe(4);
  });
});

describe("contracts/cla — the step-1 answer view (:22-41)", () => {
  it("the topic anchor is exactly the resolved context at matchScore 1.0", () => {
    const view = claAnswerViewSchema.parse({
      answer: "…",
      citations: [],
      context: {
        kind: "KG_TOPIC",
        reference: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a2",
        topicNodeId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a2",
        rootId: "0b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0a3",
        subjectCode: "4CH1",
        topicCode: "IALCHEM2018-U1-T3",
        topicTitle: "Empirical formulae",
        curriculumVersion: "IALCHEM2018",
        curriculumBoard: "Edexcel",
        curriculumQualification: "International GCSE",
        validationState: "VALIDATED",
        mode: "EXPLAIN",
        questionStem: null,
        questionCommandWord: null,
        questionMarks: 0,
        paperCode: null,
        attempted: null,
        partLabel: null,
        lessonAction: null,
        noteId: null,
        noteTitle: null,
      },
      topics: [{ code: "IALCHEM2018-U1-T3", title: "Empirical formulae", matchScore: 1.0 }],
      evidenceCount: 0,
      model: "",
      provider: "",
      refused: true,
      latencyMs: 0,
      tools: [],
    });
    expect(view.topics[0]?.matchScore).toBe(1.0);
    expect(view.topics).toHaveLength(1);
    expect(view.refused).toBe(true);
  });
});

describe("contracts/cla — the fixed §7.3 refusal text", () => {
  it("the attempt-required body is the frozen byte-exact string", () => {
    expect(CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE).toBe(
      "full feedback requires an attempt on this question first — " +
        "the answer-leakage gate unlocks CHECK after attempt evidence exists",
    );
  });
});
