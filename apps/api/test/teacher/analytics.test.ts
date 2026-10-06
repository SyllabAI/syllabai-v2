/**
 * T-MIG-053 tranche-2 — the teacher class-analytics laws, unit tests (r3a).
 * Stubbed sql via the shared fakeSql helper; pins the frozen law
 * (ClassAnalyticsService.java :42-758 @ 6cad6ef):
 *
 *   - the honest unmeasured cell: 0 measured learners → null meanMastery +
 *     "UNMEASURED" band + zero counts — never fabricated (:484);
 *   - the measured cell: RAW stored mastery mean, 4-dp, the shared band
 *     vocabulary (no decay on this surface — :442/:596), evidence kinds
 *     separated (attempts / evidence-backed / tutor / due / servable);
 *   - the §11 batching law: ONE query per evidence table for the whole
 *     cohort — pinned by the captured query count (no per-learner or
 *     per-topic loop touches the database);
 *   - the roster law: users.findEnabledByRole(STUDENT) — enabled students
 *     only (the bind captures enabled = true + role = 'STUDENT');
 *   - the learner-row law: evidenceState MEASURED|UNMEASURED (:639-643),
 *     weakest topics under the evidence floor (:600-612), misconception
 *     signals strongest-first under the BDT threshold (:614-629), tutor
 *     signal counts in their own fields (§4 — engagement is never mastery);
 *   - the deterministic learner order (:188-193): UNMEASURED last → mean
 *     asc → displayName case-folded;
 *   - the T-C11 projection (:513-583): a concept prerequisite projects onto
 *     its anchor SPs (derived=true + concept codes), self-projections
 *     collapse, unmeasured prerequisites are never claimed weak;
 *   - subject isolation (:202-205): a topic outside the root's subtree is a
 *     404, never a silent cross-subject hop; the root 404 is first;
 *   - the affected-learner reason vocabulary (:694-695) and the
 *     reason→mastery(null→1.0)→displayName sort (:700-703);
 *   - the drill-down evidence cap (:708-709) and the "unknown" name
 *     fallback (:696/:723);
 *   - ADR-031 disclosed posture: ONE clock anchor per call (deps.clock).
 */
import { describe, expect, test } from "bun:test";
import {
  CLASS_ANALYTICS_POLICY,
  classLearners,
  classOverview,
  topicDrillDown,
} from "../../src/services/teacher";
import { KnowledgeNotFoundError } from "../../src/services/knowledge";
import { LEARNER_ENGINE_PAPER_DEFAULTS } from "../../src/services/learner";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject root
const SEC = "ea000000-0000-4000-8000-000000000002"; // UNIT
const SUB = "ea000000-0000-4000-8000-000000000003"; // TOPIC
const SP1 = "ea000000-0000-4000-8000-000000000004"; // SUBTOPIC (spec point)
const SP2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC, no evidence
const CONCEPT = "ea000000-0000-4000-8000-000000000006"; // anchors to SP1
const MISCO = "ea000000-0000-4000-8000-000000000007"; // folds under SP1

const L1 = "eb000000-0000-4000-8000-000000000001"; // Ada — measured, weak
const L2 = "eb000000-0000-4000-8000-000000000002"; // Ben — measured, secure
const L3 = "eb000000-0000-4000-8000-000000000003"; // Cy — unmeasured
const PAPER = "ee000000-0000-4000-8000-000000000001";
const Q1 = "ec000000-0000-4000-8000-000000000001";
const A1 = "ed000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-10-01T12:00:00Z");

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

const STRUCTURE_PROVENANCE =
  "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py";

function treeRoutes(): Route[] {
  return [
    {
      // node404 (knowledge/index.ts :384) — the 404-first root read
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")],
    },
    {
      // kgNode404 (teacher/kg.ts) — the band's own 404-first (conceptAnchorsWithin)
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
      // PART_OF children edges (structure) — the concept anchors to SP1
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
  ];
}

interface Evidence {
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  engagements?: Array<Record<string, unknown>>;
  dueReviews?: Array<Record<string, unknown>>;
  recentAttempts?: Array<Record<string, unknown>>;
  servableCandidates?: Array<Record<string, unknown>>;
  prereqEdges?: Array<Record<string, unknown>>;
  closureRows?: Array<Record<string, unknown>>;
  anchorEdges?: Array<Record<string, unknown>>;
  drillEvidence?: Array<Record<string, unknown>>;
  drillServable?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>>;
  pendingAnswers?: number;
}

function evidenceRoutes(e: Evidence): Route[] {
  return [
    { match: /from skill_states/, rows: e.skills ?? [] },
    { match: /from misconception_states/, rows: e.misconceptions ?? [] },
    { match: /from tutor_topic_engagements/, rows: e.engagements ?? [] },
    { match: /from review_schedules/, rows: e.dueReviews ?? [] },
    {
      match: /select a\.learner_id as learner_id, count\(\*\) as total/,
      rows: e.recentAttempts ?? [],
    },
    { match: /from exam_papers p/, rows: [] },
    {
      // activeWithin candidates (the servable rollup source)
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = any/,
      rows: e.servableCandidates ?? [],
    },
    {
      // kg.ts prerequisiteChain closure CTE (node_id, depth) — FIRST match
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: e.closureRows ?? [],
    },
    {
      // prerequisiteRelations (the t1 exported derivation, re-run CTE)
      match: /where e\.relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: e.prereqEdges ?? [],
    },
    {
      // conceptAnchorsWithin (kg.ts — PART_OF sourced at CONCEPT)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: e.anchorEdges ?? [],
    },
    {
      match: /select count\(\*\) as n from answers a/,
      rows: [{ n: e.pendingAnswers ?? 0 }],
    },
    {
      // activeByTopic candidates (drill-down servable refs)
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = \? or exists \( select 1 from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \? \)\) order by q\.difficulty/,
      rows: e.drillServable ?? [],
    },
    {
      // representative evidence (the §5 raw leg)
      match: /select a\.id as attempt_id, a\.learner_id, a\.correct, a\.marks_awarded, a\.marking_state, a\.created_at, q\.id as question_id, q\.external_ref, q\.marks as question_marks from attempts a join questions q on q\.id = a\.question_id where q\.primary_topic_node_id = \? ::uuid or exists/,
      rows: e.drillEvidence ?? [],
    },
    {
      // namesFor / findAllById (affected + evidence names)
      match: /select id, display_name from users where id = any/,
      rows: e.users ?? [],
    },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    {
      // the enabled STUDENT cohort (findEnabledByRole :25-28)
      match: /from users u\s*join user_roles r on r\.user_id = u\.id\s*where r\.role = 'STUDENT' and u\.enabled = true/,
      rows: e.users ?? [],
    },
  ];
}

const ENGINE = {
  decay: LEARNER_ENGINE_PAPER_DEFAULTS.decay,
  bdt: LEARNER_ENGINE_PAPER_DEFAULTS.bdt,
  weakMasteryCeiling: 0.5,
  minAttemptsForWeakness: 3,
};

function makeDeps(e: Evidence) {
  return {
    sql: fakeSql([...treeRoutes(), ...evidenceRoutes(e)]),
    clock: { now: () => T0 },
    engine: ENGINE,
  };
}

const skill = (learnerId: string, nodeId: string, mastery: number, attempts = 5) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
});

const misco = (learnerId: string, probability: number, evidenceAt = "2026-10-01T00:00:00Z") => ({
  learner_id: learnerId,
  misconception_node_id: MISCO,
  probability,
  evidence_count: 4,
  last_evidence_at: evidenceAt,
});

// ── the overview (§2) ────────────────────────────────────────────────────────

describe("teacher class overview — the honest aggregation (§2/§4)", () => {
  test("the empty cohort: unmeasured cells carry null means + UNMEASURED bands, never fabricated", async () => {
    const d = makeDeps({ users: [] });
    const v = await classOverview(d as never, ROOT);
    expect(v.policy).toBe(CLASS_ANALYTICS_POLICY);
    expect(v.rootId).toBe(ROOT);
    expect(v.rootCode).toBe("4CH1");
    expect(v.enrolledLearners).toBe(0);
    expect(v.totalTopics).toBe(6); // structure + concepts (the frozen collect)
    expect(v.measuredTopics).toBe(0);
    const sp1 = v.topics.find((t) => t.nodeId === SP1)!;
    expect(sp1.learnersMeasured).toBe(0);
    expect(sp1.meanMastery).toBeNull();
    expect(sp1.masteryBand).toBe("UNMEASURED");
    expect(sp1.evidenceBackedAttempts).toBe(0);
    expect(sp1.learnersWithActiveMisconception).toBe(0);
    expect(v.recentActivity.windowStart).toBe("2026-09-17T12:00:00.000Z"); // 14d before the anchor
    expect(v.recentActivity.structuredAnswersPendingMarking).toBe(0);
  });

  test("the measured cell: RAW stored mastery mean (4-dp) + the shared band; kinds separated", async () => {
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.9)],
      engagements: [
        { learner_id: L1, node_id: SP1, signal_type: "TOPIC_ENGAGEMENT", occurred_at: "2026-09-30T00:00:00Z" },
      ],
      dueReviews: [{ learner_id: L1, node_id: SP1 }],
      recentAttempts: [
        { learner_id: L1, total: 3, correct: 1, last_activity: "2026-09-29T10:00:00Z" },
      ],
      servableCandidates: [
        { id: Q1, external_ref: "Q-1", question_type: "MCQ", stem: "s", marks: 1, difficulty: 2, expected_time_seconds: 60, command_word: null, primary_topic_node_id: SP1, exam_paper_id: PAPER, provenance: null, active: true },
      ],
      pendingAnswers: 2,
    });
    const v = await classOverview(d as never, ROOT);
    expect(v.enrolledLearners).toBe(2);
    expect(v.learnersWithEvidence).toBe(2); // skills ∪ misconceptions ∪ engagements
    expect(v.learnersRecentlyActive).toBe(1);
    expect(v.measuredTopics).toBe(1);
    const sp1 = v.topics.find((t) => t.nodeId === SP1)!;
    expect(sp1.meanMastery).toBe(0.55); // round4((0.2+0.9)/2)
    expect(sp1.masteryBand).toBe("DEVELOPING"); // 0.45 ≤ 0.55 < 0.8 (shared learner bands)
    expect(sp1.evidenceBackedAttempts).toBe(10);
    expect(sp1.tutorEngagements).toBe(1); // engagement in its OWN field
    expect(sp1.dueReviews).toBe(1);
    expect(sp1.servableQuestions).toBe(1);
    expect(v.recentActivity.recentAttempts).toBe(3);
    expect(v.recentActivity.tutorAsks).toBe(1);
    expect(v.recentActivity.structuredAnswersPendingMarking).toBe(2);
  });

  test("the §11 batching law: ONE query per evidence table — the cohort loop never touches the db", async () => {
    let issued: string[] = [];
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.9)],
    });
    // capture AFTER the run via the fakeSql recorder
    await classOverview(d as never, ROOT);
    issued = (d.sql as unknown as { queries: string[] }).queries;
    expect(issued.filter((q) => q.includes("from skill_states")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from misconception_states")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from tutor_topic_engagements")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from review_schedules")).length).toBe(1);
    expect(issued.filter((q) => q.includes("count(*) as total")).length).toBe(1);
    // the roster read is ONE enabled-students query
    expect(issued.filter((q) => q.includes("r.role = 'STUDENT' and u.enabled = true")).length).toBe(1);
  });

  test("the active misconception rollup: DISTINCT learners + BDT threshold (relaxed)", async () => {
    // L1 active (0.9 ≥ 0.5, fresh evidence), L2 below (0.2)
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      misconceptions: [misco(L1, 0.9), misco(L2, 0.2)],
    });
    const v = await classOverview(d as never, ROOT);
    const sp1 = v.topics.find((t) => t.nodeId === SP1)!;
    expect(sp1.learnersWithActiveMisconception).toBe(1); // DISTINCT learners
    expect(sp1.activeMisconceptionSignals).toBe(1);
    expect(v.learnersWithEvidence).toBe(2); // misconception rows are evidence too
  });
});

// ── the learner list (§2) ────────────────────────────────────────────────────

describe("teacher class learners — evidence-separated rows (§2)", () => {
  test("UNMEASURED rows read honest nulls; MEASURED rows carry the separated kinds", async () => {
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L1, SP2, 0.3)],
      misconceptions: [misco(L1, 0.9)],
      engagements: [
        { learner_id: L1, node_id: SP1, signal_type: "DOUBT", occurred_at: "2026-09-28T00:00:00Z" },
        { learner_id: L1, node_id: SP1, signal_type: "DOUBT", occurred_at: "2026-09-30T00:00:00Z" },
      ],
      dueReviews: [{ learner_id: L1, node_id: SP1 }, { learner_id: L1, node_id: SP2 }],
      recentAttempts: [
        { learner_id: L1, total: 4, correct: 2, last_activity: "2026-09-29T10:00:00Z" },
      ],
    });
    const rows = await classLearners(d as never, ROOT);
    expect(rows.length).toBe(2);
    const ada = rows.find((r) => r.learnerId === L1)!;
    const ben = rows.find((r) => r.learnerId === L2)!;
    expect(ada.evidenceState).toBe("MEASURED");
    expect(ada.topicsMeasured).toBe(2);
    expect(ada.meanMastery).toBe(0.25); // raw stored mean, 4-dp
    expect(ada.misconceptionSignals.length).toBe(1);
    expect(ada.misconceptionSignals[0]!.parentTopicCode).toBe("4CH1-S1-a-1");
    expect(ada.tutorEngagements).toBe(2);
    expect(ada.tutorSignalCounts["DOUBT"]).toBe(2); // own fields, never mastery
    expect(ada.dueReviews).toBe(2);
    expect(ada.recentAttempts).toBe(4);
    expect(ada.recentCorrect).toBe(2);
    expect(ada.lastActivityAt).toBe("2026-09-29T10:00:00.000Z");
    // Ben: no evidence at all → honestly UNMEASURED, never zero
    expect(ben.evidenceState).toBe("UNMEASURED");
    expect(ben.meanMastery).toBeNull();
    expect(ben.weakestTopics.length).toBe(0);
  });

  test("weakest topics respect the evidence floor and sort mastery-asc, cap 3", async () => {
    const d = makeDeps({
      users: [{ id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" }],
      skills: [
        { ...skill(L1, SP1, 0.9), attempts: 5 }, // above floor but secure
        { ...skill(L1, SP2, 0.1), attempts: 3 }, // weak, above floor
        { ...skill(L1, SEC, 0.2), attempts: 4 }, // weak
        { ...skill(L1, SUB, 0.05), attempts: 1 }, // BELOW the floor — excluded
      ],
    });
    const rows = await classLearners(d as never, ROOT);
    const ada = rows[0]!;
    const weakest = ada.weakestTopics;
    expect(weakest.length).toBe(3); // the below-floor skill never appears; cap 3 keeps the rest
    expect(weakest[0]!.code).toBe("4CH1-S1-a-2"); // 0.1 weakest first
    expect(weakest[1]!.code).toBe("4CH1-S1"); // 0.2
    expect(weakest[2]!.code).toBe("4CH1-S1-a-1"); // 0.9 — above floor, still weakest-three
    expect(weakest[0]!.band).toBe("LOW");
  });

  test("the deterministic attention order: measured first, weakest mean first, then names", async () => {
    const d = makeDeps({
      users: [
        { id: L1, display_name: "ada", created_at: "2026-01-01T00:00:00Z" }, // weak measured
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" }, // secure measured
        { id: L3, display_name: "Cy", created_at: "2026-01-03T00:00:00Z" }, // unmeasured
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.95)],
    });
    const rows = await classLearners(d as never, ROOT);
    expect(rows.map((r) => r.learnerId)).toEqual([L1, L2, L3]);
  });
});

// ── the topic drill-down (§5) ────────────────────────────────────────────────

describe("teacher topic drill-down — class → topic → learners → evidence (§5)", () => {
  test("subject isolation: a topic outside the subtree is a 404, never a cross-subject hop", async () => {
    const d = makeDeps({});
    await expect(topicDrillDown(d as never, ROOT, MISCO)).rejects.toThrow(KnowledgeNotFoundError);
  });

  test("the prerequisite chain: class mastery per link, honest UNMEASURED on gaps", async () => {
    const d = makeDeps({
      users: [{ id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" }],
      skills: [skill(L1, SP1, 0.2)],
      prereqEdges: [
        // SP1 depends on SP2 (direct, structure-level)
        { source_node_id: SP1, target_node_id: SP2 },
        // SP1 depends on CONCEPT (concept-level — the projection's raw material)
        { source_node_id: SP1, target_node_id: CONCEPT },
      ],
      closureRows: [
        // the closure CTE rows (node_id, depth) — deepest first, then node id
        { node_id: SP2, depth: 1 },
        { node_id: CONCEPT, depth: 1 },
      ],
      anchorEdges: [
        // C-Alpha anchors to SP1 (the concept's placement)
        {
          source_node_id: CONCEPT, target_node_id: SP1, relation_type: "PART_OF",
          validation_status: "VALIDATED", provenance: "t-c11:settled|anchor:AI_SUGGESTED",
          rationale: "concept anchor", source_code: "C-Alpha", source_title: "Alpha concept",
          source_node_type: "CONCEPT", source_validation_status: "SUGGESTED",
          target_code: "4CH1-S1-a-1", target_title: "Spec point 1",
          target_node_type: "SUBTOPIC", target_validation_status: "VALIDATED",
        },
      ],
    });
    const v = await topicDrillDown(d as never, ROOT, SP1);
    expect(v.prerequisiteChain.length).toBe(2);
    const sp2 = v.prerequisiteChain.find((p) => p.code === "4CH1-S1-a-2")!;
    expect(sp2.depth).toBe(1);
    expect(sp2.learnersMeasured).toBe(0);
    expect(sp2.meanMastery).toBeNull();
    expect(sp2.masteryBand).toBe("UNMEASURED");
  });

  test("the T-C11 projection: the concept prerequisite lands on its anchor SP (derived), self-projection collapses", async () => {
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.3)], // SP1 measured weak
      prereqEdges: [
        // C-Alpha is a prerequisite of SP1 — the SELF pair (SP1←C-Alpha, C-Alpha anchored to SP1)
        { source_node_id: SP1, target_node_id: CONCEPT },
        // C-Alpha is a prerequisite of SP2 — projects onto SP1 (the anchor)
        { source_node_id: SP2, target_node_id: CONCEPT },
      ],
      anchorEdges: [
        {
          source_node_id: CONCEPT, target_node_id: SP1, relation_type: "PART_OF",
          validation_status: "VALIDATED", provenance: "t-c11:settled|anchor:AI_SUGGESTED",
          rationale: "concept anchor", source_code: "C-Alpha", source_title: "Alpha concept",
          source_node_type: "CONCEPT", source_validation_status: "SUGGESTED",
          target_code: "4CH1-S1-a-1", target_title: "Spec point 1",
          target_node_type: "SUBTOPIC", target_validation_status: "VALIDATED",
        },
      ],
    });
    const v = await classOverview(d as never, ROOT);
    const weak = v.weakPrerequisites;
    expect(weak.length).toBe(1); // the self-projection collapsed
    const w = weak[0]!;
    expect(w.prerequisiteNodeId).toBe(SP1); // the concept projected onto its anchor
    expect(w.derived).toBe(true);
    expect(w.derivedViaConceptCodes).toEqual(["C-Alpha"]);
    expect(w.meanMastery).toBe(0.25);
    expect(w.masteryBand).toBe("LOW");
    expect(w.dependents.map((x) => x.code)).toEqual(["4CH1-S1-a-2"]); // code-sorted
    expect(w.dependents[0]!.meanMastery).toBeNull(); // SP2 unmeasured — honest null
  });

  test("unmeasured prerequisites are never claimed weak; the measured-secure ceiling holds", async () => {
    const d = makeDeps({
      users: [{ id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" }],
      skills: [skill(L1, SP2, 0.95)], // SP2 measured SECURE (≥ ceiling); SP1 unmeasured
      prereqEdges: [
        { source_node_id: SP1, target_node_id: SP2 }, // dependent SP2, prereq SP1
        { source_node_id: SP2, target_node_id: SP1 }, // dependent SP1 (unmeasured), prereq SP2
      ],
    });
    const v = await classOverview(d as never, ROOT);
    expect(v.weakPrerequisites.length).toBe(0); // SP2 secure; SP1 unmeasured
  });

  test("affected learners: the reason vocabulary, the null-mastery misconception-only row, the sort", async () => {
    const d = makeDeps({
      users: [
        { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
        { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
      ],
      skills: [{ ...skill(L1, SP1, 0.2), attempts: 3 }], // Ada weak (below ceiling, at floor)
      misconceptions: [
        misco(L1, 0.9), // Ada also misconception-affected → BOTH
        misco(L2, 0.8), // Ben misconception-only → mastery null
      ],
    });
    const v = await topicDrillDown(d as never, ROOT, SP1);
    const affected = v.affectedLearners;
    expect(affected.length).toBe(2);
    const ada = affected.find((a) => a.learnerId === L1)!;
    const ben = affected.find((a) => a.learnerId === L2)!;
    expect(ada.reason).toBe("LOW_MASTERY_AND_ACTIVE_MISCONCEPTION");
    expect(ada.mastery).toBe(0.2);
    expect(ada.misconceptions.length).toBe(1);
    expect(ben.reason).toBe("ACTIVE_MISCONCEPTION");
    expect(ben.mastery).toBeNull(); // honest — no mastery evidence on SP1
    // sort: reason asc is the PLAIN string order (frozen Comparator)
    // ACTIVE_MISCONCEPTION < LOW_MASTERY_AND_ACTIVE_MISCONCEPTION
    expect(affected[0]!.learnerId).toBe(L2);
  });

  test("the raw evidence leg: 20-cap recent attempts, name fallback, marksAwarded nullable", async () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({
      attempt_id: A1,
      learner_id: L1,
      correct: i % 2 === 0,
      marks_awarded: i % 2 === 0 ? 1 : null,
      marking_state: "HUMAN_MARKED",
      created_at: `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
      question_id: Q1,
      external_ref: "Q-9",
      question_marks: 2,
    }));
    const routes: Route[] = [
      ...treeRoutes(),
      ...evidenceRoutes({ users: [], drillEvidence: rows }),
    ];
    // swap the drill-evidence route for a param-aware rowsFor emulating LIMIT
    const idx = routes.findIndex((r) => r.match.source.includes('attempt_id'));
    routes[idx] = {
      match: routes[idx]!.match,
      rows: [],
      rowsFor: (params) => rows.slice(0, Number(params[params.length - 1])),
    };
    const d = { sql: fakeSql(routes), clock: { now: () => T0 }, engine: ENGINE };
    const v = await topicDrillDown(d as never, ROOT, SP1);
    expect(v.representativeEvidence.length).toBe(20); // the cap, not the 22 scanned
    expect(v.representativeEvidence[0]!.learnerDisplayName).toBe("unknown");
    expect(v.representativeEvidence[0]!.marksAwarded).toBe(1);
    const second = v.representativeEvidence[1]!;
    expect(second.marksAwarded).toBeNull(); // unmarked — null, not zero
    expect(second.questionMarks).toBe(2);
  });

  test("the servable hand-off: validated questions surface as refs for the Test Builder", async () => {
    const d = makeDeps({
      users: [],
      drillServable: [
        {
          id: Q1, external_ref: "Q-1", question_type: "MCQ", stem: "s", marks: 1,
          difficulty: 2, expected_time_seconds: 60, command_word: null,
          primary_topic_node_id: SP1, exam_paper_id: null, provenance: null, active: true,
        },
      ],
    });
    const v = await topicDrillDown(d as never, ROOT, SP1);
    expect(v.servableQuestions.length).toBe(1);
    const q = v.servableQuestions[0]!;
    expect(q.externalRef).toBe("Q-1");
    expect(q.type).toBe("MCQ");
    expect(q.marks).toBe(1);
    expect(q.difficulty).toBe(2);
  });
});
