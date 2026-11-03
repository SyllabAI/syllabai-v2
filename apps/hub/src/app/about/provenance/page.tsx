import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDataProvider } from "@/lib/data";
import { bundlePinCensus, shortPinRef } from "@/lib/courses";
import { ProvenanceBadge } from "@/components/provenance";

export const metadata: Metadata = {
  title: "Content provenance",
  description:
    "The full provenance register: what produced every tier of content on SyllabAI, and who governs it.",
};

/**
 * The provenance register, moved off the student hero (frontend-flow audit
 * F-1): same tiers, same honesty — operator-facing room now. The hero keeps
 * only the student-safe one-liner in the global footer, which links here.
 */
export default async function ProvenancePage() {
  const provider = getDataProvider();
  const [manifest, pins] = await Promise.all([provider.manifest(), bundlePinCensus()]);

  // importSource.ref is "branch@<40-hex>" — display the short hash; the
  // full ref stays in the manifest (same treatment the hero panel had).
  const importRef = shortPinRef(manifest.importSource.ref);

  // Per-course pin census (T-DISPLAY-PINCENSUS-1): the bundle plane carries
  // per-course pins, so this page must never render one course's ref as a
  // site-wide claim. The census is computed from the committed manifests —
  // it can report a stale or split pin distribution, but never invent one.
  const officialPinCount = pins.groups.filter((g) => g.isPin).length;
  const pinLine = pins.groups
    .map((g) =>
      g.isPin
        ? `${g.boards.join(" + ")} ${shortPinRef(g.ref)} ×${g.courses}`
        : `local ${g.repos.join(" + ")} ×${g.courses}`,
    )
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>

      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="size-6 text-primary" aria-hidden />
          What is real on this surface
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The full provenance register — every tier of content on SyllabAI, what produced it and
          who governs it. Study surfaces carry the short, student-safe statement in the footer;
          this page is the complete version.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Provenance register
          </CardTitle>
          <CardDescription className="break-all">
            Pilot bundle: {manifest.importSource.repo}@{importRef} ·{" "}
            {manifest.curriculum.board} {manifest.curriculum.level} {manifest.curriculum.subject}{" "}
            ({manifest.curriculum.code}, {manifest.curriculum.syllabusVersion})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Exam data is pinned per course (no site-wide pin) — {pins.bundled} served courses
            across {officialPinCount} official pin{officialPinCount === 1 ? "" : "s"}: {pinLine}
            {pins.unpinned > 0
              ? ` · ${pins.unpinned} bundled course${pins.unpinned === 1 ? "" : "s"} with no pin recorded`
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge tier="RULE_DERIVED" />
            <span className="text-muted-foreground">
              specification skeleton + prerequisites — operator-governed graph-as-code
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge tier="AI_SUGGESTED" />
            <span className="text-muted-foreground">
              T-C11 concepts &amp; semantic edges — shown with provenance, never silently promoted
            </span>
          </div>
          <div className="flex-wrap items-center gap-2 sm:flex">
            <ProvenanceBadge tier="DEMO_DERIVED" />
            <span className="text-muted-foreground">
              flashcards generated for the pilot corpus — disposable by design
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge tier="SIMULATED" />
            <span className="text-muted-foreground">
              learner overlay — deterministic fiction, never a governed model
            </span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            {manifest.license}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
