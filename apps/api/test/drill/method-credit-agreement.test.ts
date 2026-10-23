/**
 * F-185 — the method-credit agreement battery (laws A1..A5 of
 * docs/F185-MODEL-DRIVEN-DRAW-PLAN.md §7): the kappa infrastructure of
 * record for the F-183 validation metric "method-credit agreement on
 * structured drill parts" — consuming the F-183 ack shape
 * (DrillMethodCreditAllocation). Pure computation; no store, no clock
 * (law A4 is the module's signature).
 */
import { describe, expect, test } from "bun:test";

import type { DrillMethodCreditAllocation } from "@syllabai/contracts";

import {
  methodCreditAgreement,
  pairedRefs,
  type MethodCreditTrial,
} from "../../src/services/drill/method-credit-agreement";

const PIPELINE = "f183-method-credit-1.0.0";
const TEACHER = "teacher-reference";

function alloc(ref: string, methodCredited: boolean): DrillMethodCreditAllocation {
  return { ref, methodCredited, rationale: methodCredited ? "the method is stated" : "absent" };
}

function trial(partId: string, a: [string, boolean][], b: [string, boolean][]): MethodCreditTrial {
  return {
    partId,
    raterA: { rater: PIPELINE, allocations: a.map(([ref, c]) => alloc(ref, c)) },
    raterB: { rater: TEACHER, allocations: b.map(([ref, c]) => alloc(ref, c)) },
  };
}

describe("F-185 A2 — the point-paired denominator", () => {
  test("compared = the intersection; excluded = the symmetric difference, always disclosed", () => {
    const { compared, excluded } = pairedRefs(
      [alloc("MP1", true), alloc("MP2", false), alloc("MPX", true)],
      [alloc("MP2", true), alloc("MP3", false), alloc("MPY", false)],
    );
    expect(compared).toEqual(["MP2"]);
    expect(excluded.sort()).toEqual(["MP1", "MP3", "MPX", "MPY"]);
  });

  test("excluded points are never scored as agreement or disagreement (the denominator of record)", () => {
    // A credits MP1 (unpaired by B) and also credits the paired MP2 where B
    // disagrees: only MP2's disagreement may move the statistics, and only
    // MP2 counts in the paired credit totals.
    const m = methodCreditAgreement([trial("p1", [["MP1", true], ["MP2", true]], [["MP2", false]])]);
    expect(m.pointsCompared).toBe(1);
    expect(m.excludedPoints).toBe(1);
    expect(m.observedAgreement).toBe(0);
    expect(m.raterA.credited).toBe(1); // the paired MP2 credit only — MP1 is excluded
    expect(m.raterB.credited).toBe(0);
  });
});

describe("F-185 A3 — the kappa of record (hand-computed cases)", () => {
  test("perfect agreement with non-degenerate marginals -> kappa 1", () => {
    const m = methodCreditAgreement([
      trial("p1", [["MP1", true], ["MP2", false]], [["MP1", true], ["MP2", false]]),
    ]);
    expect(m.observedAgreement).toBe(1);
    expect(m.expectedAgreement).toBeCloseTo(0.5, 12);
    expect(m.kappa).toBeCloseTo(1, 12);
  });

  test("the 4-point hand case: Po 0.75, Pe 0.5, kappa 0.5", () => {
    // A: [T,T,T,F] (p=0.75), B: [T,T,F,F] (p=0.5); agreed on MP1, MP2, MP4
    const m = methodCreditAgreement([
      trial(
        "p1",
        [["MP1", true], ["MP2", true], ["MP3", true], ["MP4", false]],
        [["MP1", true], ["MP2", true], ["MP3", false], ["MP4", false]],
      ),
    ]);
    expect(m.pointsCompared).toBe(4);
    expect(m.observedAgreement).toBeCloseTo(0.75, 12);
    expect(m.expectedAgreement).toBeCloseTo(0.5, 12);
    expect(m.kappa).toBeCloseTo(0.5, 12);
  });

  test("complete disagreement with non-degenerate marginals -> kappa -1", () => {
    const m = methodCreditAgreement([
      trial("p1", [["MP1", true], ["MP2", false]], [["MP1", false], ["MP2", true]]),
    ]);
    expect(m.observedAgreement).toBe(0);
    expect(m.kappa).toBeCloseTo(-1, 12);
  });

  test("both raters constant in the same category -> the degenerate denominator -> the honest null (A3)", () => {
    const m = methodCreditAgreement([
      trial("p1", [["MP1", true], ["MP2", true]], [["MP1", true], ["MP2", true]]),
    ]);
    expect(m.observedAgreement).toBe(1);
    expect(m.expectedAgreement).toBe(1);
    expect(m.kappa).toBeNull(); // 1 - Pe == 0 — never a fabricated kappa
  });
});

describe("F-185 A4/A5 — no persistence; honest disclosure", () => {
  test("zero trials: the honest empty measurement (nulls, zero counts)", () => {
    const m = methodCreditAgreement([]);
    expect(m.trials).toBe(0);
    expect(m.pointsCompared).toBe(0);
    expect(m.excludedPoints).toBe(0);
    expect(m.observedAgreement).toBeNull();
    expect(m.expectedAgreement).toBeNull();
    expect(m.kappa).toBeNull();
    expect(m.raterA).toEqual({ credited: 0, total: 0 });
    expect(m.raterB).toEqual({ credited: 0, total: 0 });
    expect(m.perTrial).toEqual([]);
  });

  test("zero paired points WITH trials: the null denominator is disclosed per trial", () => {
    const m = methodCreditAgreement([trial("p1", [["MPX", true]], [["MPY", false]])]);
    expect(m.pointsCompared).toBe(0);
    expect(m.excludedPoints).toBe(2);
    expect(m.observedAgreement).toBeNull();
    expect(m.kappa).toBeNull();
    expect(m.perTrial[0]).toMatchObject({ partId: "p1", pointsCompared: 0, excludedPoints: 2, agreed: 0 });
  });

  test("aggregation across trials is by the point-paired denominator (A5)", () => {
    const m = methodCreditAgreement([
      trial("p1", [["MP1", true], ["MP2", false]], [["MP1", true], ["MP2", false]]),
      trial("p2", [["MP1", true], ["MP2", true]], [["MP1", true], ["MP2", false]]),
    ]);
    expect(m.trials).toBe(2);
    expect(m.pointsCompared).toBe(4);
    expect(m.observedAgreement).toBeCloseTo(0.75, 12);
    expect(m.perTrial.map((t) => t.partId)).toEqual(["p1", "p2"]);
    expect(m.raterA.credited).toBe(3);
    expect(m.raterB.credited).toBe(2);
  });

  test("pure: the same trials measure identically (and the input is not mutated)", () => {
    const t = [trial("p1", [["MP1", true]], [["MP1", true]])];
    const snapshot = JSON.stringify(t);
    expect(methodCreditAgreement(t)).toEqual(methodCreditAgreement(t));
    expect(JSON.stringify(t)).toBe(snapshot);
  });
});
