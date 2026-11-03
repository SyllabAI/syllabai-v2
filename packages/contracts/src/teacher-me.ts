/**
 * Teacher-me standalone wire — the v2-NATIVE account-backed teacher stores
 * (T-TIER1 run-002, additive; NO frozen-core counterpart — the frozen core
 * never exposed a teacher "me" surface, so like the cla-threads row this
 * family needs no capture/verify band).
 *
 * Tier-2 of the frontend deep-audit (operator order, 2026-11-03: "things
 * that are localStorage-only, make them saved to account"): the hub's three
 * teacher stores (apps/hub/src/lib/teacher/stores.ts) lived in ONE browser
 * only —
 *
 *   - "syllabai.savedTests.v1"       the Test Builder saves (cap 30);
 *   - "syllabai.teachingCoverage.v1" the per-course taught-codes overlay;
 *   - "syllabai.contentReviews.v1"   the AI-content validation verdicts
 *                                    ("persist locally until the write path
 *                                    exists" — this IS the write path).
 *
 * The migration follows the T-TEACH-001 write-through law verbatim: the
 * localStorage records stay the UI cache; signed in, every local write
 * mirrors here and the reconcile merges conservatively (a union never loses
 * a record from either side — the mock-results merge law, not the
 * last-opened recency law).
 *
 * Law:
 *  - GET  /api/v1/teachers/me/saved-tests → SavedTestsView (newest first).
 *         PUT /api/v1/teachers/me/saved-tests ← PutSavedTestsRequest — the
 *         FULL desired set, idempotent replace (an empty array clears the
 *         library). `id` is the hub's opaque client id ("t_…") round-tripped
 *         verbatim — the hub keys its dedupe and merge on it.
 *  - GET  /api/v1/teachers/me/teaching-coverage → TeachingCoverageView
 *         (course-slug order). PUT …/teaching-coverage/{courseSlug} ←
 *         PutTeachingCoverageRequest — the FULL code set for that ONE course
 *         (idempotent replace; an empty array clears the course — the
 *         mock-results per-course posture). The path slug uses the SAME
 *         kebab-case law as the learner-me family.
 *  - GET  /api/v1/teachers/me/content-reviews → ContentReviewsView (newest
 *         first, one verdict per resource). PUT …/content-reviews ←
 *         PutContentReviewsRequest — the FULL desired set, idempotent
 *         replace; the server enforces the one-verdict-per-resource law.
 *
 * Caps are the hub's own store bounds (30 saves / 200 reviews), so cache and
 * account can never disagree about the shape. Registry membership (course
 * slugs, subtopic codes, resource ids) is validated at READ time by the hub
 * — the API does not own the content registry.
 */
import { z } from "zod";

/** The kebab-case registry key law (the learner-me slug grammar, verbatim). */
export const kebabSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must match "^[a-z0-9]+(-[a-z0-9]+)*$"');

// ── saved tests (Test Builder saves) ─────────────────────────────────────────

/** The hub store's own cap (`writeTests(...).slice(0, 30)`). */
export const SAVED_TESTS_MAX = 30;
export const SAVED_TEST_SUBTOPICS_MAX = 200;
export const SAVED_TEST_QUESTION_IDS_MAX = 500;

export const savedTestSchema = z.object({
  /** the hub's opaque client id ("t_<base36>") — round-tripped verbatim */
  id: z.string().min(1).max(64),
  /** the test's display name (Test Builder "Save" names it) */
  name: z.string().min(1).max(200),
  courseSlug: kebabSlugSchema,
  /** the course's display code, e.g. "4CH1" */
  courseCode: z.string().min(1).max(32),
  /** selected subtopic codes (builder-era saves carry the explicit list) */
  subtopics: z.array(z.string().min(1).max(80)).max(SAVED_TEST_SUBTOPICS_MAX),
  targetMarks: z.number().int().min(0).nullable().optional(),
  maxQuestions: z.number().int().min(0).nullable().optional(),
  /** explicit question list (legacy saves omit it — they re-generate) */
  questionIds: z.array(z.string().min(1).max(200)).max(SAVED_TEST_QUESTION_IDS_MAX).optional(),
  /** ISO instant — set by the hub at save time; ordering follows it */
  createdAt: z.string(),
});
export type SavedTest = z.infer<typeof savedTestSchema>;

export const savedTestsViewSchema = z.object({
  tests: z.array(savedTestSchema),
});
export type SavedTestsView = z.infer<typeof savedTestsViewSchema>;

export const putSavedTestsRequestSchema = z.object({
  tests: z.array(savedTestSchema).max(SAVED_TESTS_MAX),
});
export type PutSavedTestsRequest = z.infer<typeof putSavedTestsRequestSchema>;

// ── teaching coverage (the per-course taught-codes overlay) ──────────────────

export const TEACHING_COVERAGE_CODES_MAX = 500;
export const TEACHING_COVERAGE_COURSES_MAX = 50;

export const teachingCoverageEntrySchema = z.object({
  courseSlug: kebabSlugSchema,
  codes: z.array(z.string().min(1).max(80)).max(TEACHING_COVERAGE_CODES_MAX),
});
export type TeachingCoverageEntry = z.infer<typeof teachingCoverageEntrySchema>;

export const teachingCoverageViewSchema = z.object({
  coverage: z.array(teachingCoverageEntrySchema).max(TEACHING_COVERAGE_COURSES_MAX),
});
export type TeachingCoverageView = z.infer<typeof teachingCoverageViewSchema>;

/** PUT /teaching-coverage/{courseSlug} body — the FULL set for that course. */
export const putTeachingCoverageRequestSchema = z.object({
  codes: z.array(z.string().min(1).max(80)).max(TEACHING_COVERAGE_CODES_MAX),
});
export type PutTeachingCoverageRequest = z.infer<typeof putTeachingCoverageRequestSchema>;

// ── content reviews (the AI-content validation verdicts) ─────────────────────

/** The hub store's own cap (`writeReviews(...).slice(0, 200)`). */
export const CONTENT_REVIEWS_MAX = 200;

export const contentReviewKindSchema = z.enum(["solution", "note", "flashcard"]);
export type ContentReviewKind = z.infer<typeof contentReviewKindSchema>;

export const contentReviewVerdictSchema = z.enum(["approved", "edited", "rejected"]);
export type ContentReviewVerdict = z.infer<typeof contentReviewVerdictSchema>;

export const contentReviewSchema = z.object({
  /** the reviewed resource's corpus id — opaque here, round-tripped verbatim */
  resourceId: z.string().min(1).max(200),
  courseSlug: kebabSlugSchema,
  courseCode: z.string().min(1).max(32),
  kind: contentReviewKindSchema,
  verdict: contentReviewVerdictSchema,
  /** the teacher's comment ("" is legal — an approval needs no words) */
  comment: z.string().max(2000),
  /** who reviewed it (the hub stamps the identity's name) */
  reviewer: z.string().min(1).max(200),
  /** ISO instant — the verdict time; conflicts resolve to the newer one */
  createdAt: z.string(),
});
export type ContentReview = z.infer<typeof contentReviewSchema>;

export const contentReviewsViewSchema = z.object({
  reviews: z.array(contentReviewSchema),
});
export type ContentReviewsView = z.infer<typeof contentReviewsViewSchema>;

export const putContentReviewsRequestSchema = z.object({
  reviews: z.array(contentReviewSchema).max(CONTENT_REVIEWS_MAX),
});
export type PutContentReviewsRequest = z.infer<typeof putContentReviewsRequestSchema>;
