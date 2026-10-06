/**
 * T-MIG-043 tranche-2 route tests — the observable HTTP contract of the
 * learner-me router (routes/learnerme.ts) over an IN-MEMORY Hono app wiring
 * the REAL learner-me module (tranche-1 surfaces + the tranche-2 NBA engine
 * as the default actions provider) over stubbed sql (no Neon).
 *
 * Pinned: the authz shell (the Boot 401 before any handler work — the
 * captured w4 shells), the Boot exception law verbatim (404 not_found with
 * the verbatim message, 403, 409, 400 bad_request "malformed request" on
 * uuid mismatch, 400 validation_failed with the jakarta defaults the w4
 * captures pin — the w4-flashcard-rating-bad-cardid-400 /
 * w4-flashcard-rating-dotted-anchor-400 / w4-flashcard-rating-bad-rating-400
 * bodies reproduced EXACTLY), the two-envelope R-1 law (binding vs
 * constraint), 201-on-write / 204-on-clear, the recommendations
 * missing-param law (the session-56 finding), the target-series slug law,
 * and the honest-501 posture (the no-provider safety net, still mapped).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLearnerMeRouter } from "../../src/routes/learnerme";
import { buildLearnerMeModule, LearnerMeNotImplementedError } from "../../src/services/learner-me";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";
import {
  AGENDA_ROUTES,
  ANCHOR_ROUTES,
  ASSIGNMENT_A,
  CLOCK,
  LEARNER,
  NODE_T1,
  NODE_T2,
  SERIES_A,
  SUBJECT,
  misRow,
  nbaRoutes,
  reviewRow,
  skillRow,
} from "./nba-helpers";

const UNKNOWN_ROOT = "20000000-0000-4000-8000-0000000000e1";

const STUDENT = {
  email: "student@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent = () => STUDENT;
const anon = () => null;

/** App assembly mirroring apps/api/src/index.ts (auth injection + error boundary). */
function makeApp(auth: (c: Context) => Record<string, unknown> | null, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const module = buildLearnerMeModule(fakeSql(routes) as unknown as Parameters<typeof buildLearnerMeModule>[0], CLOCK);
  app.route("/api/v1/learners/me", createLearnerMeRouter(module));
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

const routesWith = (over: Parameters<typeof nbaRoutes>[0]): Route[] => [
  ...nbaRoutes(over),
  ...AGENDA_ROUTES,
  ...ANCHOR_ROUTES,
];

// ── the authz shell ──────────────────────────────────────────────────────────

describe("authz shell (SecurityConfig.java:91 parity)", () => {
  test("anonymous agenda → the Boot 401 before any handler work", async () => {
    const res = await makeApp(anon, routesWith({})).request("/api/v1/learners/me/agenda");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized"); // the Boot error-attributes shape
  });

  test("anonymous POST /flashcard-ratings → 401 (w4-flashcard-rating-post-unauthed-401 shell)", async () => {
    const res = await makeApp(anon, routesWith({})).request("/api/v1/learners/me/flashcard-ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "fl_x", rating: "know", subtopicCode: "4CH1-S1" }),
    });
    expect(res.status).toBe(401);
  });
});

// ── GET /agenda ──────────────────────────────────────────────────────────────

describe("GET /api/v1/learners/me/agenda — LearnerAgendaController (:97-154)", () => {
  test("composed agenda with the LIVE NBA actions block (the tranche-2 flip)", async () => {
    const res = await makeApp(
      asStudent,
      routesWith({
        reviews: [reviewRow({ node_id: NODE_T2, due_at: "2026-10-02T10:00:00Z" })],
        skills: [skillRow({ node_id: NODE_T1, mastery: 0.2, attempts: 5 })],
      }),
    ).request(`/api/v1/learners/me/agenda?rootId=${SUBJECT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learnerId).toBe(LEARNER);
    expect(body.actions).not.toBeNull();
    expect(body.actions.policy).toBe("nba-rules/v1.3");
    expect(body.actions.actions[0]!.reasonCode).toBe("DUE_REVIEW");
    expect(body.actions.actions[1]!.reasonCode).toBe("LOW_MASTERY");
  });

  test("no rootId ⇒ actions null (the caller decides; never fabricated)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/agenda");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toBeNull();
  });

  test("malformed rootId uuid → 400 bad_request 'malformed request' (MethodArgumentTypeMismatch)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/agenda?rootId=not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown root → 404 not_found with the engine's verbatim message", async () => {
    const res = await makeApp(asStudent, routesWith({})).request(`/api/v1/learners/me/agenda?rootId=${UNKNOWN_ROOT}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`knowledge node ${UNKNOWN_ROOT} not found`);
  });
});

// ── GET /recommendations ─────────────────────────────────────────────────────

describe("GET /api/v1/learners/me/recommendations — LearnerRecommendationController (:46-56)", () => {
  test("the engine's ranked advice ONLY (none of the agenda composition)", async () => {
    const res = await makeApp(asStudent, routesWith({ misconceptions: [misRow({ probability: 0.9 })] })).request(
      `/api/v1/learners/me/recommendations?rootId=${SUBJECT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy).toBe("nba-rules/v1.3");
    expect(body.learnerId).toBe(LEARNER);
    expect(body.rootId).toBe(SUBJECT);
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]!.actionType).toBe("ASK_TUTOR");
  });

  test("missing rootId → 400 validation_failed 'missing required parameter: rootId' (session-56)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/recommendations");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });
});

// ── POST /flashcard-ratings ─────────────────────────────────────────────────

describe("POST /api/v1/learners/me/flashcard-ratings — FlashcardRatingController (:84-115)", () => {
  const GOOD = { cardId: "fl_w4_cap_001", rating: "know", subtopicCode: "4CH1-S1" };
  const post = (body: unknown) =>
    makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/flashcard-ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("201 created (the append-only rating row)", async () => {
    const res = await post(GOOD);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rating).toBe("know");
  });

  test("bad pattern → 400 validation_failed, EXACT captured message (w4-flashcard-rating-bad-cardid-400)", async () => {
    const res = await post({ ...GOOD, cardId: "fl bad id!" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("cardId: card id must be the hub content id");
  });

  test("dotted anchor → 400 validation_failed, EXACT captured message (w4-flashcard-rating-dotted-anchor-400)", async () => {
    const res = await post({ ...GOOD, subtopicCode: "4CH1-S1.1" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe('subtopicCode: must match "^[A-Za-z0-9-]+$"');
  });

  test("unknown rating vocabulary → 400 bad_request, EXACT captured message (w4-flashcard-rating-bad-rating-400)", async () => {
    const res = await post({ ...GOOD, rating: "maybe" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe('rating must be "still-learning" or "know": maybe');
  });

  test("unknown anchor → 404 not_found with the verbatim frozen message", async () => {
    const res = await post({ ...GOOD, subtopicCode: "NOPE" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("unknown subtopic anchor: NOPE");
  });

  // ── T-MIG-080 F3 salvage: the jakarta declaration-order constraint block ───
  // r1's closed-#76 service-level pins (:83/:93/:108/:123), re-scoped to the
  // layer main implements them at: the zod safeParse + RATING_DEFAULTS
  // classifier here IS the @Valid layer (FlashcardRatingController :87) —
  // binding before @Valid, constraints before the controller body's enum
  // parse. The two pattern laws are already pinned above (:191/:199); these
  // are the MISSING laws of the register item, 1:1.

  test("blank cardId fails first with the jakarta default (:87 @NotBlank)", async () => {
    const res = await post({ ...GOOD, cardId: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("cardId: must not be blank");
  });

  test("cardId size law (declaration order)", async () => {
    const res = await post({ ...GOOD, cardId: "ab" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("cardId: size must be between 3 and 64");
  });

  test("subtopicCode size law (declaration order)", async () => {
    const res = await post({ ...GOOD, subtopicCode: "W" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("subtopicCode: size must be between 2 and 64");
  });

  test("constraint failure on cardId beats the unknown-rating parse (:87 @Valid first)", async () => {
    // the SAME "maybe" rating that independently 400s bad_request when the
    // cardId is good (pinned above) never reaches the service here — the
    // route-level constraint fires first: the two-envelope law in one body.
    const res = await post({ ...GOOD, cardId: "ab", rating: "maybe" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("cardId: size must be between 3 and 64");
  });
});

// ── GET /flashcard-rating-trail (the limit laws) ────────────────────────────

describe("GET /api/v1/learners/me/flashcard-rating-trail", () => {
  test("empty trail → 200 with the honest empty page", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/flashcard-rating-trail");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  test("limit=0 → 400 bad_request with the frozen verbatim message (service law)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/flashcard-rating-trail?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("limit must be >= 1: 0");
  });

  test("non-integer limit → 400 bad_request 'malformed request' (binding, not validation)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request(
      "/api/v1/learners/me/flashcard-rating-trail?limit=abc",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });
});

// ── exam-series + target-series ─────────────────────────────────────────────

describe("GET /exam-series + PUT/DELETE /courses/{slug}/target-series — LearnerExamSeriesController", () => {
  const SERIES = {
    id: SERIES_A,
    board: "PEARSON_EDEXCEL",
    qualification: "International GCSE Chemistry",
    series_code: "4CH1-JAN-26",
    label: "January 2026",
    window_start: "2026-01-06",
    window_end: "2026-01-24",
    entry_deadline: "2025-10-10",
    results_date: "2026-03-05",
    estimated: false,
    source_url: "https://example.edu/series",
    retrieved_at: "2025-09-01T00:00:00Z",
    published: true,
  };

  test("GET /exam-series → 200 with the seeded calendar rows (camelCase wire)", async () => {
    const res = await makeApp(asStudent, [
      { match: /where published = true order by window_start asc$/, rows: [SERIES] },
    ]).request("/api/v1/learners/me/exam-series");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe(SERIES_A);
    expect(body[0]!.seriesCode).toBe("4CH1-JAN-26");
    expect(body[0]!.published).toBeUndefined(); // no published flag on the wire
  });

  test("PUT with a non-kebab slug → 400 bad_request with the frozen message", async () => {
    const res = await makeApp(asStudent, routesWith({})).request(
      "/api/v1/learners/me/courses/Chm_Target/target-series",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId: SERIES_A }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("course slug must be a kebab-case registry key");
  });

  test("DELETE → 204 always (the enrolment row remains)", async () => {
    const res = await makeApp(asStudent, [
      ...routesWith({}),
      { match: /from learner_course_enrolments where learner_id = \? and course_slug = \?$/, rows: [] },
      { match: /update learner_course_enrolments/, rows: [] },
    ]).request("/api/v1/learners/me/courses/chm/target-series", { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});

// ── assignments ──────────────────────────────────────────────────────────────

describe("GET /assignments + POST /assignments/{id}/submissions — LearnerAssignmentController", () => {
  const ASSIGNMENT = {
    id: ASSIGNMENT_A,
    title: "Fractions drill",
    question_count: 10,
    marks_total: 20,
    status: "OPEN",
    due_at: "2026-10-10T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    class_id: null,
  };

  test("POST a valid submission → 201", async () => {
    const res = await makeApp(asStudent, [
      ...routesWith({}),
      { match: /from assignments where id = \?$/, rows: [ASSIGNMENT] },
      { match: /insert into assignment_submissions/, rows: [] },
    ]).request(`/api/v1/learners/me/assignments/${ASSIGNMENT_A}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionsCompleted: 3, score: 7 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.questionsCompleted).toBe(3);
  });

  test("malformed assignment uuid → 400 bad_request 'malformed request'", async () => {
    const res = await makeApp(asStudent, routesWith({})).request("/api/v1/learners/me/assignments/xyz/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionsCompleted: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("malformed request");
  });

  test("missing questionsCompleted → 400 validation_failed 'questionsCompleted: must not be null'", async () => {
    const res = await makeApp(asStudent, routesWith({})).request(
      `/api/v1/learners/me/assignments/${ASSIGNMENT_A}/submissions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: 2 }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("questionsCompleted: must not be null");
  });

  test("a string questionsCompleted cannot reach bean validation → 400 malformed_body (two-envelope)", async () => {
    const res = await makeApp(asStudent, routesWith({})).request(
      `/api/v1/learners/me/assignments/${ASSIGNMENT_A}/submissions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionsCompleted: "three" }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });
});

// ── the honest-501 posture (the no-provider safety net, still mapped) ───────

describe("the honest-501 posture", () => {
  test("agenda-with-rootId over a no-provider module → 501 not_implemented, never a fake 200", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("syllabai.auth" as never, STUDENT as never);
      await next();
    });
    const real = buildLearnerMeModule(
      fakeSql(routesWith({})) as unknown as Parameters<typeof buildLearnerMeModule>[0],
      CLOCK,
    );
    const engineLess = {
      ...real,
      // the tranche-1 tranche posture, reconstructed for the mapping pin:
      // buildAgenda without a provider raises the owning-task-id 501
      buildAgenda: () =>
        Promise.reject(
          new LearnerMeNotImplementedError(
            "not implemented: next-best-action engine (T-MIG-043 tranche-2 owns /agenda rootId + /recommendations)",
          ),
        ),
    };
    app.route("/api/v1/learners/me", createLearnerMeRouter(engineLess));
    app.onError((err, c) => {
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 400);
      return c.json(
        { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
        500 as const,
      );
    });
    const res = await app.request(`/api/v1/learners/me/agenda?rootId=${SUBJECT}`);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("not_implemented");
    expect(body.message).toContain("T-MIG-043 tranche-2");
  });
});
