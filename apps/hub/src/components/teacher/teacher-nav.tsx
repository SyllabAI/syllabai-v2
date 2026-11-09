"use client";

/**
 * RETIRED — the ten-tab strip (dashboard-redesign kit, T-TEACH-SHELL-1).
 *
 * The strip (teacher-console tranche, 2026-09-28) carried ten equal-weight
 * tabs in one horizontally-scrolling row on every teacher surface, mixing
 * daily workspace, live-data reads, corpus-local tools and the demo lens,
 * and needed a scroll-affordance subsystem (P3-9) to survive its own
 * width. The grouped teacher sidebar now carries the same routes —
 * components/teacher/teacher-shell.tsx + lib/teacher/nav-config.ts
 * (Workspace / Live data / Tools / Demo lens, rendered by the shared
 * run-004b SideNav renderer with the dashboard shell's rail mechanics) —
 * mounted once in app/teacher/layout.tsx.
 *
 * This export stays as a deliberate no-op so the surfaces that still call
 * <TeacherNav /> keep compiling while each drops the call in its own
 * tranche; the strip's identity line moved to the sidebar footer and the
 * role-mismatch note is RequireAuth's job (app/teacher/layout.tsx).
 * Deleting the per-page call is the cleanup law — remove it, don't re-add
 * chrome.
 */
export function TeacherNav() {
  return null;
}
