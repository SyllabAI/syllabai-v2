/**
 * run-014 pins for the spec-quiz debris strip (the render-boundary
 * companion to the v11 "specification is a map, not content" prompt law —
 * see specQuiz.ts for the laws and the precision boundary).
 *
 * The operator-measured wire shapes (trace 1a14eb4561e56285 transcript +
 * the water-test quiz capture) are pinned byte-exact; the negative pins
 * freeze the precision boundary: explanation prose, provenance-carrying
 * chemistry items and the [n]/【n】 marker territories must never be
 * caught, and the strip must fail open.
 */
import { describe, expect, test } from "bun:test";
import { stripSpecQuizDebris } from "./specQuiz";

describe("stripSpecQuizDebris — the measured wire shapes", () => {
  test("strips the operator-measured truncated spec-code quiz item", () => {
    const raw =
      "**Quiz – answer the following**\n\n1. Which chemical is used in the IGCSE water-presence test?\n2. What is the specification code that covers";
    expect(stripSpecQuizDebris(raw)).toBe(
      "**Quiz – answer the following**\n\n1. Which chemical is used in the IGCSE water-presence test?",
    );
  });

  test("strips a complete spec-code question item", () => {
    const raw =
      "1. Which chemical is used in the water test?\n2. What is the specification code that covers the water test?\n3. Why is the anhydrous form used?";
    expect(stripSpecQuizDebris(raw)).toBe(
      "1. Which chemical is used in the water test?\n3. Why is the anhydrous form used?",
    );
  });

  test("strips bullet-form and 'which specification point' variants (embedded)", () => {
    const lead = "Quiz items:\n";
    expect(stripSpecQuizDebris(lead + "- Which specification point covers electrolysis?"))
      .toBe("Quiz items:");
    expect(stripSpecQuizDebris(lead + "* What does specification 2.49 say about water?"))
      .toBe("Quiz items:");
    expect(stripSpecQuizDebris(lead + "2) State the syllabus reference for the mole concept."))
      .toBe("Quiz items:");
  });

  test("strips recall-imperative items even with a full stop (embedded)", () => {
    const lead = "1. Which gas is produced?\n";
    expect(stripSpecQuizDebris(lead + "3. Name the topic code for rates of reaction."))
      .toBe("1. Which gas is produced?");
    expect(stripSpecQuizDebris(lead + "- Give the learning objective that covers titrations."))
      .toBe("1. Which gas is produced?");
  });

  test("truncated interrogative item is caught without a question mark (embedded)", () => {
    expect(stripSpecQuizDebris("1. Which gas is produced?\n2. Which syllabus statement defines an acid"))
      .toBe("1. Which gas is produced?");
  });

  test("strips across an answer, leaving surrounding content intact", () => {
    const raw =
      "**Explanation** – anhydrous copper(II) sulfate turns blue [6].\n\n**Quiz**\n\n1. State the colour change observed.\n2. What is the specification code that covers this test?\n3. Write the equation for the reaction.\n\n*Understanding check*";
    expect(stripSpecQuizDebris(raw)).toBe(
      "**Explanation** – anhydrous copper(II) sulfate turns blue [6].\n\n**Quiz**\n\n1. State the colour change observed.\n3. Write the equation for the reaction.\n\n*Understanding check*",
    );
  });
});

describe("stripSpecQuizDebris — precision boundary", () => {
  test("legit chemistry quiz items are kept", () => {
    const raw =
      "1. Which chemical is used in the IGCSE water-presence test?\n2. What colour change is observed when water is added?\n3. Write the equation for the reaction.";
    expect(stripSpecQuizDebris(raw)).toBe(raw);
  });

  test("the R4 carve-out: parenthesised provenance is kept", () => {
    const raw = "1. Anhydrous copper(II) sulfate tests for water (specification 2.49). What colour change is observed?";
    expect(stripSpecQuizDebris(raw)).toBe(raw);
  });

  test("explanation prose and bullets about the specification are kept", () => {
    const raw = "The IGCSE specification lists a practical test for water that uses anhydrous copper(II) sulfate (4CH1-2.49) [6].";
    expect(stripSpecQuizDebris(raw)).toBe(raw);
    const bullets = "- The specification lists three tests for water\n- Copper(II) sulfate turns blue";
    expect(stripSpecQuizDebris(bullets)).toBe(bullets);
  });

  test("species, specimen and generic 'spec-free' text are never caught", () => {
    expect(stripSpecQuizDebris("1. Which species is the oxidising agent?")).toBe(
      "1. Which species is the oxidising agent?",
    );
    expect(stripSpecQuizDebris("- The specimen is heated gently")).toBe(
      "- The specimen is heated gently",
    );
  });

  test("numbered statement with a full stop and no ask is kept (disclosed boundary)", () => {
    expect(stripSpecQuizDebris("2. The specification code for this topic is 2.49.")).toBe(
      "2. The specification code for this topic is 2.49.",
    );
  });

  test("citation-marker territories are untouched", () => {
    const raw = "1. Which species is oxidised 【2】?\n2. See [6] for the specification.\n3. What is the specification code for this?";
    expect(stripSpecQuizDebris(raw)).toBe(
      "1. Which species is oxidised 【2】?\n2. See [6] for the specification.",
    );
  });

  test("fail-open: an all-debris input returns unchanged (any length)", () => {
    expect(stripSpecQuizDebris("1. What is the specification code?")).toBe(
      "1. What is the specification code?",
    );
    const raw = "1. What is the specification code?\n2. Which topic code applies?";
    expect(stripSpecQuizDebris(raw)).toBe(raw);
  });

  test("empty and blank inputs pass through", () => {
    expect(stripSpecQuizDebris("")).toBe("");
    expect(stripSpecQuizDebris("\n\n")).toBe("");
  });
});
