/**
 * RN-DEBRIS-1 grammar extension — iterative harness (r3).
 *
 * SAFETY LAWS learned empirically:
 *  L1  speechToTex's input sanitizer strips every \n sequence — pre-passes
 *      must NEVER emit \n-initial LaTeX commands (\notin, \ne, \neg…).
 *      Emit the speech vocabulary the phrase table owns instead
 *      ("not element of" → \notin, "not equal to" → \ne).
 *  L2  `\bstraight ([a-zA-Z]+)\b` has no word boundary before `_` — subscript
 *      artifacts must be rewritten as `x _{1}` (space kept; the glue pass
 *      `\s+([\^_])\{` rejoins downstream).
 *  L3  every candidate string passes through the guarded chain:
 *      katexOk(throwOnError) && !hasResidualGrammar — garbage degrades to
 *      "keep original" (renders as code, never garbage math).
 */
import katex from "katex";
import { readFileSync, writeFileSync } from "fs";
import { looksLikeSpeechText, speechToTexSafe } from "./speech-math";
import { speechExtras, symbolPreMap, stripSpaceTokens, hasResidualGrammar } from "./speech-extras";

function katexOk(tex: string): boolean {
  try { katex.renderToString(tex, { throwOnError: true, strict: "ignore" }); return true; }
  catch { return false; }
}

function guarded(tex: string | null): string | null {
  if (!tex || !katexOk(tex) || hasResidualGrammar(tex)) return null;
  // recon-path double-escape guard: "\\times" = rowbreak+text garbage
  if (/\\\\[a-z]/.test(tex)) return null;
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

/** direct path for partially-transformed strings (no looksLike pre-gate) */
function directChain(s: string): string | null {
  for (const v of [s, symbolPreMap(s)]) {
    const tex = guarded(speechToTexSafe(v));
    if (tex) return tex;
  }
  return null;
}

// ── E1: enclose family ─────────────────────────────────────────────
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
export function enclosePass(s: string): string {
  let out = s;
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

// ── E2: isotope extensions ─────────────────────────────────────────
export function isoPass(s: string): string {
  let out = s;
  out = out.replace(/−/g, " - ");                 // L1-safe: plain minus
  out = out.replace(/≠/g, " not equal to ");      // L1-safe: speech vocab
  out = out.replace(/≈/g, " almost equal to ");
  out = out.replace(/∈/g, " element of ");
  // isotope + charge: "Li presubscript 3 presuperscript 7 superscript plus"
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
  // bare single-sided forms: "Fe presuperscript 56", "presubscript 88 presuperscript blank"
  out = out.replace(/presuperscript (\d+)/g, (_m, a: string) => ` ^{${a}} `);
  out = out.replace(/presubscript (\d+) presuperscript blank/g, (_m, a: string) => ` {}_${a}^{ } `);
  // fused combo: "presuperscript n_ n" (nPr/nCr artifacts) → ^{n}_{n}
  out = out.replace(/presuperscript\s+([a-zA-Z])_\s+([a-zA-Z0-9]+)/g, (_m, a: string, b: string) => ` ^{${a}} _{${b}} `);
  // combo: "presuperscript n subscript r" (nCr/nPr) → ^{n}_{r}
  out = out.replace(/presuperscript\s+([\w]+)\s+subscript\s+([\w]+)/g, (_m, a: string, b: string) => ` ^{${a}} _{${b}} `);
  return out;
}

// ── E3: misc vocabulary ────────────────────────────────────────────
export function miscPass(s: string): string {
  let out = s;
  out = out.replace(/\bsize \d+px\b/g, " ");                       // bare size tokens
  out = out.replace(/\bstack (?!sum\b)/g, " ");                    // stray stack prefix
  out = out.replace(/\bstretchy left curly bracket\b/g, " open curly brackets ");
  out = out.replace(/\bstretchy right curly bracket\b/g, " close curly brackets ");
  out = out.replace(/\bleft curly bracket\b/g, " open curly brackets ");
  out = out.replace(/\bright curly bracket\b/g, " close curly brackets ");
  out = out.replace(/\bbold (?=intersection|union\b)/g, " ");      // bold on set ops
  out = out.replace(/\bopen angle brackets\b/g, " \\langle ").replace(/\bclose angle brackets\b/g, " \\rangle ");
  out = out.replace(/\bopen vertical bar\b/g, " \\lvert ").replace(/\bclose vertical bar\b/g, " \\rvert ");
  out = out.replace(/\bless or equal than\b/g, " \\le ").replace(/\bgreater or equal than\b/g, " \\ge ");
  // L2: subscript artifacts — keep the space before _{..} (glue rejoins)
  out = out.replace(/\b([a-zA-Z])_ (\d+|[a-zA-Z])(?=[\s).,=+-]|$)/g, "$1 _{$2}");
  out = out.replace(/integral_ ([\w{}\\ ]+?) end_? superscript ([\w{}\\ ]+?) end superscript/g,
    (_m, a: string, b: string) => ` \\int_{${a.trim()}}^{${b.trim()}} `);
  out = out.replace(/integral_ ([\w{}\\ ]+?) superscript ([\w{}\\ ]+?)(?: end superscript|\s|$)/g,
    (_m, a: string, b: string) => ` \\int_{${a.trim()}}^{${b.trim()}} `);
  // sum from A to B of at end-of-string (no summand inside the span)
  out = out.replace(/^(sum from .+? to .+?) of\s*$/i, "$1 of ");
  out = out.replace(/\bof u subscript (\w+)\b/g, " of u_{$1} ");
  out = out.replace(/presuperscript ([\w ]+?) subscript ([\w ]+?)\b/g,
    (_m, a: string, b: string) => ` ^{${a.trim()}} _{${b.trim()}} `);
  out = out.replace(/\bnot an element of\b/g, " not element of ");  // L1-safe
  out = out.replace(/presubscript blank presuperscript (\d+)/g, (_m, n: string) => ` {}_{ }^{${n}} `);
  // greek letters after "bold italic" — the bold-italic rule is latin-only;
  // pre-map unicode greek to speech names (GREEK loop applies downstream)
  out = out.replace(/bold italic (π|μ|σ|θ|φ|ω|Ω|Δ|α|β|γ|λ)/g, (_m, g: string) => {
    const names: Record<string, string> = { "π": "pi", "μ": "mu", "σ": "sigma", "θ": "theta", "φ": "phi", "ω": "omega", "Ω": "Omega", "Δ": "Delta", "α": "alpha", "β": "beta", "γ": "gamma", "λ": "lambda" };
    return ` bold italic ${names[g]} `;
  });
  // unit words as prose ("× 12 months") — NO inner spaces: wrapResidualProse
  // is brace-unaware and would re-wrap inner words into nested \text{}
  out = out.replace(/\b(months|years|weeks|days|hours|minutes|seconds)\b/g, " \\text{$1} ");
  // prose inside set braces: "open curly brackets Multiples space of space 3
  // close curly brackets" → \{\text{Multiples of 3}\} — ONLY for prose inners
  // (no math vocabulary), else the greedy capture would \text{}-wrap math
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

export function extendedChain(k: string): { tex: string; via: string } | null {
  const composed = [k, miscPass(k), enclosePass(k), isoPass(k), miscPass(enclosePass(isoPass(miscPass(k))))];
  const seen = new Set<string>();
  for (const c of composed) {
    if (seen.has(c)) continue;
    seen.add(c);
    const t = baseChain(c) ?? directChain(c);
    if (t) return { tex: t, via: "ext" };
  }
  return null;
}

// ── probe ──────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync("/home/z/my-project/work/rn_debris1_parsed_census_r0.json", "utf-8"));
const results: any = {};
for (const kind of ["span", "multiline", "dollar"]) {
  let ok = 0; const refused: any[] = [];
  for (const seg of data.segments[kind] ?? []) {
    const hit = extendedChain(seg.seg);
    if (hit) ok++;
    else refused.push({ ...seg });
  }
  results[kind] = { ok, refused };
  console.log(`${kind}: ok=${ok} refused=${refused.length}`);
}
writeFileSync("/home/z/my-project/work/rn_debris1_ext_probe_r1.json", JSON.stringify(results, null, 1));
console.log("saved rn_debris1_ext_probe_r1.json");
