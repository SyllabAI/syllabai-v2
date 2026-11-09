import { notFound } from "next/navigation";
import Link from "next/link";
import { Compass, Landmark, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { boardOf, getCourseMeta } from "@/lib/courses";
import { getUgmBundle, ugmStationNames } from "@/lib/ugm";
import { MathText } from "@/components/hub/math-text";
import { CoursePageHeader } from "@/components/hub/course-header";

/**
 * Underground Mathematics index — the per-spec-point resource library for
 * one course (multi-lane: quadratics, Combining Functions, then Coordinate
 * geometry — the first two-station lane; ADR-UGM-0001 as amended
 * 2026-10-23). Serves ONLY when the flags.json gate
 * lists this course AND the committed bundle validates; otherwise
 * notFound() — the flag law is absent=OFF and an unflagged page must not
 * exist, not merely be empty.
 *
 * Honesty surfaces baked in: the rights holder line, the primaryPick marker
 * (the corpus's own curation, not our ranking). The declared
 * non-overlaps are listed with their recorded reasons — coverage is never
 * manufactured (AGENT.md rule 3 mirrored hub-side).
 *
 * T-UX-STUDENT-COPY r0 (operator order, trace 1a1a719a34bc5761): the
 * operator chips (review state, import repo/ref, text-only import) and
 * the operator-vocabulary prose ("operator attestation", "review gate",
 * "SUGGESTED") left the page — the bundle data of record is untouched,
 * it is just no longer rendered to students.
 */
export const dynamic = "force-dynamic";

export default async function CourseUgmPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const meta = await getCourseMeta(slug);
  const ugm = await getUgmBundle(slug);
  if (!meta || !ugm) notFound();
  const base = `/courses/${meta.slug}`;

  const byId = new Map(ugm.resources.map((r) => [r.ugmId, r]));
  const nonOverlaps = ugm.resources.filter((r) => r.nonOverlap);
  const { coverage, rights } = ugm;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CoursePageHeader
        meta={meta}
        crumb="Underground Mathematics"
        title="Underground Mathematics"
        description={`Cambridge's Underground Mathematics ${ugmStationNames(ugm)} collections for ${boardOf(meta)} ${meta.level} ${meta.subject} — ${coverage.aligned} resources mapped across ${ugm.specPoints.length} specification points, each with suggestions and worked solutions.`}
      />

      {/* provenance & rights card — always first, never buried */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Source &amp; rights
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className="font-mono text-[10px]">
              {ugm.specPoints.length} specification points
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{rights.holder}</span>. Source:
            undergroundmathematics.org.
          </p>
        </CardContent>
      </Card>

      {/* per-spec-point groups */}
      <div className="mt-8 space-y-6">
        {ugm.specPoints.map((sp) => (
          <section key={sp.code} aria-label={`Specification point ${sp.code}`} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold tracking-tight">
                <span className="font-mono text-primary">{sp.code}</span> · {sp.officialText}
              </h2>
              <Badge variant="outline" className="font-mono text-[10px]">
                {sp.ugmIds.length} resource{sp.ugmIds.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {/* t-ui-polish run-005: the lane's resource card-links speak the
                  house card-hover voice (border-primary/60 + shadow-sm lift).
                  Legacy /40 border-shifts — same pattern as the reader's
                  sibling nav, upgraded together. */}
              {sp.ugmIds.map((id) => {
                const r = byId.get(id);
                if (!r) return null; // bundle law guarantees presence; stay honest if drift
                const primary = r.specPoints.find((s) => s.code === sp.code)?.primaryPick;
                return (
                  <li key={id}>
                    <Link
                      href={`${base}/ugm/${r.ugmId}`}
                      className="group flex h-full items-start gap-3 rounded-md border px-3 py-2.5 transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm"
                    >
                      <Compass className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug">
                          <MathText text={r.title} />
                          {primary ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 align-middle text-[10px] font-semibold text-primary"
                              title="Recommended for this specification point"
                            >
                              <Star className="size-2.5" aria-hidden /> recommended
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {r.resourceTypeLabel ?? r.resourceType ?? "resource"}
                          {r.level ? ` · ${r.level}` : ""}
                          {r.hasTeacherSupport ? " · teacher support included" : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* extra-to-spec resources — recorded, never collapsed (rule 3) */}
      {nonOverlaps.length > 0 ? (
        <section aria-label="Resources beyond the specification map" className="mt-10 space-y-2">
          <h2 className="text-lg font-bold tracking-tight">
            Beyond these specification points
            <span className="ml-2 align-middle font-mono text-xs font-normal text-muted-foreground">
              {nonOverlaps.length} in the library
            </span>
          </h2>
          <p className="text-[13px] text-muted-foreground">
            These {ugmStationNames(ugm)} resources are kept for extra maths practice — they are
            not tied to the specification points above, and each one says why.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {nonOverlaps.map((r) => (
              <li key={r.ugmId}>
                <Link
                  href={`${base}/ugm/${r.ugmId}`}
                  className="group flex h-full items-start gap-3 rounded-md border border-dashed px-3 py-2.5 transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm"
                >
                  <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-snug">
                      <MathText text={r.title} />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {r.nonOverlapReason}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
