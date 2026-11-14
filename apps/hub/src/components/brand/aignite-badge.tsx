/**
 * T-BRAND-AIGNITE-101 — the official "Built For Ostad Presents YUNet
 * AIgnite Buildathon 2026" sticker (operator order, trace 1a1a87d5ab125801:
 * buildathon compliance — every participant displays the official sticker
 * in the navbar or another prominent area near the top of the app).
 *
 * The asset (public/aignite-2026-badge.webp) is the operator-provided
 * official sticker, web-prepped in this lane: resized to 808x240, its
 * OUTER white margin made transparent (the sticker's own rounded outline
 * and interior are untouched), and — V-6, visual audit 2026-11-13 —
 * re-encoded PNG→WebP q90: 207,513 B → 32,202 B (−84%) at display sizes
 * of h-9 (strip) / h-14–16 (hero), where the lossy delta is invisible.
 * The sticker's interior stays white ON PURPOSE: it is the official
 * sticker's own design, and a "transparent variant" would mean repainting
 * the official artwork, which compliance forbids.
 *
 * Dark-mode harmony (V-6): the component wraps the sticker in a quiet
 * plate (rounded, bg-background/70, hairline ring) so the white interior
 * reads as a deliberate chip on the dark chrome instead of a floating
 * white rectangle. On light themes the plate is invisible (white on
 * near-white). Both placements benefit; no placement changed.
 *
 * NOT lazy-loaded on purpose: the strip sits above the fold and the
 * buildathon order wants the sticker prominent — lazy would defer the
 * compliance surface (the audit's perf concern is answered by the WebP
 * swap instead).
 *
 * Rendered in exactly two places:
 *   1. the badge strip in the AppShell, directly above the navbar — the
 *      "prominent area near the top" on every non-viewer route at every
 *      width (the h-14 header row itself has no slack for a 3.4:1 badge
 *      between lg and xl, where the quick-nav joins);
 *   2. the showcase landing hero (the first screen judges open).
 *
 * TEMPORARY buildathon requirement — remove with the task: delete this
 * file, the strip block + import in app-shell.tsx, the hero block +
 * import in showcase-landing.tsx, and public/aignite-2026-badge.webp
 * (everything is tagged T-BRAND-AIGNITE-101).
 */

import { cn } from "@/lib/utils";

export const AIGNITE_BADGE_SRC = "/aignite-2026-badge.webp";
export const AIGNITE_BADGE_ALT =
  "Built for Ostad presents YUNet AIgnite Buildathon 2026 — National AI Hackathon for B2C Solutions";

export function AigniteBadge({ className }: { className?: string }) {
  return (
    // V-6 plate: sizing classes from callers (h-9 w-auto / h-14 sm:h-16) now
    // ride the plate; the sticker fills it at its own aspect ratio. No extra
    // padding — the sticker's own transparent outer margin already breathes,
    // and padding would shrink the sticker vs its pre-plate size.
    <span
      className={cn(
        "inline-flex items-center rounded-lg bg-background/70 ring-1 ring-border",
        className,
      )}
    >
      <img
        src={AIGNITE_BADGE_SRC}
        alt={AIGNITE_BADGE_ALT}
        width={808}
        height={240}
        decoding="async"
        className="h-full w-auto"
      />
    </span>
  );
}
