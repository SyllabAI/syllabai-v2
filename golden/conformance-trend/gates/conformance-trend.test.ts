/**
 * The conformance trend lane's gate (T-TUTOR-AUDIT-P4 run-001) — runs on
 * EVERY PR via the ci.yml verify leg (`bun test golden/conformance-trend`),
 * so the scorer's laws, the committed corpus of record, and the committed
 * baseline of record cannot drift silently.
 *
 * Layers (the anti-tautology discipline):
 *   1. the selftest's fixed vectors own the scorer mechanics — this file
 *      owns the COMMITTED CORPUS and the COMMITTED BASELINE;
 *   2. every corpus shape is re-verified against the serving DC-5 law on
 *      every run (a corpus turn that no longer obeys the law is RED here);
 *   3. the baseline cross-check is proven both ways (pass on the honest
 *      corpus, drift on tampered inputs) — an anchor that only says "pass"
 *      is not an anchor.
 */
import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

import { checkBaseline, sha256File } from "../lib/baseline.ts";
import { scoreCorpus } from "../lib/scorer.ts";
import type { RecordedMarkedTurn, MarkedTurnCorpus } from "../lib/types.ts";

const CORPUS_PATH = new URL("../fixtures/marked-turns-v1.json", import.meta.url).pathname;
const BASELINE_PATH = new URL("../baseline.json", import.meta.url).pathname;

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as MarkedTurnCorpus;
const { perTurn, aggregate } = scoreCorpus(corpus);

test("the corpus of record declares the v1 schema", () => {
  expect(corpus.schema).toBe("conformance-trend-turns/v1");
  expect(corpus.turns.length).toBe(12);
});

test("every corpus shape obeys the serving DC-5 law (all-legal corpus of record)", () => {
  for (const v of perTurn) {
    expect(v.violations).toEqual([]);
  }
  expect(aggregate.violationTotal).toBe(0);
});

test("the corpus covers the legal marked-part wire shape space (P4-08's sampling law)", () => {
  const byId = new Map(corpus.turns.map((t) => [t.turnId, t]));
  expect(byId.size).toBe(12);
  const get = (id: string) => {
    const t = byId.get(id);
    expect(t).toBeDefined();
    return t as RecordedMarkedTurn;
  };
  // 9 blocking serving turns (the report-bearing surface of record)
  const blockingIds = [
    "cft-v1-t01", "cft-v1-t02", "cft-v1-t03", "cft-v1-t04", "cft-v1-t05",
    "cft-v1-t06", "cft-v1-t07", "cft-v1-t10", "cft-v1-t11", "cft-v1-t12",
  ];
  for (const id of blockingIds) {
    expect(get(id).path).toBe("blocking");
    expect(get(id).refused).toBe(false);
    expect(get(id).conformance?.active).toBe(true);
  }
  // the rule mix of record: Rule A on ct02/ct07/ct10, Rule B on ct03/ct04/ct10
  expect(get("cft-v1-t02").conformance).toMatchObject({ ruleA: 1, ruleB: 0, stripped: 1 });
  expect(get("cft-v1-t03").conformance).toMatchObject({ ruleA: 0, ruleB: 1, stripped: 1 });
  expect(get("cft-v1-t04").conformance).toMatchObject({ ruleA: 0, ruleB: 1, stripped: 1 });
  expect(get("cft-v1-t10").conformance).toMatchObject({ ruleA: 1, ruleB: 1, stripped: 2 });
  // the R-DC5-4 pass-through and the learner-echo pass strip nothing
  expect(get("cft-v1-t05").conformance).toMatchObject({ stripped: 0, ruleA: 0, ruleB: 0, passThrough: 1 });
  expect(get("cft-v1-t06").conformance).toMatchObject({ stripped: 0, ruleA: 0, ruleB: 0 });
  // the turn-level fail-open: input unchanged, violations logged
  expect(get("cft-v1-t07").conformance).toMatchObject({ stripped: 0, ruleA: 1 });
  expect(get("cft-v1-t07").answer).toContain("You missed point 9 entirely.");
  // the stream posture: held-back sentence, NO report published
  expect(get("cft-v1-t08").path).toBe("stream");
  expect(get("cft-v1-t08").conformance).toBeNull();
  expect(get("cft-v1-t08").answer).not.toContain("iodine crystals");
  expect(get("cft-v1-t08").answer).toContain("displaces bromine");
  // the refusal posture: conformance null, the verbatim deterministic refusal
  expect(get("cft-v1-t09").refused).toBe(true);
  expect(get("cft-v1-t09").conformance).toBeNull();
  expect(get("cft-v1-t09").provider).toBe("deterministic-refusal");
  // the in-set membership pass strips nothing (the surfaced-point branch)
  expect(get("cft-v1-t11").conformance).toMatchObject({ stripped: 0, ruleA: 0, ruleB: 0 });
  // the tail-match law: "point 2" is in-set, Rule A silent
  expect(get("cft-v1-t12").conformance).toMatchObject({ stripped: 0, ruleA: 0, ruleB: 0 });
  // 1 stream + 1 refused turn overall
  expect(aggregate.streamTurns).toBe(1);
  expect(aggregate.refusedTurns).toBe(1);
});

test("the aggregate of record matches the committed baseline (P4-08)", () => {
  expect(aggregate.total).toBe(12);
  expect(aggregate.refusedTurns).toBe(1);
  expect(aggregate.streamTurns).toBe(1);
  expect(aggregate.eligible).toBe(10);
  expect(aggregate.conformancePassTurns).toBe(5);
  expect(aggregate.conformancePassRate).toBeCloseTo(0.5, 12);
  expect(aggregate.ruleATotal).toBe(3);
  expect(aggregate.ruleBTotal).toBe(3);
  expect(aggregate.stripTurns).toBe(4);
  expect(aggregate.failOpenTurns).toBe(1);
  expect(aggregate.passThroughTurns).toBe(1);
});

test("the baseline cross-check passes on the honest corpus", () => {
  const check = checkBaseline(BASELINE_PATH, sha256File(CORPUS_PATH), aggregate);
  expect(check.verdict).toBe("pass");
  expect(check.corpusShaMatches).toBe(true);
  expect(check.rubricMatches).toBe(true);
  expect(check.ratesMatch).toBe(true);
});

test("the baseline cross-check REDS on tampered inputs (an anchor that only says pass is not an anchor)", () => {
  // corpus drift: a mutated sha must drift
  const wrongSha = sha256File(new URL("../baseline.json", import.meta.url).pathname);
  expect(wrongSha).not.toBe(sha256File(CORPUS_PATH));
  const shaCheck = checkBaseline(BASELINE_PATH, wrongSha, aggregate);
  expect(shaCheck.verdict).toBe("drift");
  expect(shaCheck.corpusShaMatches).toBe(false);

  // measurement drift: a moved rate must drift
  const moved = { ...aggregate, conformancePassRate: 0.9 };
  const rateCheck = checkBaseline(BASELINE_PATH, sha256File(CORPUS_PATH), moved);
  expect(rateCheck.verdict).toBe("drift");
  expect(rateCheck.ratesMatch).toBe(false);

  // absent baseline: the anchor is unreadable → absent (the weekly lane REDs)
  const absent = checkBaseline("/nonexistent/baseline.json", sha256File(CORPUS_PATH), aggregate);
  expect(absent.verdict).toBe("absent");
});

test("the violation classes fire on tampered corpus shapes (the laws are load-bearing)", () => {
  const byId = new Map(corpus.turns.map((t) => [t.turnId, t]));
  const stream = byId.get("cft-v1-t08") as RecordedMarkedTurn;

  // a stream wire answer that still carries the violating sentence REDs
  const leaking = { ...stream, answer: stream.answer + "The observation would also score \"iodine crystals form\" in the tube." };
  const { perTurn: v1 } = scoreCorpus({
    schema: "conformance-trend-turns/v1",
    notes: "tampered",
    turns: [leaking],
  });
  expect(v1[0]?.violations).toContain("wire-breaks-law");

  // a stream turn that publishes a report REDs
  const { perTurn: v2 } = scoreCorpus({
    schema: "conformance-trend-turns/v1",
    notes: "tampered",
    turns: [{ ...stream, conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 } }],
  });
  expect(v2[0]?.violations).toContain("stream-report-present");

  // a blocking serving turn whose report loses its strip accounting REDs
  const t02 = byId.get("cft-v1-t02") as RecordedMarkedTurn;
  const { perTurn: v3 } = scoreCorpus({
    schema: "conformance-trend-turns/v1",
    notes: "tampered",
    turns: [{ ...t02, conformance: { active: true, stripped: 3, ruleA: 1, ruleB: 0, passThrough: 0 } }],
  });
  expect(v3[0]?.violations).toContain("report-count-mismatch");

  // a refused turn that carries a report REDs
  const t09 = byId.get("cft-v1-t09") as RecordedMarkedTurn;
  const { perTurn: v4 } = scoreCorpus({
    schema: "conformance-trend-turns/v1",
    notes: "tampered",
    turns: [{ ...t09, conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 } }],
  });
  expect(v4[0]?.violations).toContain("refusal-report-present");
});
