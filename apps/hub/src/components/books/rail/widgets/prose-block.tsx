"use client";

/** T-BOOK-004 — prose: short authored framing (≤120 words, the G2 law —
 *  never a reflowed duplicate of book prose). */
import type { RailBlock } from "@/lib/books-rail";

export function ProseBlock({ block }: { block: RailBlock }) {
  const text = typeof block.content.text === "string" ? block.content.text : null;
  if (!text) return null;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm leading-relaxed" data-ord={block.ord}>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
