import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { CoveragePanel } from "./coverage-panel";
import { allCourseParams } from "@/lib/static-params";

/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}

/**
 * T-KG-COV-1 — the syllabus coverage surface ("seen vs proven").
 *
 * The coverage question students actually ask — "how far through the
 * specification am I, what is left to cover?" — answered honestly: the
 * syllabus map (the course's canonicalKG, GRAPH_CONTRACT v1.0) rolled up
 * per section, bucketed by the learner-state join into PROVEN (marked
 * evidence), SEEN (self-report exposure — never mastery), and NOT STARTED.
 * The two evidence lanes never blur: the bars say "seen", the counts say
 * "proven", and the About block states the law. Coverage lives on the
 * course surface (Track & improve), not on the graph destination — the
 * graph may tint coverage later, but the rollup answers the question
 * faster than any diagram.
 */
export default async function CoveragePage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta } = hub;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title="Syllabus coverage"
        crumb="Syllabus coverage"
        description="How much of the specification you have seen — and how much you have proven with marked practice. Seeing is not proving; the bars keep the two apart."
      />
      <CoveragePanel course={meta.slug} />
      <details className="mt-6 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          About this data
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            <span className="font-medium text-foreground">Proven</span> means marked evidence exists for
            the point — a marked attempt (or, on a signed-in account, the covering topic&apos;s measured
            skill). <span className="font-medium text-foreground">Seen</span> means you engaged with the
            point&apos;s content — read its notes, rated its cards — which is self-report evidence and
            never mastery: exposure only, never proven.
          </p>
          <p>
            Where the data lives: the syllabus map is the course&apos;s own specification graph; your
            evidence is this browser&apos;s local progress lane (the same lane the knowledge graph reads),
            or your live account when one is connected. Nothing here is invented — points the evidence
            join cannot attribute render as not started, and if a source fails, the page says so instead
            of showing zeros.
          </p>
        </div>
      </details>
    </div>
  );
}
