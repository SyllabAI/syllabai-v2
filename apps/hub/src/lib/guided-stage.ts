/**
 * P0 RESTAGE rollout flag — guided-lessons redesign plan §5.1/§7
 * (operator approval 2026-11-18, "proceed with P0 Restage").
 *
 * The stage is a presentation-layer takeover: when enabled for a course,
 * GuidedLessonFlow renders the walk inside a full-height stage — document
 * chrome (sidebar, breadcrumb, lesson picker, footer links) is covered by
 * the stage surface, which carries a thin stage header (module chip,
 * progress dots, exit, read-as-page), a single 640px card column on a
 * quiet wash, 17-18px dark teaching typography and framed figures.
 *
 * Scope law: payloads, gate semantics, stage mechanics and the zero-DB
 * progress persistence are UNTOUCHED — with the flag off the flow renders
 * the pre-P0 presentation unchanged, and the no-JS/read-as-page fallback
 * in the route keeps its server-rendered layout either way.
 *
 * Rollout law (plan §7 implementation notes): one course first (chemistry),
 * reviewed on mobile, then the list widens. The allowlist is env-driven so
 * an environment can widen or roll back without a code change (values are
 * inlined at build time — changing the list requires a redeploy):
 *   NEXT_PUBLIC_GUIDED_STAGE_COURSES="igcse-chemistry-19,igcse-physics-19"
 * An empty value disables the stage everywhere (full rollback switch).
 */
const ALLOWLIST = new Set(
  (process.env.NEXT_PUBLIC_GUIDED_STAGE_COURSES ?? "igcse-chemistry-19")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** True when the given course serves the restaged guided-lesson flow. */
export function guidedStageEnabled(course: string): boolean {
  return ALLOWLIST.has(course);
}
