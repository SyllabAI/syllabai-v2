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

describe("clampPage", () => {
  it("clamps both ends", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});
