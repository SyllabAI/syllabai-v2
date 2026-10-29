/**
 * F-185 — the model-driven draw law battery (laws M1..M8 of
 * docs/F185-MODEL-DRIVEN-DRAW-PLAN.md).
 *
 * Unit pins run on a synthetic bank + a hand-computed reading (every policy
 * decision Q1..Q6 exercised deterministically); the integration pins run on
 * the REAL chemistry bundle of record (apps/hub/content/igcse-chemistry-19/)
 * and pin the model selection over its live address pool — the census
 * substrate is consumed, never recomputed (the anti-drift pin stays in
 * draw.test.ts, untouched).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import type { BundleSet, DrillPart } from "../../src/services/drill/census";
import { collectParts } from "../../src/services/drill/census";
import { DrillDrawError, drawForAddress, DRAW_SIZE } from "../../src/services/drill/draw";
import {
  EXPLORATION_SLOTS,
  informationWeight,
  learnerReading,
  modelDrawForAddress,
  modelDrawForReading,
  partInformation,
  RANDOM_SELECTION,
  sparseState,
  SPARSE_EVIDENCE_FLOOR,
  UNEXPLORED_WEIGHT,
  type CodeReading,
  type ReadingEvidenceRow,
} from "../../src/services/drill/model-draw";
import { LEARNER_DECAY_PAPER_DEFAULTS } from "../../src/services/learner-model/decay";

// ---------------------------------------------------------------- synthetic

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-23T12:00:00Z");

let seq = 0;
function part(codes: string[], overrides: Partial<DrillPart> = {}): DrillPart {
  seq += 1;
  return {
    partId: overrides.partId ?? `m${seq}`,
    questionId: overrides.questionId ?? `q${seq}`,
    setId: overrides.setId ?? "official-4ch1-1c-2019-06",
    plane: overrides.plane ?? "official",
    order: overrides.order ?? 0,
    marks: overrides.marks ?? 1,
    specPointCodes: codes,
  };
}

function row(code: string, partId: string, marksAwarded: number | null, marksPossible: number, gradedDaysAgo: number): ReadingEvidenceRow {
  return {
    code,
    partId,
    marksAwarded,
    marksPossible,
    createdAt: new Date(NOW.getTime() - gradedDaysAgo * DAY_MS).toISOString(),
  };
}

// ---------------------------------------------------------------- M1/M2 reading

describe("F-185 M1/M2 — the learner reading of record (composed, not re-adjudicated)", () => {
  test("groups the evidence projection by code through the F-184 strength law (S1 anchor + S2 decay at read)", () => {
    // anchor 0.8 (4/5) graded 22 days ago -> the F-184 hand-conformance case:
    // SECURE band tau 365 -> 0.8 * e^(-22/365)
    const reading = learnerReading([row("4CH1-1.3", "p1", 4, 5, 22)], NOW);
    const r = reading.get("4CH1-1.3")!;
    expect(r.gradedCount).toBe(1);
    expect(r.ungradedCount).toBe(0);
    const expected = 0.8 * Math.exp((-22 * DAY_MS) / (365 * DAY_MS));
    expect(r.strength).toBeCloseTo(expected, 12);
  });

  test("decay-at-read only: the same rows read at a later now decay further (ADR-031 — never persisted)", () => {
    const rows = [row("4CH1-1.3", "p1", 4, 5, 22)];
    const early = learnerReading(rows, new Date("2026-10-23T12:00:00Z")).get("4CH1-1.3")!.strength!;
    const late = learnerReading(rows, new Date("2027-10-23T12:00:00Z")).get("4CH1-1.3")!.strength!;
    expect(late).toBeLessThan(early);
    expect(early).toBeCloseTo(0.8 * Math.exp(-22 / 365), 10);
  });

  test("a code with only ungraded (structured) evidence is UNEXPLORED — strength null, never fabricated (S4 posture)", () => {
    const reading = learnerReading([row("4CH1-2.1", "p9", null, 2, 0)], NOW);
    const r = reading.get("4CH1-2.1")!;
    expect(r.strength).toBeNull();
    expect(r.gradedCount).toBe(0);
    expect(r.ungradedCount).toBe(1);
  });

  test("floor 0.1 and band law ride the ONE decay owner (paper defaults of record)", () => {
    // anchor 0.2 (LOW band, tau 30) graded long ago -> decays to the floor 0.1
    const reading = learnerReading([row("4CH1-1.3", "p1", 2, 10, 4000)], NOW);
    expect(reading.get("4CH1-1.3")!.strength).toBeCloseTo(LEARNER_DECAY_PAPER_DEFAULTS.floor, 12);
  });
});

// ---------------------------------------------------------------- M3 information proxy

describe("F-185 M3 — the information proxy of record", () => {
  test("weights: weak code most informative, secure least, unexplored the honest midpoint (Q3)", () => {
    const reading = new Map<string, CodeReading>([
      ["WEAK", { strength: 0.2, gradedCount: 3, ungradedCount: 0 }],
      ["SEC", { strength: 0.95, gradedCount: 4, ungradedCount: 0 }],
      ["UNK", { strength: null, gradedCount: 0, ungradedCount: 2 }],
    ]);
    expect(informationWeight("WEAK", reading)).toBeCloseTo(0.8, 12);
    expect(informationWeight("SEC", reading)).toBeCloseTo(0.05, 12);
    expect(informationWeight("UNK", reading)).toBe(UNEXPLORED_WEIGHT);
    expect(UNEXPLORED_WEIGHT).toBe(0.5);
  });

  test("part information sums the SECONDARY codes only (the address cannot discriminate)", () => {
    const reading = new Map<string, CodeReading>([
      ["WEAK", { strength: 0.2, gradedCount: 3, ungradedCount: 0 }],
    ]);
    const p = part(["ADDR", "WEAK", "OTHER"]);
    // ADDR excluded; WEAK 0.8 + OTHER unexplored 0.5
    expect(partInformation(p, "ADDR", reading)).toBeCloseTo(1.3, 12);
    // a part with no secondary codes carries zero discriminating information
    expect(partInformation(part(["ADDR"]), "ADDR", reading)).toBe(0);
  });
});

// ---------------------------------------------------------------- M4 sparse law

describe("F-185 M4 — the sparse-state fallback", () => {
  test("below the floor of graded course rows the state is unmodelled (random law serves)", () => {
    const thin = Array.from({ length: SPARSE_EVIDENCE_FLOOR - 1 }, (_, i) => row("4CH1-1.3", `p${i}`, 1, 1, i));
    expect(sparseState(learnerReading(thin, NOW))).toBe(true);
    const enough = [...thin, row("4CH1-1.4", "px", 1, 1, 1)];
    expect(sparseState(learnerReading(enough, NOW))).toBe(false);
    expect(SPARSE_EVIDENCE_FLOOR).toBe(5);
  });

  test("ungraded rows never count toward the floor (graded = the server-graded population)", () => {
    const ungradedOnly = Array.from({ length: 9 }, (_, i) => row("4CH1-1.3", `p${i}`, null, 2, i));
    expect(sparseState(learnerReading(ungradedOnly, NOW))).toBe(true);
  });

  test("the random disclosure of record: the P1..P6 law rides verbatim under the sparse fallback", () => {
    expect(RANDOM_SELECTION).toEqual({ policy: "random", sparseFallback: true, explorationSlots: 0 });
  });
});

// ---------------------------------------------------------------- M5..M8 the model draw

describe("F-185 M5..M8 — the model-driven draw", () => {
  const ADDR = "4CH1-1.25";
  const WEAK = "4CH1-2.10";
  const SEC = "4CH1-3.30";
  const bank: DrillPart[] = [
    part([ADDR, WEAK], { partId: "ga-weak" }),
    part([ADDR, SEC], { partId: "gb-sec" }),
    ...Array.from({ length: 5 }, (_, i) => part([ADDR], { partId: `gc-${i}` })),
  ];
  const reading = new Map<string, CodeReading>([
    [WEAK, { strength: 0.2, gradedCount: 3, ungradedCount: 0 }],
    [SEC, { strength: 0.95, gradedCount: 4, ungradedCount: 0 }],
  ]);

  test("P3 fail-closed verbatim: below the floor the model law refuses exactly like the random law", () => {
    expect(() => modelDrawForReading([part([ADDR])], ADDR, [], reading, 7)).toThrow(DrillDrawError);
    expect(() => modelDrawForReading(bank, "4CH1-9.99", [], reading, 7)).toThrow(DrillDrawError);
  });

  test("M3 discrimination THROUGH the pick: the weak-secondary part is always drawn (greedy slot 1)", () => {
    const d = modelDrawForReading(bank, ADDR, [], reading, 20261023);
    const ids = d.parts.map((p) => p.partId);
    expect(ids).toContain("ga-weak");
    expect(d.parts.length).toBe(DRAW_SIZE);
    for (const p of d.parts) expect(p.specPointCodes).toContain(ADDR);
  });

  test("M6 determinism extended by the reading: same (bank, recency, reading, seed) -> the exact same draw", () => {
    const a = modelDrawForReading(bank, ADDR, [], reading, 20261023);
    const b = modelDrawForReading(bank, ADDR, [], reading, 20261023);
    expect(a).toEqual(b);
  });

  test("M6 anti-gaming: a fresh seed re-picks (the retake cannot be replayed)", () => {
    const a = modelDrawForReading(bank, ADDR, [], reading, 1);
    const b = modelDrawForReading(bank, ADDR, [], reading, 2);
    expect(a.parts.map((p) => p.partId)).not.toEqual(b.parts.map((p) => p.partId));
  });

  test("P4 recency + thin-pool fallback verbatim: recent parts excluded while the fresh pool covers; disclosed on the result", () => {
    const recent = ["gc-0", "gc-1"];
    const d = modelDrawForReading(bank, ADDR, recent, reading, 7);
    expect(d.poolSize).toBe(7);
    expect(d.freshPoolSize).toBe(5);
    expect(d.usedFallback).toBe(false);
    for (const p of d.parts) expect(recent).not.toContain(p.partId);

    const thinFresh = modelDrawForReading(bank, ADDR, ["ga-weak", "gb-sec", "gc-0"], reading, 7);
    expect(thinFresh.freshPoolSize).toBe(4);
    expect(thinFresh.usedFallback).toBe(true);
    expect(thinFresh.parts.length).toBe(DRAW_SIZE);
  });

  test("M5 exploration floor of record: the selection carries exactly EXPLORATION_SLOTS uniform slots", () => {
    expect(EXPLORATION_SLOTS).toBe(1);
    const d = modelDrawForReading(bank, ADDR, [], reading, 7);
    expect(d.selection).toEqual({ policy: "model", sparseFallback: false, explorationSlots: 1 });
  });

  test("M6 disclosure shape: the result carries draw facts + the policy, NEVER a learner-state number", () => {
    const d = modelDrawForReading(bank, ADDR, [], reading, 7);
    expect(Object.keys(d).sort()).toEqual([
      "code",
      "freshPoolSize",
      "parts",
      "poolSize",
      "seed",
      "selection",
      "usedFallback",
    ]);
    const sel = d.selection as Record<string, unknown>;
    expect(Object.keys(sel).sort()).toEqual(["explorationSlots", "policy", "sparseFallback"]);
    expect(JSON.stringify(d)).not.toContain("strength");
  });

  test("unexplored secondary codes weigh the Q3 midpoint of record", () => {
    // gz-unexplored's secondary code is unexplored (u 0.5) yet the weak part
    // (u 0.8) still wins the greedy slot 1 — the weak signal outranks the
    // unexplored midpoint, and the presentation shuffle erases position bias.
    const bank2: DrillPart[] = [
      part([ADDR, WEAK], { partId: "ga-weak" }),
      part([ADDR, "4CH1-9.1"], { partId: "gz-unexplored" }),
      ...Array.from({ length: 5 }, (_, i) => part([ADDR], { partId: `gc-${i}` })),
    ];
    const d = modelDrawForReading(bank2, ADDR, [], reading, 20261023);
    expect(d.parts.map((p) => p.partId)).toContain("ga-weak");
  });

  test("M7 latency law: the selection is synchronous (no await, no LLM in the draw path)", () => {
    // structural pin: the returned value is NOT a Promise
    const d = modelDrawForReading(bank, ADDR, [], reading, 7);
    expect(typeof (d as unknown as { then?: unknown }).then).toBe("undefined");
    expect(typeof modelDrawForReading).toBe("function");
  });
});

// ------------------------------------------------------------- real bundle

const HUB = join(import.meta.dir, "../../../hub/content");
const COURSE = "igcse-chemistry-19";
// Bank of record spans both planes post-IA-split (see draw.test.ts) — the
// same concat order keeps every pin here byte-stable.
const sets = [
  ...JSON.parse(readFileSync(join(HUB, COURSE, "questions.json"), "utf8")),
  ...JSON.parse(readFileSync(join(HUB, COURSE, "official-papers.json"), "utf8")),
] as BundleSet[];

describe("F-185 the chemistry bundle of record through the model draw", () => {
  const bank = collectParts(sets);
  const ADDR = "4CH1-1.25"; // the strongest address of record (155 parts)

  test("the address pool holds enough weak-covering candidates for a full model draw (pool fact)", () => {
    const pool = bank.filter((p) => p.specPointCodes.includes(ADDR));
    expect(pool.length).toBe(155);
  });

  test("the model draw over a hand-built reading: the weak-secondary candidates dominate the greedy slots", () => {
    // the pool's secondary codes, measured live: pick the two most frequent
    const secondary = new Map<string, number>();
    for (const p of bank) {
      if (!p.specPointCodes.includes(ADDR)) continue;
      for (const c of p.specPointCodes) {
        if (c === ADDR) continue;
        secondary.set(c, (secondary.get(c) ?? 0) + 1);
      }
    }
    const ranked = [...secondary.entries()].sort((a, b) => b[1] - a[1]);
    const weakCode = ranked[0]![0];
    const secureCode = ranked[1]![0];
    const weakCovering = bank.filter(
      (p) => p.specPointCodes.includes(ADDR) && p.specPointCodes.includes(weakCode),
    );
    // enough weak-covering candidates that the greedy four all carry the weak code
    expect(weakCovering.length).toBeGreaterThanOrEqual(5);

    const reading = new Map<string, CodeReading>();
    // every measured secondary code reads SECURE except the weak one — the
    // test reading covers the pool's whole secondary space, so the ONLY
    // discriminators are the weak/secure weights (no unexplored 0.5 noise)
    for (const [code] of ranked) {
      reading.set(code, { strength: code === weakCode ? 0.12 : 0.97, gradedCount: 6, ungradedCount: 0 });
    }
    const d = modelDrawForReading(bank, ADDR, [], reading, 20261023);
    const picked = d.parts.map((p) => p.partId).sort();
    const weakIds = new Set(weakCovering.map((p) => p.partId));
    const weakPicked = picked.filter((id) => weakIds.has(id)).length;
    // greedy slots 2..5 are all weak-covering; the exploration slot may land anywhere
    expect(weakPicked).toBeGreaterThanOrEqual(4);
    expect(d.selection).toEqual({ policy: "model", sparseFallback: false, explorationSlots: 1 });
    expect(new Set(picked).size).toBe(DRAW_SIZE);
  });

  test("the composer's sparse posture on the real bank: an empty reading is sparse (the random law serves)", () => {
    expect(sparseState(learnerReading([], NOW))).toBe(true);
  });

  test("modelDrawForAddress composes the reading itself (M1/M2) and matches the direct-reading path", () => {
    const rows = [
      row(ADDR, "real-1", 3, 5, 3),
      row(ADDR, "real-2", 4, 5, 5),
      row(ADDR, "real-3", 5, 5, 8),
      row(ADDR, "real-4", 2, 5, 13),
      row(ADDR, "real-5", 4, 5, 21),
    ];
    const viaAddress = modelDrawForAddress(bank, ADDR, [], rows, NOW, 20261023);
    const reading = learnerReading(rows, NOW);
    const viaReading = modelDrawForReading(bank, ADDR, [], reading, 20261023);
    expect(viaAddress).toEqual(viaReading);
    expect(viaAddress.selection.policy).toBe("model");
  });
});
