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
 * Rollout law: one line per course as its books archive home lands
 * (chemistry first — books/pearson-edexcel/international-gcse/
 * chemistry/4ch1/, commit b589745). The follow-up lever (operator-keyed)
 * is deriving this set from the archive index instead of hand-maintaining it.
 *
 * T-BOOK-SERVE IAL (operator trace 1a18fe1f9cace659 — "Proceed with YPH11 +
 * YCH11/YCH12"): the set grows from a slug list into the MANIFEST PATH map of
 * record — one committed manifest FILE path (books/-relative, filename
 * included) per book of the course. The MULTI-BOOK MANIFEST LAW: a course
 * owns one manifest file per book; the 2-book YPH11 lane names them
 * manifest-sb1.json/manifest-sb2.json with per-book scope dirs (sb1//sb2/)
 * inside the lane; YCH11/YCH12 are separate lanes, each with manifest.json.
 * courseHasBookArchive derives from the map keys (one source of truth); the
 * IAL books' root PDFs and slices resolve per manifest (lib/books.ts), not
 * per course.
 */

/** books/-relative serving manifest path per book, for every course with a committed books archive. */
export const BOOKS_MANIFEST_PATHS: Readonly<Record<string, readonly string[]>> = {
  "igcse-chemistry-19": ["pearson-edexcel/international-gcse/chemistry/4ch1/manifest.json"],
  "igcse-physics-19": ["pearson-edexcel/international-gcse/physics/4ph1/manifest.json"],
  "igcse-biology-19": ["pearson-edexcel/international-gcse/biology/4bi1/manifest.json"],
  // IAL multi-book courses (r0 serving packages, resources 7819d8a4; the
  // shelf live-gates on the T-C20 flip once the DB rows land):
  "ial-physics-19": [
    "pearson-edexcel/international-a-level/physics/yph11/manifest-sb1.json",
    "pearson-edexcel/international-a-level/physics/yph11/manifest-sb2.json",
  ],
  "ial-chemistry-17": [
    "pearson-edexcel/international-a-level/chemistry/ych11/manifest.json",
    "pearson-edexcel/international-a-level/chemistry/ych12/manifest.json",
  ],
};

const BOOKS_ARCHIVE_COURSES: ReadonlySet<string> = new Set(Object.keys(BOOKS_MANIFEST_PATHS));

/** Build-safe entry gate: does this course have a committed books home? */
export function courseHasBookArchive(slug: string): boolean {
  return BOOKS_ARCHIVE_COURSES.has(slug);
}

/** The committed serving manifest paths (books/-relative, filename included) of one course. */
export function bookManifestPathsForCourse(slug: string): readonly string[] {
  return BOOKS_MANIFEST_PATHS[slug] ?? [];
}
