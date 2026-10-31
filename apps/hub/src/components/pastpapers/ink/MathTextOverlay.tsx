"use client";

/**
 * MathTextOverlay — T-MG-INK-4. The DOM-overlay renderer for the
 * `mtext` ink kind (the MG "Math text box" census tool's parity).
 *
 * RENDER LAW: KaTeX (`renderToString`, throwOnError:false — malformed
 * tex renders the error-styled source honestly: never blank, never a
 * throw), injected as the InstrumentGuides-family chrome: a
 * pointer-events:none absolute overlay INSIDE the [data-page] holder,
 * so the ink canvas keeps owning the page gesture (the erase/select
 * hit-tests read these boxes via [data-mtext-id], they never receive
 * pointers). Position = the normalized 0..1 anchor law (left/top %),
 * font size = sizeFrac × the holder's live css width (self-measured
 * via a ResizeObserver on the holder — zoom/reflow ride for free, the
 * RegionOverlay geometry law at DOM grain).
 *
 * NOT MathLive (MG's own choice): the MG-INK-SDK-GATE bundle/licence
 * discipline stands; `katex` is already a hub dependency and the edit
 * surface is the plain LaTeX textarea (the InkLayer math draft), no
 * virtual keyboard (MG's math-field policy is `manual` too).
 *
 * CROP RASTER (T-MG-INK-4 run-003 — the run-002 disclosure discharged):
 * this overlay is still not canvas pixels, so the crop never reads it —
 * instead the crop producer (../region-mark/produce-crop) re-renders the
 * SAME renderToString output (the options below are the ONE render law,
 * two consumers) through the font-inlined foreignObject raster
 * (./mtext-raster) at the stroke bitmap scale; every raster failure
 * falls back to the raw-source plain text (honest degradation).
 */
import "katex/dist/katex.min.css";

import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";

import { INK_COLORS, type InkMathShape } from "./ink";

export function MathTextOverlay({ shape }: { shape: InkMathShape }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [holderW, setHolderW] = useState(0);

  // Self-measuring font law: the holder IS the page box; its live css
  // width × sizeFrac is the math's base font size (the `sizeFrac` law).
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!parent) return;
    const read = () => setHolderW(parent.getBoundingClientRect().width);
    const ro = new ResizeObserver(read);
    ro.observe(parent);
    read();
    return () => ro.disconnect();
  }, []);

  const html = useMemo(() => {
    try {
      return katex.renderToString(shape.tex, {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      // unreachable with throwOnError:false — the honest guard anyway
      return null;
    }
  }, [shape.tex]);

  return (
    <div
      ref={ref}
      data-mtext-id={shape.id}
      aria-hidden="true"
      className="pointer-events-none absolute z-40 max-w-full"
      style={{
        left: `${shape.x * 100}%`,
        top: `${shape.y * 100}%`,
        color: INK_COLORS[shape.color],
        fontSize: holderW > 0 ? `${shape.sizeFrac * holderW}px` : undefined,
      }}
      {...(html ? { dangerouslySetInnerHTML: { __html: html } } : {})}
    />
  );
}
