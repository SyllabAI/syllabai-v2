/**
 * T-MIG-133 band 133k — the books ENTRY registry tests: the gate is
 * committed-set membership (build-safe, no network), the shelf stays the
 * live gate.
 */
import { describe, expect, it } from "bun:test";

import { courseHasBookArchive } from "./books-registry";

describe("courseHasBookArchive", () => {
  it("admits the courses whose books archive homes are committed (4CH1/4PH1/4BI1)", () => {
    expect(courseHasBookArchive("igcse-chemistry-19")).toBe(true);
    // the 4PH1/4BI1 r0 serving packages (resources 7564388a + e9f41fda,
    // trace 1a18d6866b38000d): archive homes completed — root
    // student-book.pdf + slices + manifests. The SHELF stays the live gate
    // (T-C20): the cards lead to honest shelves until the DB rows land.
    expect(courseHasBookArchive("igcse-physics-19")).toBe(true);
    expect(courseHasBookArchive("igcse-biology-19")).toBe(true);
  });

  it("admits no other course until its books home lands", () => {
    expect(courseHasBookArchive("ial-maths-20-pure-1")).toBe(false);
    expect(courseHasBookArchive("cie-igcse-chemistry-23")).toBe(false);
  });

  it("is honest for junk input", () => {
    expect(courseHasBookArchive("")).toBe(false);
    expect(courseHasBookArchive("not-a-course")).toBe(false);
  });
});
