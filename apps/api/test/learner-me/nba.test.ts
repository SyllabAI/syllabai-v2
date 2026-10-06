/**
 * T-MIG-043 tranche-2 engine pins — the NBA port (nba.ts) against the
 * frozen law @ 6cad6ef (NextBestActionService.java :79-554, policy
 * nba-rules/v1.3) + the T-C11 graph loader (ConceptDependencyGraphLoader /
 * ConceptDependencyGraph.of, fail-closed).
 *
 * Fixture shape: the shared fakeSql helper stubs every read the engine can
 * issue; the KG tree is a fixed 8-node subject (SUBJECT → UNIT → 3 TOPICs,
 * a SUBTOPIC under T1, a CONCEPT under the SUBTOPIC, a MISCONCEPTION folded
 * into T1) plus one out-of-subtree node for the isolation pins. The T-C11
 * graph is a fixture graph (the frozen tests build fixture graphs too —
 * ConceptDependencyGraph.of is the same single enforcement point).
 *
 * Determinism: mastery/probability fixtures anchor last_practiced_at /
 * last_evidence_at AT the fixed clock instant, so decayed/relaxed values
 * equal the stored anchors exactly and the fmt() reason strings pin
 * deterministically ("0.30"). now() comes from the injected clock.
 */
import { describe, expect, test } from "bun:test";
import { fakeSql, type Route } from "../assessment/helpers";
import type { SubmitClock } from "../../src/services/selfmark";
import {
  LearnerMeNotFoundError,
  buildLearnerMeModule,
  nbaActionsFor,
  type NbaDeps,
} from "../../src/services/learner-me";
import {
  buildConceptDependencyGraphFromSnapshot,
  conceptDependencyGraphOf,
} from "../../src/services/learner-me/nba-concept-graph";
import type { ConceptDependencyGraph, ConceptEdge } from "../../src/services/learner-me/nba-concept-graph";
import type { NextBestActionsView } from "@syllabai/contracts";

// ── fixed ids (fleet captured-shape style) ──────────────────────────────────

const LEARNER = "aa000000-0000-4000-8000-000000000001";
const SUBJECT = "20000000-0000-4000-8000-0000000000a1"; // code 4CH1 (SUBJECT root)
const NODE_UNIT = "20000000-0000-4000-8000-0000000000a2"; // 4CH1-U1 UNIT
const NODE_T1 = "20000000-0000-4000-8000-0000000000a3"; // 4CH1-T1 TOPIC
const NODE_T2 = "20000000-0000-4000-8000-0000000000a4"; // 4CH1-T2 TOPIC
const NODE_T3 = "20000000-0000-4000-8000-0000000000a5"; // 4CH1-T3 TOPIC (uncovered)
const NODE_S1 = "20000000-0000-4000-8000-0000000000a6"; // 4CH1-S1 SUBTOPIC (under T1)
const NODE_M1 = "20000000-0000-4000-8000-0000000000a7"; // 4CH1-M1 MISCONCEPTION
const NODE_M2 = "20000000-0000-4000-8000-0000000000a9"; // 4CH1-M2 MISCONCEPTION (folded into T2)
const NODE_C1 = "20000000-0000-4000-8000-0000000000a8"; // 4CH1-C1 CONCEPT (under S1)
const NODE_OUT = "20000000-0000-4000-8000-0000000000ff"; // 4CH1-OUT TOPIC (out of subtree)
const QUESTION_1 = "40000000-0000-4000-8000-000000000001";
const QUESTION_2 = "40000000-0000-4000-8000-000000000002";
const QUESTION_3 = "40000000-0000-4000-8000-000000000003";
const ANSWER_1 = "60000000-0000-4000-8000-000000000001";
const ANSWER_2 = "60000000-0000-4000-8000-000000000002";
const ANSWER_3 = "60000000-0000-4000-8000-000000000003";

const NOW_TEXT = "2026-10-06T07:45:00Z";
const NOW_ISO = "2026-10-06T07:45:00.000Z";
const T_PAST = "2026-10-02T10:00:00Z"; // overdue review / past evidence
const T_FUTURE = "2026-10-09T10:00:00Z"; // future-due review

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};

// ── fixture row builders ─────────────────────────────────────────────────────

interface NodeRowLike {
  id: string;
  code: string;
  node_type: string;
  title: string;
}

const NODE_ROWS: NodeRowLike[] = [
  { id: SUBJECT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry" },
  { id: NODE_UNIT, code: "4CH1-U1", node_type: "UNIT", title: "Unit 1" },
  { id: NODE_T1, code: "4CH1-T1", node_type: "TOPIC", title: "Topic One" },
  { id: NODE_T2, code: "4CH1-T2", node_type: "TOPIC", title: "Topic Two" },
  { id: NODE_T3, code: "4CH1-T3", node_type: "TOPIC", title: "Topic Three" },
  { id: NODE_S1, code: "4CH1-S1", node_type: "SUBTOPIC", title: "Sub One" },
  { id: NODE_M1, code: "4CH1-M1", node_type: "MISCONCEPTION", title: "Confused Ions" },
  { id: NODE_M2, code: "4CH1-M2", node_type: "MISCONCEPTION", title: "Second Misconception" },
  { id: NODE_C1, code: "4CH1-C1", node_type: "CONCEPT", title: "Concept One" },
];

const SUBTREE = [SUBJECT, NODE_UNIT, NODE_T1, NODE_T2, NODE_T3, NODE_S1, NODE_C1];

const PART_OF: Array<{ source_node_id: string; target_node_id: string }> = [
  { source_node_id: NODE_UNIT, target_node_id: SUBJECT },
  { source_node_id: NODE_T1, target_node_id: NODE_UNIT },
  { source_node_id: NODE_T2, target_node_id: NODE_UNIT },
  { source_node_id: NODE_T3, target_node_id: NODE_UNIT },
  { source_node_id: NODE_S1, target_node_id: NODE_T1 },
  { source_node_id: NODE_C1, target_node_id: NODE_S1 },
];

/** M1 folds into T1 via MISCONCEPTION_OF (the V6 contract shape). */
const FAMILY = [
  {
    source_node_id: NODE_M1,
    target_node_id: NODE_T1,
    relation_type: "MISCONCEPTION_OF",
    source_code: "4CH1-M1",
    source_title: "Confused Ions",
    source_type: "MISCONCEPTION",
  },
  {
    source_node_id: NODE_M2,
    target_node_id: NODE_T2,
    relation_type: "MISCONCEPTION_OF",
    source_code: "4CH1-M2",
    source_title: "Second Misconception",
    source_type: "MISCONCEPTION",
  },
];

const skillRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  node_id: NODE_T1,
  mastery: 0.3,
  attempts: 2,
  correct_count: 1,
  last_practiced_at: NOW_TEXT, // anchored at the clock → decayed == stored
  procedural_fluency_gap: null,
  ...over,
});

const misRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  misconception_node_id: NODE_M1,
  probability: 0.9,
  evidence_count: 3,
  last_evidence_at: NOW_TEXT, // anchored → effective == stored
  ...over,
});

const reviewRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  node_id: NODE_T1,
  due_at: T_PAST,
  reason: "DECAY_CROSSED_THRESHOLD",
  ...over,
});

const answerRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: ANSWER_1,
  marking_state: "SMART_MARKED",
  marks_awarded: 0,
  created_at: T_PAST,
  part_marks: 2,
  part_label: "a",
  question_id: QUESTION_1,
  primary_topic_node_id: NODE_T1,
  ...over,
});

/** the primary-topic mapping the T3 servable fixtures use. */
const QUESTION_TOPICS: Record<string, string> = {
  [QUESTION_1]: NODE_T1,
  [QUESTION_2]: NODE_T2,
  [QUESTION_3]: NODE_T3,
};

const servableQuestionRow = (qid: string, topicId: string): Record<string, unknown> => ({
  id: qid,
  external_ref: null,
  question_type: "MCQ_SINGLE",
  stem: "stem",
  marks: 2,
  difficulty: 1,
  expected_time_seconds: 60,
  command_word: null,
  primary_topic_node_id: topicId,
  exam_paper_id: null,
  provenance: "SEED_DEMO",
  active: true,
});

// ── the route set (every read the engine can issue) ─────────────────────────

interface NbaFixture {
  subtree?: string[];
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  prereqEdges?: Array<{ source_node_id: string; target_node_id: string }>;
  reviews?: Array<Record<string, unknown>>;
  answers?: Array<Record<string, unknown>>;
  asks?: Array<{ node_id: string; ask_count: number }>;
  signals?: Array<{ node_id: string; signal_type: string; ask_count: number }>;
  /** topics whose questions select returns one servable MCQ (default: none) */
  topicsWithServable?: string[];
  /** records every topic whose servable count is queried (cache pins) */
  onTopicCount?: (topicId: string) => void;
  /** questions the single findById read resolves (default: none) */
  servableQuestionIds?: string[];
}

function nbaRoutes(f: NbaFixture): Route[] {
  const topics = new Set(f.topicsWithServable ?? []);
  const servableIds = new Set(f.servableQuestionIds ?? []);
  return [
    {
      match: /^select id from knowledge_nodes where id = \?$/,
      rows: [],
      rowsFor: (p) => (p[0] === SUBJECT ? [{ id: SUBJECT }] : []),
    },
    {
      // the recursive CTE, whitespace-collapsed
      match: /WHERE n\.id IN \(SELECT id FROM subtree\)$/,
      rows: [],
      rowsFor: (p) => (p[0] === SUBJECT ? (f.subtree ?? SUBTREE).map((id) => ({ id })) : []),
    },
    {
      match: /^select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
      rows: [],
      rowsFor: (p) =>
        (p[0] as string[])
          .map((id) => NODE_ROWS.find((n) => n.id === id))
          .filter((n): n is NodeRowLike => n !== undefined),
    },
    {
      match: /^select source_node_id, target_node_id from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any\( \? ::uuid\[\]\) and target_node_id = any\( \? ::uuid\[\]\)$/,
      rows: PART_OF,
    },
    {
      match: /^select e\.source_node_id, e\.target_node_id, e\.relation_type, n\.code as source_code/,
      rows: FAMILY,
    },
    {
      match: /^select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap/,
      rows: f.skills ?? [],
    },
    {
      match: /^select misconception_node_id, probability, evidence_count, last_evidence_at/,
      rows: f.misconceptions ?? [],
    },
    {
      match: /^select source_node_id, target_node_id from knowledge_edges where relation_type = 'REQUIRES_PREREQUISITE' and source_node_id = any\( \? ::uuid\[\]\) and target_node_id = any\( \? ::uuid\[\]\)$/,
      rows: f.prereqEdges ?? [],
    },
    {
      match: /^select node_id, due_at, reason from review_schedules/,
      rows: f.reviews ?? [],
    },
    {
      match: /^select a\.id, a\.marking_state, a\.marks_awarded, a\.created_at,/,
      rows: f.answers ?? [],
    },
    {
      match: /^select node_id, count\(\*\)::int as ask_count/,
      rows: f.asks ?? [],
    },
    {
      match: /^select node_id, coalesce\(signal_type, 'TOPIC_ENGAGEMENT'\) as signal_type/,
      rows: f.signals ?? [],
    },
    // ── the servable composition (questions module) ──
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = \? or exists/,
      rows: [],
      rowsFor: (p) => {
        const topicId = String(p[0]);
        f.onTopicCount?.(topicId);
        return topics.has(topicId) ? [servableQuestionRow(QUESTION_1, topicId)] : [];
      },
    },
    {
      match: /from questions q where q\.id = \?$/,
      rows: [],
      rowsFor: (p) =>
        servableIds.has(String(p[0]))
          ? [servableQuestionRow(String(p[0]), QUESTION_TOPICS[String(p[0])] ?? NODE_T1)]
          : [],
    },
    { match: /from exam_papers p where p\.validation_state in \('REJECTED', 'FLAGGED'\)$/, rows: [] },
    { match: /from question_options o where o\.question_id = any/, rows: [] },
    { match: /from question_versions v left join question_parts p on p\.question_version_id = v\.id where v\.question_id = \? order by v\.version desc$/, rows: [] },
    { match: /from question_versions v left join question_parts p on p\.question_version_id = v\.id where v\.question_id = any/, rows: [] },
    { match: /from question_spec_points qsp join knowledge_nodes kn/, rows: [] },
  ];
}

function fixtureGraph(edges: ConceptEdge[]): ConceptDependencyGraph {
  return conceptDependencyGraphOf(
    edges.map((e) => ({ ...e, validationStatus: "HUMAN_VALIDATED" })),
    new Set(["4CH1", "4CH1-U1", "4CH1-T1", "4CH1-T2", "4CH1-T3", "4CH1-S1", "4CH1-M1", "4CH1-C1", "4CH1-OUT"]),
  );
}

const deps = (routes: Route[], over: Partial<NbaDeps> = {}): NbaDeps => ({
  sql: fakeSql(routes) as unknown as NbaDeps["sql"],
  clock,
  ...over,
});

const codes = (v: NextBestActionsView): string[] => v.actions.map((a) => a.reasonCode);

// ── the T-C11 loader pins ────────────────────────────────────────────────────

describe("nba-concept-graph (T-C11 loader, frozen law)", () => {
  test("packaged settled snapshot loads with the frozen validated counts", () => {
    const g = buildConceptDependencyGraphFromSnapshot();
    expect(g.validatedEdgeCount()).toBe(272); // the frozen loader's logged count
    expect(g.isEmpty()).toBe(false);
    expect(g.edges("REQUIRES_PREREQUISITE").length).toBe(206);
    expect(g.edges("REMEDIATED_BY").length).toBe(25);
    // deterministic order: (source, target, relation)
    const first = g.edges("REQUIRES_PREREQUISITE");
    for (let i = 1; i < first.length; i++) {
      const a = first[i - 1]!;
      const b = first[i]!;
      expect(a.source <= b.source ? a.source < b.source || a.target <= b.target : false).toBe(true);
    }
  });

  test("fail-closed factory: HUMAN_VALIDATED-only, verbatim error texts", () => {
    const known = new Set(["A", "B", "C"]);
    const edge = (source: string, relation: string, target: string, validationStatus = "HUMAN_VALIDATED") => ({
      source,
      relation,
      target,
      validationStatus,
    });
    // held/REVIEW_REQUIRED edges are excluded — Case-D, by construction
    const g = conceptDependencyGraphOf(
      [edge("A", "RELATED_TO", "B"), edge("B", "RELATED_TO", "C", "SUGGESTED"), edge("A", "RELATED_TO", "C", "REVIEW_REQUIRED")],
      known,
    );
    expect(g.validatedEdgeCount()).toBe(1);
    expect(g.edges("RELATED_TO")).toEqual([{ source: "A", relation: "RELATED_TO", target: "B" }]);

    expect(() => conceptDependencyGraphOf([edge("A", "NOT_A_RELATION", "B")], known)).toThrow(
      "concept graph: unknown relation 'NOT_A_RELATION' on edge A -> B",
    );
    expect(() => conceptDependencyGraphOf([edge("A", "RELATED_TO", "Z")], known)).toThrow(
      "concept graph: edge endpoint 'Z' is not a known graph node",
    );
    expect(() => conceptDependencyGraphOf([edge("A", "RELATED_TO", "B"), edge("A", "RELATED_TO", "B")], known)).toThrow(
      "concept graph: duplicate validated edge A -[RELATED_TO]-> B",
    );
  });
});

// ── the engine: scoping + the honest empty state ────────────────────────────

describe("nba engine — scoping + determinism", () => {
  test("valid root with no evidence: empty ranked list, never fabricated advice", async () => {
    const v = await nbaActionsFor(deps(nbaRoutes({})), LEARNER, SUBJECT);
    expect(v.policy).toBe("nba-rules/v1.3");
    expect(v.learnerId).toBe(LEARNER);
    expect(v.rootId).toBe(SUBJECT);
    expect(v.asOf).toBe(NOW_ISO);
    expect(v.actions).toEqual([]);
  });

  test("unknown root: the NBA engine owns its 404 (verbatim frozen text)", async () => {
    const unknownRoot = "20000000-0000-4000-8000-0000000000e1";
    try {
      await nbaActionsFor(deps(nbaRoutes({})), LEARNER, unknownRoot);
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect(e instanceof LearnerMeNotFoundError).toBe(true);
      expect((e as Error).constructor.name).toBe("LearnerMeNotFoundError");
      expect((e as Error).message).toBe(`knowledge node ${unknownRoot} not found`);
    }
  });
});

// ── T1 — due retrieval (decay-triggered reviews), overdue first ─────────────

describe("nba engine — T1 due retrieval", () => {
  test("pending reviews rank REVIEW_TOPIC, overdue flagged, reason name humanized", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          reviews: [
            reviewRow({ node_id: NODE_T2, due_at: T_PAST, reason: "DECAY_CROSSED_THRESHOLD" }),
            reviewRow({ node_id: NODE_T1, due_at: T_FUTURE, reason: "TEACHER_ASSIGNED" }),
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["DUE_REVIEW", "DUE_REVIEW"]);
    expect(v.actions[0]!.actionType).toBe("REVIEW_TOPIC");
    expect(v.actions[0]!.targetCode).toBe("4CH1-T2"); // overdue first
    expect(v.actions[0]!.rank).toBe(1);
    expect(v.actions[0]!.reasonDetail).toBe(
      `Retrieval practice due (scheduled ${T_PAST.replace("Z", ".000Z")}, decay crossed threshold, overdue)`,
    );
    expect(v.actions[1]!.targetCode).toBe("4CH1-T1");
    expect(v.actions[1]!.rank).toBe(2);
    expect(v.actions[1]!.reasonDetail).toBe(
      `Retrieval practice due (scheduled ${T_FUTURE.replace("Z", ".000Z")}, teacher assigned)`,
    );
    expect(v.actions.every((a) => a.questionId === null)).toBe(true);
  });

  test("subject isolation: reviews on nodes outside the subtree are ignored", async () => {
    const v = await nbaActionsFor(
      deps(nbaRoutes({ reviews: [reviewRow({ node_id: NODE_OUT, due_at: T_PAST })] })),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });
});

// ── T2 — prerequisite remediation (both-measured-weak gate) ─────────────────

describe("nba engine — T2 prerequisite remediation", () => {
  const kgEdge = [{ source_node_id: NODE_T2, target_node_id: NODE_T1 }]; // T2 depends on T1

  test("dependent established-weak + prerequisite measured weak ⇒ remediate the prerequisite", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          prereqEdges: kgEdge,
          skills: [
            skillRow({ node_id: NODE_T2, mastery: 0.3, attempts: 2 }), // dependent, weak
            skillRow({ node_id: NODE_T1, mastery: 0.4, attempts: 1 }), // prerequisite, weak
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    // T2 targets the prerequisite; the still-unclaimed weak dependent then
    // falls through to T6 (weak measured mastery) — the frozen tier stack
    // composes exactly this way (one action per topic keeps T1 off T6).
    expect(codes(v)).toEqual(["PREREQUISITE_WEAK", "LOW_MASTERY"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("REVIEW_PREREQUISITE");
    expect(a.targetCode).toBe("4CH1-T1");
    expect(a.reasonDetail).toBe(
      "Prerequisite of 4CH1-T2 (Topic Two); measured mastery 0.40 here and 0.30 on the dependent topic",
    );
    const t6 = v.actions[1]!;
    expect(t6.targetCode).toBe("4CH1-T2");
    expect(t6.reasonDetail).toBe(
      "Measured mastery 0.30 (band LOW) over 2 attempts, last practiced " + NOW_ISO,
    );
  });

  test("gates: dependent not established-weak (attempts < min) or prerequisite unpractised ⇒ no action", async () => {
    // dependent has < minAttemptsForWeakness attempts → the T2 gate skips
    const v1 = await nbaActionsFor(
      deps(
        nbaRoutes({
          prereqEdges: kgEdge,
          skills: [
            skillRow({ node_id: NODE_T2, mastery: 0.3, attempts: 1 }),
            skillRow({ node_id: NODE_T1, mastery: 0.4, attempts: 1 }),
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v1.actions).toEqual([]);
    // prerequisite never attempted → depEff gate cannot pass (pre has no effective)
    const v2 = await nbaActionsFor(
      deps(
        nbaRoutes({
          prereqEdges: kgEdge,
          skills: [skillRow({ node_id: NODE_T2, mastery: 0.3, attempts: 3 })],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    // T2 cannot act (no measured prerequisite) but T6 still covers the weak
    // dependent — honest coverage, never a silent gap
    expect(codes(v2)).toEqual(["LOW_MASTERY"]);
  });

  test("gates: measured strength on either endpoint ⇒ no remediation", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          prereqEdges: kgEdge,
          skills: [
            skillRow({ node_id: NODE_T2, mastery: 0.5, attempts: 2 }), // dependent ≥ ceiling
            skillRow({ node_id: NODE_T1, mastery: 0.4, attempts: 1 }),
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });
});

// ── T2b — validated prerequisite chain (T-C11, learner-evidence-gated) ──────

describe("nba engine — T2b validated prerequisite chain", () => {
  const graph = fixtureGraph([{ source: "4CH1-T2", relation: "REQUIRES_PREREQUISITE", target: "4CH1-S1" }]);

  test("graph nominates, learner evidence gates: unmeasured prerequisite reported honestly", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          skills: [skillRow({ node_id: NODE_T2, mastery: 0.2, attempts: 3 })], // dependent established-weak
        }),
        { conceptGraph: graph },
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["VALIDATED_PREREQUISITE_CHAIN", "LOW_MASTERY"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("REVIEW_PREREQUISITE");
    expect(a.targetCode).toBe("4CH1-S1");
    expect(a.reasonDetail).toBe(
      "Validated prerequisite chain: 4CH1-T2 (Topic Two) measured 0.20 over 3 attempts requires 4CH1-S1" +
        " — prerequisite not yet measured for this learner; strengthen the foundation first",
    );
  });

  test("measured strength overrides the graph's nomination (the graph never invents weakness)", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          skills: [
            skillRow({ node_id: NODE_T2, mastery: 0.2, attempts: 3 }),
            skillRow({ node_id: NODE_S1, mastery: 0.9, attempts: 2 }), // prerequisite strong
          ],
        }),
        { conceptGraph: graph },
      ),
      LEARNER,
      SUBJECT,
    );
    // the chain nomination is overridden; T6 still covers the weak dependent
    expect(codes(v)).toEqual(["LOW_MASTERY"]);
    expect(v.actions[0]!.targetCode).toBe("4CH1-T2");
  });

  test("no learner evidence on the dependent ⇒ the graph alone never acts", async () => {
    const v = await nbaActionsFor(deps(nbaRoutes({})), LEARNER, SUBJECT);
    expect(v.actions).toEqual([]);
  });
});

// ── T3 — low-mark problem questions ─────────────────────────────────────────

describe("nba engine — T3 problem questions", () => {
  test("recent low-mark servable answer ⇒ RETRY_PROBLEM_QUESTION with the verbatim detail", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          answers: [answerRow({ marks_awarded: 0, part_marks: 2, part_label: "a" })],
          servableQuestionIds: [QUESTION_1],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["PROBLEM_QUESTION"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("RETRY_PROBLEM_QUESTION");
    expect(a.targetCode).toBe("4CH1-T1");
    expect(a.questionId).toBe(QUESTION_1); // the ONLY tier that carries a question id
    expect(a.reasonDetail).toBe("Last marked 0/2 on part a (smart marked)");
    expect(a.servableQuestionCount).toBe(0); // no questions mapped to T1 in this fixture
  });

  test("cap problemQuestionCap=2; PENDING / null-marks / ratio>0.5 / out-of-subtree / unservable all skip", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          answers: [
            answerRow({ id: ANSWER_1, question_id: QUESTION_1, marks_awarded: 0, primary_topic_node_id: NODE_T1 }),
            answerRow({ id: ANSWER_2, question_id: QUESTION_2, marks_awarded: 0, primary_topic_node_id: NODE_T2 }),
            answerRow({ id: ANSWER_3, question_id: QUESTION_3, marks_awarded: 0, primary_topic_node_id: NODE_T3 }), // cap exhausted
            answerRow({ question_id: QUESTION_3, marking_state: "PENDING", marks_awarded: null }),
            answerRow({ marks_awarded: 2, part_marks: 2 }), // ratio 1.0 > 0.5
            answerRow({ marks_awarded: 3, part_marks: 2 }), // marks > max
            answerRow({ primary_topic_node_id: NODE_OUT }), // out of subtree
            answerRow({ primary_topic_node_id: null }),
          ],
          servableQuestionIds: [QUESTION_1, QUESTION_2],
        }),
        { recommendation: { problemQuestionCap: 2 } },
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["PROBLEM_QUESTION", "PROBLEM_QUESTION"]);
    expect(v.actions.map((a) => a.questionId)).toEqual([QUESTION_1, QUESTION_2]); // recency order
  });

  test("unservable question (V20/spec rule via the composed ONE owner) never targets", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          answers: [answerRow({ question_id: QUESTION_1 })],
          servableQuestionIds: [], // findById → null ⇒ skip
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });
});

// ── T4 — suspected misconceptions (BDT) ─────────────────────────────────────

describe("nba engine — T4 misconceptions", () => {
  test("active BDT evidence ⇒ ASK_TUTOR on the misconception node, parent topic named", async () => {
    const v = await nbaActionsFor(
      deps(nbaRoutes({ misconceptions: [misRow({ probability: 0.9, evidence_count: 3 })] })),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["MISCONCEPTION_SUSPECTED"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("ASK_TUTOR");
    expect(a.targetCode).toBe("4CH1-M1"); // folded into T1 → in-subtree
    expect(a.servableQuestionCount).toBe(0); // questions never map to misconceptions
    expect(a.reasonDetail).toBe(
      "Misconception probability 0.90 from 3 evidence item(s) on 4CH1-T1 (Topic One)" +
        " — ask the Tutor for a grounded explanation",
    );
  });

  test("relaxed evidence gates: below activeThreshold ⇒ silent (staleness relaxation, ADR-032)", async () => {
    // probability 0.9 stored ~180d ago ⇒ relaxed to prior + (0.9-0.3)*e^-1 ≈ 0.5207 — still active;
    // push the anchor far out: 365d ⇒ 0.3 + 0.6*e^-2.0278 ≈ 0.378 < 0.5
    const stale = "2025-04-06T07:45:00Z";
    const v = await nbaActionsFor(
      deps(nbaRoutes({ misconceptions: [misRow({ probability: 0.9, last_evidence_at: stale })] })),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });

  test("sort: relaxed probability DESC across two real misconception nodes (MED-2)", async () => {
    // uq_misconception_state: one state per (learner, node) — two DISTINCT nodes.
    // M1 anchors at NOW (effective == 0.70); M2 anchors 90d ago:
    //   0.3 + (0.8-0.3)*e^(-0.5) ≈ 0.603 — active (>= 0.5) but below M1.
    const stale = "2026-07-08T07:45:00Z"; // 90 days before NOW
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          misconceptions: [
            misRow({ misconception_node_id: NODE_M2, probability: 0.8, last_evidence_at: stale }),
            misRow({ misconception_node_id: NODE_M1, probability: 0.7 }), // anchored at NOW → 0.70
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    // the FRESH 0.70 outranks the relaxed 0.8 (stale evidence loses force)
    expect(codes(v)).toEqual(["MISCONCEPTION_SUSPECTED", "MISCONCEPTION_SUSPECTED"]);
    expect(v.actions[0]!.targetCode).toBe("4CH1-M1");
    expect(v.actions[0]!.rank).toBe(1);
    expect(v.actions[1]!.targetCode).toBe("4CH1-M2");
    expect(v.actions[1]!.rank).toBe(2);
    expect(v.actions[0]!.reasonDetail).toBe(
      "Misconception probability 0.70 from 3 evidence item(s) on 4CH1-T1 (Topic One)" +
        " — ask the Tutor for a grounded explanation",
    );
  });
});

// ── T4b — validated misconception remediation (REMEDIATED_BY) ───────────────

describe("nba engine — T4b corrective remediation", () => {
  const graph = fixtureGraph([{ source: "4CH1-M1", relation: "REMEDIATED_BY", target: "4CH1-C1" }]);

  test("active misconception + validated edge ⇒ REMEDIATE_MISCONCEPTION on the corrective concept", async () => {
    const v = await nbaActionsFor(
      deps(nbaRoutes({ misconceptions: [misRow({ probability: 0.9 })] }), { conceptGraph: graph }),
      LEARNER,
      SUBJECT,
    );
    // the misconception keeps its ASK_TUTOR action AND the corrective leg appears
    expect(codes(v)).toEqual(["MISCONCEPTION_SUSPECTED", "MISCONCEPTION_REMEDIATION"]);
    const a = v.actions[1]!;
    expect(a.actionType).toBe("REMEDIATE_MISCONCEPTION");
    expect(a.targetCode).toBe("4CH1-C1");
    expect(a.reasonDetail).toBe(
      "Misconception 4CH1-M1 (Confused Ions) probability 0.90 from 3 evidence item(s)" +
        " — validated remediation: study 4CH1-C1 (Concept One), then ask the Tutor for the corrective explanation",
    );
  });

  test("no active learner evidence ⇒ the validated edge alone never acts", async () => {
    const v = await nbaActionsFor(
      deps(nbaRoutes({}), { conceptGraph: graph }),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });
});

// ── T5 — timed-vs-untimed fluency gaps (signed semantics) ───────────────────

describe("nba engine — T5 fluency gaps", () => {
  test("positive gap ⇒ TIMED_EXERCISE; the largest |gap| first", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          skills: [
            skillRow({ node_id: NODE_T2, procedural_fluency_gap: 0.25 }),
            skillRow({ node_id: NODE_T1, procedural_fluency_gap: 0.3 }),
          ],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["FLUENCY_GAP", "FLUENCY_GAP"]);
    expect(v.actions[0]!.targetCode).toBe("4CH1-T1");
    expect(v.actions[0]!.reasonDetail).toBe(
      "Untimed-vs-timed accuracy gap 0.30 over 2 attempts — practise under timed conditions",
    );
  });

  test("signed semantics: a large NEGATIVE gap (better under timed) is not a fluency problem", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          skills: [skillRow({ node_id: NODE_T1, procedural_fluency_gap: -0.9 })],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    // below the (positive) threshold ⇒ skipped; T6 may still cover weakness
    expect(codes(v)).not.toContain("FLUENCY_GAP");
  });
});

// ── T6 — weak measured mastery ──────────────────────────────────────────────

describe("nba engine — T6 weak mastery", () => {
  test("established weak ⇒ PRACTISE_QUESTIONS with the decay band", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          skills: [skillRow({ node_id: NODE_T1, mastery: 0.2, attempts: 5 })],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["LOW_MASTERY"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("PRACTISE_QUESTIONS");
    expect(a.reasonDetail).toBe(
      "Measured mastery 0.20 (band LOW) over 5 attempts, last practiced " + NOW_ISO,
    );
  });

  test("unestablished (attempts < min) or strong ⇒ no LOW_MASTERY", async () => {
    const v1 = await nbaActionsFor(
      deps(nbaRoutes({ skills: [skillRow({ node_id: NODE_T1, mastery: 0.2, attempts: 1 })] })),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v1)).toEqual([]);
    const v2 = await nbaActionsFor(
      deps(nbaRoutes({ skills: [skillRow({ node_id: NODE_T1, mastery: 0.9, attempts: 5 })] })),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v2)).toEqual([]);
  });
});

// ── T7a — tutor engagement (V21/P7, v1.3 signal-mix detail) ─────────────────

describe("nba engine — T7a tutor engagement", () => {
  test("asked-but-unpractised topic ⇒ PRACTISE_QUESTIONS with the signal-mix evidence note", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          asks: [{ node_id: NODE_T2, ask_count: 3 }],
          signals: [
            { node_id: NODE_T2, signal_type: "doubt", ask_count: 2 },
            { node_id: NODE_T2, signal_type: "clarification", ask_count: 1 },
          ],
          topicsWithServable: [NODE_T2],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["TUTOR_ENGAGED"]);
    const a = v.actions[0]!;
    expect(a.actionType).toBe("PRACTISE_QUESTIONS");
    expect(a.reasonCode).toBe("TUTOR_ENGAGED");
    expect(a.servableQuestionCount).toBe(1);
    expect(a.reasonDetail).toBe(
      "Asked the Tutor 3 time(s) in the last 14 days (1 clarification, 2 doubt)," +
        " no attempt evidence yet; 1 validated question(s) available",
    );
  });

  test("skips: out-of-subtree asks, practised topics, non-topic nodes, zero servable", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          asks: [
            { node_id: NODE_OUT, ask_count: 9 }, // out of subtree
            { node_id: NODE_T1, ask_count: 8 }, // has a skill row (practised)
            { node_id: NODE_UNIT, ask_count: 7 }, // UNIT — not TOPIC/SUBTOPIC
            { node_id: NODE_T3, ask_count: 6 }, // zero servable questions
          ],
          skills: [skillRow({ node_id: NODE_T1, mastery: 0.9, attempts: 2 })],
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions).toEqual([]);
  });
});

// ── T7 — uncovered topics (constrained exploration, curriculum-order DFS) ───

describe("nba engine — T7 uncovered topics", () => {
  test("curriculum-order walk, cap 2, only TOPIC/SUBTOPIC with validated questions", async () => {
    // T1, T2, T3 all uncovered in DFS order (T1 before T2 before T3);
    // only T1 + T2 carry servable questions; the cap is 2 anyway.
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          topicsWithServable: [NODE_T1, NODE_T2],
          asks: [], // T7a must not fire first for these topics
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["UNCOVERED_TOPIC", "UNCOVERED_TOPIC"]);
    expect(v.actions.map((a) => a.targetCode)).toEqual(["4CH1-T1", "4CH1-T2"]);
    expect(v.actions[0]!.reasonDetail).toBe("No attempt evidence yet; 1 validated question(s) available");
  });

  test("uncoveredTopicCap + maxActions compose; skills-covered topics are never 'uncovered'", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          topicsWithServable: [NODE_T1, NODE_T2, NODE_T3],
          skills: [skillRow({ node_id: NODE_T1, mastery: 0.9, attempts: 2 })], // covered, not weak
        }),
        { recommendation: { uncoveredTopicCap: 1 } },
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions.map((a) => a.targetCode)).toEqual(["4CH1-T2"]); // cap 1, T1 covered
  });
});

// ── portfolio + cap laws ────────────────────────────────────────────────────

describe("nba engine — portfolio laws", () => {
  test("one action per topic: a due review claims the topic before T6 weak mastery can", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          reviews: [reviewRow({ node_id: NODE_T1, due_at: T_PAST })],
          skills: [skillRow({ node_id: NODE_T1, mastery: 0.2, attempts: 5 })], // also weak
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    expect(codes(v)).toEqual(["DUE_REVIEW"]); // T1 won the topic; no second action
  });

  test("maxActions cap + rank renumber 1..n", async () => {
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          reviews: [
            reviewRow({ node_id: NODE_T1, due_at: T_PAST }),
            reviewRow({ node_id: NODE_T2, due_at: T_FUTURE }),
          ],
          skills: [
            skillRow({ node_id: NODE_T3, mastery: 0.2, attempts: 4 }), // T6 weak
          ],
        }),
        { recommendation: { maxActions: 2 } },
      ),
      LEARNER,
      SUBJECT,
    );
    expect(v.actions.length).toBe(2);
    expect(v.actions.map((a) => a.rank)).toEqual([1, 2]);
    expect(codes(v)).toEqual(["DUE_REVIEW", "DUE_REVIEW"]);
  });

  test("the per-request servable-count cache: a topic is counted at most once across tiers", async () => {
    const countedTopics: string[] = [];
    const v = await nbaActionsFor(
      deps(
        nbaRoutes({
          reviews: [reviewRow({ node_id: NODE_T2, due_at: T_PAST })],
          asks: [{ node_id: NODE_T2, ask_count: 2 }], // T7a would re-count T2 without the cache
          topicsWithServable: [NODE_T2],
          skills: [skillRow({ node_id: NODE_T1, mastery: 0.9, attempts: 2 })], // T7 skips covered T1
          onTopicCount: (t) => countedTopics.push(t),
        }),
      ),
      LEARNER,
      SUBJECT,
    );
    // T1 (review) claims T2 and counts it once; T7a hits the claim and the
    // cache; T7 honestly counts the two still-uncovered candidates (T3, S1)
    // — each topic appears in the count log at most once.
    expect(codes(v)).toEqual(["DUE_REVIEW"]);
    expect(countedTopics).toEqual([NODE_T2, NODE_S1, NODE_T3]); // DFS order: S1 sits under T1
    expect(countedTopics.filter((t) => t === NODE_T2).length).toBe(1);
  });
});

// ── the module composition flip (tranche-2 default engine) ──────────────────

/** the agenda composition's own reads (empty evidence — same as tranche-1). */
const AGENDA_ROUTES: Route[] = [
  { match: /from assignment_submissions where learner_id = \? order by occurred_at desc limit \?$/, rows: [] },
  { match: /from assignments order by created_at desc limit \?$/, rows: [] },
  { match: /target_series_id is not null$/, rows: [] },
];

describe("learner-me module — tranche-2 flip", () => {
  test("buildLearnerMeModule defaults nextBestActions to the ported engine", async () => {
    const sql = fakeSql([...nbaRoutes({}), ...AGENDA_ROUTES]) as unknown as Parameters<typeof buildLearnerMeModule>[0];
    const module = buildLearnerMeModule(sql, clock);
    const agenda = await module.buildAgenda(LEARNER, SUBJECT);
    expect(agenda.actions).not.toBeNull();
    expect(agenda.actions!.policy).toBe("nba-rules/v1.3");
    expect(agenda.actions!.actions).toEqual([]);
    // no rootId ⇒ actions stay null (the caller decides; never fabricated)
    const agendaNoRoot = await module.buildAgenda(LEARNER);
    expect(agendaNoRoot.actions).toBeNull();
  });

  test("an explicit injected provider still wins over the default engine", async () => {
    const sql = fakeSql([...nbaRoutes({}), ...AGENDA_ROUTES]) as unknown as Parameters<typeof buildLearnerMeModule>[0];
    const sentinel: NextBestActionsView = {
      learnerId: LEARNER,
      rootId: SUBJECT,
      asOf: NOW_ISO,
      policy: "nba-rules/v1.3",
      actions: [
        {
          rank: 1,
          actionType: "REVIEW_TOPIC",
          reasonCode: "DUE_REVIEW",
          targetNodeId: NODE_T1,
          targetCode: "4CH1-T1",
          targetTitle: "Topic One",
          questionId: null,
          servableQuestionCount: 0,
          reasonDetail: "sentinel",
        },
      ],
    };
    const module = buildLearnerMeModule(sql, clock, { nextBestActions: async () => sentinel });
    const agenda = await module.buildAgenda(LEARNER, SUBJECT);
    expect(agenda.actions!.actions[0]!.reasonDetail).toBe("sentinel");
  });
});
