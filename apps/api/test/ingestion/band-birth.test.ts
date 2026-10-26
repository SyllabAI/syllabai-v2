/**
 * ADR-040 §2.2 as amended (operator ruling A, trace 1a1776dff15bb991,
 * receipt adr040-bandshape-fit-r0) — the birth-side split law as pure
 * functions (past-paper.ts): the printed grid is its own binding unit.
 *
 * Ground truth of record: the 62 staged wave-1 tables are 437/437
 * PART-granular grids; 111 question numbers carry TWO grids (top pairs
 * 6+9 ×37, 6+12 ×74) — the exact shape these helpers split honestly.
 */
import { describe, expect, test } from "bun:test";
import { bandGridsForVersion, orphanBandRefs } from "../../src/services/ingestion/past-paper";

type RefRow = { questionRef: string | null; tag?: string };

const row = (questionRef: string | null, tag?: string): RefRow => ({ questionRef, tag });

describe("bandGridsForVersion — the printed grid is the binding unit", () => {
  test("two grids under one number split into TWO part-bound groups (the 6+9 / 6+12 reality)", () => {
    const bands = [
      row("3-d", "3(d) 6-mark grid"),
      row("3-e", "3(e) 9-mark grid"),
    ];
    const grids = bandGridsForVersion(bands, "3");
    expect(grids).toHaveLength(2);
    expect(grids[0]!.ref).toBe("3-d");
    expect(grids[0]!.granular).toBe("part");
    expect(grids[1]!.ref).toBe("3-e");
    expect(grids[1]!.granular).toBe("part");
    expect(grids.every((g) => g.bands.length === 1)).toBe(true);
  });

  test("a question-granular ref (ref === number) is the unbound shape", () => {
    const grids = bandGridsForVersion([row("7", "CIE essay grid")], "7");
    expect(grids).toHaveLength(1);
    expect(grids[0]!.granular).toBe("question");
  });

  test("other numbers' refs and ref-less rows never leak into the version", () => {
    const grids = bandGridsForVersion(
      [row("3-d"), row("4-b"), row("30-d"), row(null), row("13-b-i")],
      "3",
    );
    expect(grids).toHaveLength(1);
    expect(grids[0]!.ref).toBe("3-d");
  });

  test("nested part refs keep their full suffix (13-b-i under 13)", () => {
    const grids = bandGridsForVersion([row("13-b-i")], "13");
    expect(grids).toHaveLength(1);
    expect(grids[0]!.ref).toBe("13-b-i");
    expect(grids[0]!.granular).toBe("part");
  });
});

describe("orphanBandRefs — printed band law never drops silently", () => {
  test("refs matching no question number are named for the refusal", () => {
    const orphans = orphanBandRefs([row("3-d"), row("9-z"), row("9-z")], ["1", "2", "3"]);
    expect(orphans).toEqual(["9-z"]);
  });

  test("ref-less rows orphan as '(no ref)'", () => {
    expect(orphanBandRefs([row(null)], ["1"])).toEqual(["(no ref)"]);
  });

  test("fully-anchored bands orphan nothing", () => {
    expect(orphanBandRefs([row("1-a"), row("2"), row("2-b")], ["1", "2"])).toEqual([]);
  });
});
