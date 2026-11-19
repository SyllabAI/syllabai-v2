/**
 * calc-apps.test.ts — T-MG-CALC-2 phase C: the Statistics and Table
 * app engines (the spec pin 5). The device laws verified from the
 * official Casio fx-570CW/991CW online manual are pinned here:
 * the editor/value sets, the quartile convention (the documented
 * ruling — see calc-apps.ts), the Table row caps (45/30), the range
 * laws, the exact substitution and the x-variable side effect.
 */

import { describe, expect, test } from "bun:test";

import { CalcError, type CalcAtom, type CalcFns } from "./calc-engine";
import { buildNumberTable, quartilesOf, stat1Var, stat2Var, statEntryToValue, TABLE_ROWS_BOTH, TABLE_ROWS_SINGLE } from "./calc-apps";
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
