"use client";

/**
 * GradeBoundariesWorkspace (T-GRADE-1 + T-GRADE-2) — the course
 * grade-boundaries surface.
 *
 * MathsGenie predicted-grade-calculator feature set, hub shell:
 *   - Table | Graph toggle (MG's view pair) over the same corpus;
 *   - session pills incl. "Average" (MG's modal-grade mode);
 *   - THREE calculator modes, all corpus-driven:
 *       · linear-total      — one total-mark slider (Edexcel linear IGCSE);
 *       · aggregate-ums     — per-unit raw marks -> piecewise-linear raw→UMS
 *                             conversion through each unit's own published
 *                             boundary pairs -> UMS total graded against the
 *                             cash-in boundaries, with the board's A* rule
 *                             (Pearson IAL + modular IGCSE — T-GRADE-2);
 *       · display-only      — honest note (route-based CIE / not-yet-encoded
 *                             cash-ins) while tables and graph stay live;
 *   - every number on screen comes from the sha256-proven official PDF
 *     corpus (bundle.v1.json) — provenance printed in the footer.
 */
import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Info,
  Sigma,
  Table2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aggregateUms,
  gradeForMark,
  gradeFromAggregation,
  isRegionalVariant,
  marksToNextGrade,
  modalGradeAcrossSeries,
  primaryRow,
  rawToUms,
  usableOptionalPairs,
  type AggregationUnit,
  type BoundaryRow,
} from "@/lib/grade-boundaries-calc";
import type {
  GradeBoundariesCourse,
  GradeBoundariesSeries,
} from "@/lib/grade-boundaries";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_VAR = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function fmtGradeCell(v: number | null | undefined): string {
  return typeof v === "number" ? String(v) : "–";
}

function awardLabel(award: string | null | undefined): string | null {
  if (!award) return null;
  if (award === "A-Level-linear") return "A Level · linear";
  if (award === "A-Level-staged") return "A Level · staged";
  if (award === "AS") return "AS";
  return award;
}

export function GradeBoundariesWorkspace({
  entry,
}: {
  entry: GradeBoundariesCourse;
}) {
  const ladder = useMemo(
    () => entry.gradeLadder ?? [],
    [entry.gradeLadder],
  );
  const calc = entry.calculator;
  const isLinear = calc?.mode === "linear-total" && calc.maxMark != null;
  const isAgg =
    calc?.mode === "aggregate-ums" &&
    !!calc.cashIn &&
    !!calc.required?.length;

  // group rows per session (a session can carry standard + R-variant rows)
  const sessions = useMemo(() => {
    const by = new Map<string, GradeBoundariesSeries[]>();
    for (const s of entry.series) {
      const arr = by.get(s.session) ?? [];
      arr.push(s);
      by.set(s.session, arr);
    }
    return [...by.entries()].map(([session, rows]) => ({
      session,
      year: rows[0]?.year ?? 0,
      rows,
      primary: primaryRow(rows),
    }));
  }, [entry]);

  const [view, setView] = useState<"table" | "graph">("table");
  const [sessionPick, setSessionPick] = useState<string>("average");
  const [mark, setMark] = useState<number>(0);
  const maxMark = calc?.maxMark ?? null;
  const canCalculate = isLinear;

  const clampedMark = Math.max(0, Math.min(maxMark ?? 0, Math.round(mark) || 0));

  const activeSession = sessions.find((s) => s.session === sessionPick);
  const calcRow = activeSession ? activeSession.primary : null;

  const achieved = useMemo(() => {
    // run-002: the linear calculator only grades on sessions that carry an
    // overall boundary row (linear-total courses always do — asserted by
    // scripts/validate_gradeb_bundle.ts; guard keeps the type honest).
    const row = calcRow?.boundaries;
    if (!canCalculate || !row || !calcRow?.maxMark) return null;
    const rowLadder = calcRow.gradeLadder ?? ladder;
    return {
      grade: gradeForMark(row, rowLadder, clampedMark),
      next: marksToNextGrade(row, rowLadder, clampedMark),
    };
  }, [canCalculate, calcRow, clampedMark, ladder]);

  const average = useMemo(() => {
    if (!canCalculate || sessionPick !== "average") return null;
    return modalGradeAcrossSeries(
      sessions
        .map((s) => ({
          session: s.session,
          boundaries: primaryRow(s.rows).boundaries,
        }))
        .filter((x): x is { session: string; boundaries: BoundaryRow } =>
          !!x.boundaries,
        ),
      ladder,
      clampedMark,
    );
  }, [canCalculate, sessionPick, sessions, ladder, clampedMark]);

  // ------------------------------------------------------------------
  // aggregate-ums calculator state (T-GRADE-2)
  // ------------------------------------------------------------------
  const [unitMarks, setUnitMarks] = useState<Record<string, number>>({});
  const [pairIdx, setPairIdx] = useState(0);

  // per-session aggregation eligibility + composition units
  const aggSessions = useMemo(() => {
    if (!isAgg) return [];
    const required = calc?.required ?? [];
    return sessions.map((s) => {
      const units = s.primary.calculatorUnits ?? [];
      const codes = new Set(units.map((u) => u.code));
      const requiredOk = required.every((c) => codes.has(c));
      const pairs = usableOptionalPairs(calc?.optionalPairs, units);
      const hasUms = units.every((u) => !!u.ums);
      const cashIn = s.primary.cashIns?.find(
        (c) => c.code === calc?.cashIn,
      );
      return {
        session: s.session,
        year: s.year,
        units,
        cashIn,
        pairs,
        eligible: requiredOk && hasUms && !!cashIn
          && (pairs.length > 0 || !calc?.optionalPairs?.length),
      };
    });
  }, [isAgg, calc, sessions]);

  const activeAgg = aggSessions.find(
    (a) => a.session === sessionPick,
  );
  const pairPick: [string, string] | null =
    isAgg && activeAgg?.pairs.length
      ? activeAgg.pairs[Math.min(pairIdx, activeAgg.pairs.length - 1)]
      : null;

  const compositionUnits = useMemo<AggregationUnit[]>(() => {
    if (!isAgg || !activeAgg?.eligible) return [];
    const byCode = new Map(
      activeAgg.units.map((u) => [u.code, u] as const),
    );
    const req = (calc?.required ?? [])
      .map((c) => byCode.get(c))
      .filter((u): u is AggregationUnit => !!u);
    const pairUnits = (pairPick ?? [])
      .map((c) => byCode.get(c))
      .filter((u): u is AggregationUnit => !!u);
    return [...req, ...pairUnits];
  }, [isAgg, activeAgg, pairPick, calc]);

  const aggResult = useMemo(() => {
    if (!compositionUnits.length) return null;
    return aggregateUms({ units: compositionUnits, marks: unitMarks });
  }, [compositionUnits, unitMarks]);

  const aggGrade = useMemo(() => {
    if (!isAgg || !aggResult || !activeAgg?.cashIn) return null;
    return gradeFromAggregation(
      activeAgg.cashIn,
      calc?.aStar,
      aggResult,
    );
  }, [isAgg, aggResult, activeAgg, calc]);

  const aggNext = useMemo(() => {
    if (!aggResult || !activeAgg?.cashIn) return null;
    return marksToNextGrade(
      activeAgg.cashIn.boundaries,
      activeAgg.cashIn.gradeLadder ?? ladder,
      aggResult.totalUms,
    );
  }, [aggResult, activeAgg, ladder]);

  // the A2-aggregate shortfall text (A* rule not met while total is 480+)
  const aggAStarGap = useMemo(() => {
    const aStar = calc?.aStar;
    if (!aggResult || !aStar || !aggGrade) return null;
    if (aggGrade.aStarRuleApplied) return null;
    if (aggResult.totalUms < aStar.overallMin) return null;
    const a2Ums = aStar.a2Units.reduce(
      (acc, code) =>
        acc + (aggResult.perUnit.find((p) => p.code === code)?.ums ?? 0),
      0,
    );
    if (a2Ums >= aStar.a2Min) return null;
    return { have: a2Ums, need: aStar.a2Min };
  }, [aggResult, aggGrade, calc]);

  // Average mode for the aggregation: modal aggregate grade across the
  // calculator-eligible sessions (same raw marks, per-session conversions)
  const aggAverage = useMemo(() => {
    if (!isAgg || sessionPick !== "average" || !calc?.cashIn) return null;
    const eligible = aggSessions.filter((a) => a.eligible);
    const perSeries = eligible.map((a) => {
      const byCode = new Map(a.units.map((u) => [u.code, u] as const));
      const req = (calc.required ?? [])
        .map((c) => byCode.get(c))
        .filter((u): u is AggregationUnit => !!u);
      const p = a.pairs[0];
      const pairUnits = (p ?? [])
        .map((c) => byCode.get(c))
        .filter((u): u is AggregationUnit => !!u);
      const agg = aggregateUms({
        units: [...req, ...pairUnits],
        marks: unitMarks,
      });
      const { grade } = gradeFromAggregation(a.cashIn!, calc.aStar, agg);
      return { session: a.session, grade };
    });
    const counts = new Map<string, number>();
    for (const p of perSeries) {
      if (p.grade === null) continue;
      counts.set(p.grade, (counts.get(p.grade) ?? 0) + 1);
    }
    const order = activeAgg?.cashIn?.gradeLadder ?? ladder;
    let best: string | null = null;
    let bestCount = 0;
    for (const grade of order) {
      const c = counts.get(grade) ?? 0;
      if (c > bestCount) {
        best = grade;
        bestCount = c;
      }
    }
    return { grade: best, perSeries };
  }, [isAgg, sessionPick, aggSessions, unitMarks, calc, activeAgg, ladder]);

  // ------------------------------------------------------------------
  // graph data — the trend that exists for THIS qualification kind:
  //   linear: the total-mark boundaries;  modular/IAL: the cash-in UMS
  //   boundaries;  CIE: the most common route's weighted boundaries
  // ------------------------------------------------------------------
  const hasLinearRows = entry.series.some((s) =>
    Object.values(s.boundaries ?? {}).some((v) => typeof v === "number"),
  );

  const cashInRowOf = (s: GradeBoundariesSeries) =>
    s.cashIns?.find((c) => c.code === (calc?.cashIn ?? entry.code)) ??
    s.cashIns?.[0];

  const routeCombo = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of sessions) {
      for (const r of s.primary.routes ?? []) {
        count.set(r.combination, (count.get(r.combination) ?? 0) + 1);
      }
    }
    return (
      [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    );
  }, [sessions]);

  const graphMode: "linear" | "cashin" | "route" | "none" = hasLinearRows
    ? "linear"
    : sessions.some((s) => !!cashInRowOf(s.primary))
      ? "cashin"
      : routeCombo
        ? "route"
        : "none";

  const graphRows = useMemo(() => {
    if (graphMode === "linear") {
      return [...sessions]
        .sort((a, b) => a.year - b.year || a.session.localeCompare(b.session))
        .map((s) => ({ session: s.session, ...(s.primary.boundaries ?? {}) }));
    }
    if (graphMode === "cashin") {
      return [...sessions]
        .sort((a, b) => a.year - b.year || a.session.localeCompare(b.session))
        .map((s) => {
          const c = cashInRowOf(s.primary);
          return { session: s.session, ...(c?.boundaries ?? {}) };
        });
    }
    if (graphMode === "route" && routeCombo) {
      return [...sessions]
        .sort((a, b) => a.year - b.year || a.session.localeCompare(b.session))
        .map((s) => {
          const r = (s.primary.routes ?? []).find(
            (x) => x.combination === routeCombo,
          );
          return { session: s.session, ...(r?.boundaries ?? {}) };
        });
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode, sessions, routeCombo]);

  const graphLadder = useMemo(() => {
    if (graphMode === "cashin") {
      const c = sessions
        .map((s) => cashInRowOf(s.primary))
        .find((c) => !!c);
      return c?.gradeLadder ?? ladder;
    }
    if (graphMode === "route") {
      return sessions[0]?.primary.gradeLadder ?? ladder;
    }
    return ladder;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode, sessions, ladder]);

  const graphGrades = useMemo(
    () =>
      graphLadder.filter(
        (g) =>
          g !== "U" && graphRows.some((r) => typeof r[g] === "number"),
      ),
    [graphLadder, graphRows],
  );
  const graphMax =
    graphMode === "cashin"
      ? (cashInRowOf(sessions[sessions.length - 1]?.primary
           ?? entry.series[0])?.maxMark ?? 0)
      : graphMode === "route" && routeCombo
        ? (sessions[0]?.primary.routes ?? []).find(
            (r) => r.combination === routeCombo,
          )?.maxWeightedMark ?? 0
        : (entry.series[0]?.maxMark ?? 0);

  const graphCaption =
    graphMode === "cashin"
      ? `Cash-in UMS boundaries per session — ${graphRows.length} sessions, standard variant${entry.tier ? ` (${entry.tier} tier)` : ""}`
      : graphMode === "route"
        ? `Route ${routeCombo} (weighted marks) across sessions — ${graphRows.length} sessions`
        : `Minimum marks per grade across sessions — ${graphRows.length} sessions, standard variant per session${entry.tier ? ` (${entry.tier} tier)` : ""}`;

  const aggLadder = activeAgg?.cashIn?.gradeLadder ?? ladder;

  return (
    <div className="space-y-5">
      {/* session pills (MG: Average + every series) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant={sessionPick === "average" ? "default" : "outline"}
          size="sm"
          className="h-8 rounded-full"
          aria-pressed={sessionPick === "average"}
          onClick={() => setSessionPick("average")}
        >
          <Sigma className="size-3.5" aria-hidden /> Average
        </Button>
        {sessions.map((s) => (
          <Button
            key={s.session}
            variant={sessionPick === s.session ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full"
            aria-pressed={sessionPick === s.session}
            onClick={() => setSessionPick(s.session)}
          >
            <CalendarRange className="size-3.5" aria-hidden /> {s.session}
          </Button>
        ))}
      </div>

      {/* linear-total calculator (one mark slider) */}
      {canCalculate && (
        <Card>
          <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {sessionPick === "average"
                    ? "Your total mark (across all papers)"
                    : `Your total mark — ${sessionPick}`}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {clampedMark} / {maxMark}
                </p>
              </div>
              <Slider
                value={[clampedMark]}
                max={maxMark ?? 1}
                step={1}
                aria-label="Total mark"
                onValueChange={(v) => setMark(v[0] ?? 0)}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={maxMark ?? undefined}
                  value={clampedMark}
                  aria-label="Total mark (number input)"
                  className="h-9 w-28 tabular-nums"
                  onChange={(e) => setMark(Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground">
                  enter the total across all papers
                </span>
              </div>
            </div>
            <div className="shrink-0 lg:w-64">
              {sessionPick === "average" && average ? (
                <div className="rounded-xl border bg-muted/40 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Most likely grade (modal across {sessions.length} sessions)
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums">
                    {average.grade ?? "–"}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {average.perSeries.map((p) => (
                      <Badge key={p.session} variant="outline" className="font-mono text-[10px]">
                        {p.session}: {p.grade ?? "–"}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : achieved ? (
                <div className="rounded-xl border bg-muted/40 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Predicted grade — {sessionPick}
                  </p>
                  <p className="mt-1 text-5xl font-bold tabular-nums">
                    {achieved.grade ?? "–"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {achieved.next
                      ? `${achieved.next.marks} more mark${achieved.next.marks === 1 ? "" : "s"} for grade ${achieved.next.grade}`
                      : clampedMark >= (calcRow?.maxMark ?? 0)
                        ? "top of the ladder"
                        : "boundary not available"}
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* aggregate-ums calculator (IAL / modular IGCSE) */}
      {isAgg && (
        <Card>
          <CardContent className="space-y-4 p-5">
            {sessionPick === "average" ? (
              aggAverage && aggAverage.perSeries.length > 0 ? (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Most likely grade (modal across{" "}
                    {aggAverage.perSeries.length} sessions, same unit marks)
                  </p>
                  <p className="text-4xl font-bold tabular-nums">
                    {aggAverage.grade ?? "–"}
                  </p>
                  <div className="flex flex-wrap justify-center gap-1">
                    {aggAverage.perSeries.map((p) => (
                      <Badge
                        key={p.session}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {p.session}: {p.grade ?? "–"}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="size-4" aria-hidden /> No session in the
                  corpus can compose the {calc?.cashIn} aggregation.
                </p>
              )
            ) : !activeAgg?.eligible ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4" aria-hidden /> The {calc?.cashIn}{" "}
                composition cannot be examined in {sessionPick} — one or more
                units were not offered that session. The tables below stay
                fully live.
              </p>
            ) : (
              <>
                {activeAgg.pairs.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">
                      Optional applied pair
                    </span>
                    {activeAgg.pairs.map((p, i) => (
                      <Button
                        key={`${p[0]}+${p[1]}`}
                        variant={i === Math.min(pairIdx, activeAgg.pairs.length - 1) ? "default" : "outline"}
                        size="sm"
                        className="h-7 rounded-full font-mono text-[11px]"
                        aria-pressed={i === pairIdx}
                        onClick={() => setPairIdx(i)}
                      >
                        {p[0]} + {p[1]}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {compositionUnits.map((u) => {
                    const raw = Math.max(
                      0,
                      Math.min(u.maxMark, Math.round(unitMarks[u.code] ?? 0) || 0),
                    );
                    const ums = rawToUms(u, raw);
                    return (
                      <div
                        key={u.code}
                        className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {u.code}
                          </p>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={u.maxMark}
                            value={raw}
                            aria-label={`Raw mark for ${u.code}`}
                            className="h-8 w-20 tabular-nums"
                            onChange={(e) =>
                              setUnitMarks((m) => ({
                                ...m,
                                [u.code]: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold tabular-nums">
                            {ums ?? "–"}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            UMS / {u.ums?.maxMark ?? "?"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Aggregated UMS — {activeAgg.cashIn!.code} cash-in
                      <span className="ml-2 font-normal text-muted-foreground">
                        {aggResult?.totalUms ?? 0} / {aggResult?.maxUms ?? 0}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      raw marks convert to UMS through each unit&apos;s own
                      published boundaries; the cash-in grades the UMS total
                      {aggGrade?.aStarRuleApplied
                        ? " — A* via the A2-aggregate rule (A overall + 90% of A2 UMS)"
                        : ""}
                      .
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 px-6 py-3 text-center sm:w-56">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Predicted grade — {sessionPick}
                    </p>
                    <p className="text-4xl font-bold tabular-nums">
                      {aggGrade?.grade ?? "–"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {aggAStarGap
                        ? `A2 aggregate ${aggAStarGap.have}/${aggAStarGap.need} — ${aggAStarGap.need - aggAStarGap.have} more A2 UMS for A*`
                        : aggNext
                          ? `${aggNext.marks} more UMS for grade ${aggNext.grade}`
                          : "top of the ladder"}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* table | graph */}
      <Tabs value={view} onValueChange={(v) => setView(v as "table" | "graph")}>
        <TabsList>
          <TabsTrigger value="table">
            <Table2 className="size-4" aria-hidden /> Table
          </TabsTrigger>
          <TabsTrigger value="graph">
            <BarChart3 className="size-4" aria-hidden /> Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-3 space-y-4">
          {/* linear total-mark rows (Edexcel linear International GCSE) */}
          {hasLinearRows && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <caption className="sr-only">
                      Minimum marks for each grade, by exam session
                    </caption>
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th scope="col" className="px-4 py-2.5 font-medium">Session</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Papers</th>
                        {ladder.map((g) => (
                          <th key={g} scope="col" className="px-3 py-2.5 text-center font-medium">{g}</th>
                        ))}
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.series.map((s, i) => {
                        const rowLadder = s.gradeLadder ?? ladder;
                        const rowGrade = canCalculate && s.boundaries
                          ? gradeForMark(s.boundaries, rowLadder, clampedMark)
                          : null;
                        return (
                          <tr
                            key={`${s.session}-${s.papersNote ?? i}`}
                            className="border-b last:border-0"
                          >
                            <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                              {s.session}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {s.papersNote ?? s.scale ?? "—"}
                                </span>
                                {isRegionalVariant(s.papersNote) && (
                                  <Badge variant="outline" className="px-1 py-0 text-[10px]">R</Badge>
                                )}
                                {s.tier && (
                                  <Badge variant="outline" className="px-1 py-0 text-[10px] capitalize">
                                    {s.tier}
                                  </Badge>
                                )}
                                {canCalculate && rowGrade && (
                                  <Badge className="px-1.5 py-0 text-[10px]">{rowGrade}</Badge>
                                )}
                              </span>
                            </td>
                            {ladder.map((g) => {
                              const isAchieved = canCalculate && rowGrade === g;
                              return (
                                <td
                                  key={g}
                                  className={
                                    "px-3 py-2.5 text-center tabular-nums" +
                                    (isAchieved ? " rounded-md bg-accent-primary font-semibold text-accent-primary-foreground" : "")
                                  }
                                >
                                  {fmtGradeCell(s.boundaries?.[g])}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                              {s.maxMark ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* cash-in (overall qualification) rows — the qualification-level
              UMS ladder, incl. Double Award pair ladders (4XSD1) */}
          {entry.series.some((s) => (s.cashIns?.length ?? 0) > 0) && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <p className="text-sm font-semibold">
                  Cash-in — the overall qualification (UMS)
                </p>
                {entry.series.slice(0, 4).map((s) => (
                  <div key={s.session} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {s.session}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs">
                        <tbody>
                          {(s.cashIns ?? []).map((c) => {
                            const cLadder = c.gradeLadder ?? ladder;
                            return (
                              <tr key={c.code} className="border-b last:border-0">
                                <td className="whitespace-nowrap py-1.5 pr-3 font-mono">
                                  {c.code}
                                  <span className="ml-1.5 text-muted-foreground">
                                    {c.title}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                                  UMS · {c.maxMark}
                                </td>
                                {cLadder.map((g) => (
                                  <td
                                    key={g}
                                    className="px-2 py-1.5 text-center tabular-nums"
                                  >
                                    {fmtGradeCell(c.boundaries[g])}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {entry.series.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    Showing the latest 4 sessions — {entry.series.length} in the corpus.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* modular unit rows (Edexcel 4X suites / IAL units) */}
          {entry.series.some((s) => (s.units?.length ?? 0) > 0) && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <p className="text-sm font-semibold">Unit boundaries (raw / UMS)</p>
                {entry.series.slice(0, 4).map((s) => (
                  <div key={s.session} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {s.session}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th scope="col" className="py-1.5 pr-3 font-medium">Unit</th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Scale</th>
                            {ladder.map((g) => (
                              <th key={g} scope="col" className="px-2 py-1.5 text-center font-medium">{g}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(s.units ?? []).flatMap((u) => {
                            const rows = [
                              <tr key={`${u.code}-raw`} className="border-b last:border-0">
                                <td className="py-1.5 pr-3 font-mono">{u.code} <span className="text-muted-foreground">{u.title}</span></td>
                                <td className="py-1.5 pr-3">Raw · {u.maxMark}</td>
                                {ladder.map((g) => (
                                  <td key={g} className="px-2 py-1.5 text-center tabular-nums">{fmtGradeCell(u.boundaries[g])}</td>
                                ))}
                              </tr>,
                            ];
                            if (u.ums) {
                              rows.push(
                                <tr key={`${u.code}-ums`} className="border-b last:border-0 text-muted-foreground">
                                  <td className="py-1.5 pr-3" />
                                  <td className="py-1.5 pr-3">UMS · {u.ums.maxMark}</td>
                                  {ladder.map((g) => (
                                    <td key={g} className="px-2 py-1.5 text-center tabular-nums">{fmtGradeCell(u.ums?.boundaries[g])}</td>
                                  ))}
                                </tr>,
                              );
                            }
                            return rows;
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {entry.series.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    Showing the latest 4 sessions — {entry.series.length} in the corpus.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* CIE component thresholds */}
          {entry.series.some((s) => (s.components?.length ?? 0) > 0) && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <p className="text-sm font-semibold">
                  Component thresholds (minimum raw marks)
                </p>
                {entry.series.slice(0, 4).map((s) => (
                  <div key={s.session} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {s.session}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th scope="col" className="py-1.5 pr-3 font-medium">Component</th>
                            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Max</th>
                            {(s.gradeLadder ?? ladder).map((g) => (
                              <th key={g} scope="col" className="px-2 py-1.5 text-center font-medium">{g}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(s.components ?? []).map((c) => (
                            <tr key={c.code} className="border-b last:border-0">
                              <td className="whitespace-nowrap py-1.5 pr-3 font-mono">{c.code}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{c.maxMark}</td>
                              {(s.gradeLadder ?? ladder).map((g) => (
                                <td key={g} className="px-2 py-1.5 text-center tabular-nums">{fmtGradeCell(c.boundaries[g])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {entry.series.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    Showing the latest 4 sessions — {entry.series.length} in the corpus.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* CIE route tables */}
          {entry.series.some((s) => (s.routes?.length ?? 0) > 0) && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <p className="text-sm font-semibold">
                  Syllabus thresholds by route (weighted marks)
                </p>
                {entry.series.slice(0, 4).map((s) => (
                  <div key={s.session} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {s.session}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th scope="col" className="py-1.5 pr-3 font-medium">Route</th>
                            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Max</th>
                            {(s.gradeLadder ?? ladder).map((g) => (
                              <th key={g} scope="col" className="px-2 py-1.5 text-center font-medium">{g}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(s.routes ?? []).map((r) => (
                            <tr key={`${r.option ?? ""}${r.combination}`} className="border-b last:border-0">
                              <td className="whitespace-nowrap py-1.5 pr-3 font-mono">
                                {r.option ? <Badge variant="outline" className="mr-1.5 px-1 py-0 text-[10px]">{r.option}</Badge> : null}
                                {r.combination}
                                {awardLabel(r.award) && (
                                  <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[10px] text-muted-foreground">
                                    {awardLabel(r.award)}
                                  </Badge>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{r.maxWeightedMark}</td>
                              {(s.gradeLadder ?? ladder).map((g) => (
                                <td key={g} className="px-2 py-1.5 text-center tabular-nums">{fmtGradeCell(r.boundaries[g])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="graph" className="mt-3">
          <Card>
            <CardContent className="p-4">
              {graphMode === "none" ? (
                <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Info className="size-4 shrink-0" aria-hidden /> No
                  comparable single ladder exists across sessions for this
                  qualification yet.
                </p>
              ) : (
                <>
                  <div className="h-[380px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={graphRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="session"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          domain={[0, graphMax || "auto"]}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          width={44}
                        />
                        <ReTooltip
                          contentStyle={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        {graphGrades.map((g, i) => (
                          <Line
                            key={g}
                            type="monotone"
                            dataKey={g}
                            name={`Grade ${g}`}
                            stroke={CHART_VAR[i % CHART_VAR.length]}
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                            activeDot={{ r: 4 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    {graphCaption}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* honest limitation note for courses still without a calculator */}
      {!canCalculate && !isAgg && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              The mark-to-grade calculator needs a verified cash-in
              composition. This qualification is {entry.board}{" "}
              {entry.code.startsWith("4X") || entry.code.startsWith("Y")
                ? "modular — the aggregation calculator lands once this cash-in's unit rules are encoded from the official specification"
                : "route-based — the grade depends on which component combination was sat"}
              . The tables and trend graph above are fully live.
            </p>
          </CardContent>
        </Card>
      )}

      {/* provenance */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="size-3.5" aria-hidden />
        Source: official {entry.board} grade-boundary documents — every file
        sha256-recorded in the syllabai-resources GradeBoundaries lane. A
        boundary is the minimum mark for the grade.
      </p>
    </div>
  );
}
