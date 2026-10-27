"use client";

/**
 * T-BOOK-067 — lesson-side reading progress tracker (client component).
 *
 * Mounts inside the LessonView's section nav (aside) when — and only when —
 * the lesson maps to a rail chapter (railChapterKey != null). It reuses the
 * rail's chapter_progress row via the shared hook (lib/books-progress.ts):
 * GET on mount, debounced PUT, 401 signed-out silently skips persistence.
 *
 * Measurement laws:
 *  - pct: the DOCUMENT scroll span (the lesson scrolls the page, unlike
 *    the rail's inner stream), read through useSyncExternalStore — scroll
 *    position is an external store, and the snapshot law (a pure read, no
 *    setState-in-effect cascades) keeps renders scroll-shaped.
 *  - lastOrd: IntersectionObserver (threshold 0.4) over the lesson's
 *    sections via data-progress-idx — the DEEPEST visible section's max
 *    block ord wins (sections with no joined blocks carry ord null and
 *    never regress the pointer).
 *  - resume: a stored row with 0 < pct < 95 scrolls to the section
 *    containing lastOrd (sectionForOrd) 350ms after mount — the same
 *    gentle affordance the rail uses.
 *  - presence/display: live position wins once the reader has moved; at
 *    the very top the stored row (if any) keeps the bar visible with its
 *    own value; no stored row and no movement → the component renders
 *    NOTHING — a first-visit lesson at the top shows no bar.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { clampPct, sectionForOrd, type ProgressSection } from "@/lib/books-progress-shared";
import { useChapterProgress } from "@/lib/books-progress";

import { Progress } from "@/components/ui/progress";

function computeDocPct(): number {
  const span = document.documentElement.scrollHeight - window.innerHeight;
  return span <= 0 ? 100 : (window.scrollY / span) * 100;
}

export function LessonProgressTracker({
  documentId,
  railChapterKey,
  sections,
}: {
  documentId: string;
  railChapterKey: string;
  sections: ProgressSection[];
}) {
  const { initialPct, initialOrd, put } = useChapterProgress(documentId, railChapterKey);
  const lastOrdRef = useRef<number | null>(null);
  const sectionsRef = useRef<ProgressSection[]>(sections);
  const resumedRef = useRef(false);
  const scrolledRef = useRef(false);

  // eslint law: no ref mutation during render — sync in an effect.
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // scroll position as an external store: subscribe marks the reader as
  // moved (the PUT gate), getSnapshot is a pure clampPct(read) — a stable
  // primitive, so React re-renders only when the rounded pct changes.
  const subscribe = useCallback((onStoreChange: () => void) => {
    const listener = () => {
      scrolledRef.current = true;
      onStoreChange();
    };
    window.addEventListener("scroll", listener, { passive: true });
    window.addEventListener("resize", listener, { passive: true });
    return () => {
      window.removeEventListener("scroll", listener);
      window.removeEventListener("resize", listener);
    };
  }, []);
  const getSnapshot = useCallback(() => clampPct(computeDocPct()), []);
  const livePct = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  // deepest visible section → lastOrd (viewport-rooted IO on the server-
  // rendered section nodes, which carry data-progress-idx)
  useEffect(() => {
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number.parseInt((e.target as HTMLElement).dataset.progressIdx ?? "", 10);
          if (!Number.isFinite(idx)) continue;
          if (e.isIntersecting) visible.add(idx);
          else visible.delete(idx);
        }
        if (visible.size === 0) return;
        const deepest = Math.max(...visible);
        const ord = sectionsRef.current[deepest]?.ord ?? null;
        if (ord != null) lastOrdRef.current = ord;
      },
      { threshold: 0.4 },
    );
    for (const el of document.querySelectorAll("[data-progress-idx]")) io.observe(el);
    return () => io.disconnect();
  }, [sections]);

  // the reader moved → debounce the PUT to the shared chapter_progress row
  useEffect(() => {
    if (!scrolledRef.current || livePct <= 0) return;
    put(livePct, lastOrdRef.current);
  }, [livePct, put]);

  // resume once the stored row arrives (never re-fires on later pct updates)
  useEffect(() => {
    if (resumedRef.current || initialPct == null || initialOrd == null) return;
    if (initialPct <= 0 || initialPct >= 95) return;
    resumedRef.current = true;
    const target = sectionForOrd(sectionsRef.current, initialOrd);
    if (target == null) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(t);
  }, [initialPct, initialOrd]);

  const shown = livePct > 0 ? livePct : initialPct != null && initialPct > 0 ? clampPct(initialPct) : 0;
  if (shown <= 0) return null;
  return (
    <div data-lesson-progress className="mt-3 rounded-md border bg-card p-2.5">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Reading progress</span>
        <span className="font-medium text-muted-foreground">{shown}% read</span>
      </div>
      <Progress value={shown} className="h-1" aria-label="Reading progress" />
    </div>
  );
}
