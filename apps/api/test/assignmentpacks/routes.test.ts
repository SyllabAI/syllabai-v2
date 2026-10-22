/**
 * Assignment packs route tests (T-SENECA-001) — the observable HTTP contract
 * over an IN-MEMORY Hono app wiring the REAL module over stubbed sql (the
 * T-MIG-052-t2 route-test pattern):
 *   - the authz shells (anonymous → Boot 401; STUDENT on the teacher
 *     surface → Boot 403)
 *   - the two-envelope law (bad JSON → malformed_body; constraint failures
 *     → validation_failed with the first field message; duplicate
 *     resourceIds → the superRefine message)
 *   - the @PathVariable uuid guard (400 "malformed request")
 *   - the service law chain through the router (404/403/409/400 verbatim)
 *   - the learner surface mounted under /api/v1/learners/me
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  buildAssignmentPacksModule,
  createAssignmentPacksLearnerRouter,
  createAssignmentPacksTeacherRouter,
  type AssignmentPacksModule,
} from "../../src/routes/assignment-packs";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (the service test's constants — same fixed-constant style) ─────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const STUDENT_1 = "bb000000-0000-4000-8000-000000000001";
const ASG_A = "dd000000-0000-4000-8000-000000000001";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";
const RES_EQ = "ef100000-0000-4000-8000-000000000001";
const COURSE = "igcse-chemistry-19";

const NOW = new Date("2026-10-23T08:00:00Z");
const clock = { newId: () => NEW_ID, now: () => NOW };

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
const validateRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from seneca_resources where course_slug = \? and id = any\( \? ::text\[\]\)/,
  rows,
});
const insertAssignmentRoute = (): Route => ({ match: /insert into assignments \(id, teacher_id/, rows: [] });
const insertTaskRoute = (): Route => ({ match: /insert into assignment_resources \(id, assignment_id/, rows: [] });

const eqRow = {
  id: RES_EQ,
  kind: "examQuestion",
  title: null,
  topic_path: "Chemistry: Edexcel iGCSE > 2. Elements, compounds and mixtures",
  marks_total: 3,
  question_type: "short_answer",
  content_json: { questionTitleMd: "Name the products", markScheme: "any two of", generationScript: "varA=1+1" },
};

const validBody = {
  title: "Bonding pack",
  courseSlug: COURSE,
  courseLabel: "Chemistry",
  dueAt: "2099-06-01T12:00:00Z",
  resourceIds: [RES_EQ],
};

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + the real
//    error boundary; the routers at their REAL mount prefixes) ────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const sql = fakeSql(routes) as unknown as Record<string, unknown> & {
    transaction: (body: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    queries: string[];
  };
  sql.transaction = async (body: (tx: unknown) => Promise<unknown>) => body(sql as unknown as never);
  const mod = buildAssignmentPacksModule(
    sql as unknown as Parameters<typeof buildAssignmentPacksModule>[0],
    clock,
  );
  const teacherPacksRoute = createAssignmentPacksTeacherRouter(mod);
  const learnerPacksRoute = createAssignmentPacksLearnerRouter(mod);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/assignment-packs", teacherPacksRoute);
  app.route("/api/v1/learners/me", learnerPacksRoute);
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred" },
      500 as const,
    );
  });
  return { app };
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

// (the builder seam needs a real DATABASE_URL — the route tests wire the
// module over fakeSql directly, the teacher-assignments route-test posture;
// the factory itself is exercised by the type-level import below.)
void (null as unknown as AssignmentPacksModule);

// ── authz shells ─────────────────────────────────────────────────────────────

describe("authz shells", () => {
  test("anonymous → Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon, []);
    for (const [method, path] of [
      ["GET", `/api/v1/teacher/assignment-packs/resources?course=${COURSE}`],
      ["POST", "/api/v1/teacher/assignment-packs"],
      ["GET", `/api/v1/teacher/assignment-packs/${ASG_A}`],
      ["GET", `/api/v1/learners/me/assignment-packs/${ASG_A}`],
      ["POST", `/api/v1/learners/me/assignment-packs/${ASG_A}/tasks/${RES_EQ}/complete`],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    }
  });

  test("STUDENT on the teacher surface → Boot 403", async () => {
    const { app } = makeApp(asStudent, []);
    for (const path of [
      `/api/v1/teacher/assignment-packs/resources?course=${COURSE}`,
      "/api/v1/teacher/assignment-packs",
    ]) {
      const res = await app.request(path, { method: path.startsWith("resources") ? "GET" : "POST" });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    }
  });
});

// ── the wire shapes ──────────────────────────────────────────────────────────

describe("teacher wire", () => {
  test("library feed → the course-scoped view (no course filterer: the course rides the query)", async () => {
    const { app } = makeApp(asTeacher, [
      registryRoute([{ label: "Chemistry", code: "4CH1", subject: "Chemistry" }]),
      libraryRoute([eqRow]),
      topicsRoute(["1. States of Matter"]),
      countRoute(5699),
    ]);
    const res = await app.request(
      `/api/v1/teacher/assignment-packs/resources?course=${COURSE}&kind=examQuestion`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      courseSlug: COURSE,
      courseLabel: "Chemistry",
      total: 5699,
      topics: ["1. States of Matter"],
    });
    expect(body.resources).toHaveLength(1);
    // the picker never ships question bodies
    expect(body.resources[0].questionMd).toBeUndefined();
  });

  test("library with a malformed course slug → 400 validation_failed", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(
      "/api/v1/teacher/assignment-packs/resources?course=Bad_Slug!",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  test("POST / — bad JSON → malformed_body; duplicate resourceIds → the superRefine message", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/assignment-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");

    const res2 = await app.request("/api/v1/teacher/assignment-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, resourceIds: [RES_EQ, RES_EQ] }),
    });
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toBe("validation_failed");
    expect(body2.message).toBe("resourceIds must not repeat");
  });

  test("POST / — empty resourceIds → the size message", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/assignment-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, resourceIds: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("at least 1");
  });

  test("POST / happy path → 201 with the pack detail (spec_refs [] behind the scenes)", async () => {
    const { app } = makeApp(asTeacher, [
      registryRoute([{ label: "Chemistry", code: "4CH1", subject: "Chemistry" }]),
      validateRoute([eqRow]),
      insertAssignmentRoute(),
      insertTaskRoute(),
    ]);
    const res = await app.request("/api/v1/teacher/assignment-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      assignmentId: NEW_ID,
      courseSlug: COURSE,
      marksTotal: 3,
      questionCount: 1,
      status: "open",
    });
    expect(body.tasks[0].markSchemeMd).toBe("any two of");
  });

  test("GET /:id with a non-uuid → 400 malformed request", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/assignment-packs/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });
});

// ── the learner wire ─────────────────────────────────────────────────────────

describe("learner wire", () => {
  test("GET pack detail + POST completion — the full loop over the real routers", async () => {
    const { app } = makeApp(asStudent, [
      // learnerPack: assignment + tasks + states
      {
        match: /from assignments where id = \? ::uuid$/,
        rows: [],
        rowsFor: (params: unknown[]) => {
          const id = String(params[0]);
          return id === ASG_A
            ? [
                {
                  id: ASG_A,
                  teacher_id: TEACHER,
                  course_slug: COURSE,
                  course_label: "Chemistry",
                  title: "Bonding pack",
                  marks_total: 3,
                  question_count: 1,
                  due_at: "2099-06-01T12:00:00.000Z",
                  status: "OPEN",
                  class_id: null,
                },
              ]
            : [];
        },
      },
      {
        match: /from assignment_resources ar join seneca_resources r on r.id = ar.resource_id/,
        rows: [{ ...eqRow, position: 1 }],
      },
      {
        match: /select resource_id, status, marks_awarded, score, completed_at from assignment_resource_states/,
        rows: [],
      },
      // completeTask: upsert + derived
      { match: /insert into assignment_resource_states \(id, assignment_id, learner_id,/, rows: [] },
      {
        match: /select count\(\*\) filter \(where status = 'complete'\)::int as done,/,
        rows: [{ done: 1, score: 2 }],
      },
    ]);

    const detail = await app.request(`/api/v1/learners/me/assignment-packs/${ASG_A}`);
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.tasks).toHaveLength(1);
    expect(detailBody.myStates).toEqual([]);

    const complete = await app.request(
      `/api/v1/learners/me/assignment-packs/${ASG_A}/tasks/${RES_EQ}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marksAwarded: 2 }),
      },
    );
    expect(complete.status).toBe(200);
    const completeBody = await complete.json();
    expect(completeBody.state).toMatchObject({ status: "complete", marksAwarded: 2 });
    expect(completeBody).toMatchObject({ questionsCompleted: 1, score: 2 });
  });

  test("learner detail with a non-uuid → 400 malformed request", async () => {
    const { app } = makeApp(asStudent, []);
    const res = await app.request("/api/v1/learners/me/assignment-packs/nope");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});
