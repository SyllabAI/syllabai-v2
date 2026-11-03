import { describe, expect, test } from "bun:test";
import {
  buildDeckSections,
  deckTitleFromSlug,
  sectionFromSlug,
} from "./flashcard-decks";
import type { ExamQuestionTopic, Flashcard } from "@/lib/contracts";

/** Pure laws for the SME-native deck index (trace 1a19f6776ca5a619): the
 *  corpus's first-appearance order IS the SME deck order, titles come from
 *  the questions plane with a deterministic slug fallback, and a deckSlug
 *  repeating under two sections folds into its first (every card reachable,
 *  course total exact). */

function card(overrides: Partial<Flashcard> & { id: string }): Flashcard {
  return {
    specPointCode: null,
    front: "f",
    back: "b",
    sourceNoteId: null,
    sourceTitle: null,
    provenanceTier: "RULE_DERIVED",
    sectionSlug: "1-sec",
    deckSlug: "deck",
    ...overrides,
  } as Flashcard;
}

function topic(overrides: Partial<ExamQuestionTopic> & { topicId: string }): ExamQuestionTopic {
  return {
    slug: overrides.topicId ?? "t",
    name: "Set",
    section: "1. Sec",
    sectionSlug: "1-sec",
    curriculum: {} as ExamQuestionTopic["curriculum"],
    source: { provider: "p", license: "l", pageUrl: null },
    schema: null,
    questions: [],
    ...overrides,
  } as ExamQuestionTopic;
}

describe("deckTitleFromSlug", () => {
  test("numeric pair prefix becomes dotted", () => {
    expect(deckTitleFromSlug("2-7-organic-chemistry-introduction")).toBe(
      "2.7 Organic Chemistry Introduction",
    );
  });
  test("plain slugs title-case word by word, empty segments dropped", () => {
    expect(deckTitleFromSlug("e-m-f-and-modelling-resistance")).toBe(
      "E M F And Modelling Resistance",
    );
    expect(deckTitleFromSlug("paper-1-overview")).toBe("Paper 1 Overview");
    expect(deckTitleFromSlug("motion")).toBe("Motion");
  });
});

describe("sectionFromSlug", () => {
  test("leading number splits off", () => {
    expect(sectionFromSlug("16-general-fieldwork-skills")).toEqual({
      number: 16,
      title: "General Fieldwork Skills",
    });
  });
  test("no leading number → null", () => {
    expect(sectionFromSlug("mechanics")).toEqual({ number: null, title: "Mechanics" });
  });
});

describe("buildDeckSections", () => {
  test("sections and decks follow first-appearance (SME) order; titles from the questions plane", () => {
    const cards = [
      card({ id: "a1", sectionSlug: "2-waves", deckSlug: "waves-electrons-and-photons" }),
      card({ id: "a2", sectionSlug: "1-mechanics", deckSlug: "motion" }),
      card({ id: "a3", sectionSlug: "2-waves", deckSlug: "waves-electrons-and-photons" }),
      card({ id: "a4", sectionSlug: "1-mechanics", deckSlug: "moments" }),
    ];
    const topics = [
      topic({ topicId: "t1", topicSlug: "motion", name: "Motion", sectionSlug: "1-mechanics", section: "1. Mechanics & Materials" }),
      topic({ topicId: "t2", topicSlug: "waves-electrons-and-photons", name: "Waves, Electrons & Photons" }),
    ];
    const { sections, cardsByDeck } = buildDeckSections(cards, topics);
    expect(sections.map((s) => s.code)).toEqual(["2-waves", "1-mechanics"]);
    expect(sections[0].decks.map((d) => d.code)).toEqual(["waves-electrons-and-photons"]);
    expect(sections[0].decks[0].title).toBe("Waves, Electrons & Photons");
    expect(sections[0].decks[0].count).toBe(2);
    // SME's own section name: leading "2." absent → number falls back to the
    // slug's leading 2; title keeps SME wording
    expect(sections[1].number).toBe(1);
    expect(sections[1].title).toBe("Mechanics & Materials");
    expect(sections[1].decks.map((d) => d.code)).toEqual(["motion", "moments"]);
    expect(cardsByDeck["motion"]).toEqual(["a2"]);
    expect(cardsByDeck["waves-electrons-and-photons"]).toEqual(["a1", "a3"]);
  });

  test("SME section name with a leading number is stripped, number kept separately", () => {
    const { sections } = buildDeckSections(
      [card({ id: "x", sectionSlug: "3-practical", deckSlug: "planning" })],
      [topic({ topicId: "t", sectionSlug: "3-practical", section: "3. Practical Skills in Physics I" })],
    );
    expect(sections[0].number).toBe(3);
    expect(sections[0].title).toBe("Practical Skills in Physics I");
  });

  test("titles fall back to the slug when the questions plane is silent", () => {
    const { sections } = buildDeckSections(
      [card({ id: "x", sectionSlug: "9-algorithm-design-and-problem-solving-", deckSlug: "algorithms" })],
      [],
    );
    expect(sections[0].number).toBe(9);
    expect(sections[0].title).toBe("Algorithm Design And Problem Solving");
    expect(sections[0].decks[0].title).toBe("Algorithms");
  });

  test("fold law: a deckSlug under two sections stays with its first, count exact", () => {
    const cards = [
      card({ id: "a1", sectionSlug: "9-algos", deckSlug: "algorithms" }),
      card({ id: "a2", sectionSlug: "19-thinking", deckSlug: "algorithms" }),
      card({ id: "a3", sectionSlug: "19-thinking", deckSlug: "decomposition" }),
    ];
    const { sections, cardsByDeck } = buildDeckSections(cards, []);
    // section 19-thinking still exists (it has decomposition) but holds no
    // algorithms row; every card is served by the folded deck
    const algos = sections.flatMap((s) => s.decks).find((d) => d.code === "algorithms")!;
    expect(algos.sectionCode).toBe("9-algos");
    expect(algos.count).toBe(2);
    expect(cardsByDeck["algorithms"]).toEqual(["a1", "a2"]);
    const thinking = sections.find((s) => s.code === "19-thinking")!;
    expect(thinking.decks.map((d) => d.code)).toEqual(["decomposition"]);
  });

  test("cards without a corpus deck anchor are skipped; empty input → empty index", () => {
    const { sections, cardsByDeck } = buildDeckSections(
      [card({ id: "orphan", deckSlug: null })],
      [],
    );
    expect(sections).toEqual([]);
    expect(cardsByDeck).toEqual({});
    expect(buildDeckSections([], []).sections).toEqual([]);
  });
});
