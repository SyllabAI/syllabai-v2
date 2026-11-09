/**
 * ADR-039 wave-2 gate — the SME Exam-Questions picker layer, ial-biology-18.
 *
 * Same law as the wave-1 gate, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet, not a reimplementation):
 *
 *   1. spine intact   — official TOPIC / SPEC_POINT counts unchanged
 *                       (the SME layer is append-only; nothing rewritten;
 *                       the pre-existing ial-biology-SME-SYNOPTIC-ASSESSMENT
 *                       row predates the layer and stays an official topic —
 *                       it does NOT match the /-SME-S\d+$/ layer pattern)
 *   2. layer present  — SME_REFERENCE section/topic rows exactly as many as
 *                       the live SaveMyExams picker had at fetch time
 *                       (fixtures generated from the live __NEXT_DATA__
 *                       payload, 2026-11-09 — see
 *                       scripts/sme_wave2_bio_append.py provenance)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       SME row; per-row set counts equal the live picker's
 *                       per-topic set counts (content parity of record;
 *                       slugs audited 29/29 incl. SME's own trailing-hyphen
 *                       quirk dna-and-gene-expression-, reproduced verbatim
 *                       on BOTH sides)
 *   4. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Wave-2 context (disclosed): biology's official spine topics T1-T8 already
 * mirror SME's numbered sections 1-8 by construction (and/& + numbering
 * cosmetics only) — the appended layer adds SME's verbatim titles/numbering
 * and its 29 topic rows (vs the sparse 10-row official subtopic layer) so
 * the exam-questions selector mirrors the SME picker exactly, as it does
 * for wave-1 physics/chemistry.
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave2.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; sets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }
interface CourseFix { spineTopics: number; specPoints: number; sets: number; sections: SecFix[] }

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave2-fixtures.json", import.meta.url), "utf-8"),
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

  // the LAYER nodes only: <course>-SME-S<n> sections + <course>-SME-S<n>:<slug> rows.
  // The pre-existing ial-biology-SME-SYNOPTIC-ASSESSMENT row (RULE_DERIVED, predates
  // the layer, no digits after S) is an official spine topic and correctly excluded.
  const smeLayerRe = new RegExp(`^${course}-SME-S\\d+(:|$)`);
  const smeNodes = curriculum.nodes.filter((n) => smeLayerRe.test(n.code));
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

console.log(failures === 0 ? "\nWAVE-2 GATE: PASS" : `\nWAVE-2 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
