/**
 * DC-5 — the acceptable-answer materialisation extractor (spec §3.5 P2;
 * prereg of record docs/DC5-CONFORMANCE-LINT-PLAN.md, operator trace
 * 1a164e7ccff41b2d "Proceed").
 *
 * The mark scheme's acceptable-answer surface is materialised ONCE and
 * consumed by both generations: this module derives it deterministically
 * from the mark point's own scheme text (the marker wording of record —
 * parity pin (b)'s source), and the rows persist in the v2-only
 * `mark_point_alternatives` table (migration 0010; the BASELINE_DB §4.2
 * legal form of the spec's column framing — prereg R-DC5-1).
 *
 * LAWS (evidence-cited, precision-first — every rule traces to a mark-scheme
 * text shape and none may invent an acceptable answer):
 *   E1  acceptance cues ("Accept …", "Also accept …", "Allow …",
 *       "Any <n> from: …", "Award … for …") yield ALTERNATIVE rows whose
 *       value is the cue's object verbatim (the cue verb itself is never
 *       part of the answer);
 *   E2  rejection guidance ("Do not accept", "Do not allow", "Reject",
 *       "Ignore") yields NOTHING — the table carries the acceptable surface
 *       only (the ck_mpa_kind law has no negative kind); an offer matching
 *       rejected wording is out-of-set by construction, which is exactly the
 *       conformance the lint enforces;
 *   E3  reciprocal markers ("ora", "or reverse", "reciprocal") ride the
 *       enclosing clause's row as extraction metadata (extraction_method
 *       suffix) — the value stays the clause text;
 *   E4  numeric+unit tokens from the pinned unit vocabulary yield NUMERIC
 *       rows (value = number+unit as written; ranges "between X and Y u" /
 *       "X to Y u" yield one verbatim range row);
 *   canonicalisation is the R-DC5-2 law of record: case-folded, punctuation
 *   folded (digits, letters, internal hyphens and dots survive), ALL
 *   whitespace removed — the lint's membership key, unit-pinned;
 *   the extractor FAILS OPEN (an unparseable point yields [] — a point with
 *   no extractable surface simply has no materialised rows and the lint's
 *   Rule B passes through for it, per prereg R-DC5-4).
 *
 * Zero IO: pure string law. The persistence helpers take the caller's sql
 * fn (the ingestion transactions; the operator-gated backfill).
 */

/** The pinned unit vocabulary (E4) — common IGCSE/A-Level quantitative
 *  surfaces; explicit and unit-pinned, never a guessy catch-all. */
const UNITS = [
  "nm", "µm", "um", "mm", "cm", "m", "km",
  "°c", "°f", "k",
  "%",
  "ms", "s", "min", "h", "hours", "mins",
  "mg", "g", "kg",
  "cm³", "cm3", "dm³", "dm3", "ml", "l",
  "mol/dm³", "mol/dm3", "g/mol", "j", "kj", "n", "pa", "kpa", "hz",
] as const;

/** R-DC5-2 — the deterministic canonical form (the lint's membership key). */
export function canonicalAnswer(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-") // unicode dashes → hyphen
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'") // curly quotes → straight
    .replace(/[^a-z0-9.\-+×°µ/]/g, "") // punctuation fold; digits/letters/internal . - / survive
    .replace(/\s+/g, "") // ALL whitespace removed (spacing-insensitive)
    .replace(/\.+$/, ""); // the clause's terminal dot is furniture (internal decimals survive)
}

/** One extracted acceptable-answer row (not yet persisted). */
export interface ExtractedRow {
  kind: "ALTERNATIVE" | "NUMERIC";
  value: string;
  normalised: string;
  sourceSpan: string;
  ora: boolean;
}

const EXTRACTOR_METHOD = "dc5-r1";

/** Acceptance cue grammar (E1) — clause-initial, case-insensitive. */
const CUE_ACCEPT = /^(?:also\s+)?accept\b/i;
const CUE_ALLOW = /^allow\b/i;
const CUE_ANY_FROM = /^any\s+\w+\s+from\s*:\s*/i;
const CUE_AWARD_FOR = /^award\b[^.]*?\bfor\b\s*/i;
/** Rejection/ignore cues (E2) — the clause yields nothing. */
const CUE_NEGATIVE = /^(?:do\s+not\s+(?:accept|allow|credit)|reject|ignore)\b/i;
/** Reciprocal markers (E3). */
const ORA = /\b(?:ora|or\s+reverse|reciprocal)\b/i;

const MAX_VALUE = 200;

function row(kind: ExtractedRow["kind"], value: string, sourceSpan: string, ora: boolean): ExtractedRow | null {
  const trimmed = value
    .trim()
    .replace(/^[::\-–—]\s*/, "") // the cue's separator
    .replace(/[.;:,]\s*$/, "") // the clause's terminal punctuation (furniture)
    .trim();
  if (trimmed.length === 0 || trimmed.length > MAX_VALUE) return null;
  const normalised = canonicalAnswer(trimmed);
  if (normalised.length === 0) return null;
  return { kind, value: trimmed, normalised, sourceSpan: sourceSpan.trim(), ora };
}

/** E4 — numeric+unit tokens; ranges collapse to one verbatim range row.
 *  The unit tail uses a lookahead (not \b): symbol units (%, ×) end in
 *  non-word characters where \b never fires. */
const UNIT_ALT = UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const NUMERIC_TOKEN = new RegExp(
  `\\b\\d+(?:\\.\\d+)?\\s*(?:±\\s*\\d+(?:\\.\\d+)?)?\\s*(${UNIT_ALT})(?=[^\\w]|$)`,
  "gi",
);
const NUMERIC_RANGE = new RegExp(
  `\\b(?:between\\s+|from\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to|and)\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})(?=[^\\w]|$)`,
  "gi",
);

function extractNumeric(span: string, ora: boolean): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  const seen = new Set<string>();
  // range spans first — token matches inside a range row are furniture
  const ranges: Array<[number, number]> = [];
  for (const m of span.matchAll(NUMERIC_RANGE)) {
    if (m.index != null) ranges.push([m.index, m.index + m[0].length]);
    const value = m[0].trim();
    const n = canonicalAnswer(value);
    if (n && !seen.has(n)) {
      seen.add(n);
      const made = row("NUMERIC", value, span, ora);
      if (made) rows.push(made);
    }
  }
  const inRange = (idx: number) => ranges.some(([a, b]) => idx >= a && idx < b);
  for (const m of span.matchAll(NUMERIC_TOKEN)) {
    if (m.index != null && inRange(m.index)) continue;
    const value = m[0].trim();
    const n = canonicalAnswer(value);
    if (n && !seen.has(n)) {
      seen.add(n);
      const made = row("NUMERIC", value, span, ora);
      if (made) rows.push(made);
    }
  }
  return rows;
}

/** Clause splitting: terminal punctuation and newlines — semicolons stay
 *  INSIDE the clause (mark schemes use them as list separators inside
 *  "Any two from: a; b; c" values, never as clause breaks). */
function clauses(pointText: string): string[] {
  return pointText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * extractAcceptableAnswers — the deterministic per-point law over the
 * scheme text of record. Pure; never throws on odd text (fails open).
 */
export function extractAcceptableAnswers(pointText: string): ExtractedRow[] {
  if (pointText == null) return [];
  const text = String(pointText);
  if (text.trim().length === 0) return [];
  const rows: ExtractedRow[] = [];
  const seen = new Set<string>();
  const push = (made: ExtractedRow | null) => {
    if (made && !seen.has(made.kind + ":" + made.normalised)) {
      seen.add(made.kind + ":" + made.normalised);
      rows.push(made);
    }
  };

  for (const clause of clauses(text)) {
    const ora = ORA.test(clause);
    if (CUE_NEGATIVE.test(clause)) continue; // E2 — never an acceptable answer
    // E1 — acceptance cues
    let rest: string | null = null;
    if (CUE_ANY_FROM.test(clause)) rest = clause.replace(CUE_ANY_FROM, "");
    else if (CUE_ACCEPT.test(clause)) rest = clause.replace(CUE_ACCEPT, "");
    else if (CUE_ALLOW.test(clause)) rest = clause.replace(CUE_ALLOW, "");
    else if (CUE_AWARD_FOR.test(clause)) rest = clause.replace(CUE_AWARD_FOR, "");
    if (rest != null) {
      // the cue's object may itself carry numeric tokens — both families
      push(row("ALTERNATIVE", rest, clause, ora));
      for (const n of extractNumeric(rest, ora)) push(n);
      continue;
    }
    // E4 — bare numeric surfaces on non-cue clauses
    for (const n of extractNumeric(clause, ora)) push(n);
  }
  return rows;
}

/** The persistence shape for the ingestion hooks + the operator backfill. */
export interface AlternativeInsert {
  id: string;
  markPointId: string;
  markSchemeId: string;
  kind: string;
  value: string;
  normalised: string;
  sourceSpan: string | null;
  extractionMethod: string;
  createdAt: string;
}

type SqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

/** Build the insert rows for one mark point (the caller supplies ids). */
export function buildAlternativeInserts(
  pointId: string,
  schemeId: string,
  extracted: ExtractedRow[],
  method: string,
  nowIso: string,
  newId: () => string,
): AlternativeInsert[] {
  return extracted.map((r) => ({
    id: newId(),
    markPointId: pointId,
    markSchemeId: schemeId,
    kind: r.kind,
    value: r.value,
    normalised: r.normalised,
    sourceSpan: r.sourceSpan,
    extractionMethod: method + (r.ora ? "+ora" : ""),
    createdAt: nowIso,
  }));
}

/**
 * The ingestion hook's insert (additive beside each mark_points write —
 * prereg §4.2). Idempotent by uq_mpa_row.
 */
export async function insertMarkPointAlternatives(
  sql: SqlFn,
  inserts: AlternativeInsert[],
): Promise<number> {
  let n = 0;
  for (const r of inserts) {
    await sql`
      insert into mark_point_alternatives (
        id, mark_point_id, mark_scheme_id, kind, value, normalised,
        source_span, extraction_method, created_at
      ) values (
        ${r.id}::uuid, ${r.markPointId}::uuid, ${r.markSchemeId}::uuid,
        ${r.kind}, ${r.value}, ${r.normalised}, ${r.sourceSpan},
        ${r.extractionMethod}, ${r.createdAt}
      )
      on conflict (mark_point_id, kind, normalised) do nothing`;
    n++;
  }
  return n;
}

/**
 * backfillMarkPointAlternatives — the same law over EXISTING mark_points
 * rows (prereg §3: unit-pinned here, operator-gated to execute — the lane
 * never writes the live DB; the workflow that runs it owns the census).
 * Returns the honest tally for that run's disclosure.
 */
export async function backfillMarkPointAlternatives(
  sql: SqlFn,
  newId: () => string,
  nowIso: string,
): Promise<{ scanned: number; withRows: number; inserted: number }> {
  const points = (await sql`
    select id, mark_scheme_id, text
    from mark_points
    order by mark_scheme_id, ordering`) as unknown as Array<{
    id: string;
    mark_scheme_id: string;
    text: string;
  }>;
  let withRows = 0;
  let inserted = 0;
  for (const p of points) {
    const extracted = extractAcceptableAnswers(String(p.text ?? ""));
    if (extracted.length === 0) continue;
    withRows++;
    const inserts = buildAlternativeInserts(
      String(p.id),
      String(p.mark_scheme_id),
      extracted,
      EXTRACTOR_METHOD + "-backfill",
      nowIso,
      newId,
    );
    inserted += await insertMarkPointAlternatives(sql, inserts);
  }
  return { scanned: points.length, withRows, inserted };
}
