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
