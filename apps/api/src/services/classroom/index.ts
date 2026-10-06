/**
 * T-MIG-052 tranche 1 — classroom/teacher foundation services (frozen law
 * @ 6cad6ef, syllabai-core). The classes+rosters core of the Wave-5
 * Classroom/teacher band (§2.1), ported line-against-line:
 *
 *   - TeacherClassController.java :57-292    → createClass / listTeacherClasses /
 *     teacherClassDetail / setClassStatus / enrollStudent / removeMember /
 *     publishAnnouncement / teacherAnnouncements
 *     (8 endpoints over /api/v1/teacher/classes — tranche-2 routes; the
 *      per-object OWNERSHIP gate §17 "this class belongs to another
 *      teacher" is 403, the deep-audit M5 method-level TEACHER/ADMIN shell
 *      is the route layer's law, not this module's).
 *   - LearnerClassroomController.java :46-177 → learnerOverview /
 *     learnerAnnouncements / markAnnouncementRead
 *     (the independent-student rule: reads derive from membership rows
 *      ONLY — no membership, no classroom data, the empty read IS the
 *      honest state; ARCHIVED classes drop out of the overlay; the
 *      4-query batching law; markRead is membership-gated 403 and
 *      idempotent — the append-only AnnouncementRead row never mutates
 *      the announcement).
 *   - TeacherRosterController.java :23-43     → rosterLearners
 *     (GET /api/v1/teacher/learners — the V49 ruling surface: the enabled
 *      STUDENT cohort, identity projection ONLY, UserRepository :25-28
 *      order displayName asc, email asc).
 *
 * FROZEN LAWS PINNED (all verbatim, see the test file for the pins):
 *   - SchoolClass.Status parse "active"/"archived" (trim+lowercase,
 *     tolerant) else 400 "status must be 'active' or 'archived'"; wire
 *     form lowercase.
 *   - Announcement.Category parse: null/blank → GENERAL; trim+lowercase
 *     with '-'→'_' normalization; unknown → 400 "category must be
 *     general, homework, notice, exam-reminder or resource"; wire form
 *     kebab-case ("exam-reminder").
 *   - Class create: name trimmed/blank → 400 "class name must not be
 *     blank"; case-INSENSITIVE clash against the teacher's ACTIVE classes
 *     on the same course → 409 "you already have a live class with this
 *     name on this course" (the storage twin is the V51 partial unique
 *     index ux_class_teacher_course_name — this pre-check is the Java
 *     controller's own, ported verbatim; the index stays the DB's law).
 *   - Enroll: archived → 409 "this class is archived — reopen it before
 *     enrolling"; email trim+lowercase, blank → 400 "email must not be
 *     blank"; unknown email → 404 "no account with that email — the
 *     student registers first, then you enroll"; disabled account → 409
 *     "that account is disabled"; non-STUDENT → 409 "only student
 *     accounts can be enrolled in a class"; re-enrollment = the
 *     idempotent no-op it honestly is (no INSERT when the UNIQUE
 *     (class_id, student_id) pair already exists).
 *   - Publish: archived → 409 "this class is archived — reopen it before
 *     publishing"; category parse law above; trimmed title/body blank →
 *     400 "title and body must not be blank"; the fresh row serves
 *     readCount 0 (a just-published announcement has no reads).
 *   - Learner workspace: memberships enrolledAt ASC → live filter (class
 *     exists AND ACTIVE) → feed LIMIT 100 across live classes created_at
 *     DESC → MY read ids → teacher names batched with the "(unavailable)"
 *     fallback for a vanished teacher account. Four queries, not one per
 *     row (:142-148 javadoc law).
 *   - markRead: 404 "announcement not found"; 403 "this announcement is
 *     not in your classroom" (§17 — never another teacher's class);
 *     idempotent (no INSERT when the read receipt exists); returns
 *     { id, read: true }.
 *   - Roster: `distinct` enabled STUDENT cohort ordered displayName asc,
 *     email asc — identity projection only (no learning data).
 *
 * HONESTY RULES (V51 header, carried verbatim in behavior): course refs
 * are opaque hub-owned strings; classroom workflow writes NO learner-model
 * state (no BKT/SkillState/misconception/review rows — the V47/V48/V49/V51
 * pin); announcements are teacher-to-class communication, NOT an AI
 * channel; the announcement row is immutable once published (edit/delete
 * deliberately out of the foundation slice).
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists and state-bearing predicates inline as static
 * template text. Multi-id lookups use the fleet's `= any(${ids}::uuid[])`
 * convention. Instant rendering follows services/assessment/history.ts
 * (`new Date(x).toISOString()`, ISO-8601 UTC) — the same posture every
 * landed lane ships.
 *
 * OUT OF FENCE (tranche-2, flagged per the 010/020/021/030/031/032/034/
 * 041/043 ratified precedent): routes + mounts for /api/v1/teacher/classes,
 * /api/v1/learners/me/classroom and /api/v1/teacher/learners. NO hub-flip
 * in this task. KG / coverage / analytics / notes / revision / smart-
 * lesson stay OUT (their own W5 tranches).
 */
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, ConflictError, type SubmitClock } from "../selfmark";
import type {
  AnnouncementReadResult,
  ClassCreateRequest,
  ClassEnrollRequest,
  ClassPublishRequest,
  ClassStatusRequest,
  LearnerAnnouncementView,
  LearnerClassroomView,
  LearnerRosterView,
  TeacherAnnouncementView,
  TeacherClassDetailView,
  TeacherClassView,
} from "@syllabai/contracts";

// ── errors (message-carrying; the route layer owns status mapping) ──────────
//
// BadRequestError / ConflictError are the fleet's own classes from
// services/selfmark (composition, never a fork — the existing routes
// already map them). This module adds the two shapes the fleet classes
// cannot carry: a verbatim-message 404 (the identity NotFoundError's
// constructor formats "resource id not found", which would corrupt the
// frozen messages "class not found" / "announcement not found" / the
// enroll email line) and the §17 ownership/membership 403 class-gate.
// T-MIG-052 tranche-2's routes map them:
//   ClassroomNotFoundError  → 404 not_found (e.message verbatim)
//   ClassroomForbiddenError → 403 forbidden (e.message verbatim)

export class ClassroomNotFoundError extends Error {}
export class ClassroomForbiddenError extends Error {}

// ── frozen constants ─────────────────────────────────────────────────────────

/** TeacherClassController.LIST_LIMIT (:66-67) — the teacher list bound. */
export const TEACHER_CLASS_LIST_LIMIT = 100;
/** Both announcement feeds' bound (TeacherClassController :67,
 *  LearnerClassroomController :56). */
export const ANNOUNCEMENT_LIMIT = 100;

/**
 * SchoolClass.Status (SchoolClass.java :44-63) — the internal enum NAMES
 * cross the storage rows (V51 CHECK constraint) and the WIRE forms cross
 * the view (`Status.wire()`).
 */
export const CLASS_STATUS_ACTIVE = "ACTIVE";
export const CLASS_STATUS_ARCHIVED = "ARCHIVED";
export const CLASS_STATUSES = [CLASS_STATUS_ACTIVE, CLASS_STATUS_ARCHIVED] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

/** SchoolClass.Status.parse — trim+lowercase, tolerant, else null. */
export function parseClassStatus(raw: string | null | undefined): ClassStatus | null {
  if (raw == null) return null;
  switch (raw.trim().toLowerCase()) {
    case "active":
      return CLASS_STATUS_ACTIVE;
    case "archived":
      return CLASS_STATUS_ARCHIVED;
    default:
      return null;
  }
}

/** SchoolClass.Status.wire — the canonical wire form served to clients. */
export function classStatusWire(status: ClassStatus): string {
  return status === CLASS_STATUS_ACTIVE ? "active" : "archived";
}

/**
 * Announcement.Category (Announcement.java :33-57) — internal NAMES cross
 * the storage rows (V51 CHECK), wire forms are kebab-case.
 */
export const ANNOUNCEMENT_CATEGORIES = [
  "GENERAL",
  "HOMEWORK",
  "NOTICE",
  "EXAM_REMINDER",
  "RESOURCE",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

const CATEGORY_WIRE: Record<AnnouncementCategory, string> = {
  GENERAL: "general",
  HOMEWORK: "homework",
  NOTICE: "notice",
  EXAM_REMINDER: "exam-reminder",
  RESOURCE: "resource",
};

/** Announcement.Category.parse — null/blank → GENERAL; trim+lowercase with
 *  '-'→'_' normalization; unknown → null (the caller raises the frozen
 *  400 — the Java controller's own sequencing). */
export function parseAnnouncementCategory(
  raw: string | null | undefined,
): AnnouncementCategory | null {
  if (raw == null || raw.trim().length === 0) return "GENERAL";
  switch (raw.trim().toLowerCase().replace(/-/g, "_")) {
    case "general":
      return "GENERAL";
    case "homework":
      return "HOMEWORK";
    case "notice":
      return "NOTICE";
    case "exam_reminder":
      return "EXAM_REMINDER";
    case "resource":
      return "RESOURCE";
    default:
      return null;
  }
}

/** Announcement.Category.wire — the canonical kebab-case wire form. */
export function announcementCategoryWire(category: AnnouncementCategory): string {
  return CATEGORY_WIRE[category];
}

/** The frozen "(removed account)" honesty rows (TeacherClassController
 *  :125-128 javadoc: a member row whose account was hard-removed still
 *  shows, named honestly, rather than vanishing from the roster). */
export const REMOVED_ACCOUNT_NAME = "(removed account)";
export const REMOVED_ACCOUNT_EMAIL = "(unavailable)";
/** The learner-side teacher-name fallback (LearnerClassroomController
 *  :158-160 ifPresentOrElse). */
export const TEACHER_NAME_UNAVAILABLE = "(unavailable)";

// ── sql row shapes (plain column names as the selects render them) ──────────

type SchoolClassRow = {
  id: string;
  teacher_id: string;
  course_slug: string;
  course_label: string;
  name: string;
  status: string;
  created_at: string | Date;
};

type ClassMemberRow = {
  id: string;
  class_id: string;
  student_id: string;
  enrolled_by: string;
  enrolled_at: string | Date;
};

type AnnouncementRow = {
  id: string;
  teacher_id: string;
  class_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string | Date;
};

type UserLiteRow = {
  id: string;
  display_name: string;
  email: string;
  created_at: string | Date;
};

type UserWithRolesRow = UserLiteRow & { enabled: boolean; roles: string[] | null };

const iso = (x: string | Date): string => new Date(x).toISOString();

// ── the module ───────────────────────────────────────────────────────────────

export type ClassroomDeps = { sql: SqlFn; clock: SubmitClock };

/** §17 gate (:252-258): the class must exist AND be owned by this teacher.
 *  404 "class not found" / 403 "this class belongs to another teacher". */
async function ownedClass(deps: ClassroomDeps, teacherId: string, classId: string): Promise<SchoolClassRow> {
  const rows = await deps.sql`
    select id, teacher_id, course_slug, course_label, name, status, created_at
    from classes where id = ${classId}::uuid`;
  const c = rows[0] as SchoolClassRow | undefined;
  if (!c) throw new ClassroomNotFoundError("class not found");
  if (c.teacher_id !== teacherId) {
    throw new ClassroomForbiddenError("this class belongs to another teacher");
  }
  return c;
}

async function rosterOf(deps: ClassroomDeps, classId: string): Promise<ClassMemberRow[]> {
  return (await deps.sql`
    select id, class_id, student_id, enrolled_by, enrolled_at
    from class_members where class_id = ${classId}::uuid order by enrolled_at asc`) as ClassMemberRow[];
}

async function memberCountOf(deps: ClassroomDeps, classId: string): Promise<number> {
  const rows = await deps.sql`
    select count(*)::int as member_count from class_members where class_id = ${classId}::uuid`;
  return Number((rows[0] as { member_count: number } | undefined)?.member_count ?? 0);
}

/** the detail projection (:113-135): roster enrolledAt ASC + batched user
 *  load; a vanished account still shows, named honestly. */
async function classDetail(deps: ClassroomDeps, teacherId: string, classId: string): Promise<TeacherClassDetailView> {
  const c = await ownedClass(deps, teacherId, classId);
  const roster = await rosterOf(deps, classId);
  const studentIds = roster.map((m) => m.student_id);
  const studentById = new Map<string, UserLiteRow>();
  if (studentIds.length > 0) {
    const users = (await deps.sql`
      select id, display_name, email, created_at
      from users where id = any(${studentIds}::uuid[])`) as UserLiteRow[];
    for (const u of users) studentById.set(u.id, u);
  }
  const members = roster.map((m) => {
    const u = studentById.get(m.student_id);
    // the honesty rows: hard-removed accounts show rather than vanish
    return {
      studentId: m.student_id,
      displayName: u ? u.display_name : REMOVED_ACCOUNT_NAME,
      email: u ? u.email : REMOVED_ACCOUNT_EMAIL,
      enrolledBy: m.enrolled_by,
      enrolledAt: iso(m.enrolled_at),
    };
  });
  return {
    id: c.id,
    courseSlug: c.course_slug,
    courseLabel: c.course_label,
    name: c.name,
    status: classStatusWire(c.status as ClassStatus),
    createdAt: iso(c.created_at),
    members,
  };
}

const teacherClassViewOf = (c: SchoolClassRow, memberCount: number): TeacherClassView => ({
  id: c.id,
  courseSlug: c.course_slug,
  courseLabel: c.course_label,
  name: c.name,
  status: classStatusWire(c.status as ClassStatus),
  memberCount,
  createdAt: iso(c.created_at),
});

// ── teacher class lifecycle (TeacherClassController :78-159) ────────────────

/** POST /api/v1/teacher/classes (:79-98): trim/blank 400; the
 *  case-insensitive clash against the teacher's ACTIVE classes on the same
 *  course (LIMIT 100 window) → 409; INSERT with status ACTIVE; the fresh
 *  class serves memberCount 0. */
export async function createClass(
  deps: ClassroomDeps,
  teacherId: string,
  request: ClassCreateRequest,
): Promise<TeacherClassView> {
  const name = request.name.trim();
  if (name.length === 0) {
    throw new BadRequestError("class name must not be blank");
  }
  const live = (await deps.sql`
    select id, teacher_id, course_slug, course_label, name, status, created_at
    from classes
    where teacher_id = ${teacherId}::uuid
      and course_slug = ${request.courseSlug}
      and status = 'ACTIVE'
    order by created_at desc
    limit ${TEACHER_CLASS_LIST_LIMIT}`) as SchoolClassRow[];
  const clash = live.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) {
    throw new ConflictError("you already have a live class with this name on this course");
  }
  const id = deps.clock.newId();
  const createdAt = deps.clock.now();
  const saved = (await deps.sql`
    insert into classes (id, teacher_id, course_slug, course_label, name, status, created_at)
    values (${id}::uuid, ${teacherId}::uuid, ${request.courseSlug}, ${request.courseLabel},
            ${name}, 'ACTIVE', ${createdAt.toISOString()}::timestamptz)
    returning id, teacher_id, course_slug, course_label, name, status, created_at`) as SchoolClassRow[];
  return teacherClassViewOf(saved[0] as SchoolClassRow, 0);
}

/** GET /api/v1/teacher/classes (:100-108): newest-first, LIMIT 100, member
 *  counts ONE grouped query (the countMembersByClassId port). */
export async function listTeacherClasses(deps: ClassroomDeps, teacherId: string): Promise<TeacherClassView[]> {
  const mine = (await deps.sql`
    select id, teacher_id, course_slug, course_label, name, status, created_at
    from classes
    where teacher_id = ${teacherId}::uuid
    order by created_at desc
    limit ${TEACHER_CLASS_LIST_LIMIT}`) as SchoolClassRow[];
  const counts = new Map<string, number>();
  if (mine.length > 0) {
    const grouped = (await deps.sql`
      select class_id, count(*)::int as member_count
      from class_members
      where class_id = any(${mine.map((c) => c.id)}::uuid[])
      group by class_id`) as Array<{ class_id: string; member_count: number }>;
    for (const row of grouped) counts.set(row.class_id, Number(row.member_count));
  }
  return mine.map((c) => teacherClassViewOf(c, counts.get(c.id) ?? 0));
}

/** GET /api/v1/teacher/classes/{id} (:110-135) — via the shared detail
 *  projection (ownership-gated; the honesty rows). */
export async function teacherClassDetail(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
): Promise<TeacherClassDetailView> {
  return classDetail(deps, teacherId, classId);
}

/** POST /api/v1/teacher/classes/{id}/status (:137-150): the tolerant parse
 *  else the verbatim 400; the flipped class serves its live member count. */
export async function setClassStatus(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
  request: ClassStatusRequest,
): Promise<TeacherClassView> {
  const c = await ownedClass(deps, teacherId, classId);
  const parsed = parseClassStatus(request.status);
  if (parsed === null) {
    throw new BadRequestError("status must be 'active' or 'archived'");
  }
  const updated = (await deps.sql`
    update classes set status = ${parsed} where id = ${c.id}::uuid
    returning id, teacher_id, course_slug, course_label, name, status, created_at`) as SchoolClassRow[];
  const count = await memberCountOf(deps, classId);
  return teacherClassViewOf(updated[0] as SchoolClassRow, count);
}

// ── membership (:152-190) ────────────────────────────────────────────────────

/** POST /api/v1/teacher/classes/{id}/members (:152-186): the archived gate,
 *  the email law, the enable+role law, and the idempotent no-op. */
export async function enrollStudent(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
  request: ClassEnrollRequest,
): Promise<TeacherClassDetailView> {
  const c = await ownedClass(deps, teacherId, classId);
  if (c.status !== CLASS_STATUS_ACTIVE) {
    throw new ConflictError("this class is archived — reopen it before enrolling");
  }
  const email = request.email.trim().toLowerCase();
  if (email.length === 0) {
    throw new BadRequestError("email must not be blank");
  }
  const found = (await deps.sql`
    select u.id, u.display_name, u.email, u.created_at, u.enabled,
           coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
    from users u
    left join user_roles r on r.user_id = u.id
    where lower(u.email) = lower(${email})
    group by u.id
    limit 1`) as UserWithRolesRow[];
  const student = found[0];
  if (!student) {
    throw new ClassroomNotFoundError(
      "no account with that email — the student registers first, then you enroll",
    );
  }
  if (!student.enabled) {
    throw new ConflictError("that account is disabled");
  }
  if (!(student.roles ?? []).includes("STUDENT")) {
    throw new ConflictError("only student accounts can be enrolled in a class");
  }
  const existing = await deps.sql`
    select 1 as one from class_members
    where class_id = ${classId}::uuid and student_id = ${student.id}::uuid`;
  if (existing.length === 0) {
    await deps.sql`
      insert into class_members (id, class_id, student_id, enrolled_by, enrolled_at)
      values (${deps.clock.newId()}::uuid, ${classId}::uuid, ${student.id}::uuid,
              ${teacherId}::uuid, ${deps.clock.now().toISOString()}::timestamptz)`;
  }
  // the re-enrollment no-op falls through to the same detail — the honest
  // no-op it is (the UNIQUE (class_id, student_id) pair is the storage twin)
  return classDetail(deps, teacherId, classId);
}

/** DELETE /api/v1/teacher/classes/{id}/members/{studentId} (:188-198). */
export async function removeMember(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
  studentId: string,
): Promise<TeacherClassDetailView> {
  await ownedClass(deps, teacherId, classId);
  await deps.sql`
    delete from class_members
    where class_id = ${classId}::uuid and student_id = ${studentId}::uuid`;
  return classDetail(deps, teacherId, classId);
}

// ── announcements (:200-249) ─────────────────────────────────────────────────

/** POST /api/v1/teacher/classes/{id}/announcements (:200-225): the archived
 *  gate, the category parse law, the trimmed-blank law; the fresh row
 *  serves readCount 0 over the live roster. */
export async function publishAnnouncement(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
  request: ClassPublishRequest,
): Promise<TeacherAnnouncementView> {
  const c = await ownedClass(deps, teacherId, classId);
  if (c.status !== CLASS_STATUS_ACTIVE) {
    throw new ConflictError("this class is archived — reopen it before publishing");
  }
  const category = parseAnnouncementCategory(request.category);
  if (category === null) {
    throw new BadRequestError("category must be general, homework, notice, exam-reminder or resource");
  }
  const title = request.title.trim();
  const body = request.body.trim();
  if (title.length === 0 || body.length === 0) {
    throw new BadRequestError("title and body must not be blank");
  }
  const saved = (await deps.sql`
    insert into announcements (id, teacher_id, class_id, title, body, category, created_at)
    values (${deps.clock.newId()}::uuid, ${teacherId}::uuid, ${classId}::uuid,
            ${title}, ${body}, ${category}, ${deps.clock.now().toISOString()}::timestamptz)
    returning id, teacher_id, class_id, title, body, category, created_at`) as AnnouncementRow[];
  const a = saved[0] as AnnouncementRow;
  const memberCount = await memberCountOf(deps, classId);
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    category: announcementCategoryWire(a.category as AnnouncementCategory),
    readCount: 0,
    memberCount,
    createdAt: iso(a.created_at),
  };
}

/** GET /api/v1/teacher/classes/{id}/announcements (:227-244): newest-first
 *  LIMIT 100 + batched read counts over the live roster. */
export async function teacherAnnouncements(
  deps: ClassroomDeps,
  teacherId: string,
  classId: string,
): Promise<TeacherAnnouncementView[]> {
  await ownedClass(deps, teacherId, classId);
  const rows = (await deps.sql`
    select id, teacher_id, class_id, title, body, category, created_at
    from announcements
    where class_id = ${classId}::uuid
    order by created_at desc
    limit ${ANNOUNCEMENT_LIMIT}`) as AnnouncementRow[];
  const roster = await rosterOf(deps, classId);
  const readCounts = new Map<string, number>();
  if (rows.length > 0) {
    const grouped = (await deps.sql`
      select announcement_id, count(*)::int as read_count
      from announcement_reads
      where announcement_id = any(${rows.map((a) => a.id)}::uuid[])
      group by announcement_id`) as Array<{ announcement_id: string; read_count: number }>;
    for (const row of grouped) readCounts.set(row.announcement_id, Number(row.read_count));
  }
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    category: announcementCategoryWire(a.category as AnnouncementCategory),
    readCount: readCounts.get(a.id) ?? 0,
    memberCount: roster.length,
    createdAt: iso(a.created_at),
  }));
}

// ── the learner overlay (LearnerClassroomController :85-148) ────────────────

/** the request-scoped workspace (:129-148): live memberships, their
 *  classes, the bounded feed, MY read ids and the teacher names — batched
 *  so the honest overlay costs four queries, not one per row. EMPTY is the
 *  honest state for the independent student (and for the all-archived
 *  case: archived classes drop out of the student overlay). */
type ClassroomWorkspace = {
  memberships: ClassMemberRow[];
  classById: Map<string, SchoolClassRow>;
  announcementsByClass: Map<string, AnnouncementRow[]>;
  readIds: Set<string>;
  teacherName: (teacherId: string) => string;
};

const EMPTY_WORKSPACE: ClassroomWorkspace = {
  memberships: [],
  classById: new Map(),
  announcementsByClass: new Map(),
  readIds: new Set(),
  teacherName: () => TEACHER_NAME_UNAVAILABLE,
};

async function workspace(deps: ClassroomDeps, learnerId: string): Promise<ClassroomWorkspace> {
  const memberships = (await deps.sql`
    select id, class_id, student_id, enrolled_by, enrolled_at
    from class_members where student_id = ${learnerId}::uuid
    order by enrolled_at asc`) as ClassMemberRow[];
  if (memberships.length === 0) return EMPTY_WORKSPACE;

  const classIds = [...new Set(memberships.map((m) => m.class_id))];
  const classRows = (await deps.sql`
    select id, teacher_id, course_slug, course_label, name, status, created_at
    from classes where id = any(${classIds}::uuid[])`) as SchoolClassRow[];
  const classById = new Map(classRows.map((c) => [c.id, c]));
  // archived classes drop out of the student overlay: the class ended, and
  // pretending it is still live would be the dishonest direction (:139-144)
  const live = memberships.filter((m) => {
    const c = classById.get(m.class_id);
    return c !== undefined && c.status === CLASS_STATUS_ACTIVE;
  });
  if (live.length === 0) return EMPTY_WORKSPACE;

  const liveIds = live.map((m) => m.class_id);
  const feed = (await deps.sql`
    select id, teacher_id, class_id, title, body, category, created_at
    from announcements
    where class_id = any(${liveIds}::uuid[])
    order by created_at desc
    limit ${ANNOUNCEMENT_LIMIT}`) as AnnouncementRow[];
  const readIds = new Set<string>();
  if (feed.length > 0) {
    const readRows = (await deps.sql`
      select announcement_id from announcement_reads
      where student_id = ${learnerId}::uuid
        and announcement_id = any(${feed.map((a) => a.id)}::uuid[])`) as Array<{
      announcement_id: string;
    }>;
    for (const r of readRows) readIds.add(r.announcement_id);
  }
  const announcementsByClass = new Map<string, AnnouncementRow[]>();
  for (const a of feed) {
    const bucket = announcementsByClass.get(a.class_id);
    if (bucket) bucket.push(a);
    else announcementsByClass.set(a.class_id, [a]);
  }
  const teacherIds = [...new Set(classRows.map((c) => c.teacher_id))];
  const teacherNames = new Map<string, string>();
  const teachers = (await deps.sql`
    select id, display_name, email, created_at
    from users where id = any(${teacherIds}::uuid[])`) as UserLiteRow[];
  for (const t of teachers) teacherNames.set(t.id, t.display_name);
  const teacherName = (id: string) => teacherNames.get(id) ?? TEACHER_NAME_UNAVAILABLE;
  return { memberships: live, classById, announcementsByClass, readIds, teacherName };
}

/** GET /api/v1/learners/me/classroom (:85-104): per live membership the
 *  class row with MY unread count; the flattened totalUnread badge. */
export async function learnerOverview(deps: ClassroomDeps, learnerId: string): Promise<LearnerClassroomView> {
  const ws = await workspace(deps, learnerId);
  const rows = ws.memberships.map((m) => {
    const c = ws.classById.get(m.class_id) as SchoolClassRow;
    const feed = ws.announcementsByClass.get(c.id) ?? [];
    const unread = feed.filter((a) => !ws.readIds.has(a.id)).length;
    return {
      id: c.id,
      courseSlug: c.course_slug,
      courseLabel: c.course_label,
      name: c.name,
      teacherName: ws.teacherName(c.teacher_id),
      unreadAnnouncements: unread,
      enrolledAt: iso(m.enrolled_at),
    };
  });
  const totalUnread = rows.reduce((sum, r) => sum + r.unreadAnnouncements, 0);
  return { classes: rows, unreadAnnouncements: totalUnread };
}

/** GET /api/v1/learners/me/classroom/announcements (:106-121): the feed
 *  across ALL my live classes, newest first, MY read flag beside each. */
export async function learnerAnnouncements(
  deps: ClassroomDeps,
  learnerId: string,
): Promise<LearnerAnnouncementView[]> {
  const ws = await workspace(deps, learnerId);
  const out: LearnerAnnouncementView[] = [];
  for (const m of ws.memberships) {
    const c = ws.classById.get(m.class_id) as SchoolClassRow;
    const feed = ws.announcementsByClass.get(c.id) ?? [];
    for (const a of feed) {
      out.push({
        id: a.id,
        classId: a.class_id,
        className: c.name,
        courseSlug: c.course_slug,
        teacherName: ws.teacherName(c.teacher_id),
        title: a.title,
        body: a.body,
        category: announcementCategoryWire(a.category as AnnouncementCategory),
        read: ws.readIds.has(a.id),
        createdAt: iso(a.created_at),
      });
    }
  }
  return out;
}

/** POST /api/v1/learners/me/classroom/announcements/{id}/read (:123-141):
 *  404 "announcement not found"; the §17 membership gate 403 "this
 *  announcement is not in your classroom"; the idempotent no-op; the
 *  append-only receipt, the announcement row NEVER mutates. */
export async function markAnnouncementRead(
  deps: ClassroomDeps,
  learnerId: string,
  announcementId: string,
): Promise<AnnouncementReadResult> {
  const rows = await deps.sql`
    select id, teacher_id, class_id, title, body, category, created_at
    from announcements where id = ${announcementId}::uuid`;
  const a = rows[0] as AnnouncementRow | undefined;
  if (!a) throw new ClassroomNotFoundError("announcement not found");
  const member = await deps.sql`
    select 1 as one from class_members
    where class_id = ${a.class_id}::uuid and student_id = ${learnerId}::uuid`;
  if (member.length === 0) {
    throw new ClassroomForbiddenError("this announcement is not in your classroom");
  }
  const existing = await deps.sql`
    select 1 as one from announcement_reads
    where announcement_id = ${announcementId}::uuid and student_id = ${learnerId}::uuid`;
  if (existing.length === 0) {
    await deps.sql`
      insert into announcement_reads (announcement_id, student_id, read_at)
      values (${announcementId}::uuid, ${learnerId}::uuid,
              ${deps.clock.now().toISOString()}::timestamptz)`;
  }
  return { id: announcementId, read: true };
}

// ── the V49 roster (TeacherRosterController :36-41) ─────────────────────────

/** GET /api/v1/teacher/learners — the enabled STUDENT cohort ordered
 *  displayName asc, email asc (UserRepository :25-28); identity projection
 *  ONLY (no learning data — the marking queue and /state carry that). */
export async function rosterLearners(deps: ClassroomDeps): Promise<LearnerRosterView[]> {
  const rows = (await deps.sql`
    select u.id, u.display_name, u.email, u.created_at
    from users u
    join user_roles r on r.user_id = u.id
    where r.role = 'STUDENT' and u.enabled = true
    group by u.id, u.display_name, u.email, u.created_at
    order by u.display_name asc, u.email asc`) as UserLiteRow[];
  return rows.map((u) => ({
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    createdAt: iso(u.created_at),
  }));
}

// ── composition root ─────────────────────────────────────────────────────────

export type ClassroomModule = {
  createClass: (teacherId: string, request: ClassCreateRequest) => Promise<TeacherClassView>;
  listTeacherClasses: (teacherId: string) => Promise<TeacherClassView[]>;
  teacherClassDetail: (teacherId: string, classId: string) => Promise<TeacherClassDetailView>;
  setClassStatus: (
    teacherId: string,
    classId: string,
    request: ClassStatusRequest,
  ) => Promise<TeacherClassView>;
  enrollStudent: (
    teacherId: string,
    classId: string,
    request: ClassEnrollRequest,
  ) => Promise<TeacherClassDetailView>;
  removeMember: (
    teacherId: string,
    classId: string,
    studentId: string,
  ) => Promise<TeacherClassDetailView>;
  publishAnnouncement: (
    teacherId: string,
    classId: string,
    request: ClassPublishRequest,
  ) => Promise<TeacherAnnouncementView>;
  teacherAnnouncements: (teacherId: string, classId: string) => Promise<TeacherAnnouncementView[]>;
  learnerOverview: (learnerId: string) => Promise<LearnerClassroomView>;
  learnerAnnouncements: (learnerId: string) => Promise<LearnerAnnouncementView[]>;
  markAnnouncementRead: (learnerId: string, announcementId: string) => Promise<AnnouncementReadResult>;
  rosterLearners: () => Promise<LearnerRosterView[]>;
};

/** The production composition root binds the module's deps once; tests pin
 *  the laws against fakeSql through the same factory (the buildLearnerMeModule
 *  precedent). The tranche-2 routes construct this with the driver's SqlFn —
 *  this module stays decoupled from the T-MIG-014 driver-dispatch internals
 *  (the per-module structural-seam doctrine). */
export function buildClassroomModule(sql: SqlFn, clock: SubmitClock): ClassroomModule {
  const deps: ClassroomDeps = { sql, clock };
  return {
    createClass: (teacherId, request) => createClass(deps, teacherId, request),
    listTeacherClasses: (teacherId) => listTeacherClasses(deps, teacherId),
    teacherClassDetail: (teacherId, classId) => classDetail(deps, teacherId, classId),
    setClassStatus: (teacherId, classId, request) => setClassStatus(deps, teacherId, classId, request),
    enrollStudent: (teacherId, classId, request) => enrollStudent(deps, teacherId, classId, request),
    removeMember: (teacherId, classId, studentId) => removeMember(deps, teacherId, classId, studentId),
    publishAnnouncement: (teacherId, classId, request) =>
      publishAnnouncement(deps, teacherId, classId, request),
    teacherAnnouncements: (teacherId, classId) => teacherAnnouncements(deps, teacherId, classId),
    learnerOverview: (learnerId) => learnerOverview(deps, learnerId),
    learnerAnnouncements: (learnerId) => learnerAnnouncements(deps, learnerId),
    markAnnouncementRead: (learnerId, announcementId) =>
      markAnnouncementRead(deps, learnerId, announcementId),
    rosterLearners: () => rosterLearners(deps),
  };
}
