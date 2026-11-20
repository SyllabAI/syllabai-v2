import { notFound } from "next/navigation";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { PageHeader } from "@/components/layout/page-header";
import { ResourcePanel } from "@/components/hub/resource-panel";
import { QuestionHistoryPanel } from "./history-panel";

/**
 * The per-question edit-history view (ADR-044 Phase 1 — the read-only
 * provenance surface of record). Server shell: resolves the set of record
 * (SME + official planes) and hands the set's questions to the client
 * panel; the panel is the editor-gated half (identity.capabilities.editor
 * — the additive ADR-044 capability field) and talks only to the
 * capability-gated /api/editor/history route (read-only end to end; E-0:
 * nothing here writes anything, anywhere — editors gain provenance before
 * they gain pens).
 */

export default async function QuestionSetHistoryPage({
  params,
}: {
  params: Promise<{ course: string; topicSlug: string }>;
}) {
  const { course: slug, topicSlug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const set =
    hub.questionTopics.find((t) => t.slug === topicSlug) ??
    hub.officialPaperTopics.find((t) => t.slug === topicSlug);
  if (!set) notFound();

  const { meta } = hub;
  const totalMarks = set.questions.reduce((a, q) => a + q.totalMarks, 0);

  return (
    <div className="flex w-full">
      <ResourcePanel variant="questions" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Breadcrumbs
            items={[
              { label: meta.label, href: `/courses/${slug}` },
              { label: "Exam Questions", href: `/courses/${slug}/exam-questions` },
              { label: set.name, href: `/courses/${slug}/exam-questions/${topicSlug}` },
              { label: "Edit history" },
            ]}
          />
          <PageHeader
            title={`Edit history — ${set.name}`}
            eyebrow="Question bank history"
            description={`${boardOf(meta)} ${meta.level} ${meta.label} · ${set.questions.length} questions · ${totalMarks} marks · read-only edit history`}
            actions={<ExamCodePill code={meta.code} />}
          />
          <QuestionHistoryPanel
            course={slug}
            topicSlug={topicSlug}
            questions={set.questions.map((q) => ({
              id: q.id,
              order: q.order,
              totalMarks: q.totalMarks,
              label: q.parts[0]?.problemMd?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
            }))}
          />
        </div>
      </div>
    </div>
  );
}
