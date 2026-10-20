/**
 * T-MIG-133 band 133k — the books ENTRY registry (pure, build-safe).
 *
 * WHY a committed set: the course hub page is PRERENDERED at build
 * (ADR-021) and must not grow a request-time network dependency; the
 * books SHELF page (/courses/<slug>/books) is force-dynamic and already
 * enforces every LIVE gate (the T-C20 validation flip at the api — a
 * book that has not passed the human gate is simply not on that shelf).
 * So the entry card gates on the COMMITTED archive of record (a course
 * joins when its books/<specKey>/ home lands on the books repo — the
 * 133c upload law), and the live truth stays where it always was: on
 * the shelf. A card can therefore only ever lead to an honest shelf —
 * never a fabricated book.
 *
 * Rollout law: one line per course as its books/<specKey>/ archive home
 * lands (chemistry first — books/pearson-edexcel/international-gcse/
 * chemistry/4ch1/, commit b589745). The follow-up lever (operator-keyed,
 * "we will plan something") is deriving this set from the archive
 * index instead of hand-maintaining it.
 */

/** Courses whose books archive home exists on the books repo of record. */
const BOOKS_ARCHIVE_COURSES: ReadonlySet<string> = new Set([
  "igcse-chemistry-19", // pearson-edexcel/international-gcse/chemistry/4ch1
]);

/** Build-safe entry gate: does this course have a committed books home? */
export function courseHasBookArchive(slug: string): boolean {
  return BOOKS_ARCHIVE_COURSES.has(slug);
}
