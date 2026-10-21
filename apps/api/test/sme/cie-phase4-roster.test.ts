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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadRoster, resolveSlugFilter, resolveMode, mapLawCensus, CIE_BOARD } from "../../scripts/cie-phase4-apply";
import { mapBundleNodes } from "../../src/services/curriculum/bundle-seed";
import type { BundleCurriculum } from "../../src/services/curriculum/bundle-seed";

const roster = loadRoster();
// the optionA map-law census of record (the zero-DB identity proof — the
// floors cannot catch the identity defect class; this gate runs it on every
// CI pass so a bundle regression is a RED here, never a mid-fleet surprise)
const mapLaw = mapLawCensus(roster);

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
    // the SERVABLE census of record (the run-006 re-base, the run-008 split):
    // the fleet's floors and drift checks measure the SHIM'S OWN admission
    // output — buildSmePackage is the single admission law (zero-DB,
    // deterministic), so the roster can never diverge from what the ingest
    // will admit. The tranche-2 "anchored" pre-count (6,618 / 9,158)
    // mirrored only the anchor law and drifted by the shim's OTHER honest
    // exclusion classes (badSum, dupOrder — the run-006 COW proof caught
    // 1+1+3+14 on four banks): the servable truth is 6,599 questions.
    // The run-008 COW proof (39538793021, the FIRST full-fleet completion)
    // caught the parts half of the law: the frozen ingest emits
    // option-bearing parts as MCQ QUESTION rows (the -pK MIXED family law)
    // — only PLAIN parts become part ROWS. expectedParts therefore mirrors
    // the EMISSION law by construction: 5,618 part rows of 9,139 package
    // parts (the delta 3,521 = the option-part count, fleet-measured
    // 0-mismatch per bank). The RAW phase-3 census bytes (19,097 / 25,663)
    // stay disclosed on every entry (rawQuestions/rawParts) — the anchor gap
    // is the CIE lane's phase-2 follow-up, made measurable, never hidden.
    expect(questions).toBe(6599);
    expect(parts).toBe(5618);
    // the package-shape disclosure (the other half of the law split): the
    // package parts stay counted, never again a floor
    const pkgParts = real.reduce((s, e) => s + e.expectedPackageParts, 0);
    expect(pkgParts).toBe(9139);
    expect(parts + (pkgParts - parts)).toBe(pkgParts);
    // bank-level pins of the row law (the run-008 fleet's own numbers):
    // option-part banks (past-paper MCQ shape) emit ~ZERO part rows;
    // mixed banks emit only their plain parts. physics-23 carries exactly
    // ONE plain part among its 627 questions (fleet parts=1 of record) —
    // the law counts it, the 626 option-parts ride as MCQ rows.
    const physics23 = real.find((e) => e.slug === "cie-igcse-physics-23");
    expect(physics23).toBeDefined();
    expect(physics23!.expectedQuestions).toBe(627);
    expect(physics23!.expectedParts).toBe(1);
    expect(physics23!.expectedPackageParts).toBe(627);
    const bio25 = real.find((e) => e.slug === "cie-a-level-biology-25");
    expect(bio25).toBeDefined();
    expect(bio25!.expectedParts).toBe(855);
    expect(bio25!.expectedPackageParts).toBe(1513);
    const rawQ = real.reduce((s, e) => s + e.rawQuestions, 0);
    const rawP = real.reduce((s, e) => s + e.rawParts, 0);
    expect(rawQ).toBe(19097);
    expect(rawP).toBe(25663);
    // the shim's exclusion counters of record (the honest disclosure class)
    const excl = real.reduce(
      (a, e) => ({
        unmapped: a.unmapped + (e.shimExclusions?.unmapped ?? 0),
        badSum: a.badSum + (e.shimExclusions?.badSum ?? 0),
        dupOrder: a.dupOrder + (e.shimExclusions?.dupOrder ?? 0),
      }),
      { unmapped: 0, badSum: 0, dupOrder: 0 },
    );
    expect(excl).toEqual({ unmapped: 12479, badSum: 0, dupOrder: 19 });
    // the question-level identity: raw - servable = unmapped + dupOrder (each
    // exclusion removes whole questions; badSum is zero of record)
    expect(rawQ - questions).toBe(excl.unmapped + excl.dupOrder);
    // the zero-servable real banks of record: seed-only by the fleet's
    // ingest-skip law (EQ axis honestly empty of record)
    const zeroServable = real.filter((e) => e.expectedQuestions === 0).map((e) => e.slug).sort();
    expect(zeroServable).toEqual([
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

  // ── the optionA map-law census gate (operator ruling A, trace 1a15b161bf960249) ──

  test("the map-law census is GREEN over the whole fleet (identity-clean before any COW)", () => {
    expect(mapLaw.green).toBe(true);
    expect(mapLaw.reds).toEqual([]);
    expect(mapLaw.bundlesMapped).toBe(44); // 45 rows minus the pure-2 skeleton
  });

  test("the varchar(40) store law holds at the census maximum of record", () => {
    expect(mapLaw.maxDbCodeLength).toBe(25); // the optionA census of record (hold receipt: max 25/40)
    expect(mapLaw.maxDbCodeLength).toBeLessThanOrEqual(mapLaw.storeLawLimit);
  });

  test("the shared subject roots of record: the six same-version component families", () => {
    // 9709 x5 real banks @2023-2025; 0653 x3 @2023-2024; 0973 x3 @2025-2027;
    // 0580 x2 + 0607 x2 @2025-2027; 0460 x2 @2025-2026 (the same generation —
    // the slugs' 20/25 are batch labels, the bundle's own syllabusVersion governs)
    expect([...mapLaw.sharedSubjectRoots].sort()).toEqual([
      "0460-2025-2026", "0580-2025-2027", "0607-2025-2027", "0653-2023-2024", "0973-2025-2027", "9709-2023-2025",
    ]);
  });

  test("the 9709 UNIT space is the tail-based disjoint set of record (the graft class is structurally gone)", () => {
    // pure-2 is the skeleton; the five real banks land S1/S3/S4/S5/S6 — each
    // from its own official -T tail, PAIRWISE DISJOINT (the pre-optionA order
    // law landed all five on 9709-S1 — the graft)
    const banks9709 = roster.entries.filter((e) => e.code === "9709" && e.cls === "real");
    expect(banks9709.length).toBe(5);
    const unitSets = banks9709.map((e) => {
      const bundle = JSON.parse(
        readFileSync(join(import.meta.dir, "../../../hub/content/" + e.slug + "/curriculum.json"), "utf8"),
      ) as BundleCurriculum;
      return [...mapBundleNodes(bundle, "p").values()].filter((m) => m.nodeType === "UNIT").map((m) => m.dbCode);
    });
    const flat = unitSets.flat().sort();
    expect(flat).toEqual([
      "9709-2023-2025-S1", "9709-2023-2025-S3", "9709-2023-2025-S4", "9709-2023-2025-S5", "9709-2023-2025-S6",
    ]);
    // pairwise disjoint across banks (each UNIT belongs to exactly one bank)
    expect(new Set(flat).size).toBe(flat.length);
    // the order-based pre-optionA code must not exist anywhere
    expect(mapLaw.sharedCodes.some((s) => s.dbCode === "9709-S1")).toBe(false);
  });

  test("the only cross-slug joins are agreeing-identity shares (title+type equal) — the census' own law, re-proven", () => {
    for (const s of mapLaw.sharedCodes) {
      expect(s.slugs.length).toBeGreaterThan(1);
      expect(typeof s.title).toBe("string");
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});
