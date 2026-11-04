/**
 * Dashboard sidebar model tests (T-DASH-SIDEBAR-001): the level-tab
 * bucketing (case tolerance, CIE lanes surface under All, never vanish),
 * the roster resolution law (registry validation, insertion order, dedupe)
 * and the per-course quick links. Fixtures use real registry slugs —
 * igcse-chemistry-19 is the pilot.
 */
import { describe, expect, it } from "bun:test";

import type { CourseMeta } from "@/lib/courses";
import {
  courseResourceLinks,
  filterCoursesByLevel,
  levelBucket,
  resolveMySubjects,
} from "@/lib/dashboard-sidebar-model";

const meta = (slug: string, level: string): CourseMeta =>
  ({
    slug,
    level,
    subject: slug,
    label: slug,
    code: "4CH1",
    status: "pilot",
    hasBundle: true,
  }) as CourseMeta;

describe("levelBucket", () => {
  it("maps the two shipped Edexcel levels, case-tolerant", () => {
    expect(levelBucket("IGCSE")).toBe("igcse");
    expect(levelBucket("igcse")).toBe("igcse");
    expect(levelBucket("IAL")).toBe("ial");
    expect(levelBucket("ial")).toBe("ial");
  });

  it("buckets CIE and staging levels as other — visible under All, never under a tab", () => {
    expect(levelBucket("A-LEVEL")).toBe("other");
    expect(levelBucket("A-Level")).toBe("other");
    expect(levelBucket("AS")).toBe("other");
    expect(levelBucket("Developing")).toBe("other");
  });

  it("is whitespace-tolerant and honest about garbage", () => {
    expect(levelBucket(" IGCSE ")).toBe("igcse");
    expect(levelBucket("")).toBe("other");
    expect(levelBucket("GCSE")).toBe("other");
  });
});

describe("filterCoursesByLevel", () => {
  const roster = [
    meta("igcse-chemistry-19", "IGCSE"),
    meta("ial-maths-20-pure-1", "IAL"),
    meta("cie-a-level-physics", "A-Level"),
  ];

  it("all passes the roster through in insertion order", () => {
    expect(filterCoursesByLevel(roster, "all")).toEqual(roster);
  });

  it("igcse keeps only IGCSE lanes", () => {
    expect(filterCoursesByLevel(roster, "igcse").map((c) => c.slug)).toEqual([
      "igcse-chemistry-19",
    ]);
  });

  it("ial keeps only IAL lanes", () => {
    expect(filterCoursesByLevel(roster, "ial").map((c) => c.slug)).toEqual([
      "ial-maths-20-pure-1",
    ]);
  });

  it("an empty roster filters to empty without drama", () => {
    expect(filterCoursesByLevel([], "igcse")).toEqual([]);
  });
});

describe("resolveMySubjects", () => {
  const bySlug = new Map([
    ["igcse-chemistry-19", meta("igcse-chemistry-19", "IGCSE")],
    ["ial-maths-20-pure-1", meta("ial-maths-20-pure-1", "IAL")],
  ]);

  it("keeps stored slugs that still resolve, insertion order preserved", () => {
    const out = resolveMySubjects(
      ["ial-maths-20-pure-1", "igcse-chemistry-19"],
      bySlug,
    );
    expect(out.map((c) => c.slug)).toEqual([
      "ial-maths-20-pure-1",
      "igcse-chemistry-19",
    ]);
  });

  it("drops slugs the registry no longer knows (the stale-roster law)", () => {
    expect(
      resolveMySubjects(["igcse-chemistry-19", "not-a-course"], bySlug).map(
        (c) => c.slug,
      ),
    ).toEqual(["igcse-chemistry-19"]);
  });

  it("dedupes a hand-edited roster so a course renders once", () => {
    expect(
      resolveMySubjects(
        ["igcse-chemistry-19", "igcse-chemistry-19"],
        bySlug,
      ).map((c) => c.slug),
    ).toEqual(["igcse-chemistry-19"]);
  });

  it("resolves an empty roster to empty", () => {
    expect(resolveMySubjects([], bySlug)).toEqual([]);
  });
});

describe("courseResourceLinks", () => {
  it("builds the five quick links from the course slug", () => {
    expect(courseResourceLinks("igcse-chemistry-19")).toEqual([
      { key: "hub", href: "/courses/igcse-chemistry-19", label: "Course hub" },
      {
        key: "notes",
        href: "/courses/igcse-chemistry-19/revision-notes",
        label: "Revision Notes",
      },
      {
        key: "questions",
        href: "/courses/igcse-chemistry-19/exam-questions",
        label: "Exam Questions",
      },
      {
        key: "flashcards",
        href: "/courses/igcse-chemistry-19/flashcards",
        label: "Flashcards",
      },
      {
        key: "papers",
        href: "/courses/igcse-chemistry-19/past-papers",
        label: "Past Papers",
      },
    ]);
  });

  it("uses unique keys", () => {
    const links = courseResourceLinks("igcse-chemistry-19");
    expect(new Set(links.map((l) => l.key)).size).toBe(links.length);
  });
});
