import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { FlashcardsIndex, type DeckCard } from "./flashcards-index";
import { allCourseParams } from "@/lib/static-params";


/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}
/**
 * Flashcards select page — per-subtopic recall decks. Ring semantics of
 * record (operator traces 1a195fd0b0947695 + 1a1982281a3d7a65): each deck
 * card carries the FLASHCARDS-ONLY ring — rated cards ÷ available cards,
 * never notes, never questions — each select page owns its own denominator
 * (the revision-notes page counts reads, the exam-questions page counts
 * answered parts; the combined engagement ring stays the sidebar's
 * posture). The DeckDueBadge keeps its scheduler-truth role beside it.
 *
 * The grid renders in flashcards-index.tsx (client) since trace
 * 1a19acb6ec437e25: it joined the revision-notes index's MathsGenie toolbar
 * treatment — search left, Resume (the deck whose card was rated most
 * recently) right — which needs the learner overlay; the server page keeps
 * the corpus badge/prose and hands the client a slim deck payload.
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

  // Slim, serializable payload for the client grid (flashcards-index).
  const decks: DeckCard[] = hub.index.tree.topics.flatMap((t) =>
    t.subtopics
      .map((s) => ({
        code: s.code,
        title: s.title,
        topicNumber: t.number,
        topicTitle: t.title,
        count: hub.cardsBySubtopic[s.code]?.length ?? 0,
      }))
      .filter((d) => d.count > 0),
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Flashcards`}
        crumb="Flashcards"
        description={`Per-subtopic recall decks — ${stats.flashcards} cards. Rating a card (Still learning / Know) feeds your subtopic rings in the local overlay; rated cards return on an expanding review schedule, and on the pilot course signed-in learners also record ratings to their account as self-report evidence (never mastery).`}
      />

      <div className="mt-6 space-y-2">
        <Badge variant="outline" className="border-info/30 text-[10px] text-info">
          RULE_DERIVED corpus content
        </Badge>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Cards are imported verbatim from the operator-licensed pilot deck corpus
          (front/back markdown, card types preserved). Their spec-point anchors are kept on
          every card and drive the subtopic placement — nothing here is fabricated. Courses the
          upstream corpus has no decks for show honestly empty.
        </p>
      </div>

      {/* MathsGenie toolbar + deck grid + empty states — client
          (flashcards-index) over the slim payload above. The no-decks card
          keeps the UX-audit next action (point at the question bank). */}
      <FlashcardsIndex course={meta.slug} counts={hub.counts} decks={decks} />
    </div>
  );
}
