/**
 * Learner exam-series surfaces (T-MIG-043 tranche 1) — the published-series
 * picker, the target-series lifecycle, and the derived targets reader.
 * Frozen law @ 6cad6ef, line-against-line:
 *
 *   - LearnerExamSeriesController.java :59-117
 *       GET    /exam-series                      (the picker)
 *       PUT    /courses/{courseSlug}/target-series  (declare/correct)
 *       DELETE /courses/{courseSlug}/target-series  (clear; 204 always)
 *   - ExamSeriesView.java (:13-28 from()) + BOARD_PEARSON_EDEXCEL constant
 *   - ExamTargetReader.java (:31-52 targetsFor)
 *   - CourseExamTargetView.of (:34-49 — countdowns derived on read, ADR-031)
 *   - LearnerCourseEnrolment.java (retarget(seriesId, now) sets
 *     target_series_id + updated_at; the row REMAINS on clear)
 *
 * CONTRACT GAP (disclosed): ExamSeriesView has no landed zod contract
 * (T-MIG-038 scoped the wire views to the state cluster); it is defined
 * structurally here, field-for-field with the Java record, flagged for a
 * verbatim move into packages/contracts by a contracts-fenced tranche.
 * CourseExamTargetView IS the landed 038 contract.
 *
 * Write law: PUT = find-or-create enrolment (new row gets a randomUUID +
 * created_at/updated_at = now) then retarget + save — the Java is a
 * non-atomic read-modify-write (findByLearnerIdAndCourseSlug then save),
 * ported as two single-statement steps over the seam, disclosed. DELETE is
 * a no-op-when-absent single UPDATE; 204 ALWAYS, the enrolment row remains
 * ("not sure yet" is honest).
 *
 * `now`/`today`/uuid are INJECTED (determinism law; today = the core's
 * LocalDate.now(ZoneOffset.UTC) at the view boundary).
 */
import { type CourseExamTargetView } from "@syllabai/contracts";
import { LearnerSurfaceHttpError } from "./flashcards";
import type { SqlFn } from "./sql";

/** BOARD_PEARSON_EDEXCEL (ExamSeriesView :20). */
export const BOARD_PEARSON_EDEXCEL = "PEARSON_EDEXCEL";

/**
 * ExamSeriesView (:13-28) — the picker's wire record. DATES are the Java
 * LocalDate wire form (YYYY-MM-DD strings); retrievedAt is an instant.
 * NO published flag on the wire (the picker only serves published rows).
 */
export interface ExamSeriesView {
  id: string;
  board: string;
  qualification: string;
  seriesCode: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  entryDeadline: string | null;
  resultsDate: string | null;
  estimated: boolean;
  sourceUrl: string | null;
  retrievedAt: string;
}

export interface ExamSeriesCatalogRow {
  id: string;
  board: string;
  qualification: string;
  series_code: string;
  label: string;
  window_start: string;
  window_end: string;
  entry_deadline: string | null;
  results_date: string | null;
  estimated: boolean;
  source_url: string | null;
  retrieved_at: string;
  published: boolean;
}

/** ExamSeriesView.from (:21-27) — the record construction, verbatim. */
function toSeriesView(s: ExamSeriesCatalogRow): ExamSeriesView {
  return {
    id: s.id,
    board: s.board,
    qualification: s.qualification,
    seriesCode: s.series_code,
    label: s.label,
    windowStart: s.window_start,
    windowEnd: s.window_end,
    entryDeadline: s.entry_deadline,
    resultsDate: s.results_date,
    estimated: s.estimated,
    sourceUrl: s.source_url,
    retrievedAt: new Date(s.retrieved_at).toISOString(),
  };
}

/**
 * GET /exam-series (:61-71): qualification null/blank -> ALL published by
 * windowStart asc; else the board-qualified slice (PEARSON_EDEXCEL fixed
 * board), same ordering. Published-only on every path.
 */
export async function listExamSeries(
  sql: SqlFn,
  qualification: string | null | undefined,
): Promise<ExamSeriesView[]> {
  const rows = (qualification == null || qualification.trim() === ""
    ? await sql`
      select id, board, qualification, series_code, label, window_start, window_end,
             entry_deadline, results_date, estimated, source_url, retrieved_at, published
      from exam_series where published = ${true}
      order by window_start asc
    `
    : await sql`
      select id, board, qualification, series_code, label, window_start, window_end,
             entry_deadline, results_date, estimated, source_url, retrieved_at, published
      from exam_series
      where board = ${BOARD_PEARSON_EDEXCEL} and qualification = ${qualification} and published = ${true}
      order by window_start asc
    `).map(toExamSeriesCatalogRow);
  return rows.map(toSeriesView);
}

// ── target-series lifecycle (:74-110) ───────────────────────────────────────

export interface EnrolmentRow {
  id: string;
  learner_id: string;
  course_slug: string;
  target_series_id: string | null;
  created_at: string;
  updated_at: string;
}

/** The module's row discipline: coerce each field, never cast the record. */
function toExamSeriesCatalogRow(r: Record<string, unknown>): ExamSeriesCatalogRow {
  return {
    id: String(r.id),
    board: String(r.board),
    qualification: String(r.qualification),
    series_code: String(r.series_code),
    label: String(r.label),
    window_start: String(r.window_start),
    window_end: String(r.window_end),
    entry_deadline: r.entry_deadline == null ? null : String(r.entry_deadline),
    results_date: r.results_date == null ? null : String(r.results_date),
    estimated: Boolean(r.estimated),
    source_url: r.source_url == null ? null : String(r.source_url),
    retrieved_at: String(r.retrieved_at),
    published: Boolean(r.published),
  };
}

function toEnrolmentRow(r: Record<string, unknown>): EnrolmentRow {
  return {
    id: String(r.id),
    learner_id: String(r.learner_id),
    course_slug: String(r.course_slug),
    target_series_id: r.target_series_id == null ? null : String(r.target_series_id),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/** validatedSlug (:112-118) — kebab-case registry key or 400, verbatim. */
export function validateCourseSlug(courseSlug: string | null | undefined): string {
  if (courseSlug == null || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(courseSlug)) {
    throw new LearnerSurfaceHttpError(400, "course slug must be a kebab-case registry key");
  }
  return courseSlug;
}

/**
 * CourseExamTargetView.of (:34-49) — countdowns DERIVED ON READ (ADR-031):
 * daysToWindowStart/End = ChronoUnit.DAYS.between(today, window);
 * entryDeadlinePassed = entryDeadline != null && entryDeadline.isBefore(today).
 */
function targetView(
  enrolment: EnrolmentRow,
  series: ExamSeriesCatalogRow,
  today: string,
): CourseExamTargetView {
  const daysBetween = (from: string, to: string): number => {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
  };
  return {
    courseSlug: enrolment.course_slug,
    seriesId: series.id,
    seriesCode: series.series_code,
    label: series.label,
    windowStart: series.window_start,
    windowEnd: series.window_end,
    // NULL PASSTHROUGH + R0 FLAG (partLabel-class): entry_deadline /
    // results_date are NULLABLE exam_series columns and the Java record
    // carries plain LocalDate (CourseExamTargetView.java :12-13) — the wire
    // CAN be null. The landed 038 contract types both z.string() (non-null),
    // a latent false-reject for series without a deadline; the cast keeps
    // this tranche inside its fence. R0 rules: widen contract vs seed law.
    entryDeadline: (series.entry_deadline ?? null) as unknown as string,
    resultsDate: (series.results_date ?? null) as unknown as string,
    estimated: series.estimated,
    daysToWindowStart: daysBetween(today, series.window_start),
    daysToWindowEnd: daysBetween(today, series.window_end),
    entryDeadlinePassed: series.entry_deadline != null && series.entry_deadline < today,
  };
}

/**
 * PUT /courses/{slug}/target-series (:74-92): slug law -> series 404
 * ('exam series {id} does not exist') -> published gate 400 ('only published
 * exam series can be targeted: {seriesCode}') -> find-or-create enrolment
 * (new: randomUUID, created/updated = now) -> retarget(series.id, now)
 * (idempotent upsert of target_series_id + updated_at) -> the derived view.
 */
export async function targetSeries(
  sql: SqlFn,
  cmd: { learnerId: string; courseSlug: string; seriesId: string },
  opts: { now: () => Date; newId: () => string; today: string },
): Promise<CourseExamTargetView> {
  const slug = validateCourseSlug(cmd.courseSlug);
  const seriesRows = (
    await sql`
    select id, board, qualification, series_code, label, window_start, window_end,
           entry_deadline, results_date, estimated, source_url, retrieved_at, published
    from exam_series where id = ${cmd.seriesId}
  `
  ).map(toExamSeriesCatalogRow);
  if (seriesRows.length === 0) {
    throw new LearnerSurfaceHttpError(404, `exam series ${cmd.seriesId} does not exist`);
  }
  const series = seriesRows[0]!;
  if (!series.published) {
    throw new LearnerSurfaceHttpError(
      400,
      `only published exam series can be targeted: ${series.series_code}`,
    );
  }
  const existing = (
    await sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${cmd.learnerId} and course_slug = ${slug}
  `
  ).map(toEnrolmentRow);
  const now = opts.now();
  const nowIso = now.toISOString();
  let enrolment: EnrolmentRow;
  if (existing.length === 0) {
    enrolment = {
      id: opts.newId(),
      learner_id: cmd.learnerId,
      course_slug: slug,
      target_series_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await sql`
      insert into learner_course_enrolments (id, learner_id, course_slug, target_series_id, created_at, updated_at)
      values (${enrolment.id}, ${enrolment.learner_id}, ${enrolment.course_slug}, ${enrolment.target_series_id}, ${enrolment.created_at}, ${enrolment.updated_at})
    `;
  } else {
    enrolment = existing[0]!;
  }
  // retarget(series.id, now) — sets target_series_id + updated_at; save.
  enrolment.target_series_id = series.id;
  enrolment.updated_at = nowIso;
  await sql`
    update learner_course_enrolments
    set target_series_id = ${series.id}, updated_at = ${nowIso}
    where id = ${enrolment.id}
  `;
  return targetView(enrolment, series, opts.today);
}

/**
 * DELETE /courses/{slug}/target-series (:95-103): retarget(null, now) on the
 * row IF PRESENT; 204 ALWAYS; the enrolment row remains. A fresh slug with
 * no enrolment is a silent no-op (the Java's ifPresent).
 */
export async function clearTargetSeries(
  sql: SqlFn,
  cmd: { learnerId: string; courseSlug: string },
  opts: { now: () => Date },
): Promise<void> {
  const slug = validateCourseSlug(cmd.courseSlug);
  const existing = (
    await sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${cmd.learnerId} and course_slug = ${slug}
  `
  ).map(toEnrolmentRow);
  if (existing.length === 0) return;
  const nowIso = opts.now().toISOString();
  await sql`
    update learner_course_enrolments
    set target_series_id = ${null}, updated_at = ${nowIso}
    where id = ${existing[0]!.id}
  `;
}

/**
 * ExamTargetReader.targetsFor (:31-52): declared = enrolments with a
 * non-null target_series_id; empty -> []; batch series fetch (first-wins
 * map); vanished-series rows FILTERED; views derived on read against the
 * injected today (UTC LocalDate at the boundary).
 */
export async function targetsFor(
  sql: SqlFn,
  learnerId: string,
  today: string,
): Promise<CourseExamTargetView[]> {
  const declared = (
    await sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${learnerId} and target_series_id is not null
  `
  ).map(toEnrolmentRow);
  if (declared.length === 0) return [];
  const seriesIds = [...new Set(declared.map((e) => e.target_series_id as string))];
  const fetched = (await sql(seriesByIdTemplate(seriesIds.length), ...seriesIds)).map(toExamSeriesCatalogRow);
  const byId = new Map<string, ExamSeriesCatalogRow>();
  for (const s of fetched) if (!byId.has(s.id)) byId.set(s.id, s);
  return declared
    .filter((e) => byId.has(e.target_series_id as string))
    .map((e) => targetView(e, byId.get(e.target_series_id as string)!, today));
}

/** n bind slots for the series batch fetch (same seam discipline). */
function seriesByIdTemplate(n: number): TemplateStringsArray {
  const parts: string[] = [
    "select id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, estimated, source_url, retrieved_at, published from exam_series where id in (",
  ];
  for (let i = 1; i < n; i++) parts.push(", ");
  parts.push(")");
  const arr = parts as unknown as TemplateStringsArray;
  Object.defineProperty(arr, "raw", { value: [...parts], writable: false });
  return arr;
}
