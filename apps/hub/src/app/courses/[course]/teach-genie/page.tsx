import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getCourseBundle, loadHubCourse } from "@/lib/courses";
import { allCourseParams } from "@/lib/static-params";
import { teachMeEnabledForCourse, teachMeGate } from "@/components/hub/teach-me/gate";
import { buildTeachMePickerTree } from "@/components/hub/teach-me/picker-data";
import { TeachGenieClient } from "@/components/hub/teach-genie/teach-genie-client";

/**
 * Teach Genie (T-TEACHGENIE-001) — the learn-by-teaching lane, reskinned to
 * the MathsGenie Teach Genie experience ("Exactly like mathsgenie" — the
 * saved captures the operator attached on 2026-11-04 are the UX of record).
 *
 * Gating law is UNCHANGED from Teach-Me (T-TEACHME-001 run-003): the
 * flags.json "teachMe" key (absent=OFF) gates rendering; every other course
 * serves the honest "import pending" roadmap state. The engine underneath
 * is the same run-002 API module — quota, ceilings, word floor, overlap,
 * D2 doctrine — now with the Baby Genie persona (config pupilName),
 * topic-aware openers (objectives.v2) and In-Depth = 6 objectives
 * ("Objective 1/6", MG parity). The .tg-scope wrapper (globals.css
 * T-TEACHGENIE-001) re-points the shadcn tokens to MG's palette, so the
 * surface reads MG in light and dark without forking the primitives.
 *
 * Wave 0 pilot of record: Edexcel IGCSE Chemistry (4CH1) —
 * igcse-chemistry-19. Wave 1/2 courses flip by flags.json slug.
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
    title: `Teach Genie — ${hub.meta.label}`,
    description: `Learn by teaching: explain ${hub.meta.label} topics to Baby Genie in your own words — he keeps asking until it makes sense, objectives tick off, and a review lands at the end.`,
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

  if (!enabled) {
    // honest roadmap state (plan §10): the lane rolls out course by course —
    // a non-pilot course renders this instead of a fabricated wizard.
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto mt-6 max-w-3xl">
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
            <Badge variant="outline" className="text-[10px]">
              import pending
            </Badge>
            <h2 className="mt-3 text-base font-semibold">Teach Genie isn&apos;t live for this course yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Learn-by-teaching rolls out course by course, grounded in each course&apos;s validated material. When
              this course&apos;s serving corpus is ready, Baby Genie appears here — this page is the honest state, not
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
        <div className="mx-auto mt-6 max-w-3xl">
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
            <h2 className="text-base font-semibold">Teach Genie is warming up</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              The flag is on but this course&apos;s spec tree hasn&apos;t finished importing. Check back shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const topics = buildTeachMePickerTree(bundle.curriculum);

  return (
    <div className="tg-scope flex min-h-[calc(100dvh-3.5rem)] flex-col antialiased">
      {/* the one breadcrumb of record — everything below is the MG surface */}
      <div className="px-4 pt-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {meta.label} <span className="mx-1" aria-hidden>·</span>{" "}
          <span className="font-medium text-foreground">Teach Genie</span>
        </p>
      </div>
      <TeachGenieClient course={slug} courseLabel={meta.label} topics={topics} />
    </div>
  );
}
