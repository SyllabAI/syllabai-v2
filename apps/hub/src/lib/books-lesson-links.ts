/**
 * T-BOOK-033 — the Lesson spec-join bridges (pure module).
 *
 * LESSON-PLAN-4CH1 §4 law, verbatim: cross-links to revision notes /
 * flashcards / exam questions are DERIVED at serve time from specRefs via
 * the existing spine-join bridges — a pack NEVER authors a link.
 *
 * Grammar of record (the books-notes.ts header, verbatim): lesson packs
 * carry BARE officialCodes ("1.1", "1.5C" — spine node codes); every
 * corpus side carries the QUALIFIED spineCode ("4CH1-1.1"). The bridge is
 * therefore: re-qualify each specRef with the course code, then EXACT
 * code intersection — never a fuzzy title match, never a fabricated link.
 *
 * Pure module (books-notes.ts precedent): deterministic ordering so SSR
 * output is stable; honest-absent (empty in, empty out — no invention).
 */

import type { RevisionNote } from "./contracts";
import type { Flashcard, ExamQuestionTopic } from "./contracts";

/** "1.1" → "4CH1-1.1" (course code of record from CourseMeta.code). */
export function requalifySpecRefs(specRefs: readonly string[], courseCode: string): string[] {
  return specRefs.map((r) => (r.startsWith(`${courseCode}-`) ? r : `${courseCode}-${r}`));
}

/** Deterministic note order (the books-notes.ts law: path → title → noteId). */
function noteOrder(n: RevisionNote): string {
  return `${n.path ?? ""}\u0000${n.title}\u0000${n.noteId}`;
}

/**
 * Revision notes whose specPointCodes intersect the (re-qualified) specRefs.
 * Exact spineCode intersection; dedupe by noteId; deterministic order.
 */
export function relatedNotesForSpecRefs(
  specPointCodes: readonly string[],
  notes: readonly RevisionNote[],
): RevisionNote[] {
  const codes = new Set(specPointCodes);
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

/**
 * Question topics with >=1 question part whose specPointCodes intersect
 * the (re-qualified) specRefs. The topic keeps ALL of its questions (the
 * player is the topic surface of record); ordering follows the corpus
 * array order (already the player's order of record).
 */
export function questionTopicsForSpecRefs(
  specPointCodes: readonly string[],
  topics: readonly ExamQuestionTopic[],
): ExamQuestionTopic[] {
  const codes = new Set(specPointCodes);
  if (codes.size === 0) return [];
  return topics.filter((t) =>
    (t.questions ?? []).some((q) =>
      (q.parts ?? []).some((p) => (p.specPointCodes ?? []).some((c) => codes.has(c))),
    ),
  );
}

/**
 * Flashcards anchored to the (re-qualified) specRefs: card.specPointCode
 * (single anchor) OR card.specPointIds ∩ set (legacy id anchors resolve
 * only if the corpus already carries codes — id strings never match a
 * spineCode set, which is the honest-absent behavior, not a fuzzy join).
 */
export function flashcardsForSpecRefs(
  specPointCodes: readonly string[],
  cards: readonly Flashcard[],
): Flashcard[] {
  const codes = new Set(specPointCodes);
  if (codes.size === 0) return [];
  return cards.filter((c) => {
    if (c.specPointCode && codes.has(c.specPointCode)) return true;
    const ids = (c as { specPointIds?: readonly string[] }).specPointIds ?? [];
    return ids.some((id) => codes.has(id));
  });
}
