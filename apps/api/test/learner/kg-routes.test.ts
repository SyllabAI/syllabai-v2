/**
 * T-MIG-079 route tests (r3a) — the observable HTTP contract of
 * LearnerStateController GET /api/v1/learners/me/knowledge-graph
 * (frozen :178-183) and SmartLessonController GET
 * /api/v1/learners/me/smart-lesson (frozen :28-38), over an IN-MEMORY Hono
 * app wiring the REAL services (the lane's own t1 F-034 port +
 * t4 deterministic ladder) over stubbed sql (no Neon) — the T-MIG-021/041
 * route-test pattern.
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (learnerKnowledgeGraphViewSchema learner.ts :440 /
 * smartLessonViewSchema :583 — both pre-ratified, zero new wire) and
 * key-pinned against the frozen DTO records @ 6cad6ef. Error envelopes are
 * pinned to the W4 captured shapes:
 *   - w4-knowledge-graph-unauthed-401 / w4-smart-lesson-unauthed-401: the
 *     Boot body with the request path (timestamp tolerated);
 *   - w4-smart-lesson-missing-params-400: 400 validation_failed
 *     "missing required parameter: rootId" — checked in SIGNATURE order
 *     (rootId declared FIRST in the frozen controller, so a both-params-
 *     missing request reports rootId, never topicNodeId);
 *   - w4-smart-lesson-unknown-topic-404: 404 not_found "curriculum topic
 *     in this subject {id} not found" (the hard-isolation law, verbatim);
 *   - the malformed-UUID law: 400 bad_request "malformed request"
 *     (GlobalExceptionHandler :167-170 MethodArgumentTypeMismatch parity).
 *
 * Determinism: both services' clocks are pinned (KG NOW / lesson T0) —
 * every asOf/decay value in these tests is exact (ADR-031: computed on the
 * read, never persisted). The param-law tests additionally pin that NO sql
 * was issued (the 400s short-circuit before any query — the route owns the
 * law, the service never sees a malformed request).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLearnerKgRouter } from "../../src/routes/learnerkg";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  learnerKnowledgeGraphViewSchema,
  smartLessonViewSchema,
} from "@syllabai/contracts";
import type { ClassGraphDeps } from "../../src/services/knowledge";
import type { SmartLessonDeps } from "../../src/services/learner/smart-lesson";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (seed-shaped; replay-stable) ───────────────────────

const LEARNER = "00000000-0000-4000-8000-000000000041";
const KG_ROOT = "ea000000-0000-4000-8000-000000000001"; // the 4CH1 subject
const KG_OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not a node at all

// the smart-lesson fixture ids (the t4 test's constants, reused verbatim)
const SL_ROOT = "fa000000-0000-4000-8000-000000000001";
const SL_SEC = "fa000000-0000-4000-8000-000000000002";
const SL_TOPIC1 = "fa000000-0000-4000-8000-000000000003";
const SL_TP2 = "fa000000-0000-4000-8000-000000000004";
const SL_PR1 = "fa000000-0000-4000-8000-000000000005";
const SL_Q1 = "fc000000-0000-4000-8000-000000000001";
const SL_Q2 = "fc000000-0000-4000-8000-000000000002";
const SL_GHOST = "fa000000-0000-4000-8000-000000000099"; // outside the subtree

const NOW = new Date("2026-10-06T08:00:00Z");
const NOW_ISO = "2026-10-06T08:00:00.000Z";
const T0 = new Date("2026-10-01T12:00:00Z");

// ── KG fixtures (the class-graph.test.ts route shapes, minimal happy set) ───

const kgNodeRow = () => ({
  id: KG_ROOT,
  code: "4CH1",
  node_type: "SUBJECT",
  title: "Chemistry",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: null,
});

function kgRoutes(): Route[] {
  return [
    {
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
      rows: [kgNodeRow()],
    },
    {
      match:
        /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
      rows: [{ id: KG_ROOT }],
    },
    {
      match:
        /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
      rows: [kgNodeRow()],
    },
    {
      match:
        /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/,
      rows: [],
    },
    {
      match:
        /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/,
      rows: [],
    },
    {
      match:
        /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states where learner_id = \? order by last_practiced_at desc$/,
      rows: [],
    },
    {
      match:
        /select misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = \? order by probability desc$/,
      rows: [],
    },
    {
      match:
        /select node_id, due_at, reason from review_schedules where learner_id = \? and status = \? order by due_at asc$/,
      rows: [],
    },
    {
      match:
        /select e\.source_node_id, e\.target_node_id from knowledge_edges e where e\.relation_type = 'REQUIRES_PREREQUISITE' and e\.source_node_id = any\( \? ::uuid\[\]\) and e\.target_node_id = any\( \? ::uuid\[\]\)$/,
      rows: [],
    },
  ];
}

// ── smart-lesson fixtures (the t4 test's routes()/question(), rung-7) ───────

const slNode = (id: string, code: string, type: string, title: string) => ({
  id,
  code,
  node_type: type,
  title,
});

const SL_TREE_NODES = [
  slNode(SL_ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)"),
  slNode(SL_SEC, "4CH1-S1", "UNIT", "Section 1"),
  slNode(SL_TOPIC1, "4CH1-S1-a", "TOPIC", "Topic a"),
  slNode(SL_TP2, "4CH1-S1-b", "TOPIC", "Topic b"),
  slNode(SL_PR1, "4CH1-S1-a0", "TOPIC", "Prerequisite topic"),
];

const slQuestion = (id: string, topicId: string, difficulty: number) => ({
  id,
  external_ref: "Q-" + id.slice(-2),
  question_type: "MCQ_SINGLE",
  stem: "s",
  marks: 1,
  difficulty,
  expected_time_seconds: 60,
  command_word: null,
  primary_topic_node_id: topicId,
  exam_paper_id: "fd000000-0000-4000-8000-000000000001",
  provenance: null,
  active: true,
});

function slRoutes(servable: Array<Record<string, unknown>>): Route[] {
  return [
    { match: /select id from knowledge_nodes where id = \?$/, rows: [{ id: SL_ROOT }] },
    { match: /with recursive subtree as/i, rows: SL_TREE_NODES.map((n) => ({ id: n.id })) },
    {
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: SL_TREE_NODES,
    },
    {
      match: /select source_node_id, target_node_id from knowledge_edges where relation_type = 'PART_OF'/,
      rows: [
        { source_node_id: SL_SEC, target_node_id: SL_ROOT },
        { source_node_id: SL_TOPIC1, target_node_id: SL_SEC },
        { source_node_id: SL_TP2, target_node_id: SL_SEC },
        { source_node_id: SL_PR1, target_node_id: SL_SEC },
      ],
    },
    {
      match: /select e\.source_node_id, e\.target_node_id, e\.relation_type, n\.code as source_code, n\.title as source_title, n\.node_type as source_type from knowledge_edges e join knowledge_nodes n on n\.id = e\.source_node_id/,
      rows: [],
    },
    {
      match: /select source_node_id, target_node_id from knowledge_edges where relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: [],
    },
    {
      match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states/,
      rows: [],
    },
    {
      match: /select misconception_node_id, probability, evidence_count, last_evidence_at from misconception_states/,
      rows: [],
    },
    {
      match: /select node_id, due_at from review_schedules where learner_id = \? ::uuid and status = 'PENDING'/,
      rows: [],
    },
    {
      match: /select node_id, occurred_at, refused, signal_type from tutor_topic_engagements/,
      rows: [],
    },
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = \? or exists \( select 1 from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \? \)\) order by q\.difficulty/,
      rows: servable,
    },
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = any\( \? ::uuid\[\]\) or exists/,
      rows: [],
    },
    {
      match: /select distinct question_id from attempts where learner_id = \? ::uuid and question_id = any\( \? ::uuid\[\]\)/,
      rows: [],
    },
    { match: /from exam_papers p/, rows: [] },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    { match: /from question_versions/, rows: [] },
  ];
}

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(
  auth: AuthFn,
  graphRoutes: Route[],
  lessonRoutes: Route[],
) {
  const graph: ClassGraphDeps = {
    sql: fakeSql(graphRoutes),
    clock: { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW },
  };
  const lesson: SmartLessonDeps = {
    sql: fakeSql(lessonRoutes),
    clock: { newId: () => "7e571d00-0000-4000-8000-000000000002", now: () => T0 },
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/learners/me", createLearnerKgRouter({ graph, lesson }));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, graph, lesson };
}

const STUDENT = {
  email: "student@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const asStudent = () => STUDENT;
const anon = () => null;

const emptyKg = () => kgRoutes();
const emptySl = () => slRoutes([]);

// ── authz shell (SecurityConfig anyRequest().authenticated() parity) ────────

describe("GET /api/v1/learners/me/knowledge-graph — authz shell", () => {
  test("anonymous: Boot 401 body with the request path (w4-knowledge-graph-unauthed-401)", async () => {
    const { app } = makeApp(anon, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/knowledge-graph?rootId=" + KG_ROOT);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/learners/me/knowledge-graph");
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous smart-lesson: Boot 401 (w4-smart-lesson-unauthed-401)", async () => {
    const { app } = makeApp(anon, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/smart-lesson");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.path).toBe("/api/v1/learners/me/smart-lesson");
  });

  test("anonymous with MISSING params: the shell precedes the param law (401, never 400)", async () => {
    const { app } = makeApp(anon, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/smart-lesson");
    expect(res.status).toBe(401);
  });

  test("the router owns EXACTLY its two paths — other learner-me paths are not swallowed", async () => {
    const { app } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/state");
    expect(res.status).toBe(404); // falls through (the bare test app has no fallback router)
  });
});

// ── KG: the param laws (400s short-circuit before any query) ─────────────────

describe("GET /knowledge-graph — param law", () => {
  test("missing rootId: 400 validation_failed 'missing required parameter: rootId' — no sql issued", async () => {
    const { app, graph } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/knowledge-graph");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
    expect((graph.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("malformed rootId: 400 bad_request 'malformed request' — no sql issued", async () => {
    const { app, graph } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/knowledge-graph?rootId=not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect((graph.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

// ── KG: the 200 read model + the 404-first tree law ──────────────────────────

describe("GET /knowledge-graph — the F-034 read model over HTTP", () => {
  test("student: 200, canonical-schema-valid, frozen key parity, honest all-null root", async () => {
    const { app } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/knowledge-graph?rootId=" + KG_ROOT);
    expect(res.status).toBe(200);
    const body = await res.json();
    // the canonical wire (learner.ts :440) — parse throws on any drift
    expect(() => learnerKnowledgeGraphViewSchema.parse(body)).not.toThrow();
    expect(body.learnerId).toBe(LEARNER);
    expect(body.rootId).toBe(KG_ROOT);
    expect(body.rootCode).toBe("4CH1");
    expect(body.rootTitle).toBe("Chemistry");
    expect(body.asOf).toBe(NOW_ISO); // the ONE injected anchor
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.nodes.length).toBe(1);
    const root = body.nodes[0];
    // the honest unmeasured cell — never zeros, never a fabricated band
    expect(root.id).toBe(KG_ROOT);
    expect(root.mastery).toBeNull();
    expect(root.effectiveMastery).toBeNull();
    expect(root.band).toBeNull();
    expect(root.attempts).toBeNull();
    expect(root.correctCount).toBeNull();
    expect(root.lastPracticedAt).toBeNull();
    expect(root.proceduralFluencyGap).toBeNull();
    expect(root.reviewDueAt).toBeNull();
    expect(root.reviewReason).toBeNull();
    expect(root.misconceptionProbability).toBeNull();
    expect(root.misconceptionActive).toBeNull();
    // the drawable edges ride at the top level (capture key parity)
    expect(body.prerequisiteEdges).toEqual([]);
  });

  test("unknown root: 404 not_found 'knowledge node {id} not found' (the tree read's 404-first law)", async () => {
    // the node-by-id read returns EMPTY rows — the service (not the stub)
    // throws the 404-first KnowledgeNotFoundError
    const emptyRoot = (): Route[] => [
      {
        match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
        rows: [],
      },
    ];
    const { app } = makeApp(asStudent, emptyRoot(), emptySl());
    const res = await app.request("/api/v1/learners/me/knowledge-graph?rootId=" + KG_OUTSIDE);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("knowledge node " + KG_OUTSIDE + " not found");
  });
});

// ── smart-lesson: the param laws in signature order ──────────────────────────

describe("GET /smart-lesson — param law (signature order: rootId FIRST)", () => {
  test("no params at all: 400 names rootId, never topicNodeId (w4-smart-lesson-missing-params-400 verbatim)", async () => {
    const { app, lesson } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/smart-lesson");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
    expect((lesson.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("rootId present, topicNodeId missing: 400 names topicNodeId (the second declared param)", async () => {
    const { app, lesson } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/smart-lesson?rootId=" + SL_ROOT);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: topicNodeId");
    expect((lesson.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("malformed topicNodeId: 400 bad_request 'malformed request'", async () => {
    const { app, lesson } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request("/api/v1/learners/me/smart-lesson?rootId=" + SL_ROOT + "&topicNodeId=zzz");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect((lesson.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

// ── smart-lesson: the deterministic ladder over HTTP ─────────────────────────

describe("GET /smart-lesson — the ladder + the hard isolation", () => {
  test("student, rung 7 (no evidence): 200 PRACTISE_QUESTIONS / INSUFFICIENT_COVERAGE, schema-valid", async () => {
    const { app } = makeApp(
      asStudent,
      emptyKg(),
      slRoutes([slQuestion(SL_Q1, SL_TOPIC1, 1), slQuestion(SL_Q2, SL_TOPIC1, 2)]),
    );
    const res = await app.request(
      "/api/v1/learners/me/smart-lesson?rootId=" + SL_ROOT + "&topicNodeId=" + SL_TOPIC1,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // the canonical wire (learner.ts :583) — parse throws on any drift
    expect(() => smartLessonViewSchema.parse(body)).not.toThrow();
    expect(body.learnerId).toBe(LEARNER);
    expect(body.rootId).toBe(SL_ROOT);
    expect(body.topicNodeId).toBe(SL_TOPIC1);
    expect(body.policy).toBe("smart-lesson/v2"); // the deterministic marker — NO LLM in the loop
    expect(body.action.actionType).toBe("PRACTISE_QUESTIONS");
    expect(body.action.reasonCode).toBe("INSUFFICIENT_COVERAGE");
    expect(body.action.targetNodeId).toBe(SL_TOPIC1);
    expect(body.action.servableQuestionCount).toBe(2);
    expect(body.action.reasonDetail).toContain("No attempt evidence on 4CH1-S1-a yet");
    // the topic-status snapshot keys (capture parity)
    expect(body.topicStatus.coverage).toBe("UNMEASURED");
    expect(body.topicStatus.attempts).toBe(0);
    expect(body.topicStatus.mastery).toBeNull();
    expect(body.topicStatus.tutorAsks).toBe(0);
    expect(body.topicStatus.servableQuestions).toBe(2);
  });

  test("topic outside the subtree: 404 not_found 'curriculum topic in this subject {id} not found' (verbatim capture)", async () => {
    const { app } = makeApp(asStudent, emptyKg(), emptySl());
    const res = await app.request(
      "/api/v1/learners/me/smart-lesson?rootId=" + SL_ROOT + "&topicNodeId=" + SL_GHOST,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("curriculum topic in this subject " + SL_GHOST + " not found");
  });
});
