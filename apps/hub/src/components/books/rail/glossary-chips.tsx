"use client";

/**
 * T-BOOK-007 — the glossary layer UI: inline popover cards + the Key-terms
 * strip. TWO render paths, one resolution surface (fetchBookGlossary):
 *  1. INLINE: authored `[[slug|display]]` tokens inside prose/callout text
 *     render as dotted-underline triggers opening the Popover card
 *     (definition + ms_accepts/ms_avoids — the mark-scheme language layer
 *     IS the value, so the card leads with it).
 *  2. STRIP: the chapter's block glossaryRefs render as chips after the
 *     stream header (the card is the same).
 * Slug law: every rendered slug resolved through the subject glossary; an
 * unresolved slug renders PLAIN TEXT (never a dead popover) — honest-absent.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { BookGlossaryTerm } from "@syllabai/contracts";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The resolved glossary map of the chapter (provider = the rail shell). */
export const GlossaryContext = createContext<Map<string, BookGlossaryTerm>>(new Map());
export const useChapterGlossary = () => useContext(GlossaryContext);

/** Parse `[[slug|display]]` tokens into segments. Unbalanced/unknown forms
 *  pass through verbatim — authored text is never swallowed by a lint slip. */
export function parseGlossaryTokens(
  text: string,
): Array<{ kind: "text" | "term"; value: string; slug?: string }> {
  const out: Array<{ kind: "text" | "term"; value: string; slug?: string }> = [];
  const re = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
    out.push({ kind: "term", value: m[2]!, slug: m[1]! });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** The popover card of record — definition first, mark-scheme language second. */
export function GlossaryCard({ term }: { term: BookGlossaryTerm }) {
  return (
    <div className="max-w-72 space-y-1.5 text-sm">
      <p className="font-semibold leading-snug">{term.term}</p>
      <p className="leading-relaxed text-muted-foreground">{term.definition}</p>
      {term.msAccepts.length > 0 && (
        <p className="text-[13px] leading-snug">
          <span className="font-medium text-emerald-700 dark:text-emerald-300">Examiners accept: </span>
          {term.msAccepts.join("; ")}
        </p>
      )}
      {term.msAvoids.length > 0 && (
        <p className="text-[13px] leading-snug">
          <span className="font-medium text-rose-700 dark:text-rose-300">Avoid: </span>
          {term.msAvoids.join("; ")}
        </p>
      )}
    </div>
  );
}

/** Inline trigger — dotted underline, aria pattern popover. */
export function GlossaryTrigger({
  display,
  term,
}: {
  display: string;
  term: BookGlossaryTerm | null;
}) {
  if (term == null) return <>{display}</>; // unresolved slug: plain text, never a dead trigger
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-help border-b border-dashed border-primary/60 font-medium"
          aria-label={`Glossary: ${term.term}`}
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" role="dialog" aria-label={`Glossary definition: ${term.term}`}>
        <GlossaryCard term={term} />
      </PopoverContent>
    </Popover>
  );
}

/** Render authored text with inline glossary tokens. */
export function GlossaryText({
  text,
  bySlug,
}: {
  text: string;
  bySlug: Map<string, BookGlossaryTerm>;
}): ReactNode[] {
  return parseGlossaryTokens(text).map((seg, i) =>
    seg.kind === "text" ? (
      <span key={i}>{seg.value}</span>
    ) : (
      <GlossaryTrigger key={i} display={seg.value} term={bySlug.get(seg.slug!) ?? null} />
    ),
  );
}

/** The Key-terms strip (the chapter's block glossaryRefs, chips + popovers). */
export function GlossaryStrip({ terms }: { terms: BookGlossaryTerm[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useMemo(() => [...terms].sort((a, b) => a.term.localeCompare(b.term)), [terms]);
  if (sorted.length === 0) return null;
  return (
    <div className="rounded-lg border bg-muted/40 p-2.5">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Key terms
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((t) => (
          <Popover key={t.slug} open={open === t.slug} onOpenChange={(o) => setOpen(o ? t.slug : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-full border bg-background px-2 py-0.5 text-[12px] hover:border-primary"
                onClick={() => setOpen(open === t.slug ? null : t.slug)}
                aria-expanded={open === t.slug}
              >
                {t.term}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80" role="dialog" aria-label={`Glossary definition: ${t.term}`}>
              <GlossaryCard term={t} />
            </PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  );
}
