/**
 * Teacher assignments services — the B2 decommission band (T-MIG-117;
 * frozen law @ 6cad6ef, syllabai-core, ported line-against-line):
 *
 *   - TeacherAssignmentController.java :102-217
 *       create (:102-128)            → createAssignment
 *       list (:134-145)              → listAssignments
 *       roster (:151-183)            → assignmentRoster
 *       setStatus (:205-217)         → setAssignmentStatus
 *   - TeacherAssignmentController.CreateRequest/StatusRequest (:272-288)
 *       → the wire constraints live in @syllabai/contracts assignments
 *         (constraint-copy law); the SERVICE laws port here:
 *         the LinkedHashSet ref dedup (:106), the fail-closed structural
 *         target gate (:222-233 — unknown code / subject root / semantic
 *         layer all 404, nothing written), the V51 class gate (:187-202 —
 *         exists / THIS teacher's / live / same course), the dueAt
 *         Instant.parse law (:235-241), the tolerant status parse
 *         (Assignment.Status.parse :51-58) with the verbatim 400, the
 *         newest-first LIMIT 50 list bound (:79), the latest-by-learner
 *         map (newest-first first-wins, page(0,2000) :244-251), the
 *         computed stats (submitted/late/missing/meanScore :253-268) and
 *         the roster ordering law (submitted first newest-first, then
 *         missing by name case-insensitive :176-180).
 *
 * FROZEN MESSAGES (all captured of record, golden-captures/t-mig-117/):
 *   404 "unknown assignment target: {code}"                 (c03)
 *   404 "not an assignment target (needs a curriculum-structure node
 *        below the subject root): {code}"                   (c04/c05)
 *   404 "unknown class target: {classId}"                   (d05)
 *   403 "this class belongs to another teacher"             (d06)
 *   409 "this class is archived"                            (d07)
 *   400 "the class targets course {slug} but the assignment content
 *        is {slug}"                                         (d08)
 *   400 "dueAt must be an ISO-8601 instant: {raw}"          (b17/c07)
 *   404 "unknown assignment: {id}"                          (d09/e07)
 *   400 'status must be "open" or "closed": {raw}'          (f02)
 *   400 "malformed request" (the @PathVariable UUID mismatch — the
 *        route layer's parseUuid; e08)
 *
 * HONESTY RULES (the entity header carried verbatim): course refs are
 * opaque hub-owned strings; targets are RESOLVED at the boundary and
 * stored as codes; creating/closing writes NO learner-model state; the
 * submission trail is append-only evidence whose latest row per learner
 * is the current state; the roster cohort is the enabled STUDENT set (or
 * exactly the class's enabled members — a vanished account is dropped
 * here, unlike the classroom detail's honesty rows: the Java filter
 * `u != null && u.enabled()` :161).
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists and state-bearing predicates inline as static
 * template text. Instant rendering: `new Date(x).toISOString()`.
 */
import { BadRequestError, ConflictError, type SubmitClock } from "../selfmark";
import { ClassroomForbiddenError } from "../classroom";
import type { AssignmentCreateRequest } from "@syllabai/contracts";
import type { SqlFn } from "../assessment/sql";

/** the verbatim-message 404 (the classroom module's own class — the
 *  identity NotFoundError renders "%s %s not found", NOT this family's
 *  captured messages). */
export class AssignmentNotFoundError extends Error {}

export { BadRequestError, ConflictError, ClassroomForbiddenError };

// ── row shapes (plain column names as the selects render them) ──────────────

type AssignmentRow = {
  id: string;
  teacher_id: string;
  course_slug: string;
  course_label: string;
  title: string;
  spec_refs: string[];
  marks_total: number;
  question_count: number;
  due_at: string | Date;
  status: string;
  created_at: string | Date;
  class_id: string | null;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  learner_id: string;
  questions_completed: number;
  score: number | null;
  occurred_at: string | Date;
};

type CohortUserRow = { id: string; display_name: string };

type KnowledgeNodeRow = { id: string; node_type: string };

type ClassRow = {
  id: string;
  teacher_id: string;
  course_slug: string;
  status: string;
};

const iso = (x: string | Date): string => new Date(x).toISOString();

/** Java-Instant render parity for INPUT-ECHOED instants (dueAt): the core
 *  serializes the stored timestamptz through Instant (trailing zeros
 *  stripped — "2099-06-01T12:00:00Z", the captured d01 law), NOT the fleet's
 *  .000-milli form. createdAt/submittedAt keep iso() (tolerated by name);
 *  dueAt is an input echo and deserves the byte parity. */
const javaInstant = (x: string | Date): string => {
  const s = new Date(x).toISOString();
  return s.endsWith(".000Z") ? s.slice(0, -5) + "Z" : s;
};

// ── the module ───────────────────────────────────────────────────────────────

export type TeacherAssignmentsDeps = { sql: SqlFn; clock: SubmitClock };

export const ASSIGNMENT_LIST_LIMIT = 50; // :79 — "assignments are teacher-authored and few"
export const LATEST_TRAIL_LIMIT = 2000; // :247 — the append-only trail read bound

const STRUCTURE_NODE_TYPES = ["UNIT", "TOPIC", "SUBTOPIC"]; // :225-227

/** drizzle/postgres.js render jsonb as the RAW JSON string — the frozen row
 *  shape is the parsed array (Assignment.specRefs List<String>). */
function specRefsOf(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") return JSON.parse(v) as string[];
  return [];
}

/** the canonical wire view (AssignmentView.from — AssignmentViews :31-35). */
function assignmentViewOf(a: AssignmentRow): Record<string, unknown> {
  return {
    id: a.id,
    title: a.title,
    courseSlug: a.course_slug,
    courseLabel: a.course_label,
    specRefs: specRefsOf(a.spec_refs),
    marksTotal: a.marks_total,
    questionCount: a.question_count,
    dueAt: javaInstant(a.due_at),
    status: a.status === "OPEN" ? "open" : "closed", // Status.wire() :61-63
    classId: a.class_id,
    createdAt: iso(a.created_at),
  };
}

/** the tolerant status parse (Assignment.Status.parse :51-58). */
export function parseAssignmentStatus(raw: string): "OPEN" | "CLOSED" | null {
  const t = raw.trim().toLowerCase();
  if (t === "open") return "OPEN";
  if (t === "closed") return "CLOSED";
  return null;
}

/** Java Instant.parse parity: strict ISO-8601 instant (date-only and
 *  missing-zone strings REFUSE — the captured b17/c07 laws). */
export function parseInstantStrict(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** the fail-closed structural target gate (:222-233). */
async function resolveTarget(deps: TeacherAssignmentsDeps, code: string): Promise<void> {
  const rows = (await deps.sql`
    select id, node_type from knowledge_nodes where code = ${code}`) as KnowledgeNodeRow[];
  const node = rows[0];
  if (!node) throw new AssignmentNotFoundError(`unknown assignment target: ${code}`);
  if (!STRUCTURE_NODE_TYPES.includes(node.node_type)) {
    throw new AssignmentNotFoundError(
      "not an assignment target (needs a curriculum-structure node below the subject root): " +
        code,
    );
  }
}

/** the V51 fail-closed class-target gate (:187-202). */
async function resolveClassTarget(
  deps: TeacherAssignmentsDeps,
  teacherId: string,
  classId: string,
  courseSlug: string,
): Promise<string> {
  const rows = (await deps.sql`
    select id, teacher_id, course_slug, status
    from classes where id = ${classId}::uuid`) as ClassRow[];
  const c = rows[0];
  if (!c) throw new AssignmentNotFoundError(`unknown class target: ${classId}`);
  if (c.teacher_id !== teacherId) {
    throw new ClassroomForbiddenError("this class belongs to another teacher");
  }
  if (c.status !== "ACTIVE") {
    throw new ConflictError("this class is archived");
  }
  if (c.course_slug !== courseSlug) {
    throw new BadRequestError(
      `the class targets course ${c.course_slug} but the assignment content is ${courseSlug}`,
    );
  }
  return c.id;
}

/** latest hand-in per learner (:244-251) — newest-first, first row wins. */
async function latestByLearner(
  deps: TeacherAssignmentsDeps,
  assignmentId: string,
): Promise<Map<string, SubmissionRow>> {
  const rows = (await deps.sql`
    select id, assignment_id, learner_id, questions_completed, score, occurred_at
    from assignment_submissions
    where assignment_id = ${assignmentId}::uuid
    order by occurred_at desc
    limit ${LATEST_TRAIL_LIMIT}`) as SubmissionRow[];
  const latest = new Map<string, SubmissionRow>();
  for (const s of rows) if (!latest.has(s.learner_id)) latest.set(s.learner_id, s);
  return latest;
}

/** POST /api/v1/teacher/assignments (:102-128) → 201 view. */
export async function createAssignment(
  deps: TeacherAssignmentsDeps,
  teacherId: string,
  input: AssignmentCreateRequest,
): Promise<Record<string, unknown>> {
  // the LinkedHashSet dedup (:106) — insertion order preserved
  const refs = [...new Set(input.specRefs)];
  for (const code of refs) {
    await resolveTarget(deps, code);
  }
  const classId =
    input.classId == null
      ? null
      : await resolveClassTarget(deps, teacherId, input.classId, input.courseSlug);
  const due = parseInstantStrict(input.dueAt);
  if (due == null) {
    throw new BadRequestError(`dueAt must be an ISO-8601 instant: ${input.dueAt}`);
  }
  const id = deps.clock.newId();
  const createdAt = deps.clock.now();
  await deps.sql`
    insert into assignments (id, teacher_id, course_slug, course_label, title, spec_refs,
                             marks_total, question_count, due_at, status, created_at, class_id)
    values (${id}::uuid, ${teacherId}::uuid, ${input.courseSlug}, ${input.courseLabel},
            ${input.title.trim()}, ${JSON.stringify(refs)}::jsonb, ${input.marksTotal},
            ${input.questionCount}, ${due.toISOString()}, 'OPEN', ${createdAt.toISOString()},
            ${classId}::uuid)`;
  return {
    id,
    title: input.title.trim(),
    courseSlug: input.courseSlug,
    courseLabel: input.courseLabel,
    specRefs: refs,
    marksTotal: input.marksTotal,
    questionCount: input.questionCount,
    dueAt: javaInstant(due),
    status: "open",
    classId,
    createdAt: createdAt.toISOString(),
  };
}

/** GET /api/v1/teacher/assignments (:134-145) → 200 newest-first summaries. */
export async function listAssignments(
  deps: TeacherAssignmentsDeps,
): Promise<Array<Record<string, unknown>>> {
  const cohortRows = (await deps.sql`
    select count(distinct u.id)::int as cohort
    from users u
    join user_roles r on r.user_id = u.id
    where r.role = 'STUDENT' and u.enabled = true`) as Array<{ cohort: number }>;
  const cohort = Number(cohortRows[0]?.cohort ?? 0);
  const rows = (await deps.sql`
    select id, teacher_id, course_slug, course_label, title, spec_refs, marks_total,
           question_count, due_at, status, created_at, class_id
    from assignments
    order by created_at desc
    limit ${ASSIGNMENT_LIST_LIMIT}`) as AssignmentRow[];
  const memberCounts = new Map<string, number>();
  const classIds = rows.map((a) => a.class_id).filter((x): x is string => x != null);
  if (classIds.length > 0) {
    const grouped = (await deps.sql`
      select class_id, count(*)::int as member_count
      from class_members
      where class_id = any(${classIds}::uuid[])
      group by class_id`) as Array<{ class_id: string; member_count: number }>;
    for (const g of grouped) memberCounts.set(g.class_id, Number(g.member_count));
  }
  const out: Array<Record<string, unknown>> = [];
  for (const a of rows) {
    const latest = await latestByLearner(deps, a.id);
    const target = a.class_id == null ? cohort : (memberCounts.get(a.class_id) ?? 0);
    out.push(toSummary(a, latest, target));
  }
  return out;
}

/** the summary projection (:253-268) — real completion stats, computed. */
function toSummary(
  a: AssignmentRow,
  latest: Map<string, SubmissionRow>,
  target: number,
): Record<string, unknown> {
  const submitted = latest.size;
  const dueMs = new Date(a.due_at).getTime();
  let late = 0;
  const scores: number[] = [];
  for (const s of latest.values()) {
    if (new Date(s.occurred_at).getTime() > dueMs) late++;
    if (s.score != null) scores.push(s.score);
  }
  const meanScore =
    scores.length === 0
      ? null
      : scores.reduce((acc, x) => acc + x, 0) / scores.length;
  return {
    assignment: assignmentViewOf(a),
    submitted,
    late,
    missing: Math.max(0, target - submitted),
    meanScore,
  };
}

/** POST /api/v1/teacher/assignments/{id}/status (:205-217) → 200 view. */
export async function setAssignmentStatus(
  deps: TeacherAssignmentsDeps,
  assignmentId: string,
  rawStatus: string,
): Promise<Record<string, unknown>> {
  const status = parseAssignmentStatus(rawStatus);
  if (status == null) {
    throw new BadRequestError(`status must be "open" or "closed": ${rawStatus}`);
  }
  const rows = (await deps.sql`
    select id, teacher_id, course_slug, course_label, title, spec_refs, marks_total,
           question_count, due_at, status, created_at, class_id
    from assignments where id = ${assignmentId}::uuid`) as AssignmentRow[];
  const a = rows[0];
  if (!a) throw new AssignmentNotFoundError(`unknown assignment: ${assignmentId}`);
  await deps.sql`
    update assignments set status = ${status} where id = ${assignmentId}::uuid`;
  return assignmentViewOf({ ...a, status });
}

/** GET /api/v1/teacher/assignments/{id} (:151-183) → 200 roster view. */
export async function assignmentRoster(
  deps: TeacherAssignmentsDeps,
  assignmentId: string,
): Promise<Record<string, unknown>> {
  const rows = (await deps.sql`
    select id, teacher_id, course_slug, course_label, title, spec_refs, marks_total,
           question_count, due_at, status, created_at, class_id
    from assignments where id = ${assignmentId}::uuid`) as AssignmentRow[];
  const a = rows[0];
  if (!a) throw new AssignmentNotFoundError(`unknown assignment: ${assignmentId}`);
  const latest = await latestByLearner(deps, a.id);
  // the cohort law (:156-162): NULL target → every enabled student; class
  // target → exactly that class's members, vanished/disabled DROPPED (the
  // `u != null && u.enabled()` filter — NOT the classroom honesty rows).
  let cohortUsers: CohortUserRow[];
  if (a.class_id == null) {
    cohortUsers = (await deps.sql`
      select distinct u.id, u.display_name
      from users u
      join user_roles r on r.user_id = u.id
      where r.role = 'STUDENT' and u.enabled = true
      order by u.display_name asc`) as CohortUserRow[];
  } else {
    cohortUsers = (await deps.sql`
      select u.id, u.display_name
      from class_members m
      join users u on u.id = m.student_id
      join user_roles r on r.user_id = u.id
      where m.class_id = ${a.class_id}::uuid and r.role = 'STUDENT' and u.enabled = true
      group by u.id, u.display_name
      order by u.display_name asc`) as CohortUserRow[];
  }
  const dueMs = new Date(a.due_at).getTime();
  const rosterRows = cohortUsers.map((u) => {
    const s = latest.get(u.id);
    if (s == null) {
      return {
        learnerId: u.id,
        displayName: u.display_name,
        state: "missing",
        submittedAt: null,
        score: null,
        questionsCompleted: null,
      };
    }
    const isLate = new Date(s.occurred_at).getTime() > dueMs;
    return {
      learnerId: u.id,
      displayName: u.display_name,
      state: isLate ? "late" : "complete",
      submittedAt: iso(s.occurred_at),
      score: s.score,
      questionsCompleted: s.questions_completed,
    };
  });
  // the ordering law (:176-180): submitted first (newest hand-in first),
  // then missing by name case-insensitively (Boolean natural order).
  rosterRows.sort((x, y) => {
    const xm = x.state === "missing" ? 1 : 0;
    const ym = y.state === "missing" ? 1 : 0;
    if (xm !== ym) return xm - ym;
    const xt = x.submittedAt == null ? 0 : new Date(x.submittedAt).getTime();
    const yt = y.submittedAt == null ? 0 : new Date(y.submittedAt).getTime();
    if (xt !== yt) return yt - xt; // reverse order on the instant
    return x.displayName.localeCompare(y.displayName, undefined, { sensitivity: "accent" });
  });
  return { assignment: assignmentViewOf(a), rows: rosterRows };
}

/** the module builder (the fleet seam shape). */
export function buildTeacherAssignmentsModule(sql: SqlFn, clock: SubmitClock) {
  const deps: TeacherAssignmentsDeps = { sql, clock };
  return {
    deps,
    createAssignment: (teacherId: string, input: AssignmentCreateRequest) =>
      createAssignment(deps, teacherId, input),
    listAssignments: () => listAssignments(deps),
    setAssignmentStatus: (assignmentId: string, rawStatus: string) =>
      setAssignmentStatus(deps, assignmentId, rawStatus),
    assignmentRoster: (assignmentId: string) => assignmentRoster(deps, assignmentId),
  };
}

export type TeacherAssignmentsModule = ReturnType<typeof buildTeacherAssignmentsModule>;
