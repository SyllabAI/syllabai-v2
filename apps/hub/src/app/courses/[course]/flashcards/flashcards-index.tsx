"use client";

/**
 * The flashcards topic listing — the client half of the flashcards select
 * page (page.tsx keeps the corpus posture and the deck computation). Carries
 * the shared MathsGenie toolbar (trace 1a19acb6ec437e25: "the same
 * three-page treatment could get search/resume on exam-questions and
 * flashcards" — the exact treatment the revision-notes index carries) and
 * the FLASHCARDS-ONLY rings (traces 1a195fd0b0947695 + 1a1982281a3d7a65 —
 * this select page owns its own denominator: rated cards ÷ available
 * cards, never notes, never questions). The DeckDueBadge keeps its
 * scheduler-truth role beside each row's count.
 *
 * Listing anatomy of record (this update): the RevisionDojo pattern the
 * revision-notes and exam-questions listings carry — numbered topic sections
 * (native <details open>) whose rows are the sub-topic DECKS, one deck per
 * sub-topic, each row ProgressRing + corpus-native label (-gen never
 * rendered) + title + right-aligned card count. No expansion tier: decks
 * have no sub-decks, so every row is a single link (the chevron lives on the
 * topic header only).
 *
 * Resume of record: the deck holding the most recently RATED card (max
 * `at` across progress.flashcards — rateFlashcard stamps every rating),
 * shown only while that deck is listed on THIS page; nothing rated yet →
 * no button, exactly the notes-index law.
 *
 * Search law: identical to the notes/questionbank indexes at group level —
 * a topic whose own title matches shows ALL its decks; otherwise only the
 * decks whose titles match (topic totals recompute over the shown decks);
 * the empty state names the query. Search is a transient filter: it never
 * hides Resume.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberedLabel } from "@/components/hub/chrome";
import { SelectToolbar } from "@/components/hub/select-toolbar";
import { ProgressRing } from "@/components/hub/progress-ring";
import { DeckDueBadge } from "./deck-due-badge";
import { useCourseProgress, type Course } from "@/lib/progress";

export interface DeckCard {
  code: string;
  title: string;
  /** corpus-native label — null for generated (-gen) rows, never rendered */
  label: string | null;
  count: number;
}

export interface FcTopic {
  code: string;
  number: number;
  title: string;
  decks: DeckCard[];
}

const ZERO_COUNTS = { notes: 0, questions: 0, flashcards: 0 };

export function FlashcardsIndex({
  course,
  counts,
  topics,
}: {
  course: Course;
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  topics: FcTopic[];
}) {
  const progress = useCourseProgress(course);
  const base = `/courses/${course}`;

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Resume target: the deck whose card was rated most recently (max `at`
  // across the flashcard plane), resolved against the decks listed here.
  const resumeDeck = useMemo(() => {
    let code: string | null = null;
    let bestAt = -1;
    for (const v of Object.values(progress.flashcards)) {
      if (v.subtopic && v.at > bestAt) {
        bestAt = v.at;
        code = v.subtopic;
      }
    }
    if (!code) return null;
    return topics.flatMap((t) => t.decks).find((d) => d.code === code) ?? null;
  }, [topics, progress.flashcards]);

  // Topic groups of record: topics with (matching) decks, corpus order,
  // per-topic totals. A topic whose own title matches shows ALL its decks;
  // otherwise only the decks whose titles match. Recomputed on query and
  // server payload changes, never on learner-progress re-renders.
  const groups = useMemo(
    () =>
      topics
        .map((t) => {
          const decks =
            !searching || matchTitle(t.title, q)
              ? t.decks
              : t.decks.filter((d) => matchTitle(d.title, q));
          return { topic: t, decks, total: decks.reduce((a, d) => a + d.count, 0) };
        })
        .filter((g) => g.decks.length > 0),
    [topics, searching, q],
  );

  if (topics.length === 0) {
    // the honest empty course — keep the UX-audit next action (point at the
    // question bank); no toolbar (nothing to search, nothing to resume)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <p>No flashcard decks imported for this course yet.</p>
          <p className="mt-2">
            <Link
              href={`${base}/exam-questions`}
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              Work exam questions for this course instead
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* MathsGenie-pattern toolbar (trace 1a19acb6ec437e25): search left,
          Resume right — Resume renders only once this course's learner
          overlay holds a card rating. */}
      <SelectToolbar
        searchLabel="Search flashcard decks"
        searchPlaceholder="Search topics or decks..."
        query={query}
        onQueryChange={setQuery}
        resume={resumeDeck ? { href: `${base}/flashcards/${resumeDeck.code}`, title: resumeDeck.title } : null}
      />

      {groups.length === 0 && searching ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No decks match{" "}
            <span className="font-medium text-foreground">&ldquo;{query.trim()}&rdquo;</span>.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border/60">
          {groups.map(({ topic, decks, total }) => (
            <details key={topic.code} open className="group/topic py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <h2 className="text-[15px] font-semibold">
                  <NumberedLabel number={topic.number} title={topic.title} />
                </h2>
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {total} card{total === 1 ? "" : "s"}
                </span>
                <ChevronDown
                  className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open/topic:rotate-180"
                  aria-hidden
                />
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {decks.map((d) => (
                  <li key={d.code}>
                    <Link
                      href={`${base}/flashcards/${d.code}`}
                      className="group/link flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <ProgressRing
                        course={course}
                        subtopic={d.code}
                        counts={counts[d.code] ?? ZERO_COUNTS}
                        size={18}
                        dimension="flashcards"
                      />
                      {d.label && (
                        <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {d.label}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover/link:text-primary">
                        {d.title}
                      </span>
                      <DeckDueBadge course={course} subtopicCode={d.code} />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {d.count} card{d.count === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

/** Case-insensitive substring match; empty query matches everything. */
function matchTitle(title: string, q: string): boolean {
  return !q || title.toLowerCase().includes(q);
}
