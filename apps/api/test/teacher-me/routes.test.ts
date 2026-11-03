/**
 * T-TIER1 run-002 route tests — the observable HTTP contract of the
 * teacher-me router (routes/teacherme.ts) over an IN-MEMORY Hono app wiring
 * the REAL teacher-me module over stubbed sql (no Neon).
 *
 * Pinned: the authz shell (the Boot 401 before any handler work; the Boot
 * 403 for an authenticated student — the classroom.ts role law), the honest
 * empty reads ({ tests: [] } / { coverage: [] } / { reviews: [] }), the
 * full-set replace (write → replace → clear), the per-course coverage
 * upsert + empty-clear, the kebab slug law (400 bad_request verbatim), the
 * two-envelope body law (malformed_body vs validation_failed), the
 * one-verdict-per-resource dedupe, and the caps (30 saves / 200 reviews).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherMeRouter } from "../../src/routes/teacherme";
import { buildTeacherMeModule } from "../../src/services/teacher-me";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";

const TEACHER = {
  email: "teacher@example.edu",
  userId: "b2000000-0000-4000-8000-000000000001",
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const ADMIN = { ...TEACHER, email: "admin@example.edu", roles: ["ADMIN"] };
const STUDENT = { ...TEACHER, email: "student@example.edu", roles: ["STUDENT"] };
const anon = () => null;
const asTeacher = () => TEACHER;
const asStudent = () => STUDENT;

function makeApp(auth: (c: Context) => Record<string, unknown> | null, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const module = buildTeacherMeModule(fakeSql(routes) as unknown as Parameters<typeof buildTeacherMeModule>[0], {
    newId: () => "c0000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-11-04T00:00:00.000Z"),
  });
  app.route("/api/v1/teachers/me", createTeacherMeRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-11-04T00:00:00Z" },
      500 as const,
    );
  });
  return app;
}

const UUID = "b2000000-0000-4000-8000-000000000001";

const VALID_TEST = {
  id: "t_abc123",
  name: "Atoms — end of topic",
  courseSlug: "igcse-chemistry-19",
  courseCode: "4CH1",
  subtopics: ["4CH1-S1-b", "4CH1-S1-c"],
  targetMarks: 40,
  maxQuestions: 12,
  questionIds: ["sme-eq-4CH1-S1-b-q1"],
  createdAt: "2026-11-03T10:00:00.000Z",
};

const VALID_REVIEW = {
  resourceId: "igcse-chemistry-19:question:4CH1-S1-b:q3",
  courseSlug: "igcse-chemistry-19",
  courseCode: "4CH1",
  kind: "solution",
  verdict: "approved",
  comment: "Matches the mark scheme.",
  reviewer: "Ms Hughes",
  createdAt: "2026-11-03T11:00:00.000Z",
};

// ── the authz shell ──────────────────────────────────────────────────────────

describe("authz shell (the classroom.ts law)", () => {
  test("anonymous GET /saved-tests → the Boot 401 before any handler work", async () => {
    const res = await makeApp(anon, []).request("/api/v1/teachers/me/saved-tests");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("anonymous PUT /content-reviews → 401", async () => {
    const res = await makeApp(anon, []).request("/api/v1/teachers/me/content-reviews", {
      method: "PUT",
      body: JSON.stringify({ reviews: [] }),
    });
    expect(res.status).toBe(401);
  });

  test("authenticated STUDENT → the Boot 403 (TEACHER/ADMIN role law)", async () => {
    const res = await makeApp(asStudent, []).request("/api/v1/teachers/me/saved-tests");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  test("authenticated STUDENT PUT /teaching-coverage/x → 403 before any handler work", async () => {
    const res = await makeApp(asStudent, []).request("/api/v1/teachers/me/teaching-coverage/igcse-chemistry-19", {
      method: "PUT",
      body: JSON.stringify({ codes: [] }),
    });
    expect(res.status).toBe(403);
  });

  test("TEACHER and ADMIN pass the shell (the honest empty behind it)", async () => {
    const routes: Route[] = [
      { match: /select course_slug, codes/, rows: [] },
    ];
    for (const auth of [asTeacher, () => ADMIN]) {
      const res = await makeApp(auth, routes).request("/api/v1/teachers/me/teaching-coverage");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ coverage: [] });
    }
  });
});

// ── saved tests ──────────────────────────────────────────────────────────────

describe("GET /saved-tests", () => {
  test("the honest empty", async () => {
    const routes: Route[] = [{ match: /from teacher_saved_tests/, rows: [] }];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/saved-tests");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tests: [] });
  });

  test("newest-first rows map to the wire (client id round-trips verbatim)", async () => {
    const routes: Route[] = [
      {
        match: /from teacher_saved_tests/,
        rows: [
          {
            client_id: "t_abc123",
            name: "Atoms — end of topic",
            course_slug: "igcse-chemistry-19",
            course_code: "4CH1",
            subtopics: ["4CH1-S1-b"],
            target_marks: 40,
            max_questions: null,
            question_ids: ["sme-eq-4CH1-S1-b-q1"],
            created_at: "2026-11-03T10:00:00.000Z",
            rn: 1,
          },
          {
            client_id: "t_older",
            name: "Legacy",
            course_slug: "igcse-physics-19",
            course_code: "4PH1",
            subtopics: [],
            target_marks: null,
            max_questions: null,
            question_ids: null,
            created_at: "2026-11-01T10:00:00.000Z",
            rn: 2,
          },
        ],
      },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/saved-tests");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tests).toHaveLength(2);
    expect(body.tests[0].id).toBe("t_abc123");
    expect(body.tests[0].targetMarks).toBe(40);
    expect(body.tests[0].questionIds).toEqual(["sme-eq-4CH1-S1-b-q1"]);
    // null targetMarks/maxQuestions/questionIds stay ABSENT on the wire
    expect(body.tests[1]).not.toHaveProperty("targetMarks");
    expect(body.tests[1]).not.toHaveProperty("questionIds");
  });

  test("the rn cap holds at 30 (the hub's own bound)", async () => {
    const rows = Array.from({ length: 32 }, (_, i) => ({
      client_id: `t_${i}`,
      name: `T${i}`,
      course_slug: "igcse-chemistry-19",
      course_code: "4CH1",
      subtopics: [],
      target_marks: null,
      max_questions: null,
      question_ids: null,
      created_at: `2026-11-03T00:00:${String(i).padStart(2, "0")}.000Z`,
      rn: i + 1,
    }));
    const routes: Route[] = [{ match: /from teacher_saved_tests/, rows }];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/saved-tests");
    const body = await res.json();
    expect(body.tests).toHaveLength(30);
  });
});

describe("PUT /saved-tests", () => {
  test("a valid full-set PUT replaces and echoes the view", async () => {
    const routes: Route[] = [
      { match: /delete from teacher_saved_tests/, rows: [] },
      { match: /insert into teacher_saved_tests/, rows: [] },
      {
        match: /from teacher_saved_tests/,
        rows: [],
        rowsFor: () => [
          {
            client_id: "t_abc123",
            name: "Atoms — end of topic",
            course_slug: "igcse-chemistry-19",
            course_code: "4CH1",
            subtopics: ["4CH1-S1-b", "4CH1-S1-c"],
            target_marks: 40,
            max_questions: 12,
            question_ids: ["sme-eq-4CH1-S1-b-q1"],
            created_at: "2026-11-03T10:00:00.000Z",
            rn: 1,
          },
        ],
      },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: [VALID_TEST] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tests).toHaveLength(1);
    expect(body.tests[0].id).toBe("t_abc123");
  });

  test("an empty array clears the library (the honest clear)", async () => {
    const routes: Route[] = [
      { match: /delete from teacher_saved_tests/, rows: [] },
      { match: /from teacher_saved_tests/, rows: [] },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: [] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tests: [] });
  });

  test("a non-kebab courseSlug → 400 validation_failed (the schema law; the service law stays defense-in-depth)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: [{ ...VALID_TEST, courseSlug: "Igcse Chemistry" }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain('must match "^[a-z0-9]+(-[a-z0-9]+)*$"');
  });

  test("binding failures → 400 malformed_body (the two-envelope R-1 law)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });

  test("an absent required field → 400 validation_failed (the jakarta default)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: [{ ...VALID_TEST, name: undefined }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("must not be null");
  });

  test("an oversized name → 400 validation_failed with the size message", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({ tests: [{ ...VALID_TEST, name: "x".repeat(201) }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("must be less than or equal to 200");
  });

  test("a 31-test PUT → 400 validation_failed (the cap is schema law)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/saved-tests", {
      method: "PUT",
      body: JSON.stringify({
        tests: Array.from({ length: 31 }, (_, i) => ({ ...VALID_TEST, id: `t_${i}` })),
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });
});

// ── teaching coverage ────────────────────────────────────────────────────────

describe("teaching-coverage", () => {
  test("GET → the honest empty", async () => {
    const routes: Route[] = [{ match: /from teacher_teaching_coverage/, rows: [] }];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/teaching-coverage");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ coverage: [] });
  });

  test("GET rows map course-slug-ordered entries", async () => {
    const routes: Route[] = [
      {
        match: /from teacher_teaching_coverage/,
        rows: [
          { course_slug: "igcse-biology-19", codes: ["4BI1-S1-a"] },
          { course_slug: "igcse-chemistry-19", codes: ["4CH1-S1-b", "4CH1-S1-c"] },
        ],
      },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/teaching-coverage");
    const body = await res.json();
    expect(body.coverage).toEqual([
      { courseSlug: "igcse-biology-19", codes: ["4BI1-S1-a"] },
      { courseSlug: "igcse-chemistry-19", codes: ["4CH1-S1-b", "4CH1-S1-c"] },
    ]);
  });

  test("PUT /{slug} upserts the course and echoes the view", async () => {
    const routes: Route[] = [
      { match: /insert into teacher_teaching_coverage/, rows: [] },
      { match: /from teacher_teaching_coverage/, rows: [] },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/teaching-coverage/igcse-chemistry-19", {
      method: "PUT",
      body: JSON.stringify({ codes: ["4CH1-S1-b"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ coverage: [] });
  });

  test("PUT with an empty array deletes the row (the honest clear)", async () => {
    const routes: Route[] = [
      { match: /delete from teacher_teaching_coverage/, rows: [] },
      { match: /from teacher_teaching_coverage/, rows: [] },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/teaching-coverage/igcse-chemistry-19", {
      method: "PUT",
      body: JSON.stringify({ codes: [] }),
    });
    expect(res.status).toBe(200);
  });

  test("PUT /not-a-slug/ → 400 bad_request (the path slug law)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/teaching-coverage/Not_A_Slug", {
      method: "PUT",
      body: JSON.stringify({ codes: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("course slug must be a kebab-case registry key");
  });

  test("PUT with a non-array codes body → 400 malformed_body", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/teaching-coverage/igcse-chemistry-19", {
      method: "PUT",
      body: JSON.stringify({ codes: "4CH1-S1-b" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });
});

// ── content reviews ──────────────────────────────────────────────────────────

describe("content-reviews", () => {
  test("GET → the honest empty", async () => {
    const routes: Route[] = [{ match: /from teacher_content_reviews/, rows: [] }];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/content-reviews");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [] });
  });

  test("PUT replaces and the posted dupes keep the first (one verdict per resource)", async () => {
    const routes: Route[] = [
      { match: /delete from teacher_content_reviews/, rows: [] },
      { match: /insert into teacher_content_reviews/, rows: [] },
      {
        match: /from teacher_content_reviews/,
        rows: [
          {
            resource_id: "igcse-chemistry-19:question:4CH1-S1-b:q3",
            course_slug: "igcse-chemistry-19",
            course_code: "4CH1",
            kind: "solution",
            verdict: "approved",
            comment: "Matches the mark scheme.",
            reviewer: "Ms Hughes",
            created_at: "2026-11-03T11:00:00.000Z",
            rn: 1,
          },
        ],
      },
    ];
    const res = await makeApp(asTeacher, routes).request("/api/v1/teachers/me/content-reviews", {
      method: "PUT",
      body: JSON.stringify({
        reviews: [VALID_REVIEW, { ...VALID_REVIEW, verdict: "rejected", comment: "superseded" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].verdict).toBe("approved");
  });

  test("an unknown verdict → 400 validation_failed (the closed vocab)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/content-reviews", {
      method: "PUT",
      body: JSON.stringify({ reviews: [{ ...VALID_REVIEW, verdict: "maybe" }] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  test("a non-kebab courseSlug → 400 validation_failed (the schema law)", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/content-reviews", {
      method: "PUT",
      body: JSON.stringify({ reviews: [{ ...VALID_REVIEW, courseSlug: "4CH1" }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  test("an unreadable body → 400 malformed_body", async () => {
    const res = await makeApp(asTeacher, []).request("/api/v1/teachers/me/content-reviews", {
      method: "PUT",
      body: "not json at all",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });
});
