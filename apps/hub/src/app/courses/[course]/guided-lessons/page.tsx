import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { loadGuidedIndex } from "@/lib/guided-lessons";
import { looseAnchorCopy } from "@/lib/loose-copy";
import { CourseHeader } from "@/components/hub/course-header";

export const dynamic = "force-dynamic";

/**
 * Guided-lessons index — entry-path lane (c), operator decision of record
 * (trace 1a1810c1ef1cb521): one honest listing of every note with a live
 * guided lesson, grouped by the canonical spec tree (same grouping law as
 * the revision-notes listing — never a second taxonomy). The course card's
 * "Guided lessons" CTA lands here instead of three hops through the notes
 * listing. Fail-closed: courses without a committed guided-import.json 404
 * (their course card keeps the honest roadmap state); the index is the only
 * source, nothing is synthesised.
 */
export default async function GuidedLessonsIndexPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const index = await loadGuidedIndex(slug);
  if (!index || index.notes.length === 0) notFound();

  const { meta } = hub;
  const byId = new Map(hub.notes.map((n) => [n.noteId, n]));

  const rows = index.notes
    .map((entry) => {
      const note = byId.get(entry.noteId);
      if (!note) return null;
      const subtopicCode = hub.noteSubtopic[entry.noteId] ?? null;
      const subtopic = subtopicCode
        ? hub.index.subtopicByCode.get(subtopicCode) ?? null
        : null;
      const topic = subtopic
        ? hub.index.topicByCode.get(subtopic.topicCode) ?? null
        : null;
      return { entry, note, topic };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const groups = hub.index.tree.topics
    .map((t) => ({ topic: t, rows: rows.filter((r) => r.topic?.code === t.code) }))
    .filter((g) => g.rows.length > 0);
  const unmapped = rows.filter((r) => !r.topic);

  const renderRow = (entry: (typeof rows)[number]["entry"], note: (typeof rows)[number]["note"]) => (
    <Link
      key={entry.noteId}
      href={`/courses/${meta.slug}/guided-lessons/${entry.noteId}`}
      className="group flex items-start gap-2.5 rounded-md border bg-card px-3 py-2.5 text-[13px] transition-colors hover:border-primary/40"
    >
      <GraduationCap aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug group-hover:text-primary">{note.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {note.specPointCodes.slice(0, 3).map((c) => (
            <code key={c} className="rounded bg-muted px-1 text-[10px]">
              {c}
            </code>
          ))}
          <span className="text-[10.5px] text-muted-foreground">Start guided lesson</span>
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Guided Lessons`}
        crumb="Guided Lessons"
        description={`Step-by-step guided lessons mapped to the official ${meta.code} specification — live for ${index.counts.notes} note${index.counts.notes === 1 ? "" : "s"} · ${index.counts.lessons} lesson${index.counts.lessons === 1 ? "" : "s"}, each with confidence gating, plain-words depth layers and fully explained checks.`}
      />
      <div className="mt-6 space-y-6">
        {groups.map(({ topic, rows: tRows }) => (
          <section key={topic.code} aria-label={`Topic ${topic.number}: ${topic.title}`}>
            <h2 className="text-[15px] font-semibold leading-snug">
              {topic.number}. {topic.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {tRows.length} guided lesson set{tRows.length === 1 ? "" : "s"}
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{tRows.map(({ entry, note }) => renderRow(entry, note))}</div>
          </section>
        ))}
        {unmapped.length > 0 && (
          <section aria-label="Not yet anchored to a spec point">
            <h2 className="text-[15px] font-semibold leading-snug">{looseAnchorCopy(slug).title}</h2>
            <p className="text-xs text-muted-foreground">{unmapped.length} guided lesson set{unmapped.length === 1 ? "" : "s"}</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{unmapped.map(({ entry, note }) => renderRow(entry, note))}</div>
          </section>
        )}
      </div>
    </div>
  );
}
