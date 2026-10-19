/**
 * T-MIG-133 band 133j — the notes↔books spec-join law tests. The shapes
 * mirror the live surfaces of record: chapters as the api registry serves
 * them (specCodes[].spineCode, e.g. u1:c1 → 4CH1-1.1/1.2/1.3/1.4/1.5C),
 * notes as the hub corpus carries them (specPointCodes in the SAME
 * grammar, including C-suffixed chemistry-only codes).
 */
import { describe, expect, it } from "bun:test";

import { bookChaptersForNote, chapterSpecCodes, relatedNotesForChapter } from "./books-notes";
import type { RevisionNote } from "./contracts";
import type { BookChapter } from "@syllabai/contracts";

function chapter(over: Partial<BookChapter> & { chapterKey: string }): BookChapter {
  return {
    documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
    docVersion: 1,
    courseId: "igcse-chemistry-19",
    unitIndex: 1,
    unitTitle: "Principles of Chemistry",
    chapterIndex: 1,
    title: "States of matter",
    bookPageStart: 2,
    bookPageEnd: 13,
    pdfPageStart: 11,
    pdfPageEnd: 22,
    learningObjective: null,
    specCodes: [],
    validationState: "SUGGESTED",
    ...over,
  };
}

function note(over: Partial<RevisionNote> & { noteId: string }): RevisionNote {
  return {
    title: "A note",
    sourceUrl: null,
    specPointIds: [],
    specPointCodes: [],
    guidedStudy: false,
    path: "1-principles-of-chemistry/1-1-states-of-matter",
    updatedAt: "2026-01-29T09:15:08.022Z",
    bodyMd: "",
    ...over,
  };
}

const C1 = chapter({
  chapterKey: "u1:c1",
  chapterIndex: 1,
  specCodes: [
    { spineCode: "4CH1-1.1", officialCode: "1.1", officialId: "4CH1-1.1", tier: "1", score: 1, lineage: "l1", method: "verbatim" },
    { spineCode: "4CH1-1.5C", officialCode: "1.5C", officialId: "4CH1-1.5C", tier: "1", score: 1, lineage: "l2", method: "verbatim" },
  ],
});

describe("chapterSpecCodes", () => {
  it("projects the spineCode column verbatim", () => {
    expect(chapterSpecCodes(C1)).toEqual(["4CH1-1.1", "4CH1-1.5C"]);
  });
  it("tolerates a chapter with no spec codes", () => {
    expect(chapterSpecCodes(chapter({ chapterKey: "u1:c1", specCodes: [] }))).toEqual([]);
  });
});

describe("relatedNotesForChapter", () => {
  it("joins on exact spineCode intersection", () => {
    const notes = [
      note({ noteId: "rn_a", specPointCodes: ["4CH1-1.1", "4CH1-1.2"] }),
      note({ noteId: "rn_b", specPointCodes: ["4CH1-1.9"] }),
    ];
    expect(relatedNotesForChapter(C1, notes).map((n) => n.noteId)).toEqual(["rn_a"]);
  });

  it("is exact: a C-suffix code never matches the plain code", () => {
    const notes = [note({ noteId: "rn_c", specPointCodes: ["4CH1-1.5"] })];
    expect(relatedNotesForChapter(C1, notes)).toEqual([]); // 1.5C ≠ 1.5
  });

  it("dedups a note matching through two codes and sorts deterministically", () => {
    const notes = [
      note({ noteId: "rn_z", title: "Zeta", path: "p2", specPointCodes: ["4CH1-1.5C"] }),
      note({ noteId: "rn_a", title: "Alpha", path: "p1", specPointCodes: ["4CH1-1.1", "4CH1-1.5C"] }),
    ];
    expect(relatedNotesForChapter(C1, notes).map((n) => n.noteId)).toEqual(["rn_a", "rn_z"]);
  });

  it("honest empties: no chapter codes or no intersecting notes → []", () => {
    expect(relatedNotesForChapter(chapter({ chapterKey: "u1:c1", specCodes: [] }), [note({ noteId: "rn_a", specPointCodes: ["4CH1-1.1"] })])).toEqual([]);
    expect(relatedNotesForChapter(C1, [note({ noteId: "rn_x", specPointCodes: [] })])).toEqual([]);
  });
});

describe("bookChaptersForNote", () => {
  const chapters = [
    chapter({ chapterKey: "u1:c1", unitIndex: 1, chapterIndex: 1, specCodes: C1.specCodes }),
    chapter({
      chapterKey: "u1:c6",
      unitIndex: 1,
      chapterIndex: 6,
      title: "Calculations part 2",
      specCodes: [
        { spineCode: "4CH1-1.34C", officialCode: "1.34C", officialId: "4CH1-1.34C", tier: "2", score: 1, lineage: "l3", method: "normalized" },
      ],
    }),
  ];

  it("returns the owning chapter for a mapped note", () => {
    const n = note({ noteId: "rn_a", specPointCodes: ["4CH1-1.34C"] });
    expect(bookChaptersForNote(n, chapters).map((c) => c.chapterKey)).toEqual(["u1:c6"]);
  });

  it("orphans get NO chapter (never a nearest-guess or unit fallback)", () => {
    const n = note({ noteId: "rn_orphan", specPointCodes: ["4CH1-9.99"] });
    expect(bookChaptersForNote(n, chapters)).toEqual([]);
  });

  it("multiple matches order by unit then chapter", () => {
    const n = note({ noteId: "rn_multi", specPointCodes: ["4CH1-1.1", "4CH1-1.34C"] });
    expect(bookChaptersForNote(n, chapters).map((c) => c.chapterKey)).toEqual(["u1:c1", "u1:c6"]);
  });
});
