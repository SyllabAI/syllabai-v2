import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCourseBundle, loadHubCourse } from "@/lib/courses";
import { allCourseParams } from "@/lib/static-params";
import { teachMeEnabledForCourse, teachMeGate } from "@/components/hub/teach-me/gate";
import { buildTeachGenieNoteTree } from "@/components/hub/teach-me/picker-data";
import { CourseHeader } from "@/components/hub/course-header";
import { TeachGenieClient } from "@/components/hub/teach-genie/teach-genie-client";

/**
 * Teach SillyAI (T-TEACHGENIE-001; renamed in T-TEACHGENIE-003) — the
 * learn-by-teaching lane. Gating law is UNCHANGED from Teach-Me
 * (T-TEACHME-001 run-003): the flags.json "teachMe" key (absent=OFF) gates
 * rendering; every other course serves the honest "import pending" roadmap
 * state. The engine underneath is the same run-002 API module — quota,
 * ceilings, word floor, overlap, D2 doctrine — now with the SillyAI persona
 * (config pupilName), topic-aware openers (objectives.v3) and In-Depth = 6
 * objectives ("Objective 1/6", MG parity).
 *
 * Wave 0 pilot of record: Edexcel IGCSE Chemistry (4CH1) —
 * igcse-chemistry-19. Wave 1/2 courses flip by flags.json slug.
 *
 * T-TEACHGENIE-002 (operator order, chat trace 1a1a84b5cf0e865d): the picker
 * selects a REVISION NOTE of the course — organized under unit/topic
 * dropdowns — instead of hand-picked spec points. The tree is projected from
 * the SAME committed course bundle (curriculum + notes) the Revision Notes
 * index rides; the picked note's canon spec codes become the create
 * request's specPointIds and every engine law stays server-side.
 *
 * T-TEACHGENIE-004 (operator order 2026-11-05, "the frontend flow of Teach
 * me/SillyAI is not like the other pages. Design is not consistent"): the
 * lane rejoins the house design system. The T-TEACHGENIE-001 `.tg-scope`
 * MathsGenie token override and its MG-pinned copy/colours are retired —
 * this page now mounts the SAME CourseHeader hero band (breadcrumb trail,
 * H1, exam-code pill, description) and the SAME `mx-auto max-w-3xl` column
 * as the seventeen sibling course pages, and the client components below
 * speak hub tokens only. The learner-visible flow (landing → picker →
 * session → review), the SillyAI persona, and every engine law are
 * unchanged.
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
    title: `Teach SillyAI — ${hub.meta.label}`,
    description: `Learn by teaching: explain ${hub.meta.label} topics to SillyAI in your own words — it keeps asking until it makes sense, objectives tick off, and a review lands at the end.`,
    robots: { index: false }, // per-session learner surface, like the sibling lanes
  };
}

export default async function TeachGeniePage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const [hub, enabled] = await Promise.all([loadHubCourse(slug), teachMeEnabledForCourse(slug)]);
  if (!hub) notFound();
  const { meta } = hub;

  // The house chrome of record — every state below renders under the SAME
  // CourseHeader hero band the sibling lanes mount (breadcrumb trail, H1,
  // exam-code pill, description), so the lane reads as part of the hub
  // before a single teach-specific pixel paints.
  const header = (
    <CourseHeader
      meta={meta}
      title={`Teach SillyAI — ${meta.label}`}
      crumb="Teach SillyAI"
      description={`Learn by teaching: explain ${meta.label} topics to SillyAI in your own words — it keeps asking until it makes sense, objectives tick off, and a review lands at the end.`}
    />
  );

  if (!enabled) {
    // honest roadmap state (plan §10): the lane rolls out course by course —
    // a non-pilot course renders this instead of a fabricated wizard.
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {header}
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Teach SillyAI isn&apos;t live for this course yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Learn-by-teaching rolls out course by course, grounded in each course&apos;s validated material. When
            this course&apos;s serving corpus is ready, SillyAI appears here — this page is the honest state, not
            a stub.
          </p>
        </div>
      </div>
    );
  }

  const bundle = await getCourseBundle(slug);
  if (!bundle || !bundle.curriculum || (bundle.notes?.length ?? 0) === 0) {
    // flagged course with no committed bundle / no code-anchored notes — the
    // flags.json law keeps the surface honest (an empty state, never
    // invented data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {header}
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Teach SillyAI is warming up</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The flag is on but this course&apos;s material hasn&apos;t finished importing. Check back shortly.
          </p>
        </div>
      </div>
    );
  }

  const noteTree = buildTeachGenieNoteTree(bundle.curriculum, bundle.notes);

  if (noteTree.length === 0) {
    // flagged course whose committed bundle carries no code-anchored notes —
    // the picker would be an empty shell, so the honest warm-up state stays
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {header}
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Teach SillyAI is warming up</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The flag is on but this course&apos;s revision notes haven&apos;t finished importing. Check back shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {header}
      <div className="mt-6">
        <TeachGenieClient course={slug} courseLabel={meta.label} noteTree={noteTree} />
      </div>
    </div>
  );
}
