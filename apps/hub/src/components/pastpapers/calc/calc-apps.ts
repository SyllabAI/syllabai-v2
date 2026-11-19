/**
 * calc-apps.ts — T-MG-CALC-2 phase C: the Statistics and Table app
 * engines (the spec pin 5: the exam-honest scope — Statistics
 * (1-variable/2-variable lists + summary stats) and Table (f(x)/g(x)
 * generation) are the ONLY apps shipped, matching MG's enabled set).
 *
 * DEVICE LAWS — verified from the official Casio fx-570CW/991CW online
 * manual (support.casio.com/global/en/calc/manual/fx-570CW_991CW_en,
 * "Statistical Calculations" and "Creating a Number Table" pages, read
 * live during the phase-C run):
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

/** The editor's decimal entry ("1", "1.5", "-2.25") as an exact
 * rational — no float drift in the lists. */
export function statEntryToValue(text: string): CalcValue {
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new CalcError("Syntax ERROR");
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const [int, frac = ""] = body.split(".");
  if (frac.length > 15) throw new CalcError("Math ERROR");
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
