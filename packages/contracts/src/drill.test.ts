/**
 * F-182 drill-surface contract pins — the wire law the routes validate
 * through (docs/F182-DRILL-BUILD-PLAN.md).
 */
import { describe, expect, test } from "bun:test";

import {
  drillAddressesQuerySchema,
  drillAddressesResponseSchema,
  drillDrawRequestSchema,
  drillDrawResponseSchema,
  drillEvidenceRequestSchema,
  drillEvidenceResponseSchema,
  drillMarkSchemeViewSchema,
  drillPartViewSchema,
  drillResponseSchema,
} from "./drill";

const DRAW_ID = "d1000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "e1000000-0000-4000-8000-000000000001";

const partView = {
  partId: "qstnprt_abc",
  questionId: "q1",
  setId: "official-4ch1-1c-2019-06",
  plane: "official" as const,
  order: 0,
  marks: 1,
  questionType: "multiple_choice",
  commandWord: null,
  problemMd: "The change is called",
  choices: [
    { label: "A", textMd: "vaporisation" },
    { label: "B", textMd: "condensation" },
  ],
  specPointCodes: ["4CH1-1.2"],
};

describe("drill draw request", () => {
  test("seed is optional; the response always carries the one used", () => {
    expect(drillDrawRequestSchema.parse({ course: "igcse-chemistry-19", code: "4CH1-1.25" }).seed).toBeUndefined();
    expect(drillDrawRequestSchema.parse({ course: "c", code: "x", seed: 7 }).seed).toBe(7);
  });

  test("rejects out-of-uint32 seeds, empty code, non-integer seed", () => {
    expect(drillDrawRequestSchema.safeParse({ course: "c", code: "x", seed: 0xffffffff + 1 }).success).toBe(false);
    expect(drillDrawRequestSchema.safeParse({ course: "c", code: "", seed: 1 }).success).toBe(false);
    expect(drillDrawRequestSchema.safeParse({ course: "c", code: "x", seed: 1.5 }).success).toBe(false);
    expect(drillDrawRequestSchema.safeParse({ course: "c", code: "x", seed: -1 }).success).toBe(false);
  });
});

describe("drill part view — the answer-leakage law", () => {
  test("accepts the client view (choices without isCorrect)", () => {
    expect(drillPartViewSchema.parse(partView).partId).toBe("qstnprt_abc");
  });

  test("an empty specPointCodes list can never render (anchor law)", () => {
    expect(drillPartViewSchema.safeParse({ ...partView, specPointCodes: [] }).success).toBe(false);
  });

  test("structured parts carry null choices", () => {
    expect(drillPartViewSchema.parse({ ...partView, choices: null, questionType: "structured" }).choices).toBeNull();
  });
});

describe("drill draw response", () => {
  test("round-trips the full draw envelope (F-185: the selection disclosure is a required key)", () => {
    const body = {
      drawId: DRAW_ID,
      course: "igcse-chemistry-19",
      code: "4CH1-1.25",
      seed: 123,
      poolSize: 155,
      freshPoolSize: 140,
      usedFallback: false,
      selection: { policy: "model" as const, sparseFallback: false, explorationSlots: 1 },
      parts: [partView],
    };
    expect(drillDrawResponseSchema.parse(body)).toEqual(body);
  });

  test("drawId must be a uuid", () => {
    expect(drillDrawResponseSchema.safeParse({ drawId: "not-a-uuid", course: "c", code: "x", seed: 1, poolSize: 5, freshPoolSize: 5, usedFallback: false, parts: [] }).success).toBe(false);
  });

  test("F-185: the selection disclosure binds both policies and refuses invented ones / state numbers", () => {
    const base = { drawId: DRAW_ID, course: "c", code: "x", seed: 1, poolSize: 5, freshPoolSize: 5, usedFallback: false, parts: [] };
    expect(drillDrawResponseSchema.parse({ ...base, selection: { policy: "model", sparseFallback: false, explorationSlots: 1 } }).selection.policy).toBe("model");
    expect(drillDrawResponseSchema.parse({ ...base, selection: { policy: "random", sparseFallback: true, explorationSlots: 0 } }).selection.sparseFallback).toBe(true);
    // the model policy is the only carrier of exploration slots > 0 by the law,
    // but the shape pin is the SCHEMA's: the enum + bounds are what bind
    expect(drillDrawResponseSchema.safeParse({ ...base, selection: { policy: "oracle", sparseFallback: false, explorationSlots: 0 } }).success).toBe(false);
    expect(drillDrawResponseSchema.safeParse({ ...base, selection: { policy: "model", sparseFallback: false, explorationSlots: 6 } }).success).toBe(false);
    expect(drillDrawResponseSchema.safeParse({ ...base, selection: { policy: "model", sparseFallback: "no", explorationSlots: 1 } }).success).toBe(false);
    // required key: a response without the disclosure is not a draw response
    expect(drillDrawResponseSchema.safeParse(base).success).toBe(false);
  });
});

describe("drill evidence request — the F-055 shape", () => {
  test("choice and text responses both bind", () => {
    expect(
      drillResponseSchema.parse({ kind: "choice", label: "B" }),
    ).toEqual({ kind: "choice", label: "B" });
    expect(
      drillResponseSchema.parse({ kind: "text", text: "condensation" }),
    ).toEqual({ kind: "text", text: "condensation" });
    expect(drillResponseSchema.safeParse({ kind: "choice", label: "" }).success).toBe(false);
  });

  test("confidence obeys the 1..5 band, time is non-negative", () => {
    const base = { drawId: DRAW_ID, partId: "p1", response: { kind: "text", text: "x" }, responseTimeMs: 1200 };
    expect(drillEvidenceRequestSchema.parse(base).confidenceLevel).toBeUndefined();
    expect(drillEvidenceRequestSchema.parse({ ...base, confidenceLevel: 5, selfDoubtFlag: true }).selfDoubtFlag).toBe(true);
    expect(drillEvidenceRequestSchema.safeParse({ ...base, confidenceLevel: 0 }).success).toBe(false);
    expect(drillEvidenceRequestSchema.safeParse({ ...base, confidenceLevel: 6 }).success).toBe(false);
    expect(drillEvidenceRequestSchema.safeParse({ ...base, responseTimeMs: -1 }).success).toBe(false);
  });
});

describe("drill evidence response — the instant-reveal carrier", () => {
  test("ungraded structured evidence is null/null, never 0; the F-183 reveal fields ride as honest nulls", () => {
    const body = {
      evidenceId: EVIDENCE_ID,
      drawId: DRAW_ID,
      partId: "p1",
      correct: null,
      marksAwarded: null,
      marksPossible: 2,
      solutionMd: "i) ...",
      markScheme: null,
      methodCredit: null,
    };
    expect(drillEvidenceResponseSchema.parse(body)).toEqual(body);
  });

  test("server-graded MCQ evidence carries the boolean, the marks, and the MS of record (no methodCredit)", () => {
    const body = {
      evidenceId: EVIDENCE_ID,
      drawId: DRAW_ID,
      partId: "p1",
      correct: true,
      marksAwarded: 1,
      marksPossible: 1,
      solutionMd: "**Final answer:** B",
      markScheme: {
        source: "corpus-of-record" as const,
        answerStatus: "linked",
        points: [{ ref: "2019-06-1-a-MP1", textMd: "Answer B: the crystal dissolves in the water", marks: 1 }],
        marksTotal: 1,
      },
      methodCredit: null,
    };
    expect(drillEvidenceResponseSchema.parse(body)).toEqual(body);
  });

  test("the method-credit verdict binds with per-point booleans and a derived creditsTotal", () => {
    const body = {
      evidenceId: EVIDENCE_ID,
      drawId: DRAW_ID,
      partId: "p2",
      correct: null,
      marksAwarded: null,
      marksPossible: 2,
      solutionMd: "i) ...",
      markScheme: {
        source: "corpus-of-record" as const,
        answerStatus: "linked",
        points: [
          { ref: "2019-06-2-a-MP1", textMd: "point one", marks: 1 },
          { ref: "2019-06-2-a-MP2", textMd: "point two", marks: 1 },
        ],
        marksTotal: 2,
      },
      methodCredit: {
        engine: "smart-mark" as const,
        pipelineVersion: "f183-method-credit-1.0.0",
        allocations: [
          { ref: "2019-06-2-a-MP1", methodCredited: true, rationale: "the method is stated" },
          { ref: "2019-06-2-a-MP2", methodCredited: false, rationale: "absent" },
        ],
        creditsTotal: 1,
      },
    };
    expect(drillEvidenceResponseSchema.parse(body)).toEqual(body);
    // the M-point ref and marks are part of the shape; an empty points list refuses
    expect(
      drillMarkSchemeViewSchema.safeParse({ source: "corpus-of-record", answerStatus: "linked", points: [], marksTotal: 0 }).success,
    ).toBe(false);
  });
});

describe("drill addresses", () => {
  test("query requires course; response pins the census summary shape", () => {
    expect(drillAddressesQuerySchema.parse({ course: "igcse-chemistry-19" }).course).toBe("igcse-chemistry-19");
    expect(drillAddressesQuerySchema.safeParse({}).success).toBe(false);
    const body = {
      course: "igcse-chemistry-19",
      summary: { specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 },
      addresses: [{ code: "4CH1-1.25", official: 103, topic: 52, combined: 155, drillable: true }],
    };
    expect(drillAddressesResponseSchema.parse(body)).toEqual(body);
  });
});
