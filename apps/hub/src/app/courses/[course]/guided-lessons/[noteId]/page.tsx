import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, BookOpenCheck, GraduationCap, Lightbulb, ListChecks, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadHubCourse } from "@/lib/courses";
import { Breadcrumbs } from "@/components/hub/chrome";
import { ResourcePanel } from "@/components/hub/resource-panel";
import {
  findGuidedEntry,
  loadGuidedIndex,
  loadGuidedLesson,
  loadGuidedPackage,
  type GuidedDepthLayer,
  type GuidedModule,
  type GuidedQuestion,
} from "@/lib/guided-lessons";
import { GuidedCheckList } from "./guided-check";

/**
 * Guided-lesson reader — the hub surface of the SME guided-lesson
 * integration (route law from the import receipt's next_operator_gated:
 * "surface the guided lessons on a hub route via loadContentJson +
 * guided-import.json").
 *
 * One route per revision note (the canonical rn_* noteId, mirroring the
 * revision-notes reader URL grammar). Fail-closed: course without a
 * guided-import.json, note absent from the index, or unreadable lesson /
 * package artifact → notFound(). Data is render-only here — the artifacts
 * are sha256-anchored upstream (pinned provenance block in each file) and
 * nothing on this page mutates them.
 *
 * The confidence-gate runtime policy rides with the data (gatePolicy per
 * module) but the adaptive gate engine is the practice-engine follow-up;
 * the checks below are the self-paced reveal layer (see guided-check.tsx).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string; noteId: string }>;
}): Promise<Metadata> {
  const { course: slug, noteId } = await params;
  const hub = await loadHubCourse(slug);
  const note = hub?.notes.find((n) => n.noteId === noteId);
  if (!hub || !note) return { title: "Guided lessons" };
  return { title: `Guided lesson: ${note.title}` };
}

export default async function GuidedLessonPage({
  params,
}: {
  params: Promise<{ course: string; noteId: string }>;
}) {
  const { course: slug, noteId } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const note = hub.notes.find((n) => n.noteId === noteId);
  if (!note) notFound();

  const index = await loadGuidedIndex(slug);
  const entry = findGuidedEntry(index, noteId);
  if (!entry || !index) notFound();
  const [imported, pkg] = await Promise.all([
    loadGuidedLesson(entry),
    loadGuidedPackage(entry),
  ]);
  if (!imported || !pkg) notFound();

  const lesson = imported.lesson;
  const { meta } = hub;
  const base = `/courses/${meta.slug}`;
  const questionsById = new Map<string, GuidedQuestion>(
    pkg.questions.map((q) => [q.id, q]),
  );
  const totalChecks = lesson.modules.reduce((acc, m) => acc + m.checkRefs.length, 0);
  const glossary = lesson.assets.glossary ?? [];
  const workedExample = lesson.assets.workedExample;

  return (
    <div className="flex w-full">
      <ResourcePanel variant="notes" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <article className="mx-auto max-w-3xl space-y-5">
          <Breadcrumbs
            items={[
              { label: meta.level, href: "/courses" },
              { label: meta.subject, href: base },
              { label: "Revision Notes", href: `${base}/revision-notes` },
              { label: note.title, href: `${base}/revision-notes/${note.noteId}` },
              { label: "Guided lesson" },
            ]}
          />

          <header className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <GraduationCap className="size-4.5" aria-hidden />
              </span>
              <span className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                Guided lesson
              </span>
            </div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
              {note.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {lesson.specAnchors.map((a) => (
                <Badge key={a.code} variant="secondary" className="font-mono text-[11px]">
                  {a.code}
                </Badge>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              {lesson.modules.length} guided {lesson.modules.length === 1 ? "step" : "steps"} ·{" "}
              {totalChecks} checks · {lesson.topicTitle} → {lesson.subtopicTitle}
            </p>
          </header>

          <Card>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <p className="text-sm font-semibold">Where this fits</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{lesson.primer.text}</p>
              {lesson.primer.prerequisiteSubtopic && (
                <p className="text-xs text-muted-foreground">
                  Builds on: {lesson.primer.prerequisiteSubtopic}
                </p>
              )}
            </CardContent>
          </Card>

          {workedExample && (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Lightbulb className="size-4 text-primary" aria-hidden />
                  Worked example
                </p>
                <p className="text-[13px] font-medium leading-relaxed">{workedExample.prompt}</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground">
                  {workedExample.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <p className="rounded-md bg-muted px-3 py-2 text-[13px] font-medium">
                  {workedExample.finalAnswer}
                </p>
              </CardContent>
            </Card>
          )}

          {lesson.modules.map((m, mi) => (
            <GuidedModuleSection
              key={m.id}
              module={m}
              ordinal={mi + 1}
              questions={m.checkRefs
                .map((ref) => questionsById.get(ref))
                .filter((q): q is GuidedQuestion => q !== undefined)}
            />
          ))}

          {glossary.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <p className="text-sm font-semibold">Key terms</p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {glossary.map((g) => (
                    <div key={g.term} className="rounded-md border p-3">
                      <dt className="text-[13px] font-semibold">{g.term}</dt>
                      <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {g.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* provenance — the pinned upstream, verbatim from the artifacts */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
            <Pin className="size-3" aria-hidden />
            <span>
              Guided content from the SME authoring corpus — note {imported.source.noteId}, pinned
              at <span className="font-mono">{imported.source.pinnedRef.slice(0, 12)}</span> ·
              promoted {index.upstream.repo} <span className="font-mono">{index.upstream.commit.slice(0, 12)}</span>
            </span>
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={`${base}/revision-notes/${note.noteId}`}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to the revision note
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/revision-notes`}>
                <BookOpenCheck className="size-4" aria-hidden />
                All revision notes
              </Link>
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}

function GuidedModuleSection({
  module: m,
  ordinal,
  questions,
}: {
  module: GuidedModule;
  ordinal: number;
  questions: GuidedQuestion[];
}) {
  return (
    <section className="space-y-4" aria-labelledby={`${m.id}-title`}>
      <div className="space-y-2">
        <h2 id={`${m.id}-title`} className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold tracking-tight">
          <span className="text-muted-foreground">{ordinal}.</span>
          {m.title}
        </h2>
        {m.specRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.specRefs.map((code) => (
              <Badge key={code} variant="outline" className="font-mono text-[11px]">
                {code}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.opening}</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-primary" aria-hidden />
            Key points
          </p>
          <ul className="space-y-2">
            {m.keyPoints.map((kp, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{kp}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <DepthLayers layers={m.depthLayers} />

      {questions.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <p className="text-sm font-semibold">Checks — try each one before you reveal</p>
            <GuidedCheckList questions={questions} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DepthLayers({ layers }: { layers: { low: GuidedDepthLayer; medium: GuidedDepthLayer } }) {
  const rows: { label: string; layer: GuidedDepthLayer }[] = [
    { label: "First pass", layer: layers.low },
    { label: "Going deeper", layer: layers.medium },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(({ label, layer }) => (
        <Card key={label}>
          <CardContent className="space-y-2.5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-[13px] leading-relaxed">{layer.restatement}</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Analogy — </span>
              {layer.analogy}
            </p>
            <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
              <span className="font-medium">Exam pointer — </span>
              {layer.examPointer}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
