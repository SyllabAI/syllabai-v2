/**
 * RegionOverlay — the rect highlight layer over the paper viewer
 * (T-MG-MP-RECT-1 run-001; plan of record docs/MG-MARK-PARITY-PLAN.md
 * §3.1 UI bullet).
 *
 * STANDALONE by law: pdf-pane.tsx (the 2,242-line v4 monolith) is NOT
 * modified in this phase — the overlay MOUNTS ALONGSIDE it (the hosting
 * page composes `<RegionOverlay>` over the rendered page box), never
 * inside. The monolith gets touched only by its own refactor lane.
 *
 * Geometry law: rects are NORMALIZED 0..1 per page (mark_point_rects
 * serving shape) — rendered as CSS percentages over the page box, so
 * zoom/dpr scaling is the browser's problem, not ours (no pixel math, no
 * re-measure listeners; the two-phase zoom of pdf-pane stays untouched).
 *
 * Chrome law (plan §3.1): highlight-ON-DEMAND only — no always-on chrome.
 * The layer renders nothing until `visible` (or hover) asks for it; the
 * paper stays a clean paper by default.
 */
"use client";

import { useState } from "react";
import type { PaperAssetRegion, PaperAssetRegionsResponse } from "@syllabai/contracts";

interface RegionOverlayProps {
  /** The fetched regions payload (fetchPaperRegions result). */
  payload: PaperAssetRegionsResponse | null;
  /** Which rendered page this overlay instance covers (1-based). */
  page: number;
  /** Show all rects (on-demand toggle; false = hover-only). */
  visible: boolean;
  /** Region kinds to draw — parts are the marking-relevant default. */
  kinds?: Array<"question" | "part">;
}

/**
 * The overlay layer for ONE page. Position it absolutely inside the page's
 * positioning context (the element that wraps the rendered page at exactly
 * the page's box). Renders null on honest-absent payloads.
 */
export function RegionOverlay({ payload, page, visible, kinds = ["part"] }: RegionOverlayProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!payload) return null;
  const rects = payload.regions
    .filter((r) => kinds.includes(r.kind))
    .flatMap((r) => r.rects.filter((rect) => rect.page === page).map((rect) => ({ region: r, rect })));
  if (rects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {rects.map(({ region, rect }) => {
        const on = visible || hovered === region.id;
        return (
          <div
            key={`${region.id}:${rect.ordinal}`}
            className={on ? "absolute rounded-sm border-2 border-emerald-500/70 bg-emerald-400/10" : "absolute rounded-sm border border-transparent"}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
            data-region-key={region.regionKey}
            data-question-part-id={region.questionPartId ?? undefined}
            onMouseEnter={() => setHovered(region.id)}
            onMouseLeave={() => setHovered(null)}
          />
        );
      })}
    </div>
  );
}

/** Region count for the on-demand toggle label (honest zero: no chrome). */
export function regionCountForPage(payload: PaperAssetRegionsResponse | null, page: number): number {
  if (!payload) return 0;
  return payload.regions.reduce((n, r) => n + r.rects.filter((rect) => rect.page === page).length, 0);
}

export type { PaperAssetRegion };
