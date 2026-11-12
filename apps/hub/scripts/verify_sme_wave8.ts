/**
 * ADR-039 wave-8 gate — the Revision Notes selector mirror (operator order:
 * 'Wave-8 "notes layer" — bridge smeSpecPointIds → live subtopics → corpus
 * rows ... Do not break anything'):
 *
 *   - ZERO curriculum changes: the SME rows already exist from waves 1–7;
 *     the bridge is runtime-only (smeRowOfNote) + the notes selector page
 *     joining the exam-questions selector's mirror law. Nothing appends,
 *     nothing moves in any content file.
 *   - SIDEBAR LAW UNTOUCHED: subtopicOfNote (official homes) is not modified
 *     — sidebar, loose counts, flashcards, Teach-Me surfaces are byte-stable.
 *   - THE BRIDGE of record: notes file into SME rows by their corpus
 *     topicSlug (the audited deterministic join — note bodies carry NO
 *     official spec citations (1/144) and the smeSpecPointIds id space has
 *     no corpus index, so the slug join is the only mechanical bridge).
 *     Corpus-wide on the 27 layered courses: 1,479 officially-placed notes
 *     match their SME rows verbatim (count-conserving carries), the 598
 *     unplaced notes bridge, ZERO leftovers — the loose-notes section
 *     empties by construction, never by hiding.
 *   - the wave-6 pinned trailing-variant normalization fires exactly where a
 *     corpus variant exists (AS PS1 "representation-of-data-", 4 notes);
 *     duplicate suffixes disambiguate by sectionSlug (the wave-7 law; many
 *     notes per row is the normal note granularity — the per-note law is
 *     that the note's sectionSlug picks its row).
 *   - SETS untouched: smeRowOfQuestionSet's resolutions are exactly the
 *     wave-5/6/7 pinned numbers (re-asserted here); wire_r0 stays 2,574/0.
 *
 * Any failure exits non-zero with the offending rows printed.
 *
 * Run: bun apps/hub/scripts/verify_sme_wave8.ts   (repo root)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  buildSpecTreeIndex,
  smeRowOfNote,
  smeRowOfQuestionSet,
  subtopicOfNote,
} from "../src/lib/spec-tree";
import type { RevisionNote } from "../src/lib/contracts";

const ROOT = new URL("../", import.meta.url); // apps/hub/

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

// discover the layered courses (curriculum carries SME rows) — the same set
// the wave-1..7 gates audited, now including wave 7's two
const contentDir = new URL("content/", ROOT);
const courses = readdirSync(contentDir).filter((c) => {
  const p = new URL(`content/${c}/curriculum.json`, contentDir);
  if (!existsSync(p)) return false;
  try {
    const cur = JSON.parse(readFileSync(p, "utf-8"));
    return (cur.nodes as Array<{ family: string; code?: string }>).some(
      (n) => n.family === "SUBTOPIC" && typeof n.code === "string" && /-SME-S\d+:/.test(n.code),
    );
  } catch {
    return false;
  }
});

let totalNotes = 0;
let totalResolved = 0;
let totalOfficial = 0;
let totalBridged = 0;
const perCourse: string[] = [];

for (const course of courses.sort()) {
  const dir = new URL(`${course}/`, contentDir);
  const notesPath = new URL("notes.json", dir);
  if (!existsSync(notesPath)) continue;
  const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
  const notes = JSON.parse(readFileSync(notesPath, "utf-8")) as RevisionNote[];
  if (!Array.isArray(notes) || notes.length === 0) continue;
  const index = buildSpecTreeIndex(curriculum as never);

  let official = 0;
  let resolved = 0;
  const unresolved: string[] = [];
  for (const n of notes) {
    // sidebar law: the official resolver is untouched — record its result
    if (subtopicOfNote(n, index) !== null) official++;
    const row = smeRowOfNote(n, index);
    if (row === null) {
      unresolved.push(`${n.noteId} (${n.topicSlug ?? "no-slug"})`);
    } else {
      resolved++;
    }
  }
  const bridged = resolved - official;
  totalNotes += notes.length;
  totalResolved += resolved;
  totalOfficial += official;
  totalBridged += bridged;
  if (unresolved.length > 0) {
    fail(`${course}: ${unresolved.length} notes without an SME row: ${unresolved.slice(0, 4).join("; ")}`);
  } else {
    ok(`${course}: ${notes.length} notes -> ${resolved} SME rows (officially-placed ${official} carried, ${bridged} bridged)`);
  }
  // count-conservation: every note resolves, nothing lost
  if (resolved !== notes.length) fail(`${course}: resolution ${resolved} != notes ${notes.length}`);
  perCourse.push(`${course} ${resolved}/${notes.length}`);
}

console.log(
  `\nCORPUS: ${courses.length} layered courses, ${totalNotes} notes -> ${totalResolved} resolved ` +
    `(officially-placed carries ${totalOfficial}, bridged ${totalBridged}, leftovers ${totalNotes - totalResolved})`,
);
totalResolved === totalNotes
  ? ok("every note on every layered course resolves — zero leftovers (loose section empties by construction)")
  : fail(`leftover notes: ${totalNotes - totalResolved}`);

// the wave-6 pinned trailing-variant normalization: AS PS1's four
// "representation-of-data-" notes land on the representation-of-data row
{
  const course = "cie-as-maths-20-probability-and-statistics-1";
  const dir = new URL(`${course}/`, contentDir);
  const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
  const notes = JSON.parse(readFileSync(new URL("notes.json", dir), "utf-8")) as RevisionNote[];
  const index = buildSpecTreeIndex(curriculum as never);
  const variantNotes = notes.filter((n) => n.topicSlug === "representation-of-data-");
  const hit = variantNotes.filter((n) => smeRowOfNote(n, index)?.endsWith(":representation-of-data"));
  variantNotes.length === 4 && hit.length === 4
    ? ok(`pinned trailing-variant normalization: 4 "representation-of-data-" notes -> the representation-of-data row`)
    : fail(`variant normalization broken: ${hit.length}/${variantNotes.length}`);
}

// the wave-7 duplicate-suffix disambiguation for NOTES: 9618 "algorithms"
// carries notes under BOTH sections (4 on S9, 10 on S19) — the per-note law
// is that each note lands on the row whose section smeSectionSlug equals
// the note's own sectionSlug (many-notes-per-row is the normal note
// granularity; distinctness is NOT the law — correctness per note is)
{
  const course = "cie-a-level-computer-science-19";
  const dir = new URL(`${course}/`, contentDir);
  const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
  const notes = JSON.parse(readFileSync(new URL("notes.json", dir), "utf-8")) as RevisionNote[];
  const index = buildSpecTreeIndex(curriculum as never);
  const secByCode = new Map(
    (curriculum.nodes as Array<{ code: string; family: string; smeSectionSlug?: string }>)
      .filter((n) => n.family === "TOPIC" && /-SME-S\d+$/.test(n.code))
      .map((n) => [n.code, n.smeSectionSlug ?? null]),
  );
  const algNotes = notes.filter((n) => n.topicSlug === "algorithms");
  if (algNotes.length > 0) {
    const bad = algNotes.filter((n) => {
      const row = smeRowOfNote(n, index);
      if (!row) return true;
      return secByCode.get(row.split(":")[0]) !== n.sectionSlug;
    });
    const distinct = new Set(algNotes.map((n) => smeRowOfNote(n, index)));
    bad.length === 0 && distinct.size === 2
      ? ok(`duplicated topic slug "algorithms" notes: ${algNotes.length} notes over ${distinct.size} rows, every note's sectionSlug honored`)
      : fail(`algorithms notes disambiguation broken: ${bad.length} misfiled of ${algNotes.length}`);
  }
}

// fleet safety: courses WITHOUT an SME layer resolve to null (the notes
// selector renders exactly as before there)
{
  const probes = ["cie-a-level-chemistry-25", "cie-as-maths-20-pure-2", "cie-igcse-english-language-25"];
  for (const course of probes) {
    const dir = new URL(`${course}/`, contentDir);
    if (!existsSync(new URL("curriculum.json", dir))) continue;
    const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
    const notes = JSON.parse(readFileSync(new URL("notes.json", dir), "utf-8")) as RevisionNote[];
    const index = buildSpecTreeIndex(curriculum as never);
    const hits = notes.filter((n) => smeRowOfNote(n, index) !== null).length;
    hits === 0
      ? ok(`fleet safety: ${course} (no SME layer) -> ${hits} SME-row hits (selector unchanged)`)
      : fail(`fleet safety broken: ${course} resolved ${hits} notes without an SME layer`);
  }
}

// SETS untouched: the wave-7 pinned resolutions still hold
{
  const fixtures = JSON.parse(
    readFileSync(new URL("sme-wave7-fixtures.json", import.meta.url), "utf-8"),
  ) as Record<string, { sections: Array<{ rows: Array<{ slug: string; corpusSets: number }> }> }>;
  for (const [course, fx] of Object.entries(fixtures)) {
    const dir = new URL(`${course}/`, contentDir);
    const curriculum = JSON.parse(readFileSync(new URL("curriculum.json", dir), "utf-8"));
    const sets = JSON.parse(readFileSync(new URL("questions.json", dir), "utf-8"));
    const index = buildSpecTreeIndex(curriculum as never);
    const placed = sets.filter((t: { topicSlug?: string }) => smeRowOfQuestionSet(t as never, index) !== null).length;
    const pinned = fx.sections.reduce((a, s) => a + s.rows.reduce((b, r) => b + r.corpusSets, 0), 0);
    placed === pinned
      ? ok(`sets untouched: ${course} ${placed}/${pinned} sets on SME rows (wave-7 pinned numbers)`)
      : fail(`set placement drift: ${course} ${placed} != pinned ${pinned}`);
  }
}

console.log(failures === 0 ? "\nWAVE-8 GATE: PASS" : `\nWAVE-8 GATE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
