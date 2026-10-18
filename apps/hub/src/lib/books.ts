import "server-only";

/**
 * T-MIG-133 band 133c — the Student Books hub-side read path.
 *
 * WHY a standalone lib (not the DemoDataProvider seam): the provider seam
 * carries the demo BUNDLE shapes (curriculum/notes/flashcards per course,
 * imported by scripts/import_content.py). Books are a LIVE corpus family —
 * the chapter registry and its spec joins are operator-gated Neon rows that
 * change under the validation flip, so freezing them into a provider shape
 * would bake a snapshot over the flip lever. The past-papers corpus set the
 * precedent of a family-specific server lib (lib/pastpapers-corpus); books
 * follow it, minus the static index — books read the api edge at request
 * time (no-store), per ADR-029 (a production frontend never touches a
 * database directly).
 *
 * SCHEMA MIRROR law (the lib/contracts.ts precedent): the hub resolves zod
 * v4 while packages/contracts builds on v3 — parse trees do not compose
 * across majors, so the hub mirrors the strict serving shapes locally and
 * imports the canonical shapes TYPE-ONLY. The mirror is structural, never
 * behavioral: any drift fails THIS parse first, loudly.
 *
 * Honest-failure law: every fetch returns NULL on any failure (core not
 * configured, non-200, malformed body) — pages render their honest empty
 * states, exactly like a course with no published books. Never a fabricated
 * shelf, never a partial parse.
 */
import { z } from "zod";

import type { BookChapter, BookShelfEntry } from "@syllabai/contracts";

import { coreBaseUrl } from "./core-proxy";
import { corpusSpecsForCourse } from "./pastpapers-corpus";

// ── the strict-shape mirrors (bookShelfEntrySchema / bookChapterSchema) ─────

const specCodeRefMirror = z
  .object({
    spineCode: z.string().min(1),
    officialCode: z.string().min(1),
    officialId: z.string().optional(),
    tier: z.string().min(1),
    score: z.number().optional(),
    lineage: z.string().min(1),
    method: z.string().min(1),
  })
  .passthrough();

const shelfEntryMirror = z.object({
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  author: z.string(),
  pages: z.number().int().min(1),
  checksum: z.string().min(1),
});

const chapterMirror = z.object({
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  courseId: z.string().min(1),
  unitIndex: z.number().int().min(1).nullable(),
  unitTitle: z.string().nullable(),
  chapterIndex: z.number().int().min(1),
  chapterKey: z.string().min(1),
  title: z.string().min(1),
  bookPageStart: z.number().int().min(1).nullable(),
  bookPageEnd: z.number().int().min(1).nullable(),
  pdfPageStart: z.number().int().min(1).nullable(),
  pdfPageEnd: z.number().int().min(1).nullable(),
  learningObjective: z.string().nullable(),
  specCodes: z.array(specCodeRefMirror),
});

const shelfArray = shelfEntryMirror.array();
const chaptersArray = chapterMirror.array();

/** Server-side GET against the books read surface; null on ANY failure. */
async function getJson<T>(path: string, parse: (raw: unknown) => T): Promise<T | null> {
  const base = coreBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

/**
 * The shelf of a course: VALIDATED books only (the api enforces the T-C20
 * gate; a null here means "unavailable", an empty array means "honestly
 * none published yet" — the two render differently).
 */
export function fetchBookShelf(courseSlug: string): Promise<BookShelfEntry[] | null> {
  return getJson(
    `/api/v1/content/books?courseId=${encodeURIComponent(courseSlug)}`,
    (raw) => shelfArray.parse(raw) as BookShelfEntry[],
  );
}

/**
 * The chapter registry (with spec joins) of one book. Empty array = unknown
 * OR not-yet-validated book (the api's T-C20 404 collapses to empty here) —
 * callers render the same honest not-found either way.
 */
export function fetchBookChapters(documentId: string): Promise<BookChapter[] | null> {
  return getJson(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/chapters`,
    (raw) => chaptersArray.parse(raw) as BookChapter[],
  );
}

/**
 * The archive coordinates of a course's primary book (133c corpus-pdf
 * grammar books/<specKey>/): the specKey is the course's primary corpus
 * specKey — the same pearson-edexcel/... key the past-papers archive uses,
 * so one course → one archive home. null for courses outside the corpus.
 */
export function bookCorpusPathForCourse(
  courseSlug: string,
  file: "student-book.pdf" | "ocr_pages" | "docling_pages",
): string | null {
  const spec = corpusSpecsForCourse(courseSlug);
  if (!spec || spec.specs.length === 0) return null;
  return `books/${spec.specs[0]}/${file}`;
}

/**
 * Books live on ONE pdf per book — the pane URL every chapter of a book
 * shares (the immutable proxy cache makes the ~54MB a once-per-browser
 * cost; hovering any chapter of a book warms it once).
 */
export function bookPaneUrl(corpusPath: string): string {
  return `/api/corpus-pdf/${corpusPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
