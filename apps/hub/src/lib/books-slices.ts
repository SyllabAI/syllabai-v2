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
 * (books/<specKey>/manifest.json, book-slices-manifest-v1) — the mirror is
 * structural, never behavioral: any drift fails THIS parse first, loudly.
 *
 * DRIFT GUARDS (the registry-shift law): a manifest is only honored when it
 * names the SAME documentId AND docVersion as the live chapter registry —
 * a registry shift with a stale manifest degrades to the whole-book mount
 * (the 133c behavior), never to wrong slices.
 */
import { z } from "zod";

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
  note: z.string().optional(),
});

export const sliceManifestMirror = z.object({
  schema: z.literal("book-slices-manifest-v1"),
  book: z.object({
    documentId: z.string().min(1),
    docVersion: z.number().int().min(1),
    courseSlug: z.string().min(1),
    specKey: z.string().min(1),
  }),
  slices: z.array(sliceEntryMirror).min(1),
});

export type BookSliceEntry = z.infer<typeof sliceEntryMirror>;
export type BookSliceManifest = z.infer<typeof sliceManifestMirror>;

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

/** Strict manifest-acceptance law: same book, same registry version, same course. */
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
