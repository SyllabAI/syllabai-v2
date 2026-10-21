"use client";

/** T-BOOK-004 — prose: short authored framing (≤120 words, the G2 law —
 *  never a reflowed duplicate of book prose). */
import type { RailBlock } from "@/lib/books-rail";

import { GlossaryText, useChapterGlossary } from "../glossary-chips";

export function ProseBlock({ block }: { block: RailBlock }) {
  const text = typeof block.content.text === "string" ? block.content.text : null;
  const bySlug = useChapterGlossary();
  if (!text) return null;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm leading-relaxed" data-ord={block.ord}>
      <p className="whitespace-pre-line">
        {/* authored `[[slug|term]]` tokens render inline popover cards */}
        {text.split(/\n{2,}/).map((para, i) => (
          <span key={i} className="block">
            <GlossaryText text={para} bySlug={bySlug} />
          </span>
        ))}
      </p>
    </div>
  );
}
