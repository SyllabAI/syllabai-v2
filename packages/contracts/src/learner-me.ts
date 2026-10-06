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

/** ExamSeriesView.BOARD_PEARSON_EDEXCEL (:26) — the only imported board. */
export const EXAM_SERIES_BOARD_PEARSON_EDEXCEL = "PEARSON_EDEXCEL";

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
