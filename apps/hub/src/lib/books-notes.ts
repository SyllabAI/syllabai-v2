/**
 * T-MIG-133 band 133j — the notes↔books spec-join law (operator go
 * "go mapping", trace 1a156004911ee41d; feasibility consult trace
 * 1a155f168121d2cd).
 *
 * BOTH sides of the join already carry the SAME code grammar of record:
 *   - book chapters: bookChapterSchema.specCodes[].spineCode ("4CH1-1.1",
 *     C-suffixed chemistry-only codes verbatim — the api registry serves
 *     them; the books.ts header calls the registry "the spec join of
 *     record", the LO-box match provenance lives in each SpecCodeRef);
 *   - revision notes: RevisionNote.specPointCodes ("official anchors
 *     (4CH1 pilot only)" — lib/contracts.ts), the same spine grammar.
 *
 * The join is therefore an EXACT spineCode intersection — never a fuzzy
 * title match, never a fabricated link. The pre-band census of record
 * (scripts/t133j_join_census.py, 2026-10-20): 29 chapters / 112 notes —
 * 28/29 chapters get >=1 related note (only u4:c24 Alkanes: 0), 87/112
 * notes map to exactly 1 chapter, 0 notes span >1 chapter, 25 notes are
 * orphans (their spec codes appear in no chapter LO box) — orphans render
 * NO link (honest absent state), and chapters with 0 related notes render
 * NO panel.
 *
 * Pure module (the books-slices.ts precedent): no server-only imports,
 * unit-testable, deterministic ordering so SSR output is stable.
 */
import type { BookChapter } from "@syllabai/contracts";

import type { RevisionNote } from "./contracts";

/** The chapter's join codes, verbatim from the registry (spineCode). */
export function chapterSpecCodes(chapter: Pick<BookChapter, "specCodes">): string[] {
  return (chapter.specCodes ?? []).map((sc) => sc.spineCode);
}

/** Deterministic note order for SSR stability: corpus path, then title, then id. */
function noteOrder(n: RevisionNote): string {
  return `${n.path ?? ""}\u0000${n.title}\u0000${n.noteId}`;
}

/**
 * The revision notes related to ONE chapter: exact spineCode intersection.
 * A note with two intersecting codes appears ONCE (identity by noteId);
 * ordering is deterministic (path → title → noteId).
 */
export function relatedNotesForChapter(
  chapter: Pick<BookChapter, "specCodes">,
  notes: readonly RevisionNote[],
): RevisionNote[] {
  const codes = new Set(chapterSpecCodes(chapter));
  if (codes.size === 0) return [];
  const seen = new Set<string>();
  const out: RevisionNote[] = [];
  for (const n of notes) {
    if (seen.has(n.noteId)) continue;
    const nc = n.specPointCodes ?? [];
    if (nc.length === 0) continue;
    if (nc.some((c) => codes.has(c))) {
      seen.add(n.noteId);
      out.push(n);
    }
  }
  return out.sort((a, b) => noteOrder(a).localeCompare(noteOrder(b)));
}

/** Deterministic chapter order: unit, then chapter ordinal, then key. */
function chapterOrder(c: ChapterLike): string {
  return `${c.unitIndex ?? 999}\u0000${c.chapterIndex}\u0000${c.chapterKey}`;
}

/**
 * The structural minimum the reverse join needs — the full BookChapter
 * satisfies it, and so do the client-side mirrors (the note reader's
 * minimal chapter parse): the join law never demands more shape than it
 * uses (REUSE-not-redeclare across server and client callers).
 */
export interface ChapterLike {
  chapterKey: string;
  chapterIndex: number;
  unitIndex?: number | null;
  specCodes: readonly { spineCode: string }[];
}

/**
 * The book chapters related to ONE note (the reverse join — the note
 * reader's "open the student book" affordance). Exact intersection only;
 * an orphan note (census: 25/112) gets an EMPTY array and the caller
 * renders no link — never a nearest-guess, never a unit-level fallback.
 * Generic over the structural minimum so server (BookChapter) and client
 * (mirrored) callers share ONE law.
 */
export function bookChaptersForNote<T extends ChapterLike>(
  note: { specPointCodes?: readonly string[] | null },
  chapters: readonly T[],
): T[] {
  const codes = new Set(note.specPointCodes ?? []);
  if (codes.size === 0) return [];
  return chapters
    .filter((c) => c.specCodes.some((sc) => codes.has(sc.spineCode)))
    .sort((a, b) => chapterOrder(a).localeCompare(chapterOrder(b)));
}
