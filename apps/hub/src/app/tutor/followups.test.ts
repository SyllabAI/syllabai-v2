import { describe, expect, test } from "bun:test";
import { followUpsFor, type Turn } from "./threads";

/**
 * run-012 chat-parity band (operator trace 1a14af4dde23b471) — the
 * follow-up chips' honesty law: zero-LLM, deterministic, gated off on
 * refused/error/aborted turns, and shaped by the turn's own band data.
 */

const base: Turn = { role: "assistant", content: "an answer", at: 0 };

const paperBand = {
  kind: "paper" as const,
  view: {
    paper: {
      paperId: "p1",
      title: "June 2019",
      paperCode: "4CH1/2C",
      sessionLabel: "June 2019",
      series: "JUN",
      year: 2019,
      validationState: "VALIDATED",
    },
    questions: [
      {
        questionId: "q1",
        externalRef: "q9",
        questionType: "SHORT",
        stem: "s",
        marks: 6,
        commandWord: "Explain",
        specPointCodes: [],
        paper: null,
      },
    ],
    questionPaper: { documentId: "d", chunkCount: 1, chunks: [] },
    markScheme: { documentId: "m", chunkCount: 1, chunks: [] },
    siblings: [],
  },
};

const questionsBand = (n: number) => ({
  kind: "questions" as const,
  view: {
    resolvedNodes: [],
    total: n,
    items: Array.from({ length: n }, (_, i) => ({
      questionId: `q${i}`,
      externalRef: null,
      questionType: null,
      stem: "s",
      marks: 3,
      commandWord: null,
      specPointCodes: [],
      paper: null,
    })),
  },
});

describe("followUpsFor", () => {
  test("honesty gates: user / error / stopped / refused turns render nothing", () => {
    expect(followUpsFor({ ...base, role: "user" })).toEqual([]);
    expect(followUpsFor({ ...base, error: true })).toEqual([]);
    expect(followUpsFor({ ...base, stopped: true })).toEqual([]);
    expect(followUpsFor({ ...base, refused: true })).toEqual([]);
  });

  test("paper band: explain q1 + harder paper + quiz (3 chips)", () => {
    expect(followUpsFor({ ...base, band: paperBand })).toEqual([
      "Explain question 1",
      "Give me a harder paper",
      "Quiz me on this paper",
    ]);
  });

  test("empty questions census is the honest empty — no chips", () => {
    expect(followUpsFor({ ...base, band: questionsBand(0) })).toEqual([]);
  });

  test("questions band: three bank chips", () => {
    expect(followUpsFor({ ...base, band: questionsBand(4) })).toEqual([
      "Explain question 1",
      "Give me easier questions",
      "Show me a full past paper",
    ]);
  });

  test("plain grounded turn: three teaching chips", () => {
    expect(followUpsFor(base)).toEqual([
      "Give me a worked example",
      "Quiz me on this",
      "Explain it more simply",
    ]);
  });

  test("deterministic: identical turns yield identical chips", () => {
    expect(followUpsFor({ ...base, band: paperBand })).toEqual(
      followUpsFor({ ...base, band: paperBand }),
    );
  });
});
