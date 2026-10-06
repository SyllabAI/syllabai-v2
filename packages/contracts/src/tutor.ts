/**
 * T-MIG-060 tranche 1 — the tutor + sessions wire (Wave-6 opener).
 *
 * Ports of the frozen tutor dtos (syllabai-core @ 6cad6ef):
 *   - TutorController.TutorAskRequest (:123-141) + HistoryTurn (:136-139)
 *   - dto/TutorAnswerView.java :20-46 (+ TopicMatch)
 *   - CitationResolver.Citation (:24-28)
 *   - TutorSessionController.CreatedSessionView (:53-55)
 *   - TutorSessionService.SessionView / TurnView / SessionSummaryView
 *     (:57-78)
 *   - TutorStreamEvent (the SSE wire shapes; the terminal event renders as
 *     the lean {ok:true} `done` the browser already expects, and errors
 *     after stream-open travel as the fixed-text `error` event —
 *     TutorStreamEvent.java :21-24 + TutorController javadoc :60-64)
 *
 * Contracts-first rule 1: constraints copied EXACTLY; the Java record wins.
 */
import { z } from "zod";

// ── request (TutorAskRequest :123-141) ──────────────────────────────────────

export const tutorHistoryTurnSchema = z.object({
  // @NotBlank @Pattern("user"|"assistant") — ConversationTurn.ROLE_* constants
  role: z.enum(["user", "assistant"]),
  // @NotBlank @Size(max = ConversationTurn.MAX_TURN_CHARS = 2000)
  text: z.string().min(1).max(2000),
});
export type TutorHistoryTurn = z.infer<typeof tutorHistoryTurnSchema>;

export const tutorAskRequestSchema = z.object({
  // @NotBlank @Size(max = 2000)
  question: z.string().min(1).max(2000),
  // @Size(max = ConversationTurn.MAX_HISTORY_TURNS = 12); optional pre-s139
  history: z.array(tutorHistoryTurnSchema).max(12).optional(),
  // §22 session anchor (s140); optional pre-s140
  sessionId: z.string().uuid().optional(),
  // V53 (ADR-030) opaque hub course reference; @Size(max = 64)
  courseRef: z.string().max(64).optional(),
});
export type TutorAskRequest = z.infer<typeof tutorAskRequestSchema>;

// ── citations (CitationResolver.Citation :24-28) ────────────────────────────

export const tutorCitationSchema = z.object({
  // 1-based; the [n] markers in the answer index this list
  index: z.number().int(),
  label: z.string(),
  sourceType: z.string(),
  // canonical document id (null for KG citations)
  documentId: z.string().nullable(),
  // source page when known
  page: z.number().int().nullable(),
  // KG node id for spec-topic citations (null for chunks)
  nodeId: z.string().uuid().nullable(),
  // resolvable link into the content/KG API (honest null when no row backs it)
  deepLink: z.string().nullable(),
});
export type TutorCitation = z.infer<typeof tutorCitationSchema>;

// ── answer view (dto/TutorAnswerView.java :20-46) ───────────────────────────

export const tutorTopicMatchSchema = z.object({
  // KG topic code, e.g. IALCHEM2018-U1-T1
  code: z.string(),
  title: z.string(),
  // deterministic match specificity 0..1
  matchScore: z.number(),
});
export type TutorTopicMatch = z.infer<typeof tutorTopicMatchSchema>;

export const tutorAnswerViewSchema = z.object({
  // the tutor's answer text ([n] markers reference citations)
  answer: z.string(),
  citations: z.array(tutorCitationSchema),
  topics: z.array(tutorTopicMatchSchema),
  evidenceCount: z.number().int(),
  // model identity (null on deterministic refusal)
  model: z.string().nullable(),
  // provider identity ("deterministic-refusal" when refused)
  provider: z.string(),
  refused: z.boolean(),
  latencyMs: z.number(),
});
export type TutorAnswerView = z.infer<typeof tutorAnswerViewSchema>;

// ── sessions (TutorSessionService views :57-78 + controller :53-55) ─────────

export const tutorSessionCreatedSchema = z.object({
  // CreatedSessionView(sessionId, createdAt) — 201 body
  sessionId: z.string().uuid(),
  createdAt: z.string(),
});
export type TutorSessionCreated = z.infer<typeof tutorSessionCreatedSchema>;

export const tutorTurnViewSchema = z.object({
  seq: z.number().int(),
  role: z.string(),
  content: z.string(),
  evidenceCount: z.number().int(),
  refused: z.boolean(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  latencyMs: z.number().nullable(),
  at: z.string(),
});
export type TutorTurnView = z.infer<typeof tutorTurnViewSchema>;

export const tutorSessionViewSchema = z.object({
  sessionId: z.string().uuid(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  // V53: the course this chat serves (null = course-less history)
  courseRef: z.string().nullable(),
  turns: z.array(tutorTurnViewSchema),
});
export type TutorSessionView = z.infer<typeof tutorSessionViewSchema>;

export const tutorSessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  courseRef: z.string().nullable(),
  turnCount: z.number().int(),
  // derived title = the opening question (s143); null for empty chats
  title: z.string().nullable(),
});
export type TutorSessionSummary = z.infer<typeof tutorSessionSummarySchema>;

// ── stream events (TutorStreamEvent wire shapes) ────────────────────────────
// Wire contract (TutorStreamEvent.java :7-24 + TutorController :60-64):
//   errors BEFORE the stream opens are ordinary JSON error responses; errors
//   AFTER the stream opens travel as the `error` event with the fixed
//   client-safe text; the terminal event is the lean `done` {ok:true} (the
//   §22 persistence summary rides the service layer, NOT the wire).

export const tutorStreamCitationsEventSchema = z.object({
  event: z.literal("citations"),
  citations: z.array(tutorCitationSchema),
  sufficient: z.boolean(),
});

export const tutorStreamMetaEventSchema = z.object({
  event: z.literal("meta"),
  provider: z.string(),
  // null on deterministic refusals
  model: z.string().nullable(),
  refused: z.boolean(),
  evidenceCount: z.number().int(),
});

export const tutorStreamDeltaEventSchema = z.object({
  event: z.literal("delta"),
  text: z.string(),
});

export const tutorStreamDoneEventSchema = z.object({
  event: z.literal("done"),
  ok: z.literal(true),
});

export const tutorStreamErrorEventSchema = z.object({
  event: z.literal("error"),
  // the fixed client-safe message (deep-audit M2 — never provider error text)
  message: z.string(),
});

export const tutorStreamEventSchema = z.discriminatedUnion("event", [
  tutorStreamCitationsEventSchema,
  tutorStreamMetaEventSchema,
  tutorStreamDeltaEventSchema,
  tutorStreamDoneEventSchema,
  tutorStreamErrorEventSchema,
]);
export type TutorStreamEventWire = z.infer<typeof tutorStreamEventSchema>;
