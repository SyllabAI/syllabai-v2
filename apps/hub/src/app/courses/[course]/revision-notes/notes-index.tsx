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
 * overlay holds engagement, a Resume button (play glyph + "Resume {note
 * title}", truncating at 13rem like the example) pointing at the most
 * recently ENGAGED note (max at across notesRead ∪ note-scroll memory) and
 * stamping ?resume=1 so the reader restores the saved scroll position
 * (trace 1a19b5cba7c16a81, lib/note-scroll). Shared as SelectToolbar since
 * the exam-questions and flashcards select pages joined the treatment
 * (trace 1a19acb6ec437e25).
 *
 * Ticks of record: the MathsGenie done-tick marks FULLY READ notes — a green
 * filled check circle when read, the faint outline circle when not
 * (role="img" aria-label Read/Unread names both states). "Read" is the
 * scroll law of record (operator trace 1a195fd0b0947695): a note becomes
 * read only when its END (the note page's footnote strip) scrolls into
 * view — opening the page alone never checks it. It replaces the old read
 * dot on nested and loose note rows, and replaces the ProgressRing on
 * SINGLE-note sub-topic rows (a one-note row's ring is binary anyway; the
 * tick is the note-level truth). Multi-note rows keep the ProgressRing in
 * the NOTES-ONLY dimension (operator trace 1a195fd0b0947695: "the rings
 * show progress of revision notes only, not exam questions and not
 * flashcards. Both of their select pages will handle their progress rings"
 * — this page's rings count reads ÷ available notes and nothing else; the
 * exam-questions and flashcards select pages own their own denominators)
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
import { ChevronDown, FileText, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NumberedLabel } from "@/components/hub/chrome";
import { SelectToolbar } from "@/components/hub/select-toolbar";
import { ProgressRing } from "@/components/hub/progress-ring";
import { useCourseProgress, type Course } from "@/lib/progress";
import { pickResumeNoteId, useNoteScrolls } from "@/lib/note-scroll";
import { looseAnchorCopy } from "@/lib/loose-copy";
import { cn } from "@/lib/utils";
import type { SpecTree } from "@/lib/spec-tree";

export interface NoteListItem {
  noteId: string;
  title: string;
  guidedStudy: boolean;
  specPointCodes: string[];
  subtopic: string | null;
  /** corpus-native content kind — "exam-technique" = SME exam-skills notes */
  contentKind: string | null;
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
  // at the most recently ENGAGED note of THIS course — max `at` across the
  // read stamps (notesRead.at, the markNoteRead stamp on each completed read)
  // and the scroll memory (lib/note-scroll, trace 1a19b5cba7c16a81: "Resume
  // could remember scroll position within a note"), so a note the learner is
  // mid-way through outranks a finished read it never returned to. The href
  // stamps ?resume=1: the note reader's scroll-memory island consumes the
  // intent and restores the saved reading position (inside the resume band
  // 2%–98%; a note read to its end opens fresh from the top). Nothing engaged
  // yet → no button (the example's empty:hidden wrappers).
  const noteScrolls = useNoteScrolls(course);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const resumeNote = useMemo(() => {
    const known = new Set(notes.map((n) => n.noteId));
    const id = pickResumeNoteId(progress.notesRead, noteScrolls, known);
    return id ? (notes.find((n) => n.noteId === id) ?? null) : null;
  }, [notes, progress.notesRead, noteScrolls]);

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

  // RN-DEBRIS-11 run-005: exam-skills notes fold under their own explicit
  // label — they are exam technique, deliberately NOT tied to a spec
  // statement (the corpus's own exam-technique sections), so they must not
  // read as "not yet anchored" pending work like the loose-notes card does.
  // Everything else code-less keeps the loose-notes treatment unchanged.
  const examTechnique = useMemo(
    () => unmapped.filter((n) => n.contentKind === "exam-technique"),
    [unmapped],
  );
  const looseOthers = useMemo(
    () => unmapped.filter((n) => n.contentKind !== "exam-technique"),
    [unmapped],
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
      <SelectToolbar
        searchLabel="Search revision notes"
        searchPlaceholder="Search topics or notes..."
        query={query}
        onQueryChange={setQuery}
        resume={
          resumeNote
            ? { href: `${base}/revision-notes/${resumeNote.noteId}?resume=1`, title: resumeNote.title }
            : null
        }
      />

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
                  // the left slot: multi-note rows keep the ProgressRing in the
                  // NOTES-ONLY dimension (reads ÷ available notes — never
                  // questions or flashcards, operator trace 1a195fd0b0947695);
                  // a single-note row's ring is binary, so the note-level tick
                  // takes its place (the MathsGenie anatomy — one truth per row)
                  const leftSlot =
                    subNotes.length === 1 ? (
                      <ReadTick read={Boolean(progress.notesRead[subNotes[0].noteId])} />
                    ) : (
                      <ProgressRing course={course} subtopic={sub.code} counts={countsK} size={18} dimension="notes" />
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
                              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
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

          {examTechnique.length > 0 && (
            <section aria-label="Exam technique (not spec-tied)" className="py-3">
              <h2 className="text-[15px] font-semibold">Exam technique (not spec-tied)</h2>
              <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
                Exam-skills notes — how to answer, command words, the papers
                themselves. They deliberately carry no spec-point anchor: they
                belong to the exam, not to a single statement.
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {examTechnique.map((n) => (
                  <li
                    key={n.noteId}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
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

          {looseOthers.length > 0 && (
            <section aria-label={looseCopy.title} className="py-3">
              <h2 className="text-[15px] font-semibold">{looseCopy.title}</h2>
              <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
                {looseCopy.body}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {looseOthers.map((n) => (
                  <li
                    key={n.noteId}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
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
