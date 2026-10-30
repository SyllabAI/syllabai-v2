/**
 * Ink grammar tests — T-MG-INK-1 run-003. The run-002 test-shape law
 * (pins named by the acceptance law they pin) over the PURE modules:
 * the grammar of record, the normalized geometry law, the honest parse,
 * and the 409 re-apply (rebase) law.
 */
import { describe, expect, test } from "bun:test";

import {
  INK_COLORS,
  INK_DOC_SCHEMA_ID,
  clamp01,
  emptyDoc,
  makeShapeId,
  normalizePoint,
  packDoc,
  parseDoc,
  parseShape,
  rebaseShapes,
  shouldAppendPoint,
  type InkShape,
} from "./ink";

const stroke = (over: Partial<InkShape> = {}): InkShape => ({
  id: "s1",
  kind: "stroke",
  page: 1,
  color: "black",
  widthFrac: 0.0038,
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
  ],
  ...(over as object),
}) as InkShape;

describe("T-MG-INK-1 run-003 — the §3.3 container law (persistence pin a)", () => {
  test("(a) pack/parse round-trip — the doc survives byte-faithfully", () => {
    const shapes = [
      stroke(),
      {
        id: "t1",
        kind: "text",
        page: 2,
        color: "red",
        sizeFrac: 0.02,
        x: 0.5,
        y: 0.5,
        text: "show that",
      } as InkShape,
    ];
    const doc = packDoc(shapes);
    expect(doc.schema).toBe(INK_DOC_SCHEMA_ID);
    const back = parseDoc(doc);
    expect(back).not.toBeNull();
    expect(back!.shapes).toEqual(shapes);
  });

  test("(a) emptyDoc is the seeded container", () => {
    expect(emptyDoc()).toEqual({ schema: INK_DOC_SCHEMA_ID, shapes: [] });
  });

  test("parseDoc drops malformed shapes honestly (never throws, never fabricates)", () => {
    const back = parseDoc({
      schema: INK_DOC_SCHEMA_ID,
      shapes: [
        stroke(),
        { nope: true },
        { id: "x", kind: "stroke", page: 0, color: "black", widthFrac: 0.01, points: [[0, 0], [1, 1]] }, // page 0
        { id: "y", kind: "stroke", page: 1, color: "magenta", widthFrac: 0.01, points: [[0, 0], [1, 1]] }, // bad colour
        { id: "z", kind: "stroke", page: 1, color: "black", widthFrac: 9, points: [[0, 0], [1, 1]] }, // width out of band
      ],
    });
    expect(back!.shapes).toHaveLength(1);
    expect(back!.shapes[0]!.id).toBe("s1");
  });

  test("parseDoc rejects wrong schema ids and non-array shapes", () => {
    expect(parseDoc({ schema: "tldraw/1", shapes: [] })).toBeNull();
    expect(parseDoc({ schema: INK_DOC_SCHEMA_ID, shapes: "nope" })).toBeNull();
    expect(parseDoc(null)).toBeNull();
  });
});

describe("T-MG-INK-1 run-003 — the normalized geometry law (RegionOverlay law at canvas grain)", () => {
  test("normalizePoint maps client space to 0..1 page fractions", () => {
    const box = { left: 100, top: 200, width: 800, height: 1000 };
    expect(normalizePoint(box, 100, 200)).toEqual([0, 0]);
    expect(normalizePoint(box, 500, 700)).toEqual([0.5, 0.5]);
    expect(normalizePoint(box, 900, 1200)).toEqual([1, 1]);
  });

  test("normalizePoint clamps out-of-box input (degenerate boxes → origin)", () => {
    const box = { left: 0, top: 0, width: 100, height: 100 };
    expect(normalizePoint(box, -50, 150)).toEqual([0, 1]);
    expect(normalizePoint({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual([0, 0]);
  });

  test("clamp01 folds NaN to 0", () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-0.4)).toBe(0);
    expect(clamp01(1.4)).toBe(1);
  });

  test("shouldAppendPoint coalesces sub-min moves (the perf-pin rdp-lite)", () => {
    expect(shouldAppendPoint([0, 0], [0.5, 0.5], 1.2)).toBe(false);
    expect(shouldAppendPoint([0, 0], [2, 0], 1.2)).toBe(true);
  });
});

describe("T-MG-INK-1 run-003 — the 409 re-apply law (run-002 revision doc)", () => {
  test("rebase = union by id: stored first, local additions appended", () => {
    const stored = [stroke({ id: "a" }), stroke({ id: "b" })];
    const local = [stroke({ id: "b" }), stroke({ id: "c" })];
    const merged = rebaseShapes(stored, local);
    expect(merged.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("id collision resolves local-wins (the newer intent)", () => {
    const stored = [stroke({ id: "a", widthFrac: 0.0022 })];
    const local = [stroke({ id: "a", widthFrac: 0.006 })];
    const winner = rebaseShapes(stored, local)[0] as Extract<InkShape, { kind: "stroke" }>;
    expect(winner.widthFrac).toBe(0.006);
  });

  test("rebase never clobbers: empty local keeps stored, empty stored keeps local", () => {
    const s = [stroke({ id: "a" })];
    expect(rebaseShapes(s, [])).toEqual(s);
    expect(rebaseShapes([], s)).toEqual(s);
  });
});

describe("T-MG-INK-1 run-003 — grammar hygiene", () => {
  test("palette of record is the run-001 spike palette, verbatim", () => {
    expect(INK_COLORS).toEqual({
      black: "#1a1a1a",
      red: "#d13438",
      blue: "#0f6cbd",
      green: "#107c10",
    });
  });

  test("shape ids are unique across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeShapeId()));
    expect(ids.size).toBe(200);
  });

  test("parseShape keeps a minimal legal stroke and clamps its points", () => {
    const s = parseShape({
      id: "p1",
      kind: "stroke",
      page: 3,
      color: "blue",
      widthFrac: 0.0038,
      points: [
        [-0.5, 0.25],
        [1.5, 0.75],
      ],
    });
    expect(s).not.toBeNull();
    expect((s as Extract<InkShape, { kind: "stroke" }>).points).toEqual([
      [0, 0.25],
      [1, 0.75],
    ]);
  });
});
