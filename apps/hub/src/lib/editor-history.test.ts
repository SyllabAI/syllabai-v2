/**
 * Editor edit-history tests — ADR-044 Phase 1. The three pure laws of
 * record (see editor-history.ts): the bank path law (verified against the
 * corpus families of record), the content anchor law (the hub question's
 * corpus region found BY CONTENT — the ordinal mapping is proven wrong and
 * must never be used), and the hunk law (a commit touches the question iff
 * its diff's NEW ranges intersect the anchor region).
 *
 * editor-history is a server module (import "server-only"); the package is
 * a Next.js build-time stub absent from the bun-test module graph — shim it
 * BEFORE the module under test loads (the books-lesson.test.ts law).
 *
 * Run: bun test apps/hub/src/lib/editor-history.test.ts
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  corpusBankPathOfRecord,
  normalizeForAnchor,
  lineOfOffset,
  questionAnchorRegion,
  findQuestionRegion,
  anchorStemsOfQuestion,
  parsePatchHunks,
  hunksTouchRegion,
  BANK_HISTORY_COMMIT_CAP,
} = await import("./editor-history");

describe("corpusBankPathOfRecord — the bank path law (ADR-044 §10)", () => {
  test("official bank: the corpus dir rides the source.pageUrl of record", () => {
    const p = corpusBankPathOfRecord("igcse-chemistry-19", {
      schema: "syllabai.official-paper-questions/0.1",
      source: {
        pageUrl:
          "https://github.com/SyllabAI/syllabai-resources/tree/main/Official-ExamQuestion/igcse-chemistry-19/2019-06/4CH1-1C",
      },
    });
    expect(p).toEqual({
      path: "Official-ExamQuestion/igcse-chemistry-19/2019-06/4CH1-1C/questions.md",
      kind: "official",
    });
  });

  test("SME bank: the structural law verified across the corpus families", () => {
    expect(
      corpusBankPathOfRecord("igcse-chemistry-19", {
        schema: "syllabai.sme-exam-questions/1.1",
        sectionSlug: "1-principles-of-chemistry",
        topicSlug: "1-1-states-of-matter",
        source: { pageUrl: "https://www.savemyexams.com/igcse/chemistry/edexcel/19/topic-questions/" },
      }),
    ).toEqual({
      path: "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-1-states-of-matter/questions.md",
      kind: "sme",
    });
    // the CIE slice (the longest slug of record)
    expect(
      corpusBankPathOfRecord("cie-igcse-biology-23", {
        schema: "syllabai.sme-exam-questions/1.1",
        sectionSlug: "1-characteristics-and-classification-of-living-organisms",
        topicSlug: "1-1-characteristics-classification-and-features-of-organisms",
        source: { pageUrl: null },
      }),
    ).toEqual({
      path: "SME-ExamQuestion/cie-igcse-biology-23/1-characteristics-and-classification-of-living-organisms/1-1-characteristics-classification-and-features-of-organisms/questions.md",
      kind: "sme",
    });
  });

  test("an unknown schema tries both laws (pageUrl first, then structural); unresolvable → null", () => {
    expect(
      corpusBankPathOfRecord("some-course", {
        schema: "syllabai.future-thing/9.9",
        source: {
          pageUrl: "https://github.com/SyllabAI/syllabai-resources/tree/main/SomeBank/x",
        },
        sectionSlug: "sec",
        topicSlug: "top",
      }),
    ).toEqual({ path: "SomeBank/x/questions.md", kind: "official" });
    expect(
      corpusBankPathOfRecord("some-course", { schema: "syllabai.future-thing/9.9", sectionSlug: "sec", topicSlug: "top" }),
    ).toEqual({ path: "SME-ExamQuestion/some-course/sec/top/questions.md", kind: "sme" });
    expect(corpusBankPathOfRecord("some-course", { schema: "syllabai.future-thing/9.9" })).toBeNull();
    // official schema without a resources pageUrl → null (no invented path)
    expect(
      corpusBankPathOfRecord("x", { schema: "syllabai.official-paper-questions/0.1", sectionSlug: "s", topicSlug: "t" }),
    ).toBeNull();
  });
});

describe("normalizeForAnchor / lineOfOffset — the anchor substrate", () => {
  const file = "# Title\n\n## Q1 — marks\nThe names of some terms\nare given in the box.\n\n## Q2 — marks\nnext question body\n";
  const map = normalizeForAnchor(file);

  test("normalized text collapses whitespace + case across lines", () => {
    expect(map.text).toContain("the names of some terms are given in the box");
  });

  test("lineOfOffset maps a normalized offset back to its ORIGINAL line", () => {
    const at = map.text.indexOf("the names of some terms");
    const line = lineOfOffset(map, at);
    expect(file.split("\n")[line]).toBe("The names of some terms");
    const at2 = map.text.indexOf("next question body");
    expect(file.split("\n")[lineOfOffset(map, at2)]).toBe("next question body");
  });
});

describe("questionAnchorRegion / findQuestionRegion — the content anchor law", () => {
  const smedFile = [
    "# Exam Questions — States of Matter",
    "",
    "## Q1 — easy — 7 marks",
    "",
    "### 2 — 5 marks — command: complete — structured",
    "This question is about states of matter.",
    "",
    "Complete the table by choosing the term.",
    "",
    "### 2 — 2 marks — command: describe — structured",
    "Describe what happens to the particles.",
    "",
    "## Q2 — easy — 1 marks",
    "",
    "### 3 — 1 mark — multiple_choice",
    "Which row shows the changes of state?",
    "",
    "## Q3 — hard — 5 marks",
    "a hard question body about freezing",
  ].join("\n");

  test("both corpus heading forms bound the region", () => {
    const lines = smedFile.split("\n");
    const r1 = questionAnchorRegion(lines, 5); // inside Q1
    expect(r1).not.toBeNull();
    expect(r1!.heading).toBe("## Q1 — easy — 7 marks");
    expect(r1!.start).toBe(2);
    expect(r1!.end).toBe(12); // exclusive at the Q2 heading
    const r2 = questionAnchorRegion(lines, 14); // inside Q2
    expect(r2!.heading).toBe("## Q2 — easy — 1 marks");
    const r3 = questionAnchorRegion(lines, lines.length - 1); // last region runs to EOF
    expect(r3!.heading).toBe("## Q3 — hard — 5 marks");
    expect(r3!.end).toBe(lines.length);
  });

  test("the official heading form (## Question n (marks)) bounds the region", () => {
    const official = [
      "# 4CH1/1C — 2023-06 (official extraction)",
      "",
      "## Question 1 (7 marks)",
      "stem one",
      "",
      "## Question 2 (8 marks)",
      "stem two about electrolysis and rates",
    ].join("\n");
    const lines = official.split("\n");
    const r = questionAnchorRegion(lines, 3);
    expect(r!.heading).toBe("## Question 1 (7 marks)");
    expect(r!.end).toBe(5);
  });

  test("findQuestionRegion anchors BY CONTENT, never by ordinal", () => {
    // the hub question whose part stem lives inside corpus Q2 — the ordinal
    // mapping (hub order 1 → corpus Q2) is KNOWN-WRONG; the stem is the law
    const q = {
      id: "qstn_x",
      order: 1,
      parts: [{ problemMd: "Which row shows the\nchanges of state?" }],
    };
    const r = findQuestionRegion(smedFile, q);
    expect(r).not.toBeNull();
    expect(r!.heading).toBe("## Q2 — easy — 1 marks");
  });

  test("a question whose stems are absent → null (attribution 'unavailable' upstream)", () => {
    expect(
      findQuestionRegion(smedFile, {
        id: "qstn_y",
        order: 9,
        parts: [{ problemMd: "an invented stem that is not in the corpus file at all" }],
      }),
    ).toBeNull();
  });

  test("short stems (<24 chars) are never anchors (distinctiveness bound)", () => {
    expect(anchorStemsOfQuestion({ parts: [{ problemMd: "too short" }] })).toEqual([]);
  });
});

describe("parsePatchHunks / hunksTouchRegion — the hunk law", () => {
  test("unified-diff hunk headers parse (both arity forms)", () => {
    const patch = [
      "diff --git a/questions.md b/questions.md",
      "@@ -10,7 +10,8 @@ some context",
      " unchanged",
      "-old line",
      "+new line",
      "@@ -50 +50 @@",
      "-one",
      "+uno",
    ].join("\n");
    const hunks = parsePatchHunks(patch);
    expect(hunks).toEqual([
      { oldStart: 10, oldLines: 7, newStart: 10, newLines: 8 },
      { oldStart: 50, oldLines: 1, newStart: 50, newLines: 1 },
    ]);
  });

  test("a commit touches the question iff its NEW range intersects the region", () => {
    // region: 0-based [11, 17) (the Q2 body)
    const region = { start: 11, end: 17 };
    expect(
      hunksTouchRegion([{ oldStart: 10, oldLines: 7, newStart: 10, newLines: 8 }], region.start, region.end),
    ).toBe(true); // new lines 9..17 (0-based) overlap [11,17)
    expect(
      hunksTouchRegion([{ oldStart: 1, oldLines: 5, newStart: 1, newLines: 5 }], region.start, region.end),
    ).toBe(false); // new lines 0..5
    expect(
      hunksTouchRegion([{ oldStart: 20, oldLines: 3, newStart: 20, newLines: 3 }], region.start, region.end),
    ).toBe(false); // beyond the region
    expect(hunksTouchRegion([], region.start, region.end)).toBe(false);
    // a pure insertion at the region boundary touches
    expect(
      hunksTouchRegion([{ oldStart: 12, oldLines: 0, newStart: 12, newLines: 0 }], region.start, region.end),
    ).toBe(true);
  });
});

describe("the commit fan-out cap", () => {
  test("10 commit details per history build (the REST call budget)", () => {
    expect(BANK_HISTORY_COMMIT_CAP).toBe(10);
  });
});
