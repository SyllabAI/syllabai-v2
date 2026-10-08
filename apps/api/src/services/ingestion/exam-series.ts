/**
 * ExamSeriesImportService port — the exam-calendar import (T-C79,
 * ADR-035 D1 ruling; T-MIG-082 tranche B3). Byte-faithful port of the
 * frozen teacher/ingestion/ExamSeriesImportService.java (145 lines) @
 * 6cad6ef, verified line-against-line 2026-10-07.
 *
 * Fail-closed gates (each one a named anti-fabrication invariant —
 * reference data deserves the same force as content):
 *   1. the dataset carries a board and a retrieval timestamp (409s);
 *   2. EVERY row carries a source URL (https) — no citation, no row (409);
 *   3. entry deadlines cannot sit after the window starts, results cannot
 *      land before the window ends (409) — a real calendar satisfies both,
 *      so a violation is a transcription error;
 *   4. series codes are kebab-case board-local keys (shape only — the
 *      cadence itself is DATA, never a hardcoded series list) (409);
 *   5. an UNPUBLISHED row may not be a non-estimated silent row (409);
 *      an estimated row still needs a window (409).
 *
 * Re-import semantics (boards DO revise windows): identical row =
 * idempotent no-op; a changed row = the measured fields move WITH their
 * new citation (logged) — the caller sees imported/updated/unchanged.
 *
 * The NPE class of the frozen controller is preserved verbatim (T-MIG-004
 * F-2: replicate, never silently "fix"): bean validation NEVER ran on this
 * controller (no @Valid), so a row missing windowStart/windowEnd NPEs in
 * validateRow's isBefore, a missing published Boolean NPEs on unboxing, a
 * missing qualification NPEs at .name() — all reach the catch-all 500.
 * The port throws the same way (plain Error → 500) at the same decision
 * points, in the same order.
 */
import type { SqlFn } from "../identity/users";
import { ConflictException } from "../identity/errors";
import type { ExamSeriesDataset, ExamSeriesRow } from "@syllabai/contracts";

type Row = Record<string, unknown>;

export interface ExamSeriesImportSummary {
  imported: number;
  updated: number;
  unchanged: number;
}

/** the NPE parity error — never mapped, always the catch-all 500 */
const npe = (where: string): Error => new Error(`NPE parity: ${where}`);

/** kebab-case seriesCode shape law (:103-106). */
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * validateRow (:102-132) — the named gates IN ORDER. The null-deref order
 * is load-bearing: seriesCode (null-safe 409) → windowEnd.isBefore
 * (windowStart) → entryDeadline → resultsDate → sourceUrl → published
 * unboxing → the unpublished-non-estimated 409.
 */
export function validateExamSeriesRow(row: ExamSeriesRow): void {
  if (row.seriesCode === null || !KEBAB.test(row.seriesCode)) {
    throw new ConflictException(
      `exam-series seriesCode must be a kebab-case key: ${row.seriesCode}`,
    );
  }
  if (row.windowEnd === null || row.windowStart === null) {
    // LocalDate.isBefore on a null → the frozen NPE → 500
    throw npe("windowEnd.isBefore(windowStart)");
  }
  if (row.windowEnd < row.windowStart) {
    throw new ConflictException(
      `exam-series window_end before window_start: ${row.seriesCode}`,
    );
  }
  // a real calendar satisfies both; a violation is a transcription error
  if (row.entryDeadline !== null && row.entryDeadline > row.windowStart) {
    throw new ConflictException(
      `exam-series entry deadline after window start: ${row.seriesCode}`,
    );
  }
  if (row.resultsDate !== null && row.resultsDate < row.windowEnd) {
    throw new ConflictException(
      `exam-series results date before window end: ${row.seriesCode}`,
    );
  }
  if (row.sourceUrl === null || !row.sourceUrl.startsWith("https://")) {
    throw new ConflictException(
      `exam-series row without an https citation fails closed: ${row.seriesCode}`,
    );
  }
  const estimated = row.estimated === true;
  if (row.published === null) {
    // !row.published() on a null Boolean → unboxing NPE → 500
    throw npe("published unboxing");
  }
  if (!row.published && estimated && row.windowStart === null) {
    // structural honesty: an estimated row still needs a window (unreachable
    // here — the NPE at gate 2 fired first for a null window; kept for shape)
    throw new ConflictException(`estimated row without a window: ${row.seriesCode}`);
  }
  if (!row.published && !estimated) {
    throw new ConflictException(
      `unpublished non-estimated rows are not importable: ${row.seriesCode}`,
    );
  }
}

/**
 * The driver-coercion-safe DATE read (T-MIG-100 CLASS C — the 093
 * scalar-param law's driver-binding-site class): postgres.js materialises
 * DATE columns as local-midnight JS Date instances, so a raw String()
 * compare answers "Tue Jan 06 2026…" against the wire's ISO "2026-01-06"
 * and a byte-identical repeat import counts as an update. The DATE value is
 * recovered with the LOCAL Y-M-D getters — the TZ-independent inverse of the
 * driver's local-midnight construction; string materialisations pass
 * through untouched; null stays null.
 */
function isoDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return (
      `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-` +
      `${String(v.getDate()).padStart(2, "0")}`
    );
  }
  return String(v);
}

/** sameMeasurement (:134-143): every measured field + the citation. */
function sameMeasurement(existing: Row, row: ExamSeriesRow): boolean {
  return (
    String(existing.label) === row.label &&
    isoDate(existing.window_start) === row.windowStart &&
    isoDate(existing.window_end) === row.windowEnd &&
    isoDate(existing.entry_deadline) === row.entryDeadline &&
    isoDate(existing.results_date) === row.resultsDate &&
    Boolean(existing.published) === row.published &&
    Boolean(existing.estimated) === (row.estimated === true) &&
    String(existing.source_url) === row.sourceUrl
  );
}

/**
 * importDataset (:59-100): the whole dataset is ONE transaction (the
 * CALLER owns it — this port takes the caller's SqlFn). Deterministic,
 * fail-closed, provenance mandatory.
 */
export async function importExamSeriesDataset(
  sql: SqlFn,
  dataset: ExamSeriesDataset,
  now: Date,
): Promise<ExamSeriesImportSummary> {
  if (dataset.board === null || dataset.board.trim() === "") {
    throw new ConflictException("exam-series dataset must name its board");
  }
  if (dataset.retrievedAt === null) {
    throw new ConflictException("exam-series dataset must carry retrievedAt");
  }
  if (dataset.series === null) {
    // for (row : dataset.series()) on a null list → the frozen NPE → 500
    throw npe("series iteration");
  }
  let imported = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of dataset.series) {
    validateExamSeriesRow(row);

    const qualification = row.qualification;
    if (qualification === null) {
      // row.qualification().name() → the frozen NPE → 500
      throw npe("qualification name()");
    }
    const existing: Row[] = await sql`
      select label, window_start, window_end, entry_deadline, results_date,
             published, estimated, source_url
      from exam_series
      where board = ${dataset.board} and qualification = ${qualification}
        and series_code = ${row.seriesCode}
      limit 1`;
    if (existing.length === 0 || !existing[0]) {
      await sql`
        insert into exam_series (
          id, board, qualification, series_code, label, window_start,
          window_end, entry_deadline, results_date, published, estimated,
          source_url, retrieved_at, created_at, updated_at
        ) values (
          ${crypto.randomUUID()}::uuid,
          ${dataset.board},
          ${qualification},
          ${row.seriesCode},
          ${row.label},
          ${row.windowStart},
          ${row.windowEnd},
          ${row.entryDeadline},
          ${row.resultsDate},
          ${row.published === true},
          ${row.estimated === true},
          ${row.sourceUrl},
          ${dataset.retrievedAt},
          ${now.toISOString()},
          ${now.toISOString()}
        )`;
      imported++;
    } else if (sameMeasurement(existing[0]!, row)) {
      unchanged++;
    } else {
      // a calendar correction: the measured fields move WITH their newer
      // citation (logged)
      await sql`
        update exam_series set
          label = ${row.label},
          window_start = ${row.windowStart},
          window_end = ${row.windowEnd},
          entry_deadline = ${row.entryDeadline},
          results_date = ${row.resultsDate},
          published = ${row.published === true},
          estimated = ${row.estimated === true},
          source_url = ${row.sourceUrl},
          retrieved_at = ${dataset.retrievedAt},
          updated_at = ${now.toISOString()}
        where board = ${dataset.board} and qualification = ${qualification}
          and series_code = ${row.seriesCode}`;
      updated++;
    }
  }
  return { imported, updated, unchanged };
}
