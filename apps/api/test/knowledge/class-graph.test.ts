/**
 * The F-072 class-KG heatmap trio + the F-034 read model — unit tests
 * (T-MIG-053 tranche-1 close, r3a). Stubbed sql via the shared fakeSql
 * helper; pins the frozen law @ 6cad6ef:
 *
 *   - the §17 gate ORDER (404 class not found → 403 this class belongs to
 *     another teacher → the root's 404-first thrown by the tree read) and
 *     the deliberate NO-archived-gate law on reads (a past class's heatmap
 *     still serves — 409 is a write gate);
 *   - THE INDEPENDENT-STUDENT RULE: the roster is exactly this class's
 *     ENABLED member rows — the skill-state/misconception queries receive
 *     the enabled roster verbatim (pinned by capturing the bound roster
 *     parameter: no disabled member, no non-member, no vanished account);
 *   - the honest unmeasured cell (null meanMastery, "UNMEASURED" band,
 *     zero counts — never fabricated) vs the measured cell (4-dp mean, the
 *     §13.3 distribution so a polarized class cannot hide behind the mean);
 *   - the coverage overlay: spec points (the V39 predicate — SUBTOPIC with
 *     non-null applicability) verbatim; every other node derived
 *     taught > recorded > unrecorded over descendant-or-self counts;
 *   - misconception prevalence keyed by MISCONCEPTION node ids (never the
 *     parent), distinct ACTIVE learners, staleness-relaxed (MED-2/ADR-032);
 *   - prerequisiteRelations: REQUIRES_PREREQUISITE with BOTH endpoints in
 *     the subtree, target=prerequisite / source=dependent, unknown ids
 *     skipped (never guessed);
 *   - the node drill-down: subject-isolation 404, weakest-measured-first /
 *     unmeasured-last deterministic sort, the 3-per-student evidence slice,
 *     the structural-invariant skip for a state on an unattached
 *     misconception;
 *   - the F-034 read model: the walk covers misconception nodes (unlike the
 *     heatmap's collect), unpractised = all-null state, the earliest-PENDING
 *     review overlay, the relaxed misconception overlay, applicability
 *     verbatim — and the teacher lens DELEGATES to it (deep-equal, one
 *     graph implementation).
 */
import { describe, expect, test } from "bun:test";
import {
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  classGraph,
  classLearnerKnowledgeGraph,
  classNodeStudents,
  learnerGraphFor,
} from "../../src/services/knowledge";
import type { ClassGraphDeps } from "../../src/services/knowledge";
import type { SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "ee000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ee000000-0000-4000-8000-000000000002";
const CLASS_A = "ec000000-0000-4000-8000-000000000001";
const CLASS_NAME = "10A Chemistry";

const SUBJECT = "ea000000-0000-4000-8000-000000000001"; // root, code 4CH1
const UNIT = "ea000000-0000-4000-8000-000000000002";
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004"; // spec point (applicability)
const SUBTOPIC_2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC WITHOUT applicability
const MISCO_1 = "ea000000-0000-4000-8000-000000000006"; // attaches under SUBTOPIC
const PREREQ_A = "ea000000-0000-4000-8000-000000000007"; // spec point, NOT_TAUGHT
const CONCEPT = "ea000000-0000-4000-8000-000000000009"; // under SUBTOPIC
const MISCO_2 = "ea000000-0000-4000-8000-00000000000a"; // attaches under TOPIC
const MISCO_3 = "ea000000-0000-4000-8000-00000000000b"; // NOT attached in this subtree
const OUTSIDE = "ea000000-0000-4000-8000-000000000012"; // not in the subtree

const M_ALICE = "eb000000-0000-4000-8000-000000000001"; // enabled, measured LOW
const M_BOB = "eb000000-0000-4000-8000-000000000002"; // enabled, measured SECURE
const M_CAROL = "eb000000-0000-4000-8000-000000000003"; // member, DISABLED account
const M_DAVE = "eb000000-0000-4000-8000-000000000004"; // skill state but NOT a member
const M_GONE = "eb000000-0000-4000-8000-000000000005"; // member row, user row vanished
const M_ZED = "eb000000-0000-4000-8000-000000000006"; // enabled, unmeasured
const M_ANN = "eb000000-0000-4000-8000-000000000007"; // enabled, unmeasured

const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-02T10:00:00Z";
const T4 = "2026-10-05T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const STALE = "2026-08-01T08:00:00Z"; // 66 days old — relaxed below the 0.5 threshold
const NOW_ISO = "2026-10-06T08:00:00.000Z"; // toInstant(NOW_TEXT)

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW };
const deps = (routes: Route[]): ClassGraphDeps => ({ sql: fakeSql(routes), clock });

// ── row factories ────────────────────────────────────────────────────────────

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  name: CLASS_NAME,
  status: "ACTIVE",
  teacher_id: TEACHER,
  ...over,
});

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

const APPLICABILITY = { papers: ["1CH1"], tier: "foundation" };

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
  last_practiced_at: NOW_TEXT, // FRESH: decayed == mastery exactly (deterministic bands)
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

// ── the curriculum under test ─────────────────────────────────────────────────
// SUBJECT 4CH1 → UNIT 4CH1/1 → TOPIC 4CH1/1.1 → {PREREQ_A 4CH1/0.1 (spec,
// NOT_TAUGHT), SUBTOPIC 4CH1/1.1a (spec, TAUGHT; child CONCEPT + attach
// MISCO_1), SUBTOPIC_2 4CH1/1.1b (NOT a spec point)}; TOPIC also attaches
// MISCO_2. MISCO_3 exists in the registry but is NOT attached here.

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

// ── shared route shapes ───────────────────────────────────────────────────────

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, name, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
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

const graphSkillStatesRoute = (
  rows: Array<Record<string, unknown>>,
  capture?: { roster: unknown[] },
): Route => ({
  match:
    /select learner_id, node_id, mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = any\( \? ::uuid\[\]\) and node_id = any\( \? ::uuid\[\]\)$/,
  rows,
  rowsFor: capture
    ? (params) => {
        capture.roster = params[0] as unknown[];
        return rows;
      }
    : undefined,
});

const miscoBatchRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select learner_id, misconception_node_id, probability, last_evidence_at from misconception_states where learner_id = any\( \? ::uuid\[\]\) and misconception_node_id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const coverageByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
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

/** the full route set for the heatmap happy path (members: Alice, Bob,
 *  Carol-disabled, Dave-not-a-member's row absent, Gone-vanished, Zed, Ann). */
const graphRoutes = (capture?: { roster: unknown[] }): Route[] => [
  classRoute([classRow()]),
  nodeByIdRoute([nodeRow()]),
  subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
  nodesByIdsRoute(nodeRows),
  partOfEdgesRoute(partOfEdges),
  familyEdgesRoute(familyEdges),
  membersRoute([M_ALICE, M_BOB, M_CAROL, M_GONE, M_ZED, M_ANN].map(memberRow)),
  usersBatchRoute([
    userRow(M_ALICE, "Alice"),
    userRow(M_BOB, "Bob"),
    userRow(M_CAROL, "Carol", false), // disabled — drops out
    userRow(M_ZED, "Zed"),
    userRow(M_ANN, "Ann"),
  ]), // M_GONE has no user row — vanished
  graphSkillStatesRoute([skillRow(M_ALICE, 0.2, 4, 1), skillRow(M_BOB, 0.9, 10, 9)], capture),
  miscoBatchRoute([
    miscoRow(M_ALICE, MISCO_1, 0.55, NOW_TEXT), // fresh → relaxed 0.55 → ACTIVE
    miscoRow(M_BOB, MISCO_1, 0.55, STALE), // stale → relaxed ≈0.473 → NOT active
    miscoRow(M_ALICE, MISCO_2, 0.7, NOW_TEXT), // fresh → active (distinct-learner pin)
  ]),
  coverageByClassRoute(coverageRows),
  edgesWithinRoute([
    { source_node_id: SUBTOPIC, target_node_id: PREREQ_A }, // drawable: SUBTOPIC requires PREREQ_A
    { source_node_id: SUBJECT, target_node_id: OUTSIDE }, // endpoint outside → skipped
  ]),
];

// ── the §17 gate + the read-only law (controller :23-34/:104-112) ────────────

describe("class-KG gates (the §17 house pattern)", () => {
  test("graph: 404 class not found (unknown class)", async () => {
    const d = deps([classRoute([])]);
    await expect(classGraph(d, TEACHER, CLASS_A, SUBJECT)).rejects.toThrow(
      new KnowledgeNotFoundError("class not found"),
    );
  });

  test("graph: 403 this class belongs to another teacher (§17 — even a valid class)", async () => {
    const d = deps([classRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    await expect(classGraph(d, TEACHER, CLASS_A, SUBJECT)).rejects.toThrow(
      new KnowledgeForbiddenError("this class belongs to another teacher"),
    );
  });

  test("graph: 404 unknown root — thrown by the tree read (controller :26-27)", async () => {
    const d = deps([classRoute([classRow()]), nodeByIdRoute([])]);
    await expect(classGraph(d, TEACHER, CLASS_A, OUTSIDE)).rejects.toThrow(
      new KnowledgeNotFoundError(`knowledge node ${OUTSIDE} not found`),
    );
  });

  test("ARCHIVED class still serves the heatmap — NO archived gate on reads", async () => {
    // 409 is a WRITE gate; a teacher may inspect a past class's heatmap
    // (ClassKnowledgeGraphController docstring :28-30). Full happy routes,
    // class status ARCHIVED — the view must render.
    const patched = depsWithArchivedClass();
    const view = await classGraph(patched, TEACHER, CLASS_A, SUBJECT);
    expect(view.classId).toBe(CLASS_A);
    expect(view.learnersEnrolled).toBe(4);
  });

  test("nodeStudents: 404 node outside the subject subtree (subject isolation)", async () => {
    const d = deps(graphRoutes());
    await expect(classNodeStudents(d, TEACHER, CLASS_A, SUBJECT, OUTSIDE)).rejects.toThrow(
      new KnowledgeNotFoundError("node is not part of this subject subtree"),
    );
  });

  test("learner graph: 404 non-member — and the membership check short-circuits BEFORE any user lookup", async () => {
    const d = deps([
      classRoute([classRow()]),
      membershipRoute([]), // no membership row
      userEnabledRoute([{ id: M_DAVE, enabled: true }]),
    ]);
    await expect(classLearnerKnowledgeGraph(d, TEACHER, CLASS_A, M_DAVE, SUBJECT)).rejects.toThrow(
      new KnowledgeNotFoundError("learner is not a member of this class"),
    );
    // an absent membership neither confirms nor denies: no user query issued
    expect((d.sql as unknown as { queries: string[] }).queries.filter((q) => q.includes("from users")).length).toBe(0);
  });

  test("learner graph: 404 for a DISABLED member — the roster is the privacy boundary", async () => {
    const d = deps([
      classRoute([classRow()]),
      membershipRoute([{ one: 1 }]),
      userEnabledRoute([{ id: M_CAROL, enabled: false }]),
    ]);
    await expect(classLearnerKnowledgeGraph(d, TEACHER, CLASS_A, M_CAROL, SUBJECT)).rejects.toThrow(
      new KnowledgeNotFoundError("learner is not a member of this class"),
    );
  });
});

/** the happy route set with the class row ARCHIVED (the read-only law). */
function depsWithArchivedClass(): ClassGraphDeps {
  const routes = graphRoutes();
  const idx = routes.findIndex((r) => r.match.source.includes("from classes"));
  routes[idx] = classRoute([classRow({ status: "ARCHIVED" })]);
  return deps(routes);
}

// ── the F-072 heatmap (graph :180-263) ────────────────────────────────────────

describe("the F-072 class heatmap (classGraph)", () => {
  test("curriculum pre-order nodes, structure-only childIds, enabled-only roster (the independent-student rule)", async () => {
    const capture = { roster: [] as unknown[] };
    const d = deps(graphRoutes(capture));
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);

    // the roster param bound to the evidence query IS the enabled roster:
    // no Carol (disabled), no Dave (not a member), no Gone (vanished row)
    expect(capture.roster).toEqual([M_ALICE, M_BOB, M_ZED, M_ANN]);
    expect(view.learnersEnrolled).toBe(4);
    expect(view.className).toBe(CLASS_NAME);
    expect(view.rootId).toBe(SUBJECT);
    expect(view.rootCode).toBe("4CH1");
    expect(view.rootTitle).toBe("Chemistry");
    expect(view.asOf).toBe(NOW_ISO);

    // nodes: the curriculum pre-order, misconceptions excluded from structure
    expect(view.nodes.map((n) => n.id)).toEqual([
      SUBJECT, UNIT, TOPIC, PREREQ_A, SUBTOPIC, CONCEPT, SUBTOPIC_2,
    ]);
    // childIds = STRUCTURE children only (misconceptions never listed here)
    expect(view.nodes.find((n) => n.id === TOPIC)?.childIds).toEqual([PREREQ_A, SUBTOPIC, SUBTOPIC_2]);
    expect(view.nodes.find((n) => n.id === SUBJECT)?.childIds).toEqual([UNIT]);
    expect(view.nodes.find((n) => n.id === SUBTOPIC)?.childIds).toEqual([CONCEPT]);
    expect(view.nodes.find((n) => n.id === CONCEPT)?.childIds).toEqual([]);
  });

  test("the measured cell: 4-dp mean, the §13.3 distribution, honest sums", async () => {
    const d = deps(graphRoutes());
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);
    const cell = view.nodes.find((n) => n.id === SUBTOPIC);
    expect(cell).toBeDefined();
    // fresh evidence (last_practiced == asOf) → decayed == mastery exactly
    expect(cell?.learnersMeasured).toBe(2);
    expect(cell?.meanMastery).toBe(0.55); // (0.2 + 0.9) / 2, 4-dp round
    expect(cell?.meanBand).toBe("DEVELOPING"); // bandOf(0.55) — the mean's own band
    expect(cell?.strugglingCount).toBe(1); // Alice 0.2 → LOW
    expect(cell?.developingCount).toBe(0);
    expect(cell?.proficientCount).toBe(1); // Bob 0.9 → SECURE
    expect(cell?.attempts).toBe(14); // 4 + 10 — Carol's 5 and Dave's rows can't count
    expect(cell?.correctCount).toBe(10); // 1 + 9
  });

  test("the unmeasured cell: honest absence — null mean, UNMEASURED band, zeros", async () => {
    const d = deps(graphRoutes());
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);
    const cell = view.nodes.find((n) => n.id === CONCEPT);
    expect(cell?.learnersMeasured).toBe(0);
    expect(cell?.meanMastery).toBeNull(); // never a fabricated zero
    expect(cell?.meanBand).toBe("UNMEASURED"); // never null on the wire
    expect(cell?.strugglingCount).toBe(0);
    expect(cell?.developingCount).toBe(0);
    expect(cell?.proficientCount).toBe(0);
    expect(cell?.attempts).toBe(0);
    expect(cell?.correctCount).toBe(0);
  });

  test("the coverage overlay: spec points verbatim (V39 predicate), ancestors derived", async () => {
    const d = deps(graphRoutes());
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);
    const byId = new Map(view.nodes.map((n) => [n.id, n]));

    // spec points report their recorded row verbatim
    expect(byId.get(SUBTOPIC)?.coverageState).toBe("taught");
    expect(byId.get(SUBTOPIC)?.specPoints).toBe(1);
    expect(byId.get(SUBTOPIC)?.recordedSpecPoints).toBe(1);
    expect(byId.get(SUBTOPIC)?.taughtSpecPoints).toBe(1);
    expect(byId.get(PREREQ_A)?.coverageState).toBe("not-taught");
    expect(byId.get(PREREQ_A)?.specPoints).toBe(1);
    expect(byId.get(PREREQ_A)?.recordedSpecPoints).toBe(1);
    expect(byId.get(PREREQ_A)?.taughtSpecPoints).toBe(0);

    // ancestors derive taught > recorded > unrecorded over descendant-or-self
    expect(byId.get(TOPIC)?.coverageState).toBe("taught"); // 2 recorded, ≥1 taught
    expect(byId.get(TOPIC)?.specPoints).toBe(2); // SUBTOPIC + PREREQ_A
    expect(byId.get(TOPIC)?.recordedSpecPoints).toBe(2);
    expect(byId.get(TOPIC)?.taughtSpecPoints).toBe(1);
    expect(byId.get(UNIT)?.coverageState).toBe("taught");
    expect(byId.get(SUBJECT)?.coverageState).toBe("taught");
    expect(byId.get(CONCEPT)?.coverageState).toBe("unrecorded"); // zero spec descendants

    // the V39 predicate: SUBTOPIC-typed WITHOUT applicability is NOT a spec
    // point — it takes the derived path and stays unrecorded here
    expect(byId.get(SUBTOPIC_2)?.specPoints).toBe(0);
    expect(byId.get(SUBTOPIC_2)?.coverageState).toBe("unrecorded");
  });

  test("misconception prevalence: keyed by MISCONCEPTION nodes, distinct ACTIVE learners, staleness-relaxed", async () => {
    const d = deps(graphRoutes());
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);
    const byId = new Map(view.nodes.map((n) => [n.id, n]));

    // SUBTOPIC attaches MSC/1: Alice fresh-active (relaxed 0.55 ≥ 0.5), Bob
    // stale-inactive (0.55 relaxes toward the 0.3 prior over 66 days),
    // Carol's fresh 0.9 can never count (not on the enabled roster)
    expect(byId.get(SUBTOPIC)?.learnersWithActiveMisconception).toBe(1);
    // TOPIC attaches MSC/2: Alice fresh-active — the SAME learner stays
    // DISTINCT-counted once even if active on several attached nodes
    expect(byId.get(TOPIC)?.learnersWithActiveMisconception).toBe(1);
    // no attachments → zero, never fabricated
    expect(byId.get(UNIT)?.learnersWithActiveMisconception).toBe(0);
    expect(byId.get(SUBTOPIC_2)?.learnersWithActiveMisconception).toBe(0);
  });

  test("prerequisiteEdges: both endpoints in the subtree, target=prerequisite mapping, unknown ids skipped", async () => {
    const d = deps(graphRoutes());
    const view = await classGraph(d, TEACHER, CLASS_A, SUBJECT);
    // the OUTSIDE-target edge is a graph inconsistency — skipped, never guessed
    expect(view.prerequisiteEdges).toEqual([
      { prerequisiteId: PREREQ_A, prerequisiteCode: "4CH1/0.1", nodeId: SUBTOPIC, nodeCode: "4CH1/1.1a" },
    ]);
  });
});

// ── the node drill-down (nodeStudents :269-392) ──────────────────────────────

describe("the TFA-07 node drill-down (classNodeStudents)", () => {
  const ATTEMPTS = [
    attemptRow("a1000000-0000-4000-8000-000000000001", M_ALICE, { created_at: T4, marks_awarded: 2, marking_state: "SMART_MARKED", correct: true, external_ref: "QMA-011" }),
    attemptRow("a1000000-0000-4000-8000-000000000002", M_ALICE, { created_at: T1, marks_awarded: null, marking_state: "AUTO_GRADED", correct: false, external_ref: "QMA-012" }),
    attemptRow("a1000000-0000-4000-8000-000000000003", M_ALICE, { created_at: "2026-10-03T10:00:00Z", marks_awarded: 3, marking_state: "HUMAN_MARKED", correct: true, external_ref: "QMA-013" }),
    attemptRow("a1000000-0000-4000-8000-000000000004", M_ALICE, { created_at: T0, marks_awarded: 1, marking_state: "SELF_MARKED", correct: false, external_ref: "QMA-014" }),
  ];

  const drillRoutes = (): Route[] => [
    classRoute([classRow()]),
    nodeByIdRoute([nodeRow()]),
    subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
    nodesByIdsRoute(nodeRows),
    partOfEdgesRoute(partOfEdges),
    familyEdgesRoute(familyEdges),
    membersRoute([M_ALICE, M_BOB, M_CAROL, M_GONE, M_ZED, M_ANN].map(memberRow)),
    usersBatchRoute([
      userRow(M_ALICE, "Alice"),
      userRow(M_BOB, "Bob"),
      userRow(M_CAROL, "Carol", false),
      userRow(M_ZED, "Zed"),
      userRow(M_ANN, "Ann"),
    ]),
    nodeSkillStatesRoute([skillRow(M_ALICE, 0.2, 4, 1), skillRow(M_BOB, 0.9, 10, 9)]),
    miscoBatchRoute([
      miscoRow(M_ALICE, MISCO_1, 0.55, NOW_TEXT), // attached → shown, active
      miscoRow(M_BOB, MISCO_1, 0.55, STALE), // attached → shown, relaxed below threshold
      miscoRow(M_BOB, MISCO_3, 0.9, NOW_TEXT), // NOT attached here → structural skip
    ]),
    attemptsRoute(ATTEMPTS), // createdAt DESC scan, 120 cap — served post-ORDER
    coverageByClassRoute(coverageRows),
  ];

  test("roster order, honest nulls for the unmeasured, weakest-measured-first sort", async () => {
    const d = deps(drillRoutes());
    const view = await classNodeStudents(d, TEACHER, CLASS_A, SUBJECT, SUBTOPIC);

    expect(view.classId).toBe(CLASS_A);
    expect(view.className).toBe(CLASS_NAME);
    expect(view.rootId).toBe(SUBJECT);
    expect(view.nodeId).toBe(SUBTOPIC);
    expect(view.nodeCode).toBe("4CH1/1.1a");
    expect(view.nodeTitle).toBe("Titration");
    expect(view.nodeType).toBe("SUBTOPIC");
    expect(view.coverageState).toBe("taught"); // the spec point's own row, verbatim
    expect(view.learnersEnrolled).toBe(4);
    expect(view.asOf).toBe(NOW_ISO);

    // weakest measured first (ascending effective), unmeasured LAST sorted by
    // display name — Zed after Ann — the panel must not fabricate
    expect(view.students.map((s) => s.learnerId)).toEqual([M_ALICE, M_BOB, M_ANN, M_ZED]);

    const alice = view.students[0]!;
    expect(alice.displayName).toBe("Alice");
    expect(alice.mastery).toBe(0.2);
    expect(alice.effectiveMastery).toBe(0.2); // fresh → decayed == mastery
    expect(alice.band).toBe("LOW");
    expect(alice.attempts).toBe(4);
    expect(alice.correctCount).toBe(1);
    expect(alice.lastPracticedAt).toBe(NOW_ISO);

    const ann = view.students[2]!;
    expect(ann.displayName).toBe("Ann");
    expect(ann.mastery).toBeNull(); // the honest unmeasured row
    expect(ann.effectiveMastery).toBeNull();
    expect(ann.band).toBeNull();
    expect(ann.attempts).toBeNull();
    expect(ann.correctCount).toBeNull();
    expect(ann.lastPracticedAt).toBeNull();
    expect(ann.misconceptions).toEqual([]);
    expect(ann.recentAttempts).toEqual([]);
  });

  test("the distribution restated from the same states the rows show", async () => {
    const d = deps(drillRoutes());
    const view = await classNodeStudents(d, TEACHER, CLASS_A, SUBJECT, SUBTOPIC);
    expect(view.strugglingCount).toBe(1); // Alice LOW
    expect(view.developingCount).toBe(0);
    expect(view.proficientCount).toBe(1); // Bob SECURE
  });

  test("the evidence slice: 3-per-student cap off the createdAt-desc scan, raw fields verbatim", async () => {
    const d = deps(drillRoutes());
    const view = await classNodeStudents(d, TEACHER, CLASS_A, SUBJECT, SUBTOPIC);
    const alice = view.students[0]!;
    expect(alice.recentAttempts).toHaveLength(3); // the 4th (oldest) scan row dropped
    expect(alice.recentAttempts.map((a) => a.attemptId)).toEqual([
      "a1000000-0000-4000-8000-000000000001",
      "a1000000-0000-4000-8000-000000000002",
      "a1000000-0000-4000-8000-000000000003",
    ]);
    expect(alice.recentAttempts[0]).toEqual({
      attemptId: "a1000000-0000-4000-8000-000000000001",
      questionId: "e1000000-0000-4000-8000-000000000001",
      questionRef: "QMA-011",
      correct: true,
      marksAwarded: 2,
      questionMarks: 3,
      markingState: "SMART_MARKED",
      createdAt: "2026-10-05T10:00:00.000Z",
    });
    expect(alice.recentAttempts[1]!.marksAwarded).toBeNull(); // the honest unmarked attempt
    expect(alice.recentAttempts[1]!.markingState).toBe("AUTO_GRADED");
    // Bob has no attempts mapped — empty, never fabricated
    expect(view.students[1]!.recentAttempts).toEqual([]);
  });

  test("per-student misconceptions: relaxed probability + active threshold; unattached states skipped", async () => {
    const d = deps(drillRoutes());
    const view = await classNodeStudents(d, TEACHER, CLASS_A, SUBJECT, SUBTOPIC);
    const alice = view.students[0]!;
    expect(alice.misconceptions).toHaveLength(1);
    expect(alice.misconceptions[0]).toEqual({
      misconceptionNodeId: MISCO_1,
      code: "MSC/1",
      title: "Inverts the ratio",
      probability: 0.55, // fresh evidence → the full posterior (relaxed == raw)
      active: true,
    });
    // Bob: his MSC/1 state is STALE — relaxed below the 0.5 threshold; his
    // MSC/3 state is a graph inconsistency (not attached under SUBTOPIC) —
    // skipped, not guessed
    const bob = view.students[1]!;
    expect(bob.misconceptions).toHaveLength(1);
    expect(bob.misconceptions[0]!.active).toBe(false);
    expect(bob.misconceptions[0]!.probability).toBeLessThan(0.5);
    expect(bob.misconceptions[0]!.probability).toBeGreaterThan(0.3); // toward the prior
    expect(bob.misconceptions[0]!.misconceptionNodeId).toBe(MISCO_1);
  });
});

// ── the F-034 read model + the teacher lens (:394-412) ───────────────────────

describe("the F-034 read model (learnerGraphFor) and the teacher lens", () => {
  const learner = M_ALICE;

  const learnerRoutes = (): Route[] => [
    nodeByIdRoute([nodeRow()]),
    subtreeRoute(SUBTREE_IDS.map((id) => ({ id }))),
    nodesByIdsRoute(nodeRows),
    partOfEdgesRoute(partOfEdges),
    familyEdgesRoute(familyEdges),
    skillsByLearnerRoute([{ ...skillRow(learner, 0.2, 4, 1), procedural_fluency_gap: 0.12 }]),
    miscoByLearnerRoute([
      miscoRow(learner, MISCO_2, 0.7, NOW_TEXT), // probability DESC — served in repo order
      miscoRow(learner, MISCO_1, 0.55, NOW_TEXT),
    ]),
    reviewsRoute([
      { node_id: TOPIC, due_at: T0, reason: "TEACHER_ASSIGNED" },
      { node_id: TOPIC, due_at: T1, reason: "DECAY_CROSSED_THRESHOLD" }, // later — earliest wins
      { node_id: SUBTOPIC, due_at: T1, reason: "DECAY_CROSSED_THRESHOLD" },
    ]),
    edgesWithinRoute([{ source_node_id: SUBTOPIC, target_node_id: PREREQ_A }]),
  ];

  test("the walk covers misconception nodes too — the two walks differ on purpose", async () => {
    const d = deps(learnerRoutes());
    const view = await learnerGraphFor(d, learner, SUBJECT);

    expect(view.learnerId).toBe(learner);
    expect(view.rootId).toBe(SUBJECT);
    expect(view.rootCode).toBe("4CH1");
    expect(view.rootTitle).toBe("Chemistry");
    expect(view.asOf).toBe(NOW_ISO);

    // 9 = the 7 structure nodes + the 2 attached misconceptions (the class
    // heatmap's collect() excludes them — the F-034 walk does NOT). MISCO_1
    // attaches under SUBTOPIC (after CONCEPT), MISCO_2 under TOPIC (after
    // SUBTOPIC_2) — attachments follow the structure children per node.
    expect(view.nodes.map((n) => n.id)).toEqual([
      SUBJECT, UNIT, TOPIC, PREREQ_A, SUBTOPIC, CONCEPT, MISCO_1, SUBTOPIC_2, MISCO_2,
    ]);
    // childIds ride from the FULL tree children — misconceptions INCLUDED
    expect(view.nodes.find((n) => n.id === TOPIC)?.childIds).toEqual([
      PREREQ_A, SUBTOPIC, SUBTOPIC_2, MISCO_2,
    ]);
    expect(view.nodes.find((n) => n.id === SUBTOPIC)?.childIds).toEqual([CONCEPT, MISCO_1]);
  });

  test("the measured node: raw + effective + 3-state band + the full skill fields", async () => {
    const d = deps(learnerRoutes());
    const view = await learnerGraphFor(d, learner, SUBJECT);
    const sub = view.nodes.find((n) => n.id === SUBTOPIC);
    expect(sub?.mastery).toBe(0.2);
    expect(sub?.effectiveMastery).toBe(0.2); // fresh → decayed == mastery
    expect(sub?.band).toBe("LOW"); // the student band is 3-state — never UNMEASURED
    expect(sub?.attempts).toBe(4);
    expect(sub?.correctCount).toBe(1);
    expect(sub?.lastPracticedAt).toBe(NOW_ISO);
    expect(sub?.proceduralFluencyGap).toBe(0.12);
  });

  test("unpractised = all-null state; applicability verbatim; the earliest-PENDING review overlay", async () => {
    const d = deps(learnerRoutes());
    const view = await learnerGraphFor(d, learner, SUBJECT);
    const byId = new Map(view.nodes.map((n) => [n.id, n]));

    const root = byId.get(SUBJECT);
    expect(root?.mastery).toBeNull(); // never zeros, never a fabricated band
    expect(root?.effectiveMastery).toBeNull();
    expect(root?.band).toBeNull();
    expect(root?.attempts).toBeNull();
    expect(root?.correctCount).toBeNull();
    expect(root?.lastPracticedAt).toBeNull();
    expect(root?.proceduralFluencyGap).toBeNull();
    expect(root?.reviewDueAt).toBeNull();
    expect(root?.reviewReason).toBeNull();
    expect(root?.misconceptionProbability).toBeNull();
    expect(root?.misconceptionActive).toBeNull();

    expect(byId.get(SUBTOPIC)?.applicability).toEqual(APPLICABILITY); // T-C28 verbatim
    expect(byId.get(SUBTOPIC_2)?.applicability).toBeNull();

    // the review overlay: EARLIEST PENDING per node (TOPIC's T0 wins over T1)
    expect(byId.get(TOPIC)?.reviewDueAt).toBe("2026-10-01T10:00:00.000Z");
    expect(byId.get(TOPIC)?.reviewReason).toBe("TEACHER_ASSIGNED");
    expect(byId.get(SUBTOPIC)?.reviewDueAt).toBe("2026-10-02T10:00:00.000Z");
    expect(byId.get(SUBTOPIC)?.reviewReason).toBe("DECAY_CROSSED_THRESHOLD");
    expect(byId.get(CONCEPT)?.reviewDueAt).toBeNull();
  });

  test("the misconception overlay: staleness-relaxed probability, only on MISCONCEPTION nodes", async () => {
    const d = deps(learnerRoutes());
    const view = await learnerGraphFor(d, learner, SUBJECT);
    const byId = new Map(view.nodes.map((n) => [n.id, n]));

    expect(byId.get(MISCO_1)?.misconceptionProbability).toBe(0.55); // fresh → full posterior
    expect(byId.get(MISCO_1)?.misconceptionActive).toBe(true);
    expect(byId.get(MISCO_2)?.misconceptionProbability).toBe(0.7);
    expect(byId.get(MISCO_2)?.misconceptionActive).toBe(true);
    expect(byId.get(SUBTOPIC)?.misconceptionProbability).toBeNull(); // the overlay never
    expect(byId.get(SUBTOPIC)?.misconceptionActive).toBeNull(); // bleeds onto topics
  });

  test("the teacher lens DELEGATES: deep-equal to the same F-034 read model the student sees", async () => {
    const teacherDeps = deps([
      classRoute([classRow()]),
      membershipRoute([{ one: 1 }]),
      userEnabledRoute([{ id: learner, enabled: true }]),
      ...learnerRoutes(),
    ]);
    const viaTeacher = await classLearnerKnowledgeGraph(
      teacherDeps, TEACHER, CLASS_A, learner, SUBJECT,
    );
    const direct = await learnerGraphFor(deps(learnerRoutes()), learner, SUBJECT);
    // one graph implementation — the lens adds only gates, never a second KG
    expect(viaTeacher).toEqual(direct);
    // and the edges survive the lens (both-endpoints law through byId)
    expect(viaTeacher.prerequisiteEdges).toEqual([
      { prerequisiteId: PREREQ_A, prerequisiteCode: "4CH1/0.1", nodeId: SUBTOPIC, nodeCode: "4CH1/1.1a" },
    ]);
  });
});
