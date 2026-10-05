/**
 * Test-builder surface contracts — ported from the frozen Java core
 * (syllabai-core @ 6cad6ef, frozen; ported by T-MIG-034, 2026-10-05).
 *
 * Sources:
 *   src/main/java/com/syllabai/teacher/TestBuilderService.java   (views)
 *   src/main/java/com/syllabai/teacher/TestBuilderController.java (routes)
 *
 * Wire facts verified in the frozen sources (T-MIG-034 evidence):
 *   - Java records serialize component names as-is (camelCase on the wire);
 *     nullable Java components map to `|null` here — NEVER `.optional()`:
 *     Jackson writes nulls for null record components, it does not omit
 *     them. A missing key on the wire would be a divergence.
 *   - TestQuestionView.type is StudentQuestionView.type (the question-type
 *     enum); TestQuestionView.topicCode / commandWord are nullable String
 *     components (topicCode is null only if attribution ever missed — Java
 *     getOrDefault(topic, null); commandWord is nullable at the column).
 *   - TestAnswerView.partLabel is nullable: p.questionPart() == null → null
 *     (mark points may be question-level).
 *   - schemeState is the mark scheme's validationState name, null when
 *     includeAnswers=false, the question is not STRUCTURED, the current
 *     version is missing, or no scheme exists.
 *   - WeakTopicOption.meanMastery / masteryBand are nullable (class
 *     analytics aggregates for a topic with measured learners are present,
 *     but the Java record components stay nullable — the analytics port
 *     must decide, this schema only mirrors).
 *   - reason codes are the exact literals LOW_MEAN_MASTERY /
 *     ACTIVE_MISCONCEPTION_PRESENT / BLOCKED_BY_WEAK_PREREQUISITE and the
 *     policy id is the literal "test-builder-weakness/v1" (TestBuilderService
 *     WEAKNESS_POLICY).
 */
import { z } from "zod";
import {
  questionTypeSchema,
  studentOptionViewSchema,
  studentPartViewSchema,
} from "./assessment";
import { validationStateSchema } from "./content";

/** TestBuilderService.TopicCoverage — per-topic availability BEFORE the cap. */
export const testTopicCoverageSchema = z.object({
  topicNodeId: z.string().uuid(),
  code: z.string().nullable(),
  title: z.string().nullable(),
  servableQuestions: z.number().int(),
});
export type TestTopicCoverage = z.infer<typeof testTopicCoverageSchema>;

/** TestBuilderService.TestAnswerView — one mark point of the answer key. */
export const testAnswerViewSchema = z.object({
  partLabel: z.string().nullable(),
  ref: z.string().nullable(), // mark_points.ref column is nullable (baseline schema)
  text: z.string(),
  marks: z.number().int(),
  acceptanceCriteria: z.array(z.string()),
});
export type TestAnswerView = z.infer<typeof testAnswerViewSchema>;

/** TestBuilderService.TestQuestionView — print-shaped question. */
export const testQuestionViewSchema = z.object({
  id: z.string().uuid(),
  type: questionTypeSchema,
  stem: z.string(),
  marks: z.number().int(),
  commandWord: z.string().nullable(),
  difficulty: z.number().int(),
  topicCode: z.string().nullable(),
  parts: z.array(studentPartViewSchema),
  options: z.array(studentOptionViewSchema),
  answers: z.array(testAnswerViewSchema),
  schemeState: validationStateSchema.nullable(),
});
export type TestQuestionView = z.infer<typeof testQuestionViewSchema>;

/** TestBuilderService.TestPreviewView — the assembled test. */
export const testPreviewViewSchema = z.object({
  rootId: z.string().uuid(),
  questionCount: z.number().int(),
  totalMarks: z.number().int(),
  targetMarks: z.number().int().nullable(),
  topics: z.array(testTopicCoverageSchema),
  questions: z.array(testQuestionViewSchema),
});
export type TestPreviewView = z.infer<typeof testPreviewViewSchema>;

/**
 * TestBuilderService.WeakTopicOption — one weak class area with EXPLICIT
 * reasons and the raw aggregates behind them (no composite score). Ordering
 * key (service law): meanMastery asc (nulls last) →
 * learnersWithActiveMisconception desc → code asc.
 */
export const weaknessTopicOptionSchema = z.object({
  topicNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  reasons: z.array(z.enum([
    "LOW_MEAN_MASTERY",
    "ACTIVE_MISCONCEPTION_PRESENT",
    "BLOCKED_BY_WEAK_PREREQUISITE",
  ])),
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
export type WeaknessTopicOption = z.infer<typeof weaknessTopicOptionSchema>;

/**
 * TestBuilderService.CoverageGapView — an unmeasured topic with servable
 * content: an honest "insufficient coverage" candidate, never claimed weak.
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

/** TestBuilderService.WeaknessOptionsView. */
export const weaknessOptionsViewSchema = z.object({
  rootId: z.string().uuid(),
  policy: z.literal("test-builder-weakness/v1"),
  enrolledLearners: z.number().int(),
  learnersWithEvidence: z.number().int(),
  weakTopics: z.array(weaknessTopicOptionSchema),
  coverageGaps: z.array(coverageGapViewSchema),
  selectionHint: z.string(),
});
export type WeaknessOptionsView = z.infer<typeof weaknessOptionsViewSchema>;
