/**
 * Ink grammar + geometry — T-MG-INK-1 run-003 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.3; verdict record
 * docs/MG-INK-SDK-GATE.md, verdict: native canvas ink on pdf-pane v4).
 *
 * PURE module (no React, no DOM): the shape grammar of record for the
 * {schema:"syllabai-ink/1", shapes[]} container (run-002's persistence
 * pin — "the elements are opaque at this grain; run-003's stroke pipeline
 * owns their inner schema"), the normalized-0..1 geometry law
 * (RegionOverlay law carried to ink: zoom/dpr scaling is the browser's
 * problem, not ours — no pixel math survives a reload), and the 409
 * re-apply law (run-002 revision doc: "the client re-reads and
 * re-applies") as a pure set-union merge.
 *
 * GRAMMAR OF RECORD (this run's disclosure):
 *   stroke    { id, kind:"stroke",    page, color, widthFrac, points:[[x,y],…] }
 *   text      { id, kind:"text",      page, color, sizeFrac, x, y, text }
 *   mtext     { id, kind:"mtext",     page, color, sizeFrac, x, y, tex }   (T-MG-INK-4)
 *   tombstone { id, kind:"tombstone", page }                               (T-MG-INK-4)
 * - coordinates are FRACTIONS of the page box (0..1, clamped) — a stroke
 *   re-paints glued to the page content at every zoom/dpr, and a reload
 *   replays byte-faithfully regardless of the device that drew it.
 * - `widthFrac`/`sizeFrac` are fractions of the PAGE WIDTH (ink scales
 *   with the paper, like pen on paper — a 2px pen at 800px stays a 2px
 *   pen at 1600px relative to the page).
 * - shape ids are unique per creation (makeId); the id IS the merge key.
 * - T-MG-INK-4 container law: the two new kinds ride the SAME
 *   syllabai-ink/1 container (the server contract validates the container
 *   only — the elements are opaque on the wire), and the honest-parse
 *   boundary below IS the forward/backward compat law: an OLD client
 *   drops mtext/tombstone at parse (never a throw, never a fabrication);
 *   a bump of the container id is FORBIDDEN (old clients would drop the
 *   whole doc).
 * - T-MG-INK-4 tombstone law (deletion is finally REPRESENTABLE):
 *   erasing a shape commits a tombstone that REUSES the target's id —
 *   the rebaseShapes union-by-id law (local-wins on id collision) then
 *   makes erasure survive every 409 rebase and migration upload with
 *   zero merge-law changes; an old client drops the tombstone and its
 *   full-doc PUT persists the deletion (pass-through-safe); undo
 *   restores the pre-erase snapshot verbatim (resurrection by explicit
 *   undo is correct); Clear all stays set-replacement (the revision
 *   law's single-writer asymmetry is disclosed, not changed).
 * - malformed shapes from the jsonb store are DROPPED at the boundary
 *   (the honest-parse law — never a fabricated shape, never a throw).
 */

/** The container schema id of record (run-001 native-ref container law). */
export const INK_DOC_SCHEMA_ID = "syllabai-ink/1";

/** The palette of record (the run-001 spike's native palette, verbatim). */
export const INK_COLORS = {
  black: "#1a1a1a",
  red: "#d13438",
  blue: "#0f6cbd",
  green: "#107c10",
} as const;
export type InkColor = keyof typeof INK_COLORS;
export const INK_COLOR_KEYS = Object.keys(INK_COLORS) as InkColor[];

/** Pen sizes as fractions of the page width (fine / medium / broad). */
export const INK_WIDTH_FRACS = [0.0022, 0.0038, 0.006] as const;

export interface InkStrokeShape {
  id: string;
  kind: "stroke";
  /** 1-based page number the shape belongs to. */
  page: number;
  color: InkColor;
  /** Pen width as a fraction of the page width. */
  widthFrac: number;
  /** Normalized 0..1 [x,y] points (page-box fractions, clamped). */
  points: Array<[number, number]>;
}

export interface InkTextShape {
  id: string;
  kind: "text";
  page: number;
  color: InkColor;
  /** Font size as a fraction of the page width. */
  sizeFrac: number;
  /** Normalized 0..1 anchor (the text's top-left, clamped). */
  x: number;
  y: number;
  text: string;
}

/** T-MG-INK-4 — the math text box (the MG census tool of the same name):
 * KaTeX source rendered as a DOM overlay (./MathTextOverlay), NOT canvas
 * pixels — the same normalized anchor/size laws as `text`. */
export interface InkMathShape {
  id: string;
  kind: "mtext";
  page: number;
  color: InkColor;
  /** Base font size as a fraction of the page width. */
  sizeFrac: number;
  /** Normalized 0..1 anchor (the box's top-left, clamped). */
  x: number;
  y: number;
  /** KaTeX source (1..1000 chars at parse). */
  tex: string;
}

/** T-MG-INK-4 — the deletion marker: it carries NO geometry and REUSES
 * the erased target's id (the id IS the merge key, so the tombstone wins
 * every union-by-id rebase against the shape it erased). It never needs
 * a color — the parse law below must not demand one. */
export interface InkTombstoneShape {
  id: string;
  kind: "tombstone";
  page: number;
}

export type InkShape = InkStrokeShape | InkTextShape | InkMathShape | InkTombstoneShape;

/** The persistence container (the run-002 contracts inkDocSchema shape). */
export interface InkDoc {
  schema: typeof INK_DOC_SCHEMA_ID;
  shapes: InkShape[];
}

let idCounter = 0;
export function makeShapeId(): string {
  idCounter += 1;
  return `shape:${Date.now().toString(36)}:${idCounter.toString(36)}`;
}

export function emptyDoc(): InkDoc {
  return { schema: INK_DOC_SCHEMA_ID, shapes: [] };
}

/** Clamp a value into the 0..1 normalized band (NaN → 0). */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Map a client-space point onto the page-box fractions (the capture-side
 * half of the normalized law — the render-side half lives in the canvas
 * painter: frac × cssSize × dpr).
 */
export function normalizePoint(
  box: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): [number, number] {
  if (box.width <= 0 || box.height <= 0) return [0, 0];
  return [clamp01((clientX - box.left) / box.width), clamp01((clientY - box.top) / box.height)];
}

function isColor(v: unknown): v is InkColor {
  return typeof v === "string" && v in INK_COLORS;
}

/**
 * Defensive single-shape parse — malformed entries are dropped, not thrown.
 *
 * T-MG-INK-4: the dispatch is KIND-FIRST (the color pre-check moved inside
 * the kinds that need one) so the tombstone needs no color; the stroke and
 * text branches keep their exact accept/reject behavior (pinned).
 * UNKNOWN kinds — including mtext/tombstone read by an old build — fall
 * to the honest drop at the end: never a throw, never a fabrication.
 */
export function parseShape(v: unknown): InkShape | null {
  if (v === null || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 128) return null;
  const page = s.page;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 10_000) return null;
  if (s.kind === "stroke") {
    if (!isColor(s.color)) return null;
    if (typeof s.widthFrac !== "number" || !Number.isFinite(s.widthFrac) || s.widthFrac <= 0 || s.widthFrac > 0.05)
      return null;
    if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > 20_000) return null;
    const points: Array<[number, number]> = [];
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const [x, y] = p as unknown[];
      if (typeof x !== "number" || typeof y !== "number") return null;
      points.push([clamp01(x), clamp01(y)]);
    }
    return { id: s.id, kind: "stroke", page, color: s.color, widthFrac: s.widthFrac, points };
  }
  if (s.kind === "text") {
    if (!isColor(s.color)) return null;
    if (typeof s.sizeFrac !== "number" || !Number.isFinite(s.sizeFrac) || s.sizeFrac <= 0 || s.sizeFrac > 0.2)
      return null;
    if (typeof s.x !== "number" || typeof s.y !== "number") return null;
    if (typeof s.text !== "string" || s.text.length === 0 || s.text.length > 2000) return null;
    return {
      id: s.id,
      kind: "text",
      page,
      color: s.color,
      sizeFrac: s.sizeFrac,
      x: clamp01(s.x),
      y: clamp01(s.y),
      text: s.text,
    };
  }
  if (s.kind === "mtext") {
    if (!isColor(s.color)) return null;
    if (typeof s.sizeFrac !== "number" || !Number.isFinite(s.sizeFrac) || s.sizeFrac <= 0 || s.sizeFrac > 0.2)
      return null;
    if (typeof s.x !== "number" || typeof s.y !== "number") return null;
    if (typeof s.tex !== "string" || s.tex.length === 0 || s.tex.length > 1000) return null;
    return {
      id: s.id,
      kind: "mtext",
      page,
      color: s.color,
      sizeFrac: s.sizeFrac,
      x: clamp01(s.x),
      y: clamp01(s.y),
      tex: s.tex,
    };
  }
  if (s.kind === "tombstone") {
    // no color, no geometry — the id (already validated) IS the deletion
    return { id: s.id, kind: "tombstone", page };
  }
  return null;
}

/** Build the deletion marker for a target (the tombstone law: the
 * tombstone REUSES the target's id and page — nothing else). */
export function makeTombstone(target: Pick<InkShape, "id" | "page">): InkTombstoneShape {
  return { id: target.id, kind: "tombstone", page: target.page };
}

/** Erase by id: every target becomes its tombstone IN PLACE (stable
 * order, no duplicates in the working set — the doc never carries a
 * shape and its tombstone side by side). Unknown ids are ignored.
 * The erase commit is one set-replacement snapshot → one undo step. */
export function eraseShapes(shapes: InkShape[], ids: ReadonlySet<string>): InkShape[] {
  if (ids.size === 0) return shapes;
  return shapes.map((s) => (ids.has(s.id) ? makeTombstone(s) : s));
}

/**
 * Translate a shape by normalized deltas (the move law: css-px intent
 * converted per-axis by the caller — the aspect law), clamped into the
 * page box. A tombstone is not movable (null). All other kinds move
 * their geometry: stroke points, text/mtext anchors.
 */
export function translateShape(shape: InkShape, dx: number, dy: number): InkShape | null {
  if (shape.kind === "tombstone") return null;
  if (shape.kind === "stroke") {
    return {
      ...shape,
      points: shape.points.map(([x, y]) => [clamp01(x + dx), clamp01(y + dy)] as [number, number]),
    };
  }
  return { ...shape, x: clamp01(shape.x + dx), y: clamp01(shape.y + dy) };
}

export interface CssBox {
  cssW: number;
  cssH: number;
}

/** A measured content size in css px (the DOM-measured mtext box; the
 * pure module never reads the DOM — the component measures and passes). */
export interface MeasuredSize {
  w: number;
  h: number;
}

/**
 * A shape's hit bounds in css px within the page box — a DISCLOSED hit
 * ESTIMATE for text (chars × 0.6 em; rendering stays canvas truth) and
 * the DOM-measured truth for mtext (`measured`). Strokes hit by their
 * path; tombstones are never hittable (they are deletions, not ink).
 */
export function shapeBoundsCss(
  shape: InkShape,
  box: CssBox,
  measured?: MeasuredSize,
): { x: number; y: number; w: number; h: number } | null {
  if (shape.kind === "tombstone") return null;
  if (shape.kind === "stroke") {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of shape.points) {
      const x = px * box.cssW;
      const y = py * box.cssH;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pen = shape.widthFrac * box.cssW;
    return { x: minX - pen / 2, y: minY - pen / 2, w: Math.max(0, maxX - minX + pen), h: Math.max(0, maxY - minY + pen) };
  }
  const fontSize = shape.sizeFrac * box.cssW;
  if (shape.kind === "text") {
    const lines = shape.text.split("\n");
    const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
    return {
      x: shape.x * box.cssW,
      y: shape.y * box.cssH,
      w: longest * 0.6 * fontSize,
      h: lines.length * 1.25 * fontSize,
    };
  }
  const m = measured ?? { w: longestTexEstimate(shape.tex) * 0.6 * fontSize, h: 1.6 * fontSize };
  return { x: shape.x * box.cssW, y: shape.y * box.cssH, w: m.w, h: m.h };
}

/** The coarse mtext fallback (no DOM in the pure module): source length
 * as a width estimate — the component passes the measured truth. */
function longestTexEstimate(tex: string): number {
  return tex.split("\n").reduce((n, l) => Math.max(n, l.length), 0);
}

/** Point-to-segment distance in css px (the stroke hit law). */
export function pointSegmentDistCss(
  p: { x: number; y: number },
  a: [number, number],
  b: [number, number],
  box: CssBox,
): number {
  const ax = a[0] * box.cssW, ay = a[1] * box.cssH;
  const bx = b[0] * box.cssW, by = b[1] * box.cssH;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - ax) * dx + (p.y - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

/** The hit-test law of record: strokes hit within `tolCssPx` of their
 * path (at least the pen width — a fat pen is its own tolerance); text
 * and mtext hit inside their bounds inflated 4 css px; tombstones never
 * hit. `frac` is the normalized point; `tolCssPx` is dpr-independent. */
export function shapeHitTest(
  shape: InkShape,
  frac: { x: number; y: number },
  box: CssBox,
  tolCssPx: number,
  measured?: MeasuredSize,
): boolean {
  if (shape.kind === "tombstone") return false;
  const p = { x: frac.x * box.cssW, y: frac.y * box.cssH };
  if (shape.kind === "stroke") {
    const hit = Math.max(tolCssPx, shape.widthFrac * box.cssW);
    for (let i = 1; i < shape.points.length; i++) {
      if (pointSegmentDistCss(p, shape.points[i - 1]!, shape.points[i]!, box) <= hit) return true;
    }
    return false;
  }
  const b = shapeBoundsCss(shape, box, measured);
  if (!b) return false;
  const inflate = 4;
  return (
    p.x >= b.x - inflate &&
    p.x <= b.x + b.w + inflate &&
    p.y >= b.y - inflate &&
    p.y <= b.y + b.h + inflate
  );
}

/** Every hittable shape id under the point (the erase sweep's read).
 * Array order = doc order; the LAST hit is the topmost (the select
 * law's tie-break). */
export function shapesHitIds(
  shapes: InkShape[],
  frac: { x: number; y: number },
  box: CssBox,
  tolCssPx: number,
  measured?: (id: string) => MeasuredSize | undefined,
): string[] {
  const hits: string[] = [];
  for (const s of shapes) {
    if (shapeHitTest(s, frac, box, tolCssPx, measured?.(s.id))) hits.push(s.id);
  }
  return hits;
}

/** Parse a stored/loaded doc container — honest: unknown shapes dropped. */
export function parseDoc(v: unknown): InkDoc | null {
  if (v === null || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (d.schema !== INK_DOC_SCHEMA_ID) return null;
  if (!Array.isArray(d.shapes)) return null;
  const shapes: InkShape[] = [];
  for (const raw of d.shapes) {
    const shape = parseShape(raw);
    if (shape) shapes.push(shape);
  }
  return { schema: INK_DOC_SCHEMA_ID, shapes };
}

/** Pack the working set into the persistence container. */
export function packDoc(shapes: InkShape[]): InkDoc {
  return { schema: INK_DOC_SCHEMA_ID, shapes };
}

/**
 * The 409 re-apply law (run-002: "the client re-reads and re-applies"):
 * union the STORED shapes with the LOCAL pending set, keyed by shape id —
 * stored first (stable order), local additions appended, id collisions
 * resolved local-wins (the local edit is the newer intent). An undo/clear
 * that the other writer's row still contains lets that shape return on
 * rebase — full-doc LWW at the next PUT is the law of record; the rebase
 * exists only so a stale base never CLOBBERS the other writer's shapes.
 */
export function rebaseShapes(stored: InkShape[], local: InkShape[]): InkShape[] {
  const byId = new Map<string, InkShape>();
  for (const s of stored) byId.set(s.id, s);
  for (const s of local) byId.set(s.id, s);
  return [...byId.values()];
}

/** Point coalescing: skip moves closer than `minPx` to the last point. */
export function shouldAppendPoint(
  last: [number, number],
  next: [number, number],
  minPx: number,
): boolean {
  const dx = next[0] - last[0];
  const dy = next[1] - last[1];
  return Math.hypot(dx, dy) >= minPx;
}
