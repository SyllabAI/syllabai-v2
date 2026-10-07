/**
 * T-MIG-082 tranche-1 route tests (r4b) — the observable HTTP contract of
 * the TEACHER/ADMIN band: TeachingCoverageController
 * (/api/v1/teacher/classes/{classId}/coverage, frozen :56-192), Class-
 * KnowledgeGraphController (…/{classId}/knowledge-graph, frozen :37-113)
 * and TeacherConceptGraphController (/api/v1/teacher/concept-graph,
 * frozen :39-137), over an IN-MEMORY Hono app wiring the REAL T-MIG-053
 * tranche-1/t2 services over stubbed sql (no Neon) — the T-MIG-079
 * route-test pattern; fixtures mirror test/knowledge/{knowledge,class-
 * graph}.test.ts shapes (reused verbatim, never re-declared law).
 *
 * Pinned laws:
 *   - the M5 shells: every path answers the Boot 401 body anon and the
 *     Boot 403 body for an authenticated STUDENT (the class-level
 *     @PreAuthorize hasAnyRole('TEACHER','ADMIN') + SecurityConfig route
 *     rule, the classroom.ts precedent) BEFORE any handler work;
 *   - the UUID param laws ({classId}/{specPointNodeId}/{nodeId}/
 *     {learnerId} + the rootId query): malformed → 400 bad_request
 *     "malformed request", missing rootId → 400 validation_failed
 *     "missing required parameter: rootId" — with NO sql issued;
 *   - the PUT @Valid-before-body law: {} → 400 validation_failed "status:
 *     must not be blank"; a 501-char note → 400 validation_failed "note:
 *     size must be between 0 and 500"; an unreadable body → 400
 *     bad_request "request body is not readable (check field types and
 *     enum values)" (GlobalExceptionHandler :175-180); the SEMANTIC
 *     status parse stays in the service ("status must be 'taught' or
 *     'not-taught'");
 *   - the §17 ownership gate through the wire: another teacher's class →
 *     403 "this class belongs to another teacher"; unknown class → 404
 *     "class not found"; archived → 409 conflict;
 *   - the idempotent identical re-mark: 200 with NO insert/update/event;
 *   - the concept pair: activate 200 (seedSummarySchema-valid; the
 *     idempotent re-run exercises the TRUE reuse path via the materializing
 *     store fixture exported from concept-graph.test.ts) and the loud 409
 *     on the subject/root provenance mismatch; /edges 200 with the
 *     concept-graph-teacher/v1 policy marker and the deterministic order.
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (knowledge.ts / teacher.ts / learner.ts — pre-ratified, zero new
 * wire). Determinism: the shared fixed clock (ADR-031).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createTeacherClassesKgRouter,
  createTeacherConceptGraphRouter,
} from "../../src/routes/teacher-kg";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  coverageRowViewSchema,
  coverageEventViewSchema,
  classKnowledgeGraphViewSchema,
  classNodeStudentsViewSchema,
} from "@syllabai/contracts";
import { learnerKnowledgeGraphViewSchema } from "@syllabai/contracts";
import {
  conceptGraphEdgesViewSchema,
  seedSummarySchema,
} from "@syllabai/contracts";
import type { KnowledgeDeps } from "../../src/services/knowledge";
import type { SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";
import { seedRoutes } from "./concept-graph.test";

// ── fixed-constant uuids (the knowledge/class-graph fleet, reused) ──────────

const TEACHER = "ee000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ee000000-0000-4000-8000-000000000002";
const CLASS_A = "ec000000-0000-4000-8000-000000000001";
const CLASS_NAME = "10A Chemistry";
const SUBJECT = "ea000000-0000-4000-8000-000000000001"; // root, code 4CH1
const UNIT = "ea000000-0000-4000-8000-000000000002";
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004"; // spec point (applicability)
const SUBTOPIC_2 = "ea000000-0000-4000-8000-000000000005";
const MISCO_1 = "ea000000-0000-4000-8000-000000000006";
const PREREQ_A = "ea000000-0000-4000-8000-000000000007";
const CONCEPT = "ea000000-0000-4000-8000-000000000009";
const MISCO_2 = "ea000000-0000-4000-8000-00000000000a";
const MISCO_3 = "ea000000-0000-4000-8000-00000000000b";
const OUTSIDE = "ea000000-0000-4000-8000-000000000012";

const M_ALICE = "eb000000-0000-4000-8000-000000000001";
const M_BOB = "eb000000-0000-4000-8000-000000000002";
const M_CAROL = "eb000000-0000-4000-8000-000000000003";
const M_ZED = "eb000000-0000-4000-8000-000000000006";
const M_ANN = "eb000000-0000-4000-8000-000000000007";

const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-02T10:00:00Z";
const T4 = "2026-10-05T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const STALE = "2026-08-01T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};
const deps = (routes: Route[]): KnowledgeDeps => ({ sql: fakeSql(routes), clock });

// ── row factories (knowledge.test.ts / class-graph.test.ts shapes) ──────────

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  name: CLASS_NAME,
  status: "ACTIVE",
  teacher_id: TEACHER,
  ...over,
});

const APPLICABILITY = { papers: ["1CH1"], tier: "foundation" };

const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SUBJECT,
  code: "4CH1",
  node_type: "SUBJECT",
  title: "Chemistry",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: null,
  ...over,
});

const coverageRow = (over: Partial<Record<string, unknown>> = {}) => ({
  class_id: CLASS_A,
  spec_point_node_id: SUBTOPIC,
  status: "TAUGHT",
  marked_by: TEACHER,
  marked_at: T1,
  note: null,
  created_at: T0,
  ...over,
});

const memberRow = (studentId: string) => ({
  id: `ef000000-0000-4000-8000-0000000000${studentId.slice(-2)}`,
  class_id: CLASS_A,
  student_id: studentId,
});

const userRow = (id: string, displayName: string, enabled = true) => ({
  id,
  display_name: displayName,
  enabled,
});

const skillRow = (learnerId: string, mastery: number, attempts: number, correct: number) => ({
  learner_id: learnerId,
  node_id: SUBTOPIC,
  mastery,
  attempts,
  correct_count: correct,
  last_practiced_at: NOW_TEXT,
});

const miscoRow = (learnerId: string, nodeId: string, probability: number, lastEvidenceAt: string) => ({
  learner_id: learnerId,
  misconception_node_id: nodeId,
  probability,
  last_evidence_at: lastEvidenceAt,
});

const attemptRow = (id: string, learnerId: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  learner_id: learnerId,
  question_id: `e1000000-0000-4000-8000-${id.slice(-12)}`,
  external_ref: "QMA-011",
  correct: true,
  marks_awarded: 2,
  marks: 3,
  marking_state: "SMART_MARKED",
  created_at: T4,
  ...over,
});

// ── the curriculum under test (class-graph.test.ts) ──────────────────────────

const SUBTREE_IDS = [SUBJECT, UNIT, TOPIC, PREREQ_A, SUBTOPIC, CONCEPT, SUBTOPIC_2];

const nodeRows: Array<Record<string, unknown>> = [
  nodeRow(),
  nodeRow({ id: UNIT, code: "4CH1/1", node_type: "UNIT", title: "Bonding" }),
  nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", title: "Ionic bonding" }),
  nodeRow({ id: PREREQ_A, code: "4CH1/0.1", node_type: "SUBTOPIC", title: "Prior maths", applicability: APPLICABILITY }),
  nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", node_type: "SUBTOPIC", title: "Titration", applicability: APPLICABILITY }),
  nodeRow({ id: CONCEPT, code: "4CH1/1.1a.1", node_type: "CONCEPT", title: "Mole ratio" }),
  nodeRow({ id: SUBTOPIC_2, code: "4CH1/1.1b", node_type: "SUBTOPIC", title: "Half equations" }),
];

const partOfEdges = [
  { source_node_id: UNIT, target_node_id: SUBJECT, source_code: "4CH1/1" },
  { source_node_id: TOPIC, target_node_id: UNIT, source_code: "4CH1/1.1" },
  { source_node_id: PREREQ_A, target_node_id: TOPIC, source_code: "4CH1/0.1" },
  { source_node_id: SUBTOPIC, target_node_id: TOPIC, source_code: "4CH1/1.1a" },
  { source_node_id: CONCEPT, target_node_id: SUBTOPIC, source_code: "4CH1/1.1a.1" },
  { source_node_id: SUBTOPIC_2, target_node_id: TOPIC, source_code: "4CH1/1.1b" },
];

const familyEdges = [
  { ...nodeRow({ id: MISCO_1, code: "MSC/1", node_type: "MISCONCEPTION", title: "Inverts the ratio" }), edge_source_node_id: MISCO_1, edge_target_node_id: SUBTOPIC, source_code: "MSC/1" },
  { ...nodeRow({ id: MISCO_2, code: "MSC/2", node_type: "MISCONCEPTION", title: "Adds charges wrong" }), edge_source_node_id: MISCO_2, edge_target_node_id: TOPIC, source_code: "MSC/2" },
];

const coverageRows = [
  { class_id: CLASS_A, spec_point_node_id: SUBTOPIC, status: "TAUGHT", marked_by: TEACHER, marked_at: T1, note: null, created_at: T0 },
  { class_id: CLASS_A, spec_point_node_id: PREREQ_A, status: "NOT_TAUGHT", marked_by: TEACHER, marked_at: T1, note: null, created_at: T0 },
];

// ── route shapes (knowledge.test.ts — the coverage family) ───────────────────

const ownedClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const coverageByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
  rows,
});

const coverageOneRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid and spec_point_node_id = \? ::uuid$/,
  rows,
});

const coverageEventsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select status, previous_status, actor_id, note, created_at from teaching_coverage_events where class_id = \? ::uuid and spec_point_node_id = \? ::uuid order by created_at desc$/,
  rows,
});

const insertCoverageRoute = (log: string[]): Route => ({
  match: /^insert into teaching_coverage \(class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(`row:${params[2]}:${params[6]}`);
    return [];
  },
});

const insertEventRoute = (log: string[]): Route => ({
  match: /^insert into teaching_coverage_events \(id, class_id, spec_point_node_id, status, previous_status, actor_id, note, created_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(`event:${params[3]}:prev=${params[4] ?? "null"}`);
    return [];
  },
});

const updateCoverageRoute = (log: string[]): Route => ({
  match: /^update teaching_coverage set status/,
  rows: [],
  rowsFor: (params) => {
    log.push(`update:${params[0]}`);
    return [];
  },
});

// ── route shapes (class-graph.test.ts — the class-KG family) ─────────────────

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, name, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
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
    /select learner_id, node_id, mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = any\( \? ::uuid\[\]\) and node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const miscoBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select learner_id, misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = any\( \? ::uuid\[\]\) and misconception_node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const edgesWithinRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select e\.source_node_id, e\.target_node_id from knowledge_edges e where e\.relation_type = 'REQUIRES_PREREQUISITE' and e\.source_node_id = any\( \? ::uuid\[\]\) and e\.target_node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const nodeSkillStatesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select learner_id, mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = any\( \? ::uuid\[\]\) and node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const attemptsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select a\.id, a\.learner_id, a\.question_id, q\.external_ref, a\.correct, a\.marks_awarded, q\.marks, a\.marking_state, a\.created_at from attempts a join questions q on q\.id = a\.question_id where \(q\.primary_topic_node_id = \? ::uuid or exists \( select 1 from question_topics qt where qt\.question_id = a\.question_id and qt\.node_id = \? ::uuid\)\) and a\.learner_id = any\( \? ::uuid\[\]\) order by a\.created_at desc limit \?$/,
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

const skillsByLearnerRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states where learner_id = \? order by last_practiced_at desc$/,
  rows,
});

const miscoByLearnerRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = \? order by probability desc$/,
  rows,
});

const reviewsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select node_id, due_at, reason from review_schedules where learner_id = \? and status = \? order by due_at asc$/,
  rows,
});

/** the full heatmap happy set (class-graph.test.ts graphRoutes). */
const graphRoutes = (): Route[] => [
  classRoute([classRow()]),
  nodeByIdRoute([nodeRow()]),
  subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
  nodesByIdsRoute(nodeRows),
  partOfEdgesRoute(partOfEdges),
  familyEdgesRoute(familyEdges),
  membersRoute([M_ALICE, M_BOB, M_CAROL, M_ZED, M_ANN].map(memberRow)),
  usersBatchRoute([
    userRow(M_ALICE, "Alice"),
    userRow(M_BOB, "Bob"),
    userRow(M_CAROL, "Carol", false),
    userRow(M_ZED, "Zed"),
    userRow(M_ANN, "Ann"),
  ]),
  graphSkillStatesRoute([skillRow(M_ALICE, 0.2, 4, 1), skillRow(M_BOB, 0.9, 10, 9)]),
  miscoBatchRoute([
    miscoRow(M_ALICE, MISCO_1, 0.55, NOW_TEXT),
    miscoRow(M_BOB, MISCO_1, 0.55, STALE),
    miscoRow(M_ALICE, MISCO_2, 0.7, NOW_TEXT),
  ]),
  coverageByClassRoute(coverageRows),
  edgesWithinRoute([
    { source_node_id: SUBTOPIC, target_node_id: PREREQ_A },
    { source_node_id: SUBJECT, target_node_id: OUTSIDE },
  ]),
];

const learnerKgRoutes = (learner: string): Route[] => [
  classRoute([classRow()]),
  membershipRoute([{ one: 1 }]),
  userEnabledRoute([{ id: learner, enabled: true }]),
  nodeByIdRoute([nodeRow()]),
  subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
  nodesByIdsRoute(nodeRows),
  partOfEdgesRoute(partOfEdges),
  familyEdgesRoute(familyEdges),
  skillsByLearnerRoute([{ ...skillRow(learner, 0.2, 4, 1), procedural_fluency_gap: 0.12 }]),
  miscoByLearnerRoute([
    miscoRow(learner, MISCO_2, 0.7, NOW_TEXT),
    miscoRow(learner, MISCO_1, 0.55, NOW_TEXT),
  ]),
  reviewsRoute([
    { node_id: TOPIC, due_at: T0, reason: "TEACHER_ASSIGNED" },
    { node_id: TOPIC, due_at: T1, reason: "DECAY_CROSSED_THRESHOLD" },
    { node_id: SUBTOPIC, due_at: T1, reason: "DECAY_CROSSED_THRESHOLD" },
  ]),
  edgesWithinRoute([{ source_node_id: SUBTOPIC, target_node_id: PREREQ_A }]),
];

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + boundary) ─

type AuthFn = (c: Context) => Record<string, unknown> | null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createTeacherClassesKgRouter(deps(routes)));
  app.route("/api/v1/teacher/concept-graph", createTeacherConceptGraphRouter(deps(routes)));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 403 | 404 | 409);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return app;
}

const TEACHER_AUTH = {
  email: "teacher@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
};
const asTeacher = () => TEACHER_AUTH;
const anon = () => null;
const asStudent = () => ({
  email: "student@example.edu",
  userId: M_ALICE,
  roles: ["STUDENT"],
  tokenVersion: 1,
});

// ── the M5 shell + param laws (all ten paths) ────────────────────────────────

describe("the TEACHER/ADMIN band — shells + param laws", () => {
  test("anonymous → Boot 401 with the request path, before any work", async () => {
    const app = makeApp(anon, [ownedClassRoute([])]);
    for (const path of [
      `/api/v1/teacher/classes/${CLASS_A}/coverage`,
      `/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}/history`,
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`,
      `/api/v1/teacher/concept-graph/edges?rootId=${SUBJECT}`,
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path.split("?")[0]);
    }
  });

  test("authenticated STUDENT → Boot 403 (the class-level @PreAuthorize parity)", async () => {
    const app = makeApp(asStudent, [ownedClassRoute([])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
    const act = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(act.status).toBe(403);
  });

  test("malformed classId → 400 'malformed request' with NO sql issued", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/classes/bogus/coverage");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("missing rootId → 400 validation_failed 'missing required parameter: rootId'", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });

  test("malformed rootId → 400 'malformed request'; malformed nodeId/learnerId likewise", async () => {
    const app = makeApp(asTeacher, []);
    expect(
      (await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph?rootId=zzz`)).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/zzz/students?rootId=${SUBJECT}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/learners/zzz/knowledge-graph?rootId=${SUBJECT}`,
        )
      ).status,
    ).toBe(400);
    expect((await app.request("/api/v1/teacher/concept-graph/edges?rootId=zzz")).status).toBe(400);
  });
});

// ── TeachingCoverage (3 endpoints) ───────────────────────────────────────────

describe("GET /api/v1/teacher/classes/{classId}/coverage", () => {
  test("happy path: recorded rows only, spec_point_node_id asc (canonical schema)", async () => {
    const app = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      coverageByClassRoute(coverageRows),
      nodesByIdsRoute([
        nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", node_type: "SUBTOPIC", title: "Titration", applicability: APPLICABILITY }),
        nodeRow({ id: PREREQ_A, code: "4CH1/0.1", node_type: "SUBTOPIC", title: "Prior maths", applicability: APPLICABILITY }),
      ]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(2);
    for (const row of body) {
      expect(coverageRowViewSchema.safeParse(row).success).toBe(true);
    }
    expect(body[0].specPointNodeId).toBe(SUBTOPIC); // asc order — 1.1a before 0.1? no: id-asc
    expect(body[0].status).toBe("taught"); // the canonical kebab wire form
  });

  test("another teacher's class → 403 'this class belongs to another teacher' (§17)", async () => {
    const app = makeApp(asTeacher, [ownedClassRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("this class belongs to another teacher");
  });

  test("unknown class → 404 'class not found'", async () => {
    const app = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("class not found");
  });
});

describe("GET …/coverage/{specPointNodeId}/history", () => {
  test("happy path: the append-only trail, newest first (canonical schema)", async () => {
    const app = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      coverageEventsRoute([
        // the repo returns them `order by created_at desc` — served post-ORDER
        { status: "NOT_TAUGHT", previous_status: "TAUGHT", actor_id: TEACHER, note: "swap", created_at: T1 },
        { status: "TAUGHT", previous_status: null, actor_id: TEACHER, note: null, created_at: T0 },
      ]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}/history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(2);
    for (const ev of body) {
      expect(coverageEventViewSchema.safeParse(ev).success).toBe(true);
    }
    expect(body[0].createdAt >= body[1].createdAt).toBe(true); // newest first upstream
  });

  test("malformed specPointNodeId → 400 with NO sql issued", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/zzz/history`);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});

describe("PUT …/coverage/{specPointNodeId}", () => {
  const baseOwned = () => [ownedClassRoute([classRow()])];

  test("happy path: fresh mark → 200 (canonical schema) + exactly one row + one event (prev=null)", async () => {
    const log: string[] = [];
    const app = makeApp(
      asTeacher,
      [
        ...baseOwned(),
        nodeByIdRoute([nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", node_type: "SUBTOPIC", title: "Titration", applicability: APPLICABILITY })]),
        coverageOneRoute([]),
        insertCoverageRoute(log),
        insertEventRoute(log),
      ],
    );
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught", note: "  covered in W2  " }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(coverageRowViewSchema.safeParse(body).success).toBe(true);
    expect(body.status).toBe("taught");
    expect(log.filter((l) => l.startsWith("row:")).length).toBe(1);
    expect(log.filter((l) => l.startsWith("event:")).length).toBe(1);
    expect(log.find((l) => l.startsWith("event:"))).toBe("event:TAUGHT:prev=null");
  });

  test("the idempotent identical re-mark: 200 with NO insert/update/event", async () => {
    const log: string[] = [];
    const app = makeApp(
      asTeacher,
      [
        ...baseOwned(),
        nodeByIdRoute([nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", node_type: "SUBTOPIC", title: "Titration", applicability: APPLICABILITY })]),
        coverageOneRoute([coverageRow({ status: "TAUGHT", note: null })]),
        insertCoverageRoute(log),
        insertEventRoute(log),
        updateCoverageRoute(log),
      ],
    );
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "TAUGHT", note: "  " }), // normalizes to the same null
    });
    expect(res.status).toBe(200);
    expect(log).toEqual([]); // the honest no-op
  });

  test("{} → 400 validation_failed 'status: must not be blank' (@Valid beats the gates)", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("status: must not be blank");
  });

  test("a 501-char note → 400 validation_failed 'note: size must be between 0 and 500'", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught", note: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("note: size must be between 0 and 500");
  });

  test("unreadable body → 400 bad_request (GlobalExceptionHandler :175-180 verbatim)", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("non-blank but unparseable status reaches the SERVICE parse law (the frozen order)", async () => {
    const app = makeApp(asTeacher, [...baseOwned()]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "maybe" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("status must be 'taught' or 'not-taught'");
  });

  test("archived class → 409 conflict (the exact message)", async () => {
    const app = makeApp(asTeacher, [ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("this class is archived — reopen it before marking coverage");
  });

  test("unknown node → 404 'specification point not found'; non-spec-point → 400 (V39)", async () => {
    const app = makeApp(asTeacher, [
      ...baseOwned(),
      nodeByIdRoute([]),
    ]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${SUBTOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("specification point not found");

    const app2 = makeApp(asTeacher, [
      ...baseOwned(),
      nodeByIdRoute([nodeRow({ id: TOPIC, node_type: "TOPIC", applicability: null })]),
    ]);
    const res2 = await app2.request(`/api/v1/teacher/classes/${CLASS_A}/coverage/${TOPIC}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught" }),
    });
    expect(res2.status).toBe(400);
    expect((await res2.json()).message).toBe("that node is not a specification point");
  });
});

// ── ClassKnowledgeGraph (3 endpoints) ────────────────────────────────────────

describe("GET /api/v1/teacher/classes/{classId}/knowledge-graph", () => {
  test("happy path: the F-072 heatmap through the wire (canonical schema)", async () => {
    const app = makeApp(asTeacher, graphRoutes());
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(classKnowledgeGraphViewSchema.safeParse(body).success).toBe(true);
    expect(body.classId).toBe(CLASS_A);
    expect(body.rootId).toBe(SUBJECT);
    expect(body.asOf).toBe(NOW_ISO);
  });

  test("the §17 gate through the wire: another teacher's class → 403", async () => {
    const app = makeApp(asTeacher, [classRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    const res = await app.request(`/api/v1/teacher/classes/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this class belongs to another teacher");
  });
});

describe("GET …/knowledge-graph/nodes/{nodeId}/students", () => {
  test("happy path: the TFA-07 weak-node leg (canonical schema, the roster grain)", async () => {
    const app = makeApp(
      asTeacher,
      [
        classRoute([classRow()]),
        nodeByIdRoute([nodeRow({ id: SUBTOPIC, code: "4CH1/1.1a", node_type: "SUBTOPIC", title: "Titration", applicability: APPLICABILITY })]),
        subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
        nodesByIdsRoute(nodeRows),
        partOfEdgesRoute(partOfEdges),
        familyEdgesRoute(familyEdges),
        membersRoute([M_ALICE, M_BOB, M_CAROL, M_ZED, M_ANN].map(memberRow)),
        usersBatchRoute([
          userRow(M_ALICE, "Alice"),
          userRow(M_BOB, "Bob"),
          userRow(M_CAROL, "Carol", false),
          userRow(M_ZED, "Zed"),
          userRow(M_ANN, "Ann"),
        ]),
        nodeSkillStatesRoute([skillRow(M_ALICE, 0.2, 4, 1), skillRow(M_BOB, 0.9, 10, 9)]),
        miscoBatchRoute([
          miscoRow(M_ALICE, MISCO_1, 0.55, NOW_TEXT),
          miscoRow(M_BOB, MISCO_1, 0.55, STALE),
          miscoRow(M_BOB, MISCO_3, 0.9, NOW_TEXT),
        ]),
        attemptsRoute([
          attemptRow("a1000000-0000-4000-8000-000000000001", M_ALICE),
        ]),
        coverageByClassRoute(coverageRows),
      ],
    );
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/nodes/${SUBTOPIC}/students?rootId=${SUBJECT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(classNodeStudentsViewSchema.safeParse(body).success).toBe(true);
    expect(body.nodeCode).toBe("4CH1/1.1a");
    expect(body.coverageState).toBe("taught");
    expect(body.learnersEnrolled).toBe(4);
    // weakest measured first, unmeasured LAST by display name (Zed after Ann)
    expect(body.students.map((s: { learnerId: string }) => s.learnerId)).toEqual([
      M_ALICE, M_BOB, M_ANN, M_ZED,
    ]);
  });
});

describe("GET …/knowledge-graph/learners/{learnerId}/knowledge-graph", () => {
  test("happy path: the F-034 read model through the teacher lens (canonical schema)", async () => {
    const app = makeApp(asTeacher, learnerKgRoutes(M_ALICE));
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/learners/${M_ALICE}/knowledge-graph?rootId=${SUBJECT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(learnerKnowledgeGraphViewSchema.safeParse(body).success).toBe(true);
    expect(body.learnerId).toBe(M_ALICE);
    expect(body.rootCode).toBe("4CH1");
    // the lens adds only gates — the graph is the STUDENT's own read model
    expect(body.nodes.find((n: { id: string }) => n.id === SUBTOPIC)?.band).toBe("LOW");
  });

  test("a non-member learner → 404 (the §17 enabled-member boundary, backend-enforced)", async () => {
    const app = makeApp(asTeacher, [
      classRoute([classRow()]),
      membershipRoute([]),
      userEnabledRoute([{ id: M_ALICE, enabled: true }]),
    ]);
    const res = await app.request(
      `/api/v1/teacher/classes/${CLASS_A}/knowledge-graph/learners/${M_ALICE}/knowledge-graph?rootId=${SUBJECT}`,
    );
    expect(res.status).toBe(404);
  });
});

// ── TeacherConceptGraph (2 endpoints) ────────────────────────────────────────

describe("POST /api/v1/teacher/concept-graph/activate", () => {
  const freshStore = () => ({
    nodes: new Map<string, Record<string, unknown>>(),
    edges: new Map<string, string>(),
    version: null as { id: string; status: string } | null,
    subject: null as { id: string; knowledge_node_id: string | null } | null,
    versionActivated: { v: false },
  });

  test("happy path: the REAL seed over the materializing store (200, canonical schema)", async () => {
    const store = freshStore();
    const d = { sql: fakeSql(seedRoutes(store as never)), clock };
    const app = new Hono();
    app.use("*", async (c, next) => {
      const a = asTeacher();
      c.set("syllabai.auth" as never, a as never);
      await next();
    });
    app.route("/api/v1/teacher/concept-graph", createTeacherConceptGraphRouter(d as KnowledgeDeps));
    app.onError((err, c) => {
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 400 | 409);
      throw err;
    });
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(seedSummarySchema.safeParse(body).success).toBe(true);
    // 1 root + 4 sections + 28 subsections + 182 SPs + 12 practicals + 193 concepts
    expect(body.nodesCreated).toBe(420);
    expect(body.edgesCreated).toBe(709);
    expect(body.alreadyActive).toBe(false);
    // the idempotent re-run: the TRUE reuse path (same store), still 200
    const res2 = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res2.status).toBe(200);
    expect((await res2.json()).alreadyActive).toBe(true);
  });

  test("the loud 409: subject linked to a code-mismatched KG node (the provenance law)", async () => {
    const routes: Route[] = [
      {
        match: /select id, status from curriculum_versions where board = \? and qualification = \? and code = \?/,
        rows: [{ id: "cc000000-0000-4000-8000-000000000001", status: "ACTIVE" }],
      },
      {
        match: /select id, knowledge_node_id from subjects where curriculum_version_id = \? ::uuid and code = \?/,
        rows: [{ id: "cc000000-0000-4000-8000-000000000002", knowledge_node_id: "cc000000-0000-4000-8000-000000000003" }],
      },
      { match: /from knowledge_nodes where code = \?/, rows: [] },
      {
        match: /select id, code, node_type, title, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
        rows: [{ id: "cc000000-0000-4000-8000-000000000003", code: "4CH1-OLD", node_type: "SUBJECT", title: "Old", validation_status: "VALIDATED", provenance: "seed", applicability: null }],
      },
    ];
    const app = makeApp(asTeacher, routes);
    const res = await app.request("/api/v1/teacher/concept-graph/activate", { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("subject 4CH1 is linked to KG node 4CH1-OLD, expected the seed root 4CH1");
  });
});

describe("GET /api/v1/teacher/concept-graph/edges", () => {
  const edgeRow = (over: Record<string, unknown>) => ({
    source_node_id: CONCEPT,
    target_node_id: UNIT,
    relation_type: "RELATED_TO",
    validation_status: "VALIDATED",
    provenance: "t-c11:settled|pass:batch-1",
    rationale: "because",
    source_code: "C-Alpha",
    source_title: "Alpha",
    source_node_type: "CONCEPT",
    source_validation_status: "SUGGESTED",
    target_code: "4CH1/1",
    target_title: "Bonding",
    target_node_type: "UNIT",
    target_validation_status: "VALIDATED",
    ...over,
  });

  const edgesRoutes = (semantic: Array<Record<string, unknown>>) => [
    {
      match: /select id, code from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: SUBJECT, code: "4CH1" }],
    },
    { match: /with recursive subtree as/, rows: [SUBJECT, UNIT].map((id) => ({ id })) },
    {
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: SUBJECT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" }],
    },
    {
      match: /and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)/,
      rows: [],
    },
    { match: /where e\.relation_type <> 'PART_OF'/, rows: semantic },
  ];

  test("happy path: semantic edges with the policy marker (canonical schema, sorted)", async () => {
    const app = makeApp(
      asTeacher,
      edgesRoutes([
        edgeRow({ relation_type: "RELATED_TO", source_code: "C-Zeta" }),
        edgeRow({ relation_type: "REMEDIATED_BY", source_code: "M-Units", target_code: "4CH1/1" }),
        edgeRow({ relation_type: "RELATED_TO", source_code: "C-Alpha" }),
      ]),
    );
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${SUBJECT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(conceptGraphEdgesViewSchema.safeParse(body).success).toBe(true);
    expect(body.policy).toBe("concept-graph-teacher/v1");
    expect(body.rootCode).toBe("4CH1");
    const keys = body.edges.map((e: { relation: string; source: { code: string }; target: { code: string } }) =>
      `${e.relation}:${e.source.code}:${e.target.code}`,
    );
    expect(keys).toEqual([...keys].sort()); // relation → source code → target code
  });

  test("missing rootId → 400 validation_failed (the param law, NO sql)", async () => {
    const app = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/concept-graph/edges");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("missing required parameter: rootId");
  });

  test("unknown root → 404 (the 404-first law)", async () => {
    const app = makeApp(asTeacher, [
      { match: /select id, code from knowledge_nodes where id = \? ::uuid/, rows: [] },
    ]);
    const res = await app.request(`/api/v1/teacher/concept-graph/edges?rootId=${SUBJECT}`);
    expect(res.status).toBe(404);
    // the concept-edges service's verbatim 404-first rendering (its own
    // message form — pinned by the service port, passed through the route)
    expect((await res.json()).message).toBe(`knowledge node not found: ${SUBJECT}`);
  });
});
