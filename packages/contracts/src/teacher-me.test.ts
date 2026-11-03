/**
 * Teacher-me standalone wire pins (T-TIER1 run-002) — the acceptance
 * baseline is the hub store law (apps/hub/src/lib/teacher/stores.ts): the
 * shapes mirror the three localStorage stores EXACTLY (SavedTest /
 * CoverageMap / ContentReview), the caps are the stores' own bounds, and the
 * slug grammar is the learner-me kebab law. Positive pins from the hub
 * shapes, negative pins for everything the stores could never produce.
 */
import { describe, expect, it } from "bun:test";
import {
  CONTENT_REVIEWS_MAX,
  SAVED_TESTS_MAX,
  TEACHING_COVERAGE_CODES_MAX,
  contentReviewSchema,
  putContentReviewsRequestSchema,
  putSavedTestsRequestSchema,
  putTeachingCoverageRequestSchema,
  savedTestSchema,
  savedTestsViewSchema,
  teachingCoverageEntrySchema,
  teachingCoverageViewSchema,
} from "./teacher-me";

const VALID_TEST = {
  id: "t_abc123",
  name: "Atoms — end of topic",
  courseSlug: "igcse-chemistry-19",
  courseCode: "4CH1",
  subtopics: ["4CH1-S1-b", "4CH1-S1-c"],
  targetMarks: 40,
  maxQuestions: 12,
  questionIds: ["sme-eq-4CH1-S1-b-q1", "sme-eq-4CH1-S1-b-q2"],
  createdAt: "2026-11-03T10:00:00.000Z",
};

const VALID_REVIEW = {
  resourceId: "igcse-chemistry-19:question:4CH1-S1-b:q3",
  courseSlug: "igcse-chemistry-19",
  courseCode: "4CH1",
  kind: "solution",
  verdict: "approved",
  comment: "Model answer matches the mark scheme.",
  reviewer: "Ms Hughes",
  createdAt: "2026-11-03T11:00:00.000Z",
};

describe("savedTestSchema", () => {
  it("accepts a builder-era save (explicit question list)", () => {
    const v = savedTestSchema.parse(VALID_TEST);
    expect(v.id).toBe("t_abc123");
    expect(v.targetMarks).toBe(40);
  });

  it("accepts a legacy save (no questionIds, nullable targets omitted)", () => {
    const v = savedTestSchema.parse({
      id: "t_legacy",
      name: "Legacy auto-build",
      courseSlug: "igcse-physics-19",
      courseCode: "4PH1",
      subtopics: [],
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    expect(v.questionIds).toBeUndefined();
    expect(v.targetMarks).toBeUndefined();
  });

  it("accepts null targetMarks / maxQuestions (the hub's null controls)", () => {
    const v = savedTestSchema.parse({ ...VALID_TEST, targetMarks: null, maxQuestions: null });
    expect(v.targetMarks).toBeNull();
  });

  it("rejects a non-kebab courseSlug", () => {
    expect(savedTestSchema.safeParse({ ...VALID_TEST, courseSlug: "Igcse Chemistry" }).success).toBe(false);
  });

  it("rejects an empty name or a missing id", () => {
    expect(savedTestSchema.safeParse({ ...VALID_TEST, name: "" }).success).toBe(false);
    const { id: _dropped, ...noId } = VALID_TEST;
    expect(savedTestSchema.safeParse(noId).success).toBe(false);
  });

  it("enforces the store caps (30 tests / 200 subtopics / 500 question ids)", () => {
    expect(SAVED_TESTS_MAX).toBe(30);
    expect(
      putSavedTestsRequestSchema.safeParse({
        tests: Array.from({ length: 31 }, (_, i) => ({ ...VALID_TEST, id: `t_${i}` })),
      }).success,
    ).toBe(false);
    expect(
      putSavedTestsRequestSchema.safeParse({
        tests: Array.from({ length: 30 }, (_, i) => ({ ...VALID_TEST, id: `t_${i}` })),
      }).success,
    ).toBe(true);
    expect(
      savedTestSchema.safeParse({ ...VALID_TEST, subtopics: Array.from({ length: 201 }, () => "c") }).success,
    ).toBe(false);
    expect(
      savedTestSchema.safeParse({ ...VALID_TEST, questionIds: Array.from({ length: 501 }, () => "q") }).success,
    ).toBe(false);
  });
});

describe("teachingCoverageEntrySchema", () => {
  it("accepts a per-course taught-code set", () => {
    const v = teachingCoverageEntrySchema.parse({
      courseSlug: "igcse-biology-19",
      codes: ["4BI1-S1-a", "4BI1-S1-b"],
    });
    expect(v.codes).toHaveLength(2);
  });

  it("rejects a course slug that is not a registry key", () => {
    expect(
      teachingCoverageEntrySchema.safeParse({ courseSlug: "4BI1", codes: [] }).success,
    ).toBe(false);
  });

  it("enforces the 500-code cap", () => {
    expect(TEACHING_COVERAGE_CODES_MAX).toBe(500);
    expect(
      teachingCoverageEntrySchema.safeParse({
        courseSlug: "igcse-biology-19",
        codes: Array.from({ length: 501 }, (_, i) => `c${i}`),
      }).success,
    ).toBe(false);
  });

  it("the view accepts an empty roster (the honest empty)", () => {
    const v = teachingCoverageViewSchema.parse({ coverage: [] });
    expect(v.coverage).toEqual([]);
  });
});

describe("contentReviewSchema", () => {
  it("accepts an approval with a comment", () => {
    const v = contentReviewSchema.parse(VALID_REVIEW);
    expect(v.verdict).toBe("approved");
    expect(v.kind).toBe("solution");
  });

  it("accepts an empty comment (an approval needs no words)", () => {
    const v = contentReviewSchema.parse({ ...VALID_REVIEW, comment: "" });
    expect(v.comment).toBe("");
  });

  it("accepts every closed verdict and kind value", () => {
    for (const verdict of ["approved", "edited", "rejected"] as const) {
      expect(contentReviewSchema.safeParse({ ...VALID_REVIEW, verdict }).success).toBe(true);
    }
    for (const kind of ["solution", "note", "flashcard"] as const) {
      expect(contentReviewSchema.safeParse({ ...VALID_REVIEW, kind }).success).toBe(true);
    }
  });

  it("rejects an unknown verdict or kind (the closed-vocab law)", () => {
    expect(contentReviewSchema.safeParse({ ...VALID_REVIEW, verdict: "maybe" }).success).toBe(false);
    expect(contentReviewSchema.safeParse({ ...VALID_REVIEW, kind: "quiz" }).success).toBe(false);
  });

  it("enforces the 200-review cap", () => {
    expect(CONTENT_REVIEWS_MAX).toBe(200);
    expect(
      putContentReviewsRequestSchema.safeParse({
        reviews: Array.from({ length: 201 }, (_, i) => ({ ...VALID_REVIEW, resourceId: `r${i}` })),
      }).success,
    ).toBe(false);
  });
});

describe("putTeachingCoverageRequestSchema", () => {
  it("accepts the full per-course set (an empty array clears the course)", () => {
    expect(putTeachingCoverageRequestSchema.safeParse({ codes: [] }).success).toBe(true);
    expect(putTeachingCoverageRequestSchema.safeParse({ codes: ["4CH1-S1-b"] }).success).toBe(true);
  });

  it("rejects a non-array body (the binding class)", () => {
    expect(putTeachingCoverageRequestSchema.safeParse({ codes: "4CH1-S1-b" }).success).toBe(false);
  });
});

describe("savedTestsViewSchema", () => {
  it("accepts the honest empty", () => {
    expect(savedTestsViewSchema.parse({ tests: [] }).tests).toEqual([]);
  });
});
