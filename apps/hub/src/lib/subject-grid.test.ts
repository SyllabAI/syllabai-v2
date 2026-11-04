/**
 * The My-subjects grid terminator law, unit-pinned (tier-3 follow-up 5).
 * The truth table below IS the law from subject-grid.ts's docstring, for
 * every subject count 1–8 at both bands:
 *
 *   band    grid    cells = n + 1        the tile must
 *   sm      2-col   rows of 2            span 2 iff n even (else pair)
 *   2xl     3-col   rows of 3            span 3 when alone, 2 when paired
 *                                        with one subject, 1 when the row
 *                                        is already complete
 *
 * plus the two invariants that make the classes safe to compose: a
 * spanning tile carries the bar shape at that band, and the sm span is
 * EXPLICITLY cancelled at 2xl whenever the 3-col verdict is span 1
 * (Tailwind spans persist upward).
 */
import { describe, expect, it } from "bun:test";
import { addCourseTileClasses } from "./subject-grid";

const classes = (n: number) => addCourseTileClasses(n).split(/\s+/);

describe("addCourseTileClasses — the grid terminator law", () => {
  it.each([
    // n, sm verdict, 2xl verdict — from the docstring table
    [1, "pair", "span2"],
    [2, "span2", "span1"], // bar at sm, back to a cell at 2xl
    [3, "pair", "span3"],
    [4, "span2", "span2"],
    [5, "pair", "span1"], // the review's capture: 2-2-1(,tile)
    [6, "span2", "span3"], // the lone ghost row, fixed
    [7, "pair", "span2"],
    [8, "span2", "span1"], // the sm span MUST be cancelled at 2xl
  ] as const)("n=%i → sm %s / 2xl %s", (n, smVerdict, xlVerdict) => {
    const c = classes(n);

    // — sm band (2 cols) —
    if (smVerdict === "span2") {
      expect(c).toContain("sm:col-span-2");
      expect(c).toContain("sm:flex-row"); // spanning tile is a bar
    } else {
      expect(c).not.toContain("sm:col-span-2");
    }

    // — 2xl band (3 cols) —
    if (xlVerdict === "span1") {
      // a plain cell: no wide span — and when the sm span would leak
      // upward (Tailwind spans persist), it must be cancelled explicitly
      expect(c).not.toContain("2xl:col-span-2");
      expect(c).not.toContain("2xl:col-span-3");
      if (c.includes("sm:col-span-2")) {
        expect(c).toContain("2xl:col-span-1");
        // an explicit shape revert rides the cancel
        expect(c).toContain("2xl:flex-col");
        expect(c).toContain("2xl:min-h-[10rem]");
      }
    } else {
      const xlSpan = {
        span2: "2xl:col-span-2",
        span3: "2xl:col-span-3",
      }[xlVerdict];
      expect(c).toContain(xlSpan);
      expect(c).toContain("2xl:flex-row");
    }
  });

  it("always sizes the tile (min-h present in some form at every band)", () => {
    for (let n = 1; n <= 12; n++) {
      const c = classes(n);
      expect(c.some((k) => k.startsWith("min-h-") || k.startsWith("sm:min-h-"))).toBe(true);
      expect(c.some((k) => k.startsWith("2xl:min-h-") || k.startsWith("min-h-"))).toBe(true);
    }
  });

  it("never carries a span without its band's shape, nor a shape without its span", () => {
    for (let n = 1; n <= 12; n++) {
      const c = classes(n);
      const has = (p: string) => c.some((k) => k.startsWith(p));
      expect(has("sm:col-span")).toBe(has("sm:flex-row"));
      expect(has("2xl:col-span-2") || has("2xl:col-span-3")).toBe(has("2xl:flex-row"));
    }
  });
});
