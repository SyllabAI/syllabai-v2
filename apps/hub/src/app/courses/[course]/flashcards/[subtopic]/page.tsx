import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { ResourcePanel } from "@/components/hub/resource-panel";
import { DeckPlayer, type DeckCard } from "./deck-player";
import { pilotFlashcardParams } from "@/lib/static-params";


/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return pilotFlashcardParams();
}
export default async function FlashcardDeckPage({
  params,
}: {
  params: Promise<{ course: string; subtopic: string }>;
}) {
  const { course: slug, subtopic: subtopicParam } = await params;
  // Next 16 hands dynamic segments through percent-encoded, and the corpus's
  // SME-native subtopic codes contain a colon ("ial-biology-T1:SUB_") — the
  // raw encoded value misses subtopicByCode and 404s every non-pilot deck.
  // Decode (tolerantly) before the lookup so both "T1:SUB_" and "T1%3ASUB_" hit.
  let subtopicCode = subtopicParam;
  try {
    subtopicCode = decodeURIComponent(subtopicParam);
  } catch {
    // malformed escape sequence — fall back to the raw segment
  }
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  // Two deck keys share this route (trace 1a19f6776ca5a619):
  //   1. the SME deck slug — canonical, what the select page's rows and the
  //      Resume button link to. The deck is the REAL corpus deck (lib/
  //      flashcard-decks): its cards are exactly what the row counted, in
  //      SME order, titled what SME titles it.
  //   2. the legacy spec-subtopic code — the sidebar's spec-tree rows and
  //      pre-existing links deep-link here. The spec tree stays the hub's
  //      navigation spine, so those rows must keep landing on the card set
  //      their count promised (the spec-anchored union deck, exactly as
  //      before this rebuild).
  const deck = hub.deckSections.flatMap((s) => s.decks).find((d) => d.code === subtopicCode) ?? null;
  const section = deck ? hub.deckSections.find((s) => s.code === deck.sectionCode) ?? null : null;
  const subtopic = hub.index.subtopicByCode.get(subtopicCode);
  if (!deck && !subtopic) notFound();
  const topic = subtopic ? hub.index.topicByCode.get(subtopic.topicCode) : undefined;

  const cardIds = new Set(
    (deck ? hub.cardsByDeck[subtopicCode] : hub.cardsBySubtopic[subtopicCode]) ?? [],
  );
  const cards: DeckCard[] = hub.flashcards
    .filter((c) => cardIds.has(c.id))
    .map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      sourceNoteId: c.sourceNoteId,
      sourceTitle: c.sourceTitle,
      provenanceTier: c.provenanceTier,
      // DC-11 scope family: the deck-internal card-type axis (null buckets
      // as "Unclassified" in the player's filter menu)
      cardType: c.cardType ?? null,
    }));

  const { meta } = hub;
  const deckTitle = deck?.title ?? subtopic!.title;

  return (
    <div className="flex w-full">
      <ResourcePanel variant="flashcards" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* "(Chemistry)" was redundant with breadcrumb + sidebar and wrapped
              the h1 to two lines at 390px (UX audit P3-16) */}
          <CourseHeader
            meta={meta}
            title={`${deckTitle}: Flashcards`}
            crumb={deckTitle}
            description={
              deck
                ? `${cards.length} card${cards.length === 1 ? "" : "s"} for “${deck.title}”${section?.title ? ` in ${section.title}` : ""} — the deck as imported, SME deck order.`
                : topic
                  ? `Deck ${topic.number}.${subtopic!.label} — ${cards.length} card${cards.length === 1 ? "" : "s"} for “${subtopic!.title}”.`
                  : `${cards.length} cards for “${subtopic!.title}”.`
            }
          />
          <div className="mt-6">
            {/* keyed per deck: navigating deck→deck must re-init the run
                state (baseOrder/pos/filter are per-deck session state) */}
            <DeckPlayer
              key={`${meta.slug}:${subtopicCode}`}
              course={meta.slug}
              subtopicCode={subtopicCode}
              cards={cards}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
