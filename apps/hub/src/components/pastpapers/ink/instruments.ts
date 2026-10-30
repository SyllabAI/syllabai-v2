/**
 * Maths instruments — T-MG-INK-2 run-001 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.3: "maths instruments
 * (ruler/protractor/compasses) EXPLICITLY deferred to a later surface card
 * (T-MG-INK-2) — high delight, ZERO SCHEMA IMPACT"). The MG toolbar census
 * (docs/MG-MARK-PARITY-PLAN.md §1 pass 2): Line / Ruler / Protractor /
 * Compasses alongside Draw — the four THIS module realizes over the
 * run-003 native stroke pipeline.
 *
 * THE ZERO-SCHEMA-IMPACT LAW (this module's reason to exist as written):
 * every instrument emits ORDINARY `stroke` shapes in the run-003 grammar —
 * a line is a 2-point stroke; an arc or circle is a polyline sampled along
 * the arc (ARC_STEP_DEG), the circle CLOSED by repeating its first point.
 * The instruments THEMSELVES are session-local guide chrome: never
 * persisted, never parsed from the store — a reload drops the guides and
 * replays the ink (the honest tool-versus-artifact split).
 *
 * GEOMETRY LAW: all emitted points are NORMALIZED 0..1 page fractions
 * (clamped — the paper edge clips ink, like real ink), but all DISTANCE
 * and PROJECTION math runs in css-px space with the caller's box
 * {cssW, cssH} — a naive fraction-space projection is WRONG under an
 * anisotropic page (A4 portrait: height ≠ width), so every threshold,
 * projection and radius is computed in px and converted at the boundary.
 * Angles use the SCREEN convention: x right, y DOWN, 0° = +x (east),
 * increasing CLOCKWISE (atan2(dy, dx), degrees).
 *
 * Snap bands (disclosed): RULER_BAND_PX / PROTRACTOR_BAND_PX — the pen
 * must start AND end within the band for the clean snap commit; a drag
 * that straddles the band commits the live mixed path (projected where
 * near the guide, raw elsewhere — the physically honest result of a pen
 * that leaves the edge). Snap failure never fabricates: raw strokes pass
 * through untouched (the honest-parse law at the capture side).
 */
import { clamp01 } from "./ink";

/** The instrument modes (the MG census family; "pen"/"text" stay in InkLayer). */
export type InstrumentMode = "line" | "ruler" | "protractor" | "compasses";

/** css box of the page the instrument acts on (the painter's PaintBox). */
export interface Box {
  cssW: number;
  cssH: number;
}

/** The ruler guide: a rotatable straight edge, session-local. */
export interface RulerGuide {
  page: number;
  /** Center, page fractions. */
  x: number;
  y: number;
  /** Edge direction, degrees (0 = horizontal). */
  angleDeg: number;
  /** Length as a fraction of the page width. */
  lengthFrac: number;
}

/** The protractor guide: a half-disc with a degree rim, session-local. */
export interface ProtractorGuide {
  page: number;
  /** Center (the base's midpoint), page fractions. */
  x: number;
  y: number;
  /** Base direction, degrees; the RIM spans [angleDeg+180, angleDeg+360]
   * (with y-down this bulges to the visual "up" side of the base). */
  angleDeg: number;
  /** Rim radius as a fraction of the page width. */
  radiusFrac: number;
}

// ── constants of record ──

/** Pen-near-the-edge band (css px) for the ruler snap. */
export const RULER_BAND_PX = 6;
/** Pen-near-the-rim band (css px) for the protractor snap. */
export const PROTRACTOR_BAND_PX = 8;
/** Angular sampling step for arcs/circles (degrees). */
export const ARC_STEP_DEG = 2;
/** A compasses drag under this radius (css px) commits nothing (a tap). */
export const MIN_COMMIT_RADIUS_PX = 2;

// ── angle helpers (screen convention: y down, clockwise-positive) ──

/** Normalize any degree into [0, 360). */
export function degNormalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Angle of p about c in degrees ([0,360), screen convention). */
export function angleDegFrom(
  c: { x: number; y: number },
  p: { x: number; y: number },
): number {
  return degNormalize((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI);
}

/** Signed shortest delta a0→a1 in degrees, (−180, 180]. */
export function shortestSignedDelta(a0: number, a1: number): number {
  let d = (a1 - a0) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Is `angle` inside the semicircular span [rimStart, rimStart+180]? */
export function inRimSpan(angle: number, rimStart: number): boolean {
  return degNormalize(angle - rimStart) <= 180;
}

// ── px/fraction conversion (the aspect law) ──

type Frac = { x: number; y: number };
type Px = { x: number; y: number };

function toPx(p: Frac, box: Box): Px {
  return { x: p.x * box.cssW, y: p.y * box.cssH };
}

function toFrac(p: Px, box: Box): Frac {
  return { x: clamp01(p.x / box.cssW), y: clamp01(p.y / box.cssH) };
}

function distPx(a: Px, b: Px): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── ruler geometry ──

/** The ruler's edge segment endpoints, page fractions (aspect-corrected:
 * lengthFrac measures along the direction in PX space). */
export function rulerEdgeEndpoints(
  r: RulerGuide,
  box: Box,
): { a: Frac; b: Frac } {
  const theta = (r.angleDeg * Math.PI) / 180;
  const halfPx = (r.lengthFrac * box.cssW) / 2;
  const c = toPx(r, box);
  const a = toFrac({ x: c.x - Math.cos(theta) * halfPx, y: c.y - Math.sin(theta) * halfPx }, box);
  const b = toFrac({ x: c.x + Math.cos(theta) * halfPx, y: c.y + Math.sin(theta) * halfPx }, box);
  return { a, b };
}

/** Project p onto the edge segment in PX space (the anisotropy-safe foot).
 * Returns the clamped foot, the UNCLAMPED parameter t0 (t0 outside [0,1]
 * means the pen is beyond the ruler's ends — no snap), and the distance. */
export function projectOntoRuler(
  p: Frac,
  r: RulerGuide,
  box: Box,
): { point: Frac; t0: number; distPx: number } {
  const { a, b } = rulerEdgeEndpoints(r, box);
  const P = toPx(p, box);
  const A = toPx(a, box);
  const B = toPx(b, box);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const l2 = dx * dx + dy * dy;
  const t0 = l2 > 0 ? ((P.x - A.x) * dx + (P.y - A.y) * dy) / l2 : 0;
  const t = Math.max(0, Math.min(1, t0));
  const foot = { x: A.x + t * dx, y: A.y + t * dy };
  return { point: toFrac(foot, box), t0, distPx: distPx(P, foot) };
}

/** LIVE snap for pointermove: a point near the edge is replaced by its
 * projection (null when off-band or beyond the ruler's ends). */
export function rulerLivePoint(
  p: Frac,
  r: RulerGuide,
  box: Box,
  bandPx = RULER_BAND_PX,
): Frac | null {
  const pr = projectOntoRuler(p, r, box);
  if (pr.distPx <= bandPx && pr.t0 >= 0 && pr.t0 <= 1) return pr.point;
  return null;
}

/** COMMIT snap for a finished drag: both raw endpoints near the edge AND
 * within the ruler's span → the clean straight 2-point stroke [a', b']
 * (the projections). Otherwise null — the caller commits the live path. */
export function applyRulerSnap(
  start: Frac,
  end: Frac,
  r: RulerGuide,
  box: Box,
  bandPx = RULER_BAND_PX,
): [number, number][] | null {
  const ps = projectOntoRuler(start, r, box);
  const pe = projectOntoRuler(end, r, box);
  const within =
    ps.t0 >= 0 && ps.t0 <= 1 && pe.t0 >= 0 && pe.t0 <= 1;
  if (within && ps.distPx <= bandPx && pe.distPx <= bandPx) {
    return [
      [ps.point.x, ps.point.y],
      [pe.point.x, pe.point.y],
    ];
  }
  return null;
}

/** The rotate handle sits at the edge's +θ end (endpoint b). */
export function rulerHandlePos(r: RulerGuide, box: Box): Frac {
  return rulerEdgeEndpoints(r, box).b;
}

/** Rotate the ruler so its +θ end points at the pointer (1° quantized —
 * the display precision; no snap-to-common-angles, disclosed). */
export function rulerRotateTo(r: RulerGuide, pointer: Frac, box: Box): RulerGuide {
  const deg = angleDegFrom(toPx(r, box), toPx(pointer, box));
  return { ...r, angleDeg: Math.round(deg) };
}

function createRuler(page: number, at: Frac): RulerGuide {
  return { page, x: at.x, y: at.y, angleDeg: 0, lengthFrac: 0.6 };
}

// ── protractor geometry ──

/** The rim's start angle (the rim spans [start, start+180]). */
export function protractorRimStart(pro: ProtractorGuide): number {
  return degNormalize(pro.angleDeg + 180);
}

/** The base (diameter) endpoints, page fractions. */
export function protractorBase(
  pro: ProtractorGuide,
  box: Box,
): { a: Frac; b: Frac } {
  const theta = (pro.angleDeg * Math.PI) / 180;
  const rPx = pro.radiusFrac * box.cssW;
  const c = toPx(pro, box);
  const a = toFrac({ x: c.x + Math.cos(theta) * rPx, y: c.y + Math.sin(theta) * rPx }, box);
  const b = toFrac({ x: c.x - Math.cos(theta) * rPx, y: c.y - Math.sin(theta) * rPx }, box);
  return { a, b };
}

/** Sample an arc about c (px radius) from a0→a1 degrees (signed direction
 * preserved), clamped page fractions. n steps at ARC_STEP_DEG, inclusive. */
export function sampleArc(
  c: Frac,
  rPx: number,
  a0: number,
  a1: number,
  box: Box,
  stepDeg = ARC_STEP_DEG,
): [number, number][] {
  const sweep = a1 - a0;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / stepDeg));
  const points: [number, number][] = [];
  const cPx = toPx(c, box);
  for (let i = 0; i <= n; i += 1) {
    const a = ((a0 + (sweep * i) / n) * Math.PI) / 180;
    const f = toFrac(
      { x: cPx.x + Math.cos(a) * rPx, y: cPx.y + Math.sin(a) * rPx },
      box,
    );
    points.push([f.x, f.y]);
  }
  return points;
}

/** COMMIT snap for a finished drag: both raw endpoints on the rim (radius
 * band, inside the semicircle) → the sampled rim arc from the start angle
 * to the end angle (the short way — both angles live in one semicircle)
 * plus the swept-angle readout. Otherwise null. */
export function applyProtractorSnap(
  start: Frac,
  end: Frac,
  pro: ProtractorGuide,
  box: Box,
  bandPx = PROTRACTOR_BAND_PX,
  stepDeg = ARC_STEP_DEG,
): { points: [number, number][]; sweptDeg: number } | null {
  const c = toPx(pro, box);
  const rPx = pro.radiusFrac * box.cssW;
  const as = angleDegFrom(c, toPx(start, box));
  const ae = angleDegFrom(c, toPx(end, box));
  const rs = distPx(toPx(start, box), c);
  const re = distPx(toPx(end, box), c);
  const rimStart = protractorRimStart(pro);
  const onRim =
    Math.abs(rs - rPx) <= bandPx &&
    Math.abs(re - rPx) <= bandPx &&
    inRimSpan(as, rimStart) &&
    inRimSpan(ae, rimStart);
  if (!onRim) return null;
  const d = shortestSignedDelta(as, ae);
  return { points: sampleArc(pro, rPx, as, as + d, box, stepDeg), sweptDeg: Math.abs(d) };
}

/** LIVE snap for pointermove: a point within the rim band and span is
 * forced onto the rim (angle kept, radius = rim). Null otherwise. */
export function protractorLivePoint(
  p: Frac,
  pro: ProtractorGuide,
  box: Box,
  bandPx = PROTRACTOR_BAND_PX,
): Frac | null {
  const c = toPx(pro, box);
  const P = toPx(p, box);
  const rPx = pro.radiusFrac * box.cssW;
  if (Math.abs(distPx(P, c) - rPx) > bandPx) return null;
  const a = angleDegFrom(c, P);
  if (!inRimSpan(a, protractorRimStart(pro))) return null;
  return toFrac({ x: c.x + Math.cos((a * Math.PI) / 180) * rPx, y: c.y + Math.sin((a * Math.PI) / 180) * rPx }, box);
}

/** The rotate handle sits at the base's +θ end (endpoint a). */
export function protractorHandlePos(pro: ProtractorGuide, box: Box): Frac {
  return protractorBase(pro, box).a;
}

/** Rotate the protractor so its base's +θ end points at the pointer. */
export function protractorRotateTo(
  pro: ProtractorGuide,
  pointer: Frac,
  box: Box,
): ProtractorGuide {
  const deg = angleDegFrom(toPx(pro, box), toPx(pointer, box));
  return { ...pro, angleDeg: Math.round(deg) };
}

function createProtractor(page: number, at: Frac): ProtractorGuide {
  return { page, x: at.x, y: at.y, angleDeg: 0, radiusFrac: 0.22 };
}

// ── compasses (circle) geometry ──

/** Drag radius in px → a fraction of the page width (the pen-width
 * reference dimension, disclosed). */
export function compassesRadiusFrac(
  pivot: Frac,
  current: Frac,
  box: Box,
): number {
  return distPx(toPx(pivot, box), toPx(current, box)) / box.cssW;
}

/** The committed circle: a full sampled polyline, CLOSED by repeating the
 * first point (the stroke grammar is an open polyline; the repeat closes
 * it visually — the zero-schema-impact circle). */
export function sampleCircleCompasses(
  pivot: Frac,
  radiusFrac: number,
  box: Box,
  stepDeg = ARC_STEP_DEG,
): [number, number][] {
  const rPx = radiusFrac * box.cssW;
  const open = sampleArc(pivot, rPx, 0, 360, box, stepDeg);
  const first = open[0];
  return [...open, [first[0], first[1]]];
}

/** A tap (radius under MIN_COMMIT_RADIUS_PX) commits nothing. */
export function compassesCommitable(radiusFrac: number, box: Box): boolean {
  return radiusFrac * box.cssW >= MIN_COMMIT_RADIUS_PX;
}

// ── guide factories (exported for InkLayer's creation law) ──

export function newRulerGuide(page: number, at: Frac): RulerGuide {
  return createRuler(page, at);
}

export function newProtractorGuide(page: number, at: Frac): ProtractorGuide {
  return createProtractor(page, at);
}

/** Drag translation (grab-offset preserved): center = pointer − offset. */
export function moveGuide<G extends { x: number; y: number }>(
  g: G,
  pointer: Frac,
  grabOffset: Frac,
): G {
  return {
    ...g,
    x: clamp01(pointer.x - grabOffset.x),
    y: clamp01(pointer.y - grabOffset.y),
  };
}

/** The grab offset captured at pointerdown: pointer − guide center. */
export function grabOffset(
  g: { x: number; y: number },
  pointer: Frac,
): Frac {
  return { x: pointer.x - g.x, y: pointer.y - g.y };
}
