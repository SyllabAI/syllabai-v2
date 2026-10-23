/**
 * F-184 opening — the decay-driven strength law pins (laws S1..S6 of
 * docs/F184-DECAY-STRENGTH-PLAN.md).
 *
 * Unit pins run on synthetic evidence rows (every law exercised
 * deterministically, including the decay conformance cases hand-computed
 * from the Ebbinghaus law); the integration pins run against the committed
 * drill census of record (the strength surface's address space is the
 * census's drillable addresses — the anchor-law adjacency, law S6).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  LEARNER_DECAY_PAPER_DEFAULTS,
} from "../../src/services/learner-model/decay";
import {
  BAR_SEMANTICS,
  QUEUE_SIZE,
  addressStrength,
  isGraded,
  masteryAnchor,
  practiceNowQueue,
  type StrengthEvidenceRow,
} from "../../src/services/drill/strength";

// ---------------------------------------------------------------- helpers

const T0 = "2026-10-01T09:00:00.000Z";
const NOW = new Date("2026-10-23T09:00:00.000Z"); // 22 days after T0

function row(overrides: Partial<StrengthEvidenceRow> = {}): StrengthEvidenceRow {
  return {
    partId: overrides.partId ?? "p1",
    // NOTE: `??` would erase an explicit null — the in-check keeps null rows real
    marksAwarded: "marksAwarded" in overrides ? (overrides.marksAwarded as number | null) : 1,
    marksPossible: overrides.marksPossible ?? 1,
    gradedAt: overrides.gradedAt ?? T0,
  };
}

// ------------------------------------------------------- S1 anchor law

describe("F-184 S1 — the marks-weighted anchor over graded evidence", () => {
  test("the anchor is marks-weighted (sum awarded / sum possible), not a mean of means", () => {
    // (2/3) + (1/2) -> 3/5 = 0.6 exactly; a mean-of-means would give 0.583...
    const a = masteryAnchor([
      row({ partId: "a", marksAwarded: 2, marksPossible: 3 }),
      row({ partId: "b", marksAwarded: 1, marksPossible: 2 }),
    ]);
    expect(a).toBe(0.6);
  });

  test("binary MCQ evidence anchors honestly (3 of 4 ones -> 0.75)", () => {
    const a = masteryAnchor([
      row({ partId: "a", marksAwarded: 1 }),
      row({ partId: "b", marksAwarded: 1 }),
      row({ partId: "c", marksAwarded: 0 }),
      row({ partId: "d", marksAwarded: 1 }),
    ]);
    expect(a).toBe(0.75);
  });

  test("ungraded (structured) rows never fabricate mastery: graded-only input", () => {
    expect(isGraded(row({ marksAwarded: null, marksPossible: 3 }))).toBe(false);
    expect(isGraded(row({ marksAwarded: 0, marksPossible: 0 }))).toBe(false); // degenerate marksPossible
    // ungraded-only address -> null anchor (law S4's substrate law)
    expect(masteryAnchor([row({ marksAwarded: null, marksPossible: 2 })])).toBe(null);
    // mixed: the ungraded row is excluded from the arithmetic, not zero-filled
    const a = masteryAnchor([
      row({ partId: "mcq", marksAwarded: 1, marksPossible: 1 }),
      row({ partId: "structured", marksAwarded: null, marksPossible: 5 }),
    ]);
    expect(a).toBe(1);
  });

  test("impossible evidence rows fail closed (corruption is not averaged)", () => {
    expect(() => masteryAnchor([row({ marksAwarded: 4, marksPossible: 3 })])).toThrow(/impossible evidence/);
    expect(() => masteryAnchor([row({ marksAwarded: -1, marksPossible: 2 })])).toThrow(/impossible evidence/);
  });
});

// --------------------------------------------- S2 decay-at-read (ADR-031)

describe("F-184 S2 — displayed strength is decayedMastery of the anchor", () => {
  test("hand-computed conformance: the anchor's band freezes tau, the displayed value re-bands", () => {
    // anchor 0.8 -> SECURE -> tau 365; 22 days: 0.8 * e^(-22/365) = 0.7533...
    const s = addressStrength([row({ marksAwarded: 4, marksPossible: 5 })], NOW);
    expect(s).not.toBeNull();
    const expected = 0.8 * Math.exp(-22 / 365);
    expect(s!.strength).toBeCloseTo(expected, 12);
    // the displayed band reads the DECAYED value (0.7533 < 0.8 -> DEVELOPING)
    // while the tau stayed frozen on the anchor's SECURE band — both laws in one case
    expect(s!.band).toBe("DEVELOPING");
    expect(s!.lastGradedAt).toBe(T0);
  });

  test("tau is frozen on the ANCHOR's band, evaluated once per read (ADR-031 wording)", () => {
    // anchor 0.5 -> DEVELOPING -> tau 90; 90 days: 0.5 * e^(-1)
    const early = addressStrength(
      [row({ marksAwarded: 1, marksPossible: 2, gradedAt: "2025-10-02T09:00:00.000Z" })],
      new Date("2025-12-31T09:00:00.000Z"), // 90 days later
    );
    expect(early!.strength).toBeCloseTo(0.5 * Math.exp(-1), 12);
    // a gradedAt in the future of `now` (clock skew) shows the full anchor, no decay
    const future = addressStrength([row({ marksAwarded: 1, marksPossible: 2 })], new Date("2026-09-01T09:00:00.000Z"));
    expect(future!.strength).toBe(0.5);
  });

  test("the floor holds: deep decay never displays below the params floor (0.1)", () => {
    const s = addressStrength(
      [row({ marksAwarded: 2, marksPossible: 10, gradedAt: "2020-01-01T00:00:00.000Z" })],
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.strength).toBe(LEARNER_DECAY_PAPER_DEFAULTS.floor);
    expect(s!.band).toBe("LOW");
  });

  test("determinism: same (rows, now) -> the identical bar; only `now` moves it", () => {
    const rows = [row({ marksAwarded: 2, marksPossible: 3 })];
    expect(addressStrength(rows, NOW)).toEqual(addressStrength(rows, NOW));
    const later = addressStrength(rows, new Date("2027-10-23T09:00:00.000Z"));
    expect(later!.strength).toBeLessThan(addressStrength(rows, NOW)!.strength);
  });
});

// ------------------------------------------------------ S3/S4 bar laws

describe("F-184 S3/S4 — honest bands, honest nulls, no engagement component", () => {
  test("band boundaries ride bandOf's thresholds on the DECAYED value", () => {
    // fresh evidence (now == gradedAt): strength == anchor, so anchors straddle 0.45 / 0.8
    const fresh = (awarded: number, possible: number) =>
      addressStrength([row({ marksAwarded: awarded, marksPossible: possible, gradedAt: T0 })], new Date(T0))!;
    expect(fresh(4, 10).band).toBe("LOW"); // 0.4 < 0.45
    expect(fresh(5, 10).band).toBe("DEVELOPING"); // 0.5 in [0.45, 0.8)
    expect(fresh(7, 10).band).toBe("DEVELOPING"); // 0.7 in [0.45, 0.8)
    expect(fresh(8, 10).band).toBe("SECURE"); // 0.8 is NOT < 0.8
    expect(fresh(9, 10).band).toBe("SECURE");
  });

  test("law S4: no graded evidence means NO bar — null, never fabricated", () => {
    expect(addressStrength([], NOW)).toBe(null);
    expect(addressStrength([row({ marksAwarded: null, marksPossible: 2 })], NOW)).toBe(null);
  });

  test("the bar discloses its substrate counts (graded vs ungraded)", () => {
    const s = addressStrength(
      [
        row({ partId: "a", marksAwarded: 1, marksPossible: 1 }),
        row({ partId: "b", marksAwarded: null, marksPossible: 3 }),
        row({ partId: "c", marksAwarded: null, marksPossible: 2 }),
      ],
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.gradedCount).toBe(1);
    expect(s!.ungradedCount).toBe(2);
  });

  test("the bar result carries no engagement counter (law S3's anti-pattern)", () => {
    const s = addressStrength([row()], NOW)!;
    expect(Object.keys(s).sort()).toEqual([
      "anchor",
      "band",
      "gradedCount",
      "lastGradedAt",
      "strength",
      "ungradedCount",
    ]);
  });

  test("BAR_SEMANTICS is the semantics of record (mastery x decay, not a grade)", () => {
    expect(BAR_SEMANTICS.formula).toContain("mastery x decay");
    expect(BAR_SEMANTICS.notAGrade).toContain("not a grade");
    expect(BAR_SEMANTICS.decay).toContain("never stored");
    expect(BAR_SEMANTICS.decay).toContain("ADR-031");
  });
});

// ------------------------------------------------- S5 practice-now queue

describe("F-184 S5 — the practice-now queue", () => {
  test("evidence-bearing addresses below reviewBelow enter, weakest first, code tie-break", () => {
    const FRESH = "2026-10-23T09:00:00.000Z"; // gradedAt == now: strength == anchor exactly
    const byCode = new Map<string, StrengthEvidenceRow[]>([
      // anchor 0.5 fresh -> below 0.6
      ["4CH1-2.10", [row({ marksAwarded: 1, marksPossible: 2, gradedAt: FRESH })]],
      // anchor 1.0 fresh -> stays out
      ["4CH1-1.25", [row({ marksAwarded: 5, marksPossible: 5, gradedAt: FRESH })]],
      // anchor 0.25 fresh -> below, weaker than 0.5 -> comes first
      ["4CH1-3.15", [row({ marksAwarded: 1, marksPossible: 4, gradedAt: FRESH })]],
      // equal strength to 4CH1-3.15 -> code ascending tie-break
      ["4CH1-3.14", [row({ marksAwarded: 1, marksPossible: 4, gradedAt: FRESH })]],
      // no evidence at all -> unexplored, never queued (law S4 posture)
    ]);
    const q = practiceNowQueue(byCode, NOW);
    expect(q.map((e) => e.code)).toEqual(["4CH1-3.14", "4CH1-3.15", "4CH1-2.10"]);
    expect(q[0]!.strength).toBe(0.25);
    expect(q[2]!.strength).toBe(0.5);
    expect(q[0]!.band).toBe("LOW");
  });

  test("the queue is capped at QUEUE_SIZE with deterministic truncation", () => {
    const byCode = new Map<string, StrengthEvidenceRow[]>();
    for (let i = 0; i < QUEUE_SIZE + 5; i += 1) {
      const code = `4CH1-1.${100 + i}`;
      byCode.set(code, [row({ partId: `p${i}`, marksAwarded: 0, marksPossible: 1 })]);
    }
    const q = practiceNowQueue(byCode, NOW);
    expect(q.length).toBe(QUEUE_SIZE);
    // all-equal strengths (all 0) -> code ascending across the whole map, then cap
    expect(q.map((e) => e.code)).toEqual([...byCode.keys()].sort().slice(0, QUEUE_SIZE));
  });

  test("addresses at or above reviewBelow never queue; decay eventually queues everyone", () => {
    const strong = new Map<string, StrengthEvidenceRow[]>([
      ["4CH1-1.25", [row({ marksAwarded: 10, marksPossible: 10 })]],
    ]);
    expect(practiceNowQueue(strong, NOW)).toEqual([]);
    // three years later the same evidence has decayed below the threshold
    const muchLater = practiceNowQueue(strong, new Date("2029-10-23T09:00:00.000Z"));
    expect(muchLater.length).toBe(1);
    expect(muchLater[0]!.code).toBe("4CH1-1.25");
  });
});

// --------------------------------------------- S6 adjacency + the census

const censusOfRecord = JSON.parse(
  readFileSync(join(import.meta.dir, "../../src/services/drill/census-of-record.json"), "utf8"),
) as {
  coverage: { specPointAddresses: number; covered: number; drillable: number; thin: number; uncovered: number };
  addresses: { code: string; combined: number; drillable: boolean }[];
};

describe("F-184 S6 — the bar's address space is the drill census of record", () => {
  test("the census of record is unchanged since the F-182 opening (adjacency substrate)", () => {
    expect(censusOfRecord.coverage).toEqual({
      specPointAddresses: 182,
      covered: 171,
      drillable: 157,
      thin: 14,
      uncovered: 11,
    });
  });

  test("every drillable address may carry a bar; thin/uncovered addresses may not", () => {
    const drillable = censusOfRecord.addresses.filter((a) => a.drillable);
    expect(drillable.length).toBe(censusOfRecord.coverage.drillable);
    for (const a of drillable) expect(a.code.startsWith("4CH1-")).toBe(true);
    // the strength layer adds no addresses of its own: an unknown code is
    // just an evidence key the census does not offer — pin the boundary by
    // refusing strength arithmetic to leak beyond the census (the queue over
    // exactly the census's drillable codes is the surface of record).
    const byCode = new Map<string, StrengthEvidenceRow[]>(
      drillable.map((a) => [a.code, [row({ partId: `${a.code}#p`, marksAwarded: 0, marksPossible: 1 })]]),
    );
    const q = practiceNowQueue(byCode, NOW);
    expect(q.length).toBe(QUEUE_SIZE); // fresh all-wrong evidence -> everything below threshold -> cap
    for (const e of q) {
      const hit = censusOfRecord.addresses.find((a) => a.code === e.code);
      expect(hit?.drillable).toBe(true);
    }
  });

  test("the queue threshold and floor are the decay params of record", () => {
    expect(LEARNER_DECAY_PAPER_DEFAULTS.reviewBelow).toBe(0.6);
    expect(LEARNER_DECAY_PAPER_DEFAULTS.floor).toBe(0.1);
    expect(LEARNER_DECAY_PAPER_DEFAULTS.tauLowDays).toBe(30);
    expect(LEARNER_DECAY_PAPER_DEFAULTS.tauMidDays).toBe(90);
    expect(LEARNER_DECAY_PAPER_DEFAULTS.tauHighDays).toBe(365);
    expect(QUEUE_SIZE).toBe(10);
  });
});
