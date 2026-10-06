/**
 * Wave-3 assessment-loop contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen, verified 2026-10-05 by T-MIG-018 [filed as T-MIG-006, renumbered R0-REPAIR-2]):
 *   src/main/java/com/syllabai/assessment/dto/SubmitAnswerRequest.java
 *   src/main/java/com/syllabai/assessment/dto/PartAnswerRequest.java
 *   src/main/java/com/syllabai/assessment/dto/StructuredSubmitRequest.java
 *   src/main/java/com/syllabai/assessment/dto/AttemptResultView.java
 *   src/main/java/com/syllabai/assessment/dto/StructuredAttemptResultView.java
 *   src/main/java/com/syllabai/assessment/dto/AttemptHistoryView.java
 *   src/main/java/com/syllabai/assessment/dto/MarkSchemeRevealView.java
 *   src/main/java/com/syllabai/assessment/dto/QuestionFamilyView.java
 *   src/main/java/com/syllabai/assessment/dto/QuestionTopicTaxonomyView.java
 *   src/main/java/com/syllabai/assessment/dto/StudentQuestionView.java
 *   src/main/java/com/syllabai/assessment/dto/TeacherQuestionView.java
 *   src/main/java/com/syllabai/assessment/AttemptController.java        (+ nested —)
 *   src/main/java/com/syllabai/assessment/AttemptHistoryController.java
 *   src/main/java/com/syllabai/assessment/ExamPaperController.java      (PaperView,
 *       PaperDetailView, PaperQuestionView are controller-nested records)
 *   src/main/java/com/syllabai/assessment/QuestionController.java
 *   src/main/java/com/syllabai/assessment/LearnerSelfMarkController.java
 *       (PartSelfMark, SelfMarkRequest, SelfMarkView, PartView nested records)
 *   src/main/java/com/syllabai/assessment/Answer.java:34                (MarkingState)
 *   src/main/java/com/syllabai/assessment/Attempt.java:82               (MarkingState)
 *   src/main/java/com/syllabai/assessment/Question.java:26-27           (Type/Provenance)
 *   src/main/java/com/syllabai/assessment/QuestionPart.java:31-39       (label/prompt/
 *       commandWord column facts)
 *   src/main/java/com/syllabai/assessment/AssessmentService.java:96-135 (null-vs-empty
 *       wire facts for AttemptResultView)
 *   src/main/java/com/syllabai/assessment/AttemptHistoryService.java:60-130 (null-vs-
 *       empty wire facts for AttemptHistoryView.Item)
 *   src/main/java/com/syllabai/assessment/ServableQuestionService.java:110-140 (the
 *       SpecPointRef role domain and PRIMARY-first ordering)
 *
 * SCOPE (T-MIG-018): the assessment module's learner-loop DTO surface — the
 * five Wave-3 surfaces MIGRATION_PLAN §2.1 assigns to the assessment domain
 * (attempts, attempt history, exam papers, questions, learner self-mark).
 * The smartmark / teacher-marking / test-builder / transcription DTOs live
 * in OTHER packages (smartmark, teacher/dto, sme, answerinput) and belong to
 * their owning waves' contracts tasks — deliberately NOT ported here.
 *
 * R0 merge-intake deviation (PR #26, ruling1 precedent): main's content.ts
 * is T-MIG-020's canonical rewrite — T-MIG-005's contentValidationStateSchema
 * was renamed to validationStateSchema, and Question.Type / the uuid path leaf
 * were not carried over. The ValidationState enum is imported under its
 * canonical name; Question.Type + uuidPathSchema are defined here (they are
 * assessment-loop domain). Drift guard: golden capture (T-MIG-007) pins the
 * wire values, so any divergence from the frozen core fails the replay gate.
 *
 * Jackson wire facts (Boot defaults, no override in the frozen repo):
 *   - Responses are record serialization: every component is present;
 *     absent never happens, null does. Response schemas use `.nullable()`
 *     for fields the construction sites or column definitions prove or
 *     plausibly allow null, and never `.optional()`. Fields whose
 *     nullability no construction path proves carry a
 *     `nullability: capture-unproven` tag — they are the FIRST to tighten
 *     when the real-data capture tranche lands (T-MIG-004 F-5 gate).
 *   - java.time.Instant serializes as an ISO-8601 string
 *     (jackson-datatype-jsr310, WRITE_DATES_AS_TIMESTAMPS disabled by
 *     Boot) — Instant.toString() is always UTC ('Z').
 *   - JSON null on a PRIMITIVE boolean field binds to false (Spring Boot
 *     leaves DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES
 *     disabled) — selfDoubtFlag/timedCondition therefore accept null and
 *     map it to false in the request schemas below (preprocess). A golden
 *     capture should pin this explicitly (flagged to R6 in the yaml).
 *   - jakarta @Min/@Max/@Size treat null as VALID (they only constrain
 *     non-null values): confidence (Integer, no @NotNull) accepts null and
 *     absent — `.nullish()` below. @NotNull fields reject null — required
 *     fields below.
 *   - Java String.length() and zod `.max()` on strings both count UTF-16
 *     code units, so @Size(max=4000) maps 1:1 onto `.max(4000)` —
 *     surrogate pairs count as 2 on both sides.
 *
 * Coercion note for the T-MIG-030 port lane (NOT encoded here — T-MIG-010
 * binding-shim precedent): Jackson's request binding additionally accepts
 * scalar coercions this schema deliberately rejects, e.g. the string
 * "true" for a boolean field, and 1/0 integers for booleans. The port owns
 * those shims at its binding layer (or via golden-proven divergence calls
 * with R0); the schema validates the POST-BINDING shape, exactly like
 * auth.ts's scalar→String note. Response-side status facts per surface:
 *   POST /api/v1/attempts                     → 201 attemptResultViewSchema
 *   POST /api/v1/attempts/structured          → 201 structuredAttemptResultViewSchema
 *   GET  /api/v1/learners/me/attempts         → 200 attemptHistoryViewSchema
 *   GET  /api/v1/questions                    → 200 array(studentQuestionViewSchema)
 *   GET  /api/v1/questions/families           → 200 array(questionFamilyViewSchema)
 *   GET  /api/v1/questions/topics             → 200 questionTopicTaxonomyViewSchema
 *   GET  /api/v1/questions/{id}               → 200 studentQuestionViewSchema | 404
 *   GET  /api/v1/questions/{id}/mark-scheme   → 200 markSchemeRevealViewSchema |
 *                                               204 (policy withholds: pending
 *                                               validation / rejected / flagged) |
 *                                               404 (question not servable)
 *   GET  /api/v1/exam-papers                  → 200 array(examPaperViewSchema)
 *   GET  /api/v1/exam-papers/{id}             → 200 examPaperDetailResponseSchema | 404
 *   POST /api/v1/learners/me/attempts/{attemptId}/self-mark → 201 selfMarkViewSchema
 *
 * CAPTURED-BEHAVIOUR FLAGS for the port lane (do not silently "fix" either
 * direction — GOLDEN_MASTER §4; R0 owns the divergence calls):
 *   - SelfMarkRequest has NO validation annotations: a null parts array
 *     NPEs the controller's dedup loop (LearnerSelfMarkController.selfMark)
 *     into a 500 internal_error. The schema mirrors the DECLARED
 *     constraint set (none) and accepts null — the port must decide
 *     NPE-parity vs justified divergence at capture time (yaml Q4).
 *   - LearnerSelfMarkService's behavior for PARTIAL self-marks (parts
 *     subset) is unpinned here: SelfMarkView.PartView.marksAwarded is a
 *     primitive int unboxed from Answer.marksAwarded() — an unmarked part
 *     would NPE. Pin via capture before implementing the 201 path.
 *   - The duplicate-part 400 ("duplicate part in self-mark: {partId}",
 *     BadRequestException) IS boundary behavior (controller loop) and is
 *     encoded below as a superRefine; the port maps that issue to the
 *     core's ApiError 400 shape with the same message pattern.
 */
import { z } from "zod";
import { validationStateSchema } from "./content";

// ── shared enum / leaf domains ──────────────────────────────────────────

/**
 * Question.java — Question.Type. Values byte-identical to T-MIG-005's
 * original content.ts port (verified before intake; main's rewritten
 * content.ts no longer carries it). ExamPaper.java's local enum is
 * byte-identical too.
 */
export const questionTypeSchema = z.enum(["MCQ_SINGLE", "SHORT_ANSWER", "STRUCTURED"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** Spring @PathVariable uuid binding — T-MIG-005's original leaf, same value. */
export const uuidPathSchema = z.string().uuid();

/**
 * Question.java:27 — Provenance, valueOf is case-sensitive on the wire.
 * ExamPaper.java carries a byte-identical local enum (same three values);
 * PaperView/PaperQuestionView serialize `.name()` of it. Named
 * `questionProvenance` (not `provenance`) to stay collision-proof against
 * the content lane's future exports.
 */
export const questionProvenanceSchema = z.enum([
  "PAST_PAPER",
  "TEACHER_AUTHORED",
  "SEED_DEMO",
]);
export type QuestionProvenance = z.infer<typeof questionProvenanceSchema>;

/**
 * Attempt.java:82 — the ATTEMPT-level marking lifecycle. AUTO_GRADED exists
 * only at this level (MCQ instant grading); answer-level (Answer.java:34)
 * starts at PENDING. AttemptHistoryView.Item.markingState,
 * StructuredAttemptResultView.markingState serialize THIS domain.
 */
export const attemptMarkingStateSchema = z.enum([
  "AUTO_GRADED",
  "PENDING",
  "SMART_MARKED",
  "HUMAN_MARKED",
  "OVERRIDDEN",
  "SELF_MARKED",
]);
export type AttemptMarkingState = z.infer<typeof attemptMarkingStateSchema>;

/**
 * Answer.java:34 — the ANSWER-level (per-part) marking lifecycle, used by
 * StructuredAttemptResultView.PartResult, AttemptHistoryView.PartItem and
 * SelfMarkView.PartView.
 */
export const answerMarkingStateSchema = z.enum([
  "PENDING",
  "SMART_MARKED",
  "HUMAN_MARKED",
  "OVERRIDDEN",
  "SELF_MARKED",
]);
export type AnswerMarkingState = z.infer<typeof answerMarkingStateSchema>;

/**
 * java.time.Instant on the wire: ISO-8601 UTC string (jackson-jsr310,
 * see header). Plain string here — golden replay pins exact forms; a
 * datetime regex would over-constrain fraction-digit variance.
 */
export const javaInstantSchema = z.string();
export type JavaInstant = z.infer<typeof javaInstantSchema>;

/**
 * StudentQuestionView.SpecPointRef — one mapped spec point (T-C24):
 * code, mapping role, and the spec point's official applicability object
 * VERBATIM from the pinned store ("null when the point carries none" —
 * Question.java javadoc on withSpecPoints), so `applicability` is nullable.
 * `role` is the question_topics mapping-role column value read verbatim
 * (ServableQuestionService.java:133 sorts with "PRIMARY".equals(role));
 * the observed domain is {PRIMARY, SECONDARY}, but the column is the
 * source — z.string() with this comment, tightening = capture-proven.
 */
export const specPointRefSchema = z.object({
  code: z.string(),
  role: z.string(),
  applicability: z.record(z.unknown()).nullable(),
});
export type SpecPointRef = z.infer<typeof specPointRefSchema>;

// ── request bodies (jakarta constraints copied verbatim) ────────────────────

/**
 * SubmitAnswerRequest — MCQ submission (POST /api/v1/attempts, 201).
 *
 * Java constraints (copied verbatim):
 *   questionId:       @NotNull UUID
 *   chosenOptionId:   @NotNull UUID
 *   responseTimeMs:   @NotNull @Min(0) Long  — 64-bit; values beyond
 *                     Number.MAX_SAFE_INTEGER lose JS precision but the
 *                     accept/reject parity (integer, ≥0) holds
 *   confidence:       @Min(1) @Max(5) Integer — NO @NotNull: null/absent
 *                     are VALID (jakarta @Min/@Max ignore null)
 *   selfDoubtFlag:    primitive boolean — absent OR null → false (header
 *                     fact: FAIL_ON_NULL_FOR_PRIMITIVES disabled)
 *   timedCondition:   primitive boolean — same
 */
export const submitAnswerRequestSchema = z.object({
  questionId: z.string().uuid(),
  chosenOptionId: z.string().uuid(),
  responseTimeMs: z.number().int().min(0),
  confidence: z.number().int().min(1).max(5).nullish(),
  selfDoubtFlag: z.preprocess((v) => (v === null || v === undefined ? false : v), z.boolean()),
  timedCondition: z.preprocess((v) => (v === null || v === undefined ? false : v), z.boolean()),
});
export type SubmitAnswerRequest = z.infer<typeof submitAnswerRequestSchema>;

/**
 * PartAnswerRequest — one part-level written answer (inside a structured
 * submission).
 *
 * Java constraints (copied verbatim):
 *   partId:     @NotNull UUID
 *   answerText: @Size(max = 4000) String — null/absent VALID (= skipped
 *               part); "" VALID; UTF-16 counting matches zod .max (header)
 *               (4000 chars = the tutor turn cap, R7 — the text is stored
 *               AND embedded verbatim into Smart Mark prompts)
 */
export const partAnswerRequestSchema = z.object({
  partId: z.string().uuid(),
  answerText: z.string().max(4000).nullish(),
});
export type PartAnswerRequest = z.infer<typeof partAnswerRequestSchema>;

/**
 * StructuredSubmitRequest — multi-part STRUCTURED submission
 * (POST /api/v1/attempts/structured, 201; Master Spec §6.5/§16).
 *
 * Java constraints (copied verbatim):
 *   questionId:   @NotNull UUID
 *   partAnswers:  @NotEmpty @Valid List<PartAnswerRequest> — null AND []
 *                 rejected; @Valid cascades the element constraints
 *                 (zod array element schema does the same)
 *   + the same research/timing fields as SubmitAnswerRequest
 */
export const structuredSubmitRequestSchema = z.object({
  questionId: z.string().uuid(),
  partAnswers: z.array(partAnswerRequestSchema).min(1),
  responseTimeMs: z.number().int().min(0),
  confidence: z.number().int().min(1).max(5).nullish(),
  selfDoubtFlag: z.preprocess((v) => (v === null || v === undefined ? false : v), z.boolean()),
  timedCondition: z.preprocess((v) => (v === null || v === undefined ? false : v), z.boolean()),
});
export type StructuredSubmitRequest = z.infer<typeof structuredSubmitRequestSchema>;

/**
 * LearnerSelfMarkController.PartSelfMark — one learner-awarded part mark.
 *
 * Java constraints (copied verbatim):
 *   partId:       @NotNull UUID
 *   marksAwarded: @NotNull @Min(0) @Max(99) Integer
 */
export const partSelfMarkSchema = z.object({
  partId: z.string().uuid(),
  marksAwarded: z.number().int().min(0).max(99),
});
export type PartSelfMark = z.infer<typeof partSelfMarkSchema>;

/**
 * LearnerSelfMarkController.SelfMarkRequest — POST
 * /api/v1/learners/me/attempts/{attemptId}/self-mark (201).
 *
 * Java constraints (copied verbatim): NONE on this record — parts and
 * comment are unconstrained. That is faithful, not an oversight:
 *   - parts: null ACCEPTED here (binding succeeds), then the controller's
 *     dedup loop NPEs → 500 — RESOLVED frozen-faithful by T-MIG-053 (the
 *     route throws NPE parity past the handler; the app error boundary
 *     serves the opaque 500). [] ACCEPTED (empty loop → service path).
 *   - comment: unconstrained String, nullish.
 * The duplicate-part rule is ENFORCED at the boundary (controller loop →
 * BadRequestException "duplicate part in self-mark: {partId}" → 400), so
 * it IS part of the accept/reject set and is encoded as a superRefine.
 */
export const selfMarkRequestSchema = z
  .object({
    parts: z.array(partSelfMarkSchema).nullish(),
    comment: z.string().nullish(),
  })
  .superRefine((val, ctx) => {
    if (!Array.isArray(val.parts)) return; // null/undefined: no declared constraint
    const seen = new Set<string>();
    for (const p of val.parts) {
      if (seen.has(p.partId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate part in self-mark: ${p.partId}`,
          path: ["parts"],
        });
      }
      seen.add(p.partId);
    }
  });
export type SelfMarkRequest = z.infer<typeof selfMarkRequestSchema>;

// ── response views (record serialization: present-or-null, never absent) ────

/**
 * AttemptResultView — immediate MCQ feedback (POST /api/v1/attempts, 201).
 * Null-vs-empty facts (AssessmentService.java:96-135):
 *   correctOptionLabel         — .orElse(null) when no correct option
 *                                exists → nullable
 *   implicatedMisconceptionIds — List.of() or singleton, NEVER null
 */
export const attemptResultViewSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  correct: z.boolean(),
  marksAwarded: z.number().int(),
  marksTotal: z.number().int(),
  correctOptionLabel: z.string().nullable(),
  implicatedMisconceptionIds: z.array(z.string().uuid()),
  submittedAt: javaInstantSchema,
});
export type AttemptResultView = z.infer<typeof attemptResultViewSchema>;

/**
 * StructuredAttemptResultView — the attempt lands PENDING marking
 * (POST /api/v1/attempts/structured, 201; Master Spec §15: feedback
 * arrives when Smart Mark (κ-gated) or a teacher produces marks).
 * PartResult.marksAwarded is Integer → null while pending (javadoc:
 * "Marks are null while pending"). Part label comes from
 * QuestionPart.label (nullable=false column) → non-null.
 */
export const structuredPartResultSchema = z.object({
  partId: z.string().uuid(),
  label: z.string(),
  marksPossible: z.number().int(),
  markingState: answerMarkingStateSchema,
  marksAwarded: z.number().int().nullable(),
});
export type StructuredPartResult = z.infer<typeof structuredPartResultSchema>;

export const structuredAttemptResultViewSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  marksPossible: z.number().int(),
  markingState: attemptMarkingStateSchema,
  submittedAt: javaInstantSchema,
  parts: z.array(structuredPartResultSchema),
});
export type StructuredAttemptResultView = z.infer<typeof structuredAttemptResultViewSchema>;

/**
 * AttemptHistoryView — read-only Review-Hub slice (GET
 * /api/v1/learners/me/attempts, 200; charter §14). Honesty rules from the
 * javadoc, mirrored as nullability: correct is null for structured
 * attempts until EVERY part is authoritatively marked; marksAwarded null
 * while marking is pending; structured part answer text is deliberately
 * NOT echoed (outcomes, not stored text).
 * Null-vs-empty facts (AttemptHistoryService.java:60-130):
 *   implicatedMisconceptionIds — List.of() default, never null
 *   parts                      — List.of() default, never null
 *   chosenOptionLabel / correctOptionLabel — null for structured, set for
 *     MCQ → nullable
 *   topicCode / topicTitle     — null when the topic node is missing
 *   correct / marksAwarded / confidenceLevel — nullable by construction
 *   questionType               — Question.Type.name() (enum domain)
 *   markingState               — ATTEMPT-level domain (Attempt.java:82)
 */
export const attemptHistoryPartItemSchema = z.object({
  partId: z.string().uuid(),
  label: z.string(),
  marksPossible: z.number().int(),
  marksAwarded: z.number().int().nullable(),
  markingState: answerMarkingStateSchema,
});
export type AttemptHistoryPartItem = z.infer<typeof attemptHistoryPartItemSchema>;

export const attemptHistoryItemSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  questionType: questionTypeSchema,
  externalRef: z.string().nullable(), // nullability: capture-unproven (no nullable=false on the column)
  commandWord: z.string().nullable(),
  stemExcerpt: z.string(),
  marksTotal: z.number().int(),
  topicNodeId: z.string().uuid().nullable(),
  topicCode: z.string().nullable(),
  topicTitle: z.string().nullable(),
  correct: z.boolean().nullable(),
  marksAwarded: z.number().int().nullable(),
  markingState: attemptMarkingStateSchema,
  evidenceEmitted: z.boolean(),
  chosenOptionLabel: z.string().nullable(),
  correctOptionLabel: z.string().nullable(),
  implicatedMisconceptionIds: z.array(z.string().uuid()),
  selfDoubtFlag: z.boolean(),
  timedCondition: z.boolean(),
  confidenceLevel: z.number().int().nullable(),
  responseTimeMs: z.number().int().min(0), // Java long — 64-bit note in the header
  attemptedAt: javaInstantSchema,
  parts: z.array(attemptHistoryPartItemSchema),
});
export type AttemptHistoryItem = z.infer<typeof attemptHistoryItemSchema>;

export const attemptHistoryViewSchema = z.object({
  learnerId: z.string().uuid(),
  total: z.number().int(),
  returned: z.number().int(),
  attempts: z.array(attemptHistoryItemSchema),
});
export type AttemptHistoryView = z.infer<typeof attemptHistoryViewSchema>;

/**
 * MarkSchemeRevealView — the learner mark-scheme reveal panel (GET
 * /api/v1/questions/{id}/mark-scheme, 200 | 204 | 404). Deliberately
 * narrow (javadoc): point text + marks only; acceptanceCriteria and
 * extraction metadata NEVER leave the backend — a learner surface is not
 * a marking surface (Master Spec §15/§20/§22). validationState carried
 * honestly so the UI can label SUGGESTED schemes. Part prompt comes from
 * QuestionPart.prompt (nullable column) → nullable.
 */
export const markSchemePointViewSchema = z.object({
  ref: z.string(),
  text: z.string(),
  marks: z.number().int(),
});
export type MarkSchemePointView = z.infer<typeof markSchemePointViewSchema>;

export const markSchemePartSchemeSchema = z.object({
  partId: z.string().uuid(),
  label: z.string(),
  prompt: z.string().nullable(),
  marks: z.number().int(),
  points: z.array(markSchemePointViewSchema),
});
export type MarkSchemePartScheme = z.infer<typeof markSchemePartSchemeSchema>;

export const markSchemeRevealViewSchema = z.object({
  questionId: z.string().uuid(),
  questionExternalRef: z.string().nullable(), // nullability: capture-unproven (external_ref has no nullable=false)
  schemeId: z.string().uuid(),
  validationState: validationStateSchema,
  schemeMarks: z.number().int(),
  questionMarks: z.number().int(),
  parts: z.array(markSchemePartSchemeSchema),
  generalPoints: z.array(markSchemePointViewSchema),
});
export type MarkSchemeRevealView = z.infer<typeof markSchemeRevealViewSchema>;

/**
 * StudentQuestionView — learner question projection; correct answers and
 * misconception tags are STRIPPED (Master Spec §22/§20). specPointCodes is
 * DERIVED from specPoints (codes of, PRIMARY first) so the two views can
 * never disagree (withSpecPoints). Options: real rows for MCQ, [] for
 * structured factories; parts: [] for MCQ, real for structured — both
 * arrays non-null in every construction path.
 */
export const studentOptionViewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  text: z.string(),
});
export type StudentOptionView = z.infer<typeof studentOptionViewSchema>;

export const studentPartViewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  prompt: z.string().nullable(),
  commandWord: z.string().nullable(),
  marks: z.number().int(),
});
export type StudentPartView = z.infer<typeof studentPartViewSchema>;

export const studentQuestionViewSchema = z.object({
  id: z.string().uuid(),
  externalRef: z.string().nullable(), // nullability: capture-unproven (external_ref has no nullable=false)
  type: questionTypeSchema,
  stem: z.string(),
  marks: z.number().int(),
  difficulty: z.number().int(),
  expectedTimeSeconds: z.number().int(),
  commandWord: z.string().nullable(),
  primaryTopicNodeId: z.string().uuid().nullable(),
  examPaperId: z.string().uuid().nullable(),
  options: z.array(studentOptionViewSchema),
  parts: z.array(studentPartViewSchema),
  specPointCodes: z.array(z.string()),
  specPoints: z.array(specPointRefSchema),
});
export type StudentQuestionView = z.infer<typeof studentQuestionViewSchema>;

/**
 * QuestionFamilyView — WHOLE-question serving unit (session-121): rows
 * reassembled so a part can never serve without its stimulus. The family
 * `type` is NOT Question.Type: "MCQ" when every member row is a
 * non-STRUCTURED row, else "STRUCTURED" (a mixed MCQ+structured family is
 * structured) — its own two-value domain.
 */
export const questionFamilyTypeSchema = z.enum(["MCQ", "STRUCTURED"]);
export type QuestionFamilyType = z.infer<typeof questionFamilyTypeSchema>;

export const questionFamilyViewSchema = z.object({
  key: z.string(),
  ref: z.string(),
  marks: z.number().int(),
  difficulty: z.number().int(),
  type: questionFamilyTypeSchema,
  multi: z.boolean(),
  parts: z.array(studentQuestionViewSchema),
});
export type QuestionFamilyView = z.infer<typeof questionFamilyViewSchema>;

/**
 * QuestionTopicTaxonomyView — the servable-question taxonomy (session-112,
 * ADR-026 browser sidebar + practice picker). Counts are REACHABLE counts
 * (a question counts under a topic iff GET /api/v1/questions?topicNodeId=
 * would serve it — the click-invariant), with deduped census numbers at
 * section and view level. Topics with zero servable questions do not
 * appear; sections/topics are code-ordered (deterministic read model).
 */
export const taxonomyTopicSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  questionCount: z.number().int(),
  mcqCount: z.number().int(),
  structuredCount: z.number().int(),
  familyCount: z.number().int(),
});
export type TaxonomyTopic = z.infer<typeof taxonomyTopicSchema>;

export const taxonomySectionSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  distinctQuestionCount: z.number().int(),
  distinctFamilyCount: z.number().int(),
  topics: z.array(taxonomyTopicSchema),
});
export type TaxonomySection = z.infer<typeof taxonomySectionSchema>;

export const questionTopicTaxonomyViewSchema = z.object({
  sections: z.array(taxonomySectionSchema),
  totalDistinctQuestions: z.number().int(),
  totalDistinctFamilies: z.number().int(),
});
export type QuestionTopicTaxonomyView = z.infer<typeof questionTopicTaxonomyViewSchema>;

/**
 * TeacherQuestionView — teacher/admin projection: INCLUDES correctness and
 * distractor→misconception tags (the student view's stripped mirror).
 * misconceptionNodeId is null for untagged distractors.
 */
export const teacherOptionViewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  text: z.string(),
  correct: z.boolean(),
  misconceptionNodeId: z.string().uuid().nullable(),
});
export type TeacherOptionView = z.infer<typeof teacherOptionViewSchema>;

export const teacherQuestionViewSchema = z.object({
  id: z.string().uuid(),
  externalRef: z.string().nullable(), // nullability: capture-unproven (external_ref has no nullable=false)
  type: questionTypeSchema,
  stem: z.string(),
  marks: z.number().int(),
  difficulty: z.number().int(),
  expectedTimeSeconds: z.number().int(),
  commandWord: z.string().nullable(),
  primaryTopicNodeId: z.string().uuid().nullable(),
  active: z.boolean(),
  provenance: questionProvenanceSchema,
  options: z.array(teacherOptionViewSchema),
});
export type TeacherQuestionView = z.infer<typeof teacherQuestionViewSchema>;

// ── exam-paper browsing (ExamPaperController-nested records) ────────────────

/**
 * ExamPaperController.PaperView — paper list/detail projection (GET
 * /api/v1/exam-papers, 200; ?subjectId= filters). The paper identity
 * fields (board/qualification/unit/sessionLabel/paperCode) and the two
 * linked document ids are nullable where the entity carries no
 * nullable=false guarantee (honest absence: a paper without linked
 * documents reports null ids, not empty strings).
 */
export const examPaperViewSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable(), // nullability: capture-unproven
  title: z.string(),
  board: z.string().nullable(),
  qualification: z.string().nullable(),
  unit: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  paperCode: z.string().nullable(),
  validationState: validationStateSchema,
  provenance: questionProvenanceSchema,
  questionPaperDocumentId: z.string().uuid().nullable(),
  markSchemeDocumentId: z.string().uuid().nullable(),
});
export type ExamPaperView = z.infer<typeof examPaperViewSchema>;

/**
 * ExamPaperController.PaperQuestionView — one paper question row in the
 * detail payload (GET /api/v1/exam-papers/{id}, 200 | 404 NotFoundException).
 * Null-vs-empty facts (ExamPaperController.get construction):
 *   versionValidationState — null when the question has NO version yet
 *                            (latest == null ? null : ...) → nullable
 *   currentVersionId       — same branch → nullable
 *   partCount              — 0 in the same branch (int, never null)
 *   specPoints             — refs.getOrDefault(id, List.of()) → NEVER null
 *                            (T-C28 honest absence = empty list)
 */
export const paperQuestionViewSchema = z.object({
  questionId: z.string().uuid(),
  externalRef: z.string().nullable(), // nullability: capture-unproven (external_ref has no nullable=false)
  marks: z.number().int(),
  provenance: questionProvenanceSchema,
  versionValidationState: validationStateSchema.nullable(),
  partCount: z.number().int(),
  currentVersionId: z.string().uuid().nullable(),
  specPoints: z.array(specPointRefSchema),
});
export type PaperQuestionView = z.infer<typeof paperQuestionViewSchema>;

export const examPaperDetailResponseSchema = z.object({
  paper: examPaperViewSchema,
  questions: z.array(paperQuestionViewSchema),
});
export type ExamPaperDetailResponse = z.infer<typeof examPaperDetailResponseSchema>;

/**
 * LearnerSelfMarkController.SelfMarkView — the self-mark receipt
 * (201). marksAwarded is a primitive int DEFAULTED to 0 when the attempt
 * row's null marksAwarded would leak (SelfMarkView.from: "null ? 0 : …").
 * PartView.marksAwarded is a primitive int unboxed from the answer —
 * partial-marks behavior must be capture-pinned before the port serves
 * this view (header flag).
 */
export const selfMarkPartViewSchema = z.object({
  partId: z.string().uuid(),
  label: z.string(),
  marksAwarded: z.number().int(),
  marksPossible: z.number().int(),
  markingState: answerMarkingStateSchema,
});
export type SelfMarkPartView = z.infer<typeof selfMarkPartViewSchema>;

export const selfMarkViewSchema = z.object({
  attemptId: z.string().uuid(),
  marksAwarded: z.number().int(),
  marksTotal: z.number().int(),
  evidenceFired: z.boolean(),
  parts: z.array(selfMarkPartViewSchema),
});
export type SelfMarkView = z.infer<typeof selfMarkViewSchema>;

// ── query/path parameter binding (Spring @RequestParam/@PathVariable) ───────

/**
 * Mirror of content.ts's javaIntParamSchema (private there — consolidation
 * deferred to R1 post-merge, yaml next_safe_actions). Spring
 * @RequestParam Integer binding: whitespace-trimmed, optional sign, digits
 * only, Integer range (overflow → 400); non-string JSON numbers pass
 * through for typed-client convenience.
 */
const int32Text = (s: string): number => {
  const t = s.replace(/\s+/g, "");
  if (!/^[+-]?\d+$/.test(t)) return NaN;
  const n = Number(t);
  return Math.abs(n) > 2147483647 ? NaN : n;
};
const javaIntegerParamSchema = z.preprocess(
  (v) => (typeof v === "string" ? int32Text(v) : v),
  z.number().int(),
);

/**
 * GET /api/v1/questions and /api/v1/questions/families params.
 * topicNodeId / rootId are optional UUIDs; an unparseable value fails
 * Spring's UUID conversion → 400 (zod .uuid() rejects, same set).
 * rootId scopes to the subject's PART_OF subtree
 * (knowledgeGraph.subtreeIds); precedence: topicNodeId, else rootId, else
 * all-active — precedence itself is port-layer service behavior.
 */
export const questionsListParamsSchema = z.object({
  topicNodeId: z.string().uuid().optional(),
  rootId: z.string().uuid().optional(),
});
export type QuestionsListParams = z.infer<typeof questionsListParamsSchema>;

/**
 * GET /api/v1/exam-papers params — subjectId optional UUID filter
 * (absent = all papers, newest-first by created_at — repository ordering).
 */
export const examPapersListParamsSchema = z.object({
  subjectId: z.string().uuid().optional(),
});
export type ExamPapersListParams = z.infer<typeof examPapersListParamsSchema>;

/**
 * GET /api/v1/learners/me/attempts params — `limit` is ADVISORY (javadoc:
 * "never a pagination protocol"): no @Min/@Max declared, so no bounds are
 * invented here; the service owns default 50 / clamp 100. Unparseable
 * text ("abc") fails Integer binding → 400; "-5"/"1000" BIND and clamp
 * service-side.
 */
export const attemptHistoryParamsSchema = z.object({
  limit: javaIntegerParamSchema.optional(),
});
export type AttemptHistoryParams = z.infer<typeof attemptHistoryParamsSchema>;

/**
 * Path UUID conversions (Spring @PathVariable UUID — unparseable → 400
 * MethodArgumentTypeMismatch, distinct from the 404 unknown-id path):
 *   GET  /api/v1/questions/{id}                (uuidPathSchema)
 *   GET  /api/v1/questions/{id}/mark-scheme    (uuidPathSchema)
 *   GET  /api/v1/exam-papers/{id}              (uuidPathSchema)
 *   POST /api/v1/learners/me/attempts/{attemptId}/self-mark
 * Exported as named bundles so the port lanes consume identical schemas.
 */
export const questionIdPathSchema = z.object({ id: uuidPathSchema });
export type QuestionIdPath = z.infer<typeof questionIdPathSchema>;

export const examPaperIdPathSchema = z.object({ id: uuidPathSchema });
export type ExamPaperIdPath = z.infer<typeof examPaperIdPathSchema>;

export const selfMarkPathSchema = z.object({ attemptId: uuidPathSchema });
export type SelfMarkPath = z.infer<typeof selfMarkPathSchema>;
