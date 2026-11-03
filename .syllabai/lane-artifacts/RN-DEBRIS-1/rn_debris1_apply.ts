/**
 * RN-DEBRIS-1 apply engine — the \text{}/MathML-speech debris cleanup run.
 *
 * Dict-less descendant of patch_corpus_math_23a.ts (the aria→MathML→LaTeX
 * page dictionaries are not present in this environment; the residual
 * 655/1/10/107/9 population already exhausted the dict chain at the last
 * full run, so the grammar path is the honest floor).
 *
 * Classes (mirroring verify_corpus_23a.ts):
 *   span      single-line code spans with MARK content → $latex$ (extendedChain)
 *   dollar    $…$ segments with MARK content → $latex$
 *   multiline backtick spans with newlines → LINE-WISE conversion
 *   textwrap  \text{of}/\text{ of } connective → \times; the authored
 *             \text{numerator}/\text{denominator} quartet is LEFT (faithful
 *             labeling, not debris) and disclosed in the refreeze frozenNote
 *   baretext  MARK_STRONG lines outside math delimiters → $latex$ (guarded:
 *             never table rows `|…`, never `![`-led alt lines, never lines
 *             containing backticks/$)
 *
 * Safety laws: every replacement katexOk(throwOnError) && !hasResidualGrammar
 * && !double-escape; unfixed content stays verbatim (renders as code, never
 * garbage); serialization JSON.stringify(d,null,1)+"\n" (pinned byte-exact);
 * unchanged files are written back byte-identical (verified round-trip).
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import katex from "katex";
import { looksLikeSpeechText, speechToTexSafe } from "./speech-math";
import { speechExtras, symbolPreMap, stripSpaceTokens, hasResidualGrammar } from "./speech-extras";

const CONTENT = "/home/z/my-project/repos/syllabai-v2/apps/hub/content";

const MARK = /\b(open parentheses|close parentheses|open bracket|close bracket|open curly|close curly|open square brackets|close square brackets|open angle brackets|close angle brackets|fraction numerator|over denominator|end fraction|end table|end cell|end row|end stack|end attributes|end style|end enclose|end exponent|to the power|square root|end root|cube root|with bar on top|subscript|superscript|presubscript|presuperscript|stack sum|sum from|sum for|begin mathsize|rightwards arrow|left parenthesis|right parenthesis|left bracket|right bracket|vertical line|vertical strike|horizontal strike|identical to|cross times|plus-or-minus|end strike|asterisk times|enclose|up diagonal strike|down diagonal strike|intersection|union|empty set|proportional to|almost equal to|less or equal than|greater or equal than|apostrophe)\b/i;

const MARK_STRONG =
  /\b(end enclose|end table|end cell|end row|end stack|end attributes|end style|begin mathsize|presubscript|presuperscript|end strike|fraction numerator|over denominator|end fraction|end exponent|stack sum)\b/i;

// ── extended grammar (frozen at probe r8; see harness extend.ts) ──
function katexOk(tex: string): boolean {
  try { katex.renderToString(tex, { throwOnError: true, strict: "ignore" }); return true; }
  catch { return false; }
}
function guarded(tex: string | null): string | null {
  if (!tex || !katexOk(tex) || hasResidualGrammar(tex)) return null;
  if (/\\\\[a-z]/.test(tex)) return null; // double-escape guard
  // verify-gate MARK residue guard (extras GRAMMAR lacks union/intersection/
  // apostrophe — leaked \text{} wraps of those slipped its check)
  if (MARK.test(tex.replace(/\\[a-zA-Z]+/g, " ").replace(/\\text\s*\{[^{}]*\}/g, " ")) && MARK.test(tex)) {
    const stripped = tex.replace(/\\text\s*\{[^{}]*\}/g, " ");
    if (MARK.test(stripped.replace(/\\[a-zA-Z]+/g, " "))) return null;
  }
  return tex;
}
function baseChain(k: string): string | null {
  const extra = speechExtras(k);
  if (extra && katexOk(extra) && !hasResidualGrammar(extra)) return extra;
  if (looksLikeSpeechText(k)) {
    for (const v of [k, symbolPreMap(k), stripSpaceTokens(k), stripSpaceTokens(symbolPreMap(k))]) {
      if (!looksLikeSpeechText(v)) continue;
      const tex = speechToTexSafe(v);
      if (tex && katexOk(tex) && !hasResidualGrammar(tex)) return tex;
    }
  }
  return null;
}
function directChain(s: string): string | null {
  for (const v of [s, symbolPreMap(s)]) {
    const tex = guarded(speechToTexSafe(v));
    if (tex) return tex;
  }
  return null;
}
function encloseAtom(tok: string): string {
  return tok
    .replace(/\bdegree\b/g, "{}^{\\circ}")
    .replace(/\bapostrophe\b/g, "'")
    .replace(/\bdouble apostrophe\b/g, "''")
    .replace(/\bequals\b/g, "=")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .trim();
}
function enclosePass(s: string): string {
  let out = s;
  // degree/minute/second marks — full boxed form first (the box payload
  // class cannot span the emitted braces), then the bare run
  out = out.replace(/\bbox enclose degree apostrophe double apostrophe end enclose\b/g,
    " \\boxed{{}^{\\circ}\\;{}'\\;{}''} ");
  out = out.replace(/\bdegree apostrophe double apostrophe\b/g, " {}^{\\circ}{}'{}'' ");
  out = out.replace(/\bdegree apostrophe\b/g, " {}^{\\circ}{}' ");
  out = out.replace(/\bapostrophe double apostrophe\b/g, " {}'{}'' ");
  out = out.replace(/\bcircle enclose (\d+(?: \d+)*)/g, (_m, d: string) =>
    [...d.replace(/ /g, "")].map((c) => `\\textcircled{${c}}`).join(""));
  out = out.replace(/\bbox enclose ([A-Za-z0-9=+°'. ]+?)(?=\b(?:enclose|end enclose)\b|$| [a-z]{4,})/g,
    (_m, a: string) => ` \\boxed{${encloseAtom(a)}} `);
  out = out.replace(/\bbottom enclose ([A-Za-z0-9=+°'.]+?)(?=\b(?:enclose|end enclose)\b|$| [a-z]{4,})/g,
    (_m, a: string) => ` \\underline{${encloseAtom(a)}} `);
  out = out.replace(/\btop enclose ([A-Za-z][A-Za-z0-9]*)/g, (_m, a: string) => ` \\vec{${a}} `);
  out = out.replace(/\bend enclose\b/g, " ");
  out = out.replace(/\bdegree sign\b/g, "{}^{\\circ}").replace(/\bdegree\b/g, "{}^{\\circ}");
  return out;
}
function isoPass(s: string): string {
  let out = s;
  out = out.replace(/−/g, " - ");
  out = out.replace(/≠/g, " not equal to ");
  out = out.replace(/≈/g, " almost equal to ");
  out = out.replace(/∈/g, " element of ");
  out = out.replace(/([A-Za-z]+) presubscript (\d+) presuperscript (\d+) superscript (plus|minus|negative|plus sign|minus sign|negative sign)(?: (\d+))?/g,
    (_m, el: string, a: string, b: string, sign: string, n?: string) => {
      const ch = /plus/.test(sign) ? "+" : "-";
      return `{}_${a}^{${b}}\\mathrm{${el}}^{${ch}${n ?? ""}}`;
    });
  out = out.replace(/scriptbase text ([^ ]+) end text end scriptbase/g, " \\mathrm{$1} ");
  const VAL = "(midline horizontal ellipsis|\\.+|blank|negative sign \\d+|negative \\d+|minus sign \\d+|plus sign \\d+|[A-Za-z](?: ?- ?\\d+| ?\\+ ?\\d+)?|[A-Za-z]?(?:-\\d+|\\+\\d+|\\d+)|[A-Za-z]+(?: plus \\d+| minus \\d+)?)";
  const clean = (v: string) => v
    .replace(/\bnegative sign\b|\bnegative\b/g, "-").replace(/\bminus sign\b|\bminus\b/g, "-")
    .replace(/\bplus sign\b|\bplus\b/g, "+").replace(/\bblank\b/g, "")
    .replace(/\.{3,}|\bmidline horizontal ellipsis\b/g, "\\cdots ").trim();
  out = out.replace(new RegExp(`presubscript\\s*${VAL}\\s*end presubscript\\s*presuperscript\\s*${VAL}\\s*end presuperscript`, "g"),
    (_m, sub: string, sup: string) => `{}_${clean(sub)}^{${clean(sup)}}`);
  out = out.replace(new RegExp(`presubscript\\s*${VAL}\\s*end presubscript\\s*presuperscript\\s*blank`, "g"),
    (_m, sub: string) => `{}_${clean(sub)}^{ }`);
  out = out.replace(/superscript plus\b/g, " ^{+} ");
  out = out.replace(/superscript minus\b/g, " ^{-} ");
  out = out.replace(/presubscript (\d+) presuperscript (\d+)/g, (_m, a: string, b: string) => `{}_${a}^{${b}}`);
  out = out.replace(/presuperscript (\d+)/g, (_m, a: string) => ` ^{${a}} `);
  out = out.replace(/presubscript (\d+) presuperscript blank/g, (_m, a: string) => ` {}_${a}^{ } `);
  out = out.replace(/presuperscript\s+([a-zA-Z])_\s+([a-zA-Z0-9]+)/g, (_m, a: string, b: string) => ` ^{${a}} _{${b}} `);
  out = out.replace(/presuperscript\s+([\w]+)\s+subscript\s+([\w]+)/g, (_m, a: string, b: string) => ` ^{${a}} _{${b}} `);
  return out;
}
export function miscPass(s: string): string {
  let out = s;
  // un-wrap leaked \text{} speech words (idempotent: also repairs the
  // already-landed r0 forms during re-runs)
  out = out.replace(/\\text\s*\{\s*union\s*\}/g, " \\cup ");
  out = out.replace(/\\text\s*\{\s*intersection\s*\}/g, " \\cap ");
  out = out.replace(/\\text\s*\{\s*double\s*\}\s*\\text\s*\{\s*apostrophe\s*\}/g, "''");
  out = out.replace(/\\text\s*\{\s*apostrophe\s*\}/g, " '");
  out = out.replace(/\\text\s*\{\s*double\s*\}/g, " ");
  // fresh speech vocabulary — pre-mapped so extras' genericChain cannot
  // prose-wrap them (its GRAMMAR lacks union/intersection/apostrophe)
  out = out.replace(/\bdouble apostrophe\b/g, "''");
  out = out.replace(/\bapostrophe\b/g, " '");
  out = out.replace(/\bunion\b/g, " \\cup ");
  out = out.replace(/\bintersection\b/g, " \\cap ");
  out = out.replace(/\bsize \d+px\b/g, " ");
  out = out.replace(/\bstack (?!sum\b)/g, " ");
  out = out.replace(/\bstretchy left curly bracket\b/g, " open curly brackets ");
  out = out.replace(/\bstretchy right curly bracket\b/g, " close curly brackets ");
  out = out.replace(/\bleft curly bracket\b/g, " open curly brackets ");
  out = out.replace(/\bright curly bracket\b/g, " close curly brackets ");
  out = out.replace(/\bbold (?=intersection|union\b)/g, " ");
  out = out.replace(/\bopen angle brackets\b/g, " \\langle ").replace(/\bclose angle brackets\b/g, " \\rangle ");
  out = out.replace(/\bopen vertical bar\b/g, " \\lvert ").replace(/\bclose vertical bar\b/g, " \\rvert ");
  out = out.replace(/\bless or equal than\b/g, " \\le ").replace(/\bgreater or equal than\b/g, " \\ge ");
  out = out.replace(/\b([a-zA-Z])_ (\d+|[a-zA-Z])(?=[\s).,=+-]|$)/g, "$1 _{$2}");
  out = out.replace(/integral_ ([\w{}\\ ]+?) end_? superscript ([\w{}\\ ]+?) end superscript/g,
    (_m, a: string, b: string) => ` \\int_{${a.trim()}}^{${b.trim()}} `);
  out = out.replace(/integral_ ([\w{}\\ ]+?) superscript ([\w{}\\ ]+?)(?: end superscript|\s|$)/g,
    (_m, a: string, b: string) => ` \\int_{${a.trim()}}^{${b.trim()}} `);
  out = out.replace(/^(sum from .+? to .+?) of\s*$/i, "$1 of ");
  out = out.replace(/\bof u subscript (\w+)\b/g, " of u_{$1} ");
  out = out.replace(/presuperscript\s+([\w]+)\s+subscript\s+([\w]+)/g, (_m, a: string, b: string) => ` ^{${a}} _{${b}} `);
  out = out.replace(/\bnot an element of\b/g, " not element of ");
  out = out.replace(/presubscript blank presuperscript (\d+)/g, (_m, n: string) => ` {}_{ }^{${n}} `);
  out = out.replace(/bold italic (π|μ|σ|θ|φ|ω|Ω|Δ|α|β|γ|λ)/g, (_m, g: string) => {
    const names: Record<string, string> = { "π": "pi", "μ": "mu", "σ": "sigma", "θ": "theta", "φ": "phi", "ω": "omega", "Ω": "Omega", "Δ": "Delta", "α": "alpha", "β": "beta", "γ": "gamma", "λ": "lambda" };
    return ` bold italic ${names[g]} `;
  });
  out = out.replace(/\b(months|years|weeks|days|hours|minutes|seconds)\b/g, " \\text{$1} ");
  out = out.replace(/open curly brackets ([^{}]*?) close curly brackets/g, (m, inner: string) => {
    const norm = inner.replace(/\bspace\b/g, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{2,} [A-Za-z]{2,}/.test(norm) &&
        !/\b(colon|greater|less|equal|than|negative|plus|minus|times|divided|root|power|fraction|parenthes|bracket|curly|percent|degree|squared|cubed|element|not|blank|vertical)\b/i.test(norm)) {
      return ` \\{\\text{ ${norm} }\\} `;
    }
    return m;
  });
  return out;
}
export function extendedChain(k: string): string | null {
  const composed = [k, miscPass(k), enclosePass(k), isoPass(k), miscPass(enclosePass(isoPass(miscPass(k))))];
  const seen = new Set<string>();
  for (const c of composed) {
    if (seen.has(c)) continue;
    seen.add(c);
    const t = baseChain(c) ?? directChain(c);
    if (t) return t;
  }
  return null;
}

// ── text patching ──────────────────────────────────────────────────
const stats = {
  files: 0, filesChanged: 0,
  spanSeen: 0, spanFixed: 0, spanUnfixed: [] as any[],
  dollarSeen: 0, dollarFixed: 0,
  mlSeen: 0, mlFixed: 0,
  textwrapFixed: 0,
  bareSeen: 0, bareFixed: 0, bareUnfixed: [] as any[],
};

const CODE = /`([^`\n]+)`/g;
const DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;

function patchString(src: string, loc: string): string {
  let out = src;
  // 1. single-line code spans
  if (out.includes("`")) {
    out = out.replace(CODE, (whole, inner: string) => {
      if (!MARK.test(inner)) return whole;
      stats.spanSeen++;
      const tex = extendedChain(inner);
      if (tex) { stats.spanFixed++; return `$${tex}$`; }
      if (stats.spanUnfixed.length < 50) stats.spanUnfixed.push({ loc, text: inner.slice(0, 120) });
      return whole;
    });
  }
  // 2. $…$ segments
  if (out.includes("$")) {
    out = out.replace(DOLLAR, (whole, inner: string) => {
      if (!MARK.test(inner)) return whole;
      stats.dollarSeen++;
      const tex = extendedChain(inner);
      if (tex) { stats.dollarFixed++; return `$${tex}$`; }
      return whole;
    });
  }
  // 3. multi-line backtick spans → line-wise
  if (out.includes("`") && out.includes("\n")) {
    out = out.replace(/`([^`]+)`/gs, (whole, inner: string) => {
      if (!inner.includes("\n")) return whole;
      stats.mlSeen++;
      let changed = 0;
      const lines = inner.split("\n").map((line) => {
        if (!MARK.test(line)) return line;
        const tex = extendedChain(line);
        if (tex) { changed++; return `$${tex}$`; }
        return line;
      });
      if (changed > 0) stats.mlFixed++;
      return lines.join("\n");
    });
  }
  // 4. \text{of} connective (flashcards) — authored numerator/denominator LEFT
  if (/\\text\s*\{\s*of\s*\}/.test(out)) {
    const next = out.replace(/\\text\s*\{\s*of\s*\}/g, " \\times ");
    if (next !== out) { stats.textwrapFixed++; out = next; }
  }
  // 5b. prose isotope fragments: "beta presubscript −1 presuperscript 0" in
  // prose lines that cannot whole-line convert (prose prefix) — inline $…$
  if (MARK_STRONG.test(out)) {
    const frag = (s: string) => s.replace(/([A-Za-zβγ]+) presubscript (−?\d+|\?) presuperscript (−?\d+|\?)/g,
      (_m, el: string, z: string, a: string) => {
        const base = ["beta", "gamma", "alpha"].includes(el) ? `\\${el}` : `\\mathrm{${el}}`;
        const tex = `{}_${z.replace("−", "-")}^{${a.replace("−", "-")}}${base}`;
        return katexOk(tex) ? `$${tex}$` : _m;
      });
    const lines2 = out.split("\n");
    let fragChanged = 0;
    const conv2 = lines2.map((line) => {
      const t2 = line.trim();
      if (!t2 || t2.startsWith("![") || t2.startsWith("|") || line.includes("`") || line.includes("$")) return line;
      if (!MARK_STRONG.test(t2)) return line;
      const next = frag(line);
      if (next !== line) { fragChanged++; stats.bareFixed++; }
      return next;
    });
    if (fragChanged > 0) out = conv2.join("\n");
  }
  // 5. bare speech lines (scrape lost the formatting) — guarded
  if (MARK_STRONG.test(out)) {
    const lines = out.split("\n");
    let changed = 0;
    const conv = lines.map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("![") || t.startsWith("|") || line.includes("`") || line.includes("$")) return line;
      if (!MARK_STRONG.test(t)) return line;
      const tex = extendedChain(t);
      if (tex) { changed++; stats.bareFixed++; return line.replace(t, `$${tex}$`); }
      if (stats.bareUnfixed.length < 50) stats.bareUnfixed.push({ loc, text: t.slice(0, 120) });
      stats.bareSeen++;
      return line;
    });
    if (changed > 0) out = conv.join("\n");
  }
  return out;
}

function walk(o: any, loc: string, changed: { v: boolean }): any {
  if (typeof o === "string") {
    const next = patchString(o, loc);
    if (next !== o) changed.v = true;
    return next;
  }
  if (Array.isArray(o)) return o.map((v) => walk(v, loc, changed));
  if (o && typeof o === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) out[k] = walk(v, loc, changed);
    return out;
  }
  return o;
}

// ── main ───────────────────────────────────────────────────────────
import { readdirSync } from "fs";
if ((import.meta as any).main) {
const report: any = { packages: {} };
for (const pkg of readdirSync(CONTENT)) {
  const pdir = `${CONTENT}/${pkg}`;
  let isDir = false;
  try { isDir = readdirSync(pdir).length >= 0; } catch { isDir = false; }
  if (!isDir) continue;  // eslint-disable-next-line
  for (const fn of ["notes.json", "questions.json", "official-papers.json", "flashcards.json"]) {
    const p = `${pdir}/${fn}`;
    if (!existsSync(p)) continue;
    stats.files++;
    const raw = readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    // serialization law: PRESERVE each file's own format (the content tree is
    // mixed — compact JSON.stringify vs indent=1+NL). Detect on the pristine
    // parse; unchanged files round-trip byte-identical by construction.
    const isPretty = JSON.stringify(data, null, 1) + "\n" === raw;
    const changed = { v: false };
    const next = walk(data, `${pkg}/${fn}`, changed);
    if (!changed.v) continue; // byte-identical by construction (same parse/print)
    const outText = isPretty ? JSON.stringify(next, null, 1) + "\n" : JSON.stringify(next);
    writeFileSync(p, outText);
    stats.filesChanged++;
    report.packages[`${pkg}/${fn}`] = true;
  }
}
console.log(JSON.stringify({
  files: stats.files, filesChanged: stats.filesChanged,
  spanSeen: stats.spanSeen, spanFixed: stats.spanFixed, spanUnfixed: stats.spanUnfixed.length,
  dollarSeen: stats.dollarSeen, dollarFixed: stats.dollarFixed,
  mlSeen: stats.mlSeen, mlFixed: stats.mlFixed,
  textwrapFixed: stats.textwrapFixed,
  bareFixed: stats.bareFixed, bareUnfixed: stats.bareUnfixed,
  spanUnfixedList: stats.spanUnfixed,
}, null, 1));
writeFileSync("/home/z/my-project/work/rn_debris1_apply_report_r0.json", JSON.stringify({ stats: { ...stats, spanUnfixed: undefined, bareUnfixed: undefined }, spanUnfixed: stats.spanUnfixed, bareUnfixed: stats.bareUnfixed, packages: Object.keys(report.packages) }, null, 1));
console.log("report saved");
}
