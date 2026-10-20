/**
 * T-MIG-133 band 133k — the books ENTRY registry tests: the gate is
 * committed-set membership (build-safe, no network), the shelf stays the
 * live gate.
 */
import { describe, expect, it } from "bun:test";

import { courseHasBookArchive } from "./books-registry";

describe("courseHasBookArchive", () => {
  it("admits the course whose books archive home is committed (4CH1)", () => {
    expect(courseHasBookArchive("igcse-chemistry-19")).toBe(true);
  });

  it("admits no other course until its books home lands", () => {
    expect(courseHasBookArchive("igcse-physics-19")).toBe(false);
    expect(courseHasBookArchive("igcse-biology-19")).toBe(false);
    expect(courseHasBookArchive("ial-maths-20-pure-1")).toBe(false);
    expect(courseHasBookArchive("cie-igcse-chemistry-23")).toBe(false);
  });

  it("is honest for junk input", () => {
    expect(courseHasBookArchive("")).toBe(false);
    expect(courseHasBookArchive("not-a-course")).toBe(false);
  });
});
