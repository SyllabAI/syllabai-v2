/// <reference types="bun-types" />
/**
 * Spec-statement structure parser — round-trip and guard gates (bun test).
 * Run: bun test src/lib/spec-statement.test.ts
 *
 * Every fixture below is a real corpus shape (106-curriculum census,
 * T-SPEC-RENDER-1) — no invented cases.
 */
import { describe, expect, test } from "bun:test";
import { parseSpecStatement } from "./spec-statement";

const B = " \u2022 "; // the of-record join separator

describe("spec-statement — bullet structure (join-law inverse)", () => {
  test("of-record join law: lead + ' • ' items splits back exactly", () => {
    // igcse-chemistry-19 4CH1-1.4 verbatim bundle title
    const vm = parseSpecStatement(
      `know what is meant by the terms:${B}solvent${B}solute${B}solution${B}saturated solution.`,
    );
    expect(vm.lead).toBe("know what is meant by the terms:");
    expect(vm.items).toEqual([["solvent"], ["solute"], ["solution"], ["saturated solution."]]);
  });

  test("lead without colon stays verbatim (no punctuation invention)", () => {
    const vm = parseSpecStatement(`matching${B}historic cost`);
    expect(vm.lead).toBe("matching");
    expect(vm.items).toEqual([["historic cost"]]);
  });

  test("hydrate interpunct is NOT a bullet (no right-hand space)", () => {
    // cie-igcse-chemistry-23 7.3.5 — CuSO4·5H2O scatter
    const raw = "water of crystallisation, including CuSO \u20225H O and CoC l \u20226H O";
    const vm = parseSpecStatement(raw);
    expect(vm.items).toBeNull();
    expect(vm.lead).toBeNull();
    expect(vm.text).toContain("CuSO");
  });

  test("doubled bullets and trailing bullet collapse to items (no empties)", () => {
    // cie-igcse-maths-25-core C4.1.2 shape: ' • polygons • • nets • • simple solids. •'
    const vm = parseSpecStatement(`${B}polygons${B}${B}nets${B}${B}simple solids.${B}`);
    expect(vm.lead).toBeNull();
    expect(vm.items).toEqual([["polygons"], ["nets"], ["simple solids."]]);
  });

  test("BEL / PUA / NBSP normalization still applies before splitting", () => {
    // leading BEL bullet + NBSP — T-SPEC-AUDIT-1 classes, upstream of the split
    const vm = parseSpecStatement("\u0007recall and use the equation r =\u00A0…");
    expect(vm.text).toBe("recall and use the equation r = …");
    expect(vm.items).toBeNull();
  });
});

describe("spec-statement — inline part markers", () => {
  test("ascending roman chain splits mid-clause", () => {
    // ial-biology-18 1.2 shape — statement opens straight on the parts
    const vm = parseSpecStatement(
      "(i) know the difference between monosaccharides, disaccharides and polysaccharides (ii) be able to relate the structures of monosaccharides to their roles",
    );
    expect(vm.lead).toBeNull();
    expect(vm.items).not.toBeNull();
    expect(vm.items!.length).toBe(2);
    expect(vm.items![0][0].startsWith("(i) ")).toBe(true);
    expect(vm.items![1][0].startsWith("(ii) ")).toBe(true);
  });

  test("clause-boundary markers split without a chain", () => {
    const vm = parseSpecStatement("describe these reactions: (a) steam addition (b) hydrogen halide addition");
    expect(vm.lead).toBe("describe these reactions:");
    expect(vm.items).not.toBeNull();
    expect(vm.items!.length).toBe(2);
    expect(vm.items![0][0].startsWith("(a) ")).toBe(true);
    expect(vm.items![1][0].startsWith("(b) ")).toBe(true);
  });

  test("cross-reference ranges are NOT split: '2.4.1(a)–(d)'", () => {
    // cie-a-level-chemistry-25 2.4.1 shape
    const vm = parseSpecStatement(
      "deduce stoichiometric relationships from calculations such as those in 2.4.1(a)\u2013(d)",
    );
    expect(vm.items).toBeNull();
  });

  test("cross-reference enumerations are NOT split: '28.4.1(a) and 28.4.1(b)'", () => {
    const vm = parseSpecStatement(
      "deduce the overall polarity of complexes such as those described in 28.4.1(a) and 28.4.1(b)",
    );
    expect(vm.items).toBeNull();
  });

  test("symbol definitions are NOT split: 'pico (p), nano (n)'", () => {
    // cie-a-level-physics-25 1.2.4 shape
    const vm = parseSpecStatement(
      "recall and use the following prefixes and their symbols: pico (p), nano (n), micro (\u03bc), milli (m)",
    );
    expect(vm.items).toBeNull();
  });

  test("uppercase parens are NOT markers: 'current (A), temperature (K)'", () => {
    const vm = parseSpecStatement(
      "recall the following SI base quantities and their units: mass (kg), current (A), temperature (K)",
    );
    expect(vm.items).toBeNull();
  });

  test("parenthetical prose is NOT split", () => {
    const vm = parseSpecStatement(
      "understand how the structures of starch (amylose and amylopectin) differ from cellulose",
    );
    expect(vm.items).toBeNull();
  });

  test("part markers inside a bullet item split within that item", () => {
    const vm = parseSpecStatement(
      `graphs of the functions:${B}(a) linear${B}(b) quadratic${B}(c) cubic`,
    );
    expect(vm.lead).toBe("graphs of the functions:");
    expect(vm.items).toEqual([["(a) linear"], ["(b) quadratic"], ["(c) cubic"]]);
  });

  test("lead carrying inline parts keeps lead sentence and promotes parts", () => {
    const vm = parseSpecStatement(
      "the following pairs: (i) positive denary and positive binary (ii) positive denary and positive hexadecimal",
    );
    expect(vm.lead).toBe("the following pairs:");
    expect(vm.items).toEqual([
      ["(i) positive denary and positive binary"],
      ["(ii) positive denary and positive hexadecimal"],
    ]);
  });
});

describe("spec-statement — verbatim + idempotence invariants", () => {
  test("round-trip: joining the VM reproduces the normalized text", () => {
    const raw = `know that:${B}the universe is a large collection of billions of galaxies${B}a galaxy is a large collection of billions of stars`;
    const vm = parseSpecStatement(raw);
    const joined = [vm.lead, ...(vm.items ?? []).map((lines) => lines.join(" "))].join(B);
    expect(joined).toBe(vm.text);
  });

  test("idempotence: re-parsing rendered lines is a no-op", () => {
    const raw = `state the biotic and abiotic components of an ecosystem:${B}producers${B}consumers (primary, secondary and tertiary)`;
    const vm = parseSpecStatement(raw);
    const re = parseSpecStatement([vm.lead, ...(vm.items ?? []).map((l) => l.join(" "))].join(B));
    expect(re).toEqual(vm);
  });

  test("empty and null-ish inputs never crash", () => {
    expect(parseSpecStatement("")).toEqual({ text: "", lead: null, items: null });
    // ' • ' normalizes to a bare bullet with no structure to recover
    expect(parseSpecStatement(B)).toEqual({ text: "\u2022", lead: null, items: null });
  });

  test("plain statements pass through untouched", () => {
    const raw = "understand the three states of matter in terms of the arrangement, movement and energy of the particles";
    const vm = parseSpecStatement(raw);
    expect(vm).toEqual({ text: raw, lead: null, items: null });
  });
});
