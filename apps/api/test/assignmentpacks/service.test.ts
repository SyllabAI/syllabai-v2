/**
 * Assignment packs service unit tests (T-SENECA-001) — stubbed sql via the
 * shared fakeSql helper (+ a transaction-capable wrapper). Pins the
 * v2-native laws of docs/SENECA_RESOURCE_PACKS_PLAN.md:
 *   - the fail-closed course/library gate (unknown course target 404)
 *   - the frozen class gate wording (404 unknown → 403 other's → 409
 *     archived → 400 course mismatch — verbatim, the resolveClassTarget
 *     ladder this module reuses)
 *   - the dueAt strict-instant law (verbatim message; date-only refuses)
 *   - the fail-closed resource validation (first missing id 404, nothing
 *     written)
 *   - the marks law (EQ marks clamped ≥1 sum + 1 per section/quiz) and the
 *     spec_refs [] side-table shape (the core-era assignments row is only
 *     INSERTed, never reshaped)
 *   - the V51 learner visibility (class work only for members; a
 *     non-member gets the list's own 404 — existence never leaks)
 *   - the closed window (409 "assignment is closed: {title}" verbatim, the
 *     learner-me wording)
 *   - SERVER-side scoring (EQ clamp 0..marksTotal, score = marks/total;
 *     sections/quizzes = the 1-mark completion task) + the derived
 *     (questionsCompleted, score) hand-in numbers
 *   - RUN-004 placement: seneca_resources lives in the sci-chem WAREHOUSE —
 *     every seneca query rides the second seam (whSql), NULL seam = fail
 *     loud (WarehouseNotConfiguredError); loadTasks is the split seam
 *     (positions on main, content on the warehouse by id — ids are the
 *     contract, no cross-project join/FK)
 */
import { describe, expect, test } from "bun:test";
import {
  buildAssignmentPacksModule,
  PackNotFoundError,
  PackForbiddenError,
  WarehouseNotConfiguredError,
  parseInstantStrict,
} from "../../src/routes/assignment-packs";
import { BadRequestError, ConflictError } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SqlFn } from "../../src/services/assessment/sql";
/** the module's sql seams (run-004): [0] MAIN, [1] the sci-chem WAREHOUSE
 *  (nullable — the fail-loud NULL seam). The fakes carry the transaction the
 *  real createSql provides (structurally satisfied, never dialed). */
type PackSql = Parameters<typeof buildAssignmentPacksModule>[0];
type WhSql = NonNullable<Parameters<typeof buildAssignmentPacksModule>[1]>;

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const STUDENT_1 = "bb000000-0000-4000-8000-000000000001";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const ASG_A = "dd000000-0000-4000-8000-000000000001";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";
const RES_EQ = "ef100000-0000-4000-8000-000000000001";
const RES_SECTION = "ef100000-0000-4000-8000-000000000002";
const RES_QUIZ = "ef100000-0000-4000-8000-000000000003";

const NOW = new Date("2026-10-23T08:00:00Z");
const clock = { newId: () => NEW_ID, now: () => NOW };
const COURSE = "igcse-chemistry-19";

// ── a transaction-capable fake (the real createSql carries .transaction) ────

function fakeSqlTx(routes: Route[]): PackSql & { queries: string[] } {
  const fn = fakeSql(routes) as unknown as PackSql & { queries: string[] };
  fn.transaction = (<T,>(body: (tx: SqlFn) => Promise<T>) => body(fn)) as PackSql["transaction"];
  return fn as PackSql & { queries: string[] };
}

/** the WAREHOUSE seam fake (seneca_resources lives there since run-004). */
function fakeWh(routes: Route[]): WhSql {
  return fakeSql(routes) as unknown as WhSql;
}

// ── row builders ─────────────────────────────────────────────────────────────

const registryRow = (over: Partial<Record<string, unknown>> = {}) => ({
  label: "Chemistry",
  code: "4CH1",
  subject: "Chemistry",
  ...over,
});

const eqRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: RES_EQ,
  kind: "examQuestion",
  title: null,
  topic_path: "Chemistry: Edexcel iGCSE > 2. Elements, compounds and mixtures",
  marks_total: 3,
  question_type: "short_answer",
  content_json: {
    questionTitleMd: "Name the products $varA",
    markScheme: "any two of",
    generationScript: "varA=1+1",
  },
  ...over,
});

const sectionRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: RES_SECTION,
  kind: "courseSection",
  title: "States of matter",
  topic_path: "Chemistry: Edexcel iGCSE > 1. States of Matter",
  marks_total: null,
  question_type: null,
  content_json: { topicNotes: "Solids, liquids, gases…", description: "intro" },
  ...over,
});

const quizRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: RES_QUIZ,
  kind: "quiz",
  title: "Teacher quiz — bonding",
  topic_path: "Chemistry: Edexcel iGCSE > 2. Elements, compounds and mixtures",
  marks_total: null,
  question_type: null,
  content_json: { quizSummary: "10 questions on ionic vs covalent" },
  ...over,
});

const assignmentRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ASG_A,
  teacher_id: TEACHER,
  course_slug: COURSE,
  course_label: "Chemistry",
  title: "Bonding pack",
  spec_refs: [],
  marks_total: 5,
  question_count: 3,
  due_at: "2099-06-01T12:00:00.000Z",
  status: "OPEN",
  created_at: "2026-10-23T08:00:00.000Z",
  class_id: null,
  ...over,
});

// ── query shapes (single-space normalized fakeSql routes) ────────────────────

const registryRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select label, code, subject from course_registry where course_slug = \?$/,
  rows,
});

const libraryRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from seneca_resources where course_slug = \? and \( \? ::text is null or kind = \? \)/,
  rows,
});

const topicsRoute = (topics: string[]): Route => ({
  match: /select distinct topic_path from seneca_resources where course_slug = \? and topic_path is not null/,
  rows: topics.map((t) => ({ topic_path: t })),
});

const countRoute = (total: number): Route => ({
  match: /select count\(\*\)::int as total from seneca_resources where course_slug = \?$/,
  rows: [{ total }],
});

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, teacher_id, course_slug, status from classes where id = \? ::uuid$/,
  rows,
});


const validateRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from seneca_resources where course_slug = \? and id = any\( \? ::text\[\]\)/,
  rows,
});

const insertAssignmentRoute = (): Route => ({
  match: /insert into assignments \(id, teacher_id/,
  rows: [],
});
const insertTaskRoute = (): Route => ({
  match: /insert into assignment_resources \(id, assignment_id/,
  rows: [],
});

const assignmentByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from assignments where id = \? ::uuid$/,
  rows,
});

// run-004 seam split: positions ride MAIN (assignment_resources, 0014),
// content rides the WAREHOUSE (seneca_resources by id) — never a join.
const positionsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from assignment_resources where assignment_id = \? order by position asc$/,
  rows,
});

const whIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from seneca_resources where id = any\( \? ::text\[\]\)$/,
  rows,
});

const memberRoute = (member: boolean): Route => ({
  match: /select 1 as member from class_members where class_id = \? ::uuid and student_id = \? ::uuid limit 1$/,
  rows: member ? [{ member: 1 }] : [],
});

const statesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select resource_id, status, marks_awarded, score, completed_at from assignment_resource_states where assignment_id = \? ::uuid and learner_id = \? ::uuid$/,
  rows,
});

const upsertStateRoute = (): Route => ({
  match: /insert into assignment_resource_states \(id, assignment_id, learner_id,/,
  rows: [],
});

const derivedRoute = (done: number, score: number): Route => ({
  match: /select count\(\*\) filter \(where status = 'complete'\)::int as done,/,
  rows: [{ done, score }],
});

const validBody = {
  title: "Bonding pack",
  courseSlug: COURSE,
  courseLabel: "Chemistry",
  dueAt: "2099-06-01T12:00:00Z",
  resourceIds: [RES_SECTION, RES_EQ],
};

// ── the library (the picker feed — course-scoped, no filterer) ───────────────

describe("library", () => {
  test("unknown course target → 404 verbatim (fail-closed, nothing leaks)", async () => {
    const sql = fakeSqlTx([registryRoute([])]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(mod.library({ courseSlug: "not-a-course" })).rejects.toThrow(
      new PackNotFoundError("unknown course target: not-a-course"),
    );
  });

  test("known course → the picker view with the registry label + topics + total", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow()])]);
    const whSql = fakeWh([
      libraryRoute([eqRow(), sectionRow()]),
      topicsRoute(["1. States of Matter", "2. Elements, compounds and mixtures"]),
      countRoute(5699),
    ]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.library({ courseSlug: COURSE });
    expect(view.courseSlug).toBe(COURSE);
    expect(view.courseLabel).toBe("Chemistry"); // registry label wins
    expect(view.total).toBe(5699);
    expect(view.topics).toHaveLength(2);
    expect(view.resources).toHaveLength(2);
    expect(view.resources[0]).toMatchObject({ id: RES_EQ, kind: "examQuestion", marksTotal: 3 });
  });

  test("warehouse seam absent → WarehouseNotConfiguredError (fail loud — never a silent empty feed, run-004)", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow()])]);
    const mod = buildAssignmentPacksModule(sql, null, clock);
    await expect(mod.library({ courseSlug: COURSE })).rejects.toThrow(
      WarehouseNotConfiguredError,
    );
    await expect(mod.library({ courseSlug: COURSE })).rejects.toThrow(
      /SYLLABAI_WAREHOUSE_URL_SCI_CHEM absent/,
    );
  });

  test("registry row without a label falls back to subject (code)", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow({ label: null })])]);
    const whSql = fakeWh([libraryRoute([]), topicsRoute([]), countRoute(0)]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.library({ courseSlug: COURSE });
    expect(view.courseLabel).toBe("Chemistry (4CH1)");
  });
});

// ── the create path ──────────────────────────────────────────────────────────

describe("createPack", () => {
  test("date-only dueAt → 400 verbatim (the strict-instant law)", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow()])]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(
      mod.createPack(TEACHER, { ...validBody, dueAt: "2099-06-01" }),
    ).rejects.toThrow(new BadRequestError("dueAt must be an ISO-8601 instant: 2099-06-01"));
  });

  test("unknown class → 404 verbatim; other teacher's class → 403; archived → 409; course mismatch → 400", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow()]), classRoute([])]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(
      mod.createPack(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(new PackNotFoundError(`unknown class target: ${CLASS_A}`));

    const sql2 = fakeSqlTx([
      registryRoute([registryRow()]),
      classRoute([{ id: CLASS_A, teacher_id: OTHER_TEACHER, course_slug: COURSE, status: "ACTIVE" }]),
    ]);
    const mod2 = buildAssignmentPacksModule(sql2, fakeWh([]), clock);
    await expect(
      mod2.createPack(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(new PackForbiddenError("this class belongs to another teacher"));

    const sql3 = fakeSqlTx([
      registryRoute([registryRow()]),
      classRoute([{ id: CLASS_A, teacher_id: TEACHER, course_slug: COURSE, status: "ARCHIVED" }]),
    ]);
    const mod3 = buildAssignmentPacksModule(sql3, fakeWh([]), clock);
    await expect(
      mod3.createPack(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(new ConflictError("this class is archived"));

    const sql4 = fakeSqlTx([
      registryRoute([registryRow()]),
      classRoute([
        { id: CLASS_A, teacher_id: TEACHER, course_slug: "ial-chemistry-17", status: "ACTIVE" },
      ]),
    ]);
    const mod4 = buildAssignmentPacksModule(sql4, fakeWh([]), clock);
    await expect(
      mod4.createPack(TEACHER, { ...validBody, classId: CLASS_A }),
    ).rejects.toThrow(
      new BadRequestError(
        "the class targets course ial-chemistry-17 but the assignment content is " + COURSE,
      ),
    );
  });

  test("unknown resource id → 404 first-missing, nothing written", async () => {
    const sql = fakeSqlTx([registryRoute([registryRow()])]);
    const whSql = fakeWh([validateRoute([eqRow()])]); // RES_SECTION missing
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    await expect(mod.createPack(TEACHER, validBody)).rejects.toThrow(
      new PackNotFoundError(`unknown assignment resource: ${RES_SECTION}`),
    );
    expect(sql.queries.some((q) => q.startsWith("insert into assignments"))).toBe(false);
  });

  test("happy path → the assignments row (spec_refs []) + ordered side-table tasks; marks = EQ sum + 1 per section/quiz", async () => {
    const sql = fakeSqlTx([
      registryRoute([registryRow()]),
      insertAssignmentRoute(),
      insertTaskRoute(),
    ]);
    const whSql = fakeWh([validateRoute([eqRow(), sectionRow(), quizRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.createPack(TEACHER, {
      ...validBody,
      resourceIds: [RES_SECTION, RES_EQ, RES_QUIZ],
    });
    expect(view).toMatchObject({
      assignmentId: NEW_ID,
      title: "Bonding pack",
      courseSlug: COURSE,
      marksTotal: 5, // 3 (EQ) + 1 (section) + 1 (quiz)
      questionCount: 3,
      status: "open",
    });
    expect(view.tasks.map((t) => t.resourceId)).toEqual([RES_SECTION, RES_EQ, RES_QUIZ]);
    expect(view.tasks[1]).toMatchObject({
      questionMd: "Name the products $varA",
      markSchemeMd: "any two of",
      generationScript: "varA=1+1",
    });
    expect(view.tasks[0]?.notesMd).toBe("Solids, liquids, gases…");
    expect(view.tasks[2]?.quizSummaryMd).toBe("10 questions on ionic vs covalent");
    const inserts = sql.queries.filter((q) => q.startsWith("insert into assignment_resources"));
    expect(inserts).toHaveLength(3);
    // the core-era row only ever INSERTed — never UPDATEd/ALTERed
    expect(sql.queries.some((q) => q.startsWith("update assignments"))).toBe(false);
  });

  test("EQ with a null marks_total still counts as the 1-mark floor", async () => {
    const sql = fakeSqlTx([
      registryRoute([registryRow()]),
      insertAssignmentRoute(),
      insertTaskRoute(),
    ]);
    const whSql = fakeWh([validateRoute([eqRow({ marks_total: null })])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.createPack(TEACHER, { ...validBody, resourceIds: [RES_EQ] });
    expect(view.marksTotal).toBe(1);
  });
});

// ── the pack detail (teacher preview) ────────────────────────────────────────

describe("packDetailFor", () => {
  test("unknown assignment → 404 verbatim; foreign teacher → 403 verbatim (the §17 gate)", async () => {
    const sql = fakeSqlTx([assignmentByIdRoute([])]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(mod.packDetailFor(TEACHER, ASG_A)).rejects.toThrow(
      new PackNotFoundError(`unknown assignment: ${ASG_A}`),
    );

    const sql2 = fakeSqlTx([assignmentByIdRoute([assignmentRow({ teacher_id: OTHER_TEACHER })])]);
    const mod2 = buildAssignmentPacksModule(sql2, fakeWh([]), clock);
    await expect(mod2.packDetailFor(TEACHER, ASG_A)).rejects.toThrow(
      new PackForbiddenError("this assignment belongs to another teacher"),
    );
  });

  test("task whose warehouse row is missing → 404 fail-closed (never a silently shortened pack, run-004)", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([
        { resource_id: RES_EQ, position: 1 },
        { resource_id: RES_SECTION, position: 2 },
      ]),
    ]);
    const whSql = fakeWh([whIdsRoute([eqRow()])]); // RES_SECTION absent from the warehouse
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    await expect(mod.packDetailFor(TEACHER, ASG_A)).rejects.toThrow(
      new PackNotFoundError(`unknown assignment resource: ${RES_SECTION}`),
    );
  });

  test("owner sees the ordered tasks with content", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([
        { resource_id: RES_SECTION, position: 1 },
        { resource_id: RES_EQ, position: 2 },
      ]),
    ]);
    const whSql = fakeWh([whIdsRoute([sectionRow(), eqRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.packDetailFor(TEACHER, ASG_A);
    expect(view.tasks).toHaveLength(2);
    expect(view.tasks[0]?.position).toBe(1);
  });
});

// ── the learner loop ─────────────────────────────────────────────────────────

describe("learnerPack", () => {
  test("class assignment, non-member → the list's own 404 (existence never leaks)", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow({ class_id: CLASS_A })]),
      memberRoute(false),
    ]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(mod.learnerPack(STUDENT_1, ASG_A)).rejects.toThrow(
      new PackNotFoundError(`unknown assignment: ${ASG_A}`),
    );
  });

  test("cohort assignment → tasks + my states", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([{ resource_id: RES_EQ, position: 1 }]),
      statesRoute([]),
    ]);
    const whSql = fakeWh([whIdsRoute([eqRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const view = await mod.learnerPack(STUDENT_1, ASG_A);
    expect(view.tasks).toHaveLength(1);
    expect(view.myStates).toEqual([]);
  });
});

describe("completeTask", () => {
  test("closed window → 409 verbatim (the learner-me wording)", async () => {
    const sql = fakeSqlTx([assignmentByIdRoute([assignmentRow({ status: "CLOSED" })])]);
    const mod = buildAssignmentPacksModule(sql, fakeWh([]), clock);
    await expect(mod.completeTask(STUDENT_1, ASG_A, RES_EQ, null)).rejects.toThrow(
      new ConflictError("assignment is closed: Bonding pack"),
    );
  });

  test("resource not in the pack → 404", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([{ resource_id: RES_EQ, position: 1 }]),
    ]);
    const whSql = fakeWh([whIdsRoute([eqRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    await expect(mod.completeTask(STUDENT_1, ASG_A, RES_QUIZ, null)).rejects.toThrow(
      new PackNotFoundError(`unknown assignment resource: ${RES_QUIZ}`),
    );
  });

  test("exam question: marks clamp 0..marksTotal, score = marks/total, derived counts ride the states", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([{ resource_id: RES_EQ, position: 1 }]),
      upsertStateRoute(),
      derivedRoute(1, 2),
    ]);
    const whSql = fakeWh([whIdsRoute([eqRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const out = await mod.completeTask(STUDENT_1, ASG_A, RES_EQ, 99);
    expect(out.state).toMatchObject({ status: "complete", marksAwarded: 3, score: 1 });
    expect(out.questionsCompleted).toBe(1);
    expect(out.score).toBe(2);

    const out0 = await mod.completeTask(STUDENT_1, ASG_A, RES_EQ, null);
    expect(out0.state.marksAwarded ?? 0).toBe(0);
    expect(out0.state.score ?? 0).toBe(0);
  });

  test("section/quiz: the 1-mark completion task (full credit, marksAwarded ignored)", async () => {
    const sql = fakeSqlTx([
      assignmentByIdRoute([assignmentRow()]),
      positionsRoute([{ resource_id: RES_SECTION, position: 1 }]),
      upsertStateRoute(),
      derivedRoute(1, 1),
    ]);
    const whSql = fakeWh([whIdsRoute([sectionRow()])]);
    const mod = buildAssignmentPacksModule(sql, whSql, clock);
    const out = await mod.completeTask(STUDENT_1, ASG_A, RES_SECTION, 50);
    expect(out.state).toMatchObject({ status: "complete", marksAwarded: 1, score: 1 });
  });
});

// ── the dueAt law in isolation ───────────────────────────────────────────────

describe("parseInstantStrict", () => {
  test("instants parse; date-only and garbage refuse verbatim", () => {
    expect(parseInstantStrict("2099-06-01T12:00:00Z").toISOString()).toBe("2099-06-01T12:00:00.000Z");
    expect(() => parseInstantStrict("2099-06-01")).toThrow(
      new BadRequestError("dueAt must be an ISO-8601 instant: 2099-06-01"),
    );
    expect(() => parseInstantStrict("soon")).toThrow(
      new BadRequestError("dueAt must be an ISO-8601 instant: soon"),
    );
  });
});
