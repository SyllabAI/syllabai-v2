/**
 * validate_cie_bundles.ts — the CIE-INTEGRATION course-catalog card's validator.
 *
 * Carries the card's paper-count assertions of record (operator trace
 * 1a15602e470f4d31 "extend validate_cie_bundles.ts with the card's paper-count
 * assertions"). Run in the prebuild chain (package.json verify:cie) and in CI —
 * a regression in the CIE corpus mapping, registry posture, or bundle shape
 * fails the build before any deploy.
 *
 * Sources of truth:
 *   - the card: .syllabai/receipts/CIE-INTEGRATION/cie-course-catalog-pastpapers-scope-r0.json
 *     (commit bbf5e91) — course set, per-course paper counts, coverage, posture
 *   - the committed index: src/data/pastpapers-index.json (treeSha 3063c7169c16)
 *   - the cover-verified corrections made at execution (Task-62 receipt):
 *       0580 tier law Core=[1,3] / Extended=[2,4] (the card's A3 said 1-2/3-4 —
 *       the QP covers print Paper 1/3 (Core) and Paper 2/4 (Extended))
 *   - re-verification census (cie_card_reverify.py): ALL GREEN
 *
 * Zero-tolerance: any FAIL exits 1.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  allArchiveSpecs,
  corpusIndex,
  corpusPapersForCourse,
} from "../src/lib/pastpapers-corpus";
import { parseCieDir } from "../src/lib/pastpapers-shared";

const HUB = process.cwd();
const CONTENT = path.join(HUB, "content");

let fails = 0;
function check(name: string, ok: boolean, detail = ""): void {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`${tag}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails++;
}

/**
 * T-SM-BRIDGE-WIDEN r0 (operator order trace 1a163786bda7a699, 2026-10-22):
 * "button visible in more courses sooner, without teacher queue, we will
 * tackle that later on" — the operator-keyed coreBridge law of record now
 * carries TRUE on these 21 CIE rows (bank-verified point-scheme courses:
 * every row's sme-eq refs exist in the v2 bank under a VALIDATED mark
 * scheme; counts in the receipt of record). The Wave-3 band-scheme rows
 * stay coreBridge-absent pending the levels-of-response ADR — this pin
 * continues to enforce that exclusion.
 */
const BRIDGED_CIE_SLUGS: readonly string[] = [
  "cie-a-level-biology-25",
  "cie-a-level-chemistry-25",
  "cie-a-level-computer-science-19",
  "cie-a-level-maths-20-mechanics",
  "cie-a-level-maths-20-probability-and-statistics-1",
  "cie-a-level-maths-20-probability-and-statistics-2",
  "cie-a-level-maths-20-pure-1",
  "cie-a-level-maths-20-pure-3",
  "cie-a-level-physics-25",
  "cie-igcse-accounting-21",
  "cie-igcse-biology-23",
  "cie-igcse-chemistry-23",
  "cie-igcse-computer-science-23",
  "cie-igcse-further-maths-additional-maths-25",
  "cie-igcse-ict-21",
  "cie-igcse-maths-25-core",
  "cie-igcse-maths-25-extended",
  "cie-igcse-maths-international-maths-23-core",
  "cie-igcse-maths-international-maths-23-extended",
  "cie-igcse-physics-23",
  "cie-igcse-science-combined-science-23-biology",
  "cie-igcse-science-combined-science-23-chemistry",
  "cie-igcse-science-combined-science-23-physics",
  "cie-igcse-science-co-ordinated-sciences-double-award-23-biology",
  "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry",
  "cie-igcse-science-co-ordinated-sciences-double-award-23-physics",
];

/**
 * T-SM-EDX-INGEST-R1 run-001 (operator order trace 1a16ece951b064c9,
 * 2026-10-25): the 28 Edexcel point-scheme rows that passed the FAMILY gate
 * (census_gate_families.ts: included == banked == validated over the member
 * ref families of the hub join law) and join the coreBridge law of record.
 * The Wave-3 band-scheme rows (9609, 8291, 0450, 0264, 0455x2, 0475, 0680,
 * 0460x2, 0470, 0490, 4BS1, 4EA1, 4ET1, 4GE1) STAY coreBridge-absent pending
 * the levels-of-response ADR — this pin continues to enforce that exclusion.
 */
const BRIDGED_R1_EDX_SLUGS: readonly string[] = [
  "ial-biology-18",
  "ial-chemistry-17",
  "ial-further-maths-18-further-pure-1",
  "ial-maths-20-decision-1",
  "ial-maths-20-mechanics-1",
  "ial-maths-20-mechanics-2",
  "ial-maths-20-pure-1",
  "ial-maths-20-pure-2",
  "ial-maths-20-pure-3",
  "ial-maths-20-pure-4",
  "ial-maths-20-statistics-1",
  "ial-maths-20-statistics-2",
  "ial-physics-19",
  "igcse-accounting-17-financial-statements",
  "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
  "igcse-biology-modular-24-unit-1",
  "igcse-biology-modular-24-unit-2",
  "igcse-chemistry-modular-24-unit-1",
  "igcse-chemistry-modular-24-unit-2",
  "igcse-economics-17",
  "igcse-further-maths-19",
  "igcse-ict-17",
  "igcse-maths-a-modular-24-foundation-unit-1",
  "igcse-maths-a-modular-24-foundation-unit-2",
  "igcse-maths-a-modular-24-higher-unit-1",
  "igcse-maths-a-modular-24-higher-unit-2",
  "igcse-physics-modular-24-unit-1",
  "igcse-physics-modular-24-unit-2",
];

// ── the fill-where-served law (HUB-REGISTRY, ADR-030 — the run-009 onGreen
//    fill, trace 1a15dbaad30a6cc1) ────────────────────────────────────────
// A CIE row carries curriculumCode iff an ACTIVE curriculum_versions row with
// a serving corpus exists on the DB of record (run-009 prod-apply SUCCESS:
// 45/45 ok=true — realApplied 37 / realSeedOnly 3 / stubsSeeded 4, all
// seeded ACTIVE; the D1 skeleton pure-2 SKIPPED — "nothing to seed or
// ingest", zero nodes, zero question sets, NO cv row). The EXACT of-record
// code is the seed's cv law — bundle.code + "-" + syllabusVersion
// (apps/api/src/services/curriculum/bundle-seed.ts:347) — read here straight
// from the committed bundle manifest. coreBridge carries the T-SM-BRIDGE-WIDEN
// r0 law (operator order trace 1a163786bda7a699): TRUE on the 21 bridged CIE
// rows above, absent everywhere else (Wave-3 stays blocked pending the ADR).
function cvOfRecord(slug: string): string | undefined {
  if (slug === "cie-a-level-maths-20-pure-2") return undefined; // the D1 skeleton — fleet-skipped, the honest gate
  const m = JSON.parse(readFileSync(path.join(CONTENT, slug, "manifest.json"), "utf8")) as {
    curriculum: { code: string; syllabusVersion: string };
  };
  return m.curriculum.code + "-" + m.curriculum.syllabusVersion;
}

// ── the card's course set + paper-count assertions ──────────────────────────
const BOARD = "Cambridge International";
const EXPECT: Array<{
  slug: string; code: string; level: "A-Level" | "IGCSE"; papers: number;
  subject: string; label?: string; components?: number[];
}> = [
  { slug: "cie-a-level-chemistry-25",  code: "9701", level: "A-Level", papers: 379, subject: "Chemistry" },
  { slug: "cie-a-level-physics-25",    code: "9702", level: "A-Level", papers: 379, subject: "Physics" },
  { slug: "cie-a-level-maths-20-pure-1", code: "9709", level: "A-Level", papers: 67, subject: "Mathematics", label: "Maths — Pure 1", components: [1] },
  // D1 roster-anticipation row (operator default YES): no SME pure-2 bank yet
  { slug: "cie-a-level-maths-20-pure-2", code: "9709", level: "A-Level", papers: 68, subject: "Mathematics", label: "Maths — Pure 2", components: [2] },
  { slug: "cie-a-level-maths-20-pure-3", code: "9709", level: "A-Level", papers: 68, subject: "Mathematics", label: "Maths — Pure 3", components: [3] },
  { slug: "cie-a-level-maths-20-mechanics", code: "9709", level: "A-Level", papers: 68, subject: "Mathematics", label: "Maths — Mechanics", components: [4] },
  { slug: "cie-a-level-maths-20-probability-and-statistics-1", code: "9709", level: "A-Level", papers: 68, subject: "Mathematics", label: "Maths — Probability & Statistics 1", components: [5] },
  { slug: "cie-a-level-maths-20-probability-and-statistics-2", code: "9709", level: "A-Level", papers: 68, subject: "Mathematics", label: "Maths — Probability & Statistics 2", components: [6] },
  { slug: "cie-igcse-chemistry-23",    code: "0620", level: "IGCSE", papers: 398, subject: "Chemistry" },
  { slug: "cie-igcse-physics-23",      code: "0625", level: "IGCSE", papers: 401, subject: "Physics" },
  // 0580 tier law (cover-verified premise correction): Core=[1,3], Extended=[2,4]
  { slug: "cie-igcse-maths-25-core",     code: "0580", level: "IGCSE", papers: 134, subject: "Mathematics", label: "Maths — Core", components: [1, 3] },
  { slug: "cie-igcse-maths-25-extended", code: "0580", level: "IGCSE", papers: 134, subject: "Mathematics", label: "Maths — Extended", components: [2, 4] },
];

const D1_SKELETON = "cie-a-level-maths-20-pure-2"; // T-SPECS-9696-4HI1: now a SPEC-FILL skeleton — official-spine tree + honestly-empty banks (the former honest-empty ghost bundle; ruling in courses.json note)
const SPEC_FILL_PIN = "340803c9af4a949d3e274251b08697c6b42ba016"; // T-SPECS-9696-4HI1 r0: the resources parse landing (9696 adapter + 4HI1 option_rows) — the spec-fill manifests pin this exact SHA

// ── 1. registry posture ───────────────────────────────────────────────────────
type Row = {
  slug: string; level: string; subject: string; label?: string; code: string;
  status: string; board?: string; curriculumCode?: string; coreBridge?: boolean;
};
const reg = JSON.parse(readFileSync(path.join(CONTENT, "courses.json"), "utf8")) as {
  courses: Row[];
};
// WAVE-2 r0 (trace 1a17e97cb4e3ae95, resources PR #194): +12 rows = 50 Edexcel + 56 CIE
check("registry carries 106 rows (50 Edexcel + 56 CIE)", reg.courses.length === 106, String(reg.courses.length));
for (const exp of EXPECT) {
  const row = reg.courses.find((c) => c.slug === exp.slug);
  if (!row) { check(`registry row ${exp.slug}`, false, "MISSING"); continue; }
  check(`registry ${exp.slug}`, row.code === exp.code && row.level === exp.level
    && row.subject === exp.subject && row.status === (exp.slug === D1_SKELETON ? "registered" : "full") && row.board === BOARD,
    `${row.code}/${row.level}/${row.status}/board=${row.board}`);
  check(`registry ${exp.slug} fill-where-served pins (curriculumCode = seed cv law, coreBridge per T-SM-BRIDGE-WIDEN r0)`,
    row.coreBridge === (BRIDGED_CIE_SLUGS.includes(exp.slug) ? true : undefined)
    && row.curriculumCode === cvOfRecord(exp.slug),
    `cv=${String(row.curriculumCode)} bridge=${String(row.coreBridge)}`);
}

// ── 2. bundle shape: D1 skeleton (pure-2) + real official-spine bundles ─────
// CIE-INTEGRATION Phase 3: the sibling resource wave upgraded 11 of the 12
// card bundles in place (official-spine trees via content-maps at the pin);
// pure-2 (no SME bank yet) stays the honest-empty D1 skeleton.
const SEVEN = ["manifest.json", "curriculum.json", "concept-graph.json", "notes.json",
  "questions.json", "flashcards.json", "learner-sim.json"];
// T-SPECS-CIE-CONSUME-1 (r9, trace 1a1585c244ccd141): pin advanced 0fe5f772 ->
// 75981cad — the four CIE-relevant subtrees verified tree-sha-identical between
// the two pins; the only corpus delta is spec-links/ (the consumed sidecars).
// TRANCHE-1 (trace 1a15e4200e6af579): pin advanced 75981cad -> aa0b4de1 —
// parsed/RevisionNotes/Flashcards tree-sha-IDENTICAL to the r9 pin;
// SME-ExamQuestion moved but ALL changed files are igcse-accounting-17*
// (Edexcel) — zero CIE corpus contact; the CIE input delta is spec-links/
// (the T-SPECS-CIE-TRANCHE1-T2NEAR-1 verdict round, PR SyllabAI/syllabai-resources#22).
// ADOPTION (T-RULE-T2-APPLY-2 run-002, operator order 'adopt the consume-law on
// v2 branch', trace 1a164dcf6cff9061): pin advanced c5f20c52 -> 3838a264 (the
// PR-#49-merged tip of record) — SME-RevisionNotes/SME-ExamQuestion/
// Official-Specifications tree-sha-IDENTICAL to the c5f20c52 pin; the ONLY
// consumed-input delta is spec-links/ (8 sidecars of record: PR #49 operator
// sid-anchors + B01/B02 + BAND-B geo-25 + PARSE-REPAIR-1/2 — the repair pins
// below are SUPERSEDED by this uniform re-key: their sidecar state is carried
// inside the 3838a26 sidecars of record and the consume re-proved them);
// engine fleet re-run 44/44 battery green, sidAnchors 0/23/0 byte-fixed-point,
// two clean runs staging-hash identical, post-apply idempotence changed=0/44;
// roster floors re-pinned 6715/5696/9276 -> 6781/5786/9406 (the 195 V8
// part-level entries, B01 48 + B02 147).
const CIE_PIN_PRIOR = "bb15452701110c27acf59637db059b6053e50b1e"; // tranche-2-R1 pin — superseded fleet-wide by the CIE-REFRESH-1 re-key (all 44 teaching bundles re-keyed at c5f20c52; linkage byte-verified, engine fleet re-run 44/44 green)
const CIE_PIN_PRIOR_2 = "aa0b4de1b732738b4d02dabdd02d9ead85522907"; // tranche-1 pin — superseded fleet-wide by the CIE-REFRESH-1 re-key
const CIE_PIN_PRIOR_3 = "c5f20c5278137fb16a427f68b3332f1431eb345b"; // CIE-REFRESH-1 pin — superseded fleet-wide by the T-RULE-T2-APPLY-2 run-002 adoption re-key at 3838a264 (all 44 bundles re-keyed; sidAnchors 0/23/0; post-apply idempotence changed=0/44)
const CIE_PIN_PRIOR_4 = "3838a264d105e15a7cb8e908fb04d72847f8f94b"; // T-RULE-T2-APPLY-2 run-002 ADOPTION pin — superseded fleet-wide by the T-RULE-T2-V8-RETRACT-1 run-003 re-key at e7c7a68 (all 44 bundles re-keyed; sidAnchors 0/23/0 byte fixed point preserved; v8RetractDropped 42; post-apply idempotence changed=0/44)
const CIE_PIN_PRIOR_5 = "e7c7a68cf4790b951f77876982030413dd4662b7"; // T-RULE-T2-V8-RETRACT-1 run-003 pin — superseded fleet-wide by the T-RULE-T2-MISTAG-1 re-key at ea21a72 (all 44 bundles re-keyed; sidAnchors 0/23/0 byte fixed point preserved; misTagRepointDropped 3; post-apply idempotence changed=0/44)
const CIE_PIN_PRIOR_6 = "ea21a721e09e3a7ccfa1f92d6f667bc290412e14"; // T-RULE-T2-MISTAG-1 pin — superseded fleet-wide by the T-RULE-T2-HOLDSPLIT-DURABILITY-1 re-key at fa664a86 (all 44 bundles re-keyed; sidAnchors 0/26/0 byte fixed point — the 3 captured hold/split anchors verify-if-equal; inlineRewrites 3; post-apply idempotence changed=0/44 expected)
const CIE_PIN_PRIOR_7 = "fa664a86d64dd954225e0dee05a8cd742703179c"; // T-RULE-T2-HOLDSPLIT-DURABILITY-1 pin — superseded on 43 of 44 CIE lanes by the T-RULE-T3-SME-COVERAGE-1 run-004 re-key at 3dd9bb98 (econ-25 DEFERRED: its bundle manifest stays at fa664a86 until the serving lane lands its 84 re-harvested notes; the pin remains accepted for that lane)
const CIE_PIN_PRIOR_8 = "3dd9bb982834743f0b8c81123c8f15003c74c06a"; // T-RULE-T3-SME-COVERAGE-1 run-004 pin — superseded fleet-wide by the run-006 re-key at dcc67a87 (43 quiescent re-keys on zero consumed-input delta + the econ-25 serving lane; engine 44/44 green)
const CIE_PIN_PRIOR_9 = "dcc67a873c73594fff9e9ce3c9a6c9ea28d7f15d"; // T-RULE-T3-SME-COVERAGE-1 run-006 pin — superseded fleet-wide by the run-007 quiescent pin-vintage convergence at 6dc1f0a2 (zero-growth re-harvest pass; engine 44/44 green, every counter byte-equal to run-006)
const CIE_PIN_PRIOR_10 = "6dc1f0a25bdc01cf826076a8680786c9b88a6e8f"; // T-RULE-T3-SME-COVERAGE-1 run-007 pin — superseded fleet-wide by the T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-001 wave-vintage re-key at 31b0ef4a (all 44 bundles re-keyed; sidAnchors 0/26/0 byte fixed point; every consumed counter byte-equal to run-007 — codesFromSidecar 11,058 / t2Hints 51 / sheetConflicts 289 / v8Retract 0 / misTag 0; post-apply idempotence changed=0/44)
const CIE_PIN_PRIOR_11 = "31b0ef4aa995e1fb8024a9c0cce8e1705b193018"; // T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-001 wave-vintage pin — superseded fleet-wide by the T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-002 re-key at 09842f9f (all 44 bundles re-keyed; consumed-input delta ZERO at 31b0ef4a..09842f9f — spec-links/ tree-identical, rejoin sheet blob-identical 2bcd4db3; sidAnchors 0/26/0 byte fixed point; post-apply idempotence changed=0/44 expected)
const CIE_PIN_PRIOR_12 = "09842f9f2ae35c8b721a069c34cb04c3fbb3b592"; // T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-002 pin — superseded fleet-wide by the T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-003 re-key at 22543473 (all 44 bundles re-keyed; consumed-input delta ZERO at 09842f9f..22543473 — spec-links/ tree-identical 95 files, rejoin sheet blob-identical 2bcd4db3; sidAnchors 0/26/0 byte fixed point; post-apply idempotence changed=0/44 expected)
const CIE_PIN = "9cf6037e31c1ac8eb88a0cb6f545438689728a1d"; // T-SPECS-CIE-CONSUME-3 run-001 (operator directive 'fire that consume lane', trace 1a18bc6701800065): pin advanced 20a35ccc6 -> 9cf6037e — the EQFC-CONSUME-1 residual chain of record (the wave's unmapped growth joins the verdict fills -> review gate -> v2 consume chain): the gate-3 ACCEPTED wave3 chain consumed of record (JOIN-3 7931fc80 +8,541 items / REJOIN-3 599d6a0f + VERDICT-3 b8505e62 + GATE-3 756117fd; resources CI green at 9cf6037e); the additive item-creation law (the EQ/FC wave consume was content-maps byte-untouched) — itemsCreated 8,637; totals codesFromSidecar 20,565 (was 12,768) / t2Hints 375 / sheetConflicts 289 / sidAnchors 0/26/0 byte fixed point / v8Retract 0 / misTag 0; engine 54/54 green, stagingHash 47857869a3ac; the cross-set ref-namespace census law disclosed (1,118 collisions, the T-MIG-136 badSum precedent); the pin moves WITH the of-record (fa7ede6/0c8892d precedent)
const CIE_PIN_PRIOR_14 = "20a35ccc621d418a6bb3f4a62ef2cdecd7abf677"; // T-SPECS-CIE-CONSUME-2 run-001 (operator directive 'verdict fills -> review gate -> v2 consume', trace 1a183e66619bd6dd): pin advanced e481cb47 -> 20a35ccc6 — the JOIN-2 chain of record stage #3: the gate-2 ACCEPTED wave-2 AS chain consumed of record (first consume of the 8 lanes: business-23 78 / chemistry-25 505 / computer-science-19 129 / mechanics 191 / probstat-1 106 / pure-1 65 codes attached, pure-2 honest zero; sheetAdded 124 REJOIN-2 sid->code rows with via REJOIN-2:gate-2; inlineRewrites 124) + the 44 fleet quiescent re-keys on the moved pin; totals codesFromSidecar 12,768 (= 11,058 + 1,541 J* + 169 V*) / t2Hints 100 (= 51 + 49 wave-2 T2) / sheetConflicts 289 / sidAnchors 0/26/0 byte fixed point / v8Retract 0 / misTag 0; engine 52/52 green, stagingHash 925c6d1a; the pin moves WITH the of-record (fa7ede6/0c8892d precedent)
const CIE_PIN_PRIOR_13 = "e481cb47ab6188310abe396cc3011bc5f9e67864"; // T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-003 pin — superseded fleet-wide by the T-SPECS-CIE-CONSUME-2 run-001 re-key at 20a35ccc6 (the JOIN-2 chain of record stage #3: the 8 wave-2 AS lanes' first consume + the 44 fleet quiescent re-keys; codesFromSidecar 12,768 / t2Hints 100 / sheetAdded 124 / sheetConflicts 289 / sidAnchors 0/26/0 byte fixed point / v8Retract 0 / misTag 0; engine 52/52 green; post-apply idempotence = the CIE-REFRESH-1 no-op shape expected) // T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-003 (operator order 'Ok proceed', trace 1a17484361a63449): pin advanced 09842f9f -> e481cb47 — the third pin-vintage rung: the resources tip moved 09842f9f -> e481cb47 (~26 commits across three observed vintages, incl. the in-run 22543473 -> 64f45861 -> e481cb47 absorptions: T-BOOK-054 u3:c21 and T-BOOK-055 u4:c22 authoring+flips, UGM lanes 11/12 corpora + enrichments, converter v0.17.0-v0.17.3, the wave-24 G8 fixes, BL-008 waves, SIB v1.2.2, the physics PUA tranche) with consumed-input delta ZERO (spec-links/ tree-identical 95 files, rejoin sheet blob-identical 2bcd4db3); THIS pin is the quiescent pin-vintage convergence (the run-006/007/001/002 shape on a moved vintage): 44/44 engine re-keys, every consumed counter byte-equal to the run-002 floors, resourcesSha the only map move (stamp unchanged 2026-10-25T00:00:00Z), manifest officialSpine.resourcesSha the only bundle move; the pin moves WITH the of-record (fa7ede6/0c8892d precedent) // T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-002 (operator order 'Fire', trace 1a16f39798b9d6c1): pin advanced 31b0ef4a -> 09842f9f — the second pin-vintage rung: the resources tip moved 31b0ef4a -> 09842f9f (10 commits: T-BOOK-047 u2:c14 authoring+flip, the UGM-Assets image plane 976 figures, the handover-rule docs, the f-0019 filing, T-PARSE-YCH11-1 R2 polish harvest, T-PARSE-YCH12-1 SB2 parse) with consumed-input delta ZERO (spec-links/ tree-identical, rejoin sheet blob-identical 2bcd4db3); THIS pin is the quiescent pin-vintage convergence (the run-006/007/001 shape on a moved vintage): 44/44 engine re-keys, every consumed counter byte-equal to run-001, resourcesSha the only map move (stamp unchanged 2026-10-25T00:00:00Z), manifest officialSpine.resourcesSha the only bundle move; the pin moves WITH the of-record (fa7ede6/0c8892d precedent)
// REPAIR PINS of record (rider band of T-BOOK-033/status-flip r0, trace 1a162e924c017891 — the allow-list was not advanced when the three receipted repair lanes re-keyed their manifests, leaving main's hub check red on 3 assertions; every pin below is cited verbatim from its landed receipt on main):
const CIE_PIN_REPAIR_PURE3 = "06de1f2ac20567a2f6f49759fe71b64f7b83000a"; // T-SPECS-CIE-PARSE-REPAIR-1 r0 (ea7b9942): the 9709 P3 3.1 algebra-glue repair — band-D consume re-keyed the pure-3 manifest "manifest pin -> 06de1f2a with repairRun carried" (resources side = 06de1f2a)
const CIE_PIN_REPAIR_FM25 = "b83a3799a039350ea0dc759afe2fda188ed45806"; // T-SPECS-CIE-PARSE-REPAIR-2 r0 (b149e119): the 0606 topics-3/9/12 repair — band-D consume re-keyed the fm25 manifest "manifest pin -> b83a3799a with repairRun carried" (resources side = b83a3799a)
const CIE_PIN_REPAIR_GEO25 = "58d7f6892d89001f57af6b19a3a9e85766ffab90"; // T-SPECS-CIE-COMPLETE-1-BAND-D r0 (2c1c370b): geo-25 band-B consume — "bundle manifest officialSpine.resourcesSha -> 58d7f689 (band-B resources tip)"
const CIE_PIN_REPARSE1 = "e9e86e22239c20ea0fcdd5a91e076c88c5ae62ec"; // T-SPEC-REPARSE-1 run-001 (operator trace 1a19210a03f889f1 "fire source re-parse lane"): the T-SPEC-RENDER-1 filed follow-up (1) discharged at source — 71 spec_point rows repaired across 6 quals (cie-a-level-maths-2023-2025 garble/interleave/supsub, cie-igcse-business-2023-2025 statement/notes de-interleave, cie-as-environmental-management-2025-2027 spurious note-rows + 2.4.4 rebuild, cie-a-level-chemistry-2025-2027 H2SO4-class subscripts, ial-physics n=c/v fraction + subscripts); resources PRs #260/#261 merged (e9e86e22 + 1912a2c5 canonical mirror); spines rebuilt at the new pin (phase-0 set + the SME-WAVE2 wave-2 AS set via CIE_RECEIPT), bundles landed title-verbatim, map-law census GREEN 0 reds; the pin moves WITH the of-record (fa7ede6/0c8892d precedent)
const CIE_PINS_ACCEPTED = [CIE_PIN, CIE_PIN_PRIOR, CIE_PIN_PRIOR_2, CIE_PIN_PRIOR_3, CIE_PIN_PRIOR_4, CIE_PIN_PRIOR_5, CIE_PIN_PRIOR_6, CIE_PIN_PRIOR_7, CIE_PIN_PRIOR_8, CIE_PIN_PRIOR_9, CIE_PIN_PRIOR_10, CIE_PIN_PRIOR_11, CIE_PIN_PRIOR_12, CIE_PIN_REPAIR_PURE3, CIE_PIN_REPAIR_FM25, CIE_PIN_REPAIR_GEO25, CIE_PIN_REPARSE1];
function checkRealBundle(slug: string, code: string): void {
  const dir = path.join(CONTENT, slug);
  const missing = SEVEN.filter((f) => !existsSync(path.join(dir, f)));
  check(`bundle ${slug}: 7 files present`, missing.length === 0, missing.join(",") || "ok");
  if (missing.length > 0) return;
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
    schema: string; counts: Record<string, number>; treeKind?: string;
    curriculum?: { board?: string; code?: string };
    officialSpine?: { resourcesSha?: string; spine?: string; attachmentMap?: string };
  };
  check(`bundle ${slug}: real corpus bundle (notes non-empty)`, (manifest.counts?.notes ?? 0) > 0,
    JSON.stringify(manifest.counts));
  // rider fix (same band): the disjunction was &&-bound only on its last arm — JS precedence made the
  // spine/attachmentMap law apply to CIE_PIN_PRIOR_2 alone (and treeKind to CIE_PIN alone). The tightened
  // form below requires treeKind + pin ∈ allow-list + artifact links for EVERY accepted pin; census
  // pre-verify: all 44 real bundles carry correct spine/attachmentMap paths (pure-2 skeleton excluded
  // by its own branch), so the tighten flips no bundle verdict — it closes the false-accept class only.
  check(`bundle ${slug}: official-spine tree + resourcesSha pin + artifact links`,
    manifest.treeKind === "official-spine"
    && CIE_PINS_ACCEPTED.includes(manifest.officialSpine?.resourcesSha as string)
    && manifest.officialSpine?.spine === `spines/${slug}.json`
    && manifest.officialSpine?.attachmentMap === `content-maps/${slug}.json`,
    `${manifest.treeKind}/${String(manifest.officialSpine?.resourcesSha ?? "").slice(0, 7)}`);
  check(`bundle ${slug}: board/identity`,
    manifest.curriculum?.board === BOARD && manifest.curriculum?.code === code,
    `${manifest.curriculum?.board}/${manifest.curriculum?.code}`);
  const spine = JSON.parse(readFileSync(path.join(HUB, "spines", `${slug}.json`), "utf8")) as {
    curriculum?: { nodes?: Array<{ family?: string }> };
  };
  const spCount = (spine.curriculum?.nodes ?? []).filter((n) => n.family === "SPEC_POINT").length;
  check(`bundle ${slug}: specPoints == spine (${spCount})`,
    manifest.counts?.specPoints === spCount, String(manifest.counts?.specPoints));
}

for (const exp of EXPECT) {
  if (exp.slug === D1_SKELETON) {
    const dir = path.join(CONTENT, exp.slug);
    const missing = SEVEN.filter((f) => !existsSync(path.join(dir, f)));
    check(`bundle ${exp.slug}: 7 files present`, missing.length === 0, missing.join(",") || "ok");
    if (missing.length > 0) continue;
    const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
      schema: string; counts: Record<string, number>; treeKind?: string;
      curriculum?: { board?: string; code?: string };
      importSource?: { repo?: string; ref?: string; upstreamSchemas?: string[] };
      officialSpine?: { spine?: string; resourcesSha?: string; attachmentMap?: string };
    };
    const curriculum = JSON.parse(readFileSync(path.join(dir, "curriculum.json"), "utf8")) as {
      board?: string; code?: string; nodes: Array<{ family?: string }>; edges: unknown[];
    };
    // T-SPECS-9696-4HI1: the SPEC-FILL skeleton class — the official parsed
    // spec tree is served while every teaching bank stays honestly empty (no
    // SME corpus exists: no attachmentMap, no bank counts). The tree itself
    // carries the truth: specPoints == the pinned spine's SPEC_POINT census.
    const spine = JSON.parse(readFileSync(path.join(HUB, "spines", `${exp.slug}.json`), "utf8")) as {
      curriculum?: { nodes?: Array<{ family?: string }> };
    };
    const spCount = (spine.curriculum?.nodes ?? []).filter((n) => n.family === "SPEC_POINT").length;
    const banksZero = ["notes", "questionSets", "questions", "parts", "marks", "flashcards"]
      .every((k) => (manifest.counts?.[k] ?? 0) === 0);
    const treePopulated = (manifest.counts?.specPoints ?? 0) > 0
      && manifest.counts?.specPoints === spCount
      && curriculum.nodes.filter((n) => n.family === "SPEC_POINT").length === spCount;
    check(`bundle ${exp.slug}: spec-fill skeleton (official-spine tree, banks honestly empty)`,
      manifest.treeKind === "official-spine"
      && manifest.officialSpine?.spine === `spines/${exp.slug}.json`
      && manifest.officialSpine?.resourcesSha === SPEC_FILL_PIN
      && manifest.officialSpine?.attachmentMap === undefined
      && manifest.importSource?.ref === `main@${SPEC_FILL_PIN}`
      && (manifest.importSource?.upstreamSchemas ?? []).includes("syllabai.parsed-specification/1.0")
      && banksZero && treePopulated,
      `${manifest.treeKind}/${String(manifest.officialSpine?.resourcesSha ?? "").slice(0, 7)} pts=${manifest.counts?.specPoints}/${spCount} banks-zero=${banksZero}`);
    check(`bundle ${exp.slug}: board/identity`,
      manifest.curriculum?.board === BOARD && manifest.curriculum?.code === exp.code
      && curriculum.board === BOARD && curriculum.nodes.length > 0 && curriculum.edges.length > 0);
    continue;
  }
  checkRealBundle(exp.slug, exp.code);
}

// ── 2b. CIE-INTEGRATION Phase 3: the 33 resource-backed roster rows ──────────
const PHASE3_ROSTER: Array<{ slug: string; code: string; level: string; subject: string }> = [
{ slug: "cie-a-level-accounting-21", code: "9706", level: "A-Level", subject: "Accounting" },
  { slug: "cie-a-level-biology-25", code: "9700", level: "A-Level", subject: "Biology" },
  { slug: "cie-a-level-business-23", code: "9609", level: "A-Level", subject: "Business" },
  { slug: "cie-a-level-computer-science-19", code: "9618", level: "A-Level", subject: "Computer Science" },
  { slug: "cie-a-level-economics-23", code: "9708", level: "A-Level", subject: "Economics" },
  { slug: "cie-as-english-general-paper-21", code: "8021", level: "AS", subject: "English" },
  { slug: "cie-as-environmental-management-20", code: "8291", level: "AS", subject: "Environmental Management" },
  { slug: "cie-igcse-accounting-21", code: "0452", level: "IGCSE", subject: "Accounting" },
  { slug: "cie-igcse-accounting-25", code: "0452", level: "IGCSE", subject: "Accounting" },
  { slug: "cie-igcse-biology-23", code: "0610", level: "IGCSE", subject: "Biology" },
  { slug: "cie-igcse-business-23", code: "0450", level: "IGCSE", subject: "Business" },
  { slug: "cie-igcse-business-25", code: "0264", level: "IGCSE", subject: "Business" },
  { slug: "cie-igcse-computer-science-23", code: "0478", level: "IGCSE", subject: "Computer Science" },
  { slug: "cie-igcse-economics-20", code: "0455", level: "IGCSE", subject: "Economics" },
  { slug: "cie-igcse-economics-25", code: "0455", level: "IGCSE", subject: "Economics" },
  { slug: "cie-igcse-english-language-20", code: "0500", level: "IGCSE", subject: "English Language" },
  { slug: "cie-igcse-english-language-25", code: "0500", level: "IGCSE", subject: "English Language" },
  { slug: "cie-igcse-english-literature-21", code: "0475", level: "IGCSE", subject: "English Literature" },
  { slug: "cie-igcse-environmental-management-25", code: "0680", level: "IGCSE", subject: "Environmental Management" },
  { slug: "cie-igcse-further-maths-additional-maths-25", code: "0606", level: "IGCSE", subject: "Further Maths" },
  { slug: "cie-igcse-geography-20", code: "0460", level: "IGCSE", subject: "Geography" },
  { slug: "cie-igcse-geography-25", code: "0460", level: "IGCSE", subject: "Geography" },
  { slug: "cie-igcse-history-18", code: "0470", level: "IGCSE", subject: "History" },
  { slug: "cie-igcse-ict-21", code: "0417", level: "IGCSE", subject: "ICT" },
  { slug: "cie-igcse-maths-international-maths-23-core", code: "0607", level: "IGCSE", subject: "Maths" },
  { slug: "cie-igcse-maths-international-maths-23-extended", code: "0607", level: "IGCSE", subject: "Maths" },
  { slug: "cie-igcse-religious-studies-23", code: "0490", level: "IGCSE", subject: "Religious Studies" },
  { slug: "cie-igcse-science-co-ordinated-sciences-double-award-23-biology", code: "0973", level: "IGCSE", subject: "Science" },
  { slug: "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry", code: "0973", level: "IGCSE", subject: "Science" },
  { slug: "cie-igcse-science-co-ordinated-sciences-double-award-23-physics", code: "0973", level: "IGCSE", subject: "Science" },
  { slug: "cie-igcse-science-combined-science-23-biology", code: "0653", level: "IGCSE", subject: "Science" },
  { slug: "cie-igcse-science-combined-science-23-chemistry", code: "0653", level: "IGCSE", subject: "Science" },
  { slug: "cie-igcse-science-combined-science-23-physics", code: "0653", level: "IGCSE", subject: "Science" },
];
for (const exp of PHASE3_ROSTER) {
  const row = reg.courses.find((c) => c.slug === exp.slug);
  if (!row) { check(`registry row ${exp.slug}`, false, "MISSING"); continue; }
  check(`registry ${exp.slug}`,
    row.code === exp.code && row.level === exp.level && row.subject === exp.subject
    && row.status === (exp.slug === D1_SKELETON ? "registered" : "full") && row.board === BOARD,
    `${row.code}/${row.level}/${row.status}/board=${row.board}`);
  check(`registry ${exp.slug} fill-where-served pins (curriculumCode = seed cv law, coreBridge per T-SM-BRIDGE-WIDEN r0)`,
    row.coreBridge === (BRIDGED_CIE_SLUGS.includes(exp.slug) ? true : undefined)
    && row.curriculumCode === cvOfRecord(exp.slug),
    `cv=${String(row.curriculumCode)} bridge=${String(row.coreBridge)}`);
  checkRealBundle(exp.slug, exp.code);
}
const cieRowCount = reg.courses.filter((c) => c.board === BOARD).length;
// WAVE-2 r0: +11 CIE rows (44-slug roster + D1 pure-2 + 11 wave-2 registered skeletons)
check("registry carries 56 CIE rows (44-slug roster + D1 pure-2 + 11 wave-2 registered)", cieRowCount === 56, String(cieRowCount));
const cieFilled = reg.courses.filter((c) => c.board === BOARD && c.curriculumCode !== undefined).length;
// WAVE-2 r1 (operator order trace 1a17ed20502e4c8d "order the curriculumCode
// promotion for the 7 page-sourced lanes"): the 7 AS lanes whose edition windows
// are page-sourced on the EXACT probe-url-match quals (9701/9700/9702 @2025-2027,
// 9709 @2023-2025 — work/sme_wave2_specs_receipt.json basis="probe-url-match")
// are PROMOTED: 44 + 7 = 51/56. Still honestly unmapped (5): pure-2 (the D1
// skeleton — cvOfRecord law keeps undefined until a serving corpus exists),
// as-business-23 / as-computer-science-19 / as-accounting-21 (title-span evidence
// class, SME card NULL — never exact-probed) and a-level-geography-21 (new-qual
// download class) — fail-closed, never invented (ADR-030).
check("registry CIE fill of record: 51/56 mapped (run-009 onGreen fill 44 + the wave-2 r1 page-sourced promotion 7; pure-2 + the 3 title-span AS lanes + geography-21 the honest gates)",
  cieFilled === 51, String(cieFilled));
check("registry coreBridge CIE law of record: exactly the 26 T-SM-BRIDGE-WIDEN r0 + T-SM-EDX-INGEST-R1 rows carry true; every other CIE row stays absent (Wave-3 band-scheme rows remain blocked pending the levels-of-response ADR)",
  reg.courses
    .filter((c) => c.board === BOARD)
    .every((c) =>
      BRIDGED_CIE_SLUGS.includes(c.slug) ? c.coreBridge === true : c.coreBridge === undefined,
    )
  && reg.courses.filter((c) => c.board === BOARD && c.coreBridge === true).length
    === BRIDGED_CIE_SLUGS.length);
check("registry coreBridge of record: the T-SM-BRIDGE-WIDEN r0 set + the T-SM-EDX-INGEST-R1 r0 set — the two 4MA1 maths-a rows (T-MIG-135d) + igcse-maths-b-16 + the two T-SM-EDX-INGEST linear science rows (igcse-biology-19, igcse-physics-19; bank-verified 2026-10-22: 322+489 refs, all VALIDATED) + the three T-SM-SD0-FIX-R0 4SD0 strand rows (bank-verified 2026-10-24) + the 26 CIE rows (21 T-SM-BRIDGE-WIDEN + 0452/0606/0653x3 bank-verified 2026-10-25: family-gate FULL) + the 28 T-SM-EDX-INGEST-R1 Edexcel point-scheme rows (bank-verified 2026-10-25: the family census of record — 60 FULL rows incl. YMA01x9 3,411 families, YBI11/YCH11/YPH11/YFM01, 4XBI1/4XCH1/4XPH1/4XMAF/4XMAH modular units, 4AC1x2, 4EC1, 4PM1, 4IT1; receipt .syllabai/receipts/T-SM-EDX-INGEST-R1/ingest-r1.json), every flagged row true",
  (() => {
    const expected = new Set<string>([
      "igcse-maths-a-18-foundation",
      "igcse-maths-a-18-higher",
      "igcse-maths-b-16",
      "igcse-biology-19",
      "igcse-physics-19",
      "igcse-science-double-award-17-biology",
      "igcse-science-double-award-17-chemistry",
      "igcse-science-double-award-17-physics",
      ...BRIDGED_CIE_SLUGS,
      ...BRIDGED_R1_EDX_SLUGS,
    ]);
    const flagged = reg.courses.filter((c) => c.coreBridge !== undefined);
    return (
      flagged.length === expected.size
      && flagged.every((c) => c.coreBridge === true && expected.has(c.slug))
    );
  })(),
  `${reg.courses.filter((c) => c.coreBridge !== undefined).length} rows flagged`);

// ── 3. THE CARD'S PAPER-COUNT ASSERTIONS ─────────────────────────────────────
let strictTotal = 0;
const withD1 = EXPECT.reduce((a, e) => a + e.papers, 0); // 2,232
for (const exp of EXPECT) {
  const papers = corpusPapersForCourse(exp.slug);
  const isD1 = exp.slug === "cie-a-level-maths-20-pure-2";
  if (!isD1) strictTotal += papers.length;
  check(`count ${exp.slug} == ${exp.papers}`, papers.length === exp.papers, String(papers.length));
  // listable law: every CIE row carries BOTH qp and ms (census run-001)
  const notListable = papers.filter((p) => p.qpBytes == null || p.msBytes == null);
  check(`listable ${exp.slug}: qp+ms on every row`, notListable.length === 0, String(notListable.length));
  // G4 posture: no attested CIE durations — the honest editable-estimate state
  const withDurations = papers.filter((p) => p.durationMin != null);
  check(`G4 ${exp.slug}: durationMin null on every row`, withDurations.length === 0, String(withDurations.length));
  // G1 law: ref "<syllabus>/<nn>", title "Paper <n>", component present
  const badRows = papers.filter((p) => {
    const cie = parseCieDir(p.dir);
    if (!cie) return true;
    if (p.ref !== `${cie.syllabus}/${cie.component}`) return true;
    if (!p.title.startsWith(`Paper ${cie.component[0]}`)) return true;
    if (p.component !== Number(cie.component[0])) return true;
    // the cover-verified name map, when it holds this component, must surface
    if (!p.title.includes("—") && p.title !== `Paper ${cie.component[0]}`) return true;
    return false;
  });
  check(`G1 ${exp.slug}: ref/title/component law on every row`, badRows.length === 0,
    badRows.slice(0, 3).map((p) => `${p.dir}:${p.ref}:${p.title}`).join(" ; "));
  // G2 law: specTitle renders the uppercase qual, never the raw 'ial'/'igcse'
  const badTitles = papers.filter((p) => !/^(IAL|IGCSE) /.test(p.specTitle) || p.specTitle.includes("Edexcel"));
  check(`G2 ${exp.slug}: specTitle board-clean`, badTitles.length === 0,
    [...new Set(badTitles.map((p) => p.specTitle))].slice(0, 3).join(" ; "));
  // component-filter composition (9709 banks; 0580 tiers)
  if (exp.components) {
    const outOfScope = papers.filter((p) => p.component == null || !exp.components!.includes(p.component));
    check(`components ${exp.slug} ⊆ {${exp.components.join(",")}}`, outOfScope.length === 0,
      [...new Set(outOfScope.map((p) => p.component))].join(","));
  }
}
check("strict-11 coverage == 2,164 (95.8% of the archive)", strictTotal === 2164, String(strictTotal));
check("with-D1 coverage == 2,232 (98.8%)", withD1 === 2232, String(withD1));

// ── 4. corpus-wide CIE holdings + D2 (component-7 stays archive-only) ────────
const cieSpecs = Object.entries(corpusIndex.specs).filter(([k]) => k.startsWith("cambridge-international/"));
check("6 CIE specs in the index", cieSpecs.length === 6, String(cieSpecs.length));
const cieTotal = cieSpecs.reduce((a, [, s]) => a + s.sessions.reduce(
  (n, ses) => n + ses.papers.filter((p) => p.qp != null || p.ms != null).length, 0), 0);
check("CIE archive holdings == 2,259", cieTotal === 2259, String(cieTotal));
check("archive browser still exposes 108 specs", allArchiveSpecs().length === 108, String(allArchiveSpecs().length));
// D2: no course page claims component-7 — the 27 legacy rows are reachable
// only through the archive browser's per-spec page
const c7OnCourses = EXPECT.flatMap((e) => corpusPapersForCourse(e.slug))
  .filter((p) => p.dir.startsWith("9709-") && p.component === 7);
check("D2: component-7 (27 rows) claimed by NO course", c7OnCourses.length === 0, String(c7OnCourses.length));
const c7 = corpusPapersForCourse("cie-a-level-maths-20-pure-1").length; // sanity: c1 course unaffected
check("pure-1 bank size intact (67)", c7 === 67, String(c7));

// ── verdict ──────────────────────────────────────────────────────────────────
console.log("");
if (fails > 0) {
  console.error(`CIE VALIDATOR FAILED — ${fails} assertion(s)`);
  process.exit(1);
}
console.log("CIE VALIDATOR PASSED — the card's paper-count assertions hold at this tree");
