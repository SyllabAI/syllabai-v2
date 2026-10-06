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
