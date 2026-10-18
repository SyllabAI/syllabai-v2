import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { BookChapter } from "@syllabai/contracts";

import { loadHubCourse } from "@/lib/courses";
import {
  fetchBookChapters,
  fetchBookShelf,
  bookCorpusPathForCourse,
} from "@/lib/books";
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
 * One student-book chapter — the page-range mount (T-MIG-133 band 133c).
 *
 * ?chapter=u1:c1 opens the chapter's pdf_pages range (the viewer coordinate
 * of record); ?page=N (citation drill-in, the 133d shape) lands on that
 * PDF page. Layout discipline inherited from the past-papers viewer (the
 * viewport-drowning lesson): NO breadcrumb row, NO h1 hero — one compact
 * toolbar row (back to shelf · book · chapter position · page-range chip)
 * and the pane filling the rest.
 *
 * T-C20: an unknown OR not-yet-validated book 404s here identically (the
 * chapters registry is empty for both — no state leak, the same honest
 * not-found the shelf's empty state mirrors).
 */
export default async function BookViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string; docId: string }>;
  searchParams: Promise<{ chapter?: string; page?: string }>;
}) {
  const { course: slug, docId } = await params;
  const { chapter: chapterParam, page: pageParam } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta } = hub;

  const chapters = await fetchBookChapters(docId);
  if (chapters === null || chapters.length === 0) notFound();

  // the shelf is the title source of record; a transient shelf hiccup
  // degrades to the honest generic label, never a fabricated title
  const shelf = await fetchBookShelf(slug);
  const book = shelf?.find((b) => b.documentId === docId) ?? null;

  const pdfPath = bookCorpusPathForCourse(slug, "student-book.pdf");
  if (!pdfPath) notFound(); // a course outside the corpus archive has no pane

  const target = pickChapter(chapters, chapterParam, pageParam);
  const ordinal = chapters.indexOf(target) + 1;
  const prev = ordinal > 1 ? chapters[ordinal - 2] : null;
  const next = ordinal < chapters.length ? chapters[ordinal] : null;
  const initialPage =
    target.pdfPageStart ?? positiveInt(pageParam) ?? 1;

  const rangeLabel =
    target.pdfPageEnd != null && target.pdfPageEnd !== target.pdfPageStart
      ? `PDF pp. ${target.pdfPageStart}–${target.pdfPageEnd}`
      : `PDF p. ${target.pdfPageStart}`;
  const bookRangeLabel =
    target.bookPageStart != null
      ? target.bookPageEnd != null && target.bookPageEnd !== target.bookPageStart
        ? ` · SB pp.${target.bookPageStart}–${target.bookPageEnd}`
        : ` · SB p.${target.bookPageStart}`
      : "";

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
          url={corpusViewerUrl(pdfPath)}
          fallbackUrl={booksRawUrl(pdfPath)}
          downloadUrl={booksRawUrl(pdfPath)}
          label={`${book?.title ?? "Student book"} — ${target.title}`}
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
