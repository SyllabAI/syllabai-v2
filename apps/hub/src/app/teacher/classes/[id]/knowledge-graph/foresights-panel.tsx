"use client";

/**
 * T-FORESIGHT-V0-PLAN-1 Stage B — the Foresights panel (foresights/v1),
 * the hub's first ADR-CLASS-0002 comprehension-first prediction surface.
 *
 * THE LAYOUT ORDER IS THE LAW (ADR-CLASS-0002 C1/C2/C3 + plan §8), rendered
 * top-to-bottom and golden-pinned by foresights-panel.golden.test.ts:
 *   (1) the C1 headline sentence, styled by state (ready / at-risk /
 *       cannot-assess visual classes) — the FIRST thing the teacher reads;
 *   (2) the C3 disclosure line, ALWAYS rendered — the readiness prior vs
 *       evidence provenance, verbatim from the wire;
 *   (3) the prerequisite band chips (the §13.3 four-state vocabulary; derived
 *       cells flagged with their concept codes; misco counts; the §13.3
 *       band-count distribution folded into this section's header);
 *   (4) the learner attention list — three groups in the SERVER-FROZEN sort
 *       (AT_RISK → READY → NOT_ASSESSABLE); the panel NEVER re-sorts, it
 *       renders the wire order verbatim and groups in the same fixed order
 *       (the §13.3 learner-state distribution is this section's header);
 *   (5) the C4 unlock-path CTA when present (the single assignment that
 *       would restore assessability);
 *   (6) ONLY THEN any chart — and v0 renders NO chart at all: there is no
 *       numeric curve (C2 bans bare probabilistic visuals; the chips ARE
 *       the visual). The law is honored vacuously by construction.
 *
 * v1.1 amendment (ADR-CLASS-0003) renders inside this law — no new section:
 *   (3) measured chips append an evidence-recency line ("last practiced
 *       YYYY-MM-DD" — a pure slice of the wire ISO string, zero locale math,
 *       so the static renders stay deterministic); unmeasured chips render
 *       nothing extra (nothing to say — the honest null); the contextChain
 *       line still lists codes only;
 *   (4) the attention-queue header gains the atRiskByReason breakdown line
 *       when at least one learner is AT_RISK (the §13.3 polarized-class
 *       answer, same plain-language vocabulary, zeros included).
 * `targetMeasured: true` replaces section (4) with a route chip to the
 * measured topic drill-down — Foresights' home terrain is unmeasured
 * targets; a measured target is honest retrospective material, routed to
 * the surface that owns it.
 *
 * Data honesty: every string the teacher reads about evidence comes from
 * the wire (headline, disclosure, bands, codes, counts) — this component
 * invents no numbers, no bands, no re-aggregation; unmeasured is rendered
 * as unmeasured (dashed chip), never as zero. Reasons render in the same
 * band-level plain-language vocabulary (REASON_LABEL below — no numeric
 * mastery, no probabilities, anywhere).
 */

import Link from "next/link";
import {
  ArrowUpRight,
  GraduationCap,
  ShieldAlert,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ClassForesightsView,
  ForesightsLearnerReason,
  ForesightsLearnerState,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** the §13.3 four-state band vocabulary → the shared chip classes */
const BAND_CHIP: Record<string, { label: string; className: string }> = {
  LOW: { label: "LOW", className: "bg-rose-50 text-rose-800 border-rose-200" },
  DEVELOPING: {
    label: "DEVELOPING",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  SECURE: {
    label: "SECURE",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  UNMEASURED: {
    label: "UNMEASURED",
    className: "border-dashed bg-muted/40 text-muted-foreground",
  },
};

/** the per-learner reasons in the same band-level words the headline uses —
 * plain language, zero numbers (the C1 vocabulary extends to every row). */
const REASON_LABEL: Record<ForesightsLearnerReason, string> = {
  LOW_MASTERY_PREREQ: "sits below the ready line on",
  ACTIVE_MISCONCEPTION_PREREQ: "carries an active misconception on",
  LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ:
    "sits below the ready line AND carries an active misconception on",
  UNMEASURED_PREREQ: "has no evidence yet on",
};

const GROUP_ORDER: ForesightsLearnerState[] = ["AT_RISK", "READY", "NOT_ASSESSABLE"];

/** v1.1 (ADR-CLASS-0003 D2): the at-risk reason breakdown in the same
 * plain-language words — zeros included so the three-way shape is legible. */
const AT_RISK_DETAIL: Array<[keyof ClassForesightsView["distribution"]["atRiskByReason"], string]> = [
  ["LOW_MASTERY_PREREQ", "below the ready line only"],
  ["ACTIVE_MISCONCEPTION_PREREQ", "active misconception only"],
  ["LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ", "both"],
];

const GROUP_LABEL: Record<ForesightsLearnerState, string> = {
  AT_RISK: "Needs attention first",
  READY: "Looks ready",
  NOT_ASSESSABLE: "Cannot be assessed yet",
};

/** the state-styled headline container (visual classes pinned by the goldens) */
const STATE_CARD: Record<ClassForesightsView["classState"], string> = {
  ASSESSABLE_READY: "border-emerald-300 bg-emerald-50 text-emerald-950",
  ASSESSABLE_AT_RISK: "border-amber-300 bg-amber-50 text-amber-950",
  NOT_ASSESSABLE: "border-border bg-muted/50 text-foreground",
};

const STATE_CHIP: Record<ClassForesightsView["classState"], { label: string; className: string }> = {
  ASSESSABLE_READY: {
    label: "Readiness prior: ready",
    className: "border-emerald-300 bg-emerald-100 text-emerald-900",
  },
  ASSESSABLE_AT_RISK: {
    label: "Readiness prior: at risk",
    className: "border-amber-300 bg-amber-100 text-amber-900",
  },
  NOT_ASSESSABLE: {
    label: "Readiness prior: cannot assess yet",
    className: "border-border bg-background text-muted-foreground",
  },
};

export function ForesightsPanel({ view }: { view: ClassForesightsView }) {
  // sections (3) and (4) render in the wire's own order — these groupings
  // never re-order anything (the frozen server sort IS the attention queue)
  const byState = (s: ForesightsLearnerState) => view.learners.filter((l) => l.state === s);
  const measuredPrereqs = view.prerequisites.filter((c) => c.learnersMeasured > 0);

  return (
    <div className="space-y-4" data-testid="foresights-panel" data-state={view.classState}>
      {/* ── (1) the C1 headline, styled by state — first thing read ───────── */}
      <div className={cn("rounded-lg border p-4", STATE_CARD[view.classState])}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px]", STATE_CHIP[view.classState].className)}>
            <Sparkles className="mr-1 size-3" aria-hidden />
            {STATE_CHIP[view.classState].label}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            {view.targetTopic.code}
          </Badge>
          {view.targetMeasured ? (
            <Badge variant="outline" className="text-[10px]">
              target already measured
            </Badge>
          ) : null}
        </div>
        <p
          className="mt-2 text-base leading-relaxed font-medium"
          data-testid="foresights-headline"
        >
          {view.headline}
        </p>
        {/* ── (2) the C3 disclosure — ALWAYS rendered, verbatim from the wire ── */}
        <p
          className="mt-2 text-xs leading-relaxed text-muted-foreground"
          data-testid="foresights-disclosure"
        >
          {view.disclosure}
        </p>
      </div>

      {/* ── (3) the prerequisite band chips (§13.3 four-state vocabulary) ──── */}
      <section data-testid="foresights-prerequisites" className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <h3 className="text-xs font-semibold text-foreground">
            Prerequisites the prediction reads ({view.prerequisites.length})
          </h3>
          {measuredPrereqs.length > 0 ? (
            <span aria-label="prerequisite band distribution">
              {measuredPrereqs.filter((c) => c.masteryBand === "LOW").length} LOW ·{" "}
              {measuredPrereqs.filter((c) => c.masteryBand === "DEVELOPING").length} DEVELOPING ·{" "}
              {measuredPrereqs.filter((c) => c.masteryBand === "SECURE").length} SECURE
            </span>
          ) : null}
        </div>
        {view.prerequisites.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            The concept graph records no prerequisites for {view.targetTopic.title} — nothing
            to project from (the honest cannot-predict state, not an error).
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {view.prerequisites.map((p) => {
              const band = BAND_CHIP[p.masteryBand] ?? {
                label: p.masteryBand,
                className: "",
              };
              return (
                <li
                  key={p.nodeId}
                  data-testid="foresights-prereq-chip"
                  className={cn(
                    "rounded-md border px-2.5 py-1.5",
                    band.className,
                    p.weak && "border-rose-300",
                  )}
                >
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="font-mono">{p.code}</span>
                    <span>{band.label}</span>
                    {p.weak ? (
                      <TriangleAlert className="size-3 text-rose-700" aria-label="below the class's ready line" />
                    ) : null}
                    {p.learnersWithActiveMisconception > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-rose-700">
                        <ShieldAlert className="size-3" aria-hidden />
                        {p.learnersWithActiveMisconception}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug">
                    {p.title} · {p.learnersMeasured} measured
                    {p.derived ? ` · via ${p.derivedViaConceptCodes.join(", ")}` : ""}
                    {p.lastPracticedAt ? (
                      <span
                        data-testid="foresights-prereq-recency"
                        className="text-muted-foreground"
                      >
                        {" "}· last practiced {p.lastPracticedAt.slice(0, 10)}
                      </span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {view.contextChain.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Further back in the chain ({view.contextChain.length} topic
            {view.contextChain.length === 1 ? "" : "s"}, context only — they never move this
            prediction):{" "}
            {view.contextChain.map((c) => c.code).join(", ")}
          </p>
        ) : null}
      </section>

      {/* ── (4) the learner attention list — the server's frozen sort, three
             groups — OR the targetMeasured route chip that replaces it ──── */}
      {view.targetMeasured ? (
        <section data-testid="foresights-measured-routing" className="rounded-lg border bg-muted/30 p-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed">
            <Target className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium">{view.targetTopic.title}</span> already has class
              evidence — that makes this a retrospective lens, not a forecast. The measured
              view of record lives in the topic drill-down.
            </span>
          </p>
          <Button size="sm" variant="outline" asChild className="mt-2">
            <Link href="/teacher/class">
              Open the measured topic drill-down
              <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
            </Link>
          </Button>
        </section>
      ) : (
        <section data-testid="foresights-learners" className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <h3 className="text-xs font-semibold text-foreground">
              Your attention queue ({view.learners.length})
            </h3>
            <span aria-label="learner state distribution">
              {view.distribution.atRisk} at risk · {view.distribution.ready} ready ·{" "}
              {view.distribution.notAssessable} not assessable
            </span>
          </div>
          {view.distribution.atRisk > 0 ? (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="foresights-atrisk-reasons"
            >
              At-risk detail:{" "}
              {AT_RISK_DETAIL.map(([key, label]) => `${view.distribution.atRiskByReason[key]} ${label}`).join(
                " · ",
              )}
            </p>
          ) : null}
          {view.learners.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nobody is enrolled yet — the queue fills in as members join.
            </p>
          ) : (
            GROUP_ORDER.map((state) => {
              const rows = byState(state);
              if (rows.length === 0) return null;
              return (
                <div key={state} data-testid={`foresights-group-${state}`}>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {GROUP_LABEL[state]} ({rows.length})
                  </p>
                  <ul className="mt-1 divide-y overflow-hidden rounded-md border">
                    {rows.map((l) => (
                      <li key={l.learnerId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2">
                        <span className="text-sm font-medium">{l.displayName}</span>
                        {l.reason ? (
                          <span className="text-xs text-muted-foreground">
                            {REASON_LABEL[l.reason]}{" "}
                            <span className="font-mono">
                              {[
                                ...l.unmeasuredPrereqCodes,
                                ...l.weakPrereqCodes,
                                ...l.miscoPrereqCodes,
                              ]
                                .filter((code, i, all) => all.indexOf(code) === i)
                                .join(", ")}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            every prerequisite it has practiced sits at DEVELOPING or above
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* ── (5) the C4 unlock-path CTA — the one assignment that unlocks the
             prediction ───────────────────────────────────────────────────── */}
      {view.unlockPath ? (
        <section data-testid="foresights-unlock" className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
          <p className="text-xs leading-relaxed">
            <span className="font-medium">Unlock the prediction:</span> assign{" "}
            <span className="font-mono">{view.unlockPath.code}</span> ({view.unlockPath.title})
            practice — once the class has evidence on it, this surface can assess{" "}
            {view.targetTopic.title}.
          </p>
          <Button size="sm" asChild className="ml-auto">
            <Link
              href={`/teacher/test-builder?subtopics=${encodeURIComponent(view.unlockPath.code)}`}
            >
              <GraduationCap className="mr-1 size-4" aria-hidden />
              Assign {view.unlockPath.code} practice
            </Link>
          </Button>
        </section>
      ) : null}

      {/* (6) no chart in v0 — see the header law comment. */}
    </div>
  );
}
