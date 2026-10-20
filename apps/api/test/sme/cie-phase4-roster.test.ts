/**
 * CIE-INTEGRATION phase 4 — the roster/coherence gate for the DB-plane fleet
 * runner (apps/api/scripts/cie-phase4-apply.ts), riding the CI verify lane.
 *
 * Zero-DB by construction: the pins below are the of-record census of the
 * committed bundles + registry (scope receipt
 * CIE-INTEGRATION/cie-frontend-integration-scope-r0.json phase-4 text; the
 * phase-3 receipt counts 19,097 questions / 25,663 parts; the T-MIG-138
 * run-003 receipt's "40 banks" alternative disclosure). A regression in the
 * roster, a broken bundle, or a classification drift fails CI here instead
 * of mid-fleet on a Neon COW.
 */
import { describe, expect, test } from "bun:test";

import { loadRoster, resolveSlugFilter, resolveMode, CIE_BOARD } from "../../scripts/cie-phase4-apply";

const roster = loadRoster();

// the 4 honest-empty stub banks of record (scope receipt stubBanks)
const STUBS_OF_RECORD = [
  "cie-a-level-accounting-21",
  "cie-a-level-economics-23",
  "cie-as-english-general-paper-21",
  "cie-igcse-accounting-25",
];

// the single catalog-lane skeleton of record (0 nodes + 0 sets, no spine)
const SKELETON_OF_RECORD = ["cie-a-level-maths-20-pure-2"];

// the shared-subject-code join matrix of record (this census): the component
// banks that seed into ONE subject tree via the seed's resolve-or-create
const SHARED_CODES_OF_RECORD: Record<string, number> = {
  "9709": 5, "0973": 3, "0653": 3, "0580": 2, "0455": 2, "0500": 2, "0460": 2, "0607": 2,
};

describe("cie-phase4 roster law", () => {
  test("registry carries the 45 " + CIE_BOARD + " rows of record", () => {
    expect(roster.cieRows).toBe(45);
  });

  test("classification of record: 40 real banks / 4 stubs / 1 skeleton", () => {
    expect(roster.real).toBe(40);
    expect(roster.stubs).toBe(4);
    expect(roster.skeletons).toBe(1);
  });

  test("stubs are exactly the of-record four", () => {
    const stubs = roster.entries.filter((e) => e.cls === "stub").map((e) => e.slug).sort();
    expect(stubs).toEqual([...STUBS_OF_RECORD].sort());
  });

  test("the skeleton is exactly the of-record catalog form", () => {
    const skel = roster.entries.filter((e) => e.cls === "skeleton").map((e) => e.slug).sort();
    expect(skel).toEqual([...SKELETON_OF_RECORD].sort());
  });

  test("every real bank is coherent: sets >= 1, nodes > 0, questions/parts floors of record", () => {
    const real = roster.entries.filter((e) => e.cls === "real");
    for (const e of real) {
      expect(e.questionSets).toBeGreaterThan(0);
      expect(e.nodes).toBeGreaterThan(0);
      // the anchored floor: zero is legal ONLY for the three seed-only banks
      // (the anchor gap disclosure); every other real bank serves > 0
      if (!["cie-igcse-economics-25", "cie-igcse-english-language-20", "cie-igcse-english-language-25"].includes(e.slug)) {
        expect(e.expectedQuestions).toBeGreaterThan(0);
      }
    }
    const questions = real.reduce((s, e) => s + e.expectedQuestions, 0);
    const parts = real.reduce((s, e) => s + e.expectedParts, 0);
    // the SERVABLE census of record (the run-003 anchor re-base): the frozen
    // ingest's anchor law excludes spec-unanchored questions (the learner-
    // model join requires primaryTopicCode) — the fleet floors measure the
    // anchored subset: 6,618 questions / 9,158 parts. The RAW phase-3 census
    // bytes (19,097 / 25,663) stay disclosed on every entry (rawQuestions/
    // rawParts) — the anchor gap is the CIE lane's phase-2 follow-up, made
    // measurable, never hidden.
    expect(questions).toBe(6618);
    expect(parts).toBe(9158);
    const rawQ = real.reduce((s, e) => s + e.rawQuestions, 0);
    const rawP = real.reduce((s, e) => s + e.rawParts, 0);
    expect(rawQ).toBe(19097);
    expect(rawP).toBe(25663);
    // the zero-anchored real banks of record: seed-only by the fleet's
    // ingest-skip law (EQ axis honestly empty of record)
    const zeroAnchored = real.filter((e) => e.expectedQuestions === 0).map((e) => e.slug).sort();
    expect(zeroAnchored).toEqual([
      "cie-igcse-economics-25",
      "cie-igcse-english-language-20",
      "cie-igcse-english-language-25",
    ]);
  });

  test("every real bank carries a syllabus code + version (the seed's curriculumCode law)", () => {
    for (const e of roster.entries) {
      expect(e.code).toMatch(/^[0-9]{4}$/);
      expect(e.syllabusVersion.length).toBeGreaterThan(0);
    }
  });

  test("the shared-code join matrix matches the census of record", () => {
    const counts = new Map<string, number>();
    for (const e of roster.entries.filter((x) => x.cls === "real")) {
      counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
    }
    for (const [code, n] of Object.entries(SHARED_CODES_OF_RECORD)) {
      expect(counts.get(code)).toBe(n);
    }
    // 40 real banks over 27 distinct syllabus codes of record
    expect(counts.size).toBe(27);
  });

  test("slug filter law: 'all' selects everything; unknown slugs are refused (never invented)", () => {
    expect(resolveSlugFilter(roster, "all").length).toBe(45);
    expect(resolveSlugFilter(roster, undefined).length).toBe(45);
    const one = resolveSlugFilter(roster, "cie-igcse-chemistry-23");
    expect(one.length).toBe(1);
    expect(one[0]?.code).toBe("0620");
    expect(() => resolveSlugFilter(roster, "not-a-cie-slug")).toThrow(/never invented/);
  });

  // The run-39470460696 regression pin: the gate invokes `--mode apply` as TWO
  // argv tokens (shell word-splitting); the original parser only matched the
  // joined "--mode apply" literal -> usage + exit 2 BEFORE any DB contact
  // (honest red, COW dropped 404-clean, zero writes — the guard held). Every
  // spelling the gate or the sandbox emits must resolve.
  test("mode resolution law: the CI two-token form, the equals form, the joined form, and the bare --apply flag all resolve; garbage is null", () => {
    expect(resolveMode(["--mode", "apply", "--receipt", "cie4-cow-receipt.json"])).toBe("apply");
    expect(resolveMode(["--mode", "dry"])).toBe("dry");
    expect(resolveMode(["--mode=apply"])).toBe("apply");
    expect(resolveMode(["--mode=dry"])).toBe("dry");
    expect(resolveMode(["--apply"])).toBe("apply");
    expect(resolveMode(["--receipt", "p.json"])).toBe(null);
    expect(resolveMode([])).toBe(null);
  });
});
