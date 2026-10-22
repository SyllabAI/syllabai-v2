import { describe, expect, test } from "bun:test";

import {
  lessonBoxTypes,
  parseLessonSegments,
  rewriteGlossaryChips,
} from "./lesson-markdown";

describe("parseLessonSegments", () => {
  test("alternating prose and boxes", () => {
    const body = [
      "Prose one.",
      "",
      ":::key-point",
      "Key **text** with [[particle-model]] chip.",
      ":::",
      "",
      "Prose two.",
      "",
      ":::exam-hint",
      "Hint body",
      ":::",
    ].join("\n");
    const segs = parseLessonSegments(body);
    expect(segs).toEqual([
      { kind: "prose", md: "Prose one." },
      { kind: "box", boxType: "key-point", md: "Key **text** with [[particle-model]] chip." },
      { kind: "prose", md: "Prose two." },
      { kind: "box", boxType: "exam-hint", md: "Hint body" },
    ]);
  });

  test("GFM table inside a box survives", () => {
    const body = [
      ":::worked-example",
      "| Temperature/°C | 10 |",
      "| --- | --- |",
      "| Solubility | 31.2 |",
      ":::",
    ].join("\n");
    const segs = parseLessonSegments(body);
    expect(segs.length).toBe(1);
    expect(segs[0].kind).toBe("box");
    expect(segs[0].md).toContain("| Temperature/°C | 10 |");
  });

  test("a ``` fence does not open/close boxes", () => {
    const body = [
      ":::key-point",
      "```",
      "::: not a close inside a fence",
      "```",
      ":::",
      "after",
    ].join("\n");
    const segs = parseLessonSegments(body);
    expect(segs).toEqual([
      { kind: "box", boxType: "key-point", md: "```\n::: not a close inside a fence\n```" },
      { kind: "prose", md: "after" },
    ]);
  });

  test("unclosed box keeps its body (render, don't drop)", () => {
    const body = [":::misconception", '"Heating makes particles expand."', "No — spaces increase."].join("\n");
    const segs = parseLessonSegments(body);
    expect(segs.length).toBe(1);
    expect(segs[0]).toEqual({
      kind: "box",
      boxType: "misconception",
      md: '"Heating makes particles expand."\nNo — spaces increase.',
    });
  });

  test("empty prose segments are dropped", () => {
    const body = [":::summary", "only a box", ":::"].join("\n");
    expect(parseLessonSegments(body)).toEqual([{ kind: "box", boxType: "summary", md: "only a box" }]);
  });

  test("plain markdown body → single prose segment", () => {
    const body = "# Heading\n\nSome text.\n\n- a\n- b";
    expect(parseLessonSegments(body)).toEqual([{ kind: "prose", md: body }]);
  });
});

describe("lessonBoxTypes", () => {
  test("first-appearance order, deduped", () => {
    const body = [
      ":::key-point", "a", ":::",
      ":::exam-hint", "b", ":::",
      ":::key-point", "c", ":::",
    ].join("\n");
    expect(lessonBoxTypes(body)).toEqual(["key-point", "exam-hint"]);
  });
});

describe("rewriteGlossaryChips", () => {
  test("[[slug]] → bold", () => {
    expect(rewriteGlossaryChips("The [[particle-model]] explains it.")).toBe(
      "The **particle-model** explains it.",
    );
  });
  test("pipe alias form also rewrites to the slug", () => {
    expect(rewriteGlossaryChips("[[diffusion|spreads]]")).toBe("**diffusion**");
  });
  test("no chips → unchanged", () => {
    expect(rewriteGlossaryChips("plain text")).toBe("plain text");
  });
});
