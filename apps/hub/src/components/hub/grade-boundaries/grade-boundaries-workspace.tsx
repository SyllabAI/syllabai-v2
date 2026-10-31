"use client";

/**
 * GradeBoundariesWorkspace (T-GRADE-1 + T-GRADE-2 + T-GRADE-3) — the course
 * grade-boundaries surface.
 *
 * T-GRADE-3 run-001: MathsGenie LAYOUT parity (operator brief: "the layout
 * … more like maths genie … same layout, shapes, padding … seamlessly
 * integrated with all the syllabai themes"). Cloned from MG's saved page
 * DOM: a max-w-3xl column with ONE rounded-2xl border-2 box → session pill
 * row → hairline separator → grade rail (size-14/16 bordered badge over a
 * border-r-2 rail) + h-3 meter → 12rem/1fr/4rem slider grid → separator →
 * display-font title + underline Table|Graph tabs → rounded-2xl tables with
 * bg-muted heads and centered cells → muted provenance footer. All colors,
 * radii and fonts stay on the hub token ladder (--accent-primary pair,
 * --muted, --border, --radius chain, --app-font-display) so SME,
 * quiet-green, candy-shop and plum re-skin it unchanged. Logic untouched:
 * the three calculator modes, session/average state and every pure calc
 * call are byte-identical to run-002.
 *
 * T-GRADE-003 run-002 (operator eyeball of the live page): the summary-row
 * modal chip-wall collapses to one muted sentence; the meter floor rides
 * bg-border/60 so the track reads at 0% on every theme; the linear table
 * groups paper-combination rows under one session cell (rowSpan) with the
 * corpus's own labels only; the achieved-grade column paint waits for real
 * slider interaction (markTouched). Page hero trimmed to MG's compact
 * breadcrumb + title + exam-code band (description dropped — provenance
 * lives in the workspace footer).
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
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
  // T-GRADE-003 run-002: the grade-column paint follows real interaction —
  // an untouched slider (0 marks) must not paint the lowest grade down the
  // whole table (MG's page is quiet until the visitor moves the control).
  const [markTouched, setMarkTouched] = useState(false);
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

  // ------------------------------------------------------------------
  // T-GRADE-003 run-002 — MathsGenie-parity refinements (operator saw the
  // live page and called four gaps): (1) the modal chip-wall in the summary
  // row collapses to one muted sentence — MG keeps that row to a line and
  // the per-session grades already live as the table's grade columns;
  // (2) the meter floor rides bg-border/60 instead of bg-muted so the track
  // stays legible at 0% on every theme; (3) the linear table groups its
  // paper-combination rows under ONE session cell (rowSpan, MG's
  // one-row-per-series look) — labelled variants keep their chips, and
  // sessions the source document publishes without a combination label get
  // an honest footnote, never invented labels; (4) the achieved-grade
  // column paint (and the per-row grade chip) wait for real slider
  // interaction (markTouched) instead of painting the lowest grade column
  // wall-to-wall on load.
  // ------------------------------------------------------------------
  const agreeCount =
    average?.perSeries.filter((p) => p.grade === average.grade).length ?? 0;
  const aggAgreeCount =
    aggAverage?.perSeries.filter((p) => p.grade === aggAverage.grade).length ??
    0;
  // run-002: consecutive same-session runs of the corpus order — the shape
  // the parser emits (standard row before its R/regional sibling).
  const linearGroups: GradeBoundariesSeries[][] = [];
  for (const s of entry.series) {
    const last = linearGroups[linearGroups.length - 1];
    if (last && last[0].session === s.session) last.push(s);
    else linearGroups.push([s]);
  }

  // ------------------------------------------------------------------
  // T-GRADE-003 run-001 — MathsGenie-parity presentation helpers.
  // Layout, shapes and padding clone MG's predicted-grade-calculator
  // page (saved DOM: upload/Edexcel IGCSE Biology … MathsGenie.html):
  // one rounded-2xl border-2 box on a max-w-3xl column → session pill
  // row → hairline separator → grade rail (bordered badge) + meter →
  // slider row (12rem/1fr/4rem grid) → separator → title + underline
  // Table|Graph tabs → rounded-2xl tables (bg-muted heads, centered
  // cells). Every color/radius/font rides the hub token ladder, so all
  // four themes (SME, quiet-green, candy-shop, plum) re-skin it as-is.
  // ------------------------------------------------------------------
  const meterPct = maxMark
    ? Math.min(100, Math.max(0, (clampedMark / maxMark) * 100))
    : 0;
  const aggMeterPct =
    aggResult && aggResult.maxUms > 0
      ? Math.min(
          100,
          Math.max(0, (aggResult.totalUms / aggResult.maxUms) * 100),
        )
      : 0;
  // MG's pill pair — active fill is the --accent-primary token pair (the
  // same idiom the hub sidebar already borrows from MG/RD, run-004b).
  const pillCls = (active: boolean) =>
    cn(
      "inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-transparent px-3 text-sm font-medium transition-colors",
      active
        ? "bg-accent-primary text-accent-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  // MG's underline tab pair (their tabs-list underline variant): the
  // active trigger carries a 2px rounded accent bar over a hairline rail.
  const underlineList =
    "h-auto w-fit items-start gap-1 rounded-none border-b-2 bg-transparent p-0";
  const underlineTrigger =
    "h-auto flex-1 rounded-none border-0 px-3 py-1.5 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-0 relative after:absolute after:inset-x-2 after:-bottom-[2px] after:hidden after:h-0.5 after:rounded-full after:bg-accent-primary-foreground after:content-[''] data-[state=active]:after:block";
  // MG separators inside the box: 2px hairline wash
  const sep = (
    <div aria-hidden className="h-0.5 w-full rounded-full bg-border/60" />
  );
  // MG table chrome: rounded-2xl border-2 wrapper, bg-muted head row,
  // centered cells with hairline row rules
  const tableBox =
    "inline-flex min-w-full overflow-hidden rounded-2xl border-2";
  const thCls =
    "border-b-2 border-border px-3 py-2.5 text-center font-medium text-muted-foreground";
  const thClsLeft =
    "border-b-2 border-border py-2.5 pl-4 pr-3 text-left font-medium text-muted-foreground";
  const railBadge =
    "flex size-14 items-center justify-center rounded-xl border-2 bg-background font-display text-2xl font-bold tabular-nums sm:size-16 sm:rounded-2xl";

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* the MG calculator box — one bordered card for the whole surface */}
      <div className="rounded-2xl border-2 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          {/* session pills (MG: Average + every series, inside the box) */}
          <div
            role="group"
            aria-label="Grade boundaries exam session"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              aria-pressed={sessionPick === "average"}
              className={pillCls(sessionPick === "average")}
              onClick={() => setSessionPick("average")}
            >
              Average
            </button>
            {sessions.map((s) => (
              <button
                key={s.session}
                type="button"
                aria-pressed={sessionPick === s.session}
                className={pillCls(sessionPick === s.session)}
                onClick={() => setSessionPick(s.session)}
              >
                {s.session}
              </button>
            ))}
          </div>

          {sep}

          {/* linear-total calculator — MG's grade rail + meter + slider */}
          {canCalculate && (
            <div className="my-2 flex flex-col gap-5">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="flex w-36 shrink-0 flex-col items-center gap-2 border-r-2 pr-4 sm:w-40 sm:pr-5">
                  <span aria-live="polite" className={railBadge}>
                    {sessionPick === "average"
                      ? (average?.grade ?? "–")
                      : (achieved?.grade ?? "–")}
                  </span>
                  <span className="text-center text-sm font-medium text-muted-foreground">
                    {sessionPick === "average"
                      ? "Most likely grade"
                      : `Predicted — ${sessionPick}`}
                  </span>
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-baseline justify-between gap-x-4 text-sm">
                    <span className="font-medium">
                      {sessionPick === "average"
                        ? `Modal across ${sessions.length} sessions`
                        : achieved?.next
                          ? `${achieved.next.marks} more mark${achieved.next.marks === 1 ? "" : "s"} to grade ${achieved.next.grade}`
                          : clampedMark >= (calcRow?.maxMark ?? 0)
                            ? "Top of the ladder"
                            : "Boundary not published"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {clampedMark} / {maxMark} marks
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Total mark on the grade scale"
                    aria-valuemin={0}
                    aria-valuemax={maxMark ?? 0}
                    aria-valuenow={clampedMark}
                    className="mt-2 h-3 overflow-hidden rounded-full bg-border/60"
                  >
                    <div
                      className="h-full rounded-full bg-accent-primary-foreground transition-[width]"
                      style={{ width: `${meterPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-x-4 text-xs text-muted-foreground">
                    <span>0</span>
                    <span>Max {maxMark}</span>
                  </div>
                  {sessionPick === "average" &&
                    average &&
                    average.perSeries.length > 0 && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Grade {average.grade} in {agreeCount} of{" "}
                        {average.perSeries.length} sessions — each
                        session&apos;s grade is a column in the table below.
                      </p>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,12rem)_1fr_minmax(4rem,auto)] sm:gap-6">
                <p className="truncate font-display text-sm font-semibold">
                  Total mark
                </p>
                <Slider
                  value={[clampedMark]}
                  max={maxMark ?? 1}
                  step={1}
                  aria-label="Total mark"
                  onValueChange={(v) => {
                    setMarkTouched(true);
                    setMark(v[0] ?? 0);
                  }}
                  className="[&_[data-slot=slider-range]]:bg-accent-primary-foreground [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-accent-primary-foreground [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-border/60"
                />
                <p className="text-right text-sm font-medium tabular-nums tracking-tight">
                  {clampedMark} / {maxMark}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                No per-paper breakdown is published for this
                qualification&apos;s boundaries — enter your total across all
                papers, the same total {entry.board} grades against.
              </p>
            </div>
          )}

          {/* aggregate-ums calculator — same rail/meter language, UMS scale */}
          {isAgg && (
            <div className="my-2 flex flex-col gap-5">
              {sessionPick === "average" ? (
                aggAverage && aggAverage.perSeries.length > 0 ? (
                  <div className="flex items-start gap-4 sm:gap-5">
                    <div className="flex w-36 shrink-0 flex-col items-center gap-2 border-r-2 pr-4 sm:w-40 sm:pr-5">
                      <span aria-live="polite" className={railBadge}>
                        {aggAverage.grade ?? "–"}
                      </span>
                      <span className="text-center text-sm font-medium text-muted-foreground">
                        Most likely grade
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm font-medium">
                        Modal across {aggAverage.perSeries.length} sessions —
                        same unit marks
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Grade {aggAverage.grade} in {aggAgreeCount} of{" "}
                        {aggAverage.perSeries.length} sessions.
                      </p>
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
                  <div className="flex items-start gap-4 sm:gap-5">
                    <div className="flex w-36 shrink-0 flex-col items-center gap-2 border-r-2 pr-4 sm:w-40 sm:pr-5">
                      <span aria-live="polite" className={railBadge}>
                        {aggGrade?.grade ?? "–"}
                      </span>
                      <span className="text-center text-sm font-medium text-muted-foreground">
                        Predicted — {sessionPick}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-baseline justify-between gap-x-4 text-sm">
                        <span className="font-medium">
                          {aggAStarGap
                            ? `A2 aggregate ${aggAStarGap.have}/${aggAStarGap.need} — ${aggAStarGap.need - aggAStarGap.have} more A2 UMS for A*`
                            : aggNext
                              ? `${aggNext.marks} more UMS to grade ${aggNext.grade}`
                              : "Top of the ladder"}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {aggResult?.totalUms ?? 0} / {aggResult?.maxUms ?? 0}{" "}
                          UMS
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Aggregated UMS on the cash-in scale"
                        aria-valuemin={0}
                        aria-valuemax={aggResult?.maxUms ?? 0}
                        aria-valuenow={aggResult?.totalUms ?? 0}
                        className="mt-2 h-3 overflow-hidden rounded-full bg-border/60"
                      >
                        <div
                          className="h-full rounded-full bg-accent-primary-foreground transition-[width]"
                          style={{ width: `${aggMeterPct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-x-4 text-xs text-muted-foreground">
                        <span>0</span>
                        <span>
                          {activeAgg.cashIn!.code} cash-in · max{" "}
                          {aggResult?.maxUms ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {activeAgg.pairs.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-muted-foreground">
                        Optional applied pair
                      </span>
                      {activeAgg.pairs.map((p, i) => (
                        <button
                          key={`${p[0]}+${p[1]}`}
                          type="button"
                          aria-pressed={
                            i === Math.min(pairIdx, activeAgg.pairs.length - 1)
                          }
                          className={cn(
                            pillCls(
                              i ===
                                Math.min(pairIdx, activeAgg.pairs.length - 1),
                            ),
                            "h-7 px-2.5 font-mono text-[11px]",
                          )}
                          onClick={() => setPairIdx(i)}
                        >
                          {p[0]} + {p[1]}
                        </button>
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
                          className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2"
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

                  <p className="text-sm text-muted-foreground">
                    Raw marks convert to UMS through each unit&apos;s own
                    published boundaries; the {activeAgg.cashIn!.code} cash-in
                    grades the UMS total
                    {aggGrade?.aStarRuleApplied
                      ? " — A* via the A2-aggregate rule (A overall + 90% of A2 UMS)"
                      : ""}
                    .
                  </p>
                </>
              )}
            </div>
          )}

          {/* honest limitation note for courses still without a calculator */}
          {!canCalculate && !isAgg && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                The mark-to-grade calculator needs a verified cash-in
                composition. This qualification is {entry.board}{" "}
                {entry.code.startsWith("4X") || entry.code.startsWith("Y")
                  ? "modular — the aggregation calculator lands once this cash-in's unit rules are encoded from the official specification"
                  : "route-based — the grade depends on which component combination was sat"}
                . The tables and trend graph below are fully live.
              </span>
            </p>
          )}

          {sep}

          {/* title + underline tabs (MG: "Grade boundaries" | Table/Graph) */}
          <Tabs value={view} onValueChange={(v) => setView(v as "table" | "graph")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h5 className="font-display text-lg font-bold tracking-tight">
                Grade boundaries
              </h5>
              <TabsList className={underlineList}>
                <TabsTrigger value="table" className={underlineTrigger}>
                  Table
                </TabsTrigger>
                <TabsTrigger value="graph" className={underlineTrigger}>
                  Graph
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="table" className="mt-4 space-y-6">
              {/* linear total-mark rows (Edexcel linear International GCSE) */}
              {hasLinearRows && (
                <section className="space-y-3">
                  <div className="overflow-x-auto">
                    <div className={tableBox}>
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <caption className="sr-only">
                          Minimum marks for each grade, by exam series
                        </caption>
                        <thead className="bg-muted leading-normal">
                          <tr>
                            <th scope="col" className={`${thCls} px-4`}>
                              Exam series
                            </th>
                            <th scope="col" className={thCls}>
                              Papers
                            </th>
                            {ladder.map((g) => (
                              <th key={g} scope="col" className={thCls}>
                                {g}
                              </th>
                            ))}
                            <th scope="col" className={thCls}>
                              Max
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {linearGroups.map((rows, gi) =>
                            rows.map((s, j) => {
                              const rowLadder = s.gradeLadder ?? ladder;
                              const rowGrade =
                                canCalculate && s.boundaries
                                  ? gradeForMark(s.boundaries, rowLadder, clampedMark)
                                  : null;
                              const lastOfGroup = j === rows.length - 1;
                              const lastOverall =
                                gi === linearGroups.length - 1 && lastOfGroup;
                              // one rule per group boundary; hairlines inside
                              const groupRule = lastOverall
                                ? ""
                                : lastOfGroup
                                  ? "border-b-2 border-border"
                                  : "border-b border-border";
                              return (
                                <tr
                                  key={`${s.session}-${gi}-${j}`}
                                  className={groupRule}
                                >
                                  {j === 0 && (
                                    <td
                                      rowSpan={rows.length}
                                      className={
                                        "whitespace-nowrap px-4 py-3 text-center align-middle font-medium" +
                                        (lastOverall ? "" : " border-b-2 border-border")
                                      }
                                    >
                                      {s.session}
                                    </td>
                                  )}
                                  <td className="whitespace-nowrap px-3 py-3">
                                    <span className="flex items-center justify-center gap-1.5">
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {s.papersNote ??
                                          (rows.length > 1
                                            ? "—"
                                            : (s.scale ?? "—"))}
                                      </span>
                                      {isRegionalVariant(s.papersNote) && (
                                        <Badge variant="outline" className="px-1 py-0 text-[10px]">R</Badge>
                                      )}
                                      {s.tier && (
                                        <Badge variant="outline" className="px-1 py-0 text-[10px] capitalize">
                                          {s.tier}
                                        </Badge>
                                      )}
                                      {canCalculate && markTouched && rowGrade && (
                                        <Badge className="px-1.5 py-0 text-[10px]">{rowGrade}</Badge>
                                      )}
                                    </span>
                                  </td>
                                  {ladder.map((g) => {
                                    const isAchieved =
                                      canCalculate && markTouched && rowGrade === g;
                                    return (
                                      <td
                                        key={g}
                                        className={
                                          "px-3 py-3 text-center tabular-nums" +
                                          (isAchieved
                                            ? " rounded-md bg-accent-primary font-semibold text-accent-primary-foreground"
                                            : "")
                                        }
                                      >
                                        {fmtGradeCell(s.boundaries?.[g])}
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                                    {s.maxMark ?? "—"}
                                  </td>
                                </tr>
                              );
                            }),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {linearGroups.some(
                    (g) => g.length > 1 && g.some((r) => !r.papersNote),
                  ) && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Where a session shows more than one row, the source
                      document publishes several paper combinations for that
                      series; rows without a combination label appear in
                      source order, exactly as issued.
                    </p>
                  )}
                </section>
              )}

              {/* cash-in (overall qualification) rows — the qualification-level
                  UMS ladder, incl. Double Award pair ladders (4XSD1) */}
              {entry.series.some((s) => (s.cashIns?.length ?? 0) > 0) && (
                <section className="space-y-3">
                  <p className="font-display text-sm font-semibold">
                    Cash-in — the overall qualification (UMS)
                  </p>
                  {entry.series.slice(0, 4).map((s) => (
                    <div key={s.session} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.session}
                      </p>
                      <div className="overflow-x-auto">
                        <div className={tableBox}>
                          <table className="w-full min-w-[520px] border-collapse text-sm">
                            <tbody>
                              {(s.cashIns ?? []).map((c) => {
                                const cLadder = c.gradeLadder ?? ladder;
                                return (
                                  <tr
                                    key={c.code}
                                    className="border-b border-border last:border-0"
                                  >
                                    <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium">
                                      {c.code}
                                      <span className="ml-1.5 font-normal text-muted-foreground">
                                        {c.title}
                                      </span>
                                    </td>
                                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">
                                      UMS · {c.maxMark}
                                    </td>
                                    {cLadder.map((g) => (
                                      <td
                                        key={g}
                                        className="px-3 py-2.5 text-center tabular-nums"
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
                    </div>
                  ))}
                  {entry.series.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      Showing the latest 4 sessions — {entry.series.length} in
                      the corpus.
                    </p>
                  )}
                </section>
              )}

              {/* modular unit rows (Edexcel 4X suites / IAL units) */}
              {entry.series.some((s) => (s.units?.length ?? 0) > 0) && (
                <section className="space-y-3">
                  <p className="font-display text-sm font-semibold">
                    Unit boundaries (raw / UMS)
                  </p>
                  {entry.series.slice(0, 4).map((s) => (
                    <div key={s.session} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.session}
                      </p>
                      <div className="overflow-x-auto">
                        <div className={tableBox}>
                          <table className="w-full min-w-[520px] border-collapse text-sm">
                            <thead className="bg-muted leading-normal">
                              <tr>
                                <th scope="col" className={thClsLeft}>
                                  Unit
                                </th>
                                <th scope="col" className={thClsLeft}>
                                  Scale
                                </th>
                                {ladder.map((g) => (
                                  <th key={g} scope="col" className={thCls}>
                                    {g}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(s.units ?? []).flatMap((u) => {
                                const rows = [
                                  <tr
                                    key={`${u.code}-raw`}
                                    className="border-b border-border last:border-0"
                                  >
                                    <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium">
                                      {u.code}{" "}
                                      <span className="font-normal text-muted-foreground">
                                        {u.title}
                                      </span>
                                    </td>
                                    <td className="whitespace-nowrap py-2.5 pr-3">
                                      Raw · {u.maxMark}
                                    </td>
                                    {ladder.map((g) => (
                                      <td
                                        key={g}
                                        className="px-3 py-2.5 text-center tabular-nums"
                                      >
                                        {fmtGradeCell(u.boundaries[g])}
                                      </td>
                                    ))}
                                  </tr>,
                                ];
                                if (u.ums) {
                                  rows.push(
                                    <tr
                                      key={`${u.code}-ums`}
                                      className="border-b border-border text-muted-foreground last:border-0"
                                    >
                                      <td className="py-2.5 pl-4 pr-3" />
                                      <td className="py-2.5 pr-3">
                                        UMS · {u.ums.maxMark}
                                      </td>
                                      {ladder.map((g) => (
                                        <td
                                          key={g}
                                          className="px-3 py-2.5 text-center tabular-nums"
                                        >
                                          {fmtGradeCell(u.ums?.boundaries[g])}
                                        </td>
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
                    </div>
                  ))}
                  {entry.series.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      Showing the latest 4 sessions — {entry.series.length} in
                      the corpus.
                    </p>
                  )}
                </section>
              )}

              {/* CIE component thresholds */}
              {entry.series.some((s) => (s.components?.length ?? 0) > 0) && (
                <section className="space-y-3">
                  <p className="font-display text-sm font-semibold">
                    Component thresholds (minimum raw marks)
                  </p>
                  {entry.series.slice(0, 4).map((s) => (
                    <div key={s.session} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.session}
                      </p>
                      <div className="overflow-x-auto">
                        <div className={tableBox}>
                          <table className="w-full min-w-[520px] border-collapse text-sm">
                            <thead className="bg-muted leading-normal">
                              <tr>
                                <th scope="col" className={thClsLeft}>
                                  Component
                                </th>
                                <th scope="col" className={thCls}>
                                  Max
                                </th>
                                {(s.gradeLadder ?? ladder).map((g) => (
                                  <th key={g} scope="col" className={thCls}>
                                    {g}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(s.components ?? []).map((c) => (
                                <tr
                                  key={c.code}
                                  className="border-b border-border last:border-0"
                                >
                                  <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium">
                                    {c.code}
                                  </td>
                                  <td className="py-2.5 pr-3 text-center tabular-nums">
                                    {c.maxMark}
                                  </td>
                                  {(s.gradeLadder ?? ladder).map((g) => (
                                    <td
                                      key={g}
                                      className="px-3 py-2.5 text-center tabular-nums"
                                    >
                                      {fmtGradeCell(c.boundaries[g])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                  {entry.series.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      Showing the latest 4 sessions — {entry.series.length} in
                      the corpus.
                    </p>
                  )}
                </section>
              )}

              {/* CIE route tables */}
              {entry.series.some((s) => (s.routes?.length ?? 0) > 0) && (
                <section className="space-y-3">
                  <p className="font-display text-sm font-semibold">
                    Syllabus thresholds by route (weighted marks)
                  </p>
                  {entry.series.slice(0, 4).map((s) => (
                    <div key={s.session} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.session}
                      </p>
                      <div className="overflow-x-auto">
                        <div className={tableBox}>
                          <table className="w-full min-w-[520px] border-collapse text-sm">
                            <thead className="bg-muted leading-normal">
                              <tr>
                                <th scope="col" className={thClsLeft}>
                                  Route
                                </th>
                                <th scope="col" className={thCls}>
                                  Max
                                </th>
                                {(s.gradeLadder ?? ladder).map((g) => (
                                  <th key={g} scope="col" className={thCls}>
                                    {g}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(s.routes ?? []).map((r) => (
                                <tr
                                  key={`${r.option ?? ""}${r.combination}`}
                                  className="border-b border-border last:border-0"
                                >
                                  <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium">
                                    {r.option ? (
                                      <Badge
                                        variant="outline"
                                        className="mr-1.5 px-1 py-0 text-[10px]"
                                      >
                                        {r.option}
                                      </Badge>
                                    ) : null}
                                    {r.combination}
                                    {awardLabel(r.award) && (
                                      <Badge
                                        variant="outline"
                                        className="ml-1.5 px-1 py-0 text-[10px] text-muted-foreground"
                                      >
                                        {awardLabel(r.award)}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3 text-center tabular-nums">
                                    {r.maxWeightedMark}
                                  </td>
                                  {(s.gradeLadder ?? ladder).map((g) => (
                                    <td
                                      key={g}
                                      className="px-3 py-2.5 text-center tabular-nums"
                                    >
                                      {fmtGradeCell(r.boundaries[g])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </TabsContent>

            <TabsContent value="graph" className="mt-4">
              <div className="rounded-2xl border-2 p-4">
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
                        <LineChart
                          data={graphRows}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                          />
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
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* provenance footer (MG's muted page footer slot) */}
      <p className="flex items-start gap-1.5 px-1 text-sm text-muted-foreground">
        <span>
          Source: official {entry.board} grade-boundary documents — every file
          sha256-recorded in the syllabai-resources GradeBoundaries lane. A
          boundary is the minimum mark for the grade.
        </span>
      </p>
    </div>
  );
}
