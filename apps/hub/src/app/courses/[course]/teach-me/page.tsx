import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getCourseBundle, loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { allCourseParams } from "@/lib/static-params";
import { teachMeEnabledForCourse, teachMeGate } from "@/components/hub/teach-me/gate";
import { buildTeachMePickerTree } from "@/components/hub/teach-me/picker-data";
import { TeachMeClient } from "@/components/hub/teach-me/teach-me-client";

/**
 * Teach-Me — the learn-by-teaching lane on the course hub (T-TEACHME-001
 * run-003; plan docs/TEACH_ME_PLAN.md §10).
 *
 * Gating law (flags.json "teachMe" key, absent=OFF — components/hub/
 * teach-me/gate.ts): the landing prerenders for flagged courses; every
 * other course serves the honest "import pending" roadmap state (the
 * lib/courses.ts honest-absent posture — never a fabricated wizard). The
 * flag gates RENDERING only; all laws (quota, ceilings, word floor,
 * overlap, D2 persona doctrine) live in the run-002 API module.
 *
 * Wave 0 pilot of record: Edexcel IGCSE Chemistry (4CH1) —
 * igcse-chemistry-19 (plan §1). Wave 1/2 courses flip by flags.json slug.
 */

export async function generateStaticParams() {
  const gate = await teachMeGate();
  const flagged = new Set(gate.enabled ? gate.courses : []);
  const all = await allCourseParams();
  return all.filter((p) => flagged.has(p.course));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) return {};
  return {
    title: `Teach-Me — ${hub.meta.label}`,
    description: `Teach the Pupil — explain ${hub.meta.label} topics in your own words and find the gaps before the exam does.`,
    robots: { index: false }, // per-session learner surface, like the sibling lanes
  };
}

export default async function TeachMePage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const [hub, enabled] = await Promise.all([loadHubCourse(slug), teachMeEnabledForCourse(slug)]);
  if (!hub) notFound();
  const { meta } = hub;

  const header = (
    <CourseHeader
      meta={meta}
      title={`Teach-Me — ${meta.label}`}
      crumb="Teach-Me"
      description="Explain it to the Pupil: pick spec points, teach them in your own words, and find the gaps before the exam does. Objectives tick off as you cover them; the honest review card lands at the end."
    />
  );

  if (!enabled) {
    // honest roadmap state (plan §10): the lane rolls out course by course —
    // a non-pilot course renders this instead of a fabricated wizard.
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <div className="mx-auto mt-6 max-w-3xl">
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
            <Badge variant="outline" className="text-[10px]">
              import pending
            </Badge>
            <h2 className="mt-3 text-base font-semibold">
              Teach-Me isn&apos;t live for this course yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              The learn-by-teaching lane rolls out course by course, grounded in each
              course&apos;s validated material. When this course&apos;s serving corpus is
              Teach-Me-ready, the Pupil appears here — this page is the honest state, not
              a stub.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const bundle = await getCourseBundle(slug);
  if (!bundle || !bundle.curriculum) {
    // flagged course with no committed bundle — the flags.json law keeps the
    // surface honest (an empty state, never invented data)
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <div className="mx-auto mt-6 max-w-3xl">
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
            <h2 className="text-base font-semibold">Teach-Me is warming up</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              The flag is on but this course&apos;s spec tree hasn&apos;t finished
              importing. Check back shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const topics = buildTeachMePickerTree(bundle.curriculum);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {header}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-muted-foreground/30 text-[10px] text-muted-foreground">
          T-TEACHME-001
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          evidence: AI_SUGGESTED — teacher-ratified before it counts
        </Badge>
        <p className="w-full max-w-3xl text-xs leading-relaxed text-muted-foreground">
          A Teach-Me session never changes your record by itself. What you cover is saved
          as a suggestion your teacher can ratify — the review card at the end is the
          correction of record, so read it even when every objective ticks green.
        </p>
      </div>
      <div className="mt-6">
        <TeachMeClient course={slug} courseLabel={meta.label} topics={topics} />
      </div>
    </div>
  );
}
