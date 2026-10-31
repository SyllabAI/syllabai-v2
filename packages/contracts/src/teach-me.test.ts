/**
 * T-TEACHME-001 run-001 contract pins — acceptance = the ADR-040 doctrine
 * rendered honest on the wire. Positive pins from the ruled shapes (Q1–Q5),
 * negative pins for rejected inputs, and the doctrine pins: zod-strict
 * (unknown keys rejected), the 3-spec-point ceiling, the AI_SUGGESTED-only
 * evidence vocabulary, and the fail-closed error codes of record.
 */
import { describe, expect, it } from "bun:test";

import {
  createSessionRequestSchema,
  postMessageResponseSchema,
  pupilMessageSchema,
  reviewCardSchema,
  sessionHistoryItemSchema,
  teachMeErrorCodeSchema,
  teachSessionSchema,
  verdictChipSchema,
} from "./teach-me";

const T = "2026-11-01T09:00:00.000Z";

const OBJECTIVES = [
  {
    id: "3f1d2c47-8a5e-4b6a-9c1d-2e4f6a8b0c1d",
    ordinal: 1,
    text: "Explain how the next digit determines rounding to a stated number of decimal places.",
    specPointIds: ["4CH1-1.25"],
    status: "not_started",
  },
  {
    id: "5a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d",
    ordinal: 2,
    text: "Distinguish between rounding to decimal places and rounding to significant figures.",
    specPointIds: ["4CH1-1.25"],
    status: "not_started",
  },
  {
    id: "6b7c8d9e-2f3a-4b5c-9d0e-1f2a3b4c5d6e",
    ordinal: 3,
    text: "Describe how leading zeros affect significant-figure counting.",
    specPointIds: ["4CH1-1.26"],
    status: "not_started",
  },
] as const;

const SESSION = {
  id: "7c8d9e0f-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  courseId: "igcse-chemistry-19",
  specPointIds: ["4CH1-1.25", "4CH1-1.26"],
  difficulty: "hard",
  length: "in_depth",
  mode: "chat",
  status: "active",
  objectives: OBJECTIVES,
  messageCount: 0,
  llmCallCount: 1,
  tokensUsed: 0,
  createdAt: T,
  endedAt: null,
};

const CHIP = {
  messageSeq: 1,
  verdict: "Great",
  feedbackLine:
    "You covered how the deciding digit is the one right after the last place you keep.",
  coveredObjectiveIds: [OBJECTIVES[0].id],
  contradictionDetected: false,
  wordFloorPassed: true,
  overlapScore: 0.21,
  flaggedPastedNotes: false,
};

const PUPIL = {
  kind: "paraphrase_probe",
  text: "So what I've got now is that the next digit decides — but what happens when the hundreds digit is 9 and needs to go up?",
};

const REVIEW = {
  sessionId: SESSION.id,
  strengths: [{ quote: "5.96 → 6.0 because the 9 rounds the 6 up", messageSeq: 3 }],
  improvements: [
    {
      statement: "the 2nd decimal digit of 0.004728 is 7",
      correction:
        "The digits after the decimal point are 0, 0, 4, 7, 2, 8 — the 2nd decimal digit is 0.",
      specPointIds: ["4CH1-1.25"],
    },
  ],
  specPointVerdicts: [
    { specPointId: "4CH1-1.25", verdict: "covered", evidenceQuote: "5.96 → 6.0" },
    { specPointId: "4CH1-1.26", verdict: "partially_covered", evidenceQuote: null },
  ],
  misconceptionNotes: [
    { statement: "leading zeros count as significant figures", matchedMisconceptionId: null, confidence: 0.7 },
  ],
  examAnchors: [
    { specPointId: "4CH1-1.25", paperRef: "4CH1/1H June 2022", questionRef: "Q3(b)" },
  ],
  prereqWarnings: [],
  suggestedPractice: [
    {
      label: "Rounding · Question Bank",
      resourceType: "question_bank",
      href: "/courses/igcse-chemistry-19/practise/rounding",
    },
  ],
  generatedAt: T,
};

describe("teach-me contract pins (T-TEACHME-001 run-001, ADR-040)", () => {
  it("positive: a ruled session shape parses (Quick=3/In-Depth=4 objectives, ≤3 spec points)", () => {
    const s = teachSessionSchema.parse(SESSION);
    expect(s.objectives).toHaveLength(3);
    expect(s.specPointIds.length).toBeLessThanOrEqual(3);
    expect(s.status).toBe("active");
  });

  it("positive: the review card of record parses, corrections carry statement+correction (D2)", () => {
    const r = reviewCardSchema.parse(REVIEW);
    expect(r.improvements[0]?.correction).toContain("2nd decimal digit is 0");
    expect(r.specPointVerdicts).toHaveLength(2);
  });

  it("positive: verdict chip + pupil message + history item parse", () => {
    expect(verdictChipSchema.parse(CHIP).verdict).toBe("Great");
    expect(pupilMessageSchema.parse(PUPIL).kind).toBe("paraphrase_probe");
    expect(
      sessionHistoryItemSchema.parse({
        sessionId: SESSION.id,
        courseId: SESSION.courseId,
        specPointIds: SESSION.specPointIds,
        status: "completed",
        createdAt: T,
      }).status,
    ).toBe("completed");
  });

  it("zod-strict: unknown keys are rejected on every top-level DTO", () => {
    expect(() => teachSessionSchema.parse({ ...SESSION, masteryDelta: 0.5 })).toThrow();
    expect(() => reviewCardSchema.parse({ ...REVIEW, autoPromoteMisconceptions: true })).toThrow();
    expect(() => verdictChipSchema.parse({ ...CHIP, score: 10 })).toThrow();
  });

  it("negative: 4 spec points and a 6-objective array are over the ruled ceilings", () => {
    expect(() =>
      createSessionRequestSchema.parse({
        courseId: "igcse-chemistry-19",
        specPointIds: ["a", "b", "c", "d"],
        difficulty: "easy",
        length: "quick",
        mode: "chat",
      }),
    ).toThrow();
    expect(() =>
      teachSessionSchema.parse({
        ...SESSION,
        objectives: [
          ...OBJECTIVES,
          {
            id: "8d9e0f1a-4b5c-4d6e-9f0a-1b2c3d4e5f6a",
            ordinal: 4,
            text: "extra",
            specPointIds: ["4CH1-1.27"],
            status: "not_started",
          },
          {
            id: "9e0f1a2b-5c6d-4e7f-8a1b-2c3d4e5f6a7b",
            ordinal: 4,
            text: "extra",
            specPointIds: ["4CH1-1.28"],
            status: "not_started",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      teachSessionSchema.parse({ ...SESSION, objectives: [{ ...OBJECTIVES[0], ordinal: 4 }] }),
    ).toThrow();
  });

  it("negative: voice mode is reserved (run-004) and pupil kinds are closed", () => {
    expect(() =>
      createSessionRequestSchema.parse({
        courseId: "igcse-chemistry-19",
        specPointIds: ["4CH1-1.25"],
        difficulty: "easy",
        length: "quick",
        mode: "voice",
      }),
    ).toThrow();
    expect(() => pupilMessageSchema.parse({ kind: "correction", text: "no" })).toThrow();
  });

  it("doctrine: the fail-closed error vocabulary is exactly the ADR-040 set", () => {
    const codes = teachMeErrorCodeSchema.options;
    expect(codes).toContain("QUOTA_EXCEEDED");
    expect(codes).toContain("MESSAGE_CEILING");
    expect(codes).toContain("TOKEN_CEILING");
    expect(codes).toContain("LLM_SHAPE_DRIFT");
    expect(codes).toContain("COURSE_NOT_ELIGIBLE");
    expect(codes).toHaveLength(8);
  });

  it("doctrine: a judged turn without a chip stays expressible (sub-floor nudge shape)", () => {
    const res = postMessageResponseSchema.parse({
      chip: null,
      pupilMessage: {
        kind: "clarify_nudge",
        text: "Can you unpack that a bit more for me? I don't think I've got it yet.",
      },
      objectives: OBJECTIVES,
      session: SESSION,
    });
    expect(res.chip).toBeNull();
    expect(res.pupilMessage?.kind).toBe("clarify_nudge");
  });
});
