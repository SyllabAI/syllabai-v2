import { describe, expect, it } from "bun:test";
import {
  averageBoundariesAcrossSeries,
  gradeForMark,
  isRegionalVariant,
  marksToNextGrade,
  modalGradeAcrossSeries,
  primaryRow,
  sortSessionsNewestFirst,
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

describe("averageBoundariesAcrossSeries (MathsGenie's actual Average row)", () => {
  it("means each grade's boundary across sessions and rounds to the mark", () => {
    const s = [
      { session: "June 2026", boundaries: CH1_STD },
      { session: "June 2022", boundaries: { ...CH1_STD, "9": 140, "8": 117 } },
    ];
    const row = averageBoundariesAcrossSeries(s, LADDER);
    // grade 9: (150 + 140) / 2 = 145; grade 8: (130 + 117) / 2 = 123.5 -> 124
    expect(row?.["9"]).toBe(145);
    expect(row?.["8"]).toBe(124);
    expect(row?.["1"]).toBe(31);
    // the averaged row grades like any other row
    expect(gradeForMark(row!, LADDER, 145)).toBe("9");
    expect(marksToNextGrade(row!, LADDER, 0)).toEqual({ grade: "1", marks: 31 });
    // 145 is the averaged row's top boundary — nothing left to reach
    expect(marksToNextGrade(row!, LADDER, 146)).toBe(null);
  });

  it("skips sessions without the grade and stays null when unseen", () => {
    const foundation = {
      "9": null, "8": null, "7": null, "6": null,
      "5": 148, "4": 125, "3": 90, "2": 56, "1": 22, "U": 0,
    };
    const row = averageBoundariesAcrossSeries(
      [
        { session: "A", boundaries: foundation },
        { session: "B", boundaries: { ...foundation, "5": 142 } },
      ],
      LADDER,
    );
    // grade 5: (148 + 142) / 2 = 145; grades 9-6 never published -> null
    expect(row?.["5"]).toBe(145);
    expect(row?.["9"]).toBe(null);
    expect(row?.["1"]).toBe(22);
  });

  it("returns null for no sessions or an all-null ladder", () => {
    expect(averageBoundariesAcrossSeries([], LADDER)).toBe(null);
    expect(
      averageBoundariesAcrossSeries(
        [{ session: "A", boundaries: { "9": null, "U": null } }],
        LADDER,
      ),
    ).toBe(null);
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

// ---------------------------------------------------------------------------
// T-GRADE-2 — modular / IAL aggregation
//
// Fixtures are REAL corpus rows (sha256-recorded documents in the resources
// lane): WCH11 November 2020, 4WM1H June 2026, and the June 2026 YMA01
// composition (Pearson Information Manual structure).
// ---------------------------------------------------------------------------

import {
  aggregateUms,
  gradeFromAggregation,
  rawToUms,
  usableOptionalPairs,
  type AggregationUnit,
} from "./grade-boundaries-calc";

// WCH11 November 2020: raw /80 -> UMS /120 (A 54->96, B 45->84, …)
const WCH11: AggregationUnit = {
  code: "WCH11",
  title: "Unit 1: Structure, Bonding and Introduction to Organic Chemistry",
  maxMark: 80,
  boundaries: { A: 54, B: 45, C: 37, D: 29, E: 21, U: 0 },
  ums: {
    maxMark: 120,
    boundaries: { A: 96, B: 84, C: 72, D: 60, E: 48, U: 0 },
  },
};

// 4WM1H June 2026: raw /100 -> UMS /120, Foundation-style null grades 2/1
const WM1H: AggregationUnit = {
  code: "4WM1H",
  title: "Unit 1H: Higher Tier",
  maxMark: 100,
  boundaries: {
    "9": 80, "8": 67, "7": 55, "6": 45, "5": 35,
    "4": 25, "3": 20, "2": null, "1": null, U: 0,
  },
  ums: {
    maxMark: 120,
    boundaries: {
      "9": 108, "8": 96, "7": 84, "6": 72, "5": 60,
      "4": 48, "3": 42, "2": null, "1": null, U: 0,
    },
  },
};

// YMA01 June 2026 composition: P1-P4 mandatory + one official applied pair
const WMA = (code: string, a: number, aStarB?: number): AggregationUnit => ({
  code,
  title: code,
  maxMark: 75,
  boundaries: aStarB
    ? { "A*": aStarB, A: a, B: a - 6, C: a - 12, D: a - 18, E: a - 24, U: 0 }
    : { A: a, B: a - 7, C: a - 14, D: a - 21, E: a - 28, U: 0 },
  ums: {
    maxMark: 100,
    boundaries: aStarB
      ? { "A*": 90, A: 80, B: 70, C: 60, D: 50, E: 40, U: 0 }
      : { A: 80, B: 70, C: 60, D: 50, E: 40, U: 0 },
  },
});
const YMA01_UNITS: AggregationUnit[] = [
  WMA("WMA11", 54),
  WMA("WMA12", 48),
  WMA("WMA13", 57, 63),
  WMA("WMA14", 58, 65),
  WMA("WME01", 57),
  WMA("WST01", 65),
];
const YMA01_CASHIN = {
  boundaries: { A: 480, B: 420, C: 360, D: 300, E: 240, U: 0 },
  gradeLadder: ["A", "B", "C", "D", "E", "U"],
};
const YMA01_ASTAR = { overallMin: 480, a2Min: 180, a2Units: ["WMA13", "WMA14"] };

describe("rawToUms (piecewise-linear through the unit's own boundary pairs)", () => {
  it("maps each published boundary exactly onto its UMS grade point", () => {
    expect(rawToUms(WCH11, 54)).toBe(96); // A raw -> A UMS
    expect(rawToUms(WCH11, 45)).toBe(84); // B
    expect(rawToUms(WCH11, 21)).toBe(48); // E
    expect(rawToUms(WCH11, 0)).toBe(0);
    expect(rawToUms(WCH11, 80)).toBe(120); // max raw -> max UMS
  });

  it("interpolates linearly between adjacent grade points", () => {
    // between E (21 -> 48) and D (29 -> 60): 25 is halfway -> 54
    expect(rawToUms(WCH11, 25)).toBe(54);
    // above A: 54 -> 96 and 80 -> 120, so 67 -> 96 + (13/26)*24 = 108
    expect(rawToUms(WCH11, 67)).toBe(108);
  });

  it("skips null boundaries (tier-capped 9-1 units) and clamps", () => {
    expect(rawToUms(WM1H, 20)).toBe(42); // grade 3 point
    expect(rawToUms(WM1H, 10)).toBe(21); // halfway 0 -> (20, 42)
    expect(rawToUms(WM1H, 80)).toBe(108); // grade 9 point
    expect(rawToUms(WM1H, 100)).toBe(120);
    expect(rawToUms(WM1H, 130)).toBe(120); // clamped above max
    expect(rawToUms(WM1H, -5)).toBe(0); // clamped below zero
  });

  it("returns null without a UMS table", () => {
    expect(rawToUms({ ...WCH11, ums: null }, 50)).toBe(null);
  });
});

const marks = (m: Record<string, number>) => m;

describe("aggregateUms + gradeFromAggregation (YMA01 June 2026 composition)", () => {
  it("sums per-unit UMS and grades against the cash-in boundaries", () => {
    const units = YMA01_UNITS.filter((u) =>
      ["WMA11", "WMA12", "WMA13", "WMA14", "WME01", "WST01"].includes(u.code),
    );
    // all six units at the A boundary raw: UMS = 6 * 80 = 480 -> grade A
    const agg = aggregateUms({
      units,
      marks: marks({
        WMA11: 54, WMA12: 48, WMA13: 57, WMA14: 58, WME01: 57, WST01: 65,
      }),
    });
    expect(agg.totalUms).toBe(480);
    expect(agg.maxUms).toBe(600);
    expect(agg.complete).toBe(true);
    const res = gradeFromAggregation(YMA01_CASHIN, YMA01_ASTAR, agg);
    expect(res.grade).toBe("A"); // A2 UMS = 160 < 180, so A* rule not met
    expect(res.aStarRuleApplied).toBe(false);
  });

  it("awards A* through the official A2 rule (A overall + 180/200 from P3+P4)", () => {
    const units = YMA01_UNITS.filter((u) =>
      ["WMA11", "WMA12", "WMA13", "WMA14", "WME01", "WST01"].includes(u.code),
    );
    // P3/P4 maxed (90+90 A2 UMS >= 180), applied pair at A, total 480+
    const agg = aggregateUms({
      units,
      marks: marks({
        WMA11: 54, // 80 UMS
        WMA12: 48, // 80
        WMA13: 75, // 100
        WMA14: 75, // 100
        WME01: 57, // 80
        WST01: 65, // 80
      }),
    });
    expect(agg.totalUms).toBe(520);
    const res = gradeFromAggregation(YMA01_CASHIN, YMA01_ASTAR, agg);
    expect(res.grade).toBe("A*");
    expect(res.aStarRuleApplied).toBe(true);
  });

  it("stays at A when the A2 aggregate falls short even with 480+ total", () => {
    const units = YMA01_UNITS.filter((u) =>
      ["WMA11", "WMA12", "WMA13", "WMA14", "WME01", "WST01"].includes(u.code),
    );
    const agg = aggregateUms({
      units,
      marks: marks({
        WMA11: 75, WMA12: 75, // 200 from AS units
        WMA13: 57, WMA14: 58, // A2 UMS only 160
        WME01: 75, WST01: 65, // 160 from applied
      }),
    });
    expect(agg.totalUms).toBe(540);
    expect(gradeFromAggregation(YMA01_CASHIN, YMA01_ASTAR, agg).grade)
      .toBe("A");
  });

  it("grades below A without touching the A* rule", () => {
    const units = YMA01_UNITS.filter((u) =>
      ["WMA11", "WMA12", "WMA13", "WMA14", "WME01", "WST01"].includes(u.code),
    );
    const agg = aggregateUms({
      units,
      marks: marks({
        WMA11: 40, WMA12: 34, WMA13: 45, WMA14: 46, WME01: 43, WST01: 51,
      }),
    });
    // exact C-boundary raws -> 6 x 60 = 360 UMS
    const res = gradeFromAggregation(YMA01_CASHIN, YMA01_ASTAR, agg);
    expect(res.grade).toBe("C");
  });
});

describe("usableOptionalPairs + modular 4XMAH cash-in", () => {
  it("filters pairs to those whose units the session actually lists", () => {
    const pairs = usableOptionalPairs(
      [
        ["WME01", "WST01"],
        ["WME01", "WDM11"],
        ["WST01", "WST02"],
      ],
      YMA01_UNITS,
    );
    expect(pairs).toEqual([["WME01", "WST01"]]); // WDM11/WST02 not in fixture
  });

  it("grades the modular Maths A Higher cash-in on aggregated UMS", () => {
    const WM2H: AggregationUnit = {
      ...WM1H,
      code: "4WM2H",
      boundaries: { ...WM1H.boundaries, "9": 77, "8": 66, "7": 55, "6": 44, "5": 34, "4": 24, "3": 19 },
    };
    const agg = aggregateUms({
      units: [WM1H, WM2H],
      marks: marks({ "4WM1H": 80, "4WM2H": 77 }), // both at the 9 boundary
    });
    expect(agg.totalUms).toBe(216); // 108 + 108
    const cashin = {
      boundaries: {
        "9": 216, "8": 192, "7": 168, "6": 144, "5": 120, "4": 96,
        "3": 84, "2": null, "1": null, U: 0,
      },
      gradeLadder: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "U"],
    };
    expect(gradeFromAggregation(cashin, undefined, agg).grade).toBe("9");
  });
});

describe("sortSessionsNewestFirst (MathsGenie lists the newest session first)", () => {
  it("orders newest→oldest across years and months", () => {
    const out = sortSessionsNewestFirst([
      { year: 2020, session: "November" },
      { year: 2026, session: "June" },
      { year: 2021, session: "January" },
      { year: 2025, session: "June" },
      { year: 2026, session: "January" },
    ]);
    expect(out.map((s) => `${s.session} ${s.year}`)).toEqual([
      "June 2026", // same year: November > June > January alphabetically
      "January 2026",
      "June 2025",
      "January 2021",
      "November 2020",
    ]);
  });

  it("returns a new array and leaves the input order untouched", () => {
    const input = [
      { year: 2020, session: "November" },
      { year: 2026, session: "June" },
    ];
    const out = sortSessionsNewestFirst(input);
    expect(out).not.toBe(input);
    expect(input[0].year).toBe(2020);
    expect(out[0].year).toBe(2026);
  });

  it("is stable for identical keys and empty input", () => {
    expect(sortSessionsNewestFirst([])).toEqual([]);
    const twin = { year: 2024, session: "June" };
    const out = sortSessionsNewestFirst([twin, { ...twin }]);
    expect(out).toHaveLength(2);
  });
});
