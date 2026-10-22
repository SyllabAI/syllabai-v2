/**
 * T-BOOK-033 — lesson section markdown segmenter (pure module).
 *
 * The CourseLessons section grammar of record (VALIDATION.md + the s01
 * format demo): a section body is alternating PROSE and :::BOX segments:
 *
 *     prose…
 *     :::key-point
 *     box body (GFM markdown)
 *     :::
 *     prose…
 *
 * Box types come from the course box_allowlist (12 types). A box body may
 * contain GFM tables, inline code, bold/italic — everything EXCEPT a
 * top-level `:::` line, which always closes the box. ``` fences inside a
 * box do NOT open/close boxes. An unclosed box at EOF keeps its body
 * (authoring lint V-rules catch real unclosed boxes; here we render).
 *
 * `[[glossary-slug]]` chips are NOT resolved here — the renderer rewrites
 * them (bold) and shows the section glossary from the pack's
 * glossarySlugs (data, not prose).
 *
 * Pure module (the books-slices.ts / books-notes.ts precedent): no
 * server-only imports, deterministic, unit-tested.
 */

export interface LessonSegment {
  kind: "prose" | "box";
  /** Box type from the allowlist, e.g. "key-point". Present iff kind==="box". */
  boxType?: string;
  /** The markdown payload (trimmed; never empty for a well-formed segment). */
  md: string;
}

const BOX_OPEN = /^:::([a-z0-9-]+)\s*$/;
const BOX_CLOSE = /^:::\s*$/;
const FENCE = /^(```|~~~)/;

export function parseLessonSegments(body: string): LessonSegment[] {
  const lines = body.split("\n");
  const out: LessonSegment[] = [];
  let prose: string[] = [];
  let boxType: string | null = null;
  let boxLines: string[] = [];
  let inFence = false;

  const flushProse = () => {
    const md = prose.join("\n").trim();
    if (md) out.push({ kind: "prose", md });
    prose = [];
  };
  const flushBox = () => {
    if (boxType === null) return;
    const md = boxLines.join("\n").trim();
    out.push({ kind: "box", boxType, md });
    boxType = null;
    boxLines = [];
  };

  for (const line of lines) {
    if (FENCE.test(line.trim())) inFence = !inFence;

    if (boxType !== null) {
      if (!inFence && BOX_CLOSE.test(line.trim())) {
        flushBox();
      } else {
        boxLines.push(line);
      }
      continue;
    }
    const open = !inFence ? line.trim().match(BOX_OPEN) : null;
    if (open) {
      flushProse();
      boxType = open[1];
      continue;
    }
    prose.push(line);
  }
  // EOF: an unclosed box keeps its body (render, don't drop authoring work)
  flushBox();
  flushProse();
  return out;
}

/** All box types used in a body, in first-appearance order. */
export function lessonBoxTypes(body: string): string[] {
  const seen: string[] = [];
  for (const seg of parseLessonSegments(body)) {
    if (seg.kind === "box" && seg.boxType && !seen.includes(seg.boxType)) {
      seen.push(seg.boxType);
    }
  }
  return seen;
}

/**
 * `[[slug]]` glossary chips → **bold** (the renderer shows the section's
 * glossary strip from the pack's glossarySlugs; the inline surface stays
 * sanitize-safe markdown with no raw-HTML dependency).
 */
export function rewriteGlossaryChips(md: string): string {
  return md.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "**$1**");
}
