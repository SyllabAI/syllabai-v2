/**
 * RN-DEBRIS-11 run-012 — gen-row placement census (mirrors verify_sme_wire_r0.ts
 * gen-row law, prints the per-set placements for A/B diffing).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecTreeIndex, generalTopicsOfQuestionTopics, subtopicOfQuestionSet } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-tree";

const CONTENT = process.env.RN12_CONTENT ?? "/home/z/my-project/work/syllabai-v2/apps/hub/content";
const rows: string[] = [];
for (const dir of readdirSync(CONTENT).sort()) {
  const cp = join(CONTENT, dir);
  if (!statSync(cp).isDirectory()) continue;
  let sets, notes, cur;
  try {
    sets = JSON.parse(readFileSync(join(cp, "questions.json"), "utf8"));
    notes = JSON.parse(readFileSync(join(cp, "notes.json"), "utf8"));
    cur = JSON.parse(readFileSync(join(cp, "curriculum.json"), "utf8"));
  } catch { continue; }
  const sme = sets.filter((t) => (t.source?.provider ?? "").toLowerCase().includes("save my exams"));
  if (sme.length === 0) continue;
  const index = buildSpecTreeIndex(cur, { generalTopics: generalTopicsOfQuestionTopics(sets) });
  for (const t of sme) {
    const before = new Set(index.subtopicByCode.keys());
    const home = subtopicOfQuestionSet(t, index, notes);
    if (home && !before.has(home) && home.endsWith("-gen")) {
      rows.push(`${dir} | ${t.slug} -> ${home}`);
    }
  }
}
console.log("gen-row placements:", rows.length);
for (const r of rows) console.log("  ", r);
