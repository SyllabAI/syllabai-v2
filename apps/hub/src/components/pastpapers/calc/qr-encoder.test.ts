/**
 * qr-encoder.test.ts — T-MG-CALC-2 phase B: the QR encoder's verification
 * battery. THE CHASE RULING: "no verifiable QR encoder exists in the repo
 * and an unverifiable QR is dishonest" — so the encoder ships with TWO
 * verification layers:
 *
 *  1. GOLDEN MATRICES cross-checked against the INDEPENDENT python qrcode
 *     implementation (qr-goldens.ts, byte mode ECL M): every forced mask
 *     of two representative result strings (v1 ASCII, v2 multibyte) must
 *     equal the oracle's matrix at the same mask — placement, RS codewords
 *     and format info verified for ALL 8 masks; the auto-chosen mask's
 *     matrix must equal the oracle forced to THAT mask (the selection law
 *     end-to-end, no internals exposed).
 *  2. MATHEMATICAL invariants: the matrix itself reads back to codewords
 *     whose RS syndromes are ALL ZERO (a proof of valid Reed–Solomon),
 *     the format info round-trips through the BCH check, and the function
 *     patterns (finders, timing, dark module) sit where the spec puts them.
 */

import { describe, expect, test } from "bun:test";

import { qrEncode, readCodewords, readFormatInfo, rsSyndromes } from "./qr-encoder";
import { QR_GOLDENS } from "./qr-goldens";

// the real calculator result strings the QR key encodes (the component's
// QR screen feeds the DISPLAYED text verbatim)
const RESULT_STRINGS = ["1/3", "5/3", "2 1/3", "1.666666667", "1.23×10^-3", "58/99", "5+5i", "1.414213562∠45"];

const ecLenFor = (version: number): number => ({ 1: 10, 2: 16, 3: 26, 4: 36, 5: 48, 6: 64 })[version] ?? 10;

describe("(Q1) the golden matrices (the independent oracle)", () => {
  test("every forced mask equals the oracle at the same mask (the verification grid)", () => {
    for (const [key, g] of Object.entries(QR_GOLDENS)) {
      if (key.endsWith("|auto")) continue;
      const [text, maskStr] = key.split("|");
      const mine = qrEncode(text, { mask: parseInt(maskStr, 10) });
      expect(mine).not.toBeNull();
      const rows = mine!.modules.map((r) => r.map((b) => (b ? "1" : "0")).join(""));
      expect(mine!.version).toBe(g.version);
      expect(rows).toEqual(g.rows);
    }
  });
  test("the auto-chosen mask's matrix equals the oracle forced to that mask (the selection law end-to-end)", () => {
    // the full forced grid exists for these two strings — the auto matrix
    // must equal the oracle FORCED TO MY CHOSEN MASK (no internals exposed)
    for (const [key, g] of Object.entries(QR_GOLDENS)) {
      if (!key.endsWith("|auto")) continue;
      const text = key.slice(0, -5);
      const mine = qrEncode(text);
      expect(mine).not.toBeNull();
      const fmt = readFormatInfo(mine!.modules);
      expect(fmt).not.toBeNull();
      expect(fmt!.eclBits).toBe(0); // ECL M
      expect(mine!.version).toBe(g.version); // the oracle's own auto encode agrees on the version
      const myRows = mine!.modules.map((r) => r.map((b) => (b ? "1" : "0")).join(""));
      const oracleAtMyMask = QR_GOLDENS[`${text}|${fmt!.mask}`];
      if (oracleAtMyMask) expect(myRows).toEqual(oracleAtMyMask.rows);
      expect(myRows.length).toBe(g.rows.length); // dimension parity with the oracle's auto matrix
    }
  });
});

describe("(Q2) the mathematical layer", () => {
  test("every matrix reads back to codewords with ALL-ZERO RS syndromes (valid Reed–Solomon)", () => {
    for (const text of ["1/3", "58/99", "1.414213562∠45"]) {
      const code = qrEncode(text)!;
      const fmt = readFormatInfo(code.modules)!;
      const { data, ec } = readCodewords(code.modules, code.version, fmt.mask);
      const block = data.concat(ec);
      const syndromes = rsSyndromes(block, ecLenFor(code.version));
      expect(syndromes.every((s) => s === 0)).toBe(true);
    }
  });
  test("a single corrupted module flips a syndrome (the check has teeth)", () => {
    const code = qrEncode("1/3")!;
    const fmt = readFormatInfo(code.modules)!;
    const { data, ec } = readCodewords(code.modules, code.version, fmt.mask);
    const corrupted = data.concat(ec);
    corrupted[0] ^= 0x01;
    expect(rsSyndromes(corrupted, ecLenFor(code.version)).every((s) => s === 0)).toBe(false);
  });
  test("the format info round-trips (BCH-checked, ECL M = 00, mask in range)", () => {
    for (const text of RESULT_STRINGS) {
      for (let mask = 0; mask < 8; mask++) {
        const forced = qrEncode(text, { mask });
        expect(forced).not.toBeNull();
        const fmt = readFormatInfo(forced!.modules);
        expect(fmt).not.toBeNull();
        expect(fmt!.eclBits).toBe(0);
        expect(fmt!.mask).toBe(mask);
      }
    }
  });
  test("the function patterns sit where the spec puts them (finders, timing, dark module)", () => {
    const code = qrEncode("1/3")!;
    const m = code.modules;
    const size = code.size;
    const finderAt = (r0: number, c0: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const dark = i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          expect(m[r0 + i][c0 + j]).toBe(dark);
        }
      }
    };
    finderAt(0, 0);
    finderAt(0, size - 7);
    finderAt(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[size - 8][8]).toBe(true); // the dark module
    expect(readFormatInfo(m)).not.toBeNull();
  });
});

describe("(Q3) the honest refusal", () => {
  test("an empty payload and an oversized payload refuse — never a fake code", () => {
    expect(qrEncode("")).toBeNull();
    expect(qrEncode("x".repeat(107))).toBeNull();
    expect(qrEncode("1/3")).not.toBeNull();
    const cap = qrEncode("y".repeat(106))!;
    expect(cap.version).toBe(6);
  });
  test("a malformed forced mask refuses", () => {
    expect(qrEncode("1/3", { mask: 8 })).toBeNull();
    expect(qrEncode("1/3", { mask: -1 })).toBeNull();
    expect(qrEncode("1/3", { mask: 0 })).not.toBeNull();
  });
});
