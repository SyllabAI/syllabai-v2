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
import { INK_COLORS, type InkShape } from "./ink";

/** The text tool's font stack (the hub's UI stack; ink is UI chrome). */
const TEXT_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
  activeStroke?: { color: string; widthFrac: number; points: Array<[number, number]> } | null,
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
    if (s.kind === "stroke") paintStroke(ctx, box, s.color, s.widthFrac, s.points);
    else if (s.kind === "text") paintText(ctx, box, s);
  }
  if (activeStroke && activeStroke.points.length >= 2) {
    paintStroke(ctx, box, activeStroke.color, activeStroke.widthFrac, activeStroke.points);
  }
}

function paintStroke(
  ctx: Ctx,
  box: PaintBox,
  color: string,
  widthFrac: number,
  points: Array<[number, number]>,
): void {
  if (points.length < 2) return;
  ctx.strokeStyle = INK_COLORS[color as keyof typeof INK_COLORS] ?? color;
  ctx.lineWidth = Math.max(1, widthFrac * box.cssW);
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const [fx, fy] = points[i];
    const x = fx * box.cssW;
    const y = fy * box.cssH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function paintText(ctx: Ctx, box: PaintBox, s: Extract<InkShape, { kind: "text" }>): void {
  const px = s.sizeFrac * box.cssW;
  ctx.fillStyle = INK_COLORS[s.color];
  ctx.font = `${px}px ${TEXT_FONT_STACK}`;
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
