/**
 * T-MIG-091 route + service tests — the observable HTTP contract of
 * TeacherExamSeriesImportController (:32-35, POST
 * /api/v1/teacher/curriculum/exam-series, frozen @ 6cad6ef) and the
 * ExamSeriesImportService port (services/curriculum/exam-series-import.ts),
 * over an IN-MEMORY Hono app wiring the REAL curriculum module over stubbed
 * sql (no Neon) — the T-MIG-021 route-test pattern.
 *
 * Pinned laws (each verified against the frozen sources):
 *   - the 200 body is the ImportSummary record (:56-57) — {imported,
 *     updated, unchanged}, pinned against the canonical
 *     examSeriesImportSummarySchema
 *   - the fail-closed gates answer VERBATIM 409s in the EXACT Java order:
 *     dataset board/retrievedAt first, then per-row (kebab seriesCode →
 *     window order → entry deadline → results date → https citation →
 *     estimated-without-window → unpublished non-estimated)
 *   - the NPE dereference parity: a null windowEnd (LocalDate.isBefore
 *     receiver) / null published (!row.published() unboxing) / null
 *     dataset.series (for-loop) die in the frozen code → 500
 *     internal_error via the app boundary — replicated, never "improved"
 *   - binding is Jackson-WITHOUT-@Valid parity: absent fields bind null
 *     (nothing is required at the web layer), but TYPE failures (unknown
 *     Qualification enum, malformed LocalDate "2026-02-30"/"2026-6-1",
 *     malformed Instant, non-JSON body) are HttpMessageNotReadableException
 *     → 400 malformed_body verbatim
 *   - re-import semantics: identical row = idempotent no-op (no writes);
 *     a changed row = the measured fields move WITH their newer citation
 *     (applyImport :111-125); a new row = newImported (citation +
 *     retrievedAt NOT NULL, created_at = updated_at = now)
 *   - the authz shells: TEACHER/ADMIN (SecurityConfig /api/v1/teacher/**);
 *     anonymous → Boot 401, student → Boot 403
 *   - DB reality: exam_series exists in the Flyway-frozen baseline
 *     (packages/db/src/schema/schema.ts:1204) with uq_exam_series
 *     (board, qualification, series_code) — the lookup key. No migration.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherCurriculumRouter } from "../../src/routes/curriculum";
import { buildCurriculumModule } from "../../src/services/curriculum";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  examSeriesDatasetSchema,
  examSeriesImportSummarySchema,
  examSeriesRowSchema,
  type ExamSeriesRow,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "./helpers";

// ── fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-09T10:00:00.000Z");
const NOW_ISO = "2026-10-09T10:00:00.000Z";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";
const clock = { newId: () => NEW_ID, now: () => NOW };

const row = (over: Partial<Record<string, unknown>> = {}): ExamSeriesRow =>
  examSeriesRowSchema.parse({
    qualification: "IAL",
    seriesCode: "january-2026",
    label: "January 2026",
    windowStart: "2026-01-05",
    windowEnd: "2026-01-23",
    entryDeadline: "2025-12-01",
    resultsDate: "2026-03-05",
    published: true,
    estimated: false,
    sourceUrl: "https://qualifications.pearson.com/timetables",
    ...over,
  });

const dataset = (series: ExamSeriesRow[] | null, over: Partial<Record<string, unknown>> = {}) =>
  examSeriesDatasetSchema.parse({
    board: "Pearson Edexcel",
    retrievedAt: "2026-10-09T06:00:00.000Z",
    series,
    ...over,
  });

const storedRow = (seriesCode: string, over: Partial<Record<string, unknown>> = {}) => ({
  id: "aa000000-0000-4000-8000-000000000101",
  board: "Pearson Edexcel",
  qualification: "IAL",
  series_code: seriesCode,
  label: "January 2026 (old)",
  window_start: "2026-01-12",
  window_end: "2026-01-30",
  entry_deadline: "2025-12-01",
  results_date: null,
  published: true,
  estimated: false,
  source_url: "https://qualifications.pearson.com/old",
  retrieved_at: "2026-09-01T00:00:00Z",
  ...over,
});

// ── the exam-series SQL shapes (verbatim renderings) ────────────────────────

const lookupRoute = (rowsByCode: Record<string, Array<Record<string, unknown>>>): Route => ({
  match:
    /^select id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, published, estimated, source_url, retrieved_at from exam_series where board = \? and qualification = \? and series_code = \?$/,
  rows: [],
  rowsFor: (p) => rowsByCode[String(p[2])] ?? [],
});

const insertRoute = (): Route => ({
  match: /^insert into exam_series \(id, board, qualification, series_code, label, window_start, window_end, entry_deadline, results_date, published, estimated, source_url, retrieved_at, created_at, updated_at\)/,
  rows: [],
});

const updateRoute = (): Route => ({
  match:
    /^update exam_series set label = \? , window_start = \? , window_end = \? , entry_deadline = \? , results_date = \? , published = \? , estimated = \? , source_url = \? , retrieved_at = \? , updated_at = \? where id = \? ::uuid$/,
  rows: [],
});

// ── app assembly (mirrors apps/api/src/index.ts) ────────────────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const sql = fakeSql(routes);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/curriculum", createTeacherCurriculumRouter(buildCurriculumModule(sql)));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    return c.json({ status: 500, error: "internal_error", message: String((err as Error).message) }, 500 as const);
  });
  return { app, sql };
}

const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: "aa000000-0000-4000-8000-000000000001",
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asStudent = (): AuthRow => ({
  email: "s@example.edu",
  userId: "bb000000-0000-4000-8000-000000000001",
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const URL = "/api/v1/teacher/curriculum/exam-series";

// ── service-level pins (the fail-closed gate chain, in the EXACT order) ─────

describe("ExamSeriesImportService — the fail-closed gates (verbatim, ordered)", () => {
  test("dataset gates first: blank board / absent retrievedAt → 409 verbatim", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    for (const [body, message] of [
      [{ board: "   ", retrievedAt: "2026-10-09T06:00:00.000Z", series: [] }, "exam-series dataset must name its board"],
      [{ board: "Pearson Edexcel", series: [] }, "exam-series dataset must carry retrievedAt"],
    ] as Array<[Record<string, unknown>, string]>) {
      const res = await app.request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).message).toBe(message);
    }
    expect(sql.queries).toHaveLength(0);
  });

  test("row gates in Java order: kebab → window order → deadline → results → citation", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const cases: Array<[ExamSeriesRow, string]> = [
      [row({ seriesCode: "January_2026" }), "exam-series seriesCode must be a kebab-case key: January_2026"],
      [row({ windowEnd: "2026-01-04" }), "exam-series window_end before window_start: january-2026"],
      [row({ entryDeadline: "2026-01-06" }), "exam-series entry deadline after window start: january-2026"],
      [row({ resultsDate: "2026-01-22" }), "exam-series results date before window end: january-2026"],
      [row({ sourceUrl: "http://insecure.example/tt" }), "exam-series row without an https citation fails closed: january-2026"],
      [row({ published: false, estimated: false }), "unpublished non-estimated rows are not importable: january-2026"],
    ];
    for (const [badRow, message] of cases) {
      const res = await app.request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataset([badRow])),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).message).toBe(message);
    }
    expect(sql.queries).toHaveLength(0); // fail-closed BEFORE any statement
  });

  test("estimated rows: the announced-but-not-timetabled shape imports cleanly", async () => {
    const { app, sql } = makeApp(asTeacher, [lookupRoute({}), insertRoute()]);
    // unpublished + estimated + window present = the legitimate announced row
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset([row({ published: false, estimated: true, resultsDate: null })])),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, updated: 0, unchanged: 0 });
    expect(sql.queries.filter((q) => q.startsWith("insert into exam_series"))).toHaveLength(1);
  });

  test("NPE dereference parity: null windowEnd / null published / null series → 500", async () => {
    const { app, sql } = makeApp(asTeacher, [lookupRoute({}), insertRoute()]);
    for (const badRow of [
      row({ windowEnd: null }), // LocalDate.isBefore receiver — dies FIRST
      row({ published: null }), // !row.published() unboxing
    ]) {
      const res = await app.request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataset([badRow])),
      });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("internal_error");
    }
    // the for-loop dereference of a null series list (the @NotEmpty is inert
    // without @Valid — null binds and the loop NPEs)
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset(null)),
    });
    expect(res.status).toBe(500);
    expect(sql.queries).toHaveLength(0); // no partial writes from a dead dataset
  });
});

// ── the import outcomes (:59-100) ───────────────────────────────────────────

describe("ExamSeriesImportService — imported / unchanged / updated", () => {
  test("new rows import with the citation + dataset retrievedAt (newImported)", async () => {
    const { app, sql } = makeApp(asTeacher, [lookupRoute({}), insertRoute()]);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset([row(), row({ seriesCode: "june-2026", label: "June 2026" })])),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(examSeriesImportSummarySchema.safeParse(body).success).toBeTrue();
    expect(body).toEqual({ imported: 2, updated: 0, unchanged: 0 });
    const inserts = sql.queries.filter((q) => q.startsWith("insert into exam_series"));
    expect(inserts).toHaveLength(2);
  });

  test("identical row = the idempotent no-op (unchanged, zero writes)", async () => {
    const existing = {
      ...storedRow("january-2026"),
      label: "January 2026",
      window_start: "2026-01-05",
      window_end: "2026-01-23",
      results_date: "2026-03-05",
      source_url: "https://qualifications.pearson.com/timetables",
    };
    const { app, sql } = makeApp(asTeacher, [lookupRoute({ "january-2026": [existing] })]);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset([row()])),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 0, updated: 0, unchanged: 1 });
    expect(sql.queries.filter((q) => q.startsWith("insert into") || q.startsWith("update "))).toHaveLength(0);
  });

  test("changed row = the measured fields move WITH the newer citation (applyImport)", async () => {
    const existing = storedRow("january-2026");
    const { app, sql } = makeApp(asTeacher, [lookupRoute({ "january-2026": [existing] }), updateRoute()]);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset([row({ resultsDate: "2026-03-12", sourceUrl: "https://qualifications.pearson.com/revised" })])),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 0, updated: 1, unchanged: 0 });
    const update = sql.queries.find((q) => q.startsWith("update exam_series"));
    expect(update).toBeDefined();
  });

  test("a mixed dataset counts each outcome once (the caller sees exactly what happened)", async () => {
    const changed = storedRow("january-2026");
    const same = {
      ...storedRow("june-2026"),
      label: "June 2026",
      window_start: "2026-05-11",
      window_end: "2026-06-12",
      results_date: "2026-08-13",
      source_url: "https://qualifications.pearson.com/june",
    };
    const { app, sql } = makeApp(asTeacher, [
      lookupRoute({ "january-2026": [changed], "june-2026": [same] }),
      insertRoute(),
      updateRoute(),
    ]);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        dataset([
          row(), // changed (stored label differs)
          row({ seriesCode: "june-2026", label: "June 2026", windowStart: "2026-05-11", windowEnd: "2026-06-12", resultsDate: "2026-08-13", sourceUrl: "https://qualifications.pearson.com/june" }), // identical
          row({ seriesCode: "november-2026", label: "November 2026", windowStart: "2026-11-02", windowEnd: "2026-11-20", resultsDate: "2027-01-14" }), // new
        ]),
      ),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, updated: 1, unchanged: 1 });
    expect(sql.queries.filter((q) => q.startsWith("insert into exam_series"))).toHaveLength(1);
    expect(sql.queries.filter((q) => q.startsWith("update exam_series"))).toHaveLength(1);
  });
});

// ── route-level contract (binding + shells) ─────────────────────────────────

describe("POST /api/v1/teacher/curriculum/exam-series — the wire", () => {
  test("anonymous → Boot 401 body; student → Boot 403 body", async () => {
    const { app: anonApp } = makeApp(anon, []);
    const a = await anonApp.request(URL, { method: "POST", body: "{}" });
    expect(a.status).toBe(401);
    expect((await a.json()).error).toBe("Unauthorized");

    const { app: studentApp } = makeApp(asStudent, []);
    const s = await studentApp.request(URL, { method: "POST", body: "{}" });
    expect(s.status).toBe(403);
    expect((await s.json()).error).toBe("Forbidden");
  });

  test("binding failures → 400 malformed_body verbatim (Jackson-without-@Valid parity)", async () => {
    const { app } = makeApp(asTeacher, []);
    for (const body of [
      "{not json", // unparseable body
      JSON.stringify({ board: "b", retrievedAt: "2026-10-09T06:00:00Z", series: [{ qualification: "GCSE" }] }), // unknown enum
      JSON.stringify({ board: "b", retrievedAt: "2026-10-09T06:00:00Z", series: [{ windowStart: "2026-6-1" }] }), // malformed LocalDate
      JSON.stringify({ board: "b", retrievedAt: "2026-10-09T06:00:00Z", series: [{ windowStart: "2026-02-30" }] }), // impossible date
      JSON.stringify({ board: "b", retrievedAt: "2026-10-09" }), // bare date is not an Instant
      JSON.stringify({ board: "b", retrievedAt: "2026-10-09T06:00:00Z", series: [{ published: "yes" }] }), // bad boolean
    ]) {
      const res = await app.request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(400);
      const err = await res.json();
      expect(err.error).toBe("malformed_body");
      expect(err.message).toBe("request body is not readable (check field types and enum values)");
    }
  });

  test("happy 200: the ImportSummary record over the REAL service", async () => {
    const { app, sql } = makeApp(asTeacher, [lookupRoute({}), insertRoute()]);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset([row()])),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(examSeriesImportSummarySchema.safeParse(body).success).toBeTrue();
    expect(body).toEqual({ imported: 1, updated: 0, unchanged: 0 });
    expect(sql.queries.some((q) => q.includes("from exam_series where board ="))).toBeTrue();
  });
});
