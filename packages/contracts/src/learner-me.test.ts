/**
 * Learner-me standalone wire pins (T-MIG-043) — the acceptance baseline is
 * the Java declaration (frozen syllabai-core @ 6cad6ef): ExamSeriesView.java
 * + LearnerExamSeriesController.java (:61-117) + LearnerAssignmentController.
 * SubmissionRequest (:111-113). Positive pins from the Java-declared shapes,
 * negative pins for Java-rejected inputs. No golden write captures exist for
 * these surfaces (the 040-PREP capture pins the agenda-embedded views,
 * which live in learner.ts — canonical #60).
 */
import { describe, expect, it } from "bun:test";
import {
  EXAM_SERIES_BOARD_CIE,
  EXAM_SERIES_BOARD_PEARSON_EDEXCEL,
  assignmentSubmissionRequestSchema,
  examSeriesViewSchema,
  setTargetRequestSchema,
} from "./learner-me";

const SERIES_ID = "1a000000-0000-4000-8000-000000000001";

const VALID_SERIES = {
  id: SERIES_ID,
  board: "PEARSON_EDEXCEL",
  qualification: "GCSE",
  seriesCode: "Jun-2027-GCSE",
  label: "June 2027 GCSE series",
  windowStart: "2027-05-10",
  windowEnd: "2027-06-24",
  entryDeadline: "2027-03-20",
  resultsDate: "2027-08-20",
  estimated: true,
  sourceUrl: "https://example.invalid/timetable",
  retrievedAt: "2026-10-01T09:00:00Z",
};

describe("examSeriesViewSchema", () => {
  it("accepts the Java-declared picker row (all 12 components)", () => {
    const v = examSeriesViewSchema.parse(VALID_SERIES);
    expect(v.seriesCode).toBe("Jun-2027-GCSE");
    expect(v.entryDeadline).toBe("2027-03-20");
    expect(v.estimated).toBe(true);
  });

  it("accepts nullable LocalDate columns (entryDeadline/resultsDate null)", () => {
    const v = examSeriesViewSchema.parse({ ...VALID_SERIES, entryDeadline: null, resultsDate: null });
    expect(v.entryDeadline).toBeNull();
    expect(v.resultsDate).toBeNull();
  });

  it("rejects a row missing a NOT NULL component", () => {
    const { sourceUrl: _dropped, ...incomplete } = VALID_SERIES;
    expect(examSeriesViewSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects an estimated flag that is not boolean", () => {
    expect(examSeriesViewSchema.safeParse({ ...VALID_SERIES, estimated: "true" }).success).toBe(false);
  });
});

describe("EXAM_SERIES_BOARD_PEARSON_EDEXCEL", () => {
  it("pins the frozen board constant verbatim (ExamSeriesView :26)", () => {
    expect(EXAM_SERIES_BOARD_PEARSON_EDEXCEL).toBe("PEARSON_EDEXCEL");
  });
});

describe("EXAM_SERIES_BOARD_CIE", () => {
  it("pins the second imported board key verbatim (trace 1a1589078364b76d)", () => {
    expect(EXAM_SERIES_BOARD_CIE).toBe("CAMBRIDGE_INTERNATIONAL");
  });

  it("rides the unchanged ExamSeriesView wire (board is a free string)", () => {
    const v = examSeriesViewSchema.parse({ ...VALID_SERIES, board: "CAMBRIDGE_INTERNATIONAL" });
    expect(v.board).toBe("CAMBRIDGE_INTERNATIONAL");
  });
});

describe("setTargetRequestSchema", () => {
  it("accepts a UUID seriesId (SetTargetRequest @NotNull UUID)", () => {
    expect(setTargetRequestSchema.parse({ seriesId: SERIES_ID }).seriesId).toBe(SERIES_ID);
  });

  it("rejects a non-UUID seriesId (jakarta @NotNull + UUID type)", () => {
    expect(setTargetRequestSchema.safeParse({ seriesId: "not-a-uuid" }).success).toBe(false);
    expect(setTargetRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("assignmentSubmissionRequestSchema", () => {
  it("accepts questionsCompleted with a nullable score", () => {
    const v = assignmentSubmissionRequestSchema.parse({ questionsCompleted: 8, score: 12 });
    expect(v.score).toBe(12);
  });

  it("accepts score null (handed in unmarked) and absent score", () => {
    expect(assignmentSubmissionRequestSchema.parse({ questionsCompleted: 3, score: null }).score).toBeNull();
    expect(assignmentSubmissionRequestSchema.parse({ questionsCompleted: 3 }).score).toBeUndefined();
  });

  it("rejects a missing questionsCompleted (jakarta @NotNull)", () => {
    expect(assignmentSubmissionRequestSchema.safeParse({ score: 1 }).success).toBe(false);
  });

  it("rejects negative questionsCompleted (@Min(0))", () => {
    expect(assignmentSubmissionRequestSchema.safeParse({ questionsCompleted: -1 }).success).toBe(false);
  });

  it("rejects score > 1000 and negative score (@Min(0) @Max(1000))", () => {
    expect(assignmentSubmissionRequestSchema.safeParse({ questionsCompleted: 1, score: 1001 }).success).toBe(false);
    expect(assignmentSubmissionRequestSchema.safeParse({ questionsCompleted: 1, score: -1 }).success).toBe(false);
  });
});

// ── T-TIER1 — the account-backed last-opened pointer + mock results ────────

import {
  LAST_OPENED_RESOURCES,
  MOCK_RESULTS_PER_COURSE,
  lastOpenedEnvelopeSchema,
  lastOpenedViewSchema,
  mockResultSchema,
  mockResultsViewSchema,
  putMockResultsRequestSchema,
  setLastOpenedRequestSchema,
} from "./learner-me";

const VALID_MOCK = {
  clientId: "igcse-chemistry-19:2024-summer:1:1729000000000",
  ref: "4CH1/1C",
  title: "Chemistry Paper 1C",
  sessionId: "2024-summer",
  finishedAt: "2026-11-01T10:00:00Z",
  durationMin: 60,
  timeUsedSec: 3210,
  marks: 42,
  total: 80,
  ended: "time-up" as const,
};

describe("T-TIER1 lastOpened schemas", () => {
  it("pins the closed resource set (the hub's ResourceKind union)", () => {
    expect(LAST_OPENED_RESOURCES).toEqual([
      "hub",
      "revision-notes",
      "exam-questions",
      "flashcards",
      "strengths",
      "past-papers",
      "practice-papers",
    ]);
  });

  it("accepts a valid pointer view and envelope (null = the honest empty)", () => {
    const view = lastOpenedViewSchema.parse({
      courseSlug: "igcse-chemistry-19",
      resource: "exam-questions",
      updatedAt: "2026-11-02T09:15:00.000Z",
    });
    expect(view.resource).toBe("exam-questions");
    expect(lastOpenedEnvelopeSchema.parse({ lastOpened: null }).lastOpened).toBeNull();
    expect(
      lastOpenedEnvelopeSchema.parse({
        lastOpened: { courseSlug: "s", resource: "hub", updatedAt: "2026-11-02T09:15:00.000Z" },
      }).lastOpened,
    ).not.toBeNull();
  });

  it("accepts the kebab-case PUT body; rejects an unknown resource and a bad slug", () => {
    expect(
      setLastOpenedRequestSchema.parse({ courseSlug: "igcse-chemistry-19", resource: "flashcards" })
        .resource,
    ).toBe("flashcards");
    expect(
      setLastOpenedRequestSchema.safeParse({ courseSlug: "igcse-chemistry-19", resource: "secret" })
        .success,
    ).toBe(false);
    expect(
      setLastOpenedRequestSchema.safeParse({ courseSlug: "Chm_Target", resource: "hub" }).success,
    ).toBe(false);
  });
});

describe("T-TIER1 mockResults schemas", () => {
  it("pins the per-course cap of record (the hub's MAX_PER_COURSE; T-CAPS-POLICY-1: 20 → 50)", () => {
    expect(MOCK_RESULTS_PER_COURSE).toBe(50);
  });

  it("accepts a valid tally with an optional per-question list", () => {
    expect(mockResultSchema.parse(VALID_MOCK).ref).toBe("4CH1/1C");
    expect(
      mockResultSchema.parse({ ...VALID_MOCK, questions: [{ label: "1", marks: 4, max: 5 }] })
        .questions,
    ).toEqual([{ label: "1", marks: 4, max: 5 }]);
    expect(mockResultSchema.parse(VALID_MOCK).questions).toBeUndefined();
  });

  it("rejects an unknown ended state and non-integer counters", () => {
    expect(mockResultSchema.safeParse({ ...VALID_MOCK, ended: "exploded" }).success).toBe(false);
    expect(mockResultSchema.safeParse({ ...VALID_MOCK, marks: 4.5 }).success).toBe(false);
    expect(mockResultSchema.safeParse({ ...VALID_MOCK, marks: -1 }).success).toBe(false);
  });

  it("rejects an oversized clientId/ref/title and a too-long questions list", () => {
    expect(mockResultSchema.safeParse({ ...VALID_MOCK, clientId: "" }).success).toBe(false);
    expect(mockResultSchema.safeParse({ ...VALID_MOCK, ref: "x".repeat(81) }).success).toBe(false);
    expect(
      mockResultSchema.safeParse({
        ...VALID_MOCK,
        questions: Array.from({ length: 101 }, () => ({ label: "1", marks: 1, max: 1 })),
      }).success,
    ).toBe(false);
  });

  it("the view + PUT envelope round-trip; the PUT rejects more than the cap", () => {
    expect(mockResultsViewSchema.parse({ results: [VALID_MOCK] }).results).toHaveLength(1);
    expect(putMockResultsRequestSchema.parse({ results: [VALID_MOCK] }).results).toHaveLength(1);
    expect(
      putMockResultsRequestSchema.safeParse({
        results: Array.from({ length: MOCK_RESULTS_PER_COURSE + 1 }, () => VALID_MOCK),
      }).success,
    ).toBe(false);
  });
});
