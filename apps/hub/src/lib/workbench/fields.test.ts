/**
 * Workbench fields tests — ADR-044 run-011 (B5 client laws, the UI bar of
 * record: the served artifact is the base, the canonical grammar drives the
 * edit surface, and the delta only ever carries real changes).
 */
import { describe, expect, test } from "bun:test";
import type { ExamQuestion } from "@/lib/contracts";
import { baseCtxOf, deltaFromEdits, editableFields, hasEdits } from "./fields";

const Q: ExamQuestion = {
  id: "qstn_test_1",
  order: 1,
  difficulty: null,
  style: "mixed",
  totalMarks: 5,
  parts: [
    {
      id: "qstnprt_test_1a",
      order: 0,
      questionType: "multiple_choice",
      marks: 2,
      commandWord: null,
      specPointIds: [],
      specPointCodes: [],
      problemMd: "Which force keeps a satellite in orbit?",
      solutionMd: null,
      choices: [
        { label: "A", isCorrect: true, textMd: "gravity" },
        { label: "B", isCorrect: false, textMd: "magnetism" },
      ],
    },
    {
      id: "qstnprt_test_1b",
      order: 1,
      questionType: "structured",
      marks: 3,
      commandWord: "Explain",
      specPointIds: [],
      specPointCodes: [],
      problemMd: "Explain the effect of air resistance on the orbit.",
      solutionMd: "Drag removes energy...",
      choices: null,
    },
  ],
};

describe("editableFields (the canonical grammar surface)", () => {
  test("every canonical field appears with the served value as current", () => {
    const fields = editableFields(Q);
    const paths = fields.map((f) => f.path);
    expect(paths).toContain("parts[0].problemMd");
    expect(paths).toContain("parts[0].solutionMd");
    expect(paths).toContain("parts[0].marks");
    expect(paths).toContain("parts[0].commandWord");
    expect(paths).toContain("parts[0].choices[A].textMd");
    expect(paths).toContain("parts[0].choices[A].isCorrect");
    expect(paths).toContain("parts[1].problemMd");
    expect(paths).not.toContain("parts[2].problemMd");
    const problem = fields.find((f) => f.path === "parts[0].problemMd");
    expect(problem?.current).toBe("Which force keeps a satellite in orbit?");
  });

  test("absent served values are honestly present:false (never fabricated)", () => {
    const fields = editableFields(Q);
    const solution0 = fields.find((f) => f.path === "parts[0].solutionMd");
    expect(solution0?.present).toBe(false);
    expect(solution0?.current).toBe("");
    const solution1 = fields.find((f) => f.path === "parts[1].solutionMd");
    expect(solution1?.present).toBe(true);
    expect(solution1?.current).toBe("Drag removes energy...");
  });

  test("isCorrect fields carry the answer-key flag as text", () => {
    const fields = editableFields(Q);
    const a = fields.find((f) => f.path === "parts[0].choices[A].isCorrect");
    expect(a?.current).toBe("true");
    const b = fields.find((f) => f.path === "parts[0].choices[B].isCorrect");
    expect(b?.current).toBe("false");
  });
});

describe("baseCtxOf (the base-shape context the engine validates against)", () => {
  test("part count + served choice labels", () => {
    const ctx = baseCtxOf(Q);
    expect(ctx.partCount).toBe(2);
    expect(ctx.choiceLabels["0"]).toEqual(["A", "B"]);
    expect(ctx.choiceLabels["1"]).toEqual([]);
  });
});

describe("deltaFromEdits (the candidate delta law)", () => {
  test("only real changes ride; before is ALWAYS the served value", () => {
    const delta = deltaFromEdits(Q, {
      "parts[1].commandWord": "State", // real change
      "parts[0].problemMd": "Which force keeps a satellite in orbit?", // unchanged
      "parts[0].choices[B].textMd": "magnetostatics", // real change
    });
    expect(delta).toHaveLength(2);
    // render order: parts[0] fields precede parts[1] fields
    expect(delta[0]).toEqual({ field: "parts[0].choices[B].textMd", before: "magnetism", after: "magnetostatics" });
    expect(delta[1]).toEqual({ field: "parts[1].commandWord", before: "Explain", after: "State" });
  });

  test("no edits → empty delta (the propose gate)", () => {
    expect(deltaFromEdits(Q, {})).toEqual([]);
    expect(hasEdits(Q, {})).toBe(false);
    expect(hasEdits(Q, { "parts[0].marks": "2" })).toBe(false); // same value
    expect(hasEdits(Q, { "parts[0].marks": "3" })).toBe(true);
  });
});
