/**
 * Ink canvas painter — T-MG-INK-1 run-003. The render-side half of the
 * normalized law: shapes are 0..1 page-box fractions; painting multiplies
 * by the CURRENT css box size (the caller pre-scales the context by dpr ≤
 * 2, the pdf-pane:987 law, so both zoom and dpr are the browser's/one
 * transform's problem — no pixel math survives a reload).
 *
 * Pure over its arguments (a CanvasRenderingContext2D-shaped stub is
 * enough to test the geometry calls — no real canvas needed).
 */
import { INK_COLORS, INK_TEXT_FONT_STACK, INK_TEXT_WEIGHT, type InkShape } from "./ink";

export interface PaintBox {
  cssW: number;
  cssH: number;
}

type Ctx = {
  clearRect: (x: number, y: number, w: number, h: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  fillText: (t: string, x: number, y: number) => void;
  save: () => void;
  restore: () => void;
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textBaseline: CanvasTextBaseline;
};

/** Paint options: `clear: false` skips the leading clearRect — the
 * T-MG-CROPMARK-1 run-002 crop composite paints ink OVER an existing
 * bitmap (the region crop) instead of owning the canvas. Default
 * behavior (clear) is unchanged for every existing caller. */
export interface PaintOptions {
  clear?: boolean;
}

/** Paint the shape set for ONE page into a dpr-scaled context. */
export function paintShapes(
  ctx: Ctx,
  box: PaintBox,
  shapes: InkShape[],
  activeStroke?: {
    color: string;
    widthFrac: number;
    points: Array<[number, number]>;
    /** T-MG-INK-11: the in-flight pen stroke's pressure channel (pen
     * gestures only; absent → the in-flight stroke paints constant-width). */
    pressures?: number[];
  } | null,
  opts?: PaintOptions,
): void {
  if (opts?.clear !== false) ctx.clearRect(0, 0, box.cssW, box.cssH);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of shapes) {
    // T-MG-INK-4 painter hardening: an EXPLICIT kind-switch — mtext is
    // the DOM overlay's (./MathTextOverlay), tombstones are deletions,
    // and ANY unknown kind (forward schema evolution) is skipped
    // honestly. The old `else paintText` fallthrough would have routed
    // an unknown kind at s.text and thrown. Strokes + text painting is
    // byte-identical to the shipped law (the T-MG-CROPMARK-1 crop
    // composite keeps compositing strokes + text verbatim; the
    // mtext-in-crop blindspot is the spec's disclosed limitation).
    if (s.kind === "stroke") paintStroke(ctx, box, s.color, s.widthFrac, s.points, s.pressures);
    else if (s.kind === "text") paintText(ctx, box, s);
  }
  if (activeStroke && activeStroke.points.length >= 2) {
    paintStroke(ctx, box, activeStroke.color, activeStroke.widthFrac, activeStroke.points, activeStroke.pressures);
  }
}

/** T-MG-INK-11 run-001 — the pressure→width law of record. The raw
 * PointerEvent pressure (0..1) maps linearly to a width MULTIPLIER of the
 * stroke's widthFrac: `0.35 + 1.3 * p`. The anchors are pinned:
 * p=0 → 0.35 (a feathered touch), p=0.5 → exactly 1.0 (the Pointer
 * Events spec's mouse default — every mouse stroke and every legacy
 * no-pressure stroke renders BYTE-IDENTICAL to the shipped law), p=1 →
 * 1.65 (a hard pen press). Pure, exported for the tests. */
export function pressureWidthMul(p: number): number {
  return 0.35 + 1.3 * p;
}

/**
 * T-MG-INK-11 run-001: paint a stroke with the stylus pressure channel.
 * With `pressures` (index-aligned with points), each SEGMENT renders at
 * the width of the point it lands on — consecutive segments whose
 * quantized multiplier matches (steps of 0.05) batch into ONE path so a
 * typical handwriting stroke is a handful of strokes, not one per point.
 * Without pressures (or on any length mismatch), the render is the
 * shipped single-path law byte-for-byte.
 */
function paintStroke(
  ctx: Ctx,
  box: PaintBox,
  color: string,
  widthFrac: number,
  points: Array<[number, number]>,
  pressures?: number[],
): void {
  if (points.length < 2) return;
  const px = points.map(([fx, fy]) => [fx * box.cssW, fy * box.cssH] as [number, number]);
  ctx.strokeStyle = INK_COLORS[color as keyof typeof INK_COLORS] ?? color;
  const hasPressure =
    Array.isArray(pressures) && pressures.length === points.length && points.length > 0;
  if (!hasPressure) {
    ctx.lineWidth = Math.max(1, widthFrac * box.cssW);
    ctx.beginPath();
    for (let i = 0; i < px.length; i++) {
      if (i === 0) ctx.moveTo(px[i]![0], px[i]![1]);
      else ctx.lineTo(px[i]![0], px[i]![1]);
    }
    ctx.stroke();
    return;
  }
  // Variable width: segment s (point s → point s+1) renders at the START
  // point's pressure; runs of equal quantized multiplier (steps of 0.05)
  // batch into one sub-path (round caps + joins make the seams invisible).
  const base = widthFrac * box.cssW;
  let runStart = 0;
  let runMul = Math.round(pressureWidthMul(pressures[0]!) * 20);
  const flushRun = (endIdx: number) => {
    // Points [runStart..endIdx] = segments [runStart..endIdx-1], all at
    // runMul. An empty run (a trailing point with no segment) is skipped.
    if (endIdx <= runStart) return;
    ctx.lineWidth = Math.max(1, base * (runMul / 20));
    ctx.beginPath();
    for (let i = runStart; i <= endIdx; i++) {
      if (i === runStart) ctx.moveTo(px[i]![0], px[i]![1]);
      else ctx.lineTo(px[i]![0], px[i]![1]);
    }
    ctx.stroke();
  };
  for (let i = 1; i < px.length; i++) {
    const mul = Math.round(pressureWidthMul(pressures[i]!) * 20);
    if (mul !== runMul) {
      flushRun(i);
      runStart = i;
      runMul = mul;
    }
  }
  flushRun(px.length - 1);
}

function paintText(ctx: Ctx, box: PaintBox, s: Extract<InkShape, { kind: "text" }>): void {
  const px = s.sizeFrac * box.cssW;
  ctx.fillStyle = INK_COLORS[s.color];
  // T-MG-INK-9: MG's text font of record — Shantell Sans, weight 500
  // (extracted from their shipped text canvas; see ./ink.ts).
  ctx.font = `${INK_TEXT_WEIGHT} ${px}px ${INK_TEXT_FONT_STACK}`;
  ctx.textBaseline = "top";
  const lines = s.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], s.x * box.cssW, s.y * box.cssH + i * px * 1.25);
  }
}

/** Backing-store sizing law (the reference's resize(), normalized): the
 * canvas bitmap is the css box at dpr ≤ 2 and the context pre-scales so
 * painters think in css px forever. Returns the dpr applied. */
export function sizeBackingStore(
  ctx: Ctx,
  canvas: { width: number; height: number },
  cssW: number,
  cssH: number,
  devicePixelRatio: number,
  dprCap = 2,
): number {
  const dpr = Math.min(devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}
