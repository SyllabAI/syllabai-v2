/**
 * Banks-inventory derivation tests — ADR-044 run-011 (the pure laws behind
 * GET /banks: the SME path grammar counts, the README exclusion, the
 * slug filter, the truncation disclosure, and the receipt hash shape).
 */
import { describe, expect, test } from "bun:test";
import { deriveInventory, fieldHash, type TreeEntry } from "./banks";

const SHA = "cf1c8378b7ffdb581360c1e6b79bac157443c08c";

function entry(path: string, type = "blob"): TreeEntry {
  return { path, type };
}

describe("deriveInventory (the path grammar of record)", () => {
  test("SME question banks count per course (the structural law)", () => {
    const inv = deriveInventory(SHA, [
      entry("SME-ExamQuestion/igcse-physics-19/1-forces-and-motion/motion/questions.md"),
      entry("SME-ExamQuestion/igcse-physics-19/2-electricity/circuits/questions.md"),
      entry("SME-ExamQuestion/cie-a-level-chemistry-25/1-physical/kinetics/questions.md"),
    ], false);
    const physics = inv.courses.find((c) => c.slug === "igcse-physics-19");
    expect(physics?.counts.questions).toBe(2);
    expect(physics?.counts.notes).toBe(0);
    const chem = inv.courses.find((c) => c.slug === "cie-a-level-chemistry-25");
    expect(chem?.counts.questions).toBe(1);
  });

  test("notes and flashcards count per course; README.md never counts", () => {
    const inv = deriveInventory(SHA, [
      entry("SME-RevisionNotes/igcse-physics-19/1-forces-and-motion/motion.md"),
      entry("SME-RevisionNotes/igcse-physics-19/README.md"),
      entry("SME-Flashcards/igcse-physics-19/forces/deck.md"),
      entry("SME-Flashcards/cie-a-level-biology-25/README.md"),
    ], false);
    const physics = inv.courses.find((c) => c.slug === "igcse-physics-19");
    expect(physics?.counts.notes).toBe(1);
    expect(physics?.counts.flashcards).toBe(1);
    const bio = inv.courses.find((c) => c.slug === "cie-a-level-biology-25");
    expect(bio).toBeUndefined(); // the README-only course never materializes
  });

  test("lane artifacts (receipts, runbooks, top-level files) never count", () => {
    const inv = deriveInventory(SHA, [
      entry("tasks/some-run/RECEIPT.json"),
      entry("LEDGER.md"),
      entry("assets/diagram.png"),
      entry("scripts/tool.ts"),
    ], false);
    expect(inv.courses).toEqual([]);
  });

  test("tree dirs are ignored (only blobs count); courses sort by slug", () => {
    const inv = deriveInventory(SHA, [
      entry("SME-ExamQuestion/b-course/x/y/questions.md"),
      entry("SME-ExamQuestion", "tree"),
      entry("SME-ExamQuestion/a-course/x/y/questions.md"),
    ], false);
    expect(inv.courses.map((c) => c.slug)).toEqual(["a-course", "b-course"]);
  });

  test("the headSha + truncation ride verbatim (disclosed, never hidden)", () => {
    const inv = deriveInventory(SHA, [], true);
    expect(inv.headSha).toBe(SHA);
    expect(inv.truncated).toBe(true);
    expect(typeof inv.fetchedAt).toBe("string");
  });
});

describe("fieldHash (the receipt evidence law)", () => {
  test("sha256 hex, stable, value-sensitive", () => {
    expect(fieldHash("a")).toMatch(/^[0-9a-f]{64}$/);
    expect(fieldHash("a")).toBe(fieldHash("a"));
    expect(fieldHash("a")).not.toBe(fieldHash("b"));
  });
});
