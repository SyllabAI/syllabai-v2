"use client";

/**
 * The questionbank index listing — the client half of the exam-questions
 * select page (page.tsx keeps the server-side laws: ?q= and ?spec=
 * redirects, the paper-scope join, the in-scope row computation). Carries
 * the shared MathsGenie toolbar (trace 1a19acb6ec437e25: "the same
 * three-page treatment could get search/resume on exam-questions and
 * flashcards" — the exact treatment the revision-notes index carries) and
 * the QUESTIONS-ONLY rings (traces 1a195fd0b0947695 + 1a1982281a3d7a65 —
 * this select page owns its own denominator: answered parts ÷ available
 * questions, never notes, never flashcards).
 *
 * Resume of record: the set most recently engaged — max `at` across
 * selfScores + mcqAnswers (recordSelfScore / recordMcqAnswer stamp every
 * scored part with its set's topicSlug), i.e. the set the learner last
 * worked a scored part in. Shown only while that set is listed on THIS
 * page under the current paper scope (rows and Other sets alike) — an
 * out-of-scope target stays honest by not offering the jump. Nothing
 * engaged yet → no button, exactly the notes-index law.
 *
 * Search law: identical to the notes index — a sub-topic whose own title
 * matches shows ALL its sets; otherwise only the sets whose titles match
 * (row counts recompute over the shown sets); a matching query forces the
 * multi-set expansion open so hits stay visible; "Other sets" filters by
 * set name; the empty state names the query. Search is a transient filter:
 * it never hides Resume.
 *
 * Row-link law (SME selector audit D3, 2026-11-03): a row's question count
 * is the sub-topic's AGGREGATE, so the row's primary target must hold every
 * counted question — single-set rows open the set, multi-set rows open the
 * grouped ?subtopic= landing (the chevron keeps every set one click away
 * inline). First-write-wins row targets hid ~8.3k questions fleet-wide.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberedLabel } from "@/components/hub/chrome";
import { SelectToolbar } from "@/components/hub/select-toolbar";
import { AddToTestLink } from "@/components/teacher/add-to-test-link";
import { ProgressRing } from "@/components/hub/progress-ring";
import { useCourseProgress, type Course } from "@/lib/progress";

export interface QbSet {
  slug: string;
  title: string;
  count: number;
}

export interface QbSub {
  code: string;
  /** corpus-native label — null for generated (-gen) rows, never rendered */
  label: string | null;
  title: string;
  sets: QbSet[];
  /** whole-set question count over the in-scope sets (the server's row
   * filter of record); the listing recomputes it over the SHOWN sets */
  count: number;
}

export interface QbTopic {
  code: string;
  number: number;
  title: string;
  subs: QbSub[];
}

export interface QbLooseSet {
  slug: string;
  title: string;
  count: number;
}

const ZERO = { notes: 0, questions: 0, flashcards: 0 };

export function QuestionbankIndex({
  course,
  counts,
  rows,
  unplaced,
  paperLabel,
  scoped = false,
  scopedTopicTitle = null,
  scopedTopicNumber = null,
}: {
  course: Course;
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  rows: QbTopic[];
  unplaced: QbLooseSet[];
  /** label of the active paper scope (e.g. "Paper 1C") — null when unscoped */
  paperLabel: string | null;
  /** row-link-policy landing (?subtopic=): only the scoped sub-topic's row
   *  is listed, with a clear-scope link back to the full bank */
  scoped?: boolean;
  scopedTopicTitle?: string | null;
  scopedTopicNumber?: number | null;
}) {
  const progress = useCourseProgress(course);
  const base = `/courses/${course}`;

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Resume target: the most recently scored set (max `at` across the two
  // question-plane events), resolved against EVERY listed set of this page —
  // rows and Other sets alike — under the current paper scope.
  const resumeSet = useMemo(() => {
    let slug: string | null = null;
    let bestAt = -1;
    const scan = (entries: Iterable<{ topicSlug: string | null; at: number }>) => {
      for (const v of entries) {
        if (v.topicSlug && v.at > bestAt) {
          bestAt = v.at;
          slug = v.topicSlug;
        }
      }
    };
    scan(Object.values(progress.selfScores));
    scan(Object.values(progress.mcqAnswers));
    if (!slug) return null;
    const listed = [...rows.flatMap((t) => t.subs.flatMap((s) => s.sets)), ...unplaced];
    return listed.find((s) => s.slug === slug) ?? null;
  }, [rows, unplaced, progress.selfScores, progress.mcqAnswers]);

  // Topic groups of record: sub-topics with (matching) sets, corpus order,
  // per-topic totals. A sub-topic whose own title matches shows ALL its
  // sets; otherwise only the sets whose titles match. Recomputed on query
  // changes, never on learner-progress re-renders.
  const groups = useMemo(() => {
    return rows
      .map((t) => {
        const subs = t.subs
          .map((s) => {
            const shown =
              !searching || matchTitle(s.title, q)
                ? s.sets
                : s.sets.filter((x) => matchTitle(x.title, q));
            return { ...s, sets: shown, count: shown.reduce((a, x) => a + x.count, 0) };
          })
          .filter((s) => s.sets.length > 0);
        return { topic: t, subs, total: subs.reduce((a, s) => a + s.count, 0) };
      })
      .filter((g) => g.subs.length > 0);
  }, [rows, searching, q]);

  const loose = useMemo(
    () => unplaced.filter((s) => !searching || matchTitle(s.title, q)),
    [unplaced, searching, q],
  );

  const nothingAtAll = groups.length === 0 && loose.length === 0;
  if (nothingAtAll && !searching) {
    return (
      <Card className="mt-6">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {paperLabel ? (
            <>
              No question sets cover the spec points tested in{" "}
              <span className="font-medium text-foreground">{paperLabel}</span> yet — we
              currently cover other papers for this course.{" "}
              <Link href={`${base}/exam-questions`} className="underline hover:text-foreground">
                Clear the paper scope
              </Link>
              .
            </>
          ) : (
            "No question sets for this course yet."
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* MathsGenie-pattern toolbar (trace 1a19acb6ec437e25): search left,
          Resume right — Resume renders only once this course's learner
          overlay holds a scored part in a set listed here. */}
      {/* t-ui-polish run-004: hero→body join at the mt-6 family rhythm
          (was mt-4; when the paper filter bar renders, both joins now sit
          at the same 24px step as every other course-header surface). */}
      <div className="mt-6">
        <SelectToolbar
          searchLabel="Search exam questions"
          searchPlaceholder="Search topics or sets..."
          query={query}
          onQueryChange={setQuery}
          resume={resumeSet ? { href: `${base}/exam-questions/${resumeSet.slug}`, title: resumeSet.title } : null}
        />
      </div>

      {nothingAtAll && searching ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No sets match{" "}
            <span className="font-medium text-foreground">&ldquo;{query.trim()}&rdquo;</span>.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border/60">
          {scoped && (
            <div className="flex flex-wrap items-center gap-2 py-3">
              {scopedTopicNumber !== null && scopedTopicTitle && (
                <span className="text-[15px] font-semibold">
                  <NumberedLabel number={scopedTopicNumber} title={scopedTopicTitle} />
                </span>
              )}
              <span className="text-xs text-muted-foreground">· sub-topic scope</span>
              <Link
                href={`${base}/exam-questions`}
                className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
              >
                All topics
              </Link>
            </div>
          )}
          {groups.map(({ topic, subs, total }) => (
            <details key={topic.code} open className="group/topic py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <h2 className="text-[15px] font-semibold">
                  <NumberedLabel number={topic.number} title={topic.title} />
                </h2>
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {total} question{total === 1 ? "" : "s"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <AddToTestLink courseSlug={course} codes={topic.subs.map((s) => s.code)} />
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open/topic:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {subs.map((sub) => {
                  const countsK = counts[sub.code] ?? ZERO;
                  const label = sub.label ? (
                    <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {sub.label}
                    </span>
                  ) : null;
                  const rowInner = (
                    <>
                      <ProgressRing
                        course={course}
                        subtopic={sub.code}
                        counts={countsK}
                        size={18}
                        dimension="questions"
                      />
                      {label}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover/link:text-primary">
                        {sub.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {sub.count} question{sub.count === 1 ? "" : "s"}
                      </span>
                    </>
                  );
                  if (sub.sets.length === 1) {
                    return (
                      <li key={sub.code}>
                        <Link
                          href={`${base}/exam-questions/${sub.sets[0].slug}`}
                          className="group/link flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                        >
                          {rowInner}
                        </Link>
                      </li>
                    );
                  }
                  // multi-set sub-topic (MCQ vs structured variants): the row
                  // shows the AGGREGATE count, so its primary link follows the
                  // row-link policy (SME selector audit D3) — it lands on the
                  // grouped ?subtopic= view that holds every counted question;
                  // the chevron expands every set inline for the fast path
                  // (sidebar parity — the tree expander lists the same per-set
                  // entries). Searching forces the expansion open so matches
                  // stay visible.
                  return (
                    <li key={sub.code}>
                      <details className="group/sub" open={searching}>
                        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                          <Link
                            href={`${base}/exam-questions?subtopic=${encodeURIComponent(sub.code)}`}
                            className="group/link flex min-w-0 flex-1 items-center gap-2.5"
                          >
                            {rowInner}
                          </Link>
                          <ChevronDown
                            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/sub:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <ul className="ml-9 mt-0.5 space-y-0.5 border-l pl-2">
                          {sub.sets.map((s) => (
                            <li key={s.slug}>
                              <Link
                                href={`${base}/exam-questions/${s.slug}`}
                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <span className="min-w-0 truncate">{s.title}</span>
                                <span className="shrink-0 tabular-nums">
                                  {s.count} question{s.count === 1 ? "" : "s"}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}

          {loose.length > 0 && (
            <section aria-label="Other sets" className="py-3">
              <h2 className="text-[15px] font-semibold">Other sets</h2>
              <ul className="mt-1.5 space-y-0.5">
                {loose.map((set) => (
                  <li key={set.slug}>
                    <Link
                      href={`${base}/exam-questions/${set.slug}`}
                      className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <FileQuestion className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                        {set.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {set.count} question{set.count === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** Case-insensitive substring match; empty query matches everything. */
function matchTitle(title: string, q: string): boolean {
  return !q || title.toLowerCase().includes(q);
}
