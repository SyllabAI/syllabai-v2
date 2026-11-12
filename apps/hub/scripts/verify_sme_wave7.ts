/**
 * ADR-039 wave-7 gate — the SME Exam-Questions picker layer, the selector-
 * page fixes for the trailing-variant carrier courses that HAVE live SME
 * counterparts (operator order: "fix the other courses for now then. Their
 * selector pages."):
 *
 *   - cie-a-level-computer-science-19 (CIE A Level Computer Science 9618,
 *     2024-2025 register; 21 sections / 48 topics / 45 sets — corpus 45/45
 *     sets resolve (slug, section) EXACT, incl. the duplicated topic slug
 *     "algorithms" under sections 9 and 19, resolved by the set's corpus
 *     sectionSlug via the smeSectionSlug carried on the section row — the
 *     wave-7 smeRowOfQuestionSet disambiguation)
 *   - igcse-english-literature-16 (Pearson Edexcel IGCSE English Literature
 *     4ET1, 2016 register; 6 sections / 24 topics / 16 corpus sets on 16
 *     topics; live 41 sets — the wave-3 partial-coverage class: SME added
 *     per-text sets since the seed attestation)
 *
 * Excluded by the mirror law (no live counterpart — the pure-2 class,
 * disclosed): cie-as-computer-science-19 (SME hosts NO separate AS Computer
 * Science course; /as-level/... 404) and the igcse-maths-a-modular-24 unit
 * courses (SME hosts no 2024 modular Maths A qualification; /24/ 404s — the
 * /18/ non-modular course exists and stays a next-wave candidate).
 *
 * Same law as the wave-1..6 gates, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet):
 *
 *   1. spine intact   — official TOPIC / SUBTOPIC / SPEC_POINT counts
 *                       unchanged (the SME layer is append-only)
 *   2. layer present  — section rows + topic rows, all SME_REFERENCE, titles
 *                       verbatim from the live SaveMyExams pickers (fetch
 *                       2026-11-12); section rows carry smeSectionSlug (the
 *                       live section slug) for the duplicate-slug
 *                       disambiguation; rows mirror the live picker 1:1
 *                       incl. 0/0 navigation rows (the decision-1 0-set
 *                       precedent)
 *   3. bijection      — every corpus set resolves to EXACTLY ONE topic row;
 *                       per-row CORPUS counts pinned exactly. CS: 45/45
 *                       (slug, section) exact — the two "algorithms" rows
 *                       must resolve to DISTINCT rows matching their
 *                       sectionSlugs. Lit: 16/16 slug-exact; the corpus
 *                       trailing-hyphen quirk "an-inspector-calls-" is
 *                       SME's OWN live slug reproduced verbatim (the wave-2
 *                       both-sides class — no normalization needed).
 *   4. drift relation — corpusSets <= smeLiveSets for every row (wave-3
 *                       law). CS: zero drift (45 == 45). Lit: corpus 16 vs
 *                       SME live 41 — the drift rows are EXACTLY the
 *                       documented three (SME later added per-text sets);
 *                       the eight 0/0 rows are navigation mirrors, not
 *                       drift.
 *   5. runtime homes  — smeRowOfQuestionSet resolves every set; grouped
 *                       view row codes resolve through subtopicByCode
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave7.ts   (repo root)
 */
import { readFileSync } from "node:fs";
import { buildSpecTreeIndex, smeRowOfQuestionSet } from "../src/lib/spec-tree";
import type { ExamQuestionTopic } from "../src/lib/contracts";

interface RowFix { slug: string; title: string; corpusSets: number; smeLiveSets: number }
interface SecFix { code: string; slug: string; title: string; order: number; rows: RowFix[] }
interface CourseFix {
  picker: string;
  fetched: string;
  qualification: string;
  sections: SecFix[];
}

const FIXTURES = JSON.parse(
  readFileSync(new URL("./sme-wave7-fixtures.json", import.meta.url), "utf-8"),
) as Record<string, CourseFix>;

const SPINE: Record<string, { topics: number; subs: number; points: number }> = {
  "cie-a-level-computer-science-19": { topics: 20, subs: 44, points: 227 },
  "igcse-english-literature-16": { topics: 3, subs: 12, points: 65 },
};

/** the wave-3-class partial-coverage rows of record (corpus < SME live):
 *  SME added per-text sets after the seed attestation — disclosed upstream
 *  drift, mirrored rows keep the corpus truth. */
const DRIFT_ROWS: Record<string, Set<string>> = {
  "cie-a-level-computer-science-19": new Set(),
  "igcse-english-literature-16": new Set(["an-inspector-calls-", "romeo-and-juliet", "macbeth"]),
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

const ROOT = new URL("../", import.meta.url); // apps/hub/

for (const [course, fx] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${course} (${fx.qualification})`);
  const contentDir = new URL(`content/${course}/`, ROOT);
  const curriculum = JSON.parse(
    readFileSync(new URL("curriculum.json", contentDir), "utf-8"),
  ) as { nodes: Array<{ code: string; family: string; title: string | null; provenanceTier?: string; order?: number; smeSectionSlug?: string; parents?: string[] }> };
  const sets = JSON.parse(
    readFileSync(new URL("questions.json", contentDir), "utf-8"),
  ) as ExamQuestionTopic[];
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

  // 2. layer provenance + shape + smeSectionSlug carried on section rows
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
  const slugMatch = secNodes.filter((n) => {
    const fxSec = fx.sections.find((s) => s.code === n.code);
    return fxSec ? fxSec.slug === n.smeSectionSlug && fxSec.title === n.title : false;
  });
  slugMatch.length === secNodes.length
    ? ok(`section rows mirror the live picker verbatim (slug + title)`)
    : fail(`${secNodes.length - slugMatch.length} section rows drift from the live picker`);

  // 3+4+5. runtime layer, bijection, corpus-true counts, drift law
  const index = buildSpecTreeIndex(curriculum as never);
  const secs = index.tree.smeSections ?? [];
  secs.length === fx.sections.length
    ? ok(`runtime smeSections: ${secs.length}`)
    : fail(`runtime smeSections ${secs.length} != ${fx.sections.length}`);

  let rowsChecked = 0;
  let setsPlaced = 0;
  const driftSeen = new Set<string>();
  const navRows: string[] = [];
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
      if (rf.corpusSets === 0 && rf.smeLiveSets === 0) {
        navRows.push(rf.slug);
      } else if (rf.corpusSets < rf.smeLiveSets) {
        driftSeen.add(rf.slug);
        if (!DRIFT_ROWS[course].has(rf.slug)) {
          fail(`${row.code}: undocumented drift ${rf.corpusSets} vs ${rf.smeLiveSets}`);
        }
      }
      if (!index.subtopicByCode.get(row.code)) fail(`row ${row.code} not registered in subtopicByCode`);
    }
  }
  if (rowsChecked === fx.sections.reduce((a, s) => a + s.rows.length, 0) && failures === 0)
    ok(`bijection: ${rowsChecked} rows, per-row CORPUS counts pinned`);
  if (driftSeen.size === DRIFT_ROWS[course].size && [...driftSeen].every((s) => DRIFT_ROWS[course].has(s))) {
    ok(
      DRIFT_ROWS[course].size === 0
        ? "drift law: every covered row corpus == SME live (zero drift)"
        : `drift rows are exactly the documented ${DRIFT_ROWS[course].size} (${[...driftSeen].sort().join(", ")})`,
    );
  } else {
    fail(`drift set mismatch: saw [${[...driftSeen].sort().join(", ")}]`);
  }
  const expectedNav = fx.sections.reduce((a, s) => a + s.rows.filter((r) => r.corpusSets === 0 && r.smeLiveSets === 0).length, 0);
  navRows.length === expectedNav
    ? ok(`navigation rows mirrored verbatim: ${navRows.length} x 0/0 (decision-1 0-set precedent)`)
    : fail(`navigation rows ${navRows.length} != ${expectedNav}`);

  // every set resolved to exactly one SME row
  const resolved = sets
    .map((t) => smeRowOfQuestionSet(t, index))
    .filter((c): c is string => !!c);
  resolved.length === sets.length
    ? ok(`sets placed on SME rows: ${resolved.length}/${sets.length}`)
    : fail(`placement gap: ${resolved.length} of ${sets.length} sets resolved`);
  const distinctRows = new Set(resolved);
  distinctRows.size === resolved.length
    ? ok(`1:1 resolution: ${distinctRows.size} distinct rows for ${resolved.length} sets`)
    : fail(`resolution collision: ${distinctRows.size} rows for ${resolved.length} sets`);

  // wave-7 disambiguation proof (CS): the duplicated "algorithms" rows must
  // resolve by sectionSlug — the two sets land on DISTINCT section rows
  const algSets = sets.filter((t) => t.topicSlug === "algorithms");
  if (algSets.length > 1) {
    const homes = algSets.map((t) => ({
      set: t.sectionSlug,
      row: smeRowOfQuestionSet(t, index),
    }));
    const secSlugs = homes.map((h) => {
      const code = h.row ?? "";
      const m = /-SME-S(\d+):/.exec(code);
      return fx.sections[Number(m?.[1] ?? 0) - 1]?.slug;
    });
    secSlugs.every((s, i) => s === algSets[i].sectionSlug) && new Set(homes.map((h) => h.row)).size === homes.length
      ? ok(`duplicated topic slug "algorithms" resolves by sectionSlug: ${homes.map((h) => `${h.row!.split(":")[0]} <- ${h.set}`).join("; ")}`)
      : fail(`algorithms disambiguation broken: ${JSON.stringify(homes)}`);
  }

  // grouped-view deep links resolve
  const missingLink = [...distinctRows].filter((c) => !index.subtopicByCode.has(c));
  missingLink.length === 0
    ? ok("all SME row codes resolve for ?subtopic= deep links")
    : fail(`${missingLink.length} row codes unresolvable: ${missingLink.slice(0, 3)}`);
}

console.log(failures === 0 ? "\nWAVE-7 GATE: PASS" : `\nWAVE-7 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
