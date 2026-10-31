import { notFound } from "next/navigation";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { NotesIndex, type NoteListItem } from "./notes-index";
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

  const items: NoteListItem[] = hub.notes.map((n: RevisionNote) => ({
    noteId: n.noteId,
    title: n.title,
    guidedStudy: n.guidedStudy,
    specPointCodes: n.specPointCodes,
    subtopic: hub.noteSubtopic[n.noteId] ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Revision Notes`}
        crumb="Revision Notes"
        description={`Choose a topic to read concise revision notes — ${stats.notes} note${stats.notes === 1 ? "" : "s"} across ${Object.keys(hub.counts).filter((c) => (hub.counts[c]?.notes ?? 0) > 0).length} subtopics, with examiner tips and worked examples.`}
      />
      <div className="mt-6">
        <NotesIndex
          course={meta.slug}
          tree={hub.index.tree}
          counts={hub.counts}
          notes={items}
          initialSubtopic={initialSubtopic}
        />
      </div>
    </div>
  );
}
