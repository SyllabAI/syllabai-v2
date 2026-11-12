import { notFound } from "next/navigation";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { CoursePageHeader } from "@/components/hub/course-header";
import { NotesIndex, type NoteListItem } from "./notes-index";
import { smeRowOfNote } from "@/lib/spec-tree";
import type { RevisionNote } from "@/lib/contracts";

export const dynamic = "force-dynamic";

/**
 * Revision Notes index page — the same RevisionDojo-pattern treatment as the
 * exam-questions questionbank index (trace 1a19342adcb572ed, merged PR #578;
 * "same treatment" operator instruction, guided-study actions kept): one
 * narrow centered column, an RD-style one-liner under the header, then
 * numbered topic sections whose rows are SUB-TOPICS (ProgressRing + label +
 * right-aligned note count) navigating to the canonical note — the notes
 * index renders in notes-index.tsx (client: read dots + rings over the real
 * learner overlay). Legacy ?spec= deep links still resolve to their
 * sub-topic row via the canonical spec tree.
 *
 * ADR-039 wave 8 — the selector-mirror law (the same law the exam-questions
 * selector has run since wave 1: "the selector must mirror the SME picker"):
 * courses whose spine ships the SME layer render THIS index from the SME
 * sections, and notes file into rows 1:1 by their corpus topicSlug
 * (smeRowOfNote — audited corpus-wide: all 2,077 notes on the 27 layered
 * courses resolve, incl. the 598 previously-unplaced ones bridged and the
 * 1,479 officially-placed ones carried across verbatim; zero leftovers, so
 * the loose-notes section empties by construction, never by hiding). Every
 * other surface keeps subtopicOfNote's official homes — sidebar, loose
 * counts, flashcards, Teach-Me are untouched; courses without an SME layer
 * render exactly as before.
 */
export default async function CourseRevisionNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ subtopic?: string; spec?: string }>;
}) {
  const { course: slug } = await params;
  const { subtopic, spec } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta, stats } = hub;

  // legacy deep links used ?spec=4CH1-1.1 — resolve it to its sub-topic row
  const initialSubtopic = subtopic ?? (spec ? hub.index.subtopicOfSpecPoint.get(spec) ?? null : null);

  // ADR-039 wave 8 — the selector view. smeRowOfNote is a pure lookup over
  // the SME layer; the official noteSubtopic map (the sidebar's law) is
  // never consulted here and never mutated.
  const smeSections = hub.index.tree.smeSections ?? [];
  const smeActive = smeSections.length > 0;
  const items: NoteListItem[] = hub.notes.map((n: RevisionNote) => ({
    noteId: n.noteId,
    title: n.title,
    guidedStudy: n.guidedStudy,
    specPointCodes: n.specPointCodes,
    subtopic: smeActive ? smeRowOfNote(n, hub.index) : (hub.noteSubtopic[n.noteId] ?? null),
    contentKind: n.contentKind ?? null,
  }));

  // per-row note counts for the mirrored rows (the exam-questions selector's
  // pageCounts pattern — the rings read counts per row code, and the SME
  // rows hold no entry in the official counts map)
  const selectorCounts = { ...hub.counts };
  if (smeActive) {
    for (const sec of smeSections) {
      for (const row of sec.subtopics) {
        selectorCounts[row.code] = {
          notes: hub.notes.filter((n) => smeRowOfNote(n, hub.index) === row.code).length,
          questions: 0,
          flashcards: 0,
        };
      }
    }
  }
  // the groups of record: SME sections when the layer exists (the mirror
  // law), the official tree otherwise — identical component, same rendering
  const selectorTree = smeActive ? { ...hub.index.tree, topics: smeSections } : hub.index.tree;
  const subtopicCount = Object.keys(selectorCounts).filter(
    (c) => (selectorCounts[c]?.notes ?? 0) > 0,
  ).length;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CoursePageHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Revision Notes`}
        crumb="Revision Notes"
        description={`Choose a topic to read concise revision notes — ${stats.notes} note${stats.notes === 1 ? "" : "s"} across ${subtopicCount} subtopics, with examiner tips and worked examples.`}
      />
      <div className="mt-6">
        <NotesIndex
          course={meta.slug}
          tree={selectorTree}
          counts={selectorCounts}
          notes={items}
          initialSubtopic={initialSubtopic}
        />
      </div>
    </div>
  );
}
