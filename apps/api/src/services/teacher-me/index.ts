/**
 * Teacher-me services — T-TIER1 run-002 (v2-NATIVE, additive; NO frozen-core
 * counterpart). The account-backed teacher stores behind the hub's three
 * localStorage-only surfaces (apps/hub/src/lib/teacher/stores.ts):
 *
 *   - teacher_saved_tests        → listSavedTests / setSavedTests
 *     (the Test Builder library, cap 30 — the hub's own slice bound; the
 *     hub's opaque client id round-trips verbatim and IS the merge key;
 *     newest-created-first ordering follows the hub's prepend-write law).
 *   - teacher_teaching_coverage  → teachingCoverage / setTeachingCoverageCourse
 *     (the per-course taught-codes overlay; one row per (account, course) —
 *     the unique index; an empty code set deletes the row, the honest clear).
 *   - teacher_content_reviews    → contentReviews / setContentReviews
 *     (the AI-content validation verdicts, cap 200, ONE verdict per
 *     (account, resource) — the unique index enforces the hub's own
 *     "a re-review supersedes the previous one" law; the verdicts ride the
 *     REAL corpus items, nothing is invented here).
 *
 * The write posture is the run-001 full-set law verbatim: the PUT carries
 * the FULL desired set and the service replaces idempotently (delete +
 * insert over the bounded scope), so a retried PUT and a sync reconcile can
 * never double-insert. Slugs use the SAME kebab-case registry-key law as
 * the learner-me family (400 bad_request verbatim). Registry membership
 * (courses, subtopic codes, resource ids) is validated at READ time by the
 * hub — the API does not own the content registry.
 */
import type {
  ContentReviewsView,
  PutContentReviewsRequest,
  PutSavedTestsRequest,
  PutTeachingCoverageRequest,
  SavedTestsView,
  TeachingCoverageView,
} from "@syllabai/contracts";
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, type SubmitClock } from "../selfmark";

export interface TeacherMeDeps {
  sql: SqlFn;
  clock: SubmitClock;
}

/** The learner-me slug law, verbatim message (my-courses / target-series). */
function isValidCourseSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

function toInstant(v: string | Date): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

// ── saved tests (the Test Builder library) ───────────────────────────────────

/** The hub store's own cap (`writeTests(...).slice(0, 30)`). */
const SAVED_TESTS_CAP = 30;

interface SavedTestRow {
  client_id: string;
  name: string;
  course_slug: string;
  course_code: string;
  subtopics: unknown;
  target_marks: number | null;
  max_questions: number | null;
  question_ids: unknown;
  created_at: string | Date;
}

const toSavedTestView = (r: SavedTestRow) => ({
  id: r.client_id,
  name: r.name,
  courseSlug: r.course_slug,
  courseCode: r.course_code,
  subtopics: (r.subtopics as string[]) ?? [],
  ...(r.target_marks === null ? {} : { targetMarks: r.target_marks }),
  ...(r.max_questions === null ? {} : { maxQuestions: r.max_questions }),
  ...(r.question_ids === null || r.question_ids === undefined
    ? {}
    : { questionIds: r.question_ids as string[] }),
  createdAt: toInstant(r.created_at),
});

/**
 * GET /api/v1/teachers/me/saved-tests — the account's Test Builder library,
 * newest-created first (the hub's prepend-write order), capped at 30
 * server-side (the same bound the hub's store enforces locally).
 */
export async function listSavedTests(deps: TeacherMeDeps, teacherId: string): Promise<SavedTestsView> {
  const rows = (await deps.sql`
    select client_id, name, course_slug, course_code, subtopics,
           target_marks, max_questions, question_ids, created_at,
           row_number() over (order by created_at desc, client_id asc) as rn
    from teacher_saved_tests
    where user_id = ${teacherId}`) as unknown as Array<SavedTestRow & { rn: string | number }>;
  const tests = rows
    .filter((r) => Number(r.rn) <= SAVED_TESTS_CAP)
    .map(toSavedTestView);
  return { tests };
}

/**
 * PUT /api/v1/teachers/me/saved-tests — the FULL desired library, idempotent
 * replace (the account's rows are deleted, the posted set inserted; an empty
 * array clears the library — the run-001 full-set posture, so a retried PUT
 * and a reconcile can never double-insert). Statements are deliberately
 * plain (no tx seam): the replace is idempotent against the desired set.
 */
export async function setSavedTests(
  deps: TeacherMeDeps,
  teacherId: string,
  request: PutSavedTestsRequest,
): Promise<SavedTestsView> {
  for (const t of request.tests) {
    if (!isValidCourseSlug(t.courseSlug)) {
      throw new BadRequestError("course slug must be a kebab-case registry key");
    }
  }
  await deps.sql`delete from teacher_saved_tests where user_id = ${teacherId}`;
  const now = deps.clock.now().toISOString();
  for (const t of request.tests) {
    await deps.sql`
      insert into teacher_saved_tests
        (id, user_id, client_id, name, course_slug, course_code, subtopics,
         target_marks, max_questions, question_ids, created_at)
      values (${deps.clock.newId()}, ${teacherId}, ${t.id}, ${t.name},
              ${t.courseSlug}, ${t.courseCode},
              ${JSON.stringify(t.subtopics)}, ${t.targetMarks ?? null},
              ${t.maxQuestions ?? null},
              ${t.questionIds ? JSON.stringify(t.questionIds) : null},
              ${t.createdAt})`;
  }
  return listSavedTests(deps, teacherId);
}

// ── teaching coverage (the per-course taught-codes overlay) ──────────────────

interface CoverageRow {
  course_slug: string;
  codes: unknown;
}

/**
 * GET /api/v1/teachers/me/teaching-coverage — every course's taught-code
 * overlay, course-slug order (deterministic for the sync's set compares).
 */
export async function teachingCoverage(deps: TeacherMeDeps, teacherId: string): Promise<TeachingCoverageView> {
  const rows = (await deps.sql`
    select course_slug, codes
    from teacher_teaching_coverage
    where user_id = ${teacherId}
    order by course_slug asc`) as unknown as CoverageRow[];
  return {
    coverage: rows.map((r) => ({
      courseSlug: r.course_slug,
      codes: (r.codes as string[]) ?? [],
    })),
  };
}

/**
 * PUT /api/v1/teachers/me/teaching-coverage/{courseSlug} — the FULL code set
 * for that ONE course, idempotent upsert (the unique (user, course) index
 * keeps the write self-healing on retry); an empty array DELETES the row —
 * the honest clear, no tombstone.
 */
export async function setTeachingCoverageCourse(
  deps: TeacherMeDeps,
  teacherId: string,
  courseSlug: string,
  request: PutTeachingCoverageRequest,
): Promise<TeachingCoverageView> {
  if (!isValidCourseSlug(courseSlug)) {
    throw new BadRequestError("course slug must be a kebab-case registry key");
  }
  if (request.codes.length === 0) {
    await deps.sql`
      delete from teacher_teaching_coverage
      where user_id = ${teacherId} and course_slug = ${courseSlug}`;
    return teachingCoverage(deps, teacherId);
  }
  const now = deps.clock.now().toISOString();
  await deps.sql`
    insert into teacher_teaching_coverage (id, user_id, course_slug, codes, updated_at)
    values (${deps.clock.newId()}, ${teacherId}, ${courseSlug},
            ${JSON.stringify(request.codes)}, ${now})
    on conflict (user_id, course_slug) do update
      set codes = excluded.codes,
          updated_at = excluded.updated_at`;
  return teachingCoverage(deps, teacherId);
}

// ── content reviews (the AI-content validation verdicts) ─────────────────────

/** The hub store's own cap (`writeReviews(...).slice(0, 200)`). */
const CONTENT_REVIEWS_CAP = 200;

interface ReviewRow {
  resource_id: string;
  course_slug: string;
  course_code: string;
  kind: string;
  verdict: string;
  comment: string;
  reviewer: string;
  created_at: string | Date;
}

const toReviewView = (r: ReviewRow) => ({
  resourceId: r.resource_id,
  courseSlug: r.course_slug,
  courseCode: r.course_code,
  kind: r.kind as ContentReviewsView["reviews"][number]["kind"],
  verdict: r.verdict as ContentReviewsView["reviews"][number]["verdict"],
  comment: r.comment,
  reviewer: r.reviewer,
  createdAt: toInstant(r.created_at),
});

/**
 * GET /api/v1/teachers/me/content-reviews — the account's verdicts, newest
 * first (the hub's prepend-write order), one per resource (the unique index
 * is the law; the rn cap mirrors the store bound).
 */
export async function contentReviews(deps: TeacherMeDeps, teacherId: string): Promise<ContentReviewsView> {
  const rows = (await deps.sql`
    select resource_id, course_slug, course_code, kind, verdict, comment,
           reviewer, created_at,
           row_number() over (order by created_at desc, resource_id asc) as rn
    from teacher_content_reviews
    where user_id = ${teacherId}`) as unknown as Array<ReviewRow & { rn: string | number }>;
  const list = rows
    .filter((r) => Number(r.rn) <= CONTENT_REVIEWS_CAP)
    .map(toReviewView);
  return { reviews: list };
}

/**
 * PUT /api/v1/teachers/me/content-reviews — the FULL desired verdict set,
 * idempotent replace (an empty array clears the ledger). The posted set is
 * deduped by resourceId keeping the FIRST occurrence (the hub already
 * enforces one-verdict-per-resource; the service is defensive, never
 * silent about the law — the unique index backs it).
 */
export async function setContentReviews(
  deps: TeacherMeDeps,
  teacherId: string,
  request: PutContentReviewsRequest,
): Promise<ContentReviewsView> {
  for (const r of request.reviews) {
    if (!isValidCourseSlug(r.courseSlug)) {
      throw new BadRequestError("course slug must be a kebab-case registry key");
    }
  }
  await deps.sql`delete from teacher_content_reviews where user_id = ${teacherId}`;
  const now = deps.clock.now().toISOString();
  const seen = new Set<string>();
  for (const r of request.reviews) {
    if (seen.has(r.resourceId)) continue; // one verdict per resource — first wins
    seen.add(r.resourceId);
    await deps.sql`
      insert into teacher_content_reviews
        (id, user_id, resource_id, course_slug, course_code, kind, verdict,
         comment, reviewer, created_at)
      values (${deps.clock.newId()}, ${teacherId}, ${r.resourceId},
              ${r.courseSlug}, ${r.courseCode}, ${r.kind}, ${r.verdict},
              ${r.comment}, ${r.reviewer}, ${r.createdAt})`;
  }
  return contentReviews(deps, teacherId);
}

export function buildTeacherMeModule(sql: SqlFn, clock: SubmitClock) {
  const deps: TeacherMeDeps = { sql, clock };
  return {
    listSavedTests: (teacherId: string) => listSavedTests(deps, teacherId),
    setSavedTests: (teacherId: string, request: PutSavedTestsRequest) =>
      setSavedTests(deps, teacherId, request),
    teachingCoverage: (teacherId: string) => teachingCoverage(deps, teacherId),
    setTeachingCoverageCourse: (teacherId: string, courseSlug: string, request: PutTeachingCoverageRequest) =>
      setTeachingCoverageCourse(deps, teacherId, courseSlug, request),
    contentReviews: (teacherId: string) => contentReviews(deps, teacherId),
    setContentReviews: (teacherId: string, request: PutContentReviewsRequest) =>
      setContentReviews(deps, teacherId, request),
  };
}

export type TeacherMeModule = ReturnType<typeof buildTeacherMeModule>;
