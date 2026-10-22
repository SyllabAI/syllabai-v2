import { describe, expect, test } from "bun:test";

import {
  lessonPackSchema,
  lessonSectionSchema,
  lessonShelfEntrySchema,
} from "./books-lesson";

const section = {
  id: "u1:c01:s01",
  title: "States of matter — the particle idea",
  bookPage: 3,
  chunkRefs: ["chem_v3_u1_c1_pdf012_0022"],
  blockIds: [],
  glossarySlugs: ["particle-model"],
  specRefs: ["1.1"],
};

describe("lessonSectionSchema (r0.1)", () => {
  test("parses the T-BOOK-032 emitted shape with markdown", () => {
    const r = lessonSectionSchema.safeParse({ ...section, markdown: "Prose. :::key-point\nhi\n:::" });
    expect(r.success).toBe(true);
  });
  test("markdown is OPTIONAL (r0 packs without it still parse)", () => {
    expect(lessonSectionSchema.safeParse(section).success).toBe(true);
  });
  test("chunkRefs/specRefs keep their >=1 floors", () => {
    expect(lessonSectionSchema.safeParse({ ...section, chunkRefs: [] }).success).toBe(false);
    expect(lessonSectionSchema.safeParse({ ...section, specRefs: [] }).success).toBe(false);
  });
});

describe("lessonPackSchema", () => {
  const pack = {
    packId: "u1-c01-states-of-matter",
    chapterKey: "u1:c01",
    courseId: "igcse-chemistry-19",
    title: "States of matter",
    learningObjective: "Understand the three states of matter…",
    paperRoute: "core",
    sections: [{ ...section, markdown: "body" }],
    status: "draft",
    version: 1,
    sources: {
      bookOfRecord: "book.pdf (sha256 d4)",
      parseOfRecord: "chunks.jsonl (sha256 b2)",
      blockPackReceipt: null,
    },
    lintPack: "chem@0.1.0",
  };
  test("full r0.4 emit parses; status enum enforced", () => {
    expect(lessonPackSchema.safeParse(pack).success).toBe(true);
    expect(lessonPackSchema.safeParse({ ...pack, status: "published" }).success).toBe(true);
    expect(lessonPackSchema.safeParse({ ...pack, status: "live" }).success).toBe(false);
  });
  test("learningObjective is nullable but required", () => {
    expect(lessonPackSchema.safeParse({ ...pack, learningObjective: null }).success).toBe(true);
    expect(lessonPackSchema.safeParse({ ...pack, learningObjective: undefined }).success).toBe(false);
  });
});

describe("lessonShelfEntrySchema (T-C20 status-absent mirror)", () => {
  test("shape with blockCount 0 (blocks live in L3) parses", () => {
    expect(
      lessonShelfEntrySchema.safeParse({
        packId: "u1-c01-states-of-matter",
        chapterKey: "u1:c01",
        courseId: "igcse-chemistry-19",
        title: "States of matter",
        learningObjective: null,
        paperRoute: "core",
        sectionCount: 13,
        blockCount: 0,
        version: 1,
      }).success,
    ).toBe(true);
  });
});
