/**
 * F-182 build — the bank-of-record integration pins (services/drill/bank.ts
 * over the REAL chemistry bundle of record). The draw endpoint serves THIS
 * bank, so these numbers can never disagree with the opening's census
 * artifact (apps/api/src/services/drill/census-of-record.json, pinned by
 * draw.test.ts): 3928 eligible parts, 171/182 addresses covered, 157
 * drillable, strongest 4CH1-1.25.
 */
import { describe, expect, test } from "bun:test";

import { bundleBank, DRILL_COURSE_REGISTRY, UnknownCourseError } from "../../src/services/drill/bank";
import { DRILLABLE_FLOOR } from "../../src/services/drill/census";

const bank = bundleBank("igcse-chemistry-19");

describe("F-182 bank of record — the real chemistry bundle", () => {
  test("the registry is fail-closed: only the censused course of record", () => {
    expect([...DRILL_COURSE_REGISTRY]).toEqual(["igcse-chemistry-19"]);
    expect(() => bundleBank("igcse-physics-19")).toThrow(UnknownCourseError);
  });

  test("the bank part count equals the census-of-record eligible parts (3928)", () => {
    expect(bank.parts).toHaveLength(3928);
  });

  test("the address rows agree with the census summary (171 covered / 157 drillable / 14 thin / 11 uncovered)", () => {
    const drillable = bank.addressRows.filter((a) => a.drillable);
    const covered = bank.addressRows.filter((a) => a.combined > 0);
    expect(bank.censusSummary.specPointAddresses).toBe(182);
    expect(covered).toHaveLength(171);
    expect(drillable).toHaveLength(157);
    expect(bank.censusSummary.thin).toBe(14);
    expect(bank.censusSummary.uncovered).toBe(11);
    // every drillable row clears the fail-closed floor by construction
    for (const row of drillable) expect(row.combined).toBeGreaterThanOrEqual(DRILLABLE_FLOOR);
  });

  test("the strongest address serves a full draw: 4CH1-1.25 with 155 anchored parts", () => {
    const row = bank.addressRows.find((a) => a.code === "4CH1-1.25");
    expect(row?.combined).toBe(155);
    expect(bank.poolOf("4CH1-1.25")).toHaveLength(155);
  });

  test("content views: real problemMd, choices WITHOUT isCorrect, and a real solution for the reveal", () => {
    const mcq = bank.parts.find((p) => bank.contentOf(p.partId)?.choices);
    expect(mcq).toBeDefined();
    const mcqContent = bank.contentOf(mcq!.partId)!;
    expect(mcqContent.problemMd.length).toBeGreaterThan(0);
    for (const ch of mcqContent.choices!) expect(Object.keys(ch).sort()).toEqual(["label", "textMd"]);
    // the grading lookup stays bank-side: the correct label exists server-only
    const labels = mcqContent.choices!.map((ch) => ch.label);
    const anyCorrect = labels.some((l) => bank.isCorrectChoice(mcq!.partId, l) === true);
    expect(anyCorrect).toBe(true);
    expect(bank.isCorrectChoice(mcq!.partId, "NOPE")).toBe(false);

    const solved = bank.parts.find((p) => bank.solutionOf(p.partId));
    expect(solved).toBeDefined();
    expect(bank.solutionOf(solved!.partId)!.length).toBeGreaterThan(0);
  });

  test("marksOf agrees with the census part facts", () => {
    const part = bank.parts[0]!;
    expect(bank.marksOf(part.partId)).toBe(part.marks);
    expect(bank.marksOf("qstnprt_does_not_exist")).toBeNull();
  });
});

describe("F-183 MS of record — the real chemistry bundle", () => {
  test("the MS-linked share of the eligible corpus matches the baseline of record (2537/3928)", () => {
    const linked = bank.parts.filter((p) => bank.markSchemeOf(p.partId) !== null);
    expect(linked).toHaveLength(2537);
    // the honest nulls are visible too: 1391 parts carry solutionMd (or
    // nothing) but NO linked MS — law L6, never paraphrased into a fake MS
    const unlinked = bank.parts.filter((p) => bank.markSchemeOf(p.partId) === null);
    expect(unlinked).toHaveLength(3928 - 2537);
  });

  test("the examiner's arithmetic holds corpus-wide: marksTotal == part.marks on EVERY linked part", () => {
    for (const part of bank.parts) {
      const ms = bank.markSchemeOf(part.partId);
      if (!ms) continue;
      expect(ms.points.length).toBeGreaterThanOrEqual(1);
      const sum = ms.points.reduce((s, pt) => s + pt.marks, 0);
      expect(sum).toBe(part.marks);
      expect(ms.marksTotal).toBe(part.marks);
    }
  });

  test("a known official-plane part serves its MS of record VERBATIM (law L3)", () => {
    const ms = bank.markSchemeOf("offp_2019-06_1c_1-a");
    expect(ms).not.toBeNull();
    expect(ms!.answerStatus).toBe("linked");
    expect(ms!.marksTotal).toBe(1);
    expect([...ms!.points]).toEqual([
      { ref: "2019-06-1-a-MP1", textMd: "Answer B: the crystal dissolves in the water", marks: 1 },
    ]);
  });

  test("an unlinked part degrades honestly: no MS, but the solution prose still reveals", () => {
    const unlinked = bank.parts.find((p) => bank.markSchemeOf(p.partId) === null && bank.solutionOf(p.partId));
    expect(unlinked).toBeDefined();
    expect(bank.solutionOf(unlinked!.partId)!.length).toBeGreaterThan(0);
  });
});
