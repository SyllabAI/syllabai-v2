import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ClipboardList, FileText } from "lucide-react";

import type { BookChapter, BookShelfEntry } from "@syllabai/contracts";

import { boardOf, loadHubCourse } from "@/lib/courses";
import {
  fetchBookChapters,
  fetchBookShelf,
  bookCorpusPathForCourse,
  bookPaneUrl,
  bookSliceMapOf,
  bookSlicePathForCourse,
  fetchBookSlices,
} from "@/lib/books";
import { booksRawUrl } from "@/lib/pastpapers-shared";
import { fetchLessonShelfEntries, normalizedChapterKey } from "@/lib/books-lesson";
import { CourseHeader } from "@/components/hub/course-header";
import { CorpusPdfLink } from "@/components/pastpapers/corpus-pdf-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
 * Student Books — the per-course book shelf (T-MIG-133 band 133c).
 *
 * The shelf is the chapter registry of every VALIDATED book bound to the
 * course, straight from the books read surface (/api/v1/content/books —
 * the T-C20 validation gate lives there; a book that has not passed the
 * human gate is simply not on this shelf). Every chapter is a page-range
 * mount into the ONE book PDF (pdf_pages coordinates of record), delivered
 * same-origin through /api/corpus-pdf with immutable caching, and warmed on
 * pointer intent (CorpusPdfLink) — hovering a chapter pays for the book
 * once per browser; opening a chapter is then instant.
 */
export default async function BooksShelfPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta } = hub;

  const shelf = await fetchBookShelf(slug);
  const unavailable = shelf === null;

  return (
    <div className="px-3 py-4 sm:px-5 lg:px-6">
      <PreconnectCorpus />
      <CourseHeader
        meta={meta}
        // T-MIG-140: the board is the registry row's own (boardOf — explicit
        // "Cambridge International" on the CIE wave rows, else "Edexcel"),
        // not a hardcode — the books rollout now reaches CIE/IAL lanes.
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Student Books`}
        crumb="Student Books"
        description="The course's student books as first-class content: every chapter opens the book PDF at its own page range — the same pages, citations and spec joins the tutor grounds in."
      />

      {unavailable ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Student books are temporarily unavailable</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The book shelf could not be reached just now. Nothing is wrong with
              your account — try again in a moment.
            </p>
          </CardContent>
        </Card>
      ) : shelf.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No student books published for this course yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Books appear here once they pass the human validation gate. The
              past papers archive is already fully available.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {shelf.map((book) => (
            <BookCard key={book.documentId} slug={slug} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One book: registry grouped by unit; each chapter a page-range mount. */
async function BookCard({ slug, book }: { slug: string; book: BookShelfEntry }) {
  const chapters = await fetchBookChapters(book.documentId);
  const pdfPath = bookCorpusPathForCourse(slug, "student-book.pdf");
  const paneUrl = pdfPath ? bookPaneUrl(pdfPath) : null;

  // 133e: the slice map (drift-guarded) — chapter links warm their OWN
  // slice (~0.1–3MB) instead of the whole book; 133h: each unit's list
  // ENDS with its unnumbered exam-practice row (the practice affordances
  // left the viewer per trace 1a154fdfa70ec415 — the TOC is their home).
  const slices = await fetchBookSlices(slug, book.documentId, book.docVersion);
  const sliceMap = slices ? bookSliceMapOf(slices) : null;

  // T-BOOK-033 — the Lesson shelf affordance: PUBLISHED packs only (T-C20:
  // a pack that has not been operator-VALIDATED simply is not here). The
  // badge is a deep link to the lesson surface for that chapter. The
  // r1 join law: pack keys (u1:c01) and DB rail keys (u1:c1) are the same
  // chapter in two formats — the membership test normalizes BOTH sides.
  const lessonChapters = new Set(
    (await fetchLessonShelfEntries(slug))
      .map((e) => normalizedChapterKey(e.chapterKey))
      .filter((k): k is string => k != null),
  );
  const lessonBadgeChapters = new Set(
    (chapters ?? [])
      .map((c) => normalizedChapterKey(c.chapterKey))
      .filter((k): k is string => k != null && lessonChapters.has(k)),
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug">{book.title}</h2>
            {book.author && (
              <p className="text-sm text-muted-foreground">{book.author}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {book.pages} pages
            </Badge>
            {pdfPath && (
              <a
                href={booksRawUrl(pdfPath)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Open raw PDF
              </a>
            )}
          </div>
        </div>

        {chapters === null ? (
          <p className="text-sm text-muted-foreground">
            The chapter registry could not be loaded just now — try again in a moment.
          </p>
        ) : chapters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This book has no chapters registered yet.
          </p>
        ) : (
          groupByUnit(chapters).map(([unitTitle, rows]) => {
            const unitExam = sliceMap?.unitExam.find(
              (s) => s.chapterKey === `u${rows[0]?.unitIndex}:xexam-practice`,
            );
            const unitExamHref = unitExam
              ? `/courses/${slug}/books/${book.documentId}?chapter=${encodeURIComponent(unitExam.chapterKey)}`
              : null;
            const unitExamSliceRel = unitExam
              ? bookSlicePathForCourse(slug, unitExam.file)
              : null;
            const unitExamWarmUrl = unitExamSliceRel ? bookPaneUrl(unitExamSliceRel) : null;
            return (
            <section key={unitTitle} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {unitTitle}
              </h3>
              <ul className="divide-y rounded-md border">
                {rows.map((ch) => {
                  const sliceRel = sliceMap?.byChapter.get(ch.chapterKey)
                    ? bookSlicePathForCourse(
                        slug,
                        sliceMap.byChapter.get(ch.chapterKey)!.mount.file,
                      )
                    : null;
                  const warmUrl = sliceRel ? bookPaneUrl(sliceRel) : paneUrl;
                  return (
                  <li key={ch.chapterKey} className="flex items-center gap-2 px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {warmUrl ? (
                        <CorpusPdfLink
                          href={`/courses/${slug}/books/${book.documentId}?chapter=${encodeURIComponent(ch.chapterKey)}`}
                          pdfUrl={warmUrl}
                          variant="link"
                          className="h-auto justify-start p-0 text-left font-medium"
                        >
                          {ch.chapterIndex}. {ch.title}
                        </CorpusPdfLink>
                      ) : (
                        // no archive home for this course's book — the
                        // chapter still exists of record; the viewer page
                        // renders its honest state (never a dead link)
                        <Link
                          href={`/courses/${slug}/books/${book.documentId}?chapter=${encodeURIComponent(ch.chapterKey)}`}
                          className="text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {ch.chapterIndex}. {ch.title}
                        </Link>
                      )}
                      {ch.learningObjective && (
                        <p
                          className="line-clamp-1 text-xs text-muted-foreground"
                          title={ch.learningObjective}
                        >
                          {ch.learningObjective}
                        </p>
                      )}
                    </div>
                    <PageRangeBadge ch={ch} />
                    {lessonBadgeChapters.has(ch.chapterKey) && (
                      <Badge asChild variant="secondary" className="shrink-0 font-medium">
                        <Link
                          href={`/courses/${slug}/books/${book.documentId}/lesson?chapter=${encodeURIComponent(ch.chapterKey)}`}
                        >
                          Lesson
                        </Link>
                      </Badge>
                    )}
                  </li>
                  );
                })}
                {unitExam && unitExamHref && (
                  <li className="flex items-center gap-2 px-3 py-2">
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {unitExamWarmUrl ? (
                        <CorpusPdfLink
                          href={unitExamHref}
                          pdfUrl={unitExamWarmUrl}
                          variant="link"
                          className="h-auto justify-start p-0 text-left font-medium"
                        >
                          {unitExam.title ?? "Exam practice"}
                        </CorpusPdfLink>
                      ) : (
                        // no archive home for this unit's slice — the mount
                        // still exists of record; the viewer renders its
                        // honest state (never a dead link)
                        <Link
                          href={unitExamHref}
                          className="text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {unitExam.title ?? "Exam practice"}
                        </Link>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                      {unitExam.pdfRange[1] !== unitExam.pdfRange[0]
                        ? `pp ${unitExam.pdfRange[0]}–${unitExam.pdfRange[1]}`
                        : `p ${unitExam.pdfRange[0]}`}
                    </div>
                  </li>
                )}
              </ul>
            </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/** pdf_pages is the viewer coordinate, book_pages the citation ("SB p.42"). */
function PageRangeBadge({ ch }: { ch: BookChapter }) {
  if (ch.pdfPageStart == null) return null;
  const pdf =
    ch.pdfPageEnd != null && ch.pdfPageEnd !== ch.pdfPageStart
      ? `pp ${ch.pdfPageStart}–${ch.pdfPageEnd}`
      : `p ${ch.pdfPageStart}`;
  const sb =
    ch.bookPageStart != null
      ? ch.bookPageEnd != null && ch.bookPageEnd !== ch.bookPageStart
        ? `SB pp.${ch.bookPageStart}–${ch.bookPageEnd}`
        : `SB p.${ch.bookPageStart}`
      : null;
  return (
    <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
      <div>{pdf}</div>
      {sb && <div>{sb}</div>}
    </div>
  );
}

/** Group chapters by unit preserving the api's order (unit-less rows first). */
function groupByUnit(chapters: BookChapter[]): Array<[string, BookChapter[]]> {
  const out: Array<[string, BookChapter[]]> = [];
  const byUnit = new Map<string, BookChapter[]>();
  for (const ch of chapters) {
    const key =
      ch.unitIndex != null ? `Unit ${ch.unitIndex} — ${ch.unitTitle ?? ""}` : "Book matter";
    const list = byUnit.get(key) ?? [];
    list.push(ch);
    byUnit.set(key, list);
  }
  for (const [k, v] of byUnit) out.push([k.trim().replace(/ —$/, ""), v]);
  return out;
}
