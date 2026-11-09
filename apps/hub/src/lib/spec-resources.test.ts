/**
 * T-SPECLINK-1 — the spec-point → corpus-resources join (lib/spec-resources).
 *
 * Fixture legs: the join laws on synthetic bundles (part anchors, the
 * relatedNoteIds fallback, honest absence for unanchored sets, out-of-
 * curriculum refs dropped, legend/id dedupe).
 *
 * Real-bundle legs: the cie-igcse-chemistry-23 census of record — every
 * resource anchored (notes 107/107, sets 73/73, flashcards 1133/1133 via
 * the subtopic-note-inherited backfill of record), zero dangling refs, and
 * the coverage pin. Real-book-style drift fails here first, loudly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildSpecResources } from "./spec-resources";
import type { Flashcard, RevisionNote, ExamQuestionTopic } from "./contracts";

const note = (id: string, specPointIds: string[], topicSlug = "t1"): RevisionNote =>
  ({
    noteId: id,
    title: `Note ${id}`,
    sourceUrl: null,
    specPointIds,
    specPointCodes: [],
    guidedStudy: false,
    path: null,
    updatedAt: "2026-01-01T00:00:00Z",
    bodyMd: "",
    sectionSlug: "s1",
    topicSlug,
  }) as RevisionNote;

const part = (specPointIds: string[], specPointCodes: string[] = []) =>
  ({
    id: `p-${Math.random().toString(36).slice(2)}`,
    order: 0,
    questionType: "multiple_choice",
    marks: 1,
    commandWord: null,
    specPointIds,
    specPointCodes,
    problemMd: "",
    parts: [],
  });

const set = (
  slug: string,
  questions: { specPointIds?: string[]; specPointCodes?: string[] }[][],
  relatedNoteIds: string[] = [],
  name = `Set ${slug}`,
): ExamQuestionTopic =>
  ({
    topicId: `t-${slug}`,
    slug,
    name,
    setName: null,
    topicSlug: "t1",
    sectionSlug: "s1",
    section: "S1",
    curriculum: {} as ExamQuestionTopic["curriculum"],
    source: { provider: "Save My Exams", license: "test", pageUrl: null },
    schema: null,
    relatedNoteIds,
    questions: questions.map((parts, i) => ({
      id: `q-${slug}-${i}`,
      order: i,
      difficulty: "easy",
      style: null,
      totalMarks: 1,
      parts: parts.map((p) => part(p.specPointIds ?? [], p.specPointCodes ?? [])),
    })),
  }) as unknown as ExamQuestionTopic;

const card = (id: string, specPointIds: string[], deckSlug = "1-1-deck"): Flashcard =>
  ({
    id,
    specPointCode: null,
    front: "f",
    back: "b",
    sourceNoteId: null,
    sourceTitle: null,
    provenanceTier: "RULE_DERIVED",
    cardType: "question_and_answer",
    specPointIds,
    deckSlug,
    sectionSlug: "1-section",
    topicSlug: "t1",
    subtopicCode: "1-1-deck",
  }) as Flashcard;

const nodeByCode = new Map(
  ["1.1.1", "1.1.2", "2.1.1"].map((c) => [c, { code: c }]),
);
const BASE = "/courses/test-course";

describe("t-speclink-1 — join laws (fixtures)", () => {
  it("part-level anchors join; out-of-curriculum refs are dropped", () => {
    const { legend, resByCode } = buildSpecResources(
      [note("rn_1", ["1.1.1", "9.9.9"])],
      [set("qs-1", [[{ specPointIds: ["1.1.2"] }, { specPointIds: ["9.9.9"] }]])],
      [card("fl_1", ["2.1.1"])],
      nodeByCode,
      BASE,
    );
    expect(resByCode.get("1.1.1")?.n).toEqual(["rn_1"]);
    expect(resByCode.get("1.1.2")?.q).toEqual(["qs-1"]);
    expect(resByCode.get("2.1.1")?.f).toEqual(["1-1-deck"]);
    expect(resByCode.has("9.9.9")).toBe(false);
    expect(legend.notes).toHaveLength(1);
    expect(legend.notes[0]!.href).toBe(`${BASE}/revision-notes/rn_1`);
  });

  it("specPointCodes join too (the tag-backfill vintage carries codes)", () => {
    const { resByCode } = buildSpecResources(
      [],
      [set("qs-2", [[{ specPointIds: [], specPointCodes: ["2.1.1"] }]])],
      [],
      nodeByCode,
      BASE,
    );
    expect(resByCode.get("2.1.1")?.q).toEqual(["qs-2"]);
  });

  it("a set with no anchor at any level is LEFT OUT (honest absence)", () => {
    const { legend, resByCode } = buildSpecResources(
      [note("rn_1", ["1.1.1"])],
      [set("qs-orphan", [[{ specPointIds: [], specPointCodes: [] }]])],
      [],
      nodeByCode,
      BASE,
    );
    expect(resByCode.get("1.1.1")?.q ?? []).toEqual([]);
    expect(legend.sets).toHaveLength(0);
  });

  it("the relatedNoteIds fallback anchors a set through the corpus's own note links", () => {
    const { resByCode } = buildSpecResources(
      [note("rn_1", ["1.1.1"]), note("rn_2", ["2.1.1"])],
      [set("qs-3", [[{}]], ["rn_2"])],
      [],
      nodeByCode,
      BASE,
    );
    expect(resByCode.get("2.1.1")?.q).toEqual(["qs-3"]);
    expect(resByCode.get("1.1.1")?.q ?? []).toEqual([]);
  });

  it("legend entries dedupe across points; per-point id lists dedupe", () => {
    const { legend, resByCode } = buildSpecResources(
      [note("rn_1", ["1.1.1", "1.1.2"])],
      [set("qs-1", [[{ specPointIds: ["1.1.1", "1.1.2"] }]])],
      [card("fl_1", ["1.1.1", "1.1.2"]), card("fl_2", ["1.1.1", "1.1.2"])],
      nodeByCode,
      BASE,
    );
    expect(legend.notes).toHaveLength(1);
    expect(legend.sets).toHaveLength(1);
    expect(legend.decks).toHaveLength(1);
    for (const code of ["1.1.1", "1.1.2"]) {
      expect(resByCode.get(code)?.n).toEqual(["rn_1"]);
      expect(resByCode.get(code)?.q).toEqual(["qs-1"]);
      expect(resByCode.get(code)?.f).toEqual(["1-1-deck"]);
    }
  });
});

// ── real-bundle census of record (cie-igcse-chemistry-23) ──
const CHEM23 = join(import.meta.dir, "../../content/cie-igcse-chemistry-23");

describe("t-speclink-1 — the real-bundle census of record (cie-igcse-chemistry-23)", () => {
  const cur = JSON.parse(readFileSync(join(CHEM23, "curriculum.json"), "utf8"));
  const notes = JSON.parse(readFileSync(join(CHEM23, "notes.json"), "utf8"));
  const sets = JSON.parse(readFileSync(join(CHEM23, "questions.json"), "utf8"));
  const cards = JSON.parse(readFileSync(join(CHEM23, "flashcards.json"), "utf8"));
  const nodeByCode = new Map<string, unknown>(
    (cur.nodes as { code: string }[]).map((n) => [n.code, n]),
  );
  const { legend, resByCode } = buildSpecResources(notes, sets, cards, nodeByCode, "/courses/cie-igcse-chemistry-23");

  it("100/107 notes anchor at curriculum-code level; the 7 sme-only notes are pinned (their spcpt_* ids have no of-record bridge to 2023 codes)", () => {
    expect(legend.notes).toHaveLength(100);
    const smeOnly = (notes as RevisionNote[])
      .filter((n) => (n.specPointIds ?? []).length === 0 && (n as { smeSpecPointIds?: string[] }).smeSpecPointIds?.length)
      .map((n) => n.noteId)
      .sort();
    // the census of record (run-001): exactly these 7 — any drift fails here
    expect(smeOnly).toEqual([
      "rn_5FZc5c9w66vwy9wz",
      "rn_BQS9VKq8t7ydzFrj",
      "rn_FNgYG3FXDt7JgssJ",
      "rn_G92Y6BrVJqRJk7h4",
      "rn_K8bynk8B37QtPMKV",
      "rn_V9rSpJVrkNMBbJ7J",
      "rn_XgdxfPk92fc5B8MM",
    ]);
    expect(notes).toHaveLength(107);
  });

  it("every exam-question set anchors (73/73) — part refs or the corpus fallback", () => {
    expect(legend.sets).toHaveLength(73);
    expect(sets).toHaveLength(73);
  });

  it("every flashcard carries a spec anchor (1133/1133, the run-001 backfill of record)", () => {
    const unanchored = (cards as Flashcard[]).filter((c) => (c.specPointIds ?? []).length === 0);
    expect(unanchored).toEqual([]);
    expect(cards).toHaveLength(1133);
    expect(legend.decks).toHaveLength(28);
  });

  it("every written ref is a curriculum spec code; coverage pin 154/252", () => {
    const specCodes = cur.nodes.filter((n: { family: string }) => n.family === "SPEC_POINT").map((n: { code: string }) => n.code);
    for (const code of resByCode.keys()) {
      expect(specCodes).toContain(code);
    }
    const withAny = specCodes.filter((c: string) => {
      const r = resByCode.get(c);
      return r && (r.n.length || r.q.length || r.f.length);
    });
    expect(withAny.length).toBe(154);
    expect(specCodes.length).toBe(252);
  });
});
