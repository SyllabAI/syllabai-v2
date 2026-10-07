/**
 * T-MIG-082 tranche-A route tests (R0) — the observable HTTP contract of
 * TeachingCoverageController (frozen :60-160 @ 6cad6ef), over an IN-MEMORY
 * Hono app wiring the REAL coverage service (services/knowledge/index.ts —
 * the 043-band port) through fakeSql. ZERO service edits.
 *
 * Pinned here (the WIRE laws):
 *   - the authz shell: /api/v1/teacher/** requires TEACHER/ADMIN — anonymous
 *     401 Boot body, authenticated STUDENT 403, BEFORE any path/query law;
 *   - the body-validation-before-gates order (Spring @Valid fires before the
 *     method body): a blank status → 400 validation_failed
 *     "status: must not be blank" even on an unknown class; a >500 note →
 *     "note: size must be between 0 and 500"; a wrong-type field → 400
 *     malformed_body (binding beats every constraint, the F-0 law);
 *   - the gate ORDER on a valid body: 404 "class not found" → 403 "this
 *     class belongs to another teacher" → 409 "this class is archived —
 *     reopen it before marking coverage" (the WRITE gate) → 400 "status
 *     must be 'taught' or 'not-taught'" (service parse) → 404 "specification
 *     point not found" → 400 "that node is not a specification point" (the
 *     V39 invariant);
 *   - GET routes carry NO archived-class gate (409 is a WRITE gate only —
 *     a teacher may inspect a past class's coverage);
 *   - the identical re-mark is the idempotent no-op: 200 with the unchanged
 *     row, no INSERT issued;
 *   - malformed path UUIDs → 400 bad_request "malformed request";
 *   - PUT returns 200 (the frozen @PutMapping default — NOT 201).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createCoverageRouter, type CoverageDeps } from "../../src/routes/coverage";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SubmitClock } from "../../src/services/selfmark";

// ── fixed-constant ids ───────────────────────────────────────────────────────

const TEACHER = "ee000000-0000-4000-8000-000000000011";
const OTHER = "ee000000-0000-4000-8000-000000000022";
const CLASS_A = "ec000000-0000-4000-8000-0000000000c1";
const SPEC_POINT = "ea000000-0000-4000-8000-00000000a001"; // SUBTOPIC + applicability
const NOT_SPEC = "ea000000-0000-4000-8000-00000000a002"; // SUBTOPIC, applicability null
const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";

const NOW = new Date(NOW_TEXT);
const clock: SubmitClock = { newId: () => "7e571d00-0000-4000-8000-00000000000b", now: () => NOW };

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  status: "ACTIVE",
  teacher_id: TEACHER,
  ...over,
});

const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SPEC_POINT,
  code: "4CH1/1.1a",
  node_type: "SUBTOPIC",
  title: "Titration",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: { papers: ["1CH1"], tier: "foundation" },
  ...over,
});

const coverageRow = (over: Partial<Record<string, unknown>> = {}) => ({
  class_id: CLASS_A,
  spec_point_node_id: SPEC_POINT,
  status: "TAUGHT",
  marked_by: TEACHER,
  marked_at: T1,
  note: null,
  created_at: T0,
  ...over,
});

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const nodesByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const listRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
  rows,
});

const historyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select status, previous_status, actor_id, note, created_at from teaching_coverage_events where class_id = \? ::uuid and spec_point_node_id = \? ::uuid order by created_at desc$/,
  rows,
});

const existingRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid and spec_point_node_id = \? ::uuid$/,
  rows,
});

const insertCoverage = (): Route => ({
  match: /insert into teaching_coverage \(/,
  rows: [],
});

const insertEvent = (): Route => ({
  match: /insert into teaching_coverage_events \(/,
  rows: [],
});

type AuthFn = (c: Context) => Record<string, unknown> | null;
const asTeacher = () => ({ email: "t@example.edu", userId: TEACHER, roles: ["TEACHER"], tokenVersion: 1 });
const asStudent = () => ({ email: "s@example.edu", userId: OTHER, roles: ["STUDENT"], tokenVersion: 1 });
const anon = () => null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const deps: CoverageDeps = { sql: fakeSql(routes), clock };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createCoverageRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, deps };
}

const base = "/api/v1/teacher/classes";
const authed = { headers: { Authorization: "Bearer x" } };
const boot401 = (path: string) => ({
  timestamp: expect.any(String),
  status: 401,
  error: "Unauthorized",
  path,
});

const VALID_BODY = JSON.stringify({ status: "taught", note: "covered with the class" });

// ── shells and reads ─────────────────────────────────────────────────────────

describe("coverage router — shells, param laws, reads", () => {
  test("anonymous → Boot 401 with the path, BEFORE the classId shape is judged", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request(`${base}/${CLASS_A}/coverage`, authed);
    const res401 = await app.request(`${base}/not-a-uuid/coverage`);
    expect(res.status).toBe(401);
    expect(res401.status).toBe(401);
    expect(await res401.json()).toMatchObject(boot401(`${base}/not-a-uuid/coverage`));
  });

  test("authenticated STUDENT → Boot 403 (TEACHER/ADMIN only)", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request(`${base}/${CLASS_A}/coverage`, authed);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ status: 403, error: "Forbidden" });
  });

  test("malformed classId → 400 bad_request 'malformed request', NO class query", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/nope/coverage`, authed);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: 400, error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("GET list → 200 only what teachers asserted, spec_point asc, node titles joined", async () => {
    const { app } = makeApp(asTeacher, [
      classRoute([classRow()]),
      listRoute([
        coverageRow({ spec_point_node_id: SPEC_POINT }),
        coverageRow({ spec_point_node_id: NOT_SPEC, status: "NOT_TAUGHT", marked_at: T0 }),
      ]),
      nodesByIdsRoute([nodeRow(), nodeRow({ id: NOT_SPEC, code: "4CH1/1.1b", title: "Half equations", applicability: null })]),
    ]);
    const res = await app.request(`${base}/${CLASS_A}/coverage`, authed);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { specPointNodeId: string }) => r.specPointNodeId)).toEqual([SPEC_POINT, NOT_SPEC]);
    expect(rows[0]).toMatchObject({ status: "taught", code: "4CH1/1.1a", markedBy: TEACHER, firstMarkedAt: "2026-10-01T10:00:00.000Z" });
  });

  test("GET list on an ARCHIVED class still serves — NO archived gate on reads", async () => {
    const { app } = makeApp(asTeacher, [
      classRoute([classRow({ status: "ARCHIVED" })]),
      listRoute([]),
    ]);
    const res = await app.request(`${base}/${CLASS_A}/coverage`, authed);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("GET history → 200 newest first, verbatim events", async () => {
    const { app } = makeApp(asTeacher, [
      classRoute([classRow()]),
      historyRoute([
        { status: "TAUGHT", previous_status: "NOT_TAUGHT", actor_id: TEACHER, note: "re-covered", created_at: T1 },
        { status: "NOT_TAUGHT", previous_status: null, actor_id: TEACHER, note: null, created_at: T0 },
      ]),
    ]);
    const res = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}/history`, authed);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { status: "taught", previousStatus: "not-taught", actorId: TEACHER, note: "re-covered", createdAt: "2026-10-02T10:00:00.000Z" },
      { status: "not-taught", previousStatus: null, actorId: TEACHER, note: null, createdAt: "2026-10-01T10:00:00.000Z" },
    ]);
  });
});

// ── the PUT mark laws ────────────────────────────────────────────────────────

describe("coverage router — PUT /:classId/coverage/:specPointNodeId", () => {
  test("happy mark (fresh row) → 200 CoverageRowView, exactly one audit event", async () => {
    const { app, deps } = makeApp(asTeacher, [
      classRoute([classRow()]),
      nodesByIdRoute([nodeRow()]),
      existingRoute([]),
      insertCoverage(),
      insertEvent(),
    ]);
    const res = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, {
      method: "PUT",
      ...authed,
      body: VALID_BODY,
    });
    expect(res.status).toBe(200);
    const row = await res.json();
    expect(row).toMatchObject({ specPointNodeId: SPEC_POINT, status: "taught", note: "covered with the class", markedAt: NOW_ISO });
    expect((deps.sql as unknown as { queries: string[] }).queries.filter((q) => q.startsWith("insert into")).length).toBe(2); // state row + audit event
  });

  test("the identical re-mark is the honest no-op: 200, NO insert", async () => {
    const { app, deps } = makeApp(asTeacher, [
      classRoute([classRow()]),
      nodesByIdRoute([nodeRow()]),
      existingRoute([coverageRow({ note: "covered with the class" })]),
    ]);
    const res = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, {
      method: "PUT",
      ...authed,
      body: VALID_BODY,
    });
    expect(res.status).toBe(200);
    expect((deps.sql as unknown as { queries: string[] }).queries.some((q) => q.startsWith("insert into"))).toBe(false);
  });

  test("gate order on a VALID body: 404 → 403 → 409 → service-parse 400 → 404 node → V39 400", async () => {
    // 404: unknown class
    const a = makeApp(asTeacher, [classRoute([])]);
    const r404 = await a.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(r404.status).toBe(404);
    expect(await r404.json()).toMatchObject({ message: "class not found" });

    // 403: another teacher's class
    const b = makeApp(asTeacher, [classRoute([classRow({ teacher_id: OTHER })])]);
    const r403 = await b.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(r403.status).toBe(403);
    expect(await r403.json()).toMatchObject({ message: "this class belongs to another teacher" });

    // 409: archived (the WRITE gate the GET routes deliberately lack)
    const c = makeApp(asTeacher, [classRoute([classRow({ status: "ARCHIVED" })])]);
    const r409 = await c.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(r409.status).toBe(409);
    expect(await r409.json()).toMatchObject({ message: "this class is archived — reopen it before marking coverage" });

    // 400: status outside the enum (the service's parse law)
    const d = makeApp(asTeacher, [classRoute([classRow()])]);
    const rParse = await d.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: JSON.stringify({ status: "partially" }) });
    expect(rParse.status).toBe(400);
    expect(await rParse.json()).toMatchObject({ error: "bad_request", message: "status must be 'taught' or 'not-taught'" });

    // 404: unknown node
    const e = makeApp(asTeacher, [classRoute([classRow()]), nodesByIdRoute([])]);
    const rNode = await e.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(rNode.status).toBe(404);
    expect(await rNode.json()).toMatchObject({ message: "specification point not found" });

    // 400: the V39 invariant — applicability populated ONLY on spec-point rows
    const f = makeApp(asTeacher, [classRoute([classRow()]), nodesByIdRoute([nodeRow({ applicability: null })])]);
    const rV39 = await f.app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(rV39.status).toBe(400);
    expect(await rV39.json()).toMatchObject({ message: "that node is not a specification point" });
  });

  test("BODY validation fires BEFORE the gates (Spring @Valid order): blank status 400 on an unknown class", async () => {
    const { app, deps } = makeApp(asTeacher, []); // no class route — a class query would throw unexpected
    const blank = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: JSON.stringify({ status: "   " }) });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toMatchObject({ error: "validation_failed", message: "status: must not be blank" });

    const absent = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, { method: "PUT", ...authed, body: JSON.stringify({}) });
    expect(absent.status).toBe(400);
    expect(await absent.json()).toMatchObject({ error: "validation_failed", message: "status: must not be blank" });

    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0); // the body law precedes every gate
  });

  test("note longer than 500 → 400 validation_failed 'note: size must be between 0 and 500'", async () => {
    const { app } = makeApp(asTeacher, [classRoute([classRow()])]);
    const res = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, {
      method: "PUT", ...authed,
      body: JSON.stringify({ status: "taught", note: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed", message: "note: size must be between 0 and 500" });
  });

  test("a wrong-type status is a BIND failure (F-0) → 400 malformed_body; empty/non-JSON bodies → the same envelope", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    for (const body of [JSON.stringify({ status: 7 }), "", "not-json"]) {
      const res = await app.request(`${base}/${CLASS_A}/coverage/${SPEC_POINT}`, {
        method: "PUT", ...authed,
        body: body === "" ? undefined : body,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: "malformed_body",
        message: "request body is not readable (check field types and enum values)",
      });
    }
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("malformed specPointNodeId path UUID → 400 bad_request, NO queries", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${CLASS_A}/coverage/not-a-uuid`, { method: "PUT", ...authed, body: VALID_BODY });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});
