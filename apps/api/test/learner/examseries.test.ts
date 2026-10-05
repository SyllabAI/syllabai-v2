/**
 * T-MIG-043 tranche-1 pins — exam-series surfaces (picker, target-series
 * lifecycle, targets reader) over the stubbed SqlFn (033/041 template).
 * Verbatim messages pinned against the frozen core @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import {
  LearnerSurfaceHttpError,
  clearTargetSeries,
  listExamSeries,
  targetSeries,
  targetsFor,
  validateCourseSlug,
} from "../../src/services/learner";
import { fakeSql, type Route } from "./helpers";

const LEARNER = "22222222-2222-4222-8222-222222222222";
const SERIES_ID = "33333333-3333-4333-8333-333333333333";
const ENROL_ID = "44444444-4444-4444-8444-444444444444";
const TODAY = "2026-06-01";

const seriesRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: SERIES_ID,
  board: "PEARSON_EDEXCEL",
  qualification: "GCSE",
  series_code: "2027-SUM",
  label: "Summer 2027",
  window_start: "2027-05-11",
  window_end: "2027-06-24",
  entry_deadline: "2027-02-15",
  results_date: "2027-08-19",
  estimated: false,
  source_url: "https://example.invalid/series",
  retrieved_at: "2026-01-01T00:00:00.000Z",
  published: true,
  ...overrides,
});

const allSeriesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, estimated, source_url, retrieved_at, published\s*from exam_series where published = \?\s*order by window_start asc$/,
  rows,
});
const boardSeriesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /where board = \? and qualification = \? and published = \?/,
  rows,
});
const seriesByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, estimated, source_url, retrieved_at, published from exam_series where id in \(/,
  rows,
});
const seriesOneRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, estimated, source_url, retrieved_at, published from exam_series where id = \?$/,
  rows,
});
const enrolmentRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, learner_id, course_slug, target_series_id, created_at, updated_at\s*from learner_course_enrolments/,
  rows,
});

// ── slug law (:112-118) ─────────────────────────────────────────────────────

describe("course slug law", () => {
  test("kebab-case registry key or 400 verbatim", () => {
    expect(validateCourseSlug("gcse-maths-2027")).toBe("gcse-maths-2027");
    expect(() => validateCourseSlug("GCSE-Maths")).toThrow(
      "course slug must be a kebab-case registry key",
    );
    expect(() => validateCourseSlug("gcse--maths")).toThrow(
      "course slug must be a kebab-case registry key",
    );
    expect(() => validateCourseSlug(null)).toThrow("course slug must be a kebab-case registry key");
    try {
      validateCourseSlug("GCSE");
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).status).toBe(400);
    }
  });
});

// ── GET /exam-series (:61-71) ───────────────────────────────────────────────

describe("exam-series picker", () => {
  test("no qualification -> all published, windowStart asc; no published flag on the wire", async () => {
    const sql = fakeSql([allSeriesRoute([seriesRow()])]);
    const rows = await listExamSeries(sql, null);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({
      id: SERIES_ID,
      board: "PEARSON_EDEXCEL",
      qualification: "GCSE",
      seriesCode: "2027-SUM",
      label: "Summer 2027",
      windowStart: "2027-05-11",
      windowEnd: "2027-06-24",
      entryDeadline: "2027-02-15",
      resultsDate: "2027-08-19",
      estimated: false,
      sourceUrl: "https://example.invalid/series",
      retrievedAt: "2026-01-01T00:00:00.000Z",
    });
    expect("published" in rows[0]!).toBe(false);
  });

  test("blank qualification behaves like absent (isBlank law)", async () => {
    const sql = fakeSql([allSeriesRoute([])]);
    await listExamSeries(sql, "   ");
    expect(sql.queries[0]).toContain("where published = ?");
    expect(sql.queries[0]).not.toContain("board = ?");
  });

  test("qualification present -> the PEARSON_EDEXCEL board-qualified slice", async () => {
    const sql = fakeSql([boardSeriesRoute([seriesRow()])]);
    await listExamSeries(sql, "GCSE");
    expect(sql.queries[0]).toContain("where board = ? and qualification = ? and published = ?");
  });
});

// ── PUT /courses/{slug}/target-series (:74-92) ──────────────────────────────

describe("target-series lifecycle", () => {
  test("PUT on a fresh course: create enrolment + retarget update, view derived on read", async () => {
    const sql = fakeSql([
      seriesOneRoute([seriesRow()]),
      enrolmentRoute([]), // no existing enrolment
      { match: /^insert into learner_course_enrolments/, rows: [] },
      { match: /^update learner_course_enrolments/, rows: [] },
    ]);
    const view = await targetSeries(
      sql,
      { learnerId: LEARNER, courseSlug: "gcse-maths-2027", seriesId: SERIES_ID },
      { now: () => new Date("2026-06-01T12:00:00.000Z"), newId: () => ENROL_ID, today: TODAY },
    );
    // the view: countdowns derived against TODAY (ADR-031, never persisted)
    expect(view).toMatchObject({
      courseSlug: "gcse-maths-2027",
      seriesId: SERIES_ID,
      seriesCode: "2027-SUM",
      label: "Summer 2027",
      daysToWindowStart: 344, // 2026-06-01 -> 2027-05-11
      daysToWindowEnd: 388, // 2026-06-01 -> 2027-06-24
      entryDeadlinePassed: false,
    });
    expect(sql.queries.length).toBe(4);
    expect(sql.queries[2]).toMatch(/^insert into learner_course_enrolments/);
    expect(sql.queries[3]).toMatch(/^update learner_course_enrolments/);
    expect(sql.queries[3]).toContain("target_series_id = ?");
  });

  test("PUT on an existing enrolment: no INSERT, retarget is idempotent", async () => {
    const sql = fakeSql([
      seriesOneRoute([seriesRow()]),
      enrolmentRoute([
        {
          id: ENROL_ID,
          learner_id: LEARNER,
          course_slug: "gcse-maths-2027",
          target_series_id: SERIES_ID,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ]),
      { match: /^update learner_course_enrolments/, rows: [] },
    ]);
    await targetSeries(
      sql,
      { learnerId: LEARNER, courseSlug: "gcse-maths-2027", seriesId: SERIES_ID },
      { now: () => new Date("2026-06-01T12:00:00.000Z"), newId: () => ENROL_ID, today: TODAY },
    );
    expect(sql.queries.length).toBe(3);
    expect(sql.queries.some((q) => q.startsWith("insert"))).toBe(false);
  });

  test("unknown series -> 404 verbatim (:78-80)", async () => {
    const sql = fakeSql([seriesOneRoute([])]);
    try {
      await targetSeries(
        sql,
        { learnerId: LEARNER, courseSlug: "gcse-maths-2027", seriesId: SERIES_ID },
        { now: () => new Date(), newId: () => ENROL_ID, today: TODAY },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).status).toBe(404);
      expect((e as LearnerSurfaceHttpError).message).toBe(`exam series ${SERIES_ID} does not exist`);
    }
  });

  test("unpublished series -> 400 with the seriesCode (:81-84)", async () => {
    const sql = fakeSql([seriesOneRoute([seriesRow({ published: false, series_code: "2026-NOV-DRAFT" })])]);
    try {
      await targetSeries(
        sql,
        { learnerId: LEARNER, courseSlug: "gcse-maths-2027", seriesId: SERIES_ID },
        { now: () => new Date(), newId: () => ENROL_ID, today: TODAY },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).status).toBe(400);
      expect((e as LearnerSurfaceHttpError).message).toBe(
        "only published exam series can be targeted: 2026-NOV-DRAFT",
      );
    }
  });

  test("bad slug short-circuits before ANY query", async () => {
    const sql = fakeSql([]);
    await targetSeries(
      sql,
      { learnerId: LEARNER, courseSlug: "Bad Slug", seriesId: SERIES_ID },
      { now: () => new Date(), newId: () => ENROL_ID, today: TODAY },
    ).catch(() => undefined);
    expect(sql.queries.length).toBe(0);
  });
});

// ── DELETE (:95-103) ────────────────────────────────────────────────────────

describe("clear target-series", () => {
  test("present row: retarget(null) — the enrolment row remains", async () => {
    const sql = fakeSql([
      enrolmentRoute([
        {
          id: ENROL_ID,
          learner_id: LEARNER,
          course_slug: "gcse-maths-2027",
          target_series_id: SERIES_ID,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ]),
      { match: /^update learner_course_enrolments/, rows: [] },
    ]);
    await clearTargetSeries(sql, { learnerId: LEARNER, courseSlug: "gcse-maths-2027" }, {
      now: () => new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(sql.queries[1]).toContain("target_series_id = ?");
    expect(sql.queries[1]).toContain("where id = ?");
  });

  test("absent row: silent no-op, 204-always posture, zero writes", async () => {
    const sql = fakeSql([enrolmentRoute([])]);
    await clearTargetSeries(sql, { learnerId: LEARNER, courseSlug: "gcse-maths-2027" }, {
      now: () => new Date(),
    });
    expect(sql.queries.length).toBe(1);
    expect(sql.queries.some((q) => /^(insert|update)/i.test(q))).toBe(false);
  });
});

// ── ExamTargetReader.targetsFor (:31-52) ────────────────────────────────────

describe("targetsFor reader", () => {
  test("no declared targets -> empty without a series query", async () => {
    const sql = fakeSql([enrolmentRoute([])]);
    const rows = await targetsFor(sql, LEARNER, TODAY);
    expect(rows).toEqual([]);
    expect(sql.queries.length).toBe(1);
  });

  test("declared targets: batch series fetch, vanished rows filtered, countdowns derived", async () => {
    const other = "55555555-5555-4555-8555-555555555555";
    const sql = fakeSql([
      enrolmentRoute([
        {
          id: ENROL_ID,
          learner_id: LEARNER,
          course_slug: "gcse-maths-2027",
          target_series_id: SERIES_ID,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          learner_id: LEARNER,
          course_slug: "gcse-physics-2027",
          target_series_id: other, // vanished series
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ]),
      seriesByIdRoute([seriesRow()]), // only SERIES_ID comes back
    ]);
    const rows = await targetsFor(sql, LEARNER, TODAY);
    expect(rows.length).toBe(1); // the vanished-series row is filtered
    expect(rows[0]!.courseSlug).toBe("gcse-maths-2027");
    expect(rows[0]!.daysToWindowStart).toBe(344);
    // entryDeadlinePassed: 2027-02-15 is NOT before 2026-06-01
    expect(rows[0]!.entryDeadlinePassed).toBe(false);
  });

  test("entryDeadlinePassed flips only when the deadline is strictly before today", async () => {
    const sql = fakeSql([
      enrolmentRoute([
        {
          id: ENROL_ID,
          learner_id: LEARNER,
          course_slug: "gcse-maths-2027",
          target_series_id: SERIES_ID,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ]),
      seriesByIdRoute([seriesRow({ entry_deadline: "2026-05-31" })]), // yesterday vs TODAY
    ]);
    const rows = await targetsFor(sql, LEARNER, TODAY);
    expect(rows[0]!.entryDeadlinePassed).toBe(true);
  });
});
