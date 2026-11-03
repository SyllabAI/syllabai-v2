/**
 * flashcard-decks — the SME-native deck index for the flashcards plane.
 *
 * WHY (trace 1a19f6776ca5a619, "we imported from them but why is ours like
 * this?"): the flashcards corpus is a verbatim SME mirror — every card keeps
 * its SME `sectionSlug` + `deckSlug`, the file's first-appearance order IS
 * the SME deck order (deck.order upstream), and per-deck card order is the
 * SME card order (fc_data_check run-001: 0 card-order mismatches across all
 * 77 deck-bearing courses). The old select page ignored all of that and
 * grouped cards onto the official-spec spine's subtopics, which merged 1-6
 * SME decks into one row, split decks across rows, and stranded 6,663 cards
 * (11.8% fleet-wide) whose SME anchors have no spine home — invisible in
 * every navigation.
 *
 * THIS MODULE rebuilds the deck index from the corpus itself: sections and
 * decks in first-appearance (SME) order, one row per real deck, every card
 * reachable. Titles are corpus-native with a deterministic fallback:
 *   1. the questions plane's SME names (topicSlug → name; sectionSlug →
 *      section — the exact strings SME prints),
 *   2. else derived from the slug (numeric prefixes "2-7-" → "2.7", words
 *      title-cased) — derived, never invented.
 *
 * The ROUTE KEY is the deck slug. Deck pages resolve it directly (no spec
 * mapping in the path), so what a deck row counts is what the deck page
 * serves — the same row-count honesty the question bank's D3 law fixed for
 * set rows. The spec tree stays the hub's navigation spine (sidebar, notes,
 * questions); the sidebar's flashcards rows keep their spec-keyed hrefs,
 * which the deck route still serves through the legacy-subtopic branch.
 *
 * Fold law (one fleet case, cie-a-level-computer-science-19): a deckSlug
 * repeated under two sections folds into its FIRST section (first-write-
 * wins, the corpus's own ordering law) — every card stays reachable and the
 * course total stays exact; the section's card total includes the fold.
 */
import type { ExamQuestionTopic, Flashcard } from "@/lib/contracts";

export interface FlashcardDeckMeta {
  /** the deck slug — the deck route key and the progress/deck-session key */
  code: string;
  /** SME section slug this deck belongs to (first appearance) */
  sectionCode: string;
  /** display title — the questions plane's SME name, else slug-derived */
  title: string;
  /** cards in this deck, corpus (SME) order */
  count: number;
}

export interface FlashcardDeckSection {
  /** SME section slug */
  code: string;
  /** leading section number from the slug ("1-mechanics…" → 1), else null */
  number: number | null;
  /** display title — SME section name, else slug-derived */
  title: string;
  /** decks in corpus (SME) order */
  decks: FlashcardDeckMeta[];
}

export interface DeckIndex {
  sections: FlashcardDeckSection[];
  /** deckSlug → card ids, corpus (SME) order */
  cardsByDeck: Record<string, string[]>;
}

/** "2-7-organic-chemistry-introduction" → "2.7 Organic Chemistry
 *  Introduction"; "paper-1-overview" → "Paper 1 Overview". Deterministic,
 *  derived from the corpus-native slug only. */
export function deckTitleFromSlug(slug: string): string {
  const two = slug.match(/^(\d+)-(\d+)-(.+)$/);
  if (two) return `${two[1]}.${two[2]} ${titleCase(two[3])}`;
  return titleCase(slug);
}

/** "1-mechanics-and-materials" → { number: 1, title: "Mechanics And
 *  Materials" }; a slug without a leading number → { null, title-cased }. */
export function sectionFromSlug(slug: string): { number: number | null; title: string } {
  const one = slug.match(/^(\d+)-(.*)$/);
  if (one) return { number: parseInt(one[1], 10) || null, title: titleCase(one[2]) };
  return { number: null, title: titleCase(slug) };
}

/** "e-m-f-and-modelling-resistance" → "E M F And Modelling Resistance".
 *  Empty segments (trailing dashes) drop out. */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Build the SME-native deck index from the flashcards corpus (array order
 * preserved — it IS the SME order) and the questions plane (title source).
 */
export function buildDeckSections(
  flashcards: readonly Flashcard[],
  questionTopics: readonly ExamQuestionTopic[],
): DeckIndex {
  // title sources from the questions plane (first set wins; every set of a
  // topic carries the same SME name/section)
  const deckNames = new Map<string, string>();
  const sectionNames = new Map<string, string>();
  for (const t of questionTopics) {
    if (t.topicSlug && !deckNames.has(t.topicSlug)) deckNames.set(t.topicSlug, t.name);
    if (t.sectionSlug && !sectionNames.has(t.sectionSlug)) sectionNames.set(t.sectionSlug, t.section);
  }

  const cardsByDeck: Record<string, string[]> = {};
  const deckMeta = new Map<string, FlashcardDeckMeta>();
  const sectionOrder: string[] = [];
  const sectionDecks = new Map<string, string[]>(); // sectionCode → deck slugs

  for (const card of flashcards) {
    const deckSlug = card.deckSlug;
    if (!deckSlug) continue; // no corpus deck anchor — the legacy spec path still reaches it
    let meta = deckMeta.get(deckSlug);
    if (!meta) {
      // a section enters the index only when a NEW deck lands in it — a
      // deck that folds into its first section cannot create an empty row
      const sectionCode = card.sectionSlug ?? "";
      if (!sectionDecks.has(sectionCode)) {
        sectionOrder.push(sectionCode);
        sectionDecks.set(sectionCode, []);
      }
      meta = {
        code: deckSlug,
        sectionCode,
        title: deckNames.get(deckSlug) ?? deckTitleFromSlug(deckSlug),
        count: 0,
      };
      deckMeta.set(deckSlug, meta);
      sectionDecks.get(sectionCode)!.push(deckSlug);
    }
    // fold law: a deckSlug repeating under another section stays with its
    // first section — the card is still counted and served here
    meta.count += 1;
    (cardsByDeck[deckSlug] ??= []).push(card.id);
  }

  const sections: FlashcardDeckSection[] = sectionOrder.map((code) => {
    const named = sectionNames.get(code);
    const derived = code ? sectionFromSlug(code) : { number: null, title: "" };
    // SME's own section name leads with its number ("1. Mechanics &
    // Materials") — strip it so NumberedLabel doesn't print it twice
    const stripped = named?.replace(/^(\d+)\.\s*/, "") ?? derived.title;
    return {
      code,
      number: named
        ? (derived.number ?? (parseInt(named.match(/^(\d+)\./)?.[1] ?? "", 10) || null))
        : derived.number,
      title: stripped || derived.title || "Flashcards",
      decks: (sectionDecks.get(code) ?? []).map((s) => deckMeta.get(s)!),
    };
  });

  return { sections, cardsByDeck };
}
