/**
 * T-BOOK-033/status-flip r1 — the chapter-key join law.
 *
 * Defect of record (live-verified during the status-flip bake): the DB rail
 * coordinate (book_chapters.chapter_key) carries "u1:c1" while the baked
 * lesson index carries "u1:c01" — the SAME chapter in two formats. The
 * r0 wire joined these keys EXACTLY in three places (reader toggle lookup,
 * shelf badge membership, lesson-page ?chapter= resolution), so the
 * toggle/badge never rendered and a rail-format ?chapter= would have
 * fallen through to idx[0] (wrong-chapter once pack #2 lands).
 *
 * The fix: one normalizer (unit/chapter INTEGERS) + normalized joins at
 * every site. These tests pin the law with the exact shipped pair.
 */
import { describe, expect, test, mock } from "bun:test";

// books-lesson is a server module (import "server-only"); the package is a
// Next.js build-time stub absent from the bun-test module graph — shim it
// BEFORE the module under test loads (the citation-books.test.ts law).
mock.module("server-only", () => ({}));

const { normalizedChapterKey, findChapterKeyInIndex } = await import("./books-lesson");

describe("normalizedChapterKey — the two-format join law", () => {
  test("the shipped regression pair: rail u1:c1 == pack u1:c01", () => {
    expect(normalizedChapterKey("u1:c1")).toBe("u1:c1");
    expect(normalizedChapterKey("u1:c01")).toBe("u1:c1");
  });

  test("multi-digit units and padded chapters collapse to integers", () => {
    expect(normalizedChapterKey("u12:c07")).toBe("u12:c7");
    expect(normalizedChapterKey("u3:c123")).toBe("u3:c123");
    expect(normalizedChapterKey("u4:c29")).toBe("u4:c29");
  });

  test("whitespace tolerated (form payloads)", () => {
    expect(normalizedChapterKey(" u1:c1 ")).toBe("u1:c1");
  });

  test("unknown shapes are honest-null (callers keep exact-match behavior)", () => {
    expect(normalizedChapterKey("")).toBeNull();
    expect(normalizedChapterKey("chapter-1")).toBeNull();
    expect(normalizedChapterKey("u:c1")).toBeNull();
    expect(normalizedChapterKey("u1:")).toBeNull();
    expect(normalizedChapterKey("u1:x01")).toBeNull();
  });
});

describe("findChapterKeyInIndex — either format finds the pack row", () => {
  const idx = [
    { packId: "u1-c01-states-of-matter", chapterKey: "u1:c01" },
    { packId: "u2-c11-atomic-structure", chapterKey: "u2:c11" },
  ];

  test("rail format finds the padded pack row", () => {
    expect(findChapterKeyInIndex(idx, "u1:c1")).toEqual(idx[0]);
  });

  test("pack format finds its own row (exact-match posture preserved)", () => {
    expect(findChapterKeyInIndex(idx, "u1:c01")).toEqual(idx[0]);
  });

  test("second pack resolvable in rail format (the wrong-chapter regression)", () => {
    expect(findChapterKeyInIndex(idx, "u2:c11")).toEqual(idx[1]);
    expect(findChapterKeyInIndex(idx, "u2:c11")).not.toEqual(idx[0]);
  });

  test("unknown chapter / unknown shape / empty index → null (honest-absent)", () => {
    expect(findChapterKeyInIndex(idx, "u9:c9")).toBeNull();
    expect(findChapterKeyInIndex(idx, "junk")).toBeNull();
    expect(findChapterKeyInIndex([], "u1:c1")).toBeNull();
  });
});

describe("shelf membership composition — normalized BOTH sides", () => {
  test("DB rail key hits a set built from pack keys", () => {
    const packKeys = ["u1:c01", "u2:c11"];
    const set = new Set(
      packKeys
        .map((k) => normalizedChapterKey(k))
        .filter((k): k is string => k != null),
    );
    expect(set.has(normalizedChapterKey("u1:c1") as string)).toBe(true);
    expect(set.has(normalizedChapterKey("u2:c11") as string)).toBe(true);
    expect(set.has(normalizedChapterKey("u1:c2") as string)).toBe(false);
  });
});
