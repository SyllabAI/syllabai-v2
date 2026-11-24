/**
 * Corpus table normalizer — repair glued / un-parseable GFM tables in
 * SME-derived revision notes (QA 2026-11-24 ticket CP-2, 31 live pages).
 *
 * Research finding: the upstream HTML→markdown conversion occasionally
 * flattens table STRUCTURE into a single line — rows are glued together with
 * `<br>` tags, a header row is appended to the end of a prose/list-item
 * line, or a whole nested table is escaped-pipe-inlined inside one outer
 * cell. GFM tables need one row per line and cannot interrupt a paragraph,
 * so every one of these shapes renders as literal `|---|` text on the page.
 *
 * Shapes handled (all verified against the live corpus):
 *   N1  rows glued by `<br>` at row boundaries (`| a |<br>|---|<br>| b |`)
 *       → real newlines. `<br>` INSIDE cell text (legit formatting) is left
 *         untouched — only row-boundary glue (pipe hugging the `<br>`) splits.
 *   N1' prose glued by `<br>` to a full table block
 *       (`...in the table<br><br>| | | ...`) → break before the first row.
 *   N2  escaped nested table inside one outer cell
 *       (`| \| a \| b \|<br>\|---\|... \|`) → outer wrapper peeled, pipes
 *         unescaped, rows split; emitted as its own table after a blank line.
 *   N3  header row appended to prose/list text (`... below: | H1 | H2 |`)
 *       where the NEXT line is the delimiter row → break before the header.
 *   T   blank line inserted between prose and a row/delimiter line — GFM
 *         tables cannot interrupt a paragraph, so without the blank the rows
 *         lazy-continue the prose and render literally. Inside blockquotes
 *         the blank keeps the `>` prefix.
 *
 * The pass is idempotent and conservative: every rewrite only fires when the
 * broken shape is actually present, so clean tables pass through unchanged.
 */

const BR_RE = /<br\s*\/?>/i;

/** A line whose trimmed content starts with a pipe (or escaped pipe). */
function startsWithPipe(line: string): boolean {
  const t = line.replace(/^[ \t]+/, "");
  return /^\|/.test(t);
}

/** Delimiter row: only dashes/colons/spaces/pipes. */
function isDelimRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  return /^\|?[ \t]*:?-{2,}[ \t:-]*\|/.test(t) && /^[|:\- \t]+$/.test(t);
}

function pipeCount(s: string): number {
  return (s.match(/\|/g) || []).length;
}

/**
 * N1: split a line at `<br>` tags that hug row boundaries on both sides.
 * `| a | b |<br>|---|---|<br>| c | d |` → three lines.
 */
function splitBrRows(line: string): string[] {
  if (!BR_RE.test(line) || !line.includes("|")) return [line];
  const parts: string[] = [];
  let cur = "";
  const chars = Array.from(line);
  let i = 0;
  let splitAny = false;
  while (i < chars.length) {
    const rest = chars.slice(i).join("");
    const m = rest.match(BR_RE);
    if (m && m.index === 0) {
      // look at what hugs this <br>
      const prevNonWs = cur.replace(/[ \t]+$/, "").slice(-1);
      const after = rest.slice(m[0].length);
      const nextNonWs = (after.match(/^[ \t]*([^\s])/) || [])[1] || "";
      if (prevNonWs === "|" && (nextNonWs === "|" || nextNonWs === "\\")) {
        parts.push(cur.replace(/[ \t]+$/, ""));
        cur = "";
        splitAny = true;
        i += m[0].length;
        // skip whitespace after the br — the next row may be indented
        const ws = after.match(/^[ \t]*/)!;
        i += ws[0].length;
        continue;
      }
      cur += m[0];
      i += m[0].length;
      continue;
    }
    cur += chars[i];
    i++;
  }
  parts.push(cur);
  if (!splitAny) return [line];
  // drop parts that became empty through `<br><br>` boundary glue
  return parts.filter((p) => p.trim() !== "");
}

/**
 * N1': line starts with PROSE and carries a `<br>` followed by row-shaped
 * content — break before the first such row segment.
 */
function splitProseBrTable(line: string): string[] | null {
  if (startsWithPipe(line)) return null;
  const t = line.replace(/^[ \t]+/, "");
  if (!BR_RE.test(t) || !t.includes("|")) return null;
  // walk `<br>` occurrences; the first one after which the rest is a
  // row-shaped block splits prose from table
  let rest = t;
  let consumed = 0;
  while (true) {
    const m = rest.match(BR_RE);
    if (!m || m.index === undefined) return null;
    const after = rest.slice(m.index + m[0].length);
    const trimmed = after.replace(/^[ \t]+/, "");
    if (/^\|/.test(trimmed) && pipeCount(trimmed) >= 2) {
      const head = t.slice(0, consumed + m.index);
      if (!head.trim()) return null;
      return [head.replace(/[ \t]+$/, ""), trimmed];
    }
    consumed += m.index + m[0].length;
    rest = after;
  }
}

/**
 * N2b: nested escaped-pipe table inside ANY cell of an outer row —
 * `| a | \| x \| y \|<br>\|---\|... \|` (array-pseudocode, logic-gates,
 * binary-addition: upstream flattened a table-in-a-table-cell into one row,
 * escaping the inner pipes and gluing the inner rows with <br>). GFM cannot
 * nest tables, so the cell is unwrapped: the outer row keeps its other
 * cells (the nested cell shrinks to its prose prefix), and the inner table
 * is re-emitted as a real table right after the outer one ends (buffered,
 * blank-separated). Replaces the first-cell-only N2 rule.
 */

/** Split a row into cells on unescaped pipes. */
function splitCells(line: string): string[] {
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
  return cells;
}

function isRowShaped(s: string): boolean {
  const t = s.trim();
  return /^\|/.test(t) && pipeCount(t) >= 2;
}

/**
 * Unwrap one nested-table cell: split its content at <br>, unescape pipes,
 * classify segments (row-shaped vs prose), drop empties.
 */
function unwrapCellContent(cell: string): string[] {
  const segs: string[] = [];
  for (const raw of cell.split(/<br\s*\/?>/i)) {
    const seg = raw.replace(/\\\|/g, "|").trim();
    if (seg) segs.push(seg);
  }
  return segs;
}

/**
 * N2b transform for one row line. Returns null when the line carries no
 * nested-table cell (fewer than 2 row-shaped segments after the split).
 */
function unwrapNestedCells(line: string): { rebuilt: string | null; group: string[] } | null {
  const cells = splitCells(line);
  let nestedIdx = -1;
  for (let k = 0; k < cells.length; k++) {
    if (cells[k].includes("\\|") && BR_RE.test(cells[k])) {
      nestedIdx = k;
      break;
    }
  }
  if (nestedIdx < 0) return null;
  const segs = unwrapCellContent(cells[nestedIdx]);
  const rowish = segs.filter(isRowShaped);
  if (rowish.length < 2) return null; // not a nested table — leave to other rules

  // rebuilt outer row: nested cell shrinks to its prose prefix (the first
  // non-row-shaped segment, if any)
  const prefix = segs.find((s) => !isRowShaped(s)) ?? "";
  const rebuiltCells = cells.map((c, k) => (k === nestedIdx ? ` ${prefix.trim()} ` : c));
  const rebuilt = rebuiltCells.join("|").trim();
  const hasContent = rebuiltCells.some((c, k) => k !== 0 && k !== rebuiltCells.length - 1 && c.trim() !== "");
  // group lines: blank between prose and table segments (tables cannot
  // interrupt paragraphs), in the segment's original order minus the prefix
  const group: string[] = [];
  let prevRow = false;
  for (const s of segs) {
    if (s === prefix.trim() && group.length === 0 && !isRowShaped(s)) continue;
    const row = isRowShaped(s);
    if (row && !prevRow && group.length && group[group.length - 1].trim() !== "") group.push("");
    group.push(s);
    prevRow = row;
  }
  return { rebuilt: hasContent ? rebuilt : null, group };
}

/** N3: split a prose-glued header row off its line when the delimiter row
 * follows on the next line. */
function splitHeaderGlue(line: string, nextLine: string): [string, string] | null {
  if (startsWithPipe(line) || !isDelimRow(nextLine)) return null;
  const indent = line.match(/^[ \t]*/)?.[0] ?? "";
  const t = line.replace(/^[ \t]+/, "");
  if (!t.includes("|")) return null;
  // candidate header starts at the first pipe whose suffix ends with a pipe
  for (let p = t.indexOf("|"); p >= 0; p = t.indexOf("|", p + 1)) {
    const suffix = t.slice(p);
    if (!/\|[ \t]*$/.test(suffix)) continue; // must end with a pipe
    const head = t.slice(0, p);
    if (!head.trim()) continue; // pure row, not glue
    // keep the original indent — the prose line stays inside its list item
    return [indent + head.replace(/[ \t]+$/, ""), suffix];
  }
  return null;
}

/** Blockquote prefix of a line ('> ', '>', '') for blank-line insertion. */
function quotePrefix(line: string): string {
  const m = line.match(/^[ \t]*((>\s?)+)/);
  return m ? m[1].replace(/\s$/, "") : "";
}

export function normalizeCorpusTables(src: string): string {
  if (!src.includes("|")) return src;
  const lines = src.split("\n");
  const out: string[] = [];
  const nestedBuffer: string[][] = [];
  const flushNested = () => {
    for (const group of nestedBuffer) {
      if (out.length && out[out.length - 1].trim() !== "") out.push("");
      out.push(...group);
    }
    nestedBuffer.length = 0;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";

    // N2b — nested escaped-pipe table inside a cell
    if (/^\s*\|/.test(line)) {
      const unwrapped = unwrapNestedCells(line);
      if (unwrapped) {
        if (unwrapped.rebuilt !== null) out.push(unwrapped.rebuilt);
        nestedBuffer.push(unwrapped.group);
        // the outer table ends when the next line is not one of its rows
        if (!/^\s*\|/.test(next)) flushNested();
        i += 1;
        continue;
      }
    }

    // the outer table also ends at any non-row line — flush pending groups
    if (nestedBuffer.length && !/^\s*\|/.test(line)) {
      flushNested();
    }

    // N1' — prose glued by <br> to a table block
    const proseBr = splitProseBrTable(line);
    if (proseBr) {
      out.push(proseBr[0]);
      out.push(...splitBrRows(proseBr[1]));
      i += 1;
      continue;
    }

    // N3 — header row glued to prose, delimiter on the next line
    const glue = splitHeaderGlue(line, next);
    if (glue) {
      out.push(glue[0]);
      out.push("");
      const rows = splitBrRows(glue[1]);
      out.push(...rows);
      i += 1;
      continue;
    }

    // N1 — <br>-glued rows on one line
    const brSplit = splitBrRows(line);
    if (brSplit.length > 1) {
      out.push(...brSplit);
      i += 1;
      continue;
    }

    // T — blank line so a table block can start (cannot interrupt a paragraph)
    const isRowish = startsWithPipe(line) || isDelimRow(line);
    const prevOut = out.length ? out[out.length - 1] : "";
    if (
      isRowish &&
      prevOut.trim() !== "" &&
      !startsWithPipe(prevOut) &&
      !isDelimRow(prevOut)
    ) {
      const q = quotePrefix(prevOut);
      out.push(q);
    }
    out.push(line);
    i += 1;
  }
  flushNested();
  return out.join("\n");
}
