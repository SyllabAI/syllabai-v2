/**
 * RN-DEBRIS-2 run-001 guard check — the three dict-verified conversions.
 * Every candidate must: parse with the hub's katex (throwOnError),
 * carry zero residual speech grammar, and match zero gate-MARK vocabulary.
 * Dict provenance: work/mathml-cache/4d90212dd14718a3.json
 * (live SME page of note rn_hCnswpDDCpNDKfkn, fetched 2026-10-31).
 */
import katex from "katex";
import { hasResidualGrammar } from "../src/lib/speech-extras";

const MARK = new RegExp(
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

const CANDIDATES: { id: string; tex: string; dictKey: string; dictTex: string }[] = [
  {
    id: "span-1",
    tex: "E_{kafter} = \\frac{1}{2} \\left(m_{x} + m_{y}\\right) v_{x + y}^{2}",
    dictKey:
      "E subscript k space a f t e r end subscript space equals space 1 half open parentheses m subscript x plus m subscript y close parentheses v subscript x plus y end subscript superscript 2",
    dictTex: "E_{k \\textrm{ } a f t e r} \\textrm{ } = \\textrm{ } \\frac{1}{2} \\left(m_{x} + m_{y}\\right) v_{x + y}^{2}",
  },
  {
    id: "span-2",
    tex: "E_{kafter} = \\frac{1}{2} \\left(2 m\\right) v_{x + y}^{2}",
    dictKey:
      "E subscript k space a f t e r end subscript space equals space 1 half open parentheses 2 m close parentheses v subscript x plus y end subscript superscript 2",
    dictTex: "E_{k \\textrm{ } a f t e r} \\textrm{ } = \\textrm{ } \\frac{1}{2} \\left(2 m\\right) v_{x + y}^{2}",
  },
  {
    id: "dollar-1",
    tex: "E_{kafter} = \\frac{1}{2} \\left(2 m\\right) \\left(\\frac{v_{x}}{2}\\right)^{2} = \\frac{1}{4} m v_{x}^{2}",
    dictKey:
      "E subscript k space a f t e r end subscript equals 1 half left parenthesis 2 m right parenthesis open parentheses v subscript x over 2 close parentheses squared equals 1 fourth m v subscript x superscript 2",
    dictTex:
      "E_{k \\textrm{ } a f t e r} = \\frac{1}{2} \\left(2 m\\right) \\left(\\frac{v_{x}}{2}\\right)^{2} = \\frac{1}{4} m v_{x}^{2}",
  },
];

let fail = false;
for (const c of CANDIDATES) {
  let katexOk = true;
  let err = "";
  try {
    katex.renderToString(c.tex, { throwOnError: true, strict: "ignore" });
  } catch (e) {
    katexOk = false;
    err = String(e).slice(0, 160);
  }
  const residual = hasResidualGrammar(c.tex);
  const mark = MARK.test(c.tex);
  const ok = katexOk && !residual && !mark;
  if (!ok) fail = true;
  console.log(
    JSON.stringify({ id: c.id, katexOk, residual, mark, ok, err, tex: c.tex }),
  );
  // normalization diff vs dict-verbatim (disclosure): only \textrm{ } gap
  // strips + the E_{k ... a f t e r} -> E_{kafter} letter-run collapse
  const stripped = c.dictTex.replace(/\\textrm\{\s*\}/g, "").replace(/E_\{k\s+a f t e r\}/g, "E_{kafter}");
  console.log(`    normalization-check (${c.id}): dict-verbatim-stripped == candidate: ${stripped === c.tex}`);
}
console.log(fail ? "GUARD FAILED" : "GUARD ALL GREEN (3/3)");
process.exit(fail ? 1 : 0);
