/**
 * T-BOOK-026 — the lesson↔rail block join (pure module).
 *
 * The operator's integration law (trace 1a17cb69e4100d49): the interactive
 * elements live INSIDE the lesson flow, not beside the PDF. The join has
 * TWO tiers, both deterministic, nothing invented:
 *
 *  1. AUTHORED (of record): a lesson section's `blockIds` lists exact rail
 *     block ids (the pack grammar's placement field — the T-BOOK-066
 *     authoring precedent of record: u1:c01:s02 →
 *     "c01-states-and-solutions/b08"). Authored placement WINS.
 *  2. DERIVED fill (the "all of it in the lesson" law): every unclaimed
 *     block lands in the FIRST section (pack order) whose specRefs
 *     intersect the block's specPointRefs — both sides carry BARE
 *     officialCodes ("1.1"), the books-lesson-links grammar of record.
 *     No intersection → the block rides the honest extras list (rendered
 *     at the lesson's end, never silently dropped).
 *
 * Within a section the merged blocks sort back to ord order (reading
 * flow); a section's authored order can only re-home a block, never
 * reorder against ord. Deterministic in, deterministic out — SSR-stable
 * (the books-lesson-links law). Pure module: no server-only, no fetch.
 */
import type { RailBlock } from "./books-rail";

export interface JoinableSection {
  id: string;
  blockIds: readonly string[];
  specRefs: readonly string[];
}

export interface LessonBlocksJoin {
  /** sectionId → blocks (ord-ordered); only sections that received blocks. */
  bySection: Map<string, RailBlock[]>;
  /** blocks with no authored home and no spec intersection. */
  extras: RailBlock[];
}

export function joinRailBlocksIntoSections(
  sections: readonly JoinableSection[],
  blocks: readonly RailBlock[],
): LessonBlocksJoin {
  const bySection = new Map<string, RailBlock[]>();
  const extras: RailBlock[] = [];
  if (blocks.length === 0) return { bySection, extras };

  const byId = new Map(blocks.map((b) => [b.id, b] as const));
  const claimed = new Set<string>();

  // tier 1 — authored placement (exact id; listed order; first claim wins)
  for (const s of sections) {
    for (const id of s.blockIds) {
      const b = byId.get(id);
      if (b != null && !claimed.has(id)) {
        claimed.add(id);
        push(bySection, s.id, b);
      }
    }
  }

  // tier 2 — derived fill: FIRST spec-intersecting section in pack order
  for (const b of blocks) {
    if (claimed.has(b.id)) continue;
    const home = sections.find((s) => b.specPointRefs.some((r) => s.specRefs.includes(r)));
    if (home) push(bySection, home.id, b);
    else extras.push(b);
  }

  // reading flow: each section's blocks merge back to ord order
  for (const arr of bySection.values()) arr.sort((a, b) => a.ord - b.ord);
  return { bySection, extras };
}

function push(m: Map<string, RailBlock[]>, sectionId: string, b: RailBlock): void {
  const arr = m.get(sectionId);
  if (arr) arr.push(b);
  else m.set(sectionId, [b]);
}
