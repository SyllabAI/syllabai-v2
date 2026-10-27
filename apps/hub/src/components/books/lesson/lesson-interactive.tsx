"use client";

/**
 * T-BOOK-026 — the interactive zone INSIDE a lesson section (the operator's
 * lesson-flow integration, trace 1a17cb69e4100d49): the rail's interactive
 * elements render inline in the lesson reading flow, not beside the PDF.
 *
 * Widget behavior is byte-identical to the rail's (BlockRenderer of
 * record); the T-BOOK-008 check lane and the T-BOOK-007 glossary lane
 * dedupe per chapter at module scope so N sections still cost ONE wire
 * fetch each (the rail fetched once per shell; the lesson mounts one
 * instance per section).
 *
 * Page-true anchoring (the ADR-BOOK-0001 law, lesson form): a block's
 * pdfPageAnchor affordance deep-links to the page-true rail viewer
 * (?chapter=&page= — the 133d citation drill-in, byte-for-byte the same
 * landing the tutor citations use).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { RailBlock } from "@/lib/books-rail";
import { fetchBookGlossary, fetchChapterChecks, submitChapterCheck } from "@/lib/books-checks";

import {
  BlockRenderer,
  type BlockRendererProps,
  type RailCheckQuestion,
} from "@/components/books/rail/block-renderer";
import { GlossaryContext } from "@/components/books/rail/glossary-chips";

type RailCheckBlockLite = Awaited<ReturnType<typeof fetchChapterChecks>> extends Array<infer T> | null ? T : never;
type BookGlossaryTermLite = Awaited<ReturnType<typeof fetchBookGlossary>> extends Array<infer T> | null ? T : never;

// ── per-chapter wire dedupe (one fetch per chapter, N section instances) ────

const checksCache = new Map<string, Promise<RailCheckBlockLite[] | null>>();
function loadChecks(documentId: string, railChapterKey: string) {
  const key = `${documentId}\u0000${railChapterKey}`;
  let p = checksCache.get(key);
  if (!p) {
    p = fetchChapterChecks(documentId, railChapterKey);
    checksCache.set(key, p);
  }
  return p;
}

const glossaryCache = new Map<string, Promise<BookGlossaryTermLite[] | null>>();
function loadGlossary(courseSlug: string, slugs: string[]) {
  const key = `${courseSlug}\u0000${[...slugs].sort().join(",")}`;
  let p = glossaryCache.get(key);
  if (!p) {
    p = fetchBookGlossary(courseSlug, slugs);
    glossaryCache.set(key, p);
  }
  return p;
}

export function LessonInteractive({
  blocks,
  documentId,
  railChapterKey,
  courseSlug,
}: {
  blocks: RailBlock[];
  documentId: string;
  /** the REGISTRY chapter key (u1:c1 — the rail coordinate of record) */
  railChapterKey: string;
  courseSlug: string;
}) {
  const router = useRouter();

  const [checks, setChecks] = useState<RailCheckBlockLite[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadChecks(documentId, railChapterKey).then((r) => {
      if (alive) setChecks(r);
    });
    return () => {
      alive = false;
    };
  }, [documentId, railChapterKey]);

  const glossaryRefs = useMemo(() => [...new Set(blocks.flatMap((b) => b.glossaryRefs))], [blocks]);
  const glossaryKey = useMemo(() => glossaryRefs.slice().sort().join(","), [glossaryRefs]);
  const [glossary, setGlossary] = useState<BookGlossaryTermLite[] | null>(null);
  useEffect(() => {
    if (glossaryRefs.length === 0) return;
    let alive = true;
    loadGlossary(courseSlug, glossaryRefs).then((r) => {
      if (alive) setGlossary(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable sorted form
  }, [courseSlug, glossaryKey]);

  const glossaryBySlug = useMemo(
    () => new Map((glossary ?? []).map((t) => [t.slug, t] as const)),
    [glossary],
  );

  const checkSource = useMemo<BlockRendererProps["checkSource"]>(
    () => ({
      load: async (refs: string[]): Promise<RailCheckQuestion | null> => {
        const all = checks ?? (await loadChecks(documentId, railChapterKey));
        return all?.find((b) => b.checkRefs.some((r) => refs.includes(r)))?.question ?? null;
      },
      submit: async (blockId: string, questionId: string, chosenOptionId: string, dwellMs: number) =>
        submitChapterCheck({
          documentId,
          chapterKey: railChapterKey,
          blockId,
          questionId,
          chosenOptionId,
          responseTimeMs: dwellMs,
        }),
    }),
    [checks, documentId, railChapterKey],
  );

  // page-true affordance → the rail viewer's 133d deep link (same landing
  // the tutor citations resolve; the lesson never hosts the PDF itself)
  const onJump = useCallback(
    (page: number) => {
      router.push(
        `/courses/${courseSlug}/books/${documentId}?chapter=${encodeURIComponent(railChapterKey)}&page=${page}`,
      );
    },
    [router, courseSlug, documentId, railChapterKey],
  );

  if (blocks.length === 0) return null;
  return (
    <GlossaryContext.Provider value={glossaryBySlug}>
      <div className="mt-4 flex flex-col gap-3" data-lesson-blocks="">
        {blocks.map((b) => (
          <BlockRenderer key={b.id} block={b} onJump={onJump} checkSource={checkSource} />
        ))}
      </div>
    </GlossaryContext.Provider>
  );
}
