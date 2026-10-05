/**
 * Test-builder contracts — ported from the frozen Java core (T-MIG-037,
 * the T-MIG-018 next_safe_actions follow-up; operator trace 1a10cb48dc7edd15).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/teacher/TestBuilderController.java
 *       (/api/v1/teacher/tests — GET /preview, GET /weakness-options)
 *   src/main/java/com/syllabai/teacher/TestBuilderService.java
 *       (TestPreviewView :359-362, TopicCoverage :364, TestQuestionView
 *        :368-373, TestAnswerView :376-378, WeaknessOptionsView :383-391,
 *        WeakTopicOption :398-404, CoverageGapView :410-413; constants
 *        :44-46; clamp law :114-117)
 *   src/main/java/com/syllabai/assessment/dto/StudentQuestionView.java
 *       (OptionView/PartView — reused via assessment.ts
 *        studentOptionViewSchema/studentPartViewSchema)
 *   src/main/java/com/syllabai/content/ValidationState (schemeState —
 *        reused via content.ts validationStateSchema)
 *
 * PARAM-BINDING LAW (TestBuilderService :114-117 — CLAMP-NOT-REJECT, the
 * honest-assembly posture): maxQuestions null → DEFAULT_MAX 20, else
 * clamped to 1..HARD_MAX 50; targetMarks null → question-count mode,
 * else clamped 1..HARD_MAX_MARKS 200. The clamp is SERVICE-side — the
 * binding schemas below accept any Integer (Spring converts the query
 * text; numeric strings coerce per Jackson via javaJsonInt) and the port
 * layer applies the clamp. includeAnswers is @RequestParam boolean with
 * defaultValue "false" (javaJsonBool mirror).
 *
 * RESPONSE-side facts: records serialize every component; answers is
 * List.of() → [] when includeAnswers=false and for non-STRUCTURED
 * questions — an EMPTY ARRAY, never null (:135); schemeState null when
 * no current version/scheme exists (:136-144). WeakTopicOption
 * meanMastery/masteryBand nullable (ordering "meanMastery asc nulls
 * last" :396 — unmeasured topics are honest gaps, :407-409).
 *
 * NO golden captures exist for these surfaces — acceptance baseline is
 * the Java declaration, pinned in test-builder.test.ts.
 */
import { z } from "zod";
import {
  questionTypeSchema,
  studentOptionViewSchema,
  studentPartViewSchema,
} from "./assessment";
import { validationStateSchema } from "./content";
import { javaJsonBool, javaJsonInt } from "./content-writes";

// ── constants (TestBuilderService.java:44-46, WEAKNESS_POLICY :48) ─────────

/** maxQuestions default when the param is absent (:44). */
export const TEST_BUILDER_DEFAULT_MAX = 20;
/** maxQuestions hard cap — values above are CLAMPED, not rejected (:45). */
export const TEST_BUILDER_HARD_MAX = 50;
/** targetMarks hard cap — CLAMPED, not rejected (:46). */
export const TEST_BUILDER_HARD_MAX_MARKS = 200;
/** sprint-2 §10 class-weakness selection policy id (:48) — a wire literal. */
export const TEST_BUILDER_WEAKNESS_POLICY = "test-builder-weakness/v1";

// ── request params ──────────────────────────────────────────────────────────

/**
 * GET /preview params (Controller :42-50): rootId REQUIRED uuid
 * (conversion failure → 400 malformed); topicNodeIds optional uuid list
 * (comma-separated Spring List<UUID> binding; each element parse-fails
 * → 400); maxQuestions/targetMarks optional Integer (clamp law above);
 * includeAnswers optional boolean defaulting false.
 */
export const testPreviewParamsSchema = z.object({
  rootId: z.string().uuid(),
  topicNodeIds: z.array(z.string().uuid()).optional(),
  maxQuestions: javaJsonInt.optional(),
  targetMarks: javaJsonInt.optional(),
  includeAnswers: javaJsonBool.default(false),
});
export type TestPreviewParams = z.infer<typeof testPreviewParamsSchema>;

/** GET /weakness-options params (:59-62). */
export const weaknessOptionsParamsSchema = z.object({
  rootId: z.string().uuid(),
});

// ── response views ──────────────────────────────────────────────────────────

/** TopicCoverage (:364) — per-topic availability BEFORE the cap (:124-128). */
export const topicCoverageSchema = z.object({
  topicNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  servableQuestions: z.number().int(),
});
export type TopicCoverage = z.infer<typeof topicCoverageSchema>;

/**
 * TestAnswerView (:376-378) — one mark point of the teacher-only answer
 * key. ref is a MarkPoint column without nullable=false (capture-unproven
 * → nullable per the T-MIG-018 precedent); acceptanceCriteria serialized
 * from the scheme points — an array, never null.
 * partLabel is NULLABLE by frozen law (R0 ruling on T-MIG-034 intake,
 * frozen TestBuilderService.java:147):
 * `p.questionPart() == null ? null : p.questionPart().label()` —
 * question-level mark points serialize partLabel: null.
 */
export const testAnswerViewSchema = z.object({
  partLabel: z.string().nullable(),
  ref: z.string().nullable(),
  text: z.string(),
  marks: z.number().int(),
  acceptanceCriteria: z.array(z.string()),
});
export type TestAnswerView = z.infer<typeof testAnswerViewSchema>;

/**
 * TestQuestionView (:368-373) — print-shaped question, difficulty-ordered
 * assembly. type serializes Question.Type .name() (questionTypeSchema);
 * parts/options reuse the StudentQuestionView element schemas (same
 * records); answers [] when not requested (never null, :135); schemeState
 * the current scheme's ValidationState name, null when absent (:136-144).
 */
export const testQuestionViewSchema = z.object({
  id: z.string().uuid(),
  type: questionTypeSchema,
  stem: z.string(),
  marks: z.number().int(),
  commandWord: z.string().nullable(),
  difficulty: z.number().int(),
  topicCode: z.string(),
  parts: z.array(studentPartViewSchema),
  options: z.array(studentOptionViewSchema),
  answers: z.array(testAnswerViewSchema),
  schemeState: validationStateSchema.nullable(),
});
export type TestQuestionView = z.infer<typeof testQuestionViewSchema>;

/**
 * TestPreviewView (:359-362): targetMarks echoes the requested (clamped)
 * marks target — null in question-count mode; questionCount/totalMarks
 * are the selected set's actuals.
 */
export const testPreviewViewSchema = z.object({
  rootId: z.string().uuid(),
  questionCount: z.number().int(),
  totalMarks: z.number().int(),
  targetMarks: z.number().int().nullable(),
  topics: z.array(topicCoverageSchema),
  questions: z.array(testQuestionViewSchema),
});
export type TestPreviewView = z.infer<typeof testPreviewViewSchema>;

/**
 * WeakTopicOption (:398-404) — one weak class area with EXPLICIT reasons
 * and raw aggregates, no composite score. Ordering key: meanMastery asc
 * (nulls last) → active-misconception learners desc → code (:395-396).
 * meanMastery/masteryBand nullable — unmeasured mastery is honest.
 * reasons: the frozen builder only ever adds the three named literals
 * (R0 ruling on T-MIG-034 intake, frozen TestBuilderService.java:212-218 —
 * LOW_MEAN_MASTERY / ACTIVE_MISCONCEPTION_PRESENT /
 * BLOCKED_BY_WEAK_PREREQUISITE); the enum enforces that law.
 */
export const weakTopicOptionSchema = z.object({
  topicNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  reasons: z.array(
    z.enum(["LOW_MEAN_MASTERY", "ACTIVE_MISCONCEPTION_PRESENT", "BLOCKED_BY_WEAK_PREREQUISITE"]),
  ),
  learnersMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  masteryBand: z.string().nullable(),
  learnersWithActiveMisconception: z.number().int(),
  activeMisconceptionSignals: z.number().int(),
  evidenceBackedAttempts: z.number().int(),
  tutorEngagements: z.number().int(),
  dueReviews: z.number().int(),
  servableQuestions: z.number().int(),
  blockedByPrerequisiteCodes: z.array(z.string()),
});
export type WeakTopicOption = z.infer<typeof weakTopicOptionSchema>;

/**
 * CoverageGapView (:410-413) — an unmeasured topic with servable content:
 * an honest "insufficient coverage" candidate, never claimed weak.
 */
export const coverageGapViewSchema = z.object({
  topicNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  servableQuestions: z.number().int(),
  evidenceBackedAttempts: z.number().int(),
  tutorEngagements: z.number().int(),
});
export type CoverageGapView = z.infer<typeof coverageGapViewSchema>;

/**
 * WeaknessOptionsView (:383-391) — policy is the wire literal
 * "test-builder-weakness/v1" (z.literal, not a free string).
 */
export const weaknessOptionsViewSchema = z.object({
  rootId: z.string().uuid(),
  policy: z.literal(TEST_BUILDER_WEAKNESS_POLICY),
  enrolledLearners: z.number().int(),
  learnersWithEvidence: z.number().int(),
  weakTopics: z.array(weakTopicOptionSchema),
  coverageGaps: z.array(coverageGapViewSchema),
  selectionHint: z.string(),
});
export type WeaknessOptionsView = z.infer<typeof weaknessOptionsViewSchema>;
