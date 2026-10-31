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
 *
 * T-MG-INK-4 run-003: the producer is ASYNC now — the mtext kind joins
 * the crop via the font-inlined foreignObject raster (./ink/mtext-raster,
 * the spec's named card), drawn AFTER the sync ink pass at the same
 * bitmap-scale law. Every raster failure degrades to the plain-text
 * rendering of the RAW KaTeX source (honest, never silent, never a
 * throw) — the crop still shows what the learner wrote.
 */
import { INK_COLORS, type InkMathShape, type InkShape } from "../ink/ink";
import {
  buildMtextSvg,
  katexFontCss,
  mtextRasterItems,
  renderTexHtml,
  svgToImage,
} from "../ink/mtext-raster";
import { paintShapes } from "../ink/paint";
import {
  chooseImageDataUrl,
  planCrop,
  type NormRect,
  PAPER_MARK_BYTE_CAP,
} from "./region-crop";

/** The fallback brush's font (a monospace stack reads as SOURCE — the
 * degraded path renders the raw KaTeX text, never a fabricated render). */
const MTEXT_FALLBACK_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

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

export async function produceRegionCrop(input: ProduceCropInput): Promise<ProduceCropResult> {
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

  // (3) T-MG-INK-4 run-003: the mtext kind joins the crop — the SAME
  // KaTeX html the DOM overlay renders, rasterized through the
  // font-inlined foreignObject path at the bitmap scale the strokes
  // paint at (sizeFrac × page-bitmap width). Any failure in the chain
  // (no KaTeX css, a font fetch failure, a decode failure) falls back
  // to the plain-text rendering of the RAW source — honest degradation.
  const mtexts = pageShapes.filter((s): s is InkMathShape => s.kind === "mtext");
  if (mtexts.length > 0) {
    let rastered = false;
    const fontCss = await katexFontCss();
    if (fontCss) {
      const items = mtextRasterItems(
        mtexts,
        pageCanvas.width,
        pageCanvas.height,
        plan,
        renderTexHtml,
      ).filter((it) => it.html.length > 0);
      const svg = buildMtextSvg(items, plan.sw, plan.sh, fontCss);
      const img = svg ? await svgToImage(svg) : null;
      if (img) {
        ctx.drawImage(img, 0, 0, plan.sw, plan.sh);
        rastered = true;
      }
    }
    if (!rastered) {
      ctx.textBaseline = "top";
      for (const s of mtexts) {
        const sizePx = s.sizeFrac * pageCanvas.width;
        ctx.font = `${sizePx}px ${MTEXT_FALLBACK_FONT}`;
        ctx.fillStyle = INK_COLORS[s.color];
        const x = s.x * pageCanvas.width - plan.sx;
        const y = s.y * pageCanvas.height - plan.sy;
        const lines = s.tex.split("\n");
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i]!, x, y + i * sizePx * 1.25);
        }
      }
    }
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