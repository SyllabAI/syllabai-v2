/**
 * ADR-039 wave-4 gate — the SME Exam-Questions picker layer,
 * cie-igcse-biology-23 + the three co-ordinated-sciences-double-award-23
 * slices (biology / chemistry / physics).
 *
 * Same law as the wave-1/2/3 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet), wave-3 count law:
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only)
 *   2. layer present  — section rows + topic rows, all SME_REFERENCE,
 *                       titles verbatim from the live SaveMyExams pickers
 *                       (fetch 2026-11-09; bio-23 /igcse/biology/cie/23/,
 *                       slices /igcse/science/cie/co-ordinated-sciences-
 *                       double-award/23/<science>/)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       topic row; per-row CORPUS set counts pinned exactly
 *                       (the ring shows what the hub holds). Perfect
 *                       bijections on all three slices (0 hub-only / 0
 *                       sme-only). bio-23: 3 sme-only topics ALL 0-set on
 *                       SME ("22. Exam Skills": exam-technique,
 *                       handling-data-and-maths-skills,
 *                       practical-and-investigative-skills — mirrored
 *                       verbatim as empty rows, the wave-1/3 precedent)
 *   4. drift relation — corpusSets <= smeLiveSets for every row, and the
 *                       drift rows are EXACTLY the documented sets:
 *                       bio-23 exactly {8-1-transport-in-plants} (SME's
 *                       4th set, "Teacher Only Questions"); the three
 *                       slices ALL rows (corpus holds 1 consolidated set
 *                       per topic; SME live splits MCQ / Theory /
 *                       Alternative-to-Practical — 50/67/51 live vs
 *                       19/26/21 corpus). Disclosed, not silently absorbed.
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave4.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusSets: number; smeLiveSets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }
interface CourseFix { picker: string; fetched: string; sections: SecFix[] }

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave4-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const SPINE: Record<string, { topics: number; subs: number; points: number }> = {
  "cie-igcse-biology-23": { topics: 21, subs: 61, points: 388 },
  "cie-igcse-science-co-ordinated-sciences-double-award-23-biology": { topics: 19, subs: 43, points: 230 },
  "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry": { topics: 12, subs: 46, points: 181 },
  "cie-igcse-science-co-ordinated-sciences-double-award-23-physics": { topics: 6, subs: 23, points: 221 },
};

// Documented drift sets of record (audit 2026-11-09). "ALL" = every row.
const DRIFT: Record<string, Set<string> | "ALL"> = {
  "cie-igcse-biology-23": new Set(["8-1-transport-in-plants"]),
  "cie-igcse-science-co-ordinated-sciences-double-award-23-biology": "ALL",
  "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry": "ALL",
  "cie-igcse-science-co-ordinated-sciences-double-award-23-physics": "ALL",
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const ROOT = new URL("../", import.meta.url); // apps/hub/

for (const [course, fx] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${course}`);
  const contentDir = new URL(`content/${course}/`, ROOT);
  const curriculum = JSON.parse(
    readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
  ) as { nodes: Array<{ code: string; family: string; title: string | null; provenanceTier?: string; order?: number }> };
  const sets = JSON.parse(
    readFileSync(new URL("questions.json", contentDir), "utf-8"),
  ) as ExamQuestionTopic[];
  const spine = SPINE[course];
  if (!spine) {
    fail(`no spine of record for ${course}`);
    continue;
  }

  // 1. spine intact (pre-append shape of record)
  const smePartRe = new RegExp(`^${course}-SME-S\\d+`);
  const officialTopics = curriculum.nodes.filter(
    (n) => n.family === "TOPIC" && !/-SME-S\d+$/.test(n.code),
  );
  const officialSubs = curriculum.nodes.filter(
    (n) => n.family === "SUBTOPIC" && !smePartRe.test(n.code),
  );
  const specPoints = curriculum.nodes.filter((n) => n.family === "SPEC_POINT");
  officialTopics.length === spine.topics
    ? ok(`official spine intact: ${spine.topics} topics`)
    : fail(`official topics ${officialTopics.length} != ${spine.topics}`);
  officialSubs.length === spine.subs
    ? ok(`official subtopic rows intact: ${spine.subs}`)
    : fail(`official subtopic rows ${officialSubs.length} != ${spine.subs}`);
  specPoints.length === spine.points
    ? ok(`spec points intact: ${spine.points}`)
    : fail(`spec points ${specPoints.length} != ${spine.points}`);

  // 2. layer provenance
  const smeLayerRe = new RegExp(`^${course}-SME-S\\d+(:|$)`);
  const smeNodes = curriculum.nodes.filter((n) => smeLayerRe.test(n.code));
  const badProv = smeNodes.filter((n) => n.provenanceTier !== "SME_REFERENCE");
  badProv.length === 0
    ? ok(`all ${smeNodes.length} SME nodes provenanceTier=SME_REFERENCE`)
    : fail(`${badProv.length} SME nodes with wrong provenanceTier`);
  const expectedNodes = fx.sections.reduce((a, s) => a + 1 + s.rows.length, 0);
  smeNodes.length === expectedNodes
    ? ok(`layer shape: ${fx.sections.length} sections + ${expectedNodes - fx.sections.length} topic rows`)
    : fail(`layer shape ${smeNodes.length} != expected ${expectedNodes}`);

  // 3+4+5. runtime layer, bijection, corpus-true counts, drift relation
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

  const drift = DRIFT[course];
  let rowsChecked = 0;
  let setsPlaced = 0;
  const driftSeen: string[] = [];
  for (const [si, sf] of fx.sections.entries()) {
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
        driftSeen.push(rf.slug);
        if (drift !== "ALL" && !drift.has(rf.slug))
          fail(`${row.code}: undocumented drift ${rf.corpusSets} vs ${rf.smeLiveSets}`);
      } else if (drift !== "ALL" && drift.has(rf.slug)) {
        fail(`${row.code}: documented drift row shows NO drift ${rf.corpusSets} vs ${rf.smeLiveSets}`);
      }
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS counts pinned`);
  if (drift === "ALL") {
    driftSeen.length === rowsChecked
      ? ok(`drift law (ALL rows): ${driftSeen.length}/${rowsChecked} rows corpus<SME-live — the disclosed consolidated-corpus class`)
      : fail(`drift law (ALL rows) violated: ${driftSeen.length}/${rowsChecked} drifting`);
  } else {
    const same = driftSeen.length === drift.size && driftSeen.every((s) => drift.has(s));
    same
      ? ok(`drift rows are exactly the documented set (${[...drift].sort().join(", ")})`)
      : fail(`drift set mismatch: seen [${driftSeen.sort().join(", ")}] vs documented [${[...drift].sort().join(", ")}]`);
  }

  // every set resolved to exactly one SME row
  const resolved = new Set(
    sets.map((t) => smeRowOfQuestionSet(t, index)).filter((c): c is string => !!c),
  );
  const distinctSlugs = new Set(sets.map((t) => t.topicSlug)).size;
  resolved.size === distinctSlugs
    ? ok(`all ${sets.length} sets resolve 1:1 by topicSlug (${resolved.size} distinct rows)`)
    : fail(`resolution gap: ${resolved.size} rows for ${distinctSlugs} slugs`);
  setsPlaced === sets.length
    ? ok(`total sets placed: ${setsPlaced}`)
    : fail(`total placed ${setsPlaced} != ${sets.length}`);

  // grouped-view deep links resolve
  const missingLink = [...resolved].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok("all SME row codes resolve for ?subtopic= deep links")
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
}

console.log(failures === 0 ? "\nWAVE-4 GATE: PASS" : `\nWAVE-4 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
