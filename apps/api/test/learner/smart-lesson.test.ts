/**
 * T-MIG-053 tranche-4 fakeSql pins (r3a) — the Smart Lesson ladder, frozen
 * laws @ 6cad6ef (SmartLessonService.java :68-934):
 *
 *   - the 8-rung order is the law: prerequisite gate → active misconception
 *     (STUDY_CORRECTIVE when a validated REMEDIATED_BY edge names a
 *     corrective, else ASK_TUTOR) → due review → fluency gap → weak mastery
 *     → tutor-engaged-unpractised → start → advance;
 *   - the frozen CONFIG tuning is pinned here: weak ceiling 0.45, evidence
 *     floor 2, fluency threshold 0.2, the 14-day tutor window;
 *   - the honest gates: an unmeasured prerequisite is "not yet measured —
 *     not a blocker"; ASK_TUTOR carries no starter question;
 *   - the advance sub-passes: confusion recency → most-overdue review →
 *     prerequisite-ready unstarted → first weak measured → weakest blocker →
 *     the stalest measured topic;
 *   - the starter-question rotation notes are verbatim (revisit-first when
 *     all attempted; the attempted-count note otherwise);
 *   - the evidence trace: the topic fact carries the em-dash composition;
 *   - subject isolation: a topic outside the subtree is a verbatim 404.
 *
 * The concept-graph legs (REMEDIATED_BY / REQUIRES_PREREQUISITE) run against
 * the REAL packaged T-C11 store (nba-concept-graph) — the
 * 4CH1-MIS-CONC-UNIT → 4CH1-CON-VOL-CONVERSION corrective is a real
 * validated store edge, not a fixture.
 */
import { describe, expect, test } from "bun:test";
import { smartLessonFor } from "../../src/services/learner/smart-lesson";
import { NotFoundError } from "../../src/services/selfmark";
import type { Route } from "./helpers";
import { fakeSql } from "../curriculum/helpers";

const ROOT = "fa000000-0000-4000-8000-000000000001";
const SEC = "fa000000-0000-4000-8000-000000000002";
const TOPIC1 = "fa000000-0000-4000-8000-000000000003"; // the selected topic
const TP2 = "fa000000-0000-4000-8000-000000000004"; // advance candidate
const PR1 = "fa000000-0000-4000-8000-000000000005"; // direct prerequisite
const MISCO = "fa000000-0000-4000-8000-000000000006";
const CONC = "fa000000-0000-4000-8000-000000000007";
const LEARNER = "fb000000-0000-4000-8000-000000000001";
const Q1 = "fc000000-0000-4000-8000-000000000001";
const Q2 = "fc000000-0000-4000-8000-000000000002";
const T0 = new Date("2026-10-01T12:00:00Z");
const DUE = new Date("2026-09-28T12:00:00Z"); // 3d overdue

const node = (id: string, code: string, type: string, title: string) => ({
  id,
  code,
  node_type: type,
  title,
});

const TREE_NODES = [
  node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)"),
  node(SEC, "4CH1-S1", "UNIT", "Section 1"),
  node(TOPIC1, "4CH1-S1-a", "TOPIC", "Topic a"),
  node(TP2, "4CH1-S1-b", "TOPIC", "Topic b"),
  node(PR1, "4CH1-S1-a0", "TOPIC", "Prerequisite topic"),
  node(MISCO, "4CH1-MIS-TEST", "MISCONCEPTION", "Test misconception"),
  node(CONC, "4CH1-CON-VOL-CONVERSION", "CONCEPT", "Volume conversion"),
];

const skill = (nodeId: string, mastery: number, attempts = 5, fluencyGap: number | null = null,
               lastPracticedAt = "2026-10-01T12:00:00Z") => ({
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
  last_practiced_at: lastPracticedAt,
  procedural_fluency_gap: fluencyGap,
});

const reading = (miscoId: string, probability: number) => ({
  misconception_node_id: miscoId,
  probability,
  evidence_count: 3,
  last_evidence_at: "2026-10-01T12:00:00Z", // fresh — relaxed == probability
});

const question = (id: string, topicId: string, difficulty: number) => ({
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

type Fix = {
  skills?: Array<Record<string, unknown>>;
  readings?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
  engagements?: Array<Record<string, unknown>>;
  relations?: Array<{ source: string; target: string }>; // source=dependent, target=prerequisite
  familyEdges?: Array<{ source: string; target: string }>;
  familyCode?: string; // the misconception code the fold carries (store-resolvable for the corrective pin)
  servable?: Array<Record<string, unknown>>; // activeByTopic rows (the topic's)
  servableWithin?: Array<Record<string, unknown>>; // activeWithin rows (advance counts)
  attempted?: string[];
};

function routes(f: Fix): Route[] {
  return [
    // the nba tree seam: requireNode (twice — tree + relations guard), the
    // subtree CTE, the node rows, the PART_OF parent links, the family fold
    { match: /select id from knowledge_nodes where id = \?$/, rows: [{ id: ROOT }] },
    { match: /with recursive subtree as/i, rows: TREE_NODES.map((n) => ({ id: n.id })) },
    {
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: TREE_NODES,
    },
    {
      match: /select source_node_id, target_node_id from knowledge_edges where relation_type = 'PART_OF'/,
      rows: [
        { source_node_id: SEC, target_node_id: ROOT },
        { source_node_id: TOPIC1, target_node_id: SEC },
        { source_node_id: TP2, target_node_id: SEC },
        { source_node_id: PR1, target_node_id: SEC },
        { source_node_id: CONC, target_node_id: ROOT },
      ],
    },
    {
      match: /select e\.source_node_id, e\.target_node_id, e\.relation_type, n\.code as source_code, n\.title as source_title, n\.node_type as source_type from knowledge_edges e join knowledge_nodes n on n\.id = e\.source_node_id/,
      rows: (f.familyEdges ?? []).map((e) => ({
        source_node_id: e.source,
        target_node_id: e.target,
        relation_type: "MISCONCEPTION_OF",
        source_code: f.familyCode ?? "4CH1-MIS-TEST",
        source_title: "Test misconception",
        source_type: "MISCONCEPTION",
      })),
    },
    // prerequisiteRelations (the REQUIRES_PREREQUISITE registry)
    {
      match: /select source_node_id, target_node_id from knowledge_edges where relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: (f.relations ?? []).map((r) => ({ source_node_id: r.source, target_node_id: r.target })),
    },
    // learner evidence
    {
      match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states/,
      rows: f.skills ?? [],
    },
    {
      match: /select misconception_node_id, probability, evidence_count, last_evidence_at from misconception_states/,
      rows: f.readings ?? [],
    },
    {
      match: /select node_id, due_at from review_schedules where learner_id = \? ::uuid and status = 'PENDING'/,
      rows: f.reviews ?? [],
    },
    {
      match: /select node_id, occurred_at, refused, signal_type from tutor_topic_engagements/,
      rows: f.engagements ?? [],
    },
    // ServableQuestions.activeByTopic (status count + the action fetch)
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = \? or exists \( select 1 from question_topics qt where qt\.question_id = q\.id and qt\.node_id = \? \)\) order by q\.difficulty/,
      rows: f.servable ?? [],
    },
    // ServableQuestions.activeWithin (advance counts)
    {
      match: /from questions q where q\.active = true and \(q\.primary_topic_node_id = any\( \? ::uuid\[\]\) or exists/,
      rows: f.servableWithin ?? [],
    },
    // the starter-question attempted-ids read
    {
      match: /select distinct question_id from attempts where learner_id = \? ::uuid and question_id = any\( \? ::uuid\[\]\)/,
      rows: (f.attempted ?? []).map((id) => ({ question_id: id })),
    },
    // the servable projection's attach legs (the paper gate + attach legs)
    { match: /from exam_papers p/, rows: [] },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    { match: /from question_versions/, rows: [] },
  ];
}

const deps = (f: Fix) => ({
  sql: fakeSql(routes(f)),
  clock: { now: () => T0, newId: () => "fe000000-0000-4000-8000-000000000001" },
});

describe("smart-lesson — the ladder rungs in frozen order", () => {
  test("(7) no evidence at all: start the topic — diagnostic practice", async () => {
    const v = await smartLessonFor(deps({ servable: [question(Q1, TOPIC1, 1), question(Q2, TOPIC1, 2)] }),
      LEARNER, ROOT, TOPIC1);
    expect(v.policy).toBe("smart-lesson/v2");
    expect(v.action.actionType).toBe("PRACTISE_QUESTIONS");
    expect(v.action.reasonCode).toBe("INSUFFICIENT_COVERAGE");
    expect(v.action.questionId).toBe(Q1); // difficulty order, none attempted
    expect(v.action.servableQuestionCount).toBe(2);
    expect(v.topicStatus.coverage).toBe("UNMEASURED");
    expect(v.topicStatus.mastery).toBeNull();
    expect(v.evidence[0]).toEqual({ key: "topic", value: "4CH1-S1-a — Topic a" });
    expect(v.evidence[1]!.value).toBe("0 (no attempt evidence on this topic)");
  });

  test("(1) the prerequisite gate: measured weak redirects; unmeasured is not a blocker", async () => {
    const v = await smartLessonFor(deps({
      relations: [
        { source: TOPIC1, target: PR1 },  // dependent → prerequisite
        { source: TOPIC1, target: TP2 },  // unmeasured prerequisite
      ],
      skills: [skill(PR1, 0.2, 3)],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("REMEDIATE_PREREQUISITE");
    expect(v.action.reasonCode).toBe("PREREQUISITE_WEAK");
    expect(v.action.targetCode).toBe("4CH1-S1-a0");
    const facts = Object.fromEntries(v.evidence.map((e) => [e.key, e.value]));
    expect(facts["prerequisite 4CH1-S1-a0"]).toBe("measured 0.20 over 3 attempt(s)");
    expect(facts["prerequisite 4CH1-S1-b"]).toBe("not yet measured — not a blocker");
  });

  test("(2a) active misconception + the validated REMEDIATED_BY store edge → STUDY_CORRECTIVE", async () => {
    // the misconception node carries the REAL store code
    // 4CH1-MIS-CONC-UNIT, whose validated REMEDIATED_BY edge names the
    // corrective concept 4CH1-CON-VOL-CONVERSION (present in the tree via
    // the CONC node) — the frozen resolves the corrective through byCode
    const v = await smartLessonFor(deps({
      familyEdges: [{ source: MISCO, target: TOPIC1 }],
      familyCode: "4CH1-MIS-CONC-UNIT",
      readings: [reading(MISCO, 0.9)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("STUDY_CORRECTIVE");
    expect(v.action.reasonCode).toBe("MISCONCEPTION_REMEDIATION");
    expect(v.action.targetCode).toBe("4CH1-CON-VOL-CONVERSION");
    expect(v.action.reasonDetail).toContain("validated remediation: study 4CH1-CON-VOL-CONVERSION");
    expect(v.misconceptions[0]!.remediationNodeCode).toBe("4CH1-CON-VOL-CONVERSION");
  });

  test("(2b) active misconception without a validated corrective → ASK_TUTOR, no question", async () => {
    const v = await smartLessonFor(deps({
      familyEdges: [{ source: MISCO, target: TOPIC1 }],
      readings: [reading(MISCO, 0.8)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("ASK_TUTOR");
    expect(v.action.reasonCode).toBe("MISCONCEPTION_SUSPECTED");
    expect(v.action.questionId).toBeNull();
    expect(v.action.servableQuestionCount).toBe(0);
    expect(v.action.targetCode).toBe("4CH1-MIS-TEST");
    expect(v.misconceptions[0]!.probability).toBe(0.8);
    expect(v.misconceptions[0]!.active).toBe(true);
    expect(v.misconceptions[0]!.remediationNodeCode).toBeNull();
  });

  test("(3) the most overdue pending review → REVIEW_TOPIC with the overdue note", async () => {
    const v = await smartLessonFor(deps({
      skills: [skill(TOPIC1, 0.7, 4)],
      reviews: [{ node_id: TOPIC1, due_at: DUE.toISOString() }],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("REVIEW_TOPIC");
    expect(v.action.reasonCode).toBe("DUE_REVIEW");
    expect(v.action.reasonDetail).toContain("scheduled 2026-09-28T12:00:00Z");
    expect(v.action.reasonDetail).toContain("overdue by 3 day(s)");
    expect(v.topicStatus.reviewDue).toBe(true);
  });

  test("(4) the measured fluency gap → TIMED_PRACTICE", async () => {
    const v = await smartLessonFor(deps({
      skills: [skill(TOPIC1, 0.9, 5, 0.25)],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("TIMED_PRACTICE");
    expect(v.action.reasonCode).toBe("FLUENCY_GAP");
    expect(v.action.reasonDetail).toContain("Untimed-vs-timed accuracy gap 0.25 over 5 attempts");
  });

  test("(5) established weak mastery at the FROZEN tuning (0.45 ceiling, floor 2)", async () => {
    const v = await smartLessonFor(deps({
      skills: [skill(TOPIC1, 0.3, 2)],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("PRACTISE_QUESTIONS");
    expect(v.action.reasonCode).toBe("LOW_MASTERY");
    expect(v.action.reasonDetail).toContain("below the weak ceiling (0.45)");
    expect(v.topicStatus.coverage).toBe("ESTABLISHED");
  });

  test("(6) tutor-engaged but never practised: the §9 derived signals are evidence", async () => {
    const v = await smartLessonFor(deps({
      engagements: [
        { node_id: TOPIC1, occurred_at: "2026-09-30T10:00:00Z", refused: false, signal_type: "EXPLANATION_REQUEST" },
        { node_id: TOPIC1, occurred_at: "2026-09-29T10:00:00Z", refused: true, signal_type: "EXPLANATION_REQUEST" },
        { node_id: TOPIC1, occurred_at: "2026-09-28T10:00:00Z", refused: true, signal_type: "DOUBT_SIGNAL" },
      ],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("PRACTISE_QUESTIONS");
    expect(v.action.reasonCode).toBe("TUTOR_ENGAGED");
    const facts = Object.fromEntries(v.evidence.map((e) => [e.key, e.value]));
    expect(facts["tutor engagement"]).toBe("3 ask(s) in the last 14 day(s), no attempt evidence yet");
    expect(facts["engagement signals"]).toContain("DOUBT_SIGNAL=1");
    expect(facts["derived signals"]).toBe(
      "repeated explanation requests; an unresolved ask (no grounded answer); engagement after an explanation",
    );
    expect(v.action.reasonDetail).toContain("including confusion you reported yourself");
  });

  test("(8) mastered → advance to the first prerequisite-ready unstarted topic", async () => {
    const v = await smartLessonFor(deps({
      skills: [skill(TOPIC1, 0.9, 5)],
      servableWithin: [question(Q1, TP2, 1)],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("ADVANCE_TOPIC");
    expect(v.action.reasonCode).toBe("TOPIC_MASTERED");
    expect(v.action.targetCode).toBe("4CH1-S1-b");
    expect(v.action.reasonDetail).toContain("not yet started");
  });

  test("(8, consolidation) everything strong → the STALEST measured topic", async () => {
    const v = await smartLessonFor(deps({
      skills: [
        skill(TOPIC1, 0.9, 5, null, "2026-09-25T00:00:00Z"),
        skill(TP2, 0.85, 6, null, "2026-09-20T00:00:00Z"), // staler
      ],
      servableWithin: [question(Q1, TP2, 1)],
      servable: [question(Q1, TOPIC1, 1)],
    }), LEARNER, ROOT, TOPIC1);
    expect(v.action.actionType).toBe("REVIEW_TOPIC");
    expect(v.action.reasonCode).toBe("TOPIC_MASTERED");
    expect(v.action.targetCode).toBe("4CH1-S1-b");
    const facts = Object.fromEntries(v.evidence.map((e) => [e.key, e.value]));
    expect(facts["stalest measured topic"]).toBe("4CH1-S1-b — last practised 2026-09-20T00:00:00Z");
  });

  test("subject isolation: a topic outside the subtree is the verbatim 404", async () => {
    const ghost = "fa000000-0000-4000-8000-000000000099";
    let msg = "";
    try {
      await smartLessonFor(deps({}), LEARNER, ROOT, ghost);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("curriculum topic in this subject " + ghost + " not found");
  });

  test("the starter-question rotation: revisit-first when all attempted; the count note otherwise", async () => {
    const all = await smartLessonFor(deps({
      servable: [question(Q1, TOPIC1, 1), question(Q2, TOPIC1, 2)],
      attempted: [Q1, Q2],
    }), LEARNER, ROOT, TOPIC1);
    expect(all.action.questionId).toBe(Q1); // revisit the first, honestly
    expect(all.action.reasonDetail).toContain("(all 2 validated question(s) attempted — revisiting the first)");

    const some = await smartLessonFor(deps({
      servable: [question(Q1, TOPIC1, 1), question(Q2, TOPIC1, 2)],
      attempted: [Q2],
    }), LEARNER, ROOT, TOPIC1);
    expect(some.action.questionId).toBe(Q1); // first NOT attempted
    expect(some.action.reasonDetail).toContain("(starter question not attempted yet; 1 of 2 already attempted)");
  });

  test("the §11 posture: the attempted-ids read fires once per response (no per-question loop)", async () => {
    const sql = fakeSql(routes({
      servable: [question(Q1, TOPIC1, 1), question(Q2, TOPIC1, 2)],
    }));
    await smartLessonFor(
  { sql, clock: { now: () => T0, newId: () => "fe000000-0000-4000-8000-000000000001" } },
  LEARNER, ROOT, TOPIC1,
);
    const attemptedReads = sql.queries.filter((q) => q.startsWith("select distinct question_id from attempts"));
    expect(attemptedReads.length).toBe(1);
  });
});
