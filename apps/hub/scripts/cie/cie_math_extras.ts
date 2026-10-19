/**
 * cie_math_extras.ts — CIE-INTEGRATION Phase 3 residual grammar layer.
 *
 * Three deterministic helpers used by cie_patch_math_23a.ts:
 *   ciePreMap      — speech-side token pre-map (Greek vocab, fonts, bars) applied
 *                    BEFORE speechToTexSafe reconstruction.
 *   cieTexRepair   — post-conversion TeX fixer: resolves the recon leftovers the
 *                    Edexcel-era grammar never produced (bare "over" atoms,
 *                    \text{italic}/\text{stack}/\text{bevelled} garbage runs).
 *   ciePlainCollapse — LAST-RESORT fallback: collapses the Chrome speech grammar
 *                    to readable plain-text math (kept in code spans, never
 *                    wrapped in $..$), with a hard guard: the result must not
 *                    contain any gate-marked grammar word, else returns null.
 * Every user of the first two still verifies with KaTeX + hasResidualGrammar,
 * so a bad conversion degrades to "leave untouched", never to garbage math.
 */

const GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
  "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "rho", "sigma",
  "tau", "upsilon", "phi", "chi", "psi", "omega"];

const CAP: Record<string, string> = Object.fromEntries(GREEK.map((g) => [
  g, g.charAt(0).toUpperCase() + g.slice(1),
]));

export function ciePreMap(s: string): string {
  let t = s;
  t = t.replace(/<br\s*\/?>(\s*)/gi, " \\\\ ");
  t = t.replace(/circle enclose (\d+|[a-z])(?=\b)/g, "\\textcircled{$1}");
  t = t.replace(/\bopen vertical bar\b/g, " \\left| ");
  t = t.replace(/\bclose vertical bar\b/g, " \\right| ");
  t = t.replace(/\bvertical bar\b/g, " \\vert ");
  t = t.replace(/\bstraight real numbers\b/g, "\\mathbb{R}");
  t = t.replace(/\bstraight natural numbers\b/g, "\\mathbb{N}");
  t = t.replace(/\bstraight integers\b/g, "\\mathbb{Z}");
  t = t.replace(/\bstraight rational numbers\b/g, "\\mathbb{Q}");
  t = t.replace(/\belement of\b/g, " \\in ");
  t = t.replace(/\bnot equal to\b/g, " \\neq ");
  t = t.replace(/\binfinity\b/g, " \\infty ");
  t = t.replace(/\bidentical to\b/g, " \\equiv ");
  t = t.replace(/\bdegree\b/g, "^{\\circ}");
  t = t.replace(/rightwards arrow from (.+?) to /g, "\\xrightarrow{$1} ");
  t = t.replace(
    /stack ((?:\S+ ){1,4})with rightwards arrow on top/g,
    (_w: string, base: string) => ` \\vec{${base.trim().split(/\s+/).join("")}} `,
  );
  // standalone font-change markers (speech-math has no bare rule for them)
  t = t.replace(/\bitalic\b/g, " ");
  t = t.replace(/\bbold\b/g, " ");
  // Greek vocabulary the Edexcel-era PHRASES table lacks
  for (const g of GREEK) {
    t = t.replace(new RegExp(`\\bstraight ${g}\\b`, "g"), ` \\${g} `);
    t = t.replace(new RegExp(`\\bcapital ${g}\\b`, "g"), ` \\${CAP[g]} `);
    t = t.replace(new RegExp(`\\b${g}\\b`, "g"), ` \\${g} `);
  }
  return t;
}

/** Single math atom: number, name-wrapped token, or letter (optionally scripted). */
const ATOM_SRC =
  "\\\\(?:mathrm|mathbf|mathit|boldsymbol|mathbb)\\{[^{}]*\\}" +
  "|[0-9]+(?:\\.[0-9]+)?" +
  "|[a-zA-Z](?:_[^{}\\s]*|\\_[^{}]*|\\^[^{}\\s]*)?";

/** "X \text{over} Y" (bare over: no fraction wrapper) -> \frac{X}{Y}, atom-scoped. */
function fixBareOver(t: string): string {
  for (let i = 0; i < 4; i++) {
    const re = new RegExp(
      `(${ATOM_SRC})\\s*\\\\text\\s*\\{\\s*over\\s*\\}\\s*(${ATOM_SRC})`,
      "g",
    );
    const next = t.replace(re, (_w, a: string, b: string) => ` \\frac{${a.trim()}}{${b.trim()}} `);
    if (next === t) break;
    t = next;
  }
  return t;
}

export function cieTexRepair(tex: string): string {
  let t = tex;
  t = fixBareOver(t);
  // recon garbage tokens that carry no math meaning
  t = t.replace(/\\text\s*\{\s*(italic|bold|stack|bevelled|attributes|left|right)\s*\}/g, " ");
  t = t.replace(/\\text\s*\{\s*vertical\s+bar\s*\}/g, " \\vert ");
  // CIE leftovers the Edexcel-era vocabulary never produced
  t = t.replace(/\\text\s*\{\s*(rho|pi|sigma|theta|mu|lambda|alpha|beta|gamma|omega|phi)\s*\}/g,
    (_w: string, g: string) => ` \\${g} `);
  t = t.replace(/\bapostrophe\b/g, "'");
  // dangling grammar-word \text{} runs (the gate's BAD_TEXT_CONTENT class)
  t = t.replace(/\\text\s*\{\s*(end|open|close|left|right|fraction|numerator|denominator|strike|enclose|bracket|parenthesis|table|row|cell|root|of|the)\s*[.,]?\s*\}/gi, " ");
  t = t.replace(/\^\{\\text\{italic\}\}/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t;
}

/** The gate MARK vocabulary (verify_corpus_23a.ts) — the collapse guard. */
const GATE_MARK = new RegExp(
  "\\b(open parentheses|close parentheses|open bracket|close bracket|open curly|close curly|" +
    "open angle brackets|close angle brackets|fraction numerator|over denominator|end fraction|" +
    "end table|end cell|end row|end stack|end attributes|end style|end enclose|enclose|to the power|" +
    "end exponent|square root|end root|cube root|with bar on top|open square brackets|" +
    "close square brackets|plus-or-minus|direct double arrow|rightwards arrow|identical to|" +
    "cross times|plus sign|minus sign|percent sign|presubscript|presuperscript|subscript|" +
    "superscript|stack sum|sum from|sum for|begin mathsize|left parenthesis|right parenthesis|" +
    "left bracket|right bracket|left square brackets|right square brackets|horizontal strike|" +
    "vertical line|end strike|up diagonal strike|down diagonal strike|asterisk times|" +
    "almost equal to|proportional to|less or equal than|greater or equal than|intersection|union|" +
    "empty set|apostrophe)\\b",
  "i",
);

const COLLAPSE: [RegExp, string][] = [
  [/<br\s*\/?>/gi, " | "],
  [/\bwith bold rightwards arrow on top\b/gi, "-vec"],
  [/\bwith bold bar on top\b/gi, "-bar"],
  [/\bwith bold dot on top\b/gi, "-dot"],
  [/\bwith bold hat on top\b/gi, "-hat"],
  [/\bwith bold tilde on top\b/gi, "-tilde"],
  [/\bend presubscript\b/gi, ""], [/\bend presuperscript\b/gi, ""],
  [/\bend scriptbase\b/gi, ""], [/\bscriptbase\b/gi, ""],
  [/\bnegative\b/gi, "-"],
  [/\bfraction numerator\b/gi, "("],
  [/\bover denominator\b/gi, ")/("],
  [/\bend fraction\b/gi, ")"],
  [/\bopen parentheses\b/gi, "("], [/\bclose parentheses\b/gi, ")"],
  [/\bleft parenthesis\b/gi, "("], [/\bright parenthesis\b/gi, ")"],
  [/\bopen bracket\b/gi, "["], [/\bclose bracket\b/gi, "]"],
  [/\bopen square brackets?\b/gi, "["], [/\bclose square brackets?\b/gi, "]"],
  [/\bopen curly brackets?\b/gi, "{"], [/\bclose curly brackets?\b/gi, "}"],
  [/\bopen angle brackets?\b/gi, "<"], [/\bclose angle brackets?\b/gi, ">"],
  [/\bopen vertical bar\b/gi, "|"], [/\bclose vertical bar\b/gi, "|"],
  [/\bvertical line\b/gi, "|"],
  [/\bsquare root of\b/gi, "sqrt("], [/\bcube root of\b/gi, "cbrt("],
  [/\bend root\b/gi, ")"],
  [/\bwith bar on top\b/gi, "-bar"], [/\bwith dot on top\b/gi, "-dot"],
  [/\bwith hat on top\b/gi, "-hat"], [/\bwith tilde on top\b/gi, "-tilde"],
  [/\bwith rightwards arrow on top\b/gi, "-vec"],
  [/\bsubscript\b/gi, "_"], [/\bsuperscript\b/gi, "^"],
  [/\bpresubscript\b/gi, "_"], [/\bpresuperscript\b/gi, "^"],
  [/\bto the power of\b/gi, "^"], [/\bend exponent\b/gi, ""],
  [/\bend subscript\b/gi, ""], [/\bend superscript\b/gi, ""],
  [/\bsquared\b/gi, "^2"], [/\bcubed\b/gi, "^3"],
  [/\bplus-or-minus\b/gi, "+/-"], [/\bcross times\b/gi, "x"],
  [/\basterisk times\b/gi, "*"], [/\bdivided by\b/gi, "/"],
  [/\bpercent sign\b/gi, "%"], [/\bdegree\b/gi, "deg"],
  [/\bidentical to\b/gi, "==="],
  [/\bless than or equal to\b/gi, "<="], [/\bgreater than or equal to\b/gi, ">="],
  [/\bless or equal than\b/gi, "<="], [/\bgreater or equal than\b/gi, ">="],
  [/\brightwards double arrow\b/gi, "<->"], [/\brightwards arrow\b/gi, "->"],
  [/\bleftwards arrow\b/gi, "<-"], [/\bdirect double arrow\b/gi, "<=>"],
  [/\bintersection\b/gi, "AND"], [/\bunion\b/gi, "OR"], [/\bempty set\b/gi, "{}"],
  [/\balmost equal to\b/gi, "~="], [/\bproportional to\b/gi, "prop"],
  [/\btable row\b/gi, "| "], [/\bend table\b/gi, " |"],
  [/\bend cell\b/gi, " |"], [/\brow\b/gi, " | "], [/\bcell\b/gi, ""],
  [/\bend enclose\b/gi, ""], [/\benclose\b/gi, ""],
  [/\bend strike\b/gi, ""], [/\bup diagonal strike\b/gi, "/"],
  [/\bdown diagonal strike\b/gi, "/"], [/\bhorizontal strike\b/gi, "--"],
  [/\bend style\b/gi, ""], [/\bbegin mathsize \d+px style\b/gi, ""],
  [/\bstack sum\b/gi, "SUM"], [/\bsum from\b/gi, "SUM_"], [/\bsum for\b/gi, ""],
  [/\bcircle enclose\s*(\d+|[a-z])\b/gi, "($1)"],
  [/\binfinity\b/gi, "inf"], [/\belement of\b/gi, "in"],
  [/\bnot equal to\b/gi, "!="],
  [/\bstraight\b/gi, ""], [/\bbold\b/gi, ""], [/\bitalic\b/gi, ""],
  [/\bstack\b/gi, ""], [/\battributes\b/gi, ""],
  [/\bwith subscript\b/gi, "_"], [/\bwith superscript\b/gi, "^"],
  [/\bblank\b/gi, "_"],
  [/\bplus sign\b/gi, "+"], [/\bminus sign\b/gi, "-"],
  [/\bplus\b/gi, "+"], [/\bminus\b/gi, "-"], [/\btimes\b/gi, "*"],
  [/\bequals\b/gi, "="], [/\bover\b/gi, "/"], [/\bpercent\b/gi, "%"],
  [/\broot\b/gi, "sqrt"], [/\bstrike\b/gi, ""],
  [/\bapostrophe\b/gi, "'"], [/\bcomma\b/gi, ","], [/\bperiod\b/gi, "."],
  [/\bth\b space\b/gi, " "], [/\bspace\b/gi, " "],
];

export function ciePlainCollapse(s: string): string | null {
  let t = s.replace(/\s+/g, " ").trim();
  // innermost-first structured fractions keep their arguments readable
  for (let i = 0; i < 6; i++) {
    const next = t.replace(
      /fraction numerator ((?:(?! over denominator|fraction numerator ).)+) over denominator ((?:(?! end fraction|fraction numerator ).)+?) end fraction/gi,
      "($1)/($2)",
    );
    if (next === t) break;
    t = next;
  }
  for (const [re, to] of COLLAPSE) t = t.replace(re, to);
  t = t.replace(/\s{2,}/g, " ").trim();
  if (GATE_MARK.test(t)) return null; // guard: never leave grammar behind
  if (!t || t === s.trim()) return null;
  return t;
}
