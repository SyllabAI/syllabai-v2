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

// ── T-MG-INK-4 run-002 — the new kinds, the tombstone law, the hit laws ──

import {
  eraseShapes,
  makeTombstone,
  parseShape as parseShape4,
  pointSegmentDistCss,
  shapeBoundsCss,
  shapeHitTest,
  shapesHitIds,
  translateShape,
} from "./ink";

const mtext = (over: Partial<InkShape> = {}): InkShape => ({
  id: "m1",
  kind: "mtext",
  page: 1,
  color: "black",
  sizeFrac: 0.02,
  x: 0.1,
  y: 0.1,
  tex: "\\frac{d}{dx}x^2=2x",
  ...(over as object),
}) as InkShape;

describe("T-MG-INK-4 run-002 — the container law (the new kinds ride syllabai-ink/1)", () => {
  test("mtext parses honestly: fields kept, anchor clamped", () => {
    const s = parseShape4({ id: "m1", kind: "mtext", page: 2, color: "red", sizeFrac: 0.03, x: -1, y: 2, tex: "e^{i\\pi}+1=0" });
    expect(s).not.toBeNull();
    expect(s).toMatchObject({ kind: "mtext", page: 2, color: "red", x: 0, y: 1, tex: "e^{i\\pi}+1=0" });
  });

  test("mtext rejects: missing colour, empty tex, tex over the 1000-char cap, sizeFrac out of band", () => {
    expect(parseShape4({ id: "m", kind: "mtext", page: 1, sizeFrac: 0.02, x: 0, y: 0, tex: "x" })).toBeNull();
    expect(parseShape4({ id: "m", kind: "mtext", page: 1, color: "black", sizeFrac: 0.02, x: 0, y: 0, tex: "" })).toBeNull();
    expect(parseShape4({ id: "m", kind: "mtext", page: 1, color: "black", sizeFrac: 0.02, x: 0, y: 0, tex: "x".repeat(1001) })).toBeNull();
    expect(parseShape4({ id: "m", kind: "mtext", page: 1, color: "black", sizeFrac: 0.5, x: 0, y: 0, tex: "x" })).toBeNull();
  });

  test("tombstone parses with NO color and NO geometry (the deletion law)", () => {
    const s = parseShape4({ id: "s1", kind: "tombstone", page: 3 });
    expect(s).toEqual({ id: "s1", kind: "tombstone", page: 3 });
  });

  test("an UNKNOWN kind drops at the honest-parse boundary (never throws)", () => {
    expect(parseShape4({ id: "u", kind: "CallRepository", page: 1 })).toBeNull();
  });

  test("the old kinds keep their exact law: stroke/text still require a colour", () => {
    expect(parseShape4({ id: "s", kind: "stroke", page: 1, widthFrac: 0.0038, points: [[0, 0], [1, 1]] })).toBeNull();
    expect(parseShape4({ id: "t", kind: "text", page: 1, sizeFrac: 0.02, x: 0, y: 0, text: "hi" })).toBeNull();
  });

  test("pack/parse round-trips the new kinds byte-faithfully", () => {
    const doc = packDoc([mtext(), { id: "s1", kind: "tombstone", page: 1 } as InkShape]);
    const back = parseDoc(doc);
    expect(back!.shapes).toEqual(doc.shapes);
  });
});

describe("T-MG-INK-4 run-002 — the tombstone law (deletion is representable)", () => {
  test("makeTombstone reuses the target's id and page — nothing else", () => {
    expect(makeTombstone({ id: "a", page: 7 })).toEqual({ id: "a", kind: "tombstone", page: 7 });
  });

  test("eraseShapes replaces targets IN PLACE (stable order, no duplicates)", () => {
    const shapes = [stroke({ id: "a" }), mtext({ id: "b" }), stroke({ id: "c" })];
    const out = eraseShapes(shapes, new Set(["a", "c", "not-there"]));
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(out[0]).toEqual({ id: "a", kind: "tombstone", page: 1 });
    expect(out[2]).toEqual({ id: "c", kind: "tombstone", page: 1 });
    expect(out[1]).toEqual(mtext({ id: "b" }));
  });

  test("an erasure SURVIVES the rebase: stored stroke + local tombstone (same id) → tombstone wins", () => {
    const stored = [stroke({ id: "a" })];
    const local = [makeTombstone({ id: "a", page: 1 })];
    const merged = rebaseShapes(stored, local);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.kind).toBe("tombstone");
  });

  test("an erasure SURVIVES the migration upload (local tombstone over the server shape)", () => {
    const serverDoc = [stroke({ id: "a" }), stroke({ id: "b" })];
    const localDoc = [makeTombstone({ id: "a", page: 1 })];
    const merged = rebaseShapes(serverDoc, localDoc);
    expect(merged.map((s) => s.kind)).toEqual(["tombstone", "stroke"]);
  });

  test("undo is the honest resurrection: local pre-erase snapshot wins the rebase", () => {
    const otherWriter = [makeTombstone({ id: "a", page: 1 })];
    const preEraseSnapshot = [stroke({ id: "a" })];
    expect(rebaseShapes(otherWriter, preEraseSnapshot)[0]!.kind).toBe("stroke");
  });
});

describe("T-MG-INK-4 run-002 — the move law (css-px intent, normalized per-axis)", () => {
  test("stroke points translate and clamp into the page box", () => {
    const moved = translateShape(stroke({ points: [[0.1, 0.1], [0.2, 0.2]] }), 0.05, -0.2) as Extract<InkShape, { kind: "stroke" }>;
    expect(moved.points).toHaveLength(2);
    expect(moved.points[0]![0]).toBeCloseTo(0.15, 12);
    expect(moved.points[0]![1]).toBe(0);
    expect(moved.points[1]![0]).toBeCloseTo(0.25, 12);
    expect(moved.points[1]![1]).toBe(0);
  });

  test("text/mtext anchors translate; tombstones are NOT movable", () => {
    const t = translateShape(mtext({ x: 0.9, y: 0.5 }), 0.2, 0.1) as Extract<InkShape, { kind: "mtext" }>;
    expect(t.x).toBe(1);
    expect(t.y).toBe(0.6);
    expect(translateShape(makeTombstone({ id: "a", page: 1 }), 0.1, 0.1)).toBeNull();
  });
});

describe("T-MG-INK-4 run-002 — the hit laws (erase/select)", () => {
  const box = { cssW: 800, cssH: 1000 };

  test("pointSegmentDistCss is the honest css-px distance", () => {
    expect(pointSegmentDistCss({ x: 400, y: 500 }, [0, 0.5], [1, 0.5], box)).toBe(0);
    expect(pointSegmentDistCss({ x: 400, y: 520 }, [0, 0.5], [1, 0.5], box)).toBe(20);
  });

  test("strokes hit within max(tol, pen width) of their path", () => {
    const s = stroke({ points: [[0, 0.5], [1, 0.5]] }); // pen 0.0038×800 = 3.04 css px
    expect(shapeHitTest(s, { x: 0.5, y: 0.51 }, box, 12)).toBe(true); // 10 css px ≤ tol 12
    expect(shapeHitTest(s, { x: 0.5, y: 0.514 }, box, 12)).toBe(false); // 14 css px > tol 12
    expect(shapeHitTest(s, { x: 0.5, y: 0.53 }, box, 12)).toBe(false);
  });

  test("text hits its estimated bbox (inflated 4 css px); mtext hits the MEASURED truth", () => {
    const t = mtext({ id: "t", kind: "text", text: "show that", sizeFrac: 0.02, x: 0.4, y: 0.4 } as Partial<InkShape>);
    // fontSize 16 → w = 9*0.6*16 = 86.4, h = 20 → x∈[315.6..406], y∈[316..340]
    expect(shapeHitTest(t, { x: 0.45, y: 0.42 }, box, 12)).toBe(true);
    expect(shapeHitTest(t, { x: 0.6, y: 0.42 }, box, 12)).toBe(false);
    const m = mtext({ id: "m", kind: "mtext" });
    expect(shapeHitTest(m, { x: 0.2, y: 0.12 }, box, 12, { w: 200, h: 40 })).toBe(true);
    expect(shapeHitTest(m, { x: 0.5, y: 0.12 }, box, 12, { w: 200, h: 40 })).toBe(false);
  });

  test("tombstones are NEVER hittable (deletions, not ink)", () => {
    expect(shapeHitTest(makeTombstone({ id: "a", page: 1 }), { x: 0.5, y: 0.5 }, box, 999)).toBe(false);
  });

  test("shapesHitIds returns every hit in doc order (select takes the LAST = topmost)", () => {
    const shapes = [stroke({ id: "a", points: [[0, 0.5], [1, 0.5]] }), mtext({ id: "m", kind: "mtext", x: 0.4, y: 0.48, tex: "x" })];
    const hits = shapesHitIds(shapes, { x: 0.45, y: 0.5 }, box, 12, (id) => (id === "m" ? { w: 150, h: 40 } : undefined));
    expect(hits).toEqual(["a", "m"]);
    expect(hits[hits.length - 1]).toBe("m");
  });

  test("shapeBoundsCss: strokes bound their path (+pen), tombstones bound nothing", () => {
    const b = shapeBoundsCss(stroke({ points: [[0.25, 0.25], [0.75, 0.75]] }), box, undefined);
    expect(b).not.toBeNull();
    expect(b!.x).toBeCloseTo(0.25 * 800 - 1.52, 1);
    expect(shapeBoundsCss(makeTombstone({ id: "a", page: 1 }), box, undefined)).toBeNull();
  });
});

// ── T-MG-INK-4 run-003 — the re-edit law ──

import {
  editMathShape,
  editTextShape,
} from "./ink";

describe("T-MG-INK-4 run-003 — the re-edit law (content replacement in place)", () => {
  const text = (over: Partial<InkShape> = {}): InkShape =>
    ({
      id: "t1",
      kind: "text",
      page: 1,
      color: "red",
      sizeFrac: 0.02,
      x: 0.3,
      y: 0.4,
      text: "before",
      ...(over as object),
    }) as InkShape;

  test("editTextShape replaces the content IN PLACE (same id, geometry/colour untouched)", () => {
    const t = text();
    const [out] = editTextShape([t], "t1", "after");
    expect(out).toMatchObject({ id: "t1", kind: "text", text: "after", color: "red", sizeFrac: 0.02, x: 0.3, y: 0.4 });
  });

  test("editMathShape replaces the tex IN PLACE (same id)", () => {
    const m = mtext({ id: "m1", tex: "x^2" });
    const [out] = editMathShape([m], "m1", "y^3");
    expect(out).toMatchObject({ id: "m1", kind: "mtext", tex: "y^3" });
  });

  test("the edit is the newer intent: it WINS the union-by-id rebase (the move law's precedent)", () => {
    const stored = [text({ text: "stale" })];
    const local = editTextShape(stored, "t1", "edited");
    expect(rebaseShapes(stored, local)).toEqual(local);
  });

  test("an empty value is a no-op — the SAME array returns (empty commit cancels, both sides)", () => {
    const arr = [text(), mtext()];
    expect(editTextShape(arr, "t1", "")).toBe(arr);
    expect(editMathShape(arr, "m1", "")).toBe(arr);
  });

  test("unknown ids and other kinds pass through untouched (a tombstone never regrows a body)", () => {
    const tomb = makeTombstone({ id: "t1", page: 1 });
    const s = stroke({ id: "s1" });
    const arr = [s, tomb];
    const out = editTextShape(arr, "t1", "nope");
    expect(out[1]).toBe(tomb);
    expect(out[1]!.kind).toBe("tombstone");
    expect(editTextShape(arr, "unknown", "nope")).toEqual(arr);
    const out2 = editTextShape([s], "s1", "nope");
    expect(out2[0]).toBe(s);
  });

  test("map semantics: siblings keep identity (one edit commit = one snapshot = one undo step)", () => {
    const s = stroke();
    const t = text({ id: "t2" });
    const out = editTextShape([s, t], "t2", "after");
    expect(out[0]).toBe(s);
    expect(out).toHaveLength(2);
  });
});
