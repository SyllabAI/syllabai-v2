/**
 * directory-featured.test.ts — the storefront featured-tier law,
 * unit-pinned (T-HUB-COURSES-IA-1). Depth is the committed corpus only;
 * zero-depth ghosts can never feature; the order is deterministic down to
 * the slug tiebreaker. No DOM, no registry read — pure function over the
 * maps the server page plumbs (subject-grid.test.ts house pattern).
 */
import { describe, expect, test } from "bun:test";
import {
  committedDepth,
  featuredCourses,
} from "./directory-featured";
import type { DirectoryCourse } from "./directory-groups";
import type { CourseCounts } from "./directory-stats";

const lane = (
  slug: string,
  label: string,
  over: Partial<DirectoryCourse> = {},
): DirectoryCourse => ({
  level: "IGCSE",
  subject: "Chemistry",
  code: "1",
  ...over,
  slug,
  label,
});

const counts = (notes: number, flashcards: number, questions: number): CourseCounts => ({
  notes,
  flashcards,
  questions,
});

describe("committedDepth (T-HUB-COURSES-IA-1)", () => {
  test("sums the four committed counts the substance line shows", () => {
    expect(committedDepth(counts(112, 340, 1250), 60)).toBe(112 + 340 + 1250 + 60);
  });

  test("absent maps and zero both floor at 0 — never a claim", () => {
    expect(committedDepth(undefined, undefined)).toBe(0);
    expect(committedDepth(counts(0, 0, 0), 0)).toBe(0);
    expect(committedDepth(undefined, 12)).toBe(12);
    expect(committedDepth(counts(5, 0, 0), undefined)).toBe(5);
  });
});

describe("featuredCourses (T-HUB-COURSES-IA-1)", () => {
  const lanes = [
    lane("a", "Alpha"),
    lane("b", "Beta"),
    lane("c", "Gamma"),
    lane("ghost", "Ghost — registered, nothing committed"),
    lane("d", "Delta"),
  ];
  const bundleStats: Record<string, CourseCounts> = {
    a: counts(100, 100, 100), // 300
    b: counts(50, 50, 50), // 150
    c: counts(200, 200, 200), // 600
    d: counts(10, 20, 30), // 60
    // ghost: absent — all-zero floor
  };
  const archivePapers: Record<string, number> = { a: 10, b: 20, c: 0, d: 5 };

  test("orders by committed depth desc, ghosts can never feature", () => {
    const out = featuredCourses(lanes, bundleStats, archivePapers, 3);
    expect(out.map((c) => c.slug)).toEqual(["c", "a", "b"]); // 600 > 310 > 170
    expect(out.some((c) => c.slug === "ghost")).toBe(false);
  });

  test("papers count toward depth (the archive is committed corpus)", () => {
    // b: 150 + 20 = 170 beats a: 300 + 10 = 310? no — a stays ahead; pin it
    const out = featuredCourses(lanes, bundleStats, archivePapers, 4);
    expect(out.map((c) => c.slug)).toEqual(["c", "a", "b", "d"]);
  });

  test("ties break label-then-slug — the order is total and stable", () => {
    const tied = [
      lane("z", "Same"),
      lane("y", "Same"),
      lane("x", "Same"),
    ];
    const stats: Record<string, CourseCounts> = {
      x: counts(1, 0, 0),
      y: counts(1, 0, 0),
      z: counts(1, 0, 0),
    };
    const out = featuredCourses(tied, stats, {}, 3);
    expect(out.map((c) => c.slug)).toEqual(["x", "y", "z"]);
    // same input twice, same output — hydration determinism
    expect(featuredCourses(tied, stats, {}, 3).map((c) => c.slug)).toEqual(
      out.map((c) => c.slug),
    );
  });

  test("n caps the tier; fewer depth-positive lanes render all of them", () => {
    expect(featuredCourses(lanes, bundleStats, archivePapers, 2)).toHaveLength(2);
    const out = featuredCourses(lanes.slice(0, 2), bundleStats, archivePapers, 6);
    expect(out.map((c) => c.slug)).toEqual(["a", "b"]); // ghost absent from slice
  });

  test("empty inputs render an empty tier (the caller hides it)", () => {
    expect(featuredCourses([], {}, {})).toEqual([]);
    expect(featuredCourses([lane("g", "Ghost")], {}, {})).toEqual([]);
  });
});
