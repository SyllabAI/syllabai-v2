/**
 * The crop producer's DOM executor — T-MG-CROPMARK-1 run-002 (the client
 * composite of record: "the client's render-resolution composite",
 * contracts/paper-marking.ts; the run-003 consequence pointer — "the ink
 * layer as the region-ink source" — realized: the learner's CURRENT ink
 * working set is painted into the crop, clipped to the region rect).
 *
 * The PURE sibling ./region-crop decides ALL geometry; this module is the thin
 * DOM hand: find the pane's rendered page canvas, blit the crop at bitmap
 * resolution, paint the live ink on top (paint.ts, the SAME rendering path
 * the ink canvas uses — one stroke grammar, zero drift), export the wire
 * data URL under the 4 MB law (png → jpeg 0.92 → honest too_large).
 *
 * Coupling law: the ONLY pane surface touched is the [data-page] holder
 * (the InkLayer law) and its FIRST canvas (pdf-pane paints exactly one
 * canvas per holder; the ink canvas carries the pp-inkLayer class and is
 * excluded by name). pdf-pane stays byte-untouched (the monolith freeze).
 * Rotation: the caller supplies the pane's user-rot offset (read at click
 * time via readViewerRotation — event grain, never a listener).
 */
import type { InkShape } from "../ink/ink";
import { paintShapes } from "../ink/paint";
import {
  chooseImageDataUrl,
  planCrop,
  type NormRect,
  PAPER_MARK_BYTE_CAP,
} from "./region-crop";

export interface ProduceCropInput {
  /** The viewer host subtree that contains the [data-page] holders. */
  host: HTMLElement;
  /** The 1-based page the crop covers. */
  page: number;
  /** The view-space rect (planRegionViewRect's product). */
  viewRect: NormRect;
  /** The live ink working set (readLiveInk) — painted, then clipped. */
  shapes: InkShape[];
  capBytes?: number;
}

export type ProduceCropResult =
  | { ok: true; dataUrl: string; mime: "image/png" | "image/jpeg"; bytes: number }
  | {
      ok: false;
      reason:
        | "holder_missing"
        | "page_not_rendered"
        | "degenerate_crop"
        | "canvas_unavailable"
        | "export_blocked"
        | "too_large";
    };

/** The pane's page canvas (the holder's first and only non-ink canvas). */
export function findPageCanvas(holder: HTMLElement): HTMLCanvasElement | null {
  const candidates = holder.querySelectorAll<HTMLCanvasElement>("canvas");
  for (const c of candidates) {
    if (!c.classList.contains("pp-inkLayer")) return c;
  }
  return null;
}

export function produceRegionCrop(input: ProduceCropInput): ProduceCropResult {
  const capBytes = input.capBytes ?? PAPER_MARK_BYTE_CAP;
  const holder = input.host.querySelector<HTMLElement>(`[data-page="${input.page}"]`);
  if (!holder) return { ok: false, reason: "holder_missing" };
  const pageCanvas = findPageCanvas(holder);
  if (!pageCanvas) return { ok: false, reason: "page_not_rendered" };
  if (pageCanvas.width < 1 || pageCanvas.height < 1) {
    return { ok: false, reason: "page_not_rendered" };
  }
  const plan = planCrop(input.viewRect, { width: pageCanvas.width, height: pageCanvas.height });
  if (!plan) return { ok: false, reason: "degenerate_crop" };

  const out = document.createElement("canvas");
  out.width = plan.sw;
  out.height = plan.sh;
  const ctx = out.getContext("2d");
  if (!ctx) return { ok: false, reason: "canvas_unavailable" };

  // (1) the paper itself — 1:1 blit at the pane's render resolution.
  ctx.drawImage(pageCanvas, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.sw, plan.sh);

  // (2) the learner's ink for this page — painted in FULL-page bitmap
  // space and translated so the crop window shows it; the crop bounds
  // clip strokes that leave the region (the crop-then-mark law: the crop
  // is the region). clear:false — the paper bitmap stays underneath.
  const pageShapes = input.shapes.filter((s) => s.page === input.page);
  if (pageShapes.length > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, -plan.sx, -plan.sy);
    paintShapes(
      ctx,
      { cssW: pageCanvas.width, cssH: pageCanvas.height },
      pageShapes,
      null,
      { clear: false },
    );
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  try {
    const choice = chooseImageDataUrl(
      () => out.toDataURL("image/png"),
      () => out.toDataURL("image/jpeg", 0.92),
      capBytes,
    );
    if (choice === "too_large") return { ok: false, reason: "too_large" };
    return { ok: true, dataUrl: choice.dataUrl, mime: choice.mime, bytes: choice.bytes };
  } catch {
    // A tainted canvas (cross-origin taint) cannot export — honest refusal.
    return { ok: false, reason: "export_blocked" };
  }
}