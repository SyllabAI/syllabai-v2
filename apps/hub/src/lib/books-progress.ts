"use client";

/**
 * T-BOOK-067 — the chapter_progress client hook, shared by the rail shell
 * and the lesson tracker.
 *
 * Extracted BYTE-EQUAL from rail-workspace.tsx's local hook block (same
 * wire, same debounce, same silent-401 law): GET on mount (cache no-store;
 * any non-ok — 401 signed-out above all — silently skips persistence, the
 * surface stays fully usable), then debounced PUTs. The lesson is another
 * READER of the same chapter_progress row — never a fork (ADR-BOOK-0001 §8).
 *
 * Client-only: imports React hooks. Server components must import the pure
 * helpers from ./books-progress-shared instead.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { clampPct, PUT_DEBOUNCE_MS } from "./books-progress-shared";

export function useChapterProgress(documentId: string, chapterKey: string) {
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

export { clampPct, PUT_DEBOUNCE_MS };
