import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";

import type { BookChapter } from "@syllabai/contracts";

import { loadHubCourse } from "@/lib/courses";
import {
  fetchBookChapters,
  fetchBookShelf,
  bookCorpusPathForCourse,
  bookPaneUrl,
  bookSlicePathForCourse,
  fetchBookSlices,
} from "@/lib/books";
import {
  bookSliceMapOf,
  resolveChapterMount,
  resolveUnitExamMount,
  type BookSliceEntry,
} from "@/lib/books-slices";
import { booksRawUrl, corpusViewerUrl } from "@/lib/pastpapers-shared";
import { PdfPane } from "@/components/pastpapers/pdf-pane";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** PDFs stream from raw.githubusercontent.com — warm the connection early. */
function PreconnectCorpus() {
  return (
    <>
      <link rel="preconnect" href="https://raw.githubusercontent.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://raw.githubusercontent.com" />
    </>
  );
}

/**
 * One student-book chapter — the slice mount (T-MIG-133 bands 133c + 133e).
 *
 * 133c law (unchanged): ?chapter=u1:c1 opens the chapter's pdf_pages range
 * (the viewer coordinate of record); ?page=N (citation drill-in, the 133d
 * shape) lands on that PDF page; unknown OR not-yet-validated books 404
 * identically (T-C20, no state leak).
 *
 * 133e law (this band): the pane mounts the chapter's PAGE-EXACT SLICE
 * (lesson / whole-range per the manifest of record) instead of the ~54MB
 * whole book — the download fix. ?part=questions mounts the hard-split
 * practice-questions slice (the anchor jump). Unit exam-practice rows
 * (u<n>:xexam-practice from the slice manifest) mount the unit's exam
 * slice; ?page=N inside a unit span resolves there BEFORE the chapter
 * containment (the spans are disjoint from chapter ranges by construction).
 * When the manifest is absent or drift-guarded out, EVERYTHING degrades to
 * the whole-book mount — the 133c behavior, byte-for-byte.
 */
export default async function BookViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string; docId: string }>;
  searchParams: Promise<{ chapter?: string; page?: string; part?: string }>;
}) {
  const { course: slug, docId } = await params;
  const { chapter: chapterParam, page: pageParam, part: partParam } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta } = hub;

  const chapters = await fetchBookChapters(docId);
  if (chapters === null || chapters.length === 0) notFound();

  // the shelf is the title source of record; a transient shelf hiccup
  // degrades to the honest generic label, never a fabricated title
  const shelf = await fetchBookShelf(slug);
  const book = shelf?.find((b) => b.documentId === docId) ?? null;

  const wholePdfPath = bookCorpusPathForCourse(slug, "student-book.pdf");
  if (!wholePdfPath) notFound(); // a course outside the corpus archive has no pane

  const slices = await fetchBookSlices(slug, docId, chapters[0].docVersion);
  const sliceMap = slices ? bookSliceMapOf(slices) : null;

  // ── unit exam-practice mounts (manifest rows, disjoint from chapters) ──────
  const unitRow =
    sliceMap?.unitExam.find((s) => chapterParam != null && s.chapterKey === chapterParam) ?? null;
  if (unitRow) {
    const unitResolved = resolveUnitExamMount(unitRow, positiveInt(pageParam));
    return renderMount({
      slug,
      bookTitle: book?.title ?? "Student book",
      mount: { entry: unitResolved.mount!, label: unitRow.title ?? "Exam practice" },
      initialPage: unitResolved.initialPage,
      wholePdfPath,
    });
  }

  const target = pickChapter(chapters, chapterParam, pageParam);
  const ordinal = chapters.indexOf(target) + 1;
  const prev = ordinal > 1 ? chapters[ordinal - 2] : null;
  const next = ordinal < chapters.length ? chapters[ordinal] : null;
  const row = sliceMap?.byChapter.get(target.chapterKey) ?? null;

  const page = positiveInt(pageParam);
  // 133e citation precedence: a page citation that lands in NO chapter range
  // but INSIDE a unit exam span mounts that unit slice (the gap pages the
  // registry leaves uncovered — the unit slice contains them); only pages
  // outside every first-class span ride the F-022 nearest-chapter law.
  const pageInTargetRange =
    page != null &&
    target.pdfPageStart != null &&
    target.pdfPageEnd != null &&
    page >= target.pdfPageStart &&
    page <= target.pdfPageEnd;
  const unitSpanForPage =
    page != null && !pageInTargetRange
      ? sliceMap?.unitExam.find(
          (s) => page >= s.pdfRange[0] && page <= s.pdfRange[1],
        ) ?? null
      : null;
  if (unitSpanForPage) {
    const unitResolved = resolveUnitExamMount(unitSpanForPage, page);
    return renderMount({
      slug,
      bookTitle: book?.title ?? "Student book",
      mount: { entry: unitResolved.mount!, label: unitSpanForPage.title ?? "Exam practice" },
      initialPage: unitResolved.initialPage,
      wholePdfPath,
    });
  }

  const resolved = resolveChapterMount(row, {
    part: partParam,
    page,
    fallbackPage: target.pdfPageStart ?? page ?? 1,
  });
  const mountEntry: BookSliceEntry | null = resolved.mount;
  const mountIsQuestions = resolved.isQuestions;
  const initialPage = resolved.initialPage;

  const rangeLabel = mountEntry
    ? mountIsQuestions
      ? `PDF pp. ${mountEntry.pdfRange[0]}–${mountEntry.pdfRange[1]} · practice questions`
      : `PDF pp. ${mountEntry.pdfRange[0]}–${mountEntry.pdfRange[1]}`
    : target.pdfPageEnd != null && target.pdfPageEnd !== target.pdfPageStart
      ? `PDF pp. ${target.pdfPageStart}–${target.pdfPageEnd}`
      : `PDF p. ${target.pdfPageStart}`;
  const bookRangeLabel =
    target.bookPageStart != null
      ? target.bookPageEnd != null && target.bookPageEnd !== target.bookPageStart
        ? ` · SB pp.${target.bookPageStart}–${target.bookPageEnd}`
        : ` · SB p.${target.bookPageStart}`
      : "";

  // slice pane path; null → whole-book fallback (the 133c mount)
  const sliceRel = mountEntry ? bookSlicePathForCourse(slug, mountEntry.file) : null;
  const panePath = sliceRel ?? wholePdfPath;
  const unitExam =
    sliceMap?.unitExam.find((s) => s.chapterKey === `u${target.unitIndex}:xexam-practice`) ?? null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col px-3 pt-2 sm:px-5">
      <PreconnectCorpus />
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link href={`/courses/${slug}/books`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Shelf
          </Link>
        </Button>
        <span className="truncate font-medium">{book?.title ?? "Student book"}</span>
        <span className="text-muted-foreground">
          {ordinal}/{chapters.length} · {target.title}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {rangeLabel}
          {bookRangeLabel}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {mountIsQuestions ? (
            <Button asChild variant="outline" size="sm" className="h-7 px-2">
              <Link
                href={`/courses/${slug}/books/${docId}?chapter=${encodeURIComponent(target.chapterKey)}`}
                aria-label={`Back to the lesson: ${target.title}`}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Lesson
              </Link>
            </Button>
          ) : (
            row?.questions && (
              <Button asChild variant="outline" size="sm" className="h-7 px-2">
                <Link
                  href={`/courses/${slug}/books/${docId}?chapter=${encodeURIComponent(target.chapterKey)}&part=questions`}
                  aria-label={`Practice questions: ${target.title}`}
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  Practice questions
                </Link>
              </Button>
            )
          )}
          {unitExam && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link
                href={`/courses/${slug}/books/${docId}?chapter=${encodeURIComponent(unitExam.chapterKey)}`}
                aria-label={unitExam.title ?? "Exam practice"}
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                Unit {target.unitIndex} exam
              </Link>
            </Button>
          )}
          {prev && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link
                href={`/courses/${slug}/books/${docId}?chapter=${encodeURIComponent(prev.chapterKey)}`}
                aria-label={`Previous chapter: ${prev.title}`}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {prev.chapterIndex}
              </Link>
            </Button>
          )}
          {next && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link
                href={`/courses/${slug}/books/${docId}?chapter=${encodeURIComponent(next.chapterKey)}`}
                aria-label={`Next chapter: ${next.title}`}
              >
                {next.chapterIndex}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <PdfPane
          url={corpusViewerUrl(panePath)}
          fallbackUrl={booksRawUrl(wholePdfPath)}
          downloadUrl={booksRawUrl(wholePdfPath)}
          label={`${book?.title ?? "Student book"} — ${target.title}`}
          active
          initialPage={initialPage}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** The unit exam-practice mount's own layout (no chapter prev/next). */
function renderMount({
  slug,
  bookTitle,
  mount,
  initialPage,
  wholePdfPath,
}: {
  slug: string;
  bookTitle: string;
  mount: { entry: BookSliceEntry; label: string };
  initialPage: number;
  wholePdfPath: string;
}) {
  const { entry, label } = mount;
  const sliceRel = bookSlicePathForCourse(slug, entry.file);
  const panePath = sliceRel ?? wholePdfPath;
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col px-3 pt-2 sm:px-5">
      <PreconnectCorpus />
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link href={`/courses/${slug}/books`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Shelf
          </Link>
        </Button>
        <span className="truncate font-medium">{bookTitle}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          PDF pp. {entry.pdfRange[0]}–{entry.pdfRange[1]}
        </span>
        <Button asChild variant="outline" size="sm" className="ml-2 h-7 px-2">
          <Link href={`/courses/${slug}/books`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All chapters
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <PdfPane
          url={corpusViewerUrl(panePath)}
          fallbackUrl={booksRawUrl(wholePdfPath)}
          downloadUrl={booksRawUrl(wholePdfPath)}
          label={`${bookTitle} — ${label}`}
          active
          initialPage={initialPage}
          className="h-full"
        />
      </div>
    </div>
  );
}

/**
 * Resolve the mounted chapter: ?chapter=key (the shelf's mount shape) →
 * ?page=N (a page inside a chapter range, the citation drill-in) → the
 * first chapter. A missing/malformed param never throws — it reads the
 * first chapter (the pp viewer's F-022 law, verbatim).
 */
function pickChapter(
  chapters: BookChapter[],
  chapterParam: string | undefined,
  pageParam: string | undefined,
): BookChapter {
  if (chapterParam) {
    const exact = chapters.find((c) => c.chapterKey === chapterParam);
    if (exact) return exact;
  }
  const page = positiveInt(pageParam);
  if (page != null) {
    const containing = chapters.find(
      (c) =>
        c.pdfPageStart != null &&
        c.pdfPageEnd != null &&
        page >= c.pdfPageStart &&
        page <= c.pdfPageEnd,
    );
    if (containing) return containing;
    // nearest chapter STARTING at or before the page, else the first
    const nearest = [...chapters]
      .reverse()
      .find((c) => c.pdfPageStart != null && c.pdfPageStart <= page);
    if (nearest) return nearest;
  }
  return chapters[0];
}

function positiveInt(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
