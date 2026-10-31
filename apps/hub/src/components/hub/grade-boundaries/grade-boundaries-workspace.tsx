"use client";

/**
 * GradeBoundariesWorkspace (T-GRADE-1) — the course grade-boundaries surface.
 *
 * MathsGenie predicted-grade-calculator feature set, hub shell:
 *   - Table | Graph toggle (MG's view pair) over the same corpus;
 *   - session pills incl. "Average" (MG's modal-grade mode);
 *   - mark slider + number input -> predicted grade, "X into grade Y",
 *     marks-to-next — only for linear-total courses (Edexcel linear
 *     International GCSE); modular/IAL/CIE courses get an honest
 *     display-only note (no single total-mark route exists) while the
 *     tables and graph stay fully live;
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
  gradeForMark,
  isRegionalVariant,
  marksToNextGrade,
  modalGradeAcrossSeries,
  primaryRow,
} from "@/lib/grade-boundaries-calc";
import type { GradeBoundariesCourse } from "@/lib/grade-boundaries";
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

export function GradeBoundariesWorkspace({
  entry,
}: {
  entry: GradeBoundariesCourse;
}) {
  const ladder = useMemo(
    () => entry.gradeLadder ?? [],
    [entry.gradeLadder],
  );

  // group rows per session (a session can carry standard + R-variant rows)
  const sessions = useMemo(() => {
    const by = new Map<string, typeof entry.series>();
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
  const maxMark = entry.calculator?.maxMark ?? null;
  const calcMode = entry.calculator?.mode ?? null;
  const canCalculate = calcMode === "linear-total" && maxMark !== null;

  const clampedMark = Math.max(0, Math.min(maxMark ?? 0, Math.round(mark) || 0));

  const activeSession = sessions.find((s) => s.session === sessionPick);
  const calcRow = activeSession ? activeSession.primary : null;

  const achieved = useMemo(() => {
    if (!canCalculate || !calcRow || !calcRow.maxMark) return null;
    const rowLadder = calcRow.gradeLadder ?? ladder;
    return {
      grade: gradeForMark(calcRow.boundaries, rowLadder, clampedMark),
      next: marksToNextGrade(calcRow.boundaries, rowLadder, clampedMark),
    };
  }, [canCalculate, calcRow, clampedMark, ladder]);

  const average = useMemo(() => {
    if (!canCalculate || sessionPick !== "average") return null;
    return modalGradeAcrossSeries(
      sessions.map((s) => ({
        session: s.session,
        boundaries: primaryRow(s.rows).boundaries,
      })),
      ladder,
      clampedMark,
    );
  }, [canCalculate, sessionPick, sessions, ladder, clampedMark]);

  // graph data: chronological, primary row per session
  const graphRows = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => a.year - b.year || a.session.localeCompare(b.session))
        .map((s) => ({ session: s.session, ...s.primary.boundaries })),
    [sessions],
  );
  const graphGrades = useMemo(
    () =>
      ladder.filter(
        (g) => g !== "U" && graphRows.some((r) => typeof r[g] === "number"),
      ),
    [ladder, graphRows],
  );
  const graphMax = entry.series[0]?.maxMark ?? 0;

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

      {/* calculator (linear-total courses only) */}
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
                      const rowGrade = canCalculate
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
                                {fmtGradeCell(s.boundaries[g])}
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

          {/* modular unit rows (Edexcel 4X suites) */}
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
                          {(s.cashIns ?? []).map((c) => (
                            <tr key={c.code} className="border-b last:border-0 font-medium">
                              <td className="py-1.5 pr-3 font-mono">{c.code} <span className="text-muted-foreground">{c.title}</span></td>
                              <td className="py-1.5 pr-3">Cash-in UMS · {c.maxMark}</td>
                              {ladder.map((g) => (
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
                Minimum marks per grade across sessions — {graphRows.length} sessions,
                standard variant per session{entry.tier ? ` (${entry.tier} tier)` : ""}.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* honest limitation note for non-linear courses */}
      {!canCalculate && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              The mark-to-grade calculator needs one total-mark route. This
              qualification is {entry.board}{" "}
              {entry.code.startsWith("4X") || entry.code.startsWith("Y")
                ? "modular — grades aggregate across units via UMS, so there is no single raw total to slide"
                : "route-based — the grade depends on which component combination was sat"}
              . The tables and trend graph above are fully live; the calculator
              joins once the aggregation rules land.
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
