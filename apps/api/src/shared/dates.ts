/**
 * DATE-column wire serialization — the T-MIG-067 R-067-B law (r1-contracts).
 *
 * The frozen core types these columns as java.time.LocalDate
 * (CourseExamTargetView.java:25-28, served by LearnerExamSeriesController
 * :59-117) and Spring Boot's Jackson2ObjectMapperBuilder disables
 * WRITE_DATES_AS_TIMESTAMPS by default, so a LocalDate passes through the
 * wire as the ISO_LOCAL_DATE bare form: "2026-10-08". Golden pins:
 * w4-exam-series-qualification-filter-200 / w4-exam-series-seeded-calendar-200.
 *
 * The v2 driver posture diverged: packages/db instantiates postgres.js with
 * no types override (client.ts:88 — R2's lane, consumed read-only here), and
 * postgres.js parses DATE(1082) into a JS Date at UTC midnight on the live
 * instrument. A Date reaching JSON.stringify renders
 * "2026-10-08T00:00:00.000Z" — the captured divergence. The divergence was
 * posture-dependent: the fakeSql test pins carry plain strings, so the unit
 * battery stayed green while the live wire diverged (neon-replay runs
 * #10/#11; R0/R6-RUN9-TRIAGE §3-R3).
 *
 * Contract (date-serialization-only — zero other behavior change):
 *   - string            → identity. The fakeSql pins and text-mode driver
 *                         postures already carry the wire form; every
 *                         existing string row stays byte-identical.
 *   - Date              → the UTC calendar date part ("2026-10-08"). The
 *                         captured live-instrument artifact pins the driver
 *                         posture at UTC midnight (ISO …T00:00:00.000Z), so
 *                         the ISO date part IS the LocalDate the column
 *                         carries.
 *   - null / undefined  → null (the #86 .nullable() law on
 *                         entryDeadline/resultsDate — honest pass-through).
 */
export function toLocalDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
