/**
 * Run-015 pins — the deterministic quiz scaffold (proposal #6c, operator
 * trace 1a14f63469aea2e1 "Proceed with #6c"). A quiz-shaped ask on a pinned
 * paper serves the paper's OWN structured bank questions (deterministic
 * selection, real QP stems, the paper's own numbering and marks) instead of
 * the serving model's improvisation — the drift and spec-as-content classes
 * die at the data layer. Advisory posture: no pin / no scaffoldable rows /
 * any loader failure = the ask proceeds exactly as before (the v11 law
 * governs an improvised quiz; the v12 system rule governs the scaffold).
 */
import { describe, expect, test } from "bun:test";
import {
  QUIZ_SCAFFOLD_MAX_QUESTIONS,
  QUIZ_STEM_BOUND,
  isQuizAsk,
  loadQuizScaffold,
} from "../../src/services/tutor/quiz-scaffold";
import { hygienicStem } from "../../src/services/tutor/stem-hygiene";
import { prepare, karagAsk, type KaragDeps } from "../../src/services/tutor/karag";
import { evidenceFromChunk, type EvidenceItem } from "../../src/services/tutor/evidence";
import { userPrompt } from "../../src/services/tutor/prompt";
import type { SqlFn } from "../../src/services/tutor/sql";
import type { Clock } from "../../src/services/tutor/session-store";

// ── isQuizAsk — the precision-first intent law ───────────────────────────────

describe("run-015 — isQuizAsk (precision-first intent detection)", () => {
  test("quiz-shaped asks fire", () => {
    const positives = [
      "quiz me on this",
      "Quiz me",
      "can you quiz me on electrolysis?",
      "let's do a quiz",
      "start a quiz on this paper",
      "give us a quiz on bonding",
      "test me on this paper",
      "test my understanding of moles",
      "give me some practice questions on rates",
      "practice questions please",
      "ask me some questions from this paper",
      "set me a few questions",
      "drill me on bonding",
    ];
    for (const q of positives) {
      expect(isQuizAsk(q)).toBe(true);
    }
  });

  test("subject vocabulary and non-quiz shapes never fire (precision-first)", () => {
    const negatives = [
      "I have a question about moles",
      "How do I test for chloride ions?",
      "the flame test for cations",
      "what does the test for sulfate ions show?",
      "explain question 4 from june 2019 paper 2",
      "check my answer to question 2",
      "can you give me the mark scheme for question 1",
      "explain electrolysis",
      "that quiz was hard", // a meta remark, not a quiz ask
      "",
    ];
    for (const q of negatives) {
      expect(isQuizAsk(q)).toBe(false);
    }
  });
});

// ── loadQuizScaffold — the bank-row loader law ────────────────────────────────

type Row = Record<string, unknown>;
function fakeSql(responses: Record<string, Row[]>) {
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    void params;
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn;
  return fn;
}

const BANK_ROWS: Row[] = [
  { id: "q1", external_ref: "1", question_type: "MCQ", stem: "What is the test for water?", marks: 2, command_word: "State" },
  { id: "q2", external_ref: "2", question_type: "OPEN", stem: "Explain why electrolysis of molten alumina produces aluminium.", marks: 3, command_word: "Explain" },
  { id: "q3", external_ref: "3", question_type: "OPEN", stem: "Describe a flame test for potassium.", marks: 2, command_word: "Describe" },
  { id: "q4", external_ref: "4", question_type: "OPEN", stem: "Balance the equation for the thermal decomposition.", marks: 1, command_word: null },
  { id: "q5", external_ref: "5", question_type: "OPEN", stem: "Calculate the number of moles in 8 g of methane.", marks: 3, command_word: "Calculate" },
  { id: "q6", external_ref: "6", question_type: "OPEN", stem: "Extra row beyond the cap.", marks: 1, command_word: null },
  { id: "q7", external_ref: null, question_type: "OPEN", stem: "A row without the paper's own numbering.", marks: 1, command_word: null },
];

describe("run-015 — loadQuizScaffold", () => {
  test("serves the paper's own rows in external_ref order, hygienic stems, marks, capped", async () => {
    const scaffold = await loadQuizScaffold(
      fakeSql({ "from questions q": BANK_ROWS }),
      "paper-2c",
      "4CH0/2C Summer 2016",
      "quiz me on this",
    );
    expect(scaffold).not.toBeNull();
    expect(scaffold!.paperId).toBe("paper-2c");
    expect(scaffold!.label).toBe("4CH0/2C Summer 2016");
    expect(scaffold!.questions.length).toBe(QUIZ_SCAFFOLD_MAX_QUESTIONS);
    expect(scaffold!.questions.map((q) => q.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(scaffold!.questions[0]).toEqual({
      number: "1",
      stem: hygienicStem("What is the test for water?"),
      marks: 2,
      commandWord: "State",
    });
    expect(scaffold!.questions[3]!.commandWord).toBeNull();
  });

  test("a question-number ref in the ask scaffolds that question alone", async () => {
    const scaffold = await loadQuizScaffold(
      fakeSql({ "from questions q": BANK_ROWS }),
      "paper-2c",
      "4CH0/2C Summer 2016",
      "quiz me on question 2",
    );
    expect(scaffold).not.toBeNull();
    expect(scaffold!.questions.map((q) => q.number)).toEqual(["2"]);
  });

  test("rows without the paper's own numbering are dropped (no label, no scaffold)", async () => {
    const scaffold = await loadQuizScaffold(
      fakeSql({ "from questions q": BANK_ROWS.slice(6) }),
      "paper-2c",
      "label",
      "quiz me on this",
    );
    expect(scaffold).toBeNull();
  });

  test("a paper with zero structured bank rows degrades to null (fail-open)", async () => {
    const scaffold = await loadQuizScaffold(fakeSql({}), "paper-2c", "label", "quiz me on this");
    expect(scaffold).toBeNull();
  });

  test("a null/degenerate paperId never queries", async () => {
    expect(await loadQuizScaffold(fakeSql({ "from questions q": BANK_ROWS }), "  ", "label", "quiz me")).toBeNull();
  });

  test("stems are bounded at QUIZ_STEM_BOUND (the pin's QP chunks carry the verbatim text)", async () => {
    const long = "x".repeat(QUIZ_STEM_BOUND + 500);
    const scaffold = await loadQuizScaffold(
      fakeSql({ "from questions q": [{ id: "q1", external_ref: "1", question_type: null, stem: long, marks: null, command_word: null }] }),
      "paper-2c",
      "label",
      "quiz me on this",
    );
    expect(scaffold!.questions[0]!.stem.length).toBe(QUIZ_STEM_BOUND);
    expect(scaffold!.questions[0]!.marks).toBeNull();
  });
});

// ── the scaffold tier inside prepare() ───────────────────────────────────────

const fixedClock: Clock = { now: () => new Date("2026-10-18T00:00:00Z") };

const emptyGraph = {
  async structureNodes() {
    return [];
  },
  async prerequisiteChains() {
    return new Map();
  },
  async misconceptionsForTopics() {
    return new Map();
  },
};

const scopes = {
  async resolveActive() {
    return { curriculumVersionId: "cv", code: "4CH1", surface: new Set<string>() };
  },
  async resolveForCourse() {
    return null;
  },
};

const chunkItem = (row: string, page: number | null, chunkId: string, kind: string, cosine = 0.9): EvidenceItem =>
  evidenceFromChunk({
    documentRowId: row,
    documentId: "doc-" + row,
    documentVersion: 1,
    chunkId,
    chunkIndex: 0,
    kind,
    content: `content-${chunkId}`,
    pageStart: page,
    pageEnd: null,
    elementIds: [],
    embeddingModel: "test",
    cosine,
  });

function baseDeps(over: Partial<KaragDeps>): KaragDeps {
  return {
    sql: fakeSql({}),
    clock: fixedClock,
    kgGraph: emptyGraph,
    scopes,
    vectorRetriever: async () => [chunkItem("rowD", 1, "d1", "EXTERNAL_NOTES", 0.6)],
    paperQuestionResolver: async () => ({ items: [], identityParsed: false, identityLabel: null }),
    generator: {
      generate: async () => ({ answer: "", model: "m", provider: "p", finishReason: null }),
      streamGenerate: async function* () {},
    },
    telemetry: () => {},
    ...over,
  } as KaragDeps;
}

const PIN = {
  paperId: "paper-2c",
  paperCode: "4CH0/2C",
  sessionLabel: "Summer 2016",
  series: "JUN",
  year: 2016,
  validationState: "VALIDATED",
  items: [chunkItem("rowPin", 2, "pin1", "QUESTION_PAPER")],
};

describe("run-015 — the quiz scaffold tier in the ka-rag prepare()", () => {
  test("a quiz ask on a pinned paper carries the scaffold on the PreparedAsk", async () => {
    const deps = baseDeps({
      sql: fakeSql({ "from questions q": BANK_ROWS }),
      paperPin: async () => PIN,
    });
    const prep = await prepare(deps, "l1", "quiz me on this", [], null, "paper-2c");
    expect(prep.quizScaffold).not.toBeNull();
    expect(prep.quizScaffold!.label).toBe("4CH0/2C Summer 2016");
    expect(prep.quizScaffold!.questions.map((q) => q.number)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("the assembled context the generator receives carries the scaffold (blocking ask)", async () => {
    let generatedWithContext: unknown = null;
    const deps = baseDeps({
      sql: fakeSql({ "from questions q": BANK_ROWS }),
      paperPin: async () => PIN,
      generator: {
        generate: async (_q, _h, context) => {
          generatedWithContext = context;
          return { answer: "ok", model: "m", provider: "p", finishReason: null };
        },
        streamGenerate: async function* () {},
      },
    });
    await karagAsk(deps, "l1", "quiz me on this", [], "s1", null, "paper-2c");
    const ctx = generatedWithContext as { quizScaffold: { label: string; questions: Array<{ number: string }> } | null };
    expect(ctx.quizScaffold).not.toBeNull();
    expect(ctx.quizScaffold!.label).toBe("4CH0/2C Summer 2016");
    expect(ctx.quizScaffold!.questions.map((q) => q.number)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("a non-quiz ask on the same pinned paper never scaffolds", async () => {
    const deps = baseDeps({
      sql: fakeSql({ "from questions q": BANK_ROWS }),
      paperPin: async () => PIN,
    });
    const prep = await prepare(deps, "l1", "explain electrolysis", [], null, "paper-2c");
    expect(prep.quizScaffold).toBeNull();
  });

  test("a quiz ask without a pin never scaffolds (advisory posture)", async () => {
    const deps = baseDeps({ sql: fakeSql({ "from questions q": BANK_ROWS }) });
    const prep = await prepare(deps, "l1", "quiz me on this", [], null, null);
    expect(prep.quizScaffold).toBeNull();
    expect(prep.activePaperLabel).toBeNull();
  });

  test("a loader failure degrades honestly to the unpinned-scaffold ask", async () => {
    const failing = (async () => {
      throw new Error("db down");
    }) as unknown as SqlFn;
    const deps = baseDeps({ sql: failing, paperPin: async () => PIN });
    const prep = await prepare(deps, "l1", "quiz me on this", [], null, "paper-2c");
    expect(prep.quizScaffold).toBeNull();
    // the pin's own evidence still leads — only the scaffold degrades
    expect(prep.evidence.map((i) => i.chunkId)).toEqual(["pin1", "d1"]);
  });
});

// ── the QUIZ SCAFFOLD prompt block ───────────────────────────────────────────

const scaffoldContext = {
  learnerBrief: "Learner state: no prior evidence on the topics in this question.",
  memoryBrief: null,
  knowledgeBrief: "Curriculum context: no topics matched this question.",
  evidence: [] as EvidenceItem[],
  interventionPlan: { type: "EXPLANATION", rationale: "anonymous request", actions: ["Explain the concept from the supplied sources."] },
  activePaperLabel: "4CH0/2C Summer 2016",
  quizScaffold: {
    paperId: "paper-2c",
    label: "4CH0/2C Summer 2016",
    questions: [
      { number: "1", stem: "What is the test for water?", marks: 2, commandWord: "State" },
      { number: "2", stem: "Explain why electrolysis of molten alumina produces aluminium.", marks: 3, commandWord: "Explain" },
      { number: "3", stem: "Single-mark row.", marks: 1, commandWord: null },
    ],
  },
};

describe("run-015 — the QUIZ SCAFFOLD prompt block", () => {
  test("renders the serving law, the paper label and each question with its own number and marks", () => {
    const prompt = userPrompt("quiz me on this", [], scaffoldContext, "TESTNONCE");
    expect(prompt).toContain("QUIZ SCAFFOLD:");
    expect(prompt).toContain('the pinned paper "4CH0/2C Summer 2016"');
    expect(prompt).toContain("ONLY the ones listed below, in this");
    expect(prompt).toContain("do not reveal answers before the learner has attempted each");
    expect(prompt).toContain("- Question 1 (2 marks): What is the test for water?");
    expect(prompt).toContain("- Question 2 (3 marks): Explain why electrolysis");
    expect(prompt).toContain("- Question 3 (1 mark): Single-mark row.");
  });

  test("the block rides AFTER the ACTIVE PAPER CONTEXT line (recency order)", () => {
    const prompt = userPrompt("quiz me on this", [], scaffoldContext, "TESTNONCE");
    expect(prompt.indexOf("ACTIVE PAPER CONTEXT:")).toBeGreaterThanOrEqual(0);
    expect(prompt.indexOf("QUIZ SCAFFOLD:")).toBeGreaterThan(prompt.indexOf("ACTIVE PAPER CONTEXT:"));
    expect(prompt.indexOf("QUIZ SCAFFOLD:")).toBeLessThan(prompt.indexOf("INTERVENTION PLAN:"));
  });

  test("no scaffold → no block (the v10..v11 prompt shapes are untouched)", () => {
    const prompt = userPrompt("explain electrolysis", [], { ...scaffoldContext, quizScaffold: null }, "TESTNONCE");
    expect(prompt).not.toContain("QUIZ SCAFFOLD");
  });

  test("a scaffold with zero questions → no block (the loader's null is the only route, but the render also guards)", () => {
    const prompt = userPrompt(
      "quiz me on this",
      [],
      { ...scaffoldContext, quizScaffold: { ...scaffoldContext.quizScaffold, questions: [] } },
      "TESTNONCE",
    );
    expect(prompt).not.toContain("QUIZ SCAFFOLD");
  });
});
