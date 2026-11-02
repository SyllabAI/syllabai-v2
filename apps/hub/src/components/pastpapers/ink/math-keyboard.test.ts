/**
 * math-keyboard.test.ts — T-MG-INK-9. The census pins for the maths
 * keyboard of record: the keyboard (./math-keyboard) is a rebuild of
 * MG's equation keyboard EXTRACTED from their production math-field
 * (MathLive virtual keyboard, mathsgenie.co.uk, 2026-11-02 — 136
 * keycaps / 4 layers read from the live DOM). These tests pin the
 * census so a future edit cannot silently drift from MG: layer/tab
 * names, per-layer key counts, spot-exact rows, every key's insert
 * being brace-balanced LaTeX, and the insert/caret/backspace maths.
 */
import { describe, expect, test } from "bun:test";

import {
  MG_KB_LAYERS,
  backspaceValue,
  insertIntoValue,
  keyInsertion,
  type MgKeyboardLayer,
} from "./math-keyboard";

/** MG's extracted census (2026-11-02): layer id → key count. */
const MG_CENSUS: Array<[MgKeyboardLayer["id"], string, string, number]> = [
  // [id, tab, name, keyCount]
  ["numeric", "123", "Numeric", 30],
  ["symbols", "∞≠∈", "Symbols", 33],
  ["letters", "abc", "Roman Letters", 42],
  ["greek", "αβγ", "Greek Letters", 31],
];

describe("T-MG-INK-9 — the MG keyboard census pins", () => {
  test("four layers, MG's tabs and names, MG's key counts", () => {
    expect(MG_KB_LAYERS.length).toBe(4);
    MG_KB_LAYERS.forEach((layer, i) => {
      const [id, tab, name, count] = MG_CENSUS[i]!;
      expect(layer.id).toBe(id);
      expect(layer.tab).toBe(tab);
      expect(layer.name).toBe(name);
      const keys = layer.rows.flat();
      expect(keys.length).toBe(count);
    });
  });

  test("every key carries a label and an insert; inserts are brace-balanced LaTeX", () => {
    for (const layer of MG_KB_LAYERS) {
      for (const key of layer.rows.flat()) {
        expect(key.label.length, `${layer.id}:${key.label}`).toBeGreaterThan(0);
        expect(typeof key.insert, `${layer.id}:${key.label}`).toBe("string");
        // braces balance ({} only — parens/brackets are literal content)
        let depth = 0;
        for (const ch of key.insert) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
          expect(depth).toBeGreaterThanOrEqual(0);
        }
        expect(depth, `${layer.id}:${key.label} → ${key.insert}`).toBe(0);
      }
    }
  });

  test("spot-exact rows (the extraction, verbatim)", () => {
    const numeric = MG_KB_LAYERS[0]!;
    expect(numeric.rows[0]!.map((k) => k.label)).toEqual([
      "x", "n", "7", "8", "9", "÷", "𝑒", "𝑖", "π",
    ]);
    expect(numeric.rows[0]!.find((k) => k.label === "÷")!.mg).toBe("\\frac{#@}{#?}");
    expect(numeric.rows[1]!.map((k) => k.label)).toEqual([
      "<", ">", "4", "5", "6", "×", "x²", "x^□", "√",
    ]);
    const symbols = MG_KB_LAYERS[1]!;
    expect(symbols.rows[0]!.map((k) => k.label)).toEqual([
      "sin", "ln", "abs□", "→", "∃", "∈", "∪", "□⃗", "lim", "𝑒",
    ]);
    const greek = MG_KB_LAYERS[3]!;
    expect(greek.rows[0]!.map((k) => k.insert)).toEqual([
      "\\varphi", "\\varsigma", "\\epsilon", "\\rho", "\\tau",
      "\\upsilon", "\\theta", "\\iota", "\\omicron", "\\pi",
    ]);
    const letters = MG_KB_LAYERS[2]!;
    expect(letters.rows[1]!.map((k) => k.label)).toEqual([...("qwertyuiop")]);
    expect(letters.rows[4]!.map((k) => k.label)).toEqual(["−", "+", "=", "?", ",", "."]);
  });

  test("MG's shift pairs ride the dual-label keys", () => {
    const numeric = MG_KB_LAYERS[0]!;
    const lt = numeric.rows[1]!.find((k) => k.label === "<")!;
    expect(lt.shift).toEqual({ label: "≤", insert: "\\le" });
    const eq = numeric.rows[3]!.find((k) => k.label === "=")!;
    expect(eq.shift!.insert).toBe("\\neq");
    const open = numeric.rows[2]!.find((k) => k.label === "(")!;
    expect(open.shift!.insert).toBe("[");
    const q = MG_KB_LAYERS[2]!.rows[1]!.find((k) => k.label === "q")!;
    expect(q.shift!.insert).toBe("Q");
    // hide-shift keys carry NO shift form (MG's class of the same name)
    const seven = numeric.rows[0]!.find((k) => k.label === "7")!;
    expect(seven.shift).toBeUndefined();
  });
});

describe("T-MG-INK-9 — the insert/caret maths", () => {
  test("the fraction lands the caret in the numerator", () => {
    const div = MG_KB_LAYERS[0]!.rows[0]!.find((k) => k.label === "÷")!;
    const ins = keyInsertion(div, false);
    expect(ins.text).toBe("\\frac{}{}");
    expect(ins.caret).toBe(6);
    const res = insertIntoValue("", 0, 0, ins);
    expect(res).toEqual({ value: "\\frac{}{}", caret: 6 });
  });

  test("sqrt / x² / x^□ / integral carets", () => {
    const sqrt = MG_KB_LAYERS[0]!.rows[1]!.find((k) => k.label === "√")!;
    expect(keyInsertion(sqrt, false)).toEqual({ text: "\\sqrt{}", caret: 6 });
    const sq = MG_KB_LAYERS[0]!.rows[1]!.find((k) => k.label === "x²")!;
    expect(keyInsertion(sq, false)).toEqual({ text: "^{2}", caret: null });
    const pow = MG_KB_LAYERS[0]!.rows[1]!.find((k) => k.label === "x^□")!;
    expect(keyInsertion(pow, false)).toEqual({ text: "^{\\square}", caret: 2 });
    const int = MG_KB_LAYERS[0]!.rows[2]!.find((k) => k.label === "∫₀^∞dx")!;
    const ins = keyInsertion(int, false);
    expect(ins.text).toBe("\\int_{0}^{\\infty}\\!\\,\\mathrm{d}x");
    expect(ins.caret).toBe("\\int_{0}^{\\infty}\\!".length);
  });

  test("shift selects the shifted variant and clears is the Keyboard's concern", () => {
    const lt = MG_KB_LAYERS[0]!.rows[1]!.find((k) => k.label === "<")!;
    expect(keyInsertion(lt, false).text).toBe("<");
    expect(keyInsertion(lt, true).text).toBe("\\le");
  });

  test("insertIntoValue replaces the selection (MG's #@ slot semantics)", () => {
    // a selected operand is REPLACED, like MG's #@ template slot
    const res = insertIntoValue("x^{2}", 0, 5, { text: "y", caret: null });
    expect(res).toEqual({ value: "y", caret: 1 });
    // insert mid-string keeps the tail
    const mid = insertIntoValue("ab", 1, 1, { text: "X", caret: null });
    expect(mid).toEqual({ value: "aXb", caret: 2 });
    // out-of-range selections clamp, never throw
    expect(insertIntoValue("ab", -5, 99, { text: "Z", caret: null }).value).toBe("Z");
  });

  test("backspaceValue: selection kill, char kill, surrogate-pair safe", () => {
    expect(backspaceValue("abc", 1, 3)).toEqual({ value: "a", caret: 1 });
    expect(backspaceValue("abc", 3, 3)).toEqual({ value: "ab", caret: 2 });
    expect(backspaceValue("abπ", 3, 3)).toEqual({ value: "ab", caret: 2 });
    expect(backspaceValue("ab𝑒", 4, 4)).toEqual({ value: "ab", caret: 2 });
    expect(backspaceValue("", 0, 0)).toEqual({ value: "", caret: 0 });
  });
});
