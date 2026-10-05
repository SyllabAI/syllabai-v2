/**
 * Test-builder contract pins (T-MIG-037) — acceptance baseline is the
 * Java declaration (frozen syllabai-core @ 6cad6ef; TestBuilderController,
 * TestBuilderService :359-414). Positive pins from Java-declared shapes,
 * negative pins for Java-rejected inputs, clamp law + policy literal
 * pinned as exported constants.
 */
import { describe, expect, it } from "bun:test";
import {
  TEST_BUILDER_DEFAULT_MAX,
  TEST_BUILDER_HARD_MAX,
  TEST_BUILDER_HARD_MAX_MARKS,
  TEST_BUILDER_WEAKNESS_POLICY,
  testPreviewParamsSchema,
  testPreviewViewSchema,
  testQuestionViewSchema,
  topicCoverageSchema,
  testAnswerViewSchema,
  weaknessOptionsParamsSchema,
  weaknessOptionsViewSchema,
  weakTopicOptionSchema,
  coverageGapViewSchema,
} from "./test-builder";

const UUID = "0b8fd85b-6c47-4d6e-9e38-2c69b47c1d01";
const UUID2 = "1c9ae86b-7c47-4d6e-9e38-2c69b47c1d02";

describe("constants (TestBuilderService :44-48)", () => {
  it("clamp bounds and the wire policy literal match the frozen source", () => {
    expect(TEST_BUILDER_DEFAULT_MAX).toBe(20);
    expect(TEST_BUILDER_HARD_MAX).toBe(50);
    expect(TEST_BUILDER_HARD_MAX_MARKS).toBe(200);
    expect(TEST_BUILDER_WEAKNESS_POLICY).toBe("test-builder-weakness/v1");
  });
});

describe("testPreviewParamsSchema (Controller :42-50)", () => {
  it("rootId required uuid; others optional", () => {
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID }).success).toBe(true);
    expect(testPreviewParamsSchema.safeParse({}).success).toBe(false);
    expect(testPreviewParamsSchema.safeParse({ rootId: "x" }).success).toBe(false);
  });

  it("topicNodeIds optional uuid list (Spring comma-binding mirror)", () => {
    expect(
      testPreviewParamsSchema.safeParse({ rootId: UUID, topicNodeIds: [UUID, UUID2] }).success,
    ).toBe(true);
    expect(
      testPreviewParamsSchema.safeParse({ rootId: UUID, topicNodeIds: ["bad"] }).success,
    ).toBe(false);
  });

  it("maxQuestions/targetMarks accept any Integer — the CLAMP is service law (:114-117)", () => {
    // values beyond the cap bind fine; the service clamps (1..50 / 1..200)
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID, maxQuestions: 9999 }).success).toBe(
      true,
    );
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID, targetMarks: -5 }).success).toBe(
      true,
    );
    // numeric strings coerce per Jackson
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID, maxQuestions: "15" }).success).toBe(
      true,
    );
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID, maxQuestions: "abc" }).success).toBe(
      false,
    );
  });

  it("includeAnswers boolean with false default (javaJsonBool coercion mirror)", () => {
    expect(testPreviewParamsSchema.safeParse({ rootId: UUID }).success).toBe(true);
    expect(testPreviewParamsSchema.parse({ rootId: UUID }).includeAnswers).toBe(false);
    expect(
      testPreviewParamsSchema.safeParse({ rootId: UUID, includeAnswers: "true" }).success,
    ).toBe(true);
    expect(
      testPreviewParamsSchema.safeParse({ rootId: UUID, includeAnswers: "yes" }).success,
    ).toBe(false);
  });

  it("weaknessOptionsParamsSchema: rootId only", () => {
    expect(weaknessOptionsParamsSchema.safeParse({ rootId: UUID }).success).toBe(true);
    expect(weaknessOptionsParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe("testAnswerViewSchema (:376-378)", () => {
  it("accepts one mark point of the answer key", () => {
    expect(
      testAnswerViewSchema.safeParse({
        partLabel: "ai",
        ref: "(ai)",
        text: "Any valid description of osmosis.",
        marks: 2,
        acceptanceCriteria: ["mentions semi-permeable membrane"],
      }).success,
    ).toBe(true);
    expect(
      testAnswerViewSchema.safeParse({
        partLabel: "ai",
        ref: null,
        text: "x",
        marks: 1,
        acceptanceCriteria: [],
      }).success,
    ).toBe(true); // ref column without nullable=false
    expect(
      testAnswerViewSchema.safeParse({
        partLabel: null,
        ref: null,
        text: "x",
        marks: 1,
        acceptanceCriteria: [],
      }).success,
    ).toBe(true); // partLabel null = question-level mark point (frozen :147, R0 T-MIG-034 intake ruling)
  });
});

describe("testQuestionViewSchema (:368-373)", () => {
  const base = {
    id: UUID,
    type: "STRUCTURED",
    stem: "Describe…",
    marks: 6,
    commandWord: "Describe",
    difficulty: 2,
    topicCode: "BIO.3.1",
    parts: [{ id: UUID2, label: "ai", prompt: null, commandWord: null, marks: 6 }],
    options: [],
    answers: [],
    schemeState: null,
  };

  it("accepts the print-shaped question with empty answers (never null, :135)", () => {
    expect(testQuestionViewSchema.safeParse(base).success).toBe(true);
  });

  it("type is the Question.Type enum (MCQ_SINGLE | SHORT_ANSWER | STRUCTURED)", () => {
    expect(testQuestionViewSchema.safeParse({ ...base, type: "MCQ_SINGLE" }).success).toBe(true);
    expect(testQuestionViewSchema.safeParse({ ...base, type: "ESSAY" }).success).toBe(false);
  });

  it("schemeState is the ValidationState domain when present", () => {
    expect(testQuestionViewSchema.safeParse({ ...base, schemeState: "VALIDATED" }).success).toBe(
      true,
    );
    expect(testQuestionViewSchema.safeParse({ ...base, schemeState: "APPROVED" }).success).toBe(
      false,
    );
  });

  it("answers present only when requested — an array of answer keys", () => {
    expect(
      testQuestionViewSchema.safeParse({
        ...base,
        answers: [
          { partLabel: "ai", ref: "(ai)", text: "…", marks: 6, acceptanceCriteria: [] },
        ],
      }).success,
    ).toBe(true);
    expect(testQuestionViewSchema.safeParse({ ...base, answers: null }).success).toBe(false);
  });
});

describe("testPreviewViewSchema (:359-362)", () => {
  it("accepts question-count mode (targetMarks null)", () => {
    expect(
      testPreviewViewSchema.safeParse({
        rootId: UUID,
        questionCount: 5,
        totalMarks: 12,
        targetMarks: null,
        topics: [
          { topicNodeId: UUID, code: "BIO.3.1", title: "Cells", servableQuestions: 9 },
        ],
        questions: [],
      }).success,
    ).toBe(true);
  });

  it("accepts marks-aware mode (targetMarks echoes the clamped target)", () => {
    expect(
      testPreviewViewSchema.safeParse({
        rootId: UUID,
        questionCount: 5,
        totalMarks: 40,
        targetMarks: 40,
        topics: [],
        questions: [],
      }).success,
    ).toBe(true);
  });

  it("topicCoverageSchema rejects non-int servableQuestions", () => {
    expect(
      topicCoverageSchema.safeParse({ topicNodeId: UUID, code: "c", title: "t", servableQuestions: 1.5 })
        .success,
    ).toBe(false);
  });
});

describe("weaknessOptionsViewSchema (:383-413)", () => {
  const weakTopic = {
    topicNodeId: UUID,
    code: "BIO.3.1",
    title: "Cells",
    reasons: ["LOW_MEAN_MASTERY"], // frozen :212-218 — only the three named literals are ever added (R0 T-MIG-034 intake ruling)
    learnersMeasured: 18,
    meanMastery: 0.41,
    masteryBand: "WEAK",
    learnersWithActiveMisconception: 4,
    activeMisconceptionSignals: 7,
    evidenceBackedAttempts: 62,
    tutorEngagements: 9,
    dueReviews: 12,
    servableQuestions: 9,
    blockedByPrerequisiteCodes: ["BIO.2.4"],
  };

  it("policy is the z.literal wire value; weakTopics/coverageGaps arrays", () => {
    expect(
      weaknessOptionsViewSchema.safeParse({
        rootId: UUID,
        policy: TEST_BUILDER_WEAKNESS_POLICY,
        enrolledLearners: 24,
        learnersWithEvidence: 18,
        weakTopics: [weakTopic],
        coverageGaps: [
          { topicNodeId: UUID2, code: "BIO.5.2", title: "Genetics", servableQuestions: 3,
            evidenceBackedAttempts: 0, tutorEngagements: 0 },
        ],
        selectionHint: "Pick areas to target; unmeasured topics are listed as gaps.",
      }).success,
    ).toBe(true);
  });

  it("rejects a wrong policy string (it is a wire literal, not a free string)", () => {
    expect(
      weaknessOptionsViewSchema.safeParse({
        rootId: UUID,
        policy: "weakness/v2",
        enrolledLearners: 1,
        learnersWithEvidence: 0,
        weakTopics: [],
        coverageGaps: [],
        selectionHint: "",
      }).success,
    ).toBe(false);
  });

  it("weakTopicOption meanMastery/masteryBand nullable (nulls-last ordering law :395-396)", () => {
    expect(weakTopicOptionSchema.safeParse({ ...weakTopic, meanMastery: null, masteryBand: null }).success)
      .toBe(true);
    expect(weakTopicOptionSchema.safeParse({ ...weakTopic, learnersMeasured: 1.5 }).success).toBe(
      false,
    );
  });

  it("coverageGapViewSchema accepts honest gaps", () => {
    expect(
      coverageGapViewSchema.safeParse({
        topicNodeId: UUID,
        code: "c",
        title: "t",
        servableQuestions: 2,
        evidenceBackedAttempts: 0,
        tutorEngagements: 0,
      }).success,
    ).toBe(true);
  });
});
