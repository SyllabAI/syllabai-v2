/**
 * The canonical ExamTargetReader seam (T-MIG-066 — the 043 consolidation
 * band, R0 ruling of record @ 2d5a73d).
 *
 * ONE owner for the frozen exam/ExamTargetReader.java (:28-52) read-model —
 * a single repository-backed reader shared by BOTH LearnerStateController
 * AND LearnerAgendaController in the frozen core: every course the learner
 * declared a target series for, the series batched in ONE read (first-wins),
 * vanished-series rows filtered, the countdown derived on THIS read against
 * the server clock (ADR-031: derived is recomputed, never stored — whole
 * calendar days, ChronoUnit.DAYS.between; entryDeadlinePassed = STRICTLY
 * before: the deadline day itself still allows entry). An empty list IS the
 * honest "no series declared" state — clients render "add your exam series",
 * never an invented date.
 *
 * PROVENANCE (moved verbatim, byte-matched laws — R0-verified zero
 * behavioral divergence between the two former per-module copies before
 * consolidation):
 *   - the SEAM reader (`examTargetsFor`) + the row->view builder
 *     (`courseExamTargetView`, incl. the F-2 fidelity-note block) come from
 *     `services/learner-me/index.ts` (the T-MIG-043 tranche-2 copy) — the
 *     frozen reader's actual shape: owns the reads, injected sql + clock;
 *   - the PURE composition (`courseExamTargets`) is 041's preloaded-rows
 *     re-derivation, kept for LearnerStateController's leg-batching (its
 *     fakeSql pins pin 041's own query texts — zero pin semantics change):
 *     the body moves verbatim with its structural-minimum param types so
 *     the caller's camelCase preloaded rows compose directly;
 *   - the view TYPE is single-owned by contracts
 *     (courseExamTargetViewSchema, learner.ts — the F-2-widened canonical
 *     .nullable() law); the former local interface in state.ts is retired,
 *     not re-declared here (single-owned reuse, the TS2308 precedent).
 *
 * Wire parity note: entryDeadline/resultsDate are the raw LocalDate columns
 * — nullable, per the F-2 .nullable() correction (T-MIG-038 #86).
 */
import type { CourseExamTargetView } from "@syllabai/contracts";

export type { CourseExamTargetView };
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";

/** The deps the seam reader needs — the learner-me modules' deps shape. */
export interface ExamTargetReaderDeps {
  sql: SqlFn;
  clock: SubmitClock;
}

/** exam_series row as the picker/target reads select them. */
export interface ExamSeriesRow {
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
  source_url: string;
  retrieved_at: string;
}

/** learner_course_enrolments row (target reads). */
export interface EnrolmentRow {
  id: string;
  learner_id: string;
  course_slug: string;
  target_series_id: string | null;
  created_at: string;
  updated_at: string;
}

export const utcToday = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Wire form of a DATE-typed column — the LocalDate passthrough law. The
 * frozen core serializes LocalDate fields as the bare calendar date
 * ("2026-10-08" — ExamSeriesView.java / CourseExamTargetView.java), but the
 * pg drivers hand JS a Date object for `date` columns, which
 * JSON.stringify renders as a UTC timestamp ("2026-10-08T00:00:00.000Z" —
 * the run #9/#11 DATE-FORMAT class, R3 ruling) and which broke
 * daysBetween with "toIso.slice is not a function" (the
 * w4-target-series-put 500, run #11 boot log; T-MIG-067). Normalizes BOTH
 * runtime shapes to the bare date: Date → its ISO prefix; string → its
 * first 10 chars; null/undefined → null (nullable LocalDate columns).
 */
export const wireDate = (value: unknown): string | null => {
  if (value == null) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return iso.slice(0, 10);
};

/**
 * ChronoUnit.DAYS.between(today, window) — WHOLE calendar days between two
 * ISO local dates (UTC). Calendar-day arithmetic on date STRINGS (both
 * normalized YYYY-MM-DD), not on ms timestamps — a UTC-day boundary never
 * shifts under a timezone here, and a partial day does not round.
 */
export const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
};

/**
 * CourseExamTargetView.of (CourseExamTargetView.java :40-55) — the
 * countdown derived on THIS read against the server clock (ADR-031:
 * derived is recomputed, never stored): whole calendar days
 * (ChronoUnit.DAYS.between) to windowStart/windowEnd; entryDeadlinePassed
 * = entryDeadline != null && entryDeadline.isBefore(today) — STRICTLY
 * before: the deadline day itself still allows entry.
 */
export function courseExamTargetView(
  enrolment: EnrolmentRow,
  series: ExamSeriesRow,
  today: string,
): CourseExamTargetView {
  // DATE columns arrive as Date objects from the pg drivers (see wireDate);
  // normalize BEFORE the countdown arithmetic and the wire (T-MIG-067: the
  // raw Date hit daysBetween as "toIso.slice is not a function" — the
  // w4-target-series-put 500 — and serialized as UTC timestamps on the
  // exam-series surfaces, the R3 DATE-FORMAT class).
  const windowStart = wireDate(series.window_start) as string;
  const windowEnd = wireDate(series.window_end) as string;
  const entryDeadline = wireDate(series.entry_deadline);
  const resultsDate = wireDate(series.results_date);
  return {
    courseSlug: enrolment.course_slug,
    seriesId: series.id,
    seriesCode: series.series_code,
    label: series.label,
    windowStart,
    windowEnd,
    // FIDELITY NOTE (R0 flag, resolved by T-MIG-038 #86): the frozen
    // CourseExamTargetView record renders entryDeadline/resultsDate as the
    // raw LocalDate columns — NULL when the series row has no deadline/
    // results date — and the canonical courseExamTargetViewSchema
    // (learner.ts) now carries the .nullable() law; the cast documents the
    // honest pass-through at the former call sites.
    entryDeadline: entryDeadline as string,
    resultsDate: resultsDate as string,
    estimated: series.estimated,
    daysToWindowStart: daysBetween(today, windowStart),
    daysToWindowEnd: daysBetween(today, windowEnd),
    entryDeadlinePassed: entryDeadline != null && entryDeadline < today,
  };
}

/**
 * ExamTargetReader.targetsFor — the SEAM shape (owns the reads, injected
 * sql + clock, the frozen reader's actual shape): the learner's declared
 * enrolments, the series batched in ONE read (first-wins on duplicate
 * rows), vanished-series rows filtered, the view derived on this read
 * against `today` (UTC; defaults to the injected clock's UTC date).
 */
export async function examTargetsFor(
  deps: ExamTargetReaderDeps,
  learnerId: string,
  today?: string,
): Promise<CourseExamTargetView[]> {
  const todayIso = today ?? utcToday(deps.clock.now());
  const declared = (await deps.sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${learnerId} and target_series_id is not null`) as unknown as EnrolmentRow[];
  if (declared.length === 0) return [];
  const seriesIds = [...new Set(declared.map((e) => e.target_series_id as string))];
  const seriesRows = (await deps.sql`
    select id, board, qualification, series_code, label, window_start,
           window_end, entry_deadline, results_date, estimated,
           source_url, retrieved_at
    from exam_series
    where id = any(${seriesIds}::uuid[])`) as unknown as ExamSeriesRow[];
  const seriesById = new Map<string, ExamSeriesRow>();
  for (const s of seriesRows) {
    if (!seriesById.has(s.id)) seriesById.set(s.id, s);
  }
  return declared
    .filter((e) => seriesById.has(e.target_series_id as string))
    .map((e) => courseExamTargetView(e, seriesById.get(e.target_series_id as string)!, todayIso));
}

// ── the pure composition (041's preloaded-rows re-derivation) ───────────────

const DAY_MS = 86_400_000;

/**
 * The pure composition over PRELOADED rows — LearnerStateController's leg
 * batching keeps its own reads (the state surface's fakeSql pins pin those
 * exact query texts; zero pin semantics change), so the composition is
 * re-derived on top of the canonical view law instead of forcing the seam
 * reader's query shape onto it.
 *
 * Structural-minimum params: the caller's preloaded rows (state.ts's
 * camelCase CourseEnrolmentRow / ExamSeriesRow shapes) compose directly.
 * The body is the T-MIG-041 copy verbatim (same law the seam reader serves:
 * first-wins batch upstream, vanished-series filter here, whole-day
 * countdowns, STRICTLY-before entryDeadlinePassed).
 */
export function courseExamTargets(
  declared: readonly { courseSlug: string; targetSeriesId: string }[],
  seriesById: ReadonlyMap<string, { id: string; seriesCode: string; label: string; windowStart: string; windowEnd: string; entryDeadline: string | null; resultsDate: string | null; estimated: boolean }>,
  today: string,
): CourseExamTargetView[] {
  const todayMs = Date.parse(today + "T00:00:00Z");
  const daysBetween = (from: string): number =>
    Math.round((Date.parse(from + "T00:00:00Z") - todayMs) / DAY_MS);
  return declared
    .filter((e) => seriesById.has(e.targetSeriesId))
    .map((e) => {
      const s = seriesById.get(e.targetSeriesId)!;
      return {
        courseSlug: e.courseSlug,
        seriesId: s.id,
        seriesCode: s.seriesCode,
        label: s.label,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        entryDeadline: s.entryDeadline,
        resultsDate: s.resultsDate,
        estimated: s.estimated,
        daysToWindowStart: daysBetween(s.windowStart),
        daysToWindowEnd: daysBetween(s.windowEnd),
        entryDeadlinePassed: s.entryDeadline != null && Date.parse(s.entryDeadline + "T00:00:00Z") < todayMs,
      };
    });
}
