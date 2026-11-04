/**
 * r5 verification — post-edit placement integrity.
 * 1. re-runs the production placement for every course
 * 2. asserts every stamped set's runtime home == its subtopicCode stamp
 * 3. asserts every other SME set's home is unchanged vs the pre-stamp dump
 * 4. prints totals (placed / unplaced must stay 100% / 0)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildSpecTreeIndex,
  generalTopicsOfQuestionTopics,
  subtopicOfQuestionSet,
} from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

const CONTENT = join(import.meta.dir, "..", "content");
const PRE = "/home/z/my-project/scratch/align/hub";

let stampedChecked = 0;
let stampedOk = 0;
let drift = 0;
const driftList: string[] = [];
let placed = 0;
let unplaced = 0;

for (const dir of readdirSync(CONTENT).sort()) {
  const cp = join(CONTENT, dir);
  if (!statSync(cp).isDirectory()) continue;
  let sets: ExamQuestionTopic[], notes: RevisionNote[], cur: Curriculum;
  try {
    sets = JSON.parse(readFileSync(join(cp, "questions.json"), "utf8"));
    notes = JSON.parse(readFileSync(join(cp, "notes.json"), "utf8"));
    cur = JSON.parse(readFileSync(join(cp, "curriculum.json"), "utf8"));
  } catch {
    continue;
  }
  const sme = sets.filter((t) =>
    (t.source?.provider ?? "").toLowerCase().includes("save my exams"),
  );
  if (sme.length === 0) continue;
  let pre: { sets: { slug: string; home: string | null }[] } | null = null;
  try {
    pre = JSON.parse(readFileSync(join(PRE, `${dir}.json`), "utf8"));
  } catch {
    /* no pre dump */
  }
  const preHome = new Map((pre?.sets ?? []).map((s) => [s.slug, s.home]));
  const index = buildSpecTreeIndex(cur, {
    generalTopics: generalTopicsOfQuestionTopics(sets),
  });
  for (const t of sme) {
    const home = subtopicOfQuestionSet(t, index, notes);
    if (home) placed++;
    else unplaced++;
    if (t.subtopicCode) {
      // a data stamp (r5 lane or earlier lanes) — runtime must land exactly there
      stampedChecked++;
      if (home === t.subtopicCode) stampedOk++;
      else {
        drift++;
        driftList.push(`${dir} | ${t.slug} stamp=${t.subtopicCode} runtime=${home}`);
      }
    } else if (preHome.has(t.slug) && preHome.get(t.slug) !== null) {
      // untouched set — home must be identical to the pre-stamp dump
      if (home !== preHome.get(t.slug)) {
        drift++;
        driftList.push(`${dir} | ${t.slug} UNSTAMPED DRIFT pre=${preHome.get(t.slug)} runtime=${home}`);
      }
    }
  }
}
console.log(`placed: ${placed}  unplaced: ${unplaced}`);
console.log(`stamped sets checked: ${stampedChecked}  landed-on-stamp: ${stampedOk}`);
console.log(`drift/regressions: ${drift}`);
for (const d of driftList.slice(0, 30)) console.log("  ", d);
