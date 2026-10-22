/**
 * F-182 opening — the drill census + draw pins.
 *
 * Unit pins run on a synthetic bank (every policy decision P1..P6 of
 * docs/F182-DRILL-SURFACE-PLAN.md §4 exercised deterministically); the
 * integration pins run on the REAL chemistry bundle of record
 * (apps/hub/content/igcse-chemistry-19/) and pin the committed census
 * artifact against a fresh recomputation — the artifact cannot drift
 * silently when the bundle moves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  DRILLABLE_FLOOR,
  collectParts,
  computeCensus,
  planeOf,
  type BundleSet,
  type DrillPart,
} from "../../src/services/drill/census";
import { DRAW_SIZE, DrillDrawError, drillableAddresses, drawForAddress, mulberry32, poolsByCode } from "../../src/services/drill/draw";

// ---------------------------------------------------------------- synthetic

let seq = 0;
function part(code: string[], overrides: Partial<DrillPart> = {}): DrillPart {
  seq += 1;
  return {
    partId: overrides.partId ?? `p${seq}`,
    questionId: overrides.questionId ?? `q${seq}`,
    setId: overrides.setId ?? "official-4ch1-1c-2019-06",
    plane: overrides.plane ?? "official",
    order: overrides.order ?? 0,
    marks: overrides.marks ?? 1,
    specPointCodes: code,
  };
}

describe("F-182 anchor law (P1 eligibility)", () => {
  test("a part without spec codes never enters the bank", () => {
    const sets: BundleSet[] = [
      {
        slug: "official-4ch1-1c-2019-06",
        questions: [
          {
            id: "q1",
            parts: [
              { id: "a", order: 0, marks: 1, specPointCodes: ["4CH1-1.3"] },
              { id: "b", order: 1, marks: 2, specPointCodes: [] },
              { id: "c", order: 2, marks: 1 },
            ],
          },
        ],
      },
    ];
    const bank = collectParts(sets);
    expect(bank.map((p) => p.partId)).toEqual(["a"]);
  });

  test("plane law: official prefix vs topic sets", () => {
    expect(planeOf("official-4ch1-2cr-2020-11")).toBe("official");
    expect(planeOf("2-7-acids-bases-and-salt-preparations--exam-questions")).toBe("topic");
  });

  test("a multi-code part rides in every pool (anchoring, not partition)", () => {
    const p = part(["4CH1-1.3", "4CH1-1.4"]);
    const pools = poolsByCode([p]);
    expect(pools.get("4CH1-1.3")?.length).toBe(1);
    expect(pools.get("4CH1-1.4")?.length).toBe(1);
  });
});

describe("F-182 draw policies (P3..P5)", () => {
  const bank: DrillPart[] = [
    ...Array.from({ length: 7 }, (_, i) => part(["4CH1-1.3"], { partId: `big-${i}` })),
    ...Array.from({ length: 3 }, (_, i) => part(["4CH1-4.50C"], { partId: `thin-${i}` })),
  ];

  test("P3 fail-closed: below-floor addresses refuse, and are not offered", () => {
    expect(() => drawForAddress(bank, "4CH1-4.50C", [], 1)).toThrow(DrillDrawError);
    expect(drillableAddresses(bank)).toEqual(["4CH1-1.3"]);
  });

  test("P5 determinism: same (seed, recency) -> the exact same draw", () => {
    const a = drawForAddress(bank, "4CH1-1.3", [], 20261022);
    const b = drawForAddress(bank, "4CH1-1.3", [], 20261022);
    expect(a).toEqual(b);
  });

  test("the draw size is exactly 5 and the pool is untouched", () => {
    const d = drawForAddress(bank, "4CH1-1.3", [], 7);
    expect(d.parts.length).toBe(DRAW_SIZE);
    expect(d.poolSize).toBe(7);
    expect(bank.length).toBe(10);
  });

  test("P4 dedupe: recently-seen parts are excluded while the fresh pool covers a draw", () => {
    const recent = ["big-0", "big-1"];
    const d = drawForAddress(bank, "4CH1-1.3", recent, 7);
    expect(d.poolSize).toBe(7);
    expect(d.freshPoolSize).toBe(5);
    expect(d.usedFallback).toBe(false);
    for (const p of d.parts) expect(recent).not.toContain(p.partId);
  });

  test("P4 fallback: a thin fresh pool draws from the full pool, disclosed on the result", () => {
    const recent = ["big-0", "big-1", "big-2"];
    const d = drawForAddress(bank, "4CH1-1.3", recent, 7);
    expect(d.freshPoolSize).toBe(4);
    expect(d.usedFallback).toBe(true);
    expect(d.parts.length).toBe(5);
  });

  test("the RNG stream is stable (mulberry32 sanity)", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    const s1 = [r1(), r1(), r1()];
    const s2 = [r2(), r2(), r2()];
    expect(s1).toEqual(s2);
    expect(s1.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

// ------------------------------------------------------------- real bundle

const HUB = join(import.meta.dir, "../../../hub/content");
const COURSE = "igcse-chemistry-19";
const sets = JSON.parse(
  readFileSync(join(HUB, COURSE, "questions.json"), "utf8"),
) as BundleSet[];
const curriculum = JSON.parse(
  readFileSync(join(HUB, COURSE, "curriculum.json"), "utf8"),
) as { nodes: { code: string; family: string }[] };
const censusOfRecord = JSON.parse(
  readFileSync(join(import.meta.dir, "../../src/services/drill/census-of-record.json"), "utf8"),
);

describe("F-182 the chemistry bundle of record through the census", () => {
  const census = computeCensus(COURSE, `apps/hub/content/${COURSE}/questions.json`, sets, curriculum.nodes);

  test("the committed census artifact equals a fresh recomputation (anti-drift pin)", () => {
    expect(census).toEqual(censusOfRecord);
  });

  test("the bundle reconciles with the ADR-037 wave-17 serving census", () => {
    // file-level: the two terminal unmapped questions (one official, one
    // topic-plane) do not build served refs, hence 82 sets / 999 built Q of
    // record vs 1001 parsed here; parts 4011 parsed vs 4007 built.
    expect(census.bundle).toEqual({
      sets: 82,
      officialSets: 54,
      topicSets: 28,
      questions: 1001,
      parts: 4011,
    });
    expect(census.eligibility.unmappedQuestions).toEqual([
      "2-7-acids-bases-and-salt-preparations--exam-questions:qstn_JyN5pzy22SyHZ6Qb",
      "official-4ch1-2cr-2020-11:offq_2020-11_2cr_1",
    ]);
  });

  test("the anchor law holds corpus-wide: every part code is on the spine", () => {
    // computeCensus throws on any code outside the spine; reaching this
    // assertion means 0 malformed and 0 orphan codes across 4011 parts.
    expect(census.eligibility.eligibleParts).toBe(2537 + 1391);
    expect(census.eligibility.partsWithoutCodes).toBe(83);
  });

  test("the coverage of record: 182 spine addresses, 157 drillable, 14 thin, 11 uncovered", () => {
    expect(census.coverage).toEqual({
      specPointAddresses: 182,
      covered: 171,
      drillable: 157,
      thin: 14,
      uncovered: 11,
    });
  });

  test("the strongest address of record draws, deterministically", () => {
    const bank = collectParts(sets);
    const d = drawForAddress(bank, "4CH1-1.25", [], 20261022);
    expect(d.poolSize).toBe(155);
    expect(d.parts.length).toBe(5);
    for (const p of d.parts) expect(p.specPointCodes).toContain("4CH1-1.25");
    const again = drawForAddress(bank, "4CH1-1.25", [], 20261022);
    expect(again.parts.map((p) => p.partId)).toEqual(d.parts.map((p) => p.partId));
  });

  test("drillableAddresses on the real bank matches the census count", () => {
    const bank = collectParts(sets);
    expect(drillableAddresses(bank).length).toBe(census.coverage.drillable);
  });
});
