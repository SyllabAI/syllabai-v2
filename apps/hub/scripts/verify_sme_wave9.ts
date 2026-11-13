/**
 * ADR-039 wave-9 gate — the SME Revision-Notes picker layer, CIE IGCSE maths
 * tranche 1 (the four-course maths family; the W7 closeout recommendation's
 * first build slice).
 *
 * Same law as the wave-3 gate, proved against the REAL runtime code
 * (buildSpecTreeIndex + smeRowOfQuestionSet + smeRowOfNote), extended to the
 * notes dimension — wave 9 is the first wave whose appends serve BOTH
 * selectors:
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
  spine: { officialNodes: number; families: Record<string, number>; officialNodeDigest: string };
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
// none on 0607) — mirrored verbatim as 0-note 0-set rows, the wave-1/3
// 0-set precedent
const DRIFT_BY_COURSE: Record<string, ReadonlySet<string>> = {
  "cie-igcse-maths-25-extended": new Set(["set-1-fl"]),
  "cie-igcse-maths-25-core": new Set(["set-1-fl"]),
  "cie-igcse-maths-international-maths-23-extended": new Set(),
  "cie-igcse-maths-international-maths-23-core": new Set(),
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
  // every set resolved (the EQ selector never hides a set)
  const unSets = sets.filter((t) => !smeRowOfQuestionSet(t, index));
  unSets.length === 0
    ? ok(`all ${sets.length} sets resolve via smeRowOfQuestionSet`)
    : fail(`${unSets.length}/${sets.length} sets unresolved: ${unSets.slice(0, 3).map((t) => t.slug)}`);
  setsPlaced === sets.length
    ? ok(`total sets placed: ${setsPlaced} (of ${sets.length})`)
    : fail(`total placed ${setsPlaced} != ${sets.length}`);
  notesPlaced === notes.length
    ? ok(`total notes placed: ${notesPlaced} (of ${notes.length})`)
    : fail(`total placed ${notesPlaced} != ${notes.length}`);

  // single-match law: each slug touches exactly one row
  const noteSlugs = new Set(notes.filter((n) => n.topicSlug).map((n) => n.topicSlug as string));
  const setSlugs = new Set(sets.map((t) => t.topicSlug));
  const rowSuffix = secs.flatMap((s) => s.subtopics.map((r) => r.code.split(":")[1] as string));
  const dupes = rowSuffix.filter((s, i) => rowSuffix.indexOf(s) !== i);
  dupes.length === 0
    ? ok(`single-match law: ${rowSuffix.length} row slugs, 0 duplicate suffixes`)
    : fail(`duplicate row suffixes need smeSectionSlug disambiguation: ${[...new Set(dupes)]}`);
  const noteMissing = [...noteSlugs].filter((s) => !rowSuffix.includes(s));
  const setMissing = [...setSlugs].filter((s) => !rowSuffix.includes(s));
  noteMissing.length === 0
    ? ok(`all ${noteSlugs.size} note topicSlugs covered`)
    : fail(`${noteMissing.length} note slugs uncovered: ${noteMissing.slice(0, 3)}`);
  setMissing.length === 0
    ? ok(`all ${setSlugs.size} set topicSlugs covered`)
    : fail(`${setMissing.length} set slugs uncovered: ${setMissing.slice(0, 3)}`);

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
