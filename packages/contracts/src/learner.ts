/**
 * Learner-surface contracts — ported from the frozen Java core (T-MIG-038,
 * Step 2 of the operator's CONTRACTS-LANE directive trace 1a10cb48dc7edd15).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/learner/LearnerStateController.java
 *       (GET /api/v1/learners/me/state, /knowledge-graph; SkillStateView
 *        build :114-117; bandOf :184; ReviewView reason = .name())
 *   src/main/java/com/syllabai/learner/dto/*.java
 *       (LearnerStateView, SkillStateView, MisconceptionStateView,
 *        LearnerKnowledgeGraphView, AgendaView, CourseStatsView,
 *        FlashcardRatingView, FlashcardRatingTrailView,
 *        FlashcardReviewScheduleView, NoteVoteView, SmartLessonView)
 *   src/main/java/com/syllabai/learner/FlashcardRatingController.java
 *       (POST /api/v1/learners/me/flashcard-ratings — FlashcardRatingRequest
 *        :109-115; verbatim 400s)
 *   src/main/java/com/syllabai/learner/NoteVoteController.java
 *       (POST /api/v1/learners/me/note-votes — NoteVoteRequest :92-97)
 *   src/main/java/com/syllabai/learner/FlashcardRatingTrailController.java
 *       (GET /flashcard-rating-trail — limit default 200 / cap 500 CLAMPED,
 *        <1 → 400; opaque keyset cursor FAIL-CLOSED → 400)
 *   src/main/java/com/syllabai/learner/TrailCursor.java
 *       (base64url(unpadded) JSON {t: ISO instant, i: uuid} — encoding
 *        contract pinned by TrailCursorTest)
 *   src/main/java/com/syllabai/learner/FlashcardRating.java (:43-52 Rating
 *        wire vocabulary + tolerant parse), NoteVote.java (:154-170)
 *   src/main/java/com/syllabai/learner/exam/CourseExamTargetView.java
 *       (T-C79/ADR-031: countdown derived at READ, never stored)
 *   src/main/java/com/syllabai/recommendation/dto/NextBestActionsView.java
 *       + NextBestActionService.java:79 (policy "nba-rules/v1.3")
 *   src/main/java/com/syllabai/assignment/dto/AssignmentViews.java
 *       (LearnerAssignmentView :72-73, AssignmentView :17-36,
 *        AssignmentSubmissionView :62-70; Status wire :47-64)
 *   src/main/java/com/syllabai/learner/ReviewSchedule.java:22 (Reason enum)
 *   src/main/java/com/syllabai/knowledge/NodeType.java (six-value domain)
 *   src/main/java/com/syllabai/learner/decay/DecayParams.java :55-68
 *       (bandOf → LOW | DEVELOPING | SECURE)
 *
 * EMBEDDED-VIEW DISCLOSURE (T-MIG-018 precedent — the wire shape owns the
 * recursion): AgendaView embeds NextBestActionsView (recommendation) and
 * LearnerAssignmentView (assignment) — ported HERE because the agenda's
 * wire contract is incomplete without them. If R0 prefers them in
 * domain-owned files later, the schemas move verbatim (same fence).
 * MasteryUpdatedEvent / attempt-flow events are NOT here (attempt-port
 * territory, T-MIG-030 lineage); only the decay job's own I/O lives in
 * decay.ts.
 *
 * HONESTY LAW (every learner read model, ADR-031/032 lineage): unpractised
 * nodes carry null proficiency — never zeros, never fabricated bands; the
 * stored mastery is the post-practice BKT anchor P₀ and every surface
 * re-decays on read (the decayed value is never persisted).
 *
 * WIRE VOCABULARIES: ratings "still-learning"/"know" (tolerant POST parse:
 * trim→lowercase→'_'→'-', {"still-learning","stilllearning"}|{"know"});
 * votes "helpful"/"not-helpful" (tolerant parse {"helpful","up"}|
 * {"not-helpful","nothelpful","down"}); assignment status "open"/"closed".
 * Unknown vocabulary → 400 with the verbatim controller messages.
 *
 * NO golden captures exist for these surfaces — acceptance baseline is the
 * Java declaration, pinned in learner.test.ts.
 */
import { z } from "zod";
import { javaInstantSchema } from "./assessment";
import { knowledgeNodeTypeSchema } from "./curriculum";

// ── wire vocabularies ───────────────────────────────────────────────────────

/** FlashcardRating.Rating wire form (:43-52) — served lowercase-hyphenated. */
export const flashcardRatingWireSchema = z.enum(["still-learning", "know"]);
export type FlashcardRatingWire = z.infer<typeof flashcardRatingWireSchema>;

/** NoteVote.Vote wire form (:154-170, wire()). */
export const noteVoteWireSchema = z.enum(["helpful", "not-helpful"]);
export type NoteVoteWire = z.infer<typeof noteVoteWireSchema>;

/** ReviewSchedule.Reason (:22) — serialized via .name() (LearnerStateController). */
export const reviewReasonSchema = z.enum(["DECAY_CROSSED_THRESHOLD", "TEACHER_ASSIGNED"]);

/** Assignment.Status wire form (:47-64). */
export const assignmentStatusWireSchema = z.enum(["open", "closed"]);

/** DecayParams.bandOf (:58-68) — derived at read, closed three-value domain. */
export const masteryBandSchema = z.enum(["LOW", "DEVELOPING", "SECURE"]);

// ── request bodies ──────────────────────────────────────────────────────────

/**
 * FlashcardRatingRequest (:109-115): cardId @NotBlank @Size(3,64)
 * @Pattern("^[A-Za-z0-9_-]+$") (message "card id must be the hub content
 * id"); rating @NotBlank (wire-parsed at the controller — unknown → 400
 * "rating must be \"still-learning\" or \"know\": <raw>"); subtopicCode
 * @NotBlank @Size(2,64) @Pattern("^[A-Za-z0-9-]+$"). Unknown subtopic /
 * non-structure anchor → 404 (NotFound, not validation).
 */
export const flashcardRatingRequestSchema = z.object({
  cardId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "card id must be the hub content id"),
  rating: z.string().min(1),
  subtopicCode: z.string().min(2).max(64).regex(/^[A-Za-z0-9-]+$/),
});
export type FlashcardRatingRequest = z.infer<typeof flashcardRatingRequestSchema>;

/** NoteVoteRequest (:92-97) — same shape, noteId, vote vocabulary different. */
export const noteVoteRequestSchema = z.object({
  noteId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "note id must be the hub content id"),
  vote: z.string().min(1),
  subtopicCode: z.string().min(2).max(64).regex(/^[A-Za-z0-9-]+$/),
});
export type NoteVoteRequest = z.infer<typeof noteVoteRequestSchema>;

/**
 * Trail params (:88-106): limit null → 200; < 1 → 400 "limit must be
 * >= 1: <n>"; above 500 CLAMPED (a client bug, not a learner-owned error);
 * cursor optional opaque string — FAIL-CLOSED decode (bad base64/wrong
 * JSON/unparseable instant or uuid → 400; TrailCursor encoding contract).
 */
export const TRAIL_DEFAULT_LIMIT = 200;
export const TRAIL_MAX_LIMIT = 500;
export const flashcardTrailParamsSchema = z.object({
  limit: z.number().int().optional(),
  cursor: z.string().optional(),
});

/** GET /knowledge-graph + /smart-lesson + /agenda params. */
export const knowledgeGraphParamsSchema = z.object({ rootId: z.string().uuid() });
export const smartLessonParamsSchema = z.object({
  rootId: z.string().uuid(),
  topicNodeId: z.string().uuid(),
});
export const agendaParamsSchema = z.object({ rootId: z.string().uuid().optional() });

// ── event-slice views (the evidence read models) ────────────────────────────

/**
 * FlashcardRatingView (:14-19) / trail Event — subtopicCode null on the
 * learner-state slice and on absent anchor rows (degrades display, never
 * attribution — the row was fail-closed validated at write time).
 */
export const flashcardRatingViewSchema = z.object({
  cardId: z.string(),
  rating: flashcardRatingWireSchema,
  subtopicCode: z.string().nullable(),
  nodeId: z.string().uuid(),
  occurredAt: javaInstantSchema,
});
export type FlashcardRatingView = z.infer<typeof flashcardRatingViewSchema>;

/** NoteVoteView (:15-21) — same posture as the rating view. */
export const noteVoteViewSchema = z.object({
  noteId: z.string(),
  vote: noteVoteWireSchema,
  subtopicCode: z.string().nullable(),
  nodeId: z.string().uuid(),
  occurredAt: javaInstantSchema,
});
export type NoteVoteView = z.infer<typeof noteVoteViewSchema>;

/**
 * TutorEngagementView (LearnerStateView :104-107) — structured signal only:
 * the deterministic matcher's topic, ask count, last ask; chat text stays
 * in the research log. signalCounts Map<String,Long>.
 */
export const tutorEngagementViewSchema = z.object({
  nodeId: z.string().uuid(),
  nodeTitle: z.string().nullable(),
  asks: z.number().int(),
  lastAskedAt: javaInstantSchema.nullable(),
  refusedAny: z.boolean(),
  signalCounts: z.record(z.string(), z.number().int()),
});
export type TutorEngagementView = z.infer<typeof tutorEngagementViewSchema>;

// ── state / knowledge-graph / agenda composites ─────────────────────────────

/**
 * SkillStateView (:15-19) — mastery is the post-practice BKT anchor P₀,
 * effectiveMastery the re-decayed read; proceduralFluencyGap null until
 * answered under BOTH conditions (F-162); nodeName null when the node row
 * is absent (clients keep their id-based fallback); band derived at read
 * (LOW | DEVELOPING | SECURE).
 */
export const skillStateViewSchema = z.object({
  nodeId: z.string().uuid(),
  mastery: z.number(),
  effectiveMastery: z.number(),
  band: masteryBandSchema,
  attempts: z.number().int(),
  correctCount: z.number().int(),
  lastPracticedAt: javaInstantSchema,
  proceduralFluencyGap: z.number().nullable(),
  nodeName: z.string().nullable(),
});
export type SkillStateView = z.infer<typeof skillStateViewSchema>;

/**
 * MisconceptionStateView (:8-12) — probability is the MED-2/ADR-032
 * staleness-relaxed value (JSON shape unchanged since V-pre-MED-2);
 * effectiveProbability = prior + (P_e − prior)·e^(−age/τ_s).
 */
export const misconceptionStateViewSchema = z.object({
  misconceptionNodeId: z.string().uuid(),
  probability: z.number(),
  active: z.boolean(),
  evidenceCount: z.number().int(),
  lastEvidenceAt: javaInstantSchema,
  misconceptionName: z.string().nullable(),
});
export type MisconceptionStateView = z.infer<typeof misconceptionStateViewSchema>;

/** LearnerStateView.ReviewView (:33) — reason serializes .name(). */
export const reviewViewSchema = z.object({
  nodeId: z.string().uuid(),
  dueAt: javaInstantSchema,
  reason: reviewReasonSchema,
  nodeName: z.string().nullable(),
});
export type ReviewView = z.infer<typeof reviewViewSchema>;

/**
 * CourseExamTargetView (exam/CourseExamTargetView.java :25-38) — countdown
 * derived at READ on the server clock (T-C79/ADR-031: derived is
 * recomputed, never stored); negative daysToWindowStart = window open;
 * estimated rows MUST render with "≈" (never as fact). LocalDate fields
 * serialize ISO local dates (java.time.LocalDate.toString — plain string
 * per the javaInstantSchema posture; golden pins exact forms).
 *
 * entryDeadline/resultsDate are NULLABLE on the wire: the record declares
 * plain LocalDate (:27-28, Jackson renders JSON null) and the V62
 * exam_series_calendar columns are `entry_deadline DATE` / `results_date
 * DATE` — both commented "nullable: not always announced" (V62 :21-22),
 * while window_start/window_end are NOT NULL and stay z.string(). The
 * frozen ExamSeriesImportService null-checks both (:112/:116), so null is
 * a modeled state, not a corner. Widened per the two-lane F2 register
 * item (T-MIG-043/run-003-collision-audit.json finding F2: r1 audit +
 * w0a's 043 FIDELITY NOTE; the W4 capture never exercised a null-deadline
 * series). entryDeadlinePassed already encodes the null law: null
 * deadline can never be "passed".
 */
export const courseExamTargetViewSchema = z.object({
  courseSlug: z.string(),
  seriesId: z.string().uuid(),
  seriesCode: z.string(),
  label: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  entryDeadline: z.string().nullable(),
  resultsDate: z.string().nullable(),
  estimated: z.boolean(),
  daysToWindowStart: z.number().int(),
  daysToWindowEnd: z.number().int(),
  entryDeadlinePassed: z.boolean(),
});
export type CourseExamTargetView = z.infer<typeof courseExamTargetViewSchema>;

/**
 * LearnerStateView (:11-21) — the V18 read model; every slice defaults to
 * an empty list (compact constructor null-coalesces :13-20), so all seven
 * arrays serialize on every response (never absent, empty at worst).
 */
export const learnerStateViewSchema = z.object({
  learnerId: z.string().uuid(),
  skillStates: z.array(skillStateViewSchema),
  misconceptionStates: z.array(misconceptionStateViewSchema),
  pendingReviews: z.array(reviewViewSchema),
  tutorEngagements: z.array(tutorEngagementViewSchema),
  flashcardRatings: z.array(flashcardRatingViewSchema),
  noteVotes: z.array(noteVoteViewSchema),
  examTargets: z.array(courseExamTargetViewSchema),
});
export type LearnerStateView = z.infer<typeof learnerStateViewSchema>;

/**
 * AssignmentView (AssignmentViews :17-36) — status serializes Status.wire()
 * ("open"/"closed"); classId null = the whole enabled cohort (V49 default).
 */
export const assignmentViewSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  courseSlug: z.string(),
  courseLabel: z.string(),
  specRefs: z.array(z.string()),
  marksTotal: z.number().int(),
  questionCount: z.number().int(),
  dueAt: javaInstantSchema,
  status: assignmentStatusWireSchema,
  classId: z.string().uuid().nullable(),
  createdAt: javaInstantSchema,
});
export type AssignmentView = z.infer<typeof assignmentViewSchema>;

/** AssignmentSubmissionView (:62-70) — mySubmission null until they submit. */
export const assignmentSubmissionViewSchema = z.object({
  questionsCompleted: z.number().int(),
  score: z.number().int().nullable(),
  submittedAt: javaInstantSchema,
});
export type AssignmentSubmissionView = z.infer<typeof assignmentSubmissionViewSchema>;

/** LearnerAssignmentView (:72-73). */
export const learnerAssignmentViewSchema = z.object({
  assignment: assignmentViewSchema,
  mySubmission: assignmentSubmissionViewSchema.nullable(),
});
export type LearnerAssignmentView = z.infer<typeof learnerAssignmentViewSchema>;

/**
 * NextBestActionsView (recommendation/dto :14-22 + service :79 policy) —
 * advice, not facts: no reason is a causal claim. questionId non-null only
 * for RETRY_PROBLEM_QUESTION; servableQuestionCount 0 = the UI's honest
 * no-validated-questions state.
 */
export const NBA_POLICY = "nba-rules/v1.3";

export const nextBestActionViewSchema = z.object({
  rank: z.number().int(),
  actionType: z.enum([
    "REVIEW_TOPIC",
    "PRACTISE_QUESTIONS",
    "REVIEW_PREREQUISITE",
    "RETRY_PROBLEM_QUESTION",
    "ASK_TUTOR",
    "TIMED_EXERCISE",
    "REMEDIATE_MISCONCEPTION",
  ]),
  reasonCode: z.enum([
    "DUE_REVIEW",
    "PREREQUISITE_WEAK",
    "VALIDATED_PREREQUISITE_CHAIN",
    "PROBLEM_QUESTION",
    "MISCONCEPTION_SUSPECTED",
    "MISCONCEPTION_REMEDIATION",
    "FLUENCY_GAP",
    "LOW_MASTERY",
    "TUTOR_ENGAGED",
    "UNCOVERED_TOPIC",
  ]),
  targetNodeId: z.string().uuid(),
  targetCode: z.string(),
  targetTitle: z.string(),
  questionId: z.string().uuid().nullable(),
  servableQuestionCount: z.number().int(),
  reasonDetail: z.string(),
});
export type NextBestActionView = z.infer<typeof nextBestActionViewSchema>;

export const nextBestActionsViewSchema = z.object({
  learnerId: z.string().uuid(),
  rootId: z.string().uuid(),
  asOf: javaInstantSchema,
  policy: z.literal(NBA_POLICY),
  actions: z.array(nextBestActionViewSchema),
});
export type NextBestActionsView = z.infer<typeof nextBestActionsViewSchema>;

/**
 * AgendaView (dto/AgendaView :46-56) — the one "what is on my plate?" call
 * (T-C76): dueReviews PENDING rows due-soonest-first; assignments the same
 * rows GET .../assignments serves (50-row bound, due-soonest-first); actions
 * NULL when no rootId was supplied (the caller decides whether it needs
 * recommendations — a failed NBA call is a real error, never dropped
 * advice); examTargets an honest empty list when no series is declared.
 */
export const agendaViewSchema = z.object({
  learnerId: z.string().uuid(),
  asOf: javaInstantSchema,
  dueReviews: z.array(reviewViewSchema),
  assignments: z.array(learnerAssignmentViewSchema),
  actions: nextBestActionsViewSchema.nullable(),
  examTargets: z.array(courseExamTargetViewSchema),
});
export type AgendaView = z.infer<typeof agendaViewSchema>;

/**
 * CourseStatsView (dto :43-50) — distinct-coverage semantics: attempts
 * counts EVERY row (practice volume is real activity), the other three
 * count DISTINCT entities; coverage is exposure, never competence.
 */
export const courseStatsViewSchema = z.object({
  learnerId: z.string().uuid(),
  attempts: z.number().int(),
  distinctQuestions: z.number().int(),
  notesViewed: z.number().int(),
  flashcardsRated: z.number().int(),
});
export type CourseStatsView = z.infer<typeof courseStatsViewSchema>;

// ── knowledge graph ─────────────────────────────────────────────────────────

/**
 * NodeWithStateView (LearnerKnowledgeGraphView :40-57) — 18 components.
 * Unpractised nodes: mastery/effectiveMastery/band/attempts/correctCount/
 * lastPracticedAt/proceduralFluencyGap all null — never zeros, never a
 * fabricated band. Misconception annotations only on MISCONCEPTION nodes.
 * applicability passed through VERBATIM (T-C28), null on non-spec-point
 * nodes. description column has no nullable=false → nullable.
 */
export const nodeWithStateViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: knowledgeNodeTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  childIds: z.array(z.string().uuid()),
  mastery: z.number().nullable(),
  effectiveMastery: z.number().nullable(),
  band: masteryBandSchema.nullable(),
  attempts: z.number().int().nullable(),
  correctCount: z.number().int().nullable(),
  lastPracticedAt: javaInstantSchema.nullable(),
  proceduralFluencyGap: z.number().nullable(),
  reviewDueAt: javaInstantSchema.nullable(),
  reviewReason: reviewReasonSchema.nullable(),
  misconceptionProbability: z.number().nullable(),
  misconceptionActive: z.boolean().nullable(),
  applicability: z.record(z.string(), z.unknown()).nullable(),
});
export type NodeWithStateView = z.infer<typeof nodeWithStateViewSchema>;

/** PrerequisiteEdgeView (:60-62) — prerequisiteId → nodeId (which requires it). */
export const prerequisiteEdgeViewSchema = z.object({
  prerequisiteId: z.string().uuid(),
  prerequisiteCode: z.string(),
  nodeId: z.string().uuid(),
  nodeCode: z.string(),
});
export type PrerequisiteEdgeView = z.infer<typeof prerequisiteEdgeViewSchema>;

/**
 * LearnerKnowledgeGraphView (:12-22) — depth-first flat nodes, children
 * before siblings; asOf pins the evaluation instant (effective mastery
 * decays with time); reviewDueAt is the EARLIEST pending review only.
 */
export const learnerKnowledgeGraphViewSchema = z.object({
  learnerId: z.string().uuid(),
  rootId: z.string().uuid(),
  rootCode: z.string(),
  rootTitle: z.string(),
  asOf: javaInstantSchema,
  nodes: z.array(nodeWithStateViewSchema),
  prerequisiteEdges: z.array(prerequisiteEdgeViewSchema),
});
export type LearnerKnowledgeGraphView = z.infer<typeof learnerKnowledgeGraphViewSchema>;

// ── flashcard schedule + trail ──────────────────────────────────────────────

/**
 * FlashcardReviewScheduleView (:24-29 + nested records) — the Ebbinghaus
 * queue derived at READ from the append-only trail (persisted nowhere; the
 * review_schedules table stays the marked-attempt spec-point queue). cards
 * ordered dueAt then cardId; summary.nextDueAt null when nothing scheduled.
 * TIMING ONLY: a due card never implies mastery.
 */
export const cardScheduleViewSchema = z.object({
  cardId: z.string(),
  subtopicCode: z.string().nullable(),
  nodeId: z.string().uuid(),
  rating: flashcardRatingWireSchema,
  streak: z.number().int(),
  lastRatedAt: javaInstantSchema,
  dueAt: javaInstantSchema,
  due: z.boolean(),
  intervalDays: z.number().int(),
});
export type CardScheduleView = z.infer<typeof cardScheduleViewSchema>;

export const flashcardReviewScheduleViewSchema = z.object({
  learnerId: z.string().uuid(),
  generatedAt: javaInstantSchema,
  summary: z.object({
    due: z.number().int(),
    scheduled: z.number().int(),
    nextDueAt: javaInstantSchema.nullable(),
  }),
  cards: z.array(cardScheduleViewSchema),
});
export type FlashcardReviewScheduleView = z.infer<typeof flashcardReviewScheduleViewSchema>;

/**
 * FlashcardRatingTrailView (:24-33) — bounded keyset page of raw V47
 * events, newest first in (occurred_at DESC, id DESC) order; nextCursor
 * null at the end of the trail (set together with hasMore); generatedAt
 * computed at read, never persisted. TRUE-MERGE contract: concatenating
 * pages behind the cursor is gap-free and duplicate-free incl. ties.
 */
export const flashcardRatingTrailViewSchema = z.object({
  events: z.array(flashcardRatingViewSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  generatedAt: javaInstantSchema,
});
export type FlashcardRatingTrailView = z.infer<typeof flashcardRatingTrailViewSchema>;

// ── smart lesson ────────────────────────────────────────────────────────────

/**
 * SmartLessonView (dto/SmartLessonView.java) — ONE explainable next action
 * per topic, derived deterministically from the SAME evidence the NBA engine
 * consumes. policy is the v2 wire literal (:40). Every recommendation is
 * traceable: evidence = the exact facts used, topicStatus = the honest
 * diagnosis snapshot, action.reasonDetail human-readable.
 */
export const SMART_LESSON_POLICY = "smart-lesson/v2";

export const lessonActionViewSchema = z.object({
  actionType: z.enum([
    "REMEDIATE_PREREQUISITE",
    "STUDY_CORRECTIVE",
    "ASK_TUTOR",
    "REVIEW_TOPIC",
    "TIMED_PRACTICE",
    "PRACTISE_QUESTIONS",
    "ADVANCE_TOPIC",
  ]),
  reasonCode: z.enum([
    "PREREQUISITE_WEAK",
    "MISCONCEPTION_REMEDIATION",
    "MISCONCEPTION_SUSPECTED",
    "DUE_REVIEW",
    "FLUENCY_GAP",
    "LOW_MASTERY",
    "TUTOR_ENGAGED",
    "INSUFFICIENT_COVERAGE",
    "TOPIC_MASTERED",
  ]),
  targetNodeId: z.string().uuid(),
  targetCode: z.string(),
  targetTitle: z.string(),
  questionId: z.string().uuid().nullable(),
  servableQuestionCount: z.number().int(),
  reasonDetail: z.string(),
});
export type LessonActionView = z.infer<typeof lessonActionViewSchema>;

/** TopicStatusView (:96-106) — measured facts only; mastery null when unmeasured. */
export const topicStatusViewSchema = z.object({
  coverage: z.enum(["UNMEASURED", "PARTIAL", "ESTABLISHED"]),
  attempts: z.number().int(),
  mastery: z.number().nullable(),
  effectiveMastery: z.number().nullable(),
  reviewDue: z.boolean(),
  strongestMisconceptionProbability: z.number().nullable(),
  fluencyGap: z.number().nullable(),
  tutorAsks: z.number().int(),
  servableQuestions: z.number().int(),
});
export type TopicStatusView = z.infer<typeof topicStatusViewSchema>;

/** EvidenceFactView (:110) — deterministic, no inference. */
export const evidenceFactViewSchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** PrerequisiteStatusView (:116-121) — null mastery = not yet measured. */
export const prerequisiteStatusViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  effectiveMastery: z.number().nullable(),
  attempts: z.number().int().nullable(),
  measuredWeak: z.boolean(),
});
export type PrerequisiteStatusView = z.infer<typeof prerequisiteStatusViewSchema>;

/** MisconceptionStatusView (:127-132) — BDT overlay + optional corrective. */
export const misconceptionStatusViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  probability: z.number().nullable(),
  active: z.boolean(),
  remediationNodeCode: z.string().nullable(),
});
export type MisconceptionStatusView = z.infer<typeof misconceptionStatusViewSchema>;

export const smartLessonViewSchema = z.object({
  learnerId: z.string().uuid(),
  rootId: z.string().uuid(),
  topicNodeId: z.string().uuid(),
  topicCode: z.string(),
  topicTitle: z.string(),
  asOf: javaInstantSchema,
  policy: z.literal(SMART_LESSON_POLICY),
  action: lessonActionViewSchema,
  topicStatus: topicStatusViewSchema,
  prerequisites: z.array(prerequisiteStatusViewSchema),
  misconceptions: z.array(misconceptionStatusViewSchema),
  evidence: z.array(evidenceFactViewSchema),
});
export type SmartLessonView = z.infer<typeof smartLessonViewSchema>;
