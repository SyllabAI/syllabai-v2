/**
 * T-MIG-060 tranche 1b — the Fetch query parser (frozen law @ 6cad6ef).
 *
 * Line-against-line port of content/FetchQueryParser.java :61-268, the
 * deterministic metadata parser the paper-question resolver rides (R4, plan
 * §7 FETCH). Regex over the series/year/paper/qnum vocabulary — no LLM on
 * the happy path, no vector calls. The vocabulary is the canonical enum
 * (§8.1): "Summer"/"June" map to JUN, "January"/"Jan" to JAN,
 * "October"/"November" to NOV; raw labels are never part of resolution.
 *
 * STRUCTURAL SEAM (the nba.ts/learner-model doctrine, consolidation ruling
 * requested at PR review): the frozen parser lives in the content package,
 * but the landed content module has not ported it — the tutor band carries
 * this per-module copy so the REQUIRED paper-question port can close without
 * reaching outside services/tutor/**. When the content band lands the
 * canonical port, this copy collapses onto it (same posture the 043
 * learner-model reads carried).
 *
 * Grammar fragments recognized (case-insensitive, all optional):
 *   - full paper code: 4CH1/2C, 4CH0-1CR (slash or dash, optional spaces)
 *   - bare unit: 1C, 2CR as a standalone token
 *   - series word: summer/june → JUN, january/jan → JAN, november/october → NOV
 *   - year: 4-digit 1900-2099 (first match)
 *   - question number, keyword-led: "question 6", "q4", "Q7b",
 *     "question number 3", "question no. 10", "question 10th",
 *     "question ten", "question tenth part b" — optional part letter a-h
 *     and (letter-gated) roman sub-part
 *   - question number, ordinal-led: "10th question", "tenth question" —
 *     the number binds, the part letter does not
 *   - word numbers one-forty-nine in cardinal and ordinal form; letter-
 *     adjacent hyphens fold to spaces before parsing; the query is
 *     NFKC-normalized first so full-width digits bind like ASCII ones
 *     (H1 paraphrase audit 2026-09-28)
 *   - intent hint: "answer/mark scheme/solution" ⇒ mark-scheme-seeking,
 *     "what did/what was/ask" ⇒ question-paper-seeking
 *
 * GUARD POSTURE (H1): widening the question-number grammar widens what
 * counts as a stated paper identity — the over-refusal direction is the
 * deliberate trade (honest echo beats wrong-paper confidence).
 */

/** One parsed Fetch query — every field optional, filled only from the text.
 *  ParsedFetchQuery record :63-98. `partRoman` binds ONLY under a part
 *  letter (Edexcel prints romans under a letter: "(b)(ii)"). */
export interface ParsedFetchQuery {
  paperCode: string | null;
  unit: string | null;
  series: string | null;
  year: number | null;
  qnum: number | null;
  part: string | null;
  msSeeking: boolean;
  normalized: string;
  partRoman: string | null;
}

/** True when the query pinned a paper identity itself (strict resolution). */
export function hasExplicitPaper(p: ParsedFetchQuery): boolean {
  return p.paperCode != null || p.unit != null;
}

/** True when nothing usable was parsed — the caller logs a parse defect. */
export function parsedIsEmpty(p: ParsedFetchQuery): boolean {
  return (
    p.paperCode == null &&
    p.unit == null &&
    p.series == null &&
    p.year == null &&
    p.qnum == null
  );
}

/** The full part atom ref ("9-b-ii"), or the letter ref ("9-b"), or null —
 *  the filterable identity shape the resolver's atom column can carry
 *  (:90-97). */
export function partAtomOf(p: ParsedFetchQuery): string | null {
  if (p.qnum == null || p.part == null) return null;
  return `${p.qnum}-${p.part}${p.partRoman == null ? "" : `-${p.partRoman}`}`;
}

// ── patterns (:100-107) ─────────────────────────────────────────────────────

const PAPER_CODE = /\b(4CH[01])\s*[/-]\s*([12]\s*C\s*R?)\b/i;
const BARE_UNIT = /(?<![A-Za-z0-9])([12])\s*(CR|C)(?![A-Za-z0-9])/i;
const SERIES_JUN = /\b(summer|june)\b/i;
const SERIES_JAN = /\b(january|jan)\b/i;
const SERIES_NOV = /\b(november|october)\b/i;
const YEAR = /\b(19|20)(\d{2})\b/;

/** Word numbers bound as question references — cardinals and ordinals, one
 *  to forty-nine (:116-140). Keyed lowercase; the space form is canonical
 *  because letter-adjacent hyphens are folded to spaces during
 *  normalization. */
function buildWordQnums(): Map<string, number> {
  const m = new Map<string, number>();
  const card = [
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const ord = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
    "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
    "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
    "nineteenth",
  ];
  for (let i = 0; i < card.length; i++) {
    m.set(card[i]!, i + 1);
    m.set(ord[i]!, i + 1);
  }
  const tens = ["twenty", "thirty", "forty"];
  const tensOrd = ["twentieth", "thirtieth", "fortieth"];
  for (let t = 0; t < tens.length; t++) {
    const ten = tens[t]!;
    const tenOrd = tensOrd[t]!;
    m.set(ten, 20 + 10 * t);
    m.set(tenOrd, 20 + 10 * t);
    for (let u = 0; u < 9; u++) {
      m.set(`${ten} ${card[u]}`, 21 + 10 * t + u);
      m.set(`${ten} ${ord[u]}`, 21 + 10 * t + u);
    }
  }
  return m;
}

const WORD_QNUMS = buildWordQnums();

/** The word-number vocabulary as one regex alternation, longest-first
 *  (:143-146). Pattern.quote → RegExp.escape semantics. */
const WORD_QNUM_ALT = [...WORD_QNUMS.keys()]
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const ROMAN = "(i{1,3}|iv|v|vi{1,3}|ix|x)";

/**
 * Question number led by the keyword (:148-172): "question 10", "q4",
 * "Q7b", "question number 3", "question no. 10", "question 10th",
 * "question ten", "question tenth part b", "9(b)", "9(b)(ii)". Group 1
 * captures ASCII digits (ordinal suffix tolerated outside the group),
 * group 2 a word number, group 3 the part letter a-h (optionally
 * parenthesized), groups 4/5 an optional roman sub-part bound ONLY as an
 * extension of the letter — parenthesized with a mandatory close ("(ii)",
 * so "(i think" can never bind) or bare after whitespace ("part b ii"). A
 * bare roman without a letter never binds: "question 9 (i think)" and
 * "question 9 (ii)" bind the number alone (Edexcel prints romans under a
 * letter part; the pronoun/false-positive risk outweighs the shorthand).
 * The code-side guard in parse() enforces the letter requirement
 * regardless of what the regex matched, and the tail lookahead (not a
 * word character) keeps the parenthesized forms from backtracking away.
 */
const QNUM = new RegExp(
  "\\b(?:question|q)\\.?\\s*(?:(?:number|no)\\.?\\s*)?" +
    "(?:(\\d{1,2})(?:st|nd|rd|th)?|(" +
    WORD_QNUM_ALT +
    "))" +
    "\\s*(?:part\\s*)?(?:[(]?([a-h])[)]?" +
    "(?:\\s*\\(" +
    ROMAN +
    "\\)" +
    "|\\s+" +
    ROMAN +
    "\\b)?(?![a-z0-9])" +
    "|\\b)",
  "i",
);

/**
 * Question number led by its ordinal: "10th question", "tenth question"
 * (:174-181). The part letter is not bound on these forms — the identity
 * binds on the number alone.
 */
const QNUM_LEADING_ORDINAL = new RegExp(
  "\\b(?:(\\d{1,2})(?:st|nd|rd|th)|(" + WORD_QNUM_ALT + "))\\s+(?:question|q)\\b",
  "i",
);

const MS_SEEKING = /\b(answer|mark\s+scheme|solution|markscheme)\b/i;
const QP_SEEKING = /\b(what did|what was|ask)\b/i;

const EMPTY_PARSE: ParsedFetchQuery = {
  paperCode: null,
  unit: null,
  series: null,
  year: null,
  qnum: null,
  part: null,
  msSeeking: false,
  normalized: "",
  partRoman: null,
};

/** Parses the query; never returns null — an unparseable query yields an
 *  empty parse (:191-267). */
export function parseFetchQuery(query: string | null | undefined): ParsedFetchQuery {
  if (query == null || query.trim() === "") {
    return { ...EMPTY_PARSE };
  }
  // NFKC folds full-width digits/letters ("question １０") to ASCII; the
  // letter-adjacent hyphen fold turns "twenty-one" into the map's canonical
  // "twenty one" without touching "4CH0-1C" (digit-adjacent).
  let q = query.trim().normalize("NFKC");
  q = q.replace(/(?<=\p{L})-(?=\p{L})/gu, " ");

  let paperCode: string | null = null;
  const code = PAPER_CODE.exec(q);
  if (code) {
    paperCode =
      code[1]!.toUpperCase() + "/" + code[2]!.toUpperCase().replace(/ /g, "");
  }

  // bare unit only when no full code was matched ("paper 2C", "the 1CR paper")
  let unit: string | null = null;
  if (paperCode == null) {
    const bare = BARE_UNIT.exec(q);
    if (bare) {
      unit = bare[1]! + bare[2]!.toUpperCase();
    }
  }

  let series: string | null = null;
  if (SERIES_JUN.test(q)) {
    series = "JUN";
  } else if (SERIES_JAN.test(q)) {
    series = "JAN";
  } else if (SERIES_NOV.test(q)) {
    series = "NOV";
  }

  let year: number | null = null;
  const y = YEAR.exec(q);
  if (y) {
    year = parseInt(y[0], 10);
  }

  let qnum: number | null = null;
  let part: string | null = null;
  let partRoman: string | null = null;
  const n = QNUM.exec(q);
  if (n) {
    qnum =
      n[1] != null ? parseInt(n[1], 10) : (WORD_QNUMS.get(n[2]!.toLowerCase()) ?? null);
    part = n[3] == null ? null : n[3].toLowerCase();
    // letter-gated roman: a roman numeral is a sub-part identity only under
    // a bound part letter (see QNUM doc); the parenthesized and bare forms
    // land in different groups and coalesce here
    const romanRaw = n[4] != null ? n[4] : n[5];
    partRoman = part != null && romanRaw != null ? romanRaw.toLowerCase() : null;
  } else {
    const o = QNUM_LEADING_ORDINAL.exec(q);
    if (o) {
      qnum =
        o[1] != null
          ? parseInt(o[1], 10)
          : (WORD_QNUMS.get(o[2]!.toLowerCase()) ?? null);
    }
  }

  const msSeeking = MS_SEEKING.test(q) || !QP_SEEKING.test(q);

  // String.join(" ", …) parity: empty elements keep their slots (an interior
  // empty element leaves the double space the frozen normalized string has)
  const normalized = [
    paperCode ?? (unit == null ? "" : `unit:${unit}`),
    series ?? "",
    year == null ? "" : String(year),
    qnum == null ? "" : `Q${qnum}${part ?? ""}${partRoman == null ? "" : `-${partRoman}`}`,
  ]
    .join(" ")
    .trim();

  return { paperCode, unit, series, year, qnum, part, msSeeking, normalized, partRoman };
}
