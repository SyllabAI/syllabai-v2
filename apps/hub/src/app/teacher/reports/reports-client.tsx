"use client";

/**
 * Teacher reports — teacher mode plan Phase 3: "Reports & exports (per
 * student, per class, term view)" (T-TEACH-REPORTS-1).
 *
 * The smallest honest production version: a read-only composition of the
 * two class-intelligence views that already exist (ClassOverviewView +
 * ClassLearnerRow[] via /api/v1/teacher/class/*, TEACHER/ADMIN-gated
 * server-side) with client-side CSV exports and a print path for the
 * per-class summary. Zero new API surface — a report is a deterministic
 * function of the same live evidence the Class insights page renders, so
 * the two surfaces can never disagree.
 *
 * Honesty laws carried over verbatim:
 *  - Evidence semantics stay separated (§4): mastery only from graded
 *    evidence (BKT); misconceptions are BDT estimates; tutor asks are
 *    engagement, never weakness; unmeasured reads as unmeasured ("—").
 *  - There is NO term entity in core yet: the report stamps the evidence
 *    window (recentActivity.windowStart) and one generated-at instant per
 *    load; term grouping is named as pending, not simulated.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, Printer, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { formatRelative, humanizeCode } from "@/lib/format";
import type { ClassLearnerRow, ClassOverviewView, SubjectView } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import {
  downloadCsv,
  formatIso,
  misconceptionCodesCell,
  reportFileName,
  studentsCsv,
  topicsCsv,
} from "@/lib/teacher/report-export";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

/** Unmeasured renders as an em dash with an explanatory title — never 0. */
function MasteryCell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-muted-foreground" title="Unmeasured — no graded evidence yet">
        —
      </span>
    );
  }
  return <span className="font-medium tabular-nums">{value.toFixed(2)}</span>;
}

function BandBadge({ band }: { band: string }) {
  const tone =
    band === "SECURE"
      ? "default"
      : band === "LOW"
        ? "destructive"
        : band === "UNMEASURED"
          ? "outline"
          : "secondary";
  return (
    <Badge variant={tone} className="whitespace-nowrap">
      {band.toLowerCase()}
    </Badge>
  );
}

export function ReportsClient() {
  const [subjects, setSubjects] = useState<SubjectView[] | null>(null);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ClassOverviewView | null>(null);
  const [learners, setLearners] = useState<ClassLearnerRow[] | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // subject list once; default to the first subject with a KG root (the
  // Class insights adaptation)
  useEffect(() => {
    let cancelled = false;
    api
      .subjects()
      .then((list) => {
        if (cancelled) return;
        setSubjects(list);
        setRootId(
          (current) => current ?? list.find((s) => s.knowledgeNodeId)?.knowledgeNodeId ?? null,
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setSubjectsError(e instanceof ApiError ? e.message : "Could not load the subject list.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (rid: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [o, l] = await Promise.all([api.classOverview(rid), api.classLearners(rid)]);
      setOverview(o);
      setLearners([...l].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setStamp(new Date().toISOString());
    } catch (e) {
      setOverview(null);
      setLearners(null);
      setStamp(null);
      setLoadError(e instanceof ApiError ? e.message : "Could not load the class evidence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootId) void load(rootId);
  }, [rootId, load]);

  const exportStudents = () => {
    if (!overview || !learners || !stamp) return;
    downloadCsv(reportFileName(overview, "students", stamp), studentsCsv(overview, learners, stamp));
  };

  const exportTopics = () => {
    if (!overview || !stamp) return;
    downloadCsv(reportFileName(overview, "topics", stamp), topicsCsv(overview, stamp));
  };

  const subjectsWithRoot = subjects?.filter((s) => s.knowledgeNodeId) ?? [];

  return (
    <div className="space-y-6">
      <TeacherNav />

      {/* T-HEADER-1: the shared tool-page header (the subject picker rides
          the actions slot). */}
      <PageHeader
        className="print:hidden"
        title="Reports"
        description="Live, read-only class evidence — printable summary plus per-student and per-topic CSV exports. Term grouping is pending a term entity in the core; exports stamp the evidence window instead."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="report-subject" className="text-sm text-muted-foreground">
              Subject
            </label>
            <select
              id="report-subject"
              value={rootId ?? ""}
              onChange={(e) => setRootId(e.target.value || null)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
              disabled={subjectsWithRoot.length === 0}
            >
              {subjectsWithRoot.length === 0 ? (
                <option value="">No subjects with a knowledge root</option>
              ) : (
                subjectsWithRoot.map((s) => (
                  <option key={s.id} value={s.knowledgeNodeId ?? ""}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </div>
        }
      />

      {/* print-only report header */}
      {overview && stamp ? (
        <div className="hidden print:block">
          <h1 className="text-xl font-semibold">Class report — {overview.rootCode}</h1>
          <p className="text-xs text-muted-foreground">
            Generated {stamp} · evidence window from {overview.recentActivity.windowStart}
          </p>
        </div>
      ) : null}

      {subjectsError ? (
        <Alert variant="destructive">
          <AlertTitle>Subject list unavailable</AlertTitle>
          <AlertDescription>{subjectsError}</AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the class evidence</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : null}

      {overview && stamp ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Enrolled learners"
              value={String(overview.enrolledLearners)}
              hint="all enabled student accounts"
            />
            <StatCard
              label="With evidence"
              value={String(overview.learnersWithEvidence)}
              hint="at least one graded topic"
            />
            <StatCard
              label="Recently active"
              value={String(overview.learnersRecentlyActive)}
              hint={`since ${overview.recentActivity.windowStart.slice(0, 10)}`}
            />
            <StatCard
              label="Topics measured"
              value={`${overview.measuredTopics}/${overview.totalTopics}`}
              hint={`${overview.recentActivity.tutorAsks} tutor asks · ${overview.recentActivity.structuredAnswersPendingMarking} pending marking`}
            />
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={exportStudents} disabled={!learners}>
              <Download className="size-4" aria-hidden />
              Students CSV
            </Button>
            <Button variant="outline" onClick={exportTopics}>
              <FileSpreadsheet className="size-4" aria-hidden />
              Topics CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Print summary
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" aria-hidden />
                Per-student report — {overview.rootCode}
              </CardTitle>
              <CardDescription>
                Mastery only from graded evidence (BKT); misconceptions are BDT estimates; tutor
                asks count as engagement, never weakness. Unmeasured reads as unmeasured.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Per-student mastery and engagement report</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Student</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Evidence</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Topics</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Mean mastery</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Attempts</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Last activity</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Weakest topics</th>
                    <th scope="col" className="py-2 font-medium">Misconceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {(learners ?? []).map((l) => (
                    <tr key={l.learnerId} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{l.displayName}</td>
                      <td className="py-2 pr-3">
                        <BandBadge band={l.evidenceState === "MEASURED" ? "SECURE" : "UNMEASURED"} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {l.topicsMeasured}/{overview.totalTopics}
                      </td>
                      <td className="py-2 pr-3">
                        <MasteryCell value={l.meanMastery} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {l.recentCorrect}/{l.recentAttempts} recent · {l.evidenceBackedAttempts}{" "}
                        total
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {l.lastActivityAt ? formatRelative(l.lastActivityAt) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {l.weakestTopics.length === 0
                          ? "—"
                          : l.weakestTopics.map((t) => (
                              <span key={t.nodeId} className="mr-2 whitespace-nowrap">
                                {humanizeCode(t.code)}{" "}
                                <span className="tabular-nums">{t.mastery.toFixed(2)}</span>
                              </span>
                            ))}
                      </td>
                      <td className="py-2 text-xs">
                        {l.activeMisconceptions === 0 ? (
                          "—"
                        ) : (
                          <span title={misconceptionCodesCell(l)}>
                            {l.activeMisconceptions} active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {learners && learners.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No learners enrolled yet.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topic aggregates — {overview.rootCode}</CardTitle>
              <CardDescription>
                Class-level means over the same graded evidence; bands: low / developing / secure /
                unmeasured.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Per-topic class aggregates</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Topic</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Measured</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Mean mastery</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Band</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Attempts</th>
                    <th scope="col" className="py-2 font-medium">Active misconceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...overview.topics]
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((t) => (
                      <tr key={t.nodeId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{t.title}</span>{" "}
                          <span className="text-xs text-muted-foreground">
                            {humanizeCode(t.code)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{t.learnersMeasured}</td>
                        <td className="py-2 pr-3">
                          <MasteryCell value={t.meanMastery} />
                        </td>
                        <td className="py-2 pr-3">
                          <BandBadge band={t.masteryBand} />
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{t.evidenceBackedAttempts}</td>
                        <td className="py-2 tabular-nums">{t.learnersWithActiveMisconception}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {overview.topics.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No topics measured for this subject yet.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Exports: {reportFileName(overview, "students", stamp)} ·{" "}
            {reportFileName(overview, "topics", stamp)} · generated {formatIso(stamp)} · window
            from {overview.recentActivity.windowStart}
          </p>
        </>
      ) : null}
    </div>
  );
}
