/**
 * T-TUTOR-AIM-P2 (DC10 §7.3): the ask-side command-word classifier, pinned.
 *
 * The v18 law teaches the six answer shapes; this module pins WHICH shape
 * governs a given ask. PRECISION-FIRST: only an UNAMBIGUOUS opening command
 * word pins (exam papers open questions with the command word); noun
 * usages, mid-sentence verbs and natural-language markers classify NULL and
 * render NOTHING (the byte-stability law) — the model's own v18 shape law
 * still governs those asks untouched.
 */
import { describe, expect, test } from "bun:test";
import { classifyCommandWord } from "../../src/services/tutor/command-word";

describe("command-word classifier (DC10 §7.3, precision-first)", () => {
  test("the six exam command words pin their families", () => {
    expect(classifyCommandWord("State two differences between boiling and evaporation.")).toEqual({
      word: "state",
      family: "STATE",
    });
    expect(classifyCommandWord("Describe how ions form.")).toEqual({
      word: "describe",
      family: "DESCRIBE",
    });
    expect(classifyCommandWord("Explain why the rate increases with temperature.")).toEqual({
      word: "explain",
      family: "EXPLAIN",
    });
    expect(classifyCommandWord("Calculate the moles in 5.6 g of iron.")).toEqual({
      word: "calculate",
      family: "CALCULATE",
    });
    expect(classifyCommandWord("Compare metallic and covalent bonding.")).toEqual({
      word: "compare",
      family: "COMPARE",
    });
    expect(classifyCommandWord("Evaluate whether the method is valid.")).toEqual({
      word: "evaluate",
      family: "EVALUATE",
    });
  });

  test("case-insensitive and tolerant of surrounding whitespace", () => {
    expect(classifyCommandWord("  EXPLAIN the trend  ")).toEqual({ word: "explain", family: "EXPLAIN" });
    expect(classifyCommandWord("Calculate…")).toEqual({ word: "calculate", family: "CALCULATE" });
  });

  test("a mid-sentence command word does NOT pin (precision-first)", () => {
    expect(classifyCommandWord("Can you explain electronegativity?")).toBeNull();
    expect(classifyCommandWord("What is the state of matter at room temperature?")).toBeNull();
    expect(classifyCommandWord("I don't understand how to compare two rates")).toBeNull();
  });

  test("natural-language markers never pin ('why'/'how'/'give'/'name' are absent by design)", () => {
    expect(classifyCommandWord("Why does the rate increase?")).toBeNull();
    expect(classifyCommandWord("How do I balance this equation?")).toBeNull();
    expect(classifyCommandWord("Give me the definition of a mole")).toBeNull();
    expect(classifyCommandWord("Name the products of this reaction")).toBeNull();
  });

  test("an inflected form does not match (word-boundary law)", () => {
    expect(classifyCommandWord("Explaining photosynthesis — how does it work?")).toBeNull();
    expect(classifyCommandWord("States of matter overview")).toBeNull();
  });

  test("an empty or blank question classifies null (nothing renders)", () => {
    expect(classifyCommandWord("")).toBeNull();
    expect(classifyCommandWord("   ")).toBeNull();
  });
});
