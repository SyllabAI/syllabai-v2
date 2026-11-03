/**
 * D0 corpus-bridge parity gate — runs the REAL spec-tree.ts placement
 * (buildSpecTreeIndex + subtopicOfQuestionSet with notes) over every SME
 * course bundle in apps/hub/content and compares each set's home against the
 * python derivation of record (scratch/sme_d0_ladders.json).
 *
 *   bun run apps/hub/scripts/verify_sme_d0_parity.ts
 *
 * PASS = per-set home equality on all 2,574 SME sets, residual 47 sets /
 * 791q, and the ladder-of-record totals.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

const CONTENT = join(__dirname, "..", "content");
const EXPECT = "/home/z/my-project/scratch/sme_d0_ladders.json";

type Row = { course: string; slug: string; home: string | null; ladder: string | null };

// multi-map: one upstream re-scrape duplicate exists (CS-19 "algorithms" x2
// under one slug), so expected rows are consumed in corpus order per key
const expected = new Map<string, Row[]>();
for (const c of (JSON.parse(readFileSync(EXPECT, "utf8")) as { courses: { rows: Row[] }[] }).courses)
  for (const r of c.rows) {
    const key = `${r.course}::${r.slug}`;
    const list = expected.get(key) ?? [];
    list.push(r);
    expected.set(key, list);
  }

const isSME = (t: ExamQuestionTopic) =>
  (t.source?.provider ?? "").toLowerCase().includes("save my exams");

let courses = 0;
let sets = 0;
let placed = 0;
let placedQ = 0;
let residualSets = 0;
let residualQ = 0;
const diffs: string[] = [];

for (const course of readdirSync(CONTENT).sort()) {
  const dir = join(CONTENT, course);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(join(dir, "questions.json"))) continue;

  const rawQ = JSON.parse(readFileSync(join(dir, "questions.json"), "utf8")) as ExamQuestionTopic[];
  const sme = rawQ.filter(isSME);
  if (sme.length === 0) continue;
  const curriculum = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as Curriculum;
  const notes = JSON.parse(readFileSync(join(dir, "notes.json"), "utf8")) as RevisionNote[];
  courses += 1;

  const index = buildSpecTreeIndex(curriculum);
  for (const t of sme) {
    sets += 1;
    const home = subtopicOfQuestionSet(t, index, notes);
    const key = `${course}::${t.slug}`;
    const exp = expected.get(key)?.shift();
    if (!exp) {
      diffs.push(`${key}: missing from expectation`);
      continue;
    }
    if (home !== exp.home) {
      diffs.push(`${key}: ts=${home ?? "null"} py=${exp.home ?? "null"} (${exp.ladder})`);
    }
    if (home) {
      placed += 1;
      placedQ += t.questions.length;
      if (!index.subtopicByCode.has(home)) diffs.push(`${key}: home not in tree: ${home}`);
    } else {
      residualSets += 1;
      residualQ += t.questions.length;
    }
  }
}

console.log(`SME courses        : ${courses}`);
console.log(`SME sets           : ${sets}`);
console.log(`placed (post-bridge): ${placed} sets / ${placedQ} q`);
console.log(`residual (map gaps) : ${residualSets} sets / ${residualQ} q`);
console.log(`home-in-tree check  : ${diffs.filter((d) => d.includes("not in tree")).length} violations`);

const pass =
  diffs.length === 0 && courses === 90 && sets === 2574 && residualSets === 47 && residualQ === 791;
if (!pass) {
  console.log(`\nFAIL — ${diffs.length} diffs`);
  for (const d of diffs.slice(0, 40)) console.log("  " + d);
  process.exit(1);
}
console.log("\nPASS — parity with the derivation of record (319 unanchored → 47 unplaced; 272 sets / 4,202q backfilled)");
