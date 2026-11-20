/**
 * calc-engine.ts — T-MG-CALC run-001: the exam calculator ENGINE of record.
 *
 * A pure, zero-React, zero-DOM model of the Casio fx-83GT CW ClassWiz —
 * the NON-programmable scientific the UK GCSE trains on (the reverse-
 * engineering receipt on the task card: mathsgenie.co.uk exposes NO
 * calculator logged-out, so this models the device MG's ecosystem
 * trains students on, plus the UI conventions extracted in prior lanes).
 *
 * EXAM HONESTY (card L2, amended by the T-MG-CALC-2 chase ruling): no
 * history beyond the live Ans chain, no solver/CAS/graphing/STAT, no
 * network. The ENGINE itself stays pure — no module state, no storage
 * calls (pinned in calc-engine.test.ts C10c); the SETTINGS/MODEL
 * persistence the chase card ruled in lives in the COMPONENT layer
 * (calc-models.ts) and never carries calculations. Everything here is
 * deterministic and pinned in calc-engine.test.ts.
 *
 * THE RATIONAL CORE (card L4, amended 2026-11-15 — see the task card
 * amendment note): evaluation carries EXACT BigInt rationals through
 * + − × ÷ integer-exponent ^ and the rational unary post-fixes, and
 * falls to double precision the moment an irrational op (trig, log, ln,
 * √ on a non-square, ³√ irrational, float Ans) enters. The DISPLAY law
 * follows the real device: an exact rational result renders as its
 * reduced fraction BY DEFAULT (1÷3 = shows "1/3"), and S⇔D converts to
 * the 10-significant-digit decimal whenever an exact form exists; with
 * no exact form the key is INERT (the Casio law — pinned). The card's
 * original §3 example ("1÷3 → 0.3333333333") contradicted its own L4
 * rule; the device wins, the decimal is the S⇔D form, and the pins
 * cover both.
 *
 * ERROR CLASSES (card L5): exactly the Casio pair — "Syntax ERROR" for
 * malformed structure, "Math ERROR" for domain/overflow/÷0.
 */

// (no self-import — removed; the types below are local)

import type { CalcVarName } from "./calc-models";

/** Angle modes of the SETUP screen. GRA = gon (90° = 100 gon). */
export type CalcAngle = "DEG" | "RAD" | "GRA";

/** The one-shot modifier states (Casio law: SHIFT/hyp are one-shot). */
export interface CalcMods {
  shift: boolean;
  hyp: boolean;
}

/** A fraction input atom (the a b/c template): two live fields. */
export interface CalcFracAtom {
  kind: "frac";
  n: string;
  d: string;
}

/** One atom of the linear input buffer (Casio's token buffer). */
export type CalcAtom =
  | { kind: "num"; text: string }
  | { kind: "op"; op: "+" | "-" | "×" | "÷" }
  | { kind: "pow" }
  | { kind: "postfix"; op: "²" | "³" | "⁻¹" | "%" | "!" }
  | { kind: "fn"; name: string } // opens an implicit "(" — sin( ln( √( ³√( 10^( e^( asin( sinh( … nPr( nCr( Abs(
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" } // the binary-function argument separator (nPr(a,b))
  | { kind: "const"; name: "π" | "e" }
  | { kind: "ans" }
  // T-MG-CALC-2 phase A: the variable-store atoms (A–F, x, y, z — the
  // CW's variable keys) and the substitution carrier (an EXACT value
  // injected by a f/g call — never a decimal string, so 1/3 arguments
  // substitute without drift, the C6d law).
  | { kind: "var"; name: CalcVarName }
  | { kind: "val"; v: CalcValue }
  | CalcFracAtom
  // T-MG-CALC-2 phase B: the per-model shift legends.
  // i — the 991CW's SHIFT+×10ˣ (complex unit); eqtok — the 991CW's
  // SHIFT+( "=" (an equation piece: in Calculate WITHOUT the Equation
  // app the device answers Syntax ERROR when it's evaluated — pinned);
  // recur — the 83GT's SHIFT+x² recurring-decimal template (whole part
  // + the repeating block, rendered with the cw-recur-digit overdots).
  | { kind: "i" }
  | { kind: "eqtok" }
  | { kind: "recur"; whole: string; rep: string };

export interface CalcState {
  /** The linear input buffer, exactly as the device's cursor line. */
  buf: CalcAtom[];
  /** Cursor position in atoms (0..buf.length); inside-atom cursors live
   * on the frac fields / number tails (the fracCursor field below). */
  cur: number;
  /** When the cursor sits INSIDE a template atom: which field ("n"/"d"
   * for the a b/c fraction, "whole"/"rep" for the recurring decimal). */
  fracField: "n" | "d" | "whole" | "rep" | null;
  /** Last committed result (exact when rational). */
  ans: CalcValue | null;
  /** The '=' committed display (kept so S⇔D/ENG can re-render it). */
  result: CalcValue | null;
  /** What the display line shows: the buffer, the committed result, or
   * an error. */
  shown: "input" | "result" | "error";
  /** The committed display's form (S⇔D toggles; only when exact). */
  resultForm: "fraction" | "decimal" | "eng";
  angle: CalcAngle;
  /** Fixed decimal places (0 = off — the natural display). */
  fix: number;
  mods: CalcMods;
  /** the error classes the engine raises; Stack joins Math/Syntax in
   * phase B (the device's nesting limit), Argument/Range remain part of
   * the hint map's vocabulary without an engine raise site (no fake
   * errors). */
  error: "Syntax ERROR" | "Math ERROR" | "Stack ERROR" | "Range ERROR" | null;
  /** T-MG-CALC-2 phase A: the variable store. Unset names evaluate to
   * the device's 0; assigned from the VARIABLE sheet's Store; never
   * persisted (the L2 amendment keeps calculations out of storage). */
  vars: Partial<Record<CalcVarName, CalcValue>>;
  /** the f(x)/g(x) definitions — atom buffers written in terms of var x. */
  fns: CalcFns;
  /** the ⇄ display law: improper (n/d) vs mixed (a b/d) fractions. */
  fractionFormat: "improper" | "mixed";
  /** the Norm display law: the exponential switch band (Casio: Norm 1
   * goes exponential below 10^-2, Norm 2 below 10^-9). */
  normVariant: 1 | 2;
  // ── phase B ──
  /** Sci n: significant-digit scientific display (0 = off; exclusive
   * with fix — the numberFormat union's law, enforced by the setup keys). */
  sciDigits: number;
  /** the model's complex feature (the 991CW): √(negative) yields the
   * complex root and the i atom evaluates. Set from the registry by the
   * component; the engine stays model-less. */
  complex: boolean;
}

export type CalcFns = { f: CalcAtom[] | null; g: CalcAtom[] | null };

/**
 * A computed value: EXACT rational when the computation stayed rational
 * (BigInt pair, d > 0, reduced), double otherwise. This is the honesty
 * core: 1÷3 is EXACTLY 1/3, not 0.333…, until S⇔D asks for the decimal.
 *
 * PHASE B: the third variant is the complex float path (the 991CW's i).
 * It rides doubles — the EXACT rational core stays a REAL-path law (a
 * documented honest boundary; √(−4) still lands exactly at 0+2i because
 * sqrt(4) is a clean double).
 */
export type CalcValue =
  | { exact: true; n: bigint; d: bigint }
  | { exact: false; v: number }
  | { c: true; re: number; im: number };

/** The engine's public key vocabulary (the component's keypad maps 1:1). */
export type CalcKey =
  | { k: "digit"; d: string }
  | { k: "op"; op: "+" | "-" | "×" | "÷" }
  | { k: "paren"; p: "(" | ")" }
  | { k: "sq" }
  | { k: "cube" }
  | { k: "pow" }
  | { k: "recip" }
  | { k: "sqrt" }
  | { k: "cbrt" }
  | { k: "log" }
  | { k: "ln" }
  | { k: "pow10" }
  | { k: "exp" }
  | { k: "trig"; f: "sin" | "cos" | "tan" }
  | { k: "frac" }
  | { k: "pi" }
  | { k: "econst" }
  | { k: "pct" }
  | { k: "ans" }
  | { k: "sd" }
  | { k: "eng" }
  | { k: "neg" }
  | { k: "del" }
  | { k: "ac" }
  | { k: "eq" }
  | { k: "left" }
  | { k: "right" }
  | { k: "shift" }
  | { k: "hyp" }
  | { k: "mode" }
  // the SETUP screen's own selections (the component's chips map here)
  | { k: "setup-angle"; angle: CalcAngle }
  | { k: "setup-fix"; fix: number }
  // T-MG-CALC-2 phase A: the CW shell's engine-reachable keys
  | { k: "setup-fraction"; format: "improper" | "mixed" }
  | { k: "setup-numformat"; variant: 1 | 2 }
  // phase B: the Sci branch of the numberFormat union (exclusive with
  // fix — every setup-NUMFORMAT key resets the other two)
  | { k: "setup-sci"; digits: number }
  | { k: "mixtoggle" }
  | { k: "var"; name: CalcVarName }
  | { k: "sto"; name: CalcVarName }
  | { k: "clear-var"; name: CalcVarName }
  | { k: "def-fn"; name: "f" | "g" }
  | { k: "clear-fn"; name: "f" | "g" }
  | { k: "fn-call"; name: "f" | "g" }
  // the CATALOG's insert (T-MG-CALC-2 phase A): a named function the
  // engine already evaluates — validated against FN_NAMES below
  | { k: "fn-insert"; name: string }
  // phase B: the factorial postfix (catalog probability), the argument
  // comma (catalog Other / the 83GT's ×10ˣ shift), and the per-model
  // shift legends (i / "=" / the recurring-decimal template)
  | { k: "fact" }
  | { k: "comma" }
  | { k: "i" }
  | { k: "eq-ins" }
  | { k: "recur" };

// ── rational helpers (BigInt; the exactness core) ─────────────────────

function gcd(a: bigint, b: bigint): bigint {
  a = a < BigInt(0) ? -a : a;
  b = b < BigInt(0) ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function rat(n: bigint, d: bigint = BigInt(1)): CalcValue {
  if (d === BigInt(0)) throw new CalcError("Math ERROR");
  if (d < BigInt(0)) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || BigInt(1);
  return { exact: true, n: n / g, d: d / g };
}

function ratFromNumber(x: number): CalcValue {
  // exact integers ride as rationals (14-digit safety: a float this clean
  // is an integer of the computation, not noise)
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return rat(BigInt(x));
  // the device's exact half-turns: a float EQUAL to p/q with a SMALL
  // denominator (the L4 3-digit rule) is that rational — sin 30° = 1/2,
  // never a giant binary fraction or a decimal. Non-exact floats
  // (π, e, 1/3-as-double) find NO exact match and stay float.
  if (Number.isFinite(x)) {
    for (let q = 2; q <= 999; q++) {
      const p = x * q;
      if (Number.isInteger(p) && Math.abs(p) < 1e15 && p / q === x) return rat(BigInt(p), BigInt(q));
    }
  }
  return { exact: false, v: x };
}

function toNumber(v: CalcValue): number {
  if (isC(v)) return v.re;
  return v.exact ? Number(v.n) / Number(v.d) : v.v;
}

/** the REAL-valued subset (the rational core's law: the exact BigInt
 * engine only ever sees non-complex operands — the val* dispatch strips
 * the complex path before delegating). */
type RealCalcValue = Exclude<CalcValue, { c: true; re: number; im: number }>;

function ratAdd(a: RealCalcValue, b: RealCalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) + toNumber(b));
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

function ratSub(a: RealCalcValue, b: RealCalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) - toNumber(b));
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

function ratMul(a: RealCalcValue, b: RealCalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) * toNumber(b));
  return rat(a.n * b.n, a.d * b.d);
}

function ratDiv(a: RealCalcValue, b: RealCalcValue): CalcValue {
  if (b.exact && b.n === BigInt(0)) throw new CalcError("Math ERROR");
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) / toNumber(b));
  return rat(a.n * b.d, a.d * b.n);
}

function ratPow(a: RealCalcValue, b: RealCalcValue): CalcValue {
  // exact ONLY for integer exponents in range; otherwise the honest float
  const bv = toNumber(b);
  if (b.exact && Number.isInteger(bv) && Math.abs(bv) <= 512) {
    const e = Number(bv);
    if (!a.exact) return ratFromNumber(Math.pow(a.v, e));
    let n = BigInt(1);
    let d = BigInt(1);
    const baseN = a.n;
    const baseD = a.d;
    for (let i = 0; i < Math.abs(e); i++) {
      n *= baseN;
      d *= baseD;
    }
    return rat(e >= 0 ? n : d, e >= 0 ? d : n);
  }
  return ratFromNumber(Math.pow(toNumber(a), bv));
}

// ── phase B: the complex path (the 991CW's i) ─────────────────────────
// The complex variant rides doubles; the EXACT rational core stays a
// REAL-path law (documented honest boundary). The helpers below dispatch
// on complex presence and otherwise delegate to the rat* core — the
// real path's behaviour is byte-stable (the regression pin).

type ComplexParts = { re: number; im: number };

function isC(v: CalcValue): v is CalcValue & { c: true; re: number; im: number } {
  return "c" in v && v.c === true;
}

function cVal(re: number, im: number): CalcValue {
  return { c: true, re, im };
}

function cParts(v: CalcValue): ComplexParts {
  return isC(v) ? { re: v.re, im: v.im } : { re: toNumber(v), im: 0 };
}

function valAdd(a: CalcValue, b: CalcValue): CalcValue {
  if (isC(a) || isC(b)) {
    const p = cParts(a);
    const q = cParts(b);
    const re = p.re + q.re;
    const im = p.im + q.im;
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new CalcError("Math ERROR");
    return cVal(re, im);
  }
  return ratAdd(a, b);
}

function valSub(a: CalcValue, b: CalcValue): CalcValue {
  if (isC(a) || isC(b)) {
    const p = cParts(a);
    const q = cParts(b);
    const re = p.re - q.re;
    const im = p.im - q.im;
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new CalcError("Math ERROR");
    return cVal(re, im);
  }
  return ratSub(a, b);
}

function valMul(a: CalcValue, b: CalcValue): CalcValue {
  if (isC(a) || isC(b)) {
    const p = cParts(a);
    const q = cParts(b);
    const re = p.re * q.re - p.im * q.im;
    const im = p.re * q.im + p.im * q.re;
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new CalcError("Math ERROR");
    return cVal(re, im);
  }
  return ratMul(a, b);
}

function valDiv(a: CalcValue, b: CalcValue): CalcValue {
  if (!isC(b) && b.exact && b.n === BigInt(0)) throw new CalcError("Math ERROR");
  if (!isC(b) && !b.exact && b.v === 0) throw new CalcError("Math ERROR");
  if (isC(b)) {
    const q = cParts(b);
    if (q.re === 0 && q.im === 0) throw new CalcError("Math ERROR");
  }
  if (isC(a) || isC(b)) {
    const p = cParts(a);
    const q = cParts(b);
    const den = q.re * q.re + q.im * q.im;
    const re = (p.re * q.re + p.im * q.im) / den;
    const im = (p.im * q.re - p.re * q.im) / den;
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new CalcError("Math ERROR");
    return cVal(re, im);
  }
  return ratDiv(a as RealCalcValue, b as RealCalcValue);
}

function valNeg(a: CalcValue): CalcValue {
  if (isC(a)) return cVal(-a.re, -a.im);
  return ratMul(a as RealCalcValue, rat(-BigInt(1)) as RealCalcValue);
}

/** complex powers: only an INTEGER REAL exponent is honest scope — the
 * complex exponent path (e^(z·ln w)) is not on the simulator. */
function valPow(a: CalcValue, b: CalcValue): CalcValue {
  if (isC(a) || isC(b)) {
    if (isC(b)) throw new CalcError("Math ERROR");
    const e = toNumber(b);
    if (!Number.isInteger(e) || Math.abs(e) > 512) throw new CalcError("Math ERROR");
    let acc: CalcValue = cVal(1, 0);
    const n = Math.abs(e);
    for (let i = 0; i < n; i++) acc = valMul(acc, a);
    return e >= 0 ? acc : valDiv(cVal(1, 0), acc);
  }
  return ratPow(a as RealCalcValue, b as RealCalcValue);
}

/** the exact integer factorial (the probability category's x!); the
 * device answers Math ERROR for non-integers/negatives/overflow. */
function factorialVal(v: CalcValue): CalcValue {
  if (isC(v) || !v.exact || v.d !== BigInt(1)) throw new CalcError("Math ERROR");
  if (v.n < BigInt(0) || v.n > BigInt(999)) throw new CalcError("Math ERROR");
  let p = BigInt(1);
  for (let i = 2; i <= Number(v.n); i++) p *= BigInt(i);
  return rat(p);
}

/** The Casio error — the display classes. Phase B adds Stack (the
 * nesting limit); Argument/Range stay vocabulary-only (no engine raise
 * site — no fake errors). */
export class CalcError extends Error {
  // phase C (T-MG-CALC-2): "Range ERROR" gains its FIRST genuine raise
  // site — the Table app's range laws (bad range / row-cap violation).
  // Until then the phase-B pin kept it vocabulary-only (no fake errors).
  readonly cls: "Syntax ERROR" | "Math ERROR" | "Stack ERROR" | "Range ERROR";
  constructor(cls: "Syntax ERROR" | "Math ERROR" | "Stack ERROR" | "Range ERROR") {
    super(cls);
    this.cls = cls;
  }
}

/** the function names the engine evaluates — the CATALOG's fn-insert
 * validates against this set (anything else is inert, never a crash).
 * Phase B adds the probability pair (nPr/nCr — binary, comma argument)
 * and Abs. */
const FN_NAMES = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "hsin", "hcos", "htan", "hasin", "hacos", "hatan", "log", "ln", "√", "³√", "10^", "e^", "nPr", "nCr", "abs"]);

// ── state constructors ────────────────────────────────────────────────

/** phase B: the mount-time settings the component seeds from the
 * persisted record (the engine stays model-less and storage-free). */
export interface CalcInitOpts {
  complex?: boolean;
  fix?: number;
  sciDigits?: number;
  normVariant?: 1 | 2;
  fractionFormat?: "improper" | "mixed";
}

export function initialCalcState(angle: CalcAngle = "DEG", opts: CalcInitOpts = {}): CalcState {
  return {
    buf: [],
    cur: 0,
    fracField: null,
    ans: null,
    result: null,
    shown: "input",
    resultForm: "fraction",
    angle,
    fix: opts.fix ?? 0,
    mods: { shift: false, hyp: false },
    error: null,
    vars: {},
    fns: { f: null, g: null },
    fractionFormat: opts.fractionFormat ?? "improper",
    normVariant: opts.normVariant ?? 2,
    sciDigits: opts.sciDigits ?? 0,
    complex: opts.complex ?? false,
  };
}

// ── buffer editing (the cursor semantics) ─────────────────────────────

type Insertable = CalcAtom | "digit-into-current";

function needsImplicitMul(prev: CalcAtom | undefined, next: CalcAtom): boolean {
  if (!prev) return false;
  const prevCloses = prev.kind === "num" || prev.kind === "const" || prev.kind === "ans" || prev.kind === "rparen" || prev.kind === "postfix" || prev.kind === "frac" || prev.kind === "var" || prev.kind === "val" || prev.kind === "recur";
  const nextOpens = next.kind === "lparen" || next.kind === "fn" || next.kind === "const" || next.kind === "ans" || next.kind === "num" || next.kind === "frac" || next.kind === "var" || next.kind === "val" || next.kind === "i" || next.kind === "recur";
  return prevCloses && nextOpens;
}

/** The atom the cursor would extend when a digit lands. */
function currentEditableAtom(state: CalcState): CalcAtom | undefined {
  if (state.fracField) {
    const at = state.buf[state.cur];
    // phase B: the recurring-decimal template routes digits to its
    // fields exactly like the a b/c template
    if (state.fracField === "whole" || state.fracField === "rep") {
      return at && at.kind === "recur" ? at : undefined;
    }
    return at && at.kind === "frac" ? at : undefined;
  }
  const at = state.buf[state.cur - 1];
  return at && at.kind === "num" ? at : undefined;
}

/**
 * pressKey — the pure state machine. EVERY law above funnels through
 * here; the component never edits the state directly.
 */
export function pressKey(prev: CalcState, key: CalcKey): CalcState {
  let s: CalcState = prev;
  const mods = { ...prev.mods };
  // the sto/def-fn laws read the PRE-reset screen state ('=' commits set
  // shown=result and the continuation reset below clears the buffer)
  const shownBefore = prev.shown;
  const resultBefore = prev.result;

  // one-shot modifiers first
  if (key.k === "shift") return { ...s, mods: { shift: !mods.shift, hyp: mods.hyp } };
  if (key.k === "hyp") return { ...s, mods: { shift: mods.shift, hyp: !mods.hyp } };

  // the SETUP screen selections (wired from the component's chips)
  if (key.k === "setup-angle") return { ...s, angle: key.angle, mods: { shift: false, hyp: false } };
  // the numberFormat union's law: Norm/Fix/Sci are exclusive — every
  // setup-NUMFORMAT key resets the other two (phase B wiring closes the
  // T-MG-CALC-1 FIX-vs-exact deviation; Sci overrides the exact display
  // by the same law)
  if (key.k === "setup-fix") return { ...s, fix: key.fix, sciDigits: 0, mods: { shift: false, hyp: false } };
  if (key.k === "setup-numformat") return { ...s, normVariant: key.variant, fix: 0, sciDigits: 0, mods: { shift: false, hyp: false } };
  if (key.k === "setup-sci") return { ...s, sciDigits: key.digits, fix: 0, mods: { shift: false, hyp: false } };
  if (key.k === "setup-fraction") return { ...s, fractionFormat: key.format, mods: { shift: false, hyp: false } };
  // the CW ⇄ key: improper ⇔ mixed display (the device's a⇔b/c law)
  if (key.k === "mixtoggle") {
    return { ...s, fractionFormat: s.fractionFormat === "mixed" ? "improper" : "mixed", mods: { shift: false, hyp: false } };
  }

  const consume = (st: CalcState): CalcState => ({ ...st, mods: { shift: false, hyp: false } });

  // ── result-display keys (S⇔D / ENG act on the committed value) ──
  if (key.k === "sd") {
    if (s.shown !== "result" || !s.result) return consume(s);
    // T-MG-CALC-1 fix pin: the device HIDES S⇔D under Fix — inert.
    // Phase B: Sci overrides the exact display by the same law.
    if (s.fix > 0 || s.sciDigits > 0) return consume(s);
    // a COMPLEX result has no alternative exact form — S⇔D is inert
    // (the device law; the io row owns the complex display family)
    if (isC(s.result)) return consume(s);
    // Casio law: S⇔D is INERT when no exact alternative form exists
    if (!s.result.exact) return consume(s);
    const nextForm = s.resultForm === "fraction" ? "decimal" : "fraction";
    return consume({ ...s, resultForm: nextForm });
  }
  if (key.k === "eng") {
    if (s.shown !== "result" || !s.result) return consume(s);
    const v = toNumber(s.result);
    if (!Number.isFinite(v) || v === 0) return consume(s);
    return consume({ ...s, resultForm: s.resultForm === "eng" ? "decimal" : "eng" });
  }

  // ── AC: clears the buffer + error, Ans SURVIVES (Casio law) ──
  if (key.k === "ac") {
    return consume({
      ...initialCalcState(s.angle),
      fix: s.fix,
      ans: s.ans,
      vars: s.vars,
      fns: s.fns,
      fractionFormat: s.fractionFormat,
      normVariant: s.normVariant,
      sciDigits: s.sciDigits,
      complex: s.complex,
      mods: { shift: false, hyp: false },
    });
  }

  // ── after '=': digits/constants/functions start FRESH input; operators
  // continue from Ans (the Casio continuation law) ──
  let continueFromAns = false;
  if (s.shown === "result" || s.shown === "error") {
    const continues = key.k === "op" || key.k === "pct";
    continueFromAns = continues;
    s = {
      ...s,
      buf: continues && s.ans ? [{ kind: "ans" }] : [],
      cur: continues && s.ans ? 1 : 0,
      fracField: null,
      shown: "input",
      error: null,
    };
  }

  const buf = s.buf.map((a) => ({ ...a }));
  let cur = Math.min(s.cur, buf.length);
  let fracField = s.fracField;
  let shown: CalcState["shown"] = "input";

  // Casio: an operator/fn/paren press while INSIDE the a b/c template
  // auto-commits it — the insert point exits to AFTER the fraction.
  // (digit/del/left/right manage the frac cursor themselves.)
  if (fracField && key.k !== "digit" && key.k !== "del" && key.k !== "left" && key.k !== "right") {
    cur += 1;
    fracField = null;
  }

  switch (key.k) {
    case "digit": {
      const editable = currentEditableAtom({ ...s, buf, cur, fracField });
      if (editable && editable.kind === "num") {
        // Casio: a number token holds up to 15 chars; '.' once
        if (editable.text.length >= 15) break;
        if (key.d === "." && editable.text.includes(".")) break;
        editable.text += key.d;
        cur = buf.indexOf(editable) + 1;
        break;
      }
      if (editable && editable.kind === "frac") {
        const field = fracField ?? "n";
        if (editable[field].length >= 15) break;
        if (key.d === "." && editable[field].includes(".")) break;
        editable[field] += key.d;
        break;
      }
      if (editable && editable.kind === "recur") {
        const field = fracField === "rep" ? "rep" : "whole";
        if (editable[field].length >= 15) break;
        if (key.d === ".") break; // the template's parts are integers
        editable[field] += key.d;
        break;
      }
      const atom: CalcAtom = { kind: "num", text: key.d };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "op": {
      const atom: CalcAtom = { kind: "op", op: key.op };
      // a leading operator lands on the empty buffer — Casio shows it and
      // it evaluates from Ans (or Syntax ERROR when no Ans exists)
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "paren": {
      const atom: CalcAtom = key.p === "(" ? { kind: "lparen" } : { kind: "rparen" };
      if (needsImplicitMul(buf[cur - 1], atom) && key.p === "(") buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "sq":
    case "cube":
    case "recip":
    case "pct":
    case "fact": {
      // T-MG-CALC-1 fix pin — structural SHIFT remaps: the device law is
      // that the shift legend is the key's primary shifted function
      // (SHIFT+x² → x³; the CW has no dedicated cube key). The one-shot
      // consume law is preserved by the consume() wrapper below.
      // (The PER-MODEL shift legends — ■̇/log/i/"," — are the component's
      // dispatch, not the engine's: the engine law stays the structural
      // default so the classic layout and the regression pins hold.)
      const isCube = key.k === "cube" || (key.k === "sq" && mods.shift);
      const op: "²" | "³" | "⁻¹" | "%" | "!" = isCube ? "³" : key.k === "recip" ? "⁻¹" : key.k === "pct" ? "%" : key.k === "fact" ? "!" : "²";
      buf.splice(cur, 0, { kind: "postfix", op });
      cur += 1;
      fracField = null;
      break;
    }
    case "pow": {
      buf.splice(cur, 0, { kind: "pow" });
      cur += 1;
      fracField = null;
      break;
    }
    case "sqrt":
    case "cbrt":
    case "log":
    case "ln":
    case "pow10":
    case "exp":
    case "trig": {
      // SHIFT one-shot: trig → arcsin/… (the CW SHIFT law)
      let name: string;
      if (key.k === "trig") {
        name = mods.shift ? "a" + key.f : mods.hyp ? "h" + key.f : key.f;
        if (mods.shift && mods.hyp) name = "ha" + key.f; // arc-hyperbolic
      } else {
        // T-MG-CALC-1 fix pin — structural SHIFT remaps: SHIFT+√ → ³√,
        // SHIFT+log → 10^ (the shift legend is the key's primary
        // shifted function; the CW carries no dedicated ³√/10ˣ keys).
        name =
          key.k === "sqrt" ? (mods.shift ? "³√" : "√") : key.k === "cbrt" ? "³√" : key.k === "log" ? (mods.shift ? "10^" : "log") : key.k === "ln" ? "ln" : key.k === "pow10" ? "10^" : "e^";
      }
      buf.splice(cur, 0, { kind: "fn", name });
      cur += 1;
      fracField = null;
      break;
    }
    case "pi":
    case "econst":
    case "ans": {
      const atom: CalcAtom = key.k === "pi" ? { kind: "const", name: "π" } : key.k === "econst" ? { kind: "const", name: "e" } : { kind: "ans" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "frac": {
      const atom: CalcAtom = { kind: "frac", n: "", d: "" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      // the cursor drops INTO the numerator (Casio): while fracField is
      // set, `cur` indexes the frac ATOM itself, not the insert point
      fracField = "n";
      break;
    }
    case "neg": {
      // Casio (+/-): a negation enters as the minus op at the cursor
      buf.splice(cur, 0, { kind: "op", op: "-" });
      cur += 1;
      fracField = null;
      break;
    }
    case "del": {
      if (fracField) {
        const at = buf[cur];
        if (at && at.kind === "frac") {
          const field = fracField === "rep" ? "d" : fracField;
          if (field === "n" || field === "d") {
            if (at[field].length > 0) at[field] = at[field].slice(0, -1);
            else if (field === "d") fracField = "n";
          }
        } else if (at && at.kind === "recur") {
          const field = fracField === "rep" ? "rep" : "whole";
          if (at[field].length > 0) at[field] = at[field].slice(0, -1);
          else if (field === "rep") fracField = "whole";
        }
        break;
      }
      if (cur === 0) break;
      const at = buf[cur - 1];
      if (at.kind === "num" && at.text.length > 1) at.text = at.text.slice(0, -1);
      else {
        buf.splice(cur - 1, 1);
        cur -= 1;
      }
      break;
    }
    case "left": {
      if (fracField) {
        // inside a template: ◀ moves rep→whole / d→n, then OUT to its left
        const at = buf[cur];
        if (at && at.kind === "frac" && fracField === "d") {
          fracField = "n";
          break;
        }
        if (at && at.kind === "recur" && fracField === "rep") {
          fracField = "whole";
          break;
        }
        fracField = null; // exiting left: cur stays ON the atom
        break;
      }
      const prev = buf[cur - 1];
      if (prev && prev.kind === "frac" && prev.n === "" && prev.d === "") {
        cur -= 1;
        fracField = "n";
        break;
      }
      if (prev && prev.kind === "recur" && prev.whole === "" && prev.rep === "") {
        cur -= 1;
        fracField = "whole";
        break;
      }
      if (cur > 0) cur -= 1;
      break;
    }
    case "right": {
      if (fracField) {
        const at = buf[cur];
        if (at && at.kind === "frac" && fracField === "n") {
          fracField = "d";
          break;
        }
        if (at && at.kind === "recur" && fracField === "whole") {
          fracField = "rep";
          break;
        }
        fracField = null;
        cur += 1; // exiting right: the insert point moves PAST the atom
        break;
      }
      const at = buf[cur];
      if (at && at.kind === "frac") {
        if (at.n === "") {
          fracField = "n"; // ▶ onto a fresh template enters the numerator
          break;
        }
        cur += 1;
        break;
      }
      if (at && at.kind === "recur") {
        if (at.whole === "") {
          fracField = "whole";
          break;
        }
        cur += 1;
        break;
      }
      if (cur < buf.length) cur += 1;
      break;
    }
    case "eq": {
      // the device: '=' on an EMPTY buffer is a no-op (no error)
      if (buf.length === 0) return consume(s);
      try {
        const v = clampDevice(evaluateAtoms(buf, s.angle, s.ans, s.vars, s.fns, s.complex));
        const result: CalcValue = clampDevice(v);
        shown = "result";
        return consume({
          ...s,
          buf,
          cur,
          fracField: null,
          ans: result,
          result,
          shown,
          resultForm: "fraction",
          error: null,
        });
      } catch (err) {
        if (err instanceof CalcError) {
          return consume({ ...s, buf, cur, fracField: null, shown: "error", error: err.cls });
        }
        throw err;
      }
    }
    case "var": {
      // the CW's variable keys: insert the name (implicit-mul applies,
      // the device law — 2A means 2×A)
      const atom: CalcAtom = { kind: "var", name: key.name };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "sto": {
      // the VARIABLE sheet's Store: the RESULT when one is shown, else
      // the current entry evaluated; empty → no-op. Errors surface like '='.
      if (shownBefore === "result" && resultBefore) {
        return consume({ ...s, vars: { ...s.vars, [key.name]: resultBefore } });
      }
      if (buf.length === 0) break;
      try {
        const v = clampDevice(evaluateAtoms(buf, s.angle, s.ans, s.vars, s.fns, s.complex));
        return consume({ ...s, vars: { ...s.vars, [key.name]: v }, shown: "input", error: null });
      } catch (err) {
        if (err instanceof CalcError) return consume({ ...s, shown: "error", error: err.cls });
        throw err;
      }
    }
    case "clear-var": {
      if (!(key.name in s.vars)) break;
      const vars = { ...s.vars };
      delete vars[key.name];
      return consume({ ...s, vars });
    }
    case "def-fn": {
      // the FUNCTION sheet's Store: the current ENTRY defines f/g (in
      // terms of var x). Empty buffer → no-op.
      if (buf.length === 0) break;
      return consume({ ...s, fns: { ...s.fns, [key.name]: buf.map((a) => ({ ...a })) } });
    }
    case "clear-fn":
      return consume({ ...s, fns: { ...s.fns, [key.name]: null } });
    case "fn-call": {
      // inserting f( / g( — an implicit-paren fn like sin(
      buf.splice(cur, 0, { kind: "fn", name: key.name });
      cur += 1;
      fracField = null;
      break;
    }
    case "fn-insert": {
      // the CATALOG's insert: only names the engine evaluates
      if (!FN_NAMES.has(key.name)) break;
      const atom: CalcAtom = { kind: "fn", name: key.name };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "i": {
      // the 991CW's SHIFT+×10ˣ — the complex unit (the component gates
      // the key by the model's features; the atom always evaluates)
      const atom: CalcAtom = { kind: "i" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "eq-ins": {
      // the 991CW's SHIFT+( "=" — an equation piece; evaluating a
      // bare "=" in Calculate is a Syntax ERROR (the device law —
      // the Equation app that consumes it is phase C, not a fake)
      buf.splice(cur, 0, { kind: "eqtok" });
      cur += 1;
      fracField = null;
      break;
    }
    case "comma": {
      buf.splice(cur, 0, { kind: "comma" });
      cur += 1;
      fracField = null;
      break;
    }
    case "recur": {
      // the 83GT's SHIFT+x² — the recurring-decimal template (whole
      // part + repeating block, the device's two-box ■̇ entry). The
      // cursor lands in the REPEATING box first (the device flow: press
      // SHIFT, then x², then type the digits you want to repeat; the
      // whole part defaults to 0 — ◀ reaches it).
      const atom: CalcAtom = { kind: "recur", whole: "", rep: "" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      fracField = "rep";
      break;
    }
    default:
      break;
  }

  void continueFromAns;
  return consume({ ...s, buf, cur, fracField, shown: "input", error: null });
}

/**
 * The device limit (the fx-83GT CW computes to ±9.999…×10⁹⁹): beyond it
 * the real hardware shows Math ERROR — pinned honesty, not silent inf.
 * Complex results clamp on the magnitude (the device's own overflow law
 * for the complex path).
 */
function clampDevice(v: CalcValue): CalcValue {
  const mag = isC(v) ? Math.hypot(v.re, v.im) : Math.abs(toNumber(v));
  if (!Number.isFinite(mag) || mag >= 1e100) throw new CalcError("Math ERROR");
  return v;
}

// ── evaluation: tokenizer-free recursive descent over the atoms ───────

type AtomCursor = { at: number };

export function evaluateAtoms(buf: CalcAtom[], angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>> = {}, fns: CalcFns = { f: null, g: null }, complex = false): CalcValue {
  const padded = padAutoClose(buf);
  const c: AtomCursor = { at: 0 };
  const v = parseExpr(padded, c, angle, ans, vars, fns, complex);
  if (c.at !== padded.length) throw new CalcError("Syntax ERROR");
  return v;
}

/**
 * Casio: unclosed parens auto-close at '=' — sin(30 = is 1/2, (1+2 =
 * is 3. A stray ')' that closes NOTHING is a Syntax ERROR (pinned).
 * PHASE B: nesting beyond 15 levels is the device's Stack ERROR (the
 * Casio stack law; Argument/Range stay vocabulary-only — no fake sites).
 */
function padAutoClose(buf: CalcAtom[]): CalcAtom[] {
  let depth = 0;
  for (const a of buf) {
    if (a.kind === "fn" || a.kind === "lparen") {
      depth += 1;
      if (depth > 15) throw new CalcError("Stack ERROR");
    } else if (a.kind === "rparen") {
      depth -= 1;
      if (depth < 0) throw new CalcError("Syntax ERROR");
    }
  }
  if (depth === 0) return buf;
  return [...buf, ...Array.from({ length: depth }, () => ({ kind: "rparen" as const }))];
}

function peek(buf: CalcAtom[], c: AtomCursor): CalcAtom | undefined {
  return buf[c.at];
}

/** implicit multiplication: 2π, 3(, )(, )sin(, Ans(, ½π, 2A, 2i — the Casio law. */
function implicitMul(a: CalcAtom | undefined, b: CalcAtom): boolean {
  if (!a) return false;
  const prevCloses = a.kind === "num" || a.kind === "const" || a.kind === "ans" || a.kind === "rparen" || a.kind === "postfix" || a.kind === "frac" || a.kind === "var" || a.kind === "val" || a.kind === "recur";
  const nextOpens = b.kind === "lparen" || b.kind === "fn" || b.kind === "const" || b.kind === "ans" || b.kind === "num" || b.kind === "frac" || b.kind === "var" || b.kind === "val" || b.kind === "i" || b.kind === "recur";
  return prevCloses && nextOpens;
}

function parseExpr(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  let left = parseTerm(buf, c, angle, ans, vars, fns, cx);
  for (;;) {
    const t = peek(buf, c);
    if (t && t.kind === "op" && (t.op === "+" || t.op === "-")) {
      c.at += 1;
      const rightStart = c.at;
      const right = parseTerm(buf, c, angle, ans, vars, fns, cx);
      // ── the Casio % law: 50+10% = 55 — a % directly on the RIGHT
      // operand of ± makes it a fraction OF THE LEFT ──
      if (endsWithPct(buf, rightStart, c.at)) {
        // the % postfix ALREADY divided the right operand by 100; the ±
        // law reinterprets it as a fraction OF THE LEFT (50+10% = 55)
        const share = valMul(left, right);
        left = t.op === "+" ? valAdd(left, share) : valSub(left, share);
      } else {
        left = t.op === "+" ? valAdd(left, right) : valSub(left, right);
      }
    } else break;
  }
  return left;
}

/** did the operand just parsed END with a % postfix (the ± context law)? */
function endsWithPct(buf: CalcAtom[], start: number, end: number): boolean {
  for (let i = end - 1; i >= start; i--) {
    const a = buf[i];
    if (a.kind === "postfix" && a.op === "%") return true;
    if (a.kind === "postfix" || a.kind === "rparen") continue;
    if (a.kind === "num" || a.kind === "const" || a.kind === "ans" || a.kind === "frac") return false;
    return false;
  }
  return false;
}

function parseTerm(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  let left = parseUnary(buf, c, angle, ans, vars, fns, cx);
  for (;;) {
    // implicit multiplication binds at term level: 2π, 3sin(, (1+2)(3), 2A
    const t = peek(buf, c);
    if (t && implicitMul(buf[c.at - 1], t)) {
      const right = parseUnary(buf, c, angle, ans, vars, fns, cx);
      left = valMul(left, right);
      continue;
    }
    if (t && t.kind === "op" && (t.op === "×" || t.op === "÷")) {
      c.at += 1;
      const right = parseUnary(buf, c, angle, ans, vars, fns, cx);
      left = t.op === "×" ? valMul(left, right) : valDiv(left, right);
      continue;
    }
    break;
  }
  return left;
}

function parseUnary(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  const t = peek(buf, c);
  if (t && t.kind === "op" && t.op === "-") {
    c.at += 1;
    // Casio: −2² = −4 — the postfix binds TIGHTER than negation
    return valNeg(parsePostfix(buf, c, angle, ans, vars, fns, cx));
  }
  if (t && t.kind === "op" && t.op === "+") {
    c.at += 1;
    return parseUnary(buf, c, angle, ans, vars, fns, cx);
  }
  return parsePostfix(buf, c, angle, ans, vars, fns, cx);
}

function parsePostfix(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  let v = parsePower(buf, c, angle, ans, vars, fns, cx);
  for (;;) {
    const t = peek(buf, c);
    if (t && t.kind === "postfix") {
      c.at += 1;
      if (t.op === "²") v = valPow(v, rat(BigInt(2)));
      else if (t.op === "³") v = valPow(v, rat(BigInt(3)));
      else if (t.op === "⁻¹") v = valDiv(rat(BigInt(1)), v);
      else if (t.op === "%") v = valDiv(v, rat(BigInt(100)));
      else if (t.op === "!") v = factorialVal(v);
      continue;
    }
    break;
  }
  return v;
}

function parsePower(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  const base = parsePrimary(buf, c, angle, ans, vars, fns, cx);
  const t = peek(buf, c);
  if (t && t.kind === "pow") {
    c.at += 1;
    // RIGHT-associative: 2^3^2 = 2^(3^2) = 512 (pinned Casio law)
    const exp = parseUnary(buf, c, angle, ans, vars, fns, cx);
    return valPow(base, exp);
  }
  return base;
}

function parsePrimary(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, vars: Partial<Record<CalcVarName, CalcValue>>, fns: CalcFns, cx: boolean): CalcValue {
  const t = peek(buf, c);
  if (!t) throw new CalcError("Syntax ERROR");
  if (t.kind === "num") {
    c.at += 1;
    const x = Number(t.text);
    if (!Number.isFinite(x)) throw new CalcError("Syntax ERROR");
    return ratFromNumber(x);
  }
  if (t.kind === "val") {
    // the f/g substitution carrier — an EXACT value rides verbatim
    c.at += 1;
    return t.v;
  }
  if (t.kind === "var") {
    c.at += 1;
    // the device: an UNSET variable evaluates to 0
    return vars[t.name] ?? rat(BigInt(0));
  }
  if (t.kind === "frac") {
    c.at += 1;
    if (t.n === "" || t.d === "") throw new CalcError("Syntax ERROR");
    const n = Number(t.n);
    const d = Number(t.d);
    if (!Number.isFinite(n) || !Number.isFinite(d)) throw new CalcError("Syntax ERROR");
    return rat(BigInt(truncDigits(t.n)), BigInt(truncDigits(t.d)));
  }
  if (t.kind === "recur") {
    // the 83GT's recurring-decimal entry: exact rational — whole + the
    // repeating block over 10^k − 1 (0.5̇8̇ → 58/99; the rational core
    // applies: the entry is a rational BY DEFINITION)
    c.at += 1;
    if (t.rep === "") throw new CalcError("Syntax ERROR");
    const whole = t.whole === "" ? BigInt(0) : BigInt(truncDigits(t.whole));
    const rep = BigInt(truncDigits(t.rep));
    const k = BigInt(t.rep.length);
    let denom = BigInt(1);
    for (let i = 0; i < t.rep.length; i++) denom *= BigInt(10);
    denom -= BigInt(1); // 10^k − 1 (k ≥ 1 here — rep is non-empty)
    return rat(whole * denom + rep, denom);
  }
  if (t.kind === "i") {
    // the 991CW's complex unit
    c.at += 1;
    return cVal(0, 1);
  }
  if (t.kind === "const") {
    c.at += 1;
    return t.name === "π" ? { exact: false, v: Math.PI } : { exact: false, v: Math.E };
  }
  if (t.kind === "ans") {
    c.at += 1;
    if (!ans) throw new CalcError("Syntax ERROR");
    return ans;
  }
  if (t.kind === "lparen") {
    c.at += 1;
    const v = parseExpr(buf, c, angle, ans, vars, fns, cx);
    const close = peek(buf, c);
    if (!close || close.kind !== "rparen") throw new CalcError("Syntax ERROR");
    c.at += 1;
    return v;
  }
  if (t.kind === "fn") {
    c.at += 1;
    // the binary probability functions take a comma-separated pair —
    // nPr(5,2): the device's own argument shape
    if (t.name === "nPr" || t.name === "nCr") {
      const a = parseExpr(buf, c, angle, ans, vars, fns, cx);
      const sep = peek(buf, c);
      if (!sep || sep.kind !== "comma") throw new CalcError("Syntax ERROR");
      c.at += 1;
      const b = parseExpr(buf, c, angle, ans, vars, fns, cx);
      const close = peek(buf, c);
      if (!close || close.kind !== "rparen") throw new CalcError("Syntax ERROR");
      c.at += 1;
      return applyFnBinary(t.name, a, b);
    }
    // the fn opens an implicit paren; the argument runs to its matching )
    const arg = parseExpr(buf, c, angle, ans, vars, fns, cx);
    const close = peek(buf, c);
    if (!close || close.kind !== "rparen") throw new CalcError("Syntax ERROR");
    c.at += 1;
    // T-MG-CALC-2 phase A: the f(x)/g(x) calls — substitute var x with
    // the argument as an EXACT val atom (no decimal drift) and drop the
    // callee from the inner scope (the recursion guard: a self-call is
    // an undefined function in the body → Math ERROR, never a hang).
    if (t.name === "f" || t.name === "g") {
      const body = fns[t.name];
      if (!body) throw new CalcError("Math ERROR");
      const substituted = body.map((a) => (a.kind === "var" && a.name === "x" ? ({ kind: "val", v: arg } as CalcAtom) : a));
      return evaluateAtoms(substituted, angle, ans, vars, t.name === "f" ? { f: null, g: fns.g } : { f: fns.f, g: null }, cx);
    }
    return applyFn(t.name, arg, angle, cx);
  }
  // comma/eqtok land here — a bare "," or "=" outside its function is
  // the device's Syntax ERROR (pinned law for the SHIFT+( "=" piece)
  throw new CalcError("Syntax ERROR");
}

function truncDigits(s: string): string {
  // BigInt ctor safety: integers only in fraction fields (Casio's a b/c
  // takes integers); a '.' is a Syntax ERROR at eval.
  if (!/^-?\d+$/.test(s)) throw new CalcError("Syntax ERROR");
  if (s.length > 15) throw new CalcError("Math ERROR");
  return s;
}

/** the binary probability functions (the comma-argument law). */
function applyFnBinary(name: string, a: CalcValue, b: CalcValue): CalcValue {
  if (isC(a) || isC(b)) throw new CalcError("Math ERROR");
  const r = toNumber(b);
  const n = toNumber(a);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !a.exact || !b.exact) throw new CalcError("Math ERROR");
  if (a.d !== BigInt(1) || b.d !== BigInt(1)) throw new CalcError("Math ERROR");
  if (n < 0 || r < 0 || r > n || n > 999) throw new CalcError("Math ERROR");
  // exact BigInt products (the rational core; the result is an integer)
  let num = BigInt(1);
  for (let i = 0; i < Number(r); i++) num *= BigInt(Number(n) - i);
  if (name === "nPr") return rat(num);
  let den = BigInt(1);
  for (let i = 2; i <= Number(r); i++) den *= BigInt(i);
  return rat(num, den);
}

function applyFn(name: string, x: CalcValue, angle: CalcAngle, cx = false): CalcValue {
  // ── the complex path (the 991CW's i): the phase-B scope is the
  // arithmetic + Abs + √; the wider function set honestly refuses
  // (Math ERROR) — a documented boundary, not a silent wrong value.
  if (isC(x)) {
    if (name === "abs") {
      const m = Math.hypot(x.re, x.im);
      if (!Number.isFinite(m)) throw new CalcError("Math ERROR");
      return ratFromNumber(m);
    }
    if (name === "√") {
      // the complex square root: r∠θ half-angle formula; a pure
      // negative real lands on the imaginary axis (√(−4) = 2i)
      const r = Math.hypot(x.re, x.im);
      if (!Number.isFinite(r)) throw new CalcError("Math ERROR");
      const sr = Math.sqrt((r + x.re) / 2);
      const si = Math.sqrt(Math.max(0, (r - x.re) / 2)) * (x.im < 0 ? -1 : 1);
      return cVal(sr, si);
    }
    throw new CalcError("Math ERROR");
  }
  const v = toNumber(x);
  const toRad = (a: number): number => (angle === "DEG" ? (a * Math.PI) / 180 : angle === "GRA" ? (a * Math.PI) / 200 : a);
  const fromRad = (r: number): number => (angle === "DEG" ? (r * 180) / Math.PI : angle === "GRA" ? (r * 200) / Math.PI : r);
  switch (name) {
    case "sin": {
      const r = Math.sin(toRad(v));
      return ratFromNumber(snapTrig(r, angle, v, "sin"));
    }
    case "cos": {
      const r = Math.cos(toRad(v));
      return ratFromNumber(snapTrig(r, angle, v, "cos"));
    }
    case "tan": {
      const r = Math.tan(toRad(v));
      if (!Number.isFinite(r) || Math.abs(r) > 1e15) throw new CalcError("Math ERROR");
      return ratFromNumber(snapTrig(r, angle, v, "tan"));
    }
    case "asin": {
      if (v < -1 || v > 1) throw new CalcError("Math ERROR");
      return ratFromNumber(fromRad(Math.asin(v)));
    }
    case "acos": {
      if (v < -1 || v > 1) throw new CalcError("Math ERROR");
      return ratFromNumber(fromRad(Math.acos(v)));
    }
    case "atan":
      return ratFromNumber(fromRad(Math.atan(v)));
    case "hsin":
      return ratFromNumber(Math.sinh(v));
    case "hcos":
      return ratFromNumber(Math.cosh(v));
    case "htan": {
      const r = Math.tanh(v);
      return ratFromNumber(r);
    }
    case "hasin":
      return ratFromNumber(Math.asinh(v));
    case "hacos":
      if (v < 1) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.acosh(v));
    case "hatan":
      return ratFromNumber(Math.atanh(Math.abs(v) < 1 ? v : NaN));
    case "abs":
      return x.exact ? rat(x.n < BigInt(0) ? -x.n : x.n, x.d) : ratFromNumber(Math.abs(v));
    case "log": {
      if (v <= 0) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.log10(v));
    }
    case "ln": {
      if (v <= 0) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.log(v));
    }
    case "√": {
      if (v < 0) {
        // the 991CW's complex law: √(negative) is the complex root —
        // EXACT when the magnitude is a perfect square (√(−4) = 2i);
        // the 83GT (complex: false) keeps the Math ERROR device law.
        if (!cx) throw new CalcError("Math ERROR");
        if (x.exact) {
          const an = x.n < BigInt(0) ? -x.n : x.n;
          const rn = bigintSqrt(an);
          const rd = bigintSqrt(x.d);
          if (rn !== null && rd !== null) return cVal(0, Number(rn) / Number(rd));
        }
        return cVal(0, Math.sqrt(-v));
      }
      // exact when the argument is a perfect square (the rational core)
      if (x.exact) {
        const n = x.n;
        const d = x.d;
        const rn = bigintSqrt(n);
        const rd = bigintSqrt(d);
        if (rn !== null && rd !== null) return rat(rn, rd);
      }
      return ratFromNumber(Math.sqrt(v));
    }
    case "³√": {
      if (v < 0) return ratFromNumber(-Math.cbrt(-v));
      return ratFromNumber(Math.cbrt(v));
    }
    case "10^":
      return ratFromNumber(Math.pow(10, v));
    case "e^":
      return ratFromNumber(Math.exp(v));
    default:
      throw new CalcError("Syntax ERROR");
  }
}

function bigintSqrt(n: bigint): bigint | null {
  if (n < BigInt(0)) return null;
  if (n === BigInt(0)) return BigInt(0);
  let lo = BigInt(1);
  let hi = n;
  while (lo <= hi) {
    const mid = (lo + hi) / BigInt(2);
    const sq = mid * mid;
    if (sq === n) return mid;
    if (sq < n) lo = mid + BigInt(1);
    else hi = mid - BigInt(1);
  }
  return null;
}

/**
 * The trig snap: the device shows sin(30°) = 1/2, not 0.4999999999….
 * Inside the float path an EXACT half/quarter turn result snaps to the
 * rational the hardware displays (0, ±1/2, ±1); anything else stays float.
 */
function snapTrig(r: number, angle: CalcAngle, v: number, f: "sin" | "cos" | "tan"): number {
  if (angle !== "DEG") return r;
  const norm = ((v % 360) + 360) % 360;
  if (f === "sin") {
    if (norm === 0 || norm === 180) return 0;
    if (norm === 90) return 1;
    if (norm === 270) return -1;
    if (norm === 30 || norm === 150) return 0.5;
    if (norm === 210 || norm === 330) return -0.5;
  }
  if (f === "cos") {
    if (norm === 90 || norm === 270) return 0;
    if (norm === 0) return 1;
    if (norm === 180) return -1;
    if (norm === 60 || norm === 300) return 0.5;
    if (norm === 120 || norm === 240) return -0.5;
  }
  if (f === "tan") {
    if (norm === 0 || norm === 180) return 0;
    if (norm === 45 || norm === 225) return 1;
    if (norm === 135 || norm === 315) return -1;
  }
  return r;
}

// ── display: the 10-sig-digit formatter + fraction/ENG renderers ──────

const SIG_DIGITS = 10;

/**
 * T-MG-CALC-2 phase A: the display-format options (the CW SETTINGS
 * screen's rows). Defaults keep every pre-phase-A pin byte-stable:
 * Norm 2 band, dot mark, no grouping (the device ships grouping ON —
 * OUR law of record ships it OFF and the settings row turns it on).
 * PHASE B: sciDigits (Sci n — significant-digit scientific), io (the
 * Input/Output row's complex display family: mathI/DecimalI → the polar
 * r∠θ reading), and angleUnit (the ∠ value follows the angle setting).
 */
export interface CalcDisplayFmt {
  /** mixed fraction rendering for exact values (the ⇄ law). */
  mixed?: boolean;
  /** the Norm band: 1 → exponential below 10^-2, 2 → below 10^-9. */
  normVariant?: 1 | 2;
  /** Sci n: n significant digits in ×10^e form (overrides Norm/Fix). */
  sciDigits?: number;
  /** the decimal mark (Dot/Comma; the separator swaps with it). */
  decimalMark?: "." | ",";
  /** digit grouping on the integer part. */
  separator?: boolean;
  /** the complex display family: mathI/DecimalI renders r∠θ. */
  io?: "mathI/mathO" | "mathI/DecimalI";
  /** the ∠ value's angle unit (DEG default). */
  angleUnit?: "DEG" | "RAD" | "GRA";
}

/** the decimal mark swap + integer grouping, applied to the mantissa
 * segment only (an "×10^e" tail passes through untouched). */
function applyMarkAndGroup(s: string, mark: "." | ",", separator?: boolean): string {
  const idx = s.indexOf("×10^");
  const head = idx >= 0 ? s.slice(0, idx) : s;
  const tail = idx >= 0 ? s.slice(idx) : "";
  let h = head;
  if (mark === ",") h = h.replace(/\./g, ",");
  if (separator) {
    const sep = mark === "." ? "," : ".";
    h = h.replace(/-?\d+/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, sep));
  }
  return h + tail;
}

/** The decimal display: 10 significant digits, trailing zeros trimmed;
 * Fix N pins N decimals (overriding everything); Sci N renders N
 * significant digits in ×10^e (also overriding — the numberFormat union
 * is exclusive); below the Norm band the value goes exponential in the
 * device's ×10^e rendering. */
export function formatDecimal(v: CalcValue, fix = 0, fmt: CalcDisplayFmt = {}): string {
  const x = toNumber(v);
  if (!Number.isFinite(x)) throw new CalcError("Math ERROR");
  const mark = fmt.decimalMark ?? ".";
  if (x === 0) return applyMarkAndGroup(fix > 0 ? (0).toFixed(fix) : "0", mark, fmt.separator);
  let out: string;
  const sci = fmt.sciDigits ?? 0;
  if (fix > 0) {
    out = x.toFixed(fix);
  } else if (sci > 0) {
    // Sci n = n significant digits: toExponential(n − 1), the device's
    // ×10^e rendering (S⇔D is inert under Sci — the sd branch guards it)
    const [mm, ee] = x.toExponential(sci - 1).split("e");
    out = `${trimZeros(mm)}×10^${Number(ee)}`;
  } else {
    const nv = fmt.normVariant ?? 2;
    // the Casio Norm law: decimals BELOW the band go exponential
    // (Norm 1 < 10^-2, Norm 2 < 10^-9); the 10-sig count is unchanged
    if (Math.abs(x) < Math.pow(10, -(nv === 1 ? 2 : 9))) {
      const exp = Math.floor(Math.log10(Math.abs(x)));
      const mant = x / Math.pow(10, exp);
      const m = trimZeros(Number(mant.toPrecision(SIG_DIGITS)).toString());
      out = exp === 0 ? m : `${m}×10^${exp}`;
    } else {
      out = trimZeros(x.toPrecision(SIG_DIGITS));
    }
  }
  return applyMarkAndGroup(out, mark, fmt.separator);
}

function trimZeros(s: string): string {
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    return `${m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m}e${e}`;
  }
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * The natural display of a committed value (card L4): exact rational →
 * "n/d" (reduced; mixed a b/d when the ⇄ law asks); float → the 10-sig
 * decimal. ENG renders the decimal as mantissa ×10^(multiple of 3) —
 * the Casio engineering stepping. T-MG-CALC-1 fix pin: Fix N overrides
 * the exact-fraction branch (the device shows fixed decimals for EVERY
 * value under Fix) and fixes the ENG mantissa too.
 */
/** the complex display: a+bi (rectangular, the mathI/mathO family) or
 * r∠θ (the mathI/DecimalI reading — the ∠ value follows the angle
 * unit). Real-only results collapse to their plain rendering (2+0i → 2,
 * the device law); each part renders through the same decimal law. */
function formatComplex(v: Extract<CalcValue, { c: true; re: number; im: number }>, fix: number, fmt: CalcDisplayFmt): string {
  const part = (x: number): string => formatDecimal({ exact: false, v: x }, fix, { ...fmt, sciDigits: fmt.sciDigits });
  if (fmt.io === "mathI/DecimalI") {
    const r = Math.hypot(v.re, v.im);
    const thetaRad = Math.atan2(v.im, v.re);
    const theta = fmt.angleUnit === "RAD" ? thetaRad : fmt.angleUnit === "GRA" ? (thetaRad * 200) / Math.PI : (thetaRad * 180) / Math.PI;
    const t = formatDecimal({ exact: false, v: theta }, fix, fmt);
    if (r === 0 && v.im === 0) return part(0);
    return `${part(r)}∠${t}`;
  }
  if (v.im === 0) return part(v.re);
  const imAbs = part(Math.abs(v.im));
  if (v.re === 0) {
    // the device law: the pure unit renders bare — i, never 1i
    if (Math.abs(v.im) === 1) return `${v.im < 0 ? "-" : ""}i`;
    return `${v.im < 0 ? "-" : ""}${imAbs}i`;
  }
  return `${part(v.re)}${v.im < 0 ? "-" : "+"}${imAbs}i`;
}

export function formatNatural(v: CalcValue, form: "fraction" | "decimal" | "eng", fix = 0, fmt: CalcDisplayFmt = {}): string {
  if (isC(v)) return formatComplex(v, fix, fmt);
  if (form === "fraction") {
    // Fix/Sci override the exact-fraction display (the T-MG-CALC-1
    // FIX-vs-exact deviation, closed for BOTH branches in phase B)
    if (fix > 0 || (fmt.sciDigits ?? 0) > 0) return formatDecimal(v, fix, fmt);
    if (v.exact) {
      // an integer result renders PLAIN (5, never 5/1 — the device law)
      if (v.d === BigInt(1)) return `${v.n}`;
      // the ⇄ law: mixed renders a b/d when improper and |n|>|d|
      if (fmt.mixed) {
        const neg = v.n < BigInt(0);
        const n = neg ? -v.n : v.n;
        if (n > v.d) {
          const whole = n / v.d;
          const rem = n % v.d;
          if (rem !== BigInt(0)) return `${neg ? "-" : ""}${whole} ${rem}/${v.d}`;
        }
      }
      return `${v.n}/${v.d}`;
    }
    return formatDecimal(v, fix, fmt);
  }
  if (form === "eng") {
    const x = toNumber(v);
    if (x === 0 || !Number.isFinite(x)) return formatDecimal(v, fix, fmt);
    const exp = Math.floor(Math.log10(Math.abs(x)) / 3) * 3;
    const mant = x / Math.pow(10, exp);
    // Fix N fixes the mantissa's decimals (the device's Fix+ENG law)
    const m = fix > 0 ? Number(mant).toFixed(fix) : trimZeros(Number(mant.toPrecision(SIG_DIGITS)).toString());
    return applyMarkAndGroup(exp === 0 ? m : `${m}×10^${exp}`, fmt.decimalMark ?? ".", fmt.separator);
  }
  return formatDecimal(v, fix, fmt);
}

/**
 * KaTeX for the input buffer (the component's preview line): textbook
 * rendering — \frac for fractions, \sqrt for roots, implicit × as
 * juxtaposition (the Casio display shows 2π, not 2×π).
 */
export function bufferToTex(buf: CalcAtom[]): string {
  let out = "";
  for (const a of buf) {
    switch (a.kind) {
      case "num":
        out += a.text;
        break;
      case "op":
        out += a.op === "×" ? " \\times " : a.op === "÷" ? " \\div " : a.op === "-" ? "-" : "+";
        break;
      case "pow":
        out += "^{";
        break;
      case "postfix":
        out += a.op === "²" ? "^{2}" : a.op === "³" ? "^{3}" : a.op === "⁻¹" ? "^{-1}" : a.op === "!" ? "!" : "\\%";
        break;
      case "lparen":
        out += "(";
        break;
      case "rparen":
        out += ")";
        break;
      case "const":
        out += a.name === "π" ? "\\pi " : "\\mathrm{e} ";
        break;
      case "ans":
        out += "\\mathrm{Ans}";
        break;
      case "var":
        out += a.name;
        break;
      case "val":
        out += formatNatural(a.v, "decimal");
        break;
      case "frac":
        out += `\\frac{${a.n || "\\square"}}{${a.d || "\\square"}}`;
        break;
      case "recur": {
        // the cw-recur-digit rendering: an overdot on EVERY repeating
        // digit (the device's ■̇ law)
        const dots = [...a.rep].map((d) => `\\dot{${d}}`).join("");
        out += `${a.whole || "0"}.\\!${dots}`;
        break;
      }
      case "i":
        out += "\\mathrm{i}";
        break;
      case "eqtok":
        out += "=";
        break;
      case "comma":
        out += ",";
        break;
      case "fn": {
        const tex = FN_TEX[a.name] ?? `\\mathrm{${a.name}}`;
        out += `${tex}(`;
        break;
      }
    }
  }
  // close the ^{ opened by pow (the exponent renders after the cursor)
  const opens = (out.match(/\^\{/g) || []).length - (out.match(/\^\{2\}|\^\{3\}|\^\{-1\}/g) || []).length;
  for (let i = 0; i < opens; i++) out += "}";
  return out;
}

const FN_TEX: Record<string, string> = {
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  asin: "\\sin^{-1}",
  acos: "\\cos^{-1}",
  atan: "\\tan^{-1}",
  hsin: "\\sinh",
  hcos: "\\cosh",
  htan: "\\tanh",
  hasin: "\\sinh^{-1}",
  hacos: "\\cosh^{-1}",
  hatan: "\\tanh^{-1}",
  log: "\\log",
  ln: "\\ln",
  "√": "\\sqrt",
  "³√": "\\sqrt[3]",
  "10^": "10^{",
  "e^": "\\mathrm{e}^{",
  nPr: "\\mathrm{nPr}",
  nCr: "\\mathrm{nCr}",
  abs: "\\mathrm{Abs}",
};
