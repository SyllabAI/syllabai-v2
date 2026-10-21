/**
 * Teacher assignments route tests (T-MIG-117, the B2 port) — the observable
 * HTTP contract of TeacherAssignmentController (4 wires over
 * /api/v1/teacher/assignments), over an IN-MEMORY Hono app wiring the REAL
 * ported services over stubbed sql (no Neon) — the T-MIG-052-t2 route-test
 * pattern.
 *
 * Pinned here (every message captured of record, golden-captures/t-mig-117/):
 *   - the Boot 401/403 authz shells (a01-a08)
 *   - the TWO-ENVELOPE law + the Jackson scalar-coercion layer (g07/g14-g22):
 *     strings coerce numbers/booleans; ints coerce numeric strings/decimals
 *     but NOT booleans; UUID classId stays strict; binding failures answer
 *     malformed_body (:175-179 verbatim); constraint failures answer
 *     validation_failed "field: message" with the verbatim jakarta strings
 *   - the service law chain through the router (404/403/409/400 verbatim)
 *   - @PathVariable UUID mismatch → 400 "malformed request" (e08)
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherAssignmentsRouter } from "../../src/routes/assignments";
import { buildTeacherAssignmentsModule } from "../../src/services/teacher-assignments";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (the service test's constants — same fixed-constant style) ─────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const STUDENT_1 = "bb000000-0000-4000-8000-000000000001";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const ASG_A = "dd000000-0000-4000-8000-000000000001";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";

const T1 = "2026-10-01T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW = new Date(NOW_TEXT);
const clock = { newId: () => NEW_ID, now: () => NOW };
const TOPIC = "WCH11-T1";

const assignmentRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ASG_A,
  teacher_id: TEACHER,
  course_slug: "igcse-chemistry-19",
  course_label: "IGCSE Chemistry",
  title: "B2 capture A",
  spec_refs: [TOPIC],
  marks_total: 10,
  question_count: 5,
  due_at: "2099-06-01T12:00:00.000Z",
  status: "OPEN",
  created_at: T1,
  class_id: null,
  ...over,
});

// ── route shapes (single-space normalized; the service test carries the
//    full set — here only what the route tests replay) ────────────────────────

const nodeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, node_type from knowledge_nodes where code = \?$/,
  rows,
});

const classTargetRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, teacher_id, course_slug, status from classes where id = \? ::uuid$/,
  rows,
});

const insertAssignmentRoute = (): Route => ({
  match: /insert into assignments \(id, teacher_id, course_slug, course_label, title, spec_refs,/,
  rows: [],
});

const assignmentByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from assignments where id = \? ::uuid$/,
  rows,
});

/** param-aware by-id: the 404 leg binds a DIFFERENT id — the fake must
 *  resolve by the bound uuid (rowsFor, the 052 law). */
const assignmentByIdParamRoute = (
  byId: Record<string, Array<Record<string, unknown>>>,
): Route => ({
  match: /from assignments where id = \? ::uuid$/,
  rows: [],
  rowsFor: (params) => byId[params[0] as string] ?? [],
});

const statusUpdateRoute = (): Route => ({
  match: /update assignments set status = \? where id = \? ::uuid$/,
  rows: [],
});

const cohortCountRoute = (n: number): Route => ({
  match:
    /select count\(distinct u\.id\)::int as cohort from users u join user_roles r on r\.user_id = u\.id where r\.role = 'STUDENT' and u\.enabled = true$/,
  rows: [{ cohort: n }],
});

const assignmentsListRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /from assignments where teacher_id = \? ::uuid order by created_at desc limit \?$/,
  rows,
});

const submissionsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /from assignment_submissions where assignment_id = \? ::uuid order by occurred_at desc limit \?$/,
  rows,
});

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + the real
//    error boundary; the router at the REAL mount prefix) ────────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const sql = fakeSql(routes);
  const module = buildTeacherAssignmentsModule(sql, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/assignments", createTeacherAssignmentsRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred" },
      500 as const,
    );
  });
  return { app, sql };
}

const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asStudent = (): AuthRow => ({
  email: "s@example.edu",
  userId: STUDENT_1,
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const validBody = {
  title: "B2 capture assignment",
  courseSlug: "igcse-chemistry-19",
  courseLabel: "IGCSE Chemistry",
  specRefs: [TOPIC],
  marksTotal: 10,
  questionCount: 5,
  dueAt: "2099-06-01T12:00:00Z",
};

// ── authz shells (a01-a08; SecurityConfig parity) ────────────────────────────

describe("authz shells (a01-a08)", () => {
  test("anonymous GET/POST → Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon, []);
    for (const [method, path] of [
      ["GET", "/api/v1/teacher/assignments"],
      ["POST", "/api/v1/teacher/assignments"],
      ["POST", `/api/v1/teacher/assignments/${ASG_A}/status`],
      ["GET", `/api/v1/teacher/assignments/${ASG_A}`],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });

  test("authenticated STUDENT → Boot 403 body (TEACHER/ADMIN rule)", async () => {
    const { app } = makeApp(asStudent, []);
    for (const [method, path] of [
      ["GET", "/api/v1/teacher/assignments"],
      ["POST", "/api/v1/teacher/assignments"],
      ["POST", `/api/v1/teacher/assignments/${ASG_A}/status`],
      ["GET", `/api/v1/teacher/assignments/${ASG_A}`],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.status).toBe(403);
      expect(body.error).toBe("Forbidden");
    }
  });
});

// ── the two-envelope law + the Jackson coercion layer ────────────────────────

describe("create body law (two-envelope + coercion)", () => {
  test("malformed JSON → 400 malformed_body verbatim (c01)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("constraint laws render the verbatim jakarta strings first-field (b02/b04/b07/b11)", async () => {
    for (const [over, expected] of [
      [{ title: "   " }, "title: must not be blank"],
      [{ title: null }, "title: must not be blank"],
      [{ title: "x".repeat(201) }, "title: size must be between 1 and 200"],
      [{ specRefs: [] }, "specRefs: size must be between 1 and 60"],
      [{ specRefs: [TOPIC, "bad ref!"] }, "specRefs[1]: spec refs are curriculum codes"],
      [{ specRefs: ["x"] }, "specRefs[0]: size must be between 2 and 40"],
      [{ marksTotal: 0 }, "marksTotal: must be greater than or equal to 1"],
      [{ marksTotal: 1001 }, "marksTotal: must be less than or equal to 1000"],
      [{ marksTotal: null }, "marksTotal: must not be null"],
      [{ questionCount: 201 }, "questionCount: must be less than or equal to 200"],
      [{ courseSlug: "IGCSE Chem" }, "courseSlug: course slug must be the hub course slug"],
      [{ dueAt: "" }, "dueAt: must not be blank"],
    ] as Array<[Record<string, unknown>, string]>) {
      const { app } = makeApp(asTeacher, [nodeRoute([]), insertAssignmentRoute()]);
      const res = await app.request("/api/v1/teacher/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, ...over }),
      });
      const body = await res.json();
      expect([over, res.status, body.error, body.message]).toEqual([
        over,
        400,
        "validation_failed",
        expected,
      ]);
    }
  });

  test("the Jackson coercion law: strings accept number/boolean (g07/g15/g19); ints accept numeric strings/decimals (g17/g18); booleans refuse int (g16); classId strict (c02/g22)", async () => {
    // number title → coerced "7" → 201
    const routes: Route[] = [
      nodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      insertAssignmentRoute(),
    ];
    const { app } = makeApp(asTeacher, routes);
    const res = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, title: 7 }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.title).toBe("7");

    // decimal marksTotal → truncates (10.5 → 10 → 201)
    const res2 = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, marksTotal: 10.5 }),
    });
    expect(res2.status).toBe(201);

    // numeric-string marksTotal → 201
    const res3 = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, marksTotal: "10" }),
    });
    expect(res3.status).toBe(201);

    // boolean marksTotal → binding failure → malformed_body
    const res4 = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, marksTotal: true }),
    });
    expect(res4.status).toBe(400);
    expect((await res4.json()).error).toBe("malformed_body");

    // specRefs string (not array) → malformed_body (g06)
    const res5 = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, specRefs: TOPIC }),
    });
    expect(res5.status).toBe(400);
    expect((await res5.json()).error).toBe("malformed_body");

    // classId number → malformed_body (g22); classId non-uuid string → malformed_body (c02)
    for (const classId of [42, "not-a-uuid"]) {
      const res6 = await app.request("/api/v1/teacher/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, classId }),
      });
      expect(res6.status).toBe(400);
      expect((await res6.json()).error).toBe("malformed_body");
    }

    // classId null → the V49 default (201 with classId null, g09)
    const res7 = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, classId: null }),
    });
    expect(res7.status).toBe(201);
    expect((await res7.json()).classId).toBeNull();
  });

  test("201 positive: the create law through the router (d01) — 201 + the view echo", async () => {
    const { app } = makeApp(asTeacher, [
      nodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      insertAssignmentRoute(),
    ]);
    const res = await app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: NEW_ID,
      title: "B2 capture assignment",
      courseSlug: "igcse-chemistry-19",
      specRefs: [TOPIC],
      marksTotal: 10,
      questionCount: 5,
      status: "open",
      classId: null,
    });
  });
});

// ── status + roster + list through the router ────────────────────────────────

describe("status/list/roster router laws", () => {
  test("status: the verbatim 400 (f02), the 404 (d09), the tolerant 200 (f06)", async () => {
    const { app } = makeApp(asTeacher, [
      assignmentByIdParamRoute({
        [ASG_A]: [assignmentRow()],
        "dd000009-0000-4000-8000-000000000009": [], // the unknown id
      }),
      statusUpdateRoute(),
    ]);
    const bad = await app.request(`/api/v1/teacher/assignments/${ASG_A}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "half-open" }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toBe('status must be "open" or "closed": half-open');

    const unknown = await app.request(
      `/api/v1/teacher/assignments/dd000009-0000-4000-8000-000000000009/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      },
    );
    expect(unknown.status).toBe(404);

    const ok = await app.request(`/api/v1/teacher/assignments/${ASG_A}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "  CLOSED  " }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("closed");
  });

  test("path UUID mismatch → 400 bad_request 'malformed request' (e08)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/assignments/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("T-TEACH-006 through the router: foreign roster 403s verbatim (learner data)", async () => {
    const { app } = makeApp(asTeacher, [
      assignmentByIdParamRoute({
        [ASG_A]: [assignmentRow({ teacher_id: OTHER_TEACHER })],
      }),
    ]);
    const res = await app.request(`/api/v1/teacher/assignments/${ASG_A}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this assignment belongs to another teacher");
  });

  test("T-TEACH-006 through the router: foreign status flip 403s and issues NO update", async () => {
    const updates: string[] = [];
    const { app } = makeApp(asTeacher, [
      assignmentByIdParamRoute({
        [ASG_A]: [assignmentRow({ teacher_id: OTHER_TEACHER })],
      }),
      {
        match: /update assignments set status = \? where id = \? ::uuid$/,
        rows: [],
        rowsFor: (params) => {
          updates.push(String(params[0]));
          return [];
        },
      },
    ]);
    const res = await app.request(`/api/v1/teacher/assignments/${ASG_A}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this assignment belongs to another teacher");
    expect(updates).toEqual([]); // the write never ran
  });

  test("list → 200 newest-first summaries (e03 shape)", async () => {
    const { app } = makeApp(asTeacher, [
      cohortCountRoute(2),
      assignmentsListRoute([assignmentRow()]),
      submissionsRoute([]),
    ]);
    const res = await app.request("/api/v1/teacher/assignments");
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({
      assignment: { id: ASG_A, status: "open" },
      submitted: 0,
      late: 0,
      missing: 2,
      meanScore: null,
    });
  });

  test("service error mapping: the target 404 (c03) and the class gates (d05-d08) ride the router", async () => {
    const notFound = makeApp(asTeacher, [nodeRoute([])]);
    const res = await notFound.app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, specRefs: ["NO-SUCH-CODE"] }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("unknown assignment target: NO-SUCH-CODE");

    const forbidden = makeApp(asTeacher, [
      nodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      classTargetRoute([
        { id: CLASS_A, teacher_id: "aa000000-0000-4000-8000-000000009999", course_slug: "igcse-chemistry-19", status: "ACTIVE" },
      ]),
    ]);
    const res2 = await forbidden.app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, classId: CLASS_A }),
    });
    expect(res2.status).toBe(403);
    expect((await res2.json()).message).toBe("this class belongs to another teacher");

    const conflict = makeApp(asTeacher, [
      nodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      classTargetRoute([
        { id: CLASS_A, teacher_id: TEACHER, course_slug: "igcse-chemistry-19", status: "ARCHIVED" },
      ]),
    ]);
    const res3 = await conflict.app.request("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, classId: CLASS_A }),
    });
    expect(res3.status).toBe(409);
    expect((await res3.json()).message).toBe("this class is archived");
  });
});
