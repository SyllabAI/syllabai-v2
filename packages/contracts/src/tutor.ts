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
 *
 * T-MIG-070 AMENDMENT (the #104 blocker band — the #93/#96 classroom
 * precedent): question + HistoryTurn.text carry the frozen @NotBlank
 * (TutorController.java:123-141), which jakarta evaluates on the TRIMMED
 * length — a whitespace-only bind is a constraint violation (400
 * validation_failed "field: must not be blank"), not a pass. The former
 * z.string().min(1) is @Size(min=1) semantics (raw length), NOT @NotBlank:
 * it admitted " " and the ask path served the WRONG envelope (bad_request)
 * while a blank history turn was silently dropped downstream (200 with the
 * turn gone). The notBlank refine (auth.ts) is the @NotBlank-exact port;
 * max FIRST / refine LAST — zod skips refinements when an earlier check
 * fails, so the accept/reject set matches jakarta's evaluate-all.
 */
import { z } from "zod";
import { notBlank } from "./auth";

// ── request (TutorAskRequest :123-141) ──────────────────────────────────────

export const tutorHistoryTurnSchema = z.object({
  // @NotBlank @Pattern("user"|"assistant") — ConversationTurn.ROLE_* constants
  role: z.enum(["user", "assistant"]),
  // @NotBlank @Size(max = ConversationTurn.MAX_TURN_CHARS = 2000)
  // (T-MIG-070: the notBlank refine IS the @NotBlank — max FIRST / refine LAST)
  text: z.string().max(2000).refine(notBlank("must not be blank"), "must not be blank"),
});
export type TutorHistoryTurn = z.infer<typeof tutorHistoryTurnSchema>;

export const tutorAskRequestSchema = z.object({
  // @NotBlank @Size(max = 2000)
  // (T-MIG-070: the notBlank refine IS the @NotBlank — max FIRST / refine LAST)
  question: z.string().max(2000).refine(notBlank("must not be blank"), "must not be blank"),
  // @Size(max = ConversationTurn.MAX_HISTORY_TURNS = 12); optional pre-s139
  history: z.array(tutorHistoryTurnSchema).max(12).optional(),
  // §22 session anchor (s140); optional pre-s140
  sessionId: z.string().uuid().optional(),
  // V53 (ADR-030) opaque hub course reference; @Size(max = 64)
  courseRef: z.string().max(64).optional(),
  // Run-013 session paper pin: the bank band-2 card the learner is working
  // from (the hub forwards the LAST served paper card's paperId of the
  // thread). Advisory UI state, never a learner-typed identity: the pin
  // anchors retrieval only when the ask itself names NO complete paper
  // identity, and only VALIDATED in-scope papers pin. Absent = the
  // unpinned ask (behavior unchanged).
  paperId: z.string().uuid().optional(),
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
  // Run-013 honest truncation disclosure: true when the generation ended on
  // a token-cap finish (the isTruncationFinish law: "length" | "max_tokens").
  // Deterministic refusals are always false. The text itself is delivered
  // verbatim — the flag is presentation truth, never surgery.
  truncated: z.boolean(),
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
  // Run-013: the honest truncation flag rides the TERMINAL event (it is not
  // knowable when meta commits with the first delta). Absent on older
  // upstreams — the hub reads data.truncated === true only.
  truncated: z.boolean().optional(),
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

// ── T-MIG-128/129: the tutor bank bands (post-core v2-native surfaces) ──────
// Two DETERMINISTIC read bands the operator ordered (trace 1a14080256278b41):
//   (1) question listing — "give me all questions related to 'organic
//       chemistry' / a spec point" → a deterministic bank census (FETCH
//       semantics: active-policy AGNOSTIC over paper-anchored rows, the
//       V20 REJECTED/FLAGGED paper gate, T-C07 scope fail-closed). This is
//       a LISTING surface, not the attempt-servable spec (ServableQuestions
//       keeps that law untouched).
//   (2) whole-paper fetch — "give me the full 2019 june paper 1" → ONE view
//       carrying the resolved paper, its structured bank questions with
//       marks, and the paired QP + MS chunks (top-version law, REJECTED
//       documents excluded, chunk order = chunk_index).
// Zero LLM, zero vector calls: metadata + bank rows only (the §7 FETCH
// posture the paper-question resolver already proven on the live wire).

export const tutorBankQuestionsParamsSchema = z
  .object({
    /** T-MIG-135c: the per-course scope axis (V53/ADR-030) — an exact
     * ACTIVE curriculum_versions.code. Present → resolveForCourse
     * (fail-closed); absent → resolveActive (the single-owner forcing
     * function, which refuses once a second curriculum owns surface). The
     * hub relay forwards the chat's courseRef; chemistry behavior without
     * it is byte-identical. */
    courseRef: z.string().trim().min(1).max(64).optional(),
    /** Topic name — exact (case-insensitive) then unique-substring match on
     * knowledge_nodes.title within the active scope; the matched node's
     * PART_OF subtree joins the mapping set (a UNIT resolves to its TOPIC
     * children). */
    topic: z.string().trim().min(1).max(200).optional(),
    /** Spec-point code — exact (case-insensitive) then suffix match after
     * the last '-' ("2.44" resolves "4CH1-2.44"). */
    spec: z.string().trim().min(1).max(40).optional(),
    /** Direct node pin — deterministic bypass of name resolution. */
    nodeId: z.string().uuid().optional(),
    paperCode: z.string().trim().min(1).max(30).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    series: z.enum(["JAN", "JUN", "NOV"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .refine((p) => p.topic != null || p.spec != null || p.nodeId != null, {
    message: "one of topic | spec | nodeId is required",
  });
export type TutorBankQuestionsParams = z.infer<typeof tutorBankQuestionsParamsSchema>;

export const tutorBankResolvedNodeSchema = z.object({
  id: z.string().uuid(),
  nodeType: z.string(),
  title: z.string(),
  code: z.string().nullable(),
});
export type TutorBankResolvedNode = z.infer<typeof tutorBankResolvedNodeSchema>;

export const tutorBankPaperRefSchema = z.object({
  paperId: z.string().uuid(),
  title: z.string().nullable(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  series: z.string().nullable(),
  year: z.number().int().nullable(),
  validationState: z.string(),
});
export type TutorBankPaperRef = z.infer<typeof tutorBankPaperRefSchema>;

/**
 * A question's figure reference — lane #3 of the run-004 diagnosis (trace
 * 1a14536e97f41425): the OCR parser's own figure attribution (the GLM draft's
 * per-question figureRefs) resolved to the canonical figure element's
 * digitized page. A REFERENCE, never a promise of bytes: the crop binaries
 * are not stored in the corpus of record, so the surface deep-links the F-022
 * reader at the figure's page instead of fabricating an <img> src.
 */
export const tutorQuestionFigureSchema = z.object({
  /** the QP document row (documents.id) the figure lives on — the F-022
   *  reader subject; null = the doc row is unresolvable (no link, honest). */
  documentRowId: z.string().uuid().nullable(),
  /** the digitized page the figure sits on (canonical figure page_number). */
  page: z.number().int().nullable(),
  /** the parser's crop asset name (e.g. "assets/crop_4_….png") — reference
   *  metadata, not a fetchable URL of record. */
  sourceName: z.string().nullable(),
  format: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** the parser's own availability claim at parse time
   *  ("available" | "unavailable-signed-url" | null) — provenance, not
   *  current truth (the bytes of record are not stored). */
  availability: z.string().nullable(),
});
export type TutorQuestionFigure = z.infer<typeof tutorQuestionFigureSchema>;

export const tutorBankQuestionItemSchema = z.object({
  questionId: z.string().uuid(),
  externalRef: z.string().nullable(),
  questionType: z.string().nullable(),
  stem: z.string(),
  marks: z.number().int(),
  commandWord: z.string().nullable(),
  specPointCodes: z.array(z.string()),
  paper: tutorBankPaperRefSchema.nullable(),
  /** The question's figure references in the parser's own reading order
   *  (question-level refs first, then part-level), deduped by element.
   *  Default [] = the honest empty (no figure data of record). */
  figures: z.array(tutorQuestionFigureSchema).default([]),
});
export type TutorBankQuestionItem = z.infer<typeof tutorBankQuestionItemSchema>;

export const tutorBankQuestionsViewSchema = z.object({
  resolvedNodes: z.array(tutorBankResolvedNodeSchema),
  /** Honest census BEFORE the limit cut. */
  total: z.number().int(),
  items: z.array(tutorBankQuestionItemSchema),
});
export type TutorBankQuestionsView = z.infer<typeof tutorBankQuestionsViewSchema>;

export const tutorBankPaperChunkSchema = z.object({
  chunkIndex: z.number().int(),
  documentRowId: z.string().uuid(),
  documentId: z.string(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  content: z.string(),
  atomNumber: z.string().nullable(),
});
export type TutorBankPaperChunk = z.infer<typeof tutorBankPaperChunkSchema>;

export const tutorBankPaperDocumentViewSchema = z.object({
  documentId: z.string().nullable(),
  chunkCount: z.number().int(),
  chunks: z.array(tutorBankPaperChunkSchema),
});
export type TutorBankPaperDocumentView = z.infer<typeof tutorBankPaperDocumentViewSchema>;

export const tutorBankPaperFullViewSchema = z.object({
  paper: tutorBankPaperRefSchema,
  /** The structured bank rows of the bound paper, external_ref order, marks
   * included — active-policy AGNOSTIC (the gold-v1 FETCH law). */
  questions: z.array(tutorBankQuestionItemSchema),
  questionPaper: tutorBankPaperDocumentViewSchema,
  markScheme: tutorBankPaperDocumentViewSchema,
  /** Same-session VALIDATED candidates NOT bound (the first-unit-match
   * tiebreak discloses, never hides). */
  siblings: z.array(tutorBankPaperRefSchema),
});
export type TutorBankPaperFullView = z.infer<typeof tutorBankPaperFullViewSchema>;
