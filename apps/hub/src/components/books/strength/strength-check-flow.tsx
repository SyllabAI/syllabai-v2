"use client";

/**
 * T-BOOK-069 — the unit Strength Check flow (ADR-BOOK-0004 decision 3): the
 * unit's VALIDATED bank items, one at a time, with the immediate reveal
 * (the rail check verdict law — teaching, not grading). Submits ride the
 * unit lane (?unit=uN) through the auth-gated proxy; a signed-out learner
 * plays local-only (null result = honest "not recorded — sign in to save").
 *
 * Honest-absent law: an item whose bank ref resolves to nothing renders the
 * unavailable card (question:null on the wire) — never a fabricated
 * question, never a padded count.
 */
import { useMemo, useState } from "react";
import { ArrowRight, Check, ListChecks, RotateCcw, X } from "lucide-react";

import type { RailCheckSubmitResult } from "@syllabai/contracts";

import type { StrengthCheck } from "@/lib/books-strength";
import { submitStrengthCheck } from "@/lib/books-checks";
import { Button } from "@/components/ui/button";

interface FlowProps {
  documentId: string;
  unit: string;
  unitLabel: string;
  checks: StrengthCheck[];
}

interface ItemState {
  chosen: string | null;
  result: RailCheckSubmitResult | null;
  /** null result after a submit = signed out (local play) or upstream fail */
  recorded: boolean;
  submitting: boolean;
}

export function StrengthCheckFlow({ documentId, unit, unitLabel, checks }: FlowProps) {
  const [idx, setIdx] = useState(0);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [done, setDone] = useState(false);

  const item = checks[idx] ?? null;
  const state = item != null ? (states[item.blockId] ?? null) : null;

  const score = useMemo(() => {
    const answered = checks.filter((c) => states[c.blockId]?.result != null);
    const correct = answered.filter((c) => states[c.blockId]?.result?.correct === true).length;
    const marks = answered.reduce((s, c) => s + (states[c.blockId]?.result?.marksAwarded ?? 0), 0);
    const available = checks.filter((c) => c.question != null);
    const maxMarks = available.reduce((s, c) => s + (c.question?.marks ?? 0), 0);
    return { answered: answered.length, correct, marks, available: available.length, maxMarks };
  }, [checks, states]);

  const anyRecorded = useMemo(
    () => checks.some((c) => states[c.blockId]?.recorded === true),
    [checks, states],
  );

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        This unit&apos;s strength check is not published yet. It appears here once the
        operator validates it — nothing is shown before that gate.
      </div>
    );
  }

  const patch = (blockId: string, next: Partial<ItemState>) =>
    setStates((prev) => {
      const base: ItemState = prev[blockId] ?? {
        chosen: null,
        result: null,
        recorded: false,
        submitting: false,
      };
      return { ...prev, [blockId]: { ...base, ...next } };
    });

  const choose = (optionId: string) => {
    if (item == null || state?.result != null || state?.submitting) return;
    patch(item.blockId, { chosen: optionId });
  };

  const check = async () => {
    if (item == null || state?.chosen == null || state.submitting) return;
    patch(item.blockId, { submitting: true });
    const result = await submitStrengthCheck({
      documentId,
      unit,
      blockId: item.blockId,
      questionId: item.question!.questionId,
      chosenOptionId: state.chosen,
      responseTimeMs: 0,
    });
    patch(item.blockId, { result, recorded: result != null, submitting: false });
  };

  const advance = () => {
    if (idx + 1 >= checks.length) {
      setDone(true);
      return;
    }
    setIdx(idx + 1);
  };

  const restart = () => {
    setStates({});
    setIdx(0);
    setDone(false);
  };

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">{unitLabel} — result</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {score.answered} of {score.available} available items answered ·{" "}
            {score.correct} correct · {score.marks}/{score.maxMarks} marks
          </p>
          {!anyRecorded && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sign in to have your attempts recorded — this run stayed on this device.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={restart} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restart the check
        </Button>
      </div>
    );
  }

  if (item == null) return null;
  const q = item.question;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Question {idx + 1} of {checks.length}
        </span>
        <span>{score.correct} correct so far</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{
            width: `${Math.round(((idx + (state?.result != null ? 1 : 0)) / checks.length) * 100)}%`,
          }}
        />
      </div>

      {q == null ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium">This item is unavailable right now.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Its bank reference did not resolve — nothing is fabricated in its place.
          </p>
          <Button variant="outline" size="sm" onClick={advance} className="mt-4 gap-1.5">
            Skip
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5 sm:p-6">
          <p className="text-sm font-medium leading-relaxed">{q.stem}</p>
          <ul className="mt-4 space-y-2">
            {q.options.map((o) => {
              const chosen = state?.chosen === o.id;
              const isCorrectOption = state?.result?.correctOptionId === o.id;
              const reveal = state?.result != null;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => choose(o.id)}
                    disabled={reveal}
                    className={[
                      "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors duration-(--motion-duration-fast) ease-motion",
                      reveal && isCorrectOption
                        ? "border-emerald-500/60 bg-emerald-500/10 dark:border-emerald-500/40 dark:bg-emerald-500/15"
                        : reveal && chosen
                          ? "border-red-500/60 bg-red-500/10 dark:border-red-500/40 dark:bg-red-500/15"
                          : chosen
                            ? "border-primary/60 bg-primary/5"
                            : "hover:bg-muted/60",
                      reveal ? "cursor-default" : "",
                    ].join(" ")}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold">
                      {o.label}
                    </span>
                    <span className="min-w-0 flex-1">{o.text}</span>
                    {reveal && isCorrectOption && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    )}
                    {reveal && chosen && !isCorrectOption && (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {state?.result == null ? (
            <Button
              onClick={check}
              disabled={state?.chosen == null || state?.submitting}
              size="sm"
              className="mt-4"
            >
              {state?.submitting ? "Checking…" : "Check answer"}
            </Button>
          ) : (
            <div className="mt-4 space-y-3">
              <p
                className={[
                  "text-sm font-semibold",
                  state.result.correct ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                ].join(" ")}
              >
                {state.result.correct
                  ? `Correct — ${state.result.marksAwarded} mark${state.result.marksAwarded === 1 ? "" : "s"}.`
                  : "Not quite — the highlighted answer is the correct one."}
              </p>
              {!state.recorded && (
                <p className="text-xs text-muted-foreground">
                  Not recorded — sign in to save your attempts.
                </p>
              )}
              <Button onClick={advance} size="sm" className="gap-1.5">
                {idx + 1 >= checks.length ? "See result" : "Next question"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
