import { notFound } from "next/navigation";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { FlashcardsIndex, type DeckCard, type FcTopic } from "./flashcards-index";
import { allCourseParams } from "@/lib/static-params";


/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}
/**
 * Flashcards select page — the same RevisionDojo-pattern treatment as the
 * revision-notes and exam-questions select pages (traces 1a19342adcb572ed +
 * 1a19368107d136f1): one narrow centered column, an RD-style one-liner under
 * the header, then numbered SECTIONS whose rows are the real SME DECKS —
 * each row a deck (flashcards-only progress ring + title + right-aligned
 * card count) clicking through to the deck player. The grid era is gone and
 * so is the spec-tree detour (trace 1a19f6776ca5a619, "we imported from them
 * but why is ours like this?"): the corpus is a verbatim SME mirror that
 * already knows its own organization (every card carries sectionSlug +
 * deckSlug; file order IS the SME deck order), so the listing now renders
 * THAT — hub.deckSections, built by lib/flashcard-decks — instead of
 * folding the 37-deck corpus onto the 11-row official spine (which merged
 * decks, split decks, and stranded 11.8% of cards fleet-wide with no spine
 * home). The spec tree stays the hub's navigation spine (sidebar, notes,
 * questions); this page and the deck pages speak the deck plane's own
 * language, and the sidebar's spec-keyed deck links keep working through
 * the deck route's legacy-subtopic branch.
 *
 * Ring semantics of record (operator traces 1a195fd0b0947695 +
 * 1a1982281a3d7a65): each deck row carries the FLASHCARDS-ONLY ring — rated
 * cards ÷ available cards, never notes, never questions — this select page
 * owns its own denominator (the revision-notes page counts reads, the
 * exam-questions page counts answered parts; the combined engagement ring
 * stays the sidebar's posture). The denominator is now the DECK's own card
 * count (what the deck page serves — row-count honesty per the D3 law), and
 * the ring numerator follows the deck key the deck pages stamp ratings with.
 * The DeckDueBadge keeps its scheduler-truth role beside the count.
 *
 * The listing renders in flashcards-index.tsx (client) since trace
 * 1a19acb6ec437e25: it carries the revision-notes index's MathsGenie toolbar
 * — search left, Resume (the deck whose card was rated most recently) right
 * — which needs the learner overlay; the server page keeps the corpus posture
 * and hands the client a slim, serializable section/deck payload.
 */
export default async function FlashcardsIndexPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta } = hub;

  // Slim, serializable payload for the client listing (flashcards-index):
  // numbered SME sections (corpus order = SME order) whose rows are the real
  // decks with cards. One row per deck; the row's card count IS the deck's
  // card count, so ring denominators resolve identically on both sides.
  const topics: FcTopic[] = hub.deckSections.flatMap((s, i) => {
    const decks: DeckCard[] = s.decks
      .filter((d) => d.count > 0)
      .map((d) => ({
        code: d.code,
        title: d.title,
        count: d.count,
      }));
    if (decks.length === 0) return [];
    return [{ code: s.code, number: s.number ?? i + 1, title: s.title, decks }];
  });
  const deckCount = topics.reduce((a, t) => a + t.decks.length, 0);
  // the truthful card total: what the listed rows actually hold (every card
  // with a corpus deck anchor; count === stats.flashcards on deck-bearing
  // courses, since the corpus deck coverage is complete)
  const cardTotal = topics.reduce((a, t) => a + t.decks.reduce((b, d) => b + d.count, 0), 0);

  // Ring denominators keyed by DECK code (the deck page's key), not by spec
  // subtopic — the row ring and the deck page's ledger now read one key.
  const deckCounts: Record<string, { notes: number; questions: number; flashcards: number }> = {};
  for (const t of topics) {
    for (const d of t.decks) {
      deckCounts[d.code] = { notes: 0, questions: 0, flashcards: d.count };
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Flashcards`}
        crumb="Flashcards"
        description={`Choose a deck to practise active recall — ${cardTotal} flashcard${cardTotal === 1 ? "" : "s"} across ${deckCount} deck${deckCount === 1 ? "" : "s"}, imported verbatim from the licensed deck corpus; rated cards return on an expanding review schedule.`}
      />
      {/* MathsGenie toolbar + numbered-section listing + empty states — client
          (flashcards-index) over the slim payload above. The no-decks card
          keeps the UX-audit next action (point at the question bank). */}
      <div className="mt-6">
        <FlashcardsIndex course={meta.slug} counts={deckCounts} topics={topics} />
      </div>
    </div>
  );
}
