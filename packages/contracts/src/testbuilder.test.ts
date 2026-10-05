/**
 * T-MIG-034 contract pins — test-builder surface schemas.
 * Java record → zod port law: component names verbatim, nullable Java
 * components are `.nullable()` (Jackson writes nulls, never omits keys).
 */
import { describe, expect, test } from "bun:test";
import {
  testPreviewViewSchema,
  testQuestionViewSchema,
  weaknessOptionsViewSchema,
  type WeaknessTopicOption,
} from "./testbuilder";

describe("testbuilder contracts", () => {
  const answer = {
    partLabel: null,
    ref: "A1",
    text: "F = ma",
    marks: 2,
    acceptanceCriteria: ["states the equation", "substitutes correctly"],
  };

  const question = {
    id: "5f0b3a2e-6c1d-4a7e-9b2f-0a1b2c3d4e5f",
    type: "STRUCTURED" as const,
    stem: "Explain Newton's second law.",
    marks: 4,
    commandWord: "Explain",
    difficulty: 3,
    topicCode: "P2.3",
    parts: [
      {
        id: "8a7b6c5d-4e3f-4a2b-9c1d-2e3f4a5b6c7d",
        label: "a",
        prompt: "State the law.",
        commandWord: "State",
        marks: 2,
      },
    ],
    options: [],
    answers: [answer],
    schemeState: "VALIDATED" as const,
  };

  test("testPreviewViewSchema accepts a full view (nulls written, not omitted)", () => {
    const view = {
      rootId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      questionCount: 1,
      totalMarks: 4,
      targetMarks: null,
      topics: [
        {
          topicNodeId: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
          code: "P2.3",
          title: "Forces",
          servableQuestions: 7,
        },
      ],
      questions: [question],
    };
    expect(testPreviewViewSchema.parse(view)).toEqual(view);
  });

  test("testQuestionViewSchema rejects a MISSING nullable key (Jackson writes nulls)", () => {
    const missing = { ...question } as Record<string, unknown>;
    delete missing.schemeState;
    expect(testQuestionViewSchema.safeParse(missing).success).toBe(false);
  });

  test("testQuestionViewSchema rejects an unknown question type", () => {
    // the frozen enum is exactly {MCQ_SINGLE, SHORT_ANSWER, STRUCTURED}
    expect(
      testQuestionViewSchema.safeParse({ ...question, type: "ESSAY" }).success,
    ).toBe(false);
  });

  test("testPreviewViewSchema rejects a non-integer questionCount", () => {
    expect(
      testPreviewViewSchema.safeParse({
        rootId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        questionCount: 1.5,
        totalMarks: 4,
        targetMarks: null,
        topics: [],
        questions: [],
      }).success,
    ).toBe(false);
  });

  test("weaknessOptionsViewSchema pins the policy id literal and reason enums", () => {
    const view = {
      rootId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      policy: "test-builder-weakness/v1" as const,
      enrolledLearners: 12,
      learnersWithEvidence: 9,
      weakTopics: [
        {
          topicNodeId: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
          code: "P2.3",
          title: "Forces",
          reasons: ["LOW_MEAN_MASTERY", "BLOCKED_BY_WEAK_PREREQUISITE"] as WeaknessTopicOption["reasons"],
          learnersMeasured: 9,
          meanMastery: 0.38,
          masteryBand: "LOW",
          learnersWithActiveMisconception: 2,
          activeMisconceptionSignals: 5,
          evidenceBackedAttempts: 40,
          tutorEngagements: 3,
          dueReviews: 11,
          servableQuestions: 7,
          blockedByPrerequisiteCodes: ["P2.1"],
        },
      ],
      coverageGaps: [],
      selectionHint: "Pass weakTopics[].topicNodeId values as topicNodeIds",
    };
    expect(weaknessOptionsViewSchema.parse(view)).toEqual(view);
    expect(
      weaknessOptionsViewSchema.safeParse({
        ...view,
        policy: "test-builder-weakness/v2",
      }).success,
    ).toBe(false);
    expect(
      weaknessOptionsViewSchema.safeParse({
        ...view,
        weakTopics: [{ ...view.weakTopics[0], reasons: ["MADE_UP_REASON"] }],
      }).success,
    ).toBe(false);
  });
});
