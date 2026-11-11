/**
 * ADR-039 wave-5 gate — the SME Exam-Questions picker layer, the IAL Maths
 * family in one sweep (Edexcel International A Level Maths, 2020 spec):
 * pure-1/2/3/4, mechanics-1/2, statistics-1/2, decision-1.
 *
 * Same law as the wave-1/2/3/4 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet):
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only)
 *   2. layer present  — section rows + topic rows, all SME_REFERENCE,
 *                       titles verbatim from the live SaveMyExams pickers
 *                       (fetch 2026-11-11; the ONE SME course "Edexcel
 *                       International A Level (IAL) Maths" ships the
 *                       whole-course payload on every unit page; the
 *                       per-module picker is the module-filtered slice,
 *                       module ids pinned in the fixtures)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       topic row; per-row CORPUS set counts pinned exactly.
 *                       8 of 9 courses: PERFECT bijections. decision-1:
 *                       9/9 sets match on the four content sections, and
 *                       SME's "Past Paper Questions" section (10 season
 *                       rows, 2018-specimen … 2023-january, ALL 0-set in
 *                       the topic-questions payload) is mirrored verbatim
 *                       as empty rows, the wave-1/3/4 precedent.
 *   4. drift relation — corpusSets == smeLiveSets for EVERY row of ALL
 *                       nine courses: the FIRST ZERO-DRIFT WAVE (the hub
 *                       corpus was built from the same SME course, so
 *                       module set counts match the live payload exactly:
 *                       13/12/12/12/10/8/7/7/9). Any future SME drift is a
 *                       new disclosed wave.
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave5.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusSets: number; smeLiveSets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }
interface CourseFix { picker: string; fetched: string; moduleId: string; moduleName: string; sections: SecFix[] }

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave5-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const SPINE: Record<string, { topics: number; subs: number; points: number }> = {
  "ial-maths-20-pure-1": { topics: 5, subs: 5, points: 22 },
  "ial-maths-20-pure-2": { topics: 8, subs: 8, points: 19 },
  "ial-maths-20-pure-3": { topics: 6, subs: 6, points: 18 },
  "ial-maths-20-pure-4": { topics: 7, subs: 7, points: 18 },
  "ial-maths-20-mechanics-1": { topics: 6, subs: 6, points: 12 },
  "ial-maths-20-mechanics-2": { topics: 5, subs: 5, points: 13 },
  "ial-maths-20-statistics-1": { topics: 5, subs: 5, points: 16 },
  "ial-maths-20-statistics-2": { topics: 4, subs: 4, points: 16 },
  "ial-maths-20-decision-1": { topics: 5, subs: 5, points: 15 },
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const ROOT = new URL("../", import.meta.url); // apps/hub/

for (const [course, fx] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${course} (${fx.moduleName}, module ${fx.moduleId})`);
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

  // 3+4+5. runtime layer, bijection, corpus-true counts, zero-drift law
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

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
      if (rf.corpusSets !== rf.smeLiveSets) driftSeen.push(rf.slug);
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS counts pinned`);
  if (driftSeen.length === 0) {
    ok("zero-drift law: every row corpus == SME live (the first zero-drift wave)");
  } else {
    fail(`drift rows seen but wave 5 is the ZERO-DRIFT wave of record: [${driftSeen.sort().join(", ")}]`);
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

console.log(failures === 0 ? "\nWAVE-5 GATE: PASS" : `\nWAVE-5 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
