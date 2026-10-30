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
 *   stroke  { id, kind:"stroke", page, color, widthFrac, points:[[x,y],…] }
 *   text    { id, kind:"text",  page, color, sizeFrac, x, y, text }
 * - coordinates are FRACTIONS of the page box (0..1, clamped) — a stroke
 *   re-paints glued to the page content at every zoom/dpr, and a reload
 *   replays byte-faithfully regardless of the device that drew it.
 * - `widthFrac`/`sizeFrac` are fractions of the PAGE WIDTH (ink scales
 *   with the paper, like pen on paper — a 2px pen at 800px stays a 2px
 *   pen at 1600px relative to the page).
 * - shape ids are unique per creation (makeId); the id IS the merge key.
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

export type InkShape = InkStrokeShape | InkTextShape;

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

/** Defensive single-shape parse — malformed entries are dropped, not thrown. */
export function parseShape(v: unknown): InkShape | null {
  if (v === null || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 128) return null;
  const page = s.page;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 10_000) return null;
  if (!isColor(s.color)) return null;
  if (s.kind === "stroke") {
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
  return null;
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
