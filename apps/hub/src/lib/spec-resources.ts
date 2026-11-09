import type { Flashcard, RevisionNote, ExamQuestionTopic } from "@/lib/contracts";
import { buildDeckSections } from "@/lib/flashcard-decks";

/**
 * spec-resources — T-SPECLINK-1: the spec-point → corpus-resources join.
 *
 * Every edge comes from an OF-RECORD anchor; nothing is inferred from text:
 *   - revision notes: the note's own specPointIds (corpus of record)
 *   - exam-question sets: part-level specPointIds ∪ specPointCodes, with the
 *     corpus's own relatedNoteIds → note.specPointIds fallback (the same
 *     evidence class the D0 tag-backfill used — "the course's own map, never
 *     guessed"). A set with no anchor at any level is LEFT OUT — honest
 *     absence, never faked.
 *   - flashcard decks: the cards' specPointIds (for SME vintages that carry
 *     none, the of-record backfill wrote the subtopic-note-inherited join —
 *     see the consuming course's receipt); a deck anchors to the codes its
 *     cards carry.
 *
 * Refs pointing outside the course's curriculum nodes are dropped (the
 * 4CH1-pilot official anchors, other-course codes) — the explorer only ever
 * links resources to statements that exist on the page.
 *
 * The legend keeps one entry per resource (with its route href); per-point
 * payloads are id/slug lists into that legend — the prerendered page stays
 * small even when a deck anchors to every point of its subtopic.
 */

export interface SpecResourceLegend {
  notes: { id: string; title: string; href: string }[];
  sets: { slug: string; name: string; setName: string | null; count: number; href: string }[];
  decks: { slug: string; title: string; count: number; href: string }[];
}

export interface SpecPointResources {
  /** revision-note ids (legend.notes) */
  n: string[];
  /** exam-question set slugs (legend.sets) */
  q: string[];
  /** flashcard deck slugs (legend.decks) */
  f: string[];
}

export interface SpecResourcesJoin {
  legend: SpecResourceLegend;
  resByCode: Map<string, SpecPointResources>;
}

export function buildSpecResources(
  notes: readonly RevisionNote[],
  questionTopics: readonly ExamQuestionTopic[],
  flashcards: readonly Flashcard[],
  nodeByCode: ReadonlyMap<string, unknown>,
  base: string,
): SpecResourcesJoin {
  const legend: SpecResourceLegend = { notes: [], sets: [], decks: [] };
  const resByCode = new Map<string, SpecPointResources>();
  const resFor = (code: string): SpecPointResources => {
    let r = resByCode.get(code);
    if (!r) {
      r = { n: [], q: [], f: [] };
      resByCode.set(code, r);
    }
    return r;
  };
  const inCourse = (code: string) => nodeByCode.has(code);
  const noteIds = new Set<string>();
  const setSlugs = new Set<string>();
  const deckSlugs = new Set<string>();

  // 1. revision notes — the note's own spec anchors
  for (const n of notes) {
    for (const code of n.specPointIds ?? []) {
      if (!inCourse(code)) continue;
      if (!noteIds.has(n.noteId)) {
        noteIds.add(n.noteId);
        legend.notes.push({ id: n.noteId, title: n.title, href: `${base}/revision-notes/${n.noteId}` });
      }
      const r = resFor(code);
      if (!r.n.includes(n.noteId)) r.n.push(n.noteId);
    }
  }

  // 2. exam-question sets — part anchors first, relatedNoteIds fallback
  const noteById = new Map(notes.map((n) => [n.noteId, n]));
  for (const s of questionTopics) {
    const codes = new Set<string>();
    for (const it of s.questions) {
      for (const p of it.parts) {
        for (const c of [...(p.specPointIds ?? []), ...(p.specPointCodes ?? [])]) codes.add(c);
      }
    }
    if (codes.size === 0 && s.relatedNoteIds?.length) {
      for (const id of s.relatedNoteIds) {
        const note = noteById.get(id);
        for (const c of note?.specPointIds ?? []) codes.add(c);
      }
    }
    const inCur = [...codes].filter(inCourse);
    if (inCur.length === 0) continue; // genuinely unanchored — never faked
    if (!setSlugs.has(s.slug)) {
      setSlugs.add(s.slug);
      legend.sets.push({
        slug: s.slug,
        name: s.name,
        setName: s.setName ?? null,
        count: s.questions.length,
        href: `${base}/exam-questions/${s.slug}`,
      });
    }
    for (const code of inCur) {
      const r = resFor(code);
      if (!r.q.includes(s.slug)) r.q.push(s.slug);
    }
  }

  // 3. flashcard decks — the corpus's own deck index (title source: the
  //    questions plane's SME name, else the slug-derived rule)
  const deckIndex = buildDeckSections(flashcards, questionTopics);
  const deckTitle = new Map<string, string>();
  const deckCount = new Map<string, number>();
  for (const sec of deckIndex.sections) {
    for (const d of sec.decks) {
      deckTitle.set(d.code, d.title);
      deckCount.set(d.code, d.count);
    }
  }
  for (const card of flashcards) {
    const ds = card.deckSlug;
    for (const code of card.specPointIds ?? []) {
      if (!inCourse(code) || !ds) continue;
      const r = resFor(code);
      if (!r.f.includes(ds)) r.f.push(ds);
      if (!deckSlugs.has(ds)) {
        deckSlugs.add(ds);
        legend.decks.push({
          slug: ds,
          title: deckTitle.get(ds) ?? ds,
          count: deckCount.get(ds) ?? 0,
          href: `${base}/flashcards/${ds}`,
        });
      }
    }
  }

  return { legend, resByCode };
}
