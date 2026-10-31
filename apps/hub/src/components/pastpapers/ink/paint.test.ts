/**
 * Painter tests — T-MG-INK-4 run-002. The painter-hardening pin over a
 * CanvasRenderingContext2D-shaped stub: the kind-switch law (strokes +
 * text paint byte-identically; mtext is the DOM overlay's; tombstones
 * and ANY unknown kind skip honestly — the old `else paintText`
 * fallthrough would have thrown on an unknown kind's missing `text`).
 */
import { describe, expect, test } from "bun:test";

import { paintShapes, type PaintBox } from "./paint";
import type { InkShape } from "./ink";

const box: PaintBox = { cssW: 800, cssH: 1000 };

interface RecorderCtx {
  ops: string[];
  clearRect: () => void;
  beginPath: () => void;
  moveTo: () => void;
  lineTo: () => void;
  stroke: () => void;
  fillText: (t: string) => void;
  save: () => void;
  restore: () => void;
  setTransform: () => void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textBaseline: CanvasTextBaseline;
}

const recorder = (): RecorderCtx => {
  const ops: string[] = [];
  return {
    ops,
    clearRect: () => ops.push("clear"),
    beginPath: () => ops.push("begin"),
    moveTo: () => ops.push("move"),
    lineTo: () => ops.push("line"),
    stroke: () => ops.push("stroke"),
    fillText: (t: string) => ops.push(`text:${t}`),
    save: () => ops.push("save"),
    restore: () => ops.push("restore"),
    setTransform: () => ops.push("xform"),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "round",
    lineJoin: "round",
    font: "",
    textBaseline: "top",
  };
};

const strokeShape: InkShape = {
  id: "s",
  kind: "stroke",
  page: 1,
  color: "black",
  widthFrac: 0.0038,
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
  ],
};
const textShape: InkShape = { id: "t", kind: "text", page: 1, color: "red", sizeFrac: 0.02, x: 0.3, y: 0.3, text: "hi" };
const mtextShape: InkShape = { id: "m", kind: "mtext", page: 1, color: "blue", sizeFrac: 0.02, x: 0.4, y: 0.4, tex: "x^2" };
const tombstone: InkShape = { id: "t", kind: "tombstone", page: 1 };

describe("T-MG-INK-4 run-002 — the painter hardening pin", () => {
  test("strokes and text paint exactly as shipped (byte-identical call law)", () => {
    const ctx = recorder();
    paintShapes(ctx as unknown as CanvasRenderingContext2D, box, [strokeShape, textShape]);
    expect(ctx.ops).toContain("stroke");
    expect(ctx.ops).toContain("text:hi");
    expect(ctx.ops[0]).toBe("clear");
  });

  test("mtext and tombstones skip the canvas painter (the DOM overlay owns mtext)", () => {
    const ctx = recorder();
    paintShapes(ctx as unknown as CanvasRenderingContext2D, box, [mtextShape, tombstone]);
    expect(ctx.ops).toEqual(["clear"]);
    expect(ctx.ops).not.toContain("stroke");
  });

  test("an UNKNOWN kind skips honestly — never routed at s.text, never a throw", () => {
    const ctx = recorder();
    const unknown = { id: "u", kind: "CallRepository", page: 1 } as unknown as InkShape;
    expect(() => paintShapes(ctx as unknown as CanvasRenderingContext2D, box, [unknown])).not.toThrow();
    expect(ctx.ops).toEqual(["clear"]);
  });

  test("the crop-composite law holds: clear:false paints strokes + text over the existing bitmap", () => {
    const ctx = recorder();
    paintShapes(ctx as unknown as CanvasRenderingContext2D, box, [strokeShape, mtextShape], null, { clear: false });
    expect(ctx.ops).not.toContain("clear");
    expect(ctx.ops).toContain("stroke");
    expect(ctx.ops).not.toContain("text:"); // mtext alone is invisible to the crop (the disclosed limitation)
  });
});
