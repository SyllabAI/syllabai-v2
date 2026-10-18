import { describe, expect, test } from "bun:test";

import {
  bookChapterSchema,
  bookChunkSchema,
  bookTocCanonicalSchema,
  pageRangeSchema,
  specCodeRefSchema,
  BOOK_CONTENT_TYPES,
} from "./books.js";

/**
 * T-MIG-133 band 133a — fixtures are REAL rows from the package of record
 * (edexcel_igcse_chemistry_chunks_v3.jsonl, intake run-001), lightly
 * trimmed; the polished-chunk fixture mirrors the producer's
 * text_original + llm_repaired law.
 */
describe("books — the corpus package grammar (v3 of record)", () => {
  const frontMatterChunk = {
    id: "chem_v3_u0_c0_pdf001_0001",
    book_title: "Edexcel International GCSE (9-1) Chemistry Student Book",
    author: "Jim Clark",
    unit_no: null,
    unit_name: null,
    chapter_no: null,
    chapter_title: "Front matter (contents, about this book, assessment overview)",
    section: "CHEMISTRY",
    content_type: "front_matter",
    book_pages: null,
    pdf_pages: [1, 2],
    char_count: 152,
    text: "1:8\n\nEDEXCEL INTERNATIONAL GCSE (9–1)\n\nStudent Book",
  };

  const loChunk = {
    id: "chem_v3_u1_c1_pdf012_0023",
    book_title: "Edexcel International GCSE (9-1) Chemistry Student Book",
    author: "Jim Clark",
    unit_no: 1,
    unit_name: "Principles of Chemistry",
    chapter_no: 1,
    chapter_title: "States of matter",
    section: "LEARNING OBJECTIVES",
    content_type: "learning_objectives",
    book_pages: [3, 3],
    pdf_pages: [12, 12],
    char_count: 658,
    text: "LEARNING OBJECTIVES\n\n• Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
  };

  test("parses the front-matter chunk (null unit/chapter, null book_pages)", () => {
    const c = bookChunkSchema.parse(frontMatterChunk);
    expect(c.content_type).toBe("front_matter");
    expect(c.unit_no).toBeNull();
    expect(c.book_pages).toBeNull();
    expect(c.pdf_pages).toEqual([1, 2]);
  });

  test("parses a learning-objectives chunk with unit/chapter identity", () => {
    const c = bookChunkSchema.parse(loChunk);
    expect(c.unit_no).toBe(1);
    expect(c.chapter_no).toBe(1);
    expect(c.content_type).toBe("learning_objectives");
  });

  test("passthrough: unknown producer keys survive (ignoreUnknown law)", () => {
    const c = bookChunkSchema.parse({ ...loChunk, some_future_field: 1 });
    expect((c as Record<string, unknown>)["some_future_field"]).toBe(1);
  });

  test("rejects a content_type outside the censused 17-value enum", () => {
    expect(() => bookChunkSchema.parse({ ...loChunk, content_type: "speculative" })).toThrow();
    expect(BOOK_CONTENT_TYPES).toHaveLength(17);
  });

  test("polished chunk: text_original + llm_repaired ride through", () => {
    const c = bookChunkSchema.parse({
      ...loChunk,
      text: "polished text",
      text_original: "original text",
      llm_repaired: true,
    });
    expect(c.llm_repaired).toBe(true);
    expect(c.text_original).toBe("original text");
  });

  test("pageRange: [3,3] valid; [4,2] and singletons rejected", () => {
    expect(pageRangeSchema.parse([3, 3])).toEqual([3, 3]);
    expect(() => pageRangeSchema.parse([4, 2])).toThrow();
    expect(() => pageRangeSchema.parse([3])).toThrow();
  });
});

describe("books — the spec-join reference (content-maps grammar)", () => {
  test("parses the content-maps code shape (spineCode/tier/score/lineage/method)", () => {
    const ref = specCodeRefSchema.parse({
      spineCode: "1.5",
      officialCode: "1.5",
      officialId: "IAL_CHEMISTRY:Chemistry-1.5",
      score: 0.7934,
      spineExtra: undefined,
      tier: "S1_name_match",
      lineage: "upstream_item_join",
      method: "sme_spec_link_inherited",
      unit: "1",
    });
    expect(ref.spineCode).toBe("1.5");
    expect(ref.tier).toBe("S1_name_match");
  });

  test("requires tier + lineage + method (the provenance law)", () => {
    expect(() =>
      specCodeRefSchema.parse({ spineCode: "1.2", officialCode: "1.2" }),
    ).toThrow();
  });
});

describe("books — the canonical TOC + the serving row", () => {
  const toc = {
    schemaVersion: "book-toc-v1",
    bookId: "edexcel-igcse-chemistry-sb-2020",
    title: "Edexcel International GCSE (9-1) Chemistry Student Book",
    author: "Jim Clark, Steve Owen, Rachel Yu",
    qualification: "Pearson Edexcel International GCSE (9-1) Chemistry",
    pdfSha256: "d48020e0cc0b5545b330bb59b242472198210e424525e4381cd5d2a58a58cc04",
    pageCount: 383,
    parseRef: "rag_package:9efdd9d6:v3-docling",
    units: [
      {
        index: 1,
        title: "Principles of Chemistry",
        chapters: [
          {
            key: "u1:c1",
            index: 1,
            title: "States of matter",
            bookPages: [3, 8],
            pdfPages: [12, 22],
            learningObjective:
              "Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
          },
        ],
      },
    ],
  };

  test("bookTocCanonical parses the v1 shape with the intake checksums", () => {
    const t = bookTocCanonicalSchema.parse(toc);
    expect(t.units[0]!.chapters[0]!.pdfPages).toEqual([12, 22]);
    expect(t.pdfSha256).toHaveLength(64);
  });

  test("bookTocCanonical rejects a wrong schemaVersion and a non-sha256 checksum", () => {
    expect(() => bookTocCanonicalSchema.parse({ ...toc, schemaVersion: "book-toc-v2" })).toThrow();
    expect(() => bookTocCanonicalSchema.parse({ ...toc, pdfSha256: "abc" })).toThrow();
  });

  test("bookChapter (strict serving shape) parses and strips unknown keys", () => {
    const row = bookChapterSchema.parse({
      documentId: "edexcel-igcse-chemistry-sb-2020",
      docVersion: 1,
      courseId: "igcse-chemistry-19",
      unitIndex: 1,
      unitTitle: "Principles of Chemistry",
      chapterIndex: 1,
      chapterKey: "u1:c1",
      title: "States of matter",
      bookPageStart: 3,
      bookPageEnd: 8,
      pdfPageStart: 12,
      pdfPageEnd: 22,
      learningObjective: "Understand the three states of matter…",
      specCodes: [
        { spineCode: "1.1", officialCode: "1.1", tier: "S2_lo_verbatim", score: 0.98, lineage: "book_lo_join", method: "official_wording_norm_match" },
      ],
      validationState: "SUGGESTED",
      internal_only_field: true,
    });
    expect((row as Record<string, unknown>)["internal_only_field"]).toBeUndefined();
    expect(row.specCodes[0]!.tier).toBe("S2_lo_verbatim");
  });

  test("bookChapter rejects an out-of-enum validationState", () => {
    expect(() =>
      bookChapterSchema.parse({
        documentId: "x",
        docVersion: 1,
        courseId: "igcse-chemistry-19",
        unitIndex: null,
        unitTitle: null,
        chapterIndex: 1,
        chapterKey: "u1:c1",
        title: "T",
        bookPageStart: null,
        bookPageEnd: null,
        pdfPageStart: null,
        pdfPageEnd: null,
        learningObjective: null,
        specCodes: [],
        validationState: "MAYBE",
      }),
    ).toThrow();
  });
});
