/**
 * directory-stats.test.ts — the substance-line law, unit-pinned
 * (T-HUB-COURSES-PUBLIC-2 ①). The directory card shows only counts a
 * committed bundle manifest actually carries: zero-sized parts are omitted
 * (an absent stat is never a zero claim) and an all-zero lane formats to
 * the empty string, which the caller renders as no line at all.
 */
import { describe, expect, test } from "bun:test";
import {
  formatCourseStats,
  summarizeDirectoryStats,
  ZERO_COURSE_COUNTS,
} from "./directory-stats";

describe("course substance line formatting", () => {
  test("all-zero counts format to empty — ghosts render no line", () => {
    expect(formatCourseStats(ZERO_COURSE_COUNTS)).toBe("");
    expect(formatCourseStats({ notes: 0, flashcards: 0, questions: 0 })).toBe(
      "",
    );
  });

  test("single nonzero count — singular handled", () => {
    expect(formatCourseStats({ notes: 1, flashcards: 0, questions: 0 })).toBe(
      "1 note",
    );
    expect(formatCourseStats({ notes: 0, flashcards: 1, questions: 0 })).toBe(
      "1 flashcard",
    );
    expect(formatCourseStats({ notes: 0, flashcards: 0, questions: 1 })).toBe(
      "1 question",
    );
  });

  test("plural forms", () => {
    expect(
      formatCourseStats({ notes: 159, flashcards: 0, questions: 0 }),
    ).toBe("159 notes");
    expect(
      formatCourseStats({ notes: 0, flashcards: 340, questions: 88 }),
    ).toBe("340 flashcards · 88 questions");
  });

  test("full trio joins with the house middle dot", () => {
    expect(
      formatCourseStats({ notes: 112, flashcards: 340, questions: 1250 }),
    ).toBe("112 notes · 340 flashcards · 1250 questions");
  });

  test("zero parts never appear between nonzero parts (honesty law)", () => {
    expect(
      formatCourseStats({ notes: 12, flashcards: 0, questions: 30 }),
    ).toBe("12 notes · 30 questions");
  });
});

describe("directory hero summary (T-HUB-COURSES-UI-2)", () => {
  const registry = [
    { status: "full", curriculumCode: "4CH1" },
    { status: "full", curriculumCode: "4PH1" },
    { status: "full" },
    { status: "pilot", curriculumCode: "X" },
    { status: "registered" },
  ];

  test("counts are derived, not invented — full/tutor-ready/papers", () => {
    const s = summarizeDirectoryStats(registry, { a: 3, b: 4, c: 0 });
    expect(s.total).toBe(5);
    // the pilot lane has a corpus too but is NOT "full" — the chip says
    // full corpus and counts exactly the full lanes
    expect(s.fullCorpus).toBe(3);
    // tutor-ready = genuinely curriculum-scoped lanes (registry field)
    expect(s.tutorReady).toBe(3);
    // committed archive papers sum over the map
    expect(s.papers).toBe(7);
  });

  test("absent archive map sums to zero — never a fabricated total", () => {
    const s = summarizeDirectoryStats(registry);
    expect(s.papers).toBe(0);
    expect(s.total).toBe(5);
  });

  test("empty registry -> all zeroes (StatChip hides what it is told to)", () => {
    const s = summarizeDirectoryStats([], {});
    expect(s).toEqual({
      total: 0,
      fullCorpus: 0,
      tutorReady: 0,
      papers: 0,
    });
  });
});
