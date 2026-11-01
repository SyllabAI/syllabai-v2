"use client";

/**
 * Revision Notes index — the RevisionDojo-pattern treatment of the
 * exam-questions questionbank index (trace 1a19342adcb572ed, merged PR #578;
 * "same treatment" operator instruction for the notes index): numbered topic
 * sections as native <details> (no toggle state), each row a SUB-TOPIC —
 * progress indicator + corpus-native label + title + a right-aligned note
 * count — clicking through to the sub-topic's canonical note (first in
 * corpus order, the same target hrefs.notes feeds the sidebar). Sub-topics
 * holding more than one note expose a chevron that expands every note.
 *
 * MathsGenie-pattern toolbar (trace 1a1954cacb3d2ab5, the operator's saved
 * mathsgenie.co.uk revision-guides page as the example): a search input
 * ("Search topics or notes..." — client-side filter over sub-topic + note
 * titles, forcing the matching rows open) and, when this course's learner
 * overlay holds a read, a Resume button (play glyph + "Resume {note title}",
 * truncating at 13rem like the example) pointing at the most recently read
 * note (max notesRead.at — markNoteRead stamps it on every note visit).
 *
 * Ticks of record: the MathsGenie done-tick marks FULLY READ notes — a green
 * filled check circle when read, the faint outline circle when not
 * (role="img" aria-label Read/Unread names both states). It replaces the old
 * read dot on nested and loose note rows, and replaces the ProgressRing on
 * SINGLE-note sub-topic rows (a one-note row's ring is binary anyway; the
 * tick is the note-level truth). Multi-note rows keep the ProgressRing —
 * partial progress across notes+questions+flashcards stays meaningful there
 * — with per-note ticks inside the expanded list.
 *
 * Guided lessons stay first-class (operator law, trace 1a1810c1ef1cb521):
 * every guided note carries its own "Start guided lesson" action as a
 * SIBLING link — never nested inside the row's <a> (invalid HTML). Notes
 * with no sub-topic anchor keep the honest loose-notes section
 * (T-HUB-LOOSE-COPY-1 copy, incl. the adjudicated-no-spec-home courses).
 * Grouping still comes from the canonical spec tree, never a second
 * taxonomy; ?subtopic= (and legacy ?spec=, resolved server-side) highlights
 * and auto-opens its row exactly as before.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, GraduationCap, Play, Search, X } from "lucide-react";
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

/**
 * The MathsGenie done-tick (trace 1a1954cacb3d2ab5): green filled check
 * circle when read, faint outline circle when not — both states named for
 * screen readers (UX audit 2026-10-02 #16 law).
 */
function ReadTick({ read }: { read: boolean }) {
  return read ? (
    <span role="img" aria-label="Read" className="inline-flex size-4 flex-none items-center justify-center">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4 text-green-600 dark:text-green-500">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path
          d="m8.2 12.4 2.6 2.6 5-5.6"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  ) : (
    <span role="img" aria-label="Unread" className="inline-flex size-4 flex-none items-center justify-center">
      <span aria-hidden className="size-4 rounded-full border-2 border-muted-foreground/25" />
    </span>
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

  // MathsGenie toolbar: the search query is a transient filter; Resume points
  // at the most recently read note of THIS course (max notesRead.at — the
  // markNoteRead stamp on every note visit). Nothing read yet → no button
  // (the example's empty:hidden wrappers).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const resumeNote = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.noteId, n]));
    let best: NoteListItem | null = null;
    let bestAt = -1;
    for (const [noteId, v] of Object.entries(progress.notesRead)) {
      const n = byId.get(noteId);
      if (n && v.at > bestAt) {
        bestAt = v.at;
        best = n;
      }
    }
    return best;
  }, [notes, progress.notesRead]);

  // Topic groups of record: sub-topics with (matching) notes, corpus order,
  // per-topic totals. A sub-topic whose own title matches shows ALL its
  // notes; otherwise only the notes whose titles match. Recomputed on query
  // and server payload changes, never on learner-progress re-renders.
  const groups = useMemo(() => {
    return tree.topics
      .map((t) => {
        const subtopics = t.subtopics
          .map((s) => {
            const all = notes.filter((n) => n.subtopic === s.code);
            const shown =
              !searching || matchTitle(s.title, q) ? all : all.filter((n) => matchTitle(n.title, q));
            return { subtopic: s, notes: shown, count: shown.length };
          })
          .filter((g) => g.count > 0);
        return { topic: t, subtopics, total: subtopics.reduce((a, g) => a + g.count, 0) };
      })
      .filter((g) => g.subtopics.length > 0);
  }, [tree, notes, searching, q]);

  const unmapped = useMemo(
    () => notes.filter((n) => !n.subtopic && (!searching || matchTitle(n.title, q))),
    [notes, searching, q],
  );

  const nothingAtAll = groups.length === 0 && unmapped.length === 0;
  if (nothingAtAll && !searching) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No revision notes imported for this course yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* MathsGenie-pattern toolbar (trace 1a1954cacb3d2ab5): search left,
          Resume right — the Resume button renders only once this course's
          learner overlay holds a read note. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics or notes..."
            aria-label="Search revision notes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </label>
        {resumeNote && (
          <Link
            href={`${base}/revision-notes/${resumeNote.noteId}`}
            aria-label={`Resume ${resumeNote.title}`}
            className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Play className="size-4 shrink-0 fill-current text-primary opacity-60" aria-hidden />
            <span className="max-w-[13rem] truncate">Resume {resumeNote.title}</span>
          </Link>
        )}
      </div>

      {nothingAtAll && searching ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No notes match{" "}
            <span className="font-medium text-foreground">&ldquo;{query.trim()}&rdquo;</span>.
          </CardContent>
        </Card>
      ) : (
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
                  // the left slot: multi-note rows keep the ProgressRing
                  // (partial progress across notes+questions+flashcards is
                  // meaningful); a single-note row's ring is binary, so the
                  // note-level tick takes its place (the MathsGenie anatomy —
                  // one truth per row)
                  const leftSlot =
                    subNotes.length === 1 ? (
                      <ReadTick read={Boolean(progress.notesRead[subNotes[0].noteId])} />
                    ) : (
                      <ProgressRing course={course} subtopic={sub.code} counts={countsK} size={18} />
                    );
                  const rowLink = (
                    <>
                      {leftSlot}
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
                  // becomes unreachable (sidebar parity). Searching forces the
                  // expansion open so matches stay visible.
                  return (
                    <li key={sub.code}>
                      <details className="group/sub" open={searching || active}>
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
                              <ReadTick read={Boolean(progress.notesRead[n.noteId])} />
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
                    <ReadTick read={Boolean(progress.notesRead[n.noteId])} />
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
      )}
    </>
  );
}

/** Case-insensitive substring match; empty query matches everything. */
function matchTitle(title: string, q: string): boolean {
  return !q || title.toLowerCase().includes(q);
}
