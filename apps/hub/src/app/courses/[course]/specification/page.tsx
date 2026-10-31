import { notFound } from "next/navigation";
import { getCourseBundle, loadHubCourse } from "@/lib/courses";
import { getDataProvider } from "@/lib/data";
import { CourseHeader } from "@/components/hub/course-header";
import { normalizeSpecText } from "@/lib/spec-text";
import { parseSpecStatement } from "@/lib/spec-statement";
import { SpecificationExplorer, type SpecTopicVM } from "./client";
import { allCourseParams } from "@/lib/static-params";

/**
 * Specification explorer — the official spec tree with each statement's
 * printed paper/unit/tier home (T-KG-17 consumer for the T-KG-16 canonical
 * applicability derivation). Zero invention: statements are the spine text
 * verbatim, chips render the canonical object verbatim, and the printed
 * rule sentence rides along as tooltip provenance.
 */

/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}
export default async function CourseSpecificationPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta, stats } = hub;

  // curriculum nodes: bundle read (all 49 committed courses); the provider
  // seam covers the pilot-without-bundle ladder the hub already supports
  const bundle = await getCourseBundle(slug);
  const curriculum =
    bundle?.curriculum ?? (hub.viaProvider ? await getDataProvider().curriculum() : null);
  if (!curriculum) notFound();

  const nodeByCode = new Map(curriculum.nodes.map((n) => [n.code, n]));
  const points = (codes: string[]) =>
    codes
      .map((c) => nodeByCode.get(c))
      .filter((n): n is NonNullable<typeof n> => Boolean(n))
      .map((n) => ({
        code: n.code,
        text: normalizeSpecText(n.title),
        // T-SPEC-RENDER-1: recover the printed list structure the import join
        // law flattened (' • ' sub_items; inline '(i)…(ii)' parts) — verbatim
        // slices only, parsed once at build so the prerendered HTML carries it
        statement: parseSpecStatement(n.title),
        applicability: n.applicability ?? null,
      }));

  // T-SPEC-AUDIT-1: board-aware header copy — the explorer serves CIE and
  // Pearson courses alike, and the filter sentence only applies where
  // applicability was actually derived (honest otherwise)
  const boardName = curriculum.board || "the awarding body";
  const hasApplicability = curriculum.nodes.some((n) => n.applicability);

  const topics: SpecTopicVM[] = hub.index.tree.topics.map((t) => ({
    number: t.number,
    title: t.title,
    subtopics: t.subtopics.map((s) => ({
      code: s.code,
      label: s.label,
      title: s.title,
      points: points(s.specPointCodes),
    })),
  }));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`${meta.subject} ${meta.code} — specification explorer`}
        crumb="Specification"
        description={`All ${stats.specPoints} specification statements from the official ${boardName} specification, as printed${hasApplicability ? ` — filter by paper, unit or tier exactly as ${boardName} assesses them` : ""}.`}
      />
      <div className="mt-6">
        <SpecificationExplorer topics={topics} totalPoints={stats.specPoints} />
      </div>
    </div>
  );
}
