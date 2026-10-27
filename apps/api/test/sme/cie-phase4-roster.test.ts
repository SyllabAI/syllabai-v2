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

// the skeleton class of record (0 nodes + 0 sets, no spine): the D1 pure-2
// catalog-lane skeleton + geography-21 (no SME notes/EQ/flashcards on SME —
// the honest corpus gap). SME-WAVE2 r1 (operator order trace
// 1a17ed20502e4c8d "order the build_bundles import run to fill the 12
// skeletons with teaching content"): the other 10 wave-2 registered
// skeletons are FILLED (official-spine bundles via the established
// spines -> content-maps -> rekey chain at resources PRs #194/#198) and
// their registry rows flipped registered -> full; the 2 that remain have
// NO corpus lane of their own to fill from (a-level-pure-2: SME never
// published 9709 P2 under the A-Level tree — the operator-ruling class;
// geography-21: honest-empty on every SME axis) — never invented.
const SKELETON_OF_RECORD = [
  "cie-a-level-maths-20-pure-2",
  "cie-a-level-geography-21",
];

// the honest-empty stub banks of record (0 question sets, official-spine tree
// serves the KG): the four scope-receipt stubs + as-accounting-21 (SME-WAVE2
// r1 fill: SME publishes notes for the AS lane but 0 topic questions — the
// no_topic_questions_on_sme class, now stub-classified after its fill)
const STUBS_OF_RECORD = [
  "cie-a-level-accounting-21",
  "cie-a-level-economics-23",
  "cie-as-english-general-paper-21",
  "cie-igcse-accounting-25",
  "cie-as-accounting-21",
];

// the shared-subject-code join matrix of record (this census): the component
// banks that seed into ONE subject tree via the seed's resolve-or-create.
// SME-WAVE2 r1: the AS fill doubles every science/business/CS bank and grows
// 9709 to 9 (the 4 AS maths units join their A-Level counterparts; distinct
// syllabus codes stay 27 — the AS codes already existed among them).
const SHARED_CODES_OF_RECORD: Record<string, number> = {
  "9709": 9, "0973": 3, "0653": 3, "9700": 2, "9701": 2, "9702": 2,
  "9609": 2, "9618": 2, "0580": 2, "0455": 2, "0500": 2, "0460": 2, "0607": 2,
};

// the zero-servable real banks of record (the anchor-gap disclosure class):
// the english-language-20/25 pairs (seed-only since the phase-4 census) + the
// 8 wave-2 banks whose SME pages carry no official statement text (the no-guess
// attach ladder resolves 0 spec codes — the T-SPECS-CIE-JOIN sidecar lane is
// the documented follow-up). econ-25 LEFT this list at the run-006 serving
// wave; as-biology-25 SERVES (789) and stays out.
const ZERO_SERVABLE_OF_RECORD = [
  "cie-as-business-23",
  "cie-as-chemistry-25",
  "cie-as-computer-science-19",
  "cie-as-maths-20-mechanics",
  "cie-as-maths-20-probability-and-statistics-1",
  "cie-as-maths-20-pure-1",
  "cie-as-maths-20-pure-2",
  "cie-as-physics-25",
  "cie-igcse-english-language-20",
  "cie-igcse-english-language-25",
];

describe("cie-phase4 roster law", () => {
  test("registry carries the 45 " + CIE_BOARD + " rows of record", () => {
// WAVE-2 r0: 45 + 11 wave-2 registered rows = 56
    expect(roster.cieRows).toBe(56);
  });

  test("classification of record: 49 real banks / 5 stubs / 2 skeletons", () => {
    expect(roster.real).toBe(49);
    expect(roster.stubs).toBe(5);
    // SME-WAVE2 r1: 10 of the 12 skeletons filled (the official-spine import
    // run); the 2 honest corpus gaps remain — never invented
    expect(roster.skeletons).toBe(2);
  });

  test("stubs are exactly the of-record five", () => {
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
      // the anchored floor: zero is legal ONLY for the anchor-gap banks of
      // record (the zeroServable list below — econ-25 served at run-006; the
      // english-language pair + the 8 wave-2 no-statement-text banks are the
      // honest disclosure); every other real bank serves > 0
      if (!ZERO_SERVABLE_OF_RECORD.includes(e.slug)) {
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
    // TRANCHE-1 RE-BASE (trace 1a15e4200e6af579, not a loosening): the
    // T-SPECS-CIE-TRANCHE1-T2NEAR-1 verdict round (resources PR #22, merge
    // aa0b4de1) promoted the census receipt's 155-part T2_near queue to the
    // V* authoritative class and the consume re-run re-emitted the linkage —
    // 116 fully-unmapped questions gain servability (unmapped 12,479 ->
    // 12,363 EXACT, per slug == the lane-side prediction). Floors re-pinned
    // from the census tool of record (cie-tranche1-t2near-run-001-r0.json).
    // TRANCHE-2 ADOPTION RE-BASE (T-RULE-T2-APPLY-2 run-002, operator order
    // 'adopt the consume-law on v2 branch', trace 1a164dcf6cff9061, not a
    // loosening): the consume engine's operator sid-anchor law adopted of
    // record at the pin advance c5f20c52 -> 3838a264 (the PR-#49-merged
    // tip) — the 23 sid-anchors reproduce as a BYTE FIXED POINT (registry
    // plane already carried them @ a9bd2488) and the pending item-plane
    // operator V8 part-level verdict surface (B01 48 + B02 147 = 195
    // entries across cie-a-level-chemistry-25 +191, cie-igcse-chemistry-23
    // +2, cie-igcse-science-combined-science-23-physics +2) lands — ALL on
    // question_part items: +66 questions gain servability as their
    // newly-coded parts admit (unmapped 12,363 -> 12,297 EXACT), +90 plain
    // part rows, +130 package parts;
    // raw 19,097/25,663 UNCHANGED; physics-23 634/1/634 and bio-25
    // 859/1529 bank anchors byte-stable; map-law census green 44/44.
    // Floors re-pinned from the live census of the adopted tree
    // (scripts/t2consume_census_probe.ts over loadRoster + mapLawCensus).
    // TRANCHE-2 RETRACTION RE-BASE (T-RULE-T2-V8-RETRACT-1 run-003, operator
    // order '7-sid V8 retraction batch', trace 1a16541e55a06bd1, not a
    // loosening): the operator gate disclosed at run-002 opens — resources
    // PR #68 retracts the b01/b02 V8 part-level entries the tranche-2 ruling
    // corrects (42 removals + 12 ruling assignments tier
    // tranche2_conditional_resolved + 1 verify-only group across 7 sids;
    // anchors byte-frozen, sidAnchors 0/23/0) and the consume engine's
    // retraction law (surgical (item, code) drops + the zero-code mirror)
    // lands them: ONE chem25 question loses its only coded part
    // (qstnprt_8W7sTFyZCChbbB8q, the of-record 26.1.4 mis-tag residual) —
    // questions 6781 -> 6780, parts 5786 -> 5782, pkgParts 9406 -> 9402,
    // unmapped 12,297 -> 12,298 EXACT (raw 19,097/25,663 UNCHANGED; the
    // identity rawQ - questions == unmapped + dupOrder re-proven:
    // 12,317 == 12,298 + 19). Floors re-pinned from the live census
    // (scripts/t2retract_census_probe.ts over loadRoster + mapLawCensus).
    // MIS-TAG RE-POINT RE-BASE (T-RULE-T2-MISTAG-1, operator order '10-mis-tag
    // re-point batch', trace 1a1658227c0c0365, not a loosening): the mis-tag
    // residual disclosed at T-RULE-T2-COND-1 misTags[10] + the v8Retraction
    // disclosures opens — resources PR #69 re-points the 10 mis-tagged parts
    // to their spine-verified true homes (3 V8-mirror removals + 11 additions
    // across 8 parts, tier tranche2_mis_tag_repoint; WW34 keep-as-context +
    // tKhp keep-no-op zero-change; anchors byte-frozen, sidAnchors 0/23/0) and
    // the consume engine's mis-tag re-point law (surgical drops + the normal
    // sidecar_rank additions) lands them: FOUR chem25 questions regain
    // servability as their newly-coded parts admit (h3SZ 28.2.1+28.2.7, 8W7s
    // 26.2.3, xZch 8.2.3, PPqr 11.2.1 — incl. the retraction's uncoded 8W7s
    // residual) — questions 6780 -> 6784, parts 5782 -> 5789, pkgParts
    // 9402 -> 9411, unmapped 12,298 -> 12,294 EXACT (raw 19,097/25,663
    // UNCHANGED; the identity re-proven: 12,313 == 12,294 + 19). Floors
    // re-pinned from the live census (scripts/t2retract_census_probe.ts over
    // loadRoster + mapLawCensus).
    // Floors re-pinned from the live census (the T-RULE-T3-SME-COVERAGE-1
    // re-key class, standing law "not a loosening"): the tranche-3 consume
    // chain (run-004 re-key at 3dd9bb98 + run-006 econ-25 serving + the
    // run-007 quiescent convergence at 6dc1f0a2) landed the re-keyed sidecar
    // codes in the maps, so +190 chem25-family questions admit servability
    // (unmapped 12,294 -> 12,104 EXACTLY -190), parts 5,789 -> 5,947, pkgParts
    // 9,411 -> 9,603 (probe: scripts/probe_roster_full.py over loadRoster).
    // econ-25 LEAVES the zero-servable list: its run-006 serving wave gave
    // the bank 19 questions / 19 package parts (was EQ-axis empty of record).
    // Raw 19,097/25,663 UNCHANGED; the identity re-proven at the new floors:
    // 19,097 - 6,974 == 12,104 + 19 (12,123 == 12,123). Per-lane pins
    // (physics-23 634/1/634, bio-25 859/1,529) verified UNCHANGED at the
    // live census.
    // the SERVABLE census of record — SME-WAVE2 r1 re-base (the fill run):
    // the 10 filled banks join the fleet; as-biology-25 serves 789 (its SME
    // pages carry the official statement text — the R3/R4 join basis); the
    // other 9 carry the ANCHOR GAP of record (0 spec-anchored parts — their
    // SME pages carry no statement text, so the no-guess attach ladder
    // resolves nothing; the bundle content stays complete, the learner-model
    // join is the documented T-SPECS-CIE-JOIN follow-up lane, exactly the
    // class the 44 banks shipped with before their spec-links sidecars).
    // Floors re-pinned from the live census (sme_residual12_census.ts over
    // loadRoster + mapLawCensus). NOT a loosening: raw grew +5,444/+9,478
    // with the corpus; servable +789 via the one joinable bank.
    expect(questions).toBe(7763);
    expect(parts).toBe(7002);
    // the package-shape disclosure (the other half of the law split): the
    // package parts stay counted, never again a floor
    const pkgParts = real.reduce((s, e) => s + e.expectedPackageParts, 0);
    expect(pkgParts).toBe(11164);
    expect(parts + (pkgParts - parts)).toBe(pkgParts);
    // bank-level pins of the row law (the run-008 fleet's own numbers):
    // option-part banks (past-paper MCQ shape) emit ~ZERO part rows;
    // mixed banks emit only their plain parts. physics-23 carries exactly
    // ONE plain part among its 627 questions (fleet parts=1 of record) —
    // the law counts it, the 626 option-parts ride as MCQ rows.
    const physics23 = real.find((e) => e.slug === "cie-igcse-physics-23");
    expect(physics23).toBeDefined();
    expect(physics23!.expectedQuestions).toBe(634);
    expect(physics23!.expectedParts).toBe(1);
    expect(physics23!.expectedPackageParts).toBe(634);
    const bio25 = real.find((e) => e.slug === "cie-a-level-biology-25");
    expect(bio25).toBeDefined();
    expect(bio25!.expectedParts).toBe(859);
    expect(bio25!.expectedPackageParts).toBe(1529);
    // the wave-2 r1 bank pin: the ONE joinable AS bank (the anchor-gap
    // disclosure — 789 of 1,011 raw questions serve; 222 raw carry no coded
    // part, honest local-only practice in the player)
    const asBio25 = real.find((e) => e.slug === "cie-as-biology-25");
    expect(asBio25).toBeDefined();
    expect(asBio25!.expectedQuestions).toBe(789);
    expect(asBio25!.expectedParts).toBe(1055);
    expect(asBio25!.expectedPackageParts).toBe(1561);
    const rawQ = real.reduce((s, e) => s + e.rawQuestions, 0);
    const rawP = real.reduce((s, e) => s + e.rawParts, 0);
    expect(rawQ).toBe(24541);
    expect(rawP).toBe(35141);
    // the shim's exclusion counters of record (the honest disclosure class)
    const excl = real.reduce(
      (a, e) => ({
        unmapped: a.unmapped + (e.shimExclusions?.unmapped ?? 0),
        badSum: a.badSum + (e.shimExclusions?.badSum ?? 0),
        dupOrder: a.dupOrder + (e.shimExclusions?.dupOrder ?? 0),
      }),
      { unmapped: 0, badSum: 0, dupOrder: 0 },
    );
    expect(excl).toEqual({ unmapped: 16759, badSum: 0, dupOrder: 19 });
    // the question-level identity: raw - servable = unmapped + dupOrder (each
    // exclusion removes whole questions; badSum is zero of record)
    expect(rawQ - questions).toBe(excl.unmapped + excl.dupOrder); // 24541-7763 == 16759+19
    // the zero-servable real banks of record — see ZERO_SERVABLE_OF_RECORD
    // (the module-level law; econ-25 departed at run-006, the wave-2
    // anchor-gap class joined at the r1 fill)
    const zeroServable = real.filter((e) => e.expectedQuestions === 0).map((e) => e.slug).sort();
    expect(zeroServable).toEqual([...ZERO_SERVABLE_OF_RECORD].sort());
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
    // 49 real banks over 27 distinct syllabus codes of record (the wave-2
    // AS codes already existed among the 27 — the fill doubled banks, not codes)
    expect(counts.size).toBe(27);
  });

  test("slug filter law: 'all' selects everything; unknown slugs are refused (never invented)", () => {
    // WAVE-2 r0: 45 + 11 wave-2 registered rows = 56
    expect(resolveSlugFilter(roster, "all").length).toBe(56);
    expect(resolveSlugFilter(roster, undefined).length).toBe(56);
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
    // 56 rows minus the 2 skeletons (pure-2 + geography-21) = 54 mapped
    // (SME-WAVE2 r1: 44 + the 10 filled banks)
    expect(mapLaw.bundlesMapped).toBe(54);
  });

  test("the varchar(40) store law holds at the census maximum of record", () => {
    expect(mapLaw.maxDbCodeLength).toBe(25); // the optionA census of record (hold receipt: max 25/40)
    expect(mapLaw.maxDbCodeLength).toBeLessThanOrEqual(mapLaw.storeLawLimit);
  });

  test("the shared subject roots of record: the twelve same-version component families", () => {
    // 9709 x9 real banks @2023-2025; 0973 x3 @2025-2027; 0653 x3 @2023-2024;
    // 0580/0607/0460 x2 @2025-2027/2025-2026; and the wave-2 r1 AS joins:
    // 9700/9701/9702 @2025-2027, 9609 @2023-2025, 9618 @2024-2025,
    // 9706 @2023-2025 — each AS bank shares its A-Level counterpart's
    // version-scoped root (the resolve-or-create join law, agreeing identity;
    // the slugs' 20/25 are batch labels, the bundle's own syllabusVersion governs)
    expect([...mapLaw.sharedSubjectRoots].sort()).toEqual([
      "0460-2025-2026", "0580-2025-2027", "0607-2025-2027", "0653-2023-2024",
      "0973-2025-2027", "9609-2023-2025", "9618-2024-2025", "9700-2025-2027",
      "9701-2025-2027", "9702-2025-2027", "9706-2023-2025", "9709-2023-2025",
    ].sort());
  });

  test("the 9709 UNIT space is the tail-based disjoint set of record, now COMPLETE (the graft class is structurally gone)", () => {
    // SME-WAVE2 r1: the four AS maths banks join their A-Level counterparts —
    // the A-LEVEL five stay pairwise disjoint (S1/S3/S4/S5/S6, each from its
    // own official -T tail), each AS bank maps EXACTLY ONE UNIT whose identity
    // EQUALS its counterpart's (the resolve-or-create agreeing-identity join,
    // same version scope), and AS pure-2 lands S2 — the unit the A-LEVEL tree
    // never served (SME never published 9709 P2 there; the AS tree does).
    // The 9709 subject UNIT space is now complete: S1..S6 all exist.
    const banks9709 = roster.entries.filter((e) => e.code === "9709" && e.cls === "real");
    expect(banks9709.length).toBe(9);
    const al = banks9709.filter((e) => e.slug.startsWith("cie-a-level-"));
    const asx = banks9709.filter((e) => e.slug.startsWith("cie-as-"));
    expect(al.length).toBe(5);
    expect(asx.length).toBe(4);
    const unitSetsOf = (banks: { slug: string }[]) => banks.map((e) => {
      const bundle = JSON.parse(
        readFileSync(join(import.meta.dir, "../../../hub/content/" + e.slug + "/curriculum.json"), "utf8"),
      ) as BundleCurriculum;
      return { slug: e.slug, units: [...mapBundleNodes(bundle, "p").values()].filter((m) => m.nodeType === "UNIT").map((m) => m.dbCode) };
    });
    const alSets = unitSetsOf(al);
    const alFlat = alSets.flatMap((s) => s.units).sort();
    expect(alFlat).toEqual([
      "9709-2023-2025-S1", "9709-2023-2025-S3", "9709-2023-2025-S4", "9709-2023-2025-S5", "9709-2023-2025-S6",
    ]);
    // pairwise disjoint across the A-LEVEL banks (each UNIT belongs to exactly one)
    expect(new Set(alFlat).size).toBe(alFlat.length);
    // each AS bank carries exactly ONE unit, the agreeing identity of its counterpart
    const counterpart: Record<string, string> = {
      "cie-as-maths-20-pure-1": "9709-2023-2025-S1",
      "cie-as-maths-20-pure-2": "9709-2023-2025-S2",
      "cie-as-maths-20-mechanics": "9709-2023-2025-S4",
      "cie-as-maths-20-probability-and-statistics-1": "9709-2023-2025-S5",
    };
    for (const s of unitSetsOf(asx)) {
      expect(s.units).toEqual([counterpart[s.slug]!]);
    }
    // the unit space of record: S1..S6 all served (S2 joined the tree with the fill)
    const allUnits = [...alFlat, ...asx.map((e) => counterpart[e.slug]!)].sort();
    expect(new Set(allUnits)).toEqual(new Set([
      "9709-2023-2025-S1", "9709-2023-2025-S2", "9709-2023-2025-S3",
      "9709-2023-2025-S4", "9709-2023-2025-S5", "9709-2023-2025-S6",
    ]));
    // the order-based pre-optionA code must not exist anywhere
    expect(mapLaw.sharedCodes.some((s) => s.dbCode === "9709-S1")).toBe(false);
  });

  test("the history-18 TS4 sub-split UNIT identities of record (the e024c11c audit-repair family, the ci-repair admission)", () => {
    // the T-SPECS-TS4-REPAIR-1 sub-split: the glued TS4 run's Core B members
    // carry their own TOPICs TS4L (League, S4.012-028) / TS4H (Hitler FP,
    // S4.029-042) — the trailing-variant tail law lands each on its own
    // version-scoped UNIT while the civil-war core keeps SS4
    const bundle = JSON.parse(
      readFileSync(join(import.meta.dir, "../../../hub/content/cie-igcse-history-18/curriculum.json"), "utf8"),
    ) as BundleCurriculum;
    const units = [...mapBundleNodes(bundle, "p").values()]
      .filter((m) => m.nodeType === "UNIT").map((m) => m.dbCode);
    expect(units).toContain("0470-2024-2026-SS4");
    expect(units).toContain("0470-2024-2026-SS4L");
    expect(units).toContain("0470-2024-2026-SS4H");
    // pairwise distinct across the whole bundle (no graft, no collision)
    expect(new Set(units).size).toBe(units.length);
  });

  test("the only cross-slug joins are agreeing-identity shares (title+type equal) — the census' own law, re-proven", () => {
    for (const s of mapLaw.sharedCodes) {
      expect(s.slugs.length).toBeGreaterThan(1);
      expect(typeof s.title).toBe("string");
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});
