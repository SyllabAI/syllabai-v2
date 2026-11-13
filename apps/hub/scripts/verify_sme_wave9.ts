/**
 * ADR-039 wave-9 gate — the SME picker layer, tranche 1 (operator order:
 * "wave-9 build tranche"): the CIE 2025 A-level science trio joins the 27
 * layered courses — the first corpus APPEND since wave 7 (waves 1-7 appended
 * the layer course by course; wave 8 was zero-append runtime mirroring).
 *
 *   - cie-a-level-chemistry-25 (9701, 2025-2027): 37 sections / 90 topics /
 *     141 sets / 239 notes
 *   - cie-a-level-biology-25   (9700, 2025-2027): 19 sections / 44 topics /
 *     68 sets / 239 notes — the wave-3-class partial-coverage drift on
 *     exactly three rows (SME added one set each to 12.1/12.2/13.1 since the
 *     corpus seed: corpus 68 vs live 71)
 *   - cie-a-level-physics-25   (9702, 2025-2027): 25 sections / 76 topics /
 *     108 sets / 201 notes
 *
 * Same law as the wave-1..8 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet + smeRowOfNote):
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only; the trio's
 *                       official spine stays byte-identical, only the nodes
 *                       array tail grows)
 *   2. layer present  — section rows + topic rows, all SME_REFERENCE, titles
 *                       verbatim from the live SaveMyExams pickers (fetch
 *                       2026-11-13); section rows carry smeSectionSlug; the
 *                       section numbering law: S1..Sn in live picker order,
 *                       TOPIC order continues after the max official topic
 *                       order, row order == the live per-section topic order
 *   3. bijection      — every corpus set resolves to EXACTLY ONE topic row;
 *                       per-row CORPUS counts pinned exactly; corpus never
 *                       exceeds SME live; the drift rows are exactly the
 *                       documented three (bio 12.1/12.2/13.1)
 *   4. notes mirror   — the wave-8 mirror law holds on the NEW courses: every
 *                       note resolves via smeRowOfNote (zero leftovers),
 *                       per-row note counts pinned exactly
 *   5. runtime homes  — grouped view row codes resolve through
 *                       subtopicByCode; deep links live
 *   6. fleet safety   — courses WITHOUT an SME layer still resolve to null
 *                       (probes re-pinned here stay outside the layer)
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave9.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import {
  buildSpecTreeIndex,
  smeRowOfNote,
  smeRowOfQuestionSet,
  subtopicOfNote,
} from "../src/lib/spec-tree";
import type { ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

interface RowFix {
  slug: string;
  title: string;
  corpusNotes: number;
  corpusSets: number;
  smeLiveSets: number;
}
interface SecFix {
  code: string;
  slug: string;
  title: string;
  order: number;
  rows: RowFix[];
}
interface CourseFix {
  picker: string;
  fetched: string;
  qualification: string;
  sections: SecFix[];
}

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave9-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const SPINE: Record<string, { topics: number; subs: number; points: number }> = {
  "cie-a-level-chemistry-25": { topics: 37, subs: 90, points: 356 },
  "cie-a-level-biology-25": { topics: 19, subs: 44, points: 257 },
  "cie-a-level-physics-25": { topics: 25, subs: 76, points: 303 },
};

/** the wave-3-class partial-coverage rows of record (corpus < SME live):
 *  SME added one set each after the corpus seed — disclosed upstream drift,
 *  mirrored rows keep the corpus truth. */
const DRIFT_ROWS: Record<string, Set<string>> = {
  "cie-a-level-chemistry-25": new Set(),
  "cie-a-level-biology-25": new Set([
    "12-1-energy",
    "12-2-respiration",
    "13-1-photosynthesis-as-an-energy-transfer-process",
  ]),
  "cie-a-level-physics-25": new Set(),
};

/** the no-layer fleet-safety probes of record (all three stay unlayered in
 *  tranche 1; the wave-8 probe on cie-a-level-chemistry-25 was re-pinned to
 *  cie-igcse-physics-23 by this wave — the course now carries the layer) */
const FLEET_PROBES = ["cie-as-physics-25", "cie-igcse-physics-23", "igcse-maths-b-16"];

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const ROOT = new URL("../", import.meta.url); // apps/hub/
const contentDir = new URL("content/", ROOT);

let totalSets = 0;
let totalNotes = 0;
let totalOfficial = 0;
let totalBridged = 0;

for (const [course, fx] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${course} (${fx.qualification})`);
  const dir = new URL(`${course}/`, contentDir);
  const curriculum = JSON.parse(
    readFileSync(new URL("curriculum.json", dir), "utf-8"),
  ) as {
    nodes: Array<{
      code: string;
      family: string;
      title: string | null;
      provenanceTier?: string;
      order?: number;
      smeSectionSlug?: string;
      parents?: string[];
      description?: string | null;
    }>;
  };
  const sets = JSON.parse(
    readFileSync(new URL("questions.json", dir), "utf-8"),
  ) as ExamQuestionTopic[];
  const notes = JSON.parse(
    readFileSync(new URL("notes.json", dir), "utf-8"),
  ) as RevisionNote[];
  const spine = SPINE[course];
  if (!spine) {
    fail(`no spine of record for ${course}`);
    continue;
  }

  // 1. spine intact (pre-append shape of record)
  const smeLayerRe = new RegExp(`^${course}-SME-S\\d+(:|$)`);
  const officialTopics = curriculum.nodes.filter(
    (n) => n.family === "TOPIC" && !smeLayerRe.test(n.code),
  );
  const officialSubs = curriculum.nodes.filter(
    (n) => n.family === "SUBTOPIC" && !smeLayerRe.test(n.code),
  );
  const specPoints = curriculum.nodes.filter((n) => n.family === "SPEC_POINT");
  officialTopics.length === spine.topics
    ? ok(`official spine intact: ${spine.topics} topic rows`)
    : fail(`official topics ${officialTopics.length} != ${spine.topics}`);
  officialSubs.length === spine.subs
    ? ok(`official subtopic rows intact: ${spine.subs}`)
    : fail(`official subtopic rows ${officialSubs.length} != ${spine.subs}`);
  specPoints.length === spine.points
    ? ok(`spec points intact: ${spine.points}`)
    : fail(`spec points ${specPoints.length} != ${spine.points}`);

  // 2. layer provenance + shape + verbatim mirror + numbering law
  const smeNodes = curriculum.nodes.filter((n) => smeLayerRe.test(n.code));
  const badProv = smeNodes.filter((n) => n.provenanceTier !== "SME_REFERENCE");
  badProv.length === 0
    ? ok(`all ${smeNodes.length} SME nodes provenanceTier=SME_REFERENCE`)
    : fail(`${badProv.length} SME nodes with wrong provenanceTier`);
  const expectedNodes = fx.sections.reduce((a, s) => a + 1 + s.rows.length, 0);
  smeNodes.length === expectedNodes
    ? ok(`layer shape: ${fx.sections.length} sections + ${expectedNodes - fx.sections.length} topic rows`)
    : fail(`layer shape ${smeNodes.length} != expected ${expectedNodes}`);
  const secNodes = smeNodes.filter((n) => n.family === "TOPIC");
  const missingSlug = secNodes.filter((n) => !n.smeSectionSlug);
  missingSlug.length === 0
    ? ok(`all ${secNodes.length} section rows carry smeSectionSlug`)
    : fail(`${missingSlug.length} section rows missing smeSectionSlug`);
  const maxOfficialTopicOrder = Math.max(
    ...officialTopics.map((n) => n.order ?? 0),
  );
  const secLawBad = secNodes.filter((n, i) => {
    const fxSec = fx.sections[i];
    if (!fxSec) return true;
    return (
      n.code !== fxSec.code ||
      n.smeSectionSlug !== fxSec.slug ||
      n.title !== fxSec.title ||
      (n.order ?? 0) !== maxOfficialTopicOrder + 1 + i ||
      !n.code.endsWith(`-SME-S${i + 1}`)
    );
  });
  secLawBad.length === 0
    ? ok(`section rows mirror the live picker verbatim (S1..S${fx.sections.length}, orders ${maxOfficialTopicOrder + 1}..${maxOfficialTopicOrder + fx.sections.length}, slug + title)`)
    : fail(`${secLawBad.length} section rows break the numbering/mirror law`);
  let rowLawBad = 0;
  for (const [si, sf] of fx.sections.entries()) {
    const rows = curriculum.nodes.filter(
      (n) => n.family === "SUBTOPIC" && (n.parents ?? []).includes(sf.code),
    );
    if (rows.length !== sf.rows.length) {
      fail(`section ${sf.code}: ${rows.length} rows != fixture ${sf.rows.length}`);
      continue;
    }
    for (const [ri, rf] of sf.rows.entries()) {
      const row = rows[ri];
      if (
        row.code !== `${sf.code}:${rf.slug}` ||
        row.title !== rf.title ||
        (row.order ?? 0) !== ri
      ) {
        rowLawBad++;
      }
    }
  }
  rowLawBad === 0
    ? ok(`topic rows mirror the live picker verbatim (slug + title + per-section order)`)
    : fail(`${rowLawBad} topic rows drift from the live picker`);

  // 3+4+5. runtime layer, set bijection, notes mirror, corpus-true counts
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

  let setsPlaced = 0;
  const setHomes = new Map<string, number>();
  for (const t of sets) {
    const row = smeRowOfQuestionSet(t, index);
    if (!row) continue;
    setsPlaced++;
    setHomes.set(row, (setHomes.get(row) ?? 0) + 1);
  }
  setsPlaced === sets.length
    ? ok(`sets placed on SME rows: ${setsPlaced}/${sets.length}`)
    : fail(`placement gap: ${setsPlaced} of ${sets.length} sets resolved`);
  const distinctSetRows = new Set(setHomes.keys());
  distinctSetRows.size === setHomes.size
    ? ok(`1:1 set resolution: ${distinctSetRows.size} distinct rows for ${setsPlaced} sets`)
    : fail(`resolution collision: ${distinctSetRows.size} rows for ${setsPlaced} sets`);

  let driftSeen = 0;
  let rowsChecked = 0;
  let notesPlaced = 0;
  let noteCountBad = 0;
  for (const [si, sf] of fx.sections.entries()) {
    const sec = secs[si];
    if (!sec) continue;
    if (sec.title !== sf.title) fail(`section ${sf.code} title drift: ${sec.title!}`);
    for (const [ri, rf] of sf.rows.entries()) {
      const row = sec.subtopics[ri];
      rowsChecked++;
      if (!row) {
        fail(`missing row ${sf.code}:${rf.slug}`);
        continue;
      }
      if (!row.code.endsWith(`:${rf.slug}`)) {
        fail(`row order/slug drift at ${sf.code}[${ri}]: ${row.code}`);
        continue;
      }
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
      const mine = setHomes.get(row.code) ?? 0;
      if (mine !== rf.corpusSets) {
        fail(`${row.code}: ${mine} corpus sets, fixtures pin ${rf.corpusSets}`);
      }
      if (rf.corpusSets > rf.smeLiveSets) {
        fail(`${row.code}: corpus ${rf.corpusSets} > SME live ${rf.smeLiveSets} (impossible drift)`);
      }
      if (rf.corpusSets < rf.smeLiveSets) {
        driftSeen++;
        if (!DRIFT_ROWS[course].has(rf.slug)) {
          fail(`${row.code}: undocumented drift ${rf.corpusSets} vs ${rf.smeLiveSets}`);
        }
      }
      const notesHere = notes.filter((n) => smeRowOfNote(n, index) === row.code).length;
      notesPlaced += notesHere;
      if (notesHere !== rf.corpusNotes) {
        fail(`${row.code}: ${notesHere} corpus notes, fixtures pin ${rf.corpusNotes}`);
        noteCountBad++;
      }
    }
  }
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS note+set counts pinned`);
  driftSeen === DRIFT_ROWS[course].size
    ? ok(
        DRIFT_ROWS[course].size === 0
          ? "drift law: every covered row corpus == SME live (zero drift)"
          : `drift rows are exactly the documented ${DRIFT_ROWS[course].size} (${[...DRIFT_ROWS[course]].sort().join(", ")})`,
      )
    : fail(`drift set mismatch: saw ${driftSeen}, documented ${DRIFT_ROWS[course].size}`);

  // the wave-8 mirror law on the new course: every note resolves, official
  // carries + bridges conserved, zero leftovers
  let official = 0;
  for (const n of notes) {
    if (subtopicOfNote(n, index) !== null) official++;
  }
  const bridged = notesPlaced - official;
  totalSets += sets.length;
  totalNotes += notes.length;
  totalOfficial += official;
  totalBridged += bridged;
  notesPlaced === notes.length
    ? ok(`notes mirror: ${notesPlaced}/${notes.length} resolve (officially-placed ${official} carried, ${bridged} bridged, zero leftovers)`)
    : fail(`notes leftover: ${notes.length - notesPlaced} unresolved`);

  const distinctRows = new Set(
    secs.flatMap((s) => s.subtopics.map((r) => r.code)),
  );
  const missingLink = [...distinctRows].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok(`all ${distinctRows.size} SME row codes resolve for ?subtopic= deep links`)
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
}

console.log(
  `\nTRANCHE-1 CORPUS: ${Object.keys(FIXTURES).length} courses, ${totalNotes} notes -> ${totalNotes} resolved ` +
    `(officially-placed carries ${totalOfficial}, bridged ${totalBridged}, leftovers ${totalNotes - totalOfficial - totalBridged}); ` +
    `${totalSets} sets placed 1:1`,
);

// 6. fleet safety: courses WITHOUT an SME layer resolve to null (the notes
// and sets selectors render exactly as before there)
{
  for (const course of FLEET_PROBES) {
    const dir = new URL(`${course}/`, contentDir);
    const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
    const notes = JSON.parse(readFileSync(new URL("notes.json", dir), "utf-8")) as RevisionNote[];
    const sets = JSON.parse(readFileSync(new URL("questions.json", dir), "utf-8")) as ExamQuestionTopic[];
    const index = buildSpecTreeIndex(curriculum as never);
    const noteHits = notes.filter((n) => smeRowOfNote(n, index) !== null).length;
    const setHits = sets.filter((t) => smeRowOfQuestionSet(t, index) !== null).length;
    noteHits === 0 && setHits === 0
      ? ok(`fleet safety: ${course} (no SME layer) -> ${noteHits} note hits, ${setHits} set hits (selector unchanged)`)
      : fail(`fleet safety broken: ${course} resolved ${noteHits} notes / ${setHits} sets without an SME layer`);
  }
}

console.log(failures === 0 ? "\nWAVE-9 GATE: PASS" : `\nWAVE-9 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
