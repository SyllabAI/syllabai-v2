/**
 * mtext-raster tests — T-MG-INK-4 run-003. The crop side of the mtext
 * law, pure half only: the crop-space geometry mapping and the SVG
 * string structure (foreignObject + the CDATA'd KaTeX css + the per-item
 * divs). The browser seams (stylesheet collection, font fetch, Image
 * decode) are honestly untested here — they only exist in the browser.
 */
import { describe, expect, test } from "bun:test";

import { INK_COLORS, type InkMathShape } from "./ink";
import { buildMtextSvg, mtextRasterItems } from "./mtext-raster";

const shape = (over: Partial<InkMathShape> = {}): InkMathShape => ({
  id: "m1",
  kind: "mtext",
  page: 1,
  color: "blue",
  sizeFrac: 0.02,
  x: 0.5,
  y: 0.3,
  tex: "x^2",
  ...(over as object),
});

const rect = { sx: 100, sy: 200, sw: 300, sh: 400 };

describe("T-MG-INK-4 run-003 — the mtext-in-crop raster (the geometry law)", () => {
  test("items map the shape into crop space (anchor − crop origin; sizeFrac × page width — the stroke scale law)", () => {
    const items = mtextRasterItems([shape()], 800, 1000, rect, (tex) => `<i>${tex}</i>`);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      leftPx: 0.5 * 800 - 100, // 300 — crop-relative anchor
      topPx: 0.3 * 1000 - 200, // 100
      sizePx: 0.02 * 800, // 16 — the bitmap scale the strokes paint at
      colorCss: INK_COLORS.blue,
      html: "<i>x^2</i>",
    });
  });

  test("the renderer is injected and called per shape, verbatim tex (the one-render-law seam)", () => {
    const seen: string[] = [];
    mtextRasterItems(
      [shape({ tex: "a" }), shape({ id: "m2", tex: "b" })],
      800,
      1000,
      rect,
      (tex) => {
        seen.push(tex);
        return `<i>${tex}</i>`;
      },
    );
    expect(seen).toEqual(["a", "b"]);
  });

  test("no mtexts → no items (the caller skips the whole path)", () => {
    expect(mtextRasterItems([], 800, 1000, rect, (t) => t)).toEqual([]);
  });
});

describe("T-MG-INK-4 run-003 — the mtext-in-crop raster (the SVG structure law)", () => {
  test("empty items → null (never an empty foreignObject)", () => {
    expect(buildMtextSvg([], 300, 400, ".katex{}")).toBeNull();
  });

  test("the SVG carries the crop size, the XHTML namespace, the CDATA'd css and every item verbatim", () => {
    const items = mtextRasterItems(
      [shape(), shape({ id: "m2", x: 0.1, y: 0.1, color: "red", tex: "\\frac{1}{2}" })],
      800,
      1000,
      rect,
      (tex) => `<i>${tex}</i>`,
    );
    const svg = buildMtextSvg(items, rect.sw, rect.sh, ".katex{color:red}");
    expect(svg).not.toBeNull();
    expect(svg!.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.sw}" height="${rect.sh}"`)).toBe(
      true,
    );
    expect(svg).toContain(`<foreignObject width="100%" height="100%">`);
    expect(svg).toContain(`<div xmlns="http://www.w3.org/1999/xhtml"`);
    expect(svg).toContain(`<style>/*<![CDATA[*/.katex{color:red}/*]]>*/</style>`);
    expect(svg).toContain(
      `left:${items[0]!.leftPx}px;top:${items[0]!.topPx}px;font-size:${items[0]!.sizePx}px;color:${INK_COLORS.blue}`,
    );
    expect(svg).toContain(`<i>x^2</i>`);
    expect(svg).toContain(`<i>\\frac{1}{2}</i>`);
    expect(svg!.endsWith("</foreignObject></svg>")).toBe(true);
  });
});
