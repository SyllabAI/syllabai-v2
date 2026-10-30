/**
 * Live-ink registry — T-MG-CROPMARK-1 run-002. The read seam between the
 * ink layer (T-MG-INK-1 run-003) and the crop producer: the producer must
 * composite the learner's CURRENT working set — including edits inside the
 * 900 ms sync debounce window that the STORED doc does not have yet (the
 * draw-then-mark race) and persisted strokes while the ink toolbar is
 * toggled off (the layer renders no canvas then, but the doc of record
 * still holds them).
 *
 * Laws carried:
 * - the ink doc's working set stays OWNED by the InkLayer's sync controller
 *   (single-writer, E4); this registry is a READ accessor only — it never
 *   mutates shapes, never subscribes, holds no timers (no listener law).
 * - keyed by the canonical sourceUrl (the ink persistence key); a reader
 *   for an unregistered document reads the honest empty set.
 * - module-level by design: the producer and the layer are sibling
 *   compositions (the RegionOverlay standalone law — neither can pass
 *   props to the other).
 */
import type { InkShape } from "./ink";

type LiveInkReader = () => InkShape[];

const live = new Map<string, LiveInkReader>();

/** The InkLayer registers its working-set reader on mount (and unregisters
 * on dispose — a disposed layer reads empty, never a stale set). */
export function registerLiveInk(sourceUrl: string, read: LiveInkReader): void {
  live.set(sourceUrl, read);
}

export function unregisterLiveInk(sourceUrl: string): void {
  live.delete(sourceUrl);
}

/** The CURRENT working set for the document ([] when nothing is live). */
export function readLiveInk(sourceUrl: string): InkShape[] {
  const read = live.get(sourceUrl);
  if (!read) return [];
  const shapes = read();
  return Array.isArray(shapes) ? shapes : [];
}
