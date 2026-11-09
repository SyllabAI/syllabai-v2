/**
 * ADR-039 wave-3 gate — the SME Exam-Questions picker layer, cie-igcse-chemistry-23.
 *
 * Same law as the wave-1/2 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet), with ONE wave-3 extension —
 * the count law is CORPUS-true, not live-mirrored:
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only)
 *   2. layer present  — 14 section rows + 32 topic rows, all
 *                       SME_REFERENCE, titles verbatim from the live
 *                       SaveMyExams picker (fetch 2026-11-09,
 *                       /igcse/chemistry/cie/23/topic-questions/)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       topic row; per-row CORPUS set counts pinned exactly
 *                       (the ring shows what the hub holds). Disclosed
 *                       upstream drift (audit of record): 23/28 counts
 *                       exact; 5 rows where SME now carries ONE MORE set
 *                       than the corpus (SME's later-added "Alternative to
 *                       Practical Questions" sets — corpus predates them:
 *                       1-1-solids-liquids-and-gases, 2-2-ions-and-ionic-
 *                       bonds, 6-3-redox, 8-2-group-properties-and-trends,
 *                       10-1-water-and-water-pollution); 4 rows 0-set on
 *                       BOTH sides (13. Exam Skills ×3 + Past Paper TRIAL
 *                       ×1 — mirrored verbatim as empty rows, the wave-1
 *                       0-set precedent)
 *   4. drift relation — corpusSets <= smeLiveSets for every row, and the
 *                       drift rows are EXACTLY the documented five
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave3.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusSets: number; smeLiveSets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave3-fixtures.json", import.meta.url), "utf-8"),
) as { sections: SecFix[] };

const ROOT = new URL("../", import.meta.url); // apps/hub/
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const course = "cie-igcse-chemistry-23";
console.log(`\n=== ${course}`);
const contentDir = new URL(`content/${course}/`, ROOT);
const curriculum = JSON.parse(
  readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
) as { nodes: Array<{ code: string; family: string; title: string | null; provenanceTier?: string }> };
const sets = JSON.parse(
  readFileSync(new URL("questions.json", contentDir), "utf-8"),
) as ExamQuestionTopic[];

// 1. spine intact (pre-append shape of record: 12 / 49 / 252)
const officialTopics = curriculum.nodes.filter(
  (n) => n.family === "TOPIC" && !/-SME-S\d+$/.test(n.code),
);
const officialSubs = curriculum.nodes.filter(
  (n) => n.family === "SUBTOPIC" && !/^cie-igcse-chemistry-23-SME-S\d+/.test(n.code),
);
const specPoints = curriculum.nodes.filter((n) => n.family === "SPEC_POINT");
officialTopics.length === 12
  ? ok(`official spine intact: 12 topics`)
  : fail(`official topics ${officialTopics.length} != 12`);
officialSubs.length === 49
  ? ok(`official subtopic rows intact: 49`)
  : fail(`official subtopic rows ${officialSubs.length} != 49`);
specPoints.length === 252
  ? ok(`spec points intact: 252`)
  : fail(`spec points ${specPoints.length} != 252`);

// 2. layer provenance
const smeLayerRe = new RegExp(`^${course}-SME-S\\d+(:|$)`);
const smeNodes = curriculum.nodes.filter((n) => smeLayerRe.test(n.code));
const badProv = smeNodes.filter((n) => n.provenanceTier !== "SME_REFERENCE");
badProv.length === 0
  ? ok(`all ${smeNodes.length} SME nodes provenanceTier=SME_REFERENCE`)
  : fail(`${badProv.length} SME nodes with wrong provenanceTier`);

// 3+4+5. runtime layer, bijection, corpus-true counts, drift relation
const index = buildSpecTreeIndex(curriculum as never);
const secs = index.tree.smeSections ?? [];
secs.length === FIXTURES.sections.length
  ? ok(`runtime smeSections: ${secs.length}`)
  : fail(`runtime smeSections ${secs.length} != ${FIXTURES.sections.length}`);

const DRIFT_ROWS = new Set([
  "1-1-solids-liquids-and-gases",
  "2-2-ions-and-ionic-bonds",
  "6-3-redox",
  "8-2-group-properties-and-trends",
  "10-1-water-and-water-pollution",
]);

let rowsChecked = 0;
let setsPlaced = 0;
let driftSeen = new Set<string>();
for (const [si, sf] of FIXTURES.sections.entries()) {
  const sec = secs[si];
  if (!sec) {
    fail(`missing section ${sf.code}`);
    continue;
  }
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
    const mine = sets.filter((t) => smeRowOfQuestionSet(t, index) === row.code);
    setsPlaced += mine.length;
    if (mine.length !== rf.corpusSets) {
      fail(`${row.code}: ${mine.length} corpus sets, fixtures pin ${rf.corpusSets}`);
    }
    if (rf.corpusSets > rf.smeLiveSets) {
      fail(`${row.code}: corpus ${rf.corpusSets} > SME live ${rf.smeLiveSets} (impossible drift)`);
    }
    if (rf.corpusSets !== rf.smeLiveSets) {
      driftSeen.add(rf.slug);
      if (!DRIFT_ROWS.has(rf.slug)) fail(`${row.code}: undocumented drift ${rf.corpusSets} vs ${rf.smeLiveSets}`);
    }
    if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
  }
}
if (rowsChecked === FIXTURES.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
  ok(`bijection: ${rowsChecked} rows, per-row CORPUS counts pinned`);
if (driftSeen.size === DRIFT_ROWS.size && [...driftSeen].every((s) => DRIFT_ROWS.has(s)))
  ok(`drift rows are exactly the documented five (${[...driftSeen].sort().join(", ")})`);
else fail(`drift set mismatch: ${[...driftSeen].sort().join(", ")}`);

// every set resolved to exactly one SME row
const resolved = new Set(
  sets.map((t) => smeRowOfQuestionSet(t, index)).filter((c): c is string => !!c),
);
resolved.size === new Set(sets.map((t) => t.topicSlug)).size
  ? ok(`all ${sets.length} sets resolve 1:1 by topicSlug (${resolved.size} distinct rows)`)
  : fail(`resolution gap: ${resolved.size} rows for ${new Set(sets.map((t) => t.topicSlug)).size} slugs`);
setsPlaced === sets.length
  ? ok(`total sets placed: ${setsPlaced}`)
  : fail(`total placed ${setsPlaced} != ${sets.length}`);

// grouped-view deep links resolve
const missingLink = [...resolved].filter((c) => !index.subtopicByCode.has(c));
missingLink.length === 0
  ? ok("all SME row codes resolve for ?subtopic= deep links")
  : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);

console.log(failures === 0 ? "\nWAVE-3 GATE: PASS" : `\nWAVE-3 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
