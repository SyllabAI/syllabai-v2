"use client";

/**
 * GuidedCheckList — the self-check layer of the guided-lesson surface.
 *
 * Renders the note's sme-question-package checks inline under their module,
 * ordered by the module's checkRefs (the adapter's bidirectional 1:1 join).
 * Each check is a self-paced reveal: pick an option, see right/wrong with
 * the explanation (and the named misconception when present), or just reveal
 * the answer. The confidence-gate runtime policy (continueDisabledUntilChoice
 * / resumeWithoutReRate / postCheckRecalibration) belongs to the practice
 * engine — this surface is the read/reveal layer and never blocks.
 */
import { useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { GuidedQuestion } from "@/lib/guided-lessons";

interface Props {
  questions: GuidedQuestion[];
}

export function GuidedCheckList({ questions }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const answered = useMemo(
    () => questions.filter((q) => picked[q.id] !== undefined || revealed[q.id]).length,
    [questions, picked, revealed],
  );
  const correct = useMemo(
    () =>
      questions.filter((q) => {
        const key = picked[q.id];
        if (key === undefined) return false;
        return q.options.find((o) => o.key === key)?.correct ?? false;
      }).length,
    [questions, picked],
  );

  const reset = () => {
    setPicked({});
    setRevealed({});
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {answered} of {questions.length} attempted · {correct} correct on first pick
        </p>
        <Button variant="ghost" size="sm" onClick={reset} disabled={answered === 0}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset checks
        </Button>
      </div>
      <Progress value={(answered / Math.max(questions.length, 1)) * 100} aria-label="Check progress" />

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <GuidedCheck
            key={q.id}
            index={i + 1}
            question={q}
            pickedKey={picked[q.id]}
            revealed={revealed[q.id] ?? false}
            onPick={(key) => setPicked((p) => ({ ...p, [q.id]: key }))}
            onReveal={() => setRevealed((r) => ({ ...r, [q.id]: true }))}
          />
        ))}
      </ol>
    </div>
  );
}

interface CheckProps {
  index: number;
  question: GuidedQuestion;
  pickedKey: string | undefined;
  revealed: boolean;
  onPick: (key: string) => void;
  onReveal: () => void;
}

function GuidedCheck({ index, question, pickedKey, revealed, onPick, onReveal }: CheckProps) {
  const settled = pickedKey !== undefined || revealed;
  const pickedOption = question.options.find((o) => o.key === pickedKey);
  const correctOption = question.options.find((o) => o.correct);
  const showVerdict = pickedOption !== undefined;
  const showAnswer = settled;

  return (
    <li className="rounded-lg border bg-card">
      <fieldset className="p-4 sm:p-5">
        <legend className="mb-3 text-sm font-medium leading-snug">
          <span className="mr-2 text-muted-foreground">{index}.</span>
          {question.stem}
        </legend>
        <div className="grid gap-2" role="radiogroup" aria-label={`Options for check ${index}`}>
          {question.options.map((o) => {
            const isPicked = pickedKey === o.key;
            const state = !showAnswer
              ? isPicked
                ? "picked"
                : "idle"
              : o.correct
                ? "correct"
                : isPicked
                  ? "wrong"
                  : "idle";
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={settled}
                onClick={() => onPick(o.key)}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left text-[13px] transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                  state === "idle" && "hover:border-primary/40",
                  state === "picked" && "border-primary/60 bg-primary/5",
                  state === "correct" && "border-emerald-600/50 bg-emerald-600/10 dark:border-emerald-500/40 dark:bg-emerald-500/10",
                  state === "wrong" && "border-red-600/50 bg-red-600/10 dark:border-red-500/40 dark:bg-red-500/10",
                  settled && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    state === "correct" && "border-emerald-600/60 text-emerald-700 dark:text-emerald-400",
                    state === "wrong" && "border-red-600/60 text-red-700 dark:text-red-400",
                    (state === "idle" || state === "picked") && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {state === "correct" ? (
                    <Check className="size-3" />
                  ) : state === "wrong" ? (
                    <X className="size-3" />
                  ) : (
                    o.key
                  )}
                </span>
                <span className="min-w-0">{o.text}</span>
              </button>
            );
          })}
        </div>

        {!settled && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={onReveal}>
              Reveal answer
            </Button>
          </div>
        )}

        {showVerdict && (
          <p
            className={cn(
              "mt-3 text-[13px] font-medium",
              pickedOption.correct
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400",
            )}
            role="status"
          >
            {pickedOption.correct ? "Correct — " : "Not quite — "}
            {pickedOption.explanation}
          </p>
        )}

        {showAnswer && !pickedOption && correctOption && (
          <p className="mt-3 text-[13px] text-muted-foreground" role="status">
            Answer: <span className="font-medium text-foreground">{correctOption.key}</span> —{" "}
            {correctOption.explanation}
          </p>
        )}

        {settled && pickedOption && !pickedOption.correct && correctOption && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Answer: <span className="font-medium text-foreground">{correctOption.key}</span> —{" "}
            {correctOption.explanation}
          </p>
        )}

        {settled && pickedOption?.misconception && (
          <p className="mt-1 text-xs text-muted-foreground">
            Misconception flagged: {pickedOption.misconception}
          </p>
        )}
      </fieldset>
    </li>
  );
}
