/**
 * T-UGM-RENDER-1 — the math-fix law pins for the UGM/IGCSE display-math repair.
 *
 * Live-audit context (2026-10-27, syllabai-hub-v2.vercel.app): every UGM
 * display equation rendered as literal bracketed text (remark-math has no
 * \[ syntax; CommonMark eats the backslash), every \label/\eqref segment
 * fell back to raw source (KaTeX has no such macros), and 235 titles leaked
 * raw $…$. These pins hold the conversion laws:
 *
 *   - \[…\] whole-line   → flow display fence  ( $$ on its own lines )
 *   - \[…\] mid-line     → inline $…$
 *   - \label{…}           → stripped
 *   - \eqref{eq:N}        → "(N)"
 *   - \quantity{v}{u}     → v\,\text{u}        (siunitx, KaTeX-hostile)
 *   - \text{… $m$ …}      → \text{…}m\text{…}  ($ is illegal in \text)
 *   - \hbox{…}            → \text{…}           (MathJax-ism)
 *   - \arsinh etc.        → \operatorname{…}
 *   - bare \begin{equation*}…\end{equation*} in prose → flow-wrapped
 *   - $$prose$$ (authoring artifact) → unwrapped, glued closer preserved
 *   - prose gates: \(see note 2\) and \[see note 2\] stay literal
 */
import { describe, expect, test } from "bun:test";
import {
  fixGluedMacros,
  looksLikeProse,
  normalizeCorpusMath,
  repairTex,
  sanitizeMathTex,
} from "./math-fix";

describe("T-UGM-RENDER-1: \\[…\\] display-math conversion", () => {
  test("a whole-line \\[…\\] becomes a flow display fence", () => {
    const out = normalizeCorpusMath("text\n\n\\[6 = 6a\\]\n\ndone");
    expect(out).toContain("\n$$\n6 = 6a\n$$\n");
  });

  test("a mid-line \\[…\\] becomes inline math (tables/lists/sentences keep flowing)", () => {
    const out = normalizeCorpusMath("I get \\[6 = 6a\\] or \\[a = 1.\\]");
    expect(out).toContain("$6 = 6a$");
    expect(out).toContain("$a = 1.$");
    expect(out).not.toContain("\\[");
  });

  test("a mid-line display-only \\[…\\] (matrix env) falls back to the flow fence", () => {
    const out = normalizeCorpusMath("given by \\[\\begin{matrix} a \\\\ b \\end{matrix}\\] here");
    expect(out).toContain("$\\begin{matrix} a \\\\ b \\end{matrix}$"); // single-line matrix renders inline
  });

  test("an IGCSE extract display converts (the same-construct corpus)", () => {
    const out = normalizeCorpusMath("**Extract:**\n\n\\[a = \\sqrt{p^{3} b}\\]\n\nRearrange.");
    expect(out).toContain("$$\na = \\sqrt{p^{3} b}\n$$");
  });

  test("escaped-prose brackets stay literal (the \\(see note\\) law, display arm)", () => {
    expect(normalizeCorpusMath("\\[see note 2\\]")).toBe("\\[see note 2\\]");
    expect(normalizeCorpusMath("\\(see note 2\\)")).toBe("\\(see note 2\\)");
  });

  test("fenced code blocks are never converted", () => {
    const md = "```\n\\[x^2\\]\n```";
    expect(normalizeCorpusMath(md)).toBe(md);
  });
});

describe("T-UGM-RENDER-1: \\label / \\eqref / siunitx \\quantity repair", () => {
  test("\\label strips; \\eqref{eq:N} becomes (N)", () => {
    expect(repairTex("\\begin{equation} y=ax^2 \\label{eq:1} \\end{equation}")).toBe(
      "\\begin{equation} y=ax^2  \\end{equation}",
    );
    expect(repairTex("\\(\\eqref{eq:10} - 3 \\times \\eqref{eq:9}\\)")).toBe(
      "\\((10) - 3 \\times (9)\\)",
    );
  });

  test("the repaired display block parses and converts end-to-end (name-that-graph)", () => {
    const out = normalizeCorpusMath(
      "\\[\\begin{equation} y=ax^2 + bx + c\\label{eq:1} \\end{equation}\\]",
    );
    expect(out).toContain("$$\n\\begin{equation} y=ax^2 + bx + c \\end{equation}\n$$");
  });

  test("\\(\\eqref{eq:1}\\) converts to inline math now that the gate sees clean input", () => {
    expect(normalizeCorpusMath("in form \\(\\eqref{eq:1}\\) I need")).toBe("in form $(1)$ I need");
  });

  test("siunitx \\quantity{v}{u} → v\\,\\text{u}; ^ hoists out of \\text", () => {
    expect(repairTex("\\quantity{14}{m\\,s^{-1}}")).toBe("14\\,{\\mathrm{m\\,s^{-1}}}"); // macro-unit → math path
    expect(repairTex("\\quantity{30}{cm^2}")).toBe("30\\,\\text{cm}^{2}");
    expect(repairTex("\\quantity{1}{\\mu m}")).toBe("1\\,{\\mu\\mathrm{ m}}");
  });

  test("\\hbox → \\text; \\arsinh → \\operatorname", () => {
    expect(repairTex("\\hbox{[subtract]}")).toBe("\\text{[subtract]}");
    expect(repairTex("\\arsinh p=x+c")).toBe("\\operatorname{arsinh} p=x+c");
  });

  test("\\Biggl-family macros are known to the glue-splitter (no \\Bigg l mangling)", () => {
    expect(fixGluedMacros("\\Biggl(\\frac{1}{2}\\Biggr)")).toBe("\\Biggl(\\frac{1}{2}\\Biggr)");
    expect(fixGluedMacros("\\biggm/\\left(x\\right)")).toBe("\\biggm/\\left(x\\right)");
  });
});

describe("T-UGM-RENDER-1: \\text{…} $-splice and glue guards", () => {
  test("$ inside \\text{…} splices out (\\text{area of circle $C$})", () => {
    expect(repairTex("\\frac{\\text{area of circle $C$}}{\\text{area of triangle $OPQ$}}")).toBe(
      "\\frac{\\text{area of circle }C\\text{}}{\\text{area of triangle }OPQ\\text{}}",
    );
  });

  test("multi-$ \\text{…} splices fully (the cases-env law)", () => {
    expect(repairTex("\\text{if $n>0$ and $n$ even,}")).toBe(
      "\\text{if }n>0\\text{ and }n\\text{ even,}",
    );
  });

  test("adjacent \\(…\\)\\(…\\) groups do not fuse into a $$ fence", () => {
    const out = normalizeCorpusMath("\\(1.5 \\times\\)\\(\\eqref{eq:5}\\)");
    expect(out).not.toContain("$$");
    expect(out).toContain("$1.5 \\times$ $(5)$");
  });

  test("adjacent \\[…\\]\\[…\\] blocks do not fuse into a $$ fence (r8781)", () => {
    const out = normalizeCorpusMath(
      "\\[y = x^2, \\hspace{3mm} y = x^2 - 2x\\]\\[y = x^2, \\hspace{3mm} y = x^2 + 2x\\]",
    );
    expect(out).not.toContain("$$$");
  });

  test("$$prose$$ unwraps; a glued closer is preserved for the real pair (r9782)", () => {
    const out = normalizeCorpusMath("at which its $$its vector is given by $$\\mathbf{v}$$ is");
    expect(out).not.toContain("$$its");
    expect(out).toContain("its vector is given by $$\\mathbf{v}$$");
  });

  test("\\textrm {and} (space before brace) still exempts its words from the prose gate", () => {
    const out = normalizeCorpusMath("\\[y = 2x - 6 \\textrm { and } y = 3x - 3,\\]");
    expect(out).toContain("$$");
    expect(out).not.toContain("\\[");
  });
});

describe("T-UGM-RENDER-1: bare display environments in prose", () => {
  test("a bare \\begin{equation*}…\\end{equation*} flow-wraps (r7839)", () => {
    const out = normalizeCorpusMath(
      "whose equation is\n\n\\begin{equation*} y = x^2(2-x). \\end{equation*}\n\ndone",
    );
    expect(out).toContain("$$\n\\begin{equation*} y = x^2(2-x). \\end{equation*}\n$$");
  });

  test("envs already inside \\[…\\] are NOT double-wrapped", () => {
    const out = normalizeCorpusMath("\\[\\begin{equation} y=x \\end{equation}\\]");
    expect(out.match(/\$\$/g) || []).toHaveLength(2); // one fence pair only
  });
});

describe("T-UGM-RENDER-1: the prose-gate law of record", () => {
  test("stopwords gate prose; variable products are math", () => {
    expect(looksLikeProse("see note 2")).toBe(true);
    expect(looksLikeProse("linear-equation-in-y-and-k")).toBe(true);
    expect(looksLikeProse("kab=c.")).toBe(false);
    expect(looksLikeProse("pqx^2")).toBe(false);
    expect(looksLikeProse("(bt-as)")).toBe(false); // two-letter stopwords excluded
    expect(looksLikeProse("acx-bcx")).toBe(false); // minus signs, not slugs
  });

  test("real math with \\text{…} words converts (pairs-of-circles live case)", () => {
    const out = normalizeCorpusMath(
      "\\[\\sqrt{3}y=x+4 \\qquad \\textrm{and} \\qquad \\sqrt{3}y=-x+4.\\]",
    );
    expect(out).toContain("$$");
  });
});

describe("T-UGM-RENDER-1: render-time sanitizer self-heals", () => {
  test("sanitizeMathTex splits a glued \\timesh back to \\times h", () => {
    expect(sanitizeMathTex("-1.410381055\\timesh")).toBe("-1.410381055\\times h");
  });

  test("sanitizeMathTex still strips \\label and rewrites \\eqref at the AST level", () => {
    expect(sanitizeMathTex("x \\label{eq:1}")).toBe("x ");
    expect(sanitizeMathTex("\\eqref{eq:2}")).toBe("(2)");
  });
});
