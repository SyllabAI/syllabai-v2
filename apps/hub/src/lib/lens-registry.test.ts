// DC-4 lens pins (docs/DC4-LENS-CARDS-NAVIGATION-PLAN.md §3): the registry
// is the law — data rows, byte-pinned templates, closed router-target
// vocabulary, deterministic href resolution. These pins are acceptance
// (a)+(b) of record; opener-only (c) is structural (the grid renders only
// inside the surfaces' existing empty-state predicates).
import { describe, expect, it } from "bun:test";
import {
  NOTES_LENSES,
  QUESTION_UNDERSTAND_PROMPT,
  QUESTION_WHY_MARKED,
  lensRouteHrefFor,
  lensRouteTargetFor,
  questionApproachPrompt,
  questionWhyMarkedHref,
} from "./lens-registry";

describe("DC-4 lens registry — notes rows (operator spec, verbatim)", () => {
  it("ships exactly the four observed lenses in order", () => {
    expect(NOTES_LENSES.map((l) => l.id)).toEqual([
      "definitions",
      "summary",
      "pitfalls",
      "exam-help",
    ]);
    expect(NOTES_LENSES.every((l) => l.surface === "notes")).toBe(true);
  });

  it("pins the card bytes (titles, descriptions, prompts, modes)", () => {
    expect(NOTES_LENSES.map((l) => l.title)).toEqual([
      "Definitions",
      "Summary",
      "Pitfalls",
      "Exam help",
    ]);
    expect(NOTES_LENSES.map((l) => l.description)).toEqual([
      "Define the key terms in this revision note",
      "Summarise the key points",
      "Examine common misconceptions",
      "Tips for understanding this topic",
    ]);
    expect(NOTES_LENSES.map((l) => l.prompt)).toEqual([
      "Define the key terms in this revision note",
      "Summarise the key points",
      "Examine common misconceptions",
      "Give tips for understanding this topic and how it is examined",
    ]);
    expect(NOTES_LENSES.map((l) => l.mode)).toEqual([
      "EXPLAIN",
      "SUMMARIZE",
      "EXPLAIN",
      "EXPLAIN",
    ]);
  });

  it("pins the observed product's router mapping of record", () => {
    // Flashcards for Definitions and Pitfalls; Exam Questions for Summary
    // and Exam help (spec §3.4 observed paragraph).
    expect(NOTES_LENSES.map((l) => (l.target.kind === "route" ? l.target.to : "other"))).toEqual([
      "flashcards",
      "exam-questions",
      "flashcards",
      "exam-questions",
    ]);
  });

  it("carries a pinned template id per row", () => {
    expect(NOTES_LENSES.map((l) => l.templateId)).toEqual([
      "note-definitions-v1",
      "note-summary-v1",
      "note-pitfalls-v1",
      "note-exam-help-v1",
    ]);
  });
});

describe("DC-4 router pins (acceptance b)", () => {
  it("resolves route targets to course-scoped hub routes", () => {
    expect(lensRouteHrefFor("chem-a", "flashcards")).toBe("/courses/chem-a/flashcards");
    expect(lensRouteHrefFor("chem-a", "exam-questions")).toBe("/courses/chem-a/exam-questions");
    expect(lensRouteHrefFor("igcse-chemistry-19", "flashcards")).toBe(
      "/courses/igcse-chemistry-19/flashcards",
    );
  });

  it("encodes the course (no route injection through the slug)", () => {
    expect(lensRouteHrefFor("a/b?c", "flashcards")).toBe("/courses/a%2Fb%3Fc/flashcards");
  });

  it("maps lens ids to their route targets — and fails open on anything else", () => {
    expect(lensRouteTargetFor("definitions")).toEqual({ to: "flashcards" });
    expect(lensRouteTargetFor("summary")).toEqual({ to: "exam-questions" });
    expect(lensRouteTargetFor("pitfalls")).toEqual({ to: "flashcards" });
    expect(lensRouteTargetFor("exam-help")).toEqual({ to: "exam-questions" });
    expect(lensRouteTargetFor("nope")).toBeNull();
  });

  it("keeps the router-target vocabulary closed", () => {
    const kinds = NOTES_LENSES.map((l) => l.target.kind);
    expect(kinds.every((k) => ["route", "in-chat", "tutor-mark-context"].includes(k))).toBe(true);
  });
});

describe("DC-4 question-surface lens templates (byte-identical to the shipped chips)", () => {
  it("pins the understand lens ask verbatim", () => {
    expect(QUESTION_UNDERSTAND_PROMPT).toBe(
      "What is this question asking me to do? Walk through each part — the command words, the marks, and what the examiner is looking for. Don't tell me the answers.",
    );
  });

  it("pins both approach branches verbatim (deterministic over the target)", () => {
    expect(
      questionApproachPrompt({ anchor: "QUESTION_PART", label: "b" }),
    ).toBe(
      "Help me work through part (b) step by step — coach me toward the answer without giving it away.",
    );
    expect(questionApproachPrompt({ anchor: "QUESTION", label: "Q2" })).toBe(
      "Help me work through this question step by step — coach me toward the answer without giving it away.",
    );
    expect(questionApproachPrompt(null)).toBe(
      "Help me work through this question step by step — coach me toward the answer without giving it away.",
    );
  });

  it("builds the why-marked tutor deep link on the helpHref pattern", () => {
    const href = questionWhyMarkedHref("chem-a", "The diagram shows a cell");
    expect(href.startsWith("/tutor?course=chem-a&q=")).toBe(true);
    const ask = decodeURIComponent(href.split("&q=")[1] ?? "");
    expect(ask).toBe(
      'Why was I marked this? Help me with this exam question: The diagram shows a cell — walk me through the mark I received',
    );
  });

  it("fails open honestly when the question carries no text", () => {
    const href = questionWhyMarkedHref("chem-a", null);
    const ask = decodeURIComponent(href.split("&q=")[1] ?? "");
    expect(ask).toBe("Why was I marked this? Walk me through the mark I received on my latest attempt");
  });

  it("carries the why-marked card of record", () => {
    expect(QUESTION_WHY_MARKED.title).toBe("Why was I marked this");
    expect(QUESTION_WHY_MARKED.templateId).toBe("question-why-marked-v1");
  });
});
