import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";

import type { BookChapter } from "@syllabai/contracts";

import { loadHubCourse } from "@/lib/courses";
import { relatedNotesForChapter } from "@/lib/books-notes";
import { fetchBookRailBlocks } from "@/lib/books-rail";
import { RailWorkspace } from "@/components/books/rail/rail-workspace";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * 133e law (unchanged in frame): the pane mounts the chapter's PAGE-EXACT
 * SLICE instead of the ~54MB whole book — the download fix. Unit
 * exam-practice rows (u<n>:xexam-practice from the slice manifest) mount the
 * unit's exam slice; ?page=N inside a unit span resolves there BEFORE the
 * chapter containment (the spans are disjoint from chapter ranges by
 * construction). When the manifest is absent or drift-guarded out, EVERYTHING
 * degrades to the whole-book mount — the 133c behavior, byte-for-byte.
 *
 * 133g law (the operator's corrected geometry, trace 1a15458e2e5bf235):
 * practice questions live INLINE in the chapter slice (they start where the
 * study material ends, sometimes mid-page), so the hard-split `_q` slices are
 * retired — the slice IS the lesson + its questions in one mount.
 *
 * 133h law (trace 1a154fdfa70ec415): the practice affordances LEFT the
 * viewer — no "Practice questions" jump button, no "Unit N exam" button.
 * The unit exam-practice slices are reached from the shelf's TOC list (the
 * unnumbered row at the end of each unit). ?part=questions deep links still
 * resolve through the unchanged pure mount law — the UI just no longer
 * advertises them.
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
  // 133h: isQuestions now only colors the legacy `_q` range label — the
  // practice-questions button it used to gate is gone from the viewer.
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

  // 133j — the notes↔books join, viewer direction: the hub course's revision
  // notes (already in memory via loadHubCourse) joined against the mounted
  // chapter's registry specCodes (exact spineCode intersection, the pure
  // law in lib/books-notes.ts). Honest-absent: a chapter with no related
  // notes (census of record: u4:c24 Alkanes is the only one, 1/29) renders
  // NO trigger — and courses whose corpus carries no specPointCodes (non-4CH1
  // pilots) render none either, since no note can intersect.
  const relatedNotes = relatedNotesForChapter(target, hub.notes);

  // T-BOOK-003 — the rail of record for this chapter. The ADR-BOOK-0001 §3
  // serving law, verbatim: the rail serves a pack only when the parent book
  // is VALIDATED AND the pack is VALIDATED — the api enforced both; here,
  // null (rail unavailable) AND [] (no flipped pack) BOTH render the
  // unchanged 133c page below, byte-for-byte. Only a non-empty VALIDATED
  // stream mounts the two-pane shell.
  const railBlocks = await fetchBookRailBlocks(docId, target.chapterKey);
  const railOn = railBlocks != null && railBlocks.length > 0;

  // slice pane path; null → whole-book fallback (the 133c mount)
  const sliceRel = mountEntry ? bookSlicePathForCourse(slug, mountEntry.file) : null;
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
        <span className="truncate font-medium">{book?.title ?? "Student book"}</span>
        <span className="text-muted-foreground">
          {ordinal}/{chapters.length} · {target.title}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {rangeLabel}
          {bookRangeLabel}
        </span>
        {relatedNotes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2">
                <BookOpen className="h-4 w-4" aria-hidden />
                Revision notes ({relatedNotes.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
              {relatedNotes.map((n) => (
                <DropdownMenuItem key={n.noteId} asChild>
                  <Link
                    href={`/courses/${slug}/revision-notes/${n.noteId}`}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug">{n.title}</span>
                    {n.path ? (
                      <span className="max-w-full truncate text-[11px] text-muted-foreground">{n.path}</span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
      {railOn ? (
        <RailWorkspace
          documentId={docId}
          chapterKey={target.chapterKey}
          chapterTitle={target.title}
          blocks={railBlocks!}
          pane={{
            url: corpusViewerUrl(panePath),
            fallbackUrl: booksRawUrl(wholePdfPath),
            downloadUrl: booksRawUrl(wholePdfPath),
            label: `${book?.title ?? "Student book"} — ${target.title}`,
            initialPage,
          }}
        />
      ) : (
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
      )}
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
