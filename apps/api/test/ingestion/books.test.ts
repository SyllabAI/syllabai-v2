/**
 * T-MIG-133 band 133b (r0) — the Student Books ingestion unit gates:
 * LO→spine join engine (verbatim / folded-sub / fuzzy / review lanes),
 * TOC derivation (units, chapters, both page numberings, group law,
 * exclusions), the synthetic canonical document (violations-clean,
 * derived identity, group map) and the chunking smoke (group-boundary +
 * header law through the FROZEN ChunkingService — zero forks).
 *
 * Fixtures are SYNTHETIC (mini v3 rows + a 3-point spine built from the
 * in-repo spine's own wording shapes) — no book text is reproduced here;
 * the real-book legs are receipted from the Neon runs, not unit tests.
 */
import { describe, expect, it } from "bun:test";
import {
  bookChunkSchema,
  derivedDocumentId,
  type BookChunk,
} from "@syllabai/contracts";
import {
  joinChapterLearningObjectives,
  matchBullet,
  normalizeStatement,
  splitBullets,
  type SpinePoint,
} from "../../src/services/ingestion/books/spine-join";
import { deriveToc, groupKeyOf } from "../../src/services/ingestion/books/toc";
import { buildCanonicalDocument } from "../../src/services/ingestion/books/canonical-doc";
import { chunkCanonicalDocument } from "../../src/services/ingestion/chunking";

const SPINE: SpinePoint[] = [
  {
    code: "4CH1-1.1",
    officialCode: "1.1",
    wording:
      "understand the three states of matter in terms of the arrangement, movement and energy of the particles",
    globalOrder: 1,
  },
  {
    code: "4CH1-1.2",
    officialCode: "1.2",
    wording:
      "understand the interconversions between the three states of matter in terms of: the names of the interconversions, how they are achieved, the changes in arrangement, movement and energy of the particles",
    globalOrder: 2,
  },
  {
    code: "4CH1-2.10",
    officialCode: "2.10",
    wording:
      "describe the arrangement, movement and energy of particles in each of the three states of matter: solid, liquid and gas",
    globalOrder: 3,
  },
];

function chunk(partial: Partial<BookChunk> & { id: string; text: string }): BookChunk {
  return bookChunkSchema.parse({
    book_title: "Edexcel International GCSE Chemistry Student Book",
    author: "Test Author",
    unit_no: null,
    unit_name: null,
    chapter_no: null,
    chapter_title: "Front matter (contents, about this book, assessment overview)",
    section: null,
    content_type: "body",
    book_pages: null,
    pdf_pages: [1, 1],
    char_count: partial.text.length,
    ...partial, // carries id + text (both required by the helper signature); explicit keys dropped to avoid the TS2783 double-specification
  });
}

describe("t-mig-133 books — normalizeStatement", () => {
  it("folds punctuation, unicode dashes and whitespace", () => {
    expect(normalizeStatement("Understand the three states of matter — in terms of: the arrangement!"))
      .toBe("understand the three states of matter in terms of the arrangement");
  });
});

describe("t-mig-133 books — splitBullets", () => {
  it("drops the header, folds sub-bullets into their top-level bullet", () => {
    const text = [
      "LEARNING OBJECTIVES",
      "• Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
      "• Understand the interconversions between the three states of matter in terms of:",
      "• the names of the interconversions",
      "• how they are achieved",
      "• the changes in arrangement, movement and energy of the particles",
    ].join("\n\n");
    const bullets = splitBullets(text);
    expect(bullets).toHaveLength(2);
    expect(bullets[0]!.subs).toHaveLength(0);
    expect(bullets[1]!.subs).toHaveLength(3);
    expect(bullets[1]!.matchText).toContain("the names of the interconversions");
    expect(bullets[1]!.matchText).toContain("how they are achieved");
  });
});

describe("t-mig-133 books — matchBullet", () => {
  it("verbatim-class match lands tier 1 with the content-maps provenance", () => {
    const bullet = splitBullets(
      "• Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
    )[0]!;
    const { ref, best } = matchBullet(bullet, SPINE, "chem_v3_u1_c1_pdf012_0023");
    expect(ref).not.toBeNull();
    expect(ref!.spineCode).toBe("4CH1-1.1");
    expect(ref!.officialCode).toBe("1.1");
    expect(ref!.tier).toBe("1");
    expect(ref!.method).toBe("verbatim");
    expect(ref!.score).toBe(1);
    expect(ref!.lineage).toBe("lo:chem_v3_u1_c1_pdf012_0023#b1");
    expect(best).toBeNull();
  });

  it("folded sub-bullets still land verbatim-class (the 1.2 shape)", () => {
    const bullet = splitBullets(
      [
        "• Understand the interconversions between the three states of matter in terms of:",
        "• the names of the interconversions",
        "• how they are achieved",
        "• the changes in arrangement, movement and energy of the particles",
      ].join("\n\n"),
    )[0]!;
    const { ref } = matchBullet(bullet, SPINE, "lo1");
    expect(ref).not.toBeNull();
    expect(ref!.spineCode).toBe("4CH1-1.2");
    expect(["1", "2"]).toContain(ref!.tier);
  });

  it("an unrelated bullet goes to the REVIEW lane with its near-miss", () => {
    const bullet = splitBullets("• Practical: investigate how paper chromatography can be used to separate and identify mixtures")[0]!;
    const { ref, best } = matchBullet(bullet, SPINE, "lo2");
    expect(ref).toBeNull();
    expect(best).not.toBeNull();
    expect(best!.score).toBeLessThan(0.75);
  });
});

describe("t-mig-133 books — joinChapterLearningObjectives", () => {
  it("dedupes repeated LO boxes, sorts refs by official code, keeps review lane", () => {
    const loText = [
      "LEARNING OBJECTIVES",
      "• Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
      "• Practical: measure the rate of a reaction by collecting gas",
    ].join("\n\n");
    const joined = joinChapterLearningObjectives(loText, "loX", SPINE);
    expect(joined.refs).toHaveLength(1);
    expect(joined.refs[0]!.officialCode).toBe("1.1");
    expect(joined.matchedBullets).toBe(1);
    expect(joined.review).toHaveLength(1);
    expect(joined.review[0]!.text).toContain("rate of a reaction");
  });
});

describe("t-mig-133 books — deriveToc", () => {
  const rows: BookChunk[] = [
    chunk({ id: "r_front_1", text: "contents", content_type: "front_matter", pdf_pages: [1, 2] }),
    chunk({ id: "r_idx_1", text: "index entries", content_type: "index", pdf_pages: [20, 20] }),
    chunk({ id: "r_div_1", text: "unit divider", chapter_title: "Unit 1 divider and chapter map", unit_no: 1, unit_name: "Principles of Chemistry", pdf_pages: [3, 3] }),
    chunk({
      id: "r_c1_lo", text: "LEARNING OBJECTIVES\n\n• Understand the three states of matter in terms of the arrangement, movement and energy of the particles",
      content_type: "learning_objectives", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: 1, chapter_title: "States of matter",
      book_pages: [3, 3], pdf_pages: [4, 4],
    }),
    chunk({
      id: "r_c1_body", text: "Solids keep their shape. The particles vibrate about fixed positions.",
      content_type: "body", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: 1, chapter_title: "States of matter",
      book_pages: [4, 5], pdf_pages: [5, 6],
    }),
    chunk({
      id: "r_c2_body", text: "Elements contain one kind of atom.",
      content_type: "body", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: 2, chapter_title: "Elements, compounds and mixtures",
      book_pages: [14, 14], pdf_pages: [23, 23],
    }),
    chunk({
      id: "r_equ_1", text: "1 (a) Name the three states of matter.",
      content_type: "unit_questions", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: null,
      chapter_title: "Unit 1: end-of-unit questions", book_pages: [114, 114], pdf_pages: [123, 123],
    }),
  ];

  it("derives units, chapters, page spans, LO text and the group stream", () => {
    const build = deriveToc(rows, {
      bookId: derivedDocumentId("d".repeat(64), "ibm-docling", "v3"),
      pdfSha256: "d".repeat(64),
      pageCount: 383,
      parseRef: "edexcel_igcse_chemistry_chunks_v3.jsonl",
    });
    expect(build.toc.units).toHaveLength(1);
    expect(build.toc.units[0]!.chapters).toHaveLength(2);
    const c1 = build.toc.units[0]!.chapters[0]!;
    expect(c1.key).toBe("u1:c1");
    expect(c1.pdfPages).toEqual([4, 6]);
    expect(c1.bookPages).toEqual([3, 5]);
    expect(c1.learningObjective).toContain("three states of matter");
    // exclusions counted, never silent
    expect(build.excluded.byType["front_matter"]).toBe(1);
    expect(build.excluded.byType["index"]).toBe(1);
    expect(build.excluded.byGroup["Unit 1 divider and chapter map"]).toBe(1);
    // group stream: chapters + structural groups, hard boundaries
    const keys = build.includedGroupKeys.map((g) => g.groupKey);
    expect(keys).toContain("u1:c1");
    expect(keys).toContain("u1:c2");
    expect(keys).toContain("u1:xunit-1-end-of-unit-questions");
    expect(groupKeyOf(rows[3]!)).toBe("u1:c1");
  });
});

describe("t-mig-133 books — buildCanonicalDocument", () => {
  const rows: BookChunk[] = [
    chunk({
      id: "r_c1_body", text: "Solids keep their shape. The particles vibrate about fixed positions.",
      content_type: "body", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: 1, chapter_title: "States of matter",
      book_pages: [4, 5], pdf_pages: [5, 6],
    }),
    chunk({
      id: "r_c2_body", text: "Elements contain one kind of atom.",
      content_type: "body", unit_no: 1, unit_name: "Principles of Chemistry", chapter_no: 2, chapter_title: "Elements, compounds and mixtures",
      book_pages: [14, 14], pdf_pages: [23, 23],
    }),
  ];

  it("is violations-clean with the derived identity and the group map", () => {
    const build = buildCanonicalDocument({
      rows,
      checksum: "a".repeat(64),
      uri: "archive:books/igcse-chemistry-19/chemistry_book.pdf",
      fileName: "chemistry_book.pdf",
      pageCount: 383,
      subjectTitle: "Chemistry",
      subjectCode: "CHM",
      label: "Edexcel IGCSE Student Book",
      engine: "ibm-docling",
      engineVersion: "v3",
    });
    expect(build.documentId).toBe(derivedDocumentId("a".repeat(64), "ibm-docling", "v3"));
    expect(build.doc.documentId).toBe(build.documentId);
    expect(build.doc.schemaVersion).toBe("1.0");
    expect(build.doc.textBlocks).toHaveLength(2);
    expect(build.groupByElementId.get("r_c1_body")).toBe("u1:c1");
    expect(build.groupByElementId.get("r_c2_body")).toBe("u1:c2");
    expect(build.doc.retrieval?.subjectCode).toBe("CHM");
  });

  it("chunks through the FROZEN ChunkingService with hard group boundaries", () => {
    const build = buildCanonicalDocument({
      rows,
      checksum: "a".repeat(64),
      uri: "archive:books/igcse-chemistry-19/chemistry_book.pdf",
      fileName: "chemistry_book.pdf",
      pageCount: 383,
      subjectTitle: "Chemistry",
      subjectCode: "CHM",
      label: "Edexcel IGCSE Student Book",
      engine: "ibm-docling",
      engineVersion: "v3",
    });
    const drafts = chunkCanonicalDocument(build.doc, "TEXTBOOK");
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    for (const draft of drafts) {
      // every draft stays inside ONE group (chapter) — the atom-boundary law
      const groups = new Set(draft.elementIds.map((id) => build.groupByElementId.get(id)));
      expect(groups.size).toBe(1);
      // the header law: subject + label + pages tail
      expect(draft.header).toContain("Chemistry CHM");
      expect(draft.header).toContain("Edexcel IGCSE Student Book");
      expect(draft.header).toMatch(/pp?\.\d+/);
    }
  });
});

describe("t-mig-133 band 133f — the qualification parameter (second-subject TOC law)", () => {
  const rows: BookChunk[] = [
    chunk({
      id: "r_q_1", text: "LEARNING OBJECTIVES\n\n• Understand and use integers (positive, negative and zero)",
      content_type: "learning_objectives", unit_no: 1, unit_name: "Numbers and the number system",
      chapter_no: 1, chapter_title: "Integers", book_pages: [2, 2], pdf_pages: [14, 14],
    }),
    chunk({
      id: "r_q_2", text: "Place value decides what each digit is worth.",
      content_type: "body", unit_no: 1, unit_name: "Numbers and the number system",
      chapter_no: 1, chapter_title: "Integers", book_pages: [3, 3], pdf_pages: [15, 15],
    }),
  ];

  it("DEFAULT preserves the 133b chemistry qualification byte-identically", () => {
    const build = deriveToc(rows, {
      bookId: derivedDocumentId("e".repeat(64), "ibm-docling", "v3"),
      pdfSha256: "e".repeat(64),
      pageCount: 383,
      parseRef: "edexcel_igcse_chemistry_chunks_v3.jsonl",
    });
    expect(build.toc.qualification).toBe("Pearson Edexcel International GCSE (9-1) Chemistry");
  });

  it("EXPLICIT qualification rides through for a second subject (4MA1 mirror)", () => {
    const build = deriveToc(rows, {
      bookId: derivedDocumentId("f".repeat(64), "ibm-docling", "v3"),
      pdfSha256: "f".repeat(64),
      pageCount: 383,
      parseRef: "fixture:maths-a-dry-run",
      qualification: "Pearson Edexcel International GCSE (9-1) Mathematics A",
    });
    expect(build.toc.qualification).toBe("Pearson Edexcel International GCSE (9-1) Mathematics A");
  });
});
