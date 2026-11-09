/**
 * T-BRAND-AIGNITE-101 — the official "Built For Ostad Presents YUNet
 * AIgnite Buildathon 2026" sticker (operator order, trace 1a1a87d5ab125801:
 * buildathon compliance — every participant displays the official sticker
 * in the navbar or another prominent area near the top of the app).
 *
 * The asset (public/aignite-2026-badge.png) is the operator-provided
 * official sticker, web-prepped in this lane: resized to 808x240 and its
 * OUTER white margin made transparent (the sticker's own rounded outline
 * and interior are untouched) so it sits clean on light and dark themes.
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
 * import in showcase-landing.tsx, and public/aignite-2026-badge.png
 * (everything is tagged T-BRAND-AIGNITE-101).
 */

export const AIGNITE_BADGE_SRC = "/aignite-2026-badge.png";
export const AIGNITE_BADGE_ALT =
  "Built for Ostad presents YUNet AIgnite Buildathon 2026 — National AI Hackathon for B2C Solutions";

export function AigniteBadge({ className }: { className?: string }) {
  return (
    <img
      src={AIGNITE_BADGE_SRC}
      alt={AIGNITE_BADGE_ALT}
      width={808}
      height={240}
      decoding="async"
      className={className}
    />
  );
}
