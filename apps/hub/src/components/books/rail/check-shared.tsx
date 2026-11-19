"use client";

/**
 * T-BOOK-004 — shared rail-widget furniture: verdict chips + the check /
 * try-again button pair + the self-check card shell. Every interactive
 * widget renders feedback through these primitives so the a11y contract
 * (aria-live politeness, focus management, keyboard reachability) is
 * written ONCE — the a11y keyboard paths of the T-BOOK-004 plan row.
 *
 * Self-check law: these widgets are PRACTICE, not evidence — nothing here
 * writes attempts (the bank law: attempts come from the check lane,
 * T-BOOK-008, mcq-embed only). Feedback is local and instant.
 */
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Check, RotateCcw, X } from "lucide-react";

export type Verdict = "unchecked" | "correct" | "partial" | "wrong";

export function VerdictChip({ verdict, detail }: { verdict: Verdict; detail?: string | null }) {
  if (verdict === "unchecked") return null;
  const map = {
    correct: { icon: Check, cls: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200", text: "Correct" },
    partial: { icon: Check, cls: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200", text: "Partly there" },
    wrong: { icon: X, cls: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200", text: "Not yet" },
  } as const;
  const { icon: Icon, cls, text } = map[verdict];
  return (
    <p
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {text}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </p>
  );
}

export function CheckResetButtons({
  onCheck,
  onReset,
  disabled,
  checkLabel = "Check",
}: {
  onCheck: () => void;
  onReset: () => void;
  disabled?: boolean;
  checkLabel?: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <Button size="sm" className="h-7 px-3 text-xs" onClick={onCheck} disabled={disabled}>
        {checkLabel}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={onReset}
        aria-label="Reset this activity"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset
      </Button>
    </div>
  );
}

/** The interactive card shell — ord/type header + prompt + children.
 *  `hideMeta` (embedded/guided mode) drops the "block {ord}" furniture —
 *  the guided check header already names the question. */
export function WidgetCard({
  ord,
  typeLabel,
  prompt,
  children,
  accent = false,
  hideMeta = false,
}: {
  ord: number;
  typeLabel: string;
  prompt?: string | null;
  children: ReactNode;
  accent?: boolean;
  hideMeta?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        accent
          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
          : "border-border bg-card"
      }`}
    >
      <p className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{typeLabel}</span>
        {!hideMeta && (
          <span className="text-2xs font-normal normal-case opacity-60">block {ord}</span>
        )}
      </p>
      {prompt && <p className="mb-2 whitespace-pre-line font-medium leading-snug">{prompt}</p>}
      {children}
    </div>
  );
}

/** sr-only live region helper for keyboard-only flows (sort/drag). */
export function LiveHint({ text }: { text: string }) {
  return (
    <span aria-live="polite" role="status" className="sr-only">
      {text}
    </span>
  );
}

/* ── P2 interaction bridge (guided-lessons redesign plan §5.4) ───────────
 * The guided check slots can mount these SAME widgets as their answering
 * surface (embedded mode): the widget keeps its practice furniture and
 * self-check law, hides its own verdict chip (the flow renders the verdict
 * + remediation of record), and reports the settle upward so the flow can
 * record the attempt. Additive: absent listeners change nothing here. */

/** The settle payload a widget reports in embedded mode. `echo` is the
 *  learner's final assembly verbatim (the sort applied, the equation built,
 *  the cells filled) — the guided flow rides it on the answer record so a
 *  resumed session can show what was answered. */
export interface InteractionVerdict {
  verdict: Verdict;
  detail: string | null;
  echo: string | null;
}

export type InteractionVerdictListener = (r: InteractionVerdict) => void;

/** Echo length cap — the answer record carries a readable line, not a dump. */
export function echoCap(s: string, n = 160): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
