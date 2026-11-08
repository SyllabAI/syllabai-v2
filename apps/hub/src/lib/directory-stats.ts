/**
 * T-HUB-COURSES-PUBLIC-2 (①): the card substance line — a dependency-free
 * pure module (no client hooks, no server-only imports) so the server page
 * can reuse the type while the client directory renders the format. The
 * COUNTS are read server-side from each course's
 * committed bundle manifest (content/<slug>/manifest.json → counts) and
 * plumbed to the directory as props, exactly like the archivePapers map;
 * this file only formats. Ghost lanes (all counts zero) render no line —
 * the same never-a-false-claim law the papers badge follows.
 */

/** The manifest counts subset the directory card shows. */
export interface CourseCounts {
  notes: number;
  flashcards: number;
  questions: number;
}

export const ZERO_COURSE_COUNTS: CourseCounts = {
  notes: 0,
  flashcards: 0,
  questions: 0,
};

function plural(n: number, one: string, rest: string): string {
  return `${n} ${n === 1 ? one : rest}`;
}

/**
 * "159 notes · 340 flashcards · 88 questions" — zero-sized parts are
 * omitted (an absent stat is never a zero claim), and the empty string
 * means "nothing committed for this lane" (the caller hides the line).
 */
export function formatCourseStats(c: CourseCounts): string {
  const parts: string[] = [];
  if (c.notes > 0) parts.push(plural(c.notes, "note", "notes"));
  if (c.flashcards > 0)
    parts.push(plural(c.flashcards, "flashcard", "flashcards"));
  if (c.questions > 0) parts.push(plural(c.questions, "question", "questions"));
  return parts.join(" · ");
}
