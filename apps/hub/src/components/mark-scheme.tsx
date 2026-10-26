"use client";

/**
 * MarkScheme — SME-style rendering of an official mark-scheme block.
 *
 * Style reference: SaveMyExams Edexcel IGCSE Maths A exam questions
 * (research 2026-10-27). SME never shows raw marking jargon: each working
 * line carries its mark code as a right-aligned chip ([M1], [A1], [B1]),
 * abbreviations are expanded in plain English, and a legend line decodes
 * the codes for students who want the official vocabulary.
 *
 * Contract:
 *   - lines ending in mark codes (M1/A1/B1/B2/…/SC1/FT) get those codes
 *     stripped from the text and rendered as right-aligned chips;
 *   - oe / ft / cao / isw / awrt / soi are expanded inline in italics
 *     (verbatim token kept in a title tooltip for the official wording);
 *   - the remaining text renders through the standard Markdown pipeline
 *     (math, emphasis intact).
 */
import { Markdown } from "@/components/markdown";

const CODE_RE = /\b((?:SC|M|A|B|C|F)\d?)\b(?=[\s.,;)]|$)/g;
const TAIL_CODES_RE = /(?:\s+(?:SC\d?|M\d|A\d|B\d|C\d|FT))+\s*$/;
const LEAD_CODES_RE = /^(?:SC\d?|M\d|A\d|B\d|C\d|FT)(?:\s+(?:SC\d?|M\d|A\d|B\d|C\d|FT))*\s+/;

const ABBREV: Record<string, string> = {
  oe: "or equivalent",
  ft: "follow through",
  cao: "correct answer only",
  isw: "ignore subsequent working",
  awrt: "accept answers that round to",
  soi: "seen or implied",
};
function expandAbbrevs(md: string): string {
  return md.replace(/\b(oe|ft|cao|isw|awrt|soi)\b/g, (_m, ab: string) => `*(${ABBREV[ab]})*`);
}

export type MsSegment =
  | { kind: "md"; text: string }
  | { kind: "codes"; codes: string[] };

export function parseMarkScheme(md: string): MsSegment[] {
  const segments: MsSegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.some((l) => l.trim().length > 0)) segments.push({ kind: "md", text: buf.join("\n") });
    buf = [];
  };
  for (const line of md.split("\n")) {
    // a line that is ONLY mark codes ("M1", "A1 cao" rows collapse to chips)
    const bare = line.trim();
    if (/^(?:(?:SC\d?|M\d|A\d|B\d|C\d|FT)(?:\s+(?:oe|ft|cao|isw|awrt|soi|for\b.*)?)*)$/i.test(bare) &&
        /^(?:SC\d?|M\d|A\d|B\d|C\d|FT)/i.test(bare)) {
      flush();
      segments.push({ kind: "codes", codes: bare.split(/\s+/) });
      continue;
    }
    const tail = line.match(TAIL_CODES_RE);
    if (tail && line.slice(0, tail.index).trim().length > 0) {
      flush();
      segments.push({ kind: "md", text: line.slice(0, tail.index).trimEnd() });
      segments.push({ kind: "codes", codes: tail[0].trim().split(/\s+/) });
      continue;
    }
    buf.push(line);
  }
  flush();
  return segments;
}

export function MarkScheme({ md, className }: { md: string; className?: string }) {
  const segments = parseMarkScheme(md);
  return (
    <div className={className}>
      {segments.map((s, i) =>
        s.kind === "md" ? (
          <Markdown key={i}>{expandAbbrevs(s.text)}</Markdown>
        ) : (
          <p key={i} className="flex flex-wrap justify-end gap-1">
            {s.codes.map((c, j) => (
              <span
                key={j}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-primary"
                title={`mark code ${c}`}
              >
                {c}
              </span>
            ))}
          </p>
        ),
      )}
      <p className="mt-2 border-t pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        M = method mark · A = accuracy mark · B = independent mark · SC = special case ·{" "}
        <i>or equivalent</i> / <i>follow through</i> / <i>correct answer only</i> are written out
        in full where the scheme uses them.
      </p>
    </div>
  );
}

export function hasMarkCodes(md: string): boolean {
  return /\b(?:SC\d?|M\d|A\d|B\d|C\d|FT)\b/.test(md);
}
