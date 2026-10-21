"use client";

/**
 * T-BOOK-003/004 — the RAIL SHELL: the interactive layer beside the
 * page-true PDF pane (ADR-BOOK-0001 §5 "rail, not rewrite" — the 133c
 * viewer laws stand; this component ADDS a column, it never reflows the
 * book).
 *
 * Laws this component implements:
 *  - Two-pane layout on desktop (PDF left, rail right); on mobile the rail
 *    collapses into an accordion under the pane (plan §8 T-BOOK-003 row).
 *    ONE stream instance swaps between the two via classes — the DOM is
 *    never duplicated, so widget state cannot fork.
 *  - Honest presence: this component only MOUNTS when a VALIDATED pack
 *    exists (the server page's fetch returned non-empty) — a chapter without
 *    a flipped pack renders the unchanged 133c page, byte-for-byte.
 *  - Page-true anchoring: every block's pdfPageAnchor jump uses the
 *    PdfPaneHandle.scrollToPage imperative — "see p.42" precision.
 *  - Progress = coverage, not mastery (ADR §8): the ONLY persisted signal is
 *    the rail scroll percentage + last block reached, PUT (debounced) to the
 *    hub proxy → api chapter_progress. Signed-out (401) silently skips
 *    persistence — the rail stays fully usable.
 *  - Block rendering delegated to BlockRenderer (T-BOOK-004/005/006 widget
 *    lanes); the checkSource data lane arrives with T-BOOK-008.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { BlockRenderer, type BlockRendererProps, type RailCheckQuestion } from "./block-renderer";
import { GlossaryContext, GlossaryStrip } from "./glossary-chips";
import { TutorCard } from "./tutor-card";
import { fetchChapterChecks, fetchBookGlossary, submitChapterCheck } from "@/lib/books-checks";
import { PdfPane, type PdfPaneHandle } from "@/components/pastpapers/pdf-pane";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ChevronDown } from "lucide-react";

export interface RailPaneProps {
  url: string;
  fallbackUrl: string;
  downloadUrl: string;
  label: string;
  initialPage?: number;
}

interface RailWorkspaceProps {
  documentId: string;
  chapterKey: string;
  chapterTitle: string;
  blocks: RailBlock[];
  pane: RailPaneProps;
  /** T-BOOK-008/009 wiring: hub course slug (glossary + tutor anchor) and
   *  the chapter's official spec codes (the tutor's context bracket). */
  courseSlug: string;
  specCodes: string[];
}

type RailCheckBlockLite = Awaited<ReturnType<typeof fetchChapterChecks>> extends Array<infer T> | null ? T : never;
type BookGlossaryTermLite = Awaited<ReturnType<typeof fetchBookGlossary>> extends Array<infer T> | null ? T : never;

// ── progress plumbing ────────────────────────────────────────────────────────

const PUT_DEBOUNCE_MS = 1_200;

/** Clamp to the DB's own check law (0..100 int) before the wire. */
function clampPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function useChapterProgress(documentId: string, chapterKey: string) {
  const [initialPct, setInitialPct] = useState<number | null>(null);
  const [initialOrd, setInitialOrd] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/books/progress?documentId=${encodeURIComponent(documentId)}&chapter=${encodeURIComponent(chapterKey)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok || !alive) return;
        const body = (await res.json()) as { progress?: { railScrolledPct?: number; lastOrd?: number | null } | null };
        if (body.progress) {
          setInitialPct(clampPct(body.progress.railScrolledPct ?? 0));
          setInitialOrd(body.progress.lastOrd ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [documentId, chapterKey]);

  const put = useCallback(
    (railScrolledPct: number, lastOrd: number | null) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetch(
          `/api/books/progress?documentId=${encodeURIComponent(documentId)}&chapter=${encodeURIComponent(chapterKey)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ railScrolledPct: clampPct(railScrolledPct), lastOrd }),
          },
        ).catch(() => undefined);
      }, PUT_DEBOUNCE_MS);
    },
    [documentId, chapterKey],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { initialPct, initialOrd, put };
}

// ── the shell ────────────────────────────────────────────────────────────────

export function RailWorkspace({ documentId, chapterKey, chapterTitle, blocks, pane, courseSlug, specCodes }: RailWorkspaceProps) {
  const paneRef = useRef<PdfPaneHandle | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const lastOrdRef = useRef<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { initialPct, initialOrd, put } = useChapterProgress(documentId, chapterKey);

  const ordered = useMemo(() => [...blocks].sort((a, b) => a.ord - b.ord), [blocks]);

  // ── T-BOOK-008 data lane: the bank-backed check source ──────────────────
  const [checkBlocks, setCheckBlocks] = useState<RailCheckBlockLite[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchChapterChecks(documentId, chapterKey).then((r) => {
      if (alive) setCheckBlocks(r);
    });
    return () => {
      alive = false;
    };
  }, [documentId, chapterKey]);
  const checkSource = useMemo<BlockRendererProps["checkSource"]>(
    () => ({
      load: async (refs: string[]): Promise<RailCheckQuestion | null> => {
        const all = checkBlocks ?? (await fetchChapterChecks(documentId, chapterKey));
        const match = all?.find((b) => b.checkRefs.some((r) => refs.includes(r)));
        return match?.question ?? null;
      },
      submit: async (blockId: string, questionId: string, chosenOptionId: string, dwellMs: number) => {
        return submitChapterCheck({
          documentId,
          chapterKey,
          blockId,
          questionId,
          chosenOptionId,
          responseTimeMs: dwellMs,
        });
      },
    }),
    [checkBlocks, documentId, chapterKey],
  );

  // ── T-BOOK-007 data lane: the chapter's glossary ────────────────────────
  const glossarySlugs = useMemo(
    () => [...new Set(blocks.flatMap((b) => b.glossaryRefs))],
    [blocks],
  );
  const [glossary, setGlossary] = useState<BookGlossaryTermLite[] | null>(null);
  const glossaryBySlug = useMemo(() => new Map((glossary ?? []).map((t) => [t.slug, t])), [glossary]);
  useEffect(() => {
    if (glossarySlugs.length === 0) return;
    let alive = true;
    fetchBookGlossary(courseSlug, glossarySlugs).then((r) => {
      if (alive) setGlossary(r);
    });
    return () => {
      alive = false;
    };
  }, [courseSlug, glossarySlugs]);

  // ── T-BOOK-009 context: spec codes + ms-language hints for the ask ──────
  const glossaryHints = useMemo(
    () =>
      (glossary ?? [])
        .slice(0, 5)
        .map((t) => ({ term: t.term, accepts: t.msAccepts[0] ?? t.definition })),
    [glossary],
  );

  const jumpToPage = useCallback((page: number) => {
    paneRef.current?.scrollToPage(page);
  }, []);

  const scrollToOrd = useCallback((ord: number) => {
    const el = streamRef.current?.querySelector(`[data-ord="${ord}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // rail scroll % + last visible ord → the ONE persisted user signal
  const onStreamScroll = useCallback(() => {
    const el = streamRef.current;
    if (!el) return;
    const span = el.scrollHeight - el.clientHeight;
    const pct = span <= 0 ? 100 : (el.scrollTop / span) * 100;
    put(pct, lastOrdRef.current);
  }, [put]);

  // IntersectionObserver tracks the largest visible block ord
  useEffect(() => {
    const root = streamRef.current;
    if (!root) return;
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const ord = Number.parseInt((e.target as HTMLElement).dataset.ord ?? "", 10);
          if (Number.isFinite(ord)) {
            if (e.isIntersecting) visible.add(ord);
            else visible.delete(ord);
          }
        }
        if (visible.size > 0) lastOrdRef.current = Math.max(...visible);
      },
      { root, threshold: 0.4 },
    );
    for (const el of root.querySelectorAll("[data-ord]")) io.observe(el);
    return () => io.disconnect();
  }, [ordered]);

  // resume affordance (fires once the initial row arrives)
  useEffect(() => {
    if (initialOrd != null && initialPct != null && initialPct > 0 && initialPct < 95) {
      const t = setTimeout(() => scrollToOrd(initialOrd), 350);
      return () => clearTimeout(t);
    }
  }, [initialOrd, initialPct, scrollToOrd]);

  // ONE stream instance — the aside node swaps between the desktop rail
  // column (border-left) and the mobile accordion (below the pane) purely
  // via classes; duplicating the DOM would fork widget state.
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-4">
      {/* the page-true book pane — the 133c mount, untouched */}
      <div className="order-1 h-[52dvh] min-h-0 shrink-0 md:h-auto md:flex-1">
        <PdfPane
          ref={paneRef}
          url={pane.url}
          fallbackUrl={pane.fallbackUrl}
          downloadUrl={pane.downloadUrl}
          label={pane.label}
          active
          initialPage={pane.initialPage}
          className="h-full"
        />
      </div>

      <aside className="order-2 mt-2 flex min-h-0 shrink-0 flex-col border-t pt-2 md:mt-0 md:w-[340px] md:border-t-0 md:border-l md:pb-0 md:pl-4 lg:w-[400px]">
        <Collapsible open={mobileOpen} onOpenChange={setMobileOpen} className="md:contents">
          <div className="flex items-center justify-between md:pb-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between md:w-auto md:pointer-events-none"
                aria-expanded={mobileOpen}
              >
                <span className="text-sm font-semibold">Interactive rail ({ordered.length})</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform md:hidden ${mobileOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
            {initialPct != null && initialPct > 0 && (
              <span className="hidden text-[11px] text-muted-foreground md:inline">
                {clampPct(initialPct)}% read
              </span>
            )}
          </div>
          {initialPct != null && initialPct > 0 && (
            <Progress value={clampPct(initialPct)} className="mb-2 hidden h-1 md:block" aria-label="Rail progress" />
          )}
          <CollapsibleContent
            forceMount
            className={mobileOpen ? "mt-1 min-h-0 flex-1 md:mt-0" : "hidden md:block md:min-h-0 md:flex-1"}
          >
            <div
              ref={streamRef}
              onScroll={onStreamScroll}
              className={`flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1 ${
                mobileOpen ? "max-h-[38dvh] md:max-h-none" : ""
              } md:h-full`}
              aria-label={`Interactive rail for ${chapterTitle}`}
            >
              <GlossaryContext.Provider value={glossaryBySlug}>
                {glossary != null && glossary.length > 0 && <GlossaryStrip terms={glossary} />}
                {ordered.map((b) => (
                  <div key={b.id} data-ord={b.ord}>
                    <BlockRenderer block={b} onJump={jumpToPage} checkSource={checkSource} />
                  </div>
                ))}
                <TutorCard
                  courseSlug={courseSlug}
                  documentId={documentId}
                  chapterKey={chapterKey}
                  chapterTitle={chapterTitle}
                  specCodes={specCodes}
                  glossaryHints={glossaryHints}
                  page={ordered.find((b) => b.pdfPageAnchor != null)?.pdfPageAnchor ?? null}
                />
                <p className="pb-2 pt-1 text-center text-[11px] text-muted-foreground">
                  End of the interactive rail — keep reading in the book pane.
                </p>
              </GlossaryContext.Provider>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </aside>
    </div>
  );
}
