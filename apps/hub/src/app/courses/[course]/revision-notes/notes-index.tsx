"use client";

/**
 * Revision Notes index — the same RevisionDojo-pattern treatment as the
 * exam-questions questionbank index (trace 1a19342adcb572ed, merged PR #578;
 * "same treatment" operator instruction for the notes index): numbered topic
 * sections as native <details> (no toggle state), each row a SUB-TOPIC —
 * ProgressRing over the real learner overlay + corpus-native label + title +
 * a right-aligned note count — clicking through to the sub-topic's canonical
 * note (first in corpus order, the same target hrefs.notes feeds the
 * sidebar). Sub-topics holding more than one note expose a chevron that
 * expands every note with its read/unread dot.
 *
 * Guided lessons stay first-class (operator law, trace 1a1810c1ef1cb521):
 * every guided note carries its own "Start guided lesson" action as a
 * SIBLING link — never nested inside the row's <a> (invalid HTML) — both at
 * single-row level and inside the expanded note list. Notes with no
 * sub-topic anchor keep the honest loose-notes section (T-HUB-LOOSE-COPY-1
 * copy, incl. the adjudicated-no-spec-home courses).
 *
 * Grouping still comes from the canonical spec tree, never a second
 * taxonomy; ?subtopic= (and legacy ?spec=, resolved server-side) highlights
 * and auto-opens its row exactly as before.
 */
import { useMemo } from "react";
import Link from "next/link";
import { ChevronDown, FileText, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberedLabel } from "@/components/hub/chrome";
import { ProgressRing } from "@/components/hub/progress-ring";
import { useCourseProgress, type Course } from "@/lib/progress";
import { looseAnchorCopy } from "@/lib/loose-copy";
import { cn } from "@/lib/utils";
import type { SpecTree } from "@/lib/spec-tree";

export interface NoteListItem {
  noteId: string;
  title: string;
  guidedStudy: boolean;
  specPointCodes: string[];
  subtopic: string | null;
}

const ZERO = { notes: 0, questions: 0, flashcards: 0 };

/** The "Start guided lesson" action — R-5 naming law (trace 1a1810c1ef1cb521). */
function GuidedPill({ course, noteId }: { course: Course; noteId: string }) {
  return (
    <Link
      href={`/courses/${course}/guided-lessons/${noteId}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary/20"
    >
      <GraduationCap className="size-3" aria-hidden />
      Start guided lesson
    </Link>
  );
}

export function NotesIndex({
  course,
  tree,
  counts,
  notes,
  initialSubtopic,
}: {
  course: Course;
  tree: SpecTree;
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  notes: NoteListItem[];
  initialSubtopic: string | null;
}) {
  const progress = useCourseProgress(course);
  const looseCopy = looseAnchorCopy(course);
  const base = `/courses/${course}`;

  const groups = useMemo(() => {
    return tree.topics
      .map((t) => {
        const subtopics = t.subtopics
          .map((s) => ({
            subtopic: s,
            notes: notes.filter((n) => n.subtopic === s.code),
          }))
          .filter((g) => g.notes.length > 0)
          .map((g) => ({ ...g, count: g.notes.length }));
        return { topic: t, subtopics, total: subtopics.reduce((a, g) => a + g.count, 0) };
      })
      .filter((g) => g.subtopics.length > 0);
    // stable per (tree, notes) — recomputed only when the server payload
    // changes, never on learner-progress re-renders
  }, [tree, notes]);
  const unmapped = notes.filter((n) => !n.subtopic);

  const readDot = (noteId: string) => {
    const read = Boolean(progress.notesRead[noteId]);
    return (
      <>
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            read ? "bg-primary" : "bg-muted-foreground/30",
          )}
        />
        {/* UX audit 2026-10-02 #16: the read/unread dot was color-only
            (1.4.1) — name the non-default state for screen readers */}
        {!read && <span className="sr-only">Unread</span>}
      </>
    );
  };

  if (groups.length === 0 && unmapped.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No revision notes imported for this course yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {groups.map(({ topic, subtopics, total }) => (
        <details key={topic.code} open className="group/topic py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <h2 className="text-[15px] font-semibold">
              <NumberedLabel number={topic.number} title={topic.title} />
            </h2>
            <span className="text-xs text-muted-foreground">
              ·{" "}
              {total} note{total === 1 ? "" : "s"}
            </span>
            <ChevronDown
              className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open/topic:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {subtopics.map(({ subtopic: sub, notes: subNotes, count }) => {
              const countsK = counts[sub.code] ?? ZERO;
              const gen = sub.code.endsWith("-gen");
              const label = !gen && sub.label ? (
                <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {sub.label}
                </span>
              ) : null;
              const rowLink = (
                <>
                  <ProgressRing course={course} subtopic={sub.code} counts={countsK} size={18} />
                  {label}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover/link:text-primary">
                    {sub.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {count} note{count === 1 ? "" : "s"}
                  </span>
                </>
              );
              const active = initialSubtopic === sub.code;

              if (subNotes.length === 1) {
                const n = subNotes[0];
                return (
                  <li key={sub.code}>
                    <div
                      className={cn(
                        "group/link flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                        active && "bg-primary/[0.04] hover:bg-primary/[0.07]",
                      )}
                    >
                      <Link
                        href={`${base}/revision-notes/${n.noteId}`}
                        className="flex min-w-0 flex-1 items-center gap-2.5"
                      >
                        {rowLink}
                      </Link>
                      {n.guidedStudy && <GuidedPill course={course} noteId={n.noteId} />}
                    </div>
                  </li>
                );
              }

              // multi-note sub-topic: the row still navigates to the canonical
              // note (first in corpus order — the same target the sidebar's
              // hrefs.notes uses); the chevron expands every note so nothing
              // becomes unreachable (sidebar parity)
              return (
                <li key={sub.code}>
                  <details className="group/sub" open={active}>
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                      <Link
                        href={`${base}/revision-notes/${subNotes[0].noteId}`}
                        className="group/link flex min-w-0 flex-1 items-center gap-2.5"
                      >
                        {rowLink}
                      </Link>
                      <ChevronDown
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/sub:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <ul className="ml-9 mt-0.5 space-y-0.5 border-l pl-2">
                      {subNotes.map((n) => (
                        <li
                          key={n.noteId}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-muted"
                        >
                          {readDot(n.noteId)}
                          <Link
                            href={`${base}/revision-notes/${n.noteId}`}
                            className={cn(
                              "min-w-0 flex-1 truncate text-muted-foreground transition-colors hover:text-foreground",
                              initialSubtopic === n.subtopic && "font-medium text-primary",
                            )}
                          >
                            {n.title}
                          </Link>
                          {n.guidedStudy && <GuidedPill course={course} noteId={n.noteId} />}
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

      {unmapped.length > 0 && (
        <section aria-label={looseCopy.title} className="py-3">
          <h2 className="text-[15px] font-semibold">{looseCopy.title}</h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {looseCopy.body}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {unmapped.map((n) => (
              <li
                key={n.noteId}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-muted"
              >
                {readDot(n.noteId)}
                <FileText className="size-3.5 shrink-0 text-primary" aria-hidden />
                <Link
                  href={`${base}/revision-notes/${n.noteId}`}
                  className="min-w-0 flex-1 truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {n.title}
                </Link>
                {n.guidedStudy && <GuidedPill course={course} noteId={n.noteId} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
