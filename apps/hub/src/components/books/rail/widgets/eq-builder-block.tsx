"use client";

/**
 * T-BOOK-005 — eq-builder: the equation/ionic-equation builder (the chem
 * carrier — half-equations, balanced equations with state symbols).
 *
 * THE ASSEMBLY LAW: the learner assembles from the authored token bank
 * (content.tokens) into species slots joined with " + " — the widget never
 * free-types species text, so the charge/separator ambiguity of compact
 * strings cannot arise (books-chem's splitSpecies law). THREE verdict
 * chips render separately — atoms balanced, charges balanced, states
 * complete — plus the target match (the chemistry value-add, PLAN §8).
 * Self-check only — no attempts.
 */
import { useMemo, useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { CheckResetButtons, VerdictChip, WidgetCard, type Verdict } from "../check-shared";
import { verdictFor, type EqVerdict } from "@/lib/books-chem";

export function EqBuilderBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const target = typeof c.target === "string" ? c.target : null;
  const tokens = Array.isArray(c.tokens)
    ? (c.tokens as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];
  const prompt = typeof c.prompt === "string" ? c.prompt : null;
  const arrow = c.arrow === "⇌" ? "⇌" : "->";

  const [assembled, setAssembled] = useState<string[]>([]); // LHS tokens
  const [rhs, setRhs] = useState<string[]>([]);
  const [side, setSide] = useState<"lhs" | "rhs">("lhs");
  const [verdict, setVerdict] = useState<EqVerdict | null>(null);
  const [overall, setOverall] = useState<Verdict>("unchecked");
  const [detail, setDetail] = useState<string | null>(null);

  const equation = useMemo(() => {
    const join = (arr: string[]) => arr.join(" + ");
    if (assembled.length === 0 && rhs.length === 0) return "";
    return `${join(assembled)} ${arrow === "⇌" ? "⇌" : "->"} ${join(rhs)}`;
  }, [assembled, rhs, arrow]);

  if (target == null || tokens.length === 0) return null; // unbuildable never ships

  const used = new Set([...assembled, ...rhs]);
  const remaining = tokens.filter((t) => {
    // multiplicity: a token may be used as many times as it appears in the bank
    const total = tokens.filter((x) => x === t).length;
    const placed = [...assembled, ...rhs].filter((x) => x === t).length;
    return placed < total;
  });

  const push = (t: string) => {
    if (side === "lhs") setAssembled((a) => [...a, t]);
    else setRhs((r) => [...r, t]);
    setVerdict(null);
    setOverall("unchecked");
    setDetail(null);
  };

  const popLast = (which: "lhs" | "rhs") => {
    if (which === "lhs") setAssembled((a) => a.slice(0, -1));
    else setRhs((r) => r.slice(0, -1));
    setVerdict(null);
    setOverall("unchecked");
    setDetail(null);
  };

  const check = () => {
    const v = verdictFor(equation, target);
    setVerdict(v);
    if (v.matchesTarget && v.atoms.balanced && v.charges.balanced) {
      setOverall("correct");
      setDetail(null);
    } else if (v.parsed) {
      setOverall("wrong");
      setDetail(v.matchesTarget ? null : "does not match the target equation");
    } else {
      setOverall("wrong");
      setDetail("the assembly does not parse — check the species tokens");
    }
  };

  const reset = () => {
    setAssembled([]);
    setRhs([]);
    setVerdict(null);
    setOverall("unchecked");
    setDetail(null);
  };

  return (
    <WidgetCard ord={block.ord} typeLabel="Build the equation" prompt={prompt} accent>
      {/* the assembly strip */}
      <div className="rounded-md border bg-muted/40 p-2">
        <div className="flex flex-wrap items-center gap-1" aria-label={`Equation so far: ${equation || "empty"}`} role="status">
          {assembled.map((t, i) => (
            <span key={`l${i}`} className="rounded bg-background px-1.5 py-0.5 font-mono text-[13px]">{t}</span>
          ))}
          {(assembled.length > 0 || rhs.length > 0) && (
            <span className="px-1 font-mono text-[13px] text-muted-foreground">{arrow === "⇌" ? "⇌" : "→"}</span>
          )}
          {rhs.map((t, i) => (
            <span key={`r${i}`} className="rounded bg-background px-1.5 py-0.5 font-mono text-[13px]">{t}</span>
          ))}
          {assembled.length === 0 && rhs.length === 0 && (
            <span className="text-[13px] text-muted-foreground">tap tokens below to assemble…</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">adding to</span>
          {(["lhs", "rhs"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${side === s ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {s === "lhs" ? "left" : "right"}
            </button>
          ))}
          <span className="flex-1" />
          {assembled.length > 0 && (
            <button type="button" onClick={() => popLast("lhs")} className="rounded border px-1.5 py-0.5 text-[11px]" aria-label="Remove last token on the left">
              ⌫ left
            </button>
          )}
          {rhs.length > 0 && (
            <button type="button" onClick={() => popLast("rhs")} className="rounded border px-1.5 py-0.5 text-[11px]" aria-label="Remove last token on the right">
              ⌫ right
            </button>
          )}
        </div>
      </div>
      {/* the token bank */}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Species tokens">
        {tokens.map((t, i) => {
          const exhausted = !remaining.includes(t);
          return (
            <button
              key={`${t}-${i}`}
              type="button"
              onClick={() => push(t)}
              disabled={exhausted}
              aria-label={`Add ${t} to the ${side === "lhs" ? "left" : "right"} side`}
              className={`rounded-md border px-2 py-1 font-mono text-[13px] ${exhausted ? "border-border opacity-40" : "border-border bg-background hover:border-primary"}`}
            >
              {t}
            </button>
          );
        })}
      </div>
      <CheckResetButtons onCheck={check} onReset={reset} checkLabel="Check equation" />
      {verdict != null && (
        <div className="mt-2 space-y-1 text-[13px]">
          <VerdictLine ok={verdict.atoms.balanced} label="atoms balanced" detail={verdict.atoms.detail} />
          <VerdictLine ok={verdict.charges.balanced} label="charges balanced" detail={verdict.charges.detail} />
          <VerdictLine
            ok={verdict.states.complete}
            label="state symbols"
            detail={verdict.states.complete ? "every species carries a state" : `${verdict.states.missing} species missing (s)/(l)/(g)/(aq)`}
          />
          <VerdictLine ok={verdict.matchesTarget} label="matches the target" detail={verdict.matchesTarget ? "this is the equation of record" : ""} />
        </div>
      )}
      <div className="mt-1.5">
        <VerdictChip verdict={overall} detail={detail} />
      </div>
    </WidgetCard>
  );
}

function VerdictLine({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <p className={`flex items-center gap-1.5 ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span>
      <span className="font-medium">{label}</span>
      {detail && !ok && <span className="font-normal opacity-80">· {detail}</span>}
    </p>
  );
}
