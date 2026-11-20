/**
 * T-QA-ORG-001 — the SME selector-mirror laws.
 *
 * P1: SME section display numbers are the 1-based POSITION (the SME picker's
 * own numbering), never the raw corpus node order — the order field continues
 * after the official topics, which numbered the notes selector "11. Number"
 * (maths-b) / "38. 1. Atomic Structure" (chem-25) while the sidebar beside
 * the same notes showed 1-10 / 1-37.
 *
 * P2: buildSmeSidebar — the sidebar data for the mirror view: rows resolve
 * 1:1 from the corpus topicSlugs, counts account for EVERY note (the
 * official-spine sidebar undercounted — bridged notes have no official
 * home), and the row-link policy mirrors the official plane's D3 law
 * (single-set rows deep-link; multi-set rows land on the grouped view).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "@/lib/contracts";
import { buildSmeSidebar, buildSpecTreeIndex, smeRowOfNote } from "@/lib/spec-tree";

/** Official topics (orders 1-2) then the SME picker layer (orders 3-5): the
 * corpus order field continues after the official topics — the P1 bug's
 * exact shape. */
const CURRICULUM = {
  code: "TQA1",
  subject: "Test Subject",
  syllabusVersion: "test",
  board: "Test",
  level: "L1",
  edges: [],
  nodes: [
    { code: "TQA1", family: "SUBJECT", title: "Test Subject", order: 0, parents: [] },
    { code: "TQA1-T1", family: "TOPIC", title: "Official one", order: 1, parents: ["TQA1"] },
    { code: "TQA1-T1:SUB1.1", family: "SUBTOPIC", title: "Official sub", order: 1, parents: ["TQA1-T1"] },
    { code: "TQA1-T2", family: "TOPIC", title: "Official two", order: 2, parents: ["TQA1"] },
    { code: "TQA1-SME-S1", family: "TOPIC", title: "Number", order: 3, parents: ["TQA1"], smeSectionSlug: "s1" },
    { code: "TQA1-SME-S1:number", family: "SUBTOPIC", title: "Number", order: 3, parents: ["TQA1-SME-S1"] },
    { code: "TQA1-SME-S2", family: "TOPIC", title: "Algebra", order: 4, parents: ["TQA1"], smeSectionSlug: "s2" },
    { code: "TQA1-SME-S2:algebra", family: "SUBTOPIC", title: "Algebra", order: 4, parents: ["TQA1-SME-S2"] },
    { code: "TQA1-SME-S3", family: "TOPIC", title: "Geometry", order: 5, parents: ["TQA1"], smeSectionSlug: "s3" },
    { code: "TQA1-SME-S3:geometry", family: "SUBTOPIC", title: "Geometry", order: 5, parents: ["TQA1-SME-S3"] },
    { code: "TQA1-SME-S3:circles", family: "SUBTOPIC", title: "Circles", order: 6, parents: ["TQA1-SME-S3"] },
  ],
} as unknown as Curriculum;

const index = buildSpecTreeIndex(CURRICULUM);

const note = (id: string, topicSlug?: string, sectionSlug?: string) =>
  ({
    noteId: id,
    title: `Note ${id}`,
    sourceUrl: null,
    specPointIds: [],
    specPointCodes: [],
    guidedStudy: false,
    path: null,
    updatedAt: "2026-01-01",
    bodyMd: "",
    topicSlug,
    sectionSlug,
  }) as RevisionNote;

const set = (slug: string, topicSlug: string, qCount = 0, sectionSlug?: string) =>
  ({
    topicId: `t_${slug}`,
    slug,
    name: `Set ${slug}`,
    topicSlug,
    sectionSlug,
    section: "",
    questions: Array.from({ length: qCount }, () => ({})),
  }) as unknown as ExamQuestionTopic;

describe("P1: SME section display numbering is position-based", () => {
  test("smeSections number 1..N by position, NOT by corpus order", () => {
    expect(index.tree.smeSections?.map((s) => s.number)).toEqual([1, 2, 3]);
  });
  test("the official spine keeps its position numbering", () => {
    expect(index.tree.topics.map((t) => t.number)).toEqual([1, 2]);
  });
  test("the SME sections are excluded from the official spine", () => {
    expect(index.tree.topics.every((t) => !t.code.includes("-SME-"))).toBe(true);
  });
});

describe("P2: smeRowOfNote — the 1:1 corpus-slug join", () => {
  test("a note's topicSlug resolves to its SME row", () => {
    expect(smeRowOfNote(note("rn_1", "number") as never, index)).toBe("TQA1-SME-S1:number");
  });
  test("sectionSlug disambiguates duplicated row slugs", () => {
    expect(smeRowOfNote(note("rn_2", "algebra", "s2") as never, index)).toBe("TQA1-SME-S2:algebra");
  });
  test("a note without a slug has no row (null, never guessed)", () => {
    expect(smeRowOfNote(note("rn_3") as never, index)).toBeNull();
  });
});

describe("P2: buildSmeSidebar — counts, expander lists, row-link policy", () => {
  const notes = [
    note("rn_a", "number"), // first on the number row → its canonical href
    note("rn_b", "number"),
    note("rn_c", "geometry"),
    note("rn_unplaced"), // no slug → invisible in the mirror rows, noteRow null
  ];
  const sets = [
    set("q-single", "circles", 5), // the circles row holds exactly one set → deep link
    set("q-multi-1", "geometry", 4),
    set("q-multi-2", "geometry", 3), // the geometry row holds two sets → grouped view (4+3=7)
  ];
  const bar = buildSmeSidebar(index.tree.smeSections, notes, sets, "/courses/tqa1");

  test("undefined on non-layered courses (no SME sections)", () => {
    const officialOnly = buildSpecTreeIndex({
      ...CURRICULUM,
      nodes: CURRICULUM.nodes.filter((n) => !String((n as { code: string }).code).includes("-SME-")),
    } as unknown as Curriculum);
    expect(buildSmeSidebar(officialOnly.tree.smeSections, [], [], "/courses/x")).toBeUndefined();
    expect(buildSmeSidebar(undefined, [], [], "/courses/x")).toBeUndefined();
  });

  test("noteRow maps every note — placed rows AND honest nulls", () => {
    expect(bar?.noteRow["rn_a"]).toBe("TQA1-SME-S1:number");
    expect(bar?.noteRow["rn_b"]).toBe("TQA1-SME-S1:number");
    expect(bar?.noteRow["rn_c"]).toBe("TQA1-SME-S3:geometry");
    expect(bar?.noteRow["rn_unplaced"]).toBeNull();
  });

  test("row counts account for every note (the undercount fix)", () => {
    expect(bar?.counts["TQA1-SME-S1:number"].notes).toBe(2);
    expect(bar?.counts["TQA1-SME-S3:geometry"].notes).toBe(1);
    expect(bar?.counts["TQA1-SME-S3:circles"].questions).toBe(5);
  });

  test("the expander lists every note on its row, corpus order", () => {
    expect(bar?.notesByRow["TQA1-SME-S1:number"].map((n) => n.noteId)).toEqual(["rn_a", "rn_b"]);
  });

  test("row hrefs: first-write wins (corpus order)", () => {
    expect(bar?.hrefs.notes["TQA1-SME-S1:number"]).toBe("/courses/tqa1/revision-notes/rn_a");
  });

  test("row-link policy: single-set rows deep-link, multi-set rows go grouped", () => {
    expect(bar?.hrefs.questions["TQA1-SME-S3:circles"]).toBe("/courses/tqa1/exam-questions/q-single");
    expect(bar?.hrefs.questions["TQA1-SME-S3:geometry"]).toBe(
      "/courses/tqa1/exam-questions?subtopic=TQA1-SME-S3%3Ageometry",
    );
  });

  test("question counts aggregate every set on the row (D3 law)", () => {
    expect(bar?.counts["TQA1-SME-S3:geometry"].questions).toBe(7);
    expect(bar?.setsByRow["TQA1-SME-S3:geometry"].map((s) => s.slug)).toEqual(["q-multi-1", "q-multi-2"]);
  });
});

describe("P3: duplicate sibling titles are qualified (n of k)", () => {
  // lit-21's real shape: verbatim-colliding titles on the official spine
  // ("Section A: Poetry" x6 across the 2023/2024/2025 set-text rotation).
  // T2 collides with T1; SME-S3 collides with SME-S1 ("Number").
  const dupNodes = CURRICULUM.nodes.map((n) => {
    const code = String((n as { code: string }).code);
    if (code === "TQA1-T2") return { ...n, title: "Official one" };
    if (code === "TQA1-SME-S3") return { ...n, title: "Number" };
    return n;
  });
  const dupIndex = buildSpecTreeIndex({ ...CURRICULUM, nodes: dupNodes } as unknown as Curriculum);

  test("colliding official titles get an honest ordinal; unique titles untouched", () => {
    expect(dupIndex.tree.topics.map((t) => t.title)).toEqual([
      "Official one (1 of 2)",
      "Official one (2 of 2)",
    ]);
    const base = buildSpecTreeIndex(CURRICULUM);
    expect(base.tree.topics.map((t) => t.title)).toEqual(["Official one", "Official two"]);
  });

  test("the SME picker layer qualifies collisions too (numbers stay positional)", () => {
    expect(dupIndex.tree.smeSections?.map((s) => s.title)).toEqual([
      "Number (1 of 2)",
      "Algebra",
      "Number (2 of 2)",
    ]);
    expect(dupIndex.tree.smeSections?.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  test("codes are never touched — deep links stay stable", () => {
    expect(dupIndex.tree.topics.map((t) => t.code)).toEqual(["TQA1-T1", "TQA1-T2"]);
    expect(dupIndex.subtopicByCode.has("TQA1-SME-S3:geometry")).toBe(true);
    expect(dupIndex.topicByCode.get("TQA1-SME-S3")?.title).toBe("Number (2 of 2)");
  });
});

describe("P3 on the REAL lit-21 bundle: colliding official titles become unique", () => {
  const lit21Path = join(import.meta.dir, "../../../content/cie-igcse-english-literature-21/curriculum.json");
  const lit21 = buildSpecTreeIndex(JSON.parse(readFileSync(lit21Path, "utf8")) as unknown as Curriculum);

  test("no two rendered official rows share a title after qualification", () => {
    const official = lit21.tree.topics; // SME sections are excluded from the official spine
    const titles = official.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles[0]).toBe("Section A: Poetry (1 of 6)");
    expect(titles.filter((t) => t.startsWith("Section A: Poetry")).length).toBe(6);
  });

  test("the SME picker layer's titles stay unique (no collisions there)", () => {
    const sme = lit21.tree.smeSections?.map((s) => s.title) ?? [];
    expect(sme.length).toBeGreaterThan(0);
    expect(new Set(sme).size).toBe(sme.length);
  });
});
