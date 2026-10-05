/**
 * QuestionFamilyAssembler law tests (T-MIG-031 tranche 1).
 * Frozen law: QuestionFamilyAssembler.java @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import { compareSource, QuestionFamilyAssembler } from "../../src/services/questions/families";
import type { StudentQuestionView } from "@syllabai/contracts";
import {
  BLOCKED_ID,
  MCQ_ID,
  STRUCTURED_ID,
} from "./helpers";

function row(overrides: Partial<StudentQuestionView> & { id: string }): StudentQuestionView {
  return {
    externalRef: null,
    type: "MCQ_SINGLE",
    stem: "s",
    marks: 1,
    difficulty: 2,
    expectedTimeSeconds: 45,
    commandWord: null,
    primaryTopicNodeId: null,
    examPaperId: null,
    options: [],
    parts: [],
    specPointCodes: [],
    specPoints: [],
    ...overrides,
  };
}

const suf = (ref: string) => ref.match(/(-p\d+|-s)$/)?.[1] ?? "-plain";

const asm = new QuestionFamilyAssembler();

describe("familyKey (SME ref convention)", () => {
  test("corpus rows key on the base ref sme-eq-…-qN", () => {
    expect(asm.familyKey("sme-eq-1-1-states-of-matter-q16-p1", MCQ_ID)).toBe(
      "sme-eq-1-1-states-of-matter-q16",
    );
    expect(asm.familyKey("sme-eq-1-1-states-of-matter-q16", MCQ_ID)).toBe(
      "sme-eq-1-1-states-of-matter-q16",
    );
    expect(asm.familyKey("sme-eq-1-1-states-of-matter-q16-s", MCQ_ID)).toBe(
      "sme-eq-1-1-states-of-matter-q16",
    );
  });

  test("non-corpus rows (seed MCQs, past-paper refs, null refs) key by row id", () => {
    expect(asm.familyKey(null, MCQ_ID)).toBe(MCQ_ID);
    expect(asm.familyKey("WCH11-2022-01-03a", MCQ_ID)).toBe(MCQ_ID);
    expect(asm.familyKey("sme-eq-broken", MCQ_ID)).toBe(MCQ_ID); // no -qN tail
  });
});

describe("member order", () => {
  test("pinned interleaved order: states-of-matter q16 = p1, s, p2", () => {
    const units = asm.assemble([
      row({ id: "80000000-0000-4000-8000-000000000002", externalRef: "sme-eq-1-1-states-of-matter-q16-s", type: "STRUCTURED", marks: 2, difficulty: 3 }),
      row({ id: "80000000-0000-4000-8000-000000000003", externalRef: "sme-eq-1-1-states-of-matter-q16-p2", marks: 1, difficulty: 3 }),
      row({ id: "80000000-0000-4000-8000-000000000001", externalRef: "sme-eq-1-1-states-of-matter-q16-p1", marks: 1, difficulty: 3 }),
    ]);
    expect(units).toHaveLength(1);
    const u = units[0]!;
    expect(u.key).toBe("sme-eq-1-1-states-of-matter-q16");
    expect(u.parts.map((p) => suf(p.externalRef!))).toEqual(["-p1", "-s", "-p2"]);
    expect(u.marks).toBe(4);
    expect(u.type).toBe("STRUCTURED"); // mixed family is structured
    expect(u.multi).toBe(true);
    expect(u.ref).toBe("sme-eq-1-1-states-of-matter-q16");
  });

  test("default order when unpinned: plain row, then -p1..pN, then -s", () => {
    const units = asm.assemble([
      row({ id: "81000000-0000-4000-8000-000000000003", externalRef: "sme-eq-9-9-unpinned-q4-s", type: "STRUCTURED", difficulty: 1 }),
      row({ id: "81000000-0000-4000-8000-000000000002", externalRef: "sme-eq-9-9-unpinned-q4-p2", difficulty: 1 }),
      row({ id: "81000000-0000-4000-8000-000000000001", externalRef: "sme-eq-9-9-unpinned-q4-p1", difficulty: 1 }),
      row({ id: "81000000-0000-4000-8000-000000000000", externalRef: "sme-eq-9-9-unpinned-q4", difficulty: 1 }),
    ]);
    expect(units[0]!.parts.map((p) => suf(p.externalRef!))).toEqual([
      "-plain",
      "-p1",
      "-p2",
      "-s",
    ]);
  });

  test("single corpus row with no part suffix is NOT multi and keeps its ref", () => {
    const units = asm.assemble([
      row({ id: STRUCTURED_ID, externalRef: "sme-eq-2-2-group-7-halogens-q16", marks: 3, difficulty: 5 }),
    ]);
    expect(units[0]!.multi).toBe(false);
    expect(units[0]!.ref).toBe("sme-eq-2-2-group-7-halogens-q16");
    expect(units[0]!.key).toBe("sme-eq-2-2-group-7-halogens-q16");
  });

  test("single corpus row WITH a part suffix is multi (a part never serves alone)", () => {
    const units = asm.assemble([
      row({ id: MCQ_ID, externalRef: "sme-eq-2-2-group-7-halogens-q16-p1" }),
    ]);
    expect(units[0]!.multi).toBe(true);
    expect(units[0]!.ref).toBe("sme-eq-2-2-group-7-halogens-q16");
  });
});

describe("family serving order (SME page order)", () => {
  test("non-corpus rows serve AFTER the corpus, keyed by row id", () => {
    const units = asm.assemble([
      row({ id: "82000000-0000-4000-8000-000000000000", externalRef: null, marks: 1, difficulty: 1 }),
      row({ id: "82000000-0000-4000-8000-000000000001", externalRef: "sme-eq-1-1-states-of-matter-q16-p1", difficulty: 1 }),
    ]);
    expect(units.map((u) => u.key)).toEqual([
      "sme-eq-1-1-states-of-matter-q16",
      "82000000-0000-4000-8000-000000000000",
    ]);
    // wire-contract note: the null-ref row's family `ref` falls back to the
    // family key (row id) — the T-MIG-018 questionFamilyViewSchema.ref is
    // non-nullable; Java would emit null here (disclosed in the receipt)
    expect(units[1]!.ref).toBe("82000000-0000-4000-8000-000000000000");
  });

  test("source compare is numeric-aware: 1-10 after 1-2, qNum ascending", () => {
    const units = asm.assemble([
      row({ id: "83000000-0000-4000-8000-000000000001", externalRef: "sme-eq-1-10-alkenes-q2", difficulty: 1 }),
      row({ id: "83000000-0000-4000-8000-000000000002", externalRef: "sme-eq-1-2-elements-q1", difficulty: 1 }),
      row({ id: "83000000-0000-4000-8000-000000000003", externalRef: "sme-eq-1-2-elements-q10", difficulty: 1 }),
    ]);
    expect(units.map((u) => u.key)).toEqual([
      "sme-eq-1-2-elements-q1",
      "sme-eq-1-2-elements-q10",
      "sme-eq-1-10-alkenes-q2",
    ]);
  });

  test("equal (source, qNum) ties break on input order, never the random uuid key", () => {
    // two DIFFERENT row ids with the SAME base ref can only happen across
    // separate assembles; within one assemble the key dedupes. Pin the
    // first-seen law via two non-corpus rows sharing source NON_SME: both
    // key by row id, qNum 0 — input order decides.
    const a = row({ id: "84000000-0000-4000-8000-000000000001", difficulty: 1 });
    const b = row({ id: "84000000-0000-4000-8000-000000000000", difficulty: 1 });
    const first = asm.assemble([a, b]).map((u) => u.key);
    const second = asm.assemble([b, a]).map((u) => u.key);
    expect(first).toEqual(["84000000-0000-4000-8000-000000000001", "84000000-0000-4000-8000-000000000000"]);
    expect(second).toEqual(["84000000-0000-4000-8000-000000000000", "84000000-0000-4000-8000-000000000001"]);
  });

  test("compareSource: numeric segments compare numerically, textual lexically", () => {
    expect(compareSource("1-2-x", "1-10-x")).toBe(-1);
    expect(compareSource("1-10-x", "1-2-x")).toBe(1);
    expect(compareSource("1-2-x", "1-2-x")).toBe(0);
    expect(compareSource("1-x", "1-2-x")).toBe(1); // "x" vs "2": lexical wins for x>2? no — numeric vs textual: lexical branch
  });
});
