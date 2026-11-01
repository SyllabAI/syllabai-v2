/**
 * Pins for the per-page ring semantics (operator trace 1a1982281a3d7a65,
 * extending 1a195fd0b0947695): each select page owns its own denominator —
 * the exam-questions select page's ring counts ENGAGED QUESTION PARTS ÷
 * available questions ONLY (never notes, never flashcards) and the
 * flashcards select page's ring counts RATED CARDS ÷ available cards ONLY
 * (never notes, never questions). The combined engagement ring
 * (subtopicRing) stays the sidebar's posture and must keep differing from
 * both. Zero available resources renders the honest empty ring, never a
 * fake 100%.
 */
import { describe, expect, test } from "bun:test";
import { emptyProgress, subtopicFlashcardsRing, subtopicQuestionsRing, subtopicRing, type CourseProgress } from "./progress";

const qRing = (p: CourseProgress, questions: number) => subtopicQuestionsRing(p, "SUB-a", { questions });
const fRing = (p: CourseProgress, flashcards: number) => subtopicFlashcardsRing(p, "SUB-a", { flashcards });

describe("subtopicQuestionsRing (questions-only dimension)", () => {
  test("counts self-scored parts + answered MCQs ÷ available questions only", () => {
    const p = emptyProgress();
    p.selfScores["q1"] = { subtopic: "SUB-a", topicSlug: "t", score: 2, max: 5, at: 1 };
    p.mcqAnswers["q2"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "a", correct: false, at: 2 };
    // notes + flashcards exist but NEVER move this ring
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 3 };
    p.flashcards["f1"] = { subtopic: "SUB-a", rating: "know", at: 4 };
    expect(qRing(p, 4)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  test("caps at the available questions and hits 100", () => {
    const p = emptyProgress();
    p.mcqAnswers["q1"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "b", correct: true, at: 1 };
    p.mcqAnswers["q2"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "c", correct: true, at: 2 };
    p.mcqAnswers["q3"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "d", correct: false, at: 3 };
    expect(qRing(p, 2)).toEqual({ done: 2, total: 2, percent: 100 });
  });

  test("ignores engagement from other sub-topics", () => {
    const p = emptyProgress();
    p.selfScores["q1"] = { subtopic: "SUB-b", topicSlug: "t", score: 1, max: 5, at: 1 };
    expect(qRing(p, 3)).toEqual({ done: 0, total: 3, percent: 0 });
  });

  test("zero available questions is the honest empty ring (never a fake 100)", () => {
    const p = emptyProgress();
    expect(qRing(p, 0)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  test("differs from the combined engagement ring by design", () => {
    const p = emptyProgress();
    p.mcqAnswers["q1"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "a", correct: true, at: 1 };
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 2 };
    // combined counts both planes (1+1 of 2+1 = 67%); questions-only 1 of 1 = 100%
    expect(subtopicRing(p, "SUB-a", { notes: 2, questions: 1, flashcards: 0 }).percent).toBe(67);
    expect(qRing(p, 1).percent).toBe(100);
  });
});

describe("subtopicFlashcardsRing (flashcards-only dimension)", () => {
  test("counts rated cards ÷ available cards only", () => {
    const p = emptyProgress();
    p.flashcards["f1"] = { subtopic: "SUB-a", rating: "know", at: 1 };
    p.flashcards["f2"] = { subtopic: "SUB-a", rating: "still-learning", at: 2 };
    // notes + questions exist but NEVER move this ring
    p.notesRead["n1"] = { subtopic: "SUB-a", at: 3 };
    p.selfScores["q1"] = { subtopic: "SUB-a", topicSlug: "t", score: 2, max: 5, at: 4 };
    p.mcqAnswers["q2"] = { subtopic: "SUB-a", topicSlug: "t", chosen: "a", correct: false, at: 5 };
    expect(fRing(p, 4)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  test("caps at the available cards and hits 100", () => {
    const p = emptyProgress();
    p.flashcards["f1"] = { subtopic: "SUB-a", rating: "know", at: 1 };
    p.flashcards["f2"] = { subtopic: "SUB-a", rating: "know", at: 2 };
    expect(fRing(p, 2)).toEqual({ done: 2, total: 2, percent: 100 });
  });

  test("ignores ratings from other sub-topics", () => {
    const p = emptyProgress();
    p.flashcards["f1"] = { subtopic: "SUB-b", rating: "know", at: 1 };
    expect(fRing(p, 3)).toEqual({ done: 0, total: 3, percent: 0 });
  });

  test("zero available cards is the honest empty ring (never a fake 100)", () => {
    const p = emptyProgress();
    expect(fRing(p, 0)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  test("differs from the combined engagement ring by design", () => {
    const p = emptyProgress();
    p.flashcards["f1"] = { subtopic: "SUB-a", rating: "know", at: 1 };
    p.selfScores["q1"] = { subtopic: "SUB-a", topicSlug: "t", score: 2, max: 5, at: 2 };
    // combined counts both planes (1q+1f of 1q+4f = 40%); flashcards-only 1 of 4 = 25%
    expect(subtopicRing(p, "SUB-a", { notes: 0, questions: 1, flashcards: 4 }).percent).toBe(40);
    expect(fRing(p, 4).percent).toBe(25);
  });
});
