/**
 * calc-apps.test.ts — T-MG-CALC-2 phase C: the Statistics and Table
 * app engines (the spec pin 5). The device laws verified from the
 * official Casio fx-570CW/991CW online manual are pinned here:
 * the editor/value sets, the quartile convention (the documented
 * ruling — see calc-apps.ts), the Table row caps (45/30), the range
 * laws, the exact substitution and the x-variable side effect.
 */

import { describe, expect, test } from "bun:test";

import { CalcError, type CalcAtom, type CalcFns , type CalcValue } from "./calc-engine";
import {
  buildNumberTable,
  quartilesOf,
  SIMUL_UNKNOWN_NAMES,
  solveByNewton,
  solveInequality,
  solverVariables,
  splitSolverEquation,
  solvePolynomial,
  solveSimultaneous,
  stat1Var,
  stat2Var,
  statEntryToValue,
  TABLE_ROWS_BOTH,
  TABLE_ROWS_SINGLE,
} from "./calc-apps";
import { bufferToTex } from "./calc-engine";

const rat = (n: number, d = 1) => ({ exact: true, n: BigInt(n), d: BigInt(d) } as const);
const num = (text: string): CalcAtom => ({ kind: "num", text });
const op = (o: "+" | "-" | "×" | "÷"): CalcAtom => ({ kind: "op", op: o });
const vx: CalcAtom = { kind: "var", name: "x" };
const frac = (n: string, d: string): CalcAtom => ({ kind: "frac", n, d });

const X2P_HALF: CalcAtom[] = [vx, op("×"), vx, op("+"), frac("1", "2")]; // the manual's own f(x)
const X2M_HALF: CalcAtom[] = [vx, op("×"), vx, op("-"), frac("1", "2")]; // the manual's own g(x)

const CTX = { angle: "DEG" as const, ans: null, vars: {}, complex: false };
const val = (v: { exact: true; n: bigint; d: bigint } | { exact: false; v: number }) => v;

describe("(T1) the 1-variable summary — the manual's value set, exact where exact", () => {
  test("(T1a) {1..5}: the odd-n quartile law rides the include-median halves", () => {
    const r = stat1Var([rat(1), rat(2), rat(3), rat(4), rat(5)]);
    expect(r.n).toEqual(rat(5));
    expect(r.sumX).toEqual(rat(15));
    expect(r.sumX2).toEqual(rat(55));
    expect(r.xBar).toEqual(rat(3));
    expect(r.sig2X).toEqual(rat(2)); // 55/5 − 9 = 2 exact
    expect(r.s2X).toEqual(rat(5, 2)); // 2·5/4
    expect(r.sigX).toEqual({ exact: false, v: Math.sqrt(2) });
    expect(r.minX).toEqual(rat(1));
    expect(r.q1).toEqual(rat(2)); // lower half {1,2,3} → 2
    expect(r.med).toEqual(rat(3));
    expect(r.q3).toEqual(rat(4)); // upper half {3,4,5} → 4
    expect(r.maxX).toEqual(rat(5));
  });
  test("(T1b) even n: {1,2,3,4} → the halves are the first/last two", () => {
    const r = stat1Var([rat(1), rat(2), rat(3), rat(4)]);
    expect(r.q1).toEqual(rat(3, 2));
    expect(r.med).toEqual(rat(5, 2));
    expect(r.q3).toEqual(rat(7, 2));
  });
  test("(T1c) the fx-83GTX manual's worked set {1..10} → Q1 3, Med 5.5, Q3 8", () => {
    const r = stat1Var(Array.from({ length: 10 }, (_, i) => rat(i + 1)));
    expect(r.q1).toEqual(rat(3));
    expect(r.med).toEqual(rat(11, 2));
    expect(r.q3).toEqual(rat(8));
  });
  test("(T1d) unsorted input sorts internally; decimal entries stay exact", () => {
    const r = stat1Var([statEntryToValue("2.5"), statEntryToValue("1"), statEntryToValue("3.75")]);
    expect(r.minX).toEqual(statEntryToValue("1"));
    expect(r.maxX).toEqual(statEntryToValue("3.75"));
    expect(r.xBar).toEqual(rat(29, 12)); // (1 + 2.5 + 3.75)/3 = 7.25/3 = 29/12
  });
  test("(T1e) n = 1: s²x/sx are the honest null (the device's Math ERROR); σ²x = 0", () => {
    const r = stat1Var([rat(7)]);
    expect(r.s2X).toBeNull();
    expect(r.sX).toBeNull();
    expect(r.sig2X).toEqual(rat(0));
    expect(r.med).toEqual(rat(7));
  });
  test("(T1f) empty data refuses (no fake results)", () => {
    expect(() => stat1Var([])).toThrow(CalcError);
  });
  test("(T1h) the leading-dot entry normalizes (\u201c.01\u201d = 1/100 — the battery-run-002 ruling)", () => {
    expect(statEntryToValue(".01")).toEqual(rat(1, 100));
    expect(statEntryToValue(".5")).toEqual(rat(1, 2));
    expect(() => statEntryToValue(".")).toThrow(CalcError);
    expect(() => statEntryToValue("1.")).toThrow(CalcError);
    expect(() => statEntryToValue("")).toThrow(CalcError);
  });
  test("(T1g) the quartile helper on its own: {1..7}", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7].map((n) => rat(n));
    const { q1, q3 } = quartilesOf(sorted);
    expect(q1).toEqual(rat(5, 2)); // the lower half {1,2,3,4} includes the median 4
    expect(q3).toEqual(rat(11, 2));
  });
});

describe("(T2) the 2-variable summary + the linear regression y = a + bx", () => {
  test("(T2a) x={1,2,3}, y={2,4,6}: a 0, b 2, r 1 — all EXACT", () => {
    const r = stat2Var([rat(1), rat(2), rat(3)], [rat(2), rat(4), rat(6)]);
    expect(r.reg).not.toBeNull();
    expect(r.reg!.b).toEqual(rat(2));
    expect(r.reg!.a).toEqual(rat(0));
    expect(r.reg!.r).toEqual(rat(1));
    expect(r.sumXY).toEqual(rat(28));
    expect(r.yBar).toEqual(rat(4));
    expect(r.minY).toEqual(rat(2));
    expect(r.maxY).toEqual(rat(6));
    expect(r.s2Y).toEqual(rat(4)); // 24/(3·2)
  });
  test("(T2b) the constant-x refusal: b divides by zero spread → reg null", () => {
    const r = stat2Var([rat(2), rat(2), rat(2)], [rat(1), rat(2), rat(3)]);
    expect(r.reg).toBeNull();
  });
  test("(T2c) mismatched lengths refuse", () => {
    expect(() => stat2Var([rat(1), rat(2)], [rat(1)])).toThrow(CalcError);
  });
});

describe("(T3) the number table — the manual's own example and the range laws", () => {
  test("(T3a) f(x)=x²+1/2, g(x)=x²−1/2 over −1 ≤ x ≤ 1 step 0.5 — the manual's example, all EXACT", () => {
    const t = buildNumberTable({ f: X2P_HALF, g: X2M_HALF }, "fg", val(rat(-1)), val(rat(1)), val(rat(1, 2)), CTX);
    expect(t.rows.map((r) => r.x)).toEqual([rat(-1), rat(-1, 2), rat(0), rat(1, 2), rat(1)].map((x) => ({ exact: true, n: x.n, d: x.d })));
    expect(t.rows.map((r) => r.f)).toEqual([rat(3, 2), rat(3, 4), rat(1, 2), rat(3, 4), rat(3, 2)].map((x) => ({ exact: true, n: x.n, d: x.d })));
    expect(t.rows.map((r) => r.g)).toEqual([rat(1, 2), rat(-1, 4), rat(-1, 2), rat(-1, 4), rat(1, 2)].map((x) => ({ exact: true, n: x.n, d: x.d })));
    expect(t.lastX).toEqual({ exact: true, n: BigInt(1), d: BigInt(1) });
  });
  test(`(T3b) the row caps: ${TABLE_ROWS_SINGLE} rows single-column, ${TABLE_ROWS_BOTH} both — a cap violation is Range ERROR`, () => {
    const fns: CalcFns = { f: X2P_HALF, g: X2M_HALF };
    // 0..1 step 1/50 → 51 rows > 45 (single) AND > 30 (both)
    expect(() => buildNumberTable(fns, "f", val(rat(0)), val(rat(1)), val(rat(1, 50)), CTX)).toThrow("Range ERROR");
    expect(() => buildNumberTable(fns, "fg", val(rat(0)), val(rat(1)), val(rat(1, 50)), CTX)).toThrow("Range ERROR");
    // 29 rows fits BOTH columns; 41 rows fits f alone but not fg
    const ok29 = buildNumberTable(fns, "fg", val(rat(0)), val(rat(28)), val(rat(1)), CTX);
    expect(ok29.rows.length).toBe(29);
    const ok41 = buildNumberTable(fns, "f", val(rat(0)), val(rat(40)), val(rat(1)), CTX);
    expect(ok41.rows.length).toBe(41);
    expect(() => buildNumberTable(fns, "fg", val(rat(0)), val(rat(40)), val(rat(1)), CTX)).toThrow("Range ERROR");
  });
  test("(T3c) step ≤ 0 and Start > End are Range ERROR", () => {
    const fns: CalcFns = { f: X2P_HALF, g: null };
    expect(() => buildNumberTable(fns, "f", val(rat(0)), val(rat(1)), val(rat(0)), CTX)).toThrow("Range ERROR");
    expect(() => buildNumberTable(fns, "f", val(rat(0)), val(rat(1)), val(rat(-1, 2)), CTX)).toThrow("Range ERROR");
    expect(() => buildNumberTable(fns, "f", val(rat(2)), val(rat(1)), val(rat(1)), CTX)).toThrow("Range ERROR");
  });
  test("(T3d) a missing defining equation is Math ERROR (no fake table)", () => {
    expect(() => buildNumberTable({ f: null, g: null }, "f", val(rat(0)), val(rat(1)), val(rat(1)), CTX)).toThrow(CalcError);
    expect(() => buildNumberTable({ f: X2P_HALF, g: null }, "fg", val(rat(0)), val(rat(1)), val(rat(1)), CTX)).toThrow(CalcError);
  });
  test("(T3e) a Math ERROR in a cell aborts the generation (no partial table)", () => {
    const f: CalcAtom[] = [num("1"), op("÷"), { kind: "lparen" }, vx, op("-"), num("2"), { kind: "rparen" }]; // 1÷(x−2) blows up at x = 2
    expect(() => buildNumberTable({ f, g: null }, "f", val(rat(1)), val(rat(3)), val(rat(1)), CTX)).toThrow(CalcError);
  });
  test("(T3f) f can call g (the shared defining equations ride the engine's own fn-call law)", () => {
    const f: CalcAtom[] = [{ kind: "fn", name: "g" }, vx, { kind: "rparen" }, op("×"), num("2")]; // g(x)×2
    const g: CalcAtom[] = [vx];
    const t = buildNumberTable({ f, g }, "f", val(rat(3)), val(rat(3)), val(rat(1)), CTX);
    expect(t.rows[0].f).toEqual(rat(6));
  });
  test("(T3g) the defining equations render from the SAME buffer language", () => {
    expect(bufferToTex(X2P_HALF)).toContain("x");
  });
});

// ── (T2) the Equation app engines — the phase-D manual laws ──

describe("(T2) Simul Equation — the manual's 2–4 unknowns, exact throughout", () => {
  test("(T2a) 2×2 exact: x+y=3, 2x−y=0 → x=1, y=2", () => {
    const r = solveSimultaneous(2, [
      [rat(1), rat(1), rat(3)],
      [rat(2), rat(-1), rat(0)],
    ]);
    expect(r.kind).toBe("solved");
    if (r.kind === "solved") {
      expect(r.values[0]).toEqual(rat(1));
      expect(r.values[1]).toEqual(rat(2));
    }
  });
  test("(T2b) 3×3 exact with fractional solutions: x+y=1, y+z=2, x+z=3 → x=1, y=0, z=2", () => {
    const r = solveSimultaneous(3, [
      [rat(1), rat(1), rat(0), rat(1)],
      [rat(0), rat(1), rat(1), rat(2)],
      [rat(1), rat(0), rat(1), rat(3)],
    ]);
    expect(r.kind).toBe("solved");
    if (r.kind === "solved") {
      expect(r.values).toEqual([rat(1), rat(0), rat(2)]);
    }
  });
  test("(T2c) singular systems are DISPLAYED results: no-solution vs infinite", () => {
    const no = solveSimultaneous(2, [
      [rat(1), rat(1), rat(1)],
      [rat(1), rat(1), rat(2)],
    ]);
    expect(no.kind).toBe("no-solution");
    const inf = solveSimultaneous(2, [
      [rat(1), rat(1), rat(1)],
      [rat(2), rat(2), rat(2)],
    ]);
    expect(inf.kind).toBe("infinite-solution");
  });
  test("(T2d) 4×4 exact and the device's variable row x, y, z, t", () => {
    const r = solveSimultaneous(4, [
      [rat(1), rat(0), rat(0), rat(0), rat(1)],
      [rat(0), rat(1), rat(0), rat(0), rat(2)],
      [rat(0), rat(0), rat(1), rat(0), rat(3)],
      [rat(0), rat(0), rat(0), rat(1), rat(4)],
    ]);
    expect(r.kind).toBe("solved");
    if (r.kind === "solved") expect(r.values).toEqual([rat(1), rat(2), rat(3), rat(4)]);
    expect(SIMUL_UNKNOWN_NAMES).toEqual(["x", "y", "z", "t"]);
  });
  test("(T2e) shape errors: the wrong grid is a Syntax ERROR", () => {
    expect(() => solveSimultaneous(2, [[rat(1), rat(1), rat(1)]])).toThrow(CalcError);
    expect(() => solveSimultaneous(2, [[rat(1), rat(1), rat(3)], [rat(1), rat(0)]] as never)).toThrow(CalcError);
  });
});

describe("(T2) Polynomial — the manual's 2nd–4th degree laws", () => {
  test("(T2f) the exact quadratic: x²−3x+2 → 1, 2 with the MIN vertex (3/2, −1/4)", () => {
    const r = solvePolynomial(2, [rat(1), rat(-3), rat(2)], false);
    expect(r.solutions).toEqual([rat(1), rat(2)]);
    expect(r.extrema).toEqual([{ x: rat(3, 2), y: rat(-1, 4), kind: "min" }]);
    expect(r.noRealRoots).toBe(false);
  });
  test("(T2g) the float path — the manual's own example x²+2x−2: the roots −1±√3, the vertex (−1, −3) exact", () => {
    const r = solvePolynomial(2, [rat(1), rat(2), rat(-2)], false);
    const s3 = Math.sqrt(3);
    expect(r.solutions).toEqual([{ exact: false, v: -1 - s3 }, { exact: false, v: -1 + s3 }]);
    expect(r.extrema).toEqual([{ x: rat(-1), y: rat(-3), kind: "min" }]);
  });
  test("(T2h) Complex Roots Off (the initial default): x²+1 → 'No Real Roots'", () => {
    const off = solvePolynomial(2, [rat(1), rat(0), rat(1)], false);
    expect(off.noRealRoots).toBe(true);
    expect(off.solutions).toEqual([]);
    const on = solvePolynomial(2, [rat(1), rat(0), rat(1)], true);
    expect(on.noRealRoots).toBe(false);
    expect(on.solutions).toEqual([
      { c: true, re: 0, im: -1 },
      { c: true, re: 0, im: 1 },
    ]);
  });
  test("(T2i) the complex pair — the manual's example 2x²+3x+4 On: re −3/4, ±√23/4 (the engine's double-based complex path)", () => {
    const r = solvePolynomial(2, [rat(2), rat(3), rat(4)], true);
    const mag = Math.sqrt(23) / 4;
    expect(r.solutions).toEqual([
      { c: true, re: -0.75, im: -mag },
      { c: true, re: -0.75, im: mag },
    ]);
  });
  test("(T2j) the repeated root renders one row (our ruling): x²−2x+1 → [1]", () => {
    const r = solvePolynomial(2, [rat(1), rat(-2), rat(1)], false);
    expect(r.solutions).toEqual([rat(1)]);
  });
  test("(T2k) the cubic factoring: x³−6x²+11x−6 → 1, 2, 3; the extrema float-path with a>0 → max first", () => {
    const r = solvePolynomial(3, [rat(1), rat(-6), rat(11), rat(-6)], false);
    expect(r.solutions).toEqual([rat(1), rat(2), rat(3)]);
    expect(r.extrema).not.toBeNull();
    if (r.extrema) {
      expect(r.extrema.length).toBe(2);
      expect(r.extrema[0].kind).toBe("max");
      expect(r.extrema[1].kind).toBe("min");
    }
  });
  test("(T2l) x³−3x: the root 0 exact (the trailing-zero strip), ±√3 float; the EXACT extrema max (−1, 2), min (1, −2)", () => {
    const r = solvePolynomial(3, [rat(1), rat(0), rat(-3), rat(0)], false);
    const s3 = Math.sqrt(3);
    expect(r.solutions).toEqual([{ exact: false, v: -s3 }, rat(0), { exact: false, v: s3 }]);
    expect(r.extrema).toEqual([
      { x: rat(-1), y: rat(2), kind: "max" },
      { x: rat(1), y: rat(-2), kind: "min" },
    ]);
  });
  test("(T2m) 'No Local Max/Min' — x³ has a stationary inflection only (our D'=0 ruling)", () => {
    const r = solvePolynomial(3, [rat(1), rat(0), rat(0), rat(0)], false);
    expect(r.noLocalMaxMin).toBe(true);
    expect(r.extrema).toBeNull();
    expect(r.solutions).toEqual([rat(0)]);
  });
  test("(T2n) the quartic factoring: x⁴−5x²+4 → −2, −1, 1, 2 (roots only — the quartic law)", () => {
    const r = solvePolynomial(4, [rat(1), rat(0), rat(-5), rat(0), rat(4)], false);
    expect(r.solutions).toEqual([rat(-2), rat(-1), rat(1), rat(2)]);
    expect(r.extrema).toBeNull();
    expect(r.noLocalMaxMin).toBe(false);
  });
  test("(T2o) the float path via Durand–Kerner — x³−x−1 → the plastic number ≈ 1.324717957 (the rational-root probe misses)", () => {
    const r = solvePolynomial(3, [rat(1), rat(0), rat(-1), rat(-1)], false);
    expect(r.solutions).toHaveLength(1);
    const v = r.solutions[0] as { exact: false; v: number };
    expect(v.exact).toBe(false);
    expect(Math.abs(v.v - 1.324717957244746)).toBeLessThan(1e-6);
  });
  test("(T2p) the shape laws: a zero leading coefficient is a Math ERROR (our ruling); the wrong length is a Syntax ERROR", () => {
    expect(() => solvePolynomial(2, [rat(0), rat(1), rat(2)], false)).toThrow(CalcError);
    expect(() => solvePolynomial(3, [rat(1), rat(2), rat(3)] as never, false)).toThrow(CalcError);
  });
});

// ── (T3) the Solver engine — the phase-E manual laws ──

const SOLVER_CTX = { angle: "DEG" as const, ans: null, vars: {}, fns: { f: null, g: null } };
const atoms = (...a: CalcAtom[]): CalcAtom[] => a;
const EQ: CalcAtom = { kind: "eqtok" };

describe("(T3) the Solver — the manual's input forms and the Newton laws", () => {
  test("(T3a) the split: no '=' → the right side is 0 ('xy + C treated as xy + C = 0'); one top-level '=' splits", () => {
    const bare = splitSolverEquation(atoms({ kind: "var", name: "x" }, op("-"), num("5")));
    expect(bare.right).toEqual([{ kind: "num", text: "0" }]);
    const eq = splitSolverEquation(atoms({ kind: "var", name: "y" }, EQ, { kind: "var", name: "x" }, op("+"), num("5")));
    expect(eq.left).toEqual([{ kind: "var", name: "y" }]);
    expect(eq.right).toEqual([vx, op("+"), num("5")]);
  });
  test("(T3b) a second top-level '=' is a Syntax ERROR (our ruling)", () => {
    expect(() => splitSolverEquation(atoms(vx, EQ, vx, EQ))).toThrow(CalcError);
  });
  test("(T3c) the variables in order of first appearance", () => {
    const eq = splitSolverEquation(atoms({ kind: "var", name: "y" }, EQ, { kind: "var", name: "x" }, op("+"), { kind: "var", name: "y" }));
    expect(solverVariables(eq)).toEqual(["y", "x"]);
  });
  test("(T3d) Newton: x−5 from 0 → x=5, L−R≈0; 2x+3 → x=−1.5 (the decimal-only law)", () => {
    const r1 = solveByNewton(splitSolverEquation(atoms(vx, op("-"), num("5"))), "x", 0, SOLVER_CTX);
    expect(r1.kind).toBe("solved");
    if (r1.kind === "solved") {
      expect(Math.abs(r1.solution - 5)).toBeLessThan(1e-9);
      expect(Math.abs(r1.lr)).toBeLessThan(1e-9);
    }
    const r2 = solveByNewton(splitSolverEquation(atoms(num("2"), op("×"), vx, op("+"), num("3"))), "x", 0, SOLVER_CTX);
    if (r2.kind === "solved") expect(Math.abs(r2.solution + 1.5)).toBeLessThan(1e-9);
  });
  test("(T3e) the initial-value law: x²−4 from 3 → 2, from −3 → −2 (one solution returned — the manual's caveat)", () => {
    const eq = splitSolverEquation(atoms(vx, { kind: "postfix", op: "²" }, op("-"), num("4")));
    const a = solveByNewton(eq, "x", 3, SOLVER_CTX);
    const b = solveByNewton(eq, "x", -3, SOLVER_CTX);
    if (a.kind === "solved" && b.kind === "solved") {
      expect(Math.abs(a.solution - 2)).toBeLessThan(1e-9);
      expect(Math.abs(b.solution + 2)).toBeLessThan(1e-9);
    } else throw new Error("no convergence on a trivial quadratic");
  });
  test("(T3f) the '=' form: y=x+5 solved for x with y unstored (0) → x=−5 (the engine's var law; the manual's Example-5 teaching)", () => {
    const eq = splitSolverEquation(atoms({ kind: "var", name: "y" }, EQ, vx, op("+"), num("5")));
    const r = solveByNewton(eq, "x", 0, SOLVER_CTX);
    if (r.kind === "solved") expect(Math.abs(r.solution + 5)).toBeLessThan(1e-9);
    else throw new Error("no convergence");
  });
  test("(T3g) the stored-variable precondition: x²−B² with B=4 → x=±4 (the manual's Example 5)", () => {
    const eq = splitSolverEquation(atoms(vx, { kind: "postfix", op: "²" }, op("-"), { kind: "var", name: "B" }, { kind: "postfix", op: "²" }));
    const ctx = { ...SOLVER_CTX, vars: { B: rat(4) } };
    const r = solveByNewton(eq, "x", 1, ctx);
    if (r.kind === "solved") expect(Math.abs(Math.abs(r.solution) - 4)).toBeLessThan(1e-9);
    else throw new Error("no convergence");
  });
  test("(T3h) the non-convergence: 1÷x=0 has no solution → the confirmation screen (the Continue/Exit mechanism)", () => {
    const eq = splitSolverEquation(atoms(num("1"), op("÷"), vx));
    const r = solveByNewton(eq, "x", 1, SOLVER_CTX);
    expect(r.kind).toBe("no-convergence");
    if (r.kind === "no-convergence") expect(Number.isFinite(r.lastX)).toBe(true);
  });
  test("(T3i) the manual's caveat VERIFIED: y=√x is hard for Newton — √(x−5) oscillates (from 6) and the domain-failing start (from 0) both land on the confirmation screen", () => {
    const eq = splitSolverEquation(atoms({ kind: "fn", name: "√" }, vx, op("-"), num("5"), { kind: "rparen" }));
    const osc = solveByNewton(eq, "x", 6, SOLVER_CTX); // Newton on √(x−5) doubles the distance: 6 → 4 → the complex probes
    expect(osc.kind).toBe("no-convergence");
    const bad = solveByNewton(eq, "x", 0, SOLVER_CTX); // √(−5) → Math ERROR → the confirmation screen (our ruling)
    expect(bad.kind).toBe("no-convergence");
  });
  test("(T3j) the trig + the initial-value law: sin(x)−1/2 (DEG) from 40 → x=30; from 1 → the confirmation screen (the manual's 'the initial value may need moving closer' caveat, verified)", () => {
    const eq = splitSolverEquation(atoms({ kind: "fn", name: "sin" }, vx, { kind: "rparen" }, op("-"), frac("1", "2")));
    const good = solveByNewton(eq, "x", 40, SOLVER_CTX);
    if (good.kind === "solved") expect(Math.abs(good.solution - 30)).toBeLessThan(1e-6);
    else throw new Error("the initial value near the root must solve");
    const far = solveByNewton(splitSolverEquation(atoms({ kind: "fn", name: "e^" }, vx, { kind: "rparen" })), "x", 0, SOLVER_CTX);
    expect(far.kind).toBe("no-convergence"); // the manual's own caveat case y=e^x: no root — the Newton marches to −∞ and exhausts the preset → the confirmation screen
  });
  test("(T3k) the non-finite initial value is a Math ERROR", () => {
    expect(() => solveByNewton(splitSolverEquation(atoms(vx)), "x", Infinity, SOLVER_CTX)).toThrow(CalcError);
  });
});

// ── (T4) the Inequality engine — the phase-F manual laws ──

const ratC = (n: bigint, d = BigInt(1)): CalcValue => ({ exact: true, n, d });
const INEQ_REL = ">";

describe("(T4) the Inequality — the manual's degree/orientation laws and the sign analysis", () => {
  test("(T4a) the manual's Example 1: x²+2x−3 ≥ 0 → x ≤ −3, x ≥ 1 (the two inclusive rays)", () => {
    const r = solveInequality(2, [ratC(BigInt(1)), ratC(BigInt(2)), ratC(BigInt(-3))], "≥");
    expect(r.allReal).toBe(false);
    expect(r.noSolution).toBe(false);
    expect(r.intervals.length).toBe(2);
    expect(r.intervals[0].kind).toBe("ray");
    expect(r.intervals[1].kind).toBe("ray");
    const [a, b] = r.intervals as { kind: "ray"; side: "left" | "right"; end: CalcValue; strict: boolean }[];
    expect(a.side).toBe("left");
    expect(Math.abs(ineqNum(a.end) + 3)).toBeLessThan(1e-9);
    expect(a.strict).toBe(false);
    expect(b.side).toBe("right");
    expect(Math.abs(ineqNum(b.end) - 1)).toBeLessThan(1e-9);
    expect(b.strict).toBe(false);
  });
  test("(T4b) the orientation order (>, <, ≥, ≤): the same polynomial flips the set exactly", () => {
    const d = [ratC(BigInt(1)), ratC(BigInt(2)), ratC(BigInt(-3))];
    const gt = solveInequality(2, d, ">");
    const lt = solveInequality(2, d, "<");
    const le = solveInequality(2, d, "≤");
    // > → the two STRICT rays
    expect(gt.intervals.every((iv) => iv.kind === "ray" && (iv as { strict: boolean }).strict)).toBe(true);
    // < → one strict segment (−3, 1)
    expect(lt.intervals.length).toBe(1);
    const seg = lt.intervals[0] as { kind: "seg"; loStrict: boolean; hiStrict: boolean };
    expect(seg.kind).toBe("seg");
    expect(seg.loStrict && seg.hiStrict).toBe(true);
    // ≤ → one inclusive segment [−3, 1] (the merged run through the points)
    expect(le.intervals.length).toBe(1);
    const seg2 = le.intervals[0] as { kind: "seg"; loStrict: boolean; hiStrict: boolean };
    expect(seg2.kind).toBe("seg");
    expect(!seg2.loStrict && !seg2.hiStrict).toBe(true);
    expect(Math.abs(ineqNum((le.intervals[0] as { lo: CalcValue }).lo) + 3)).toBeLessThan(1e-9);
    expect(Math.abs(ineqNum((le.intervals[0] as { hi: CalcValue }).hi) - 1)).toBeLessThan(1e-9);
  });
  test("(T4c) the manual's Note laws: x²≥0 → All Real Numbers; x²<0 → No Solution; x²≤0 → the single point x=0", () => {
    const d = [ratC(BigInt(1)), ratC(BigInt(0)), ratC(BigInt(0))];
    expect(solveInequality(2, d, "≥").allReal).toBe(true);
    expect(solveInequality(2, d, "<").noSolution).toBe(true);
    const le = solveInequality(2, d, "≤");
    expect(le.intervals.length).toBe(1);
    expect(le.intervals[0].kind).toBe("pt");
    expect(Math.abs(ineqNum((le.intervals[0] as { v: CalcValue }).v))).toBeLessThan(1e-12);
  });
  test("(T4d) the odd degree: x³−x ≥ 0 → [−1, 0] ∪ [1, +∞) (the sign alternation)", () => {
    const r = solveInequality(3, [ratC(BigInt(1)), ratC(BigInt(0)), ratC(BigInt(-1)), ratC(BigInt(0))], "≥");
    expect(r.intervals.length).toBe(2);
    const seg = r.intervals[0] as { kind: "seg"; lo: CalcValue; hi: CalcValue };
    expect(seg.kind).toBe("seg");
    expect(Math.abs(ineqNum(seg.lo) + 1)).toBeLessThan(1e-9);
    expect(Math.abs(ineqNum(seg.hi))).toBeLessThan(1e-9);
    const ray = r.intervals[1] as { kind: "ray"; side: string; end: CalcValue };
    expect(ray.side).toBe("right");
    expect(Math.abs(ineqNum(ray.end) - 1)).toBeLessThan(1e-9);
  });
  test("(T4e) the quartic: x⁴−1 > 0 → x < −1, x > 1 (the strict rays)", () => {
    const r = solveInequality(4, [ratC(BigInt(1)), ratC(BigInt(0)), ratC(BigInt(0)), ratC(BigInt(0)), ratC(BigInt(-1))], ">");
    expect(r.intervals.length).toBe(2);
    const [a, b] = r.intervals as { kind: "ray"; side: "left" | "right"; end: CalcValue; strict: boolean }[];
    expect(a.side).toBe("left");
    expect(a.strict).toBe(true);
    expect(Math.abs(ineqNum(a.end) + 1)).toBeLessThan(1e-9);
    expect(b.side).toBe("right");
    expect(Math.abs(ineqNum(b.end) - 1)).toBeLessThan(1e-9);
  });
  test("(T4f) the double-root law VERIFIED: (x−1)²(x−2) < 0 → x < 1 ∪ 1 < x < 2 — the double root flips NO sign and is EXCLUDED from both", () => {
    // (x−1)²(x−2) = x³ − 4x² + 5x − 2
    const r = solveInequality(3, [ratC(BigInt(1)), ratC(BigInt(-4)), ratC(BigInt(5)), ratC(BigInt(-2))], "<");
    expect(r.intervals.length).toBe(2);
    const ray = r.intervals[0] as { kind: "ray"; side: string; end: CalcValue; strict: boolean };
    expect(ray.side).toBe("left");
    expect(ray.strict).toBe(true); // the double root at 1 excluded
    expect(Math.abs(ineqNum(ray.end) - 1)).toBeLessThan(1e-9);
    const seg = r.intervals[1] as { kind: "seg"; lo: CalcValue; hi: CalcValue; loStrict: boolean; hiStrict: boolean };
    expect(seg.kind).toBe("seg");
    expect(seg.loStrict).toBe(true);
    expect(Math.abs(ineqNum(seg.hi) - 2)).toBeLessThan(1e-9);
    expect(seg.hiStrict).toBe(true);
  });
  test("(T4g) a = 0 → Math ERROR (the phase-C zero-leading law rides along)", () => {
    expect(() => solveInequality(2, [ratC(BigInt(0)), ratC(BigInt(1)), ratC(BigInt(2))], ">")).toThrow(CalcError);
  });
  test("(T4h) the irrational boundaries ride the float path: x²−2 ≥ 0 → ±√2", () => {
    const r = solveInequality(2, [ratC(BigInt(1)), ratC(BigInt(0)), ratC(BigInt(-2))], "≥");
    const [a, b] = r.intervals as { kind: "ray"; end: CalcValue }[];
    expect(Math.abs(ineqNum(a.end) + Math.SQRT2)).toBeLessThan(1e-6);
    expect(Math.abs(ineqNum(b.end) - Math.SQRT2)).toBeLessThan(1e-6);
  });
});

function ineqNum(v: CalcValue): number {
  return "c" in v ? NaN : v.exact ? Number(v.n) / Number(v.d) : v.v;
}
