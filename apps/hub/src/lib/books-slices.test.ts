/**
 * T-MIG-133 band 133e — the pure slice law tests: manifest mirror, the
 * mount map, drift guards, and the mount resolutions (chapter anchor jump,
 * citation offsets, unit exam mounts, whole-book fallback).
 */
import { describe, expect, it } from "bun:test";

import {
  bookSliceMapOf,
  clampPage,
  manifestMatchesBook,
  resolveChapterMount,
  resolveUnitExamMount,
  sliceEntryMirror,
  sliceManifestMirror,
  type BookSliceEntry,
} from "./books-slices";

function entry(over: Partial<BookSliceEntry> & { file: string; role: BookSliceEntry["role"]; chapterKey: string; pdfRange: [number, number] }): BookSliceEntry {
  return {
    slicePages: over.pdfRange[1] - over.pdfRange[0] + 1,
    bytes: 1000,
    sha256: "a".repeat(64),
    ...over,
  } as BookSliceEntry;
}

const manifest = sliceManifestMirror.parse({
  schema: "book-slices-manifest-v1",
  book: {
    documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
    docVersion: 1,
    courseSlug: "igcse-chemistry-19",
    specKey: "pearson-edexcel/international-gcse/chemistry/4ch1",
  },
  slices: [
    entry({ file: "chapters/u1_c1.pdf", role: "lesson", chapterKey: "u1:c1", pdfRange: [12, 20] }),
    entry({ file: "chapters/u1_c1_q.pdf", role: "questions", chapterKey: "u1:c1", pdfRange: [21, 22] }),
    entry({ file: "chapters/u1_c3.pdf", role: "whole", chapterKey: "u1:c3", pdfRange: [33, 38] }),
    entry({ file: "units/u1_practice.pdf", role: "unit_exam", chapterKey: "u1:xexam-practice", pdfRange: [122, 131] }),
  ],
});

describe("slice manifest mirror", () => {
  it("parses the manifest of record shape", () => {
    expect(manifest.slices).toHaveLength(4);
    expect(manifest.book.docVersion).toBe(1);
  });

  it("rejects inverted page ranges", () => {
    expect(
      sliceEntryMirror.safeParse({
        file: "chapters/x.pdf",
        role: "lesson",
        chapterKey: "u1:c1",
        pdfRange: [22, 21],
        slicePages: 1,
        bytes: 1,
        sha256: "a".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown schema version", () => {
    expect(
      sliceManifestMirror.safeParse({ ...manifest, schema: "book-slices-manifest-v9" }).success,
    ).toBe(false);
  });
});

describe("drift guards", () => {
  it("accepts the same book/version/course", () => {
    expect(
      manifestMatchesBook(manifest, {
        documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
        docVersion: 1,
        courseSlug: "igcse-chemistry-19",
      }),
    ).toBe(true);
  });

  it("rejects a registry version shift", () => {
    expect(
      manifestMatchesBook(manifest, {
        documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
        docVersion: 2,
        courseSlug: "igcse-chemistry-19",
      }),
    ).toBe(false);
  });

  it("rejects a foreign document", () => {
    expect(
      manifestMatchesBook(manifest, {
        documentId: "00000000-0000-0000-0000-000000000000",
        docVersion: 1,
        courseSlug: "igcse-chemistry-19",
      }),
    ).toBe(false);
  });
});

describe("bookSliceMapOf", () => {
  const map = bookSliceMapOf(manifest);

  it("maps lesson + questions per chapter", () => {
    const c1 = map.byChapter.get("u1:c1");
    expect(c1?.mount.file).toBe("chapters/u1_c1.pdf");
    expect(c1?.questions?.file).toBe("chapters/u1_c1_q.pdf");
  });

  it("maps whole-range chapters with null questions", () => {
    const c3 = map.byChapter.get("u1:c3");
    expect(c3?.mount.file).toBe("chapters/u1_c3.pdf");
    expect(c3?.questions).toBeNull();
  });

  it("collects unit exam rows", () => {
    expect(map.unitExam).toHaveLength(1);
    expect(map.unitExam[0]!.chapterKey).toBe("u1:xexam-practice");
  });
});

describe("resolveChapterMount", () => {
  const map = bookSliceMapOf(manifest);
  const c1 = map.byChapter.get("u1:c1")!;

  it("lesson mount opens at slice page 1", () => {
    const r = resolveChapterMount(c1, { part: undefined, page: null, fallbackPage: 12 });
    expect(r.mount?.file).toBe("chapters/u1_c1.pdf");
    expect(r.initialPage).toBe(1);
    expect(r.isQuestions).toBe(false);
  });

  it("maps a citation page into the lesson slice", () => {
    const r = resolveChapterMount(c1, { part: undefined, page: 15, fallbackPage: 15 });
    expect(r.initialPage).toBe(4); // 15 - 12 + 1
  });

  it("the anchor jump opens the question slice at its page 1", () => {
    const r = resolveChapterMount(c1, { part: "questions", page: null, fallbackPage: 21 });
    expect(r.mount?.file).toBe("chapters/u1_c1_q.pdf");
    expect(r.initialPage).toBe(1);
    expect(r.isQuestions).toBe(true);
  });

  it("a citation page inside the question range offsets into the slice", () => {
    const r = resolveChapterMount(c1, { part: "questions", page: 22, fallbackPage: 22 });
    expect(r.mount?.file).toBe("chapters/u1_c1_q.pdf");
    expect(r.initialPage).toBe(2); // 22 - 21 + 1
  });

  it("whole-range chapters mount whole with no question split", () => {
    const c3 = map.byChapter.get("u1:c3")!;
    const r = resolveChapterMount(c3, { part: "questions", page: null, fallbackPage: 33 });
    expect(r.mount?.file).toBe("chapters/u1_c3.pdf");
    expect(r.isQuestions).toBe(false); // no q slice exists — part is ignored
  });

  it("falls back to the whole book with an absolute page", () => {
    const r = resolveChapterMount(null, { part: undefined, page: 15, fallbackPage: 12 });
    expect(r.mount).toBeNull();
    expect(r.initialPage).toBe(12);
  });

  it("a citation page outside the slice opens at its page 1 (the honest landing)", () => {
    const r = resolveChapterMount(c1, { part: undefined, page: 40, fallbackPage: 12 });
    expect(r.initialPage).toBe(1);
  });

  it("clamps a boundary offset at the slice end", () => {
    // the last lesson page maps to the last slice page exactly
    const r = resolveChapterMount(c1, { part: undefined, page: 20, fallbackPage: 12 });
    expect(r.initialPage).toBe(c1.mount.slicePages);
  });
});

describe("resolveUnitExamMount", () => {
  const u1 = bookSliceMapOf(manifest).unitExam[0]!;

  it("opens at page 1 without a page param", () => {
    expect(resolveUnitExamMount(u1, null).initialPage).toBe(1);
  });

  it("maps a citation page inside the unit span", () => {
    const r = resolveUnitExamMount(u1, 124);
    expect(r.initialPage).toBe(3); // 124 - 122 + 1
  });

  it("opens at page 1 for citations outside the unit span", () => {
    expect(resolveUnitExamMount(u1, 200).initialPage).toBe(1);
    expect(resolveUnitExamMount(u1, 0).initialPage).toBe(1);
  });

  it("maps the span's last page to the slice's last page", () => {
    expect(resolveUnitExamMount(u1, 131).initialPage).toBe(u1.slicePages);
  });
});

describe("the merged slice law (133g — the operator's corrected geometry)", () => {
  // the merged manifest of record: ONE slice per chapter (study material +
  // practice questions inline), the `_q` rows retired, the anchor carried by
  // questionsStartPage; the whole-role chapter has no honest anchor.
  const merged = sliceManifestMirror.parse({
    schema: "book-slices-manifest-v1",
    book: {
      documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
      docVersion: 1,
      courseSlug: "igcse-chemistry-19",
      specKey: "pearson-edexcel/international-gcse/chemistry/4ch1",
    },
    slices: [
      entry({
        file: "chapters/u1_c1.pdf",
        role: "lesson",
        chapterKey: "u1:c1",
        pdfRange: [12, 22],
        questionsStartPage: 21,
      }),
      entry({
        file: "chapters/u1_c3.pdf",
        role: "lesson",
        chapterKey: "u1:c3",
        pdfRange: [33, 38],
        questionsStartPage: null,
      }),
      entry({ file: "units/u1_practice.pdf", role: "unit_exam", chapterKey: "u1:xexam-practice", pdfRange: [122, 131] }),
    ],
  });
  const mmap = bookSliceMapOf(merged);
  const mc1 = mmap.byChapter.get("u1:c1")!;
  const mc3 = mmap.byChapter.get("u1:c3")!;

  it("parses questionsStartPage as an optional nullable field", () => {
    expect(mc1.mount.questionsStartPage).toBe(21);
    expect(mc3.mount.questionsStartPage).toBeNull();
    expect(mc1.questions).toBeNull(); // no `_q` rows in the merged manifest
  });

  it("the legacy manifest shape (no questionsStartPage key) still parses", () => {
    const legacy = sliceEntryMirror.safeParse({
      file: "chapters/x.pdf",
      role: "lesson",
      chapterKey: "u1:c1",
      pdfRange: [12, 20],
      slicePages: 9,
      bytes: 1000,
      sha256: "a".repeat(64),
    });
    expect(legacy.success).toBe(true);
  });

  it("the anchor jump opens the SAME merged slice at the questions offset", () => {
    const r = resolveChapterMount(mc1, { part: "questions", page: null, fallbackPage: 21 });
    expect(r.mount?.file).toBe("chapters/u1_c1.pdf"); // one file, no `_q`
    expect(r.initialPage).toBe(10); // 21 - 12 + 1
    expect(r.isQuestions).toBe(false); // the whole chapter slice is the mount
  });

  it("a citation page inside the chapter range beats the anchor intent", () => {
    const r = resolveChapterMount(mc1, { part: "questions", page: 15, fallbackPage: 15 });
    expect(r.mount?.file).toBe("chapters/u1_c1.pdf");
    expect(r.initialPage).toBe(4); // 15 - 12 + 1 — the citation wins
  });

  it("a page outside the chapter range lets the anchor intent win", () => {
    const r = resolveChapterMount(mc1, { part: "questions", page: 40, fallbackPage: 40 });
    expect(r.initialPage).toBe(10); // the anchor offset, not page 1
  });

  it("a merged chapter without an honest anchor has no jump", () => {
    const r = resolveChapterMount(mc3, { part: "questions", page: null, fallbackPage: 33 });
    expect(r.mount?.file).toBe("chapters/u1_c3.pdf");
    expect(r.initialPage).toBe(1);
    expect(r.isQuestions).toBe(false);
  });

  it("the plain chapter mount is unchanged (citation offsets, page-1 law)", () => {
    const r = resolveChapterMount(mc1, { part: undefined, page: 15, fallbackPage: 15 });
    expect(r.initialPage).toBe(4);
    const r2 = resolveChapterMount(mc1, { part: undefined, page: null, fallbackPage: 12 });
    expect(r2.initialPage).toBe(1);
  });
});

describe("clampPage", () => {
  it("clamps both ends", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});

describe("the v2 manifest law (133i — the boundary-corrected geometry)", () => {
  // the v2 of-record shape: corrected ranges, r2 republish names for the
  // re-cut slices, `supersedes` provenance; the v1 schema still parses above.
  const v2 = sliceManifestMirror.parse({
    schema: "book-slices-manifest-v2",
    book: {
      documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
      docVersion: 1,
      courseSlug: "igcse-chemistry-19",
      specKey: "pearson-edexcel/international-gcse/chemistry/4ch1",
    },
    slices: [
      entry({
        file: "chapters/u2_c11.r2.pdf",
        role: "lesson",
        chapterKey: "u2:c11",
        pdfRange: [131, 138],
        questionsStartPage: 138,
        supersedes: "chapters/u2_c11.pdf",
      }),
      entry({
        file: "units/u1_practice.r2.pdf",
        role: "unit_exam",
        chapterKey: "u1:xexam-practice",
        pdfRange: [123, 130],
        supersedes: "units/u1_practice.pdf",
      }),
    ],
  });
  const v2map = bookSliceMapOf(v2);

  it("parses the v2 schema literal", () => {
    expect(v2.slices).toHaveLength(2);
    expect(manifestMatchesBook(v2, {
      documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
      docVersion: 1,
      courseSlug: "igcse-chemistry-19",
    })).toBe(true);
  });

  it("mounts the r2 republish files (manifest-driven, no hub constant)", () => {
    expect(v2map.byChapter.get("u2:c11")?.mount.file).toBe("chapters/u2_c11.r2.pdf");
    expect(v2map.unitExam[0]!.file).toBe("units/u1_practice.r2.pdf");
  });

  it("the boundary-corrected unit span maps citations to the true offset", () => {
    // v1 span was [122,131] — p131 was the unit-2 opener carryover; v2 is
    // [123,130], so a p131 citation must NOT land in the unit slice
    const u1 = v2map.unitExam[0]!;
    expect(resolveUnitExamMount(u1, 123).initialPage).toBe(1);
    expect(resolveUnitExamMount(u1, 130).initialPage).toBe(u1.slicePages);
    expect(resolveUnitExamMount(u1, 131).initialPage).toBe(1); // outside span
    expect(resolveUnitExamMount(u1, 122).initialPage).toBe(1); // outside span
  });

  it("rejects a v3 schema (no silent forward drift)", () => {
    expect(
      sliceManifestMirror.safeParse({ ...v2, schema: "book-slices-manifest-v3" }).success,
    ).toBe(false);
  });
});

// ── T-BOOK-SERVE r1 — the no-parse manifest builders (shelf + registry) ─────

import { chaptersFromManifest, shelfEntryFromManifest } from "./books-slices";

const r1Manifest = sliceManifestMirror.parse({
  schema: "book-slices-manifest-v2",
  book: {
    documentId: "d9b72a0a-23fb-5938-a0a7-a7494e7ebf9e",
    docVersion: 1,
    courseSlug: "igcse-physics-19",
    specKey: "pearson-edexcel/international-gcse/physics/4ph1",
    title: "Edexcel International GCSE (9-1) Physics Student Book",
    author: "Brian Arnold, Penny Johnson, Steve Woolley",
    source: {
      archivePath: "books/pearson-edexcel/international-gcse/physics/4ph1/student-book.pdf",
      sha256: "9b0783d9fe99790a08255eb1f2ebb6eab5833c03ef8e36dd51b7643ac68a313a",
      pages: 308,
    },
    units: [
      { index: 1, title: "Forces and Motion" },
      { index: 2, title: "Electricity" },
    ],
  },
  slices: [
    entry({ file: "chapters/u1_c1.pdf", role: "lesson", chapterKey: "u1:c1", title: "Movement and position", pdfRange: [13, 27] }),
    entry({ file: "chapters/u1_c2.pdf", role: "lesson", chapterKey: "u1:c2", title: "Forces and shape", pdfRange: [28, 37] }),
    entry({ file: "chapters/u2_c1.pdf", role: "lesson", chapterKey: "u2:c1", title: "Magnetism", pdfRange: [60, 71] }),
    entry({ file: "units/u1_practice.pdf", role: "unit_exam", chapterKey: "u1:xexam-practice", pdfRange: [55, 59] }),
  ],
});

describe("manifest → shelf/registry builders (T-BOOK-SERVE r1)", () => {
  it("builds the shelf entry from the additive book block", () => {
    const e = shelfEntryFromManifest(r1Manifest);
    expect(e).not.toBeNull();
    expect(e!.documentId).toBe("d9b72a0a-23fb-5938-a0a7-a7494e7ebf9e");
    expect(e!.courseId).toBe("igcse-physics-19");
    expect(e!.title).toBe("Edexcel International GCSE (9-1) Physics Student Book");
    expect(e!.author).toBe("Brian Arnold, Penny Johnson, Steve Woolley");
    expect(e!.pages).toBe(308);
    expect(e!.checksum).toBe("9b0783d9fe99790a08255eb1f2ebb6eab5833c03ef8e36dd51b7643ac68a313a");
  });

  it("builds NO shelf entry without the title+source block (never a fabricated book)", () => {
    const bare = sliceManifestMirror.parse({
      schema: "book-slices-manifest-v1",
      book: {
        documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
        docVersion: 1,
        courseSlug: "igcse-chemistry-19",
        specKey: "pearson-edexcel/international-gcse/chemistry/4ch1",
      },
      slices: manifest.slices,
    });
    expect(shelfEntryFromManifest(bare)).toBeNull();
  });

  it("projects the lesson/whole slices onto the chapter registry (unit_exam excluded)", () => {
    const chs = chaptersFromManifest(r1Manifest);
    expect(chs).toHaveLength(3); // the unit_exam row is NOT a chapter
    expect(chs.map((c) => c.chapterIndex)).toEqual([1, 2, 3]); // global chapter_no ordinal
    expect(chs[0]!.chapterKey).toBe("u1:c1");
    expect(chs[2]!.chapterKey).toBe("u2:c1");
  });

  it("joins unit titles from the units block, honestly null when absent", () => {
    const chs = chaptersFromManifest(r1Manifest);
    expect(chs[0]!.unitIndex).toBe(1);
    expect(chs[0]!.unitTitle).toBe("Forces and Motion");
    expect(chs[2]!.unitIndex).toBe(2);
    expect(chs[2]!.unitTitle).toBe("Electricity");
    const untitled = chaptersFromManifest(manifest); // v1 fixture: no units block
    expect(untitled[0]!.unitTitle).toBeNull();
    expect(untitled[0]!.unitIndex).toBe(1);
  });

  it("carries the pdf coordinates and the honest DB-absent nulls", () => {
    const chs = chaptersFromManifest(r1Manifest);
    expect(chs[0]!.pdfPageStart).toBe(13);
    expect(chs[0]!.pdfPageEnd).toBe(27);
    expect(chs[0]!.bookPageStart).toBeNull();
    expect(chs[0]!.bookPageEnd).toBeNull();
    expect(chs[0]!.learningObjective).toBeNull();
    expect(chs[0]!.specCodes).toEqual([]);
    expect(chs[0]!.validationState).toBe("SUGGESTED");
  });
});

describe("T-BOOK-SERVE IAL — the units label law", () => {
  const ialManifest = (units: unknown[]) =>
    sliceManifestMirror.parse({
      schema: "book-slices-manifest-v2",
      book: {
        documentId: "7e6891e1-e41c-5eaf-8aa4-003baffc3907",
        docVersion: 1,
        courseSlug: "ial-physics-19",
        specKey: "pearson-edexcel/international-a-level/physics/yph11",
        title: "Pearson Edexcel International AS Level Physics Student Book 1",
        units,
      },
      slices: [
        entry({
          file: "sb1/chapters/u1_c1.pdf",
          role: "lesson",
          chapterKey: "u1:c1",
          pdfRange: [19, 44],
          questionsStartPage: 43,
        }),
      ],
    });

  it("projects the additive unit label into the chapter unitTitle when authored", () => {
    const m = ialManifest([{ index: 1, title: "Mechanics", label: "Topic 1 — Mechanics" }]);
    const chapters = chaptersFromManifest(m);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].unitIndex).toBe(1);
    expect(chapters[0].unitTitle).toBe("Topic 1 — Mechanics");
  });

  it("keeps the plain title when no label is authored (older manifests unchanged)", () => {
    const m = ialManifest([{ index: 1, title: "Mechanics" }]);
    expect(chaptersFromManifest(m)[0].unitTitle).toBe("Mechanics");
  });

  it("renders honestly bare when the manifest carries no units block", () => {
    const m = ialManifest([]);
    expect(chaptersFromManifest(m)[0].unitTitle).toBeNull();
  });
});
