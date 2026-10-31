/**
 * mtext-raster — T-MG-INK-4 run-003. The crop side of the mtext law: the
 * region-crop marking bitmap (T-MG-CROPMARK-1) now carries the learner's
 * math text boxes, closing the run-002 disclosed blindspot.
 *
 * PATH OF RECORD (the spec's named candidate): the mtext shapes rasterize
 * through an SVG `<foreignObject>` carrying the SAME KaTeX HTML the DOM
 * overlay renders (MathTextOverlay's exact renderToString options), drawn
 * onto the crop canvas via a data-URI `Image`. SVG-as-image loads NO
 * external resources, so the KaTeX stylesheet — its @font-face rules and
 * their font files — is COLLECTED from the document's own stylesheets and
 * INLINED as data URIs (the "font-inlined foreignObject" card, verbatim;
 * fetched once per session and cached).
 *
 * HONESTY LAW: every failure in the raster chain (no KaTeX css found, a
 * font fetch failure, a decode failure) degrades to the plain-text
 * rendering of the RAW KaTeX source — never silence, never a throw. The
 * caller (./region-mark/produce-crop) owns the fallback brush.
 *
 * PURITY SPLIT: `mtextRasterItems` and `buildMtextSvg` are PURE and
 * test-pinned (geometry mapping + SVG string structure, the renderer
 * injected); the DOM/network seams (`collectKatexCssText`,
 * `katexFontCss`, `svgToImage`, `renderTexHtml`) are the thin browser
 * half — exercised only in the browser, honestly untested here.
 */
import katex from "katex";

import { INK_COLORS, type InkMathShape } from "./ink";

/** One mtext's crop-space raster item (crop-relative px). */
export interface MtextRasterItem {
  /** Crop-space x of the shape anchor (the 0..1 anchor × page width − sx). */
  leftPx: number;
  /** Crop-space y of the shape anchor. */
  topPx: number;
  /** Font size in px — the sizeFrac × PAGE-width law (bitmap px here: the
   * crop paints at the page canvas's bitmap resolution, the same scale the
   * strokes paint at — one scale law for the whole ink composite). */
  sizePx: number;
  /** The resolved ink colour (the INK_COLORS palette value). */
  colorCss: string;
  /** The KaTeX HTML (the overlay's own render output). */
  html: string;
}

/** The crop window in the page's bitmap space (region-crop.ts CropPlan's
 * geometry subset — structurally identical, kept structural so the pure
 * module never imports the browser-side crop planner). */
export interface RasterRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * PURE — map a page's mtext shapes onto crop-space raster items. The
 * renderer is injected (the MeasuredSize seam discipline: the pure module
 * never calls into KaTeX itself, so tests pin the geometry with a stub).
 * Items are NOT window-filtered: the foreignObject clips honestly at the
 * crop edge (a formula anchored left of the window still shows its tail).
 */
export function mtextRasterItems(
  mtexts: InkMathShape[],
  pageW: number,
  pageH: number,
  rect: RasterRect,
  renderTex: (tex: string) => string,
): MtextRasterItem[] {
  return mtexts.map((s) => ({
    leftPx: s.x * pageW - rect.sx,
    topPx: s.y * pageH - rect.sy,
    sizePx: s.sizeFrac * pageW,
    colorCss: INK_COLORS[s.color],
    html: renderTex(s.tex),
  }));
}

/**
 * PURE — build the foreignObject SVG for one crop. `css` is the KaTeX
 * stylesheet text (fonts already inlined as data URIs by the caller).
 * Returns null for an empty item set (the caller skips the whole path).
 * The CDATA wrapper keeps the CSS XML-safe inside the SVG document; the
 * XHTML namespace on the wrapper div is what makes the subtree render as
 * HTML inside foreignObject.
 */
export function buildMtextSvg(
  items: MtextRasterItem[],
  w: number,
  h: number,
  css: string,
): string | null {
  if (items.length === 0) return null;
  const body = items
    .map(
      (it) =>
        `<div style="position:absolute;left:${it.leftPx}px;top:${it.topPx}px;` +
        `font-size:${it.sizePx}px;color:${it.colorCss}">${it.html}</div>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" ` +
    `style="position:relative;width:100%;height:100%;overflow:hidden">` +
    `<style>/*<![CDATA[*/${css}/*]]>*/</style>` +
    body +
    `</div></foreignObject></svg>`
  );
}

/** The browser seam — the real renderer (the overlay's exact options:
 * throwOnError:false, displayMode:false, output:"html" — one render law
 * on both sides of the crop). */
export function renderTexHtml(tex: string): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: false,
      output: "html",
    });
  } catch {
    // unreachable with throwOnError:false — the honest guard anyway
    return "";
  }
}

/** Walk the document's stylesheets and keep every KaTeX rule (the
 * `.katex`* selectors AND the `KaTeX_*` @font-face families). Cross-origin
 * sheets throw on cssRules — skipped honestly (the bundled KaTeX css is
 * same-origin in every deploy posture). */
function collectKatexCssText(): string {
  let out = "";
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = rule.cssText;
      if (/katex/i.test(text)) out += `${text}\n`;
    }
  }
  return out;
}

/** Fetch one font URL and return it as a data URI (null on any failure —
 * the face degrades to the browser's fallback, the crop still renders). */
async function fontDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(new URL(url, document.baseURI).href);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g;

/** Inline every `url(...)` (the woff2 font files) as data URIs. A failed
 * fetch keeps the original url() — unavailable inside SVG-as-image, so
 * that face falls back (disclosed degradation, never a throw). */
async function inlineFontUrls(css: string): Promise<string> {
  const urls = [...new Set([...css.matchAll(URL_PATTERN)].map((m) => m[2]!))];
  const map = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const data = await fontDataUri(u);
      if (data) map.set(u, data);
    }),
  );
  return css.replace(URL_PATTERN, (match, _q, u: string) => map.get(u) ?? match);
}

let fontCssPromise: Promise<string | null> | null = null;

/** The session-cached KaTeX css with fonts inlined (collected from the
 * document the overlay itself styled — one collection + one font fetch
 * set per page load, ~hundreds of KB, only when a crop actually carries
 * mtext). Null when the document carries no KaTeX css at all. */
export function katexFontCss(): Promise<string | null> {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      const css = collectKatexCssText();
      if (!css) return null;
      return inlineFontUrls(css);
    })().catch(() => null);
  }
  return fontCssPromise;
}

/** SVG string → decoded Image (null on any failure — the caller's honest
 * fallback path). The data-URI source never taints the crop canvas. */
export function svgToImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
