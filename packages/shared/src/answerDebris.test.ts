/**
 * run-010 pins for the citation-debris strip (the chat answer-side render
 * hygiene law — see answerDebris.ts for the evidence and the layering).
 *
 * The captured wire shapes (T-MIG-130 run-010, math-heavy grounded ask) are
 * pinned byte-exact; the negative pins freeze the precision boundary (the
 * API's digit-only marker law and the hub's [n] chips must never be caught).
 */
import { describe, expect, test } from "bun:test";
import { stripCitationDebris } from "./answerDebris";

describe("stripCitationDebris — the measured wire shapes", () => {
  test("strips the groq/gpt-oss source markers from the run-010 capture", () => {
    const raw =
      "as carbon-dioxide gas is released 【6†L1-L4】.\n* **Clear solution** — the formation of a colourless sodium ethanoate solution【4†L1-L3】.";
    expect(stripCitationDebris(raw)).toBe(
      "as carbon-dioxide gas is released.\n* **Clear solution** — the formation of a colourless sodium ethanoate solution.",
    );
  });

  test("strips every debris span in the captured answer shape", () => {
    const raw = "pattern 【4†L1-L3】【6†L1-L4】 described";
    expect(stripCitationDebris(raw)).toBe("pattern described");
  });

  test("longer line-range shapes strip too", () => {
    expect(stripCitationDebris("evidence 【12†L44-L57】 here")).toBe("evidence here");
  });

  test("mid-sentence joint stays clean (leading whitespace collapses, no double space)", () => {
    expect(stripCitationDebris("the acid reacts【6†L1-L4】, giving a salt")).toBe(
      "the acid reacts, giving a salt",
    );
  });
});

describe("stripCitationDebris — precision boundary", () => {
  test("digit-only 【n】 markers are the API's territory — kept", () => {
    expect(stripCitationDebris("collision theory 【2】 explains")).toBe(
      "collision theory 【2】 explains",
    );
  });

  test("square-bracket [n] markers are the hub's chips — kept", () => {
    expect(stripCitationDebris("collision theory [2] explains")).toBe(
      "collision theory [2] explains",
    );
  });

  test("fullwidth brackets without the digit+dagger shape are kept", () => {
    expect(stripCitationDebris("【see the note】 stays")).toBe("【see the note】 stays");
    expect(stripCitationDebris("【L1-L3】 stays")).toBe("【L1-L3】 stays");
  });

  test("no dagger means no match even with digits", () => {
    expect(stripCitationDebris("【4 L1-L3】 stays")).toBe("【4 L1-L3】 stays");
  });

  test("math content passes through untouched", () => {
    const tex = "$$\nce{2CH3COOH(aq) + Na2CO3(s) -> 2CH3COONa(aq)}\n$$";
    expect(stripCitationDebris(tex)).toBe(tex);
  });

  test("empty and debris-free strings are identity", () => {
    expect(stripCitationDebris("")).toBe("");
    expect(stripCitationDebris("plain answer text")).toBe("plain answer text");
  });
});
