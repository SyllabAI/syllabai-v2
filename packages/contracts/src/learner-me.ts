/**
 * Learner-me standalone wire — the schemas the #60 learner bundle
 * (packages/contracts/src/learner.ts) deliberately does not carry: that
 * bundle owns the AGENDA-EMBEDDED views (AgendaView and its nested
 * LearnerAssignmentView / NextBestActionsView / CourseExamTargetView
 * components, ported because the agenda's wire contract is incomplete
 * without them — T-MIG-018 embedded-view precedent). This file ports the
 * STANDALONE surfaces those embedded views hang beside:
 *
 *   - ExamSeriesView + params + SetTargetRequest
 *       (syllabai-core @ 6cad6ef, frozen:
 *        src/main/java/com/syllabai/learner/exam/ExamSeriesView.java —
 *        the T-C79 picker wire: id, board, qualification, seriesCode,
 *        label, windowStart, windowEnd, entryDeadline, resultsDate,
 *        estimated, sourceUrl, retrievedAt. NO published flag on the wire —
 *        unpublished rows never leave the server. The board constant is
 *        ExamSeriesView.BOARD_PEARSON_EDEXCEL = "PEARSON_EDEXCEL";
 *        LearnerExamSeriesController.java :62-69 — qualification filter is
 *        a plain string param, blank treated as absent;
 *        LearnerExamSeriesController.SetTargetRequest :107-109 —
 *        @NotNull UUID seriesId. LocalDate fields serialize ISO local
 *        dates (plain string, javaInstantSchema posture — the
 *        courseExamTargetViewSchema comment in learner.ts pins this form).
 *   - AssignmentSubmissionRequest
 *       (LearnerAssignmentController.SubmissionRequest :111-113 —
 *        @NotNull @Min(0) Integer questionsCompleted; @Min(0) @Max(1000)
 *        Integer score — nullable self-marked score, null = handed in
 *        unmarked).
 *
 * Contracts-first rule 1: constraints copied EXACTLY; the Java record wins.
 * OWNED BY T-MIG-043 (w0a) — id ratification requested at PR review.
 */
import { z } from "zod";

/** ExamSeriesView.BOARD_PEARSON_EDEXCEL (:26) — the founding imported board. */
export const EXAM_SERIES_BOARD_PEARSON_EDEXCEL = "PEARSON_EDEXCEL";

/**
 * The second imported board key (operator trace 1a1589078364b76d "CIE lanes
 * to also carry an exam-series calendar"): Cambridge International calendar
 * rows file under this DB key — same upper-snake grammar as the founding
 * PEARSON_EDEXCEL key (which itself renders as the display value "Edexcel"
 * on the hub's surfaces). The registry's board display value is "Cambridge
 * International" (lib/board boardOf); the two vocabularies are joined by
 * this constant + the hub's qualForLevel(level, board) mapping. The wire
 * shape is unchanged — board has always been a free string on the view.
 */
export const EXAM_SERIES_BOARD_CIE = "CAMBRIDGE_INTERNATIONAL";

/** LocalDate wire — plain ISO local date string (see learner.ts posture). */
export const javaLocalDateSchema = z.string();

/**
 * ExamSeriesView (:14-27) — the picker row. entryDeadline/resultsDate are
 * nullable LocalDate columns (V63); everything else NOT NULL.
 */
export const examSeriesViewSchema = z.object({
  id: z.string().uuid(),
  board: z.string(),
  qualification: z.string(),
  seriesCode: z.string(),
  label: z.string(),
  windowStart: javaLocalDateSchema,
  windowEnd: javaLocalDateSchema,
  entryDeadline: javaLocalDateSchema.nullable(),
  resultsDate: javaLocalDateSchema.nullable(),
  estimated: z.boolean(),
  sourceUrl: z.string(),
  retrievedAt: z.string(),
});
export type ExamSeriesView = z.infer<typeof examSeriesViewSchema>;

/** GET /api/v1/learners/me/exam-series?qualification=… (:61-69). */
export const examSeriesParamsSchema = z.object({
  qualification: z.string().optional(),
});
export type ExamSeriesParams = z.infer<typeof examSeriesParamsSchema>;

/** PUT /courses/{courseSlug}/target-series body — SetTargetRequest (:107-109). */
export const setTargetRequestSchema = z.object({
  seriesId: z.string().uuid(),
});
export type SetTargetRequest = z.infer<typeof setTargetRequestSchema>;

/**
 * POST /api/v1/learners/me/assignments/{id}/submissions body —
 * SubmissionRequest (:111-113): questionsCompleted @NotNull @Min(0);
 * score @Min(0) @Max(1000) nullable (null = handed in unmarked). The
 * per-assignment bounds (questionCount / marksTotal) are service law,
 * not schema law — they 400 with assignment-specific messages.
 */
export const assignmentSubmissionRequestSchema = z.object({
  questionsCompleted: z.number().int().min(0),
  score: z.number().int().min(0).max(1000).nullable().optional(),
});
export type AssignmentSubmissionRequest = z.infer<typeof assignmentSubmissionRequestSchema>;

/**
 * T-TEACH-001 — server-side "my courses" (v2-native, additive; operator
 * order trace 1a15ece07422fcd9). The account-backed roster behind the
 * student's personally added courses (TEACHER_MODE_PLAN.md §6 migration
 * row: "syllabai.mySubjects.v1 → student's course list server-side").
 *
 * Storage law: the roster LIVES in the existing learner_course_enrolments
 * table (learner_id + course_slug unique; target_series_id nullable) —
 * one enrolment concept, no parallel table, no dual source of truth. A
 * row's created_at IS the "when I added it" fact; the exam-series target
 * (T-C79/ADR-035) rides the SAME row. Removing a course from the roster
 * deletes the enrolment row and with it any exam target (dropping the
 * course drops its target — honest by construction).
 *
 * Law:
 *  - GET  /api/v1/learners/me/courses → MyCoursesView (added order,
 *         oldest first — the enrolment's own created_at ordering).
 *  - PUT  /api/v1/learners/me/courses ← SetMyCoursesRequest — the FULL
 *         desired slug set (idempotent write-through; already-present
 *         slugs keep their original created_at, new slugs gain now(),
 *         absent slugs are removed).
 *  - Slugs use the SAME law as target-series (LearnerExamSeriesController
 *    .validatedSlug: /^[a-z0-9]+(-[a-z0-9]+)*$/ — the kebab-case registry
 *    key shape), bounded by the varchar(100) column. Registry membership
 *    is validated at READ time by the hub (the localStorage roster's
 *    law) — the API does not own the content registry.
 */
export const userCourseViewSchema = z.object({
  slug: z.string(),
  addedAt: z.string(),
});
export type UserCourseView = z.infer<typeof userCourseViewSchema>;

export const myCoursesViewSchema = z.object({
  courses: z.array(userCourseViewSchema),
});
export type MyCoursesView = z.infer<typeof myCoursesViewSchema>;

export const setMyCoursesRequestSchema = z.object({
  slugs: z
    .array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must match "^[a-z0-9]+(-[a-z0-9]+)*$"'))
    .max(100),
});
export type SetMyCoursesRequest = z.infer<typeof setMyCoursesRequestSchema>;

// ── T-TIER1 — the account-backed "last opened" pointer (v2-native, additive) ─
//
// Tier-1 of the frontend deep-audit (operator order, 2026-11-03): "things
// that are localStorage-only, make them saved to account". The hub's
// last-opened store (apps/hub/src/lib/last-opened.ts, key
// "syllabai.lastOpened.v1") records the student's most recent course
// surface — the "Jump back in" card and the Study-tools href fallback both
// read it — and until now it lived in ONE browser only. The migration
// follows the T-TEACH-001 law verbatim: the localStorage record stays the
// UI cache; signed in, every local write mirrors here and the server wins
// on reconcile.
//
// Law:
//  - GET  /api/v1/learners/me/last-opened → LastOpenedView | {lastOpened:
//         null} — the account's pointer, null when this account never
//         opened a course (the honest empty, never a fabricated default).
//  - PUT  /api/v1/learners/me/last-opened ← SetLastOpenedRequest —
//         idempotent upsert (one row per account, PK user_id): the newest
//         navigation REPLACES the pointer. Course slug uses the SAME
//         kebab-case law as my-courses; `resource` is the hub's
//         ResourceKind union (the recorded surface kind, validated against
//         the closed set — an unknown kind is validation_failed, never a
//         silent string pass-through).
//  - Registry membership is validated at READ time by the hub (the
//    my-courses law) — the API does not own the content registry.
export const LAST_OPENED_RESOURCES = [
  "hub",
  "revision-notes",
  "exam-questions",
  "flashcards",
  "strengths",
  "past-papers",
  "practice-papers",
] as const;

export const lastOpenedResourceSchema = z.enum(LAST_OPENED_RESOURCES);
export type LastOpenedResource = z.infer<typeof lastOpenedResourceSchema>;

export const lastOpenedViewSchema = z.object({
  courseSlug: z.string(),
  resource: lastOpenedResourceSchema,
  updatedAt: z.string(),
});
export type LastOpenedView = z.infer<typeof lastOpenedViewSchema>;

/** GET /api/v1/learners/me/last-opened — null = the account has no pointer yet. */
export const lastOpenedEnvelopeSchema = z.object({
  lastOpened: lastOpenedViewSchema.nullable(),
});
export type LastOpenedEnvelope = z.infer<typeof lastOpenedEnvelopeSchema>;

export const setLastOpenedRequestSchema = z.object({
  courseSlug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must match "^[a-z0-9]+(-[a-z0-9]+)*$"'),
  resource: lastOpenedResourceSchema,
});
export type SetLastOpenedRequest = z.infer<typeof setLastOpenedRequestSchema>;

// ── T-TIER1 — the account-backed mock-exam results (v2-native, additive) ────
//
// The hub's mock-results store (apps/hub/src/lib/mock-results.ts, key
// "syllabai.mockResults.v1") keeps a student's SELF-MARKED mock-exam
// tallies — graded against the official mark scheme in the past-papers
// player — and until now they lived in ONE browser only (the store's own
// header called it a "local SIMULATED overlay (demo discipline)"). Tier-1
// moves them to the account with the SAME law as my-courses: localStorage
// stays the UI cache; signed in, the per-course full set mirrors here and
// the server wins on reconcile.
// Law:
//  - GET  /api/v1/learners/me/mock-results → MockResultsView — every
//         course's tally (newest finished first), capped at
//         MOCK_RESULTS_PER_COURSE (50, the hub's own MAX_PER_COURSE) per
//         course server-side.
//  - PUT  /api/v1/learners/me/mock-results/{courseSlug} ←
//         PutMockResultsRequest — the FULL desired set for that ONE course
//         (idempotent replace: the course's rows are deleted, the posted
//         set inserted; an empty array clears the course — no separate
//         DELETE surface). Course slug in the path uses the SAME kebab-case
//         law as my-courses. `clientId` is the hub's own composite record
//         id ("{course}:{sessionId}:{dir}:{startedAt}") — a bounded opaque
//         string the hub keys its dedupe on; the server treats it as
//         opaque and round-trips it verbatim.
//  - Self-marked honesty is preserved on the wire: nothing here claims
//    canonical marking — these are the student's own tallies.
/** T-CAPS-POLICY-1: 20 → 50 (a weekly-mock cadence covers a full school
 *  year per course; raised on BOTH sides — this constant, the hub's
 *  MAX_PER_COURSE, and the server's MOCK_RESULTS_CAP — so cache and
 *  account can never disagree on the shape). */
export const MOCK_RESULTS_PER_COURSE = 50;
export const MOCK_RESULT_MAX_QUESTIONS = 100;

export const mockResultEndedSchema = z.enum(["time-up", "self", "exited"]);
export type MockResultEnded = z.infer<typeof mockResultEndedSchema>;

export const mockResultQuestionSchema = z.object({
  label: z.string(),
  marks: z.number(),
  max: z.number().nullable(),
});
export type MockResultQuestion = z.infer<typeof mockResultQuestionSchema>;

export const mockResultSchema = z.object({
  /** the hub's opaque composite record id — round-tripped verbatim */
  clientId: z.string().min(1).max(200),
  /** official paper reference, e.g. "4CH1/1C" */
  ref: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  /** exam session label, e.g. "2024-summer" (NOT a uuid — a session label) */
  sessionId: z.string().min(1).max(80),
  /** ISO instant when the mock finished */
  finishedAt: z.string(),
  /** duration the mock was set to (minutes) */
  durationMin: z.number().int().min(0),
  /** seconds actually used */
  timeUsedSec: z.number().int().min(0),
  marks: z.number().int().min(0),
  total: z.number().int().min(0),
  ended: mockResultEndedSchema,
  /** optional per-question tally (additive field — older records lack it) */
  questions: z.array(mockResultQuestionSchema).max(MOCK_RESULT_MAX_QUESTIONS).optional(),
});
export type MockResult = z.infer<typeof mockResultSchema>;

export const mockResultsViewSchema = z.object({
  results: z.array(mockResultSchema),
});
export type MockResultsView = z.infer<typeof mockResultsViewSchema>;

export const putMockResultsRequestSchema = z.object({
  results: z.array(mockResultSchema).max(MOCK_RESULTS_PER_COURSE),
});
export type PutMockResultsRequest = z.infer<typeof putMockResultsRequestSchema>;
