/**
 * ADR-039 wave-1 gate — the SME Exam-Questions picker layer.
 *
 * For each wave-1 course this proves, against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet, not a reimplementation):
 *
 *   1. spine intact   — official TOPIC / SPEC_POINT counts unchanged
 *                       (the SME layer is append-only; nothing rewritten)
 *   2. layer present  — SME_REFERENCE section/topic rows exactly as many as
 *                       the live SaveMyExams picker had at fetch time
 *                       (fixtures generated from the live __NEXT_DATA__
 *                       payloads, 2026-11-09 — see scripts/adr039_wave1
 *                       _sme_rows.py provenance descriptions)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       SME row; per-row set counts equal the live picker's
 *                       per-topic set counts (content parity of record)
 *   4. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave1.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; sets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }
interface CourseFix { spineTopics: number; specPoints: number; sets: number; sections: SecFix[] }

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave1-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const ROOT = new URL("../", import.meta.url); // apps/hub/
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

for (const [course, fx] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${course}`);
  const contentDir = new URL(`content/${course}/`, ROOT);
  const curriculum = JSON.parse(
    readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
  ) as Curriculum;
  const sets = JSON.parse(
    readFileSync(new URL("questions.json", contentDir), "utf-8"),
  ) as ExamQuestionTopic[];

  // 1. spine intact
  const officialTopics = curriculum.nodes.filter(
    (n) => n.family === "TOPIC" && !/-SME-S\d+$/.test(n.code),
  );
  const specPoints = curriculum.nodes.filter((n) => n.family === "SPEC_POINT");
  officialTopics.length === fx.spineTopics
    ? ok(`official spine intact: ${officialTopics.length} topics, ${specPoints.length} spec points`)
    : fail(`spine changed: ${officialTopics.length} topics (expected ${fx.spineTopics})`);
  specPoints.length === fx.specPoints
    ? ok("")
    : fail(`spec points changed: ${specPoints.length} (expected ${fx.specPoints})`);

  const smeNodes = curriculum.nodes.filter((n) => n.code.includes("-SME-S"));
  const badProv = smeNodes.filter((n) => n.provenanceTier !== "SME_REFERENCE");
  badProv.length === 0
    ? ok(`all ${smeNodes.length} SME nodes provenanceTier=SME_REFERENCE`)
    : fail(`${badProv.length} SME nodes with wrong provenanceTier`);

  // 2. runtime layer
  const index = buildSpecTreeIndex(curriculum);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

  // 3+4. bijection + per-row counts vs the live picker
  let rowsChecked = 0;
  let setsPlaced = 0;
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
      if (mine.length !== rf.sets) {
        fail(`${row.code}: ${mine.length} sets, live picker has ${rf.sets}`);
      }
      const dupes = index.subtopicByCode.get(row.code);
      if (!dupes) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row counts == live picker`);

  // every set resolved to exactly one SME row
  const resolved = new Set(
    sets.map((t) => smeRowOfQuestionSet(t, index)).filter((c): c is string => !!c),
  );
  resolved.size === new Set(sets.map((t) => t.topicSlug)).size
    ? ok(`all ${sets.length} sets resolve 1:1 by topicSlug (${resolved.size} distinct rows)`)
    : fail(`resolution gap: ${resolved.size} rows for ${sets.length} sets`);
  setsPlaced === fx.sets
    ? ok(`total sets placed: ${setsPlaced}`)
    : fail(`total placed ${setsPlaced} != ${fx.sets}`);

  // grouped-view deep links resolve
  const missingLink = [...resolved].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok("all SME row codes resolve for ?subtopic= deep links")
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
}

console.log(failures === 0 ? "\nWAVE-1 GATE: PASS" : `\nWAVE-1 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
