/**
 * Corpus math normalizer — KaTeX pre-processor for SME-derived content.
 *
 * Research finding (2026-09-18): SaveMyExams ships ZERO client-side math
 * dependencies — they emit native MathML (`<math xmlns="…/Math/MathML">`,
 * authored in Wiris MathType, `<semantics><annotation
 * encoding="application/vnd.wiris.mtweb-params+json">`) and let browser
 * MathML Core render it. Our corpus took a different path upstream: the
 * Wiris MathML was converted to LaTeX `$…$`, so KaTeX is the right renderer
 * here — but the conversion was lossy in one systematic way: it dropped the
 * space between a control word and the variable that follows it
 * (`A\capB`, `a^{m}\timesa^{n}`, `y\leqx`, `\DeltaE`, `V=IR\RightarrowR=…`).
 * KaTeX then fails with "Undefined control sequence" and the app shows the
 * raw source in red. Corpus audit: 102,963 math segments, 2,532 parse
 * errors, 97.5% of them this single glued-macro class.
 *
 * normalizeCorpusMath fixes all of that safely, without touching prose:
 *   1. inside `$…$` / `$$…$$` segments, re-splits glued macros
 *      (`\capB` → `\cap B`) using a longest-known-prefix match. Inserting a
 *      space between a control word and a letter never changes the meaning
 *      of input that already parses, and repairs input that doesn't.
 *   2. converts `\(...\)` inline-math delimiters (165 segments, unsupported
 *      by remark-math) to `$…$` — but only when the content parses as
 *      valid KaTeX math, so escaped-prose parentheses like `\(see note\)`
 *      are left untouched.
 *
 * Strings without any `$` or `\(` short-circuit untouched.
 */

import katex from "katex";
import { looksLikeSpeechText, speechToTexSafe } from "./speech-math";

/** KaTeX control words that appear (or plausibly appear) glued to variables
 * in the corpus. Matched longest-first, so e.g. `\leq` wins over `\le`,
 * `\dots` over `\dot`, `\subseteq` over `\subset` over `\sup`. */
const MACRO_NAMES = [
  // Greek (upper + lower) and variant forms
  "Delta", "Gamma", "Lambda", "Sigma", "Omega", "Theta", "Phi", "Psi",
  "Upsilon", "Xi", "Pi",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "rho", "sigma",
  "tau", "upsilon", "phi", "chi", "psi", "omega",
  "varepsilon", "vartheta", "varphi", "varpi", "varrho", "varsigma",
  "imath", "jmath", "ell", "hbar", "aleph",
  // relations
  "leq", "geq", "neq", "equiv", "approx", "sim", "simeq", "cong",
  "propto", "le", "ge", "ne",
  // set algebra
  "cap", "cup", "in", "notin", "subset", "supset", "subseteq", "supseteq",
  "emptyset", "setminus", "bigcap", "bigcup", "bigsqcup", "biguplus",
  "infty", "int", "iint", "iiint", "oint", "idotsint", "injlim",
  // binary operators
  "times", "div", "pm", "mp", "cdot", "ast", "star", "circ", "bullet",
  "oplus", "ominus", "otimes", "odot", "wedge", "vee", "land", "lor",
  "bigoplus", "bigotimes", "bigodot", "bigvee", "bigwedge",
  // arrows
  "Rightarrow", "Leftarrow", "Leftrightarrow", "rightarrow", "leftarrow",
  "leftrightarrow", "longrightarrow", "longleftarrow", "longleftrightarrow",
  "implies", "iff", "to", "gets", "mapsto", "longmapsto",
  "hookrightarrow", "hookleftarrow", "uparrow", "downarrow", "updownarrow",
  "Uparrow", "Downarrow", "Updownarrow", "rightleftharpoons",
  "xrightleftharpoons", "xleftrightarrow",
  // named functions
  "sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "coth",
  "arcsin", "arccos", "arctan", "log", "ln", "lg", "exp", "max", "min",
  "lim", "limsup", "liminf", "sup", "gcd", "deg", "det", "dim", "arg",
  "hom", "ker", "Pr", "mod", "bmod", "pmod",
  // big operators
  "sum", "prod", "coprod",
  // accents, bars, decorations
  "hat", "bar", "vec", "dot", "tilde", "overline", "underline",
  "overbrace", "underbrace", "widehat", "widetilde", "overleftarrow",
  "overrightarrow", "overleftrightarrow", "stackrel", "overset",
  "underset", "ddots", "vdots", "dots", "ldots", "cdots",
  // text / font switches
  "text", "textbf", "textit", "texttt", "textrm", "textsf", "textnormal",
  "mathrm", "mathbf", "mathit", "mathbb", "mathcal", "mathfrak", "mathscr",
  "mathsf", "mathtt", "boldsymbol", "pmb",
  // structure
  "sqrt", "frac", "dfrac", "tfrac", "binom", "dbinom", "tbinom", "over",
  // TeX primitives / delimiters emitted by MathML→LaTeX converters — these
  // MUST be known, else fixGluedMacros splits them ("\left" → "\le ft"!)
  "left", "right", "begin", "end", "middle", "open", "close",
  "cancel", "bcancel", "xcancel", "sout", "overbrace", "underbrace",
  "xrightarrow", "xleftarrow", "xleftrightarrow", "substack",
  "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle",
  "limits", "nolimits", "big", "Big", "bigg", "Bigg",
  "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "bigm", "Bigm",
  // T-UGM-RENDER-1: the bigl/biggr family was missing the \bigg/\Bigg
  // mid/left/right variants — fixGluedMacros split `\Biggl(` into
  // `\Bigg l(` (invalid KaTeX delimiter) on live UGM bodies
  "biggl", "biggr", "biggm", "Biggl", "Biggr", "Biggm",
  "mathopen", "mathclose", "mathop", "mathbin", "mathrel", "mathord",
  "lvert", "rvert", "lVert", "rVert", "vert", "Vert", "lbrace", "rbrace",
  "operatorname", "hspace", "kern", "mkern", "phantom", "hphantom",
  "vphantom", "llap", "rlap", "not", "pmb", "middle", "tag",
  // misc symbols
  "langle", "rangle", "angle", "perp", "parallel", "mid", "nmid",
  "therefore", "because", "forall", "exists", "neg", "wp", "Re", "Im",
  "quad", "qquad",
].sort((a, b) => b.length - a.length);

const MACRO_SET = new Set(MACRO_NAMES);

/**
 * Re-splits glued macros inside a math segment: `A\capB` → `A\cap B`.
 *
 * Walks every `\word` token; when the full word is NOT a known KaTeX macro
 * but has a longest known prefix, a space is inserted after that prefix.
 * Tokens whose full word IS known (`\overset`, `\overline`, `\int`…) are
 * never rewritten, so valid input is untouched — no regex-backtracking
 * pitfalls like `\overset{…}` being mis-split into `\over set{…}`.
 */
export function fixGluedMacros(tex: string): string {
  return tex.replace(/\\([a-zA-Z]+)/g, (match, word: string) => {
    if (MACRO_SET.has(word)) return match;
    for (const name of MACRO_NAMES) {
      // MACRO_NAMES is sorted longest-first
      if (word.startsWith(name)) {
        return `\\${word.slice(0, name.length)} ${word.slice(name.length)}`;
      }
    }
    return match;
  });
}

/**
 * Full math-value sanitizer used by the remark plugin (AST level):
 *  1. glue-split unknown `\word` tokens (fixGluedMacros);
 *  2. `%` → `\%` — KaTeX treats bare `%` as a comment start, silently
 *     swallowing the rest of the formula (`\text{4.2%}` broke);
 *  3. underscore runs `__`/`____` (fill-in-the-blank answers upstream) →
 *     escaped literal underscores — a bare `_` is a broken subscript.
 */
export function sanitizeMathTex(tex: string): string {
  // MathML speech text that slipped through as $…$ (remark-math saw it as
  // math, so the code-span path never touched it) — convert or fall through
  if (looksLikeSpeechText(tex)) {
    const converted = speechToTexSafe(tex);
    if (converted !== null) return converted;
  }
  return fixGluedMacros(repairTex(tex))
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/_{2,}/g, (run) => run.replace(/_/g, "\\_"));
}

/**
 * UGM display delimiters (T-UGM-RENDER-1). Underground Mathematics writes
 * display equations as \[…\] — remark-math has no \[ syntax, and CommonMark
 * eats the backslash as an escape, so every display equation currently
 * degrades to literal bracketed text (live audit 2026-10-27: 397 pure-1 +
 * 138 pure-3 resources). Same conversion law as \(…\) below, but gated on
 * DISPLAY parseability. Also caught by the same net (the IGCSE questions
 * corpus carries the identical construct, e.g. \[a = \sqrt{p^{3} b}\]).
 */
const DISPLAY_BRACKET_RE = /\\\[([\s\S]+?)\\\]/g;

/**
 * \label{…} (inert cross-reference anchors) and \eqref{…} ("(N)" equation
 * references) are LaTeX notebook macros KaTeX has no support for — every
 * segment carrying them fails parse and falls back to raw source. The UGM
 * corpus carries both everywhere (name-that-graph: 10 display equations
 * wrapped in \begin{equation}…\label{eq:N}\end{equation}, referenced from
 * prose as \(\eqref{eq:N}\)). Labels are semantically empty in KaTeX output
 * and \eqref is purely textual — strip/rewrite them GLOBALLY before any
 * delimiter handling runs, so the parse gates below see clean input.
 */
const LABEL_RE = /\\label\{[^{}]*\}/g;
const EQREF_RE = /\\eqref\{([^{}]*)\}/g;

/**
 * Strip \label{…}; rewrite \eqref{eq:N} → "(N)"; convert siunitx
 * \quantity{value}{unit} → value\,\text{unit} (KaTeX has no \quantity —
 * ~210 corpus hits); fix \biggm/ → \bigg/. All deterministic, meaning-
 * preserving rewrites of constructs KaTeX cannot parse.
 */
export function repairTex(src: string): string {
  if (!src.includes("\\") ) return src;
  let out = src;
  if (out.includes("\\label") || out.includes("\\eqref")) {
    out = out
      .replace(LABEL_RE, "")
      .replace(EQREF_RE, (_m, inner: string) => `(${inner.replace(/^eq:/, "")})`);
  }
  if (out.includes("\\hbox")) out = out.replace(/\\hbox\s*\{([^{}]*)\}/g, "\\text{$1}");
  if (out.includes("\\quantity")) out = convertSiunitxQuantity(out);
  if (out.includes("$")) out = spliceTextGroupMath(out);
  if (out.includes("\\arsinh") || out.includes("\\arcosh") || out.includes("\\artanh"))
    out = out.replace(/\\(arsinh|arcosh|artanh)(?![a-zA-Z])/g, "\\operatorname{$1}");
  // bespoke MathJax long-division macros (\cm*) have no KaTeX equivalent —
  // strip the DECORATION, keep the arithmetic (6 corpus segments; disclosed
  // degradation: the division bracket is lost, the layout numbers remain)
  if (out.includes("\\cm")) {
    out = out.replace(/\\cmlongdivbr(?![a-zA-Z])/g, "");
    out = out.replace(/\\cmlongdiv(?=\s*\{)/g, "");
    for (;;) {
      const at = out.indexOf("\\cmarraystretch");
      if (at < 0) break;
      const g = readBraceGroup(out, at + "\\cmarraystretch".length);
      out = g ? out.slice(0, at) + out.slice(g.end) : out.slice(0, at);
    }
  }
  return out;
}

/** Read one balanced `{…}` group starting at (or just after) `from`. */
function readBraceGroup(src: string, from: number): { body: string; end: number } | null {
  let j = from;
  while (j < src.length && /\s/.test(src[j])) j++;
  if (src[j] !== "{") return null;
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(j + 1, k), end: k + 1 };
    }
  }
  return null;
}

/**
 * `$` inside \text{…} groups (`\text{area of circle $C$}` — UGM circles
 * corpus, live): KaTeX forbids `$` in text mode AND remark-math's inline
 * scan terminates at the inner `$`, splitting the segment. Splice the math
 * out: `\text{A $B$ C}` → `\text{A }B\text{ C}`.
 */
function spliceTextGroupMath(src: string): string {
  if (!src.includes("$")) return src;
  let prev = src;
  for (;;) {
    const next = spliceTextGroupMathOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
}

function spliceTextGroupMathOnce(src: string): string {
  if (!src.includes("$")) return src;
  let out = "";
  let i = 0;
  for (;;) {
    const m = /\\(?:text|textbf|textit|textrm|textsf|textnormal)\s*\{/.exec(src.slice(i));
    if (!m) { out += src.slice(i); return out; }
    const at = i + m.index;
    // m[0] already ends WITH the opening `{` — readBraceGroup must start there
    const g = readBraceGroup(src, at + m[0].length - 1);
    if (!g) { out += src.slice(i, at + m[0].length); i = at + m[0].length; continue; }
    const body = g.body;
    if ((body.match(/\$/g) || []).length < 2) { out += src.slice(i, g.end); i = g.end; continue; }
    const parts = body.split("$");
    const tail = parts.slice(2).join("$");
    out += src.slice(i, at) + `\\text{${parts[0]}}${parts[1]}\\text{${tail}}`;
    i = g.end;
  }
}

/** siunitx \quantity{value}{unit} → value\,\text{unit} (balanced-brace safe).
 *  Units carry `^` (m\,s^{-1}, cm^2) — KaTeX \text{} forbids superscripts,
 *  so the unit's first `^` hoists out: `m\,s^{-1}` → `\text{m\,s}^{-1}`.
 *  Units carrying MACROS (\mu m) — KaTeX \text{} forbids those too — take
 *  the math path with letters uprighted: `\mu m` → `{\mu\mathrm{ m}}`. */
function convertSiunitxQuantity(src: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const at = src.indexOf("\\quantity", i);
    if (at < 0) { out += src.slice(i); return out; }
    const g1 = readBraceGroup(src, at + "\\quantity".length);
    if (!g1) { out += src.slice(i, at + "\\quantity".length); i = at + "\\quantity".length; continue; }
    const g2 = readBraceGroup(src, g1.end);
    if (!g2) { out += src.slice(i, g1.end); i = g1.end; continue; }
    const unit = g2.body;
    let rendered: string;
    if (unit.includes("\\")) {
      rendered = `{${unit.split(/(\\[a-zA-Z]+)/).map((p) => (p.startsWith("\\") || !/[a-zA-Z]/.test(p) ? p : `\\mathrm{${p}}`)).join("")}}`;
    } else {
      const caret = unit.indexOf("^");
      if (caret < 0) {
        rendered = `\\text{${unit}}`;
      } else {
        const tailRaw = unit.slice(caret + 1);
        const tail = tailRaw.startsWith("{") ? tailRaw : `{${tailRaw}}`;
        rendered = `\\text{${unit.slice(0, caret)}}^${tail}`;
      }
    }
    out += src.slice(i, at) + `${g1.body}\\,${rendered}`;
    i = g2.end;
  }
}

// segment delimiters (mirror remark-math's effective handling of this corpus)
const DISPLAY_RE = /(?<![a-zA-Z0-9]\\$)(?<!\\)\$\$([\s\S]+?)\$\$/g;
// (?<!\$): the second `$` of a `$$` fence must not open an inline scan —
// it cascaded through the following prose, splitting every later `$…$` pair
// (r9782/r7385 one-line `$$…$$` displays, live)
const INLINE_RE = /(?<!\\)(?<!\$)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
const PAREN_RE = /\\\((.+?)\\\)/g;

/**
 * \[…\] conversion (T-UGM-RENDER-1) — line-context aware:
 *   - a \[…\] occupying a whole line converts to a FLOW display fence
 *     (`$$` on its own lines — remark-math parses a one-line `$$…$$` as
 *     INLINE math, and display-only constructs like \begin{equation} then
 *     throw "can be used only in display mode");
 *   - a mid-line \[…\] converts to INLINE `$…$` (sentences, tables and
 *     list items keep flowing — the 10 table rows / 9 list items in the
 *     UGM corpus carry simple math);
 *   - display-only content mid-line falls back to the flow fence;
 *   - prose (per looksLikeProse) and unparseable content stay literal.
 */
function convertDisplayBrackets(part: string): string {
  if (!part.includes("\\[")) return part;
  let out = "";
  let last = 0;
  for (const m of part.matchAll(DISPLAY_BRACKET_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const fixed = fixGluedMacros((m[1] ?? "").trim());
    const lineStart = start === 0 || /(^|\n)[ \t]*$/.test(part.slice(0, start));
    const lineEnd = end === part.length || /^[ \t]*(\n|$)/.test(part.slice(end));
    let replacement: string | null = null;
    if (!looksLikeProse(fixed)) {
      const flow = `\n$$\n${fixed}\n$$\n`;
      const multiLine = (m[1] ?? "").includes("\n");
      if (lineStart && lineEnd && parses(fixed, true)) replacement = flow;
      else if (!multiLine && parses(fixed)) replacement = `$${fixed}$`;
      else if (parses(fixed, true)) replacement = flow;
    }
    // $$-adjacency guard on the OUTPUT tail: adjacent \[…\]\[…\] blocks
    // (r8781 live) convert to `$…$$…$` — remark-math re-parses the middle
    // `$$` as display math and the rest of the line breaks
    if (replacement !== null && replacement.startsWith("$") && out.endsWith("$")) {
      out += " ";
    }
    out += part.slice(last, start) + (replacement ?? m[0]);
    last = end;
  }
  out += part.slice(last);
  return out;
}

/**
 * Bare display environments in prose — `equation is \begin{equation*} …
 * \end{equation*}` with no `\[…\]` at all (r7839, live) — get flow-wrapped.
 * Runs AFTER the display-bracket pass, so converted `\[…\]` displays are
 * already `$$`-fenced and their inner envs are skipped by fence state.
 */
function wrapBareDisplayEnvs(src: string): string {
  if (!src.includes("\\begin{equation") && !src.includes("\\begin{align")) return src;
  let out = "";
  let i = 0;
  let inFence = false;
  for (;;) {
    const nl = src.indexOf("\n", i);
    const lineEnd = nl < 0 ? src.length : nl + 1;
    const line = src.slice(i, lineEnd);
    const t = line.trim();
    let skip = inFence;
    if (t.startsWith("$$") && !(t.endsWith("$$") && t.length > 4)) inFence = !inFence;
    else if (t.startsWith("$$") && t.endsWith("$$") && t.length > 4) skip = true;
    if (!skip && /\\begin\{(?:equation\*?|align\*?)\}/.test(line)) {
      out += line.replace(
        /(\\begin\{(?:equation\*?|align\*?)\}[\s\S]*?\\end\{(?:equation\*?|align\*?)\})/g,
        // `$$$$` — a `$$` literal in a replace() replacement string
        "\n$$$$\n$1\n$$$$\n",
      );
    } else {
      out += line;
    }
    if (nl < 0) return out;
    i = lineEnd;
  }
}

/** Is `tex` parseable by KaTeX? (throwOnError, silent strict-mode warnings) */
function parses(tex: string, display = false): boolean {
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Heuristic: real math never contains bare 3+-letter runs (long words only
 * appear inside control sequences like `\frac`). KaTeX parses plain English
 * words as implicit-multiplication variables, so parseability alone cannot
 * tell `\(z = \frac{1}{2}(5 \pm 4i)\)` from `\(see note 2\)` — this can.
 *
 * T-UGM-RENDER-1: `\text{…}`-family groups carry LEGITIMATE words inside
 * real math (`\[\sqrt{3}y=x+4 \qquad \textrm{and} \qquad \sqrt{3}y=-x+4\]`
 * — pairs-of-circles, live) — exempt their content or every such display
 * equation misclassifies as prose and stays literal. Same for `\begin{…}`
 * environment NAMES (equation, align, cases…).
 *
 * T-UGM-RENDER-1 corpus classification (2026-10-27, both UGM planes): the
 * blunt "any 3+-letter run" law misfired on 552 REAL math segments
 * (`kab` = k·a·b, `pqx^2`, `CBA(x)` — implicit multiplication) against 33
 * genuinely-prose segments. The law of record is therefore: prose = a
 * common-word run (stopword law) or a hyphenated lowercase slug
 * (`linear-equation-in-y-and-k`); single-token variable runs are math.
 */
const PROSE_WORD_RE =
  /\b(?:the|and|see|note|from|with|this|that|are|not|has|have|was|were|any|all|each|when|where|what|which|how|why|its|our|their|there|here|then|than|you|your|can|will|for|but|into|over|under|only|also|just|one|two|three|first|second|third|next|last|other|same|such|own|more|most|some|both|few|now|page|question|answer|diagram|figure|value|values|point|points|line|lines|circle|circles|gradient|equation|equations)\b/i;
// T-UGM-RENDER-1: two-letter stopwords (as, at, be, by, in, is, it, of, on,
// or, to, so, no, an, we, if) are deliberately EXCLUDED — they collide with
// variable names inside real math (`(bt-as)`, `\frac{ab^2-a(bt-as)}{…}`)
// and misgated 9 display equations; prose protection holds via the 3+ letter
// words (see, note, …) plus the hyphen-slug arm below.

export function looksLikeProse(tex: string): boolean {
  const withoutMacros = tex
    .replace(
      /\\(?:text|textbf|textit|texttt|textrm|textsf|textnormal|mathrm|mathit|mathbf|mathcal|mathbb|mathtt|mbox)\s*\{[^{}]*\}/g,
      "",
    )
    // \begin{…}/\end{…} environment NAMES (equation, align, cases…) are
    // structural, not words — exempt or \[\begin{equation} … \end{equation}\]
    // misclassifies as prose (live: every name-that-graph display equation).
    // Same for bare-brace word joiners the corpus writes inside real math:
    // `y = 2x - 6  { and }  y = 3x - 3` (straight-line-pairs, live)
    .replace(/\\(?:begin|end)\{[^{}]*\}/g, "")
    .replace(/\{[a-zA-Z][a-zA-Z\s.]*\}/g, "")
    .replace(/\\[a-zA-Z]+/g, "");
  if (!/[a-zA-Z]{3,}/.test(withoutMacros)) return false;
  // the hyphen-slug arm needs 4+ letter runs BOTH sides — 3-letter runs
  // around a hyphen are minus signs between variable products (`acx-bcx`),
  // not slugs like `linear-equation-in-y-and-k`
  return PROSE_WORD_RE.test(withoutMacros) || /[a-z]{4,}-[a-z]{4,}/.test(withoutMacros);
}

/**
 * Inline code spans carrying MathML speech text ("fraction numerator … end
 * fraction") are rendered today as long literal code runs — convert them to
 * proper KaTeX math. Strictly gated: only spans that look like speech AND
 * convert to parseable LaTeX become math; everything else stays untouched.
 * Fenced code blocks (``` … ```) are never modified.
 */
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const FENCE_SPLIT_RE = /(```[\s\S]*?(?:```|$))/g;

function convertSpeechCodeSpans(src: string): string {
  if (!src.includes("`")) return src;
  return src
    .split(FENCE_SPLIT_RE)
    .map((part, i) => {
      if (i % 2 === 1) return part; // captured fence segment — untouched
      return part.replace(INLINE_CODE_RE, (m, inner: string) => {
        if (!looksLikeSpeechText(inner)) return m;
        const tex = speechToTexSafe(inner);
        return tex === null ? m : `$${tex}$`;
      });
    })
    .join("");
}

/**
 * Normalize one markdown string's math content in place.
 * Cheap no-op for strings without `$` / `\(` / `\[` / `\label` / `\eqref`
 * (the vast majority of prose).
 */
export function normalizeCorpusMath(src: string): string {
  const hasBacktick = src.includes("`");
  const hasDollar = src.includes("$");
  const hasParen = src.includes("\\(");
  const hasBracket = src.includes("\\[");
  const hasTexRefs = src.includes("\\label") || src.includes("\\eqref");
  const hasBareEnv = /\\begin\{(?:equation\*?|align\*?)\}/.test(src);
  if (!hasBacktick && !hasDollar && !hasParen && !hasBracket && !hasTexRefs && !hasBareEnv)
    return src;

  let out = hasBacktick ? convertSpeechCodeSpans(src) : src;

  // \label{…} / \eqref{…} / \quantity{…}{…} repair (T-UGM-RENDER-1) —
  // outside fenced code blocks, BEFORE the delimiter passes, so the parse
  // gates below see clean KaTeX-parseable input.
  if (/\\(?:label|eqref|quantity|arsinh|arcosh|artanh|cmlongdiv|cmarraystretch)/.test(out) || out.includes("$")) {
    out = out
      .split(FENCE_SPLIT_RE)
      .map((part, i) => (i % 2 === 1 ? part : repairTex(part)))
      .join("");
  }

  const fixInner = (x: string): string => {
    if (!looksLikeSpeechText(x)) return fixGluedMacros(x);
    // speech text inside $…$ (694 corpus segments) — convert or keep
    return speechToTexSafe(x) ?? fixGluedMacros(x);
  };
  // \[…\] → display/inline math (T-UGM-RENDER-1) — outside fences, via the
  // line-context-aware converter above. Runs BEFORE the $-delimiter passes:
  // display blocks may contain $…$ themselves (UGM prose-with-math blocks),
  // which the $-scanner must not touch first.
  if (out.includes("\\[")) {
    out = out
      .split(FENCE_SPLIT_RE)
      .map((part, i) => (i % 2 === 1 ? part : convertDisplayBrackets(part)))
      .join("");
  }

  // bare display environments in prose (r7839 live: `equation is
  // \begin{equation*} … \end{equation*}` with NO \[ \] at all) — remark
  // has no env syntax, so they render as raw text; fence-wrap them
  out = wrapBareDisplayEnvs(out);

  {
    // builder loop: preserve a GLUED closer — `$$prose$$\mathbf…` (no space
    // after the closer) means that closer is the REAL math's opener; drop
    // only the stray opener + prose, keep the closer for the real pair
    let acc = "";
    let last = 0;
    for (const m of out.matchAll(DISPLAY_RE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const fixed = fixInner(m[1] ?? "");
      acc += out.slice(last, start);
      if (!fixed.includes("\\") && !fixed.includes("$") && looksLikeProse(fixed)) {
        const nextCh = out.slice(end, end + 1);
        if (nextCh !== "" && !/\s/.test(nextCh)) {
          acc += fixed + "$$"; // prose + glued closer stays for the real pair
        } else {
          acc += fixed;
        }
      } else {
        acc += `$$${fixed}$$`;
      }
      last = end;
    }
    acc += out.slice(last);
    out = acc;
  }
  {
    // builder loop: same $$-adjacency law as convertDisplayBrackets — two
    // adjacent $…$ inline maths must not fuse into a display fence
    let acc = "";
    let last = 0;
    for (const m of out.matchAll(INLINE_RE)) {
      const start = m.index ?? 0;
      acc += out.slice(last, start);
      if (acc.endsWith("$")) acc += " ";
      acc += `$${fixInner(m[1] ?? "")}$`;
      last = start + m[0].length;
    }
    acc += out.slice(last);
    out = acc;
  }

  // \(…) → $…$ only when the content is genuine (KaTeX-parseable) math;
  // remark-math has no \( delimiter, so these currently render as literal text.
  if (out.includes("\\(")) {
    // builder loop (not replace): the emit must check the OUTPUT tail —
    // two adjacent \(…\) groups convert to `$…$$…$`, and remark-math
    // re-parses the middle `$$` as display math (name-that-graph-again,
    // live: `\(1.5 \\times\)\(\\eqref{eq:5}\)`)
    let acc = "";
    let last = 0;
    for (const m of out.matchAll(PAREN_RE)) {
      const start = m.index ?? 0;
      const fixed = fixGluedMacros((m[1] ?? "").trim());
      const conv = !looksLikeProse(fixed) && parses(fixed) ? `$${fixed}$` : null;
      acc += out.slice(last, start);
      if (conv !== null) {
        if (acc.endsWith("$")) acc += " ";
        acc += conv;
      } else acc += m[0];
      last = start + m[0].length;
    }
    acc += out.slice(last);
    out = acc;
  }
  return out;
}
