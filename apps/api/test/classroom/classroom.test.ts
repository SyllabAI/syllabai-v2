/**
 * Classroom service unit tests (T-MIG-052 tranche 1) — stubbed sql via the
 * shared fakeSql helper (+ param-aware routes). Pins the frozen law
 * @ 6cad6ef: the SchoolClass.Status parse/wire law (tolerant
 * active|archived, verbatim 400), the Announcement.Category parse/wire law
 * (null/blank → GENERAL, '-'→'_' normalization, kebab wire, verbatim 400),
 * the class create clash law (case-INSENSITIVE over the teacher's ACTIVE
 * classes on the same course, the verbatim 409, blank-name 400), the
 * ownership §17 gate (404 class not found / 403 this class belongs to
 * another teacher), the detail honesty rows ("(removed account)" /
 * "(unavailable)"), the enroll law chain (archived 409 → email law →
 * unknown 404 verbatim → disabled 409 → non-STUDENT 409 → the idempotent
 * no-op no-INSERT), the publish law chain (archived 409 → category 400 →
 * trimmed-blank 400, fresh row readCount 0), the teacher announcements
 * read-count batching, the learner overlay (the independent-student rule:
 * EMPTY is the honest state; archived classes DROP OUT; the 4-query
 * batching; the "(unavailable)" teacher fallback; unread per class +
 * flattened total), the membership-gated idempotent markRead (404 / 403
 * verbatim / no INSERT on the repeat) and the V49 roster law (enabled
 * STUDENT cohort, displayName asc / email asc, identity projection only).
 */
import { describe, expect, test } from "bun:test";
import {
  ANNOUNCEMENT_LIMIT,
  ANNOUNCEMENT_CATEGORIES,
  ClassroomForbiddenError,
  ClassroomNotFoundError,
  TEACHER_CLASS_LIST_LIMIT,
  announcementCategoryWire,
  buildClassroomModule,
  classStatusWire,
  parseAnnouncementCategory,
  parseClassStatus,
} from "../../src/services/classroom";
import { BadRequestError, ConflictError, type SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const LEARNER = "bb000000-0000-4000-8000-000000000001";
const STUDENT_2 = "bb000000-0000-4000-8000-000000000002";
const VANISHED_STUDENT = "bb000000-0000-4000-8000-0000000000ff";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const CLASS_B = "cc000000-0000-4000-8000-000000000002";
const ANNOUNCE_1 = "dd000000-0000-4000-8000-000000000001";
const ANNOUNCE_2 = "dd000000-0000-4000-8000-000000000002";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";

const T0 = "2026-09-20T10:00:00.305782Z";
const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z"; // toInstant(NOW_TEXT) — the fleet's Date rendering

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

const rosterCohortRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select u\.id, u\.display_name, u\.email, u\.created_at from users u join user_roles r on r\.user_id = u\.id where r\.role = 'STUDENT' and u\.enabled = true group by u\.id, u\.display_name, u\.email, u\.created_at order by u\.display_name asc, u\.email asc$/,
  rows,
});

// ── pure parse/wire laws ─────────────────────────────────────────────────────

describe("classroom frozen constants", () => {
  test("the bounds are the frozen 100/100", () => {
    expect(TEACHER_CLASS_LIST_LIMIT).toBe(100);
    expect(ANNOUNCEMENT_LIMIT).toBe(100);
  });

  test("the category vocabulary is the five §9 wire forms", () => {
    expect(ANNOUNCEMENT_CATEGORIES).toEqual([
      "GENERAL",
      "HOMEWORK",
      "NOTICE",
      "EXAM_REMINDER",
      "RESOURCE",
    ]);
  });
});

describe("parseClassStatus / classStatusWire (SchoolClass.Status :44-63)", () => {
  test("tolerant parse: trim + lowercase", () => {
    expect(parseClassStatus("active")).toBe("ACTIVE");
    expect(parseClassStatus("  ARCHIVED ")).toBe("ARCHIVED");
    expect(parseClassStatus(null)).toBeNull();
    expect(parseClassStatus("deleted")).toBeNull();
    expect(parseClassStatus("")).toBeNull();
  });

  test("wire form is lowercase", () => {
    expect(classStatusWire("ACTIVE")).toBe("active");
    expect(classStatusWire("ARCHIVED")).toBe("archived");
  });
});

describe("parseAnnouncementCategory / announcementCategoryWire (Announcement.Category :33-57)", () => {
  test("null/blank parses to GENERAL", () => {
    expect(parseAnnouncementCategory(null)).toBe("GENERAL");
    expect(parseAnnouncementCategory(undefined)).toBe("GENERAL");
    expect(parseAnnouncementCategory("   ")).toBe("GENERAL");
  });

  test("kebab-tolerant parse with '-'→'_' normalization", () => {
    expect(parseAnnouncementCategory("EXAM-REMINDER")).toBe("EXAM_REMINDER");
    expect(parseAnnouncementCategory("  exam_reminder ")).toBe("EXAM_REMINDER");
    expect(parseAnnouncementCategory("Resource")).toBe("RESOURCE");
    expect(parseAnnouncementCategory("homework")).toBe("HOMEWORK");
  });

  test("unknown → null (the caller raises the frozen 400)", () => {
    expect(parseAnnouncementCategory("urgent")).toBeNull();
    expect(parseAnnouncementCategory("exam reminder")).toBeNull(); // space, not kebab
  });

  test("wire form is kebab-case", () => {
    expect(announcementCategoryWire("EXAM_REMINDER")).toBe("exam-reminder");
    expect(announcementCategoryWire("GENERAL")).toBe("general");
  });
});

// ── teacher class lifecycle ─────────────────────────────────────────────────

describe("createClass (TeacherClassController :79-98)", () => {
  test("blank (trimmed) name → 400 'class name must not be blank'", async () => {
    const sql = fakeSql([]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.createClass(TEACHER, { courseSlug: "s", courseLabel: "l", name: "   " }))
      .rejects.toThrow(BadRequestError);
    await expect(
      mod.createClass(TEACHER, { courseSlug: "s", courseLabel: "l", name: "   " }),
    ).rejects.toThrow("class name must not be blank");
    expect(sql.queries).toHaveLength(0); // fail-closed before any statement
  });

  test("case-INSENSITIVE clash over the teacher's ACTIVE classes on the same course → 409 verbatim", async () => {
    const sql = fakeSql([
      {
        match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/,
        rows: [classRow({ name: "period 3" })], // different case on purpose
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    await expect(
      mod.createClass(TEACHER, { courseSlug: "igcse-chemistry-19", courseLabel: "IGCSE Chemistry", name: "Period 3" }),
    ).rejects.toThrow("you already have a live class with this name on this course");
    await expect(
      mod.createClass(TEACHER, { courseSlug: "igcse-chemistry-19", courseLabel: "IGCSE Chemistry", name: "Period 3" }),
    ).rejects.toThrow(ConflictError);
    expect(sql.queries[0]).toContain("status = 'ACTIVE'");
  });

  test("clash is scoped to the course (same name on another course is legal)", async () => {
    const sql = fakeSql([
      {
        match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/,
        rows: [],
      },
      {
        match: /^insert into classes \(id, teacher_id, course_slug, course_label, name, status, created_at\)/,
        rows: [classRow({ id: NEW_ID, name: "Period 3", created_at: NOW })], // the DB returns what the INSERT stored
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.createClass(TEACHER, {
      courseSlug: "igcse-physics-21",
      courseLabel: "IGCSE Physics",
      name: "Period 3",
    });
    expect(view.id).toBe(NEW_ID);
    expect(view.status).toBe("active");
    expect(view.memberCount).toBe(0); // a fresh class has no members
    expect(view.createdAt).toBe(NOW_ISO);
  });

  test("happy path: INSERT carries 'ACTIVE' + the clock's id/created_at", async () => {
    const sql = fakeSql([
      {
        match: /from classes where teacher_id = \? ::uuid and course_slug = \? and status = 'ACTIVE' order by created_at desc limit \?$/,
        rows: [],
      },
      {
        match: /^insert into classes \(id, teacher_id, course_slug, course_label, name, status, created_at\)/,
        rows: [classRow({ id: NEW_ID, created_at: NOW })],
        rowsFor: (params) => {
          expect(params[0]).toBe(NEW_ID);
          expect(params[1]).toBe(TEACHER);
          expect(params[4]).toBe("Period 3"); // trimmed name stored
          expect(params[5]).toBe(NOW_ISO); // the clock's created_at ('ACTIVE' is inline SQL)
          return [classRow({ id: NEW_ID, created_at: NOW })];
        },
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.createClass(TEACHER, {
      courseSlug: "igcse-chemistry-19",
      courseLabel: "IGCSE Chemistry",
      name: "  Period 3  ",
    });
    expect(view.name).toBe("Period 3"); // the TRIMMED name is stored
    expect(view.createdAt).toBe(NOW_ISO);
  });
});

describe("listTeacherClasses (:100-108)", () => {
  test("newest-first rows + ONE grouped count query (missing counts → honest 0)", async () => {
    const sql = fakeSql([
      {
        match: /from classes where teacher_id = \? ::uuid order by created_at desc limit \?$/,
        rows: [classRow({ id: CLASS_A }), classRow({ id: CLASS_B, name: "Period 4", created_at: T0 })],
      },
      {
        match: /select class_id, count\(\*\)::int as member_count from class_members where class_id = any\( \? ::uuid\[\]\) group by class_id$/,
        rows: [{ class_id: CLASS_A, member_count: 7 }],
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const rows = await mod.listTeacherClasses(TEACHER);
    expect(rows.map((r) => r.id)).toEqual([CLASS_A, CLASS_B]); // sql order preserved
    expect(rows[0]!.memberCount).toBe(7);
    expect(rows[1]!.memberCount).toBe(0); // no row in the grouped count = 0
    expect(sql.queries).toHaveLength(2); // the batching law: two queries total
  });
});

describe("the §17 ownership gate (:252-258)", () => {
  test("unknown class → 404 'class not found'", async () => {
    const sql = fakeSql([ownedClassRoute([])]);
    await expect(buildClassroomModule(sql, clock).teacherClassDetail(TEACHER, CLASS_A)).rejects.toThrow(
      "class not found",
    );
  });

  test("another teacher's class → 403 'this class belongs to another teacher'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    const err = await buildClassroomModule(sql, clock)
      .teacherClassDetail(TEACHER, CLASS_A)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ClassroomForbiddenError);
    expect(err.message).toBe("this class belongs to another teacher");
  });
});

describe("teacherClassDetail (:110-135)", () => {
  test("roster enrolledAt ASC + batched user load; members carry provenance", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(LEARNER, { enrolled_at: T0 }), memberRow(STUDENT_2, { enrolled_at: T1 })]), // the DB's enrolled_at asc order
      usersBatchRoute([
        { id: LEARNER, display_name: "Amara H.", email: "amara@example.test", created_at: T0 },
      ]),
    ]);
    const detail = await buildClassroomModule(sql, clock).teacherClassDetail(TEACHER, CLASS_A);
    expect(detail.status).toBe("active");
    // enrolled_at ASC — the earlier enrollment FIRST
    expect(detail.members.map((m) => m.studentId)).toEqual([LEARNER, STUDENT_2]);
    expect(detail.members[0]!.displayName).toBe("Amara H.");
    expect(detail.members[0]!.enrolledBy).toBe(TEACHER);
    expect(sql.queries.filter((q) => q.startsWith("select id, display_name"))).toHaveLength(1); // batched
  });

  test("a hard-removed account still shows, named honestly (:125-128)", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(VANISHED_STUDENT), memberRow(LEARNER)]),
      usersBatchRoute([{ id: LEARNER, display_name: "Amara H.", email: "amara@example.test", created_at: T0 }]),
    ]);
    const detail = await buildClassroomModule(sql, clock).teacherClassDetail(TEACHER, CLASS_A);
    const vanished = detail.members.find((m) => m.studentId === VANISHED_STUDENT)!;
    expect(vanished.displayName).toBe("(removed account)");
    expect(vanished.email).toBe("(unavailable)");
  });
});

describe("setClassStatus (:137-150)", () => {
  test("unknown status → 400 'status must be active or archived' (verbatim with quotes)", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.setClassStatus(TEACHER, CLASS_A, { status: "deleted" })).rejects.toThrow(
      BadRequestError,
    );
    await expect(mod.setClassStatus(TEACHER, CLASS_A, { status: "deleted" })).rejects.toThrow(
      "status must be 'active' or 'archived'",
    );
    expect(sql.queries.filter((q) => q.startsWith("update"))).toHaveLength(0); // fail-closed
  });

  test("tolerant parse accepts 'ARCHIVED ' and flips with the live member count", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      {
        match: /^update classes set status = \? where id = \? ::uuid returning/,
        rows: [classRow({ status: "ARCHIVED" })],
        rowsFor: (params) => {
          expect(params[0]).toBe("ARCHIVED");
          return [classRow({ status: "ARCHIVED" })];
        },
      },
      memberCountRoute(12),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.setClassStatus(TEACHER, CLASS_A, { status: "  ARCHIVED " });
    expect(view.status).toBe("archived");
    expect(view.memberCount).toBe(12); // members survive archiving (the count is live)
  });
});

describe("enrollStudent (:152-186)", () => {
  const studentRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: LEARNER,
    display_name: "Amara H.",
    email: "amara@example.test",
    created_at: T0,
    enabled: true,
    roles: ["STUDENT"],
    ...over,
  });

  test("archived class → 409 'this class is archived — reopen it before enrolling'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.enrollStudent(TEACHER, CLASS_A, { email: "amara@example.test" })).rejects.toThrow(
      "this class is archived — reopen it before enrolling",
    );
    await expect(mod.enrollStudent(TEACHER, CLASS_A, { email: "amara@example.test" })).rejects.toThrow(
      ConflictError,
    );
  });

  test("blank email → 400 'email must not be blank' (fail-closed)", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.enrollStudent(TEACHER, CLASS_A, { email: "   " })).rejects.toThrow(
      "email must not be blank",
    );
    expect(sql.queries.filter((q) => q.includes("user_roles"))).toHaveLength(0);
  });

  test("unknown email → 404 verbatim 'no account with that email — the student registers first, then you enroll'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()]), studentLookupRoute([])]);
    const mod = buildClassroomModule(sql, clock);
    const err = await mod.enrollStudent(TEACHER, CLASS_A, { email: "ghost@example.test" }).catch((e) => e);
    expect(err).toBeInstanceOf(ClassroomNotFoundError);
    expect(err.message).toBe("no account with that email — the student registers first, then you enroll");
  });

  test("disabled account → 409 'that account is disabled'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()]), studentLookupRoute([studentRow({ enabled: false })])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.enrollStudent(TEACHER, CLASS_A, { email: "amara@example.test" })).rejects.toThrow(
      "that account is disabled",
    );
  });

  test("non-STUDENT account → 409 'only student accounts can be enrolled in a class'", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      studentLookupRoute([studentRow({ roles: ["TEACHER"] })]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.enrollStudent(TEACHER, CLASS_A, { email: "amara@example.test" })).rejects.toThrow(
      "only student accounts can be enrolled in a class",
    );
  });

  test("re-enrollment is the idempotent no-op it honestly is (no INSERT when the pair exists)", async () => {
    const inserts: string[] = [];
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      studentLookupRoute([studentRow()]),
      existsMemberRoute(true),
      insertMemberRoute(inserts),
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(LEARNER)]),
      usersBatchRoute([{ id: LEARNER, display_name: "Amara H.", email: "amara@example.test", created_at: T0 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const detail = await mod.enrollStudent(TEACHER, CLASS_A, { email: "  Amara@Example.TEST " });
    expect(detail.members).toHaveLength(1);
    expect(inserts).toHaveLength(0); // the honest no-op: no INSERT issued
  });

  test("happy path: one INSERT with enrolledBy = the enrolling teacher, then the detail", async () => {
    const inserts: string[] = [];
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      studentLookupRoute([studentRow()]),
      existsMemberRoute(false),
      insertMemberRoute(inserts),
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(LEARNER, { enrolled_at: NOW })]), // the just-inserted row carries the clock's enrolled_at
      usersBatchRoute([{ id: LEARNER, display_name: "Amara H.", email: "amara@example.test", created_at: T0 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const detail = await mod.enrollStudent(TEACHER, CLASS_A, { email: "AMARA@example.test" });
    expect(inserts).toEqual([LEARNER]); // the student id bound
    expect(detail.members[0]!.enrolledAt).toBe(NOW_ISO); // clock-driven enrolledAt
    expect(detail.members[0]!.enrolledBy).toBe(TEACHER);
  });
});

describe("removeMember (:188-198)", () => {
  test("deletes exactly that member row, then the detail", async () => {
    let deleted = "";
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      {
        match: /^delete from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/,
        rows: [],
        rowsFor: (params) => {
          deleted = params[1] as string;
          return [];
        },
      },
      ownedClassRoute([classRow()]),
      rosterRoute([memberRow(STUDENT_2)]),
      usersBatchRoute([{ id: STUDENT_2, display_name: "Ben O.", email: "ben@example.test", created_at: T0 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const detail = await mod.removeMember(TEACHER, CLASS_A, LEARNER);
    expect(deleted).toBe(LEARNER);
    expect(detail.members.map((m) => m.studentId)).toEqual([STUDENT_2]);
  });
});

describe("publishAnnouncement (:200-225)", () => {
  test("archived class → 409 'this class is archived — reopen it before publishing'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(
      mod.publishAnnouncement(TEACHER, CLASS_A, { title: "t", body: "b" }),
    ).rejects.toThrow("this class is archived — reopen it before publishing");
  });

  test("unknown category → 400 verbatim (after the archived gate, per the frozen sequencing)", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(
      mod.publishAnnouncement(TEACHER, CLASS_A, { title: "t", body: "b", category: "urgent" }),
    ).rejects.toThrow("category must be general, homework, notice, exam-reminder or resource");
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0);
  });

  test("trimmed-blank title or body → 400 'title and body must not be blank'", async () => {
    const sql = fakeSql([ownedClassRoute([classRow()])]);
    const mod = buildClassroomModule(sql, clock);
    await expect(mod.publishAnnouncement(TEACHER, CLASS_A, { title: "   ", body: "b" })).rejects.toThrow(
      "title and body must not be blank",
    );
    await expect(mod.publishAnnouncement(TEACHER, CLASS_A, { title: "t", body: "  " })).rejects.toThrow(
      "title and body must not be blank",
    );
  });

  test("happy path: category ABSENT → GENERAL stored; fresh row serves readCount 0 + live roster; kebab wire", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      {
        match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/,
        rows: [announcementRow({ category: "GENERAL", id: NEW_ID, created_at: NOW })],
        rowsFor: (params) => {
          expect(params[5]).toBe("GENERAL"); // absent category stored as the NAME
          expect(params[1]).toBe(TEACHER); // authored by the publishing teacher
          return [announcementRow({ category: "GENERAL", id: NEW_ID, title: "Lab kits", created_at: NOW })];
        },
      },
      memberCountRoute(12),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.publishAnnouncement(TEACHER, CLASS_A, {
      title: "  Lab kits  ",
      body: "Bring lab kits Thursday.",
    });
    expect(view.id).toBe(NEW_ID);
    expect(view.category).toBe("general"); // the kebab WIRE form
    expect(view.readCount).toBe(0); // a just-published announcement has no reads
    expect(view.memberCount).toBe(12);
    expect(view.createdAt).toBe(NOW_ISO);
  });

  test("explicit 'exam-reminder' parses to EXAM_REMINDER and serves the kebab wire", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      {
        match: /^insert into announcements \(id, teacher_id, class_id, title, body, category, created_at\)/,
        rows: [announcementRow({ category: "EXAM_REMINDER", id: NEW_ID })],
      },
      memberCountRoute(3),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.publishAnnouncement(TEACHER, CLASS_A, {
      title: "Mock exam",
      body: "Hall B, 09:00.",
      category: "exam-reminder",
    });
    expect(view.category).toBe("exam-reminder");
  });
});

describe("teacherAnnouncements (:227-244)", () => {
  test("newest-first LIMIT 100 + batched read counts + roster-sized memberCount", async () => {
    const sql = fakeSql([
      ownedClassRoute([classRow()]),
      announcementsByClassRoute([announcementRow({ id: ANNOUNCE_2 }), announcementRow()]),
      rosterRoute([memberRow(LEARNER), memberRow(STUDENT_2)]),
      readCountsRoute([{ announcement_id: ANNOUNCE_1, read_count: 2 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const rows = await mod.teacherAnnouncements(TEACHER, CLASS_A);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(ANNOUNCE_2);
    expect(rows[0]!.readCount).toBe(0); // no grouped row = honest 0
    expect(rows[1]!.readCount).toBe(2);
    expect(rows[1]!.memberCount).toBe(2); // the roster size, both rows
    expect(sql.queries.filter((q) => q.includes("announcement_reads"))).toHaveLength(1); // batched
  });
});

// ── the learner overlay (LearnerClassroomController :85-148) ────────────────

describe("learnerOverview (:85-104)", () => {
  test("the independent-student rule: no membership rows → the honest EMPTY (not an error)", async () => {
    const sql = fakeSql([membershipsRoute([])]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.learnerOverview(LEARNER);
    expect(view.classes).toEqual([]);
    expect(view.unreadAnnouncements).toBe(0);
    expect(sql.queries).toHaveLength(1); // the workspace short-circuits
  });

  test("archived classes DROP OUT of the overlay; all-archived → the honest EMPTY", async () => {
    const sql = fakeSql([
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow({ status: "ARCHIVED" })]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.learnerOverview(LEARNER);
    expect(view.classes).toEqual([]);
    expect(view.unreadAnnouncements).toBe(0);
    expect(sql.queries).toHaveLength(2); // feed/read queries never fire
  });

  test("per-class unread + the flattened badge + the batched teacher names", async () => {
    const sql = fakeSql([
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow()]),
      announcementsAnyRoute([announcementRow({ id: ANNOUNCE_1 }), announcementRow({ id: ANNOUNCE_2 })]),
      readIdsRoute([{ announcement_id: ANNOUNCE_1 }]),
      usersBatchRoute([{ id: TEACHER, display_name: "Ms. Okafor", email: "t@example.test", created_at: T0 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.learnerOverview(LEARNER);
    expect(view.classes).toHaveLength(1);
    expect(view.classes[0]!.unreadAnnouncements).toBe(1); // ANNOUNCE_2 unread
    expect(view.classes[0]!.teacherName).toBe("Ms. Okafor");
    expect(view.unreadAnnouncements).toBe(1); // the flattened badge
  });

  test("a vanished teacher account serves the '(unavailable)' fallback (:158-160)", async () => {
    const sql = fakeSql([
      membershipsRoute([memberRow(LEARNER)]),
      classesAnyRoute([classRow()]),
      announcementsAnyRoute([]),
      usersBatchRoute([]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const view = await mod.learnerOverview(LEARNER);
    expect(view.classes[0]!.teacherName).toBe("(unavailable)");
    expect(view.unreadAnnouncements).toBe(0); // empty feed → unread 0, not an error
  });
});

describe("learnerAnnouncements (:106-121)", () => {
  test("the feed across ALL my live classes with MY read flag beside each", async () => {
    const sql = fakeSql([
      membershipsRoute([memberRow(LEARNER), memberRow(STUDENT_2, { class_id: CLASS_B })]),
      classesAnyRoute([classRow(), classRow({ id: CLASS_B, name: "Period 4" })]),
      announcementsAnyRoute([
        announcementRow({ id: ANNOUNCE_1, class_id: CLASS_B }),
        announcementRow({ id: ANNOUNCE_2 }),
      ]),
      readIdsRoute([{ announcement_id: ANNOUNCE_2 }]),
      usersBatchRoute([{ id: TEACHER, display_name: "Ms. Okafor", email: "t@example.test", created_at: T0 }]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const rows = await mod.learnerAnnouncements(LEARNER);
    // the frozen loop order: MEMBERSHIP order outer (enrolledAt asc), within
    // each class created_at desc — NOT a global feed re-sort
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toBe("Period 3"); // CLASS_A membership first
    expect(rows[0]!.read).toBeTrue(); // MY read receipt on ANNOUNCE_2
    expect(rows[1]!.className).toBe("Period 4"); // CLASS_B second
    expect(rows[1]!.read).toBeFalse();
    expect(rows[1]!.category).toBe("general");
  });
});

describe("markAnnouncementRead (:123-141)", () => {
  test("unknown announcement → 404 'announcement not found'", async () => {
    const sql = fakeSql([announcementByIdRoute([])]);
    const mod = buildClassroomModule(sql, clock);
    const err = await mod.markAnnouncementRead(LEARNER, ANNOUNCE_1).catch((e) => e);
    expect(err).toBeInstanceOf(ClassroomNotFoundError);
    expect(err.message).toBe("announcement not found");
  });

  test("the §17 membership gate: another teacher's class → 403 verbatim, nothing written", async () => {
    const sql = fakeSql([
      announcementByIdRoute([announcementRow()]),
      { match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/, rows: [] },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const err = await mod.markAnnouncementRead(LEARNER, ANNOUNCE_1).catch((e) => e);
    expect(err).toBeInstanceOf(ClassroomForbiddenError);
    expect(err.message).toBe("this announcement is not in your classroom");
    expect(sql.queries.filter((q) => q.startsWith("insert"))).toHaveLength(0);
  });

  test("the repeat is the idempotent no-op it honestly is (no INSERT on the existing receipt)", async () => {
    const inserts: string[] = [];
    const sql = fakeSql([
      announcementByIdRoute([announcementRow()]),
      { match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/, rows: [{ one: 1 }] },
      existsReadRoute(true),
      {
        match: /^insert into announcement_reads \(announcement_id, student_id, read_at\)/,
        rows: [],
        rowsFor: (params) => {
          inserts.push(params[0] as string);
          return [];
        },
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const result = await mod.markAnnouncementRead(LEARNER, ANNOUNCE_1);
    expect(result).toEqual({ id: ANNOUNCE_1, read: true });
    expect(inserts).toHaveLength(0);
  });

  test("happy path: one append-only receipt row with the clock's read_at; the announcement NEVER mutates", async () => {
    let readAt = "";
    const sql = fakeSql([
      announcementByIdRoute([announcementRow()]),
      { match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/, rows: [{ one: 1 }] },
      existsReadRoute(false),
      {
        match: /^insert into announcement_reads \(announcement_id, student_id, read_at\)/,
        rows: [],
        rowsFor: (params) => {
          expect(params[0]).toBe(ANNOUNCE_1);
          expect(params[1]).toBe(LEARNER);
          readAt = params[2] as string;
          return [];
        },
      },
    ]);
    const mod = buildClassroomModule(sql, clock);
    const result = await mod.markAnnouncementRead(LEARNER, ANNOUNCE_1);
    expect(result.read).toBe(true);
    expect(readAt).toBe(NOW_ISO);
    expect(sql.queries.filter((q) => q.startsWith("update"))).toHaveLength(0); // no mutation path exists
  });
});

describe("rosterLearners (TeacherRosterController :36-41)", () => {
  test("enabled STUDENT cohort ordered displayName asc, email asc — identity projection only", async () => {
    const sql = fakeSql([
      rosterCohortRoute([
        { id: STUDENT_2, display_name: "Ben O.", email: "ben@example.test", created_at: T0 },
        { id: LEARNER, display_name: "Amara H.", email: "amara@example.test", created_at: T1 },
      ]),
    ]);
    const mod = buildClassroomModule(sql, clock);
    const rows = await mod.rosterLearners();
    expect(rows.map((r) => r.displayName)).toEqual(["Ben O.", "Amara H."]); // sql order preserved
    expect(Object.keys(rows[0]!).sort()).toEqual(["createdAt", "displayName", "email", "id"]);
    expect(sql.queries[0]).toContain("r.role = 'STUDENT'");
    expect(sql.queries[0]).toContain("u.enabled = true");
    expect(sql.queries[0]).toContain("order by u.display_name asc, u.email asc");
  });
});
