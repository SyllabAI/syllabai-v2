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

import {
  AGENDA_ROUTES,
  ANSWER_1,
  ANSWER_2,
  ANSWER_3,
  ASSIGNMENT_A,
  CLOCK as clock,
  FAMILY,
  LEARNER,
  NODE_C1,
  NODE_M1,
  NODE_M2,
  NODE_OUT,
  NODE_ROWS,
  NODE_S1,
  NODE_T1,
  NODE_T2,
  NODE_T3,
  NODE_UNIT,
  NOW_ISO,
  type NbaFixture,
  PART_OF,
  QUESTION_1,
  QUESTION_2,
  QUESTION_3,
  SERIES_A,
  SUBJECT,
  T_FUTURE,
  T_PAST,
  answerRow,
  misRow,
  nbaRoutes,
  reviewRow,
  servableQuestionRow,
  skillRow,
} from "./nba-helpers";

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
