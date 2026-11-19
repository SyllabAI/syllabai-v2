/**
 * calc-apps.ts — T-MG-CALC-2 phase C: the Statistics and Table app
 * engines (the spec pin 5: the exam-honest scope — Statistics
 * (1-variable/2-variable lists + summary stats) and Table (f(x)/g(x)
 * generation) are the ONLY apps shipped, matching MG's enabled set).
 *
 * T-MG-CALC-2 phase D (operator ruling 2026-11-19: implement ahead of
 * MG's rollout, by exam value): the Equation app joins the enabled set
 * — Simul Equation (2–4 unknowns) and Polynomial (2nd–4th degree).
 *
 * DEVICE LAWS — verified from the official Casio fx-570CW/991CW online
 * manual (support.casio.com/global/en/calc/manual/fx-570CW_991CW_en,
 * "Statistical Calculations" and "Creating a Number Table" pages, read
 * live during the phase-C run; the "Equation Calculations" page read
 * live during the phase-D run — the official PDF is unreachable from
 * this sandbox (the CDN blocks the egress), the HTML manual is the same
 * official source):
 *
 * Statistics:
 *  - the app opens with the [1-Variable] / [2-Variable] menu, then the
 *    Statistics Editor (x, or x,y columns);
 *  - the editor row caps: 160 rows for one column, 80 rows for two
 *    (the manual's "Inputting Data with Statistics Editor");
 *  - [1-Var Results]: the summary set from the manual's CATALOG
 *    groupings — Σx, Σx², x̄, σ²x, σx, s²x, sx, n, min(x), Q1, Med,
 *    max(x) with Q3 — rendered here in the manual's own grouping order
 *    (Summation → Mean/Var/Dev → Min/Max/Quartile), OUR presentation
 *    ruling (the device's screenshot order was not machine-readable);
 *  - [2-Var Results] adds the y-set and Σxy; [Reg Results] adds the
 *    linear regression y = a + bx coefficients (a, b) and r.
 *
 * DOCUMENTED RULING (the quartile law): Q1/Q3 are the medians of the
 * lower/upper halves of the SORTED data, with the median value itself
 * included in BOTH halves when n is odd (n even → the halves are the
 * first/last n/2 values). This is the Casio convention as taught
 * across the UK exam boards and coherent with the fx-83GTX manual's
 * worked example {1..10} → Q1 3, Med 5.5, Q3 8; MG's STAT internals
 * were never captured (the card's evidence map), so the law is pinned
 * as OUR convention — the device-verification open question rides the
 * card, exactly like the 83GT "," binding ruling in phase B.
 *
 * Table:
 *  - Table Type: f(x)/g(x) both (the initial default), f(x) only, or
 *    g(x) only;
 *  - the row caps: up to 45 rows for f(x) or g(x) alone, 30 rows for
 *    f(x)/g(x) both (the manual's "Maximum Number of Rows in a Number
 *    Table According to Table Type");
 *  - the range loop: x runs start, start+step, … while x ≤ end;
 *  - the values come from the shared f(x)/g(x) defining equations (the
 *    FUNCTION key's slots), substituted EXACTLY (the engine's own
 *    fn-call law — no decimal drift);
 *  - the manual: "The number table generation operation causes the
 *    contents of variable x to be changed" — the generator returns the
 *    final x so the caller can store it (the side-effect law);
 *  - a bad range (Step ≤ 0, Start > End) or a cap violation raises
 *    Range ERROR — phase C gives Range ERROR its FIRST genuine raise
 *    site (the phase-B pin's "no fake errors" posture holds: this one
 *    is real), reusing the device's range-violation error class.
 *
 * The session data (lists, ranges, tables) is IN-MEMORY per the
 * device's retention table (launching another app discards the data);
 * the f/g defining equations stay in the persisted record they already
 * live in.
 *
 * Equation (phase D) — the manual's "Equation Calculations" page:
 *  - the Equation menu: [Simul Equation] / [Polynomial] / [Solver];
 *  - Simul Equation: "Simultaneous linear equations with two to four
 *    unknowns" — the number-of-unknowns menu ([2]/[3]/[4]), then the
 *    Coefficient Editor; AC on the editor clears ALL coefficients to
 *    zero; EXE displays the solution (the device scrolls solutions with
 *    the arrow keys — we render the rows directly, the stat-res
 *    presentation precedent);
 *  - Polynomial: "High-order equations from 2nd to 4th degree" — the
 *    degrees menu ([ax²+bx+c=0] / cubic / quartic), then the
 *    Coefficient Editor (descending); the quadratic additionally
 *    displays the minimum/maximum coordinates (x, y) of y=ax²+bx+c; the
 *    cubic displays the local min/max coordinates when they exist,
 *    else "No Local Max/Min"; the quartic displays roots only;
 *  - Complex Roots: [Complex Roots] > [On]/[Off], Off = the INITIAL
 *    DEFAULT; with Off, an equation whose solutions are all complex
 *    shows "No Real Roots"; with On the solutions render in the a+bi
 *    form (the FORMAT menu's polar/rect conversion rides the engine's
 *    existing io law);
 *  - Solver: Newton's method, decimal-form solutions — PINNED OUT of
 *    phase D (the phase-C "no silent growth" precedent); its menu slot
 *    renders the staged-rollout notice, our honest fence.
 *
 * DOCUMENTED RULINGS (phase D): singular simultaneous systems are
 * DISPLAYED RESULTS, not errors — [No Solution] / [Infinite Solution]
 * rows on the solution screen (Casio's own "Real-Life Problems with
 * fx-991CW" document states the pair verbatim); a zero leading
 * coefficient on the Polynomial editor is a Math ERROR (the degree is
 * fixed by the menu — the equation is no longer of that degree); the
 * 4-unknown solution names are x, y, z, t (the device's variable row);
 * a D'=0 cubic stationary point is "No Local Max/Min" (a stationary
 * inflection is neither a local max nor a local min); the exact-root
 * law: roots land exactly when the rational-root factoring or a
 * rational √ lands, the engine's float path otherwise (the stat
 * engine's honest boundary); the complex roots ride the engine's
 * double-based complex path (the phase-B law), so their display is
 * decimal where the device's MathI/mathO shows the exact surd form —
 * the pinned gap, same posture as σx.
 */
import { CalcAtom, CalcError, CalcFns, CalcValue, CalcAngle, evaluateAtoms } from "./calc-engine";
import type { CalcVarName } from "./calc-models";

// ── exact-rational helpers on the engine's CalcValue ──

type Rat = { exact: true; n: bigint; d: bigint };

const asRat = (v: CalcValue): Rat => {
  if ("c" in v || !v.exact) throw new CalcError("Math ERROR");
  return v;
};

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

const mkRat = (n: bigint, d: bigint): Rat => {
  if (d === BigInt(0)) throw new CalcError("Math ERROR");
  if (d < BigInt(0)) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || BigInt(1);
  return { exact: true, n: n / g, d: d / g };
};

const rAdd = (a: Rat, b: Rat): Rat => mkRat(a.n * b.d + b.n * a.d, a.d * b.d);
const rSub = (a: Rat, b: Rat): Rat => mkRat(a.n * b.d - b.n * a.d, a.d * b.d);
const rMul = (a: Rat, b: Rat): Rat => mkRat(a.n * b.n, a.d * b.d);
const rDiv = (a: Rat, b: Rat): Rat => {
  if (b.n === BigInt(0)) throw new CalcError("Math ERROR");
  return mkRat(a.n * b.d, a.d * b.n);
};
const rCmp = (a: Rat, b: Rat): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

/** sqrt of an exact rational: exact when both sides are perfect
 * squares, otherwise the engine's float path (with the same ±1e100
 * honesty guard the engine uses for magnitudes). */
export function sqrtRat(v: Rat): { exact: true; n: bigint; d: bigint } | { exact: false; v: number } {
  if (v.n < BigInt(0)) throw new CalcError("Math ERROR");
  const s = (x: bigint): bigint | null => {
    if (x < BigInt(0)) return null;
    const r = BigInt(Math.round(Math.sqrt(Number(x))));
    for (let c = r - BigInt(2); c <= r + BigInt(2); c++) {
      if (c >= BigInt(0) && c * c === x) return c;
    }
    return null;
  };
  const rn = s(v.n);
  const rd = s(v.d);
  if (rn !== null && rd !== null) return { exact: true, n: rn, d: rd };
  const f = Number(v.n) / Number(v.d);
  if (!Number.isFinite(f) || Math.sqrt(f) >= 1e100) throw new CalcError("Math ERROR");
  return { exact: false, v: Math.sqrt(f) };
}

// ── the Statistics engine ──

/** The editor's decimal entry ("1", "1.5", "-2.25", ".01") as an exact
 * rational — no float drift in the lists. The leading-dot form is
 * accepted and normalized (".01" = 1/100): the battery-of-record run
 * caught the strict parser rejecting the device's natural leading-dot
 * typing (a documented minor ruling — the value a student means). */
export function statEntryToValue(text: string): CalcValue {
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(text)) throw new CalcError("Syntax ERROR");
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const [int = "", frac = ""] = body.split(".");
  if (frac.length > 15) throw new CalcError("Math ERROR");
  if (!int && !frac) throw new CalcError("Syntax ERROR");
  const n = BigInt(int + frac) * (neg ? BigInt(-1) : BigInt(1));
  return mkRat(n, BigInt(10) ** BigInt(frac.length));
}

/** The quartile law — see the documented ruling in the header. */
function medianOf(sorted: Rat[]): Rat {
  const n = sorted.length;
  if (n === 0) throw new CalcError("Math ERROR");
  const mid = Math.floor(n / 2);
  if (n % 2) return sorted[mid];
  // the exact mean of the two middles
  return mkRat(sorted[mid - 1].n * sorted[mid].d + sorted[mid].n * sorted[mid - 1].d, sorted[mid - 1].d * sorted[mid].d * BigInt(2));
}

export function quartilesOf(sorted: Rat[]): { q1: Rat; q3: Rat } {
  const n = sorted.length;
  if (n === 0) throw new CalcError("Math ERROR");
  const half = n % 2 ? Math.floor(n / 2) + 1 : n / 2; // the median rides BOTH halves when n is odd
  const lower = sorted.slice(0, half);
  const upper = sorted.slice(n - half);
  return { q1: medianOf(lower), q3: medianOf(upper) };
}

export interface Stat1Var {
  n: CalcValue;
  sumX: CalcValue;
  sumX2: CalcValue;
  xBar: CalcValue;
  sig2X: CalcValue;
  sigX: CalcValue;
  s2X: CalcValue | null; // null → the device's Math ERROR (n < 2)
  sX: CalcValue | null;
  minX: CalcValue;
  med: CalcValue;
  q1: CalcValue;
  q3: CalcValue;
  maxX: CalcValue;
}

/** 1-variable summary stats — the manual's value set, exact where the
 * math is exact. s²x/sx need n ≥ 2 (the (n−1) denominator; the device
 * answers Math ERROR for a single data item). */
export function stat1Var(xs: CalcValue[]): Stat1Var {
  if (xs.length === 0) throw new CalcError("Math ERROR");
  const rats = xs.map(asRat);
  const one = mkRat(BigInt(1), BigInt(1));
  const n = mkRat(BigInt(rats.length), BigInt(1));
  let sumX = mkRat(BigInt(0), BigInt(1));
  let sumX2 = mkRat(BigInt(0), BigInt(1));
  for (const r of rats) {
    sumX = rAdd(sumX, r);
    sumX2 = rAdd(sumX2, rMul(r, r));
  }
  const xBar = rDiv(sumX, n);
  // Σ(x−x̄)² = (n·Σx² − (Σx)²)/n  →  σ²x = that/n = (n·Σx² − (Σx)²)/n²
  const Sxx = rSub(rMul(n, sumX2), rMul(sumX, sumX)); // n·Σx² − (Σx)²
  const sig2 = rDiv(Sxx, rMul(n, n));
  const s2 = rats.length >= 2 ? rDiv(Sxx, rMul(n, rSub(n, one))) : null;
  const sorted = [...rats].sort(rCmp);
  const { q1, q3 } = quartilesOf(sorted);
  return {
    n,
    sumX,
    sumX2,
    xBar,
    sig2X: sig2,
    sigX: sqrtRat(asRat(sig2)),
    s2X: s2,
    sX: s2 ? sqrtRat(s2) : null,
    minX: sorted[0],
    med: medianOf(sorted),
    q1,
    q3,
    maxX: sorted[sorted.length - 1],
  };
}

export interface Stat2Var extends Stat1Var {
  sumY: CalcValue;
  sumY2: CalcValue;
  sumXY: CalcValue;
  yBar: CalcValue;
  sig2Y: CalcValue;
  sigY: CalcValue;
  s2Y: CalcValue | null;
  sY: CalcValue | null;
  minY: CalcValue;
  maxY: CalcValue;
  reg: { a: CalcValue; b: CalcValue; r: CalcValue } | null; // null → Math ERROR (see the errors below)
}

/** 2-variable summary + the linear regression y = a + bx (the manual's
 * [Reg Results] for y=a+bx: coefficients a, b and the correlation
 * coefficient r). Math ERROR when the data cannot support them (fewer
 * than 2 pairs, or a constant x/y — a zero spread divides). */
export function stat2Var(xs: CalcValue[], ys: CalcValue[]): Stat2Var {
  if (xs.length !== ys.length || xs.length === 0) throw new CalcError("Math ERROR");
  const base = stat1Var(xs);
  const yr = ys.map(asRat);
  const xr = xs.map(asRat);
  const one = mkRat(BigInt(1), BigInt(1));
  const n = mkRat(BigInt(xs.length), BigInt(1));
  let sumY = mkRat(BigInt(0), BigInt(1));
  let sumY2 = mkRat(BigInt(0), BigInt(1));
  let sumXY = mkRat(BigInt(0), BigInt(1));
  for (let i = 0; i < xs.length; i++) {
    sumY = rAdd(sumY, yr[i]);
    sumY2 = rAdd(sumY2, rMul(yr[i], yr[i]));
    sumXY = rAdd(sumXY, rMul(xr[i], yr[i]));
  }
  const yBar = rDiv(sumY, n);
  const Sxx = rSub(rMul(n, asRat(base.sumX2)), rMul(asRat(base.sumX), asRat(base.sumX)));
  const Syy = rSub(rMul(n, sumY2), rMul(sumY, sumY));
  const Sxy = rSub(rMul(n, sumXY), rMul(asRat(base.sumX), sumY));
  const s2Y = ys.length >= 2 ? rDiv(Syy, rMul(n, rSub(n, one))) : null;
  const sortedY = [...yr].sort(rCmp);
  let reg: { a: CalcValue; b: CalcValue; r: CalcValue } | null = null;
  try {
    const b = rDiv(Sxy, Sxx); // Sxx = 0 (constant x) → Math ERROR
    const a = rSub(yBar, rMul(b, asRat(base.xBar)));
    // r = Sxy / √(Sxx·Syy): exact when the sqrt lands on a perfect
    // square rational, the engine's float path otherwise (the finite
    // guard rides sqrtRat).
    const den = sqrtRat(rMul(Sxx, Syy)); // Syy = 0 → Math ERROR
    const r = den.exact
      ? rDiv(Sxy, den)
      : (() => {
          const num = Number(Sxy.n) / Number(Sxy.d);
          const v = num / den.v;
          if (!Number.isFinite(v)) throw new CalcError("Math ERROR");
          return { exact: false, v } as const;
        })();
    reg = { a, b, r };
  } catch (e) {
    if (!(e instanceof CalcError)) throw e;
    reg = null;
  }
  return {
    ...base,
    sumY,
    sumY2,
    sumXY,
    yBar,
    sig2Y: rDiv(Syy, rMul(n, n)),
    sigY: sqrtRat(rDiv(Syy, rMul(n, n))),
    s2Y,
    sY: s2Y ? sqrtRat(s2Y) : null,
    minY: sortedY[0],
    maxY: sortedY[sortedY.length - 1],
    reg,
  };
}

// ── the Table engine ──

export type TableType = "f" | "g" | "fg";
export const TABLE_ROWS_SINGLE = 45; // the manual: f(x) or g(x) alone
export const TABLE_ROWS_BOTH = 30; // the manual: f(x)/g(x) both

export interface TableCtx {
  angle: CalcAngle;
  ans: CalcValue | null;
  vars: Partial<Record<CalcVarName, CalcValue>>;
  complex: boolean;
}

export interface NumberTable {
  rows: { x: CalcValue; f: CalcValue | null; g: CalcValue | null }[];
  /** the manual's side-effect law: generation changes variable x — the
   * caller stores this into the variable store. */
  lastX: CalcValue;
}

/** Evaluate a defining equation's body at x = v — the engine's own
 * fn-call substitution law (EXACT val-atom, the callee dropped from the
 * inner scope so a self-call is an undefined function → Math ERROR). */
function evalFnAt(body: CalcAtom[], v: CalcValue, name: "f" | "g", ctx: TableCtx, fns: CalcFns): CalcValue {
  const substituted = body.map((a) => (a.kind === "var" && a.name === "x" ? ({ kind: "val", v } as CalcAtom) : a));
  const inner: CalcFns = name === "f" ? { f: null, g: fns.g } : { f: fns.f, g: null };
  return evaluateAtoms(substituted, ctx.angle, ctx.ans, ctx.vars, inner, ctx.complex);
}

/** Generate the number table — the manual's laws, exact throughout.
 * Throws CalcError("Range ERROR") for a bad range or a cap violation,
 * CalcError("Math ERROR") when a defining equation is missing or a
 * value fails (the generation aborts — no partial table). */
export function buildNumberTable(fns: CalcFns, type: TableType, start: CalcValue, end: CalcValue, step: CalcValue, ctx: TableCtx): NumberTable {
  const s = asRat(start);
  const e = asRat(end);
  const t = asRat(step);
  if (t.n <= BigInt(0)) throw new CalcError("Range ERROR");
  if (rCmp(s, e) > 0) throw new CalcError("Range ERROR");
  const fBody = fns.f;
  const gBody = fns.g;
  if ((type === "f" || type === "fg") && !fBody) throw new CalcError("Math ERROR");
  if ((type === "g" || type === "fg") && !gBody) throw new CalcError("Math ERROR");
  // count = floor((end − start)/step) + 1, all exact
  const spanSteps = rSub(e, s);
  const stepsExact = rDiv(spanSteps, t);
  const count = Number(stepsExact.n / stepsExact.d) + 1; // BigInt floor division
  const cap = type === "fg" ? TABLE_ROWS_BOTH : TABLE_ROWS_SINGLE;
  if (count > cap) throw new CalcError("Range ERROR");
  const rows: NumberTable["rows"] = [];
  let lastX: CalcValue = s;
  for (let k = 0; k < count; k++) {
    const xk = rAdd(s, rMul(mkRat(BigInt(k), BigInt(1)), t));
    const f = fBody && (type === "f" || type === "fg") ? evalFnAt(fBody, xk, "f", ctx, fns) : null;
    const g = gBody && (type === "g" || type === "fg") ? evalFnAt(gBody, xk, "g", ctx, fns) : null;
    rows.push({ x: xk, f, g });
    lastX = xk;
  }
  return { rows, lastX };
}

// ── the Equation engine (phase D) ──

export type SimulResult =
  | { kind: "solved"; values: CalcValue[] }
  | { kind: "no-solution" }
  | { kind: "infinite-solution" };

export const SIMUL_UNKNOWN_NAMES = ["x", "y", "z", "t"] as const; // the device's variable row

const ZERO = mkRat(BigInt(0), BigInt(1));
const isZeroRat = (r: Rat) => r.n === BigInt(0);
/** the CalcValue narrowing guard — the union's complex member carries
 * no `exact`, so bare .exact reads fail under TS. */
const isRat = (v: CalcValue): v is Rat => "exact" in v && v.exact;
const ratNum = (r: Rat): number => {
  const v = Number(r.n) / Number(r.d);
  if (!Number.isFinite(v)) throw new CalcError("Math ERROR");
  return v;
};
const numVal = (v: number): CalcValue => {
  if (!Number.isFinite(v) || Math.abs(v) >= 1e100) throw new CalcError("Math ERROR");
  return { exact: false, v };
};
/** the display-order key: the reals ascending, the complex pairs last
 * (our scroll ruling — the device's arrow-scroll order is not
 * machine-readable from the manual's captures). */
const valueNum = (v: CalcValue): number => {
  if ("c" in v) return Number.POSITIVE_INFINITY;
  return v.exact ? ratNum(v) : v.v;
};
/** exact polynomial evaluation by Horner over the rationals (the
 * rational-root probe and the extrema y values). */
const hornerRat = (desc: Rat[], x: Rat): Rat => desc.reduce((acc, c) => rAdd(rMul(acc, x), c), ZERO);
/** integer-scale a rational coefficient list (the rational-root theorem
 * works on integer coefficients; scaling by the LCM changes nothing). */
function toIntegerCoeffs(desc: Rat[]): bigint[] {
  let lcm = BigInt(1);
  for (const r of desc) lcm = (lcm * r.d) / gcd(lcm, r.d);
  return desc.map((r) => r.n * (lcm / r.d));
}
const divisorsOf = (x: bigint): bigint[] => {
  const out: bigint[] = [];
  const ax = x < BigInt(0) ? -x : x;
  for (let k = BigInt(1); k * k <= ax; k++) {
    if (ax % k === BigInt(0)) {
      out.push(k);
      if (k !== ax / k) out.push(ax / k);
    }
  }
  return out;
};

// complex double helpers for Durand–Kerner — the float-path honest
// boundary (the engine's own complex law rides doubles; the phase-B law)
type CD = { re: number; im: number };
const cAdd = (a: CD, b: CD): CD => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: CD, b: CD): CD => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: CD, b: CD): CD => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cAbs2 = (a: CD): number => a.re * a.re + a.im * a.im;

/** Durand–Kerner on ascending double coefficients — the numeric path
 * for polynomials whose roots don't land on the factoring law. */
function durandKerner(asc: number[]): CD[] {
  const n = asc.length - 1;
  if (n < 1) throw new CalcError("Math ERROR");
  const f = (z: CD): CD => {
    let acc: CD = { re: asc[n], im: 0 };
    for (let k = n - 1; k >= 0; k--) acc = cAdd(cMul(acc, z), { re: asc[k], im: 0 });
    return acc;
  };
  const r0 = Math.hypot(0.4, 0.9);
  const ang0 = Math.atan2(0.9, 0.4);
  let zs: CD[] = Array.from({ length: n }, (_, k) => ({ re: Math.pow(r0, k) * Math.cos(k * ang0), im: Math.pow(r0, k) * Math.sin(k * ang0) }));
  for (let it = 0; it < 800; it++) {
    let delta = 0;
    zs = zs.map((zi, i) => {
      let denom: CD = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) if (j !== i) denom = cMul(denom, cSub(zi, zs[j]));
      const d2 = cAbs2(denom);
      if (d2 < 1e-300) return zi; // degenerate cluster — keep and retry next sweep
      const fv = f(zi);
      const step = { re: (fv.re * denom.re + fv.im * denom.im) / d2, im: (fv.im * denom.re - fv.re * denom.im) / d2 };
      delta = Math.max(delta, cAbs2(step));
      return cSub(zi, step);
    });
    if (delta < 1e-15) break;
  }
  // a repeated root splits under DK — collapse tiny clusters to a mean
  const out: CD[] = [];
  for (const z of zs) {
    const near = out.find((o) => cAbs2(cSub(o, z)) < 1e-12);
    if (near) {
      near.re = (near.re + z.re) / 2;
      near.im = (near.im + z.im) / 2;
    } else out.push(z);
  }
  return out;
}

export interface PolyResult {
  /** the solutions in our scroll order: the real roots ascending, the
   * complex pairs last; Off suppresses the complex pairs (the manual's
   * Complex Roots law). The complex ride the engine's double-based
   * path ({c:true} — the phase-B law). */
  solutions: CalcValue[];
  /** the quadratic's min/max coordinates (x, y) or the cubic's local
   * extrema in ascending x (a>0: max first — the cubic's shape law);
   * null = the quartic's roots-only law. */
  extrema: { x: CalcValue; y: CalcValue; kind: "min" | "max" }[] | null;
  noRealRoots: boolean; // the manual's "No Real Roots" (Off + all-complex)
  noLocalMaxMin: boolean; // the manual's "No Local Max/Min"
}

/** solve a quadratic a·x² + b·x + c = 0 (a ≠ 0 — our zero-leading
 * ruling). The exact roots when √D lands on a perfect-square rational,
 * the float path otherwise; the complex pair per the flag. `wantVertex`
 * = the quadratic's coordinate display (the manual's law). */
function solveQuadraticCore(a: Rat, b: Rat, c: Rat, complexRoots: boolean, wantVertex: boolean): PolyResult {
  if (isZeroRat(a)) throw new CalcError("Math ERROR");
  const twoA = rMul(mkRat(BigInt(2), BigInt(1)), a);
  const negB = rSub(ZERO, b);
  const D = rSub(rMul(b, b), rMul(mkRat(BigInt(4), BigInt(1)), rMul(a, c)));
  const solutions: CalcValue[] = [];
  let noRealRoots = false;
  if (isZeroRat(D)) {
    solutions.push(rDiv(negB, twoA)); // the repeated root, one row (our ruling)
  } else if (D.n > BigInt(0)) {
    const s = sqrtRat(D);
    const root1 = s.exact ? rDiv(rSub(negB, mkRat(s.n, s.d)), twoA) : numVal((-ratNum(b) - Math.sqrt(ratNum(D))) / ratNum(twoA));
    const root2 = s.exact ? rDiv(rAdd(negB, mkRat(s.n, s.d)), twoA) : numVal((-ratNum(b) + Math.sqrt(ratNum(D))) / ratNum(twoA));
    // ascending: a>0 → (−b−√D)/2a is the smaller root
    if (rCmp(a, ZERO) > 0) solutions.push(root1, root2);
    else solutions.push(root2, root1);
  } else {
    if (!complexRoots) {
      noRealRoots = true;
    } else {
      const re = ratNum(rDiv(negB, twoA));
      const s = sqrtRat(mkRat(-D.n, D.d));
      const mag = s.exact ? ratNum(rDiv(mkRat(s.n, s.d), twoA)) : Math.sqrt(ratNum(mkRat(-D.n, D.d))) / Math.abs(ratNum(twoA));
      // the pair: im asc then desc (our scroll ruling), re equal
      solutions.push({ c: true, re, im: -Math.abs(mag) } as CalcValue);
      solutions.push({ c: true, re, im: Math.abs(mag) } as CalcValue);
    }
  }
  let extrema: PolyResult["extrema"] = null;
  if (wantVertex) extrema = [quadraticVertexOf(a, b, c)];
  return { solutions, extrema, noRealRoots, noLocalMaxMin: false };
}

/** the quadratic's coordinate display — the manual's law: the minimum
 * (or maximum) coordinates (x, y) of y = ax² + bx + c. */
function quadraticVertexOf(a: Rat, b: Rat, c: Rat): { x: CalcValue; y: CalcValue; kind: "min" | "max" } {
  const twoA = rMul(mkRat(BigInt(2), BigInt(1)), a);
  const vx = rDiv(rSub(ZERO, b), twoA);
  const vy = isRat(vx)
    ? hornerRat([a, b, c], vx)
    : (() => {
        const x0 = ratNum(vx);
        return numVal(ratNum(a) * x0 * x0 + ratNum(b) * x0 + ratNum(c));
      })();
  return { x: vx, y: vy, kind: rCmp(a, ZERO) > 0 ? "min" : "max" };
}

/** the cubic's local extrema — the derivative 3ax² + 2bx + c: the two
 * critical points when D' > 0 (ascending x; a>0 → the smaller-x point
 * is the local MAX — the cubic's shape law), else "No Local Max/Min"
 * (D' ≤ 0: the stationary inflection is neither — our ruling). */
function cubicExtremaOf(desc: Rat[]): PolyResult["extrema"] {
  const d2 = rMul(mkRat(BigInt(3), BigInt(1)), desc[0]);
  const d1 = rMul(mkRat(BigInt(2), BigInt(1)), desc[1]);
  const d0 = desc[2];
  const Dd = rSub(rMul(d1, d1), rMul(mkRat(BigInt(4), BigInt(1)), rMul(d2, d0)));
  if (Dd.n <= BigInt(0)) return null;
  const s = sqrtRat(Dd);
  const twoD2 = rMul(mkRat(BigInt(2), BigInt(1)), d2);
  const negD1 = rSub(ZERO, d1);
  const xs: CalcValue[] = s.exact
    ? [rDiv(rSub(negD1, mkRat(s.n, s.d)), twoD2), rDiv(rAdd(negD1, mkRat(s.n, s.d)), twoD2)]
    : [numVal((-ratNum(d1) - Math.sqrt(ratNum(Dd))) / ratNum(twoD2)), numVal((-ratNum(d1) + Math.sqrt(ratNum(Dd))) / ratNum(twoD2))];
  const pts: { x: CalcValue; y: CalcValue; kind: "min" | "max" }[] = xs
    .map((xv): { x: CalcValue; y: CalcValue; kind: "min" | "max" } => {
      const yv: CalcValue = isRat(xv)
        ? hornerRat(desc, xv)
        : (() => {
            const x0 = (xv as { exact: false; v: number }).v;
            return numVal(desc.reduce((acc, r) => acc * x0 + ratNum(r), 0));
          })();
      return { x: xv, y: yv, kind: rCmp(desc[0], ZERO) > 0 ? "min" : "max" };
    })
    .sort((p, q) => valueNum(p.x) - valueNum(q.x));
  if (rCmp(desc[0], ZERO) > 0) {
    pts[0].kind = "max";
    pts[1].kind = "min";
  } else {
    pts[0].kind = "min";
    pts[1].kind = "max";
  }
  return pts;
}

/** the Polynomial solver — the manual's 2nd–4th degree laws. `desc` is
 * the Coefficient Editor row (descending a, b, c, …). */
export function solvePolynomial(degree: 2 | 3 | 4, desc: CalcValue[], complexRoots: boolean): PolyResult {
  if (desc.length !== degree + 1) throw new CalcError("Syntax ERROR");
  const rats = desc.map(asRat);
  if (isZeroRat(rats[0])) throw new CalcError("Math ERROR");
  if (degree === 2) return solveQuadraticCore(rats[0], rats[1], rats[2], complexRoots, true);

  // the trailing zeros are the factors of x — root 0 (the distinct-root
  // law keeps one row), the reduced polynomial solves
  let body = rats;
  let hadZeroRoot = false;
  while (body.length > 1 && isZeroRat(body[body.length - 1])) {
    hadZeroRoot = true;
    body = body.slice(0, -1);
  }
  const reduced = body.length - 1;
  const base =
    reduced === 0
      ? { solutions: [], extrema: null, noRealRoots: false, noLocalMaxMin: false } // c·x^k — every root is 0 (one row below)
      : reduced === 1
        ? { solutions: [rDiv(rSub(ZERO, body[1]), body[0]) as CalcValue], extrema: null, noRealRoots: false, noLocalMaxMin: false }
        : reduced === 2
          ? solveQuadraticCore(body[0], body[1], body[2], complexRoots, false)
          : solvePolyHigh(reduced as 3 | 4, body, complexRoots);
  // the extrema come from the ORIGINAL editor polynomial (the reduced
  // body loses them): the quadratic's vertex, the cubic's local
  // extrema, the quartic's roots-only law
  const extrema = degree === 3 ? cubicExtremaOf(rats) : null; // degree 2 returned above (its vertex rides the core)
  // the distinct-root law: one row per repeated exact root (our ruling,
  // same posture as the quadratic's repeated root), then the scroll order
  const all = [...(hadZeroRoot ? [ZERO as CalcValue] : []), ...base.solutions];
  const solutions = all
    .filter((v, i) => {
      if (!isRat(v)) return true;
      return !all.slice(0, i).some((w) => isRat(w) && w.n === v.n && w.d === v.d);
    })
    .sort((p, q) => valueNum(p) - valueNum(q));
  return { solutions, extrema, noRealRoots: base.noRealRoots, noLocalMaxMin: degree === 3 && extrema === null };
}

/** the degree-3/4 bodies on an already-zero-stripped coefficient list —
 * the factoring probe (integer coefficients, the rational-root
 * candidates ±p/q with p | the trailing, q | the leading, exact
 * Horner), Durand–Kerner otherwise. */
function solvePolyHigh(degree: 3 | 4, rats: Rat[], complexRoots: boolean): PolyResult {
  const ints = toIntegerCoeffs(rats);
  const cand: Rat[] = [];
  const seen = new Set<string>();
  for (const p of divisorsOf(ints[ints.length - 1])) {
    for (const q of divisorsOf(ints[0])) {
      for (const sign of [BigInt(1), BigInt(-1)]) {
        const key = `${sign * p}/${q}`;
        if (!seen.has(key)) {
          seen.add(key);
          cand.push(mkRat(sign * p, q));
        }
      }
    }
  }
  const found: Rat | null = cand.find((r) => isZeroRat(hornerRat(rats, r))) ?? null;
  const dkRoots = (): CD[] => durandKerner(rats.map(ratNum).reverse());
  /** the DK roots in our scroll order: the real roots ascending, the
   * complex pairs last (On only — the manual's Complex Roots law). */
  const emitDK = (roots: CD[], allowComplex: boolean): CalcValue[] => {
    const reals = roots
      .filter((x) => Math.abs(x.im) < 1e-8)
      .map((x) => x.re)
      .sort((a, b) => a - b)
      .map(numVal);
    if (!allowComplex) return reals;
    const comp = roots
      .filter((x) => Math.abs(x.im) >= 1e-8)
      .sort((p, q) => p.re - q.re || p.im - q.im)
      .map((x) => ({ c: true, re: x.re, im: x.im }) as CalcValue);
    return [...reals, ...comp];
  };

  if (degree === 3) {
    let solutions: CalcValue[];
    if (found) {
      // synthetic division: dividing by (x − r): a; b + r·a; c + r·(b + r·a)
      const q2 = solveQuadraticCore(
        rats[0],
        rAdd(rats[1], rMul(found, rats[0])),
        rAdd(rats[2], rMul(found, rAdd(rats[1], rMul(found, rats[0])))),
        complexRoots,
        false,
      );
      solutions = [found as CalcValue, ...q2.solutions].sort((p, q) => valueNum(p) - valueNum(q));
    } else {
      solutions = emitDK(dkRoots(), complexRoots);
      // a cubic always has a real root — DK's float path must find it;
      // an empty result would be an engine bug, not a device law
      if (solutions.length === 0) throw new CalcError("Math ERROR");
    }
    // the extrema are computed on the ORIGINAL polynomial in
    // solvePolynomial's tail (cubicExtremaOf) — this body is the
    // possibly-zero-stripped reduced polynomial
    return { solutions, extrema: null, noRealRoots: false, noLocalMaxMin: false };
  }

  // degree 4: the rational-root factoring → the cubic (exact), else DK
  if (degree === 4) {
    if (found) {
      const a = rats[0];
      const b = rAdd(rats[1], rMul(found, a));
      const c = rAdd(rats[2], rMul(found, b));
      const d = rAdd(rats[3], rMul(found, c));
      const cub = solvePolynomial(3, [a, b, c, d], complexRoots);
      const solutions = [found as CalcValue, ...cub.solutions].sort((p, q) => valueNum(p) - valueNum(q));
      return { solutions, extrema: null, noRealRoots: cub.noRealRoots, noLocalMaxMin: false };
    }
    const roots = dkRoots();
    const solutions = emitDK(roots, complexRoots);
    const noRealRoots = !solutions.some((s) => !("c" in s)) && !complexRoots;
    return { solutions, extrema: null, noRealRoots, noLocalMaxMin: false };
  }
  throw new CalcError("Syntax ERROR"); // unreachable — the dispatch guards
}

/** Simultaneous linear equations — exact Gauss elimination over Q (the
 * manual's Simul Equation: 2–4 unknowns). `rows` is n×(n+1), the
 * augmented rows a1x + b1y … = c. Singular systems are DISPLAYED
 * results per the device: a row 0 = c≠0 → no-solution, otherwise
 * rank(A) < n → infinite-solution (the documented ruling; Casio's
 * "Real-Life Problems with fx-991CW" document states the
 * [No Solution]/[Infinite Solution] pair verbatim). */
export function solveSimultaneous(n: 2 | 3 | 4, rows: CalcValue[][]): SimulResult {
  if (rows.length !== n || rows.some((r) => r.length !== n + 1)) throw new CalcError("Syntax ERROR");
  const M: Rat[][] = rows.map((r) => r.map(asRat));
  for (let col = 0; col < n; col++) {
    const piv = M.findIndex((row, i) => i >= col && row[col].n !== BigInt(0));
    if (piv < 0) continue; // no pivot in this column — classified below
    if (piv !== col) {
      const t = M[col];
      M[col] = M[piv];
      M[piv] = t;
    }
    const p = M[col][col];
    for (let i = 0; i < n; i++) {
      if (i === col || M[i][col].n === BigInt(0)) continue;
      const f = rDiv(M[i][col], p);
      for (let j = col; j <= n; j++) M[i][j] = rSub(M[i][j], rMul(f, M[col][j]));
    }
  }
  const inconsistent = M.some((row) => row.slice(0, n).every(isZeroRat) && !isZeroRat(row[n]));
  if (inconsistent) return { kind: "no-solution" };
  const rank = M.filter((row) => row.slice(0, n).some((c) => !isZeroRat(c))).length;
  if (rank < n) return { kind: "infinite-solution" };
  const vals: CalcValue[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let acc = M[i][n];
    for (let j = i + 1; j < n; j++) acc = rSub(acc, rMul(M[i][j], vals[j] as Rat));
    vals[i] = rDiv(acc, M[i][i]);
  }
  return { kind: "solved", values: vals };
}

