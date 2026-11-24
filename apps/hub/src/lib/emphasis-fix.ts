/**
 * Corpus emphasis normalizer v2 — bold-marker repair for SME-derived content.
 *
 * Supersedes the 2026-09-19 normalizer (QA 2026-11-24 ticket CP-1: 1,447 live
 * pages still leaked literal `**` with the old pass deployed). The old pass
 * had three structural defects, each confirmed against the corpus:
 *
 *   1. PARAGRAPH SCOPE — it split text only on blank lines, so consecutive
 *      list items formed one "paragraph". Its CommonMark-claim pass then
 *      paired an opener in one bullet with a closer two bullets later
 *      (impossible in CommonMark — every list item is its own block), and the
 *      greedy leftover repair rewrote the span between them, boxing literal
 *      `**` markers inside a bogus <strong>.
 *   2. SINGLE-RUN EARLY RETURN — `if (runs.length < 2) return` meant a lone
 *      stray run was never cleaned (`=$A$1+B2**"`, `10**<sup> -3`,
 *      `****an allele`).
 *   3. ACTIVE HARM — leftover pairing rewrote valid table cells such as
 *      `| **\$** |` into `| \$** |` (visible junk where the raw page was fine).
 *
 * v2 architecture:
 *   - text is split into PARAGRAPH UNITS the way CommonMark delimits them:
 *     a unit is a plain paragraph, one list item (with its lazy continuation
 *     lines), one blockquote (with lazy continuations), one heading, or one
 *     table row — emphasis can never cross these boundaries, so pairing is
 *     simulated on exactly the region CommonMark would pair in;
 *   - inside a unit, math ($…$ / $$…$$) and inline code spans are protected
 *     (runs inside them are excluded from analysis, never rewritten);
 *   - a faithful CommonMark delimiter-stack simulation (flanking rules §6.2,
 *     odd-rule, openers_bottom) decides which runs actually RENDER — only
 *     unrendered runs are repaired, so valid markup is untouched;
 *   - table-row units are processed per CELL (emphasis cannot cross `|`);
 *   - repairs, in priority order: whitespace-flanked leftover pairs are
 *     trimmed with the space re-inserted outside the delimiter (only against
 *     an alphanumeric neighbour), partially-consumed runs shrink to their
 *     rendered length, leftover strays are deleted (never at a unit boundary,
 *     and never when both neighbours are alphanumeric — `2**3` stays);
 *     single `*` runs are never touched (prose multiplication signs);
 *   - the unit is re-simulated to a fixed point (≤3 passes).
 */

// Math/code protection — mirrors the hub's math-fix.ts delimiter rules
// (remark-math parity): escaped dollars (\$) are NOT span openers, so money
// amounts like \$45 000 never shield emphasis runs; the naive "any $ pair"
// rule shielded the opener of `**\$90 000**` and let the stray-deleter eat
// its closer — manufacturing a leak on a page that rendered clean.
const MATH_SPLIT = /(?<![a-zA-Z0-9]\\$)(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)(?<!\$)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
// inline code spans — require non-empty content so a fence's ``` markers
// are never mistaken for an empty `…` span
const CODE_SPLIT = /`[^`\n]+`/g;

type Run = {
  pos: number; // start offset in unit text
  len: number; // delimiter run length
  canOpen: boolean;
  canClose: boolean;
  consumed: number; // delimiters bound by the simulation (rendered)
};

const ALNUM = /[\p{L}\p{N}]/u;

export function normalizeCorpusEmphasis(src: string): string {
  if (!src.includes("**")) return src;
  const lines = src.split("\n");
  const out: string[] = [];
  let unit: string[] = [];
  let inFence = false;
  const flush = () => {
    if (unit.length) {
      out.push(processUnit(unit.join("\n")));
      unit = [];
    }
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      out.push(line);
      continue;
    }
    if (startsBlock(line)) {
      flush();
      unit = [line];
      // table rows are processed alone (emphasis cannot cross cells) —
      // flush() emits the processed row; do NOT push the raw line again
      if (/^\s*\|/.test(line)) {
        flush();
      }
      continue;
    }
    unit.push(line);
  }
  flush();
  return out.join("\n");
}

/** Block-boundary detection — a unit never spans these (except lazily).
 * Indent-agnostic: nested list items live at 4+ spaces in this corpus, and
 * consecutive nested bullets must be separate units (the 2026-09-19 pass
 * mispaired across them at indent 0-3; the same bug recurs at indent 4+). */
function startsBlock(line: string): boolean {
  const t = line.replace(/^[ \t]+/, "");
  if (/^([-*+]|\d{1,9}[.)])\s/.test(t)) return true; // list marker
  if (/^#{1,6}(\s|$)/.test(t)) return true; // ATX heading
  if (/^>/.test(t)) return true; // blockquote
  if (/^\|/.test(t)) return true; // table row
  return false;
  // NOTE: 4-space-indented lines are deliberately NOT treated as indented
  // code — in this corpus they are overwhelmingly nested list items (the
  // old pass processed them too), and true code blocks are fenced.
}

/** Process one paragraph unit (or table-row line, per cell). */
function processUnit(block: string): string {
  if (!block.includes("**")) return block;
  const trimmed = block.replace(/^[ \t]+/, "");
  // blockquote-wrapped table rows (`> | a | b |`) get per-cell repair too —
  // strip the quote prefix before the row check; the split keeps the prefix
  // in the boundary cell, which passes through untouched
  if (/^(>+\s*)*\|/.test(trimmed)) return processTableRow(trimmed);
  return processText(block);
}

/** Split a table row into cells (respecting \| escapes) and repair each. */
function processTableRow(line: string): string {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "\\|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length <= 1) return processText(line);
  // boundary entries (row pipes / blockquote prefix) pass through untouched;
  // repair rules apply only to len ≥ 2 runs inside real cells
  const fixed = cells.map((c, k) => processText(c));
  return fixed.join("|");
}

/** Protected spans (math + inline code) on the unit text. */
function protectedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = new RegExp(`${MATH_SPLIT.source}|${CODE_SPLIT.source}`, "g");
  for (const m of text.matchAll(re)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  return spans;
}

function inProtected(spans: Array<[number, number]>, pos: number): boolean {
  for (const [a, b] of spans) if (pos >= a && pos < b) return true;
  return false;
}

/** CommonMark flanking rules (spec §6.2) for a `*` delimiter run. */
function computeFlanking(text: string, pos: number, end: number) {
  const prev = pos > 0 ? text[pos - 1] : "";
  const next = end < text.length ? text[end] : "";
  const prevWs = prev === "" || /\s/.test(prev);
  const nextWs = next === "" || /\s/.test(next);
  const prevPunct = prev !== "" && !ALNUM.test(prev) && !/\s/.test(prev);
  const nextPunct = next !== "" && !ALNUM.test(next) && !/\s/.test(next);
  const leftFlanking = !nextWs && (!nextPunct || prevWs || prevPunct);
  const rightFlanking = !prevWs && (!prevPunct || nextWs || nextPunct);
  // `*` runs carry no intraword restriction (unlike `_`)
  return { canOpen: leftFlanking, canClose: rightFlanking };
}

/** Collect runs for the simulation — ALL `*` runs including singles.
 * CommonMark pairs single `*` runs with the 2+ runs (`***F= ma**** *is`),
 * so excluding them desynchronises the simulation from the real renderer.
 * Repairs below still only ever touch len ≥ 2 runs. */
function collectRuns(text: string): Run[] {
  const spans = protectedSpans(text);
  const runs: Run[] = [];
  for (const m of text.matchAll(/\*+/g)) {
    const pos = m.index ?? 0;
    const len = m[0].length;
    if (inProtected(spans, pos)) continue;
    const f = computeFlanking(text, pos, pos + len);
    runs.push({ pos, len, canOpen: f.canOpen, canClose: f.canClose, consumed: 0 });
  }
  return runs;
}

/**
 * CommonMark "process emphasis" (spec §6.2) over the run list — sets
 * `consumed` (delimiters bound into emphasis) per run.
 */
function simulate(runs: Run[]): void {
  for (const r of runs) r.consumed = 0;
  const remaining = runs.map((r) => r.len);
  const stack: number[] = []; // run indices that can still open
  // openers_bottom keyed by closer length % 3 (spec: search floor per class)
  const openersBottom: number[] = [-1, -1, -1];
  for (let ci = 0; ci < runs.length; ci++) {
    const closer = runs[ci];
    if (closer.canClose && remaining[ci] > 0) {
      // bind this closer repeatedly while it still has delimiters left.
      // (A single-bind variant was tested: it repairs a few more deep
      // `***…**…***` chains but mis-shrinks valid `***x***` sandwiches —
      // the no-harm gate rejected it. Rebinding keeps valid markup intact.)
      for (;;) {
        let found = -1;
        const bottom = openersBottom[closer.len % 3];
        for (let si = stack.length - 1; si >= 0; si--) {
          const oIdx = stack[si];
          if (bottom >= 0 && oIdx < bottom) break;
          const o = runs[oIdx];
          if (remaining[oIdx] <= 0 || !o.canOpen) continue;
          // odd rule: sum of run lengths must not be a multiple of 3 unless
          // both runs are multiples of 3 (applies when either run can both
          // open and close)
          if (
            (o.canClose || closer.canOpen) &&
            (closer.len % 3 !== 0 || o.len % 3 !== 0) &&
            (closer.len + o.len) % 3 === 0
          ) {
            continue;
          }
          found = si;
          break;
        }
        if (found < 0) {
          openersBottom[closer.len % 3] = ci;
          break;
        }
        const oIdx = stack[found];
        const use = remaining[oIdx] >= 2 && remaining[ci] >= 2 ? 2 : 1;
        remaining[oIdx] -= use;
        remaining[ci] -= use;
        closer.consumed += use;
        runs[oIdx].consumed += use;
        // delimiters above the opener can never close now
        stack.length = found + 1;
        if (remaining[oIdx] === 0) stack.pop();
        if (remaining[ci] === 0) break;
      }
    }
    if (closer.canOpen && remaining[ci] > 0) stack.push(ci);
  }
}

type Edit = { start: number; end: number; text: string };

/** Plan + apply one repair pass; returns the new unit text. */
function repairPass(text: string, runs: Run[]): { out: string; edits: number } {
  simulate(runs);
  const edits: Edit[] = [];

  // leftover runs — unrendered (or partially rendered) candidates
  const leftovers = runs.filter((r) => r.consumed < r.len);

  // E1 — whitespace-flanked leftover pairs: trim, re-insert space outside.
  // A pair whose span still contains other runs is bogus (the real pairs are
  // the inner ones) — advance by one so the survivors can pair with their
  // actual neighbours, and leave the skipped run to E5. Single `*` runs are
  // never rewritten (prose multiplication signs, list artifacts).
  const pairable = leftovers.filter((r) => r.consumed === 0 && r.len >= 2);
  const paired = new Set<number>();
  for (let k = 0; k + 1 < pairable.length; ) {
    const a = pairable[k];
    const b = pairable[k + 1];
    const inner = text.slice(a.pos + a.len, b.pos);
    // no other runs inside the span
    if (runs.some((r) => r !== a && r !== b && r.pos > a.pos && r.pos < b.pos)) {
      k += 1;
      continue;
    }
    const core = inner.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
    if (!core) {
      // whitespace-only pair (`** **`) → single space
      edits.push({ start: a.pos, end: b.pos + b.len, text: " " });
      paired.add(a.pos);
      paired.add(b.pos);
      k += 2;
      continue;
    }
    // move the trimmed edge whitespace OUTSIDE the delimiters so nothing
    // glues together (`**W **and` → `**W** and`, `$s$** seconds)**` →
    // `$s$ **seconds)**`). Insert only against a non-whitespace neighbour —
    // a whitespace neighbour already separates the words.
    const prevCh = a.pos > 0 ? text[a.pos - 1] : "";
    const nextCh = b.pos + b.len < text.length ? text[b.pos + b.len] : "";
    const pre = prevCh !== "" && !/\s/.test(prevCh) ? " " : "";
    const post = nextCh !== "" && !/\s/.test(nextCh) ? " " : "";
    edits.push({
      start: a.pos,
      end: b.pos + b.len,
      text: `${pre}**${core}**${post}`,
    });
    paired.add(a.pos);
    paired.add(b.pos);
    k += 2;
  }

  // E4 — partially consumed runs: shrink to the rendered length
  for (const r of leftovers) {
    if (r.consumed === 0 || r.consumed >= r.len) continue;
    if (edits.some((e) => e.start <= r.pos && e.end >= r.pos + r.len)) continue;
    edits.push({
      start: r.pos,
      end: r.pos + r.len,
      text: "*".repeat(r.consumed),
    });
  }

  // E5 — fully unrendered strays: delete unless both neighbours are alnum
  // (2**3 exponents stay). Unit boundaries are always hard boundaries in
  // this architecture (units are complete CommonMark paragraph units), so
  // no pair can continue past them.
  for (const r of leftovers) {
    if (r.len < 2) continue; // single * runs — prose content, never touched
    if (r.consumed !== 0 || paired.has(r.pos)) continue;
    if (edits.some((e) => e.start <= r.pos && e.end >= r.pos + r.len)) continue;
    const prev = r.pos > 0 ? text[r.pos - 1] : "";
    const next = r.pos + r.len < text.length ? text[r.pos + r.len] : "";
    if (/\d/.test(prev) && /\d/.test(next)) continue; // 2**3 — content
    // letter/digit-mixed flanks are authoring junk (`6**x`, `i**ncome`,
    // `5**b`) — the stars never rendered and carry no exponent meaning
    edits.push({ start: r.pos, end: r.pos + r.len, text: "" });
  }

  if (edits.length === 0) return { out: text, edits: 0 };
  edits.sort((x, y) => x.start - y.start);
  let out = "";
  let pos = 0;
  for (const e of edits) {
    if (e.start < pos) continue; // overlap guard
    out += text.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  out += text.slice(pos);
  return { out, edits: edits.length };
}

function processText(block: string): string {
  let text = block;
  for (let pass = 0; pass < 3; pass++) {
    const runs = collectRuns(text);
    if (runs.length === 0) return text;
    const next = repairPass(text, runs);
    if (next.edits === 0) return text;
    text = next.out;
  }
  return text;
}
