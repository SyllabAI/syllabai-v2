/**
 * econ25_speech_transpile.ts — T-RULE-T3-CORPUSGATE-ADJ-1 instrument (v2).
 *
 * Run-001 (of record @ e87fa6a3): the gate-class Wiris speech-alt conversion
 * (24 occurrences / 39 conversions, NO-GUESS scope = gate-flagged strings,
 * operator order "adjudicate the corpus gate menu").
 *
 * Run-002 (operator order "extend the instrument to the 6-span residue wave"):
 *   1. residue-class lane — the 6 gate-clean speech spans disclosed at
 *      residualDisclosure.gateCleanSpeechResidue (receipt run-001) convert
 *      through the SAME ladder; census-exact detection (residue_census2.py
 *      semantics), --expect-residue N pin (run-002: 6), residue-after zero.
 *   2. macro de-normalization guard — the ladder's \b-word rules (GREEK loop,
 *      PHRASES "times") re-escape already-built macros: "\Delta" -> "\\Delta",
 *      "\times" -> "\\times"; KaTeX PARSES those (throwOnError passes) but
 *      renders italic "Delta"/"times" — byte-proven on the served run-001
 *      corpus (41 occurrences: notes 29 + questions 12). New conversions are
 *      normalized; a repair leg collapses the doubled-macro pattern already
 *      served (idempotent, every repaired $..$ segment KaTeX-verified).
 *   3. collapse-rung input split — ciePlainCollapse receives a base pre-map
 *      (whitespace/artifact repair only): keeps currency glyphs literal in
 *      code spans and prevents the collapse table's \btimes\b rule mangling
 *      a pre-built \times into "\*".
 *
 * Laws (the T-SME-23a/23b instrument family, cie_patch_math_23a.ts precedent):
 *   - every produced TeX must parse with KaTeX (throwOnError);
 *   - conversion ladder only: econPreMap -> speechToTexSafe (± stripSpaceTokens)
 *     -> genericChain -> ciePlainCollapse; unfixed stays untouched (renders as
 *     code/text, never garbage);
 *   - NO-GUESS: scope = the gate-flagged strings + the run-002 residue class;
 *     evidence-derived token additions ONLY, each audited per-instance in
 *     the report;
 *   - byte-exact re-serialization (round-trip asserted before any write);
 *   - in --apply: gate-exact re-scan zero AND residue-after zero AND
 *     doubled-macro-after zero, on the post-write disk bytes.
 *
 * Evidence-derived token additions (audited per-instance in the report):
 *   run-001: triangle/increment -> \Delta; thin space/NBSP -> space;
 *            straight x/X -> \times (multiplicative context, audited);
 *            bare "x" deliberately left to the ladder (fail-closed restraint).
 *   run-002 (KaTeX-probed this run; roster: notes [16]x2 [42] [51]x2 [81]):
 *            en-dash U+2013 -> "-"        (minus position, deficit arithmetic;
 *                                          2 instances)
 *            "£" -> \pounds               (\pounds probed OK; 4 instances)
 *            "€" -> \text{€}              (\texteuro probed UNDEFINED; 1)
 *            "billion" -> \text{billion}  (mtext word; 1 instance)
 *   run-002 repair leg: served "\\Delta"/"\\times" (41) -> "\Delta"/"\times".
 *
 * Scope: content/cie-igcse-economics-25/{notes,questions,flashcards}.json
 * Run:  bun scripts/cie/econ25_speech_transpile.ts          (dry-run, report only)
 *       bun scripts/cie/econ25_speech_transpile.ts --apply  (writes + report)
 *       --expect-residue N  fail-closed pin on the residue census (run-002: 6)
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import katex from "katex";
import { speechToTexSafe } from "../../src/lib/speech-math";
import {
  genericChain,
  hasResidualGrammar,
  stripSpaceTokens,
} from "../../src/lib/speech-extras";
import { ciePlainCollapse, ciePreMap } from "./cie_math_extras";

const APPLY = process.argv.includes("--apply");
const EXPECT_RESIDUE = (() => {
  const i = process.argv.indexOf("--expect-residue");
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();
const PKG = process.cwd() + "/content/cie-igcse-economics-25";
const REPORT =
  process.env.ECON25_REPORT ?? "/home/z/my-project/work/econ25_transpile_report_run2.json";
const FILES = ["notes.json", "questions.json", "flashcards.json"]
  .map((f) => `${PKG}/${f}`)
  .filter(existsSync);

// ── gate-EXACT regexes (verify_corpus_23a.ts) — detection + reporting only ──
const GATE_MARK = new RegExp(
  "\\b(open parentheses|close parentheses|open bracket|close bracket|" +
    "open curly|close curly|open square brackets|close square brackets|" +
    "open angle brackets|close angle brackets|fraction numerator|" +
    "over denominator|end fraction|end table|end cell|end row|end stack|" +
    "end attributes|end style|end enclose|end exponent|to the power|" +
    "square root|end root|cube root|with bar on top|subscript|superscript|" +
    "presubscript|presuperscript|stack sum|sum from|sum for|begin mathsize|" +
    "rightwards arrow|left parenthesis|right parenthesis|left bracket|" +
    "right bracket|vertical line|vertical strike|horizontal strike|" +
    "identical to|cross times|plus-or-minus|end strike|asterisk times|" +
    "enclose|up diagonal strike|down diagonal strike|intersection|union|" +
    "empty set|proportional to|almost equal to|less or equal than|" +
    "greater or equal than|apostrophe)\\b",
  "i",
);
const GATE_CODE1 = /`([^`\n]+)`/g;
const GATE_CODE_ML = /`([^`]+)`/gs;
const GATE_DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
const GATE_MARK_STRONG =
  /\b(end enclose|end table|end cell|end row|end stack|end attributes|end style|begin mathsize|presubscript|presuperscript|end strike|fraction numerator|over denominator|end fraction|end exponent|stack sum)\b/i;

function gateCounts(s: string) {
  const c = { span: 0, dollar: 0, multiline: 0, baretext: 0 };
  for (const m of s.matchAll(GATE_CODE1)) if (GATE_MARK.test(m[1])) c.span++;
  for (const m of s.matchAll(GATE_DOLLAR)) if (GATE_MARK.test(m[1])) c.dollar++;
  if (s.includes("`") && s.includes("\n")) {
    for (const m of s.matchAll(GATE_CODE_ML)) {
      const inner = m[1];
      if (
        inner.includes("\n") &&
        inner.split("\n").filter((l) => GATE_MARK.test(l)).length > 0
      )
        c.multiline++;
    }
  }
  if (GATE_MARK_STRONG.test(s)) {
    const stripped = s
      .replace(/```[\s\S]*?(?:```|$)/g, "")
      .replace(/`[^`\n]*`/g, "")
      .replace(/(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g, "");
    if (GATE_MARK_STRONG.test(stripped)) c.baretext++;
  }
  return c;
}

// ── the 23a patch MARK (superset trigger, cie_patch_math_23a.ts line 57) ──
const PATCH_MARK = new RegExp(
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
const CODE_ML = /`([^`]+)`/gs;
const CODE1 = /`([^`\n]+)`/g;

// ── run-002: residue class (census-exact, residue_census2.py semantics) ──
// a gate-CLEAN code span carrying the speech signature (" space ")
const RES_SPEECH = / space /;
function residueSpanCount(s: string): number {
  let n = 0;
  for (const m of s.matchAll(CODE_ML)) {
    const inner = m[1];
    if (!GATE_MARK.test(inner) && RES_SPEECH.test(inner)) n++;
  }
  return n;
}

// ── run-002: macro de-normalization — the ladder's \b-word rules re-escape
// already-built macros; KaTeX parses "\\times" but renders "times" italic.
// Bounded to the two macros the econ ladder actually doubles (byte-proven).
const DOUBLED_MACRO = /\\\\(?:Delta|times)\b/g;
function macroNorm(tex: string): string {
  return tex.replace(/\\\\(Delta|times)\b/g, "\\$1");
}
function repairMacros(src: string): { text: string; count: number } {
  const n = src.match(DOUBLED_MACRO)?.length ?? 0;
  if (n === 0) return { text: src, count: 0 };
  return { text: src.replace(/\\\\(Delta|times)\b/g, "\\$1"), count: n };
}

function katexOk(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 23b EXACT_FORMULAS precedent: hand-authored TeX for the single line whose
 *  Wiris alt is semantically broken ("... end fraction space minus space minus
 *  2.0" = the mangled "= −2.0" — answer −2.0 confirmed by the mark-scheme
 *  narrative of record: "−0.4 results from dividing wrongly"). Unique in corpus
 *  (verified: 1 occurrence). KaTeX-verified below like every conversion. */
const EXACT_LINES = new Map<string, string>([
  [
    "P E D space equals fraction numerator 40 over denominator negative space 20 end fraction space minus space minus 2.0",
    "$P E D = \\frac{40}{- 20} = - 2.0$",
  ],
]);

/** Whitespace/artifact repair ONLY — shared by both pre-maps. */
function basePreMap(s: string): string {
  let t = s;
  t = t.replace(/\u00a0/g, " "); // NBSP tokenization whitespace
  // source double-equals artifact: "text X =  end text space equals" — the
  // Wiris text-wrapper already carries "=", an explicit "equals" follows.
  // Drop the wrapper's trailing "=" (unique in corpus, verified: 1 occurrence).
  t = t.replace(/\btext (.+?) =  end text space equals space/g, "text $1 end text space equals space");
  t = t.replace(/\bthin space\b/gi, " ");
  return t;
}

/** Evidence-derived econ token pre-map (audited per-instance in the report).
 *  Feeds the MATH rungs (speechToTexSafe / genericChain). */
function econPreMap(s: string): string {
  let t = basePreMap(s);
  t = t.replace(/\btriangle\b/gi, " \\Delta ");
  t = t.replace(/\bincrement\b/gi, " \\Delta ");
  t = t.replace(/\bstraight x\b/g, " \\times ");
  t = t.replace(/\bstraight X\b/g, " \\times ");
  // run-002 additions (KaTeX-probed this run; per-instance audited):
  t = t.replace(/\u2013/g, "-"); // en-dash in minus position (deficit arithmetic)
  t = t.replace(/£/g, " \\pounds ");
  t = t.replace(/€/g, " \\text{€} ");
  t = t.replace(/\bbillion\b/g, " \\text{billion} ");
  return t;
}

/** Collapse-side pre-map: base repair ONLY — no math macros. The collapse
 *  table would mangle a pre-built \times into "\*" and would strand \pounds
 *  / \text{} as literal macros inside code spans; currency glyphs and letters
 *  must reach ciePlainCollapse raw. */
function econPreMapBase(s: string): string {
  return basePreMap(s);
}

const PREFIX = /^((?:>\s?|[-*]\s+|\d+\.\s+|#{1,6}\s+)*)/;

const stats = {
  stringsFlagged: 0,
  spansMultilineSeen: 0,
  spansInlineSeen: 0,
  linesConverted: 0,
  linesUntouched: 0,
  texKaTeXOk: 0,
  residueSpansBefore: 0,
  residueSpansAfter: 0,
  macroRepairs: 0,
  unfixed: [] as { file: string; path: string; text: string }[],
};
const fixes: {
  file: string; path: string; kind: string; klass: string; before: string; after: string; via: string;
}[] = [];
const macroFixes: { file: string; path: string; before: string; after: string }[] = [];

/** Convert one speech line; returns { text, via } or null to leave untouched. */
function convertLine(line: string): { text: string; via: string } | null {
  const m = line.match(PREFIX)!;
  const prefix = m[1];
  const cand = line.slice(prefix.length);
  if (!cand.trim()) return null;
  const exact = EXACT_LINES.get(cand);
  if (exact !== undefined) {
    if (!katexOk(exact.replace(/^\$|\$$/g, ""))) return null; // fail-closed
    stats.texKaTeXOk++;
    return { text: prefix + exact, via: "exact-override" };
  }
  const econ = econPreMap(cand);
  const triggered = PATCH_MARK.test(econ) || /\bspace\b/.test(econ) || /\btimes\b/.test(econ);
  if (!triggered) return null; // prose / result line without speech tokens
  for (const v of [ciePreMap(econ), stripSpaceTokens(ciePreMap(econ))]) {
    const tex = speechToTexSafe(v);
    if (tex) {
      const norm = macroNorm(tex);
      if (katexOk(norm) && !hasResidualGrammar(norm)) {
        stats.texKaTeXOk++;
        return { text: prefix + "$" + norm + "$", via: "speechToTexSafe" };
      }
    }
  }
  const gcRaw = genericChain(econ);
  if (gcRaw) {
    const gc = macroNorm(gcRaw);
    if (!hasResidualGrammar(gc) && katexOk(gc)) {
      stats.texKaTeXOk++;
      return { text: prefix + "$" + gc + "$", via: "genericChain" };
    }
  }
  const pl = ciePlainCollapse(econPreMapBase(cand));
  if (pl) return { text: prefix + "`" + pl + "`", via: "cie-plain" };
  return null;
}

/** Whole-span ladder (inline single-line spans). */
function convertSpanWhole(inner: string): { text: string; via: string } | null {
  const econ = econPreMap(inner);
  for (const v of [ciePreMap(econ), stripSpaceTokens(ciePreMap(econ))]) {
    const tex = speechToTexSafe(v);
    if (tex) {
      const norm = macroNorm(tex);
      if (katexOk(norm) && !hasResidualGrammar(norm)) {
        stats.texKaTeXOk++;
        return { text: "$" + norm + "$", via: "speechToTexSafe" };
      }
    }
  }
  const gcRaw = genericChain(econ);
  if (gcRaw) {
    const gc = macroNorm(gcRaw);
    if (!hasResidualGrammar(gc) && katexOk(gc)) {
      stats.texKaTeXOk++;
      return { text: "$" + gc + "$", via: "genericChain" };
    }
  }
  const pl = ciePlainCollapse(econPreMapBase(inner));
  if (pl) return { text: "`" + pl + "`", via: "cie-plain" };
  return null;
}

/** Patch one flagged string (23a order: multi-line spans FIRST, then inline). */
function patchString(src: string, file: string, path: string, klass: string): string {
  // 1. multi-line broken code spans — unwrap + per-line ladder
  if (src.includes("`") && src.includes("\n")) {
    src = src.replace(CODE_ML, (whole, inner: string) => {
      if (!inner.includes("\n")) return whole;
      stats.spansMultilineSeen++;
      const outLines = inner.split("\n").map((line) => {
        if (!PATCH_MARK.test(line) && !/\bspace\b/.test(line)) return line;
        const hit = convertLine(line);
        if (hit) {
          stats.linesConverted++;
          fixes.push({ file, path, kind: "multiline-line", klass, before: line, after: hit.text, via: hit.via });
          return hit.text;
        }
        if (line.trim()) {
          stats.linesUntouched++;
          stats.unfixed.push({ file, path, text: line.slice(0, 140) });
        }
        return line;
      });
      return outLines.join("\n");
    });
  }
  // 2. inline single-line code spans — whole-span ladder
  src = src.replace(CODE1, (whole, inner: string) => {
    if (!PATCH_MARK.test(inner) && !/\bspace\b/.test(inner)) return whole;
    stats.spansInlineSeen++;
    const hit = convertSpanWhole(inner);
    if (hit) {
      stats.linesConverted++;
      fixes.push({ file, path, kind: "inline-span", klass, before: whole, after: hit.text, via: hit.via });
      return hit.text;
    }
    stats.linesUntouched++;
    stats.unfixed.push({ file, path, text: whole.slice(0, 140) });
    return whole;
  });
  return src;
}

// ── walk + apply ──
const parsed: Record<string, any> = {};
const gateBefore = { span: 0, dollar: 0, multiline: 0, baretext: 0 };
const gateAfter = { span: 0, dollar: 0, multiline: 0, baretext: 0 };
const raws: Record<string, string> = {};
const residueRoster: { file: string; path: string; inner: string }[] = [];

for (const f of FILES) {
  const raw = readFileSync(f, "utf-8");
  raws[f] = raw;
  const data = JSON.parse(raw);
  parsed[f] = data;

  // round-trip serialization check (byte-exact law) BEFORE any mutation
  const rt = JSON.stringify(data, null, 1) + (raw.endsWith("\n") ? "\n" : "");
  if (rt !== raw) throw new Error(`round-trip mismatch (pre) for ${f} — refuse`);

  // run-002 macro repair leg (idempotent; every repaired string's $..$ segments
  // are KaTeX-verified — a post-repair parse failure is a regression -> refuse)
  const repairWalk = (o: any, path: string, obj: any, key: any) => {
    if (typeof o === "string") {
      const r = repairMacros(o);
      if (r.count > 0) {
        for (const seg of r.text.matchAll(GATE_DOLLAR)) {
          if (!katexOk(seg[1])) {
            stats.unfixed.push({
              file: f,
              path: path + " (MACRO-REPAIR KATEX FAIL)",
              text: seg[1].slice(0, 120),
            });
          }
        }
        stats.macroRepairs += r.count;
        macroFixes.push({
          file: f.replace(PKG + "/", ""),
          path,
          before: o.slice(0, 160),
          after: r.text.slice(0, 160),
        });
        (obj as any)[key] = r.text;
      }
    } else if (Array.isArray(o)) {
      o.forEach((v, i) => repairWalk(v, `${path}[${i}]`, o, i));
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) repairWalk(v as any, `${path}.${k}`, o, k);
    }
  };
  repairWalk(data, "$", { data }, "data");

  const flagged: string[] = [];
  const walk = (o: any, path: string, obj: any, key: any) => {
    if (typeof o === "string") {
      const c = gateCounts(o);
      for (const k of ["span", "dollar", "multiline", "baretext"] as const) {
        gateBefore[k] += c[k];
        gateAfter[k] += c[k];
      }
      const residue = residueSpanCount(o);
      if (residue > 0) {
        stats.residueSpansBefore += residue;
        for (const m of o.matchAll(CODE_ML)) {
          const inner = m[1];
          if (!GATE_MARK.test(inner) && RES_SPEECH.test(inner)) {
            residueRoster.push({ file: f.replace(PKG + "/", ""), path, inner });
          }
        }
      }
      if (c.span + c.dollar + c.multiline + c.baretext > 0 || residue > 0) {
        stats.stringsFlagged++;
        flagged.push(o);
        const klass =
          c.span + c.dollar + c.multiline + c.baretext > 0 ? "gate" : "residue";
        const fixed = patchString(o, f.replace(PKG + "/", ""), path, klass);
        const cAfter = gateCounts(fixed);
        if (cAfter.span + cAfter.dollar + cAfter.multiline + cAfter.baretext > 0) {
          stats.unfixed.push({ file: f, path: path + " (STILL FLAGGED)", text: fixed.slice(0, 120) });
        }
        for (const k of ["span", "dollar", "multiline", "baretext"] as const) {
          gateAfter[k] += cAfter[k] - c[k];
        }
        stats.residueSpansAfter += residueSpanCount(fixed);
        (obj as any)[key] = fixed;
      }
    } else if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, `${path}[${i}]`, o, i));
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) walk(v as any, `${path}.${k}`, o, k);
    }
  };
  walk(data, "$", { data }, "data");
}

console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"} | files: ${FILES.length}`);
console.log(`gate before: ${JSON.stringify(gateBefore)}`);
console.log(`gate after : ${JSON.stringify(gateAfter)}`);
console.log(
  `residue spans: before ${stats.residueSpansBefore} | after ${stats.residueSpansAfter} | roster ${residueRoster.length}`,
);
console.log(`macro repairs (doubled \\Delta/\\times): ${stats.macroRepairs}`);
console.log(
  `strings flagged: ${stats.stringsFlagged} | ml spans: ${stats.spansMultilineSeen} | inline spans: ${stats.spansInlineSeen}`,
);
console.log(
  `lines converted: ${stats.linesConverted} (KaTeX ok ${stats.texKaTeXOk}) | untouched: ${stats.linesUntouched} | unfixed: ${stats.unfixed.length}`,
);
for (const u of stats.unfixed) console.log(`  UNFIXED [${u.path}] ${u.text}`);

const report = {
  ruling: "T-RULE-T3-CORPUSGATE-ADJ-1",
  run: 2,
  mode: APPLY ? "apply" : "dry-run",
  expectResidue: EXPECT_RESIDUE,
  gateBefore,
  gateAfter,
  stats,
  residueRoster,
  macroFixes,
  fixes,
};
writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(
  `report -> ${REPORT} (${fixes.length} fixes, ${macroFixes.length} macro-repair strings)`,
);

if (EXPECT_RESIDUE !== null && stats.residueSpansBefore !== EXPECT_RESIDUE) {
  console.error(
    `APPLY REFUSED — residue census ${stats.residueSpansBefore} != expected ${EXPECT_RESIDUE} (fail-closed)`,
  );
  process.exit(2);
}

if (APPLY) {
  if (gateAfter.span + gateAfter.dollar + gateAfter.multiline + gateAfter.baretext > 0) {
    console.error("APPLY REFUSED — gate-after not clean (fail-closed)");
    process.exit(2);
  }
  if (stats.unfixed.length > 0) {
    console.error("APPLY REFUSED — unfixed lines present (fail-closed)");
    process.exit(2);
  }
  if (stats.residueSpansAfter > 0) {
    console.error("APPLY REFUSED — residue-after not clean (fail-closed)");
    process.exit(2);
  }
  for (const f of FILES) {
    const out = JSON.stringify(parsed[f], null, 1) + (raws[f].endsWith("\n") ? "\n" : "");
    writeFileSync(f, out);
    // post-write disk verification: bytes match intent AND all three rescans
    // (gate-exact / residue census / doubled-macro) are zero on the disk bytes
    const disk = readFileSync(f, "utf-8");
    if (disk !== out) throw new Error(`post-write byte mismatch for ${f}`);
    const redisk = JSON.parse(disk);
    let residual = 0;
    let residueAfter = 0;
    let doubledAfter = 0;
    const scan = (o: any) => {
      if (typeof o === "string") {
        const c = gateCounts(o);
        residual += c.span + c.dollar + c.multiline + c.baretext;
        residueAfter += residueSpanCount(o);
        doubledAfter += (o.match(DOUBLED_MACRO) ?? []).length;
      } else if (Array.isArray(o)) o.forEach(scan);
      else if (o && typeof o === "object") Object.values(o).forEach(scan);
    };
    scan(redisk);
    if (residual > 0) throw new Error(`post-write gate rescan non-zero (${residual}) for ${f}`);
    if (residueAfter > 0) throw new Error(`post-write residue rescan non-zero (${residueAfter}) for ${f}`);
    if (doubledAfter > 0) throw new Error(`post-write doubled-macro rescan non-zero (${doubledAfter}) for ${f}`);
    console.log(`wrote + verified ${f} (gate 0 / residue 0 / doubled-macro 0)`);
  }
  console.log("APPLIED");
}
