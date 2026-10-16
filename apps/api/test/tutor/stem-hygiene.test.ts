/**
 * Stem-hygiene law tests — run-004 proposal #1 (operator trace
 * 1a144e5e55662125). Every fixture traces to a measured census row
 * (2026-10-16 SELECT-only census: 1526 bank stems, 3172 QP/MS chunks).
 * The rejected tail-soup rule is pinned NEGATIVELY: MCQ option lines are
 * content and must survive untouched.
 */
import { describe, expect, test } from "bun:test";
import { hygienicEvidenceText, hygienicStem } from "../../src/services/tutor/stem-hygiene";

describe("stem-hygiene R1 — examiner write-in furniture", () => {
  test("the June 2019 4CH1/2C q1 card cleans to its intro sentence", () => {
        const raw =
      "The diagram shows the particles in an atom of an element.\nDO NOT WRITE IN THIS AREA\nDO NOT WRITE IN THIS AREA\nDO NOT WRITE IN THIS AREA\nDO NOT WRITE IN THIS AREA";
    expect(hygienicStem(raw)).toBe("The diagram shows the particles in an atom of an element.");
  });

  test("inline repeats (the 2025-06 shape) collapse in one pass", () => {
    const raw =
      "The table gives some information about the halogens, chlorine, bromine and iodine. DO NOT WRITE IN THIS AREA DO NOT WRITE IN THIS AREA";
    expect(hygienicStem(raw)).toBe(
      "The table gives some information about the halogens, chlorine, bromine and iodine.",
    );
  });

  test("MARGIN variant is covered", () => {
    expect(hygienicStem("Which gas is produced? DO NOT WRITE IN THIS MARGIN")).toBe(
      "Which gas is produced?",
    );
  });
});

describe("stem-hygiene R3 — math-mode unwrap (content-preserving)", () => {
  test("the wine/ethanoic-acid leak unwraps to plain glyphs", () => {
    const raw =
      "some of the ethanol in the wine turns to ethanoic acid, $ \\mathrm{C H_{3} C O O H} $";
    expect(hygienicStem(raw)).toBe(
      "some of the ethanol in the wine turns to ethanoic acid, CH3COOH",
    );
  });

  test("state symbols and volumes survive ($ 40 cm^3 shape)", () => {
    expect(hygienicStem("add $ 4 0 \\mathrm{c m}^{3} $ of the acid")).toBe(
      "add 40cm3 of the acid",
    );
  });

  test("an equation keeps its arrow (the sodium-peroxide stem)", () => {
    const raw =
      "The equation for the reaction is $2 \\mathrm {N a} _ {2} \\mathrm {O} _ {2} + 2 \\mathrm {C O} _ {2} \\rightarrow 2 \\mathrm {N a} _ {2} \\mathrm {C O} _ {3} + \\mathrm {O} _ {2}$";
    const out = hygienicStem(raw);
    expect(out).toContain("\u2192");
    expect(out).toContain("2Na2O2 + 2CO2");
    expect(out).not.toContain("\\");
    expect(out).not.toContain("$");
  });

  test("the equilibrium arrow survives (H2/I2 stem)", () => {
    const raw =
      "Hydrogen gas and iodine gas react together to form hydrogen iodide gas. $\\mathrm {H} _ {2} (\\mathrm {g}) + \\mathrm {I} _ {2} (\\mathrm {g}) \\rightleftharpoons 2 \\mathrm {H I} (\\mathrm {g})$";
    const out = hygienicStem(raw);
    expect(out).toContain("\u21cc");
    expect(out).toContain("H2(g)");
    expect(out).not.toContain("$");
  });

  test("a run of unrenderable markup drops wholesale (never mangled)", () => {
    const raw = "The ionic equation is $\\frac{a}{b}$ for the reaction.";
    expect(hygienicStem(raw)).toBe("The ionic equation is for the reaction.");
  });

  test("text outside math runs keeps its spacing", () => {
    expect(hygienicStem("Explain why the rate changes between 40 cm3 and 50 cm3")).toBe(
      "Explain why the rate changes between 40 cm3 and 50 cm3",
    );
  });

  test("hygienicEvidenceText unwraps chunk markup (the evidence law)", () => {
    expect(hygienicEvidenceText("Q2 M1 (4 marks): add $ \\mathrm{H C l} $ to the flask")).toBe(
      "Q2 M1 (4 marks): add HCl to the flask",
    );
    expect(hygienicEvidenceText("plain chunk text stays")).toBe("plain chunk text stays");
  });

  test("display-math delimiters ($$ … $$ / $$ $ … $) pair correctly — the measured sequential-pairing blind spot", () => {
    // live shape: 4CH0/1C QP chunk 7ecf3cf9 — "$$" before a spaced $ opened a
    // shifted pairing that stranded the real run unmatched
    const chunk =
      "The equation for this reaction is\n$$ $ 2 \\mathrm { N a O H} + \\mathrm {H} _ {2} \\mathrm {S O} _ {4} \\rightarrow \\mathrm {N a} _ {2} \\mathrm {S O} _ {4} + 2 \\mathrm {H} _ {2} \\mathrm {O} $";
    const out = hygienicEvidenceText(chunk);
    expect(out).not.toContain("$");
    expect(out).not.toContain("\\");
    expect(out).toContain("2NaOH + H2SO4 \u2192 Na2SO4 + 2H2O");
    expect(hygienicEvidenceText("display $$ \\mathrm{X} $$ end")).toBe("display X end");
  });
});

describe("stem-hygiene R5 — printed front matter", () => {
  test("Answer ALL questions. strips as a line", () => {
    const raw = "Answer ALL questions.\n1 The diagram shows an atom of an element.";
    expect(hygienicStem(raw)).toBe("1 The diagram shows an atom of an element.");
  });

  test("the cross-in-a-box instruction line strips whole", () => {
    const raw =
      "Answer ALL questions.\nSome questions must be answered with a cross in a box . If you change your mind about an\n1 Substances can be mixtures.";
    const out = hygienicStem(raw);
    expect(out).not.toContain("cross in a box");
    expect(out).not.toContain("Answer ALL");
    expect(out).toContain("1 Substances can be mixtures.");
  });

  test("Write your answers in the spaces provided. strips", () => {
    expect(hygienicStem("Write your answers in the spaces provided.\n1 The box shows elements.")).toBe(
      "1 The box shows elements.",
    );
  });
});

describe("stem-hygiene R2 — dot leaders", () => {
  test("dot-leader furniture drops", () => {
    expect(hygienicStem("Complete the sentence. ............... pressure increases")).toBe(
      "Complete the sentence. pressure increases",
    );
  });
});

describe("the REJECTED tail-soup rule stays rejected (precision-first pin)", () => {
  test("MCQ option lines are content and survive untouched", () => {
    const raw = "How many electrons are in the outer shell of a rubidium atom? A 1 B 3 C 9 D 37";
    expect(hygienicStem(raw)).toBe(raw);
  });

  test("a five-option option line survives", () => {
    const raw = "What is the pH of ammonia solution? (1) A 3 B 6 C 11 D 14";
    expect(hygienicStem(raw)).toBe(raw);
  });
});

describe("safety laws", () => {
  test("fail-open: a stem of ONLY furniture returns the input, never empty", () => {
    const raw = "DO NOT WRITE IN THIS AREA\nDO NOT WRITE IN THIS AREA";
    expect(hygienicStem(raw)).toBe(raw);
  });

  test("fail-open on empty input", () => {
    expect(hygienicStem("")).toBe("");
  });

  test("idempotent (double application is a no-op)", () => {
    const raw =
      "Answer ALL questions.\nThe diagram shows the particles in an atom. DO NOT WRITE IN THIS AREA $ \\mathrm{C H_{4}} $ burns.";
    const once = hygienicStem(raw);
    expect(hygienicStem(once)).toBe(once);
  });

  test("a clean stem passes through byte-for-byte", () => {
    const raw = "This question is about metals.";
    expect(hygienicStem(raw)).toBe(raw);
  });
});
