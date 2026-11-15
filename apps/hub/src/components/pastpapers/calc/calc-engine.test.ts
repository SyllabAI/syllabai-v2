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
