/**
 * F-186 rollout law of record — the courses the /practice/battle surface
 * serves. The battle player is course-pinned (the 4CH1 pilot) until
 * per-course serving lands; the course-page Strength Battle card keys its
 * live-vs-roadmap state on THIS list, so a course not yet served renders the
 * honest roadmap card and never a dead CTA. When the battle learns
 * per-course serving, the course page flips automatically from this one
 * list — one law, one place.
 */
export const BATTLE_SERVED_COURSES: readonly string[] = ["igcse-chemistry-19"];

/** The pinned battle course (the first — currently only — served course). */
export function battleCourse(): string {
  return BATTLE_SERVED_COURSES[0] ?? "igcse-chemistry-19";
}

/** Whether the battle surface serves this course (the card's `ready` law). */
export function battleServedFor(slug: string): boolean {
  return BATTLE_SERVED_COURSES.includes(slug);
}
