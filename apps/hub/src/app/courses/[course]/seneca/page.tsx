import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { allCourseParams } from "@/lib/static-params";
import { getSenecaForCourse, listSenecaCourseSlugs } from "@/lib/seneca-hub";
import { SenecaBrowser } from "@/components/hub/seneca-browser";

/**
 * Seneca resources (T-SENECA-001 Task 42 → Task 43 production port) —
 * read-only browsing of the harvested Seneca course content mapped to this
 * hub course. Static bundle under /seneca-bundles (committed, ADR-029
 * posture); the browser component fetches its bundle on first open. The
 * page serves ONLY when the flags.json gate lists the course AND the
 * registry carries a mapping — otherwise notFound().
 */

export async function generateStaticParams() {
  const senecaSlugs = new Set(await listSenecaCourseSlugs());
  const all = await allCourseParams();
  return all.filter((p) => senecaSlugs.has(p.course));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const [hub, seneca] = await Promise.all([loadHubCourse(slug), getSenecaForCourse(slug)]);
  if (!hub || !seneca) return {};
  return { title: `Seneca — ${hub.meta.label}` };
}

export default async function SenecaPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const [hub, seneca] = await Promise.all([loadHubCourse(slug), getSenecaForCourse(slug)]);
  if (!hub || !seneca) notFound();
  const { meta } = hub;
  const board = meta.board ? `${meta.board} ` : "";
  const sections = seneca.bundles.reduce((n, b) => n + b.sections, 0);
  const questions = seneca.bundles.reduce((n, b) => n + b.questions, 0);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`${board}${meta.level} ${meta.label} — Seneca Resources`}
        crumb="Seneca"
        description={`Lesson notes and exam questions from the Seneca course content mapped to this qualification (${seneca.bundles.map((b) => b.label).join(", ")}). Browse lessons with their illustrations, or drill exam questions by topic with revealable mark schemes — exactly as the material presented in Seneca.`}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-muted-foreground/30 text-[10px] text-muted-foreground">
          T-SENECA-001 harvest
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {sections.toLocaleString()} lessons
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {questions.toLocaleString()} exam questions
        </Badge>
        <p className="w-full max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Imported verbatim from the SyllabAI Seneca harvest; images are served from the repo
          mirror at /seneca-images. Read-only study material — nothing here records progress or
          feeds mastery rings. Courses without a Seneca mapping show no Seneca entry in the
          sidebar at all.
        </p>
      </div>

      <div className="mt-6">
        <SenecaBrowser
          courseLabel={meta.label}
          bundles={seneca.bundles}
        />
      </div>
    </div>
  );
}
