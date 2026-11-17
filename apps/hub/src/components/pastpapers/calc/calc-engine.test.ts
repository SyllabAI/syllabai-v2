/**
 * calc-engine.test.ts — T-MG-CALC run-001: the engine pin battery
 * (task card §3: ≥ 25 engine pins). Pure module pins — no DOM, no
 * React: the engine's determinism IS the exam-honesty law (L2).
 *
 * THE L4 AMENDMENT (see the task card): the card's original §3 example
 * ("1÷3 → 0.3333333333") contradicted its own L4 exact-fraction-default
 * rule; the REAL DEVICE wins — 1÷3 shows 1/3 and S⇔D gives the decimal.
 * These pins encode the amended law of record.
 */

import { describe, expect, test } from "bun:test";

import {
  bufferToTex,
  CalcError,
  formatDecimal,
  formatNatural,
  initialCalcState,
  pressKey,
  type CalcKey,
} from "./calc-engine";
import { CALC_MODELS, MODEL_BY_LEVEL, defaultModelForLevel } from "./calc-models";

// ── harness: type the key sequences tersely ───────────────────────────

const D = (s: string): CalcKey[] => [...s].map((d) => ({ k: "digit", d }) as CalcKey);
const op = (o: "+" | "-" | "×" | "÷"): CalcKey => ({ k: "op", op: o });
const dig = (d: string): CalcKey => ({ k: "digit", d });

function run(...keys: CalcKey[]) {
  let s = initialCalcState();
  for (const k of keys) s = pressKey(s, k);
  return s;
}

/** press through '=' and return the committed display string. */
function evalTo(...keys: CalcKey[]): string {
  const s = run(...keys, { k: "eq" });
  expect(s.shown).toBe("result");
  return formatNatural(s.result!, s.resultForm, s.fix);
}

// ── precedence + parens (card §3.1) ───────────────────────────────────

describe("(C1) precedence, parens, associativity", () => {
  test("(C1a) 1+2×3 = 7 — ×÷ bind over ±", () => {
    expect(evalTo(...D("1"), op("+"), ...D("2"), op("×"), ...D("3"))).toBe("7");
  });
  test("(C1b) (1+2)×3 = 9 — parens override", () => {
    expect(evalTo({ k: "paren", p: "(" }, ...D("1"), op("+"), ...D("2"), { k: "paren", p: ")" }, op("×"), ...D("3"))).toBe("9");
  });
  test("(C1c) 2^3^2 = 512 — x^■ is RIGHT-associative (Casio law)", () => {
    expect(evalTo(...D("2"), { k: "pow" }, ...D("3"), { k: "pow" }, ...D("2"))).toBe("512");
  });
  test("(C1d) −2² = −4 — postfix binds TIGHTER than negation", () => {
    expect(evalTo({ k: "neg" }, ...D("2"), { k: "sq" })).toBe("-4");
  });
  test("(C1e) implicit multiplication: 2π, 3(1+2) — the Casio juxtaposition law", () => {
    expect(evalTo(...D("2"), { k: "pi" })).toBe("6.283185307");
    expect(evalTo(...D("3"), { k: "paren", p: "(" }, ...D("1"), op("+"), ...D("2"), { k: "paren", p: ")" })).toBe("9");
  });
});

// ── the rational core + display laws (card L3/L4, amended) ────────────

describe("(C2) exact-fraction display + S⇔D", () => {
  test("(C2a) 1÷3 shows 1/3 BY DEFAULT (the device law, L4 amended)", () => {
    expect(evalTo(...D("1"), op("÷"), ...D("3"))).toBe("1/3");
  });
  test("(C2b) S⇔D: 1/3 ⇔ 0.3333333333 — the 10-sig decimal", () => {
    let s = run(...D("1"), op("÷"), ...D("3"), { k: "eq" });
    s = pressKey(s, { k: "sd" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("0.3333333333");
    s = pressKey(s, { k: "sd" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("1/3");
  });
  test("(C2c) 2÷3 → 2/3; S⇔D → 0.6666666667 (10 sig, rounded)", () => {
    let s = run(...D("2"), op("÷"), ...D("3"), { k: "eq" });
    s = pressKey(s, { k: "sd" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("0.6666666667");
  });
  test("(C2d) exact-fraction default from a decimal input: 4 x⁻¹ → 1/4", () => {
    expect(evalTo(...D("4"), { k: "recip" })).toBe("1/4");
  });
  test("(C2e) S⇔D is INERT on an irrational result (√2 has no exact fraction)", () => {
    const s = run({ k: "sqrt" }, ...D("2"), { k: "eq" });
    const before = s.resultForm;
    const after = pressKey(s, { k: "sd" });
    expect(after.resultForm).toBe(before);
    expect(after.result).toEqual(s.result);
  });
  test("(C2f) √16 = 4 EXACTLY (the rational core: perfect squares stay exact)", () => {
    expect(evalTo({ k: "sqrt" }, ...D("1"), ...D("6"))).toBe("4");
  });
  test("(C2g) fractions: 1/2 + 1/3 = 5/6 (the a b/c template, exact)", () => {
    expect(
      evalTo(
        { k: "frac" }, ...D("1"), { k: "right" }, ...D("2"),
        op("+"),
        { k: "frac" }, ...D("1"), { k: "right" }, ...D("3"),
      ),
    ).toBe("5/6");
  });
});

// ── trig + angle modes (card §3.6-3.7, L6) ────────────────────────────

describe("(C3) trig, arcs, angle modes", () => {
  test("(C3a) DEG: sin 30 = 1/2 (the device snaps the exact half-turns)", () => {
    expect(evalTo({ k: "trig", f: "sin" }, ...D("3"), ...D("0"))).toBe("1/2");
  });
  test("(C3b) DEG: cos 60 = 1/2, tan 45 = 1", () => {
    expect(evalTo({ k: "trig", f: "cos" }, ...D("6"), ...D("0"))).toBe("1/2");
    expect(evalTo({ k: "trig", f: "tan" }, ...D("4"), ...D("5"))).toBe("1");
  });
  test("(C3c) RAD: sin(π÷6) = 0.5 (no degree snap in RAD)", () => {
    const s = run({ k: "setup-angle", angle: "RAD" }, { k: "trig", f: "sin" }, { k: "pi" }, op("÷"), ...D("6"), { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("0.5");
  });
  test("(C3d) GRA: sin 100 gon = 1 (90° = 100 gon)", () => {
    expect(evalTo({ k: "setup-angle", angle: "GRA" }, { k: "trig", f: "sin" }, ...D("1"), ...D("0"), ...D("0"))).toBe("1");
  });
  test("(C3e) SHIFT arcs: arcsin(0.5) = 30 in DEG (one-shot SHIFT)", () => {
    expect(evalTo({ k: "shift" }, { k: "trig", f: "sin" }, ...D("0"), dig("."), ...D("5"))).toBe("30");
  });
  test("(C3f) SHIFT is one-shot — it does NOT leak to the next key", () => {
    let s = run({ k: "shift" }, { k: "trig", f: "sin" }, ...D("0"), dig("."), ...D("5"), { k: "eq" });
    expect(s.mods.shift).toBe(false);
    // and a bare trig after a consumed SHIFT stays normal sin
    s = pressKey(initialCalcState(), { k: "shift" });
    s = pressKey(s, { k: "ac" });
    expect(s.mods.shift).toBe(false);
  });
});

// ── log/ln/roots/powers (card §3.8-3.9) ───────────────────────────────

describe("(C4) log, ln, roots, reciprocals, powers", () => {
  test("(C4a) log(1000) = 3, ln(e) = 1", () => {
    expect(evalTo({ k: "log" }, ...D("1"), ...D("0"), ...D("0"), ...D("0"))).toBe("3");
    expect(evalTo({ k: "ln" }, { k: "econst" })).toBe("1");
  });
  test("(C4b) ³√(−27) = −3 (real odd root of a negative)", () => {
    expect(evalTo({ k: "cbrt" }, { k: "neg" }, ...D("2"), ...D("7"))).toBe("-3");
  });
  test("(C4c) 10^x: 10^3 = 1000; e^1 ≈ 2.718281828 (10 sig)", () => {
    expect(evalTo({ k: "pow10" }, ...D("3"))).toBe("1000");
    const s = run({ k: "exp" }, ...D("1"), { k: "eq" });
    expect(formatDecimal(s.result!)).toBe("2.718281828");
  });
  test("(C4d) 2^10 = 1024 exact; (1/2)^2 = 1/4 exact", () => {
    expect(evalTo(...D("2"), { k: "pow" }, ...D("1"), ...D("0"))).toBe("1024");
    expect(
      evalTo(
        { k: "frac" }, ...D("1"), { k: "right" }, ...D("2"),
        { k: "pow" }, ...D("2"),
      ),
    ).toBe("1/4");
  });
});

// ── the Casio % law (card §3.10) ──────────────────────────────────────

describe("(C5) % as Casio defines it", () => {
  test("(C5a) 50×10% = 5 — the card's pin of record", () => {
    expect(evalTo(...D("5"), ...D("0"), op("×"), ...D("1"), ...D("0"), { k: "pct" })).toBe("5");
  });
  test("(C5b) 50+10% = 55 — % in ± context is a fraction OF THE LEFT", () => {
    expect(evalTo(...D("5"), ...D("0"), op("+"), ...D("1"), ...D("0"), { k: "pct" })).toBe("55");
  });
  test("(C5c) 100−25% = 75", () => {
    expect(evalTo(...D("1"), ...D("0"), ...D("0"), op("-"), ...D("2"), ...D("5"), { k: "pct" })).toBe("75");
  });
  test("(C5d) 50÷10% = 500 — ÷ context divides by the fraction", () => {
    expect(evalTo(...D("5"), ...D("0"), op("÷"), ...D("1"), ...D("0"), { k: "pct" })).toBe("500");
  });
});

// ── Ans chaining + error classes (card §3.11, L5) ─────────────────────

describe("(C6) Ans chaining", () => {
  test("(C6a) after '=', an operator CONTINUES from Ans: 1+2= then ×2 = 6", () => {
    let s = run(...D("1"), op("+"), ...D("2"), { k: "eq" });
    s = pressKey(s, op("×"));
    s = pressKey(s, dig("2"));
    s = pressKey(s, { k: "eq" });
    expect(s.shown).toBe("result");
    expect(formatNatural(s.result!, s.resultForm)).toBe("6");
  });
  test("(C6b) after '=', a DIGIT starts FRESH input (Ans survives)", () => {
    let s = run(...D("5"), op("+"), ...D("3"), { k: "eq" });
    s = pressKey(s, dig("9"));
    expect(s.buf).toEqual([{ kind: "num", text: "9" }]);
    expect(s.ans).toEqual({ exact: true, n: BigInt(8), d: BigInt(1) });
  });
  test("(C6c) AC clears input + error but KEEPS Ans (Casio law)", () => {
    let s = run(...D("5"), op("+"), ...D("3"), { k: "eq" });
    s = pressKey(s, { k: "ac" });
    expect(s.buf).toEqual([]);
    expect(s.shown).toBe("input");
    expect(s.ans).toEqual({ exact: true, n: BigInt(8), d: BigInt(1) });
    s = pressKey(s, { k: "ans" });
    s = pressKey(s, { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("8");
  });
  test("(C6d) the exact Ans chains EXACTLY: 1÷3= then ×3 = 1 (no float drift)", () => {
    let s = run(...D("1"), op("÷"), ...D("3"), { k: "eq" });
    s = pressKey(s, op("×"));
    s = pressKey(s, dig("3"));
    s = pressKey(s, { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("1");
  });
});

// ── the two error classes (card L5) ───────────────────────────────────

describe("(C7) Syntax vs Math ERROR", () => {
  test("(C7a) Syntax ERROR: a trailing operator (5+ =)", () => {
    const s = run(...D("5"), op("+"), { k: "eq" });
    expect(s.shown).toBe("error");
    expect(s.error).toBe("Syntax ERROR");
  });
  test("(C7b) Syntax ERROR: a stray closing paren (1+2) =)", () => {
    const s = run(...D("1"), op("+"), ...D("2"), { k: "paren", p: ")" }, { k: "eq" });
    expect(s.error).toBe("Syntax ERROR");
  });
  test("(C7c) unclosed parens AUTO-CLOSE at '=' — sin(30 = and (1+2 = are legal", () => {
    expect(evalTo({ k: "trig", f: "sin" }, ...D("3"), ...D("0"))).toBe("1/2");
    expect(evalTo({ k: "paren", p: "(" }, ...D("1"), op("+"), ...D("2"))).toBe("3");
  });
  test("(C7d) Math ERROR: 1÷0", () => {
    const s = run(...D("1"), op("÷"), ...D("0"), { k: "eq" });
    expect(s.error).toBe("Math ERROR");
  });
  test("(C7e) Math ERROR: √(−1), log(0), arcsin(2)", () => {
    expect(run({ k: "sqrt" }, { k: "neg" }, ...D("1"), { k: "eq" }).error).toBe("Math ERROR");
    expect(run({ k: "log" }, ...D("0"), { k: "eq" }).error).toBe("Math ERROR");
    expect(run({ k: "shift" }, { k: "trig", f: "sin" }, ...D("2"), { k: "eq" }).error).toBe("Math ERROR");
  });
  test("(C7f) the device limit: 10^100 → Math ERROR (±9.999…×10⁹⁹ hardware cap)", () => {
    const s = run({ k: "pow10" }, ...D("1"), ...D("0"), ...D("0"), { k: "eq" });
    expect(s.error).toBe("Math ERROR");
  });
  test("(C7g) error state clears on the next input key (the device recovers)", () => {
    let s = run(...D("1"), op("÷"), ...D("0"), { k: "eq" });
    expect(s.error).toBe("Math ERROR");
    s = pressKey(s, dig("7"));
    expect(s.error).toBe(null);
    expect(s.shown).toBe("input");
  });
});

// ── buffer editing (card §3.14, L5 DEL/AC) ────────────────────────────

describe("(C8) DEL / cursor token semantics", () => {
  test("(C8a) DEL trims a number token CHAR BY CHAR (12.5 → 12. → 12 → 1 → gone)", () => {
    let s = run(...D("1"), ...D("2"), dig("."), ...D("5"));
    expect(s.buf).toEqual([{ kind: "num", text: "12.5" }]);
    s = pressKey(s, { k: "del" });
    expect(s.buf[0]).toEqual({ kind: "num", text: "12." });
    s = pressKey(s, { k: "del" });
    expect(s.buf[0]).toEqual({ kind: "num", text: "12" });
    s = pressKey(s, { k: "del" });
    expect(s.buf[0]).toEqual({ kind: "num", text: "1" });
    s = pressKey(s, { k: "del" });
    expect(s.buf).toEqual([]);
  });
  test("(C8b) the 15-char number cap (the Casio input width)", () => {
    const fifteen = "123456789012345";
    let s = run(...D(fifteen));
    expect(s.buf[0]).toEqual({ kind: "num", text: fifteen });
    s = pressKey(s, dig("6"));
    expect(s.buf[0]).toEqual({ kind: "num", text: fifteen });
    s = pressKey(s, dig("."));
    expect(s.buf[0]).toEqual({ kind: "num", text: fifteen });
  });
  test("(C8c) DEL on a single-char atom removes the atom", () => {
    let s = run(...D("1"), op("+"), ...D("2"));
    s = pressKey(s, { k: "del" });
    expect(s.buf).toEqual([{ kind: "num", text: "1" }, { kind: "op", op: "+" }]);
    s = pressKey(s, { k: "del" });
    expect(s.buf).toEqual([{ kind: "num", text: "1" }]);
  });
});

// ── ENG + display formatters (card §3.12) ─────────────────────────────

describe("(C9) ENG exponent steps", () => {
  test("(C9a) 12345 = then ENG → 12.345×10^3 (multiples of 3)", () => {
    let s = run(...D("1"), ...D("2"), ...D("3"), ...D("4"), ...D("5"), { k: "eq" });
    s = pressKey(s, { k: "eng" });
    expect(formatNatural(s.result!, s.resultForm, s.fix)).toBe("12.345×10^3");
  });
  test("(C9b) ENG on a sub-1 value: 0.00123 → 1.23×10^-3", () => {
    let s = run(...D("0"), dig("."), ...D("0"), ...D("0"), ...D("1"), ...D("2"), ...D("3"), { k: "eq" });
    s = pressKey(s, { k: "eng" });
    expect(formatNatural(s.result!, s.resultForm, s.fix)).toBe("1.23×10^-3");
  });
  test("(C9c) ENG toggles back to the plain decimal", () => {
    let s = run(...D("1"), ...D("2"), ...D("3"), ...D("4"), ...D("5"), { k: "eq" });
    s = pressKey(s, { k: "eng" });
    s = pressKey(s, { k: "eng" });
    expect(s.resultForm).toBe("decimal");
    expect(formatNatural(s.result!, s.resultForm)).toBe("12345");
  });
  test("(C9d) formatDecimal trims to 10 significant digits", () => {
    expect(formatDecimal({ exact: false, v: Math.PI })).toBe("3.141592654");
    expect(formatDecimal({ exact: true, n: BigInt(1), d: BigInt(3) })).toBe("0.3333333333");
  });
  test("(C9e) Fix 2 pins the decimal places (the SETUP display-fix law)", () => {
    expect(formatDecimal({ exact: true, n: BigInt(1), d: BigInt(3) }, 2)).toBe("0.33");
    expect(formatDecimal({ exact: true, n: BigInt(2), d: BigInt(1) }, 2)).toBe("2.00");
  });
});

// ── purity + the honesty laws (card L2) ───────────────────────────────

describe("(C10) purity + exam honesty", () => {
  test("(C10a) pressKey is pure: the input state is never mutated", () => {
    const s0 = initialCalcState();
    const s1 = pressKey(s0, dig("5"));
    const s2 = pressKey(s1, op("+"));
    const s3 = pressKey(s2, dig("3"));
    expect(s0.buf).toEqual([]);
    expect(s1.buf).toEqual([{ kind: "num", text: "5" }]);
    expect(s2.buf).toEqual([{ kind: "num", text: "5" }, { kind: "op", op: "+" }]);
    expect(s3.buf).toEqual([{ kind: "num", text: "5" }, { kind: "op", op: "+" }, { kind: "num", text: "3" }]);
    void s3;
  });
  test("(C10b) '=' on an EMPTY buffer is a no-op (no error, no state churn)", () => {
    const s = run({ k: "eq" });
    expect(s.shown).toBe("input");
    expect(s.error).toBe(null);
  });
  test("(C10c) no persistence surface: the engine has no module-level mutable state", () => {
    // two independent runs of the same sequence give identical results —
    // the L2 law (nothing leaves the client, nothing survives a reload)
    const a = run(...D("1"), op("+"), ...D("2"), { k: "eq" });
    const b = run(...D("1"), op("+"), ...D("2"), { k: "eq" });
    expect(formatNatural(a.result!, a.resultForm)).toBe(formatNatural(b.result!, b.resultForm));
    expect(initialCalcState().ans).toBe(null);
  });
  test("(C10d) bufferToTex renders textbook math (KaTeX preview source)", () => {
    expect(bufferToTex([{ kind: "frac", n: "1", d: "2" }])).toBe("\\frac{1}{2}");
    expect(
      bufferToTex([{ kind: "num", text: "2" }, { kind: "const", name: "π" }, { kind: "op", op: "×" }, { kind: "num", text: "3" }]),
    ).toBe("2\\pi  \\times 3");
    expect(bufferToTex([{ kind: "fn", name: "sin" }, { kind: "num", text: "30" }])).toBe("\\sin(30");
  });
  test("(C10e) the CalcError classes are exactly the Casio pair", () => {
    expect(new CalcError("Syntax ERROR").cls).toBe("Syntax ERROR");
    expect(new CalcError("Math ERROR").cls).toBe("Math ERROR");
  });
});

// ── T-MG-CALC-1 fix pins (the two fidelity deviations, closed) ─────────

describe("(C11) the T-MG-CALC-1 fidelity fixes", () => {
  test("(C11a) FIX-vs-exact: Fix 2 renders 5÷3 as 1.67 (the device overrides the fraction branch)", () => {
    const s = run(...D("5"), op("÷"), ...D("3"), { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm, s.fix)).toBe("5/3"); // Fix off: the exact law
    expect(formatNatural(s.result!, s.resultForm, 2)).toBe("1.67"); // Fix 2: the device law
    expect(formatNatural({ exact: true, n: BigInt(5), d: BigInt(1) }, "fraction", 2)).toBe("5.00"); // integers too
  });
  test("(C11b) S⇔D is INERT under Fix (the device hides it); Fix off restores the exact law", () => {
    let s = run(...D("5"), op("÷"), ...D("3"), { k: "eq" }, { k: "setup-fix", fix: 2 });
    const form = s.resultForm;
    s = pressKey(s, { k: "sd" });
    expect(s.resultForm).toBe(form);
    s = pressKey(s, { k: "setup-fix", fix: 0 });
    s = pressKey(s, { k: "sd" });
    expect(s.resultForm).not.toBe(form);
  });
  test("(C11c) structural SHIFT remaps: SHIFT+x² → x³, SHIFT+√ → ³√, SHIFT+log → 10^", () => {
    expect(evalTo(...D("2"), { k: "shift" }, { k: "sq" })).toBe("8");
    expect(evalTo({ k: "shift" }, { k: "sqrt" }, ...D("2"), ...D("7"))).toBe("3");
    expect(evalTo({ k: "shift" }, { k: "log" }, ...D("3"))).toBe("1000");
  });
  test("(C11d) the structural remap consumes the one-shot SHIFT (no leak)", () => {
    const s = run({ k: "shift" }, { k: "sq" });
    expect(s.mods.shift).toBe(false);
  });
});

// ── T-MG-CALC-2 phase A: Norm / mark / separator / mixed display laws ──

describe("(C12) the phase-A display laws", () => {
  test("(C12a) Norm 1: decimals below 10^-2 go exponential (the device band law)", () => {
    expect(formatDecimal({ exact: false, v: 0.00123 }, 0, { normVariant: 1 })).toBe("1.23×10^-3");
    expect(formatDecimal({ exact: false, v: 0.5 }, 0, { normVariant: 1 })).toBe("0.5"); // inside the band
  });
  test("(C12b) Norm 2 (the default): the band is 10^-9 — 0.00123 stays decimal", () => {
    expect(formatDecimal({ exact: false, v: 0.00123 })).toBe("0.00123");
    expect(formatDecimal({ exact: false, v: 1e-10 })).toBe("1×10^-10");
  });
  test("(C12c) the decimal mark + the digit separator (the settings rows)", () => {
    expect(formatDecimal({ exact: false, v: 12345.678 }, 0, { separator: true })).toBe("12,345.678");
    expect(formatDecimal({ exact: false, v: 1234.5 }, 0, { decimalMark: "," })).toBe("1234,5");
    expect(formatDecimal({ exact: false, v: 12345.678 }, 0, { decimalMark: ",", separator: true })).toBe("12.345,678");
    // the ENG mantissa's integer part is < 1000 by definition — grouping
    // is a no-op there (the invariant the device obeys too)
    let s = run(...D("1"), ...D("2"), ...D("3"), ...D("4"), ...D("5"), { k: "eq" });
    s = pressKey(s, { k: "eng" });
    expect(formatNatural(s.result!, s.resultForm, s.fix, { separator: true })).toBe("12.345×10^3");
  });
  test("(C12d) the ⇄ mixed-fraction law: 7/3 → '2 1/3', proper fractions unchanged, negation honest", () => {
    expect(formatNatural({ exact: true, n: BigInt(7), d: BigInt(3) }, "fraction")).toBe("7/3");
    expect(formatNatural({ exact: true, n: BigInt(7), d: BigInt(3) }, "fraction", 0, { mixed: true })).toBe("2 1/3");
    expect(formatNatural({ exact: true, n: BigInt(-7), d: BigInt(3) }, "fraction", 0, { mixed: true })).toBe("-2 1/3");
    expect(formatNatural({ exact: true, n: BigInt(1), d: BigInt(3) }, "fraction", 0, { mixed: true })).toBe("1/3");
    const s = run(...D("7"), op("÷"), ...D("3"), { k: "eq" }, { k: "mixtoggle" });
    expect(s.fractionFormat).toBe("mixed");
  });
});

// ── T-MG-CALC-2 phase A: the variable store ────────────────────────────

describe("(C13) the variable store (A–F, x, y, z)", () => {
  test("(C13a) Store from the RESULT assigns the exact value; Insert + implicit mul evaluate", () => {
    let s = run(...D("5"), op("+"), ...D("3"), { k: "eq" });
    s = pressKey(s, { k: "sto", name: "A" });
    expect(s.vars.A).toEqual({ exact: true, n: BigInt(8), d: BigInt(1) });
    s = pressKey(s, dig("2"));
    s = pressKey(s, { k: "var", name: "A" });
    s = pressKey(s, { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("16");
  });
  test("(C13b) an UNSET variable evaluates to 0 (the device law)", () => {
    expect(evalTo(...D("2"), { k: "var", name: "B" })).toBe("0");
  });
  test("(C13c) Store from the ENTRY evaluates it; Clear removes; the exact law survives (x = 1/3)", () => {
    let s = run(...D("1"), op("÷"), ...D("3"), { k: "sto", name: "x" });
    expect(s.vars.x).toEqual({ exact: true, n: BigInt(1), d: BigInt(3) });
    s = pressKey(s, { k: "ac" }); // Store leaves the entry; AC keeps the store
    s = pressKey(s, { k: "var", name: "x" });
    s = pressKey(s, op("×"));
    s = pressKey(s, dig("3"));
    s = pressKey(s, { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("1"); // no drift
    s = pressKey(s, { k: "clear-var", name: "x" });
    expect(s.vars.x).toBeUndefined();
  });
});

// ── T-MG-CALC-2 phase A: f(x)/g(x) + the catalog insert ────────────────

describe("(C14) the function definitions + the catalog insert", () => {
  test("(C14a) defining f from the entry and calling f(4) substitutes EXACTLY", () => {
    let s = run({ k: "var", name: "x" }, op("+"), ...D("1"), { k: "def-fn", name: "f" });
    expect(s.fns.f).not.toBeNull();
    s = pressKey(s, { k: "fn-call", name: "f" });
    s = pressKey(s, dig("4"));
    s = pressKey(s, { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("5");
  });
  test("(C14b) g(x) = x÷3, g(1) = 1/3 — substitution carries the EXACT rational (no drift)", () => {
    expect(
      formatNatural(
        run({ k: "var", name: "x" }, op("÷"), ...D("3"), { k: "def-fn", name: "g" }, { k: "ac" }, { k: "fn-call", name: "g" }, ...D("1"), { k: "eq" }).result!,
        "fraction",
      ),
    ).toBe("1/3");
  });
  test("(C14c) calling an UNDEFINED function is a Math ERROR, and a self-call cannot recurse", () => {
    expect(run({ k: "fn-call", name: "f" }, ...D("2"), { k: "eq" }).error).toBe("Math ERROR");
    const s = run({ k: "fn-call", name: "f" }, ...D("2"), { k: "def-fn", name: "f" }, { k: "fn-call", name: "f" }, ...D("3"), { k: "eq" });
    expect(s.error).toBe("Math ERROR");
  });
  test("(C14d) the catalog fn-insert: sinh(1) evaluates; an unknown name is inert", () => {
    const s = run({ k: "fn-insert", name: "hsin" }, ...D("1"), { k: "eq" });
    expect(formatNatural(s.result!, s.resultForm)).toBe("1.175201194");
    const t = run({ k: "fn-insert", name: "notAFunction" }, dig("1"), { k: "eq" });
    expect(t.shown).toBe("result"); // the bogus atom never entered
    expect(formatNatural(t.result!, t.resultForm)).toBe("1");
  });
});

// ── T-MG-CALC-2 phase A: the model registry (MG verbatim) ──────────────

describe("(C15) the model registry — the chase card's verbatim data", () => {
  test("(C15a) the three models carry MG's skins, features and app masks", () => {
    expect(CALC_MODELS["fx-83gt-cw"].label).toBe("fx-83GT CW");
    expect(CALC_MODELS["fx-83gt-cw"].skin).toEqual({ shiftColor: "blue", solar: false });
    expect(CALC_MODELS["fx-83gt-cw"].features).toEqual({ recurringDecimal: true, complex: false, engineerSymbol: false });
    expect(CALC_MODELS["fx-85gt-cw"].skin.solar).toBe(true);
    expect(CALC_MODELS["fx-991cw"].skin).toEqual({ shiftColor: "gold", solar: true });
    expect(CALC_MODELS["fx-991cw"].features).toEqual({ recurringDecimal: false, complex: true, engineerSymbol: true });
    expect(CALC_MODELS["fx-83gt-cw"].apps.map((a) => a.name)).toEqual(["calculate", "statistics", "table", "ratio", "mathBox"]);
    // 11 names verified verbatim; MG's bundle truncates the 12th registration (the chase card notes it)
    expect(CALC_MODELS["fx-991cw"].apps.length).toBe(11);
    // the phase-A implementation truth: only Calculate launches
    for (const id of ["fx-83gt-cw", "fx-85gt-cw", "fx-991cw"] as const) {
      expect(CALC_MODELS[id].implementedApps).toEqual(["calculate"]);
    }
  });
  test("(C15b) the level→model map is MG's own (gcse/ks2 → 83GT; a-level/igcse/international → 991CW)", () => {
    expect(MODEL_BY_LEVEL.gcse).toBe("fx-83gt-cw");
    expect(MODEL_BY_LEVEL.ks2).toBe("fx-83gt-cw");
    expect(MODEL_BY_LEVEL["a-level"]).toBe("fx-991cw");
    expect(MODEL_BY_LEVEL.igcse).toBe("fx-991cw");
    expect(defaultModelForLevel("igcse-chemistry-19")).toBe("fx-991cw");
    expect(defaultModelForLevel("gcse-maths-edexcel")).toBe("fx-83gt-cw");
    expect(defaultModelForLevel("international-a-level-maths")).toBe("fx-991cw");
    expect(defaultModelForLevel(undefined)).toBe("fx-83gt-cw");
    expect(defaultModelForLevel("ks3-science")).toBe("fx-83gt-cw"); // unknown → the GCSE default
  });
});
