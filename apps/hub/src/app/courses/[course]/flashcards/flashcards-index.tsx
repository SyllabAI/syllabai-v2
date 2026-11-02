"use client";

/**
 * The flashcards deck grid — the client half of the flashcards select page
 * (page.tsx keeps the corpus badge/prose and the deck computation). Carries
 * the shared MathsGenie toolbar (trace 1a19acb6ec437e25: "the same
 * three-page treatment could get search/resume on exam-questions and
 * flashcards" — the exact treatment the revision-notes index carries) and
 * the FLASHCARDS-ONLY rings (traces 1a195fd0b0947695 + 1a1982281a3d7a65 —
 * this select page owns its own denominator: rated cards ÷ available
 * cards, never notes, never questions). The DeckDueBadge keeps its
 * scheduler-truth role beside each ring.
 *
 * Resume of record: the deck holding the most recently RATED card (max
 * `at` across progress.flashcards — rateFlashcard stamps every rating),
 * shown only while that deck is listed on THIS page; nothing rated yet →
 * no button, exactly the notes-index law.
 *
 * Search law: identical to the notes index — a deck matches when its
 * sub-topic title OR its parent topic title matches (the grid card shows
 * both); the empty state names the query. Search is a transient filter:
 * it never hides Resume.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberedLabel } from "@/components/hub/chrome";
import { SelectToolbar } from "@/components/hub/select-toolbar";
import { ProgressRing } from "@/components/hub/progress-ring";
import { DeckDueBadge } from "./deck-due-badge";
import { useCourseProgress, type Course } from "@/lib/progress";

export interface DeckCard {
  code: string;
  title: string;
  topicNumber: number;
  topicTitle: string;
  count: number;
}

const ZERO_COUNTS = { notes: 0, questions: 0, flashcards: 0 };

export function FlashcardsIndex({
  course,
  counts,
  decks,
}: {
  course: Course;
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  decks: DeckCard[];
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
    return decks.find((d) => d.code === code) ?? null;
  }, [decks, progress.flashcards]);

  const shown = useMemo(
    () =>
      decks.filter(
        (d) => !searching || matchTitle(d.title, q) || matchTitle(d.topicTitle, q),
      ),
    [decks, searching, q],
  );

  if (decks.length === 0) {
    // the honest empty course — keep the UX-audit next action (point at the
    // question bank); no toolbar (nothing to search, nothing to resume)
    return (
      <Card className="mt-6">
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
      <div className="mt-4">
        <SelectToolbar
          searchLabel="Search flashcard decks"
          searchPlaceholder="Search topics or decks..."
          query={query}
          onQueryChange={setQuery}
          resume={resumeDeck ? { href: `${base}/flashcards/${resumeDeck.code}`, title: resumeDeck.title } : null}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No decks match{" "}
            <span className="font-medium text-foreground">&ldquo;{query.trim()}&rdquo;</span>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((d) => (
            <Link
              key={d.code}
              href={`${base}/flashcards/${d.code}`}
              className="group min-w-0 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ProgressRing
                  course={course}
                  subtopic={d.code}
                  counts={counts[d.code] ?? ZERO_COUNTS}
                  size={18}
                  dimension="flashcards"
                />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">
                  {d.title}
                </p>
                <DeckDueBadge course={course} subtopicCode={d.code} />
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <NumberedLabel number={d.topicNumber} title={d.topicTitle} /> · {d.count} card
                {d.count === 1 ? "" : "s"}
              </p>
            </Link>
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
