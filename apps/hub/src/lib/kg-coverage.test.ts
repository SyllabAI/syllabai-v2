import { describe, expect, test } from "bun:test";
import { bucketForPoint, rollupCoverage, type CoverageGraphInput } from "./kg-coverage";
import type { PointState } from "./kg-learner-state";

function ps(partial: Partial<PointState> & { pointId: string }): PointState {
  return {
    statement: null,
    stored: null,
    effective: null,
    band: null,
    attempts: 0,
    exposure: 0,
    lastAt: 0,
    reviewDue: false,
    dueAt: Number.POSITIVE_INFINITY,
    noteIds: [],
    misconception: null,
    derivedFrom: null,
    ...partial,
  };
}

describe("bucketForPoint — the one bucket law", () => {
  test("no evidence at all is untouched", () => {
    expect(bucketForPoint(undefined)).toBe("untouched");
    expect(bucketForPoint(ps({ pointId: "1.1" }))).toBe("untouched");
  });

  test("self-report exposure alone is seen — never proven", () => {
    expect(bucketForPoint(ps({ pointId: "1.2", exposure: 3 }))).toBe("seen");
  });

  test("marked evidence (stored != null) is proven on both paths", () => {
    // sim path: direct marked attempts
    expect(bucketForPoint(ps({ pointId: "1.3", stored: 72, attempts: 2, exposure: 2 }))).toBe("proven");
    // core path: topic-derived measured skill (stored set, no direct attempts)
    expect(bucketForPoint(ps({ pointId: "1.4", stored: 55, effective: 51, derivedFrom: "via Topic" }))).toBe("proven");
  });
});

const GRAPH: CoverageGraphInput = {
  sections: {
    "1": { label: "Principles", color: "#6656a9" },
    "2": { label: "Inorganic" },
  },
  subtopics: {
    "1": [
      ["1a", "States of matter"],
      ["1b", "Elements"],
    ],
    "2": [["2a", "Group 1"]],
  },
  pointSubtopics: {
    "1a": ["1.1", "1.2"],
    "1b": ["1.3"],
    "2a": ["2.1", "2.2"],
  },
  points: [
    { id: "1.1", text: "understand the three states of matter" },
    { id: "1.2", text: "understand how to classify a substance" },
  ],
  nodes: [
    { id: "p:1.3", type: "SpecificationPoint", pointId: "1.3", statement: "calculate relative formula mass" },
  ],
};

describe("rollupCoverage", () => {
  const states = [
    ps({ pointId: "1.1", stored: 80, effective: 76, attempts: 3 }),
    ps({ pointId: "1.3", stored: 40, effective: 38, derivedFrom: "via Topic" }),
    ps({ pointId: "2.1", exposure: 2 }),
    // 1.2, 2.2 untouched — absent from the join
  ];

  const rollup = rollupCoverage(GRAPH, states);

  test("buckets every point exactly once", () => {
    expect(rollup.total).toBe(5);
    expect(rollup.proven).toBe(2);
    expect(rollup.seen).toBe(1);
    expect(rollup.untouched).toBe(2);
  });

  test("sections keep corpus order with numeric awareness", () => {
    expect(rollup.sections.map((s) => s.code)).toEqual(["1", "2"]);
    expect(rollup.sections[0].label).toBe("Principles");
    expect(rollup.sections[0].color).toBe("#6656a9");
  });

  test("per-section counts match their own points", () => {
    const s1 = rollup.sections[0];
    expect(s1.total).toBe(3);
    expect(s1.proven).toBe(2);
    expect(s1.untouched).toBe(1);
    const s2 = rollup.sections[1];
    expect(s2.seen).toBe(1);
    expect(s2.untouched).toBe(1);
  });

  test("statements prefer the points list, nodes fill the rest", () => {
    const [a11, a12, a13] = rollup.sections[0].groups.flatMap((g) => g.points);
    expect(a11.statement).toBe("understand the three states of matter");
    expect(a12.statement).toBe("understand how to classify a substance");
    expect(a13.statement).toBe("calculate relative formula mass");
  });

  test("proven rows carry the decayed effective; seen rows do not", () => {
    const s1 = rollup.sections[0].groups.flatMap((g) => g.points);
    expect(s1.find((p) => p.pointId === "1.1")?.effective).toBe(76);
    expect(s1.find((p) => p.pointId === "1.2")?.effective).toBeNull();
  });

  test("a graph the join knows nothing about is all untouched — not an error", () => {
    const fresh = rollupCoverage(GRAPH, []);
    expect(fresh.proven).toBe(0);
    expect(fresh.seen).toBe(0);
    expect(fresh.untouched).toBe(5);
  });

  test("empty graph yields an empty rollup, never a throw", () => {
    const empty = rollupCoverage({}, states);
    expect(empty.total).toBe(0);
    expect(empty.sections).toEqual([]);
  });
});
