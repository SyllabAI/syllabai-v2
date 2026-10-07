/**
 * FetchQueryParser port — deterministic Fetch/Enumerate query grammar
 * (T-MIG-082 tranche B1). Byte-faithful port of the frozen
 * content/FetchQueryParser.java @ 6cad6ef (268 lines; verified line-against-
 * line 2026-10-07): regex over the series/year/paper/qnum vocabulary — no
 * LLM, no vector calls. The canonical enum (§8.1): summer/june→JUN,
 * january/jan→JAN, november/october→NOV; raw labels never resolve.
 *
 * Ported laws:
 *   - NFKC normalization first (full-width digits "question １０" bind like
 *     ASCII ones), then the letter-adjacent hyphen fold ("twenty-one" →
 *     "twenty one"; digit-adjacent hyphens like "4CH0-1C" untouched);
 *   - word numbers one–forty-nine in cardinal AND ordinal form, bound via
 *     the longest-first quoted alternation (the H1 paraphrase audit's
 *     anti-bypass law);
 *   - the question-number grammar: keyword-led ("question 10", "q4",
 *     "Q7b", "question no. 10", "question 10th", "question tenth part b",
 *     "9(b)", "9(b)(ii)") with a letter-gated roman sub-part (a bare roman
 *     never binds: "question 9 (i think)" and "question 9 (ii)" bind the
 *     number alone); ordinal-led ("10th question", "tenth question") binds
 *     the number alone;
 *   - intent probe: msSeeking = MS_SEEKING found || !QP_SEEKING found;
 *   - a query carrying none of the vocabulary parses to an all-empty
 *     result (isEmpty) — the CALLER treats it as a parse defect.
 *
 * Java→JS regex notes: every frozen pattern is JS-expressible verbatim
 * (\b, alternation, lookahead); the hyphen fold uses /u for \p{L} (with
 * lookbehind — Node ≥ 16). Java's Matcher.find() == JS .exec() scanning;
 * the frozen alternation order (JUN before JAN before NOV) is preserved.
 */

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

const PAPER_CODE = /\b(4CH[01])\s*[/-]\s*([12]\s*C\s*R?)\b/i;
const BARE_UNIT = /(?<![A-Za-z0-9])([12])\s*(CR|C)(?![A-Za-z0-9])/i;
const SERIES_JUN = /\b(summer|june)\b/i;
const SERIES_JAN = /\b(january|jan)\b/i;
const SERIES_NOV = /\b(november|october)\b/i;
const YEAR = /\b(19|20)(\d{2})\b/;

/** Word numbers one–forty-nine, cardinal + ordinal (FetchQueryParser :116-140). */
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
    m.set(tens[t]!, 20 + 10 * t);
    m.set(tensOrd[t]!, 20 + 10 * t);
    for (let u = 0; u < 9; u++) {
      m.set(`${tens[t]!} ${card[u]}`, 21 + 10 * t + u);
      m.set(`${tens[t]!} ${ord[u]}`, 21 + 10 * t + u);
    }
  }
  return m;
}

const WORD_QNUMS = buildWordQnums();

/** The word-number vocabulary as one alternation, longest-first (:143-146). */
const WORD_QNUM_ALT = [...WORD_QNUMS.keys()]
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const ROMANS = "(i{1,3}|iv|v|vi{1,3}|ix|x)";

/**
 * Question number led by the keyword (:148-172). Group 1 ASCII digits
 * (ordinal suffix tolerated outside), group 2 a word number, group 3 the
 * part letter a–h, groups 4/5 a roman sub-part bound ONLY under a letter.
 */
const QNUM = new RegExp(
  "\\b(?:question|q)\\.?\\s*(?:(?:number|no)\\.?\\s*)?" +
    `(?:(\\d{1,2})(?:st|nd|rd|th)?|(${WORD_QNUM_ALT}))` +
    "\\s*(?:part\\s*)?(?:[(]?([a-h])[)]?" +
    `(?:\\s*\\(${ROMANS}\\)` +
    `|\\s+${ROMANS}\\b)?(?![a-z0-9])` +
    "|\\b)",
  "i",
);

/** Ordinal-led forms (:179-181) — the part letter never binds. */
const QNUM_LEADING_ORDINAL = new RegExp(
  `\\b(?:(\\d{1,2})(?:st|nd|rd|th)|(${WORD_QNUM_ALT}))\\s+(?:question|q)\\b`,
  "i",
);

const MS_SEEKING = /\b(answer|mark\s+scheme|solution|markscheme)\b/i;
const QP_SEEKING = /\b(what did|what was|ask)\b/i;

/** True when nothing usable was parsed — the caller logs a parse defect. */
export function parsedIsEmpty(p: ParsedFetchQuery): boolean {
  return (
    p.paperCode === null &&
    p.unit === null &&
    p.series === null &&
    p.year === null &&
    p.qnum === null
  );
}

/** The full part atom ref ("9-b-ii") or the letter ref ("9-b") or null (:90-97). */
export function parsedPartAtom(p: ParsedFetchQuery): string | null {
  if (p.qnum === null || p.part === null) return null;
  return `${p.qnum}-${p.part}${p.partRoman === null ? "" : `-${p.partRoman}`}`;
}

/** Parses the query; never returns null — an unparseable query yields an empty parse (:192-267). */
export function parseFetchQuery(rawQuery: string | null | undefined): ParsedFetchQuery {
  if (rawQuery == null || rawQuery.trim() === "") {
    return {
      paperCode: null, unit: null, series: null, year: null, qnum: null,
      part: null, msSeeking: false, normalized: "", partRoman: null,
    };
  }
  // NFKC folds full-width digits/letters; the hyphen fold turns "twenty-one"
  // into the map's canonical "twenty one" without touching "4CH0-1C".
  let q = rawQuery.trim().normalize("NFKC");
  q = q.replace(/(?<=\p{L})-(?=\p{L})/gu, " ");

  let paperCode: string | null = null;
  const code = PAPER_CODE.exec(q);
  if (code) {
    paperCode = `${code[1]!.toUpperCase()}/${code[2]!.toUpperCase().replace(/\s+/g, "")}`;
  }

  // bare unit only when no full code was matched ("paper 2C", "the 1CR paper")
  let unit: string | null = null;
  if (paperCode === null) {
    const bare = BARE_UNIT.exec(q);
    if (bare) {
      unit = `${bare[1]}${bare[2]!.toUpperCase()}`;
    }
  }

  let series: string | null = null;
  if (SERIES_JUN.test(q)) series = "JUN";
  else if (SERIES_JAN.test(q)) series = "JAN";
  else if (SERIES_NOV.test(q)) series = "NOV";

  let year: number | null = null;
  const y = YEAR.exec(q);
  if (y) year = Number.parseInt(y[0]!, 10);

  let qnum: number | null = null;
  let part: string | null = null;
  let partRoman: string | null = null;
  const n = QNUM.exec(q);
  if (n) {
    qnum =
      n[1] != null
        ? Number.parseInt(n[1], 10)
        : (WORD_QNUMS.get(n[2]!.toLowerCase()) ?? null);
    part = n[3] == null ? null : n[3].toLowerCase();
    // letter-gated roman: a roman numeral is a sub-part identity only under
    // a bound part letter; the parenthesized and bare forms coalesce here
    const romanRaw = n[4] != null ? n[4] : n[5];
    partRoman = part !== null && romanRaw != null ? romanRaw.toLowerCase() : null;
  } else {
    const o = QNUM_LEADING_ORDINAL.exec(q);
    if (o) {
      qnum =
        o[1] != null
          ? Number.parseInt(o[1], 10)
          : (WORD_QNUMS.get(o[2]!.toLowerCase()) ?? null);
    }
  }

  const msSeeking = MS_SEEKING.test(q) || !QP_SEEKING.test(q);

  const normalized = [
    paperCode ?? (unit === null ? "" : `unit:${unit}`),
    series ?? "",
    year === null ? "" : String(year),
    qnum === null ? "" : `Q${qnum}${part ?? ""}${partRoman === null ? "" : `-${partRoman}`}`,
  ]
    .join(" ")
    .trim();

  return { paperCode, unit, series, year, qnum, part, msSeeking, normalized, partRoman };
}
