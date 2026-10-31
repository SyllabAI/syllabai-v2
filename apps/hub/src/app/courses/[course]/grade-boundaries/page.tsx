import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCourses, boardOf, loadHubCourse } from "@/lib/courses";
import { getGradeBoundaries } from "@/lib/grade-boundaries";
import { CourseHeader } from "@/components/hub/course-header";
import { GradeBoundariesWorkspace } from "@/components/hub/grade-boundaries/grade-boundaries-workspace";

/**
 * Grade Boundaries (T-GRADE-1) — the per-course boundaries surface behind
 * the course-page card. Data is the mechanically-imported official corpus
 * (resources GradeBoundaries lane); a course without corpus data renders
 * the honest roadmap state, never invented numbers.
 *
 * Prerendered per registered course (the bundle is committed and immutable
 * between deploys, same prerender discipline as the other course index
 * pages — but keyed on the REGISTRY, not on content bundles, because
 * boundaries data is registry-level).
 */
export async function generateStaticParams() {
  const courses = await listCourses();
  return courses.map((c) => ({ course: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) return {};
  const title = `Grade Boundaries — ${boardOf(hub.meta)} ${hub.meta.level} ${hub.meta.subject}`;
  return {
    title,
    description: `Official ${boardOf(hub.meta)} grade boundaries for every recent session — boundary tables, the trend graph and a mark-to-grade calculator for ${hub.meta.code}.`,
    alternates: { canonical: `/courses/${slug}/grade-boundaries` },
  };
}

export default async function GradeBoundariesPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const entry = await getGradeBoundaries(slug);
  const { meta } = hub;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`Grade Boundaries — ${meta.code}`}
        crumb="Grade Boundaries"
      />
      {entry ? (
        <GradeBoundariesWorkspace entry={entry} />
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border-2 bg-card p-8 text-center">
            <p className="text-sm font-medium">No boundaries in the corpus yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              The GradeBoundaries lane fetches and parses the awarding bodies&apos;
              official documents session by session. When this course&apos;s
              specification lands there, this page lights up with its full
              tables, graph and calculator.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
