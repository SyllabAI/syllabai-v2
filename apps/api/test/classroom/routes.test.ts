/**
 * T-MIG-052 tranche-2 route tests — the observable HTTP contract of
 * TeacherClassController (8 endpoints over /api/v1/teacher/classes),
 * LearnerClassroomController (3 over /api/v1/learners/me/classroom) and
 * TeacherRosterController (GET /api/v1/teacher/learners), over an
 * IN-MEMORY Hono app wiring the REAL tranche-1 classroom services over
 * stubbed sql (no Neon) — the T-MIG-021/041 route-test pattern, with the
 * app assembled in the index.ts registration ORDER (classes, classroom,
 * roster LAST at the frozen /api/v1/teacher class mapping) plus the
 * 404-after-auth fallback, so the mount topology is pinned too.
 *
 * 200/201 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (classroom.ts). Error envelopes are pinned to the frozen
 * GlobalExceptionHandler classes: 404/403/400/409 domain detail messages,
 * 400 "malformed request" for @PathVariable UUID mismatches (:167-173),
 * and the TWO-ENVELOPE body law (malformed_body vs validation_failed with
 * the jakarta default messages — including the tranche-2 @NotBlank-exact
 * amendment: a whitespace-only body fails @Valid exactly as jakarta does,
 * BEFORE the controller/service law).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createLearnerClassroomRouter,
  createTeacherClassesRouter,
  createTeacherRosterRouter,
} from "../../src/routes/classroom";
import { buildClassroomModule } from "../../src/services/classroom";
import type { SubmitClock } from "../../src/services/selfmark";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  announcementReadResultSchema,
  learnerAnnouncementViewSchema,
  learnerClassroomViewSchema,
  learnerRosterViewSchema,
  teacherAnnouncementViewSchema,
  teacherClassDetailViewSchema,
  teacherClassViewSchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const LEARNER = "bb000000-0000-4000-8000-000000000001";
const STUDENT_2 = "bb000000-0000-4000-8000-000000000002";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const ANNOUNCE_1 = "dd000000-0000-4000-8000-000000000001";
const ANNOUNCE_2 = "dd000000-0000-4000-8000-000000000002";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";

const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = {
  newId: () => NEW_ID,
  now: () => NOW,
};

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

const userRow = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  display_name: `Student ${id.slice(-2)}`,
  email: `student${id.slice(-2)}@example.edu`,
  created_at: T1,
  ...over,
});

// ── shared route shapes (fakeSql renders template strings joined " ? ") ─────

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

const announcementsByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, teacher_id, class_id, title, body, category, created_at from announcements where class_id = \? ::uuid order by created_at desc limit \?$/,
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

const announcementsAnyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, teacher_id, class_id, title, body, category, created_at from announcements where class_id = any\( \? ::uuid\[\]\) order by created_at desc limit \?$/,
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

const rosterCohortRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select u\.id, u\.display_name, u\.email, u\.created_at from users u join user_roles r on r\.user_id = u\.id where r\.role = 'STUDENT' and u\.enabled = true group by u\.id, u\.display_name, u\.email, u\.created_at order by u\.display_name asc, u\.email asc$/,
  rows,
});

// ── app assembly mirroring apps/api/src/index.ts (mount order + fallback) ────

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  routes: Route[],
) {
  const sql = fakeSql(routes);
  const module = buildClassroomModule(sql, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  // the index.ts registration ORDER: classes + classroom first, the roster
  // LAST at the frozen /api/v1/teacher class mapping
  app.route("/api/v1/teacher/classes", createTeacherClassesRouter(module));
  app.route("/api/v1/learners/me/classroom", createLearnerClassroomRouter(module));
  app.route("/api/v1/teacher", createTeacherRosterRouter(module));
  // the 404-after-auth fallback (SecurityConfig anyRequest().authenticated())
  app.all("/api/v1/*", (c) => {
    if (!auth(c)) {
      return c.json(
        { status: 401, error: "Unauthorized", path: new URL(c.req.url).pathname, timestamp: "2026-10-06T08:00:00Z" },
        401 as const,
      );
    }
    return c.json(
      { status: 404, error: "Not Found", path: new URL(c.req.url).pathname, message: "resource not found", timestamp: "2026-10-06T08:00:00Z" },
      404 as const,
    );
  });
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-06T08:00:00Z" },
      500 as const,
    );
  });
  return { app, sql };
}

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const OTHER_TEACHER_AUTH = {
  email: "other@example.edu",
  userId: OTHER_TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const STUDENT_AUTH = {
  email: "student@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asTeacher = () => TEACHER_AUTH;
const asOtherTeacher = () => OTHER_TEACHER_AUTH;
const asStudent = () => STUDENT_AUTH;
const anon = () => null;

// ── authz shells (SecurityConfig /api/v1/teacher/** + authenticated parity) ──

describe("teacher classes router — authz shell", () => {
  test("anonymous GET: Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/teacher/classes");
  });

  test("authenticated STUDENT: Boot 403 (the role gate)", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/api/v1/teacher/classes");
  });

  test("anonymous POST: the shell answers BEFORE body parsing (no malformed_body leak)", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/teacher/classes (TeacherClassController.create :79-98) ──────

describe("POST /api/v1/teacher/classes — create", () => {
  const createRoutes = () => [
    { match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/, rows: [] },
    { match: /^insert into classes \(id, teacher_id, course_slug, course_label, name, status, created_at\)/, rows: [classRow({ id: NEW_ID, name: "Period 4" })] },
  ];

  test("teacher: 201, canonical-schema-valid, the fresh class serves memberCount 0 + wire status", async () => {
    const { app, sql } = makeApp(asTeacher, createRoutes());
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: "igcse-chemistry-19", courseLabel: "IGCSE Chemistry", name: "Period 4" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    const parsed = teacherClassViewSchema.parse(await res.json());
    expect(parsed.id).toBe(NEW_ID);
    expect(parsed.memberCount).toBe(0);
    expect(parsed.status).toBe("active"); // the SchoolClass.Status WIRE form
    expect(parsed.name).toBe("Period 4");
    // the frozen call sequence: the clash window first, the INSERT second
    expect(sql.queries.length).toBe(2);
    expect(sql.queries[0]).toContain("status = 'ACTIVE'");
    expect(sql.queries[1]).toContain("insert into classes");
  });

  test("EMPTY string name → 400 validation_failed 'name: must not be blank' (jakarta @NotBlank)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: "c", courseLabel: "l", name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("name: must not be blank");
  });

  test("WHITESPACE-only name → 400 validation_failed (the @NotBlank-exact amendment: @Valid answers BEFORE the service law)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: "c", courseLabel: "l", name: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("name: must not be blank");
    expect(sql.queries.length).toBe(0); // the service never ran
  });

  test("name over @Size(max 120) → 400 validation_failed 'name: size must be between 0 and 120'", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: "c", courseLabel: "l", name: "x".repeat(121) }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("name: size must be between 0 and 120");
  });

  test("wrong JSON type (courseSlug: 123) → 400 malformed_body (binding beats every constraint)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: 123, courseLabel: "l", name: "n" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("unreadable body → 400 malformed_body (HttpMessageNotReadable verbatim)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });

  test("case-insensitive clash on the same course → 409 conflict (the verbatim message)", async () => {
    const { app } = makeApp(asTeacher, [
      { match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/, rows: [classRow({ name: "  period 3  " })] },
    ]);
    const res = await app.request("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify({ courseSlug: "igcse-chemistry-19", courseLabel: "IGCSE Chemistry", name: "Period 3" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("you already have a live class with this name on this course");
  });
});

// ── GET /api/v1/teacher/classes (:100-108) ───────────────────────────────────

describe("GET /api/v1/teacher/classes — list", () => {
  test("teacher: 200, canonical-schema-valid, member counts from the ONE grouped query", async () => {
    const { app, sql } = makeApp(asTeacher, [
      { match: /from classes where teacher_id = \? ::uuid order by created_at desc limit \?$/, rows: [classRow(), classRow({ id: "cc000000-0000-4000-8000-000000000002", name: "Period 4" })] },
      { match: /select class_id, count\(\*\)::int as member_count from class_members where class_id = any\( \? ::uuid\[\]\) group by class_id$/, rows: [{ class_id: CLASS_A, member_count: 2 }] },
    ]);
    const res = await app.request("/api/v1/teacher/classes");
    expect(res.status).toBe(200);
    const parsed = teacherClassViewSchema.array().parse(await res.json());
    expect(parsed.length).toBe(2);
    expect(parsed[0]!.memberCount).toBe(2);
    expect(parsed[1]!.memberCount).toBe(0); // the honest zero, not null
    expect(sql.queries.length).toBe(2);
  });
});

// ── GET /api/v1/teacher/classes/{id} (:110-135) — the §17 gate + honesty ────

describe("GET /api/v1/teacher/classes/{id} — detail", () => {
  const detailRoutes = (owner = TEACHER) => [
    ownedClassRoute([classRow({ teacher_id: owner })]),
    rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2)]),
    usersBatchRoute([userRow(LEARNER)]), // STUDENT_2's account vanished
  ];

  test("owner: 200, canonical-schema-valid, the honesty rows show for the vanished account", async () => {
    const { app } = makeApp(asTeacher, detailRoutes());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(200);
    const parsed = teacherClassDetailViewSchema.parse(await res.json());
    expect(parsed.members.length).toBe(2);
    expect(parsed.members[0]).toEqual({
      studentId: LEARNER,
      displayName: "Student 01",
      email: "student01@example.edu",
      enrolledBy: TEACHER,
      enrolledAt: new Date(T1).toISOString(),
    });
    expect(parsed.members[1]!.displayName).toBe("(removed account)");
    expect(parsed.members[1]!.email).toBe("(unavailable)");
  });

  test("unknown class → 404 'class not found'", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("class not found");
  });

  test("another teacher's class → 403 'this class belongs to another teacher' (§17)", async () => {
    const { app } = makeApp(asOtherTeacher, detailRoutes(TEACHER));
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this class belongs to another teacher");
  });

  test("malformed {id} → 400 'malformed request' (MethodArgumentTypeMismatch parity)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(sql.queries.length).toBe(0);
  });
});

// ── POST /api/v1/teacher/classes/{id}/status (:137-150) ─────────────────────

describe("POST /api/v1/teacher/classes/{id}/status — archive/reopen", () => {
  test("archived: 200 view with the live member count", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      { match: /^update classes set status = \? where id = \? ::uuid returning/, rows: [classRow({ status: "ARCHIVED" })] },
      memberCountRoute(2),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "archived" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const parsed = teacherClassViewSchema.parse(await res.json());
    expect(parsed.status).toBe("archived");
    expect(parsed.memberCount).toBe(2);
  });

  test("unknown status → 400 'status must be 'active' or 'archived'' (the tolerant-parse service law)", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "deleted" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("status must be 'active' or 'archived'");
  });

  test("blank status → 400 validation_failed 'status: must not be blank' (@NotBlank)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("status: must not be blank");
  });
});

// ── POST /api/v1/teacher/classes/{id}/members (:152-186) — the enroll law ───

describe("POST /api/v1/teacher/classes/{id}/members — enroll", () => {
  const enrollRoutes = (overrides: Partial<Record<string, unknown>>[] = []) => {
    const inserts: string[] = [];
    return {
      inserts,
      routes: [
        ownedClassRoute([classRow()]),
        studentLookupRoute([{ id: STUDENT_2, display_name: "Student 02", email: "s2@example.edu", created_at: T1, enabled: true, roles: ["STUDENT"], ...overrides[0] }]),
        existsMemberRoute(false),
        insertMemberRoute(inserts),
        rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2)]),
        usersBatchRoute([userRow(LEARNER), userRow(STUDENT_2)]),
      ],
    };
  };

  test("happy enroll: 201 roster detail with the new member", async () => {
    const { app, sql } = makeApp(asTeacher, enrollRoutes().routes);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "S2@Example.EDU" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    const parsed = teacherClassDetailViewSchema.parse(await res.json());
    expect(parsed.members.map((m) => m.studentId)).toEqual([LEARNER, STUDENT_2]);
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(1);
  });

  test("unknown email → 404 verbatim ('the student registers first, then you enroll')", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.edu" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("no account with that email — the student registers first, then you enroll");
  });

  test("disabled account → 409 'that account is disabled'", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([{ enabled: false }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "s2@example.edu" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("that account is disabled");
  });

  test("non-STUDENT account → 409 'only student accounts can be enrolled in a class'", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([{ enabled: true, roles: ["TEACHER"] }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "s2@example.edu" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("only student accounts can be enrolled in a class");
  });

  test("archived class → 409 'this class is archived — reopen it before enrolling'", async () => {
    const { app, sql } = makeApp(asTeacher, [ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "s2@example.edu" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("this class is archived — reopen it before enrolling");
    expect(sql.queries.filter((q) => q.includes("user_roles"))).toHaveLength(0); // fail-closed
  });

  test("re-enroll is the idempotent no-op: 201, NO second INSERT", async () => {
    const inserts: string[] = [];
    const { app, sql } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      studentLookupRoute([{ id: STUDENT_2, enabled: true, roles: ["STUDENT"] }]),
      existsMemberRoute(true),
      insertMemberRoute(inserts),
      rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2)]),
      usersBatchRoute([userRow(LEARNER), userRow(STUDENT_2)]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "s2@example.edu" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(0); // the UNIQUE (class_id, student_id) law
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0);
  });

  test("blank email → 400 validation_failed 'email: must not be blank' (@NotBlank)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("email: must not be blank");
  });
});

// ── DELETE /api/v1/teacher/classes/{id}/members/{studentId} (:188-198) ──────

describe("DELETE /api/v1/teacher/classes/{id}/members/{studentId} — remove", () => {
  test("200 with the refreshed detail (no method-level status surprise)", async () => {
    const { app, sql } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      { match: /^delete from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/, rows: [] },
      rosterRoute([memberRow(LEARNER)]),
      usersBatchRoute([userRow(LEARNER)]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/members/${STUDENT_2}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const parsed = teacherClassDetailViewSchema.parse(await res.json());
    expect(parsed.members.map((m) => m.studentId)).toEqual([LEARNER]);
    expect(sql.queries[1]).toContain("delete from class_members");
  });
});

// ── POST /api/v1/teacher/classes/{id}/announcements (:200-225) — publish ────

describe("POST /api/v1/teacher/classes/{id}/announcements — publish", () => {
  const publishRoutes = () => [
    ownedClassRoute([classRow()]),
    { match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/, rows: [announcementRow({ category: "HOMEWORK" })] },
    memberCountRoute(2),
  ];

  test("category absent → 201, Category.parse(null) → GENERAL wire form, readCount 0", async () => {
    const { app } = makeApp(asTeacher, publishRoutes());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title: "Lab kits", body: "Bring lab kits Thursday." }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    const parsed = teacherAnnouncementViewSchema.parse(await res.json());
    expect(parsed.category).toBe("homework"); // the stored row's wire form
    expect(parsed.readCount).toBe(0);
    expect(parsed.memberCount).toBe(2);
  });

  test("EXPLICIT null category binds like absent (Jackson) → 201", async () => {
    const { app } = makeApp(asTeacher, publishRoutes());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title: "Lab kits", body: "Bring lab kits Thursday.", category: null }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
  });

  test("unknown category → 400 verbatim ('category must be general, homework, notice, exam-reminder or resource')", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title: "t", body: "b", category: "bogus" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("category must be general, homework, notice, exam-reminder or resource");
  });

  test("whitespace-only title → 400 validation_failed 'title: must not be blank' (@NotBlank)", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow()])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title: "   ", body: "b" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("title: must not be blank");
  });

  test("archived class → 409 'this class is archived — reopen it before publishing'", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title: "t", body: "b" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("this class is archived — reopen it before publishing");
  });
});

// ── GET /api/v1/teacher/classes/{id}/announcements (:227-244) ────────────────

describe("GET /api/v1/teacher/classes/{id}/announcements — read counts", () => {
  test("200, canonical-schema-valid, batched read counts + roster size", async () => {
    const { app, sql } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      announcementsByClassRoute([announcementRow(), announcementRow({ id: ANNOUNCE_2, title: "Older", created_at: T1 })]),
      rosterRoute([memberRow(LEARNER)]),
      readCountsRoute([{ announcement_id: ANNOUNCE_1, read_count: 1 }]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/announcements`);
    expect(res.status).toBe(200);
    const parsed = teacherAnnouncementViewSchema.array().parse(await res.json());
    expect(parsed.length).toBe(2);
    expect(parsed[0]!.readCount).toBe(1);
    expect(parsed[0]!.memberCount).toBe(1);
    expect(parsed[1]!.readCount).toBe(0);
    expect(sql.queries.filter((q) => q.includes("announcement_reads"))).toHaveLength(1); // batched
  });
});

// ── LearnerClassroomController — the student overlay (:46-177) ──────────────

describe("learner classroom router — the overlay", () => {
  test("anonymous → Boot 401 (anyRequest().authenticated() parity)", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(401);
    expect((await res.json()).path).toBe("/api/v1/learners/me/classroom");
  });

  test("independent student: 200 with the HONEST empty overlay (never an error)", async () => {
    const { app, sql } = makeApp(asStudent, [membershipsRoute([])]);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(200);
    const parsed = learnerClassroomViewSchema.parse(await res.json());
    expect(parsed.classes).toEqual([]);
    expect(parsed.unreadAnnouncements).toBe(0);
    expect(sql.queries.length).toBe(1); // the membership probe answered alone
  });

  test("populated overlay: unread per class + flattened badge, teacher names batched", async () => {
    const { app, sql } = makeApp(asStudent, [
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow()]),
      announcementsAnyRoute([announcementRow(), announcementRow({ id: ANNOUNCE_2, title: "Older", created_at: T1 })]),
      readIdsRoute([{ announcement_id: ANNOUNCE_2 }]),
      usersBatchRoute([userRow(TEACHER, { display_name: "Ms. Okafor" })]),
    ]);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(200);
    const parsed = learnerClassroomViewSchema.parse(await res.json());
    expect(parsed.classes.length).toBe(1);
    expect(parsed.classes[0]!.unreadAnnouncements).toBe(1); // ANNOUNCE_1 unread
    expect(parsed.classes[0]!.teacherName).toBe("Ms. Okafor");
    expect(parsed.unreadAnnouncements).toBe(1); // the flattened badge
    expect(sql.queries.filter((q) => q.includes("from users"))).toHaveLength(1); // batched
  });

  test("archived classes DROP OUT of the overlay (the dishonesty guard)", async () => {
    const { app, sql } = makeApp(asStudent, [
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow({ status: "ARCHIVED" })]),
    ]);
    const res = await app.request("/api/v1/learners/me/classroom");
    expect(res.status).toBe(200);
    const parsed = learnerClassroomViewSchema.parse(await res.json());
    expect(parsed.classes).toEqual([]);
    expect(parsed.unreadAnnouncements).toBe(0);
    expect(sql.queries.filter((q) => q.includes("from announcements"))).toHaveLength(0); // no feed for the dead class
  });

  test("GET /announcements: the cross-class feed with MY read flag beside each", async () => {
    const { app } = makeApp(asStudent, [
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow()]),
      announcementsAnyRoute([announcementRow()]),
      readIdsRoute([{ announcement_id: ANNOUNCE_1 }]),
      usersBatchRoute([userRow(TEACHER, { display_name: "Ms. Okafor" })]),
    ]);
    const res = await app.request("/api/v1/learners/me/classroom/announcements");
    expect(res.status).toBe(200);
    const parsed = learnerAnnouncementViewSchema.array().parse(await res.json());
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.read).toBeTrue();
    expect(parsed[0]!.className).toBe("Period 3");
    expect(parsed[0]!.teacherName).toBe("Ms. Okafor");
  });

  test("POST /announcements/{id}/read: 200 { id, read: true }, the append-only receipt", async () => {
    const { app } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(true),
      existsReadRoute(false),
      { match: /^insert into announcement_reads \(announcement_id, student_id, read_at\)/, rows: [] },
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const parsed = announcementReadResultSchema.parse(await res.json());
    expect(parsed).toEqual({ id: ANNOUNCE_1, read: true });
  });

  test("markRead is idempotent: the repeat receipt with NO second INSERT", async () => {
    const { app, sql } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(true),
      existsReadRoute(true),
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).read).toBeTrue();
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0);
  });

  test("unknown announcement → 404 'announcement not found'", async () => {
    const { app } = makeApp(asStudent, [announcementByIdRoute([])]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("announcement not found");
  });

  test("another teacher's class → 403 'this announcement is not in your classroom' (the membership gate)", async () => {
    const { app, sql } = makeApp(asStudent, [
      announcementByIdRoute([announcementRow()]),
      existsMemberRoute(false),
    ]);
    const res = await app.request(`/api/v1/learners/me/classroom/announcements/${ANNOUNCE_1}/read`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this announcement is not in your classroom");
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0); // fail-closed
  });

  test("malformed {id} → 400 'malformed request'", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/learners/me/classroom/announcements/nope/read", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});

// ── TeacherRosterController — GET /api/v1/teacher/learners (:23-43) ─────────

describe("teacher roster router — the V49/V51 ruling surface", () => {
  test("anonymous → Boot 401 (the roster shell rides the /api/v1/teacher mount)", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/learners");
    expect(res.status).toBe(401);
    expect((await res.json()).path).toBe("/api/v1/teacher/learners");
  });

  test("authenticated STUDENT → Boot 403 (TEACHER/ADMIN gate)", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/teacher/learners");
    expect(res.status).toBe(403);
  });

  test("teacher: 200, canonical-schema-valid, identity projection ONLY", async () => {
    const { app } = makeApp(asTeacher, [
      rosterCohortRoute([userRow(LEARNER), userRow(STUDENT_2)]),
    ]);
    const res = await app.request("/api/v1/teacher/learners");
    expect(res.status).toBe(200);
    const parsed = learnerRosterViewSchema.array().parse(await res.json());
    expect(parsed.length).toBe(2);
    expect(Object.keys(parsed[0]!).sort()).toEqual(["createdAt", "displayName", "email", "id"]);
    expect(parsed[0]!.displayName).toBe("Student 01");
  });

  test("topology: authenticated teacher on an UNOWNED /api/v1/teacher path → 404 fallback (roster shell passes through)", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/definitely-not-a-route");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
  });

  test("topology: anonymous on an UNOWNED /api/v1/teacher path → 401 BEFORE the 404 (SecurityConfig teacher/** parity)", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/teacher/definitely-not-a-route");
    expect(res.status).toBe(401);
  });
});
