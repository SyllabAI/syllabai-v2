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

/** ClaAnswerView :22-41 — the step-1 answer view. */
export const claAnswerViewSchema = z
  .object({
    answer: z.string(),
    citations: z.array(z.unknown()),
    context: claContextViewSchema,
    topics: z.array(claTopicAnchorSchema),
    evidenceCount: z.number().int(),
    model: z.string(),
    provider: z.string(),
    refused: z.boolean(),
    latencyMs: z.number(),
    tools: z.array(claToolTraceSchema),
  })
  .strict();
export type ClaAnswerView = z.infer<typeof claAnswerViewSchema>;
