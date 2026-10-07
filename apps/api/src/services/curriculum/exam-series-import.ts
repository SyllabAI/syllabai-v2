/**
 * ExamSeriesImportService port — the OBSERVED call sequence of the frozen
 * teacher/ingestion/ExamSeriesImportService.java @ 6cad6ef against the
 * Flyway-owned `exam_series` table (T-MIG-091; R-LAZY doctrine).
 *
 * Frozen source (raw reads 2026-10-09):
 *   src/main/java/com/syllabai/teacher/ingestion/ExamSeriesImportService.java
 *   src/main/java/com/syllabai/learner/exam/ExamSeries.java (newImported :101-108,
 *       applyImport :111-125 — the two write shapes)
 *
 * Fail-closed gates, VERBATIM (each one a named anti-fabrication invariant,
 * ADR-035 Ruling — reference data deserves the same force as content):
 *   1. the dataset carries a board and a retrieval timestamp (409 each);
 *   2. EVERY row carries a source URL (https) — no citation, no row;
 *   3. entry deadlines cannot sit after the window starts, results cannot
 *      land before the window ends — a violation is a transcription error;
 *   4. series codes are kebab-case board-local keys (shape only);
 *   5. an UNPUBLISHED row may not claim a published window — estimated rows
 *      exist for "announced but not yet timetabled".
 * Java dereference order is preserved EXACTLY — a null windowStart/
 * windowEnd/published NPEs in the frozen code (no @Valid on the controller)
 * and the NPE parity (500 internal_error via the app boundary) is kept, not
 * silently "improved".
 *
 * Re-import semantics (boards DO revise windows): identical row = idempotent
 * no-op; a changed row = the measured fields move WITH their newer citation
 * (logged). The caller sees exactly what happened: imported / updated /
 * unchanged counts (the 200 body, ImportSummary :56-57).
 *
 * DB reality (packages/db/src/schema/schema.ts:1204-1224): exam_series
 * exists in the Flyway-frozen baseline with uq_exam_series (board,
 * qualification, series_code) — the lookup key of
 * findByBoardAndQualificationAndSeriesCode. NO drizzle migration is added.
 */
import type { SqlFn } from "./sql";
import type { ExamSeriesDataset, ExamSeriesRow } from "@syllabai/contracts";
import { ConflictException } from "../identity/errors";

/** Structural sql adapter — same per-module doctrine as ./sql.ts. */
export type ExamSeriesImportSqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** ExamSeriesImportService.ImportSummary (:56-57). */
export interface ExamSeriesImportSummary {
  imported: number;
  updated: number;
  unchanged: number;
}

/** exam_series row (snake_case as stored; dates as YYYY-MM-DD wire text). */
export interface ExamSeriesStoredRow {
  id: string;
  board: string;
  qualification: string;
  seriesCode: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  entryDeadline: string | null;
  resultsDate: string | null;
  published: boolean;
  estimated: boolean;
  sourceUrl: string;
  retrievedAt: string;
}

/** Composition seam: newId (UUID.randomUUID) and now (Instant.now) — overridable in tests. */
export interface ExamSeriesImportClock {
  newId(): string;
  now(): Date;
}

export const defaultExamSeriesImportClock: ExamSeriesImportClock = {
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
};

/** Java String.isBlank parity for the board gate (:61-63). */
function isBlank(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0;
}

/**
 * validateRow (:102-132) — the fail-closed gates in the EXACT Java order,
 * with the EXACT ConflictException messages and the EXACT dereference
 * order (a null windowStart/windowEnd/published dereferences before its
 * guard and NPEs — replicated by throwing, the app boundary renders 500).
 */
function validateRow(datasetBoard: string, row: ExamSeriesRow): void {
  // 1. seriesCode kebab-case (shape only — the cadence itself is DATA)
  if (row.seriesCode == null || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.seriesCode)) {
    throw new ConflictException(
      `exam-series seriesCode must be a kebab-case key: ${row.seriesCode ?? "null"}`,
    );
  }
  // 2. window_end before window_start — dereference order: windowEnd first,
  //    then windowStart (LocalDate.isBefore(null) NPEs in Java). JS string
  //    comparison on the validated YYYY-MM-DD wire form IS chronological.
  const windowEnd = requireRow(row.windowEnd, "windowEnd");
  const windowStart = requireRow(row.windowStart, "windowStart");
  if (windowEnd < windowStart) {
    throw new ConflictException(`exam-series window_end before window_start: ${row.seriesCode}`);
  }
  // 3. entry deadline cannot sit after the window starts (transcription error)
  if (row.entryDeadline != null && row.entryDeadline > windowStart) {
    throw new ConflictException(`exam-series entry deadline after window start: ${row.seriesCode}`);
  }
  // 4. results cannot land before the window ends
  if (row.resultsDate != null && row.resultsDate < windowEnd) {
    throw new ConflictException(`exam-series results date before window end: ${row.seriesCode}`);
  }
  // 5. no citation, no row (anti-fabrication for reference data)
  if (row.sourceUrl == null || !row.sourceUrl.startsWith("https://")) {
    throw new ConflictException(
      `exam-series row without an https citation fails closed: ${row.seriesCode}`,
    );
  }
  // 6. structural honesty: an estimated row still needs a window to be honest
  //    about — NOTE the frozen unboxing order: `!row.published()` dereferences
  //    FIRST (a null published NPEs → 500, mirrored by requireRow below).
  const published = requireRow(row.published, "published");
  const estimated = row.estimated === true; // Boolean.TRUE.equals(row.estimated())
  if (!published && estimated && row.windowStart == null) {
    throw new ConflictException(`estimated row without a window: ${row.seriesCode}`);
  }
  // 7. unpublished non-estimated rows are not importable
  if (!published && !estimated) {
    throw new ConflictException(
      `unpublished non-estimated rows are not importable: ${row.seriesCode}`,
    );
  }
  void datasetBoard; // the frozen signature takes the dataset; gates key on the row
}

/** NPE parity: a null dereferenced by the frozen Java code throws here. */
function requireRow<T>(value: T | null, field: string): T {
  if (value == null) {
    throw new Error(
      `Cannot invoke the frozen dereference on null ${field} — NPE parity (500 internal_error)`,
    );
  }
  return value;
}

/** sameMeasurement (:134-143) — identical row = idempotent no-op. */
function sameMeasurement(existing: ExamSeriesStoredRow, row: ExamSeriesRow): boolean {
  return (
    existing.label === row.label &&
    existing.windowStart === row.windowStart &&
    existing.windowEnd === row.windowEnd &&
    existing.entryDeadline == row.entryDeadline &&
    existing.resultsDate == row.resultsDate &&
    existing.published === row.published &&
    existing.estimated === (row.estimated === true) &&
    existing.sourceUrl === row.sourceUrl
  );
}

export class ExamSeriesImportService {
  constructor(
    private readonly sql: ExamSeriesImportSqlFn,
    private readonly clock: ExamSeriesImportClock = defaultExamSeriesImportClock,
  ) {}

  /** findByBoardAndQualificationAndSeriesCode (ExamSeriesRepository port). */
  private async findByBoardAndQualificationAndSeriesCode(
    board: string,
    qualification: string,
    seriesCode: string,
  ): Promise<ExamSeriesStoredRow | null> {
    const rows = await this.sql`
      select id, board, qualification, series_code, label, window_start,
             window_end, entry_deadline, results_date, published, estimated,
             source_url, retrieved_at
      from exam_series
      where board = ${board}
        and qualification = ${qualification}
        and series_code = ${seriesCode}`;
    if (rows.length === 0 || !rows[0]) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      board: String(r.board),
      qualification: String(r.qualification),
      seriesCode: String(r.series_code),
      label: String(r.label),
      windowStart: String(r.window_start),
      windowEnd: String(r.window_end),
      entryDeadline: r.entry_deadline == null ? null : String(r.entry_deadline),
      resultsDate: r.results_date == null ? null : String(r.results_date),
      published: r.published === true,
      estimated: r.estimated === true,
      sourceUrl: String(r.source_url),
      retrievedAt: String(r.retrieved_at),
    };
  }

  /**
   * importDataset (:59-100) — deterministic, whole-dataset, single pass,
   * fail-closed. Gates run per row BEFORE the lookup (the frozen order);
   * the dataset board/retrievedAt gates run first.
   */
  async importDataset(dataset: ExamSeriesDataset): Promise<ExamSeriesImportSummary> {
    if (isBlank(dataset.board)) {
      throw new ConflictException("exam-series dataset must name its board");
    }
    if (dataset.retrievedAt == null) {
      throw new ConflictException("exam-series dataset must carry retrievedAt");
    }
    const now = this.clock.now().toISOString();
    const board = dataset.board as string;
    let imported = 0;
    let updated = 0;
    let unchanged = 0;

    // the frozen for-loop dereferences dataset.series() unconditionally —
    // a null series list NPEs (→ 500 internal_error, replicated)
    if (dataset.series == null) {
      throw new Error(
        "Cannot iterate null dataset.series — NPE parity (500 internal_error)",
      );
    }
    for (const row of dataset.series) {
      validateRow(board, row);

      const qualification = requireRow(row.qualification, "qualification").toString();
      const existing = await this.findByBoardAndQualificationAndSeriesCode(
        board,
        qualification,
        row.seriesCode as string,
      );
      if (existing == null) {
        // ExamSeries.newImported — every row is a citation (sourceUrl +
        // retrievedAt NOT NULL, V62); created_at = updated_at = now
        await this.sql`
          insert into exam_series (id, board, qualification, series_code, label,
                                   window_start, window_end, entry_deadline,
                                   results_date, published, estimated, source_url,
                                   retrieved_at, created_at, updated_at)
          values (${this.clock.newId()}::uuid, ${board}, ${qualification},
                  ${row.seriesCode}, ${row.label}, ${row.windowStart},
                  ${row.windowEnd}, ${row.entryDeadline}, ${row.resultsDate},
                  ${row.published === true}, ${row.estimated === true},
                  ${row.sourceUrl}, ${dataset.retrievedAt}, ${now}, ${now})`;
        imported++;
      } else if (sameMeasurement(existing, row)) {
        unchanged++;
      } else {
        // applyImport (:111-125) — the measured fields move WITH their newer
        // citation; board/qualification/seriesCode are the identity and stay
        await this.sql`
          update exam_series
          set label = ${row.label},
              window_start = ${row.windowStart},
              window_end = ${row.windowEnd},
              entry_deadline = ${row.entryDeadline},
              results_date = ${row.resultsDate},
              published = ${row.published === true},
              estimated = ${row.estimated === true},
              source_url = ${row.sourceUrl},
              retrieved_at = ${dataset.retrievedAt},
              updated_at = ${now}
          where id = ${existing.id}::uuid`;
        updated++;
      }
    }
    return { imported, updated, unchanged };
  }
}
