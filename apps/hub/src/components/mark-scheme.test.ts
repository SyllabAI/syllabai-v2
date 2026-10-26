import { describe, expect, test } from "bun:test";
import { parseMarkScheme, hasMarkCodes } from "@/components/mark-scheme";

/**
 * SME-style mark-scheme rendering guards (T-OEQ-MATHSB QA wave, 2026-10-27).
 * The renderer must chip out mark codes and humanise abbreviations WITHOUT
 * eating maths content — regression trap: "M1" inside an expression must
 * survive when it is not a trailing/bare code.
 */
describe("parseMarkScheme", () => {
  test("trailing codes become chips, text preserved", () => {
    const segs = parseMarkScheme("180 + 54 M1\n234° A1");
    expect(segs.length).toBe(4);
    expect(segs[0]).toEqual({ kind: "md", text: "180 + 54" });
    expect(segs[1]).toEqual({ kind: "codes", codes: ["M1"] });
    expect(segs[2]).toEqual({ kind: "md", text: "234°" });
    expect(segs[3]).toEqual({ kind: "codes", codes: ["A1"] });
  });

  test("bare code lines collapse to chips", () => {
    const segs = parseMarkScheme("B1\n3, 8, 13");
    expect(segs[0]).toEqual({ kind: "codes", codes: ["B1"] });
    expect(segs[1].kind).toBe("md");
  });

  test("maths containing code-like tokens is NOT chipped mid-expression", () => {
    // "A1" only at line END is a code; inside an equation it must stay
    const segs = parseMarkScheme("x = 2A1 B2 = 5");
    expect(segs.length).toBe(1);
    expect(segs[0].kind).toBe("md");
  });

  test("multi-code tails keep order", () => {
    const segs = parseMarkScheme("correct method M1 A1");
    expect(segs[1]).toEqual({ kind: "codes", codes: ["M1", "A1"] });
  });
});

describe("hasMarkCodes", () => {
  test("detects official scheme vocabulary", () => {
    expect(hasMarkCodes("M1 for p × 10 or 1.68 × 10\nA1 awrt 110")).toBe(true);
  });
  test("plain model answers are not mistaken for schemes", () => {
    expect(hasMarkCodes("LCM = 2³ × 3² × 5² × 7 = 12 600")).toBe(false);
  });
});
