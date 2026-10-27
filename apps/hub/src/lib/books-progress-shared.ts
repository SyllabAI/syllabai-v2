/**
 * T-BOOK-067 — lesson-side reading progress: SHARED pure helpers.
 *
 * Why a separate file: the lesson renderer (LessonView) is a SERVER
 * component, while the progress hook (lib/books-progress.ts) imports
 * React hooks and is therefore client-only. React's client-boundary law
 * forbids a server component from importing a hooks module — so every
 * pure, dependency-free helper lives HERE (no react import, importable
 * from both planes) and the hook lives in books-progress.ts.
 *
 * The ONE persisted user signal is still chapter_progress (ADR-BOOK-0001
 * §8): the lesson reuses the rail's exact wire (GET on mount, debounced
 * PUT {railScrolledPct, lastOrd} via the hub proxy /api/books/progress)
 * — the lesson is another READER of the same row, never a fork.
 */

/** Debounce window for the PUT (shared by the rail and the lesson). */
export const PUT_DEBOUNCE_MS = 1_200;

/** Clamp to the DB's own check law (0..100 int) before the wire. */
export function clampPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** A lesson section as the tracker sees it: DOM id (dash-form) plus the
 *  max block ord anchored to it (null = no blocks joined to this section). */
export interface ProgressSection {
  id: string;
  ord: number | null;
}

/**
 * The section containing the block the reader last reached: the FIRST
 * section whose max ord >= `ord`. Ords beyond every anchored section
 * (e.g. a resume row written by the rail's differently-shaped stream)
 * fall back to the LAST section that has an ord at all. No anchored
 * sections → null (nowhere to resume to).
 */
export function sectionForOrd(sections: ProgressSection[], ord: number): string | null {
  for (const s of sections) {
    if (s.ord != null && s.ord >= ord) return s.id;
  }
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].ord != null) return sections[i].id;
  }
  return null;
}

/** Max block ord of a section's joined blocks (absent/empty → null). */
export function maxOrdOf(blocks?: { ord: number }[]): number | null {
  if (blocks == null || blocks.length === 0) return null;
  let max = blocks[0].ord;
  for (const b of blocks) {
    if (b.ord > max) max = b.ord;
  }
  return max;
}
