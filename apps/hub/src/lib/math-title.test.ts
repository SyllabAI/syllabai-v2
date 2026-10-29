/**
 * T-UGM-RENDER-2 — mathTitleToPlainText pins.
 *
 * One pin per conversion law of math-title.ts, plus the live specimens the
 * 2026-10-29 fresh sweep surfaced (r6612's document.title leak). The fleet
 * gate itself (all 628 titles) lives in ugm.render.test.ts; these pins lock
 * the per-law behavior that gate only counts.
 */
import { describe, expect, test } from "bun:test";
import { mathTitleToPlainText } from "./math-title";

describe("mathTitleToPlainText", () => {
  test("math-free titles are byte-identical", () => {
    expect(mathTitleToPlainText("Name that graph")).toBe("Name that graph");
    expect(mathTitleToPlainText("Rotating derivatives")).toBe("Rotating derivatives");
  });

  test("$ delimiters drop, ASCII bodies stay verbatim (r6612 of record)", () => {
    expect(mathTitleToPlainText("Can we sketch the graph $y=x^3-x^2-x+1$?")).toBe(
      "Can we sketch the graph y=x^3-x^2-x+1?",
    );
  });

  test("operators parenthesise exactly when the atom carries one", () => {
    expect(mathTitleToPlainText("$2^{x^2-4x+3}$")).toBe("2^(x^2-4x+3)");
    expect(mathTitleToPlainText("$x_n>x_{n+1}$")).toBe("x_n>x_(n+1)");
    expect(mathTitleToPlainText("$(1+x)^{3/2} + (1-2x)^{3/4}$")).toBe(
      "(1+x)^(3/2) + (1-2x)^(3/4)",
    );
    expect(mathTitleToPlainText("$e^{-x}\\sin x$")).toBe("e^-x sin x");
    expect(mathTitleToPlainText("$\\int_{-1}^1 f(x)\\: dx$")).toBe("∫_-1^1 f(x) dx");
    expect(mathTitleToPlainText("$\\sum_{r=1}^n 2/(r^2+4r+3)$")).toBe(
      "∑_(r=1)^n 2/(r^2+4r+3)",
    );
  });

  test("degrees vs function composition: ^\\circ is °, bare \\circ is ∘", () => {
    expect(mathTitleToPlainText("$0^\\circ < \\theta < 500^\\circ$")).toBe("0° < θ < 500°");
    expect(mathTitleToPlainText("$\\sin 15^{\\circ}$")).toBe("sin 15°");
    expect(mathTitleToPlainText("$f \\circ g$")).toBe("f ∘ g");
  });

  test("frac/tfrac: simple args ride bare, complex args parenthesise", () => {
    expect(mathTitleToPlainText("$x=\\frac{1}{4}$")).toBe("x=1/4");
    expect(mathTitleToPlainText("$\\cos (\\sin x)=\\frac{1}{2}$")).toBe(
      "cos (sin x)=1/2",
    );
    expect(mathTitleToPlainText("$\\left(19\\tfrac{3}{4}\\right)^6$")).toBe(
      "(19 3/4)^6",
    );
  });

  test("sqrt, binom, overrightarrow, text, mathbf", () => {
    expect(mathTitleToPlainText("$x + y + \\sqrt{xy} = 39$")).toBe("x + y + √(xy) = 39");
    expect(mathTitleToPlainText("$y=\\sin^2{\\sqrt{x}}$")).toBe("y=sin^2√(x)");
    expect(mathTitleToPlainText("$\\binom{n}{r}=\\binom{n-1}{r-1}$")).toBe(
      "(n choose r)=(n-1 choose r-1)",
    );
    expect(mathTitleToPlainText("$\\overrightarrow{OA}$")).toBe("OA→");
    expect(mathTitleToPlainText("$x\\text{-}y$")).toBe("x-y");
    expect(mathTitleToPlainText("$a\\mathbf{i}+b\\mathbf{j}+c\\mathbf{k}$")).toBe(
      "ai+bj+ck",
    );
  });

  test("left/right keep the delimiter, drop the sizing command", () => {
    expect(mathTitleToPlainText("$\\left| x + [x] \\right|$")).toBe("| x + [x] |");
  });

  test("greek, relations, floor, log/base, colon-arrow, unicode minus byte-true", () => {
    expect(mathTitleToPlainText("$3\\cos \\theta + 4\\sin \\theta > 2$")).toBe(
      "3 cos θ + 4 sin θ > 2", // function names are operators — spaced even without source whitespace
    );
    expect(mathTitleToPlainText("$n \\geq 1$")).toBe("n ≥ 1");
    expect(mathTitleToPlainText("$x^2+y^2\\leq1$")).toBe("x^2+y^2≤1");
    expect(mathTitleToPlainText("$6 \\times 7 = 42$")).toBe("6 × 7 = 42");
    expect(mathTitleToPlainText("$f(x) = x/2 - \\lfloor x/2 \\rfloor$")).toBe(
      "f(x) = x/2 - ⌊ x/2 ⌋", // uniform law: a control word re-emits its terminator space
    );
    expect(mathTitleToPlainText("$\\log_2 x + \\log_3 x = 1 + \\log_4 x$")).toBe(
      "log_2 x + log_3 x = 1 + log_4 x",
    );
    expect(mathTitleToPlainText("$g \\colon x \\to x - [x]$")).toBe("g : x → x - [x]");
    expect(mathTitleToPlainText("$f(x) = 2x^3 − 9x^2 + 12x + 3$")).toBe(
      "f(x) = 2x^3 − 9x^2 + 12x + 3",
    );
    expect(mathTitleToPlainText("$0.9999S_\\infty$")).toBe("0.9999S_∞");
  });

  test("unmapped commands survive verbatim (fail-closed — the fleet gate counts them)", () => {
    expect(mathTitleToPlainText("$\\sinh x$")).toBe("\\sinh x");
  });

  test("output never carries a dollar sign, even for unbalanced input", () => {
    expect(mathTitleToPlainText("lost $0<x<1")).toBe("lost 0<x<1");
    expect(mathTitleToPlainText("trailing $")).toBe("trailing");
  });
});
