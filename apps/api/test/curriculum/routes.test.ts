/**
 * T-MIG-021 tranche-2 route tests — the observable HTTP contract of
 * CurriculumController (GET /api/v1/curriculum/*) and the teacher READ
 * surface (GET /api/v1/teacher/curriculum/*), over an IN-MEMORY Hono app
 * wiring the REAL curriculum services over stubbed sql (no Neon).
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (the contract-alignment pin tranche 1 deferred) AND compared to
 * the T-MIG-004 captured bodies. Error envelopes are pinned to the captured
 * shapes (Boot 401/403, ApiError 400/404) and the honest-501 discipline for
 * the out-of-title write surfaces. The F-1 empty queue on an unknown
 * version is pinned at the route layer too.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createLearnerCurriculumRouter,
  createTeacherCurriculumRouter,
} from "../../src/routes/curriculum";
import { buildCurriculumModule } from "../../src/services/curriculum";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  curriculumVersionsResponseSchema,
  curriculumSubjectsResponseSchema,
  curriculumSubjectResponseSchema,
  teacherCurriculumVersionsResponseSchema,
  teacherCurriculumNodesResponseSchema,
} from "@syllabai/contracts";
import {
  fakeSql,
  SEED_NODE_ROWS,
  SUBJECT_ROW,
  VERSION_ROW,
  CAPTURED_SUBJECT_VIEW,
  CAPTURED_VERSION_VIEW,
} from "./helpers";

const VERSION_ID = "10000000-0000-0000-0000-000000000001";
const UNKNOWN_SUBJECT = "00000000-0000-4000-8000-0000000000a1";
const UNKNOWN_VERSION = "00000000-0000-4000-8000-0000000000a2";

/** Stub routing every query the two routers' services can issue. */
function moduleSql() {
  return fakeSql([
    { match: /from curriculum_versions where status = \? order by created_at desc$/i, rows: [VERSION_ROW] },
    { match: /from curriculum_versions order by created_at desc$/i, rows: [VERSION_ROW] },
    {
      // param-aware: an unknown version has NO subjects (F-1 empty-queue path)
      match: /where s\.curriculum_version_id = \? order by s\.code$/i,
      rows: [],
      rowsFor: (p) => (p[0] === VERSION_ID ? [SUBJECT_ROW] : []),
    },
    { match: /join curriculum_versions v on v\.id = s\.curriculum_version_id order by s\.code$/i, rows: [SUBJECT_ROW] },
    {
      // param-aware: only the seeded subject id resolves (404 path for others)
      match: /where s\.id = \?$/i,
      rows: [],
      rowsFor: (p) => (p[0] === SUBJECT_ROW.id ? [SUBJECT_ROW] : []),
    },
    { match: /group by n\.validation_status$/i, rows: [
        { validation_status: "VALIDATED", count: 1 },
        { validation_status: "UNVALIDATED", count: 10 },
      ] },
    { match: /select id from subtree \) and n\.validation_status = \?$/i, rows: [] },
    { match: /select id from subtree \)$/i, rows: SEED_NODE_ROWS },
  ]);
}

/** App assembly mirroring apps/api/src/index.ts (auth injection + real error boundary). */
function makeApp(auth: (c: Context) => Record<string, unknown> | null) {
  const sql = moduleSql();
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const module = buildCurriculumModule(sql);
  app.route("/api/v1/curriculum", createLearnerCurriculumRouter(module));
  app.route("/api/v1/teacher/curriculum", createTeacherCurriculumRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return app;
}

const STUDENT = {
  email: "student@example.edu",
  userId: "00000000-0000-4000-8000-0000000000c1",
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const TEACHER = { ...STUDENT, roles: ["TEACHER"] };
const asStudent = () => STUDENT;
const asTeacher = () => TEACHER;
const anon = () => null;

// ── learner surface: CurriculumController ───────────────────────────────────

describe("GET /api/v1/curriculum/versions — CurriculumController.versions (:39-46)", () => {
  test("student: 200, canonical-schema-valid, captured body (default excludes archived)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/curriculum/versions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(curriculumVersionsResponseSchema.parse(body)).toEqual([CAPTURED_VERSION_VIEW]);
  });

  test("includeArchived=true takes the unfiltered path (no status gate in the SQL)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/curriculum/versions?includeArchived=true");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(curriculumVersionsResponseSchema.parse(body)).toHaveLength(1);
  });

  test("unauthenticated: Boot 401 body with the request path (captured envelope)", async () => {
    const res = await makeApp(anon).request("/api/v1/curriculum/versions");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/curriculum/versions");
    expect(typeof body.timestamp).toBe("string");
  });
});

describe("GET /api/v1/curriculum/subjects — CurriculumController.subjects/subject (:48-61)", () => {
  test("student: 200 list, canonical-schema-valid, captured body (code-ordered, nested version)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/curriculum/subjects");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(curriculumSubjectsResponseSchema.parse(body)).toEqual([CAPTURED_SUBJECT_VIEW]);
  });

  test("versionId filter binds through the contract schema (uuid-typed, optional)", async () => {
    const res = await makeApp(asStudent).request(
      `/api/v1/curriculum/subjects?versionId=${VERSION_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(curriculumSubjectsResponseSchema.parse(body)).toEqual([CAPTURED_SUBJECT_VIEW]);
  });

  test("by-id: 200 canonical SubjectView (captured body)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/curriculum/subjects/${SUBJECT_ROW.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(curriculumSubjectResponseSchema.parse(body)).toEqual(CAPTURED_SUBJECT_VIEW);
  });

  test("bad uuid in path → 400 bad_request 'malformed request' (conversion precedes handlers)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/curriculum/subjects/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown uuid → 404 not_found 'subject <uuid> not found' (captured envelope)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/curriculum/subjects/${UNKNOWN_SUBJECT}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`subject ${UNKNOWN_SUBJECT} not found`);
  });
});

// ── teacher surface: TeacherCurriculumController READ methods ───────────────

describe("GET /api/v1/teacher/curriculum/versions — review.versions (:76-78)", () => {
  test("teacher: 200 canonical CurriculumOverview[], captured counts 1/0/10", async () => {
    const res = await makeApp(asTeacher).request("/api/v1/teacher/curriculum/versions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(teacherCurriculumVersionsResponseSchema.parse(body)).toEqual([
      {
        ...CAPTURED_VERSION_VIEW,
        validatedNodes: 1,
        suggestedNodes: 0,
        unvalidatedNodes: 10,
      },
    ]);
  });

  test("unauthenticated → Boot 401; student → Boot 403 Forbidden (route-rule parity)", async () => {
    const anonRes = await makeApp(anon).request("/api/v1/teacher/curriculum/versions");
    expect(anonRes.status).toBe(401);
    const anonBody = await anonRes.json();
    expect(anonBody.error).toBe("Unauthorized");
    expect(anonBody.path).toBe("/api/v1/teacher/curriculum/versions");

    const studentRes = await makeApp(asStudent).request("/api/v1/teacher/curriculum/versions");
    expect(studentRes.status).toBe(403);
    const studentBody = await studentRes.json();
    expect(studentBody.error).toBe("Forbidden");
    expect(studentBody.path).toBe("/api/v1/teacher/curriculum/versions");
  });
});

describe("GET /api/v1/teacher/curriculum/versions/:id/nodes — review.nodes (:80-86)", () => {
  test("teacher: 200 canonical NodeView[], captured sorted body (root parentId null)", async () => {
    const res = await makeApp(asTeacher).request(`/api/v1/teacher/curriculum/versions/${VERSION_ID}/nodes`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = teacherCurriculumNodesResponseSchema.parse(body);
    expect(parsed.map((n) => n.code)).toEqual(["CHM", "WCH11"]); // final in-memory sort by code
    expect(parsed[0]!.parentId).toBeNull();
    expect(parsed[1]!.parentId).toBe("20000000-0000-0000-0000-000000000001"); // PART_OF parent
  });

  test("unknown version → 200 [] with NO existence check (F-1, captured as-is)", async () => {
    const res = await makeApp(asTeacher).request(
      `/api/v1/teacher/curriculum/versions/${UNKNOWN_VERSION}/nodes`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("status=SUGGESTED → 200 [] on the seed (captured queue-empty state)", async () => {
    const res = await makeApp(asTeacher).request(
      `/api/v1/teacher/curriculum/versions/${VERSION_ID}/nodes?status=SUGGESTED`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("status=suggested (wrong case) → 400 malformed (valueOf case-sensitivity parity)", async () => {
    const res = await makeApp(asTeacher).request(
      `/api/v1/teacher/curriculum/versions/${VERSION_ID}/nodes?status=suggested`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });
});

// ── honest 501s: write surfaces outside T-MIG-021's READ title ──────────────

describe("teacher WRITE surfaces answer honest 501s (T-MIG-020 ratified convention)", () => {
  for (const path of [
    "/drafts",
    `/nodes/${SUBJECT_ROW.id}/validate`,
    `/nodes/${SUBJECT_ROW.id}/reject`,
    `/versions/${VERSION_ID}/validate`,
    `/versions/${VERSION_ID}/archive`,
  ]) {
    test(`POST ${path.replace(SUBJECT_ROW.id, ":id").replace(VERSION_ID, ":id")} → 501 not_implemented`, async () => {
      const res = await makeApp(asTeacher).request(`/api/v1/teacher/curriculum${path}`, { method: "POST" });
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.status).toBe(501);
      expect(body.error).toBe("not_implemented");
      expect(body.message).toContain("not yet ported");
    });
  }
});
