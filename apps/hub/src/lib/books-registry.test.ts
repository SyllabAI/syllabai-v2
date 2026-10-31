/**
 * T-MIG-133 band 133k — the books ENTRY registry tests: the gate is
 * committed-set membership (build-safe, no network), the shelf stays the
 * live gate.
 */
import { describe, expect, it } from "bun:test";

import { bookManifestPathsForCourse, courseHasBookArchive } from "./books-registry";

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

  it("names one manifest path per book — the T-BOOK-SERVE IAL multi-book law", () => {
    // single-book courses: one committed manifest file
    expect(bookManifestPathsForCourse("igcse-chemistry-19")).toEqual([
      "pearson-edexcel/international-gcse/chemistry/4ch1/manifest.json",
    ]);
    // YPH11: TWO books in ONE lane — per-book manifest files + scope dirs
    expect(bookManifestPathsForCourse("ial-physics-19")).toEqual([
      "pearson-edexcel/international-a-level/physics/yph11/manifest-sb1.json",
      "pearson-edexcel/international-a-level/physics/yph11/manifest-sb2.json",
    ]);
    // YCH11/YCH12: separate lanes, one manifest each
    expect(bookManifestPathsForCourse("ial-chemistry-17")).toEqual([
      "pearson-edexcel/international-a-level/chemistry/ych11/manifest.json",
      "pearson-edexcel/international-a-level/chemistry/ych12/manifest.json",
    ]);
    expect(bookManifestPathsForCourse("not-a-course")).toEqual([]);
  });

  it("admits no other course until its books home lands", () => {
    expect(courseHasBookArchive("ial-physics-19")).toBe(true);
    expect(courseHasBookArchive("ial-chemistry-17")).toBe(true);
    expect(courseHasBookArchive("ial-maths-20-pure-1")).toBe(false);
    expect(courseHasBookArchive("cie-igcse-chemistry-23")).toBe(false);
  });

  it("is honest for junk input", () => {
    expect(courseHasBookArchive("")).toBe(false);
    expect(courseHasBookArchive("not-a-course")).toBe(false);
  });
});
