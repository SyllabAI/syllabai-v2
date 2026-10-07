/**
 * T-MIG-086 route tests (r1c mount band) — the observable HTTP contract of
 * the class-scoped knowledge-graph band (frozen ClassKnowledgeGraphController
 * :37-113 + the ClassAnalyticsController §5 drill-down :66 @ 6cad6ef) over
 * an IN-MEMORY Hono app wiring the REAL ports (services/knowledge/graphs.ts
 * — the 053-t1 F-072/F-034 models — and services/teacher/analytics.ts, the
 * t2 class-intelligence port) over stubbed sql — the T-MIG-079 route-test
 * pattern (test/learner/kg-routes.test.ts).
 *
 * Mounted paths (pinned from the HUB CALLERS — apps/hub/src/lib/api.ts
 * :785-800 teacherClassNodeStudents()/teacherClassLearnerKnowledgeGraph()
 * and :1029-1032 classTopicDrillDown(); the hub runs against the Java core
 * today so its emitted paths are Java-faithful — the r4b census's
 * "/nodes/{nodeId}/students + class-prefix" and "/topics/{nodeId}/drill-down
 * + class-prefix" strings are normalization artifacts, the callers are the
 * law):
 *   GET /api/v1/teacher/classes/{classId}/knowledge-graph/nodes/{nodeId}/students?rootId=
 *   GET /api/v1/teacher/classes/{classId}/learners/{learnerId}/knowledge-graph?rootId=
 *   GET /api/v1/teacher/class/topics/{nodeId}/drill-down?rootId=
 *     (the frozen ClassAnalyticsController's @RequestMapping("/api/v1/teacher
 *     /class") SINGULAR base — the ported service takes NO classId,
 *     analytics.ts :31-35, so a /classes/{classId}/topics/... mount would
 *     be an invented shape)
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (knowledge.ts classNodeStudentsViewSchema, learner.ts
 * learnerKnowledgeGraphViewSchema — the F-034 view the teacher lens
 * DELEGATES to — and teacher.ts topicDrillDownViewSchema; all
 * pre-ratified, zero new wire). Laws pinned here:
 *   - authz shell (SecurityConfig :87 hasAnyRole('TEACHER','ADMIN') parity,
 *     both routers): anonymous → the Boot 401 body with the request path;
 *     a STUDENT → the Boot 403 body — the shell precedes every param law;
 *   - the param laws: missing rootId → 400 validation_failed "missing
 *     required parameter: rootId" (:185-190); malformed classId/nodeId/
 *     learnerId/rootId → 400 bad_request "malformed request" (:167-170) —
 *     all BEFORE any sql;
 *   - the §17 gate ORDER (graphs.ts :22-27): class 404 "class not found" →
 *     ownership 403 "this class belongs to another teacher" → the root's
 *     404-first tree read → the node's subject-isolation 404 "node is not
 *     part of this subject subtree"; the deliberate NO-archived-gate law
 *     on reads;
 *   - the §17 privacy boundary on the learner lens: a non-member (or
 *     disabled) learner is 404 "learner is not a member of this class" and
 *     the membership check short-circuits BEFORE any user lookup (pinned
 *     by query counting);
 *   - the drill-down's hard subject isolation: "curriculum topic in this
 *     subject not found: <id>" (analytics.ts :992-997);
 *   - router hygiene: the class-KG router owns EXACTLY its multi-segment
 *     KG forms at the shared /api/v1/teacher/classes base — the classroom
 *     router's 1-segment /:id CRUD forms are not swallowed.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createClassKgRouter,
  createClassDrillDownRouter,
} from "../../src/routes/knowledgefamily";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  classNodeStudentsViewSchema,
  learnerKnowledgeGraphViewSchema,
  topicDrillDownViewSchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixed-constant uuids (the class-graph/analytics fixture ids) ────────────

const TEACHER = "ee000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ee000000-0000-4000-8000-000000000002";
const CLASS_A = "ec000000-0000-4000-8000-000000000001";
const CLASS_NAME = "10A Chemistry";

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject
const SEC = "ea000000-0000-4000-8000-000000000002";
const SUB = "ea000000-0000-4000-8000-000000000003"; // the drill topic
const SP1 = "ea000000-0000-4000-8000-000000000004";
const SP2 = "ea000000-0000-4000-8000-000000000005";
const CONCEPT = "ea000000-0000-4000-8000-000000000006";
const MISCO = "ea000000-0000-4000-8000-000000000007";
const OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not a node at all

const M_ALICE = "eb000000-0000-4000-8000-000000000001"; // enabled, measured LOW
const M_ZED = "eb000000-0000-4000-8000-000000000006"; // enabled, unmeasured

const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";
const NOW = new Date(NOW_TEXT);
const T0 = new Date("2026-10-01T12:00:00Z");
const CLOCK = { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW };
const ANALYTICS_CLOCK = { newId: () => "7e571d00-0000-4000-8000-000000000002", now: () => T0 };

// ── row factories (the class-graph.test.ts shapes) ──────────────────────────

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  name: CLASS_NAME,
  status: "ACTIVE",
  teacher_id: TEACHER,
  ...over,
});

const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ROOT,
  code: "4CH1",
  node_type: "SUBJECT",
  title: "Chemistry",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: null,
  ...over,
});

const userRow = (id: string, displayName: string, enabled = true) => ({
  id,
  display_name: displayName,
  enabled,
});

const skillRow = (learnerId: string, nodeId: string, mastery: number) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts: 5,
  correct_count: 2,
  last_practiced_at: NOW_TEXT, // FRESH: decayed == mastery (deterministic)
});

// ── shared route shapes ──────────────────────────────────────────────────────

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, name, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const partOfEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/,
  rows,
});

const familyEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/,
  rows,
});

const membersRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select student_id from class_members where class_id = \? ::uuid order by enrolled_at asc$/,
  rows,
});

const usersBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, display_name, enabled from users where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const graphSkillStatesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select learner_id, mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = any\( \? ::uuid\[\]\) and node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const attemptsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select a\.id, a\.learner_id, a\.question_id, q\.external_ref, a\.correct, a\.marks_awarded, q\.marks, a\.marking_state, a\.created_at from attempts a join questions q on q\.id = a\.question_id where \(q\.primary_topic_node_id = \? ::uuid or exists \( select 1 from question_topics qt where qt\.question_id = a\.question_id and qt\.node_id = \? ::uuid\)\) and a\.learner_id = any\( \? ::uuid\[\]\) order by a\.created_at desc limit \?$/,
  rows,
});

const coverageByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
  rows,
});

const membershipRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/,
  rows,
});

const userEnabledRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, enabled from users where id = \? ::uuid$/,
  rows,
});

/** the F-034 read-model routes (learnerGraphFor — the kg-routes.test.ts set). */
function learnerGraphRoutes(): Route[] {
  return [
    nodeByIdRoute([nodeRow()]),
    subtreeRoute([{ id: ROOT }]),
    nodesByIdsRoute([nodeRow()]),
    partOfEdgesRoute([]),
    familyEdgesRoute([]),
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

/** the §5 drill-down routes (the analytics.test.ts tree + evidence sets). */
function drillDownRoutes(): Route[] {
  const node = (id: string, code: string, type: string, title: string) => ({
    id,
    code,
    node_type: type,
    title,
    description: null,
    validation_status: "VALIDATED",
    provenance: "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py",
    applicability: type === "SUBTOPIC" ? { papers: ["1H"] } : null,
  });
  const treeNodes = [
    node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)"),
    node(SEC, "4CH1-S1", "UNIT", "Section 1"),
    node(SUB, "4CH1-S1-a", "TOPIC", "Topic a"),
    node(SP1, "4CH1-S1-a-1", "SUBTOPIC", "Spec point 1"),
    node(SP2, "4CH1-S1-a-2", "SUBTOPIC", "Spec point 2"),
    node(CONCEPT, "C-Alpha", "CONCEPT", "Alpha concept"),
  ];
  const subtreeIds = [ROOT, SEC, SUB, SP1, SP2, CONCEPT];
  return [
    {
      // node404 (knowledge/index.ts) — the 404-first root read
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")],
    },
    {
      // kgNode404 (teacher/kg.ts)
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry (4CH1)" }],
    },
    {
      // kg.ts prerequisiteChain node fetch (4-col bulk)
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: treeNodes.map((n) => ({ id: n.id, code: n.code, node_type: n.node_type, title: n.title })),
    },
    {
      // the recursive PART_OF subtree CTE
      match: /with recursive subtree as/,
      rows: subtreeIds.map((id) => ({ id })),
    },
    {
      // the subtree node rows
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any/,
      rows: treeNodes,
    },
    {
      // PART_OF children edges
      match: /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any/,
      rows: [
        { source_node_id: SEC, target_node_id: ROOT, source_code: "4CH1-S1" },
        { source_node_id: SUB, target_node_id: SEC, source_code: "4CH1-S1-a" },
        { source_node_id: SP1, target_node_id: SUB, source_code: "4CH1-S1-a-1" },
        { source_node_id: SP2, target_node_id: SUB, source_code: "4CH1-S1-a-2" },
        { source_node_id: CONCEPT, target_node_id: SP1, source_code: "C-Alpha" },
      ],
    },
    {
      // the V15 misconception-family fold — MISCO attaches under SP1
      match: /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id/,
      rows: [
        {
          id: MISCO,
          code: "M-Confused-Units",
          node_type: "MISCONCEPTION",
          title: "Units confusion",
          description: null,
          validation_status: "SUGGESTED",
          provenance: CONCEPT,
          applicability: null,
          edge_source_node_id: MISCO,
          edge_target_node_id: SP1,
          source_code: "M-Confused-Units",
        },
      ],
    },
    // ── the evidence tables (all honest-empty: the unmeasured cohort) ──
    { match: /from skill_states/, rows: [] },
    { match: /from misconception_states/, rows: [] },
    { match: /from tutor_topic_engagements/, rows: [] },
    { match: /from review_schedules/, rows: [] },
    { match: /select a\.learner_id as learner_id, count\(\*\) as total/, rows: [] },
    { match: /from exam_papers p/, rows: [] },
    {
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = any/,
      rows: [],
    },
    {
      // kg.ts prerequisiteChain closure CTE — FIRST match
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: [],
    },
    {
      // prerequisiteRelations (the t1 exported derivation, re-run CTE)
      match: /where e\.relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: [],
    },
    {
      // conceptAnchorsWithin (kg.ts — PART_OF sourced at CONCEPT)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: [],
    },
    { match: /select count\(\*\) as n from answers a/, rows: [{ n: 0 }] },
    {
      // activeByTopic candidates (drill-down servable refs)
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = \? or exists \( select 1 from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \? \)\) order by q\.difficulty/,
      rows: [],
    },
    {
      // representative evidence (the §5 raw leg)
      match: /select a\.id as attempt_id, a\.learner_id, a\.correct, a\.marks_awarded, a\.marking_state, a\.created_at, q\.id as question_id, q\.external_ref, q\.marks as question_marks from attempts a join questions q on q\.id = a\.question_id where q\.primary_topic_node_id = \? ::uuid or exists/,
      rows: [],
    },
    {
      // namesFor / findAllById (affected + evidence names)
      match: /select id, display_name from users where id = any/,
      rows: [],
    },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    {
      // the enabled STUDENT cohort (findEnabledByRole)
      match: /from users u\s*join user_roles r on r\.user_id = u\.id\s*where r\.role = 'STUDENT' and u\.enabled = true/,
      rows: [],
    },
  ];
}

// ── app assembly (mirrors index.ts: auth injection + boundary) ──────────────

type AuthFn = (c: Context) => Record<string, unknown> | null;

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const STUDENT_AUTH = {
  email: "student@example.edu",
  userId: M_ZED,
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const anon = () => null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const sql = fakeSql(routes);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  // the two mount bases of record (proposed for index.ts):
  //   /api/v1/teacher/classes — the class-scoped KG pair
  //   /api/v1/teacher/class   — the §5 drill-down (singular, no classId)
  app.route("/api/v1/teacher/classes", createClassKgRouter({ sql, clock: CLOCK }));
  app.route("/api/v1/teacher/class", createClassDrillDownRouter({ sql, clock: ANALYTICS_CLOCK }));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 403 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, sql };
}

const emptyClassTree = (): Route[] => [
  classRoute([classRow()]),
  nodeByIdRoute([nodeRow()]),
  subtreeRoute([{ id: ROOT }]),
  nodesByIdsRoute([nodeRow()]),
  partOfEdgesRoute([]),
  familyEdgesRoute([]),
];

// ── authz shell (SecurityConfig :87 hasAnyRole('TEACHER','ADMIN') parity) ───

describe("authz shell — both class-KG routers", () => {
  test("anonymous node students: Boot 401 body with the request path — the shell precedes the param law", async () => {
    const { app } = makeApp(anon, emptyClassTree());
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students`);
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous drill-down: Boot 401", async () => {
    const { app } = makeApp(anon, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/${SUB}/drill-down?rootId=${ROOT}`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.path).toBe(`/api/v1/teacher/class/topics/${SUB}/drill-down`);
  });

  test("student on node students: Boot 403 Forbidden (hasAnyRole TEACHER,ADMIN)", async () => {
    const { app } = makeApp(() => STUDENT_AUTH, emptyClassTree());
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students`);
  });

  test("student on the learner lens: Boot 403 — a student is never a teacher lens", async () => {
    const { app } = makeApp(() => STUDENT_AUTH, emptyClassTree());
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/learners/${M_ALICE}/knowledge-graph?rootId=${ROOT}`,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  test("student on the drill-down: Boot 403", async () => {
    const { app } = makeApp(() => STUDENT_AUTH, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/${SUB}/drill-down?rootId=${ROOT}`);
    expect(res.status).toBe(403);
  });
});

// ── the param laws (400s short-circuit before any query) ────────────────────

describe("param law — missing/malformed rootId and path UUIDs", () => {
  test("node students, missing rootId: 400 validation_failed 'missing required parameter: rootId' — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
    expect(sql.queries.length).toBe(0);
  });

  test("node students, malformed rootId: 400 bad_request 'malformed request' — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students?rootId=zzz`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(sql.queries.length).toBe(0);
  });

  test("node students, malformed classId: 400 bad_request — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/not-a-uuid/knowledge-graph/nodes/${SUB}/students?rootId=${ROOT}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(sql.queries.length).toBe(0);
  });

  test("node students, malformed nodeId: 400 bad_request — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/zzz/students?rootId=${ROOT}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(sql.queries.length).toBe(0);
  });

  test("learner lens, missing rootId: 400 validation_failed — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/learners/${M_ALICE}/knowledge-graph`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("missing required parameter: rootId");
    expect(sql.queries.length).toBe(0);
  });

  test("learner lens, malformed learnerId: 400 bad_request — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/learners/zzz/knowledge-graph?rootId=${ROOT}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(sql.queries.length).toBe(0);
  });

  test("drill-down, missing rootId: 400 validation_failed — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/${SUB}/drill-down`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("missing required parameter: rootId");
    expect(sql.queries.length).toBe(0);
  });

  test("drill-down, malformed nodeId: 400 bad_request — no sql issued", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/zzz/drill-down?rootId=${ROOT}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(sql.queries.length).toBe(0);
  });
});

// ── node students — the §17 gates then the §13.5 read model ─────────────────

describe("GET /classes/{classId}/knowledge-graph/nodes/{nodeId}/students", () => {
  test("unknown class: 404 not_found 'class not found' (the gate ORDER — before any tree read)", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, [
      classRoute([]),
      nodeByIdRoute([]),
      subtreeRoute([]),
      nodesByIdsRoute([]),
      partOfEdgesRoute([]),
      familyEdgesRoute([]),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("class not found");
  });

  test("another teacher's class: 403 forbidden 'this class belongs to another teacher'", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, [
      classRoute([classRow({ teacher_id: OTHER_TEACHER })]),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUB}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this class belongs to another teacher");
  });

  test("node outside the subtree: 404 'node is not part of this subject subtree' (subject isolation)", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, [
      classRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      subtreeRoute([{ id: ROOT }]),
      nodesByIdsRoute([nodeRow()]), // the requested node resolves to NO structure member
      partOfEdgesRoute([]),
      familyEdgesRoute([]),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${OUTSIDE}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("node is not part of this subject subtree");
  });

  test("200: schema-valid ClassNodeStudentsView — measured sorts before unmeasured, honest empty evidence", async () => {
    const routes: Route[] = [
      classRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      subtreeRoute([{ id: ROOT }]),
      nodesByIdsRoute([nodeRow()]),
      partOfEdgesRoute([]),
      familyEdgesRoute([]),
      membersRoute([{ student_id: M_ALICE }, { student_id: M_ZED }]),
      usersBatchRoute([userRow(M_ALICE, "Alice"), userRow(M_ZED, "Zed")]),
      graphSkillStatesRoute([skillRow(M_ALICE, ROOT, 0.3)]),
      attemptsRoute([]),
      coverageByClassRoute([]),
    ];
    const { app } = makeApp(() => TEACHER_AUTH, routes);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${ROOT}/students?rootId=${ROOT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => classNodeStudentsViewSchema.parse(body)).not.toThrow();
    expect(body.classId).toBe(CLASS_A);
    expect(body.className).toBe(CLASS_NAME);
    expect(body.rootId).toBe(ROOT);
    expect(body.nodeId).toBe(ROOT);
    expect(body.nodeType).toBe("SUBJECT");
    expect(body.learnersEnrolled).toBe(2); // ENABLED members only
    expect(body.asOf).toBe(NOW_ISO); // the ONE injected anchor
    expect(body.coverageState).toBe("unrecorded"); // no coverage rows — grey is ABSENT COVERAGE
    // weakest MEASURED first, unmeasured last — the deterministic sort
    expect(body.students.map((s: { learnerId: string }) => s.learnerId)).toEqual([M_ALICE, M_ZED]);
    const measured = body.students[0];
    expect(measured.displayName).toBe("Alice");
    expect(measured.mastery).toBe(0.3);
    expect(measured.effectiveMastery).toBe(0.3); // fresh practice: decayed == raw
    expect(measured.band).toBe("LOW");
    expect(measured.misconceptions).toEqual([]);
    expect(measured.recentAttempts).toEqual([]);
    const unmeasured = body.students[1];
    expect(unmeasured.mastery).toBeNull();
    expect(unmeasured.effectiveMastery).toBeNull();
    expect(unmeasured.band).toBeNull();
  });
});

// ── the learner lens — the F-034 read model through the class gate ──────────

describe("GET /classes/{classId}/learners/{learnerId}/knowledge-graph", () => {
  test("non-member learner: 404 'learner is not a member of this class' — short-circuits BEFORE the user lookup", async () => {
    const { app, sql } = makeApp(() => TEACHER_AUTH, [
      classRoute([classRow()]),
      membershipRoute([]),
      userEnabledRoute([]), // registered but must NEVER be queried
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/learners/${M_ALICE}/knowledge-graph?rootId=${ROOT}`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("learner is not a member of this class");
    // the privacy boundary: no user lookup happened (no identity probing)
    expect(sql.queries.join("\n")).not.toContain("select id, enabled from users");
  });

  test("200: schema-valid LearnerKnowledgeGraphView — the SAME F-034 read model the student sees", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, [
      classRoute([classRow()]),
      membershipRoute([{ one: 1 }]),
      userEnabledRoute([{ id: M_ALICE, enabled: true }]),
      ...learnerGraphRoutes(),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/learners/${M_ALICE}/knowledge-graph?rootId=${ROOT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => learnerKnowledgeGraphViewSchema.parse(body)).not.toThrow();
    expect(body.learnerId).toBe(M_ALICE);
    expect(body.rootId).toBe(ROOT);
    expect(body.rootCode).toBe("4CH1");
    expect(body.asOf).toBe(NOW_ISO);
    // the honest unmeasured cell — the teacher lens adds gates, never a
    // second graph implementation
    expect(body.nodes.length).toBe(1);
    expect(body.nodes[0].mastery).toBeNull();
    expect(body.nodes[0].band).toBeNull();
    expect(body.prerequisiteEdges).toEqual([]);
  });

  test("disabled member: the SAME indistinguishable 404 (no existence leak)", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, [
      classRoute([classRow()]),
      membershipRoute([{ one: 1 }]),
      userEnabledRoute([{ id: M_ALICE, enabled: false }]),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/learners/${M_ALICE}/knowledge-graph?rootId=${ROOT}`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("learner is not a member of this class");
  });
});

// ── the §5 drill-down — the class-intelligence surface (no classId) ─────────

describe("GET /class/topics/{nodeId}/drill-down — class → topic → learners → evidence", () => {
  test("200: schema-valid TopicDrillDownView — the honest unmeasured cohort", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/${SUB}/drill-down?rootId=${ROOT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => topicDrillDownViewSchema.parse(body)).not.toThrow();
    expect(body.rootId).toBe(ROOT);
    expect(body.topic.nodeId).toBe(SUB);
    expect(body.topic.code).toBe("4CH1-S1-a");
    // honest absence: nobody measured, nothing fabricated
    expect(body.topic.learnersMeasured).toBe(0);
    expect(body.topic.meanMastery).toBeNull();
    expect(body.topic.masteryBand).toBe("UNMEASURED");
    expect(body.affectedLearners).toEqual([]);
    expect(body.representativeEvidence).toEqual([]);
    expect(body.prerequisiteChain).toEqual([]);
    expect(body.servableQuestions).toEqual([]);
  });

  test("topic outside the subtree: 404 'curriculum topic in this subject not found: {id}' (hard isolation)", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, drillDownRoutes());
    const res = await app.request(`/api/v1/teacher/class/topics/${OUTSIDE}/drill-down?rootId=${ROOT}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe(`curriculum topic in this subject not found: ${OUTSIDE}`);
  });
});

// ── router hygiene at the SHARED /api/v1/teacher/classes base ───────────────

describe("router hygiene — the classroom router's CRUD forms stay unclaimed", () => {
  test("the 1-segment /:id detail path is NOT swallowed by the class-KG router", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    // the classroom router (registered before this band's mounts in the
    // real app) owns GET /:id — here the bare test app proves THIS router
    // never claims it (unmatched → the 404-after-auth posture's 404)
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}`);
    expect(res.status).toBe(404);
  });

  test("the 2-segment /:id/status form is NOT swallowed either", async () => {
    const { app } = makeApp(() => TEACHER_AUTH, emptyClassTree());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/status`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
