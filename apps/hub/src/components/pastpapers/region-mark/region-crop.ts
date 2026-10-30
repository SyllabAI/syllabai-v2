/**
 * Region-crop geometry — T-MG-CROPMARK-1 run-002 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.4; the client half of the crop-then-mark
 * pipeline — "the crop producer is the client's render-resolution
 * composite", contracts/paper-marking.ts).
 *
 * PURE module (the ink.ts law: no React, no DOM) — the DOM executor lives
 * in ./produce-crop. Everything the crop does to geometry is decided here
 * so the geometry is testable without a canvas:
 *
 * - rects are NORMALIZED 0..1 page-box fractions (the §3.1 serving law,
 *   RegionOverlay/ink geometry law) — the crop maps them onto the RENDERED
 *   page bitmap ("crop the region rect at render resolution", §3.4).
 * - the pane's user-rotation offset (pdf-pane pp-viewer-prefs-v1 `rot`,
 *   90° steps) rotates the VIEW against the served page-space geometry —
 *   rectToViewSpace maps page space → view space so a clicked box is where
 *   the paper shows it, and the same mapping aims the bitmap blit.
 *   Intrinsic per-page /Rotate composes INSIDE the pane's render and is
 *   not observable here — disclosed: the extraction lane's law pins rect
 *   orientation against the as-served page box (the RegionOverlay
 *   assumption this run inherits).
 * - the wire law (contracts/paper-marking.ts): imageDataUrl is an inline
 *   data:image/(png|jpeg|webp);base64 URL; the 4 MB decoded cap is
 *   api-side — the producer pre-checks the SAME cap honestly (png first;
 *   jpeg 0.92 fallback; "too_large" refuses BEFORE the POST — never a
 *   fabricated crop).
 */

export interface NormRect {
  /** 0..1 page-box fractions, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ViewRotation = 0 | 90 | 180 | 270;

/** Clamp a rect into the 0..1 band (degenerate → width/height ≥ 0). */
export function clampRect(rect: NormRect): NormRect {
  const clamp = (v: number) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
  const x = clamp(rect.x);
  const y = clamp(rect.y);
  return {
    x,
    y,
    width: Math.min(clamp(rect.width), 1 - x),
    height: Math.min(clamp(rect.height), 1 - y),
  };
}

/**
 * Page space → view space (the pane rotates the page by `rot` for
 * display). Point law for a clockwise 90° view rotation: (x, y) → (1−y, x).
 * Applied to the rect's corner span; then re-clamped.
 */
export function rectToViewSpace(rect: NormRect, rot: ViewRotation): NormRect {
  const { x, y, width: w, height: h } = clampRect(rect);
  switch (rot) {
    case 90:
      return clampRect({ x: 1 - y - h, y: x, width: h, height: w });
    case 180:
      return clampRect({ x: 1 - x - w, y: 1 - y - h, width: w, height: h });
    case 270:
      return clampRect({ x: y, y: 1 - x - w, width: h, height: w });
    default:
      return { x, y, width: w, height: h };
  }
}

/** Union bounding box (page space); null on the honest-empty input. */
export function unionRects(rects: NormRect[]): NormRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return clampRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

/**
 * The crop plan for ONE region on ONE page: the region's rects on that
 * page are mapped into view space and unioned. Null = the region has no
 * rects on the page (the honest nothing-to-crop).
 */
export function planRegionViewRect(
  rects: Array<NormRect & { page: number }>,
  page: number,
  rot: ViewRotation,
): NormRect | null {
  const onPage = rects.filter((r) => r.page === page);
  if (onPage.length === 0) return null;
  return unionRects(onPage.map((r) => rectToViewSpace(r, rot)));
}

/** The bitmap-space source rect for the blit (render resolution). */
export interface CropPlan {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Map a view-space rect onto the rendered page bitmap (its own pixel
 * truth: the pane paints viewport(scale·dpr)). Degenerate (no pixel
 * area) → null — never a zero-byte crop.
 */
export function planCrop(
  viewRect: NormRect,
  bitmap: { width: number; height: number },
): CropPlan | null {
  if (!(bitmap.width >= 1 && bitmap.height >= 1)) return null;
  const sx = Math.floor(viewRect.x * bitmap.width);
  const sy = Math.floor(viewRect.y * bitmap.height);
  const sw = Math.round(viewRect.width * bitmap.width);
  const sh = Math.round(viewRect.height * bitmap.height);
  if (sw < 1 || sh < 1) return null;
  return { sx, sy, sw, sh };
}

/**
 * The decoded-byte estimate of a data URL: the base64 payload is
 * ⌊chars·3/4⌋ bytes (the data: prefix and mime header carry no payload).
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

/** The run-001 api cap (the decoded 4 MB — contracts/paper-marking.ts). */
export const PAPER_MARK_BYTE_CAP = 4 * 1024 * 1024;

export type ImageDataUrlChoice =
  | { dataUrl: string; mime: "image/png" | "image/jpeg"; bytes: number }
  | "too_large";

/**
 * The wire choice of record: PNG first (lossless — handwriting on a paper
 * crop compresses well); over cap → JPEG 0.92; still over → "too_large"
 * (the producer refuses BEFORE the POST — the api would 413 it anyway).
 * The jpeg closure is LAZY: never invoked when the png fits.
 */
export function chooseImageDataUrl(
  toPng: () => string,
  toJpeg: () => string,
  capBytes: number = PAPER_MARK_BYTE_CAP,
): ImageDataUrlChoice {
  const png = toPng();
  if (estimateDataUrlBytes(png) <= capBytes) {
    return { dataUrl: png, mime: "image/png", bytes: estimateDataUrlBytes(png) };
  }
  const jpeg = toJpeg();
  const bytes = estimateDataUrlBytes(jpeg);
  if (bytes <= capBytes) return { dataUrl: jpeg, mime: "image/jpeg", bytes };
  return "too_large";
}

/** The pane's persisted viewer prefs (read-only; pdf-pane owns writes). */
export interface ViewerPrefs {
  rot: ViewRotation;
}

const PREFS_KEY = "pp-viewer-prefs-v1";

/**
 * Read the pane's user-rotation offset from localStorage (the pane's own
 * pp-viewer-prefs-v1 record, validated against its law: rot ∈ {0,90,180,270}
 * else 0). Storage disabled / corrupt → the default view. Read at click
 * time (event grain — never a listener).
 */
export function readViewerRotation(storage?: Storage | null): ViewRotation {
  try {
    const s = storage ?? window.localStorage;
    const raw = s.getItem(PREFS_KEY);
    if (!raw) return 0;
    const p = JSON.parse(raw) as Partial<ViewerPrefs>;
    return p.rot === 90 || p.rot === 180 || p.rot === 270 ? p.rot : 0;
  } catch {
    return 0;
  }
}
