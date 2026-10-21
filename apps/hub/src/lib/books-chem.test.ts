/**
 * T-BOOK-005 unit gates — the chemistry validation module IS the wall the
 * eq-builder / num-stepper verdicts render. Pinned with real 4CH1 content
 * of record: the mole ladder (Aᵣ Mg 24.3), the Cu²⁺ half-equation,
 * Ca(NO3)2 group expansion, the ⇌ reversible class the v3 parse carries.
 */
import { describe, expect, test } from "bun:test";

import {
  atomBalance,
  chargeBalance,
  checkNumeric,
  countAtoms,
  matchesAny,
  normalizeEquation,
  parseEquation,
  parseSpeciesToken,
  sigFigs,
  statesComplete,
  verdictFor,
} from "./books-chem";

describe("countAtoms (group expansion one level — the IGCSE set)", () => {
  test("plain + embedded counts", () => {
    expect(countAtoms("H2O")).toEqual({ H: 2, O: 1 });
    expect(countAtoms("CuSO4")).toEqual({ Cu: 1, S: 1, O: 4 });
  });
  test("parenthesised groups", () => {
    expect(countAtoms("Ca(NO3)2")).toEqual({ Ca: 1, N: 2, O: 6 });
    expect(countAtoms("Al2(SO4)3")).toEqual({ Al: 2, S: 3, O: 12 });
    expect(countAtoms("Mg(OH)2")).toEqual({ Mg: 1, O: 2, H: 2 });
  });
  test("malformed formulas fail honestly", () => {
    expect(countAtoms("(NO3")).toBeNull();
    expect(countAtoms("2H2O")).toBeNull(); // coefficient is NOT a formula part
    expect(countAtoms("")).toBeNull();
  });
});

describe("parseSpeciesToken (charge/state/coeff grammar)", () => {
  test("neutral with state", () => {
    const sp = parseSpeciesToken("H2O(l)");
    expect(sp).not.toBeNull();
    expect(sp!.coeff).toBe(1);
    expect(sp!.state).toBe("l");
    expect(sp!.charge).toBe(0);
    expect(sp!.atoms).toEqual({ H: 2, O: 1 });
  });
  test("trailing charge after formula (Cu2+, the ionic staple)", () => {
    const sp = parseSpeciesToken("Cu2+");
    expect(sp!.charge).toBe(2);
    expect(sp!.atoms).toEqual({ Cu: 1 });
  });
  test("space-separated magnitude (SO4 2-)", () => {
    const sp = parseSpeciesToken("SO4 2-");
    expect(sp!.charge).toBe(-2);
    expect(sp!.atoms).toEqual({ S: 1, O: 4 });
  });
  test("bare-sign charge (OH-, Cl-)", () => {
    expect(parseSpeciesToken("OH-")!.charge).toBe(-1);
    expect(parseSpeciesToken("OH-")!.atoms).toEqual({ O: 1, H: 1 });
    expect(parseSpeciesToken("Cl-")!.charge).toBe(-1);
  });
  test("coefficient + charge + state combine (2Cl- (aq) class)", () => {
    const sp = parseSpeciesToken("2Cl-(aq)");
    expect(sp!.coeff).toBe(2);
    expect(sp!.charge).toBe(-1);
    expect(sp!.state).toBe("aq");
    expect(sp!.atoms).toEqual({ Cl: 1 }); // atoms are PER FORMULA; coeff carries the 2
  });
  test("electrons are the empty-tally species", () => {
    const e = parseSpeciesToken("2e-");
    expect(e!.electron).toBe(true);
    expect(e!.atoms).toEqual({});
    expect(e!.charge).toBe(-1);
    expect(e!.coeff).toBe(2);
  });
  test("unicode sub/superscripts normalise (H₂O, Cu²⁺ — the v3 corpus class)", () => {
    expect(parseSpeciesToken("H₂O")!.atoms).toEqual({ H: 2, O: 1 });
    expect(parseSpeciesToken("Cu²⁺")!.charge).toBe(2);
  });
});

describe("parseEquation (sides, arrows, reversibility)", () => {
  test("simple balanced equation", () => {
    const p = parseEquation("2H2 + O2 -> 2H2O");
    expect(p.ok).toBe(true);
    expect(p.lhs).toHaveLength(2);
    expect(p.rhs).toHaveLength(1);
    expect(p.reversible).toBe(false);
  });
  test("reversible arrow class (the corpus carries ⇌ natively)", () => {
    const p = parseEquation("N2(g) + 3H2(g) ⇌ 2NH3(g)");
    expect(p.ok).toBe(true);
    expect(p.reversible).toBe(true);
  });
  test("half-equation with electrons parses", () => {
    const p = parseEquation("Cu2+ + 2e- -> Cu");
    expect(p.ok).toBe(true);
    expect(p.lhs).toHaveLength(2);
  });
  test("zero or two arrows fail honestly", () => {
    expect(parseEquation("H2 + O2").ok).toBe(false);
    expect(parseEquation("A -> B -> C").ok).toBe(false);
  });
});

describe("balance laws (the eq-builder verdicts)", () => {
  test("atomBalance catches the classic unbalanced class", () => {
    const bad = parseEquation("H2 + O2 -> H2O");
    expect(atomBalance(bad).balanced).toBe(false);
    expect(atomBalance(bad).detail).toContain("O: 2 ≠ 1");
    const good = parseEquation("2H2 + O2 -> 2H2O");
    expect(atomBalance(good).balanced).toBe(true);
  });
  test("chargeBalance on the Cu half-equation", () => {
    const p = parseEquation("Cu2+ + 2e- -> Cu");
    expect(chargeBalance(p).balanced).toBe(true);
    const wrong = parseEquation("Cu2+ + e- -> Cu");
    expect(chargeBalance(wrong).balanced).toBe(false);
  });
  test("statesComplete counts bare species", () => {
    const p = parseEquation("N2(g) + 3H2(g) ⇌ 2NH3(g)");
    expect(statesComplete(p).complete).toBe(true);
    const q = parseEquation("N2 + 3H2 -> 2NH3");
    expect(statesComplete(q)).toEqual({ complete: false, missing: 3 });
  });
  test("verdictFor: the assembled Mg half-equation vs its target", () => {
    const v = verdictFor("Mg -> Mg2+ + 2e-", "Mg -> Mg2+ + 2e-");
    expect(v.parsed).toBe(true);
    expect(v.matchesTarget).toBe(true);
    expect(v.atoms.balanced).toBe(true);
    expect(v.charges.balanced).toBe(true);
  });
  test("verdictFor target comparison ignores arrow style + whitespace", () => {
    expect(verdictFor("2H2 + O2 → 2H2O", "2H2 + O2 -> 2H2O").matchesTarget).toBe(true);
  });
  test("compact free-typed form (no spaces around +) parses FAIL — honest, never a silent mis-charge (the token bank assembles with ' + ')", () => {
    expect(verdictFor("2H2+O2 -> 2H2O", "2H2 + O2 -> 2H2O").parsed).toBe(false);
  });
});

describe("normalizeEquation", () => {
  test("arrows unify, subscripts flatten", () => {
    expect(normalizeEquation("H₂ + Cl₂ ⇌ 2HCl")).toBe("H2 + Cl2 -> 2HCl");
  });
});

describe("sigFigs (the IGCSE conventions)", () => {
  test("leading zeros never count", () => {
    expect(sigFigs("0.00240")).toBe(3);
    expect(sigFigs("0.24")).toBe(2);
  });
  test("trailing zeros after a decimal point count", () => {
    expect(sigFigs("2.400")).toBe(4);
    expect(sigFigs("24.0")).toBe(3);
  });
  test("integers count from first non-zero (documented convention)", () => {
    expect(sigFigs("2400")).toBe(4);
    expect(sigFigs("305")).toBe(3);
  });
});

describe("checkNumeric (format → value → unit → sigfigs)", () => {
  test("value within tolerance", () => {
    expect(checkNumeric("24.3", { answer: 24.3 }).ok).toBe(true);
    expect(checkNumeric("0.125", { answer: 0.125, tolerance: 1e-3 }).ok).toBe(true);
  });
  test("scientific input forms parse (5e-3, 5×10^⁻3)", () => {
    expect(checkNumeric("5e-3", { answer: 0.005 }).ok).toBe(true);
    expect(checkNumeric("5×10^⁻3", { answer: 0.005 }).ok).toBe(true);
  });
  test("value misses report the value law", () => {
    const v = checkNumeric("12.15", { answer: 24.3 });
    expect(v.ok).toBe(false);
    expect(v.law).toBe("value");
  });
  test("unit law (missing / wrong / accepted alternates — authored list is the law)", () => {
    expect(checkNumeric("24.3", { answer: 24.3, units: ["g/mol"] }).law).toBe("unit");
    expect(checkNumeric("24.3 mol", { answer: 24.3, units: ["g/mol"] }).law).toBe("unit");
    expect(checkNumeric("24.3 g/mol", { answer: 24.3, units: ["g/mol"] }).ok).toBe(true);
    expect(
      checkNumeric("24.3 g mol-1", { answer: 24.3, units: ["g/mol", "g mol-1"] }).ok,
    ).toBe(true);
  });
  test("sig-fig law fires only after value+unit pass", () => {
    const v = checkNumeric("24", { answer: 24.3, sigFigs: 3 });
    expect(v.law).toBe("value"); // value fails FIRST — the concept, not the formatting
    const w = checkNumeric("24.300", { answer: 24.3, sigFigs: 3 });
    expect(w.law).toBe("sigfigs");
    expect(checkNumeric("24.3", { answer: 24.3, sigFigs: 3 }).ok).toBe(true);
  });
});

describe("matchesAny (the ms_accepts law for table-fill)", () => {
  test("case/spacing-insensitive accept list", () => {
    expect(matchesAny("White  precipitate", ["white precipitate", "no reaction"])).toBe(true);
    expect(matchesAny("dissolves", ["white precipitate"])).toBe(false);
  });
});
