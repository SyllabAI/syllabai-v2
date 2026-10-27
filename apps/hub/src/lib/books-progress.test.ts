import { describe, expect, test } from "bun:test";

import { clampPct, maxOrdOf, PUT_DEBOUNCE_MS, sectionForOrd } from "./books-progress-shared";

describe("clampPct", () => {
  test("non-finite → 0", () => {
    expect(clampPct(Number.NaN)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
  test("rounds to int", () => {
    expect(clampPct(42.4)).toBe(42);
    expect(clampPct(42.6)).toBe(43);
  });
  test("out-of-range clamps", () => {
    expect(clampPct(-7)).toBe(0);
    expect(clampPct(142)).toBe(100);
  });
  test("boundaries preserved", () => {
    expect(clampPct(0)).toBe(0);
    expect(clampPct(100)).toBe(100);
  });
});

describe("maxOrdOf", () => {
  test("absent/empty → null", () => {
    expect(maxOrdOf(undefined)).toBeNull();
    expect(maxOrdOf([])).toBeNull();
  });
  test("max of the block ords", () => {
    expect(maxOrdOf([{ ord: 3 }, { ord: 1 }, { ord: 8 }])).toBe(8);
    expect(maxOrdOf([{ ord: 2 }])).toBe(2);
  });
});

describe("sectionForOrd", () => {
  const sections = [
    { id: "s01", ord: 1 },
    { id: "s02", ord: null },
    { id: "s09", ord: 2 },
    { id: "s12", ord: 3 },
  ];
  test("first section with ord >= target", () => {
    expect(sectionForOrd(sections, 2)).toBe("s09");
    expect(sectionForOrd(sections, 1)).toBe("s01");
  });
  test("ord beyond every anchored section → last anchored", () => {
    expect(sectionForOrd(sections, 99)).toBe("s12");
  });
  test("null-ord sections are skipped", () => {
    expect(sectionForOrd(sections, 2)).not.toBe("s02");
  });
  test("no anchored sections → null", () => {
    expect(sectionForOrd([{ id: "a", ord: null }], 1)).toBeNull();
    expect(sectionForOrd([], 1)).toBeNull();
  });
  test("debounce constant is the shared wire law", () => {
    expect(PUT_DEBOUNCE_MS).toBe(1_200);
  });
});
