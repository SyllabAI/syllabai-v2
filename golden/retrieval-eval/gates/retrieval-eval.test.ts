/**
 * Card C gates — the retrieval eval harness over the recorded fixture corpus
 * (fixtures/corpus-v1.json). Every numeric pin is hand-derived in the corpus
 * notes (see fixtures/corpus-v1.json .notes and the README): the ablation
 * flip on question 5, the uniform 1/61 tie on questions 1/4, the budget
 * truncation on question 2, the dual-EXISTS gate exclusions.
 */
import { describe, expect, test } from "bun:test";
import corpus from "../fixtures/corpus-v1.json";
import {
  evaluateCorpus,
  vectorArm,
  kgArm,
  MIN_COSINE,
  MIN_SPECIFICITY,
  TUTOR_EVIDENCE_LIMIT,
  TUTOR_VECTOR_CANDIDATES,
  TUTOR_MAX_TOPICS,
  EMBED_REV,
} from "../lib/harness.ts";
import { cosine, evaluateRanking } from "../lib/metrics.ts";
import type { FixtureCorpus, FixtureQuestion } from "../lib/types.ts";

const c = corpus as unknown as FixtureCorpus;
const report = evaluateCorpus(c);

const q = (id: string): FixtureQuestion => {
  const found = c.questions.find((x) => x.questionId === id)!;
  return found;
};
const verdict = (id: string) => report.questions.find((x) => x.questionId === id)!;

const N_RATE = "a1000000-0000-4000-8000-000000000001";
const N_ENZYME = "a1000000-0000-4000-8000-000000000002";
const N_TITRATION = "a1000000-0000-4000-8000-000000000003";
const N_ELECTRO = "a1000000-0000-4000-8000-000000000004";
const N_MOLES = "a1000000-0000-4000-8000-000000000005";
const Q1 = "c1000000-0000-4000-8000-000000000001";
const Q2 = "c1000000-0000-4000-8000-000000000002";
const Q5 = "c1000000-0000-4000-8000-000000000005";
const Q6 = "c1000000-0000-4000-8000-000000000006";

describe("corpus contract — the recorded-embeddings posture", () => {
  test("schema + embedRev 2 (two generations never blend)", () => {
    expect(c.schema).toBe("retrieval-eval/v1");
    expect(c.embedRev).toBe(2);
    expect(EMBED_REV).toBe(2);
    for (const chunk of c.chunks) expect(chunk.embedRev).toBe(2);
  });

  test("serving constants cited, not re-decided", () => {
    expect(MIN_COSINE).toBe(0.5);
    expect(MIN_SPECIFICITY).toBe(0.5);
    expect(TUTOR_VECTOR_CANDIDATES).toBe(12);
    expect(TUTOR_MAX_TOPICS).toBe(5);
    expect(TUTOR_EVIDENCE_LIMIT).toBe(6);
    expect(report.budget).toBe(6);
  });
});

describe("the vector arm — gates, floor, deterministic order", () => {
  test("the dual-EXISTS gate excludes c9 despite an above-floor cosine", () => {
    // c9 (UNVALIDATED textbook draft) has cosine 8/10 = 0.8 with q2 — well
    // above the 0.50 floor — but rides neither the paper leg nor a VALIDATED
    // subject doc: the serving SQL would never return it.
    const q2 = q(Q2);
    const cos = cosine(q2.queryVector, c.chunks.find((x) => x.chunkId.endsWith("09"))!.vector);
    expect(cos).toBeGreaterThanOrEqual(MIN_COSINE);
    const arm = vectorArm(c, q2).map((i) => i.chunkId);
    expect(arm).not.toContain("b1000000-0000-4000-8000-000000000009");
  });

  test("the paper leg admits an UNVALIDATED paper-linked mark scheme (c5/c10)", () => {
    const armQ2 = vectorArm(c, q(Q2)).map((i) => i.chunkId);
    expect(armQ2).toContain("b1000000-0000-4000-8000-000000000005");
    const armQ5 = vectorArm(c, q(Q5)).map((i) => i.chunkId);
    expect(armQ5).toContain("b1000000-0000-4000-8000-000000000010");
  });

  test("the MIN_COSINE floor drops zero-similarity candidates (q1 vs the enzyme axis)", () => {
    const armQ1 = vectorArm(c, q(Q1)).map((i) => i.chunkId);
    // c1 (cosine 1.0), c2 (0.8), and c8 (5/√50 ≈ 0.7071 — the card's dim-0
    // component) clear the floor; every pure-enzyme/mole/titration/electrolysis
    // chunk scores 0 with e0 and drops.
    expect(armQ1).toEqual([
      "b1000000-0000-4000-8000-000000000001", // c1, cosine 1.0
      "b1000000-0000-4000-8000-000000000002", // c2, cosine 0.8
      "b1000000-0000-4000-8000-000000000008", // c8, cosine 1/√2
    ]);
  });

  test("the vector arm never exceeds the serving candidate cap", () => {
    for (const question of c.questions) {
      expect(vectorArm(c, question).length).toBeLessThanOrEqual(TUTOR_VECTOR_CANDIDATES);
    }
  });
});

describe("the KG arm — specificity floor and deterministic order", () => {
  test("a sub-floor specificity match is dropped (q4's 0.4 mole match)", () => {
    const arm = kgArm(c, q("c1000000-0000-4000-8000-000000000004")).map((i) => i.nodeId);
    expect(arm).toEqual([N_ELECTRO]); // the 0.75 match rides; the 0.4 match is below the floor
  });
});

describe("fusion + budget — the serving shape", () => {
  test("every evaluated list respects the TUTOR_EVIDENCE_LIMIT budget", () => {
    for (const v of report.questions) expect(v.evaluated.length).toBeLessThanOrEqual(6);
  });

  test("q2 truncates: 8 fused candidates down to the budget of 6 (plan)", () => {
    const v = verdict(Q2);
    expect(v.evaluated.length).toBe(6);
    // the anchors survive truncation in BOTH weightings (recall 2/2)
    expect(v.recallAtBudget).toBe(1);
  });

  test("the REAL fuse's contribution arithmetic rides the harness (q1 plan top-1)", () => {
    // n-rate: KNOWLEDGE_NODE at KG rank0 -> 1.0/(60+0+1) = 0.016393442622950821
    const v = verdict(Q1);
    expect(v.evaluated[0]!.key).toBe(N_RATE);
    expect(v.evaluated[0]!.fusedScore).toBeCloseTo(0.016393442622950821, 15);
    expect(v.evaluated[0]!.source).toBe("KNOWLEDGE_NODE");
  });

  test("the uniform 1/61 tie breaks on the source ordinal (q1, both weightings)", () => {
    // uniform: n-rate (KG 1/61) and c1 (vector 1/61) tie EXACTLY; the frozen
    // tiebreak (source ordinal: KNOWLEDGE_NODE 4 < TEXTBOOK 7) picks n-rate.
    const uniformFuse = evaluateCorpus(c); // the report carries plan rows; re-derive uniform via the ablation flip set
    expect(uniformFuse.questions.find((x) => x.questionId === Q1)!.top1Flipped).toBe(false);
  });
});

describe("labels — the question_topics anchoring law", () => {
  test("multi-anchor recall counts BOTH anchored nodes (q2, chunk + KG grounding)", () => {
    const v = verdict(Q2);
    expect(v.anchors).toEqual([N_ENZYME, N_MOLES]);
    expect(v.recallAtBudget).toBe(1);
    const grounded = new Set(v.evaluated.flatMap((e) => e.grounds));
    expect(grounded.has(N_ENZYME)).toBe(true);
    expect(grounded.has(N_MOLES)).toBe(true);
  });

  test("a distractor-led ranking still counts the anchor inside the budget (q5 recall)", () => {
    // q5's uniform top-1 is the mark-scheme distractor (grounds []), but the
    // titration NOTE stays inside the budget — recall stays 1.0; only MRR moves.
    const v = verdict(Q5);
    expect(v.recallAtBudget).toBe(1);
  });
});

describe("the weights-vs-uniform ablation — the headline pin", () => {
  test("q5 FLIPS damagingly: the mark-scheme distractor leads under uniform, the anchor under plan", () => {
    const v = verdict(Q5);
    expect(v.top1Flipped).toBe(true);
    // q1/q2/q3/q4 keep their anchor-led top-1 under BOTH weightings (the
    // exact 1/61 ties break toward KNOWLEDGE_NODE on the source ordinal) —
    // q5 is the ONLY flip: the anchor loses the lead to a grounds-[]
    // paper-linked mark-scheme chunk. The quality signal is MRR/hit1.
    expect(report.ablation.flippedQuestions).toEqual([Q5]);
    // plan: NOTE c6 at 1.0/64 (vec rank 3) overtakes MARK_SCHEME c10 at 0.6/61
    expect(v.evaluated[0]!.key).toBe("b1000000-0000-4000-8000-000000000006");
    expect(v.mrr).toBe(1);
    expect(v.hit1).toBe(1);
  });

  test("aggregates: plan MRR 1.0 vs uniform 17/20; deltaMrr 3/20; deltaHit1 0.2", () => {
    // hand-derived: uniform q5 MRR = 1/4 (the titration NOTE survives at rank
    // 4, behind the mark-scheme distractor, the electrolysis textbook chunk
    // and the electrolysis card), the other four questions are 1.0 ->
    // (4 + 1/4)/5 = 17/20. Plan-v2 re-prices the low-weight distractor below
    // the anchor: q5 MRR 1.0, everything else unchanged.
    expect(report.plan.meanMrr).toBe(1);
    expect(report.uniform.meanMrr).toBeCloseTo(17 / 20, 15);
    expect(report.ablation.deltaMrr).toBeCloseTo(3 / 20, 15);
    expect(report.plan.meanHit1).toBe(1);
    expect(report.uniform.meanHit1).toBeCloseTo(0.8, 15);
    expect(report.ablation.deltaHit1).toBeCloseTo(0.2, 15);
    expect(report.ablation.deltaRecall).toBe(0); // truncation never drops an anchor here
    expect(report.plan.meanRecallAtBudget).toBe(1);
  });

  test("the plan-v2 weights ride the REAL PLAN_V2_WEIGHTS map", () => {
    expect(report.weights.values["MARK_SCHEME"]).toBe(0.6);
    expect(report.weights.values["QUESTION_PAPER"]).toBe(0.8);
    expect(report.weights.values["SYLLABUS"]).toBe(0.9);
    expect(report.weights.values["TEXTBOOK"]).toBe(0.7);
    expect(report.weights.values["CARD"]).toBe(0.3);
    expect(report.weights.values["KNOWLEDGE_NODE"]).toBe(1.0);
  });
});

describe("sufficiency — measurable questions only", () => {
  test("the zero-anchor question is unmeasurable and never averaged", () => {
    expect(report.sufficiency.unmeasurable).toEqual([Q6]);
    expect(report.sufficiency.questionsTotal).toBe(6);
    expect(report.sufficiency.questionsEvaluated).toBe(5);
    expect(report.plan.questionsEvaluated).toBe(5);
    expect(report.uniform.questionsEvaluated).toBe(5);
  });

  test("every anchor is reachable by at least one arm (coverageGaps 0)", () => {
    expect(report.sufficiency.coverageGaps).toBe(0);
  });
});

describe("determinism — same corpus, byte-identical report", () => {
  test("two evaluations stringify identically", () => {
    const again = evaluateCorpus(c);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });
});

describe("metrics unit law (hand-computed, corpus-independent)", () => {
  test("recall@budget, mrr, hit@1 on tiny grounded rankings", () => {
    const a = "a";
    const b = "b";
    const items = [
      { key: "x", grounds: [b] },
      { key: "y", grounds: [] },
      { key: "z", grounds: [a] },
    ];
    const full = evaluateRanking(items, [a, b], 3);
    expect(full.recall).toBe(1);
    expect(full.mrr).toBe(1);
    expect(full.hit1).toBe(1);
    const truncated = evaluateRanking(items, [a, b], 2);
    expect(truncated.recall).toBe(0.5);
    expect(truncated.mrr).toBe(1);
    const miss = evaluateRanking([{ key: "y", grounds: [] }], [a, b], 1);
    expect(miss.recall).toBe(0);
    expect(miss.mrr).toBe(0);
    expect(miss.hit1).toBe(0);
    const partial = evaluateRanking([{ key: "z", grounds: [a] }], [a, b, "c"], 1);
    expect(partial.recall).toBeCloseTo(1 / 3, 15);
  });

  test("zero anchors are unmeasurable (zeros, never averaged upstream)", () => {
    const v = evaluateRanking([{ key: "x", grounds: ["a"] }], [], 3);
    expect(v).toEqual({ recall: 0, mrr: 0, hit1: 0, groundedAnchors: [] });
  });

  test("cosine on the fixture axes (hand-computed)", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([3, 0], [1, 0])).toBe(1);
    expect(cosine([1, 1], [1, 0])).toBeCloseTo(0.7071067811865476, 15);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});
