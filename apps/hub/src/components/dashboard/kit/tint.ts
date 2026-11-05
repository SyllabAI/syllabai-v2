/**
 * Semantic tint registry — the redesign kit's ONE colour law
 * (dashboard-redesign kit, T-DASH-SKIN-1).
 *
 * Icon squares and chips are never raw hex: they resolve through the
 * semantic status tokens (globals.css :root/.dark — theme-aware, so the
 * SME emerald/amber/sky family re-skins to Quiet Green's fern/clay family
 * for free). Each tone is a wash + copy pair; the copy side follows the
 * repo's own provenance conventions (text-success on a success wash, the
 * AA-measured --accent-primary pair for the primary tone, --warn-ink on
 * warn washes per the live coreError note). Adding a tone happens HERE,
 * never inside a component.
 */
export type Tone = "primary" | "success" | "warn" | "info" | "cat" | "sim" | "muted";

export const TINTS: Record<Tone, { wash: string; ink: string }> = {
  /** the nav active-pill pair (run-004b) — pale primary wash + deepened
   *  ink, AA-measured on every theme (SME 8.3 / QG 9.1 / candy 6.4 / plum 8.9) */
  primary: { wash: "bg-accent-primary", ink: "text-accent-primary-foreground" },
  success: { wash: "bg-success/10", ink: "text-success" },
  warn: { wash: "bg-warn/10", ink: "text-warn-ink" },
  info: { wash: "bg-info/10", ink: "text-info" },
  cat: { wash: "bg-cat/10", ink: "text-cat" },
  sim: { wash: "bg-sim/10", ink: "text-sim" },
  muted: { wash: "bg-muted", ink: "text-muted-foreground" },
};
