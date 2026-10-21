"use client";

/**
 * T-BOOK-004/005 — drag-label (the chemistry label-pack carrier: dot-and-
 * cross diagrams, apparatus). Pointer- AND keyboard-first: tap a label to
 * select, tap (or Enter) a slot to place — no drag-only path (a11y law).
 * Slots check against the authored answer (+ alternates, ms_accepts law).
 * Self-check only — no attempts.
 */
import { useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { CheckResetButtons, LiveHint, VerdictChip, WidgetCard, type Verdict } from "../check-shared";
import { matchesAny } from "@/lib/books-chem";

interface LabelSlot {
  id: string;
  answer: string;
  /** accepted alternates (mark-scheme language layer) */
  alt?: string[];
}

export function DragLabelBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const labels = Array.isArray(c.labels) ? (c.labels as unknown[]).filter((l): l is string => typeof l === "string" && l.trim() !== "") : [];
  const slots = Array.isArray(c.slots)
    ? (c.slots as unknown[])
        .filter((s): s is LabelSlot => typeof s === "object" && s != null && typeof (s as LabelSlot).id === "string" && typeof (s as LabelSlot).answer === "string")
        .map((s) => ({ id: s.id, answer: s.answer, alt: Array.isArray(s.alt) ? (s.alt as string[]).filter((a): a is string => typeof a === "string") : undefined }))
    : [];
  const prompt = typeof c.prompt === "string" ? c.prompt : null;
  const hotspotPage = typeof c.hotspotPage === "number" ? c.hotspotPage : null;
  const diagramCaption = typeof c.diagramCaption === "string" ? c.diagramCaption : null;

  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict>("unchecked");
  const [detail, setDetail] = useState<string | null>(null);

  if (labels.length === 0 || slots.length === 0) return null; // unbuildable never ships

  const usedLabels = new Set(Object.values(placement));

  const place = (slotId: string) => {
    if (selected == null) return;
    setPlacement((p) => ({ ...p, [slotId]: selected }));
    setSelected(null);
    setVerdict("unchecked");
    setDetail(null);
  };

  const check = () => {
    const wrong = slots.filter((s) => {
      const got = placement[s.id];
      if (got == null) return true;
      return !matchesAny(got, [s.answer, ...(s.alt ?? [])]);
    }).length;
    setVerdict(wrong === 0 ? "correct" : wrong === slots.length ? "wrong" : "partial");
    setDetail(wrong === 0 ? null : `${slots.length - wrong}/${slots.length} labelled correctly`);
  };

  const reset = () => {
    setPlacement({});
    setSelected(null);
    setVerdict("unchecked");
    setDetail(null);
  };

  return (
    <WidgetCard ord={block.ord} typeLabel="Label the diagram" prompt={prompt} accent>
      <LiveHint text={selected ? `Selected label: ${selected}` : ""} />
      {diagramCaption && (
        <p className="mb-2 rounded-md border bg-muted/50 px-2 py-1.5 text-[13px] text-muted-foreground">
          {diagramCaption}
          {hotspotPage != null ? ` · book p.${hotspotPage}` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Labels to place">
        {labels
          .filter((l) => !usedLabels.has(l))
          .map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setSelected(l === selected ? null : l)}
              aria-pressed={selected === l}
              className={`rounded-md border px-2 py-1 text-[13px] ${
                selected === l ? "border-primary bg-primary/10" : "border-border bg-background"
              }`}
            >
              {l}
            </button>
          ))}
      </div>
      <div className="mt-2 space-y-1.5" role="group" aria-label="Label slots">
        {slots.map((s) => {
          const got = placement[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => place(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  place(s.id);
                }
              }}
              className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[13px] ${
                got ? "border-border bg-muted/60" : "border-dashed border-muted-foreground/40 text-muted-foreground"
              } ${selected != null ? "hover:border-primary" : ""}`}
              disabled={selected == null}
              aria-label={got ? `Slot ${s.id}: ${got}` : `Empty slot ${s.id}${selected ? ` — press to place ${selected}` : ""}`}
            >
              <span className="text-muted-foreground/70">{s.id}</span>
              <span>{got ?? "drop label here"}</span>
            </button>
          );
        })}
      </div>
      <CheckResetButtons onCheck={check} onReset={reset} />
      <div className="mt-1.5">
        <VerdictChip verdict={verdict} detail={detail} />
      </div>
    </WidgetCard>
  );
}
