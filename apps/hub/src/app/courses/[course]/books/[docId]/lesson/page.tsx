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
import { fetchBookRailBlocks, type RailBlock } from "@/lib/books-rail";
import { joinRailBlocksIntoSections } from "@/lib/lesson-blocks-join";
import {
  fetchChapterLesson,
  fetchLessonIndex,
  findChapterKeyInIndex,
  normalizedChapterKey,
} from "@/lib/books-lesson";
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
  const chapters = await fetchBookChapters(docId, slug);
  if (chapters === null || chapters.length === 0) notFound();

  // chapter resolution: ?chapter= in EITHER key format (rail u1:c1 or pack
  // u1:c01 — the r1 join law) → that pack; else the first index chapter the
  // book actually has; else the first index row. No pack anywhere →
  // notFound (honest).
  const idx = await fetchLessonIndex(slug);
  if (!idx || idx.length === 0) notFound();
  const bookChapterKeys = new Set(
    chapters
      .map((c) => normalizedChapterKey(c.chapterKey))
      .filter((k): k is string => k != null),
  );
  const chapterKey =
    (chapterParam ? findChapterKeyInIndex(idx, chapterParam)?.chapterKey : null) ??
    idx.find((p) => {
      const k = normalizedChapterKey(p.chapterKey);
      return k != null && bookChapterKeys.has(k);
    })?.chapterKey ??
    idx[0].chapterKey;

  const lesson = await fetchChapterLesson(slug, chapterKey);
  if (!lesson) notFound();

  // T-C20: draft/reviewed render ONLY behind the operator preview flag
  const preview = lesson.previewOnly && previewParam === "1";
  if (lesson.previewOnly && !preview) notFound();

  // T-BOOK-026 — the lesson↔rail join (the operator's lesson-flow law,
  // trace 1a17cb69e4100d49): the chapter's VALIDATED rail block stream,
  // joined into the pack's sections — authored blockIds win, the rest
  // derive to the first spec-intersecting section, no-home blocks ride
  // the honest extras stream. The rail coordinate of record is the
  // REGISTRY key (u1:c1) — resolve it from the chapters fetch above by
  // the normalized join (the books-lesson.test.ts law). Honest-null law:
  // no registry match / stream unavailable / empty stream → the lesson
  // renders exactly as before (blocks absent, nothing fabricated).
  const railChapterKey =
    chapters.find((c) => normalizedChapterKey(c.chapterKey) === normalizedChapterKey(chapterKey))
      ?.chapterKey ?? null;
  const railBlocks = railChapterKey ? await fetchBookRailBlocks(docId, railChapterKey) : null;
  const join =
    railBlocks != null && railBlocks.length > 0
      ? joinRailBlocksIntoSections(lesson.pack.sections, railBlocks)
      : null;
  const blocksBySection: Record<string, RailBlock[]> = {};
  if (join) for (const [k, v] of join.bySection) blocksBySection[k] = v;

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
      blocksBySection={join ? blocksBySection : undefined}
      extraBlocks={join && join.extras.length > 0 ? join.extras : undefined}
      railChapterKey={railChapterKey}
    />
  );
}
