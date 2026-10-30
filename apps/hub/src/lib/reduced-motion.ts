/**
 * Motion helpers shared by the practice surfaces.
 *
 * audit 2026-10-30 (question-player motion review): the player gated two
 * scrollIntoView calls on prefers-reduced-motion inline (the Ctrl/Cmd+Enter
 * submit-focus and the AI-mark result reveal) but hardcoded behavior:"smooth"
 * on the question-grid jump — same intent, three spellings, one of them
 * unguarded. One helper so the contract cannot drift again: reduced motion
 * gets the instant variant ("auto"), everyone else gets smooth scrolling.
 */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
