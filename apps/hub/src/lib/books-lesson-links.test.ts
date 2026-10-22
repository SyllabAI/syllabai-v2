import { describe, expect, test } from "bun:test";

import type { ExamQuestionTopic, Flashcard, RevisionNote } from "./contracts";
import {
  flashcardsForSpecRefs,
  questionTopicsForSpecRefs,
  requalifySpecRefs,
  relatedNotesForSpecRefs,
} from "./books-lesson-links";

const note = (noteId: string, codes: string[], title = `T-${noteId}`): RevisionNote =>
  ({ noteId, title, path: `p/${noteId}`, specPointCodes: codes }) as unknown as RevisionNote;

describe("requalifySpecRefs", () => {
  test("bare officialCodes → qualified spineCodes", () => {
    expect(requalifySpecRefs(["1.1", "1.5C"], "4CH1")).toEqual(["4CH1-1.1", "4CH1-1.5C"]);
  });
  test("already-qualified refs pass through untouched", () => {
    expect(requalifySpecRefs(["4CH1-1.2"], "4CH1")).toEqual(["4CH1-1.2"]);
  });
});

describe("relatedNotesForSpecRefs", () => {
  const notes = [
    note("n3", ["4CH1-1.2"]),
    note("n1", ["4CH1-1.1", "4CH1-1.2"]),
    note("n2", ["4CH1-2.5"]), // different chapter — must NOT join
    note("n4", []), // no codes — honest-absent
  ];

  test("exact intersection, dedupe by noteId, deterministic order", () => {
    const out = relatedNotesForSpecRefs(["4CH1-1.1", "4CH1-1.2"], notes);
    expect(out.map((n) => n.noteId)).toEqual(["n1", "n3"]); // path order, not input order
  });

  test("empty refs → empty (never a fabricated link)", () => {
    expect(relatedNotesForSpecRefs([], notes)).toEqual([]);
  });

  test("no intersecting notes → empty", () => {
    expect(relatedNotesForSpecRefs(["4CH1-9.9"], notes)).toEqual([]);
  });
});

describe("questionTopicsForSpecRefs", () => {
  const q = (id: string, partCodes: string[]) =>
    ({ id, parts: partCodes.map((c) => ({ specPointCodes: [c] })) });
  const topics = [
    { topicSlug: "states", questions: [q("q1", ["4CH1-1.1"]), q("q2", ["4CH1-3.4"])] },
    { topicSlug: "unrelated", questions: [q("q3", ["4CH1-5.2"])] },
    { topicSlug: "empty", questions: [] },
  ] as unknown as ExamQuestionTopic[];

  test("topic joins when ANY question part intersects", () => {
    const out = questionTopicsForSpecRefs(["4CH1-1.1"], topics);
    expect(out.map((t) => t.topicSlug)).toEqual(["states"]);
  });
  test("no intersection → no topics", () => {
    expect(questionTopicsForSpecRefs(["4CH1-1.7C"], topics)).toEqual([]);
  });
});

describe("flashcardsForSpecRefs", () => {
  const card = (id: string, code: string | null, ids?: string[]) =>
    ({ id, specPointCode: code, specPointIds: ids }) as unknown as Flashcard;
  const cards = [card("c1", "4CH1-1.1"), card("c2", null), card("c3", "4CH1-2.2"), card("c4", null, ["4CH1-1.2"])];

  test("single-anchor and legacy-id anchors both join", () => {
    const out = flashcardsForSpecRefs(["4CH1-1.1", "4CH1-1.2"], cards);
    expect(out.map((c) => c.id)).toEqual(["c1", "c4"]);
  });
  test("null-anchored cards never join (honest-absent)", () => {
    expect(flashcardsForSpecRefs(["4CH1-1.1"], [card("c2", null)])).toEqual([]);
  });
});
