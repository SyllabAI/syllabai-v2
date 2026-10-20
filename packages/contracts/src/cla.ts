/**
 * CLA (Contextual Learning Assistant) contracts — T-MIG-067.
 *
 * Frozen source: syllabai-core @ 6cad6ef
 *   - cla/ClaController.java :69-89 (the ClaAskRequest record — jakarta
 *     @NotNull/@NotBlank/@Size discipline mirrored as zod)
 *   - cla/dto/ClaAnswerView.java :22-121 (the step-1 view: answer, citations,
 *     the resolved ContextView, topic anchors, tool audit trace)
 *   - cla/ResourceContext.java :62-235 (the closed Kind enum + the resolver's
 *     product; the WIRE only ever carries the ContextView projection)
 *   - cla/ResponseMode.java :22-36 (the closed mode enum — the mode is DATA
 *     in the pipeline, never a model judgment)
 *   - cla/AttemptRequiredException.java :11-15 (the fixed 409 refusal body)
 *
 * Wire law: ids are strings on the wire (the repo-wide UUID-as-string
 * convention); the ContextView echoes the server-resolved context exactly
 * as resolved (never client-asserted). LLM-generated surfaces are NEVER
 * golden-gated (R-LLM); these contracts pin the DETERMINISTIC wire shapes —
 * request admission, the context identity block, the tool audit trace —
 * and the fixed refusal text of the §7.3 gate.
 */
import { z } from "zod";

/** ResourceContext.Kind :172-187 — closed, extensible by decision only. */
export const claKindSchema = z.enum([
  "SPECIFICATION_POINT",
  "KG_TOPIC",
  "NOTE_SECTION",
  "QUESTION_PART",
  "SMART_LESSON",
  "PAST_PAPER_QUESTION",
]);
export type ClaKind = z.infer<typeof claKindSchema>;

/** ResponseMode :22-36 — explicit per request; unknown values fail 400. */
export const claModeSchema = z.enum(["EXPLAIN", "SUMMARIZE", "HINT", "CHECK"]);
export type ClaMode = z.infer<typeof claModeSchema>;

/** AttemptRequiredException :14-15 — the FIXED 409 body (§7.3). */
export const CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE =
  "full feedback requires an attempt on this question first — " +
  "the answer-leakage gate unlocks CHECK after attempt evidence exists";

/**
 * ClaAskRequest (ClaController :69-89). The client passes opaque references
 * and explicit mode; the server resolves everything else fail-closed.
 * Size laws: specCode <= 80, noteId <= 256, question 1..2000 (@NotBlank
 * discriminator — the zod min(1) rides the same two-envelope law as the
 * tutor's ask contracts).
 */
export const claAskRequestSchema = z
  .object({
    kind: claKindSchema,
    rootId: z.string().uuid().nullish(),
    topicNodeId: z.string().uuid().nullish(),
    questionId: z.string().uuid().nullish(),
    partId: z.string().uuid().nullish(),
    specCode: z.string().max(80).nullish(),
    noteId: z.string().max(256).nullish(),
    mode: claModeSchema,
    question: z.string().min(1).max(2000),
  })
  .strict();
export type ClaAskRequest = z.infer<typeof claAskRequestSchema>;

/** ResourceContext.LessonActionInfo :107-135 — enum names as strings. */
export const claLessonActionSchema = z
  .object({
    actionType: z.string().min(1),
    reasonCode: z.string().min(1),
    targetNodeId: z.string().uuid().nullable(),
    targetCode: z.string().nullable(),
    targetTitle: z.string().nullable(),
    reasonDetail: z.string().min(1),
    servableQuestionCount: z.number().int(),
  })
  .strict();
export type ClaLessonAction = z.infer<typeof claLessonActionSchema>;

/**
 * ClaAnswerView.ContextView :46-88 — the resolved context, exactly as the
 * server resolved it. curriculumVersion carries the owning subject's
 * version identity (resolved server-side, never client-supplied).
 */
export const claContextViewSchema = z
  .object({
    kind: claKindSchema,
    reference: z.string().uuid(),
    topicNodeId: z.string().uuid(),
    rootId: z.string().uuid(),
    subjectCode: z.string().min(1),
    topicCode: z.string().min(1),
    topicTitle: z.string().min(1),
    curriculumVersion: z.string().min(1),
    curriculumBoard: z.string().min(1),
    curriculumQualification: z.string().min(1),
    validationState: z.string().min(1),
    mode: claModeSchema,
    questionStem: z.string().nullable(),
    questionCommandWord: z.string().nullable(),
    questionMarks: z.number().int(),
    paperCode: z.string().nullable(),
    attempted: z.boolean().nullable(),
    partLabel: z.string().nullable(),
    lessonAction: claLessonActionSchema.nullable(),
    noteId: z.string().nullable(),
    noteTitle: z.string().nullable(),
  })
  .strict();
export type ClaContextView = z.infer<typeof claContextViewSchema>;

/** ClaAnswerView.TopicAnchorView :103-105 — the deterministic anchor (matchScore 1.0). */
export const claTopicAnchorSchema = z
  .object({
    code: z.string().min(1),
    title: z.string().min(1),
    matchScore: z.number(),
  })
  .strict();
export type ClaTopicAnchor = z.infer<typeof claTopicAnchorSchema>;

/** ClaAnswerView.ToolTraceView :110-117 — the §4.4 audit trace; NO tool
 *  output text is echoed back to the client (args are references, sizes,
 *  latencies only). */
export const claToolTraceSchema = z
  .object({
    tool: z.string().min(1),
    args: z.string(),
    resultSize: z.number().int(),
    latencyMs: z.number(),
  })
  .strict();
export type ClaToolTrace = z.infer<typeof claToolTraceSchema>;

/** ClaAnswerView :22-41 — the step-1 answer view. model is NULLABLE of
 *  record (t2 amendment, disclosed): the deterministic refusal constructs
 *  GeneratedAnswer(REFUSAL, null, "deterministic-refusal") (ClaService
 *  :417 @ 6cad6ef) and the view passes generated.model() through — the
 *  frozen wire serializes "model": null on every refusal. */
export const claAnswerViewSchema = z
  .object({
    answer: z.string(),
    citations: z.array(z.unknown()),
    context: claContextViewSchema,
    topics: z.array(claTopicAnchorSchema),
    evidenceCount: z.number().int(),
    model: z.string().nullable(),
    provider: z.string(),
    refused: z.boolean(),
    latencyMs: z.number(),
    tools: z.array(claToolTraceSchema),
  })
  .strict();
export type ClaAnswerView = z.infer<typeof claAnswerViewSchema>;

// ── CLA thread sync tier (DC-6 phase 3; docs/DC6-CLA-SYNC-TIER-PLAN.md §3) ──
// ADDITIVE tail of record — the frozen ask family above is byte-untouched.
// The sync tier is v2-NATIVE (no frozen-core counterpart — feasibility path
// (iii) of record), so these schemas pin the DETERMINISTIC shapes only:
// admission caps (mirroring the local store's 40x100 family law + the ask
// contract's 2000-char text law), the 4-kind message union (a structural
// mirror of the hub's QuestionClaStoredMessage; the assistant leg reuses
// the ALREADY-ratified claAnswerViewSchema — zero new shape invention),
// and the view shapes the route defensively re-parses (the cla.ts:282
// wire law). Thread-level view stamps are ISO strings (tutor-view style);
// message `at` rides epoch ms — the hub render vocabulary (plan §5.3).

/** Thread surfaces of record. 'assistant' is RESERVED (the DB CHECK carries
 *  it; the API admits only 'question_cla' until the sequenced follow-up). */
export const claThreadSurfaceSchema = z.enum(["question_cla", "assistant"]);
export type ClaThreadSurface = z.infer<typeof claThreadSurfaceSchema>;

/** POST /api/v1/learners/me/cla/threads — the mirror anchor creation. */
export const claThreadCreateSchema = z
  .object({
    surface: claThreadSurfaceSchema,
    questionId: z.string().min(1).max(120),
    questionNumber: z.number().int().min(1).max(999).nullable(),
    courseSlug: z.string().min(1).max(64).nullable(),
    title: z.string().min(1).max(120),
  })
  .strict();
export type ClaThreadCreate = z.infer<typeof claThreadCreateSchema>;

/** One mirrored transcript message (the client's union, validated). */
export const claThreadSyncMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("user"),
      at: z.number().int().nonnegative(),
      text: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("assistant"),
      at: z.number().int().nonnegative(),
      payload: claAnswerViewSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("gate"),
      at: z.number().int().nonnegative(),
      text: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("error"),
      at: z.number().int().nonnegative(),
      text: z.string().min(1).max(2000),
      question: z.string().min(1).max(2000),
    })
    .strict(),
]);
export type ClaThreadSyncMessage = z.infer<typeof claThreadSyncMessageSchema>;

/** PUT /api/v1/learners/me/cla/threads/:id — the full-state mirror write.
 *  questionId is ABSENT on purpose: a thread never crosses questions, and
 *  .strict() rejects any attempt to move it. */
export const claThreadSyncSchema = z
  .object({
    title: z.string().min(1).max(120),
    questionNumber: z.number().int().min(1).max(999).nullable(),
    courseSlug: z.string().min(1).max(64).nullable(),
    messages: z.array(claThreadSyncMessageSchema).max(100),
  })
  .strict();
export type ClaThreadSync = z.infer<typeof claThreadSyncSchema>;

/** GET list row — summaries only, never transcript bodies (the s143 law). */
export const claThreadSummarySchema = z
  .object({
    threadId: z.string().uuid(),
    surface: claThreadSurfaceSchema,
    questionId: z.string().max(120).nullable(),
    questionNumber: z.number().int().min(1).max(999).nullable(),
    courseSlug: z.string().max(64).nullable(),
    title: z.string().max(120),
    createdAt: z.string(),
    lastActiveAt: z.string(),
    messageCount: z.number().int().nonnegative(),
  })
  .strict();
export type ClaThreadSummary = z.infer<typeof claThreadSummarySchema>;

/** GET /:id — the full transcript, seq-ordered. Message `at` is epoch ms
 *  (the client render vocabulary; plan §5.3). */
export const claThreadViewMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("user"), at: z.number().int().nonnegative(), text: z.string() })
    .strict(),
  z
    .object({
      kind: z.literal("assistant"),
      at: z.number().int().nonnegative(),
      payload: claAnswerViewSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("gate"), at: z.number().int().nonnegative(), text: z.string() })
    .strict(),
  z
    .object({
      kind: z.literal("error"),
      at: z.number().int().nonnegative(),
      text: z.string(),
      question: z.string(),
    })
    .strict(),
]);
export type ClaThreadViewMessage = z.infer<typeof claThreadViewMessageSchema>;

export const claThreadViewSchema = z
  .object({
    threadId: z.string().uuid(),
    surface: claThreadSurfaceSchema,
    questionId: z.string().max(120).nullable(),
    questionNumber: z.number().int().min(1).max(999).nullable(),
    courseSlug: z.string().max(64).nullable(),
    title: z.string().max(120),
    createdAt: z.string(),
    lastActiveAt: z.string(),
    messages: z.array(claThreadViewMessageSchema),
  })
  .strict();
export type ClaThreadView = z.infer<typeof claThreadViewSchema>;

/** POST / 201 body and PUT /:id 200 body. */
export const claThreadCreatedSchema = z
  .object({ threadId: z.string().uuid(), createdAt: z.string() })
  .strict();
export type ClaThreadCreated = z.infer<typeof claThreadCreatedSchema>;

export const claThreadSyncedSchema = z
  .object({ threadId: z.string().uuid(), lastActiveAt: z.string() })
  .strict();
export type ClaThreadSynced = z.infer<typeof claThreadSyncedSchema>;

// ── the assistant surface (DC-6 phase 3b; docs/DC6-ASSISTANT-SURFACE-SYNC-PLAN.md) ──
// The surface the phase-3 DB CHECK reserved (plan §5.4) now gets its API
// writer. ADDITIVE tail — every phase-3 export above stays byte-identical;
// each surface's wire law stays EXACT (plan §5.1: per-surface schemas, not a
// payload union). The assistant rail's transcript is the hub /api/ai/cla
// projection (content + citations + mode/provider/model/refused/evidenceCount
// + a coarse {kind, anchor, attempted?} context) — pinned VERBATIM, zero
// fabrication of the ratified view's server-resolved fields. Gate/error kinds
// are deliberately ABSENT: the rail never stores them (transient setError
// state only), so its union is 2-kind.

/** The rail's coarse context projection (AssistantMessage.context verbatim). */
export const claAssistantContextSchema = z
  .object({
    kind: z.string().min(1),
    anchor: z.string(),
    attempted: z.boolean().nullable().optional(),
  })
  .strict();
export type ClaAssistantContext = z.infer<typeof claAssistantContextSchema>;

/** The assistant answer leg's payload — the projection as the rail stores
 *  it; every field optional exactly when the rail's field is optional
 *  (JSON round-trip honesty: absent stays absent). */
export const claAssistantAnswerPayloadSchema = z
  .object({
    answer: z.string(),
    citations: z.array(z.unknown()),
    mode: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().nullable().optional(),
    refused: z.boolean().optional(),
    evidenceCount: z.number().int().optional(),
    latencyMs: z.number().optional(),
    context: claAssistantContextSchema.nullable().optional(),
  })
  .strict();
export type ClaAssistantAnswerPayload = z.infer<typeof claAssistantAnswerPayloadSchema>;

/** POST /api/v1/learners/me/cla/threads — the assistant mirror anchor.
 *  questionId/questionNumber ABSENT on purpose: an assistant thread has no
 *  question; .strict() rejects the smuggle (the DB scope CHECK's mirror). */
export const claAssistantThreadCreateSchema = z
  .object({
    surface: z.literal("assistant"),
    courseSlug: z.string().min(1).max(64).nullable(),
    title: z.string().min(1).max(120),
  })
  .strict();
export type ClaAssistantThreadCreate = z.infer<typeof claAssistantThreadCreateSchema>;

/** The assistant surface's 2-kind message union (the rail's role union). */
export const claAssistantThreadSyncMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("user"),
      at: z.number().int().nonnegative(),
      text: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("assistant"),
      at: z.number().int().nonnegative(),
      payload: claAssistantAnswerPayloadSchema,
    })
    .strict(),
]);
export type ClaAssistantThreadSyncMessage = z.infer<typeof claAssistantThreadSyncMessageSchema>;

/** PUT /:id (assistant rows) — the full-state mirror write. questionNumber
 *  ABSENT (an assistant thread never has one); the store records it NULL. */
export const claAssistantThreadSyncSchema = z
  .object({
    title: z.string().min(1).max(120),
    courseSlug: z.string().min(1).max(64).nullable(),
    messages: z.array(claAssistantThreadSyncMessageSchema).max(100),
  })
  .strict();
export type ClaAssistantThreadSync = z.infer<typeof claAssistantThreadSyncSchema>;

/** GET /:id (assistant rows) — the 2-kind view (message `at` epoch ms, the
 *  family view law). surface/questionId/questionNumber pin the literal
 *  assistant shape so a question row can never parse as an assistant view. */
export const claAssistantThreadViewMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("user"), at: z.number().int().nonnegative(), text: z.string() })
    .strict(),
  z
    .object({
      kind: z.literal("assistant"),
      at: z.number().int().nonnegative(),
      payload: claAssistantAnswerPayloadSchema,
    })
    .strict(),
]);
export type ClaAssistantThreadViewMessage = z.infer<typeof claAssistantThreadViewMessageSchema>;

export const claAssistantThreadViewSchema = z
  .object({
    threadId: z.string().uuid(),
    surface: z.literal("assistant"),
    questionId: z.null(),
    questionNumber: z.null(),
    courseSlug: z.string().max(64).nullable(),
    title: z.string().max(120),
    createdAt: z.string(),
    lastActiveAt: z.string(),
    messages: z.array(claAssistantThreadViewMessageSchema),
  })
  .strict();
export type ClaAssistantThreadView = z.infer<typeof claAssistantThreadViewSchema>;
