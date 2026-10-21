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

// ── the fill-where-served law (HUB-REGISTRY, ADR-030 — the run-009 onGreen
//    fill, trace 1a15dbaad30a6cc1) ────────────────────────────────────────
// A CIE row carries curriculumCode iff an ACTIVE curriculum_versions row with
// a serving corpus exists on the DB of record (run-009 prod-apply SUCCESS:
// 45/45 ok=true — realApplied 37 / realSeedOnly 3 / stubsSeeded 4, all
// seeded ACTIVE; the D1 skeleton pure-2 SKIPPED — "nothing to seed or
// ingest", zero nodes, zero question sets, NO cv row). The EXACT of-record
// code is the seed's cv law — bundle.code + "-" + syllabusVersion
// (apps/api/src/services/curriculum/bundle-seed.ts:347) — read here straight
// from the committed bundle manifest. coreBridge stays ABSENT everywhere
// (operator-keyed, the T-MIG-136 maths-b law).
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

const D1_SKELETON = "cie-a-level-maths-20-pure-2"; // the honest-empty ghost bundle (ruling in courses.json note)

// ── 1. registry posture ───────────────────────────────────────────────────────
type Row = {
  slug: string; level: string; subject: string; label?: string; code: string;
  status: string; board?: string; curriculumCode?: string; coreBridge?: boolean;
};
const reg = JSON.parse(readFileSync(path.join(CONTENT, "courses.json"), "utf8")) as {
  courses: Row[];
};
check("registry carries 94 rows (49 Edexcel + 45 CIE)", reg.courses.length === 94, String(reg.courses.length));
for (const exp of EXPECT) {
  const row = reg.courses.find((c) => c.slug === exp.slug);
  if (!row) { check(`registry row ${exp.slug}`, false, "MISSING"); continue; }
  check(`registry ${exp.slug}`, row.code === exp.code && row.level === exp.level
    && row.subject === exp.subject && row.status === (exp.slug === D1_SKELETON ? "registered" : "full") && row.board === BOARD,
    `${row.code}/${row.level}/${row.status}/board=${row.board}`);
  check(`registry ${exp.slug} fill-where-served pins (curriculumCode = seed cv law, coreBridge absent)`,
    row.coreBridge === undefined && row.curriculumCode === cvOfRecord(exp.slug),
    `cv=${String(row.curriculumCode)}`);
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
const CIE_PIN_PRIOR = "bb15452701110c27acf59637db059b6053e50b1e"; // tranche-2-R1 pin — superseded fleet-wide by the CIE-REFRESH-1 re-key (all 44 teaching bundles re-keyed at c5f20c52; linkage byte-verified, engine fleet re-run 44/44 green)
const CIE_PIN_PRIOR_2 = "aa0b4de1b732738b4d02dabdd02d9ead85522907"; // tranche-1 pin — superseded fleet-wide by the CIE-REFRESH-1 re-key
const CIE_PIN = "c5f20c5278137fb16a427f68b3332f1431eb345b"; // CIE-REFRESH-1 run-001 consume (operator dispatch 'dispatch the CIE 44-lane refresh to close the pin-vintage gap', trace 1a1608dfdd3007d1): pin advanced bb154527 -> c5f20c52 — the CIE corpus content inputs are tree-identical 0fe5f772..c5f20c52 (zero-delta proof of record: SME-ExamQuestion delta all Edexcel, books/ = future pipeline inputs, parsed/RevisionNotes/Flashcards CIE untouched); the only input delta is spec-links/ (band A 140 fragmented-math rows + tranche-1 residual); content-maps + officialSpine.resourcesSha re-keyed fleet-wide, importSource.ref stamped with provenance notes; post-apply idempotence changed=0/44; the pin moves WITH the of-record (fa7ede6/0c8892d precedent)
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
  check(`bundle ${slug}: official-spine tree + resourcesSha pin + artifact links`,
    manifest.treeKind === "official-spine" && manifest.officialSpine?.resourcesSha === CIE_PIN || manifest.officialSpine?.resourcesSha === CIE_PIN_PRIOR || manifest.officialSpine?.resourcesSha === CIE_PIN_PRIOR_2
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
      importSource?: { repo?: string };
    };
    const curriculum = JSON.parse(readFileSync(path.join(dir, "curriculum.json"), "utf8")) as {
      board?: string; nodes: unknown[]; edges: unknown[];
    };
    const countsZero = Object.values(manifest.counts ?? {}).every((n) => n === 0);
    check(`bundle ${exp.slug}: honest-empty skeleton (all counts 0)`, countsZero,
      JSON.stringify(manifest.counts));
    check(`bundle ${exp.slug}: board/identity`,
      manifest.curriculum?.board === BOARD && manifest.curriculum?.code === exp.code
      && curriculum.board === BOARD && curriculum.nodes.length === 0 && curriculum.edges.length === 0);
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
  check(`registry ${exp.slug} fill-where-served pins (curriculumCode = seed cv law, coreBridge absent)`,
    row.coreBridge === undefined && row.curriculumCode === cvOfRecord(exp.slug),
    `cv=${String(row.curriculumCode)}`);
  checkRealBundle(exp.slug, exp.code);
}
const cieRowCount = reg.courses.filter((c) => c.board === BOARD).length;
check("registry carries 45 CIE rows (44-slug roster + D1 pure-2)", cieRowCount === 45, String(cieRowCount));
const cieFilled = reg.courses.filter((c) => c.board === BOARD && c.curriculumCode !== undefined).length;
check("registry CIE fill of record: 44/45 mapped (the run-009 onGreen fill; pure-2 the honest gate)",
  cieFilled === 44, String(cieFilled));
check("registry coreBridge absent on ALL CIE rows (operator-keyed, the T-MIG-136 law)",
  reg.courses.filter((c) => c.board === BOARD).every((c) => c.coreBridge === undefined));
check("registry coreBridge of record unchanged: only the two 4MA1 maths-a rows carry it (true)",
  JSON.stringify(reg.courses.filter((c) => c.coreBridge !== undefined).map((c) => [c.slug, c.coreBridge]))
    === JSON.stringify([["igcse-maths-a-18-foundation", true], ["igcse-maths-a-18-higher", true]]));

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
