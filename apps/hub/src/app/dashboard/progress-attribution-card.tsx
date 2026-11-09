"use client";

/**
 * DC-7 — the dashboard's measured-fact progress line (spec §3.7; prereg of
 * record docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md).
 *
 * THE LAW: the plan's task list renders from the same projection as the
 * trees, so the copy and the rings "can never disagree" — this card reads
 * the SAME `today` block of the SAME projection payload the topic trees
 * consume (lib/progress-server.ts; one fetch per course, shared cache).
 * It is a MEASURED-FACT panel, deliberately separate from the
 * recommendation output (the NextBestActionsCard's never-mixed law is
 * preserved — this card never ranks, never advises; it counts).
 *
 * Signed-out / fetch-failure per course → that course renders nothing (the
 * SIMULATED overlay has no dashboard presence of record; the fallback
 * posture is a non-display here by design). One card per enrolled course —
 * the hook sits in a per-course COMPONENT (never in a loop; the
 * rules-of-hooks law).
 *
 * Dashboard UX review 2026-11-04: the caller used to wrap this component in
 * a bare <section aria-label="Today's progress"> — so on a signed-in
 * dashboard whose projections all failed to resolve, production shipped a
 * labelled, EMPTY landmark (screen readers announced it; sighted users saw
 * a hole). The section now lives HERE and mounts only once at least one
 * course has content, and it carries the rail's real h2 (the rail's other
 * sections had headings; this one was a div in a labelled void). Cards keep
 * rendering (as null) while unresolved so their effects can report back —
 * no deadlock.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useCourseProjection } from "@/lib/progress-server";
import type { CourseMeta } from "@/lib/courses";

export function ProgressAttributionCard({ courses }: { courses: CourseMeta[] }) {
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const onResolved = useCallback((slug: string, ok: boolean) => {
    setResolved((prev) => (prev[slug] === ok ? prev : { ...prev, [slug]: ok }));
  }, []);
  const resolvedSlugs = courses.filter((c) => resolved[c.slug]);

  const cards = courses.map((c) => (
    <CourseTodayCard key={c.slug} course={c} onResolved={onResolved} />
  ));

  if (resolvedSlugs.length === 0) return <>{cards}</>;
  return (
    <section aria-label="Today's progress" className="space-y-3">
      <h2 className="text-lg font-semibold">Today&apos;s progress</h2>
      {cards}
    </section>
  );
}

function CourseTodayCard({
  course,
  onResolved,
}: {
  course: CourseMeta;
  onResolved: (slug: string, ok: boolean) => void;
}) {
  const payload = useCourseProjection(course.slug);
  const ok = payload != null;
  useEffect(() => {
    onResolved(course.slug, ok);
  }, [course.slug, ok, onResolved]);
  if (!payload) return null; // signed out / nothing resolved: no display
  const t = payload.today;
  const total = t.notesChecked + t.markedParts + t.mcqSubmitted;
  return (
    <Card data-testid="dc7-progress-attribution">
      <CardContent className="flex items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{course.label ?? course.slug}</h3>
          <p className="text-[10.5px] uppercase tracking-wide text-foreground/50">
            today&apos;s progress · from your events
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-foreground/70">
          {total > 0
            ? `${t.notesChecked} note${t.notesChecked === 1 ? "" : "s"} · ${t.markedParts} part${t.markedParts === 1 ? "" : "s"} marked · ${t.mcqSubmitted} MCQ${t.mcqSubmitted === 1 ? "" : "s"}`
            : "No progress events today"}
        </span>
      </CardContent>
    </Card>
  );
}
