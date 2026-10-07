/**
 * Teacher exam-series import contracts — ported from the frozen Java core
 * (T-MIG-091).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-09):
 *   src/main/java/com/syllabai/teacher/ingestion/TeacherExamSeriesImportController.java
 *       (POST /api/v1/teacher/curriculum/exam-series — T-C79, ADR-035 D1
 *        ruling: the calendar is curriculum-IMPORTED reference data)
 *   src/main/java/com/syllabai/teacher/ingestion/ExamSeriesDatasetDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/ExamSeriesImportService.java
 *       (ImportSummary — the 200 body)
 *
 * REQUEST-side Jackson facts — IMPORTANT DIFFERENCE from the draft DTOs:
 * the controller binds `@RequestBody ExamSeriesDatasetDto dataset` with NO
 * @Valid annotation, so the jakarta annotations (@NotBlank/@NotNull/
 * @NotEmpty) on the record are INERT at the web layer — Jackson binds
 * absent reference components as null and the SERVICE re-checks them
 * (board blank → 409, retrievedAt null → 409) or NPEs (→ 500, mirrored).
 * Therefore NOTHING is required at binding here: every field is
 * `.nullable().default(null)` — the fail-closed gates live in the service
 * port verbatim, not in this schema.
 *
 * TYPE failures are still binding failures: a malformed LocalDate
 * ("2026-02-30", "2026-6-1"), a malformed Instant, or an unknown
 * Qualification enum value throw HttpMessageNotReadableException →
 * 400 malformed_body "request body is not readable (check field types and
 * enum values)" — mirrored by the route's safeParse failure. Booleans
 * mirror Jackson's scalar coercion ("true"/"false" strings bind — the
 * javaJsonBool convention, content-writes.ts).
 *
 * RESPONSE side: ImportSummary record (:56-57) — three ints, no nulls.
 */
import { z } from "zod";
import { javaJsonBool } from "./content-writes";

/**
 * LocalDate wire-form binding — Jackson's LocalDate.parse (ISO-8601,
 * YYYY-MM-DD, real calendar dates only: no "2026-6-1", no "2026-02-30").
 */
export const javaLocalDateBindingSchema = z
  .string()
  .refine((s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= lengths[month - 1]!;
  });

/**
 * Instant wire-form binding — Jackson's Instant parsing (ISO-8601
 * date-time with Z or an explicit offset; a bare date or missing time is a
 * binding failure).
 */
export const javaInstantBindingSchema = z
  .string()
  .refine((s) =>
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?([Zz]|[+-]\d{2}:\d{2})$/.test(s) &&
    !Number.isNaN(new Date(s).getTime()),
  );

/**
 * SeriesRow.Qualification (:47) — the governed qualification vocabulary for
 * calendar rows (frozen in the importer, not in the DB column; widening is
 * a code change with tests, the package-gate pattern). IAL is the board's
 * own ubiquitous abbreviation for the International Advanced Level.
 */
export const examSeriesQualificationSchema = z.enum(["INTERNATIONAL_GCSE", "IAL"]);
export type ExamSeriesQualification = z.infer<typeof examSeriesQualificationSchema>;

/**
 * ExamSeriesDatasetDto.SeriesRow (:29-39) — windowStart/windowEnd are
 * @NotNull in the DTO but without @Valid they bind null and the service's
 * window comparison NPEs (→ 500, replicated verbatim).
 */
export const examSeriesRowSchema = z.object({
  qualification: examSeriesQualificationSchema.nullable().default(null),
  seriesCode: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  windowStart: javaLocalDateBindingSchema.nullable().default(null),
  windowEnd: javaLocalDateBindingSchema.nullable().default(null),
  entryDeadline: javaLocalDateBindingSchema.nullable().default(null),
  resultsDate: javaLocalDateBindingSchema.nullable().default(null),
  published: javaJsonBool.nullable().default(null),
  estimated: javaJsonBool.nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
});
export type ExamSeriesRow = z.infer<typeof examSeriesRowSchema>;

/**
 * ExamSeriesDatasetDto (:20-26) — one dataset covers one board's calendar;
 * every series row carries its own citation. series @NotEmpty is inert
 * without @Valid: null/absent binds null and the import loop NPEs (→ 500).
 */
export const examSeriesDatasetSchema = z.object({
  board: z.string().nullable().default(null),
  retrievedAt: javaInstantBindingSchema.nullable().default(null),
  series: z.array(examSeriesRowSchema).nullable().default(null),
});
export type ExamSeriesDataset = z.infer<typeof examSeriesDatasetSchema>;

/** ExamSeriesImportService.ImportSummary (:56-57) — the 200 body. */
export const examSeriesImportSummarySchema = z.object({
  imported: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
});
export type ExamSeriesImportSummary = z.infer<typeof examSeriesImportSummarySchema>;
