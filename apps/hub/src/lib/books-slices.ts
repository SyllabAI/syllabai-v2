/**
 * T-MIG-133 band 133e — the pure slice-mapping law for the books viewer.
 * Band 133g revision — the operator's corrected geometry of record
 * (trace 1a15458e2e5bf235): practice questions are NOT a separate block in
 * the source book — they start as soon as the study material ends, sometimes
 * mid-page — so the hard-split `_q` slices are RETIRED: each chapter is ONE
 * slice (study material + practice questions, the full registry range), and
 * the anchor jump (`?part=questions`) lands INSIDE that slice at the parse
 * derived `questionsStartPage` when the manifest of record anchored one.
 * Chapter slices without an honest anchor (no parse-anchored question start)
 * simply have no jump — never a fabricated one.
 *
 * Split out of lib/books.ts so the mount-resolution math is unit-testable
 * (books.ts carries the server-only fetch surface; this module is pure).
 * The shapes mirror the archive manifest of record
 * (books/<specKey>/manifest.json) — the mirror is structural, never
 * behavioral: any drift fails THIS parse first, loudly.
 *
 * 133i — manifest v2 (census trace 1a15534a152456f1, operator "Proceed"):
 * the page-content census found 13 of the 33 v1 slices carrying boundary-
 * carryover pages (next-unit opener pages inside unit-exam slices, stranded
 * chapter-question pages). v2 carries the corrected ranges and republishes
 * the corrected slices under r2 FILENAMES — the archive and the corpus-pdf
 * edge cache are append-only (a path's bytes never change), so the v1 paths
 * stay untouched. The mirror accepts BOTH schema versions (v1 keeps parsing
 * for any book not yet re-cut); the drift guard below still binds the
 * manifest to the live registry documentId/docVersion/courseSlug.
 *
 * DRIFT GUARDS (the registry-shift law): a manifest is only honored when it
 * names the SAME documentId AND docVersion as the live chapter registry —
 * a registry shift with a stale manifest degrades to the whole-book mount
 * (the 133c behavior), never to wrong slices.
 *
 * T-BOOK-SERVE r1 (operator trace 1a18d92606b3b151, "still greyed out" on
 * igcse-physics-19; the standing order "we dont need parsing for book pdf in
 * book shelf", trace 1a18d6866b38000d): the manifest is promoted from a
 * whole-book/slice MOUNT source into the shelf+viewer data source of record
 * whenever the DB chapter registry has no rows for the book (the DB leg is
 * operator-gated and Neon-paused; the slices and manifests are already LIVE
 * on the archive edge). The book block grows ADDITIVE optional fields —
 * title/author/source/units, all present on the r0 manifests of record
 * (chemistry included), all parse-derived from the dry-ingest receipts —
 * consumed only by the new builders below. The mirror stays structural:
 * unknown fields were always stripped, optional additions cannot fail an
 * older parse, and the schema literal does not move (no shape break).
 */
import { z } from "zod";

import type { BookChapter, BookShelfEntry } from "@syllabai/contracts";

export const pageRangeTuple = z
  .tuple([z.number().int().min(1), z.number().int().min(1)])
  .refine(([a, b]) => a <= b, { message: "pdfRange must be [start, end], start <= end" });

export const sliceEntryMirror = z.object({
  file: z.string().min(1),
  role: z.enum(["lesson", "questions", "whole", "unit_exam"]),
  chapterKey: z.string().min(1),
  title: z.string().nullable().optional(),
  pdfRange: pageRangeTuple,
  slicePages: z.number().int().min(1),
  bytes: z.number().int().min(1),
  sha256: z.string().min(1),
  questionAnchor: z
    .object({ page: z.number().int().min(1), chunkIndex: z.number().int().min(1) })
    .optional(),
  /**
   * 133g — the merged-chapter anchor: the PDF page where the chapter's
   * practice questions begin, parse-derived of record (the retired `_q`
   * split's start). Absolute book coordinates (pdfRange space); null when
   * the parse anchored no split for this chapter (honest no-jump).
   */
  questionsStartPage: z.number().int().min(1).nullable().optional(),
  groupSlugs: z.array(z.string().min(1)).optional(),
  /** 133i — the v1 path this r2 republish supersedes (append-only provenance). */
  supersedes: z.string().min(1).optional(),
  note: z.string().optional(),
});

export const sliceManifestMirror = z.object({
  schema: z.union([
    z.literal("book-slices-manifest-v1"),
    z.literal("book-slices-manifest-v2"),
  ]),
  book: z.object({
    documentId: z.string().min(1),
    docVersion: z.number().int().min(1),
    courseSlug: z.string().min(1),
    specKey: z.string().min(1),
    // ── T-BOOK-SERVE r1 additive book block (all present on the r0
    // manifests of record; optional here so older manifests still parse) ──
    /** the book title of record (canonical_json equivalent). */
    title: z.string().min(1).optional(),
    /** the printed author line of record; absent = render no author row. */
    author: z.string().optional(),
    /** the root student-book.pdf coordinates (the viewer's page space). */
    source: z
      .object({
        archivePath: z.string().min(1),
        sha256: z.string().min(1),
        pages: z.number().int().min(1),
      })
      .optional(),
    /** unit titles of record (parse-derived); absent = "Unit N" bare headers. */
    units: z
      .array(
        z.object({
          index: z.number().int().min(1),
          title: z.string().min(1),
          /** T-BOOK-SERVE IAL — additive display label (the chapter registry's
           * unitTitle); the IAL books author Topic-prefixed labels ("Topic 5 —
           * Further Mechanics") because the IAL book's own top-level word is
           * TOPIC and a "Unit N" prefix would misstate its structure. */
          label: z.string().min(1).optional(),
        }),
      )
      .optional(),
  }),
  slices: z.array(sliceEntryMirror).min(1),
});

export type BookSliceEntry = z.infer<typeof sliceEntryMirror>;
export type BookSliceManifest = z.infer<typeof sliceManifestMirror>;

/** The chapterKey grammar's unit prefix ("u1:c1" → 1). */
const CHAPTER_KEY_UNIT_RE = /^u(\d+):c\d+$/;

/**
 * T-BOOK-SERVE r1 — the shelf entry built from a serving manifest, the
 * no-parse data path of record. Requires the additive title+source block
 * (every manifest of record carries it); a manifest without them builds NO
 * entry — never a fabricated book. checksum = the root student-book.pdf
 * sha256 (the same digest the DB leg stores in documents.checksum).
 * Returns null when the manifest cannot honestly describe a book.
 */
export function shelfEntryFromManifest(m: BookSliceManifest): BookShelfEntry | null {
  const { title, source } = m.book;
  if (!title || !source) return null;
  return {
    documentId: m.book.documentId,
    docVersion: m.book.docVersion,
    courseId: m.book.courseSlug,
    title,
    author: m.book.author ?? "",
    pages: source.pages,
    checksum: source.sha256,
  };
}

/**
 * T-BOOK-SERVE r1 — the chapter registry built from a serving manifest.
 * The lesson/whole slices ARE the chapter TOC of record (r0 receipt law:
 * manifest ranges == deriveToc registry ranges exactly), so the mapping is
 * a projection, not an invention: unitIndex from the chapterKey grammar,
 * unitTitle from the manifest units block (null when absent — the shelf
 * renders a bare "Unit N" header, honest), chapterIndex = the global
 * chapter_no ordinal over the manifest's lesson/whole order (the DB leg
 * writes the same sequence), pdf pages from the slice pdfRange, and the
 * DB-only affordances honestly null/empty: book_pages (citation coords),
 * learningObjective, specCodes (→ no related-notes join — there is no
 * parsed spec spine on this path), validationState "SUGGESTED" (exactly
 * what the DB leg would write; the T-C20 gate continues to govern every
 * PACK surface — rail/lesson/progress — which stay DB-only and render
 * their honest absent states here).
 */
export function chaptersFromManifest(m: BookSliceManifest): BookChapter[] {
  const unitTitles = new Map((m.book.units ?? []).map((u) => [u.index, u.label ?? u.title]));
  const out: BookChapter[] = [];
  let ordinal = 0;
  for (const s of m.slices) {
    if (s.role !== "lesson" && s.role !== "whole") continue;
    ordinal += 1;
    const unitMatch = CHAPTER_KEY_UNIT_RE.exec(s.chapterKey);
    const unitIndex = unitMatch ? Number(unitMatch[1]) : null;
    out.push({
      documentId: m.book.documentId,
      docVersion: m.book.docVersion,
      courseId: m.book.courseSlug,
      unitIndex,
      unitTitle: unitIndex != null ? (unitTitles.get(unitIndex) ?? null) : null,
      chapterIndex: ordinal,
      chapterKey: s.chapterKey,
      title: s.title ?? `Chapter ${ordinal}`,
      bookPageStart: null,
      bookPageEnd: null,
      pdfPageStart: s.pdfRange[0],
      pdfPageEnd: s.pdfRange[1],
      learningObjective: null,
      specCodes: [],
      validationState: "SUGGESTED",
    });
  }
  return out;
}

/** One chapter's mount coordinates derived from the manifest. */
export interface BookChapterSlices {
  /** the lesson (or whole-range) slice — always present for a registry chapter */
  mount: BookSliceEntry;
  /** the hard-split practice-questions slice when the parse anchored one */
  questions: BookSliceEntry | null;
}

export interface BookSliceMap {
  byChapter: Map<string, BookChapterSlices>;
  unitExam: BookSliceEntry[];
}

/** Manifest slices → the per-chapter mount map + the unit exam rows. */
export function bookSliceMapOf(m: BookSliceManifest): BookSliceMap {
  const mount = new Map<string, BookSliceEntry>();
  const questions = new Map<string, BookSliceEntry>();
  for (const s of m.slices) {
    if (s.role === "lesson" || s.role === "whole") mount.set(s.chapterKey, s);
    else if (s.role === "questions") questions.set(s.chapterKey, s);
  }
  const byChapter = new Map<string, BookChapterSlices>();
  for (const [key, m0] of mount) {
    byChapter.set(key, { mount: m0, questions: questions.get(key) ?? null });
  }
  return {
    byChapter,
    unitExam: m.slices.filter((s) => s.role === "unit_exam"),
  };
}

/** Strict manifest-acceptance law: same book, same registry version, same course.
 * (r1: the DB-less path calls this with the manifest's OWN book block — a
 * tautology that keeps the drift-guard call shape uniform at the call sites.) */
export function manifestMatchesBook(
  m: BookSliceManifest,
  book: { documentId: string; docVersion: number; courseSlug: string },
): boolean {
  return (
    m.book.documentId === book.documentId &&
    m.book.docVersion === book.docVersion &&
    m.book.courseSlug === book.courseSlug
  );
}

export function clampPage(page: number, max: number): number {
  return Math.min(Math.max(1, page), Math.max(1, max));
}

export interface SliceMountResolution {
  /** the slice to mount; null = whole-book fallback with an absolute page */
  mount: BookSliceEntry | null;
  isQuestions: boolean;
  /** slice-relative when mount != null, absolute when null */
  initialPage: number;
}

/**
 * The chapter mount resolution (the viewer's law, pure):
 *   ?part=questions + a legacy question slice → that slice (the 133e
 *     hard-split anchor jump, kept for any manifest still carrying `_q`
 *     rows); a citation page inside the question range maps to its
 *     slice-relative offset, anything else opens at its page 1.
 *   ?part=questions + a merged chapter slice with questionsStartPage →
 *     the chapter slice opened at the questions offset (the 133g anchor:
 *     same file, mid-slice landing); a citation page INSIDE the chapter
 *     range takes precedence (a link that is both a citation and an anchor
 *     request is a citation); a page outside the range is irrelevant to
 *     this slice, so the anchor intent wins.
 *   else a chapter slice row            → the chapter slice; a citation
 *     page inside the chapter range maps to its slice-relative offset,
 *     anything else opens at page 1 (the slice's first page IS the
 *     chapter's registry start).
 *   else                                → whole-book fallback, absolute page
 *     (the 133c law, verbatim).
 */
export function resolveChapterMount(
  row: BookChapterSlices | null,
  opts: { part: string | undefined; page: number | null; fallbackPage: number },
): SliceMountResolution {
  const qEntry = opts.part === "questions" ? row?.questions ?? null : null;
  if (qEntry) {
    const [qs, qe] = qEntry.pdfRange;
    const initialPage =
      opts.page != null && opts.page >= qs && opts.page <= qe ? opts.page - qs + 1 : 1;
    return { mount: qEntry, isQuestions: true, initialPage: clampPage(initialPage, qEntry.slicePages) };
  }
  if (row) {
    const [rs, re] = row.mount.pdfRange;
    const pageInSlice =
      opts.page != null && opts.page >= rs && opts.page <= re
        ? opts.page - rs + 1
        : null;
    if (opts.part === "questions" && row.mount.questionsStartPage != null) {
      // the 133g merged anchor: same slice, mid-slice landing at the
      // questions start; a real citation page inside the range wins
      const anchorOffset = row.mount.questionsStartPage - rs + 1;
      return {
        mount: row.mount,
        isQuestions: false,
        initialPage: clampPage(pageInSlice ?? anchorOffset, row.mount.slicePages),
      };
    }
    const initialPage = pageInSlice ?? 1;
    return { mount: row.mount, isQuestions: false, initialPage: clampPage(initialPage, row.mount.slicePages) };
  }
  return { mount: null, isQuestions: false, initialPage: Math.max(1, opts.fallbackPage) };
}

/**
 * The unit exam-practice mount: ?page=N inside the unit span lands on its
 * slice-relative offset, anything else opens at page 1 (the span's first
 * page — usually the section opener that carries no chunk of its own).
 */
export function resolveUnitExamMount(
  entry: BookSliceEntry,
  page: number | null,
): SliceMountResolution {
  const [rs, re] = entry.pdfRange;
  const initialPage = page != null && page >= rs && page <= re ? page - rs + 1 : 1;
  return { mount: entry, isQuestions: false, initialPage: clampPage(initialPage, entry.slicePages) };
}
