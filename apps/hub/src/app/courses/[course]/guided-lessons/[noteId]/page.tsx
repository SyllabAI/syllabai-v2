import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, BookOpenCheck, GraduationCap, Pin } from "lucide-react";
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
import { GuidedLessonFlow } from "./guided-flow";
import { GuidedCheckList } from "./guided-check";

/**
 * Guided-lesson reader — the hub surface of the SME guided-lesson
 * integration, now carrying the ADAPTIVE confidence-gate flow (replicating
 * the SaveMyExams guided-study mechanic of record: research §3, adoption
 * law §8.2, adapter spec §6). The client flow (guided-flow.tsx) owns the
 * gate → layers → terms → example → checks → recalibration walk; this
 * server component owns data integrity, chrome and provenance, and keeps
 * the full authored lesson server-rendered in a collapsed "read as a page"
 * fallback so every authored string stays reachable without JS.
 *
 * One route per revision note (the canonical rn_* noteId, mirroring the
 * revision-notes reader URL grammar). Fail-closed: course without a
 * guided-import.json, note absent from the index, or unreadable lesson /
 * package artifact → notFound(). Data is render-only here — the artifacts
 * are sha256-anchored upstream (pinned provenance block in each file) and
 * nothing on this page mutates them. Flow state persists browser-local
 * only (hub progress law; the integration channel's zero-DB law).
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
              {lesson.modules.length} guided {lesson.modules.length === 1 ? "lesson" : "lessons"} ·{" "}
              {totalChecks} checks · {lesson.topicTitle} → {lesson.subtopicTitle}
            </p>
          </header>

          {/* the adaptive flow — confidence gate → layers → terms → example
              → checks → recalibration, state browser-local per lesson */}
          <GuidedLessonFlow
            lesson={imported}
            pkg={pkg}
            noteTitle={note.title}
            noteHref={`${base}/revision-notes/${note.noteId}`}
            base={base}
          />

          {/* no-JS / prefer-scroll fallback — the full authored lesson as a
              plain page (every authored string stays server-rendered) */}
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
              Prefer to read it all at once? Show the full lesson as a page
            </summary>
            <div className="space-y-5 border-t px-4 py-4">
              {lesson.modules.map((m, mi) => (
                <StaticModuleSection
                  key={m.id}
                  module={m}
                  ordinal={mi + 1}
                  questions={m.checkRefs
                    .map((ref) => questionsById.get(ref))
                    .filter((q): q is GuidedQuestion => q !== undefined)}
                />
              ))}
            </div>
          </details>

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

function StaticModuleSection({
  module: m,
  ordinal,
  questions,
}: {
  module: GuidedModule;
  ordinal: number;
  questions: GuidedQuestion[];
}) {
  return (
    <section className="space-y-4" aria-labelledby={`static-${m.id}`}>
      <div className="space-y-2">
        <h2 id={`static-${m.id}`} className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold tracking-tight">
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
          <p className="mb-3 text-sm font-semibold">Key points</p>
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

      <StaticDepthLayers layers={m.depthLayers} />

      {questions.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <p className="text-sm font-semibold">Checks</p>
            <GuidedCheckList questions={questions} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function StaticDepthLayers({
  layers,
}: {
  layers: { low: GuidedDepthLayer; medium: GuidedDepthLayer };
}) {
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
