import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Landmark, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { boardOf, getCourseMeta } from "@/lib/courses";
import { getUgmBundle, ugmResourceById } from "@/lib/ugm";
import { Breadcrumbs } from "@/components/hub/chrome";
import { Markdown } from "@/components/markdown";
import { MathText } from "@/components/hub/math-text";

/**
 * Underground Mathematics resource reader — the text of record landed by
 * T-UGM-IMPORT-1 (#58), rendered through the shared corpus Markdown
 * pipeline (math stays byte-true in UGM's native \( \) / \[ \] delimiters;
 * external links are flattened by the renderer's outbound-link law, so the
 * source URL appears as attribution text, never a live hop).
 *
 * Honesty surfaces: per-spec-point provenance (AI_SUGGESTED tier +
 * confidence from the corpus of record), rights holder + attestation line,
 * teacher-support disclosure, and the declared non-overlap reason when the
 * resource is one.
 */
export const dynamic = "force-dynamic";

/**
 * Metadata resolves BEFORE the body streams — calling notFound() here turns
 * a bad ugmId into a real HTTP 404. (T-UGM-RENDER-1: with force-dynamic the
 * body path streams 200 first, so the not-found UI rendered with a 200
 * status — the soft-404 the 2026-10-27 live audit caught.)
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string; ugmId: string }>;
}) {
  const { course: slug, ugmId } = await params;
  const meta = await getCourseMeta(slug);
  const ugm = meta ? await getUgmBundle(slug) : null;
  const resource = ugm ? ugmResourceById(ugm, ugmId) : null;
  if (!meta || !resource) notFound();
  return { title: resource.title };
}

export default async function UgmReaderPage({
  params,
}: {
  params: Promise<{ course: string; ugmId: string }>;
}) {
  const { course: slug, ugmId } = await params;
  const meta = await getCourseMeta(slug);
  const ugm = await getUgmBundle(slug);
  if (!meta || !ugm) notFound();
  const resource = ugmResourceById(ugm, ugmId);
  if (!resource) notFound();
  const base = `/courses/${meta.slug}`;

  const specCodes = resource.specPoints.map((s) => s.code);
  const siblings = resource.specPoints.flatMap((s) => {
    const sp = ugm.specPoints.find((x) => x.code === s.code);
    return (sp?.ugmIds ?? []).filter((id) => id !== resource.ugmId);
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: meta.level, href: "/courses" },
          { label: meta.subject, href: base },
          { label: "Underground Mathematics", href: `${base}/ugm` },
          { label: resource.title },
        ]}
      />

      <header className="mt-4 space-y-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
          <MathText text={resource.title} />
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {resource.resourceTypeLabel || resource.resourceType ? (
            <Badge variant="outline" className="text-[10px]">
              {resource.resourceTypeLabel ?? resource.resourceType}
            </Badge>
          ) : null}
          {resource.level ? (
            <Badge variant="outline" className="text-[10px]">
              {resource.level}
            </Badge>
          ) : null}
          {resource.hasTeacherSupport ? (
            <Badge variant="outline" className="text-[10px]">
              includes teacher support
            </Badge>
          ) : null}
          {resource.nonOverlap ? (
            <Badge variant="outline" className="border-dashed text-[10px]">
              not mapped to this lane
            </Badge>
          ) : (
            specCodes.map((code) => {
              const sp = resource.specPoints.find((s) => s.code === code);
              return (
                <Badge key={code} variant="outline" className="font-mono text-[10px]">
                  {sp?.primaryPick ? (
                    <Star className="mr-0.5 size-2.5 text-primary" aria-hidden />
                  ) : null}
                  {code}
                  {sp?.confidence ? ` · ${sp.confidence}` : ""}
                </Badge>
              );
            })
          )}
        </div>
      </header>

      {resource.nonOverlap && resource.nonOverlapReason ? (
        <Card className="mt-4 border-dashed">
          <CardContent className="flex items-start gap-2.5 p-3.5 text-[13px] leading-relaxed text-muted-foreground">
            <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Declared non-overlap.</span>{" "}
              {resource.nonOverlapReason} It is kept in the library for its maths, not as
              spec-point coverage — no coverage is manufactured.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-start gap-2.5 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium text-foreground">{ugm.rights.holder}</span>. Use inside
            SyllabAI under the operator attestation of 2026-10-23 — {ugm.rights.license}. Source:
            undergroundmathematics.org (text mention per the outbound-link law), imported from{" "}
            <span className="font-mono text-[11px]">
              {ugm.source.repo} {ugm.source.ref.slice(0, 16)}…
            </span>{" "}
            · alignment {ugm.reviewState.state.toLowerCase()} (AI-suggested, per-row confidence
            shown on the spec-point chips).
          </span>
        </CardContent>
      </Card>

      <article className="mt-6">
        <Markdown>{resource.bodyMd}</Markdown>
      </article>

      {siblings.length > 0 ? (
        <nav aria-label="More from these spec points" className="mt-8 border-t pt-4">
          <p className="mb-2 text-sm font-semibold">More from these spec points</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {siblings.map((id) => {
              const r = ugm.resources.find((x) => x.ugmId === id);
              if (!r) return null;
              return (
                <li key={id}>
                  <Link
                    href={`${base}/ugm/${r.ugmId}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] transition-colors hover:border-primary/40"
                  >
                    <ArrowLeft className="size-3.5 rotate-180 text-primary" aria-hidden />
                    <span className="min-w-0 truncate">
                      <MathText text={r.title} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
