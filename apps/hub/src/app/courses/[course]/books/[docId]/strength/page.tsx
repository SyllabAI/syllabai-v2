import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";

import { loadHubCourse } from "@/lib/courses";
import { fetchBookChapters, fetchBookShelf } from "@/lib/books";
import { fetchStrengthChecks } from "@/lib/books-strength";
import { StrengthCheckFlow } from "@/components/books/strength/strength-check-flow";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * T-BOOK-069 — the unit Strength Check surface (ADR-BOOK-0004 decision 3,
 * the run-002 serving core). One unit's VALIDATED bank items resolve through
 * the api's strength-checks law (the double gate upstream) and play here in
 * the immediate-reveal flow.
 *
 * Honest states (T-C20 posture): an unknown/unvalidated book is the SAME
 * 404 as a missing route; a malformed unit grammar 404s identically (no
 * state leak); [] (the pre-flip state) renders the not-published-yet card —
 * the operator's S4 flip is the ONLY lever that fills this surface, and the
 * shelf's Strength check row appears exactly when this one is non-empty.
 */
const UNIT_RE = /^u\d+$/;

export default async function StrengthCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string; docId: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { course: slug, docId } = await params;
  const { unit: unitParam } = await searchParams;
  const unit = unitParam?.trim() ?? "";
  if (!UNIT_RE.test(unit)) notFound();

  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const chapters = await fetchBookChapters(docId, slug);
  if (chapters === null || chapters.length === 0) notFound();

  // the unit label of record: the registry's own unit title for the unit's
  // chapters; a unit with no chapter rows (u0/appendix-shaped) still renders
  // the honest generic label — the api decides what serves, never the label
  const unitChapter = chapters.find((c) => c.unitIndex === Number(unit.slice(1)));
  const unitLabel = unitChapter
    ? `Unit ${unitChapter.unitIndex}${unitChapter.unitTitle ? ` — ${unitChapter.unitTitle}` : ""}`
    : `Unit ${unit.slice(1)}`;

  const shelf = await fetchBookShelf(slug);
  const book = shelf?.find((b) => b.documentId === docId) ?? null;

  const checks = await fetchStrengthChecks(docId, unit);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5">
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link href={`/courses/${slug}/books`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Shelf
          </Link>
        </Button>
        <span className="truncate font-medium">{book?.title ?? "Student book"}</span>
        <span className="text-muted-foreground">{unitLabel}</span>
      </div>

      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">
          {unitLabel} — Strength check
        </h1>
      </div>

      {checks === null ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          The strength check could not be loaded just now — try again in a moment.
        </div>
      ) : checks.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          This unit&apos;s strength check is not published yet. It appears here once the
          operator validates it — nothing is shown before that gate.
        </div>
      ) : (
        <StrengthCheckFlow
          documentId={docId}
          unit={unit}
          unitLabel={unitLabel}
          checks={checks}
        />
      )}
    </div>
  );
}
