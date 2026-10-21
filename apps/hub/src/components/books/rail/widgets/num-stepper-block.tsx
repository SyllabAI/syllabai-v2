"use client";

/**
 * T-BOOK-005 — num-stepper: the stepwise numeric walkthrough (chem: the
 * mole ladder, Q=mcΔT) with the full validation law per step: value →
 * unit → sig-figs (checkNumeric). Steps advance on a correct check; hints
 * open on demand (never auto-revealed). Self-check only — no attempts.
 */
import { useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { CheckResetButtons, VerdictChip, WidgetCard, type Verdict } from "../check-shared";
import { checkNumeric, type NumericVerdict } from "@/lib/books-chem";

interface Step {
  prompt: string;
  answer: number | string;
  unit?: string[];
  tolerance?: number;
  sigFigs?: number;
  hint?: string;
}

const DOT = "•";

export function NumStepperBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const steps: Step[] = Array.isArray(c.steps)
    ? (c.steps as unknown[])
        .filter((s): s is Step => typeof s === "object" && s != null && typeof (s as Step).prompt === "string" && ((s as Step).answer != null))
        .map((s) => ({
          prompt: s.prompt,
          answer: s.answer,
          unit: Array.isArray(s.unit) ? (s.unit as string[]).filter((u): u is string => typeof u === "string") : undefined,
          tolerance: typeof s.tolerance === "number" ? s.tolerance : undefined,
          sigFigs: typeof s.sigFigs === "number" ? s.sigFigs : undefined,
          hint: typeof s.hint === "string" ? s.hint : undefined,
        }))
    : [];
  const prompt = typeof c.prompt === "string" ? c.prompt : null;

  const [inputs, setInputs] = useState<string[]>(() => steps.map(() => ""));
  const [verdicts, setVerdicts] = useState<(NumericVerdict | null)[]>(() => steps.map(() => null));
  const [revealed, setRevealed] = useState<boolean[]>(() => steps.map(() => false));
  const [overall, setOverall] = useState<Verdict>("unchecked");
  const [overallDetail, setOverallDetail] = useState<string | null>(null);

  if (steps.length === 0) return null; // unbuildable never ships

  // the active step = the first not-yet-correct one (linear mastery ladder)
  const activeIdx = verdicts.findIndex((v) => v?.ok !== true);

  const setStep = (i: number, v: string) => {
    setInputs((m) => m.map((x, j) => (j === i ? v : x)));
    setVerdicts((m) => m.map((x, j) => (j === i ? null : x)));
    setOverall("unchecked");
    setOverallDetail(null);
  };

  const checkStep = (i: number) => {
    const s = steps[i]!;
    const v = checkNumeric(inputs[i] ?? "", {
      answer: s.answer,
      tolerance: s.tolerance,
      units: s.unit,
      sigFigs: s.sigFigs,
    });
    setVerdicts((m) => m.map((x, j) => (j === i ? v : x)));
    if (v.ok && verdicts.every((x, j) => j === i || x?.ok === true)) {
      setOverall("correct");
      setOverallDetail("all steps check out");
    } else if (v.ok) {
      setOverall("partial");
      setOverallDetail(`through step ${i + 1} of ${steps.length}`);
    }
  };

  const checkAll = () => {
    const next = steps.map((s, i) =>
      checkNumeric(inputs[i] ?? "", {
        answer: s.answer,
        tolerance: s.tolerance,
        units: s.unit,
        sigFigs: s.sigFigs,
      }),
    );
    setVerdicts(next);
    const okCount = next.filter((v) => v?.ok).length;
    setOverall(okCount === steps.length ? "correct" : okCount === 0 ? "wrong" : "partial");
    setOverallDetail(okCount === steps.length ? null : `${okCount}/${steps.length} steps correct`);
  };

  const reset = () => {
    setInputs(steps.map(() => ""));
    setVerdicts(steps.map(() => null));
    setRevealed(steps.map(() => false));
    setOverall("unchecked");
    setOverallDetail(null);
  };

  const lawLabel = (v: NumericVerdict): string =>
    v.law === "value" ? "check the arithmetic"
    : v.law === "unit" ? v.detail
    : v.law === "sigfigs" ? v.detail
    : v.law === "format" ? "use a plain number (e.g. 0.125 or 5e-3)"
    : "";

  return (
    <WidgetCard ord={block.ord} typeLabel="Step through" prompt={prompt}>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const v = verdicts[i] ?? null;
          const isActive = i === activeIdx;
          const locked = i > activeIdx;
          return (
            <li key={i} className={`rounded-md border px-2 py-1.5 ${isActive ? "border-primary/60" : "border-border"} ${locked ? "opacity-60" : ""}`}>
              <p className="flex items-start gap-1.5 text-[13px] leading-snug">
                <span className="font-mono text-muted-foreground">{i + 1}{DOT}</span>
                <span>{s.prompt}</span>
              </p>
              {locked ? null : (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <input
                    className="w-32 rounded-md border border-border bg-background px-2 py-1 text-[13px]"
                    value={inputs[i] ?? ""}
                    onChange={(e) => setStep(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        checkStep(i);
                      }
                    }}
                    aria-label={`Answer for step ${i + 1}`}
                    aria-invalid={v?.ok === false}
                  />
                  {s.unit && s.unit.length > 0 && (
                    <span className="text-xs text-muted-foreground" title={`units accepted: ${s.unit.join(" / ")}`}>
                      ({s.unit[0]})
                    </span>
                  )}
                  {s.hint && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline decoration-dotted"
                      onClick={() => setRevealed((m) => m.map((x, j) => (j === i ? true : x)))}
                    >
                      hint
                    </button>
                  )}
                </div>
              )}
              {v != null && !v.ok && (
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300" role="status" aria-live="polite">
                  {lawLabel(v)}
                </p>
              )}
              {v?.ok === true && (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
                  Step {i + 1} correct
                </p>
              )}
              {revealed[i] && s.hint && <p className="mt-1 text-xs italic text-muted-foreground">{s.hint}</p>}
            </li>
          );
        })}
      </ol>
      <CheckResetButtons onCheck={checkAll} onReset={reset} checkLabel="Check all steps" />
      <div className="mt-1.5">
        <VerdictChip verdict={overall} detail={overallDetail} />
      </div>
    </WidgetCard>
  );
}
