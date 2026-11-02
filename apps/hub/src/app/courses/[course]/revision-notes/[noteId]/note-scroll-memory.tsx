"use client";

/**
 * Note-scroll memory island (trace 1a19b5cba7c16a81: "Resume could remember
 * scroll position within a note") — the note-reader side of the law in
 * lib/note-scroll.ts. Renders NOTHING; it only moves the window and writes
 * the position store.
 *
 * SAVE leg: while the learner scrolls the note, the window-scroll fraction
 * lands in the per-course scroll memory (throttled to one write per 400ms,
 * flushed on pagehide / tab-hide so the final position always survives —
 * the throttle must never eat the last position). Sub-0.2% movements are
 * ignored (no churn); the store itself refuses sub-2% positions (the save
 * gate law).
 *
 * RESTORE leg: the revision-notes Resume button stamps ?resume=1 on its
 * href (the index owns the target law: the most recently engaged note).
 * On mount with that intent this island scrolls the note back to the saved
 * fraction — only inside the resume band [2%, 98%]: a finished note (saved
 * at its end, where the read event fires) opens fresh from the top, an
 * interrupted read picks up exactly where it stopped. The intent param is
 * consumed immediately (history.replaceState), so refreshes and shared URLs
 * stay honest. The target is re-asserted over ~1.2s because the note's
 * height settles asynchronously (fonts, KaTeX, lazy images) after first
 * paint, and any real learner input (wheel / touch / key) cancels the
 * restore — the island never fights the person reading.
 */
import { useEffect } from "react";
import { getNoteScroll, resumableFrac, saveNoteScroll } from "@/lib/note-scroll";

/** current window-scroll fraction of the document, or null when unscrollable */
function currentFrac(): number | null {
  const doc = document.scrollingElement;
  if (!doc) return null;
  const max = doc.scrollHeight - window.innerHeight;
  if (max <= 0) return null;
  return Math.min(1, Math.max(0, doc.scrollTop / max));
}

export function NoteScrollMemory({ course, noteId }: { course: string; noteId: string }) {
  // ── restore leg ────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "1") return;

    // consume the intent first — the restore decision is made, and the URL
    // must not re-trigger on refresh or leak the handoff into shared links
    window.history.replaceState(null, "", window.location.pathname);

    const saved = getNoteScroll(course, noteId);
    if (!saved || !resumableFrac(saved.frac)) return;

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const teardowns: Array<() => void> = [];
    const stop = () => {
      cancelled = true;
      for (const t of timeouts) clearTimeout(t);
      for (const fn of teardowns) fn();
    };

    // re-assert the saved position until the document settles around it —
    // instant jumps (never smooth: reduced-motion is respected by default)
    const settle = () => {
      if (cancelled) return;
      const doc = document.scrollingElement;
      if (!doc) return false;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return true;
      const target = Math.round(saved.frac * max);
      if (Math.abs(doc.scrollTop - target) <= 2) return true;
      window.scrollTo(0, target);
      return false;
    };
    for (const ms of [0, 120, 350, 700, 1200]) {
      timeouts.push(
        setTimeout(() => {
          if (settle()) stop();
        }, ms),
      );
    }

    // learner input cancels the restore — never fight the reader
    const stopOnInput = () => stop();
    window.addEventListener("wheel", stopOnInput, { passive: true });
    window.addEventListener("touchstart", stopOnInput, { passive: true });
    window.addEventListener("keydown", stopOnInput);
    teardowns.push(() => window.removeEventListener("wheel", stopOnInput));
    teardowns.push(() => window.removeEventListener("touchstart", stopOnInput));
    teardowns.push(() => window.removeEventListener("keydown", stopOnInput));

    return stop;
  }, [course, noteId]);

  // ── save leg ───────────────────────────────────────────────────────────
  useEffect(() => {
    let lastSaved = Number.NaN; // last fraction actually written
    let lastWriteAt = 0; // throttle clock
    let pending = false; // a movement happened after the last write

    const write = () => {
      pending = false;
      const frac = currentFrac();
      if (frac === null) return;
      saveNoteScroll(course, noteId, frac);
      lastSaved = frac;
      lastWriteAt = Date.now();
    };

    const onScroll = () => {
      const frac = currentFrac();
      if (frac === null) return;
      if (!Number.isNaN(lastSaved) && Math.abs(frac - lastSaved) < 0.002) return;
      pending = true;
      if (Date.now() - lastWriteAt >= 400) write();
    };

    // the flush paths exist so the throttle can never eat the learner's
    // final position (close the tab / hide the phone right after a scroll)
    const onPageHide = () => {
      if (pending) write();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && pending) write();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (pending) write(); // unmount (route change) is also an exit
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [course, noteId]);

  return null;
}
