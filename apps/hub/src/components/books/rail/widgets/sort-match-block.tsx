"use client";

/**
 * T-BOOK-004 — sort-match: ordering OR pairing, keyboard-first (the a11y
 * law — move up/down buttons and select-then-place, no drag-only path).
 *
 * Two modes by authored payload:
 *  - ORDER (targets absent): arrange items; check vs correctOrder (ids).
 *  - MATCH (targets present): assign each item a target; check vs solution.
 * Self-check only — no attempts (the bank law).
 */
import { useMemo, useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { CheckResetButtons, LiveHint, VerdictChip, WidgetCard, type Verdict } from "../check-shared";

interface SortItem {
  id: string;
  text: string;
}
interface SortTarget {
  id: string;
  text: string;
}

export function SortMatchBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const rawItems = Array.isArray(c.items) ? c.items : [];
  const items: SortItem[] = rawItems
    .filter((i): i is SortItem => typeof i === "object" && i != null && typeof (i as SortItem).id === "string" && typeof (i as SortItem).text === "string")
    .map((i) => ({ id: i.id, text: i.text }));
  const rawTargets = Array.isArray(c.targets) ? c.targets : [];
  const targets: SortTarget[] = rawTargets
    .filter((t): t is SortTarget => typeof t === "object" && t != null && typeof (t as SortTarget).id === "string" && typeof (t as SortTarget).text === "string")
    .map((t) => ({ id: t.id, text: t.text }));
  const isMatch = targets.length > 0;
  const correctOrder = Array.isArray(c.correctOrder) ? (c.correctOrder as string[]) : null;
  const solution = typeof c.solution === "object" && c.solution != null ? (c.solution as Record<string, string>) : null;
  const prompt = typeof c.prompt === "string" ? c.prompt : null;

  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict>("unchecked");
  const [detail, setDetail] = useState<string | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const targetById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  if (items.length < 2 || (isMatch && solution == null) || (!isMatch && correctOrder == null)) {
    return null; // an uncheckable assembly never ships (honest-empty law)
  }

  const move = (idx: number, dir: -1 | 1) => {
    setOrder((o) => {
      const next = [...o];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return o;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
    setVerdict("unchecked");
  };

  const check = () => {
    if (isMatch) {
      const wrong = items.filter((i) => assign[i.id] !== solution![i.id]).length;
      setVerdict(wrong === 0 ? "correct" : wrong === items.length ? "wrong" : "partial");
      setDetail(wrong === 0 ? null : `${items.length - wrong}/${items.length} matched`);
    } else {
      const wrong = order.filter((id, i) => correctOrder![i] !== id).length;
      setVerdict(wrong === 0 ? "correct" : "wrong");
      setDetail(wrong === 0 ? null : "order differs from the mark-scheme order");
    }
  };

  const reset = () => {
    setOrder(items.map((i) => i.id));
    setAssign({});
    setSelectedItem(null);
    setVerdict("unchecked");
    setDetail(null);
  };

  return (
    <WidgetCard ord={block.ord} typeLabel={isMatch ? "Sort & match" : "Put in order"} prompt={prompt}>
      <LiveHint text={selectedItem ? `Selected ${byId.get(selectedItem)?.text ?? ""}` : ""} />
      {isMatch ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedItem(item.id === selectedItem ? null : item.id)}
                className={`rounded-md border px-2 py-1 text-left text-[13px] ${
                  selectedItem === item.id ? "border-primary bg-primary/10" : "border-border bg-background"
                }`}
                aria-pressed={selectedItem === item.id}
              >
                {item.text}
              </button>
              <span aria-hidden className="text-muted-foreground">→</span>
              <span
                role="status"
                className={`rounded-md border px-2 py-1 text-[13px] ${
                  assign[item.id] ? "border-border bg-muted/60" : "border-dashed border-muted-foreground/40 text-muted-foreground"
                }`}
              >
                {assign[item.id] ? targetById.get(assign[item.id])?.text ?? "?" : "choose a match"}
              </span>
            </div>
          ))}
          {selectedItem != null && (
            <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Match targets">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-md border border-dashed px-2 py-1 text-[13px] hover:bg-muted"
                  onClick={() => {
                    if (selectedItem != null) {
                      setAssign((a) => ({ ...a, [selectedItem]: t.id }));
                      setSelectedItem(null);
                      setVerdict("unchecked");
                    }
                  }}
                >
                  {t.text}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ol className="space-y-1.5" aria-label="Items in order">
          {order.map((id, idx) => (
            <li key={id} className="flex items-center gap-1.5">
              <span className="w-5 text-center text-xs text-muted-foreground">{idx + 1}</span>
              <span className="flex-1 rounded-md border px-2 py-1 text-[13px]">{byId.get(id)?.text}</span>
              <button
                type="button"
                className="rounded border px-1.5 text-xs"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label={`Move ${byId.get(id)?.text ?? "item"} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded border px-1.5 text-xs"
                onClick={() => move(idx, 1)}
                disabled={idx === order.length - 1}
                aria-label={`Move ${byId.get(id)?.text ?? "item"} down`}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      )}
      <CheckResetButtons onCheck={check} onReset={reset} />
      <div className="mt-1.5">
        <VerdictChip verdict={verdict} detail={detail} />
      </div>
    </WidgetCard>
  );
}
