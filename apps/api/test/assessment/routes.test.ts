/**
 * T-MIG-030 tranche-2 route tests — the observable HTTP contract of
 * AttemptController (POST /api/v1/attempts, POST /api/v1/attempts/structured)
 * and AttemptHistoryController (GET /api/v1/learners/me/attempts), over an
 * IN-MEMORY Hono app wiring the REAL assessment services over stubbed sql
 * (no Neon).
 *
 * 200/201 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (attemptResultViewSchema / structuredAttemptResultViewSchema /
 * attemptHistoryViewSchema) AND compared to the T-MIG-007 captured bodies
 * (w3-attempt-*, w3-history-*). Error envelopes are pinned to the captured
 * shapes (Boot 401, malformed_body 400) and the frozen handler law
 * (validation_failed first-field-error, MethodArgumentTypeMismatch 400) —
 * inferred messages are single-field so Hibernate traversal order can never
 * flip a pin (disclosed in the tranche-2 receipt).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createAttemptRouter,
  createAttemptHistoryRouter,
} from "../../src/routes/assessment";
import { buildAssessmentModule } from "../../src/services/assessment";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  attemptResultViewSchema,
  structuredAttemptResultViewSchema,
  attemptHistoryViewSchema,
} from "@syllabai/contracts";
import {
  fakeSql,
  FIXED_CLOCK,
  QUESTION_ROW,
  OPTION_ROWS,
  SECONDARY_TOPIC_ROWS,
  ATTEMPT_JOINED_ROW,
  NODE_ROW,
  QUESTION_ID,
  LEARNER_ID,
  MISCONCEPTION_ID,
  OPTION_A_ID,
  partRow,
  type Route,
} from "./helpers";

// ── sql stubs (union of every query the two routers' services can issue) ────

const QUESTION_MATCH = /select id, question_type, marks, exam_paper_id, active from questions where id = \?/;
const VERSIONS_ID_MATCH = /select id, validation_state from question_versions where question_id = \? order by version desc/;
const PAPERS_MATCH = /select id from exam_papers where validation_state in \( \? , \? \)/;
const OPTIONS_MATCH = /select id, label, is_correct, misconception_node_id from question_options where question_id = \? order by ordering/;
const HISTORY_OPTIONS_MATCH = /select id, question_id, label, is_correct, misconception_node_id from question_options where question_id = any\( \? ::uuid\[\]\) order by ordering/;
const INSERT_ATTEMPT = /insert into attempts/;
const TOPICS_MATCH = /select node_id from question_topics where question_id = \?/;
const PARTS_MATCH = /select id, label, marks from question_parts where question_version_id = \? order by ordering/;
const INSERT_ANSWER = /insert into answers/;
const PAGE_MATCH = /select a\.id, a\.question_id, a\.chosen_option_id.*from attempts a join questions q on q\.id = a\.question_id where a\.learner_id = \? order by a\.created_at desc limit \?/;
const COUNT_MATCH = /select count\(\*\) as total from attempts where learner_id = \?/;
const NODES_MATCH = /select id, code, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/;

function structuredQuestionRow() {
  return { ...QUESTION_ROW, question_type: "STRUCTURED", marks: 4 };
}

function moduleSql(
  opts: {
    attemptRows?: Array<Record<string, unknown>>;
    questionRow?: Record<string, unknown>;
    onLimit?: (n: number) => void;
  } = {},
) {
  const attemptRows = opts.attemptRows ?? [];
  return fakeSql([
    { match: QUESTION_MATCH, rows: [opts.questionRow ?? QUESTION_ROW] },
    { match: VERSIONS_ID_MATCH, rows: [{ id: "70000000-0000-0000-0000-000000000001", validation_state: "VALIDATED" }] },
    { match: PAPERS_MATCH, rows: [] },
    { match: OPTIONS_MATCH, rows: OPTION_ROWS },
    { match: HISTORY_OPTIONS_MATCH, rows: OPTION_ROWS },
    { match: INSERT_ATTEMPT, rows: [] },
    { match: TOPICS_MATCH, rows: SECONDARY_TOPIC_ROWS },
    {
      match: PARTS_MATCH,
      rows: [partRow(), partRow({ id: "60000000-0000-0000-0000-000000000002", label: "(b)", marks: 1 })],
    },
    { match: INSERT_ANSWER, rows: [] },
    {
      match: PAGE_MATCH,
      rows: attemptRows,
      rowsFor: (p) => {
        if (opts.onLimit) opts.onLimit(Number(p[1]));
        return attemptRows.slice(0, Number(p[1]));
      },
    },
    { match: COUNT_MATCH, rows: [{ total: String(attemptRows.length) }] },
    { match: NODES_MATCH, rows: [NODE_ROW] },
  ]);
}

/** App assembly mirroring apps/api/src/index.ts (auth injection + real error boundary). */
function makeApp(auth: (c: Context) => Record<string, unknown> | null, sql = moduleSql()) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  // FIXED_CLOCK pins the volatile attemptId/submittedAt fields (the capture
  // tolerates them; the service tests pin the same fixed values).
  const module = buildAssessmentModule(sql, undefined, FIXED_CLOCK);
  app.route("/api/v1/attempts", createAttemptRouter(module));
  app.route("/api/v1/learners/me", createAttemptHistoryRouter(module));
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
  userId: LEARNER_ID,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent = () => STUDENT;
const anon = () => null;

/** The captured MCQ submit request (w3-attempt-mcq-happy-201). */
const CAPTURED_MCQ_BODY = {
  questionId: QUESTION_ID,
  chosenOptionId: OPTION_A_ID,
  responseTimeMs: 25000,
  confidence: 4,
  selfDoubtFlag: false,
  timedCondition: false,
};

/** The captured 201 view with volatile fields fixed by FIXED_CLOCK (tolerated
 * id/timestamp in the capture — the service tests pin the same values). */
const CAPTURED_MCQ_VIEW = {
  attemptId: "7e571d00-0000-4000-8000-000000000001",
  questionId: QUESTION_ID,
  correct: false,
  marksAwarded: 0,
  marksTotal: 1,
  correctOptionLabel: "C",
  implicatedMisconceptionIds: [MISCONCEPTION_ID],
  submittedAt: "2026-10-05T07:45:00.000Z",
};

// ── POST /api/v1/attempts — AttemptController.submit (:31-35) ───────────────

describe("POST /api/v1/attempts — AttemptController.submit (:31-35)", () => {
  test("captured request body → 201 canonical AttemptResultView, captured body (ids/timestamp tolerated)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CAPTURED_MCQ_BODY),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(attemptResultViewSchema.parse(body)).toEqual(CAPTURED_MCQ_VIEW);
  });

  test("numeric-string responseTimeMs coerces (Jackson lenient scalar parity — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CAPTURED_MCQ_BODY, responseTimeMs: "25000" }),
    });
    expect(res.status).toBe(201);
    expect(attemptResultViewSchema.parse(await res.json())).toEqual(CAPTURED_MCQ_VIEW);
  });

  test("truly empty body → 400 malformed_body, captured envelope (w3-attempt-missing-fields-400)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "", // zero bytes — Jackson "Required request body is missing"
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
    expect(typeof body.timestamp).toBe("string");
  });

  test("non-uuid identifiers → 400 malformed_body, captured envelope (w3-attempt-bad-uuid-400)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: "not-a-uuid", chosenOptionId: "not-a-uuid", responseTimeMs: 1000 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("{} JSON body → 400 validation_failed 'questionId: must not be null' (frozen handler :158-165 — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}", // binds with nulls, @NotNull fails — validation, not binding
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("questionId: must not be null");
  });

  test("responseTimeMs -5 → validation_failed (single-field pin, @Min(0) — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CAPTURED_MCQ_BODY, responseTimeMs: -5 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("responseTimeMs: must be greater than or equal to 0");
  });

  test("confidence 6 → validation_failed (single-field pin, @Max(5) — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CAPTURED_MCQ_BODY, confidence: 6 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("confidence: must be less than or equal to 5");
  });

  test("responseTimeMs 'abc' → 400 malformed_body (Long binding failure — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...CAPTURED_MCQ_BODY, responseTimeMs: "abc" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });

  test("unauthenticated POST with empty body → Boot 401 BEFORE body parsing (filter-chain parity, captured)", async () => {
    const res = await makeApp(anon).request("/api/v1/attempts", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/attempts");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ── POST /api/v1/attempts/structured — AttemptController.submitStructured ───

describe("POST /api/v1/attempts/structured — submitStructured (:37-41)", () => {
  const STRUCT_BODY = {
    questionId: QUESTION_ID,
    partAnswers: [
      { partId: "60000000-0000-0000-0000-000000000001", answerText: "  answer a  " },
      { partId: "60000000-0000-0000-0000-000000000002", answerText: null },
    ],
    responseTimeMs: 30000,
    confidence: 2,
    selfDoubtFlag: true,
    timedCondition: false,
  };

  test("happy path → 201 canonical StructuredAttemptResultView (PENDING; view pinned from the DTO records — no captured happy case in this slice)", async () => {
    const res = await makeApp(
      asStudent,
      moduleSql({ questionRow: { ...QUESTION_ROW, question_type: "STRUCTURED", marks: 4 } }),
    ).request("/api/v1/attempts/structured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(STRUCT_BODY),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(structuredAttemptResultViewSchema.parse(body)).toEqual({
      attemptId: "7e571d00-0000-4000-8000-000000000001",
      questionId: QUESTION_ID,
      marksPossible: 4,
      markingState: "PENDING",
      submittedAt: "2026-10-05T07:45:00.000Z",
      parts: [
        { partId: "60000000-0000-0000-0000-000000000001", label: "(a)", marksPossible: 3, markingState: "PENDING", marksAwarded: null },
        { partId: "60000000-0000-0000-0000-000000000002", label: "(b)", marksPossible: 1, markingState: "PENDING", marksAwarded: null },
      ],
    });
  });

  test("empty body → 400 malformed_body, captured envelope (w3-attempt-structured-missing-fields-400)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts/structured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("partAnswers [] → 400 validation_failed 'partAnswers: must not be empty' (single-field pin, @NotEmpty — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts/structured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...STRUCT_BODY, partAnswers: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("partAnswers: must not be empty");
  });

  test("4001-char answerText → 400 validation_failed 'partAnswers[0].answerText: size must be between 0 and 4000' (single-field pin, @Size — inferred)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/attempts/structured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...STRUCT_BODY,
        partAnswers: [{ partId: "60000000-0000-0000-0000-000000000001", answerText: "x".repeat(4001) }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("partAnswers[0].answerText: size must be between 0 and 4000");
  });

  test("unauthenticated → Boot 401 with the structured path (captured w3-attempts-structured-post-unauthed-401)", async () => {
    const res = await makeApp(anon).request("/api/v1/attempts/structured", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/attempts/structured");
  });
});

// ── GET /api/v1/learners/me/attempts — AttemptHistoryController (:35-38) ────

describe("GET /api/v1/learners/me/attempts — AttemptHistoryController (:35-38)", () => {
  test("one recorded attempt → 200 canonical AttemptHistoryView, captured assembly (w3-history-after-submit-200)", async () => {
    const res = await makeApp(asStudent, moduleSql({ attemptRows: [ATTEMPT_JOINED_ROW] })).request(
      "/api/v1/learners/me/attempts",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = attemptHistoryViewSchema.parse(body);
    expect(parsed.total).toBe(1);
    expect(parsed.returned).toBe(1);
    expect(parsed.attempts[0]).toEqual({
      attemptId: "519421f0-385f-484d-93ee-f3c426ed86c5",
      questionId: QUESTION_ID,
      questionType: "MCQ_SINGLE",
      externalRef: "SEED-WCH11-001",
      commandWord: "Calculate",
      stemExcerpt: "What is the mass of 0.25 mol of calcium carbonate, CaCO3 (Mr = 100.1)?",
      marksTotal: 1,
      topicNodeId: "20000000-0000-0000-0000-000000000012",
      topicCode: "WCH11-T1.1",
      topicTitle: "Mole calculations and reacting masses",
      correct: false,
      marksAwarded: 0,
      markingState: "AUTO_GRADED",
      evidenceEmitted: true,
      chosenOptionLabel: "A",
      correctOptionLabel: "C",
      implicatedMisconceptionIds: [MISCONCEPTION_ID],
      selfDoubtFlag: false,
      timedCondition: false,
      confidenceLevel: 4,
      responseTimeMs: 25000,
      // JS Date renders ms precision — the captured micros (…304192Z) is the
      // fleet-wide F-1 finding (filed against T-MIG-020, R0-SWEEP-2); the
      // tranche-1 service pin carries the same rendering.
      attemptedAt: "2026-10-05T06:47:12.304Z",
      parts: [],
    });
  });

  test("fresh student → 200 {learnerId, total: 0, returned: 0, attempts: []} (captured w3-history-empty-student-200)", async () => {
    const res = await makeApp(asStudent, moduleSql()).request("/api/v1/learners/me/attempts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ learnerId: LEARNER_ID, total: 0, returned: 0, attempts: [] });
  });

  test("limit=abc → 400 bad_request 'malformed request' (Integer conversion parity, :167-170)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/learners/me/attempts?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("advisory limit: -5 binds then clamps to 50, 1000 to 100, empty binds null → 50 (service clamp law)", async () => {
    const seen: number[] = [];
    const mk = () => moduleSql({ onLimit: (n) => seen.push(n) });
    let res = await makeApp(asStudent, mk()).request("/api/v1/learners/me/attempts?limit=-5");
    expect(res.status).toBe(200);
    res = await makeApp(asStudent, mk()).request("/api/v1/learners/me/attempts?limit=1000");
    expect(res.status).toBe(200);
    res = await makeApp(asStudent, mk()).request("/api/v1/learners/me/attempts?limit=");
    expect(res.status).toBe(200);
    res = await makeApp(asStudent, mk()).request("/api/v1/learners/me/attempts");
    expect(res.status).toBe(200);
    expect(seen).toEqual([50, 100, 50, 50]);
  });

  test("unauthenticated → Boot 401 with the request path (captured w3-attempt-history-unauthed-401)", async () => {
    const res = await makeApp(anon).request("/api/v1/learners/me/attempts");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/learners/me/attempts");
  });
});

// ── E-2 (R0, T-MIG-030 DONE-with-conditions): live evidence wiring ──────────

describe("E-2 — frozenParityEvidencePublisher (live route-factory wiring)", () => {
  test("the live composition wires a CLAIMING publisher (Attempt.java:159-161 domain law)", async () => {
    const { frozenParityEvidencePublisher } = await import("../../src/routes/assessment");
    // claim true -> the service-side guarded flip fires on the live surface,
    // matching the captured attempts[0].evidenceEmitted=true pin
    expect(await frozenParityEvidencePublisher.publishMcq({} as never)).toBe(true);
  });

  test("noopEvidencePublisher stays the 032/033 suppression TEST double (claims false)", async () => {
    const { noopEvidencePublisher } = await import("../../src/services/assessment/submit");
    expect(await noopEvidencePublisher.publishMcq({} as never)).toBe(false);
  });
});
