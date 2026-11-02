"use client";

/**
 * Note-scroll memory — the resume law of trace 1a19b5cba7c16a81 ("Resume
 * could remember scroll position within a note").
 *
 * The revision-notes Resume button already points at the most recently
 * engaged note (PR #628 law: max notesRead.at); what it did NOT remember was
 * WHERE in that note the learner stopped — every resume landed at the top.
 * This store remembers the reading position: the note page's client island
 * (note-scroll-memory.tsx) saves the window-scroll FRACTION while the
 * learner reads, and when the learner arrives through the Resume button
 * (the index stamps ?resume=1 on the href) the island scrolls the note back
 * to the saved fraction.
 *
 * Why a fraction, not pixels: note bodies reflow between visits (fonts,
 * KaTeX, images, corpus updates) — a fraction of the scrollable height
 * degrades gracefully, a pixel offset rots.
 *
 * Why its own localStorage namespace (`syllabai-hub:note-scroll:<course>`)
 * instead of a field on the progress overlay: scroll writes are
 * high-frequency and position-only — they must never churn the learner
 * progress object the rings read, and the overlay's notesRead entries only
 * exist once a note is READ (scrolled to its end), while resume must be
 * able to point at a note the learner is mid-way through. Recency across
 * both planes is joined at the resume-target computation
 * (pickResumeNoteId).
 *
 * Laws of record (all owned here so the island, the index and the tests
 * share one truth):
 *   - SAVE GATE  — positions below MIN_RESUME_FRAC (2% into the note) are
 *     not reading positions; they are never stored and never make a note
 *     the resume target.
 *   - RESUME BAND — only positions inside [MIN_RESUME_FRAC, MAX_RESUME_FRAC]
 *     restore. A position at/after 98% means the learner read to the end
 *     (that is exactly where the read event fires) — "resuming" a finished
 *     note at its footer strip carries no information, so that note opens
 *     fresh from the top. An interrupted read (the case the operator
 *     described) sits inside the band and resumes exactly there.
 *   - BOUND — the per-course map holds at most MAX_ENTRIES notes (oldest
 *     `at` evicted), so the overlay can never grow unbounded on a long
 *     revision streak.
 */
import { useCallback, useSyncExternalStore } from "react";

export interface NoteScrollEntry {
  /** window-scroll fraction of the note body, clamped to [0, 1] */
  frac: number;
  /** last time the learner's position moved in this note (engagement recency) */
  at: number;
}

export const MIN_RESUME_FRAC = 0.02;
export const MAX_RESUME_FRAC = 0.98;
export const MAX_ENTRIES = 120;

const keyFor = (course: string) => `syllabai-hub:note-scroll:${course}`;
const isBrowser = typeof window !== "undefined";

// module-level cache so every hook instance sees the same object graph
// (the same posture lib/progress.ts uses for the overlay store)
const cache = new Map<string, Record<string, NoteScrollEntry>>();
const listeners = new Map<string, Set<() => void>>();

function load(course: string): Record<string, NoteScrollEntry> {
  if (cache.has(course)) return cache.get(course)!;
  let data: Record<string, NoteScrollEntry> = {};
  if (isBrowser) {
    try {
      const raw = window.localStorage.getItem(keyFor(course));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, NoteScrollEntry>;
        if (parsed && typeof parsed === "object") data = parsed;
      }
    } catch {
      // corrupted state → reset (scroll memory is disposable by design)
    }
  }
  cache.set(course, data);
  return data;
}

function persist(course: string, next: Record<string, NoteScrollEntry>) {
  cache.set(course, next);
  if (isBrowser) {
    try {
      window.localStorage.setItem(keyFor(course), JSON.stringify(next));
    } catch {
      // storage full / private mode — memory stays in-session only
    }
  }
  listeners.get(course)?.forEach((fn) => fn());
}

/**
 * Persist the learner's reading position in one note. Called by the note
 * page island on a throttle (and flushed on pagehide), so the write rate is
 * bounded. Positions below the save gate are refused — they are not reading
 * positions and must not manufacture resume targets.
 */
export function saveNoteScroll(
  course: string,
  noteId: string,
  frac: number,
  at: number = Date.now(),
) {
  if (!Number.isFinite(frac)) return;
  const clamped = Math.min(1, Math.max(0, frac));
  if (clamped < MIN_RESUME_FRAC) return;
  const cur = load(course);
  const prev = cur[noteId];
  if (prev && prev.frac === clamped && prev.at === at) return;
  const next: Record<string, NoteScrollEntry> = {
    ...cur,
    [noteId]: { frac: clamped, at },
  };
  // bound the map: evict the oldest engagement(s) past the cap (the current
  // note is freshly stamped, so it always survives its own write)
  const entries = Object.entries(next);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].at - b[1].at);
    for (const [k] of entries.slice(0, entries.length - MAX_ENTRIES)) delete next[k];
  }
  persist(course, next);
}

export function getNoteScroll(course: string, noteId: string): NoteScrollEntry | null {
  return load(course)[noteId] ?? null;
}

/** Whole per-course scroll map (the plain read behind useNoteScrolls). */
export function getNoteScrolls(course: string): Record<string, NoteScrollEntry> {
  return load(course);
}

export function subscribeNoteScroll(course: string, fn: () => void): () => void {
  if (!listeners.has(course)) listeners.set(course, new Set());
  listeners.get(course)!.add(fn);
  return () => listeners.get(course)!.delete(fn);
}

/** Stable server snapshot (useSyncExternalStore requires a cached value). */
const EMPTY: Record<string, NoteScrollEntry> = {};

/** Reactive per-course scroll-memory snapshot for client components. */
export function useNoteScrolls(course: string): Record<string, NoteScrollEntry> {
  const getSnapshot = useCallback(() => load(course), [course]);
  return useSyncExternalStore(
    (cb) => subscribeNoteScroll(course, cb),
    getSnapshot,
    () => EMPTY,
  );
}

/**
 * The resume band: positions inside [2%, 98%] restore; below the band there
 * is nothing to resume (top of the note) and at/after the band the note was
 * read to its end — it opens fresh (see the laws above).
 */
export function resumableFrac(frac: number): boolean {
  return frac >= MIN_RESUME_FRAC && frac <= MAX_RESUME_FRAC;
}

/**
 * The revision-notes Resume target: the most recently ENGAGED note — max
 * `at` across the read stamps (notesRead, PR #628's original plane) and the
 * scroll memory (this store, trace 1a19b5cba7c16a81). Joining the two is
 * what makes "remember scroll position" meaningful: a note the learner is
 * half-way through outranks a finished read it never returned to, and the
 * engagement-based posture matches the exam-questions and flashcards select
 * pages (each keyed on its own content type's engagement). Note ids unknown
 * to this course's corpus (stale entries after content churn) never win.
 */
export function pickResumeNoteId(
  reads: Record<string, { at: number }>,
  scrolls: Record<string, NoteScrollEntry>,
  known: ReadonlySet<string>,
): string | null {
  let best: string | null = null;
  let bestAt = -1;
  for (const [noteId, v] of Object.entries(reads)) {
    if (known.has(noteId) && v.at > bestAt) {
      bestAt = v.at;
      best = noteId;
    }
  }
  for (const [noteId, v] of Object.entries(scrolls)) {
    if (known.has(noteId) && v.at > bestAt) {
      bestAt = v.at;
      best = noteId;
    }
  }
  return best;
}
