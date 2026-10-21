import { describe, expect, test } from "bun:test";
import {
  ALL_ON_FILTER,
  countActiveFilterTerms,
  deckSessionKey,
  filterCardIds,
  isFilterAllOn,
  matchesCardFilter,
  mistakesOnlyFilter,
  normalizeFilter,
  validateSessionAgainstDeck,
  type DeckCardFilter,
  type DeckSessionState,
} from "./flashcard-session";

/** Pure laws for the deck player's session state (DC-8 + DC-11). The
 *  storage wrappers are browser-guarded thin I/O — covered end-to-end by
 *  the deck-flow E2E reload pins, not here. */

type FixtureSchedule = { rating: "still-learning" | "know"; due: boolean };

const SCHEDULES: Record<string, FixtureSchedule | undefined> = {
  "c-know": { rating: "know", due: false },
  "c-know-due": { rating: "know", due: true },
  "c-sl": { rating: "still-learning", due: true },
  "c-sl-fresh": { rating: "still-learning", due: false },
};

const TYPES: Record<string, string | null> = {
  "c-know": "qa",
  "c-know-due": "tf",
  "c-sl": "qa",
  "c-sl-fresh": "kd",
  "c-new": null,
};

const LOOKUP = {
  scheduleOf: (id: string): FixtureSchedule | undefined => SCHEDULES[id],
  typeOf: (id: string): string | null => TYPES[id] ?? null,
};

describe("matchesCardFilter", () => {
  test("all-on filter matches everything", () => {
    expect(isFilterAllOn(ALL_ON_FILTER)).toBe(true);
    expect(matchesCardFilter({ state: "know", due: false, cardType: "qa" }, ALL_ON_FILTER)).toBe(true);
    expect(matchesCardFilter({ state: "not-viewed", due: false, cardType: null }, ALL_ON_FILTER)).toBe(true);
  });

  test("state axis: unchecking a bucket drops exactly that bucket", () => {
    const f: DeckCardFilter = { ...ALL_ON_FILTER, states: { "not-viewed": true, "still-learning": true, "know": false } };
    expect(matchesCardFilter({ state: "know", due: false, cardType: null }, f)).toBe(false);
    expect(matchesCardFilter({ state: "not-viewed", due: false, cardType: null }, f)).toBe(true);
  });

  test("due axis ORs over the state axis", () => {
    const f = mistakesOnlyFilter(); // still-learning + due, know/not-viewed off
    expect(matchesCardFilter({ state: "still-learning", due: true, cardType: null }, f)).toBe(true);
    expect(matchesCardFilter({ state: "know", due: false, cardType: null }, f)).toBe(false);
    // an aged know (due again) matches through the due axis — the revisit analog
    expect(matchesCardFilter({ state: "know", due: true, cardType: null }, f)).toBe(true);
    expect(matchesCardFilter({ state: "not-viewed", due: false, cardType: null }, f)).toBe(false);
  });

  test("type scope ANDs in; untyped cards only match when null is selected", () => {
    const f: DeckCardFilter = { ...ALL_ON_FILTER, cardTypes: ["qa"] };
    expect(matchesCardFilter({ state: "know", due: false, cardType: "qa" }, f)).toBe(true);
    expect(matchesCardFilter({ state: "know", due: false, cardType: "tf" }, f)).toBe(false);
    expect(matchesCardFilter({ state: "know", due: false, cardType: null }, f)).toBe(false);
    const withUntyped: DeckCardFilter = { ...ALL_ON_FILTER, cardTypes: ["qa", null] };
    expect(matchesCardFilter({ state: "know", due: false, cardType: null }, withUntyped)).toBe(true);
  });

  test("active-term count: restrictions only", () => {
    expect(countActiveFilterTerms(ALL_ON_FILTER)).toBe(0);
    expect(countActiveFilterTerms(mistakesOnlyFilter())).toBe(2); // know + not-viewed off
    expect(countActiveFilterTerms({ ...ALL_ON_FILTER, due: false })).toBe(1);
    expect(countActiveFilterTerms({ ...ALL_ON_FILTER, cardTypes: ["qa"] })).toBe(1);
  });
});

describe("filterCardIds", () => {
  const order = ["c-know", "c-know-due", "c-sl", "c-sl-fresh", "c-new"];

  test("all-on short-circuits to a copy of the order", () => {
    const out = filterCardIds(order, ALL_ON_FILTER, LOOKUP);
    expect(out).toEqual(order);
    expect(out).not.toBe(order);
  });

  test("null filter (pre-hydration) behaves as all-on", () => {
    expect(filterCardIds(order, null, LOOKUP)).toEqual(order);
  });

  test("mistakes preset keeps still-learning ∪ due, in run order", () => {
    // c-sl-fresh is still-learning too (the bucket, not the due flag, matches)
    expect(filterCardIds(order, mistakesOnlyFilter(), LOOKUP)).toEqual(["c-know-due", "c-sl", "c-sl-fresh"]);
  });

  test("type scope filters within the state result", () => {
    const f: DeckCardFilter = { ...mistakesOnlyFilter(), cardTypes: ["tf"] };
    expect(filterCardIds(order, f, LOOKUP)).toEqual(["c-know-due"]);
  });
});

describe("normalizeFilter", () => {
  test("round-trips a written filter", () => {
    const f = mistakesOnlyFilter({ cardTypes: ["qa", null] });
    expect(normalizeFilter(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });

  test("null passes through as unfiltered", () => {
    expect(normalizeFilter(null)).toBeNull();
  });

  test("rejects mangled shapes instead of over-narrowing", () => {
    expect(normalizeFilter(undefined)).toBeNull();
    expect(normalizeFilter("know")).toBeNull();
    expect(normalizeFilter({ states: { "not-viewed": true } })).toBeNull(); // missing keys
    expect(normalizeFilter({ states: { "not-viewed": true, "still-learning": true, know: "yes" }, due: true })).toBeNull();
    expect(normalizeFilter({ states: { "not-viewed": true, "still-learning": true, "know": true }, due: "yes" })).toBeNull();
    expect(normalizeFilter({ states: { "not-viewed": true, "still-learning": true, "know": true }, due: true, cardTypes: "qa" })).toBeNull();
    expect(normalizeFilter({ states: { "not-viewed": true, "still-learning": true, "know": true }, due: true, cardTypes: [42] })).toBeNull();
  });

  test("accepts an all-false state axis (explicit empty run)", () => {
    const f = normalizeFilter({
      states: { "not-viewed": false, "still-learning": false, "know": false },
      due: false,
      cardTypes: null,
    });
    expect(f?.states["know"]).toBe(false);
    expect(f?.due).toBe(false);
  });
});

describe("session validation", () => {
  const deck = new Set(["a", "b", "c"]);
  const session = (order: string[], pos = 0): DeckSessionState => ({ v: 1, order, pos, filter: null, at: 1 });

  test("a set-equal run restores", () => {
    expect(validateSessionAgainstDeck(session(["c", "a", "b"]), deck)).toBe(true);
    expect(validateSessionAgainstDeck(session(["a", "b", "c"], 2), deck)).toBe(true);
  });

  test("a stale run is discarded — never silently hides or phantoms cards", () => {
    expect(validateSessionAgainstDeck(session(["a", "b"]), deck)).toBe(false); // missing c
    expect(validateSessionAgainstDeck(session(["a", "b", "c", "d"]), deck)).toBe(false); // phantom d
    expect(validateSessionAgainstDeck(session(["a", "a", "b"]), deck)).toBe(false); // duplicate hides c
    expect(validateSessionAgainstDeck(session([]), deck)).toBe(false);
    expect(validateSessionAgainstDeck(session([]), new Set())).toBe(true); // degenerate empty deck
  });

  test("key namespacing keeps decks and courses apart", () => {
    expect(deckSessionKey("igcse-chemistry-19", "4CH1-S1-e")).toBe("syllabai-hub:deck-position:igcse-chemistry-19:4CH1-S1-e");
    expect(deckSessionKey("igcse-chemistry-19", "4CH1-2:SUB_")).not.toBe(deckSessionKey("igcse-chemistry-19", "4CH1-2"));
  });
});
