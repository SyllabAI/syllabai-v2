import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { GradeBoundariesSchema } from "./grade-boundaries-schema";
import type { GradeBoundariesBundle } from "./grade-boundaries-schema";
import { describeAggregateQualification } from "./grade-boundaries-calc";

/**
 * T-GB-GRADE-CARD regression guard: the "how this qualification is graded"
 * card renders exactly the 16 modular IGCSE courses and derives every field
 * from the committed bundle. Loads the REAL bundle (not fixtures) like the
 * loader twin — a data or helper drift fails here before it can ship.
 *
 * The 16 split into four law shapes (all transcribed from the modular
 * specifications by the resources lanes):
 *   standard  9→1  (240 UMS, 2×120)            — Bio/Chem/Phys unit-1/2
 *   foundation 5→1 (240 UMS, 2×120)            — Maths A Foundation
 *   higher    9→3 (240 UMS, 2×120, 3=84)      — Maths A Higher
 *   double    9-9→1-1 (480 UMS, 6×80, 9-9=480) — Science Double Award
 */
const bundle: GradeBoundariesBundle = (() => {
  const raw: unknown = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "content/grade-boundaries/bundle.v1.json"),
      "utf8",
    ),
  );
  const parsed = GradeBoundariesSchema.safeParse(raw);
  expect(parsed.success).toBe(true);
  return parsed.data!;
})();

const MODULAR_24 = Object.keys(bundle.courses).filter((k) =>
  k.includes("modular-24"),
);

describe("describeAggregateQualification", () => {
  it("produces a complete card payload for all 16 modular IGCSE courses", () => {
    expect(MODULAR_24.length).toBe(16);
    for (const key of MODULAR_24) {
      const calc = bundle.courses[key].calculator;
      expect(calc).not.toBeNull();
      const info = describeAggregateQualification(calc);
      expect(info).not.toBeNull();
      const info2 = info!;
      const calc2 = calc!;
      // units are exactly the required composition, each with a UMS max and
      // a strictly descending fixed grade table; unit maxima sum to the
      // qualification UMS total
      expect(info2.units.length).toBeGreaterThan(0);
      expect(
        info2.units.reduce((acc, u) => acc + u.umsMax, 0),
      ).toBe(info2.umsMax);
      for (const u of info2.units) {
        expect(u.thresholds.length).toBeGreaterThan(0);
        for (let i = 1; i < u.thresholds.length; i++) {
          expect(u.thresholds[i - 1].ums).toBeGreaterThan(
            u.thresholds[i].ums,
          );
        }
      }
      // qualification thresholds strictly descending, and the top threshold
      // is the transcribed top-grade law (aStar.overallMin) — the fields
      // must agree because the card renders both
      expect(info2.thresholds.length).toBeGreaterThan(0);
      for (let i = 1; i < info2.thresholds.length; i++) {
        expect(info2.thresholds[i - 1].ums).toBeGreaterThan(
          info2.thresholds[i].ums,
        );
      }
      expect(info2.thresholds[0].ums).toBe(calc2.aStar!.overallMin);
      expect(info2.cashIn.length).toBeGreaterThan(0);
      expect(info2.resitRule.toLowerCase()).toContain("resit");
      // every family carries its own top-grade note (foundation's says
      // grade 5, double award's says 9-9) — rendered verbatim
      expect(info2.topGradeNote).toBeDefined();
    }
  });

  it("carries the standard 9→1 law as the golden example (Biology)", () => {
    const info = describeAggregateQualification(
      bundle.courses["igcse-biology-modular-24-unit-1"].calculator,
    )!;
    expect(info.cashIn).toBe("4XBI1");
    expect(info.umsMax).toBe(240);
    expect(info.units.map((u) => u.code)).toEqual(["4WBI1", "4WBI2"]);
    expect(info.units.map((u) => u.umsMax)).toEqual([120, 120]);
    expect(info.thresholds).toEqual([
      { grade: "9", ums: 216 }, { grade: "8", ums: 192 },
      { grade: "7", ums: 168 }, { grade: "6", ums: 144 },
      { grade: "5", ums: 120 }, { grade: "4", ums: 96 },
      { grade: "3", ums: 72 }, { grade: "2", ums: 48 },
      { grade: "1", ums: 24 },
    ]);
    expect(info.units[0].thresholds[0]).toEqual({ grade: "9", ums: 108 });
    expect(info.units[0].thresholds[8]).toEqual({ grade: "1", ums: 12 });
    expect(info.topGradeNote).toContain("grade 9 is the top grade");
  });

  it("renders the tiered Maths A ladders honestly", () => {
    const f = describeAggregateQualification(
      bundle.courses["igcse-maths-a-modular-24-foundation-unit-1"].calculator,
    )!;
    expect(f.cashIn).toBe("4XMAF");
    expect(f.thresholds).toEqual([
      { grade: "5", ums: 120 }, { grade: "4", ums: 96 },
      { grade: "3", ums: 72 }, { grade: "2", ums: 48 },
      { grade: "1", ums: 24 },
    ]);
    expect(f.units[0].thresholds[0]).toEqual({ grade: "5", ums: 60 });
    expect(f.topGradeNote).toContain("Foundation tier top grade is 5");

    const h = describeAggregateQualification(
      bundle.courses["igcse-maths-a-modular-24-higher-unit-2"].calculator,
    )!;
    expect(h.cashIn).toBe("4XMAH");
    expect(h.units.map((u) => u.code)).toEqual(["4WM1H", "4WM2H"]);
    // the official law's uneven bottom step: grade 3 at 84/240 (42/unit)
    expect(h.thresholds[6]).toEqual({ grade: "3", ums: 84 });
    expect(h.thresholds[5]).toEqual({ grade: "4", ums: 96 });
    expect(h.thresholds.length).toBe(7);
    expect(h.topGradeNote).toContain("Higher tier top grade 9");
  });

  it("orders the Double Award's 17 paired grades 9-9 → 1-1", () => {
    const sd = describeAggregateQualification(
      bundle.courses["igcse-science-double-award-modular-24-physics-unit-1"]
        .calculator,
    )!;
    expect(sd.cashIn).toBe("4XSD1");
    expect(sd.units.length).toBe(6);
    expect(sd.units.every((u) => u.umsMax === 80)).toBe(true);
    expect(sd.umsMax).toBe(480);
    expect(sd.thresholds.length).toBe(17);
    expect(sd.thresholds[0]).toEqual({ grade: "9-9", ums: 480 });
    expect(sd.thresholds[1]).toEqual({ grade: "9-8", ums: 432 });
    expect(sd.thresholds[16]).toEqual({ grade: "1-1", ums: 72 });
    // unit tables stay on the single 9→1 ladder (80-UMS units)
    expect(sd.units[0].thresholds[0]).toEqual({ grade: "9", ums: 72 });
    expect(sd.topGradeNote).toContain("9-9");
  });

  it("returns null everywhere the law is absent — linear, cash-ins, partial blocks", () => {
    // every non-modular course in the bundle stays card-free
    for (const key of Object.keys(bundle.courses)) {
      if (!key.includes("modular-24")) {
        expect(describeAggregateQualification(
          bundle.courses[key].calculator,
        )).toBeNull();
      }
    }
    // a block missing any required field yields null, never a stub card
    expect(
      describeAggregateQualification({
        mode: "aggregate-ums",
        cashIn: "4XZZ9",
        required: ["4WZZ1"],
        umsMax: 240,
        unitUmsMax: undefined,
        gradeThresholds: { "9": 216 },
        resitRule: "x",
      }),
    ).toBeNull();
    expect(describeAggregateQualification(null)).toBeNull();
    expect(describeAggregateQualification(undefined)).toBeNull();
  });
});
