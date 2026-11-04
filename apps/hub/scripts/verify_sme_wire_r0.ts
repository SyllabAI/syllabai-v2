/**
 * End-to-end verification of the wired subtopicOfQuestionSet (notes-bridge +
 * numbering backfill + unique title + topic-level gen rows) against the
 * committed corpus — mirrors scripts/sme_wire_audit.py expectations.
 * Run: bun scripts/verify_sme_wire_r0.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

const CONTENT = join(import.meta.dir, "..", "content");

let totals = { courses: 0, sets: 0, q: 0, placed: 0, unplaced: 0 };
const unplacedByCourse: Record<string, string[]> = {};
const genRowHomes: string[] = [];

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
  const index = buildSpecTreeIndex(cur);
  totals.courses++;
  const miss: string[] = [];
  for (const t of sme) {
    totals.sets++;
    totals.q += t.questions.length;
    const before = new Set(index.subtopicByCode.keys());
    const home = subtopicOfQuestionSet(t, index, notes);
    if (home) {
      totals.placed++;
      if (!before.has(home) && home.endsWith("-gen")) {
        genRowHomes.push(`${dir} | ${t.name} -> ${home}`);
      }
    } else {
      totals.unplaced++;
      miss.push(`${t.name} (sec=${t.section})`);
    }
  }
  if (miss.length) unplacedByCourse[dir] = miss;
}

console.log("courses:", totals.courses, "sets:", totals.sets, "questions:", totals.q);
console.log("placed:", totals.placed, "unplaced:", totals.unplaced);
console.log("gen-row homes:", genRowHomes.length);
console.log("── residual unplaced (ADR-039 map-gaps) ──");
for (const [c, miss] of Object.entries(unplacedByCourse)) {
  console.log(`${c}: ${miss.length}`);
  for (const m of miss) console.log("   -", m);
}
