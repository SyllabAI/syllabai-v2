/**
 * T-MIG-032 tranche-2 route tests — the observable HTTP contract of
 * LearnerSelfMarkController (POST /api/v1/learners/me/attempts/{id}/self-mark)
 * and StudentSmartMarkController (smart-mark + the two feedback actions) over
 * REAL services on stubbed sql. 200/201 bodies validated against the CANONICAL
 * selfMarkViewSchema (contracts) for self-mark; smart-mark views validated
 * structurally (contracts top-up requested). Error envelopes pinned to the
 * captured Boot 401 + frozen handler law (bad_request detail, conflict 409,
 * 503 smart_feedback_unavailable fixed body).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLearnerSelfMarkRouter, buildSelfMarkRouters } from "../../src/routes/selfmark";
import { createStudentSmartMarkRouter, dormantFeedbackLlm, dormantCandidateGenerator } from "../../src/routes/smartmark";
import { buildSelfMarkModule } from "../../src/services/selfmark";
import { buildSmartMarkModule, CandidateGenerationError } from "../../src/services/smartmark";
import { toErrorResponse } from "../../src/services/identity/errors";
import { selfMarkViewSchema } from "@syllabai/contracts";
import { fakeSql, FIXED_CLOCK, type Route } from "../assessment/helpers";

const ATTEMPT_ID = "9a000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const POINT_A1 = "61000000-0000-0000-0000-000000000001";
const POINT_A2 = "61000000-0000-0000-0000-000000000002";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const SCHEME_ID = "70000000-0000-0000-0000-000000000009";
const PAPER_ID = "80000000-0000-0000-0000-000000000001";

const LOCK = /select id, learner_id, question_id, marking_state, evidence_emitted from attempts where id = \? for update/;
const LOCK_SM = /select id, learner_id, question_id, exam_paper_id, marking_state, evidence_emitted from attempts where id = \? for update/;
const ATTEMPT_READ_SM = /select id, learner_id, question_id, exam_paper_id, marking_state, evidence_emitted from attempts where id = \?$/;
const QUESTIONS = /select id, question_type, marks from questions where id = \?/;
const ANSWERS_SELF = /select ans\.id, ans\.question_part_id, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const ANSWERS_SM = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const ANSWER_UPDATE = /update answers set marks_awarded = \? , marking_state = \? where id = \?/;
const SELF_MARK_INSERT = /insert into learner_self_marks/;
const ATTEMPT_UPDATE = /update attempts set marking_state = \? , marks_awarded = \? , correct = \? where id = \?/;
const TOPICS = /select node_id from question_topics where question_id = \?/;
const FLIP = /update attempts set evidence_emitted = true where id = \? and evidence_emitted = false/;
const VERSION = /select id from question_versions where question_id = \? order by version desc/;
const VALIDATED_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? and validation_state = \? order by created_at desc/;
const NEWEST_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc/;
const POINTS = /select id, ref, ordering, text, marks, question_part_id from mark_scheme_points where mark_scheme_id = \? order by ordering/;
const KAPPA_ALL = /select passed from smart_mark_agreement_evaluations where scope = \? order by computed_at desc/;
const KAPPA_PAPER = /select passed from smart_mark_agreement_evaluations where scope = \? and exam_paper_id = \? order by computed_at desc/;
const RESULT_INSERT = /insert into smart_mark_results/;
const RESULT_LATEST = /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/;
const ATTEMPT_SMART_UPDATE = /update attempts set marking_state = \? where id = \?/;
const ATTEMPT_TOTAL_UPDATE = /update attempts set marks_awarded = \? where id = \?/;

const ATTEMPT = { id: ATTEMPT_ID, learner_id: LEARNER_ID, question_id: QUESTION_ID, exam_paper_id: PAPER_ID, marking_state: "PENDING", evidence_emitted: false };

function baseRoutes(): Route[] {
  return [
    { match: LOCK, rows: [ATTEMPT] },
    { match: LOCK_SM, rows: [ATTEMPT] },
    { match: ATTEMPT_READ_SM, rows: [ATTEMPT] },
    { match: QUESTIONS, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    { match: ANSWERS_SELF, rows: [
        { id: ANSWER_A, question_part_id: PART_A, marks_awarded: null, marking_state: "PENDING", label: "(a)", marks: 3 },
      ] },
    { match: ANSWERS_SM, rows: [
        { id: ANSWER_A, question_part_id: PART_A, answer_text: "The student's written answer.", marks_awarded: null, marking_state: "PENDING", label: "(a)", marks: 3 },
      ] },
    { match: ANSWER_UPDATE, rows: [] },
    { match: SELF_MARK_INSERT, rows: [] },
    { match: ATTEMPT_UPDATE, rows: [] },
    { match: TOPICS, rows: [{ node_id: "20000000-0000-0000-0000-000000000012" }] },
    { match: FLIP, rows: [] },
    { match: VERSION, rows: [{ id: "70000000-0000-0000-0000-000000000001" }] },
    { match: VALIDATED_SCHEME, rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: NEWEST_SCHEME, rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: POINTS, rows: [
        { id: POINT_A1, ref: "a(i)", ordering: 1, text: "states the mole ratio", marks: 2, question_part_id: PART_A },
        { id: POINT_A2, ref: "a(ii)", ordering: 2, text: "correct unit handling", marks: 1, question_part_id: PART_A },
      ] },
    { match: KAPPA_ALL, rows: [] },
    { match: KAPPA_PAPER, rows: [{ passed: true }], rowsFor: (p) => (p[1] === PAPER_ID ? [{ passed: true }] : []) },
    { match: RESULT_INSERT, rows: [] },
    { match: RESULT_LATEST, rows: [{ id: "bb000000-0000-4000-8000-000000000001", answer_id: ANSWER_A, model_id: "glm-4.6", marks_awarded: 2, confidence: 0.9, validation_passed: true, breakdown: [], failure_reason: null }] },
    { match: ATTEMPT_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_TOTAL_UPDATE, rows: [] },
  ];
}

function makeApp(auth: (c: Context) => Record<string, unknown> | null, sql = fakeSql(baseRoutes())) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const selfMarkModule = buildSelfMarkModule(sql, { publishGraded: async () => true }, FIXED_CLOCK);
  const smartMark = buildSmartMarkModule(
    sql,
    { proposeAll: async (ctxs) => ctxs.map(() => ({ modelId: "glm-4.6", confidence: 0.9, rawOutput: null, allocations: [
        { markPointId: POINT_A1, ref: "a(i)", awarded: true, marksAwarded: 2, evidence: "quote", rationale: "why" },
        { markPointId: POINT_A2, ref: "a(ii)", awarded: false, marksAwarded: 0, evidence: "", rationale: "missing" },
      ] })),
      propose: async () => { throw new CandidateGenerationError("CANDIDATE_GENERATION_UNAVAILABLE"); } },
    { publishGraded: async () => true },
    FIXED_CLOCK,
    { available: () => true, generate: async () => "1. You earned 2 of 3.\n2. ..." },
  );
  app.route("/api/v1/learners/me/attempts", createLearnerSelfMarkRouter(selfMarkModule));
  app.route("/api/v1/learners/me/attempts", createStudentSmartMarkRouter(smartMark));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" }, 500 as const);
  });
  return app;
}

const STUDENT = { email: "student@example.edu", userId: LEARNER_ID, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

describe("POST /api/v1/learners/me/attempts/:id/self-mark", () => {
  test("happy: 201 canonical SelfMarkView (settled parts, evidenceFired from the claim)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ partId: PART_A, marksAwarded: 2 }], comment: "self" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(selfMarkViewSchema.parse(body)).toEqual({
      attemptId: ATTEMPT_ID,
      marksAwarded: 2,
      marksTotal: 4,
      evidenceFired: true,
      parts: [{ partId: PART_A, label: "(a)", marksAwarded: 2, marksPossible: 3, markingState: "SELF_MARKED" }],
    });
  });

  test("empty body → 400 malformed_body (HttpMessageNotReadable parity)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });

  test("duplicate part → 400 bad_request WITH detail (boundary superRefine law, NOT fixed body)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ partId: PART_A, marksAwarded: 1 }, { partId: PART_A, marksAwarded: 2 }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe(`duplicate part in self-mark: ${PART_A}`);
  });

  test("bad uuid in partId → 400 malformed_body (Jackson binding failure parity)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ partId: "not-a-uuid", marksAwarded: 1 }] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });

  test("marksAwarded 100 → 400 validation_failed (single-field pin, @Max(99) — inferred)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ partId: PART_A, marksAwarded: 100 }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("parts[0].marksAwarded: must be less than or equal to 99");
  });

  test("bad uuid in path → 400 bad_request 'malformed request' (conversion precedes handlers)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/learners/me/attempts/not-a-uuid/self-mark", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown attempt → 404 not_found (port posture; the captured 500 stays disclosed for R0)", async () => {
    const sql = fakeSql(baseRoutes().map((r) => (r.match === LOCK ? { match: LOCK, rows: [] } : r)));
    const res = await makeApp(asStudent, sql).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ partId: PART_A, marksAwarded: 1 }] }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`attempt ${ATTEMPT_ID} not found`);
  });

  test("unauthenticated → Boot 401 with path (captured w3-selfmark-unauthed-401)", async () => {
    const res = await makeApp(anon).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/self-mark`);
  });
});

describe("POST /api/v1/learners/me/attempts/:id/smart-mark (+ feedback actions)", () => {
  test("smart-mark: 200 AttemptSmartMarkView (κ paper passed → authoritative, compact pointLabel)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/smart-mark`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attemptId).toBe(ATTEMPT_ID);
    expect(body.schemeValidationState).toBe("VALIDATED");
    expect(body.parts[0]!.authoritative).toBe(true);
    expect(body.parts[0]!.marksAwarded).toBe(2);
    expect(body.parts[0]!.breakdown[0]!.pointLabel).toBe("states the mole ratio");
  });

  test("smart-mark unauthenticated → Boot 401 (captured w3-smartmark-unauthed-401)", async () => {
    const res = await makeApp(anon).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/smart-mark`, { method: "POST" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  test("feedback-explanation: 200 prose from the injected seam (modelId carried)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/parts/${PART_A}/feedback-explanation`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partId).toBe(PART_A);
    expect(body.explanation).toContain("You earned 2 of 3");
    expect(body.modelId).toBe("glm-4.6");
  });

  test("improvement-plan: 200 plan (button-driven, no body sent)", async () => {
    const res = await makeApp(asStudent).request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/parts/${PART_A}/improvement-plan`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toContain("You earned 2 of 3");
  });

  test("llm unavailable → 503 smart_feedback_unavailable with the FIXED body (handler :107-117)", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => { c.set("syllabai.auth" as never, STUDENT as never); await next(); });
    const sql = fakeSql(baseRoutes());
    const selfMarkModule = buildSelfMarkModule(sql, { publishGraded: async () => true }, FIXED_CLOCK);
    const smartMark = buildSmartMarkModule(sql, dormantCandidateGenerator, { publishGraded: async () => true }, FIXED_CLOCK, dormantFeedbackLlm);
    app.route("/api/v1/learners/me/attempts", createLearnerSelfMarkRouter(selfMarkModule));
    app.route("/api/v1/learners/me/attempts", createStudentSmartMarkRouter(smartMark));
    app.onError((err, c) => {
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 400);
      return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "t" }, 500 as const);
    });
    const res = await app.request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/parts/${PART_A}/feedback-explanation`, { method: "POST" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("smart_feedback_unavailable");
    expect(body.message).toBe("the marking feedback engine is temporarily unavailable — try again shortly");
  });
});
