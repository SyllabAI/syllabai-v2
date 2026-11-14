/**
 * ink-stylus.test.ts — T-MG-INK-11 run-001, the stylus lane's regression
 * seam (pressure + palm rejection + coalesced events).
 *
 * The gap of record (the operator's question: "for people using devices
 * with stylus support, iPads etc — what are we doing?"): the ink layer
 * treated pen, touch and mouse IDENTICALLY — no pressure channel (every
 * stroke a fixed widthFrac), no palm rejection (a palm resting on an
 * iPad started or CLOBBERED the live stroke — the second pointerdown
 * overwrote activeRef/lastPxRef mid-gesture), and no coalesced-event
 * consumption (an Apple Pencil samples at 2-4× the render rate; the
 * intermediate samples were dropped, thinning every stroke).
 *
 * What THIS seam pins (jsdom, the InkCanvas handler seam + the pure
 * modules):
 *   (A) the ink.ts grammar law: the optional `pressures` channel is
 *       carried only when VALID (index-aligned with points, finite
 *       0..1); any violation drops the channel and keeps the stroke;
 *       translateShape carries it; an old-shaped shape parses unchanged.
 *   (B) the paint.ts width law: pressureWidthMul's anchors (p=0.5 → the
 *       exact mouse/legacy anchor 1.0); the no-pressure render is the
 *       shipped single-path law; the pressure render batches equal
 *       quantized multipliers into per-run paths with per-run widths.
 *   (C) the gesture plane: pen pressure capture → commit alignment;
 *       mouse commits none; touch under an active pen session is
 *       rejected (palm rejection); a pen down discards an in-flight
 *       touch gesture and takes the canvas (pen precedence); a second
 *       pointer's up/cancel never ends the live gesture (one-gesture
 *       isolation); coalesced samples append chronologically with their
 *       pressures; an engine without the API behaves as shipped.
 *
 * IMPORT-ORDER LAW: the harness MUST be the first import (see its
 * header — react-dom's module-init DOM detection reads the jsdom
 * globals this file installs).
 */
import "./ink-layer-pointerdown.harness";

import { afterEach, describe, expect, mock, test } from "bun:test";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { InkCanvas, type InkCanvasProps } from "./InkLayer";
import { parseShape, parseDoc, packDoc, translateShape, type InkColor, type InkShape, type InkTextShape } from "./ink";
import { paintShapes, pressureWidthMul, type PaintBox } from "./paint";
import {
  PAGE_H,
  PAGE_W,
  doc,
  pressPointerDown,
  pressPointerMove,
  releasePointerUp,
} from "./ink-layer-pointerdown.harness";

// ── (A) the ink.ts grammar law ──

const STROKE_BASE = {
  id: "s1",
  kind: "stroke",
  page: 1,
  color: "red",
  widthFrac: 0.0038,
  points: [
    [0.25, 0.25],
    [0.35, 0.25],
    [0.45, 0.3],
  ],
};

type StrokeShape = Extract<InkShape, { kind: "stroke" }>;

/** Narrow to the stroke member (or null) — the honest-parse assertions'
 * shared lens. */
function strokeOf(s: InkShape | null): StrokeShape | null {
  return s !== null && s.kind === "stroke" ? s : null;
}

describe("T-MG-INK-11 run-001 — (A) the pressures grammar law (ink.ts)", () => {
  test("(a) an index-aligned finite 0..1 pressures array is carried verbatim", () => {
    const s = strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.2, 0.5, 0.9] }));
    expect(s?.pressures).toEqual([0.2, 0.5, 0.9]);
  });

  test("(b) a pressures array NOT aligned with points is dropped — the stroke survives", () => {
    const s = strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.5, 0.5] }));
    expect(s).not.toBeNull();
    expect(s!.pressures).toBeUndefined();
    expect(s!.points.length).toBe(3);
  });

  test("(c) a non-finite or out-of-range pressure drops the whole channel", () => {
    expect(strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.2, 1.5, 0.9] }))?.pressures).toBeUndefined();
    expect(strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.2, Number.NaN, 0.9] }))?.pressures).toBeUndefined();
    expect(strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.2, "0.5", 0.9] }))?.pressures).toBeUndefined();
  });

  test("(d) no pressures → undefined (the legacy shape parses byte-identically)", () => {
    expect(strokeOf(parseShape({ ...STROKE_BASE }))?.pressures).toBeUndefined();
  });

  test("(e) the container round-trip preserves a pressure-carrying stroke", () => {
    const doc1 = packDoc([
      parseShape({ ...STROKE_BASE, pressures: [0.3, 0.6, 0.4] }) as InkShape,
    ]);
    const parsed = parseDoc(JSON.parse(JSON.stringify(doc1)));
    expect(parsed).not.toBeNull();
    const s = strokeOf(parsed!.shapes[0] ?? null);
    expect(s?.pressures).toEqual([0.3, 0.6, 0.4]);
  });

  test("(f) translateShape carries the channel (a moved pressure stroke stays pressure-carrying)", () => {
    const s = strokeOf(parseShape({ ...STROKE_BASE, pressures: [0.3, 0.6, 0.4] }))!;
    const moved = strokeOf(translateShape(s, 0.1, 0.05));
    expect(moved).not.toBeNull();
    expect(moved!.pressures).toEqual([0.3, 0.6, 0.4]);
    expect(moved!.points[0]).toEqual([0.35, 0.3]);
  });
});

// ── (B) the paint.ts width law ──

const BOX: PaintBox = { cssW: 400, cssH: 300 };

/** A recording 2d-context stub: captures the beginPath/moveTo/lineTo/
 * stroke sequence WITH the lineWidth at each stroke (the variable-width
 * law's observable). */
function recordingCtx() {
  const ops: Array<string | number> = [];
  const ctx = {
    clearRect: () => {},
    beginPath: () => ops.push("begin"),
    moveTo: () => ops.push("move"),
    lineTo: () => ops.push("line"),
    stroke: () => ops.push("stroke", ctx.lineWidth),
    fillText: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "round" as CanvasLineCap,
    lineJoin: "round" as CanvasLineJoin,
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
  };
  return { ctx, ops };
}

describe("T-MG-INK-11 run-001 — (B) the pressure width law (paint.ts)", () => {
  test("(a) pressureWidthMul's anchors: p=0 → 0.35, p=0.5 → the 1.0 mouse/legacy anchor, p=1 → 1.65", () => {
    expect(pressureWidthMul(0)).toBeCloseTo(0.35, 12);
    expect(pressureWidthMul(0.5)).toBeCloseTo(1.0, 12);
    expect(pressureWidthMul(1)).toBeCloseTo(1.65, 12);
    // the quantized render path lands EXACTLY on 1.0 at the mouse anchor
    expect(Math.round(pressureWidthMul(0.5) * 20) / 20).toBe(1);
  });

  test("(b) no pressures → the shipped single-path law (one begin, one stroke, plain width)", () => {
    const { ctx, ops } = recordingCtx();
    paintShapes(ctx, BOX, [
      {
        id: "s1",
        kind: "stroke",
        page: 1,
        color: "red",
        widthFrac: 0.01,
        points: [
          [0.25, 0.25],
          [0.5, 0.5],
        ],
      },
    ]);
    const strokes = ops.filter((o) => o === "stroke").length;
    expect(strokes).toBe(1);
    expect(ctx.lineWidth).toBe(Math.max(1, 0.01 * 400));
  });

  test("(c) uniform pen pressure (0.5 — the mouse anchor) renders ONE run at the plain width", () => {
    const { ctx, ops } = recordingCtx();
    paintShapes(ctx, BOX, [
      {
        id: "s1",
        kind: "stroke",
        page: 1,
        color: "red",
        widthFrac: 0.01,
        points: [
          [0.25, 0.25],
          [0.5, 0.5],
          [0.75, 0.25],
        ],
        pressures: [0.5, 0.5, 0.5],
      },
    ]);
    expect(ops.filter((o) => o === "stroke").length).toBe(1);
    expect(ctx.lineWidth).toBe(Math.max(1, 0.01 * 400));
  });

  test("(d) varying pressure batches runs by quantized multiplier with per-run widths", () => {
    const { ctx, ops } = recordingCtx();
    // p=0 (mul 0.35 → quantized 7/20) then p=1 (mul 1.65 → 33/20)
    paintShapes(ctx, BOX, [
      {
        id: "s1",
        kind: "stroke",
        page: 1,
        color: "red",
        widthFrac: 0.01,
        points: [
          [0.25, 0.25],
          [0.5, 0.5],
          [0.75, 0.25],
        ],
        pressures: [0, 1, 1],
      },
    ]);
    const widths = ops
      .map((o, i) => (o === "stroke" ? ops[i + 1] : null))
      .filter((v): v is number => typeof v === "number");
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeCloseTo(Math.max(1, 0.01 * 400 * 0.35), 9);
    expect(widths[1]).toBeCloseTo(Math.max(1, 0.01 * 400 * 1.65), 9);
  });

  test("(e) a misaligned pressures array on a shape falls back to the plain law", () => {
    const { ctx, ops } = recordingCtx();
    paintShapes(ctx, BOX, [
      {
        id: "s1",
        kind: "stroke",
        page: 1,
        color: "red",
        widthFrac: 0.01,
        points: [
          [0.25, 0.25],
          [0.5, 0.5],
        ],
        pressures: [0.9],
      },
    ]);
    expect(ops.filter((o) => o === "stroke").length).toBe(1);
    expect(ctx.lineWidth).toBe(Math.max(1, 0.01 * 400));
  });
});

// ── (C) the gesture plane (the InkCanvas handler seam) ──

const TEXT_SHAPE: InkTextShape = {
  id: "t1",
  kind: "text",
  page: 1,
  color: "red" as InkColor,
  sizeFrac: 0.035,
  x: 0.25,
  y: 0.25,
  text: "hi",
};

let lastUnmount: (() => Promise<void>) | null = null;

async function mountInkCanvas(overrides: Partial<InkCanvasProps> = {}) {
  const commits = {
    stroke: mock((_page: number, _points: Array<[number, number]>, _pressures?: number[] | null) => {}),
    text: mock((_shape: Omit<InkTextShape, "id" | "kind">) => {}),
    math: mock((_shape: unknown) => {}),
    textEdit: mock((_id: string, _text: string) => {}),
    mathEdit: mock((_id: string, _tex: string) => {}),
    erase: mock((_ids: string[]) => {}),
    move: mock((_shape: InkShape) => {}),
  };
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  const props: InkCanvasProps = {
    page: 1,
    shapes: [],
    mode: "pen",
    color: "red" as InkColor,
    widthFrac: 0.0038,
    onCommitStroke: commits.stroke,
    onCommitText: commits.text,
    onCommitMath: commits.math as never,
    onCommitTextEdit: commits.textEdit,
    onCommitMathEdit: commits.mathEdit,
    onCommitErase: commits.erase,
    onCommitMove: commits.move,
    ...overrides,
  };
  if (!props.liveToolsRef) {
    props.liveToolsRef = {
      current: { mode: props.mode, color: props.color, widthFrac: props.widthFrac },
    };
  }
  await act(async () => {
    root.render(React.createElement(InkCanvas, props));
  });
  const canvas = container.querySelector("canvas")!;
  lastUnmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    lastUnmount = null;
  };
  return { commits, canvas, container };
}

async function dispatchOn(canvas: Element, ev: Event) {
  await act(async () => {
    canvas.dispatchEvent(ev);
  });
}

afterEach(async () => {
  if (lastUnmount) await lastUnmount();
});

describe("T-MG-INK-11 run-001 — (C) the gesture plane", () => {
  test("(a) a PEN stroke captures the pressure channel — commit is index-aligned", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.3 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.8 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [page, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(page).toBe(1);
    expect(points.length).toBe(2);
    expect(pressures).toEqual([0.3, 0.8]);
  });

  test("(b) a MOUSE stroke commits NO pressure channel (byte-identical law)", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    // the gesture plane passes null for mouse/touch (no channel captured);
    // commitStroke attaches nothing — the stored shape stays legacy-shaped
    expect(commits.stroke.mock.calls[0]![2]).toBeNull();
  });

  test("(c) palm rejection — a TOUCH down inside the pen-session window is rejected", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    // a pen stroke lands first (stamps the session)
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.4 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7 }));
    // the palm taps immediately after
    const palm = pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 8 });
    await dispatchOn(canvas, palm.ev);
    expect(palm.calls()).toBe(1); // preventDefault — the palm press is swallowed
    // the palm's gesture tail commits nothing
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 240, clientY: 150, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 240, clientY: 150, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
  });

  test("(d) pen precedence — a pen down DISCARDS an in-flight touch stroke and takes the canvas", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    // the palm starts a stroke
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "touch", pointerId: 8 }));
    // the stylus lands mid-gesture → the palm stroke never existed
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "pen", pointerId: 7, pressure: 0.4 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 240, clientY: 150, pointerType: "pen", pointerId: 7, pressure: 0.6 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 240, clientY: 150, pointerType: "pen", pointerId: 7 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [page, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(page).toBe(1);
    expect(points[0]).toEqual([0.5, 0.5]); // the PEN's start, not the palm's
    expect(pressures).toEqual([0.4, 0.6]);
  });

  test("(e) one-gesture isolation — a second pointer's up never commits the live stroke early", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }));
    // a second pointer touches down and lifts mid-stroke
    const second = pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 8 });
    await dispatchOn(canvas, second.ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(0); // the gesture owns the canvas
    // the PEN's own lift commits the full stroke
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    expect(commits.stroke.mock.calls[0]![1]!.length).toBe(2);
  });

  test("(f) coalesced samples append chronologically with their pressures", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.3 }).ev);
    await dispatchOn(
      canvas,
      pressPointerMove(canvas, {
        clientX: 140,
        clientY: 75,
        pointerType: "pen",
        pointerId: 7,
        pressure: 0.8,
        coalesced: [
          { clientX: 120, clientY: 75, pressure: 0.4 },
          { clientX: 130, clientY: 75, pressure: 0.6 },
        ],
      }),
    );
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.8 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(points.length).toBe(4);
    expect(pressures).toEqual([0.3, 0.4, 0.6, 0.8]);
    expect(points[1]).toEqual([120 / PAGE_W, 75 / PAGE_H]);
    expect(points[2]).toEqual([130 / PAGE_W, 75 / PAGE_H]);
  });

  test("(g) an engine without getCoalescedEvents behaves as shipped (single-sample moves)", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(points.length).toBe(2);
    expect(pressures).toEqual([0.5, 0.5]);
  });

  test("(h) the sub-thinning law holds per coalesced sample (close samples append nothing extra)", async () => {
    const { commits, canvas } = await mountInkCanvas({ mode: "pen" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.5 }).ev);
    await dispatchOn(
      canvas,
      pressPointerMove(canvas, {
        clientX: 140,
        clientY: 75,
        pointerType: "pen",
        pointerId: 7,
        pressure: 0.5,
        coalesced: [
          { clientX: 100.5, clientY: 75, pressure: 0.5 }, // 0.5px — thinned
          { clientX: 101, clientY: 75, pressure: 0.5 }, // 1px — thinned
        ],
      }),
    );
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7 }));
    const [, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(points.length).toBe(2);
    expect(pressures).toEqual([0.5, 0.5]);
  });

  test("(i) sanity: the text editor seam still mounts (the harness wiring is untouched)", async () => {
    const { container } = await mountInkCanvas({ mode: "text", shapes: [TEXT_SHAPE] });
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});

// keep the page dims referenced (the harness box law) — the coalesced
// assertions read them for the normalized points
void PAGE_H;
