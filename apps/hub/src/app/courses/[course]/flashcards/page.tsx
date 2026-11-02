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
 * the header, then numbered topic sections whose rows are DECKS — each row a
 * sub-topic deck (flashcards-only progress ring + corpus-native label + title
 * + right-aligned card count) clicking through to the deck player. The grid
 * era is gone: topic grouping carries the "which topic am I in" context the
 * old card grid repeated under every deck title, the corpus badge/prose block
 * folds into the one-liner (the deck player keeps the self-report-evidence
 * disclosure at the point of rating), and the legacy full-width shell joins
 * the siblings' max-w-3xl column.
 *
 * Ring semantics of record (operator traces 1a195fd0b0947695 +
 * 1a1982281a3d7a65): each deck row carries the FLASHCARDS-ONLY ring — rated
 * cards ÷ available cards, never notes, never questions — this select page
 * owns its own denominator (the revision-notes page counts reads, the
 * exam-questions page counts answered parts; the combined engagement ring
 * stays the sidebar's posture). The DeckDueBadge keeps its scheduler-truth
 * role beside the count.
 *
 * The listing renders in flashcards-index.tsx (client) since trace
 * 1a19acb6ec437e25: it carries the revision-notes index's MathsGenie toolbar
 * — search left, Resume (the deck whose card was rated most recently) right
 * — which needs the learner overlay; the server page keeps the corpus posture
 * and hands the client a slim, serializable topic/deck payload.
 */
export default async function FlashcardsIndexPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta, stats } = hub;

  // Slim, serializable payload for the client listing (flashcards-index):
  // numbered topics (corpus order) whose rows are the sub-topic decks with
  // cards. Decks = one per sub-topic (cardsBySubtopic), so a row's card count
  // and its ring denominator (hub.counts[c].flashcards) resolve identically.
  const topics: FcTopic[] = hub.index.tree.topics.flatMap((t) => {
    const decks: DeckCard[] = t.subtopics.flatMap((s) => {
      const count = hub.cardsBySubtopic[s.code]?.length ?? 0;
      return count === 0
        ? []
        : [
            {
              code: s.code,
              title: s.title,
              // corpus-native label — null for generated (-gen) rows, never rendered
              label: s.code.endsWith("-gen") ? null : s.label || null,
              count,
            },
          ];
    });
    return decks.length === 0
      ? []
      : [{ code: t.code, number: t.number, title: t.title, decks }];
  });
  const deckCount = topics.reduce((a, t) => a + t.decks.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Flashcards`}
        crumb="Flashcards"
        description={`Choose a topic to practise active recall — ${stats.flashcards} flashcard${stats.flashcards === 1 ? "" : "s"} across ${deckCount} subtopic${deckCount === 1 ? "" : "s"}, imported verbatim from the licensed deck corpus; rated cards return on an expanding review schedule.`}
      />

      {/* MathsGenie toolbar + numbered-topic listing + empty states — client
          (flashcards-index) over the slim payload above. The no-decks card
          keeps the UX-audit next action (point at the question bank). */}
      <div className="mt-6">
        <FlashcardsIndex course={meta.slug} counts={hub.counts} topics={topics} />
      </div>
    </div>
  );
}
