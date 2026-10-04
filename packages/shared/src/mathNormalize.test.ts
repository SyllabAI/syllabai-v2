/**
 * T-MIG-011 parity pins for the lifted mathNormalize implementation.
 *
 * The implementation was lifted BYTE-IDENTICAL from
 * apps/hub/src/lib/mathNormalize.ts (syllabai-hub @ 93226a43 lineage), so
 * these pins do not re-prove rules already proven in the hub's production
 * use — they freeze the lifted behaviour at the package boundary so any
 * future divergence between @syllabai/shared and the hub's rendering is a
 * test failure here, not a cross-repo drift discovered in production.
 *
 * Rule numbering follows the implementation's own header (1–6, R1–R4).
 */
import { describe, expect, test } from "bun:test";
import { hasMathCommand, normalizeMathDelimiters } from "./mathNormalize";

describe("hasMathCommand", () => {
  test("detects LaTeX commands and escape+spacing singles", () => {
    expect(hasMathCommand("\\frac{24}{0.4}")).toBe(true);
    expect(hasMathCommand("\\ce{O2}")).toBe(true);
    expect(hasMathCommand("50\\%")).toBe(true); // \% — escape + spacing single
    expect(hasMathCommand("plain prose only")).toBe(false);
    expect(hasMathCommand("file.exe")).toBe(false); // "exe" not in the command set
  });
});

describe("rule 1 — \\(...\\) → $...$", () => {
  test("inline paren delimiters convert", () => {
    expect(normalizeMathDelimiters("Water is \\(H_2O\\) here")).toBe("Water is $H_2O$ here");
  });
  test("multi-line body collapses onto one line (R3)", () => {
    expect(normalizeMathDelimiters("\\(M_r = \\frac{24}{0.4}\n= 60\\)")).toBe(
      "$M_r = \\frac{24}{0.4} = 60$",
    );
  });
});

describe("rule 2 — \\[...\\] → $$...$$ (only when latexish)", () => {
  test("display delimiters convert for LaTeX bodies", () => {
    expect(normalizeMathDelimiters("\\[\\frac{V}{24}\\]")).toBe("$$\\frac{V}{24}$$");
  });
  test("escaped literal \\[1\\] stays a literal", () => {
    expect(normalizeMathDelimiters("see step \\[1\\]")).toBe("see step \\[1\\]");
  });
});

describe("rules 3+4 — bare \\ce/\\pu wrapping", () => {
  test("bare \\ce{…} wraps once, outside math only", () => {
    expect(normalizeMathDelimiters("the gas \\ce{O2} forms")).toBe("the gas $\\ce{O2}$ forms");
  });
  test("nested braces take one level (R2): \\ce{SO4^{2-}}", () => {
    expect(normalizeMathDelimiters("\\ce{SO4^{2-}} ions")).toBe("$\\ce{SO4^{2-}}$ ions");
  });
  test("braceless chemistry-ish token \\ceO2 wraps", () => {
    expect(normalizeMathDelimiters("\\ceO2 escapes")).toBe("$\\ce{O2}$ escapes");
  });
  test("longer control words are never mangled", () => {
    expect(normalizeMathDelimiters("\\center is not chemistry")).toBe("\\center is not chemistry");
  });
});

describe("rule 5 — price pairs are prose", () => {
  test("$5 today and $10 escapes both dollars", () => {
    expect(normalizeMathDelimiters("it cost $5 today and $10")).toBe(
      "it cost \\$5 today and \\$10",
    );
  });
});

describe("rule 6 — leaked formula runs wrap as one math run", () => {
  test("bare \\frac with surroundings joins the run", () => {
    expect(normalizeMathDelimiters("M_r = \\frac{24}{0.4} = 60 g")).toBe(
      "$M_r = \\frac{24}{0.4} = 60 g$",
    );
  });
  test("one-sided bold: opening marker moves outside, run ends before non-mathish word (R4 actual)", () => {
    // "mol" is not mathish → the run closes before it; the bold markers stay
    // outside the math span. This pins the ACTUAL production behaviour of the
    // byte-identical lift (hub-proven), not the header's idealised shape.
    expect(normalizeMathDelimiters("**\\frac{V}{24} = 0.5 mol**")).toBe(
      "**$\\frac{V}{24} = 0.5$ mol**",
    );
  });
  test("unbalanced braces are left alone (no worse than raw)", () => {
    const raw = "run \\frac{24}{0.4 into";
    expect(normalizeMathDelimiters(raw)).toBe(raw);
  });
  test("code fences are barriers", () => {
    const fenced = "```\n\\frac{1}{2}\n```";
    expect(normalizeMathDelimiters(fenced)).toBe(fenced);
  });
  test("inner lines of a proper $$…$$ display block are never re-wrapped (R1)", () => {
    const block = "$$\n\\frac{1}{2}\n\\times 3\n$$";
    expect(normalizeMathDelimiters(block)).toBe(block);
  });
});

describe("parity identity — curated corpus shapes sail through untouched", () => {
  test("already-delimited math is unchanged", () => {
    const s = "Moles $n = \\frac{m}{M}$ and volume $$V = \\frac{n}{c}$$ here";
    expect(normalizeMathDelimiters(s)).toBe(s);
  });
  test("plain prose is unchanged", () => {
    const s = "Calculate the concentration in mol/dm3 and give units.";
    expect(normalizeMathDelimiters(s)).toBe(s);
  });
});
