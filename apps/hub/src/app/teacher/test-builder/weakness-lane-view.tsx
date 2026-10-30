"use client";

/**
 * CD-A-hub (trace 1a18c3130e0a29f5) — the weak-area lane's ROWS, extracted
 * from test-builder-client so the render laws are golden-pinned against
 * schema-parsed wire fixtures (the foresights-panel pattern).
 *
 * Render laws pinned by weakness-lane-view.golden.test.tsx:
 *   SOURCE DISCLOSURE: the lane always names its source — "Class evidence ·
 *     M of E learners with evidence" (live) or "Sample cohort (demo data…)"
 *     (sample). The demo-era lane rendered SAMPLE aggregates with no label;
 *     that is the dishonesty this tranche retires.
 *   HONEST NULL: an unmeasured live row renders "mastery unmeasured" and
 *     NEVER a fabricated percentage (the wire's null stays null).
 *   EVIDENCE VOCABULARY: live misconception counts are LEARNERS ("N learners
 *     with active misconceptions"); the sample inventory is TRACKED
 *     misconceptions ("N misconceptions tracked") — the two semantics are
 *     never conflated.
 *   BLOCKED-BY EVIDENCE: BLOCKED_BY_WEAK_PREREQUISITE rows name the blocking
 *     prerequisite codes.
 *   COVERAGE GAPS ARE NEVER WEAK: gap rows render without a checkbox —
 *     never selectable, never counted as weak areas (the wire's honest
 *     "insufficient coverage" candidate).
 *   SERVER ORDER PRESERVED: rows render in the order the lane layer hands
 *     over (the frozen comparator's order for live); the cap slice is all
 *     the client-side shaping there is.
 */
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Info } from "lucide-react";
import {
  WEAKNESS_REASON_LABELS,
  type WeakLaneGap,
  type WeakLaneTarget,
} from "@/lib/teacher/weakness-lane";

export function WeaknessLaneRows({
  source,
  targets,
  gaps,
  enrolledLearners,
  learnersWithEvidence,
  selected,
  onToggle,
  cap,
  showAll,
}: {
  source: "live" | "sample";
  targets: WeakLaneTarget[];
  gaps: WeakLaneGap[];
  /** live context (ignored for sample) */
  enrolledLearners?: number;
  learnersWithEvidence?: number;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  cap: number;
  showAll: boolean;
}) {
  const visible = showAll ? targets : targets.slice(0, cap);
  return (
    <div>
      <p
        className="mb-1.5 text-[11px] font-medium text-muted-foreground"
        data-testid="weak-lane-source"
      >
        {source === "live"
          ? `Class evidence · ${learnersWithEvidence ?? 0} of ${enrolledLearners ?? 0} learners with evidence`
          : "Sample cohort (demo data — not this class's evidence)"}
      </p>
      {targets.length === 0 && (
        <p className="py-1 text-xs text-muted-foreground" data-testid="weak-lane-empty">
          {source === "live"
            ? learnersWithEvidence === 0
              ? "No measured evidence yet — class practice builds it"
              : "No topics currently below the weak line"
            : "No weak areas flagged in the sample cohort"}
        </p>
      )}
      <div className="space-y-1">
        {visible.map((w) => (
          <label
            key={w.key}
            className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.has(w.key)}
              onCheckedChange={() => onToggle(w.key)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="font-mono text-[10px] text-muted-foreground">{w.code}</span>{" "}
              {w.title}
              {w.reasons.map((r) => (
                <Badge key={r} variant="outline" className="ml-1 h-4 px-1 text-[9px]">
                  {WEAKNESS_REASON_LABELS[r] ?? r}
                </Badge>
              ))}
              <span className="block text-[10px] text-muted-foreground" data-testid="weak-lane-row-evidence">
                {w.meanMastery === null
                  ? "mastery unmeasured"
                  : `mean mastery ${(w.meanMastery * 100).toFixed(0)}%`}{" "}
                ·{" "}
                {w.misconceptionCount > 0
                  ? w.misconceptionUnit === "learners"
                    ? `${w.misconceptionCount} learner${w.misconceptionCount === 1 ? "" : "s"} with active misconceptions · `
                    : `${w.misconceptionCount} misconception${w.misconceptionCount === 1 ? "" : "s"} tracked · `
                  : ""}
                {w.questionCount} validated question{w.questionCount === 1 ? "" : "s"}
              </span>
              {w.blockedBy.length > 0 && (
                <span
                  className="block text-[10px] text-muted-foreground"
                  data-testid="weak-lane-blocked"
                >
                  blocked by prerequisites: {w.blockedBy.join(", ")}
                </span>
              )}
            </span>
          </label>
        ))}
        {gaps.map((g) => (
          <p
            key={g.key}
            className="flex items-start gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground"
            data-testid="weak-lane-gap"
          >
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              <span className="font-mono text-[10px]">{g.code}</span> {g.title} — no class
              evidence yet · {g.questionCount} validated question
              {g.questionCount === 1 ? "" : "s"} available
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
