import { notFound } from "next/navigation";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { StrengthsPanel } from "./strengths-panel";
import { allCourseParams } from "@/lib/static-params";

/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}

/**
 * F-184 — the decay-driven strength surface (Kognity dossier v1.1 Deep Dive
 * D §8.3 law 3 + §8.5 row 3; prereg docs/F184-DECAY-STRENGTH-BUILD-PLAN.md).
 * REPLACES the SIMULATED overlay prototype: the tab now renders the v2 API's
 * read-only strength projection — per-spec-point bars driven by learner state
 * + computed decay (ADR-031: computed, never persisted), the bar honestly
 * falling as skills decay and doubling as the practice-now queue at decaying
 * addresses. No engagement-only component anywhere (the named anti-pattern).
 */
export default async function StrengthsPage({
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
        activeTab="strengths"
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Strength`}
        crumb="Strengths & Weaknesses"
        description="Per-spec-point strength driven by learner state + computed decay (ADR-031: computed, never persisted) — the bar honestly falls as skills decay and doubles as your practice-now queue."
      />
      <StrengthsPanel course={meta.slug} />
      <p className="mt-6 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Where this data lives:</span> the bars read ONLY the
        drill&apos;s own practice log (the zero-stakes lane — never your gradebook or progress rings), and
        every decayed value is computed at read and never stored (ADR-031). Structured (written) drill
        parts stay ungraded until you self-check them against the mark scheme.
      </p>
    </div>
  );
}
