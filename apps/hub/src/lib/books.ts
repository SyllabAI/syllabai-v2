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

import { bookManifestPathsForCourse } from "./books-registry";
import { coreBaseUrl } from "./core-proxy";
import { corpusSpecsForCourse } from "./pastpapers-corpus";
import { booksRawUrl } from "./pastpapers-shared";
import {
  chaptersFromManifest,
  shelfEntryFromManifest,
  sliceManifestMirror,
  type BookSliceManifest,
} from "./books-slices";

// ── the strict-shape mirrors (bookShelfEntrySchema / bookChapterSchema) ─────

const specCodeRefMirror = z
  .object({
    spineCode: z.string().min(1),
    officialCode: z.string().min(1),
    officialId: z.string().optional(),
    tier: z.string().min(1),
    // T-BOOK-025 — mirror of the contracts relax (SCHEMA MIRROR law:
    // structural, never behavioral): the widened binds (method="widened",
    // F-BOOK-0003 r1) are unscored of record and the jsonb serializes the
    // absence as explicit null. null ≡ absent ≡ "unscored".
    score: z.number().nullable().optional(),
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
 *
 * T-BOOK-SERVE r1 — the no-parse manifest path (operator order "we dont
 * need parsing for book pdf in book shelf", trace 1a18d6866b38000d; the
 * greyed-out report on igcse-physics-19, trace 1a18d92606b3b151): when the
 * DB leg yields nothing for the course (operator-gated apply + T-C20 flip
 * still pending, or Neon paused) AND the course has a committed serving
 * manifest on the archive of record, the shelf serves the manifest's book.
 * The DB stays primary — the moment the rows land (same deterministic
 * documentId the r0 receipts pinned), they take over verbatim and the
 * pack surfaces (rail/lesson/progress) remain DB-gated throughout.
 */
export async function fetchBookShelf(courseSlug: string): Promise<BookShelfEntry[] | null> {
  const db = await getJson(
    `/api/v1/content/books?courseId=${encodeURIComponent(courseSlug)}`,
    (raw) => shelfArray.parse(raw) as BookShelfEntry[],
  );
  const manifests = await fetchBookManifests(courseSlug);
  const entries = manifests
    .map(shelfEntryFromManifest)
    .filter((e): e is BookShelfEntry => e != null);
  const out = [...(db ?? [])];
  for (const e of entries) {
    if (!out.some((b) => b.documentId === e.documentId)) out.push(e);
  }
  return out;
}

/**
 * The chapter registry (with spec joins) of one book. Empty array = unknown
 * OR not-yet-validated book (the api's T-C20 404 collapses to empty here) —
 * callers render the same honest not-found either way.
 *
 * T-BOOK-SERVE r1 — the no-parse manifest path: when the DB has no rows for
 * this book and the course's committed serving manifest NAMES the same
 * documentId (the drift-guard is the name match itself — no half-serves),
 * the registry is the manifest's lesson/whole TOC projected onto the
 * BookChapter shape (lib/books-slices.ts chaptersFromManifest — a
 * projection of the r0-verified deriveToc equality, never an invention).
 */
export async function fetchBookChapters(
  documentId: string,
  courseSlug: string,
): Promise<BookChapter[] | null> {
  const db = await getJson(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/chapters`,
    (raw) => chaptersArray.parse(raw) as BookChapter[],
  );
  if (db && db.length > 0) return db;
  const manifest = (await fetchBookManifests(courseSlug)).find(
    (m) => m.book.documentId === documentId,
  );
  if (manifest) {
    const built = chaptersFromManifest(manifest);
    if (built.length > 0) return built;
  }
  return db;
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

// ── 133e: the slice manifest (book-slices-manifest-v1) ──────────────────────
// The pure slice law (zod mirrors, the mount map, mount resolution) lives in
// lib/books-slices.ts (unit-testable, no server-only imports); this module
// carries the server surface (the archive fetch + drift guards) on top.
export {
  bookSliceMapOf,
  type BookChapterSlices,
  type BookSliceEntry,
  type BookSliceManifest,
  type BookSliceMap,
} from "./books-slices";

/**
 * The slice manifest of ONE book of a course, resolved against the committed
 * registry by documentId and drift-guarded against the caller's book truth.
 * null = no such manifest / any mismatch — callers fall back to the
 * whole-book mount silently (honest degradation, no fabricated slices).
 */
export async function fetchBookSlices(
  courseSlug: string,
  documentId: string,
  docVersion: number,
): Promise<BookSliceManifest | null> {
  const m = (await fetchBookManifests(courseSlug)).find(
    (x) => x.book.documentId === documentId,
  );
  if (!m) return null;
  if (m.book.docVersion !== docVersion || m.book.courseSlug !== courseSlug) {
    return null;
  }
  return m;
}

/**
 * T-BOOK-SERVE IAL — the committed manifest set of a course (the MULTI-BOOK
 * MANIFEST LAW: one manifest FILE per book; the registry names the exact
 * books/-relative paths). Every path is fetched with the same archive +
 * revalidate law; a failing/malformed member is dropped (honest absence —
 * never a fabricated book), the rest are the course's books of record.
 */
export async function fetchBookManifests(
  courseSlug: string,
): Promise<BookSliceManifest[]> {
  const paths = bookManifestPathsForCourse(courseSlug);
  if (paths.length === 0) return [];
  const fetched = await Promise.all(
    paths.map(async (p) => {
      try {
        const res = await fetch(booksRawUrl(`books/${p}`), {
          headers: { Accept: "application/json" },
          next: { revalidate: 900 },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const parsed = sliceManifestMirror.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    }),
  );
  return fetched.filter((m): m is BookSliceManifest => m != null);
}

/**
 * The primary (first committed) manifest of a course — the single-book
 * convenience shape kept for any caller that predates the multi-book law.
 */
export async function fetchBookManifest(
  courseSlug: string,
): Promise<BookSliceManifest | null> {
  return (await fetchBookManifests(courseSlug))[0] ?? null;
}

/** The corpus-relative path of one slice file (books/<specKey>/<rel>). */
export function bookSlicePathForCourse(courseSlug: string, rel: string): string | null {
  const spec = corpusSpecsForCourse(courseSlug);
  if (!spec || spec.specs.length === 0) return null;
  return `books/${spec.specs[0]}/${rel}`;
}

/**
 * T-BOOK-SERVE IAL — the PER-BOOK path laws (multi-book courses resolve per
 * book via the matched manifest, never per course): the manifest's own
 * archivePath IS the book's root-PDF corpus path, and its specKey scopes the
 * slice files (the 2-book YPH11 lane scopes slices under sb1//sb2/ — the
 * manifest's file fields already carry that prefix).
 */
export function bookCorpusPathForManifest(m: BookSliceManifest): string | null {
  return m.book.source?.archivePath ?? null;
}

export function bookSlicePathForManifest(m: BookSliceManifest, rel: string): string {
  return `books/${m.book.specKey}/${rel}`;
}
