/**
 * Teaching Toolkit tool metadata — the SERVER-SAFE half of presets.ts.
 *
 * Extracted from presets.ts (T-TEACH-014) after the production incident the
 * tool deep-links hit on 2026-10-22 (operator trace, digest 2062581832):
 * presets.ts carries "use client", so a Server Component that CALLS
 * toolkitToolMeta() (the [tool]/page.tsx generateMetadata + body guard)
 * throws at request time — "Attempted to call toolkitToolMeta() from the
 * server but toolkitToolMeta is on the client" — and every
 * /teacher/toolkit/[tool] view crashed into the route error boundary.
 * The list page rendered fine because it never calls the function
 * server-side, which is why the crash only surfaced on the deep link.
 *
 * This module is deliberately framework-neutral pure data (no hooks, no
 * DOM, no directives): importable from both Server and Client Components.
 * presets.ts re-exports it so existing client imports are unchanged.
 */
export type ToolkitToolId = "lesson-plan" | "rubric" | "sow" | "coach";

export interface ToolkitToolMeta {
  id: ToolkitToolId;
  title: string;
  subtitle: string;
  color: string;
}

export const TOOLKIT_TOOLS: ToolkitToolMeta[] = [
  {
    id: "lesson-plan",
    title: "Lesson Plan Generator",
    subtitle: "Duration-driven plan with verbatim outcome groundings",
    color: "#E25881",
  },
  {
    id: "rubric",
    title: "Rubric Developer",
    subtitle: "Criterion × 4-level scale — scores computed from marks",
    color: "#F89900",
  },
  {
    id: "sow",
    title: "Curriculum Mapper",
    subtitle: "Multi-lesson scheme of work with differentiation",
    color: "#26B3E8",
  },
  {
    id: "coach",
    title: "Learning Coach",
    subtitle: "Clarify or challenge a passage for any audience",
    color: "#49B081",
  },
];

export const toolkitToolMeta = (id: string): ToolkitToolMeta | undefined =>
  TOOLKIT_TOOLS.find((t) => t.id === id);
