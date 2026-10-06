/**
 * T-MIG-041 tranche-2 route tests — the observable HTTP contract of
 * LearnerStateController (GET /api/v1/learners/me/state) and
 * CourseStatsController (GET /api/v1/learners/me/course-stats), over an
 * IN-MEMORY Hono app wiring the REAL tranche-1 learner services over
 * stubbed sql (no Neon) — the T-MIG-021 route-test pattern.
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (learnerStateViewSchema / courseStatsViewSchema, T-MIG-038 #60)
 * and key-pinned against the frozen DTO records (LearnerStateView.java /
 * CourseStatsView.java @ 6cad6ef) — including the engagement nodeTitle key
 * (the R-fix: tranche 1 drifted to nodeName; the wire must match the frozen
 * record). Error envelopes are pinned to the W4 captured shapes
 * (w4-state-unauthed-401 / w4-course-stats-unauthed-401: the Boot body with
 * the request path, timestamp tolerated).
 *
 * Determinism: the router's injected `now` factory is pinned to the helpers'
 * NOW constant — every decay/relaxation/countdown value in these tests is
 * exact (ADR-031: computed on the read, never persisted).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLearnerStateRouter } from "../../src/routes/learner";
import { buildLearnerModule, LEARNER_ENGINE_PAPER_DEFAULTS } from "../../src/services/learner";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  courseStatsViewSchema,
  learnerStateViewSchema,
} from "@syllabai/contracts";
import {
  fakeSql,
  LEARNER,
  NODE_MISCONCEPTION,
  NODE_SUBTOPIC,
  NODE_TOPIC,
  NOW,
  SERIES_IAL,
} from "./helpers";

const DAY = 86_400_000;

/** Rows for a POPULATED learner — one live wire row per composite leg. */
function populatedRoutes() {
  const ninetyDaysAgo = new Date(NOW.getTime() - 90 * DAY);
  const hundredEightyDaysAgo = new Date(NOW.getTime() - 180 * DAY);
  const t3 = new Date(NOW.getTime() - DAY);
  const t2 = new Date(NOW.getTime() - 2 * DAY);
  return [
    {
      match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states/,
      rows: [
        {
          node_id: NODE_TOPIC,
          mastery: 0.5,
          attempts: 3,
          correct_count: 2,
          last_practiced_at: ninetyDaysAgo,
          procedural_fluency_gap: 0.25,
        },
      ],
    },
    {
      match: /select misconception_node_id, probability, evidence_count, last_evidence_at from misconception_states/,
      rows: [
        {
          misconception_node_id: NODE_MISCONCEPTION,
          probability: 0.9,
          evidence_count: 4,
          last_evidence_at: hundredEightyDaysAgo,
        },
      ],
    },
    {
      match: /select node_id, due_at, reason from review_schedules/,
      rows: [
        {
          node_id: NODE_TOPIC,
          due_at: new Date(NOW.getTime() + DAY),
          reason: "DECAY_CROSSED_THRESHOLD",
        },
      ],
    },
    {
      match: /select node_id, occurred_at, refused, signal_type from tutor_topic_engagements/,
      rows: [
        // repo order occurredAt DESC; same node twice -> grouped (asks 2)
        { node_id: NODE_TOPIC, occurred_at: t3, refused: true, signal_type: "ASK" },
        { node_id: NODE_TOPIC, occurred_at: t2, refused: false, signal_type: null },
      ],
    },
    {
      match: /select card_id, node_id, rating, occurred_at from flashcard_ratings/,
      rows: [
        { card_id: "fl_w4_cap_001", node_id: NODE_TOPIC, rating: "KNOW", occurred_at: NOW },
        { card_id: "fl_w4_cap_002", node_id: NODE_TOPIC, rating: "STILL_LEARNING", occurred_at: t2 },
      ],
    },
    {
      match: /select note_id, node_id, vote, occurred_at from note_votes/,
      rows: [{ note_id: "note-1", node_id: NODE_TOPIC, vote: "HELPFUL", occurred_at: NOW }],
    },
    {
      match: /select course_slug, target_series_id from learner_course_enrolments/,
      rows: [
        { course_slug: "chm", target_series_id: SERIES_IAL },
        // vanished series row: filtered by the targetsFor law
        { course_slug: "phy", target_series_id: "0a000000-0000-0000-0000-00000000dead" },
      ],
    },
    {
      match: /select id, title from knowledge_nodes/,
      rows: [
        { id: NODE_TOPIC, title: "Formulae, Equations and Amount of Substance" },
        { id: NODE_MISCONCEPTION, title: "Moles and grams are interchangeable" },
      ],
    },
    {
      match: /select id, series_code, label, window_start, window_end, entry_deadline, results_date, estimated from exam_series/,
      rows: [
        {
          id: SERIES_IAL,
          series_code: "2026-october-november",
          label: "October/November 2026",
          window_start: "2026-11-01",
          window_end: "2026-11-30",
          entry_deadline: "2026-10-01",
          results_date: "2027-01-15",
          estimated: true,
        },
      ],
    },
  ];
}

/** Rows for an EMPTY learner — the w4-state-empty-200 posture (7 legs, no batch lookups). */
function emptyRoutes() {
  return [
    { match: /from skill_states/, rows: [] },
    { match: /from misconception_states/, rows: [] },
    { match: /from review_schedules/, rows: [] },
    { match: /from tutor_topic_engagements/, rows: [] },
    { match: /from flashcard_ratings/, rows: [] },
    { match: /from note_votes/, rows: [] },
    { match: /from learner_course_enrolments/, rows: [] },
    { match: /from knowledge_nodes/, rows: [] },
    { match: /from exam_series/, rows: [] },
  ];
}

function courseStatsRoutes(counts: { attempts: number; questions: number; notes: number; cards: number }) {
  return [
    {
      match: /select count\(\*\)::int as n from attempts where learner_id = \?$/,
      rows: [{ n: counts.attempts }],
    },
    {
      match: /select count\(distinct question_id\)::int as n from attempts where learner_id = \?$/,
      rows: [{ n: counts.questions }],
    },
    {
      match: /select count\(\*\)::int as n from revision_note_viewed where user_id = \?$/,
      rows: [{ n: counts.notes }],
    },
    {
      match: /select count\(distinct card_id\)::int as n from flashcard_ratings where learner_id = \?$/,
      rows: [{ n: counts.cards }],
    },
  ];
}

/** App assembly mirroring apps/api/src/index.ts (auth injection + real error boundary). */
function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  routes: Array<{ match: RegExp; rows: Array<Record<string, unknown>> }>,
) {
  const sql = fakeSql(routes);
  const module = buildLearnerModule(sql, LEARNER_ENGINE_PAPER_DEFAULTS);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me", createLearnerStateRouter(module, () => NOW));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, sql };
}

const STUDENT = {
  email: "student@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent = () => STUDENT;
const anon = () => null;

// ── authz shell (SecurityConfig anyRequest().authenticated() parity) ───────

describe("GET /api/v1/learners/me/state — authz shell", () => {
  test("anonymous: Boot 401 body with the request path (w4-state-unauthed-401, timestamp tolerated)", async () => {
    const { app } = makeApp(anon, emptyRoutes());
    const res = await app.request("/api/v1/learners/me/state");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/learners/me/state");
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous unknown path under the base: shell 401 BEFORE the 404-after-auth fall-through", async () => {
    const { app } = makeApp(anon, emptyRoutes());
    const res = await app.request("/api/v1/learners/me/definitely-not-a-route");
    expect(res.status).toBe(401);
  });

  test("course-stats anonymous: Boot 401 (w4-course-stats-unauthed-401)", async () => {
    const { app } = makeApp(anon, courseStatsRoutes({ attempts: 0, questions: 0, notes: 0, cards: 0 }));
    const res = await app.request("/api/v1/learners/me/course-stats");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.path).toBe("/api/v1/learners/me/course-stats");
  });
});

// ── GET /state: populated learner — canonical schema + frozen key parity ────

describe("GET /api/v1/learners/me/state — populated learner", () => {
  test("student: 200, canonical-schema-valid, every leg serialized with frozen keys", async () => {
    const { app } = makeApp(asStudent, populatedRoutes());
    const res = await app.request("/api/v1/learners/me/state");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = learnerStateViewSchema.parse(body); // throws on any key drift
    expect(parsed.learnerId).toBe(LEARNER); // @CurrentUserId parity: the JWT principal's id

    // skills: anchor passthrough + read-time decay through the wire (ms ISO)
    expect(parsed.skillStates.length).toBe(1);
    const s = parsed.skillStates[0]!;
    expect(s.mastery).toBe(0.5);
    expect(s.effectiveMastery).toBeCloseTo(0.5 * Math.exp(-1), 12);
    expect(s.band).toBe("LOW");
    expect(s.nodeName).toBe("Formulae, Equations and Amount of Substance");
    expect(s.lastPracticedAt).toBe(new Date(NOW.getTime() - 90 * DAY).toISOString());

    // misconceptions: staleness-relaxed probability (the MED-2 wire value)
    const m = parsed.misconceptionStates[0]!;
    expect(m.misconceptionNodeId).toBe(NODE_MISCONCEPTION);
    expect(m.probability).toBeCloseTo(0.3 + 0.6 * Math.exp(-1), 12);
    expect(m.active).toBeTrue();
    expect(m.misconceptionName).toBe("Moles and grams are interchangeable");

    // pending reviews: reason enum verbatim
    expect(parsed.pendingReviews.length).toBe(1);
    expect(parsed.pendingReviews[0]!.reason).toBe("DECAY_CROSSED_THRESHOLD");

    // tutor engagements: the R-fix wire key nodeTitle (frozen LearnerStateView.java:78)
    expect(parsed.tutorEngagements.length).toBe(1);
    const e = parsed.tutorEngagements[0]!;
    expect(e.nodeId).toBe(NODE_TOPIC);
    expect("nodeTitle" in e).toBeTrue();
    expect("nodeName" in e).toBeFalse();
    expect(e.nodeTitle).toBe("Formulae, Equations and Amount of Substance");
    expect(e.asks).toBe(2);
    expect(e.refusedAny).toBeTrue(); // sticky through the wire
    expect(e.signalCounts).toEqual({ ASK: 1, TOPIC_ENGAGEMENT: 1 });
    expect(e.lastAskedAt).toBe(new Date(NOW.getTime() - DAY).toISOString());

    // flashcard ratings + note votes: wire casing + ISO instants
    expect(parsed.flashcardRatings.map((f) => f.rating)).toEqual(["know", "still-learning"]);
    expect(parsed.flashcardRatings[0]!.subtopicCode).toBeNull();
    expect(parsed.noteVotes.map((v) => v.vote)).toEqual(["helpful"]);

    // exam targets: LocalDate strings pass through; countdowns derived on NOW
    expect(parsed.examTargets.length).toBe(1); // vanished series dropped
    const t = parsed.examTargets[0]!;
    expect(t.seriesId).toBe(SERIES_IAL);
    expect(t.windowStart).toBe("2026-11-01");
    expect(t.daysToWindowStart).toBe(26);
    expect(t.daysToWindowEnd).toBe(55);
    expect(t.entryDeadlinePassed).toBeTrue();
  });

  test("query budget: 7 legs + 1 batched titles + 1 batched series (the frozen call sequence)", async () => {
    const { app, sql } = makeApp(asStudent, populatedRoutes());
    await app.request("/api/v1/learners/me/state");
    expect(sql.queries.length).toBe(9);
    expect(sql.queries.filter((q) => q.includes("from knowledge_nodes")).length).toBe(1);
    expect(sql.queries.filter((q) => q.includes("from exam_series")).length).toBe(1);
  });
});

// ── GET /state: empty learner (w4-state-empty-200 parity) ───────────────────

describe("GET /api/v1/learners/me/state — empty learner", () => {
  test("student: 200 with all seven arrays present and empty (never absent)", async () => {
    const { app } = makeApp(asStudent, emptyRoutes());
    const res = await app.request("/api/v1/learners/me/state");
    expect(res.status).toBe(200);
    const parsed = learnerStateViewSchema.parse(await res.json());
    expect(parsed.learnerId).toBe(LEARNER);
    expect(parsed.skillStates).toEqual([]);
    expect(parsed.misconceptionStates).toEqual([]);
    expect(parsed.pendingReviews).toEqual([]);
    expect(parsed.tutorEngagements).toEqual([]);
    expect(parsed.flashcardRatings).toEqual([]);
    expect(parsed.noteVotes).toEqual([]);
    expect(parsed.examTargets).toEqual([]);
  });
});

// ── GET /course-stats (CourseStatsController :49-57) ─────────────────────────

describe("GET /api/v1/learners/me/course-stats", () => {
  test("student: 200, canonical-schema-valid, the four counts through the wire", async () => {
    const { app, sql } = makeApp(
      asStudent,
      courseStatsRoutes({ attempts: 1, questions: 1, notes: 0, cards: 3 }),
    );
    const res = await app.request("/api/v1/learners/me/course-stats");
    expect(res.status).toBe(200);
    const parsed = courseStatsViewSchema.parse(await res.json());
    expect(parsed).toEqual({
      learnerId: LEARNER,
      attempts: 1,
      distinctQuestions: 1,
      notesViewed: 0,
      flashcardsRated: 3,
    });
    // exactly the four count queries, in the frozen call order
    expect(sql.queries.length).toBe(4);
    expect(sql.queries[0]).toContain("from attempts where learner_id = ?");
    expect(sql.queries[1]).toContain("count(distinct question_id)");
    expect(sql.queries[2]).toContain("from revision_note_viewed where user_id = ?");
    expect(sql.queries[3]).toContain("count(distinct card_id)");
  });

  test("empty trail: zero counts (never nulls — the compact-constructor parity)", async () => {
    const { app } = makeApp(asStudent, courseStatsRoutes({ attempts: 0, questions: 0, notes: 0, cards: 0 }));
    const res = await app.request("/api/v1/learners/me/course-stats");
    expect(res.status).toBe(200);
    const parsed = courseStatsViewSchema.parse(await res.json());
    expect(parsed.attempts).toBe(0);
    expect(parsed.flashcardsRated).toBe(0);
  });
});
