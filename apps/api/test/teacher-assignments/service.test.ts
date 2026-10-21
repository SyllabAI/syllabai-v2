/**
 * Teacher assignments service unit tests (T-MIG-117, the B2 port) —
 * stubbed sql via the shared fakeSql helper. Pins the frozen law
 * @ 6cad6ef (TeacherAssignmentController + Assignment + the repositories),
 * EVERY message captured of record in golden-captures/t-mig-117/:
 *   - the LinkedHashSet ref dedup (insertion order preserved)
 *   - the fail-closed structural target gate (unknown code 404, the
 *     subject root and the semantic layer 404, nothing written)
 *   - the V51 class gate (unknown 404 / other teacher 403 / archived 409 /
 *     course mismatch 400 — all verbatim)
 *   - the dueAt Instant.parse law (strict ISO instant; date-only refuses)
 *   - the tolerant status parse (trim+lowercase open/closed, verbatim 400)
 *   - the newest-first LIMIT 50 list bound + the cohort denominator law
 *     (whole-cohort vs the V51 class member count)
 *   - the latest-by-learner map (newest-first first-wins over the
 *     append-only trail, page(0,2000))
 *   - the computed stats (submitted/late/missing/meanScore — computed,
 *     never stored)
 *   - the roster ordering law (submitted first newest-first, then missing
 *     by name case-insensitively) + the cohort drop law (vanished/disabled
 *     members FILTERED — the Java u != null && u.enabled() filter, NOT the
 *     classroom honesty rows)
 *
 * T-TEACH-006 amendment tests (the operator ruling on T-TEACH-005 F-1):
 * the list binds the JWT identity (own newest 50), and roster/setStatus run
 * the §17 ownership gate — 404 unknown verbatim BEFORE 403 "this assignment
 * belongs to another teacher", the 400 status parse still beats the gate,
 * and a foreign status flip NEVER issues the UPDATE.
 */
import { describe, expect, test } from "bun:test";
import {
  ASSIGNMENT_LIST_LIMIT,
  AssignmentNotFoundError,
  LATEST_TRAIL_LIMIT,
  buildTeacherAssignmentsModule,
  parseAssignmentStatus,
  parseInstantStrict,
} from "../../src/services/teacher-assignments";
import { BadRequestError, ConflictError } from "../../src/services/selfmark";
import { ClassroomForbiddenError } from "../../src/services/classroom";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const STUDENT_1 = "bb000000-0000-4000-8000-000000000001";
const STUDENT_2 = "bb000000-0000-4000-8000-000000000002";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const CLASS_ARCHIVED = "cc000000-0000-4000-8000-000000000002";
const ASG_A = "dd000000-0000-4000-8000-000000000001";
const ASG_B = "dd000000-0000-4000-8000-000000000002";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";
const TOPIC = "WCH11-T1";
const SUBTOPIC = "WCH11-T1.1";

const T1 = "2026-10-01T10:00:00Z";
const DUE_FUTURE = "2099-06-01T12:00:00.000Z";
const DUE_PAST = "2026-10-01T00:00:00.000Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW = new Date(NOW_TEXT);
const clock = { newId: () => NEW_ID, now: () => NOW };

const assignmentRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ASG_A,
  teacher_id: TEACHER,
  course_slug: "igcse-chemistry-19",
  course_label: "IGCSE Chemistry",
  title: "B2 capture A",
  spec_refs: [TOPIC],
  marks_total: 10,
  question_count: 5,
  due_at: DUE_FUTURE,
  status: "OPEN",
  created_at: T1,
  class_id: null,
  ...over,
});

const submissionRow = (
  learnerId: string,
  occurredAt: string,
  over: Partial<Record<string, unknown>> = {},
) => ({
  id: `ee000000-0000-4000-8000-0000000000${learnerId.slice(-2)}`,
  assignment_id: ASG_A,
  learner_id: learnerId,
  questions_completed: 6,
  score: 8,
  occurred_at: occurredAt,
  ...over,
});

// ── shared route shapes (fakeSql renders template strings joined " ? ") ─────

const knowledgeNodeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, node_type from knowledge_nodes where code = \?$/,
  rows,
});

const classTargetRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, teacher_id, course_slug, status from classes where id = \? ::uuid$/,
  rows,
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

/** param-aware trail: the list walk queries ONE trail per assignment — the
 *  fake must resolve by the BOUND assignment id (rowsFor, the 052 law). */
const submissionsByAssignment = (
  byId: Record<string, Array<Record<string, unknown>>>,
): Route => ({
  match:
    /from assignment_submissions where assignment_id = \? ::uuid order by occurred_at desc limit \?$/,
  rows: [],
  rowsFor: (params) => byId[params[0] as string] ?? [],
});

const groupedMemberCountRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select class_id, count\(\*\)::int as member_count from class_members where class_id = any\( \? ::uuid\[\]\) group by class_id$/,
  rows,
});

const assignmentByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /from assignments where id = \? ::uuid$/,
  rows,
});

const cohortUsersRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select distinct u\.id, u\.display_name from users u join user_roles r on r\.user_id = u\.id where r\.role = 'STUDENT' and u\.enabled = true order by u\.display_name asc$/,
  rows,
});

const classCohortUsersRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select u\.id, u\.display_name from class_members m join users u on u\.id = m\.student_id join user_roles r on r\.user_id = u\.id where m\.class_id = \? ::uuid and r\.role = 'STUDENT' and u\.enabled = true group by u\.id, u\.display_name order by u\.display_name asc$/,
  rows,
});

const insertAssignmentLog: string[] = [];
const insertAssignmentRoute = (): Route => ({
  match: /insert into assignments \(id, teacher_id, course_slug, course_label, title, spec_refs,/,
  rows: [],
  rowsFor: (params) => {
    insertAssignmentLog.push(JSON.stringify(params));
    return [];
  },
});

const statusUpdateRoute = (log: string[]): Route => ({
  match: /update assignments set status = \? where id = \? ::uuid$/,
  rows: [],
  rowsFor: (params) => {
    log.push(params[0] as string);
    return [];
  },
});

const validBody = {
  title: "B2 capture assignment",
  courseSlug: "igcse-chemistry-19",
  courseLabel: "IGCSE Chemistry",
  specRefs: [TOPIC],
  marksTotal: 10,
  questionCount: 5,
  dueAt: "2099-06-01T12:00:00Z",
};

// ── parse laws ───────────────────────────────────────────────────────────────

describe("parseAssignmentStatus (Assignment.Status.parse :51-58)", () => {
  test("tolerant trim+lowercase open/closed", () => {
    expect(parseAssignmentStatus("open")).toBe("OPEN");
    expect(parseAssignmentStatus("  CLOSED  ")).toBe("CLOSED");
    expect(parseAssignmentStatus("Closed")).toBe("CLOSED");
  });
  test("unknown value → null (the controller's verbatim 400 is the caller's law)", () => {
    expect(parseAssignmentStatus("half-open")).toBeNull();
    expect(parseAssignmentStatus("")).toBeNull();
  });
});

describe("parseInstantStrict (the :235-241 Instant.parse law)", () => {
  test("ISO instants with zone accept", () => {
    expect(parseInstantStrict("2099-06-01T12:00:00Z")).not.toBeNull();
    expect(parseInstantStrict("2099-06-01T12:00:00.250Z")).not.toBeNull();
    expect(parseInstantStrict("2099-06-01T12:00:00+02:00")).not.toBeNull();
  });
  test("date-only and missing-zone refuse (captured b17/c07)", () => {
    expect(parseInstantStrict("not-a-date")).toBeNull();
    expect(parseInstantStrict("2030-06-01 (no time)")).toBeNull();
    expect(parseInstantStrict("2030-06-01")).toBeNull();
    expect(parseInstantStrict("2030-06-01T12:00:00")).toBeNull();
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe("createAssignment (:102-128)", () => {
  test("201 positive: dedup + INSERT binds + the OPEN view echo", async () => {
    insertAssignmentLog.length = 0;
    const routes: Route[] = [
      knowledgeNodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      insertAssignmentRoute(),
    ];
    const sql = fakeSql(routes);
    const mod = buildTeacherAssignmentsModule(sql, clock);
    const view = (await mod.createAssignment(TEACHER, {
      ...validBody,
      specRefs: [SUBTOPIC, SUBTOPIC],
    })) as Record<string, unknown>;
    expect(view).toMatchObject({
      id: NEW_ID,
      title: "B2 capture assignment",
      specRefs: [SUBTOPIC], // the dedup law (d02: LinkedHashSet)
      status: "open",
      classId: null,
      createdAt: "2026-10-06T08:00:00.000Z",
      dueAt: "2099-06-01T12:00:00Z", // the javaInstant render law (d01 byte parity)
    });
    expect(insertAssignmentLog.length).toBe(1);
    const binds = JSON.parse(insertAssignmentLog[0]!);
    expect(binds[0]).toBe(NEW_ID); // the clock id
    expect(binds[4]).toBe("B2 capture assignment"); // trimmed title
    expect(JSON.parse(binds[5])).toEqual([SUBTOPIC]); // spec_refs jsonb
    expect(binds[8]).toBe("2099-06-01T12:00:00.000Z"); // the instant law
    expect(binds[9]).toBe("2026-10-06T08:00:00.000Z"); // the clock instant
    // 'OPEN' is inline static text in the SQL (the state-bearing predicate
    // law — column lists and states inline, never a bind slot)
    expect(sql.queries.some((q) => q.includes("'OPEN'"))).toBe(true);
  });

  test("unknown ref → 404 'unknown assignment target: {code}' BEFORE any INSERT", async () => {
    const routes: Route[] = [knowledgeNodeRoute([]), insertAssignmentRoute()];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    await expect(
      mod.createAssignment(TEACHER, { ...validBody, specRefs: ["NO-SUCH-CODE"] }),
    ).rejects.toThrow("unknown assignment target: NO-SUCH-CODE");
  });

  test("the subject root and the semantic layer refuse (404 not-an-assignment-target)", async () => {
    for (const nodeType of ["SUBJECT", "MISCONCEPTION", "CONCEPT"]) {
      const routes: Route[] = [
        knowledgeNodeRoute([{ id: "n1", node_type: nodeType }]),
        insertAssignmentRoute(),
      ];
      const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
      await expect(
        mod.createAssignment(TEACHER, validBody),
      ).rejects.toThrow(
        "not an assignment target (needs a curriculum-structure node below the subject root): " +
          TOPIC,
      );
    }
  });

  test("UNIT/TOPIC/SUBTOPIC all resolve (the structure set)", async () => {
    for (const nodeType of ["UNIT", "TOPIC", "SUBTOPIC"]) {
      const routes: Route[] = [
        knowledgeNodeRoute([{ id: "n1", node_type: nodeType }]),
        insertAssignmentRoute(),
      ];
      const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
      await expect(mod.createAssignment(TEACHER, validBody)).resolves.toMatchObject({
        specRefs: [TOPIC],
      });
    }
  });

  test("class gate chain: unknown 404 / other teacher 403 / archived 409 / course mismatch 400", async () => {
    const node = knowledgeNodeRoute([{ id: "n1", node_type: "TOPIC" }]);
    const unknown = buildTeacherAssignmentsModule(
      fakeSql([node, classTargetRoute([])]),
      clock,
    );
    await expect(
      unknown.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(`unknown class target: ${CLASS_A}`);

    const other = buildTeacherAssignmentsModule(
      fakeSql([
        node,
        classTargetRoute([
          { id: CLASS_A, teacher_id: OTHER_TEACHER, course_slug: "igcse-chemistry-19", status: "ACTIVE" },
        ]),
      ]),
      clock,
    );
    await expect(
      other.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toBeInstanceOf(ClassroomForbiddenError);
    await expect(
      other.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow("this class belongs to another teacher");

    const archived = buildTeacherAssignmentsModule(
      fakeSql([
        node,
        classTargetRoute([
          { id: CLASS_A, teacher_id: TEACHER, course_slug: "igcse-chemistry-19", status: "ARCHIVED" },
        ]),
      ]),
      clock,
    );
    await expect(
      archived.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      archived.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow("this class is archived");

    const mismatch = buildTeacherAssignmentsModule(
      fakeSql([
        node,
        classTargetRoute([
          { id: CLASS_A, teacher_id: TEACHER, course_slug: "other-course-1", status: "ACTIVE" },
        ]),
        insertAssignmentRoute(),
      ]),
      clock,
    );
    await expect(
      mismatch.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      mismatch.createAssignment(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(
      "the class targets course other-course-1 but the assignment content is igcse-chemistry-19",
    );
  });

  test("valid class target stores the class id (the V51 echo, d04)", async () => {
    const routes: Route[] = [
      knowledgeNodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      classTargetRoute([
        { id: CLASS_A, teacher_id: TEACHER, course_slug: "igcse-chemistry-19", status: "ACTIVE" },
      ]),
      insertAssignmentRoute(),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const view = (await mod.createAssignment(TEACHER, {
      ...validBody,
      classId: CLASS_A,
    })) as Record<string, unknown>;
    expect(view.classId).toBe(CLASS_A);
  });

  test("dueAt law: the service 400 renders the raw input verbatim (b17/c07)", async () => {
    const routes: Route[] = [
      knowledgeNodeRoute([{ id: "n1", node_type: "TOPIC" }]),
      insertAssignmentRoute(),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    for (const bad of ["not-a-date", "2030-06-01 (no time)", "2030-06-01"]) {
      await expect(
        mod.createAssignment(TEACHER, { ...validBody, dueAt: bad }),
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        mod.createAssignment(TEACHER, { ...validBody, dueAt: bad }),
      ).rejects.toThrow(`dueAt must be an ISO-8601 instant: ${bad}`);
    }
  });
});

// ── list + stats ─────────────────────────────────────────────────────────────

describe("listAssignments (:134-145)", () => {
  test("empty store → [] (b01)", async () => {
    const mod = buildTeacherAssignmentsModule(
      fakeSql([cohortCountRoute(2), assignmentsListRoute([])]),
      clock,
    );
    expect(await mod.listAssignments(TEACHER)).toEqual([]);
  });

  test("T-TEACH-006: the list binds the JWT identity (own newest 50, params law)", async () => {
    let captured: unknown[] = [];
    const routes: Route[] = [
      cohortCountRoute(2),
      {
        match:
          /from assignments where teacher_id = \? ::uuid order by created_at desc limit \?$/,
        rows: [],
        rowsFor: (params) => {
          captured = params;
          return [];
        },
      },
    ];
    const sql = fakeSql(routes);
    const mod = buildTeacherAssignmentsModule(sql, clock);
    expect(await mod.listAssignments(TEACHER)).toEqual([]);
    expect(captured[0]).toBe(TEACHER); // the identity is bind slot 1
    expect(captured[1]).toBe(ASSIGNMENT_LIST_LIMIT); // the bound applies to the OWN set
  });

  test("newest-first summaries with the cohort denominator law + computed stats", async () => {
    const rows = [
      assignmentRow({ id: ASG_A, class_id: null }), // whole-cohort target
      assignmentRow({ id: ASG_B, class_id: CLASS_A, title: "B" }), // class target
    ];
    const routes: Route[] = [
      cohortCountRoute(2),
      assignmentsListRoute(rows),
      groupedMemberCountRoute([{ class_id: CLASS_A, member_count: 1 }]),
      submissionsByAssignment({
        [ASG_A]: [submissionRow(STUDENT_1, "2026-10-05T10:00:00Z")], // latest map: 1
        [ASG_B]: [], // B: no hand-ins
      }),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const list = (await mod.listAssignments(TEACHER)) as Array<Record<string, unknown>>;
    expect(list.length).toBe(2);
    // A: cohort 2, submitted 1 (score 8, before the future dueAt → late 0)
    expect(list[0]).toMatchObject({
      assignment: { id: ASG_A },
      submitted: 1,
      late: 0,
      missing: 1,
      meanScore: 8,
    });
    // B: class target 1, submitted 0 → missing 1, meanScore null
    expect(list[1]).toMatchObject({
      assignment: { id: ASG_B },
      submitted: 0,
      late: 0,
      missing: 1,
      meanScore: null,
    });
  });

  test("the late law: occurredAt AFTER dueAt (the strict isAfter, e03/e05)", async () => {
    const rows = [assignmentRow({ due_at: DUE_PAST })];
    const routes: Route[] = [
      cohortCountRoute(2),
      assignmentsListRoute(rows),
      submissionsRoute([submissionRow(STUDENT_1, "2026-10-05T10:00:00Z")]), // after past due
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const list = (await mod.listAssignments(TEACHER)) as Array<Record<string, unknown>>;
    expect(list[0]).toMatchObject({ submitted: 1, late: 1, missing: 1 });
  });

  test("the latest-by-learner map: newest-first first-wins over the trail (:244-251)", async () => {
    const rows = [assignmentRow()];
    const routes: Route[] = [
      cohortCountRoute(1),
      assignmentsListRoute(rows),
      submissionsRoute([
        submissionRow(STUDENT_1, "2026-10-05T12:00:00Z", { score: 9, questions_completed: 8 }), // NEWEST
        submissionRow(STUDENT_1, "2026-10-05T08:00:00Z", { score: 4, questions_completed: 3 }), // older
      ]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const list = (await mod.listAssignments(TEACHER)) as Array<Record<string, unknown>>;
    expect(list[0]).toMatchObject({ submitted: 1, meanScore: 9 }); // the newest row's score
  });

  test("meanScore: mean of the latest non-null scores only; null when none (:260-265)", async () => {
    const rows = [assignmentRow()];
    const routes: Route[] = [
      cohortCountRoute(2),
      assignmentsListRoute(rows),
      submissionsRoute([
        submissionRow(STUDENT_1, "2026-10-05T12:00:00Z", { score: 8 }),
        submissionRow(STUDENT_2, "2026-10-05T13:00:00Z", { score: null }), // unmarked
      ]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const list = (await mod.listAssignments(TEACHER)) as Array<Record<string, unknown>>;
    expect(list[0]).toMatchObject({ submitted: 2, meanScore: 8 }); // only S1's score
  });
});

// ── status lifecycle ─────────────────────────────────────────────────────────

describe("setAssignmentStatus (:205-217)", () => {
  test("close → the CLOSED wire view (f04)", async () => {
    const log: string[] = [];
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow()]),
      statusUpdateRoute(log),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const view = (await mod.setAssignmentStatus(TEACHER, ASG_A, "closed")) as Record<string, unknown>;
    expect(view.status).toBe("closed");
    expect(log).toEqual(["CLOSED"]);
  });

  test("T-TEACH-006: another teacher's assignment 403s and NEVER updates", async () => {
    const log: string[] = [];
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ teacher_id: OTHER_TEACHER })]),
      statusUpdateRoute(log),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "closed")).rejects.toBeInstanceOf(
      ClassroomForbiddenError,
    );
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "closed")).rejects.toThrow(
      "this assignment belongs to another teacher",
    );
    expect(log).toEqual([]); // the write never ran
  });

  test("T-TEACH-006: the status parse (400) still beats the ownership gate (403)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ teacher_id: OTHER_TEACHER })]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "half-open")).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  test("tolerant reopen (f05/f06) and the verbatim 400 on unknown values (f02)", async () => {
    const log: string[] = [];
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ status: "CLOSED" })]),
      statusUpdateRoute(log),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const view = (await mod.setAssignmentStatus(TEACHER, ASG_A, "  OPEN  ")) as Record<string, unknown>;
    expect(view.status).toBe("open");
    expect(log).toEqual(["OPEN"]);
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "half-open")).rejects.toThrow(
      'status must be "open" or "closed": half-open',
    );
  });

  test("unknown assignment → 404 verbatim (d09)", async () => {
    const mod = buildTeacherAssignmentsModule(fakeSql([assignmentByIdRoute([])]), clock);
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "open")).rejects.toBeInstanceOf(
      AssignmentNotFoundError,
    );
    await expect(mod.setAssignmentStatus(TEACHER, ASG_A, "open")).rejects.toThrow(
      `unknown assignment: ${ASG_A}`,
    );
  });
});

// ── roster ───────────────────────────────────────────────────────────────────

describe("assignmentRoster (:151-183)", () => {
  test("unknown assignment → 404 verbatim (e07); bad uuid is the route layer's law", async () => {
    const mod = buildTeacherAssignmentsModule(fakeSql([assignmentByIdRoute([])]), clock);
    await expect(mod.assignmentRoster(TEACHER, ASG_A)).rejects.toThrow(
      `unknown assignment: ${ASG_A}`,
    );
  });

  test("T-TEACH-006: another teacher's roster 403s (the §17 wording, assignment noun)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ teacher_id: OTHER_TEACHER })]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    await expect(mod.assignmentRoster(TEACHER, ASG_A)).rejects.toBeInstanceOf(
      ClassroomForbiddenError,
    );
    await expect(mod.assignmentRoster(TEACHER, ASG_A)).rejects.toThrow(
      "this assignment belongs to another teacher",
    );
  });

  test("whole-cohort roster: submitted first newest-first, then missing by name (e04)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ due_at: DUE_FUTURE })]),
      submissionsRoute([
        submissionRow(STUDENT_2, "2026-10-05T12:00:00Z"), // S2's hand-in is NEWER
        submissionRow(STUDENT_1, "2026-10-05T08:00:00Z"),
      ]),
      cohortUsersRoute([
        { id: STUDENT_1, display_name: "Brenda Student" },
        { id: STUDENT_2, display_name: "Arthur Student" },
      ]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const roster = (await mod.assignmentRoster(TEACHER, ASG_A)) as {
      assignment: Record<string, unknown>;
      rows: Array<Record<string, unknown>>;
    };
    expect(roster.assignment).toMatchObject({ id: ASG_A, status: "open" });
    expect(roster.rows).toEqual([
      {
        learnerId: STUDENT_2, // newest hand-in first
        displayName: "Arthur Student",
        state: "complete",
        submittedAt: "2026-10-05T12:00:00.000Z",
        score: 8,
        questionsCompleted: 6,
      },
      {
        learnerId: STUDENT_1,
        displayName: "Brenda Student",
        state: "complete",
        submittedAt: "2026-10-05T08:00:00.000Z",
        score: 8,
        questionsCompleted: 6,
      },
    ]);
  });

  test("missing rows sort last by name case-insensitively; the missing shape is nulls (:166-181)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ due_at: DUE_FUTURE })]),
      submissionsRoute([submissionRow(STUDENT_1, "2026-10-05T08:00:00Z")]),
      cohortUsersRoute([
        { id: STUDENT_2, display_name: "arthur Student" }, // case-insensitive first
        { id: STUDENT_1, display_name: "Brenda Student" },
      ]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const roster = (await mod.assignmentRoster(TEACHER, ASG_A)) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(roster.rows.map((r) => r.state)).toEqual(["complete", "missing"]);
    expect(roster.rows[1]).toEqual({
      learnerId: STUDENT_2,
      displayName: "arthur Student",
      state: "missing",
      submittedAt: null,
      score: null,
      questionsCompleted: null,
    });
  });

  test("the late state rides the assignment's own dueAt (e05)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ due_at: DUE_PAST })]),
      submissionsRoute([submissionRow(STUDENT_1, "2026-10-05T08:00:00Z")]), // after past due
      cohortUsersRoute([{ id: STUDENT_1, display_name: "Brenda Student" }]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const roster = (await mod.assignmentRoster(TEACHER, ASG_A)) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(roster.rows[0]).toMatchObject({ state: "late", score: 8 });
  });

  test("class-targeted roster: exactly the class's enabled members (e06)", async () => {
    const routes: Route[] = [
      assignmentByIdRoute([assignmentRow({ class_id: CLASS_A })]),
      submissionsRoute([]),
      classCohortUsersRoute([{ id: STUDENT_1, display_name: "Brenda Student" }]),
    ];
    const mod = buildTeacherAssignmentsModule(fakeSql(routes), clock);
    const roster = (await mod.assignmentRoster(TEACHER, ASG_A)) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(roster.rows.length).toBe(1); // the independent student does NOT appear
    expect(roster.rows[0]).toMatchObject({ learnerId: STUDENT_1, state: "missing" });
  });
});

// ── the constants law ────────────────────────────────────────────────────────

describe("bounds constants", () => {
  test("the list bound and the trail bound are the controller's literals", () => {
    expect(ASSIGNMENT_LIST_LIMIT).toBe(50); // :79
    expect(LATEST_TRAIL_LIMIT).toBe(2000); // :247 page(0,2000)
  });
});
