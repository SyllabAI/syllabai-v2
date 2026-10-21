"use client";

/** T-BOOK-004 — callout: the examiner-language note (PACK-SPEC: the
 *  flagship type — mark-scheme vocabulary, accept/avoid phrasing). */
import type { RailBlock } from "@/lib/books-rail";

import { GlossaryText, useChapterGlossary } from "../glossary-chips";

export function CalloutBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const body = typeof c.body === "string" ? c.body : null;
  const bySlug = useChapterGlossary();
  if (!body) return null;
  const label = typeof c.label === "string" ? c.label : "Examiner note";
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed dark:border-amber-900 dark:bg-amber-950/40"
      data-ord={block.ord}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        {label}
      </p>
      <p className="whitespace-pre-line">
        <GlossaryText text={body} bySlug={bySlug} />
      </p>
    </div>
  );
}
