import { describe, expect, test } from "bun:test";

import {
  bookChapterSchema,
  bookChunkSchema,
  bookTocCanonicalSchema,
  pageRangeSchema,
  specCodeRefSchema,
  BOOK_CONTENT_TYPES,
  type BookContentType,
  bookBlockSchema,
  bookGlossaryTermSchema,
  chapterProgressSchema,
  bookBlockTypeSchema,
  BOOK_BLOCK_TYPES,
  BOOK_BLOCK_GRAMMAR,
  ATTEMPT_PROVENANCE_BOOK_CHECK,
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

  test("rejects a content_type outside the censused 20-value enum", () => {
    expect(() => bookChunkSchema.parse({ ...loChunk, content_type: "speculative" })).toThrow();
    expect(BOOK_CONTENT_TYPES).toHaveLength(20);
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

  test("T-BOOK-025: the widened binds are unscored — null ≡ absent (F-BOOK-0003 r1)", () => {
    // the widened phase-2 attach carries NO matcher score; the jsonb of
    // record serializes that absence as explicit null (the 4CH1 of-record
    // rows carry exactly this shape on 11 refs, e.g. u4:c29) — the wall
    // must accept it, never 500 the chapters route over it.
    const widenedNull = specCodeRefSchema.parse({
      spineCode: "4CH1-2.24",
      officialCode: "2.24",
      tier: "2",
      score: null,
      lineage: "chem_v3_u4_c29_pdf262_0157#b4",
      method: "widened",
    });
    expect(widenedNull.method).toBe("widened");
    expect(widenedNull.score).toBeNull();
    // key absent stays the other honest unscored representation
    const widenedAbsent = specCodeRefSchema.parse({
      spineCode: "4CH1-2.25",
      officialCode: "2.25",
      tier: "2",
      lineage: "chem_v3_u4_c29_pdf262_0157#b5",
      method: "widened",
    });
    expect(widenedAbsent.score).toBeUndefined();
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

/**
 * T-BOOK-002 — the interactive rail grammar (book.block/1, ADR-BOOK-0001).
 * Fixtures are the FIRST authored blocks (c05 mole-ladder pack shape) — the
 * grammar's birth, so fixtures are hand-authored of record, chemistry real:
 * Mg Aᵣ = 24.3 (the F-BOOK-later class of fact the G3 gate exists for),
 * Cu²⁺ half-equation with charge balance, PhET sim ids from the public
 * chemistry catalog.
 */
describe("books — the interactive rail grammar (T-BOOK-002, book.block/1)", () => {
  const base = {
    documentId: "edexcel-igcse-chemistry-sb-2020",
    docVersion: 1,
    chapterKey: "u1:c5",
    ord: 1,
    pdfPageAnchor: 42,
    checkRefs: [] as string[],
    glossaryRefs: ["mole"] as string[],
    specPointRefs: ["1.28"] as string[],
    validationState: "SUGGESTED",
    version: 1,
  };

  test("11 frozen block types of record; a 12th type is an ADR, not a PR", () => {
    expect(BOOK_BLOCK_TYPES).toHaveLength(11);
    expect(BOOK_BLOCK_GRAMMAR).toBe("book.block/1");
    expect(() => bookBlockTypeSchema.parse("lesson")).toThrow();
  });

  test("callout (examiner-language) — the flagship type", () => {
    const b = bookBlockSchema.parse({
      ...base,
      id: "c05/b01",
      type: "callout",
      content: {
        body: "Say 'electrostatic attraction' — not 'attraction between atoms'.",
        kind: "examiner",
      },
    });
    expect(b.type).toBe("callout");
  });

  test("eq-builder — half-equation with charge-balance payload", () => {
    const b = bookBlockSchema.parse({
      ...base,
      id: "c10/b03",
      chapterKey: "u1:c10",
      specPointRefs: ["1.40C"],
      type: "eq-builder",
      content: { target: "Cu2+ + 2e- -> Cu", states: true, chargeBalance: true },
    });
    expect(b.type).toBe("eq-builder");
  });

  test("num-stepper — the mole ladder (real 4CH1 values)", () => {
    const b = bookBlockSchema.parse({
      ...base,
      id: "c05/b02",
      ord: 2,
      type: "num-stepper",
      content: {
        steps: [
          { prompt: "Mass of Mg (g)", answer: 2.43 },
          { prompt: "Aᵣ of Mg", answer: 24.3 },
          { prompt: "Moles of Mg", answer: 0.1, unit: "mol" },
        ],
      },
    });
    expect(b.type).toBe("num-stepper");
  });

  test("mcq-embed with bank checkRefs passes; empty checkRefs violates the bank law", () => {
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b04",
        ord: 4,
        type: "mcq-embed",
        content: {},
        checkRefs: ["q-4ch1-1c-2023-03"],
      }),
    ).not.toThrow();
    expect(() =>
      bookBlockSchema.parse({ ...base, id: "c05/b04", ord: 4, type: "mcq-embed", content: {} }),
    ).toThrow(/bank law/);
  });

  test("sim-embed — PhET only, fallback + attribution mandatory", () => {
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b05",
        ord: 5,
        type: "sim-embed",
        content: {
          provider: "phet",
          simId: "balancing-chemical-equations",
          title: "Balancing Chemical Equations",
          attribution: "CC-BY-4.0",
          fallbackUrl: "https://phet.colorado.edu/en/simulations/balancing-chemical-equations",
        },
      }),
    ).not.toThrow();
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b05",
        ord: 5,
        type: "sim-embed",
        content: {
          provider: "other-lab",
          simId: "x",
          title: "X",
          attribution: "CC-BY-4.0",
          fallbackUrl: "https://example.com/x",
        },
      }),
    ).toThrow();
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b05",
        ord: 5,
        type: "sim-embed",
        content: { provider: "phet", simId: "isotopes-and-atomic-mass", title: "Isotopes", attribution: "CC-BY-4.0" },
      }),
    ).toThrow(); // no fallbackUrl — CSP fallback is mandatory
  });

  test("media-embed without a licensing row is rejected (licensing-as-serving-law)", () => {
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b06",
        ord: 6,
        type: "media-embed",
        content: { title: "Electrolysis walkthrough", url: "https://example.com/v" },
      }),
    ).toThrow();
  });

  test("media-embed payload law — sourceId required (ADR-BOOK-0002 decision 1)", () => {
    // no sourceId — resolve law requires it even with a licensing row present
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c01/b08",
        ord: 8,
        type: "media-embed",
        content: {
          title: "States of Matter & Changing State",
          url: "https://cognito.org/courses/gcse/chemistry-triple/iedexcel/notes/UFJRRHluWEk/1.1-states-of-matter-changing-state",
          licenseRef: "media-sources.yaml#cog-1-1-states-of-matter-changing-state",
        },
      }),
    ).toThrow();
    // with sourceId + licenseRef the payload parses (youtubeId rides passthrough)
    const r = bookBlockSchema.safeParse({
      ...base,
      id: "c01/b08",
      ord: 8,
      type: "media-embed",
      content: {
        title: "States of Matter & Changing State",
        url: "https://cognito.org/courses/gcse/chemistry-triple/iedexcel/notes/UFJRRHluWEk/1.1-states-of-matter-changing-state",
        sourceId: "cog-1-1-states-of-matter-changing-state",
        youtubeId: "hkBrw2fG75U",
        licenseRef: "media-sources.yaml#cog-1-1-states-of-matter-changing-state",
      },
    });
    expect(r.success).toBe(true);
  });

  test("eq-builder payload law — missing target fails superRefine on content", () => {
    const r = bookBlockSchema.safeParse({
      ...base,
      id: "c05/b07",
      ord: 7,
      type: "eq-builder",
      content: { states: true },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "content");
      expect(issue?.message).toContain("eq-builder payload law");
    }
  });

  test("sort-match needs >= 2 items; envelope law holds (ord > 0, 4-state review)", () => {
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c16/b01",
        chapterKey: "u2:c16",
        type: "sort-match",
        content: { items: [{ id: "s1", text: " rinse burette with acid" }] },
      }),
    ).toThrow();
    expect(() =>
      bookBlockSchema.parse({ ...base, id: "c05/b01", type: "callout", content: { body: "x" }, ord: 0 }),
    ).toThrow();
    expect(() =>
      bookBlockSchema.parse({
        ...base,
        id: "c05/b01",
        type: "callout",
        content: { body: "x" },
        validationState: "AUTO_GRADED",
      }),
    ).toThrow();
  });

  test("glossary term — ms_accepts/ms_avoids layer + kebab-case slug law", () => {
    expect(() =>
      bookGlossaryTermSchema.parse({
        subjectCode: "4CH1",
        term: "electrostatic attraction",
        slug: "electrostatic-attraction",
        definition: "The strong electrostatic attraction between ions and delocalised electrons.",
        msAccepts: ["electrostatic attraction between ions and delocalised electrons"],
        msAvoids: ["free electrons", "sea of electrons (unqualified)"],
        aliases: ["electrostatic forces"],
        audioUrl: null,
        translations: null,
      }),
    ).not.toThrow();
    expect(() =>
      bookGlossaryTermSchema.parse({
        subjectCode: "4CH1",
        term: "mole",
        slug: "the_mole",
        definition: "x",
        msAccepts: [],
        msAvoids: [],
        aliases: [],
        audioUrl: null,
        translations: null,
      }),
    ).toThrow(/kebab-case/);
  });

  test("chapter_progress — the only new persisted user signal (0-100 pct, uuid user)", () => {
    expect(() =>
      chapterProgressSchema.parse({
        userId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        documentId: "edexcel-igcse-chemistry-sb-2020",
        chapterKey: "u1:c5",
        railScrolledPct: 64,
        lastOrd: 3,
        updatedAt: "2026-10-21T10:00:00Z",
      }),
    ).not.toThrow();
    expect(() =>
      chapterProgressSchema.parse({
        userId: "not-a-uuid",
        documentId: "d",
        chapterKey: "u1:c5",
        railScrolledPct: 50,
        lastOrd: null,
        updatedAt: "2026-10-21T10:00:00Z",
      }),
    ).toThrow();
    expect(() =>
      chapterProgressSchema.parse({
        userId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        documentId: "d",
        chapterKey: "u1:c5",
        railScrolledPct: 101,
        lastOrd: null,
        updatedAt: "2026-10-21T10:00:00Z",
      }),
    ).toThrow();
  });

  test("attempts discriminator is the app-level constant — zero DDL (ADR-BOOK-0001 §12)", () => {
    expect(ATTEMPT_PROVENANCE_BOOK_CHECK).toBe("BOOK_CHECK");
  });
});

// ── T-MIG-134 band 134e readiness (2026-10-21) — the physics 4PH1 census ────
// Fixtures are REAL rows from the package of record
// (books/pearson-edexcel/international-gcse/physics/4ph1/parsed/
//  edexcel_igcse_physics_chunks_v1.jsonl, sha-pinned 9b0783d9… in
//  parse_report_v1.json), lightly trimmed — the 133a fixture law.
describe("books — the physics 4PH1 print census (the additive widening)", () => {
  const workedExampleChunk = {
    id: "phys_v1_u1_c1_pdf019_0046",
    book_title: "Edexcel International GCSE (9-1) Physics Student Book",
    author: "Brian Arnold, Penny Johnson, Steve Woolley",
    unit_no: 1,
    unit_name: "Forces and Motion",
    chapter_no: 1,
    chapter_title: "Movement and position",
    section: "EXAMPLE2",
    content_type: "worked_example",
    book_pages: [9, 11],
    pdf_pages: [19, 21],
    char_count: 1499,
    text: "EXAMPLE2\n\nA car is travelling along a motorway…",
  };

  const extensionWorkChunk = {
    ...workedExampleChunk,
    id: "phys_v1_u1_c2_pdf032_0068",
    chapter_no: 2,
    chapter_title: "Forces and shape",
    section: "EXTENSION WORK",
    content_type: "extension_work",
    book_pages: [22, 23],
    pdf_pages: [32, 33],
    char_count: 528,
    text: "EXTENSION WORK\n\nYou have probably noticed that it is easier…",
  };

  const practicalChunk = {
    ...workedExampleChunk,
    id: "phys_v1_u1_c2_pdf034_0072",
    chapter_no: 2,
    chapter_title: "Forces and shape",
    section: "PRACTICAL:INVESTIGATEHOWTHEEXTENSION OFA SPRINGCHANGESWITHLOAD",
    content_type: "practical",
    book_pages: [24, 25],
    pdf_pages: [34, 35],
    char_count: 803,
    text: "PRACTICAL: INVESTIGATE HOW THE EXTENSION OF A SPRING CHANGES WITH LOAD…",
  };

  test("worked_example parses (physics printed section, the 18th value)", () => {
    const c = bookChunkSchema.parse(workedExampleChunk);
    expect(c.content_type).toBe("worked_example");
    expect(c.book_pages).toEqual([9, 11]);
  });

  test("extension_work parses (physics printed section, the 19th value)", () => {
    const c = bookChunkSchema.parse(extensionWorkChunk);
    expect(c.content_type).toBe("extension_work");
  });

  test("practical parses (physics printed section, the 20th value)", () => {
    const c = bookChunkSchema.parse(practicalChunk);
    expect(c.content_type).toBe("practical");
  });

  test("the widening is additive — every chemistry value unchanged", () => {
    for (const v of [
      "body",
      "key_point",
      "table_data",
      "exam_hint",
      "answers",
      "learning_objectives",
      "chapter_questions",
      "safety",
      "appendix",
      "unit_questions",
      "glossary",
      "did_you_know",
      "front_matter",
      "index",
      "divider",
      "skills",
      "activity",
    ] as BookContentType[]) {
      expect(BOOK_CONTENT_TYPES).toContain(v);
    }
  });
});
