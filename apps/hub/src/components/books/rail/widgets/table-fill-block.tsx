"use client";

/**
 * T-BOOK-004 — table-fill: fill-in tables (chem: test → observation → ion).
 * Per-cell check vs the authored accept list (ms_accepts law via
 * matchesAny). Cells render hints only AFTER check (the honest reveal).
 * Self-check only — no attempts.
 */
import { useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { CheckResetButtons, VerdictChip, WidgetCard, type Verdict } from "../check-shared";
import { matchesAny } from "@/lib/books-chem";

interface FillCell {
  /** accepted answers — ≥1 (an authored cell with no answer is a pack defect) */
  accepts: string[];
  hint?: string;
}
interface FillRow {
  label?: string;
  cells: FillCell[];
}

export function TableFillBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const columns = Array.isArray(c.columns) ? (c.columns as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const rows = Array.isArray(c.rows)
    ? (c.rows as unknown[])
        .filter((r): r is FillRow => typeof r === "object" && r != null && Array.isArray((r as FillRow).cells))
        .map((r) => ({
          label: typeof r.label === "string" ? r.label : undefined,
          cells: (r.cells as unknown[]).map((cell) => {
            const cc = cell as Partial<FillCell>;
            return {
              accepts: Array.isArray(cc.accepts) ? (cc.accepts as string[]).filter((a): a is string => typeof a === "string") : [],
              hint: typeof cc.hint === "string" ? cc.hint : undefined,
            };
          }),
        }))
    : [];
  const prompt = typeof c.prompt === "string" ? c.prompt : null;

  const [inputs, setInputs] = useState<string[][]>(() => rows.map((r) => r.cells.map(() => "")));
  const [checked, setChecked] = useState<boolean[][]>(() => rows.map((r) => r.cells.map(() => false)));
  const [verdict, setVerdict] = useState<Verdict>("unchecked");
  const [detail, setDetail] = useState<string | null>(null);

  if (columns.length === 0 || rows.length === 0) return null;
  if (rows.some((r) => r.cells.some((cell) => cell.accepts.length === 0))) return null; // uncheckable cell — pack defect, honest-empty

  const setCell = (ri: number, ci: number, v: string) => {
    setInputs((m) => m.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? v : x)) : row)));
    setChecked((m) => m.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? false : x)) : row)));
    setVerdict("unchecked");
    setDetail(null);
  };

  const check = () => {
    const total = rows.reduce((acc, r) => acc + r.cells.length, 0);
    let right = 0;
    const nextChecked = rows.map((r, ri) => r.cells.map((cell, ci) => {
      const ok = matchesAny(inputs[ri]?.[ci] ?? "", cell.accepts);
      if (ok) right += 1;
      return ok;
    }));
    setChecked(nextChecked);
    setVerdict(right === total ? "correct" : right === 0 ? "wrong" : "partial");
    setDetail(right === total ? null : `${right}/${total} cells correct`);
  };

  const reset = () => {
    setInputs(rows.map((r) => r.cells.map(() => "")));
    setChecked(rows.map((r) => r.cells.map(() => false)));
    setVerdict("unchecked");
    setDetail(null);
  };

  const inputCls = (ri: number, ci: number) =>
    `w-full rounded-md border bg-background px-2 py-1 text-[13px] ${
      checked[ri]?.[ci]
        ? matchesAny(inputs[ri]?.[ci] ?? "", rows[ri]!.cells[ci]!.accepts)
          ? "border-emerald-400 dark:border-emerald-700"
          : "border-rose-400 dark:border-rose-700"
        : "border-border"
    }`;

  return (
    <WidgetCard ord={block.ord} typeLabel="Fill the table" prompt={prompt}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="border-b px-2 py-1 text-left font-medium text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.label != null && (
                  <td className="border-b px-2 py-1 align-middle font-medium">{row.label}</td>
                )}
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="border-b px-1 py-1">
                    <input
                      className={inputCls(ri, ci)}
                      value={inputs[ri]?.[ci] ?? ""}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      aria-label={`${columns[ci] ?? `column ${ci + 1}`}${row.label ? `, ${row.label}` : ""}`}
                      aria-invalid={checked[ri]?.[ci] === true && !matchesAny(inputs[ri]?.[ci] ?? "", cell.accepts)}
                    />
                    {checked[ri]?.[ci] && cell.hint && !matchesAny(inputs[ri]?.[ci] ?? "", cell.accepts) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.hint}</p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CheckResetButtons onCheck={check} onReset={reset} />
      <div className="mt-1.5">
        <VerdictChip verdict={verdict} detail={detail} />
      </div>
    </WidgetCard>
  );
}
