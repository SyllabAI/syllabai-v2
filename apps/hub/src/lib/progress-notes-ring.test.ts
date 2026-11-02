/**
 * Pins for the notes-only ring + the completed-read upsert (operator trace
 * 1a195fd0b0947695): the revision-notes select page's rings count reads ÷
 * available notes ONLY (never questions, never flashcards — "both of their
 * select pages will handle their progress rings"), and markNoteRead births
 * the entry on the first completed read then refreshes recency on re-reads
 * (keeping any helpful vote) so Resume points at the note most recently
 * scrolled through — while the presence-based ring/tick math counts it once.
 */
import { describe, expect, test } from "bun:test";
import {
  emptyProgress,
  getProgressSnapshot,
  markNoteRead,
  rateNoteHelpful,
  subtopicNotesRing,
  subtopicRing,
  type CourseProgress,
} from "./progress";

const ring = (p: CourseProgress, notes: number) => subtopicNotesRing(p, "SUB-a", { notes });

describe("subtopicNotesRing (notes-only dimension)", () => {
  test("counts reads ÷ available notes only", () => {
    const p = emptyProgress();
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 1 };
    p.notesRead["n2"] = { subtopic: "SUB-a", at: 2 };
    // questions + flashcards exist but NEVER move this ring
    p.selfScores["q1"] = { subtopic: "SUB-a", topicSlug: "t", score: 2, max: 5, at: 3 };
    p.mcqAnswers["q2"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "a", correct: false, at: 4 };
    p.flashcards["f1"] = { subtopic: "SUB-a", rating: "know", at: 5 };
    expect(ring(p, 4)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  test("caps at the available notes and hits 100", () => {
    const p = emptyProgress();
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 1 };
    p.notesRead["n2"] = { subtopic: "SUB-a", at: 2 };
    expect(ring(p, 2)).toEqual({ done: 2, total: 2, percent: 100 });
  });

  test("ignores reads from other sub-topics", () => {
    const p = emptyProgress();
    p.notesRead["n1"] = { subtopic: "SUB-b", at: 1 };
    expect(ring(p, 3)).toEqual({ done: 0, total: 3, percent: 0 });
  });

  test("zero available notes is the honest empty ring (never a fake 100)", () => {
    const p = emptyProgress();
    expect(ring(p, 0)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  test("differs from the combined engagement ring by design", () => {
    const p = emptyProgress();
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 1 };
    p.selfScores["q1"] = { subtopic: "SUB-a", topicSlug: "t", score: 2, max: 5, at: 3 };
    // combined counts both planes (1+1 of 2+1 = 67%); notes-only reads 1 of 2 = 50%
    expect(subtopicRing(p, "SUB-a", { notes: 2, questions: 1, flashcards: 0 }).percent).toBe(67);
    expect(subtopicNotesRing(p, "SUB-a", { notes: 2 }).percent).toBe(50);
  });
});

describe("markNoteRead (completed-read recency law)", () => {
  const COURSE = "ring-test-course-1a195fd0";

  test("first fire births the entry with subtopic + timestamp", () => {
    markNoteRead(COURSE, "note-1", "SUB-a");
    const entry = getProgressSnapshot(COURSE).notesRead["note-1"];
    expect(entry.subtopic).toBe("SUB-a");
    expect(entry.at).toBeGreaterThan(0);
  });

  test("re-read refreshes at, keeps the helpful vote, never duplicates", () => {
    markNoteRead(COURSE, "note-2", "SUB-a");
    rateNoteHelpful(COURSE, "note-2", "up");
    const before = getProgressSnapshot(COURSE).notesRead["note-2"];
    expect(before.helpful).toBe("up");

    Bun.sleepSync(5); // guarantee a strictly later Date.now()
    markNoteRead(COURSE, "note-2", "SUB-a");
    const after = getProgressSnapshot(COURSE).notesRead["note-2"];
    expect(after.at).toBeGreaterThan(before.at);
    expect(after.helpful).toBe("up");
    expect(Object.keys(getProgressSnapshot(COURSE).notesRead).filter((k) => k === "note-2").length).toBe(1);
  });
});
