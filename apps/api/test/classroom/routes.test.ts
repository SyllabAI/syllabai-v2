/**
 * Classroom route tests (T-MIG-052 tranche 2) — the observable HTTP contract
 * of TeacherClassController (8 endpoints over /api/v1/teacher/classes),
 * LearnerClassroomController (3 over /api/v1/learners/me/classroom) and
 * TeacherRosterController (GET /api/v1/teacher/learners), over an IN-MEMORY
 * Hono app wiring the REAL tranche-1 classroom services over stubbed sql
 * (no Neon) — the T-MIG-041-t2 route-test pattern.
 *
 * 200/201 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (classroom.ts, tranche-1) and key-pinned against the frozen DTO
 * records (ClassroomViews.java / TeacherViews.LearnerRosterView @ 6cad6ef).
 * Error envelopes are pinned to the GlobalExceptionHandler laws:
 *   - NotFound/BadRequest/Conflict/Forbidden → 404/400/409/403 with the
 *     tranche-1 verbatim messages
 *   - validation_failed "field: message" (jakarta defaults, :158-165 FIRST
 *     field error) vs malformed_body (:175-179 verbatim) — the two-envelope
 *     law (R0 intake fix R-1)
 *   - UUID path-type mismatch → 400 bad_request "malformed request"
 *     (:169-172, MethodArgumentTypeMismatch parity)
 *   - the Boot 401/403 authz shells (SecurityConfig :87 TEACHER/ADMIN for
 *     /api/v1/teacher/**, :91 anyRequest().authenticated() for the learner
 *     classroom; timestamp tolerated)
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createLearnerClassroomRouter,
  createTeacherClassesRouter,
  createTeacherRosterRouter,
} from "../../src/routes/classroom";
import { buildClassroomModule } from "../../src/services/classroom";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  announcementReadResultSchema,
  learnerClassroomViewSchema,
  learnerAnnouncementViewSchema,
  learnerRosterViewSchema,
  teacherAnnouncementViewSchema,
  teacherClassDetailViewSchema,
  teacherClassViewSchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (the tranche-1 test's constants — same fixed-constant style) ──

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const LEARNER = "bb000000-0000-4000-8000-000000000001";
const STUDENT_2 = "bb000000-0000-4000-8000-000000000002";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const ANNOUNCE_1 = "dd000000-0000-4000-8000-000000000001";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";

const T0 = "2026-09-20T10:00:00.305782Z";
const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";

const NOW = new Date(NOW_TEXT);
const clock = { newId: () => NEW_ID, now: () => NOW };

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  teacher_id: TEACHER,
  course_slug: "igcse-chemistry-19",
  course_label: "IGCSE Chemistry",
  name: "Period 3",
  status: "ACTIVE",
  created_at: T1,
  ...over,
});

const memberRow = (studentId: string, over: Partial<Record<string, unknown>> = {}) => ({
  id: `ee000000-0000-4000-8000-0000000000${studentId.slice(-2)}`,
  class_id: CLASS_A,
  student_id: studentId,
  enrolled_by: TEACHER,
  enrolled_at: T1,
  ...over,
});

const announcementRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ANNOUNCE_1,
  teacher_id: TEACHER,
  class_id: CLASS_A,
  title: "Lab kits",
  body: "Bring lab kits Thursday.",
  category: "GENERAL",
  created_at: T2,
  ...over,
});

// ── shared route shapes (the tranche-1 SQL, verbatim renderings) ────────────

const ownedClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, teacher_id, course_slug, course_label, name, status, created_at from classes where id = \? ::uuid$/,
  rows,
});

const rosterRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, class_id, student_id, enrolled_by, enrolled_at from class_members where class_id = \? ::uuid order by enrolled_at asc$/,
  rows,
});

const usersBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, display_name, email, created_at from users where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const memberCountRoute = (n: number): Route => ({
  match: /select count\(\*\)::int as member_count from class_members where class_id = \? ::uuid$/,
  rows: [{ member_count: n }],
});

const teacherListRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from classes where teacher_id = \? ::uuid order by created_at desc limit \?$/,
  rows,
});

const teacherClashRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/,
  rows,
});

const groupedCountRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select class_id, count\(\*\)::int as member_count from class_members where class_id = any\( \? ::uuid\[\]\) group by class_id$/,
  rows,
});

const studentLookupRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select u\.id, u\.display_name, u\.email, u\.created_at, u\.enabled, coalesce\(array_agg\(r\.role\) filter \(where r\.role is not null\), '\{\}'\) as roles from users u left join user_roles r on r\.user_id = u\.id where lower\(u\.email\) = lower\( \? \) group by u\.id limit 1$/,
  rows,
});

const existsMemberRoute = (exists: boolean): Route => ({
  match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/,
  rows: exists ? [{ one: 1 }] : [],
});

const insertMemberRoute = (log: string[]): Route => ({
  match: /^insert into class_members \(id, class_id, student_id, enrolled_by, enrolled_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(params[2] as string); // the bound student_id
    return [];
  },
});

const statusUpdateRoute = (status: string): Route => ({
  match: /^update classes set status = \? where id = \? ::uuid returning/,
  rows: [classRow({ status })],
  rowsFor: (params) => [classRow({ status: params[0] as string })],
});

const insertClassRoute = (): Route => ({
  match: /^insert into classes \(id, teacher_id, course_slug, course_label, name, status, created_at\)/,
  rows: [classRow({ id: NEW_ID, created_at: NOW })],
});

const deleteMemberRoute = (log: string[]): Route => ({
  match: /^delete from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/,
  rows: [],
  rowsFor: (params) => {
    log.push(params[1] as string); // the bound student_id
    return [];
  },
});

const announcementsByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, teacher_id, class_id, title, body, category, created_at from announcements where class_id = \? ::uuid order by created_at desc limit \?$/,
  rows,
});

const announcementsAnyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, teacher_id, class_id, title, body, category, created_at from announcements where class_id = any\( \? ::uuid\[\]\) order by created_at desc limit \?$/,
  rows,
});

const readCountsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select announcement_id, count\(\*\)::int as read_count from announcement_reads where announcement_id = any\( \? ::uuid\[\]\) group by announcement_id$/,
  rows,
});

const membershipsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, class_id, student_id, enrolled_by, enrolled_at from class_members where student_id = \? ::uuid order by enrolled_at asc$/,
  rows,
});

const classesAnyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, teacher_id, course_slug, course_label, name, status, created_at from classes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const readIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select announcement_id from announcement_reads where student_id = \? ::uuid and announcement_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const announcementByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, teacher_id, class_id, title, body, category, created_at from announcements where id = \? ::uuid$/,
  rows,
});

const existsReadRoute = (exists: boolean): Route => ({
  match: /select 1 as one from announcement_reads where announcement_id = \? ::uuid and student_id = \? ::uuid$/,
  rows: exists ? [{ one: 1 }] : [],
});

const insertReadRoute = (log: string[]): Route => ({
  match: /^insert into announcement_reads \(announcement_id, student_id, read_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(params[0] as string); // the bound announcement_id
    return [];
  },
});

const rosterCohortRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select u\.id, u\.display_name, u\.email, u\.created_at from users u join user_roles r on r\.user_id = u\.id where r\.role = 'STUDENT' and u\.enabled = true group by u\.id, u\.display_name, u\.email, u\.created_at order by u\.display_name asc, u\.email asc$/,
  rows,
});

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + the real
//    error boundary; routers at the REAL mount prefixes) ────────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const sql = fakeSql(routes);
  const module = buildClassroomModule(sql, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createTeacherClassesRouter(module));
  app.route("/api/v1/learners/me/classroom", createLearnerClassroomRouter(module));
  app.route("/api/v1/teacher/learners", createTeacherRosterRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
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
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

// ── authz shells (SecurityConfig parity) ────────────────────────────────────

describe("authz shells", () => {
  test("teacher classes: anonymous → Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/classes");
    expect(typeof body.timestamp).toBe("string");
  });

  test("teacher classes: authenticated STUDENT → Boot 403 body (TEACHER/ADMIN rule)", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/api/v1/teacher/classes");
  });

  test("teacher classes: anonymous UNKNOWN path under the base → shell 401 BEFORE the 404 fall-through", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/classes/whatever");
    expect(res.status).toBe(401);
  });

  test("learner classroom: anonymous → Boot 401 body (anyRequest().authenticated())", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/learners/me/classroom");
  });

  test("roster: authenticated STUDENT → Boot 403 (the V49 surface is teacher-only)", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/teacher/learners");
    expect(res.status).toBe(403);
  });
});

// ── teacher class lifecycle ─────────────────────────────────────────────────

describe("POST /api/v1/teacher/classes (:80-98 → 201)", () => {
  test("happy path: 201 + the canonical TeacherClassView wire (fresh memberCount 0)", async () => {
    const { app } = makeApp(asTeacher, [
      teacherClashRoute([]), // no clash
      insertClassRoute(),
    ]);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug: "igcse-chemistry-19", courseLabel: "IGCSE Chemistry", name: "Period 3" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(teacherClassViewSchema.safeParse(body).success).toBeTrue();
    expect(body.id).toBe(NEW_ID);
    expect(body.status).toBe("active"); // the WIRE form (SchoolClass.Status.wire)
    expect(body.memberCount).toBe(0);
    expect(body.createdAt).toBe(NOW_ISO);
  });

  test("@NotBlank whitespace law: whitespace-only name → 400 validation_failed 'name: must not be blank' (T-MIG-056)", async () => {
    // frozen parity: jakarta @Valid preempts the controller body for a
    // whitespace-only @NotBlank, so the service's trim-blank 400
    // ("class name must not be blank" — still pinned at the service level,
    // tranche-1) is unreachable over HTTP for this posture
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug: "s", courseLabel: "l", name: "   " }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("name: must not be blank");
    expect(sql.queries).toHaveLength(0); // fail-closed before any statement
  });

  test("two-envelope law: unreadable body → 400 malformed_body verbatim", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("two-envelope law: blank courseSlug → validation_failed 'courseSlug: must not be blank' (@NotBlank)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug: "", courseLabel: "l", name: "n" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("courseSlug: must not be blank");
  });

  test("two-envelope law: 65-char courseSlug → 'courseSlug: size must be between 0 and 64' (@Size)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSlug: "x".repeat(65), courseLabel: "l", name: "n" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("courseSlug: size must be between 0 and 64");
  });
});

describe("GET /api/v1/teacher/classes (:101-109 → 200)", () => {
  test("happy path: 200 + schema (LIMIT 100 newest-first list + grouped counts)", async () => {
    const { app } = makeApp(asTeacher, [
      teacherListRoute([classRow()]),
      groupedCountRoute([{ class_id: CLASS_A, member_count: 3 }]),
    ]);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    expect(body).toHaveLength(1);
    expect(teacherClassViewSchema.safeParse(body[0]).success).toBeTrue();
    expect(body[0].memberCount).toBe(3);
    expect(body[0].status).toBe("active");
  });

  test("the honest empty list for a teacher with no classes", async () => {
    const { app } = makeApp(asTeacher, [teacherListRoute([])]);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /api/v1/teacher/classes/:id (:111-133 → 200)", () => {
  test("happy path: 200 + detail schema with roster enrolledAt asc", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2, { enrolled_at: T2 })]),
      usersBatchRoute([
        { id: LEARNER, display_name: "Ann L.", email: "ann@example.test", created_at: T0 },
        { id: STUDENT_2, display_name: "Ben O.", email: "ben@example.test", created_at: T0 },
      ]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(teacherClassDetailViewSchema.safeParse(body).success).toBeTrue();
    expect(body.members).toHaveLength(2);
    expect(body.members[0].studentId).toBe(LEARNER); // enrolledAt asc
  });

  test("§17 ownership: another teacher's class → 403 'this class belongs to another teacher'", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this class belongs to another teacher");
  });

  test("unknown class → 404 'class not found'", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("class not found");
  });

  test("non-UUID path id → 400 'malformed request' (MethodArgumentTypeMismatch parity)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(sql.queries).toHaveLength(0); // no SQL issued
  });
});

describe("POST /api/v1/teacher/classes/:id/status (:135-146 → 200)", () => {
  test("tolerant parse: '  ARCHIVED ' flips, wire form lowercase, live member count", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      statusUpdateRoute("ARCHIVED"),
      memberCountRoute(12),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "  ARCHIVED " }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(teacherClassViewSchema.safeParse(body).success).toBeTrue();
    expect(body.status).toBe("archived");
    expect(body.memberCount).toBe(12);
  });

  test("unknown status → 400 'status must be 'active' or 'archived'' (service law)", async () => {
    const { app, sql } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "deleted" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("status must be 'active' or 'archived'");
    expect(sql.queries.filter((q) => q.startsWith("update"))).toHaveLength(0); // fail-closed
  });

  test("blank status body → validation_failed 'status: must not be blank' (@NotBlank)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("status: must not be blank");
  });
});

// ── membership (:150-198) ───────────────────────────────────────────────────

function enrollRoutes(over: {
  student: Array<Record<string, unknown>>;
  exists: boolean;
  inserted: string[];
  classRowOver?: Partial<Record<string, unknown>>;
}): Route[] {
  return [
    ownedClassRoute([classRow(over.classRowOver ?? {})]),
    studentLookupRoute(over.student),
    existsMemberRoute(over.exists),
    insertMemberRoute(over.inserted),
    ownedClassRoute([classRow(over.classRowOver ?? {})]), // detail()'s own lookup
    rosterRoute([memberRow(LEARNER)]),
    usersBatchRoute([{ id: LEARNER, display_name: "Ann L.", email: "ann@example.test", created_at: T0 }]),
  ];
}

const STUDENT_HIT = [
  { id: STUDENT_2, display_name: "Ben O.", email: "ben@example.test", created_at: T0, enabled: true, roles: ["STUDENT"] },
];

describe("POST /api/v1/teacher/classes/:id/members (:150-175 → 201)", () => {
  test("happy path: 201 + the fresh detail (enroll inserts)", async () => {
    const inserted: string[] = [];
    const { app } = makeApp(asTeacher, enrollRoutes({ student: STUDENT_HIT, exists: false, inserted }));
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Ben@Example.test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(teacherClassDetailViewSchema.safeParse(body).success).toBeTrue();
    expect(body.members[0].studentId).toBe(LEARNER); // the pre-existing roster row
    expect(inserted).toEqual([STUDENT_2]); // exactly one INSERT, bound to the found student
  });

  test("idempotent re-enroll: the SAME 201 detail, NO INSERT (no 200 branch in Java)", async () => {
    const inserted: string[] = [];
    const { app } = makeApp(asTeacher, enrollRoutes({ student: STUDENT_HIT, exists: true, inserted }));
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ben@example.test" }),
    });
    expect(res.status).toBe(201);
    expect(inserted).toEqual([]); // the honest no-op
  });

  test("unknown email → 404 verbatim", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.test" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("no account with that email — the student registers first, then you enroll");
  });

  test("disabled account → 409 'that account is disabled'", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([{ ...STUDENT_HIT[0], enabled: false }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ben@example.test" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("that account is disabled");
  });

  test("non-STUDENT account → 409 'only student accounts can be enrolled in a class'", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([{ ...STUDENT_HIT[0], roles: ["TEACHER"] }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ben@example.test" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("only student accounts can be enrolled in a class");
  });

  test("archived class → 409 'this class is archived — reopen it before enrolling' (fail-closed)", async () => {
    const { app, sql } = makeApp(asTeacher, [ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ben@example.test" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("this class is archived — reopen it before enrolling");
    expect(sql.queries.filter((q) => q.includes("from users"))).toHaveLength(0); // no user lookup
  });
});

describe("DELETE /api/v1/teacher/classes/:id/members/:studentId (:177-187 → 200)", () => {
  test("deletes exactly that member row then the fresh detail (unknown id is NOT a 404)", async () => {
    const deleted: string[] = [];
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      deleteMemberRoute(deleted),
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(LEARNER)]),
      usersBatchRoute([{ id: LEARNER, display_name: "Ann L.", email: "ann@example.test", created_at: T0 }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members/${STUDENT_2}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(teacherClassDetailViewSchema.safeParse(body).success).toBeTrue();
    expect(deleted).toEqual([STUDENT_2]);
  });

  test("non-UUID studentId → 400 'malformed request'", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members/nope`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
    expect(sql.queries).toHaveLength(0);
  });
});

// ── announcements (:191-244) ────────────────────────────────────────────────

describe("POST /api/v1/teacher/classes/:id/announcements (:191-214 → 201)", () => {
  test("happy path: 201 + fresh row readCount 0 over the live roster; category wire kebab", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      {
        match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/,
        rows: [announcementRow({ category: "EXAM_REMINDER", created_at: NOW })],
      },
      memberCountRoute(5),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Exam", body: "Room 204.", category: "exam-reminder" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(teacherAnnouncementViewSchema.safeParse(body).success).toBeTrue();
    expect(body.category).toBe("exam-reminder"); // the WIRE form
    expect(body.readCount).toBe(0); // a just-published announcement has no reads
    expect(body.memberCount).toBe(5);
  });

  test("category OPTIONAL: absent binds → the service parses GENERAL", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      {
        match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/,
        rows: [announcementRow({ category: "GENERAL", created_at: NOW })],
      },
      memberCountRoute(0),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello", body: "World." }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).category).toBe("general");
  });

  test("category EXPLICIT NULL binds like absent → GENERAL (Jackson parity, T-MIG-056)", async () => {
    // frozen parity: PublishRequest.category carries @Size(max 20) with NO
    // @NotBlank — jakarta considers null valid, the record binds null,
    // Announcement.Category.parse(null) → GENERAL → the same 201 as absent
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      {
        match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/,
        rows: [announcementRow({ category: "GENERAL", created_at: NOW })],
      },
      memberCountRoute(0),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello", body: "World.", category: null }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).category).toBe("general");
  });

  test("unknown category → 400 verbatim (service law, not schema law)", async () => {
    const { app, sql } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", body: "B", category: "urgent" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("category must be general, homework, notice, exam-reminder or resource");
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0); // fail-closed
  });

  test("@NotBlank whitespace law: whitespace-only body → 400 validation_failed 'body: must not be blank' (T-MIG-056)", async () => {
    // frozen parity: @Valid preempts the controller body (the service's
    // "title and body must not be blank" trim-blank 400 stays pinned at
    // the service level, tranche-1 — unreachable over HTTP here)
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", body: "   " }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("body: must not be blank");
  });

  test("21-char category → validation_failed 'category: size must be between 0 and 20' (@Size)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", body: "B", category: "x".repeat(21) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("category: size must be between 0 and 20");
  });
});

describe("GET /api/v1/teacher/classes/:id/announcements (:216-231 → 200)", () => {
  test("newest-first feed + batched read counts over the roster", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      announcementsByClassRoute([announcementRow(), announcementRow({ id: "dd000000-0000-4000-8000-000000000002", title: "Older", created_at: T1 })]),
      readCountsRoute([{ announcement_id: ANNOUNCE_1, read_count: 2 }]),
      rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2)]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    expect(teacherAnnouncementViewSchema.safeParse(body[0]).success).toBeTrue();
    expect(body[0].readCount).toBe(2);
    expect(body[0].memberCount).toBe(2);
    expect(body[1].readCount).toBe(0); // the getOrDefault honesty zero
  });
});

// ── learner classroom (LearnerClassroomController) ──────────────────────────

describe("GET /api/v1/learners/me/classroom (:70-84 → 200)", () => {
  test("the independent-student rule: no memberships → the honest empty overlay", async () => {
    const { app } = makeApp(asStudent, [membershipsRoute([])]);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(learnerClassroomViewSchema.safeParse(body).success).toBeTrue();
    expect(body.classes).toEqual([]);
    expect(body.unreadAnnouncements).toBe(0);
  });

  test("the overlay: live classes only (ARCHIVED drops out), unread per class + flattened badge", async () => {
    const { app } = makeApp(asStudent, [
      membershipsRoute([memberRow(LEARNER), memberRow(LEARNER, { class_id: "cc000000-0000-4000-8000-000000000009" })]),
      classesAnyRoute([
        classRow(),
        classRow({ id: "cc000000-0000-4000-8000-000000000009", status: "ARCHIVED" }),
      ]),
      announcementsAnyRoute([
        announcementRow(),
        announcementRow({ id: "dd000000-0000-4000-8000-000000000002", title: "Read one", created_at: T1 }),
      ]),
      readIdsRoute([{ announcement_id: "dd000000-0000-4000-8000-000000000002" }]),
      usersBatchRoute([{ id: TEACHER, display_name: "Ms. Chem", email: "t@example.edu", created_at: T0 }]),
    ]);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(learnerClassroomViewSchema.safeParse(body).success).toBeTrue();
    expect(body.classes).toHaveLength(1); // the archived class DROPS OUT
    expect(body.classes[0].teacherName).toBe("Ms. Chem");
    expect(body.classes[0].unreadAnnouncements).toBe(1); // one of two read
    expect(body.unreadAnnouncements).toBe(1); // the flattened badge
  });
});

describe("GET /api/v1/learners/me/classroom/announcements (:88-100 → 200)", () => {
  test("across all live classes, MY read flag beside each", async () => {
    const { app } = makeApp(asStudent, [
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow()]),
      announcementsAnyRoute([announcementRow()]),
      readIdsRoute([]),
      usersBatchRoute([{ id: TEACHER, display_name: "Ms. Chem", email: "t@example.edu", created_at: T0 }]),
    ]);
    const res = await app.request("/api/v1/learners/me/classroom/announcements");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    expect(learnerAnnouncementViewSchema.safeParse(body[0]).success).toBeTrue();
    expect(body[0].read).toBeFalse();
    expect(body[0].className).toBe("Period 3");
  });
});

describe("POST /api/v1/learners/me/classroom/announcements/:id/read (:103-116 → 200)", () => {
  test("the ReadResult wire: {id, read: true}", async () => {
    const { app } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(true),
      existsReadRoute(false),
      insertReadRoute([]),
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(announcementReadResultSchema.safeParse(body).success).toBeTrue();
    expect(body.id).toBe(ANNOUNCE_1);
    expect(body.read).toBe(true);
  });

  test("unknown announcement → 404 'announcement not found'", async () => {
    const { app } = makeApp(asStudent, [announcementByIdRoute([])]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("announcement not found");
  });

  test("membership gate: another teacher's class → 403 'this announcement is not in your classroom'", async () => {
    const { app, sql } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(false),
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this announcement is not in your classroom");
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0); // no write
  });

  test("idempotent: the existing receipt short-circuits (no second INSERT)", async () => {
    const inserts: string[] = [];
    const { app } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(true),
      existsReadRoute(true),
      insertReadRoute(inserts),
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).read).toBe(true);
    expect(inserts).toEqual([]);
  });
});

// ── the V49 roster (TeacherRosterController) ────────────────────────────────

describe("GET /api/v1/teacher/learners (:37-42 → 200)", () => {
  test("the enabled STUDENT cohort, identity projection only, displayName asc", async () => {
    const { app } = makeApp(asTeacher, [
      rosterCohortRoute([
        { id: LEARNER, display_name: "Ann L.", email: "ann@example.test", created_at: T0 },
        { id: STUDENT_2, display_name: "Ben O.", email: "ben@example.test", created_at: T0 },
      ]),
    ]);
    const res = await app.request("/api/v1/teacher/learners");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    expect(learnerRosterViewSchema.safeParse(body[0]).success).toBeTrue();
    expect(body[0].displayName).toBe("Ann L.");
    expect(Object.keys(body[0]).sort()).toEqual(["createdAt", "displayName", "email", "id"]); // identity projection ONLY
  });
});
