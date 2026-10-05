/**
 * Teacher-marking contracts — ported from the frozen Java core (T-MIG-037,
 * the T-MIG-018 next_safe_actions follow-up; operator trace 1a10cb48dc7edd15).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/teacher/TeacherMarkingController.java
 *       (/api/v1/teacher/marking — GET /answers, /queue-v2, /throughput,
 *        POST /smart-mark-batch, GET /answers/{id},
 *        POST /answers/{id}/smart-mark, POST /answers/{id}/human-mark,
 *        POST /kappa/evaluate, GET /kappa/latest)
 *   src/main/java/com/syllabai/teacher/dto/TeacherViews.java
 *       (AnswerMarkingView, AnswerMarkingPageView, SmartMarkView,
 *        HumanMarkView — LearnerRosterView is the Wave-5 roster surface,
 *        deliberately NOT here)
 *   src/main/java/com/syllabai/teacher/TeacherMarkingQueueService.java
 *       (MarkingQueueView, MarkingQueuePageView, MarkingGroupView,
 *        MarkingQueueItem, ThroughputView, PendingPaperView,
 *        SmartMarkBatchView, SmartMarkBatchItem; G-5 paging constants)
 *   src/main/java/com/syllabai/teacher/TeacherMarkingController.java:318-327
 *       (KappaEvaluationView) + SmartMarkAgreementEvaluation.java:24-25
 *       (scope ALL|PAPER)
 *   src/main/java/com/syllabai/assessment/Answer.java:34 (MarkingState —
 *      five values; REUSED from assessment.ts answerMarkingStateSchema)
 *   src/main/java/com/syllabai/smartmark/SmartMarkResult.java
 *       (entity nullability: modelId null on V34 refusal rows :313-316;
 *        breakdown null-coalesced to empty list :120 → never null;
 *        pipelineVersion column defaults to PIPELINE_VERSION "1.3.0" :53)
 *   src/main/java/com/syllabai/smartmark/HumanMark.java
 *       (perPointDecisions plain column — nullable)
 *
 * ROUTE-MOUNT NOTE: these schemas are consumed by the T-MIG-033 port lane
 * (r4, PR #50). R0 review 5997573821 (F-33-1) is binding ground truth:
 *   (a) ThroughputView.answersByState is ZERO-FILLED over all FIVE
 *       MarkingState keys before counting (frozen
 *       TeacherMarkingQueueService throughput()) — a zero-self-marked
 *       corpus still renders "SELF_MARKED": 0. The zod record-with-enum-key
 *       below enforces exactly that exhaustiveness.
 *   (b) the queue `state` accepted-set is valueOf(state.toUpperCase())
 *       over the five-value enum — SELF_MARKED is a legal filter. The
 *       frozen C-9 error MESSAGE enumerates only four states (frozen
 *       quirk): keep the message verbatim in the port, the accepted-set
 *       stays the five-value enum.
 *
 * REQUEST-side Jackson facts (same law as content-writes.ts): Spring Boot
 * disables FAIL_ON_UNKNOWN_PROPERTIES → unknown JSON keys are ignored
 * (zod default strip). Missing String/boxed components bind as null;
 * @NotNull is the only required-ness. Numeric strings coerce to Integer
 * at Jackson (mirrored via javaJsonInt from content-writes.ts).
 *
 * RESPONSE-side facts: records serialize every component (absent never
 * happens; null does) → .nullable() for plausible-null references, never
 * .optional(). Nullability per source: learnerDisplayName (unknown ids
 * resolve null, Controller :310-316), marksAwarded Integer, latestSmartMark
 * /latestHumanMark (absent lookups → null :247-248), examPaperId +
 * paperTitle (question-bank answers have no paper — rendered honestly,
 * TeacherViews :93-98), confidence/modelId (refusal rows), failureReason,
 * perPointDecisions/comments on HumanMarkView.
 *
 * NO golden captures exist for these surfaces (T-MIG-004 captured reads;
 * T-MIG-003's write captures are the 5 auth cases) — acceptance baseline
 * is the Java declaration itself, pinned in teacher-marking.test.ts.
 */
import { z } from "zod";
import {
  answerMarkingStateSchema,
  javaInstantSchema,
  uuidPathSchema,
} from "./assessment";
import { javaJsonInt } from "./content-writes";

// ── G-5 pagination constants (TeacherMarkingQueueService.java:56,95,97) ────

/** rows per marking-queue page when only `page` is given (G-5) */
export const ANSWER_QUEUE_DEFAULT_PAGE_SIZE = 50;
/** hard bound on rows per marking-queue page (G-5) */
export const ANSWER_QUEUE_MAX_PAGE_SIZE = 200;
/** whole paper-groups per page for queue-v2 (TeacherMarkingQueueService :95) */
export const PAPER_GROUPS_DEFAULT_PER_PAGE = 5;
/** hard bound on paper-groups per page (:97) */
export const PAPER_GROUPS_MAX_PER_PAGE = 100;
/** bounded smart-mark batch (TeacherMarkingQueueService :56) */
export const SMART_MARK_BATCH_LIMIT = 50;

/**
 * Frozen verbatim validation messages (port-layer duties — pinned here so
 * the strings cannot drift; BadRequestException payloads):
 *   queue /answers:      "page must be >= 0"
 *                        "size must be between 1 and 200"
 *   queue-v2:            "size must be between 1 and 100 (paper groups per page)"
 *   smart-mark-batch:    "answerIds must not be empty"
 *                        "batch too large: <n> > 50 — dispatch smaller batches"
 *   state param (C-9):   "unknown marking state: <state> (expected PENDING,
 *                        SMART_MARKED, HUMAN_MARKED or OVERRIDDEN)"
 *                        — the 4-state enumeration is the FROZEN MESSAGE's
 *                        own quirk; the accepted-set is the five-value enum
 *                        (F-33-1(b), R0 review 5997573821).
 */

/**
 * Queue `state` param mirror (TeacherMarkingController :178-187):
 * Answer.MarkingState.valueOf(state.toUpperCase()) — case-insensitive on
 * the wire, five-value accepted-set. Unknown values are a malformed request
 * (400, C-9), never a 404.
 */
export const markingStateParamSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(answerMarkingStateSchema);
export type MarkingStateParam = z.infer<typeof markingStateParamSchema>;

/** /answers opt-in pagination params (Controller :148-176): page >= 0, size 1..200. */
export const answerQueuePageParamsSchema = z
  .object({
    page: javaJsonInt.optional(),
    size: javaJsonInt.optional(),
  })
  .refine((p) => p.page === undefined || p.page >= 0, {
    message: "page must be >= 0",
  })
  .refine((p) => p.size === undefined || (p.size >= 1 && p.size <= ANSWER_QUEUE_MAX_PAGE_SIZE), {
    message: "size must be between 1 and 200",
  });

/** /queue-v2 opt-in pagination params (:109-122): page >= 0, size 1..100 paper groups. */
export const paperGroupsPageParamsSchema = z
  .object({
    page: javaJsonInt.optional(),
    size: javaJsonInt.optional(),
  })
  .refine((p) => p.page === undefined || p.page >= 0, {
    message: "page must be >= 0",
  })
  .refine((p) => p.size === undefined || (p.size >= 1 && p.size <= PAPER_GROUPS_MAX_PER_PAGE), {
    message: "size must be between 1 and 100 (paper groups per page)",
  });

// ── request bodies ──────────────────────────────────────────────────────────

/**
 * HumanMarkRequest (Controller :300-304):
 *   marksAwarded      @NotNull @Min(0) @Max(99) Integer — absent AND
 *                     explicit-null both 400; numeric strings coerce
 *                     (Jackson Integer binding); range 400 via bean
 *                     validation. The service adds the part-bound law
 *                     (TeacherMarkingService :104-106: "outside part bound
 *                     0–<partMarks>") — binding truth here is 0..99.
 *   perPointDecisions @Size(max=50) Map<String,Integer> — absent/null bind
 *                     null (no @NotNull); entries are markPointId → int
 *                     (the {markPointId: 0|1} κ-pairing semantic is the
 *                     service's reading, not a binding constraint).
 *   comments          @Size(max=4000) String — absent/null bind null.
 */
export const humanMarkRequestSchema = z.object({
  marksAwarded: javaJsonInt.refine((v) => v >= 0 && v <= 99, {
    message: "marksAwarded must be between 0 and 99",
  }),
  perPointDecisions: z
    .record(z.string(), javaJsonInt)
    .nullable()
    .default(null)
    .refine((m) => m === null || Object.keys(m).length <= 50, {
      message: "perPointDecisions must have at most 50 entries",
    }),
  comments: z.string().max(4000).nullable().default(null),
});
export type HumanMarkRequest = z.infer<typeof humanMarkRequestSchema>;

/**
 * SmartMarkBatchRequest (Controller :238-241): @NotNull @NotEmpty
 * @Size(max = 50) List<UUID> answerIds. Duplicates are legal at binding —
 * the service dedups order-preservingly and `requested` echoes the deduped
 * count (TeacherMarkingQueueService :340-390).
 */
export const smartMarkBatchRequestSchema = z.object({
  answerIds: z.array(z.string().uuid()).min(1).max(SMART_MARK_BATCH_LIMIT),
});
export type SmartMarkBatchRequest = z.infer<typeof smartMarkBatchRequestSchema>;

/**
 * KappaScopeRequest (Controller :306-307) with @RequestBody(required=false)
 * (:273-280): the WHOLE BODY is optional — absent body binds null and the
 * controller reads scope ALL; {"paperId": "..."} scopes one paper; an
 * invalid uuid string is a 400 (Jackson UUID parse).
 */
export const kappaScopeRequestSchema = z
  .object({
    paperId: z.string().uuid().nullable().default(null),
  })
  .nullable()
  .default(null);
export type KappaScopeRequest = z.infer<typeof kappaScopeRequestSchema>;

/** GET /kappa/latest query param (:282-293) — optional paper uuid. */
export const kappaLatestParamsSchema = z.object({
  paperId: z.string().uuid().optional(),
});

/** GET /answers/{id} + POST /answers/{id}/smart-mark|human-mark path param. */
export const answerIdPathSchema = z.object({ id: uuidPathSchema });

// ── response views ──────────────────────────────────────────────────────────

/**
 * SmartMarkView (TeacherViews :59-70) over a SmartMarkResult row.
 * pipelineVersion: column defaults to the PIPELINE_VERSION constant —
 * non-null on every frozen row. modelId/confidence: null on V34 refusal
 * rows (SmartMarkService :313-316). breakdown: ctor null-coalesces to an
 * empty list (SmartMarkResult :120) — never null. markPointId keys →
 * opaque pipeline values (z.unknown: pipeline-owned payloads).
 */
export const SMART_MARK_PIPELINE_VERSION = "1.3.0";

export const smartMarkViewSchema = z.object({
  id: z.string().uuid(),
  pipelineVersion: z.string(),
  modelId: z.string().nullable(),
  marksAwarded: z.number().int(),
  confidence: z.number().nullable(),
  validationPassed: z.boolean(),
  failureReason: z.string().nullable(),
  breakdown: z.array(z.record(z.string(), z.unknown())),
  createdAt: javaInstantSchema,
});
export type SmartMarkView = z.infer<typeof smartMarkViewSchema>;

/** HumanMarkView (TeacherViews :72-81); perPointDecisions/comments nullable columns. */
export const humanMarkViewSchema = z.object({
  id: z.string().uuid(),
  markerId: z.string().uuid(),
  marksAwarded: z.number().int(),
  perPointDecisions: z.record(z.string(), z.number().int()).nullable(),
  comments: z.string().nullable(),
  createdAt: javaInstantSchema,
});
export type HumanMarkView = z.infer<typeof humanMarkViewSchema>;

/**
 * AnswerMarkingView (TeacherViews :38-45) — 16 components, exact names
 * (R0 review 5997573821 "component names exact"). Nullable per builder:
 * learnerDisplayName (batched identity lookup miss), marksAwarded
 * (PENDING rows), latestSmartMark/latestHumanMark (no rows yet),
 * examPaperId/paperTitle (question-bank answers — honest absence,
 * TeacherViews :93-98), questionExternalRef (capture-unproven column —
 * mirrors studentQuestionViewSchema), answerText (text column without
 * nullable=false; submit path always writes it).
 */
export const answerMarkingViewSchema = z.object({
  answerId: z.string().uuid(),
  attemptId: z.string().uuid(),
  learnerId: z.string().uuid(),
  learnerDisplayName: z.string().nullable(),
  questionId: z.string().uuid(),
  questionExternalRef: z.string().nullable(),
  partLabel: z.string(),
  partPrompt: z.string().nullable(),
  partMarks: z.number().int(),
  answerText: z.string().nullable(),
  markingState: answerMarkingStateSchema,
  marksAwarded: z.number().int().nullable(),
  latestSmartMark: smartMarkViewSchema.nullable(),
  latestHumanMark: humanMarkViewSchema.nullable(),
  examPaperId: z.string().uuid().nullable(),
  paperTitle: z.string().nullable(),
});
export type AnswerMarkingView = z.infer<typeof answerMarkingViewSchema>;

/**
 * AnswerMarkingPageView (TeacherViews :55-57) — the opt-in envelope,
 * returned by GET /answers ONLY when page/size params are present;
 * without them the endpoint returns the plain AnswerMarkingView array
 * (byte-compatible with the existing web client). totalElements is a
 * Java long (database count, never an estimate).
 */
export const answerMarkingPageViewSchema = z.object({
  items: z.array(answerMarkingViewSchema),
  page: z.number().int(),
  size: z.number().int(),
  totalElements: z.number().int(),
  totalPages: z.number().int(),
});
export type AnswerMarkingPageView = z.infer<typeof answerMarkingPageViewSchema>;

/**
 * GET /answers response: plain list (no page/size) OR the page envelope.
 * Discriminated by the port layer on the presence of the params; both
 * shapes exported for the hub client.
 */
export const answerQueueResponseSchema = z.union([
  z.array(answerMarkingViewSchema),
  answerMarkingPageViewSchema,
]);
export type AnswerQueueResponse = z.infer<typeof answerQueueResponseSchema>;

/**
 * MarkingGroupView (TeacherMarkingQueueService :456-460): paperId is
 * NULLABLE by design — question-bank answers group under the null-paper
 * "unfiled" bucket (:238-245), rendered honestly; paperTitle/sessionLabel/
 * paperCode null when the paper row is missing (:249-251); oldestPendingAt
 * is the group's oldest answer createdAt (non-null — a group exists only
 * with >= 1 answer); oldestWaitingHours null under the future-clock guard
 * (:254).
 */
export const markingGroupViewSchema = z.object({
  paperId: z.string().uuid().nullable(),
  paperTitle: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  paperCode: z.string().nullable(),
  count: z.number().int(),
  oldestPendingAt: javaInstantSchema,
  oldestWaitingHours: z.number().int().nullable(),
});
export type MarkingGroupView = z.infer<typeof markingGroupViewSchema>;

/** MarkingQueueItem (:463-467): nextAnswerId is null on the last item (:148). */
export const markingQueueItemSchema = z.object({
  answer: answerMarkingViewSchema,
  paperId: z.string().uuid().nullable(),
  paperTitle: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  paperCode: z.string().nullable(),
  evidenceEmitted: z.boolean(),
  nextAnswerId: z.string().uuid().nullable(),
});
export type MarkingQueueItem = z.infer<typeof markingQueueItemSchema>;

/** MarkingQueueView (:435-438) — state serializes enum .name(). */
export const markingQueueViewSchema = z.object({
  state: answerMarkingStateSchema,
  groups: z.array(markingGroupViewSchema),
  items: z.array(markingQueueItemSchema),
});
export type MarkingQueueView = z.infer<typeof markingQueueViewSchema>;

/**
 * MarkingQueuePageView (:448-453) — whole paper-groups per page, honest
 * totals (all groups/items of the state), past-end pages honestly EMPTY
 * (not an error, :126-130). Returned ONLY when page/size params present.
 */
export const markingQueuePageViewSchema = z.object({
  state: answerMarkingStateSchema,
  groups: z.array(markingGroupViewSchema),
  items: z.array(markingQueueItemSchema),
  page: z.number().int(),
  size: z.number().int(),
  totalGroups: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});
export type MarkingQueuePageView = z.infer<typeof markingQueuePageViewSchema>;

/** GET /queue-v2 response: full view (no page/size) OR the page envelope. */
export const markingQueueResponseSchema = z.union([
  markingQueueViewSchema,
  markingQueuePageViewSchema,
]);
export type MarkingQueueResponse = z.infer<typeof markingQueueResponseSchema>;

/**
 * PendingPaperView (:483-485): keyed by Question.examPaperId which is
 * NULLABLE (question-bank) — the null-key "unfiled" leader is legal
 * (:296-311, null-safe comparator :303-305); titles/codes null when the
 * paper row is missing.
 */
export const pendingPaperViewSchema = z.object({
  paperId: z.string().uuid().nullable(),
  paperTitle: z.string().nullable(),
  paperCode: z.string().nullable(),
  pending: z.number().int(),
});
export type PendingPaperView = z.infer<typeof pendingPaperViewSchema>;

/**
 * ThroughputView (:476-481) — "counts of what happened, never estimates".
 * answersByState is ZERO-FILLED over all FIVE MarkingState keys before
 * counting (frozen throughput(); F-33-1(a)): the five-key strict object
 * below REQUIRES every key (and tolerates no extras), so a port omitting
 * "SELF_MARKED": 0 fails this schema — exactly the golden-divergence R0
 * blocked on PR #50. oldestPendingAt/oldestPendingHours null when no
 * pending answers exist.
 */
export const throughputViewSchema = z.object({
  answersByState: z
    .object({
      PENDING: z.number().int(),
      SMART_MARKED: z.number().int(),
      HUMAN_MARKED: z.number().int(),
      OVERRIDDEN: z.number().int(),
      SELF_MARKED: z.number().int(),
    })
    .strict(),
  humanMarks24h: z.number().int(),
  humanMarks7d: z.number().int(),
  pendingByPaper: z.array(pendingPaperViewSchema),
  oldestPendingAt: javaInstantSchema.nullable(),
  oldestPendingHours: z.number().int().nullable(),
});
export type ThroughputView = z.infer<typeof throughputViewSchema>;

/**
 * SmartMarkBatchView (:487-489) — partial success preserved: each item its
 * own transaction; marked/skipped/failed are Java longs.
 */
export const smartMarkBatchItemSchema = z.object({
  answerId: z.string().uuid(),
  outcome: z.enum(["MARKED", "SKIPPED_ALREADY_MARKED", "FAILED"]),
  marksAwarded: z.number().int().nullable(),
  reason: z.string().nullable(),
});
export type SmartMarkBatchItem = z.infer<typeof smartMarkBatchItemSchema>;

export const smartMarkBatchViewSchema = z.object({
  requested: z.number().int(),
  marked: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  items: z.array(smartMarkBatchItemSchema),
});
export type SmartMarkBatchView = z.infer<typeof smartMarkBatchViewSchema>;

/**
 * KappaEvaluationView (Controller :318-327): scope serializes
 * SmartMarkAgreementEvaluation.SCOPE_ALL/"PAPER" (:24-25); paperId null
 * for the ALL scope; kappa/observedAgreement/threshold are doubles
 * (degenerate convention: perfect agreement → 1, total disagreement → 0
 * at the 1e-12 guard — frozen :54-56, R0-verified).
 */
export const kappaEvaluationViewSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(["ALL", "PAPER"]),
  paperId: z.string().uuid().nullable(),
  sampleSize: z.number().int(),
  kappa: z.number(),
  observedAgreement: z.number(),
  threshold: z.number(),
  passed: z.boolean(),
  computedAt: javaInstantSchema,
});
export type KappaEvaluationView = z.infer<typeof kappaEvaluationViewSchema>;
