/**
 * ADR-039 wave-9 gate — the SME Revision-Notes picker layer. Tranche 1 (the
 * four-course CIE IGCSE maths family) + tranche 2 (the CIE A-level sciences-25
 * trio: biology 9700 / chemistry 9701 / physics 9702) + tranche 3 (the
 * Edexcel IGCSE maths pair: igcse-maths-b-16 4MB1 / igcse-maths-a-18-higher
 * 4MA1 Higher) + tranche 4 (the queue pair: cie-igcse-english-literature-21
 * 0455 lit / cie-a-level-accounting-21 9706, both CIE 2023-2025) + tranche 5
 * (cie-a-level-economics-23 CIE 9708 / igcse-biology-19 Pearson Edexcel
 * 4BI1) + tranche 6 (igcse-maths-a-18-foundation 4MA1 Foundation /
 * cie-igcse-physics-23 CIE 0625 2023-2025) + tranche 7 (cie-as-chemistry-25
 * CIE AS 9701 2025-2027 / cie-a-level-business-23 CIE 9609 2023-2025) +
 * tranche 8 (igcse-physics-19 Pearson Edexcel 4PH1 2017 / cie-as-biology-25
 * CIE AS 9700 2025-2027) + tranche 9 (igcse-chemistry-19 Pearson Edexcel
 * 4CH1 2017 Issue 3 / cie-igcse-geography-25 CIE 0460 2025-2026) + tranche
 * 10 (igcse-science-double-award-17-biology Pearson Edexcel 4SD0 2017 /
 * cie-igcse-accounting-25 CIE 0452 2027-2029) + tranche 11
 * (igcse-biology-modular-24-unit-2 Pearson 4XBI1 modular 2024 /
 * igcse-maths-a-modular-24-higher-unit-1 Pearson 4XMAF/4XMAH modular 2024)
 * + tranche 12 (igcse-geography-19 Pearson Edexcel 4GE1 2017 /
 * cie-as-accounting-21 CIE AS 9706 2023-2025) + tranche 13
 * (cie-igcse-religious-studies-23 CIE 0490 2025-2027 /
 * igcse-science-double-award-17-physics Pearson Edexcel 4SD0 2017 — the
 * THIRD 4SD0 strand) + tranche 14 (cie-igcse-computer-science-23 CIE 0478
 * 2023-2025 / igcse-maths-a-modular-24-higher-unit-2 Pearson 4XMAF/4XMAH
 * dual-code 2024) + tranche 15 (cie-as-physics-25 CIE AS 9702 2025-2027 —
 * the AS-shares-A-level code prefix class / cie-igcse-business-23 CIE 0450
 * 2023-2025) + tranche 16 (cie-igcse-history-18 CIE 0470 2024-2026 — the
 * TS-prefixed code family, the TOPIC==SUBTOPIC spine /
 * cie-igcse-science-combined-science-23-physics CIE 0653 2023-2024 — the
 * CIE strand-QUALIFIER URL class and the FIRST DRIFT EVENT of the wave:
 * six live-only paper-organization topics documented in DRIFT_BY_COURSE)
 * + tranche 17 (cie-igcse-economics-25 CIE 0455 2027-2029 /
 * cie-igcse-environmental-management-25 CIE 0680 2027-2029) + tranche 18
 * (igcse-science-double-award-17-chemistry Pearson 4SD0 2017 — the THIRD
 * 4SD0 strand / igcse-business-19 Pearson 4BS1 — the decimal T-code family)
 * + tranche 19 (igcse-maths-a-modular-24-foundation-unit-1 Pearson
 * 4XMAF/4XMAH 2024 — the modular-UNIT shape / igcse-economics-17 Pearson
 * 4EC1 2017 — the FOURTH DRIFT EVENT: one live-only exam-skills topic
 * documented in DRIFT_BY_COURSE)
 * + tranche 20 (cie-igcse-economics-20 CIE 0455 2023-2025 — the numbered
 * 3-level CIE shape / cie-igcse-ict-21 CIE 0417 2023-2025 — the
 * un-numbered CIE shape; the ELEVENTH consecutive FULLY-CLEAN audit with
 * ZERO drift events — both courses PERFECT 1:1)
 * + tranche 21 (cie-igcse-business-25 CIE 0264 2027-2029 — the numbered
 * CIE shape with an exam-technique strand that carries notes (no drift) /
 * cie-as-computer-science-19 CIE 9618 2024-2025 — the AS-level /as/ URL
 * class, sibling of the already-layered a-level course; the TWELFTH
 * consecutive FULLY-CLEAN audit with ZERO drift events)
 * + tranche 22 (igcse-science-double-award-modular-24-biology-unit-2
 * Pearson 4XSD1 2024 — the modular-UNIT shape, the wave's FIRST ZERO-SET
 * course (the set law vacuous) / cie-igcse-accounting-21 CIE 0452
 * 2023-2025 — the FIFTH DRIFT EVENT: four live-only paper-resources
 * topics documented in DRIFT_BY_COURSE)
 * + tranche 23 (igcse-ict-17 Pearson 4IT1 2017 — the un-numbered Edexcel
 * shape with UNDERSCORE subcodes / cie-igcse-geography-20 CIE 0460
 * 2025-2026 — the numbered CIE shape; the FOURTEENTH consecutive
 * FULLY-CLEAN audit with ZERO drift events — the SECOND double-perfect
 * tranche, both courses PERFECT 1:1)
 * + tranche 24 (cie-igcse-further-maths-additional-maths-25 CIE 0606
 * 2025-2027 — the un-numbered CIE shape / cie-as-business-23 CIE 9609
 * 2023-2025 — the wave's SECOND AS-level course on the SHARED
 * a-level-business code family; the FIFTEENTH consecutive FULLY-CLEAN
 * audit with the SIXTH DRIFT EVENT: as-business-23's three live-only
 * paper-resources topics documented in DRIFT_BY_COURSE)
 * + tranche 25 (cie-igcse-science-combined-science-23-chemistry CIE 0653
 * 2023-2024 — the combined-science shape, the component-scoped TC-code
 * family / igcse-physics-modular-24-unit-2 Pearson 4XPH1 2024 — the
 * modular-UNIT shape; the SIXTEENTH consecutive FULLY-CLEAN audit with
 * the SEVENTH DRIFT EVENT — the biggest paper-cluster yet: six live-only
 * exam-paper topics documented in DRIFT_BY_COURSE)
 * + tranche 26 (igcse-chemistry-modular-24-unit-1 Pearson 4CH1 2024 /
 * igcse-physics-modular-24-unit-1 Pearson 4PH1 2024 — the modular-UNIT
 * shape; the SEVENTEENTH consecutive FULLY-CLEAN audit with ZERO DRIFT on
 * both courses — the first two-course tranche with no drift event)
 * + tranche 27 (cie-igcse-science-combined-science-23-biology CIE 0653
 * 2023-2024 — the combined-science shape, the component-scoped TB-code
 * family / igcse-maths-a-modular-24-foundation-unit-2 Pearson 4XMAF 2024
 * — the a-modular shape; the EIGHTEENTH consecutive FULLY-CLEAN audit
 * with the EIGHTH DRIFT EVENT — the combined-science exam-paper cluster
 * again (the six slugs, the T25 chem sibling's exact set), documented in
 * DRIFT_BY_COURSE)
 * + tranche 28 (igcse-further-maths-19 Pearson 4PM1 2017 — the
 * FURTHER-maths shape / cie-igcse-english-language-25 CIE 0500 2027-2029
 * — the ENGLISH-language shape with the NEW 2027-2029 strand; the
 * NINETEENTH consecutive FULLY-CLEAN audit with the wave's NINTH and
 * TENTH DRIFT EVENTS — the first tranche where BOTH courses carry drift:
 * fm19's six paper-resources rows + eng25's five exam-skills/tips rows
 * (a NEW class), documented in DRIFT_BY_COURSE)
 * + tranche 29 (cie-as-environmental-management-20 CIE 8291 2025-2027 —
 * the AS environmental-management shape — the wave-8 probe holder,
 * rotated out at this tranche (#7) / igcse-science-double-award-modular-
 * 24-physics-unit-2 Pearson 4XSD1 2024 — the double-award-modular shape,
 * SETLESS; the TWENTIETH consecutive FULLY-CLEAN audit with ZERO DRIFT
 * on both courses — the second two-course tranche with no drift event)
 * + tranche 30 (igcse-science-double-award-modular-24-chemistry-unit-1
 * Pearson 4XSD1 2024 — the double-award-modular shape, SETLESS — the
 * wave-8 probe holder, rotated out at this tranche (#8) /
 * igcse-chemistry-modular-24-unit-2 Pearson 4XCH1 2024 — the modular-UNIT
 * shape; the TWENTY-FIRST consecutive FULLY-CLEAN audit with ZERO DRIFT
 * on both courses — the third two-course tranche with no drift event)
 * + tranche 31 (cie-igcse-english-language-20 CIE 0500 2024-2026 — the
 * ENGLISH-language shape — the wave-8 probe holder, rotated out at this
 * tranche (#9) / igcse-science-double-award-modular-24-physics-unit-1
 * Pearson 4XSD1 2024 — the double-award-modular shape, SETLESS; the
 * TWENTY-SECOND consecutive FULLY-CLEAN audit with ZERO DRIFT on both
 * courses — the fourth two-course tranche with no drift event; the turn
 * opened with a RECONCILIATION of a stale tranche-3-era checkpoint)
 * + tranche 32 (igcse-biology-modular-24-unit-1 Pearson 4XBI1 2024 — the
 * modular-UNIT shape, roster slot 1 / igcse-accounting-17-introduction-
 * to-bookkeeping-and-accounting Edexcel 4AC1 2017 — the ACCOUNTING shape,
 * roster slot 3; the census TIE at 43; the TWENTY-THIRD consecutive
 * FULLY-CLEAN audit with the wave's ELEVENTH DRIFT EVENT — acct17's TEN
 * live-only paper-session rows 2019-june..2024-june (the fm19 class),
 * carried as corpus-zero rows + DRIFT_BY_COURSE; *** THE FIRST DOUBLE
 * ROTATION *** — slots 1 AND 3 tripped, replaced by sdaw-bio-U1 and
 * sdaw-chem-U2; as-maths-20-pure-2 stays)
 * + tranche 33 (cie-as-maths-20-pure-2 CIE 9709 2023-2025 — the AS
 * PURE-2 sub-strand of the a-level-maths spine family, roster slot 2 /
 * igcse-science-double-award-modular-24-biology-unit-1 Pearson 4XSD1
 * 2024 — the double-award-modular shape, SETLESS, roster slot 1; the
 * TWENTY-FOURTH consecutive FULLY-CLEAN audit with ZERO DRIFT on both
 * courses; the wave-6 header's historical pure-2 exclusion disclosure
 * SUPERSEDED (header only, zero contact); *** THE SECOND DOUBLE
 * ROTATION *** — slots 1 AND 2 tripped, replaced by ial-fp1-18 and
 * as-english-gp-21; sdaw-chem-U2 stays)
 * — the W7 closeout recommendation's build slices,
 * worst tails first.
 *
 * Same law as the wave-3 gate, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet + smeRowOfNote), extended to the
 * notes dimension — wave 9 is the first wave whose appends serve BOTH
 * selectors (tranche 3's b-16 is notes-only: its 65 SyllabAI past-paper sets
 * keep their official spine homes by the smeRowOfQuestionSet null contract,
 * asserted per-course by the fixtures setLaw; tranche 4 carries the wave-9
 * first multi-match course — accounting's "overview"/"financial-statements-
 * for-partnerships" slugs duplicate across live sections and resolve
 * exact-one by the corpus sectionSlug, declared per-course as multiMatch):
 *
 *   1. spine intact   — official node family counts AND the official-node
 *                       digest (code/family/order/parents/title sha) match
 *                       the pre-append snapshot pinned in the fixtures
 *   2. layer present  — 10 section rows + N topic rows per course, all
 *                       SME_REFERENCE, titles verbatim from the live
 *                       SaveMyExams Revision-Notes picker (fetch 2026-11-13,
 *                       <course picker>/revision-notes/), smeSectionSlug
 *                       carried on every section row (the wave-7 law)
 *   3. bijection      — every corpus set's topicSlug AND every corpus
 *                       note's (sectionSlug, topicSlug) match EXACTLY ONE
 *                       topic row; per-row CORPUS counts pinned exactly
 *                       (the ring shows what the hub holds)
 *   4. drift rows     — live-only topics mirrored verbatim as empty rows:
 *                       exactly `set-1-fl` (the teacher-only Mock Exams
 *                       placeholder) on the two 0580 courses, none on the
 *                       two 0607 courses
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set,
 *                       smeRowOfNote resolves every note; row codes
 *                       register in subtopicByCode for ?subtopic= deep
 *                       links; SME codes never enter the OFFICIAL tree
 *                       (the official anchoring tree stays byte-clean)
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave9.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildSpecTreeIndex,
  smeRowOfNote,
  smeRowOfQuestionSet,
} from "../src/lib/spec-tree";
import type { RevisionNote, ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusNotes: number; corpusSets: number }
interface SecFix { i: number; slug: string; title: string; order: number; liveSubtopics: number; rows: RowFix[] }
interface CourseFix {
  course: string; picker: string; code: string;
  fetched?: string;
  spine: { officialNodes: number; families: Record<string, number>; officialNodeDigest: string };
  // tranche-3 set-class law (the Edexcel maths pair): sets whose corpus
  // sectionSlug is an official-home class (b-16's SyllabAI past-paper sets,
  // the pdflane archive — NOT SME content) keep their official spine homes
  // via the smeRowOfQuestionSet null contract (spec-tree.ts:246) and stay
  // listed on the EQ selector through the smeActive Other-sets fallback;
  // every REMAINING (topic) set resolves exactly once. Courses without
  // setLaw keep the blanket tranche-1/2 law: ALL sets resolve.
  setLaw?: { topicSets: number; officialHomeSets: number; officialHomeSectionSlugs: string[] };
  // tranche-4 multi-match law (the wave-7 exact-one class, first in wave 9):
  // a course may carry the SAME topic slug under several live sections
  // (accounting: "overview" x4, "financial-statements-for-partnerships" x2).
  // Declared slugs are exempt from the zero-duplicate single-match law; the
  // exact-one resolution is proven by the per-row CORPUS count pins above
  // (a failed smeSectionSlug agreement would file rows to the wrong section
  // and the pins would drift). Undeclared duplicates still fail the gate.
  multiMatch?: string[];
  sections: SecFix[];
}

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave9-fixtures.json", import.meta.url), "utf-8"),
) as { fetched: string; recipe: string; courses: CourseFix[] };

const ROOT = new URL("../", import.meta.url); // apps/hub/
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

interface Node {
  code: string; family: string; title: string | null; parents: string[];
  provenanceTier?: string; order?: number; smeSectionSlug?: string;
}

// the live-only rows of record (teacher-only Mock Exams placeholder on 0580;
// none on 0607; none on the sciences-25 trio; SME past-paper placeholder
// topics on the Edexcel maths-a trees — the 18-higher and the 18-foundation
// siblings carry the same 4; SME's own skills/exam-technique placeholders
// on the 4BI1 and 0625 trees, 0625 also carrying the june-2023 past-paper
// placeholder; NONE on the tranche-7 pair — the 9701-AS and 9609 trees run
// the sciences-25 trio's 0-drift class, every live topic carrying corpus
// traffic; NONE on the tranche-8 pair either — the 4PH1 tree does NOT run
// its 4BI1 sibling's skills-placeholder class and the AS 9700 tree holds
// the trio's 0-drift class; NONE on the tranche-9 pair — the 4CH1 tree
// runs the 4PH1 class (NOT the 4BI1 one) and the new 0460 family lands
// clean; NONE on the tranche-10 pair — the 4SD0 Double-Award tree does
// NOT run its 4BI1 sibling's class and the new 0452 family lands clean
// (a notes-only corpus, 0 sets)) — mirrored verbatim as 0-note 0-set
// rows, the wave-1/3 0-set precedent
const DRIFT_BY_COURSE: Record<string, ReadonlySet<string>> = {
  "cie-igcse-maths-25-extended": new Set(["set-1-fl"]),
  "cie-igcse-maths-25-core": new Set(["set-1-fl"]),
  "cie-igcse-maths-international-maths-23-extended": new Set(),
  "cie-igcse-maths-international-maths-23-core": new Set(),
  "cie-a-level-biology-25": new Set(),
  "cie-a-level-chemistry-25": new Set(),
  "cie-a-level-physics-25": new Set(),
  "igcse-maths-b-16": new Set(),
  "igcse-maths-a-18-higher": new Set(["2023-june", "2023-june-r", "2023-november", "specimen"]),
  "cie-igcse-english-literature-21": new Set(),
  "cie-a-level-accounting-21": new Set(),
  "cie-a-level-economics-23": new Set(),
  "igcse-biology-19": new Set(["exam-technique", "handling-data-and-maths-skills", "practical-and-investigative-skills"]),
  "igcse-maths-a-18-foundation": new Set(["2023-june", "2023-june-r", "2023-november", "specimen"]),
  "cie-igcse-physics-23": new Set(["exam-technique", "handling-data-and-maths-skills", "practical-and-investigative-skills", "june-2023"]),
  "cie-as-chemistry-25": new Set(),
  "cie-a-level-business-23": new Set(),
  "igcse-physics-19": new Set(),
  "cie-as-biology-25": new Set(),
  "igcse-chemistry-19": new Set(),
  "cie-igcse-geography-25": new Set(),
  "igcse-science-double-award-17-biology": new Set(),
  "cie-igcse-accounting-25": new Set(),
  "igcse-biology-modular-24-unit-2": new Set(),
  "igcse-maths-a-modular-24-higher-unit-1": new Set(),
  "igcse-geography-19": new Set(),
  "cie-as-accounting-21": new Set(),
  "cie-igcse-religious-studies-23": new Set(),
  "igcse-science-double-award-17-physics": new Set(),
  "cie-igcse-computer-science-23": new Set(),
  "igcse-maths-a-modular-24-higher-unit-2": new Set(),
  "cie-as-physics-25": new Set(),
  "cie-igcse-business-23": new Set(),
  "cie-igcse-history-18": new Set(),
  "cie-igcse-science-combined-science-23-physics": new Set([
    // tranche 16: the FIRST drift event of wave 9 — six live-only
    // paper-organization topics (0 corpus notes AND 0 sets) that layer as
    // verbatim 0-count rows per the mirror law; documented exactly.
    "mcq-core",
    "mcq-extended",
    "paper-3-theory-core",
    "paper-4-theory-extended",
    "paper-5-practical-test",
    "paper-6-alternative-to-practical",
  ]),
  "cie-igcse-economics-25": new Set(),
  "cie-igcse-environmental-management-25": new Set(),
  "igcse-science-double-award-17-chemistry": new Set(),
  "igcse-business-19": new Set(),
  "igcse-maths-a-modular-24-foundation-unit-1": new Set(),
  "igcse-economics-17": new Set(["structuring-your-responses"]),
  "cie-igcse-economics-20": new Set(),
  "cie-igcse-ict-21": new Set(),
  "cie-igcse-business-25": new Set(),
  "cie-as-computer-science-19": new Set(),
  "igcse-science-double-award-modular-24-biology-unit-2": new Set(),
  "cie-igcse-accounting-21": new Set(["june-2023", "november-2023", "specimen", "templates"]),
  "igcse-ict-17": new Set(),
  "cie-igcse-geography-20": new Set(),
  "cie-igcse-further-maths-additional-maths-25": new Set(),
  "cie-as-business-23": new Set(["june-2023", "june-2024", "specimen"]),
  "cie-igcse-science-combined-science-23-chemistry": new Set(["mcq-core", "mcq-extended", "paper-3-theory-core", "paper-4-theory-extended", "paper-5-practical-test", "paper-6-alternative-to-practical"]),
  "igcse-physics-modular-24-unit-2": new Set(),
  "igcse-chemistry-modular-24-unit-1": new Set(),
  "igcse-physics-modular-24-unit-1": new Set(),
  "cie-igcse-science-combined-science-23-biology": new Set(["mcq-core", "mcq-extended", "paper-3-theory-core", "paper-4-theory-extended", "paper-5-practical-test", "paper-6-alternative-to-practical"]),
  "igcse-maths-a-modular-24-foundation-unit-2": new Set(),
  "igcse-further-maths-19": new Set(["jan-2023", "june-2023", "june-2024", "november-2023", "november-2024", "specimen-papers"]),
  "cie-igcse-english-language-25": new Set(["exam-skills-grammar", "exam-skills-punctuation", "exam-skills-spelling", "exam-tips-speaking-and-listening", "exam-tips-writing"]),
  "cie-as-environmental-management-20": new Set(),
  "igcse-science-double-award-modular-24-physics-unit-2": new Set(),
  "igcse-science-double-award-modular-24-chemistry-unit-1": new Set(),
  "igcse-chemistry-modular-24-unit-2": new Set(),
  "cie-igcse-english-language-20": new Set(),
  "igcse-science-double-award-modular-24-physics-unit-1": new Set(),
  "igcse-biology-modular-24-unit-1": new Set(),
  "igcse-accounting-17-introduction-to-bookkeeping-and-accounting": new Set(["2019-june", "2020-january", "2020-november", "2021-june", "2021-november", "2022-june", "2023-january", "2023-june", "2023-november", "2024-june"]),
  "cie-as-maths-20-pure-2": new Set(),
  "igcse-science-double-award-modular-24-biology-unit-1": new Set(),
};

for (const cf of FIXTURES.courses) {
  const course = cf.course;
  console.log(`\n=== ${course}`);
  const contentDir = new URL(`content/${course}/`, ROOT);
  const curriculum = JSON.parse(
    readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
  ) as { nodes: Node[] };
  const notes = JSON.parse(
    readFileSync(new URL("notes.json", contentDir), "utf-8"),
  ) as (RevisionNote & { contentKind?: string })[];
  const sets = JSON.parse(
    readFileSync(new URL("questions.json", contentDir), "utf-8"),
  ) as ExamQuestionTopic[];

  // 1. spine intact — family counts + digest of every official node
  const official = curriculum.nodes.filter((n) => !n.code.includes("-SME-S"));
  const fams: Record<string, number> = {};
  for (const n of official) fams[n.family] = (fams[n.family] ?? 0) + 1;
  const famsMatch =
    Object.keys(fams).length === Object.keys(cf.spine.families).length &&
    Object.entries(cf.spine.families).every(([k, v]) => fams[k] === v);
  famsMatch
    ? ok(`official spine family counts intact (${official.length} nodes: ${Object.entries(fams).map(([k, v]) => `${k}=${v}`).join(" / ")})`)
    : fail(`official family counts drifted: ${JSON.stringify(fams)} != ${JSON.stringify(cf.spine.families)}`);
  // canonical per-node string — must mirror scripts/w9_build.py spine_digest exactly
  const digest = createHash("sha256")
    .update(official
      .map((n) => [
        n.code,
        n.family,
        n.order === undefined || n.order === null ? "" : String(n.order),
        (n.parents ?? []).join("\x1e"),
        n.title ?? "",
      ].join("\x1f"))
      .sort()
      .join("\x1d"))
    .digest("hex")
    .slice(0, 16);
  digest === cf.spine.officialNodeDigest
    ? ok(`official-node digest intact (${digest})`)
    : fail(`official-node digest drifted: ${digest} != ${cf.spine.officialNodeDigest}`);

  // 2. layer present — provenance, shape, smeSectionSlug, verbatim titles
  const smeLayerRe = new RegExp(`^${course}-SME-S\\d+(:|$)`);
  const smeNodes = curriculum.nodes.filter((n) => smeLayerRe.test(n.code));
  const badProv = smeNodes.filter((n) => n.provenanceTier !== "SME_REFERENCE");
  badProv.length === 0
    ? ok(`all ${smeNodes.length} SME nodes provenanceTier=SME_REFERENCE`)
    : fail(`${badProv.length} SME nodes with wrong provenanceTier`);
  const secRows = smeNodes.filter((n) => n.family === "TOPIC");
  const topicRows = smeNodes.filter((n) => n.family === "SUBTOPIC");
  const expRows = cf.sections.reduce((a, s) => a + s.rows.length, 0);
  secRows.length === cf.sections.length
    ? ok(`section rows: ${secRows.length}`)
    : fail(`section rows ${secRows.length} != ${cf.sections.length}`);
  topicRows.length === expRows
    ? ok(`topic rows: ${topicRows.length}`)
    : fail(`topic rows ${topicRows.length} != ${expRows}`);
  const badSlug = secRows.filter((n) => n.smeSectionSlug !== cf.sections.find((s) => n.code.endsWith(`-SME-S${s.i}`))?.slug);
  badSlug.length === 0
    ? ok("every section row carries smeSectionSlug (the wave-7 law)")
    : fail(`${badSlug.length} section rows with wrong smeSectionSlug: ${badSlug.slice(0, 2).map((n) => n.code)}`);

  // 3+4+5. runtime layer, bijection, corpus-true counts (BOTH dimensions)
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === cf.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${cf.sections.length}`);

  let rowsChecked = 0;
  let notesPlaced = 0;
  let setsPlaced = 0;
  const driftSeen = new Set<string>();
  for (const [si, sf] of cf.sections.entries()) {
    const sec = secs[si];
    if (!sec) {
      fail(`missing section index ${si} (${sf.slug})`);
      continue;
    }
    if (sec.title !== sf.title) fail(`section ${sf.slug} title drift: ${sec.title}`);
    if (sec.smeSectionSlug !== sf.slug) fail(`section ${sf.slug} smeSectionSlug drift: ${sec.smeSectionSlug}`);
    for (const [ri, rf] of sf.rows.entries()) {
      const row = sec.subtopics[ri];
      rowsChecked++;
      if (!row) {
        fail(`missing row ${sf.slug}[${ri}] (:${rf.slug})`);
        continue;
      }
      if (!row.code.endsWith(`:${rf.slug}`)) {
        fail(`row order/slug drift at ${sf.slug}[${ri}]: ${row.code}`);
        continue;
      }
      if (row.title !== rf.title) fail(`row ${row.code} title drift: ${row.title}`);
      const mineNotes = notes.filter((n) => smeRowOfNote(n, index) === row.code);
      const mineSets = sets.filter((t) => smeRowOfQuestionSet(t, index) === row.code);
      notesPlaced += mineNotes.length;
      setsPlaced += mineSets.length;
      if (mineNotes.length !== rf.corpusNotes)
        fail(`${row.code}: ${mineNotes.length} corpus notes, fixtures pin ${rf.corpusNotes}`);
      if (mineSets.length !== rf.corpusSets)
        fail(`${row.code}: ${mineSets.length} corpus sets, fixtures pin ${rf.corpusSets}`);
      if (rf.corpusNotes === 0 && rf.corpusSets === 0) driftSeen.add(rf.slug);
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (rowsChecked === expRows && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS note+set counts pinned`);
  const expectedDrift = DRIFT_BY_COURSE[course] ?? new Set();
  if (driftSeen.size === expectedDrift.size && [...driftSeen].every((s) => expectedDrift.has(s)))
    ok(`drift rows exactly documented (${driftSeen.size === 0 ? "none" : [...driftSeen].sort().join(", ")})`);
  else fail(`drift set mismatch: got {${[...driftSeen].sort()}} want {${[...expectedDrift].sort()}}`);

  // every note resolved (the wave-9 point: the loose card empties)
  const unNotes = notes.filter((n) => !smeRowOfNote(n, index));
  unNotes.length === 0
    ? ok(`all ${notes.length} notes resolve via smeRowOfNote (loose card empties)`)
    : fail(`${unNotes.length}/${notes.length} notes unresolved: ${unNotes.slice(0, 3).map((n) => n.noteId)}`);
  // set homes (the EQ selector never hides a set): the tranche-1/2 blanket
  // law is every set resolves; under the tranche-3 set-class law the
  // official-home sets resolve to null BY LAW (they keep their official
  // spine homes, rendered via the smeActive Other-sets fallback) and every
  // topic set resolves exactly once
  const topicSets = cf.setLaw
    ? sets.filter((t) => !cf.setLaw!.officialHomeSectionSlugs.includes(t.sectionSlug ?? ""))
    : sets;
  const homeSets = cf.setLaw
    ? sets.filter((t) => cf.setLaw!.officialHomeSectionSlugs.includes(t.sectionSlug ?? ""))
    : [];
  if (cf.setLaw) {
    (topicSets.length === cf.setLaw.topicSets && homeSets.length === cf.setLaw.officialHomeSets)
      ? ok(`set classes: ${topicSets.length} topic sets on SME rows + ${homeSets.length} official-home sets (sectionSlug ${cf.setLaw.officialHomeSectionSlugs.join("|")})`)
      : fail(`set-class counts drifted: topic ${topicSets.length} != ${cf.setLaw.topicSets} / official-home ${homeSets.length} != ${cf.setLaw.officialHomeSets}`);
    const homeUnresolved = homeSets.filter((t) => smeRowOfQuestionSet(t, index) !== null);
    homeUnresolved.length === 0
      ? ok(`all ${homeSets.length} official-home sets keep their official spine homes (null contract)`)
      : fail(`${homeUnresolved.length} official-home sets wrongly resolved onto SME rows: ${homeUnresolved.slice(0, 3).map((t) => t.slug)}`);
  }
  const unSets = topicSets.filter((t) => !smeRowOfQuestionSet(t, index));
  unSets.length === 0
    ? ok(cf.setLaw
        ? `all ${topicSets.length} topic sets resolve via smeRowOfQuestionSet`
        : `all ${sets.length} sets resolve via smeRowOfQuestionSet`)
    : fail(`${unSets.length}/${topicSets.length} topic sets unresolved: ${unSets.slice(0, 3).map((t) => t.slug)}`);
  setsPlaced === topicSets.length
    ? ok(`total sets placed: ${setsPlaced} (of ${sets.length}${cf.setLaw ? `; ${homeSets.length} official-home` : ""})`)
    : fail(`total placed ${setsPlaced} != ${topicSets.length}`);
  notesPlaced === notes.length
    ? ok(`total notes placed: ${notesPlaced} (of ${notes.length})`)
    : fail(`total placed ${notesPlaced} != ${notes.length}`);

  // single-match law: each slug touches exactly one row (the set-side
  // coverage check runs over TOPIC sets; official-home set slugs are
  // by-law OFF the SME layer — assert they are exactly the uncovered ones)
  const noteSlugs = new Set(notes.filter((n) => n.topicSlug).map((n) => n.topicSlug as string));
  const setSlugs = new Set(topicSets.map((t) => t.topicSlug));
  const rowSuffix = secs.flatMap((s) => s.subtopics.map((r) => r.code.split(":")[1] as string));
  const dupes = rowSuffix.filter((s, i) => rowSuffix.indexOf(s) !== i);
  // tranche-4: declared multiMatch slugs are exempt from the zero-duplicate
  // law — their exact-one resolution is proven by the per-row corpus pins
  const declaredMulti = new Set(cf.multiMatch ?? []);
  const undeclaredDupes = [...new Set(dupes)].filter((s) => !declaredMulti.has(s));
  undeclaredDupes.length === 0
    ? ok(declaredMulti.size === 0
        ? `single-match law: ${rowSuffix.length} row slugs, 0 duplicate suffixes`
        : `single-match law: ${rowSuffix.length} row slugs; duplicates ${[...declaredMulti].sort().join(", ")} declared multi-match (exact-one via the per-row pins)`)
    : fail(`duplicate row suffixes not declared multiMatch: ${undeclaredDupes}`);
  const noteMissing = [...noteSlugs].filter((s) => !rowSuffix.includes(s));
  const setMissing = [...setSlugs].filter((s) => !rowSuffix.includes(s));
  noteMissing.length === 0
    ? ok(`all ${noteSlugs.size} note topicSlugs covered`)
    : fail(`${noteMissing.length} note slugs uncovered: ${noteMissing.slice(0, 3)}`);
  const homeSlugs = new Set(homeSets.map((t) => t.topicSlug));
  const setMissingAway = setMissing.filter((s) => !homeSlugs.has(s));
  const homeOnLayer = [...homeSlugs].filter((s) => rowSuffix.includes(s));
  cf.setLaw
    ? (setMissingAway.length === 0 && homeOnLayer.length === 0
        ? ok(`topic-set slugs covered; ${homeSlugs.size} official-home slugs correctly off the SME layer`)
        : fail(`coverage law: uncovered topic-set slugs ${setMissingAway.slice(0, 3)} / official-home slugs on layer ${homeOnLayer.slice(0, 3)}`))
    : (setMissing.length === 0
        ? ok(`all ${setSlugs.size} set topicSlugs covered`)
        : fail(`${setMissing.length} set slugs uncovered: ${setMissing.slice(0, 3)}`));

  // deep links + the official tree stays clean of SME codes
  const resolved = new Set(
    sets.map((t) => smeRowOfQuestionSet(t, index))
      .concat(notes.map((n) => smeRowOfNote(n, index)))
      .filter((c): c is string => !!c),
  );
  const missingLink = [...resolved].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok("all SME row codes resolve for ?subtopic= deep links")
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
  const smeInOfficial = index.tree.topics.filter((t) => smeLayerRe.test(t.code));
  smeInOfficial.length === 0
    ? ok("official tree.topics carries zero SME codes (anchoring tree untouched)")
    : fail(`${smeInOfficial.length} SME codes leaked into the official tree`);
}

console.log(failures === 0 ? "\nWAVE-9 GATE: PASS" : `\nWAVE-9 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
