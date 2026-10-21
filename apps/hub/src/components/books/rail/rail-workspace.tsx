"use client";

/**
 * T-BOOK-003 — the RAIL SHELL: the interactive layer beside the page-true
 * PDF pane (ADR-BOOK-0001 §5 "rail, not rewrite" — the 133c viewer laws
 * stand; this component ADDS a column, it never reflows the book).
 *
 * Laws this component implements:
 *  - Two-pane layout on desktop (PDF left, rail right); on mobile the rail
 *    collapses into an accordion under the pane (plan §8 T-BOOK-003 row).
 *  - Honest presence: this component only MOUNTS when a VALIDATED pack
 *    exists (the server page's fetch returned non-empty) — a chapter without
 *    a flipped pack renders the unchanged 133c page, byte-for-byte (the ADR
 *    §3 serving law; the shell is never a facade over emptiness).
 *  - Page-true anchoring: every block's pdfPageAnchor jump uses the
 *    PdfPaneHandle.scrollToPage imperative (the pane's own question-jump
 *    law) — "see p.42" precision, never a re-rendered page image.
 *  - Progress = coverage, not mastery (ADR §8): the ONLY persisted signal is
 *    the rail scroll percentage + last block reached, PUT (debounced) to the
 *    hub proxy → api chapter_progress. Signed-out (401) silently skips
 *    persistence — the rail stays fully usable; progress is a coverage
 *    signal, not a gate, and an anonymous reader is never nagged.
 *  - Block views (r0): prose/figure/callout render their full content; the
 *    interactive widget types render their honest card with the anchor —
 *    the full players land with the widget lanes (T-BOOK-004..006) behind
 *    this same envelope.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { PdfPane, type PdfPaneHandle } from "@/components/pastpapers/pdf-pane";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, FlaskConical, ExternalLink, MapPin } from "lucide-react";

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
}

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

// ── block views (r0 — full widget players land with T-BOOK-004..006) ────────

const BLOCK_TYPE_LABEL: Record<RailBlock["type"], string> = {
  prose: "Read",
  figure: "Figure",
  callout: "Examiner note",
  "mcq-embed": "Check yourself",
  "sort-match": "Sort & match",
  "drag-label": "Label the diagram",
  "table-fill": "Fill the table",
  "num-stepper": "Step through",
  "eq-builder": "Build the equation",
  "sim-embed": "Simulation",
  "media-embed": "Watch",
};

const INTERACTIVE_TYPES: ReadonlySet<RailBlock["type"]> = new Set([
  "mcq-embed",
  "sort-match",
  "drag-label",
  "table-fill",
  "num-stepper",
  "eq-builder",
]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function BlockView({
  block,
  onJump,
}: {
  block: RailBlock;
  onJump: (page: number) => void;
}) {
  const { content, type } = block;
  const anchor = block.pdfPageAnchor;

  const jumpButton = anchor != null && (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => onJump(anchor)}
      aria-label={`Show page ${anchor} in the book pane`}
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden />
      See p.{anchor}
    </Button>
  );

  if (type === "prose") {
    const text = str(content.text);
    if (!text) return null; // a VALIDATED block never ships empty — belt and braces
    return (
      <div className="rounded-lg border bg-card p-3 text-sm leading-relaxed" data-ord={block.ord}>
        <BlockHeader block={block} />
        <p className="whitespace-pre-line">{text}</p>
        {jumpButton && <div className="mt-2">{jumpButton}</div>}
      </div>
    );
  }

  if (type === "callout") {
    const body = str(content.body) ?? str(content.text);
    if (!body) return null;
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed dark:border-amber-900 dark:bg-amber-950/40"
        data-ord={block.ord}
      >
        <BlockHeader block={block} />
        <p className="whitespace-pre-line">{body}</p>
        {jumpButton && <div className="mt-2">{jumpButton}</div>}
      </div>
    );
  }

  if (type === "figure") {
    const caption = str(content.caption);
    return (
      <div className="rounded-lg border bg-card p-3 text-sm" data-ord={block.ord}>
        <BlockHeader block={block} />
        <p className="text-muted-foreground">
          Page-true figure region in the book pane{caption ? ` — ${caption}` : ""}.
        </p>
        {jumpButton && <div className="mt-2">{jumpButton}</div>}
      </div>
    );
  }

  if (type === "sim-embed" || type === "media-embed") {
    const title = str(content.title) ?? "Interactive resource";
    const fallbackUrl = str(content.fallbackUrl) ?? str(content.url);
    return (
      <div className="rounded-lg border bg-card p-3 text-sm" data-ord={block.ord}>
        <BlockHeader block={block} />
        <p className="font-medium leading-snug">{title}</p>
        {type === "sim-embed" && (
          <p className="mt-1 text-xs text-muted-foreground">
            PhET Interactive Simulations · CC-BY-4.0
          </p>
        )}
        {fallbackUrl && (
          <Button asChild variant="outline" size="sm" className="mt-2 h-7 gap-1 px-2 text-xs">
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {type === "sim-embed" ? "Open the simulation" : "Open the resource"}
            </a>
          </Button>
        )}
      </div>
    );
  }

  if (INTERACTIVE_TYPES.has(type)) {
    // r0 shell: the interactive player lands with the widget lanes — the
    // honest card names the activity and anchors it; it never PRETENDS to
    // be playable.
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm" data-ord={block.ord}>
        <BlockHeader block={block} />
        <p className="flex items-center gap-1.5 font-medium leading-snug">
          <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden />
          {BLOCK_TYPE_LABEL[type]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Interactive practice for this chapter{anchor != null ? ` (around p.${anchor})` : ""}.
        </p>
        {jumpButton && <div className="mt-2">{jumpButton}</div>}
      </div>
    );
  }

  return null; // unreachable: the mirror enum is closed
}

function BlockHeader({ block }: { block: RailBlock }) {
  return (
    <p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>{BLOCK_TYPE_LABEL[block.type]}</span>
      <span className="text-[10px] font-normal normal-case opacity-60">
        block {block.ord}
      </span>
    </p>
  );
}

// ── the shell ────────────────────────────────────────────────────────────────

export function RailWorkspace({ documentId, chapterKey, chapterTitle, blocks, pane }: RailWorkspaceProps) {
  const paneRef = useRef<PdfPaneHandle | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const lastOrdRef = useRef<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { initialPct, initialOrd, put } = useChapterProgress(documentId, chapterKey);

  const ordered = useMemo(() => [...blocks].sort((a, b) => a.ord - b.ord), [blocks]);

  const jumpToPage = useCallback((page: number) => {
    paneRef.current?.scrollToPage(page);
  }, []);

  const scrollToOrd = useCallback(
    (ord: number) => {
      const el = streamRef.current?.querySelector(`[data-ord="${ord}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

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
  // via classes; duplicating the DOM would fork widget state at T-BOOK-004.
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
              {ordered.map((b) => (
                <BlockView key={b.id} block={b} onJump={jumpToPage} />
              ))}
              <p className="pb-2 pt-1 text-center text-[11px] text-muted-foreground">
                End of the interactive rail — keep reading in the book pane.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </aside>
    </div>
  );
}
