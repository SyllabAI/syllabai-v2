/**
 * Specification-statement structure parser (presentation layer).
 *
 * The imported curriculum bundles carry each statement as ONE string. Two
 * flattening steps put printed list structure into that string:
 *
 *   1. build_official_spines.py inlined the parse's structured `sub_items`
 *      after the lead-in with the of-record join law
 *          text (+':') + ' • ' + sub_items.join(' • ')
 *      (meta.subItemRecovery, verified byte-equal to the T-KG-10 chemistry
 *      definitive merge). The inverse is therefore EXACT: split on ' • '.
 *      Census over all 106 curricula: 1,411 titles match the join output
 *      byte-exactly; every ' • ' occurrence is either such a boundary, a
 *      source-inline list, or source-parse noise (no title starts with '•',
 *      and the 12 hydrate-interpunct cases 'CuSO •5H O' lack the right-hand
 *      space so the separator regex cannot touch them).
 *
 *   2. Printed sub-parts — '(i) … (ii) …', '(a) … (b) …', '(1) … (2) …' —
 *      survived extraction inline inside one string (251 segments corpus-wide).
 *      These are split on marker boundaries only: a marker qualifies at a
 *      clause boundary (segment start, or after '.;:?!' or a closing bracket),
 *      its successor text must begin with a word character (kills ranges like
 *      '2.4.1(a)–(d)' and enumerations like '28.4.1(a) and 28.4.1(b)'), symbol
 *      definitions like 'pico (p), nano (n)' are excluded (lowercase only,
 *      comma following), and a mid-clause marker is accepted only as the
 *      ascending continuation of an already-accepted marker (the '(ii) …
 *      (iii) … (iv)' chain), which code cross-references cannot fake.
 *
 * The corpus stays spine-verbatim: nothing here rewrites wording — every
 * returned line is a verbatim slice of the normalized input. Rendering that
 * wants the recovered structure draws lead + bullets from this VM; a null
 * `items` array means "no structure recovered, render the text as-is".
 */

import { normalizeSpecText } from "@/lib/spec-text";

export interface SpecStatementVM {
  /** normalized statement text (the render fallback / aria label) */
  text: string;
  /** lead-in before the first bullet (null when no bullet structure) */
  lead: string | null;
  /** one entry per bullet; each bullet = 1..n verbatim part-lines */
  items: string[][] | null;
}

/** ' • ' — the exact join separator of the of-record subItemRecovery law. */
const BULLET_SEP = " \u2022 ";
/** printed sub-part markers: (a)…(z), (1)…(99), (i)…(xii) — lowercase only */
const MARKER = /\((?:[a-z]|\d{1,2}|xi{1,2}|x|i{1,3}|iv|v|vi{1,3}|ix)\)/g;

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12,
};
function romanOf(n: number): string | null {
  for (const [k, v] of Object.entries(ROMAN)) if (v === n) return k;
  return null;
}

/**
 * Possible successor labels of a printed marker. Single letters are ambiguous
 * ('i' can be the letter list …h, i, j… OR the roman chain i, ii, iii…), so a
 * single-letter label yields BOTH continuations; multi-char roman labels and
 * digit labels are unambiguous. The chain rule accepts a successor hit.
 */
function nextLabels(label: string): Set<string> {
  const out = new Set<string>();
  if (/^\d+$/.test(label)) {
    const n = parseInt(label, 10) + 1;
    if (n <= 99) out.add(String(n));
    return out;
  }
  if (/^[a-z]$/.test(label) && !ROMAN[label]) {
    if (label !== "z") out.add(String.fromCharCode(label.charCodeAt(0) + 1));
    return out;
  }
  const v = ROMAN[label];
  if (v) {
    const r = romanOf(v + 1);
    if (r) out.add(r);
  }
  if (/^[a-z]$/.test(label) && label !== "z") {
    out.add(String.fromCharCode(label.charCodeAt(0) + 1));
  }
  return out;
}

interface MarkerHit {
  start: number;
  end: number;
  label: string;
}

/**
 * Split one segment at printed sub-part markers. Returns the verbatim lines,
 * or null when no qualifying marker structure exists (segment unchanged).
 */
function splitParts(segment: string): string[] | null {
  MARKER.lastIndex = 0;
  const hits: MarkerHit[] = [];
  for (let m = MARKER.exec(segment); m; m = MARKER.exec(segment)) {
    hits.push({ start: m.index, end: m.index + m[0].length, label: m[0].slice(1, -1) });
  }
  if (hits.length < 2) return null;

  const accepted: MarkerHit[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const pre = segment.slice(0, h.start);
    const post = segment.slice(h.end);
    // successor text must begin with a word character — kills '(a)–(d)',
    // '(a)', '(a), …' ranges/enumerations and end-of-clause references
    if (!/^\s*[A-Za-z0-9]/.test(post)) continue;
    // clause boundary: segment start, or space preceded by '.;:?!' / ')' / ']'
    const boundary =
      pre === "" ||
      (/ $/.test(pre) && /(?:[.;:?!)\]]|^)$/.test(pre.trimEnd()));
    // ascending continuation of the previous accepted marker — the '(ii) …
    // (iii) … (iv)' chain; cross-references cannot produce ascending runs
    // because their predecessor never qualifies (post/boundary rules reject
    // it first, and a chain cannot start from a rejected marker)
    const prev = accepted[accepted.length - 1];
    const chain =
      prev !== undefined && nextLabels(prev.label).has(h.label);
    if (boundary || chain) {
      accepted.push(h);
    }
  }
  if (accepted.length < 2) return null;

  const lines: string[] = [];
  const first = accepted[0];
  const head = segment.slice(0, first.start).trim();
  if (head) lines.push(head);
  for (let i = 0; i < accepted.length; i++) {
    const from = accepted[i].start;
    const to = i + 1 < accepted.length ? accepted[i + 1].start : segment.length;
    const line = segment.slice(from, to).trim();
    if (line) lines.push(line);
  }
  return lines.length >= 2 ? lines : null;
}

/** strip stray bullet decoration from a split fragment (never wording) */
function cleanPart(p: string): string {
  return p
    .trim()
    .replace(/^\u2022\s*/, "")
    .replace(/\s*\u2022$/, "")
    .trim();
}

/** Parse one statement string into the render VM. Never invents wording. */
export function parseSpecStatement(raw: string): SpecStatementVM {
  const text = normalizeSpecText(raw);
  if (!text) return { text, lead: null, items: null };
  if (!text.includes(BULLET_SEP)) {
    // still recover inline part structure ('(i) … (ii) …' without bullets):
    // a non-marker head line becomes the lead, marker lines become items
    const parts = splitParts(text);
    if (!parts) return { text, lead: null, items: null };
    if (parts[0] && !/^\(/.test(parts[0])) {
      return { text, lead: parts[0], items: parts.slice(1).map((l) => [l]) };
    }
    return { text, lead: null, items: parts.map((l) => [l]) };
  }

  const rawParts = text.split(BULLET_SEP).map(cleanPart);
  // a leading bullet (source noise, e.g. '• polygons • • nets …' — note
  // normalizeSpecText already trimmed the separator's leading space) means
  // EVERY fragment is an item — the first fragment is not a lead
  const startsWithBullet = /^\u2022(?:\s|$)/.test(text);
  const parts = rawParts.filter((p) => p.length > 0);
  if (parts.length === 0) return { text, lead: null, items: null };

  if (startsWithBullet) {
    return { text, lead: null, items: parts.map((p) => splitParts(p) ?? [p]) };
  }

  const lead = parts[0];
  const rest = parts.slice(1);
  const items: string[][] = [];
  // the lead itself may carry inline part structure before the first bullet
  const leadParts = splitParts(lead);
  let leadOut: string | null = lead;
  if (leadParts) {
    // keep the lead sentence (everything before its first marker) as the lead
    leadOut = leadParts[0];
    for (const extra of leadParts.slice(1)) items.push([extra]);
  }
  for (const p of rest) {
    const lines = splitParts(p);
    items.push(lines ?? [p]);
  }
  if (items.length === 0) return { text, lead: null, items: null };
  return { text, lead: leadOut, items };
}
