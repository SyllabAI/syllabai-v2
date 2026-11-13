/**
 * ADR-039 wave-6 gate — the SME Exam-Questions picker layer, the CIE Maths
 * family in one sweep (Cambridge International A Level Maths, 9709, 2020
 * spec): AS pure-1, A Level pure-1/pure-3, AS + A Level mechanics, AS +
 * A Level probability-and-statistics-1, A Level probability-and-statistics-2.
 *
 * Same law as the wave-1..5 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet):
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only)
 *   2. layer present  — section rows + topic rows, all SME_REFERENCE, titles
 *                       verbatim from the live SaveMyExams pickers (fetch
 *                       2026-11-12; the ONE SME course "Cambridge
 *                       International A Level Maths" crs_9fVmFm3g3fXrykfz
 *                       ships the whole-course pooled payload — 39 sections /
 *                       75 topics / 75 questionSets — on every unit page;
 *                       sections+topics are module-filtered, sets carry a
 *                       direct module relationship; per-module slices pinned
 *                       in the fixtures by module id)
 *   3. bijection      — every corpus set's topicSlug matches EXACTLY ONE
 *                       topic row; per-row CORPUS set counts pinned exactly.
 *                       7 of 8 courses: PERFECT bijections. AS PS1: 9/10
 *                       exact + ONE documented trailing-hyphen corpus variant
 *                       (topicSlug "representation-of-data-" vs live
 *                       "representation-of-data"; the known ci-repair/
 *                       cie-unit-tail-trailing-variant corpus quirk class) —
 *                       pinned in the fixtures, name-verified verbatim, and
 *                       its set KEEPS its official-spine home (runtime
 *                       smeRowOfQuestionSet returns null for it; zero homes
 *                       moved).
 *   4. drift relation — corpusSets == smeLiveSets BY TOPIC for every row of
 *                       all eight courses once the one pinned variant
 *                       normalization is applied (AS PS1 10 == 10; exact-slug
 *                       9/10 with the variant disclosed). SME hosts NO Pure 2
 *                       module for 9709 (picker 404; pool math 75 = 22+24+
 *                       10+10+9), so cie-as-maths-20-pure-2 (15 sets) is
 *                       outside this wave and keeps official-spine-only
 *                       service.
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set (except the
 *                       pinned variant); grouped-view row codes resolve
 *                       through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave6.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusSets: number; smeLiveSets: number }
interface SecFix { code: string; title: string; rows: RowFix[] }
interface CourseFix {
  picker: string;
  fetched: string;
  moduleId: string;
  moduleName: string;
  sections: SecFix[];
  trailingVariant?: { smeSlug: string; corpusSlug: string };
}

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave6-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const SPINE: Record<string, { topics: number; subs: number; points: number }> = {
  "cie-as-maths-20-pure-1": { topics: 1, subs: 8, points: 36 },
  "cie-as-maths-20-mechanics": { topics: 1, subs: 5, points: 22 },
  "cie-as-maths-20-probability-and-statistics-1": { topics: 1, subs: 5, points: 17 },
  "cie-a-level-maths-20-pure-1": { topics: 1, subs: 8, points: 36 },
  "cie-a-level-maths-20-pure-3": { topics: 1, subs: 9, points: 43 },
  "cie-a-level-maths-20-mechanics": { topics: 1, subs: 5, points: 22 },
  "cie-a-level-maths-20-probability-and-statistics-1": { topics: 1, subs: 5, points: 17 },
  "cie-a-level-maths-20-probability-and-statistics-2": { topics: 1, subs: 5, points: 18 },
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
    ? ok(`official spine intact: ${spine.topics} topic row`)
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

  // 3+4+5. runtime layer, bijection, corpus-true counts, drift law
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

  let rowsChecked = 0;
  let setsPlaced = 0;
  const driftSeen: string[] = [];
  let variantHandled = 0;
  const variant = fx.trailingVariant;
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
        const isVariant = variant !== undefined && rf.slug === variant.smeSlug;
        if (!isVariant) driftSeen.push(rf.slug);
      }
      if (variant !== undefined && rf.slug === variant.smeSlug) {
        variantHandled++;
        // the variant corpus set must exist verbatim (name == SME topic title)
        // and keep its official-spine home (no SME row match)
        const vset = sets.find((t) => t.topicSlug === variant!.corpusSlug);
        if (!vset) {
          fail(`pinned variant set missing: topicSlug ${variant!.corpusSlug}`);
        } else {
          if (vset.name !== rf.title) {
            fail(`variant set name drift: ${vset.name!} != ${rf.title}`);
          }
          if (smeRowOfQuestionSet(vset, index) !== null) {
            fail(`variant set unexpectedly resolves to an SME row (expected official-spine home)`);
          }
        }
      }
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (variant !== undefined && variantHandled !== 1)
    fail(`expected exactly 1 pinned variant row, saw ${variantHandled}`);
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS counts pinned`);
  if (driftSeen.length === 0) {
    ok("drift law: every row corpus == SME live BY TOPIC (variant normalization applied where pinned)");
  } else {
    fail(`drift rows outside the pinned variant: [${driftSeen.sort().join(", ")}]`);
  }
  // course-total drift proof: corpus sets == SME live sets
  const totalLive = fx.sections.reduce((a, s) => a + s.rows.reduce((b, r) => b + r.smeLiveSets, 0), 0);
  totalLive === sets.length
    ? ok(`zero drift BY TOPIC: corpus ${sets.length} == SME live ${totalLive}`)
    : fail(`course-total drift: corpus ${sets.length} != SME live ${totalLive}`);

  // every set resolved to exactly one SME row — except the pinned variant
  const resolved = new Set(
    sets.map((t) => smeRowOfQuestionSet(t, index)).filter((c): c is string => !!c),
  );
  const distinctSlugs = new Set(
    sets.map((t) => t.topicSlug).filter((s) => s !== variant?.corpusSlug),
  ).size;
  const expectedResolve = variant !== undefined ? sets.length - 1 : sets.length;
  setsPlaced === expectedResolve
    ? ok(`sets placed on SME rows: ${setsPlaced}${variant !== undefined ? ` (+1 pinned variant on its official-spine home)` : ""}`)
    : fail(`placement gap: ${setsPlaced} placed != ${expectedResolve} expected`);
  resolved.size === distinctSlugs
    ? ok(`1:1 resolution by topicSlug (${resolved.size} distinct rows)`)
    : fail(`resolution gap: ${resolved.size} rows for ${distinctSlugs} slugs`);

  // grouped-view deep links resolve
  const missingLink = [...resolved].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok("all SME row codes resolve for ?subtopic= deep links")
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
}

console.log(failures === 0 ? "\nWAVE-6 GATE: PASS" : `\nWAVE-6 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
