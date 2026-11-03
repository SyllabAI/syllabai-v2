/**
 * Spec-tree builder — the canonical navigation tree.
 *
 * SaveMyExams' numbered topic tree IS the SyllabAI specification tree, so one
 * tree drives the Learning Hub's sidebar, URLs, and progress rings
 * (research/sme → SaveMyExams_UX_Feature_Research.docx §9). Nothing here
 * invents a second educational model: nodes are the imported CurriculumNodes
 * verbatim, only grouped for navigation.
 *
 *   SUBJECT (4CH1) → TOPIC (4CH1-S1 "1. Principles of chemistry")
 *     → SUBTOPIC (4CH1-S1-a "States of matter") → SPEC_POINTs (4CH1-1.1 …)
 */
import type { Curriculum, CurriculumNode, ExamQuestionTopic, Flashcard, RevisionNote } from "@/lib/contracts";
import { normalizeSpecText } from "@/lib/spec-text";

export interface SpecSubtopic {
  code: string; // "4CH1-S1-a"
  label: string; // "a" — sub-topic letter inside the topic
  title: string;
  topicCode: string;
  specPointCodes: string[];
}

export interface SpecTopic {
  code: string; // "4CH1-S1"
  number: number; // 1 — syllabus section number
  title: string;
  subtopics: SpecSubtopic[];
  specPointCount: number;
}

export interface SpecTree {
  subjectCode: string;
  subjectTitle: string;
  topics: SpecTopic[];
}

export interface SpecTreeIndex {
  tree: SpecTree;
  /** specPointCode → parent subtopic code */
  subtopicOfSpecPoint: Map<string, string>;
  /** subtopicCode → parent topic code */
  topicOfSubtopic: Map<string, string>;
  subtopicByCode: Map<string, SpecSubtopic>;
  topicByCode: Map<string, SpecTopic>;
}

/**
 * Sub-topic display label. Official-tree codes suffix a letter ("4CH1-S1-a"
 * → "a"); SME-native topic slugs lead with a number ("1-1-formulae-and-
 * equations" → "1.1"). Falls back to the ordinal position.
 */
function subtopicLabel(subtopicCode: string, topicCode: string, ordinal: number): string {
  const suffix = subtopicCode.slice(topicCode.length);
  if (suffix.startsWith("-") && /^[a-z]\d*$/i.test(suffix.slice(1))) {
    return suffix.slice(1);
  }
  const m = subtopicCode.match(/^(\d+)-(\d+)-/);
  if (m) return `${m[1]}.${m[2]}`;
  return String(ordinal + 1);
}

function byNodeOrder(a: CurriculumNode, b: CurriculumNode): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.code.localeCompare(b.code);
}

/**
 * Topic codes needing a synthetic "-gen" row so topic-level placements render.
 * The D0 tag-backfill stamps topic-level-confident sets with `<topicCode>-gen`
 * (see ExamQuestionTopic.subtopicCode); without this scan those codes would
 * not exist in the tree and the sets would fall out of navigation again.
 */
export function generalTopicsOfQuestionTopics(
  topics: readonly { subtopicCode?: string | null }[],
): string[] {
  const out = new Set<string>();
  for (const t of topics) {
    const c = t.subtopicCode;
    if (c && c.endsWith("-gen")) out.add(c.slice(0, -4));
  }
  return [...out];
}

export function buildSpecTreeIndex(
  curriculum: Curriculum,
  opts?: { generalTopics?: readonly string[] },
): SpecTreeIndex {
  const nodes = curriculum.nodes;
  const subject = nodes.find((n) => n.family === "SUBJECT");
  const topics = nodes.filter((n) => n.family === "TOPIC").sort(byNodeOrder);
  const generalTopics = new Set(opts?.generalTopics ?? []);

  const tree: SpecTree = {
    subjectCode: curriculum.code,
    subjectTitle: normalizeSpecText(subject?.title ?? curriculum.subject),
    topics: [],
  };

  const subtopicOfSpecPoint = new Map<string, string>();
  const topicOfSubtopic = new Map<string, string>();
  const subtopicByCode = new Map<string, SpecSubtopic>();
  const topicByCode = new Map<string, SpecTopic>();

  for (const [i, topic] of topics.entries()) {
    const spec: SpecTopic = {
      code: topic.code,
      // display number is always the 1-based position (corpus order); the
      // node's `order` field only drives sorting
      number: i + 1,
      title: normalizeSpecText(topic.title),
      subtopics: [],
      specPointCount: 0,
    };

    const subs = nodes
      .filter((n) => n.family === "SUBTOPIC" && n.parents.includes(topic.code))
      .sort(byNodeOrder);

    const orphanSpecs: CurriculumNode[] = [];

    for (const [j, sub] of subs.entries()) {
      const points = nodes
        .filter((n) => n.family === "SPEC_POINT" && n.parents.includes(sub.code))
        .sort(byNodeOrder)
        .map((n) => n.code);
      for (const c of points) subtopicOfSpecPoint.set(c, sub.code);
      topicOfSubtopic.set(sub.code, topic.code);
      spec.subtopics.push({
        code: sub.code,
        label: subtopicLabel(sub.code, topic.code, j),
        title: normalizeSpecText(sub.title),
        topicCode: topic.code,
        specPointCodes: points,
      });
      spec.specPointCount += points.length;
    }

    // spec points attached straight to the topic (no subtopic) — keep them
    // reachable under a synthetic "general" row so the tree stays complete
    for (const n of nodes) {
      if (
        n.family === "SPEC_POINT" &&
        n.parents.includes(topic.code) &&
        !subtopicOfSpecPoint.has(n.code)
      ) {
        orphanSpecs.push(n);
      }
    }
    // D0 backfill: a topic carrying topic-level-placed sets always gets its
    // "General requirements" row — even with no orphan spec points — so the
    // `<topicCode>-gen` placement codes resolve (opts-in per course; other
    // courses' trees are unchanged from the pre-option builder)
    if (orphanSpecs.length > 0 || generalTopics.has(topic.code)) {
      const codes = orphanSpecs.sort(byNodeOrder).map((n) => n.code);
      const general: SpecSubtopic = {
        code: `${topic.code}-gen`,
        label: "gen",
        title: "General requirements",
        topicCode: topic.code,
        specPointCodes: codes,
      };
      topicOfSubtopic.set(general.code, topic.code);
      spec.subtopics.push(general);
      spec.specPointCount += codes.length;
    }

    tree.topics.push(spec);
    topicByCode.set(topic.code, spec);
    for (const s of spec.subtopics) subtopicByCode.set(s.code, s);
  }

  return { tree, subtopicOfSpecPoint, topicOfSubtopic, subtopicByCode, topicByCode };
}

/** "4CH1-1.10" sorts after "4CH1-1.9" — numeric, not lexical. */
export function bySpecPointOrder(a: string, b: string): number {
  const [as, an] = a.split(".");
  const [bs, bn] = b.split(".");
  if (as !== bs) return as.localeCompare(bs);
  return (parseInt(an ?? "0", 10) || 0) - (parseInt(bn ?? "0", 10) || 0);
}

// ── resource → subtopic grouping ────────────────────────────────────────

export interface SubtopicResourceCounts {
  notes: number;
  questions: number;
  flashcards: number;
}

/**
 * First placed sub-topic for a note: official codes → corpus-native topic
 * slug → SME spec ids. Every path is corpus-derived; nothing is guessed.
 */
export function subtopicOfNote(
  note: RevisionNote,
  index: SpecTreeIndex,
): string | null {
  for (const c of note.specPointCodes) {
    const s = index.subtopicOfSpecPoint.get(c);
    if (s) return s;
  }
  if (note.topicSlug && index.subtopicByCode.has(note.topicSlug)) {
    return note.topicSlug;
  }
  for (const id of note.specPointIds) {
    const s = index.subtopicOfSpecPoint.get(id);
    if (s) return s;
  }
  return null;
}

// ── corpus-bridge ladders (D0 backfill) ─────────────────────────────────
//
// The spec blast (2026-10 audit, 81 SME courses / 2,012 sets / 34,940q) showed
// 450 sets carrying no machine-derivable home under the two production paths
// (topicSlug + spec anchors): 6,565 questions invisible to the spec-tree
// selector. Every one of those sets still carries corpus-side facts — the
// notes the corpus links it to, SME's own numbering, its set/section titles —
// and the curriculum map carries the corresponding sub-topic titles and x.y
// codes. The ladders below join those facts deterministically; nothing is
// guessed, every rung is corpus-derived verbatim, and first hit wins:
//
//   L3 notes-bridge   set.relatedNoteIds → note's anchored sub-topic
//   L4 notes-bridge   set.topicSlug via the note-slug bridge (a note with the
//                     same slug that itself anchors a sub-topic)
//   L5 numbering      topicSlug "1-2-…" → sub-topic code SUB1.2 (unique)
//   L6 numbering      set name "1.2 …" → sub-topic code SUB1.2 (unique)
//   L7 title join     set name ↔ sub-topic title, normalized, unique
//   L8 section join   SME section ↔ topic title tokens (exact token-set
//                     equality, else strictly-unique max overlap) → that
//                     topic's first sub-topic row (corpus order)
//   L8b section join  SME section ↔ sub-topic title token-set EXACT equality,
//                     unique only — overlap scoring mis-homes here
//                     ("Compression" → "Manage files effectively"), so an
//                     inexact section names no sub-topic (a map gap)
//
// The residual after all ladders (33 sets / 393q, 9 unplaced classes + 1
// placeholder-grade map re-import) is NOT forced — those are genuine map gaps
// queued as ADR-039 disclosed edits
// (docs/audits/2026-11-04-sme-selector-d0-backfill.md).

/** Lowercase alphanumeric tokens; the conjunction "and" is folded away so
 *  "Forces & Equilibrium" matches the map's "Forces and equilibrium". */
function tokensOf(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of (s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (t !== "and") out.add(t);
  }
  return out;
}

function normTitle(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/** SME topic slugs number their sub-topic: "1-2-isotopes" → "1.2". */
const SLUG_NUMBERING = /^(\d+)-(\d+)-/;
/** SME set names lead with the same numbering: "1.2 Economic sectors". */
const NAME_NUMBERING = /^(\d+)\.(\d+)(?:\.\d+)?\b/;
/** Corpus-native sub-topic codes end in SUB<x>.<y> ("…T1:SUB1.2"). */
const SUB_NUMBERING = /:SUB(\d+\.\d+)$/;

const numberingCache = new WeakMap<SpecTreeIndex, Map<string, string[]>>();

/** "x.y" → sub-topic codes carrying that numbering, corpus-wide. */
function numberingIndex(index: SpecTreeIndex): Map<string, string[]> {
  const cached = numberingCache.get(index);
  if (cached) return cached;
  const m = new Map<string, string[]>();
  for (const code of index.subtopicByCode.keys()) {
    const hit = SUB_NUMBERING.exec(code);
    if (!hit) continue;
    const list = m.get(hit[1]) ?? [];
    list.push(code);
    m.set(hit[1], list);
  }
  numberingCache.set(index, m);
  return m;
}

const titleIndexCache = new WeakMap<SpecTreeIndex, Map<string, string[]>>();

/** Normalized sub-topic title → codes (the synthetic -gen rows excluded). */
function subtopicTitleIndex(index: SpecTreeIndex): Map<string, string[]> {
  const cached = titleIndexCache.get(index);
  if (cached) return cached;
  const m = new Map<string, string[]>();
  for (const [code, sub] of index.subtopicByCode) {
    if (code.endsWith("-gen")) continue;
    const key = normTitle(sub.title);
    const list = m.get(key) ?? [];
    list.push(code);
    m.set(key, list);
  }
  titleIndexCache.set(index, m);
  return m;
}

const noteHomeCache = new WeakMap<RevisionNote[], Map<string, string | null>>();

/** noteId → anchored sub-topic, memoized per notes array. */
function noteHomes(notes: RevisionNote[], index: SpecTreeIndex): Map<string, string | null> {
  const cached = noteHomeCache.get(notes);
  if (cached) return cached;
  const m = new Map<string, string | null>();
  for (const n of notes) m.set(n.noteId, subtopicOfNote(n, index));
  noteHomeCache.set(notes, m);
  return m;
}

/** SME section ("2. Atoms, Elements & Compounds") → the topic it names
 *  (landing on that topic's first sub-topic row), or — when the section
 *  names a sub-topic verbatim — that sub-topic. The section's number prefix
 *  ("2.") does not align across the map import and SME's site, so joins run
 *  on title tokens only. */
function homeOfSection(section: string, index: SpecTreeIndex): string | null {
  const sec = tokensOf(section);
  if (sec.size === 0) return null;

  // topic-level: exact token-set equality first, else strictly-unique max overlap
  const exact: string[] = [];
  const scored: { code: string; ov: number }[] = [];
  for (const t of index.tree.topics) {
    const tt = tokensOf(t.title);
    if (setEquals(tt, sec)) exact.push(t.code);
    const ov = overlap(tt, sec);
    if (ov > 0) scored.push({ code: t.code, ov });
  }
  let bestTopic: string | null = null;
  if (exact.length === 1) {
    bestTopic = exact[0];
  } else if (exact.length === 0 && scored.length > 0) {
    const max = Math.max(...scored.map((s) => s.ov));
    const top = scored.filter((s) => s.ov === max);
    if (top.length === 1) bestTopic = top[0].code;
  }
  if (bestTopic) {
    const topic = index.tree.topics.find((t) => t.code === bestTopic);
    const first = topic?.subtopics[0];
    if (first) return first.code;
  }

  // sub-topic-level: exact token-set equality, unique only. Overlap scoring
  // MIS-HOMES here ("Compression" → "Manage files effectively"), so it is
  // deliberately not attempted: inexact section ⇒ no home (map gap).
  const exactSubs: string[] = [];
  for (const [code, sub] of index.subtopicByCode) {
    if (code.endsWith("-gen")) continue;
    if (setEquals(tokensOf(sub.title), sec)) exactSubs.push(code);
  }
  return exactSubs.length === 1 ? exactSubs[0] : null;
}

/**
 * Subtopic with the most anchored questions — the set's canonical home.
 * Priority: importer/backfill-resolved subtopicCode (mirrors Flashcard; a
 * stale code fails the subtopicByCode lookup and falls through — never a
 * wrong home), then corpus-native placement (topicSlug), then the
 * spec-anchor tally; the corpus-bridge ladders (see the block above) then
 * resolve the unanchored SME sets. Pass the course's notes to enable the
 * notes-bridge rungs (L3/L4).
 */
export function subtopicOfQuestionSet(
  topic: ExamQuestionTopic,
  index: SpecTreeIndex,
  notes?: RevisionNote[],
): string | null {
  if (topic.subtopicCode && index.subtopicByCode.has(topic.subtopicCode)) {
    return topic.subtopicCode;
  }
  if (topic.topicSlug && index.subtopicByCode.has(topic.topicSlug)) {
    return topic.topicSlug;
  }
  const tally = new Map<string, number>();
  for (const q of topic.questions) {
    const codes = new Set<string>();
    for (const p of q.parts) {
      for (const c of [...p.specPointCodes, ...p.specPointIds]) {
        const s = index.subtopicOfSpecPoint.get(c);
        if (s) codes.add(s);
      }
    }
    for (const s of codes) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  if (tally.size > 0) {
    let best: string | null = null;
    let bestN = 0;
    for (const [s, n] of tally) {
      if (n > bestN) {
        best = s;
        bestN = n;
      }
    }
    return best;
  }

  // L3 — the corpus's own declared linkage: the notes this topic page lists
  for (const id of topic.relatedNoteIds ?? []) {
    if (!notes) break;
    const s = noteHomes(notes, index).get(id);
    if (s) return s;
  }
  // L4 — the same SME topic slug on a note that anchors a sub-topic
  if (notes && topic.topicSlug) {
    const s = noteSlugBridge(notes, index).get(topic.topicSlug);
    if (s) return s;
  }
  // L5/L6 — SME's own numbering ("1-2-isotopes", "1.2 Economic sectors")
  if (topic.topicSlug) {
    const m = SLUG_NUMBERING.exec(topic.topicSlug);
    if (m) {
      const cands = numberingIndex(index).get(`${m[1]}.${m[2]}`);
      if (cands?.length === 1) return cands[0];
    }
  }
  const nm = NAME_NUMBERING.exec(topic.name);
  if (nm) {
    const cands = numberingIndex(index).get(`${nm[1]}.${nm[2]}`);
    if (cands?.length === 1) return cands[0];
  }
  // L7 — the set names its sub-topic verbatim (normalized, unique)
  const byTitle = subtopicTitleIndex(index).get(normTitle(topic.name));
  if (byTitle?.length === 1) return byTitle[0];
  // L8/L8b — the SME section string against the map's titles
  if (topic.section) {
    const s = homeOfSection(topic.section, index);
    if (s) return s;
  }
  return null;
}

/**
 * SME-slug bridge — the upstream corpus keys cards and notes by the SAME SME
 * topic slugs ("number-toolkit", "characteristics-of-living-organisms"), while
 * the tree's sub-topic codes are corpus-native ("igcse-maths-a-T1:SUB1.1").
 * A note carrying a slug also maps that slug onto its anchored sub-topic, so
 * cards sharing the slug inherit a corpus-derived placement — nothing guessed.
 * Memoized per index (built once from the course's notes).
 */
const slugBridgeCache = new WeakMap<SpecTreeIndex, Map<string, string>>();

function noteSlugBridge(notes: RevisionNote[], index: SpecTreeIndex): Map<string, string> {
  const cached = slugBridgeCache.get(index);
  if (cached) return cached;
  const bridge = new Map<string, string>();
  for (const n of notes) {
    if (!n.topicSlug) continue;
    const s = subtopicOfNote(n, index);
    if (s && !bridge.has(n.topicSlug)) bridge.set(n.topicSlug, s);
  }
  slugBridgeCache.set(index, bridge);
  return bridge;
}

/**
 * Placement priority (all corpus-derived): importer-resolved subtopicCode →
 * SME spec anchors → the card's source note → deck topic slug → SME-slug
 * bridge via the notes.
 */
export function subtopicOfFlashcard(
  card: Flashcard,
  notes: RevisionNote[],
  index: SpecTreeIndex,
): string | null {
  if (card.subtopicCode && index.subtopicByCode.has(card.subtopicCode)) {
    return card.subtopicCode;
  }
  for (const id of card.specPointIds ?? []) {
    const s = index.subtopicOfSpecPoint.get(id);
    if (s) return s;
  }
  if (card.specPointCode) {
    const s = index.subtopicOfSpecPoint.get(card.specPointCode);
    if (s) return s;
  }
  const note = notes.find((n) => n.noteId === card.sourceNoteId);
  if (note) return subtopicOfNote(note, index);
  if (card.topicSlug && index.subtopicByCode.has(card.topicSlug)) {
    return card.topicSlug;
  }
  const slug = card.subtopicCode ?? card.topicSlug;
  if (slug) {
    const s = noteSlugBridge(notes, index).get(slug);
    if (s) return s;
  }
  return null;
}

/** Per-subtopic counts for every resource type at once (sidebar + hub). */
export function resourceCounts(
  notes: RevisionNote[],
  topics: ExamQuestionTopic[],
  flashcards: Flashcard[],
  index: SpecTreeIndex,
): Map<string, SubtopicResourceCounts> {
  const counts = new Map<string, SubtopicResourceCounts>();
  const bump = (code: string, k: keyof SubtopicResourceCounts, by = 1) => {
    const cur = counts.get(code) ?? { notes: 0, questions: 0, flashcards: 0 };
    cur[k] += by;
    counts.set(code, cur);
  };
  for (const n of notes) {
    const s = subtopicOfNote(n, index);
    if (s) bump(s, "notes");
  }
  for (const t of topics) {
    const s = subtopicOfQuestionSet(t, index, notes);
    if (s) bump(s, "questions", t.questions.length);
  }
  for (const f of flashcards) {
    const s = subtopicOfFlashcard(f, notes, index);
    if (s) bump(s, "flashcards");
  }
  return counts;
}
