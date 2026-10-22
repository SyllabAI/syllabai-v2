/**
 * Normalize speech-polluted MCQ choice textMd introduced by the choices
 * backfill (backfill_mcq_choices.py). The upstream text_md carries Chrome
 * MathML aria-label speech text for some rows — the exact pollution class
 * the T-SME-23a/23b repair retired from every other corpus field (gate:
 * scripts/verify_corpus_23a.ts, baseline ZERO).
 *
 * Repair chain per polluted row (mirrors patch_corpus_math_23a.ts, minus
 * the page-dict levels whose cache is gone):
 *   1. EXACT map — hand-authored, KaTeX-verified LaTeX for the keys whose
 *      conversion is broken. Every entry is attested by the SAME question's
 *      own cleaned solutionMd (provenance unchanged; same semantics).
 *   2. speechToTexSafe — the runtime converter (23a chain step 5).
 *   3. genericChain pre-pass + speechToTexSafe retry.
 *   4. KaTeX validation on EVERY produced $...$ (throwOnError, 23a law).
 *   5. Anything still unconverted: the row degrades to letter-only
 *      (textMd = "") — honest absence, never garbage; counted, expected 0.
 *
 * Only multiple_choice parts' choices are touched; prose outside code spans
 * stays verbatim. Idempotent. Run AFTER backfill_mcq_choices.py.
 * Gate re-run after this script is the authoritative post-check.
 *
 * Run: bun scripts/normalize_mcq_choices_speech.ts [course ...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import katex from "katex";
import { speechToTexSafe } from "../src/lib/speech-math";
import { genericChain } from "../src/lib/speech-extras";

const CONTENT = process.cwd() + "/content";
const RESULTS = process.cwd() + "/tool-results/backfill-choices";

/** EXACT superset of the verify_corpus_23a.ts MARK — a row matching this
 *  cannot reach production (gate baseline is ZERO). */
const MARK = new RegExp(
  "\\b(open parentheses|close parentheses|open bracket|close bracket|" +
    "open curly|close curly|open angle brackets|close angle brackets|" +
    "fraction numerator|over denominator|end fraction|end table|end cell|" +
    "end row|end stack|end attributes|end style|end enclose|end exponent|" +
    "to the power|square root|end root|cube root|with bar on top|" +
    "subscript|superscript|presubscript|presuperscript|stack sum|sum from|" +
    "sum for|begin mathsize|rightwards arrow|left parenthesis|right parenthesis|" +
    "left bracket|right bracket|vertical line|vertical strike|horizontal strike|" +
    "identical to|cross times|plus-or-minus|end strike|asterisk times|enclose|" +
    "up diagonal strike|down diagonal strike|intersection|union|empty set|" +
    "proportional to|almost equal to|less or equal than|greater or equal than|" +
    "apostrophe)\\b",
  "i",
);
const CODE1 = /`([^`\n]+)`/g;

/** Hand-authored, KaTeX-verified. Attested by the question's own solutionMd
 *  ("${}^{56}{Fe}$") in ial-physics-19 — presubscript blank = leading {},
 *  presuperscript 56 = mass number prescript. */
const EXACT: Record<string, string> = {
  "Fe presubscript blank presuperscript 56": "{}^{56}{Fe}",
  "Fe presuperscript 56": "{}^{56}{Fe}",
  // Kc expressions (ial-chemistry-17 qstnprt_zsKRMfpzbTZ2s3gX B/C/D):
  // speechToTex half-converts "left square bracket" into \text{square}
  // \text{bracket} garbage inside \frac — hand-authored, KaTeX-verified,
  // faithful to the speech (plain concentration-bracket notation, matching
  // sibling option A's own [CO2] HTML form)
  "fraction numerator left square bracket CO subscript 2 right square bracket over denominator left square bracket CaCO subscript 3 right square bracket end fraction":
    "\\frac{\\left[\\mathrm{CO}_2\\right]}{\\left[\\mathrm{CaCO}_3\\right]}",
  "fraction numerator left square bracket CaCO subscript 3 right square bracket over denominator left square bracket CaO right square bracket left square bracket CO subscript 2 right square bracket end fraction":
    "\\frac{\\left[\\mathrm{CaCO}_3\\right]}{\\left[\\mathrm{CaO}\\right]\\left[\\mathrm{CO}_2\\right]}",
  "fraction numerator left square bracket CaO right square bracket left square bracket CO subscript 2 right square bracket over denominator left square bracket CaCO subscript 3 right square bracket end fraction":
    "\\frac{\\left[\\mathrm{CaO}\\right]\\left[\\mathrm{CO}_2\\right]}{\\left[\\mathrm{CaCO}_3\\right]}",
};

/** Prefix/suffix-keyed EXACT entries for long multiline speech rows (23a
 *  EXACT_FORMULAS precedent): speechToTex garbles "O with plus on top" into
 *  \text{with}+ — semantic garbage, rejected under the never-garbage law.
 *  The two ial-chemistry-17 propanone-iodination mechanism rows (A/B of
 *  qstnprt_p5qtYjySd2rkbGGQ) differ ONLY in the final fast/slow label, so
 *  the key is (shared prefix, terminal label). Faithful decode: the speech's
 *  long "space"-runs are SME's layout gaps before the step label (\quad);
 *  "rightwards harpoon over leftwards harpoon" = \rightleftharpoons;
 *  "O with plus on top H" = \overset{+}{\mathrm{O}}\mathrm{H}; U+2550 ═ =
 *  the enol C=CH\u2082 double bond. */
const EXACT_PREFIX: { prefix: string; suffix: string; tex: string }[] = [
  {
    prefix: "CH subscript 3 COCH subscript 3 space plus space straight H to the power of plus",
    suffix: "fast",
    tex:
      "$\\mathrm{CH}_3\\mathrm{COCH}_3 + \\mathrm{H}^+ \\rightleftharpoons \\mathrm{CH}_3\\mathrm{C}(\\overset{+}{\\mathrm{O}}\\mathrm{H})\\mathrm{CH}_3 \\quad\\text{fast}$\n" +
      "$\\mathrm{CH}_3\\mathrm{C}(\\overset{+}{\\mathrm{O}}\\mathrm{H})\\mathrm{CH}_3 \\rightarrow \\mathrm{CH}_3\\mathrm{C}(\\mathrm{OH})\\mathrm{=}\\mathrm{CH}_2 + \\mathrm{H}^+ \\quad\\text{slow}$\n" +
      "$\\mathrm{CH}_3\\mathrm{C}(\\mathrm{OH})\\mathrm{=}\\mathrm{CH}_2 + \\mathrm{I}_2 \\rightarrow \\mathrm{CH}_3\\mathrm{COCH}_2\\mathrm{I} + \\mathrm{HI} \\quad\\text{fast}$",
  },
  {
    prefix: "CH subscript 3 COCH subscript 3 space plus space straight H to the power of plus",
    suffix: "slow",
    tex:
      "$\\mathrm{CH}_3\\mathrm{COCH}_3 + \\mathrm{H}^+ \\rightleftharpoons \\mathrm{CH}_3\\mathrm{C}(\\overset{+}{\\mathrm{O}}\\mathrm{H})\\mathrm{CH}_3 \\quad\\text{fast}$\n" +
      "$\\mathrm{CH}_3\\mathrm{C}(\\overset{+}{\\mathrm{O}}\\mathrm{H})\\mathrm{CH}_3 \\rightarrow \\mathrm{CH}_3\\mathrm{C}(\\mathrm{OH})\\mathrm{=}\\mathrm{CH}_2 + \\mathrm{H}^+ \\quad\\text{fast}$\n" +
      "$\\mathrm{CH}_3\\mathrm{C}(\\mathrm{OH})\\mathrm{=}\\mathrm{CH}_2 + \\mathrm{I}_2 \\rightarrow \\mathrm{CH}_3\\mathrm{COCH}_2\\mathrm{I} + \\mathrm{HI} \\quad\\text{slow}$",
  },
];

function exactLong(inner: string): string | null {
  for (const e of EXACT_PREFIX) {
    if (inner.startsWith(e.prefix) && inner.endsWith(e.suffix)) {
      // multi-$ entries (one $...$ block per mechanism step) — KaTeX-validate
      // EACH math body separately; a whole-string render would see the later
      // $ delimiters as characters and fail
      const bodies = e.tex.split("$").map((s) => s.trim()).filter(Boolean);
      return bodies.every(katexOk) ? e.tex : null;
    }
  }
  return null;
}

const katexOk = (tex: string): boolean => {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function convertSpan(inner: string): string | null {
  if (EXACT[inner]) {
    // hand-authored entries are KaTeX-verified here too (same law)
    return katexOk(EXACT[inner]) ? EXACT[inner] : null;
  }
  const long = exactLong(inner);
  // exactLong already KaTeX-validated EVERY $-body separately — a whole-string
  // re-validate would fail on the later $ delimiters and degrade the row
  if (long !== null) return long;
  let tex = speechToTexSafe(inner);
  if (tex === null) tex = speechToTexSafe(genericChain(inner) ?? inner);
  if (tex !== null && katexOk(tex)) return tex;
  return null;
}

const stats = { courses: 0, rows_scanned: 0, rows_clean: 0, rows_converted: 0, rows_degraded: 0, degraded: [] as string[] };

const courses = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (courses.length === 0) {
  // explicit-courses law: the first run's no-arg default swept every bundle
  // and its MARK regex false-positived on legit prose ("union",
  // "intersection"), no-op-rewriting four pretty-printed files compact.
  // Scope is always explicit now; no-op rows below never mark touched.
  console.error("usage: bun scripts/normalize_mcq_choices_speech.ts <course ...>");
  process.exit(1);
}
const list = courses.length ? courses : readdirSync(CONTENT).filter((d) => existsSync(`${CONTENT}/${d}/questions.json`));

for (const course of list) {
  const p = `${CONTENT}/${course}/questions.json`;
  if (!existsSync(p)) continue;
  const topics = JSON.parse(readFileSync(p, "utf8"));
  let touched = false;
  for (const t of topics)
    for (const q of t.questions)
      for (const part of q.parts) {
        if (part.questionType !== "multiple_choice") continue;
        for (const o of part.choices ?? []) {
          stats.rows_scanned++;
          if (!o.textMd || !MARK.test(o.textMd)) {
            stats.rows_clean++;
            continue;
          }
          const before = o.textMd;
          // whole-string code span — single-line OR multiline (the propanone
          // mechanism rows carry \n inside one backtick pair; the original
          // [^\n] whole-span regex missed them entirely)
          let whole = o.textMd.replace(/^`([^`]+)`$/s, "$1");
          const isWholeSpan = whole !== o.textMd;
          if (!isWholeSpan) {
            let failedSpan = false;
            whole = o.textMd.replace(CODE1, (m, inner: string) => {
              const tex = convertSpan(inner);
              if (tex === null) {
                failedSpan = true;
                return m;
              }
              return `$${tex}$`;
            });
            if (failedSpan) {
              stats.rows_degraded++;
              stats.degraded.push(`${course}: ${o.textMd.slice(0, 80)}`);
              o.textMd = "";
              touched = true;
              continue;
            }
            // every span's tex was KaTeX-validated inside convertSpan —
            // prose outside spans is NEVER math-validated (prose isn't math)
          } else {
            const tex = convertSpan(whole);
            if (tex === null) {
              stats.rows_degraded++;
              stats.degraded.push(`${course}: ${o.textMd.slice(0, 80)}`);
              o.textMd = "";
              touched = true;
              continue;
            }
            whole = tex;
          }
          o.textMd =
            isWholeSpan && !whole.includes("$") ? `$${whole}$` : whole;
          if (o.textMd === before) continue; // no-op (false-positive MARK) — never count, never write
          stats.rows_converted++;
          touched = true;
        }
      }
  if (touched) {
    // JSON.stringify default = compact separators, unicode literal — matches
    // the committed files' byte format (same as the Python backfill writer).
    writeFileSync(p, JSON.stringify(topics), "utf8");
    stats.courses++;
  }
}

console.log(JSON.stringify(stats, null, 1));
mkdirSync(RESULTS, { recursive: true });
writeFileSync(
  `${RESULTS}/speech-normalize.json`,
  JSON.stringify(stats, null, 1) + "\n",
  "utf8",
);
