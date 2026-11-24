/**
 * The answer-quality lane's gate (T-TUTOR-AUDIT-P3 run-001) — runs on EVERY
 * PR via the ci.yml verify leg (`bun test golden/answer-quality`), so the
 * scorer's laws, the committed corpus of record, and the committed baseline
 * of record cannot drift silently.
 *
 * Layers (the anti-tautology discipline):
 *   1. the selftest's fixed vectors own the scorer mechanics — this file
 *      owns the COMMITTED CORPUS and the COMMITTED BASELINE;
 *   2. every corpus shape is re-verified against the serving laws on every
 *      run (a corpus turn that no longer obeys the laws is RED here);
 *   3. the baseline cross-check is proven both ways (pass on the honest
 *      corpus, drift on tampered inputs) — an anchor that only says "pass"
 *      is not an anchor.
 */
import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

import { checkBaseline, sha256File } from "../lib/baseline.ts";
import { scoreCorpus, servingConstants } from "../lib/scorer.ts";
import type { RecordedTutorTurn, TurnCorpus } from "../lib/types.ts";

const CORPUS_PATH = new URL("../fixtures/turns-v1.json", import.meta.url).pathname;
const BASELINE_PATH = new URL("../baseline.json", import.meta.url).pathname;

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as TurnCorpus;
const { perTurn, aggregate } = scoreCorpus(corpus);

test("the corpus of record declares the v1 schema", () => {
  expect(corpus.schema).toBe("answer-quality-turns/v1");
  expect(corpus.turns.length).toBe(18);
});

test("every corpus shape obeys the serving laws (all-legal corpus of record)", () => {
  for (const v of perTurn) {
    expect(v.violations).toEqual([]);
  }
  expect(aggregate.violationTotal).toBe(0);
});

test("the corpus covers the legal wire shape space (P3-04's sampling law)", () => {
  const byId = new Map(corpus.turns.map((t) => [t.turnId, t]));
  // 6 cited + 2 uncited serving turns (t01..t08), 18 turns overall
  for (const id of ["aq-v1-t01", "aq-v1-t02", "aq-v1-t03", "aq-v1-t04", "aq-v1-t05", "aq-v1-t06", "aq-v1-t07", "aq-v1-t08"]) {
    expect(byId.has(id)).toBe(true);
  }
  expect(byId.size).toBe(18);
  // 3 gate-rescued model-worded refusals (suffix appended, no citations)
  for (const id of ["aq-v1-t09", "aq-v1-t10", "aq-v1-t11"]) {
    const t = byId.get(id);
    expect(t?.refused).toBe(true);
    expect(t?.answer.endsWith(servingConstants.REFUSAL_REDIRECT_SUFFIX)).toBe(true);
    expect(t && t.evidenceCount > 0).toBe(true);
  }
  // 2 F4-suppression turns (cited refusal-worded answers, NO suffix)
  for (const id of ["aq-v1-t12", "aq-v1-t13"]) {
    const t = byId.get(id);
    expect(t?.refused).toBe(true);
    expect(t?.answer.endsWith(servingConstants.REFUSAL_REDIRECT_SUFFIX)).toBe(false);
  }
  // 3 deterministic family turns (provider-disclosed, zero evidence)
  for (const id of ["aq-v1-t14", "aq-v1-t15", "aq-v1-t16"]) {
    const t = byId.get(id);
    expect(t?.provider?.startsWith("deterministic-")).toBe(true);
    expect(t?.evidenceCount).toBe(0);
  }
  // 2 truncated serving turns (the run-013 disclosure on the wire)
  let truncated = 0;
  for (const t of corpus.turns) if (t.truncated) truncated++;
  expect(truncated).toBe(2);
});

test("the aggregate of record matches the committed baseline (P3-06)", () => {
  expect(aggregate.total).toBe(18);
  expect(aggregate.refused).toBe(8);
  expect(aggregate.citationEligible).toBe(10);
  expect(aggregate.citationSupported).toBe(8);
  expect(aggregate.citationSupportRate).toBeCloseTo(0.8, 12);
  expect(aggregate.refusalDeadEnds).toBe(0);
  expect(aggregate.truncated).toBe(2);
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
  const moved = { ...aggregate, citationSupportRate: 0.5 };
  const rateCheck = checkBaseline(BASELINE_PATH, sha256File(CORPUS_PATH), moved);
  expect(rateCheck.verdict).toBe("drift");
  expect(rateCheck.ratesMatch).toBe(false);

  // absent baseline: the anchor is unreadable → absent (the weekly lane REDs)
  const absent = checkBaseline("/nonexistent/baseline.json", sha256File(CORPUS_PATH), aggregate);
  expect(absent.verdict).toBe("absent");
});

test("the violation classes fire on tampered corpus shapes (the laws are load-bearing)", () => {
  const byId = new Map(corpus.turns.map((t) => [t.turnId, t]));
  const base = byId.get("aq-v1-t09") as RecordedTutorTurn;
  // strip the appended redirect: the rescued refusal becomes a bare dead end
  const stripped = base.answer.slice(0, base.answer.length - servingConstants.REFUSAL_REDIRECT_SUFFIX.length);
  const { perTurn: v1 } = scoreCorpus({
    schema: "answer-quality-turns/v1",
    notes: "tampered",
    turns: [{ ...base, answer: stripped }],
  });
  expect(v1[0]?.violations).toContain("bare-refusal-dead-end");

  // flip the analytics flag on a detector-shaped answer: the flag lied
  const { perTurn: v2 } = scoreCorpus({
    schema: "answer-quality-turns/v1",
    notes: "tampered",
    turns: [{ ...base, answer: stripped, refused: false }],
  });
  expect(v2[0]?.violations).toContain("refusal-flag-disagreement");

  // tamper the truncation disclosure: truncated=true on a stop finish
  const serving = byId.get("aq-v1-t01") as RecordedTutorTurn;
  const { perTurn: v3 } = scoreCorpus({
    schema: "answer-quality-turns/v1",
    notes: "tampered",
    turns: [{ ...serving, truncated: true }],
  });
  expect(v3[0]?.violations).toContain("truncation-disclosure-mismatch");
});
