"use client";

/**
 * T-KG-COV-1 — the syllabus coverage surface ("seen vs proven").
 *
 * Two evidence lanes meet here and the labels keep them honest:
 *   - SEEN  — browser-local self-report exposure (notes read, cards rated,
 *     votes cast): the kg-learner-state law is verbatim — "exposure only —
 *     never mastery". The surface never calls a seen point learned.
 *   - PROVEN — marked evidence: `stored != null` on either derivation path
 *     (direct attempts on the sim lane; direct or topic-derived measured
 *     skill on the core lane — the same rows the graph paints and the
 *     drawer tags "via <topic>").
 *
 * The rollup itself is the pure lib/kg-coverage.ts (bun-tested bucket law);
 * this file only fetches the syllabus map, reads the learner join, and
 * renders. Honest absences, the strengths-page way: a syllabus map that
 * does not answer renders the failure state, an evidence join that does
 * not answer renders the failure state — nothing is fabricated in place
 * of either, and no engagement counter masquerades as coverage.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ListChecks, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/provenance";
import { useLearnerState } from "@/lib/kg-learner-state";
import {
  rollupCoverage,
  type CoverageBucket,
  type CoverageGraphInput,
  type CoverageRollup,
} from "@/lib/kg-coverage";
import { cn } from "@/lib/utils";

const BUCKET_CHIP: Record<CoverageBucket, string> = {
  proven: "border-success/40 text-success",
  seen: "border-warn/40 text-warn",
  untouched: "border-muted-foreground/30 text-muted-foreground",
};

const BUCKET_FILL: Record<CoverageBucket, string> = {
  proven: "bg-success",
  seen: "bg-warn/60",
  untouched: "bg-muted",
};

const BUCKET_LABEL: Record<CoverageBucket, string> = {
  proven: "proven",
  seen: "seen — not yet proven",
  untouched: "not started",
};

/** One stacked coverage bar — proven | seen | untouched, widths in %. */
function CoverageBar({
  proven,
  seen,
  total,
  className,
}: {
  proven: number;
  seen: number;
  total: number;
  className?: string;
}) {
  if (total === 0) return null;
  const pw = (proven / total) * 100;
  const sw = (seen / total) * 100;
  return (
    <div
      className={cn("flex h-2 overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${proven} of ${total} points proven, ${seen} seen but not proven, ${total - proven - seen} not started`}
    >
      {proven > 0 && <div className={cn(BUCKET_FILL.proven, "h-full")} style={{ width: `${pw}%` }} />}
      {seen > 0 && <div className={cn(BUCKET_FILL.seen, "h-full")} style={{ width: `${sw}%` }} />}
      {/* untouched is the track itself — no third segment needed */}
    </div>
  );
}

function FailureCard({ body }: { body: string }) {
  return (
    <Card className="mt-6">
      <CardContent className="space-y-3 py-6">
        <p className="text-sm text-muted-foreground">{body}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      </CardContent>
    </Card>
  );
}

export function CoveragePanel({ course }: { course: string }) {
  const [graph, setGraph] = useState<CoverageGraphInput | null>(null);
  const [graphFailed, setGraphFailed] = useState(false);
  const [graphLoading, setGraphLoading] = useState(true);

  // reset derived-fetch state on course switch during render (react.dev —
  // "adjusting state when a prop changes", the same pattern
  // lib/kg-learner-state.ts rides; keeps the effect free of sync setState)
  const [prevCourse, setPrevCourse] = useState(course);
  if (prevCourse !== course) {
    setPrevCourse(course);
    setGraph(null);
    setGraphFailed(false);
    setGraphLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/kg/data/${encodeURIComponent(course)}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<CoverageGraphInput>) : null))
      .then((json) => {
        if (cancelled) return;
        if (json) setGraph(json);
        else setGraphFailed(true);
        setGraphLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGraphFailed(true);
        setGraphLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [course]);

  const learner = useLearnerState(course);
  const rollup: CoverageRollup | null = useMemo(
    () => (graph ? rollupCoverage(graph, learner.drawer?.pointStates) : null),
    [graph, learner.drawer],
  );

  if (graphLoading || (!rollup && !graphFailed)) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Reading the syllabus map and joining your evidence…
      </p>
    );
  }

  if (graphFailed || !rollup || rollup.total === 0) {
    return (
      <FailureCard body="The syllabus map for this course did not answer. Nothing is fabricated in its place — the coverage bars exist only where the curriculum graph loads." />
    );
  }

  if (learner.overlay?.bridgeError || !learner.drawer) {
    return (
      <FailureCard body="The evidence join for this course did not answer, so coverage cannot be attributed honestly. Nothing is fabricated in its place — every point would read “not started”, and that would be a lie of omission." />
    );
  }

  const { proven, seen, untouched, total } = rollup;
  const provenPct = total > 0 ? Math.round((proven / total) * 100) : 0;
  const live = learner.source === "core";
  const awaiting = learner.drawer.stats.awaitingMarks;

  return (
    <div className="mt-6 space-y-6">
      {/* ── overall ── */}
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">Coverage across the course</h2>
            <ProvenanceBadge tier={live ? "CORE_MEASURED" : "SIMULATED"} />
          </div>
          <CoverageBar proven={proven} seen={seen} total={total} className="h-3" />
          <div className="space-y-1">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{seen}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="font-semibold tabular-nums">{total}</span>
              <span className="text-muted-foreground"> spec points seen · </span>
              <span className="font-semibold tabular-nums">{proven}</span>
              <span className="text-muted-foreground"> proven by marked evidence (</span>
              <span className="tabular-nums">{provenPct}%</span>
              <span className="text-muted-foreground">) · </span>
              <span className="tabular-nums">{untouched}</span>
              <span className="text-muted-foreground"> not started</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {live
                ? "Live account evidence — marked attempts recorded on your account."
                : "This browser's local progress — the same demo lane the knowledge graph reads."}
              {awaiting > 0 &&
                ` ${awaiting} typed ${awaiting === 1 ? "answer" : "answers"} await self-marking and will count once marked.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BUCKET_LABEL) as CoverageBucket[]).map((b) => (
              <Badge key={b} variant="outline" className={cn("text-[10px]", BUCKET_CHIP[b])}>
                {BUCKET_LABEL[b]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── per-section rollup ── */}
      <div className="space-y-3">
        {rollup.sections.map((sec) => (
          <Card key={sec.code}>
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                {sec.color && (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: sec.color }}
                    aria-hidden
                  />
                )}
                <span className="text-sm font-semibold">
                  <span className="text-muted-foreground tabular-nums">{sec.code}</span>{" "}
                  {sec.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sec.seen + sec.proven}/{sec.total} seen · {sec.proven} proven
                </span>
                <CoverageBar proven={sec.proven} seen={sec.seen} total={sec.total} className="min-w-24 flex-1" />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform [[open]>&]:rotate-90" aria-hidden />
              </summary>
              <div className="space-y-4 border-t px-4 py-3">
                {sec.groups.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      <span className="tabular-nums">{group.id}</span> {group.label}
                    </p>
                    <ul className="space-y-1">
                      {group.points.map((p) => (
                        <li key={p.pointId} className="flex items-baseline gap-2 text-sm">
                          <span
                            className={cn(
                              "mt-1 size-2 shrink-0 rounded-full",
                              BUCKET_FILL[p.bucket],
                              p.bucket === "untouched" && "ring-1 ring-muted-foreground/30",
                            )}
                            aria-hidden
                          />
                          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                            {p.pointId}
                          </span>
                          <span className={cn("min-w-0 flex-1", p.bucket === "untouched" && "text-muted-foreground")}>
                            {p.statement || p.pointId}
                          </span>
                          {p.effective != null && (
                            <span className="shrink-0 text-xs font-medium text-success tabular-nums">
                              {p.effective}%
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        ))}
      </div>

      {/* ── the one honest CTA ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-sm text-muted-foreground">
            Seen is not proven — the points worth practising are the ones you have only seen.
          </p>
          <Button asChild>
            <Link href={`/courses/${course}/strengths`}>Practise by spec point</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
