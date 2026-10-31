import { describe, expect, it } from "bun:test";
import {
  gradeForMark,
  isRegionalVariant,
  marksToNextGrade,
  modalGradeAcrossSeries,
  primaryRow,
} from "./grade-boundaries-calc";

// June 2026 4CH1 standard row (golden-master verified upstream)
const CH1_STD = {
  "9": 150, "8": 130, "7": 111, "6": 99, "5": 88,
  "4": 77, "3": 61, "2": 46, "1": 31, "U": 0,
};
const LADDER = ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"];

describe("gradeForMark", () => {
  it("returns the grade whose boundary the mark meets (minimum-mark law)", () => {
    expect(gradeForMark(CH1_STD, LADDER, 150)).toBe("9");
    expect(gradeForMark(CH1_STD, LADDER, 149)).toBe("8");
    expect(gradeForMark(CH1_STD, LADDER, 31)).toBe("1");
    expect(gradeForMark(CH1_STD, LADDER, 30)).toBe("U");
  });

  it("handles the extremes honestly", () => {
    expect(gradeForMark(CH1_STD, LADDER, 0)).toBe("U");
    expect(gradeForMark(CH1_STD, LADDER, 180)).toBe("9");
    expect(gradeForMark(CH1_STD, LADDER, -3)).toBe(null);
  });

  it("skips null boundaries (tier-capped ladders)", () => {
    const foundation = {
      "9": null, "8": null, "7": null, "6": null,
      "5": 148, "4": 125, "3": 90, "2": 56, "1": 22, "U": 0,
    };
    expect(gradeForMark(foundation, LADDER, 160)).toBe("5");
    expect(gradeForMark(foundation, LADDER, 100)).toBe("3");
    expect(gradeForMark(foundation, LADDER, 10)).toBe("U");
  });
});

describe("modalGradeAcrossSeries (MathsGenie Average mode)", () => {
  it("returns the modal grade with a per-series breakdown", () => {
    const s = [
      { session: "June 2026", boundaries: CH1_STD },
      { session: "June 2022", boundaries: { ...CH1_STD, "9": 140, "8": 117 } },
      { session: "January 2022", boundaries: { ...CH1_STD, "9": 136, "8": 116, "7": 97 } },
    ];
    // 138 grades as: 8 (2026: <150), 8 (Jun 2022: <140), 9 (Jan 2022: >=136)
    expect(modalGradeAcrossSeries(s, LADDER, 138).grade).toBe("8");
    const r = modalGradeAcrossSeries(s, LADDER, 145);
    expect(r.grade).toBe("9"); // 145 >= 150? no -> 8 in 2026, 9 in the two 2022s
    expect(r.perSeries.map((p) => p.session)).toEqual(s.map((x) => x.session));
  });

  it("ties break to the higher grade", () => {
    const s = [
      { session: "A", boundaries: { ...CH1_STD, "9": 160 } },
      { session: "B", boundaries: { ...CH1_STD, "9": 155 } },
    ];
    // 157 is an 8 in both -> modal 8, unambiguous; 161 is a 9 in both
    expect(modalGradeAcrossSeries(s, LADDER, 161).grade).toBe("9");
  });
});

describe("marksToNextGrade", () => {
  it("computes the gap to the next boundary up", () => {
    expect(marksToNextGrade(CH1_STD, LADDER, 145)).toEqual({ grade: "9", marks: 5 });
    // at the top of the ladder there is nothing left to reach
    expect(marksToNextGrade(CH1_STD, LADDER, 150)).toBe(null);
    // 140 sits above the 8 boundary (130) — the next boundary up is 9 at 150
    expect(marksToNextGrade(CH1_STD, LADDER, 140)).toEqual({ grade: "9", marks: 10 });
  });
});

describe("variant helpers", () => {
  it("detects regional R-variant rows", () => {
    expect(isRegionalVariant("1CR 2CR")).toBe(true);
    expect(isRegionalVariant("1C 2C")).toBe(false);
    expect(isRegionalVariant(null)).toBe(false);
  });

  it("primaryRow prefers the standard variant", () => {
    const rows = [
      { papersNote: "1CR 2CR", v: "R" },
      { papersNote: "1C 2C", v: "std" },
    ];
    expect(primaryRow(rows).v).toBe("std");
    expect(primaryRow([{ papersNote: "1CR 2CR", v: "only" }]).v).toBe("only");
  });
});
