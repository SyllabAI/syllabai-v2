/**
 * Pins for the note-scroll memory (operator trace 1a19b5cba7c16a81: "Resume
 * could remember scroll position within a note"): the save gate, the resume
 * band, the bounded map, and the joined resume-target selection across the
 * read stamps and the scroll memory.
 */
import { describe, expect, test } from "bun:test";
import {
  MAX_ENTRIES,
  MAX_RESUME_FRAC,
  MIN_RESUME_FRAC,
  getNoteScroll,
  getNoteScrolls,
  pickResumeNoteId,
  resumableFrac,
  saveNoteScroll,
} from "./note-scroll";

// bun test runs without a DOM — the store degrades to its module cache
// (the same posture the progress.ts overlay tests use), which is exactly
// what these law-level pins exercise.
const COURSE = "test-course";

describe("saveNoteScroll (the save gate + clamping)", () => {
  test("clamps out-of-range fractions into [0, 1]", () => {
    saveNoteScroll(COURSE, "n-clamp-hi", 1.7, 1);
    expect(getNoteScroll(COURSE, "n-clamp-hi")?.frac).toBe(1);
    saveNoteScroll(COURSE, "n-clamp-lo", -0.4, 2);
    expect(getNoteScroll(COURSE, "n-clamp-lo")).toBeNull(); // clamped to 0 → below the gate
  });

  test("refuses positions below the save gate (sub-2% is not a reading position)", () => {
    saveNoteScroll(COURSE, "n-gate", MIN_RESUME_FRAC - 0.001, 3);
    expect(getNoteScroll(COURSE, "n-gate")).toBeNull();
    saveNoteScroll(COURSE, "n-gate", MIN_RESUME_FRAC, 4);
    expect(getNoteScroll(COURSE, "n-gate")?.frac).toBe(MIN_RESUME_FRAC);
  });

  test("keeps the latest fraction and engagement time per note", () => {
    saveNoteScroll(COURSE, "n-move", 0.3, 10);
    saveNoteScroll(COURSE, "n-move", 0.55, 20);
    expect(getNoteScroll(COURSE, "n-move")).toEqual({ frac: 0.55, at: 20 });
  });

  test("evicts the oldest engagements past the cap, never the freshly written note", () => {
    // isolated course key — the cap math must not see the other tests' entries
    const C = "test-course-cap";
    for (let i = 0; i < MAX_ENTRIES; i++) saveNoteScroll(C, `old-${i}`, 0.5, i);
    expect(Object.keys(getNoteScrolls(C)).length).toBe(MAX_ENTRIES);
    saveNoteScroll(C, "newest", 0.7, MAX_ENTRIES + 5);
    const all = getNoteScrolls(C);
    expect(Object.keys(all).length).toBe(MAX_ENTRIES);
    expect(all["old-0"]).toBeUndefined(); // oldest `at` evicted
    expect(all["old-1"]).toBeDefined(); // the next-oldest survives
    expect(all["newest"]).toEqual({ frac: 0.7, at: MAX_ENTRIES + 5 });
  });
});

describe("resumableFrac (the resume band)", () => {
  test("restores only inside [2%, 98%] — interrupted reads resume, finished notes open fresh", () => {
    expect(resumableFrac(0)).toBe(false);
    expect(resumableFrac(0.01)).toBe(false);
    expect(resumableFrac(MIN_RESUME_FRAC)).toBe(true);
    expect(resumableFrac(0.5)).toBe(true);
    expect(resumableFrac(MAX_RESUME_FRAC)).toBe(true);
    expect(resumableFrac(0.99)).toBe(false);
    expect(resumableFrac(1)).toBe(false);
  });
});

describe("pickResumeNoteId (the joined resume target)", () => {
  const known = new Set(["a", "b", "c"]);

  test("returns null when nothing is engaged", () => {
    expect(pickResumeNoteId({}, {}, known)).toBeNull();
  });

  test("picks the most recent read when only reads exist", () => {
    expect(pickResumeNoteId({ a: { at: 1 }, b: { at: 9 } }, {}, known)).toBe("b");
  });

  test("a mid-note scroll outranks a finished read it never returned to", () => {
    // read note a at t=100 (finished), scrolled note b to 40% at t=150
    const id = pickResumeNoteId({ a: { at: 100 } }, { b: { frac: 0.4, at: 150 } }, known);
    expect(id).toBe("b");
  });

  test("a re-read stamp can win the target back", () => {
    // scrolled note b at t=150, re-read note a at t=200
    const id = pickResumeNoteId({ a: { at: 200 } }, { b: { frac: 0.4, at: 150 } }, known);
    expect(id).toBe("a");
  });

  test("stale note ids outside this course's corpus never win", () => {
    expect(pickResumeNoteId({ ghost: { at: 999 } }, { ghost: { frac: 0.5, at: 999 } }, known)).toBeNull();
    expect(pickResumeNoteId({ a: { at: 1 }, ghost: { at: 999 } }, {}, known)).toBe("a");
  });
});
