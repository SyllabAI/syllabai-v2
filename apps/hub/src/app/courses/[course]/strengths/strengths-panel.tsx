"use client";

/**
 * F-184 — the decay-driven strength surface (Kognity dossier v1.1 Deep Dive
 * D §8.3 law 3 + §8.5 row 3; prereg docs/F184-DECAY-STRENGTH-BUILD-PLAN.md).
 *
 * REPLACES the engagement-coupled overlay panel (the localStorage SIMULATED
 * posture whose "% engaged" fill was the named anti-pattern of opening law
 * S3): this tab now renders ONE truth — the server's strength projection
 * over the learner's drill evidence lane (GET /drill/strengths, read-only).
 *
 * The surface law, rendered:
 *   - BAR_SEMANTICS rides the payload and renders VERBATIM — the semantics
 *     are the API's law of record; this file never re-derives a string.
 *   - The bars arrive weakest-first (the S5 ordering): the honest picture
 *     leads with what is fading.
 *   - The practice-now queue links into drill draws (/practice/drill?code=
 *     begins the draw at that address).
 *   - Honest absences (law S4): no graded evidence -> no bar; ungraded-only
 *     addresses are disclosed, never fabricated; a failed fetch renders the
 *     honest failure state, never a second truth.
 *   - No engagement counter exists anywhere in this file — by construction:
 *     the wire shape has none to render.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight, RefreshCw, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/api";
import { fetchStrengths, type StrengthResponse } from "@/lib/drill";
import { formatPercent, formatRelative, roundPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAND_CHIP = {
  LOW: "border-destructive/30 text-destructive",
  DEVELOPING: "border-warn/30 text-warn",
  SECURE: "border-success/30 text-success",
} as const;

const BAND_FILL = {
  LOW: "bg-destructive",
  DEVELOPING: "bg-warn",
  SECURE: "bg-success",
} as const;

/** 0.7533 -> "75%" — the repo's one percent-display law (lib/format). */
function strengthPercent(strength: number): string {
  return formatPercent(roundPercent(strength * 100));
}

export function StrengthsPanel({ course }: { course: string }) {
  const signedIn = useMemo(() => getToken() !== null, []);
  const [data, setData] = useState<StrengthResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(signedIn);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const d = await fetchStrengths(course);
    if (d) setData(d);
    else setFailed(true);
    setLoading(false);
  }, [course]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  if (!signedIn) {
    return (
      <Card className="mt-8">
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-muted-foreground">
            Strength is an identity-bearing surface: your bars are computed from the drill evidence keyed
            to your learner account. Sign in to see where your mastery stands — and where it is decaying.
          </p>
          <Button asChild>
            <Link href="/login">Sign in to see your strength</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">Computing your strength bars at read…</p>
    );
  }

  if (failed && !data) {
    return (
      <Card className="mt-8">
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-muted-foreground">
            The strength service did not answer. Nothing is fabricated in its place — the bars exist only
            where the drill&apos;s evidence lane answers.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-primary" aria-hidden />
        <h2 className="text-base font-semibold">Strength by spec point</h2>
        <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
          decay-aware · computed at read
        </Badge>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {data.semantics.formula} — {data.semantics.notAGrade}
      </p>

      {data.queue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="size-4 text-destructive" aria-hidden />
              Practice now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{data.semantics.queue}</p>
            {data.queue.map((q) => (
              <Link
                key={q.code}
                href={`/practice/drill?code=${encodeURIComponent(q.code)}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40"
              >
                <span className="font-mono text-sm font-medium">{q.code}</span>
                <Badge variant="outline" className={cn("text-[10px]", BAND_CHIP[q.band])}>
                  {q.band}
                </Badge>
                <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {strengthPercent(q.strength)} strength
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {data.bars.length > 0 ? (
        <div className="space-y-2">
          {data.bars.map((b) => (
            <div key={b.code} className="rounded-lg border p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium">{b.code}</span>
                <Badge variant="outline" className={cn("text-[10px]", BAND_CHIP[b.band])}>
                  {b.band}
                </Badge>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  anchor {strengthPercent(b.anchor)} · last graded {formatRelative(b.lastGradedAt)}
                  {" · "}
                  {b.gradedCount} graded
                  {b.ungradedCount > 0 ? ` · ${b.ungradedCount} structured (self-check)` : ""}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", BAND_FILL[b.band])}
                  style={{ width: `${b.strength * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : data.summary.addressesWithEvidence === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <p className="text-sm font-medium">No drill evidence yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Work a 5-question drill at any spec point and your first strength bar appears here. The drill
              is zero-stakes: it writes only its own practice log, never your gradebook.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/practice/drill">Start a drill</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/practice/battle">Battle the bot</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <p className="text-sm font-medium">Evidence so far — no graded parts yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {data.summary.addressesWithEvidence} address{data.summary.addressesWithEvidence === 1 ? "" : "es"}{" "}
              carry{data.summary.addressesWithEvidence === 1 ? "s" : ""} only structured (written) attempts,
              which stay ungraded — the server refuses to invent marks. Self-check them against the mark
              scheme in the drill; your first bar appears with your first server-graded part.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/practice/drill">Practise a graded drill</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/practice/battle">Battle the bot</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.summary.ungradedOnlyAddresses > 0 && data.bars.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.summary.ungradedOnlyAddresses} address{data.summary.ungradedOnlyAddresses === 1 ? "" : "es"}{" "}
          hold{data.summary.ungradedOnlyAddresses === 1 ? "s" : ""} only self-check evidence — no bar until a
          server-graded part lands there.
        </p>
      )}

      <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">{data.semantics.formula}</p>
        <p>{data.semantics.mastery}</p>
        <p>{data.semantics.decay}</p>
        <p>{data.semantics.notAGrade}</p>
        <p>{data.semantics.bands}</p>
        <p>{data.semantics.queue}</p>
        <p className="mt-1">
          Computed {formatRelative(data.generatedAt)} for this read — {data.summary.bars} of{" "}
          {data.summary.drillableAddresses} drillable spec points carry bars. ADR-031: the decayed values
          are computed at read and never stored.
        </p>
      </div>
    </div>
  );
}
