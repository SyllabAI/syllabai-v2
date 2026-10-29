/**
 * SME-WAVE2 r1 — the fix-tail class of record (T-SME-23b law): hand-authored
 * exact-string repairs for the LAST pollution residues the 23a dict could not
 * resolve in the wave-2 fill (2 physics resistor-formula spans + 3 bio
 * bare-prose speech formulas + 2 pure-2 \text{numerator}/\text{denominator}
 * label words inside the SME solution's own code-span working).
 *
 * Every math replacement is KaTeX-verified; every search is asserted to exist
 * with the expected count BEFORE writing (fail-closed, never silent). The
 * \text{numerator}/\text{denominator} edits are code-span TEXT edits (the SME
 * solution's own working labels — the \text wrapper drops, the word stays,
 * meaning byte-preserved; they render as code, never as math).
 *
 * Run: SYLLABAI_HUB_PROJECT=<hub> bun scripts/sme_residual12_fix_tail.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
// @ts-ignore
import katex from "katex";

const CONTENT = (process.env.SYLLABAI_HUB_PROJECT ?? "/home/z/my-project/work/wt-sme-residual12/apps/hub") + "/content";

const katexOk = (t: string) => {
  try {
    katex.renderToString(t, { throwOnError: true, strict: "ignore" });
    return true;
  } catch (e: any) {
    throw new Error(`KaTeX FAIL for "${t.slice(0, 60)}": ${e.message?.slice(0, 80)}`);
  }
};

type Rep = { file: string; search: string; replace: string; expect: number };

const PHYS_1 = "1 over R equals 1 over R subscript 1 plus 1 over R subscript 2 plus times times times plus 1 over R subscript n";
const PHYS_2 = "1 over R subscript T equals 1 over R subscript 1 plus 1 over R subscript 2 plus 1 over R subscript 3 plus times times times";
const BIO_1 = "reaction space rate space equals space fraction numerator product space produced space left parenthesis straight g space dm to the power of negative 3 end exponent right parenthesis over denominator time space left parenthesis straight s right parenthesis end fraction";
const BIO_2 = "Mitotic space index space equals space fraction numerator Number space of space cells space undergoing space mitosis over denominator Total space number space of space cells end fraction";

// KaTeX-verify the authored math up front (fail before ANY write)
const LATEX_1 = "\\frac{1}{R} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\cdots + \\frac{1}{R_n}";
const LATEX_2 = "\\frac{1}{R_T} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\frac{1}{R_3} + \\cdots";
const LATEX_3 = "\\text{reaction rate} = \\frac{\\text{product produced } (\\text{g dm}^{-3})}{t\\ (\\text{s})}";
const LATEX_4 = "\\text{mitotic index} = \\frac{\\text{number of cells undergoing mitosis}}{\\text{total number of cells}}";
for (const l of [LATEX_1, LATEX_2, LATEX_3, LATEX_4]) katexOk(l);

const REPS: Rep[] = [
  { file: "cie-as-physics-25/questions.json",
    search: "`" + PHYS_1 + "`", replace: "`$" + LATEX_1 + "$`", expect: 2 },
  { file: "cie-as-physics-25/questions.json",
    search: "`" + PHYS_2 + "`", replace: "`$" + LATEX_2 + "$`", expect: 1 },
  { file: "cie-as-biology-25/questions.json",
    search: "\n\n" + BIO_1, replace: "\n\n`$" + LATEX_3 + "$`", expect: 1 },
  { file: "cie-as-biology-25/questions.json",
    search: ":\n\n" + BIO_2, replace: ":\n\n`$" + LATEX_4 + "$`", expect: 2 },
  { file: "cie-as-maths-20-pure-2/questions.json",
    search: "\\text{numerator} \\equiv", replace: "numerator \\equiv", expect: 1 },
  { file: "cie-as-maths-20-pure-2/questions.json",
    search: "\\text{denominator} \\equiv", replace: "denominator \\equiv", expect: 1 },
];

for (const r of REPS) {
  const p = `${CONTENT}/${r.file}`;
  if (!existsSync(p)) throw new Error("missing file: " + p);
  const raw = readFileSync(p, "utf8");
  const n = raw.split(r.search).length - 1;
  if (n !== r.expect) {
    throw new Error(`count mismatch for ${r.file} search ${r.search.slice(0, 60)!}: expected ${r.expect}, found ${n}`);
  }
  writeFileSync(p, raw.split(r.search).join(r.replace));
  console.log(`ok ${r.file}: ${n} replacement(s)`);
}
console.log("FIX-TAIL COMPLETE (KaTeX-verified, counts asserted)");
