/**
 * Assignment packs router — T-SENECA-001 (v2-native, additive).
 *
 * The teacher assignment creator's "Seneca resources" option (the operator
 * commission of 2026-10-23, trace 1a1651ae815dc3d5): content resources from
 * the operator-approved Seneca Resource Hub harvest
 * (SyllabAI/syllabai-experimental @ d67bc1e3, PII-scrubbed), linked ONLY to
 * hub courses that exist (course_registry / courses.json; pilot:
 * igcse-chemistry-19 = Edexcel IGCSE Chemistry 4CH1).
 *
 * FENCES AND LAWS:
 *   - The frozen assignments family (contracts/assignments.ts,
 *     routes/assignments.ts, services/teacher-assignments) is NOT touched.
 *     This file is SELF-CONTAINED (route + service, the T-TEACH-012 fence
 *     shape): one import + two mount lines in src/index.ts, tests under
 *     test/assignmentpacks/**.
 *   - A pack IS an `assignments` row (spec_refs [], marks/count derived)
 *     + `assignment_resources` side-table tasks — so the EXISTING learner
 *     list, agenda, hand-in submissions, roster and close/reopen work
 *     unchanged. The core-era row is never ALTERed (BASELINE_DB.md §4,
 *     the 0006 side-table precedent).
 *   - Fail-closed targets: every resourceId must exist AND belong to the
 *     create request's course (404 "unknown assignment resource: {id}" /
 *     the class gates below reuse the frozen verbatim wording); the
 *     library 404s an unknown course slug ("unknown course target").
 *   - Hand-in honesty: the learner's hand-in stays the EXISTING submissions
 *     endpoint — this module stores per-task completion state and derives
 *     (questionsCompleted, score) from it; nothing is typed by hand and no
 *     mastery is written (a hand-in is completion evidence only).
 *   - Server-side scoring (the deliberate contrast to Seneca's
 *     client-computed mastery): exam questions clamp marksAwarded into
 *     0..marksTotal and store score = marks/marksTotal; sections and
 *     quizzes complete at full credit. Re-completion allowed — latest row
 *     wins (the re-hand-in law's mold).
 *   - ZERO-KEY law: no LLM seam exists on this family (§9).
 *   - Bind-slot discipline: every ${} slot is a bind parameter; column
 *     lists and state-bearing predicates inline as static template text.
 *
 * NO course filterer (the operator directive): the library feed is scoped
 * by the page's own course slug — there is no course dropdown anywhere in
 * this surface.
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import { BadRequestError, ConflictError, type SubmitClock } from "../services/selfmark";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { getAuth, requireRole } from "../middleware/auth";
import {
  assignmentPackCompleteRequestSchema,
  assignmentPackCreateRequestSchema,
  type AssignmentPackDetailView,
  type AssignmentPackLibraryView,
  type AssignmentPackStatesView,
} from "@syllabai/contracts";

// ── errors (the assignments family's class shapes, local to the fence) ──────

export class PackNotFoundError extends Error {}
export class PackForbiddenError extends Error {}
export { BadRequestError, ConflictError };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** the frozen dueAt law (parseInstantStrict's mold): strict ISO instant,
 *  date-only refuses. */
export function parseInstantStrict(raw: string): Date {
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw.trim())) {
    throw new BadRequestError(`dueAt must be an ISO-8601 instant: ${raw}`);
  }
  return new Date(t);
}

// ── row shapes (plain column names as the selects render them) ──────────────

type ResourceRow = {
  id: string;
  kind: "courseSection" | "examQuestion" | "quiz";
  title: string | null;
  topic_path: string | null;
  marks_total: number | null;
  question_type: string | null;
  content_json: Record<string, unknown> | null;
};

type AssignmentRow = {
  id: string;
  teacher_id: string;
  course_slug: string;
  course_label: string;
  title: string;
  marks_total: number;
  question_count: number;
  due_at: string | Date;
  status: string;
  class_id: string | null;
};

type TaskRow = ResourceRow & { position: number };

type ClassRow = { id: string; teacher_id: string; course_slug: string; status: string };

type RegistryRow = { label: string | null; code: string | null; subject: string | null };

type StateRow = {
  resource_id: string;
  status: string;
  marks_awarded: number | null;
  score: number | null;
  completed_at: string | Date | null;
};

const iso = (x: string | Date): string => new Date(x).toISOString();

type SqlFn = ReturnType<typeof createSql>;

export type AssignmentPacksModule = ReturnType<typeof buildAssignmentPacksModule>;

/** the corpus content-key mapping (the harvest's own field names). */
function mapContent(row: ResourceRow): Record<string, unknown> {
  const c = row.content_json ?? {};
  if (row.kind === "examQuestion") {
    return {
      questionMd: str(c.questionTitleMd),
      markSchemeMd: str(c.markScheme),
      generationScript: str(c.generationScript),
    };
  }
  if (row.kind === "quiz") {
    return { quizSummaryMd: str(c.quizSummary) };
  }
  return { notesMd: str(c.topicNotes) ?? str(c.description) };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function taskView(row: TaskRow) {
  return {
    resourceId: row.id,
    position: row.position,
    kind: row.kind,
    title: row.title,
    topicPath: row.topic_path,
    marksTotal: row.marks_total,
    questionType: row.question_type,
    ...mapContent(row),
  };
}

// ── the service ─────────────────────────────────────────────────────────────

export function buildAssignmentPacksModule(sql: SqlFn, clock: SubmitClock) {
  async function resolveCourseLabel(courseSlug: string): Promise<string> {
    const rows = (await sql`
      select label, code, subject from course_registry where course_slug = ${courseSlug}
    `) as unknown as RegistryRow[];
    const row = rows[0];
    if (!row) throw new PackNotFoundError(`unknown course target: ${courseSlug}`);
    const subject = row.subject ?? "Course";
    const code = row.code ? ` (${row.code})` : "";
    return row.label ?? `${subject}${code}`;
  }

  /** GET /resources — the picker feed, course-scoped BY CONSTRUCTION (no
   *  course filterer anywhere; D4 of the plan of record). */
  async function library(params: {
    courseSlug: string;
    kind?: string | null;
    topic?: string | null;
    q?: string | null;
    limit?: number | null;
  }): Promise<AssignmentPackLibraryView> {
    const courseLabel = await resolveCourseLabel(params.courseSlug);
    const kind = params.kind ?? null;
    const topic = params.topic ?? null;
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const limit = Math.min(500, Math.max(1, params.limit ?? 200));

    const rows = (await sql`
      select id, kind, title, topic_path, marks_total, question_type
      from seneca_resources
      where course_slug = ${params.courseSlug}
        and (${kind}::text is null or kind = ${kind})
        and (${topic}::text is null or topic_path = ${topic})
        and (${q}::text is null or title ilike ${q} or topic_path ilike ${q})
      order by kind asc, topic_path asc nulls last, id asc
      limit ${limit}
    `) as unknown as ResourceRow[];

    const topicRows = (await sql`
      select distinct topic_path from seneca_resources
      where course_slug = ${params.courseSlug} and topic_path is not null
      order by topic_path asc limit 400
    `) as unknown as { topic_path: string }[];

    const totalRows = (await sql`
      select count(*)::int as total from seneca_resources where course_slug = ${params.courseSlug}
    `) as unknown as { total: number }[];

    return {
      courseSlug: params.courseSlug,
      courseLabel,
      total: totalRows[0]?.total ?? 0,
      topics: topicRows.map((t) => t.topic_path),
      resources: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        topicPath: r.topic_path,
        marksTotal: r.marks_total,
        questionType: r.question_type,
      })),
    };
  }

  /** the frozen class gate (verbatim wording, the resolveClassTarget
   *  ladder: 404 unknown → 403 other's → 409 archived → 400 course
   *  mismatch). */
  async function resolveClassTarget(teacherId: string, classId: string): Promise<ClassRow> {
    const rows = (await sql`
      select id, teacher_id, course_slug, status from classes where id = ${classId}::uuid
    `) as unknown as ClassRow[];
    const row = rows[0];
    if (!row) throw new PackNotFoundError(`unknown class target: ${classId}`);
    if (row.teacher_id !== teacherId)
      throw new PackForbiddenError("this class belongs to another teacher");
    if (row.status !== "ACTIVE") throw new ConflictError("this class is archived");
    return row;
  }

  /** POST / — create the pack: the SAME `assignments` row the frozen family
   *  owns (never reshaped) + the side-table task list, in one transaction. */
  async function createPack(
    teacherId: string,
    req: {
      title: string;
      courseSlug: string;
      courseLabel: string;
      dueAt: string;
      classId?: string | null;
      resourceIds: string[];
    },
  ): Promise<AssignmentPackDetailView> {
    const due = parseInstantStrict(req.dueAt);
    const classId = req.classId ?? null;
    if (classId) {
      const cls = await resolveClassTarget(teacherId, classId);
      if (cls.course_slug !== req.courseSlug) {
        throw new BadRequestError(
          `the class targets course ${cls.course_slug} but the assignment content is ${req.courseSlug}`,
        );
      }
    }

    // fail-closed resource validation, insertion-ordered dedup already done
    // by the schema's superRefine; unknown/foreign ids 404 first-missing
    const found = (await sql`
      select id, kind, title, topic_path, marks_total, question_type, content_json
      from seneca_resources
      where course_slug = ${req.courseSlug} and id = any(${req.resourceIds}::text[])
    `) as unknown as ResourceRow[];
    const byId = new Map(found.map((r) => [r.id, r]));
    for (const id of req.resourceIds) {
      if (!byId.has(id)) throw new PackNotFoundError(`unknown assignment resource: ${id}`);
    }
    const tasks = req.resourceIds.map((id, i) => ({ row: byId.get(id)!, position: i + 1 }));

    // the marks law: exam questions contribute their marks (min 1),
    // sections/quizzes are 1-mark completion tasks — the same shape the
    // prototype's normalizeScore used (marks for EQs, full credit else).
    const marksTotal = Math.max(
      1,
      tasks.reduce(
        (a, t) => a + (t.row.kind === "examQuestion" ? Math.max(1, t.row.marks_total ?? 1) : 1),
        0,
      ),
    );
    const id = clock.newId();
    const now = clock.now();

    await sql.transaction(async (tx) => {
      await tx`
        insert into assignments
          (id, teacher_id, course_slug, course_label, title, spec_refs,
           marks_total, question_count, due_at, status, created_at, class_id)
        values (${id}::uuid, ${teacherId}::uuid, ${req.courseSlug}, ${req.courseLabel}, ${req.title},
                ${JSON.stringify([])}::jsonb, ${marksTotal}, ${tasks.length}, ${due.toISOString()},
                'OPEN', ${now.toISOString()}, ${classId}::uuid)
      `;
      for (const t of tasks) {
        await tx`
          insert into assignment_resources (id, assignment_id, resource_id, position, created_at)
          values (${clock.newId()}::uuid, ${id}::uuid, ${t.row.id}, ${t.position}, ${now.toISOString()})
        `;
      }
    });

    // the detail is built from the data in hand — no re-read of the row
    // this call just wrote (one roundtrip less; the transaction is the
    // record).
    return {
      assignmentId: id,
      title: req.title,
      courseSlug: req.courseSlug,
      courseLabel: req.courseLabel,
      marksTotal,
      questionCount: tasks.length,
      dueAt: due.toISOString(),
      status: "open",
      tasks: tasks.map((t) => taskView({ ...t.row, position: t.position })),
    };
  }

  async function loadAssignment(id: string): Promise<AssignmentRow> {
    const rows = (await sql`
      select id, teacher_id, course_slug, course_label, title, marks_total, question_count,
             due_at, status, class_id
      from assignments where id = ${id}::uuid
    `) as unknown as AssignmentRow[];
    const row = rows[0];
    if (!row) throw new PackNotFoundError(`unknown assignment: ${id}`);
    return row;
  }

  async function loadTasks(assignmentId: string): Promise<TaskRow[]> {
    const rows = (await sql`
      select r.id, r.kind, r.title, r.topic_path, r.marks_total, r.question_type,
             r.content_json, ar.position
      from assignment_resources ar
      join seneca_resources r on r.id = ar.resource_id
      where ar.assignment_id = ${assignmentId}
      order by ar.position asc
    `) as unknown as TaskRow[];
    return rows;
  }

  async function packDetailFor(
    viewerId: string,
    assignmentId: string,
    tasks?: TaskRow[],
  ): Promise<AssignmentPackDetailView> {
    const a = await loadAssignment(assignmentId);
    if (a.teacher_id !== viewerId)
      throw new PackForbiddenError("this assignment belongs to another teacher");
    const rows = tasks ?? (await loadTasks(assignmentId));
    return {
      assignmentId: a.id,
      title: a.title,
      courseSlug: a.course_slug,
      courseLabel: a.course_label,
      marksTotal: a.marks_total,
      questionCount: a.question_count,
      dueAt: iso(a.due_at),
      status: a.status === "CLOSED" ? "closed" : "open",
      tasks: rows.map(taskView),
    };
  }

  /** the V51 visibility law (the learner list's own): class work only for
   *  members; cohort work for every enabled student. A non-member gets the
   *  same 404 the list's omission is — existence is never leaked. */
  async function assertLearnerScope(learnerId: string, a: AssignmentRow): Promise<void> {
    if (!a.class_id) return;
    const rows = (await sql`
      select 1 as member from class_members
      where class_id = ${a.class_id}::uuid and student_id = ${learnerId}::uuid limit 1
    `) as unknown as { member: number }[];
    if (!rows[0]) throw new PackNotFoundError(`unknown assignment: ${a.id}`);
  }

  /** learner pack detail: tasks + MY states (the hand-in derives from
   *  these via the existing submissions endpoint). */
  async function learnerPack(
    learnerId: string,
    assignmentId: string,
  ): Promise<AssignmentPackDetailView & { myStates: AssignmentPackStatesView["states"] }> {
    const a = await loadAssignment(assignmentId);
    await assertLearnerScope(learnerId, a);
    const [rows, states] = await Promise.all([
      loadTasks(assignmentId),
      loadStates(assignmentId, learnerId),
    ]);
    return {
      assignmentId: a.id,
      title: a.title,
      courseSlug: a.course_slug,
      courseLabel: a.course_label,
      marksTotal: a.marks_total,
      questionCount: a.question_count,
      dueAt: iso(a.due_at),
      status: a.status === "CLOSED" ? "closed" : "open",
      tasks: rows.map(taskView),
      myStates: states.map(stateView),
    };
  }

  async function loadStates(assignmentId: string, learnerId: string): Promise<StateRow[]> {
    return (await sql`
      select resource_id, status, marks_awarded, score, completed_at
      from assignment_resource_states
      where assignment_id = ${assignmentId}::uuid and learner_id = ${learnerId}::uuid
    `) as unknown as StateRow[];
  }

  function stateView(r: StateRow) {
    return {
      resourceId: r.resource_id,
      status: r.status === "complete" ? ("complete" as const) : ("todo" as const),
      marksAwarded: r.marks_awarded,
      score: r.score,
      completedAt: r.completed_at ? iso(r.completed_at) : null,
    };
  }

  /** learner task completion — SERVER-side scoring (D6). Re-completion is
   *  allowed; the latest row wins. */
  async function completeTask(
    learnerId: string,
    assignmentId: string,
    resourceId: string,
    marksAwarded: number | null,
  ) {
    const a = await loadAssignment(assignmentId);
    await assertLearnerScope(learnerId, a);
    if (a.status === "CLOSED") throw new ConflictError(`assignment is closed: ${a.title}`);

    const tasks = await loadTasks(assignmentId);
    const task = tasks.find((t) => t.id === resourceId);
    if (!task) throw new PackNotFoundError(`unknown assignment resource: ${resourceId}`);

    let marks: number;
    let score: number;
    if (task.kind === "examQuestion") {
      const total = Math.max(1, task.marks_total ?? 1);
      marks = Math.min(total, Math.max(0, marksAwarded ?? 0));
      score = marks / total;
    } else {
      marks = 1; // the 1-mark completion task
      score = 1;
    }
    const completedAt = clock.now();

    await sql`
      insert into assignment_resource_states
        (id, assignment_id, learner_id, resource_id, status, marks_awarded, score, completed_at, updated_at)
      values (${clock.newId()}::uuid, ${assignmentId}::uuid, ${learnerId}::uuid, ${resourceId}, 'complete',
              ${marks}, ${score}, ${completedAt.toISOString()}, ${completedAt.toISOString()})
      on conflict (assignment_id, learner_id, resource_id)
      do update set status = 'complete', marks_awarded = ${marks}, score = ${score},
                    completed_at = ${completedAt.toISOString()}, updated_at = ${completedAt.toISOString()}
    `;

    const derivedRows = (await sql`
      select count(*) filter (where status = 'complete')::int as done,
             coalesce(sum(marks_awarded), 0)::int as score
      from assignment_resource_states
      WHERE assignment_id = ${assignmentId}::uuid and learner_id = ${learnerId}::uuid
    `) as unknown as { done: number; score: number }[];

    return {
      state: {
        resourceId,
        status: "complete" as const,
        marksAwarded: marks,
        score,
        completedAt: completedAt.toISOString(),
      },
      questionsCompleted: derivedRows[0]?.done ?? 0,
      score: derivedRows[0]?.score ?? 0,
    };
  }

  return {
    library,
    createPack,
    packDetailFor,
    learnerPack,
    completeTask,
    _internals: { resolveCourseLabel, resolveClassTarget, parseInstantStrict },
  };
}

// ── the routers ─────────────────────────────────────────────────────────────

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function bodyErrorResponse(c: Context, error: ZodError): Response {
  const first = error.issues[0];
  const message = first?.message ?? "request invalid";
  return c.json(apiError(400, "validation_failed", message), 400);
}

function packsOnError(err: unknown, c: Context): Response {
  if (err instanceof PackNotFoundError) return c.json(apiError(404, "not_found", err.message), 404);
  if (err instanceof PackForbiddenError) return c.json(apiError(403, "forbidden", err.message), 403);
  if (err instanceof BadRequestError) return c.json(apiError(400, "bad_request", err.message), 400);
  if (err instanceof ConflictError) return c.json(apiError(409, "conflict", err.message), 409);
  console.error("[assignment-packs] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/** Teacher router — mounted at "/api/v1/teacher/assignment-packs". */
export function createAssignmentPacksTeacherRouter(module: AssignmentPacksModule): Hono {
  const r = new Hono();
  r.onError((err, c) => packsOnError(err, c));
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /resources — the picker feed (course-scoped by the query param the
  // page owns; NO course filterer inside the picker itself).
  r.get("/resources", async (c) => {
    const sp = c.req.query("course") ?? "";
    if (!/^[a-z0-9-]+$/.test(sp)) {
      return c.json(apiError(400, "validation_failed", "course: must be the hub course slug"), 400);
    }
    return c.json(
      await module.library({
        courseSlug: sp,
        kind: c.req.query("kind") || null,
        topic: c.req.query("topic") || null,
        q: c.req.query("q") || null,
        limit: c.req.query("limit") ? Number(c.req.query("limit")) : null,
      }),
    );
  });

  // POST / — create (201).
  r.post("/", async (c) => {
    const auth = getAuth(c)!;
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = assignmentPackCreateRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.createPack(auth.userId, parsed.data), 201);
  });

  // GET /:id — the pack detail (teacher preview; owner-gated).
  r.get("/:id", async (c) => {
    const auth = getAuth(c)!;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await module.packDetailFor(auth.userId, id));
  });

  return r;
}

/** Learner router — mounted at "/api/v1/learners/me" (paths
 *  /assignment-packs/...). */
export function createAssignmentPacksLearnerRouter(module: AssignmentPacksModule): Hono {
  const r = new Hono();
  r.onError((err, c) => packsOnError(err, c));
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "STUDENT", "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  r.get("/assignment-packs/:assignmentId", async (c) => {
    const auth = getAuth(c)!;
    const id = c.req.param("assignmentId");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await module.learnerPack(auth.userId, id));
  });

  r.post("/assignment-packs/:assignmentId/tasks/:resourceId/complete", async (c) => {
    const auth = getAuth(c)!;
    const assignmentId = c.req.param("assignmentId");
    const resourceId = c.req.param("resourceId");
    if (!UUID_RE.test(assignmentId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = assignmentPackCompleteRequestSchema.safeParse(raw.value ?? {});
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(
      await module.completeTask(auth.userId, assignmentId, resourceId, parsed.data.marksAwarded ?? null),
    );
  });

  return r;
}

/** the router factory (the fleet seam shape — buildTeacherAssignmentsRouters
 *  parity): ZERO-KEY law untouched, the db url required at construction. */
export function buildAssignmentPacksRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const packsModule = buildAssignmentPacksModule(
    sql,
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
  );
  return {
    module: packsModule,
    teacherPacksRoute: createAssignmentPacksTeacherRouter(packsModule),
    learnerPacksRoute: createAssignmentPacksLearnerRouter(packsModule),
  };
}
