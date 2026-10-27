/**
 * T-BOOK-026 — the lesson↔rail block join law, pinned.
 *
 * Fixtures mirror the of-record c01 shapes: the published lesson pack
 * u1-c01-states-of-matter (sections with blockIds + bare specRefs) and the
 * rail block stream (ids "c01-states-and-solutions/bNN", specPointRefs
 * bare codes, ord 1..8). The authored row is the T-BOOK-066 precedent:
 * u1:c01:s02 → b08 (media-embed).
 */
import { describe, expect, test } from "bun:test";

import { joinRailBlocksIntoSections, type JoinableSection } from "./lesson-blocks-join";
import type { RailBlock } from "./books-rail";

function block(id: string, ord: number, specPointRefs: string[], type = "prose"): RailBlock {
  return {
    id,
    documentId: "e6c0db50",
    docVersion: 1,
    chapterKey: "u1:c1",
    ord,
    type,
    pdfPageAnchor: 10 + ord,
    content: {},
    checkRefs: [],
    glossaryRefs: [],
    specPointRefs,
    validationState: "VALIDATED",
    version: 2,
  } as RailBlock;
}

const SECTIONS: JoinableSection[] = [
  { id: "u1:c01:s01", blockIds: [], specRefs: ["1.1"] },
  { id: "u1:c01:s02", blockIds: ["c01-states-and-solutions/b08"], specRefs: ["1.1"] },
  { id: "u1:c01:s03", blockIds: [], specRefs: ["1.1"] },
  { id: "u1:c01:s04", blockIds: [], specRefs: ["1.2"] },
  { id: "u1:c01:s11", blockIds: [], specRefs: ["1.4", "1.5C", "1.7C"] },
  { id: "u1:c01:s12", blockIds: [], specRefs: ["1.6C"] },
];

describe("joinRailBlocksIntoSections", () => {
  test("authored blockIds win — b08 renders in s02 (the T-BOOK-066 precedent)", () => {
    const b08 = block("c01-states-and-solutions/b08", 8, ["1.1", "1.2"], "media-embed");
    const join = joinRailBlocksIntoSections(SECTIONS, [b08]);
    expect(join.bySection.get("u1:c01:s02")?.map((b) => b.id)).toEqual([
      "c01-states-and-solutions/b08",
    ]);
    expect(join.extras).toHaveLength(0);
  });

  test("derived fill — unclaimed blocks land in the FIRST spec-intersecting section", () => {
    const b01 = block("c01-states-and-solutions/b01", 1, ["1.1"]);
    const b03 = block("c01-states-and-solutions/b03", 3, ["1.2"], "sort-match");
    const b09 = block("c01-states-and-solutions/b09", 9, ["1.6C"], "eq-builder");
    const join = joinRailBlocksIntoSections(SECTIONS, [b01, b03, b09]);
    expect(join.bySection.get("u1:c01:s01")?.map((b) => b.id)).toEqual([
      "c01-states-and-solutions/b01",
    ]);
    expect(join.bySection.get("u1:c01:s04")?.map((b) => b.id)).toEqual([
      "c01-states-and-solutions/b03",
    ]);
    // 1.6C appears ONLY in s12 (s11 has 1.4/1.5C/1.7C — no intersection)
    expect(join.bySection.get("u1:c01:s12")?.map((b) => b.id)).toEqual([
      "c01-states-and-solutions/b09",
    ]);
    expect(join.extras).toHaveLength(0);
  });

  test("no intersection anywhere → honest extras, never dropped", () => {
    const bx = block("c01-states-and-solutions/bx", 10, ["9.9"]);
    const join = joinRailBlocksIntoSections(SECTIONS, [bx]);
    expect(join.bySection.size).toBe(0);
    expect(join.extras.map((b) => b.id)).toEqual(["c01-states-and-solutions/bx"]);
  });

  test("merged blocks sort back to ord order within a section", () => {
    // b05 (ord 5, 1.1) derives into s01; b01 (ord 1, 1.1) too — ord wins
    const b01 = block("c01-states-and-solutions/b01", 1, ["1.1"]);
    const b05 = block("c01-states-and-solutions/b05", 5, ["1.1"], "sim-embed");
    const join = joinRailBlocksIntoSections(SECTIONS, [b05, b01]);
    expect(join.bySection.get("u1:c01:s01")?.map((b) => b.ord)).toEqual([1, 5]);
  });

  test("authored ids dominate derivation even when listed out of ord", () => {
    const b03 = block("c01-states-and-solutions/b03", 3, ["1.1"]);
    const s = [{ id: "s-x", blockIds: ["c01-states-and-solutions/b03"], specRefs: ["9.9"] }];
    const join = joinRailBlocksIntoSections(s, [b03]);
    // claimed by s-x (authored); NOT derived into the 1.1 section
    expect(join.bySection.get("s-x")?.map((b) => b.id)).toEqual([
      "c01-states-and-solutions/b03",
    ]);
  });

  test("empty stream → empty join (honest-absent)", () => {
    const join = joinRailBlocksIntoSections(SECTIONS, []);
    expect(join.bySection.size).toBe(0);
    expect(join.extras).toHaveLength(0);
  });
});
