/**
 * T-BOOK-033 — the Lesson surface: /courses/[course]/books/[docId]/lesson
 * (LESSON-PLAN-4CH1 §5 route of record).
 *
 * One substrate, two renderers: the reader (?chapter=) stays the Rail —
 * the page-true PDF companion; this route renders the authored lesson.
 *
 * Serving law (T-C20 posture, lib/books-lesson.ts): a pack that is not
 * published is NOT student-visible. The single honest exception is the
 * operator preview: ?preview=1 renders a draft/reviewed pack with a
 * persistent DRAFT PREVIEW badge (never cached as public content by any
 * shelf). No pack for this chapter → notFound(), byte-for-byte the
 * "unknown and not-yet-validated are the SAME answer" rule.
 */
import { notFound } from "next/navigation";

import { loadHubCourse } from "@/lib/courses";
import { fetchBookChapters } from "@/lib/books";
import { fetchChapterLesson, fetchLessonIndex } from "@/lib/books-lesson";
import { LessonView } from "@/components/books/lesson/lesson-view";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string; docId: string }>;
  searchParams: Promise<{ chapter?: string; preview?: string }>;
}) {
  const { course: slug, docId } = await params;
  const { chapter: chapterParam, preview: previewParam } = await searchParams;

  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  // the docId must resolve to a real, VALIDATED book (the 133c gate) —
  // reuse the registry as the existence check of record
  const chapters = await fetchBookChapters(docId);
  if (chapters === null || chapters.length === 0) notFound();

  // chapter resolution: ?chapter= (exact) → the first chapter that has a
  // pack in the committed index. No pack anywhere → notFound (honest).
  const idx = await fetchLessonIndex(slug);
  if (!idx || idx.length === 0) notFound();
  const chapterKey =
    (chapterParam && idx.some((p) => p.chapterKey === chapterParam) ? chapterParam : null) ??
    idx.map((p) => p.chapterKey).find((k) => chapters.some((c) => c.chapterKey === k)) ??
    idx[0].chapterKey;

  const lesson = await fetchChapterLesson(slug, chapterKey);
  if (!lesson) notFound();

  // T-C20: draft/reviewed render ONLY behind the operator preview flag
  const preview = lesson.previewOnly && previewParam === "1";
  if (lesson.previewOnly && !preview) notFound();

  return (
    <LessonView
      courseSlug={slug}
      docId={docId}
      chapterKey={chapterKey}
      lesson={lesson}
      meta={hub.meta}
      notes={hub.notes}
      questionTopics={hub.questionTopics}
      flashcards={hub.flashcards}
      preview={preview}
    />
  );
}
