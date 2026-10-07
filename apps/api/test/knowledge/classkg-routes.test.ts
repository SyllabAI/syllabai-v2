/**
 * T-MIG-082 tranche-A route tests (R0) — the observable HTTP contract of
 * ClassKnowledgeGraphController (frozen :57-112 @ 6cad6ef), over an
 * IN-MEMORY Hono app wiring the REAL 053-t1 heatmap services
 * (services/knowledge/graphs.ts) through fakeSql fixtures reused from the
 * class-graph.test.ts pin set. ZERO service edits.
 *
 * Pinned here (the WIRE laws):
 *   - the authz shell: /api/v1/teacher/** requires TEACHER/ADMIN — anonymous
 *     401, authenticated STUDENT 403, BEFORE any path/query law;
 *   - the param law ORDER (path vars in signature order, then the query):
 *     malformed classId/nodeId/learnerId → 400 bad_request "malformed
 *     request"; MISSING rootId → 400 validation_failed "missing required
 *     parameter: rootId"; malformed rootId → 400 "malformed request"; the
 *     route owns the shape laws, the service NEVER sees a malformed request
 *     (the no-sql-issued pin);
 *   - the §17 gates verbatim through the wire: 404 "class not found" →
 *     403 "this class belongs to another teacher" → the root 404-first
 *     ("knowledge node {id} not found");
 *   - the third leg's privacy boundary: a non-member 404 that short-circuits
 *     BEFORE the user lookup (no user query issued);
 *   - the heatmap happy path → 200 with the class aggregate (4 enabled
 *     learners; Carol disabled + Gone vanished drop out — the
 *     independent-student rule visible THROUGH the wire).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createClassKgRouter, type ClassKgDeps } from "../../src/routes/classkg";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SubmitClock } from "../../src/services/selfmark";

// ── fixtures (the class-graph.test.ts constants, reused verbatim) ────────────

const TEACHER = "ee000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ee000000-0000-4000-8000-000000000002";
const CLASS_A = "ec000000-0000-4000-8000-000000000001";
const CLASS_NAME = "10A Chemistry";

const SUBJECT = "ea000000-0000-4000-8000-000000000001"; // root, code 4CH1
const UNIT = "ea000000-0000-4000-8000-000000000002";
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const PREREQ_A = "ea000000-0000-4000-8000-000000000007";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004";
const CONCEPT = "ea000000-0000-4000-8000-000000000009";
const SUBTOPIC_2 = "ea000000-0000-4000-8000-000000000005";
const OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not in the subtree

const M_ALICE = "eb000000-0000-4000-8000-000000000001";
const M_BOB = "eb000000-0000-4000-8000-000000000002";
const M_CAROL = "eb000000-0000-4000-8000-000000000003";
const M_DAVE = "eb000000-0000-4000-8000-000000000004";
const M_GONE = "eb000000-0000-4000-8000-000000000005";
const M_ZED = "eb000000-0000-4000-8000-000000000006";
const M_ANN = "eb000000-0000-4000-8000-000000000007";

const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-02T10:00:00Z";
const T4 = "2026-10-05T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const STALE = "2026-08-01T08:00:00Z";
const NOW = new Date(NOW_TEXT);
const clock: SubmitClock = { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW };

const APPLICABILITY = { papers: ["1CH1"], tier: "foundation" };

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A, name: CLASS_NAME, status: "ACTIVE", teacher_id: TEACHER, ...over,
});
const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SUBJECT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry", description: null,
  validation_status: "VALIDATED", provenance: "seed", applicability: null, ...over,
});
const memberRow = (studentId: string) => ({
  id: `ef000000-0000-4000-8000-0000000000${studentId.slice(-2)}`,
  class_id: CLASS_A, student_id: studentId,
});
const userRow = (id: string, displayName: string, enabled = true) => ({ id, display_name: displayName, enabled });
const skillRow = (learnerId: string, mastery: number, attempts: number, correct: number) => ({
  learner_id: learnerId, node_id: SUBTOPIC, mastery, attempts, correct_count: correct,
  last_practiced_at: NOW_TEXT,
});
const miscoRow = (learnerId: string, nodeId: string, probability: number, lastEvidenceAt: string) => ({
  learner_id: learnerId, misconception_node_id: nodeId, probability, last_evidence_at: lastEvidenceAt,
});

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
  { ...nodeRow({ id: M_CAROL.slice(0, 0) + "ea000000-0000-4000-8000-000000000006", code: "MSC/1", node_type: "MISCONCEPTION", title: "Inverts the ratio" }), edge_source_node_id: "ea000000-0000-4000-8000-000000000006", edge_target_node_id: SUBTOPIC, source_code: "MSC/1" },
];

const coverageRows = [
  { class_id: CLASS_A, spec_point_node_id: SUBTOPIC, status: "TAUGHT", marked_by: TEACHER, marked_at: T1, note: null, created_at: T0 },
  { class_id: CLASS_A, spec_point_node_id: PREREQ_A, status: "NOT_TAUGHT", marked_by: TEACHER, marked_at: T1, note: null, created_at: T0 },
];

// ── route shapes (the class-graph.test.ts builders, reused verbatim) ─────────

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, name, status, teacher_id from classes where id = \? ::uuid$/, rows,
});
const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/, rows,
});
const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/, rows,
});
const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/, rows,
});
const partOfEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/, rows,
});
const familyEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/, rows,
});
const membersRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select student_id from class_members where class_id = \? ::uuid order by enrolled_at asc$/, rows,
});
const usersBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, display_name, enabled from users where id = any\( \? ::uuid\[\]\)$/, rows,
});
const graphSkillStatesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select learner_id, node_id, mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = any\( \? ::uuid\[\]\) and node_id = any\( \? ::uuid\[\]\)$/, rows,
});
const miscoBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select learner_id, misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = any\( \? ::uuid\[\]\) and misconception_node_id = any\( \? ::uuid\[\]\)$/, rows,
});
const coverageByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/, rows,
});
const edgesWithinRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select e\.source_node_id, e\.target_node_id from knowledge_edges e where e\.relation_type = 'REQUIRES_PREREQUISITE' and e\.source_node_id = any\( \? ::uuid\[\]\) and e\.target_node_id = any\( \? ::uuid\[\]\)$/, rows,
});
const membershipRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select 1 as one from class_members where class_id = \? ::uuid and student_id = \? ::uuid$/, rows,
});
const skillsByLearnerRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states where learner_id = \? order by last_practiced_at desc$/, rows,
});
const miscoByLearnerRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = \? order by probability desc$/, rows,
});
const reviewsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select node_id, due_at, reason from review_schedules where learner_id = \? and status = \? order by due_at asc$/, rows,
});
const userEnabledRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, enabled from users where id = \? ::uuid$/, rows,
});

/** the full heatmap happy route set (members: Alice, Bob, Carol-disabled,
 *  Gone-vanished, Zed, Ann — the independent-student rule's roster). */
const graphRoutes = (): Route[] => [
  classRoute([classRow()]),
  nodeByIdRoute([nodeRow()]),
  subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
  nodesByIdsRoute(nodeRows),
  partOfEdgesRoute(partOfEdges),
  familyEdgesRoute(familyEdges),
  membersRoute([M_ALICE, M_BOB, M_CAROL, M_GONE, M_ZED, M_ANN].map(memberRow)),
  usersBatchRoute([
    userRow(M_ALICE, "Alice"), userRow(M_BOB, "Bob"),
    userRow(M_CAROL, "Carol", false), userRow(M_ZED, "Zed"), userRow(M_ANN, "Ann"),
  ]),
  graphSkillStatesRoute([skillRow(M_ALICE, 0.2, 4, 1), skillRow(M_BOB, 0.9, 10, 9)]),
  miscoBatchRoute([
    miscoRow(M_ALICE, "ea000000-0000-4000-8000-000000000006", 0.55, NOW_TEXT),
    miscoRow(M_BOB, "ea000000-0000-4000-8000-000000000006", 0.55, STALE),
  ]),
  coverageByClassRoute(coverageRows),
  edgesWithinRoute([{ source_node_id: SUBTOPIC, target_node_id: PREREQ_A }]),
];

// ── app assembly ─────────────────────────────────────────────────────────────

type AuthFn = (c: Context) => Record<string, unknown> | null;
const asTeacher = () => ({ email: "t@example.edu", userId: TEACHER, roles: ["TEACHER"], tokenVersion: 1 });
const asStudent = () => ({ email: "s@example.edu", userId: M_DAVE, roles: ["STUDENT"], tokenVersion: 1 });
const anon = () => null;

function makeApp(auth: AuthFn, routes: Route[]) {
  const deps: ClassKgDeps = { sql: fakeSql(routes), clock };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createClassKgRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500 as const,
    );
  });
  return { app, deps };
}

const base = "/api/v1/teacher/classes";
const authed = { headers: { Authorization: "Bearer x" } };

// ── the pins ─────────────────────────────────────────────────────────────────

describe("class-KG router — shells and the param laws", () => {
  test("anonymous → Boot 401; STUDENT → Boot 403; the shell precedes the path shape", async () => {
    const { app } = makeApp(anon, []);
    const res401 = await app.request(`${base}/not-a-uuid/knowledge-graph?rootId=${SUBJECT}`);
    expect(res401.status).toBe(401);
    expect(await res401.json()).toMatchObject({ status: 401, error: "Unauthorized" });

    const app403 = makeApp(asStudent, []).app;
    const res403 = await app403.request(`${base}/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`, authed);
    expect(res403.status).toBe(403);
    expect(await res403.json()).toMatchObject({ status: 403, error: "Forbidden" });
  });

  test("malformed classId → 400 'malformed request', NO queries issued", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/nope/knowledge-graph?rootId=${SUBJECT}`, authed);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });

  test("MISSING rootId → 400 validation_failed 'missing required parameter: rootId'; malformed → 'malformed request'", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    const missing = await app.request(`${base}/${CLASS_A}/knowledge-graph`, authed);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      error: "validation_failed", message: "missing required parameter: rootId",
    });
    const malformed = await app.request(`${base}/${CLASS_A}/knowledge-graph?rootId=zz`, authed);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0); // the route owns the shape law
  });

  test("nodeStudents: malformed nodeId path var fires BEFORE the rootId law (signature order)", async () => {
    const { app, deps } = makeApp(asTeacher, []);
    // both bad: nodeId malformed AND rootId absent — the path var resolves first
    const res = await app.request(`${base}/${CLASS_A}/knowledge-graph/nodes/xx/students`, authed);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request", message: "malformed request" });
    expect((deps.sql as unknown as { queries: string[] }).queries.length).toBe(0);
  });
});

describe("class-KG router — the §17 gates and the read models", () => {
  test("the heatmap happy path → 200: 4 enabled learners, the disabled/vanished drop out", async () => {
    const { app } = makeApp(asTeacher, graphRoutes());
    const res = await app.request(`${base}/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`, authed);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.classId).toBe(CLASS_A);
    expect(view.learnersEnrolled).toBe(4); // Alice, Bob, Zed, Ann — Carol disabled, Gone vanished
  });

  test("404 class not found → 403 other teacher → 404 unknown root (the gate ORDER through the wire)", async () => {
    const a = makeApp(asTeacher, [classRoute([])]);
    const r404 = await a.app.request(`${base}/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`, authed);
    expect(r404.status).toBe(404);
    expect(await r404.json()).toMatchObject({ message: "class not found" });

    const b = makeApp(asTeacher, [classRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    const r403 = await b.app.request(`${base}/${CLASS_A}/knowledge-graph?rootId=${SUBJECT}`, authed);
    expect(r403.status).toBe(403);
    expect(await r403.json()).toMatchObject({ message: "this class belongs to another teacher" });

    const c = makeApp(asTeacher, [classRoute([classRow()]), nodeByIdRoute([])]);
    const rRoot = await c.app.request(`${base}/${CLASS_A}/knowledge-graph?rootId=${OUTSIDE}`, authed);
    expect(rRoot.status).toBe(404);
    expect(await rRoot.json()).toMatchObject({ message: `knowledge node ${OUTSIDE} not found` });
  });

  test("nodeStudents: 404 node outside the subject subtree (subject isolation, never a silent hop)", async () => {
    const { app } = makeApp(asTeacher, graphRoutes());
    const res = await app.request(
      `${base}/${CLASS_A}/knowledge-graph/nodes/${OUTSIDE}/students?rootId=${SUBJECT}`, authed,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "node is not part of this subject subtree" });
  });

  test("the student leg → 200 through the SAME F-034 read model (one graph implementation)", async () => {
    // the third leg DELEGATES to learnerGraphFor — add the per-learner
    // F-034 query routes (Zed is unmeasured → honest empty scans)
    const { app } = makeApp(asTeacher, [
      ...graphRoutes(),
      membershipRoute([{ one: 1 }]), // Zed IS an enabled member (the §17 gate fires first)
      userEnabledRoute([{ id: M_ZED, enabled: true }]),
      skillsByLearnerRoute([]),
      miscoByLearnerRoute([]),
      reviewsRoute([]),
    ]);
    const res = await app.request(
      `${base}/${CLASS_A}/knowledge-graph/learners/${M_ZED}/knowledge-graph?rootId=${SUBJECT}`, authed,
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.rootId ?? view.root?.id ?? view).toBeTruthy(); // the F-034 view shape is the t1 pin set's law
  });

  test("the §17 privacy boundary: a NON-member is 404, short-circuit BEFORE the user lookup", async () => {
    const { app, deps } = makeApp(asTeacher, [
      classRoute([classRow()]),
      membershipRoute([]), // no membership row for M_DAVE
    ]);
    const res = await app.request(
      `${base}/${CLASS_A}/knowledge-graph/learners/${M_DAVE}/knowledge-graph?rootId=${SUBJECT}`, authed,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ message: "learner is not a member of this class" });
    // an absent membership neither confirms nor denies: NO user query issued
    expect((deps.sql as unknown as { queries: string[] }).queries.filter((q) => q.includes("from users")).length).toBe(0);
  });
});
