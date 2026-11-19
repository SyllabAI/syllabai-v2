/**
 * Chunking law tests (P3, redesign plan §5.2/§6/§8): the budgets of record,
 * the deterministic mapping parity with the P1 arc, and the import-time
 * validateChunkLaw violations (beat budgets, mandatory beats, mappability,
 * interaction cadence). The law module is the SINGLE SOURCE shared by the
 * renderer, the import runner's G-CHUNK gate and the QA census — these tests
 * pin it so none of the three can drift.
 */
import { describe, expect, it } from "bun:test";

import {
  KP_PAIR_WORD_BUDGET,
  BEAT_WORD_BUDGET,
  wordCount,
  keyPointGroups,
  practiceTokens,
  mapChecksToGroups,
  validateChunkLaw,
} from "./guided-chunk-law";

describe("chunking-law budgets of record (plan §5.2/§6)", () => {
  it("carries the plan's constants", () => {
    expect(KP_PAIR_WORD_BUDGET).toBe(30);
    expect(BEAT_WORD_BUDGET).toBe(45);
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("  spaced   out  ")).toBe(2);
  });

  it("pairs two key points only when BOTH fit the 30-word budget (greedy, authored order)", () => {
    const shortA = "Particles gain energy when heated.";
    const shortB = "Forces overcome the lattice.";
    const long = "This key point is deliberately far over the thirty word pairing budget so it can never share a card with its neighbour under any greedy pass of the pairing law.";
    const groups = keyPointGroups([shortA, shortB, long]);
    expect(groups).toEqual([[shortA, shortB], [long]]);
    // a long point never pairs, even when followed by a short one
    expect(keyPointGroups([long, shortA])).toEqual([[long], [shortA]]);
  });
});

describe("check→key-point mapping parity (plan §5.2)", () => {
  const groups = keyPointGroups([
    "Potassium ions give a lilac flame test.",
    "Sodium ions give a yellow flame test.",
    "Copper ions give a green flame test.",
  ]);

  it("tokenizes like the arc: stopwords stripped, plural-trimmed, punctuation-free", () => {
    expect(practiceTokens("The Ions give Lilac flames!")).toEqual(["ion", "give", "lilac", "flame"]);
  });

  it("maps a check whose words live in ONE group clearly, and withholds ties", () => {
    const lilac = {
      id: "q1",
      stem: "Which ion gives a lilac flame?",
      options: [
        { key: "a", text: "K+", correct: true, explanation: "", misconception: null },
        { key: "b", text: "Na+", correct: false, explanation: "", misconception: null },
      ],
    };
    const tie = {
      id: "q2",
      stem: "Which ion gives a flame?",
      options: [{ key: "a", text: "ion", correct: true, explanation: "", misconception: null }],
    };
    const mapped = mapChecksToGroups(groups, [lilac, tie]);
    expect(mapped.get("q1")).toBe(0);
    expect(mapped.has("q2")).toBeFalse(); // no clear winner — end block (conservative law)
  });

  it("keeps a check with zero keyword overlap in the end block", () => {
    const alien = { id: "q3", stem: "Name the apparatus used to measure volume of gas.", options: [] };
    expect(mapChecksToGroups(groups, [alien]).has("q3")).toBeFalse();
  });
});

/** Synthetic lesson builder shaped exactly like the hub lesson artifact. */
function lesson(overrides: Record<string, unknown> = {}, modules: Record<string, unknown>[] = []) {
  return {
    lesson: {
      id: "rn_x::lesson",
      primer: { text: "You already balanced simple equations.", prerequisiteSubtopic: "Moles" },
      modules,
      ...overrides,
    },
  };
}

function module(overrides: Record<string, unknown> = {}) {
  return {
    id: "rn_x::L1",
    title: "Flame tests",
    opening: "Here is what this lesson covers: the flame tests and the colours they give.",
    keyPoints: ["Potassium ions give a lilac flame test.", "Sodium ions give a yellow flame test."],
    depthLayers: {
      low: { restatement: "Flame tests identify metal ions.", analogy: "Like recognizing a friend by their voice.", examPointer: "Learn the three colours for paper 2." },
      medium: { restatement: "The electron falls back and emits photons.", analogy: "Neon signs work the same way.", examPointer: "6-mark questions ask for the full chain." },
    },
    checkRefs: ["rn_x::L1::Q1", "rn_x::L1::Q2"],
    specRefs: ["4CH1-1.25"],
    ...overrides,
  };
}

describe("validateChunkLaw — the §8 import-time law", () => {
  it("passes a compliant lesson with zero violations and sane signals", () => {
    const m = module();
    const r = validateChunkLaw(lesson({}, [m]));
    expect(r.violations).toEqual([]);
    expect(r.signals.modules).toBe(1);
    expect(r.signals.keyPoints).toBe(2);
    expect(r.signals.bridgeWords).toBe(5);
    expect(r.signals.interleaveRate).toBeNull(); // no questions supplied
  });

  it("flags an over-budget opener, bridge, key point and depth layer with the plan citations", () => {
    const long = "word ".repeat(60).trim();
    const r = validateChunkLaw(
      lesson({ primer: { text: "word ".repeat(50).trim(), prerequisiteSubtopic: "Moles" } }, [
        module({
          opening: long,
          keyPoints: [long],
          depthLayers: {
            low: { restatement: long, analogy: "short analogy", examPointer: "short pointer" },
            medium: { restatement: "ok", analogy: "ok", examPointer: "ok" },
          },
        }),
      ]),
    );
    const laws = r.violations.map((v: { law: string }) => v.law);
    expect(laws).toContain("bridge-beat-45");
    expect(laws).toContain("opener-beat-45");
    expect(laws).toContain("key-point-30");
    expect(laws).toContain("beat-45");
    expect(r.signals.openerMaxWords).toBe(60);
  });

  it("flags missing mandatory beats per band (§8)", () => {
    const r = validateChunkLaw(lesson({}, [
      module({ depthLayers: { low: { restatement: "only this" }, medium: { restatement: "and this" } } }),
    ]));
    const missing = r.violations.filter((v: { law: string }) => v.law === "mandatory-beats");
    expect(missing.length).toBe(4); // low: analogy+examPointer, medium: analogy+examPointer
  });

  it("flags mappability: checks with zero mapped groups, and key-point-less modules", () => {
    const q = {
      id: "rn_x::L1::Q1",
      moduleId: "rn_x::L1",
      stem: "Name the apparatus used to measure gas volume.",
      options: [{ key: "a", text: "gas syringe", correct: true, explanation: "", misconception: null }],
    };
    const noMap = validateChunkLaw(lesson({}, [module()]), new Map([["rn_x::L1", [q]]]));
    expect(noMap.violations.some((v: { law: string }) => v.law === "mappability")).toBeTrue();
    expect(noMap.signals.checks).toBe(1);

    const noKp = validateChunkLaw(lesson({}, [module({ keyPoints: [] })]), new Map([["rn_x::L1", [q]]]));
    expect(noKp.violations.some((v: { law: string; detail: string }) => v.law === "mappability" && v.detail.includes("no key points"))).toBeTrue();
  });

  it("enforces the §8 interaction cadence only once a module carries interactions[]", () => {
    const qs = [1, 2, 3, 4].map((i) => ({
      id: `rn_x::L1::Q${i}`,
      moduleId: "rn_x::L1",
      stem: `Which ion gives a lilac flame test number ${i}?`,
      options: [{ key: "a", text: "potassium ions", correct: true, explanation: "", misconception: null }],
    }));
    const withOne = qs.map((q, i) => (i === 0 ? { ...q, interactions: [{ kind: "sort-match", items: [{ id: "1", text: "a" }, { id: "2", text: "b" }], correctOrder: ["1", "2"] }] } : q));
    const below = validateChunkLaw(lesson({}, [module()]), new Map([["rn_x::L1", withOne]]));
    expect(below.violations.some((v: { law: string }) => v.law === "interaction-cadence")).toBeTrue();
    expect(below.signals.interactionChecks).toBe(1);

    const withTwo = withOne.map((q, i) => (i === 1 ? { ...q, interactions: [{ kind: "sort-match", items: [{ id: "1", text: "a" }, { id: "2", text: "b" }], correctOrder: ["1", "2"] }] } : q));
    const ok = validateChunkLaw(lesson({}, [module()]), new Map([["rn_x::L1", withTwo]]));
    expect(ok.violations.filter((v: { law: string }) => v.law === "interaction-cadence")).toEqual([]);

    const none = validateChunkLaw(lesson({}, [module()]), new Map([["rn_x::L1", qs]]));
    expect(none.violations.filter((v: { law: string }) => v.law === "interaction-cadence")).toEqual([]);
  });
});
