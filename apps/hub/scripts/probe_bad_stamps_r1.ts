/**
 * Runtime-home probe + bad-stamp sweep.
 * 1. Prints the production subtopicOfQuestionSet home for a named set list.
 * 2. Sweeps every SME set with a stamped subtopicCode (":SUB" present) and
 *    reports name-vs-destination-title similarity below threshold.
 * Run: bun scripts/probe_bad_stamps_r1.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecTreeIndex, generalTopicsOfQuestionTopics, subtopicOfQuestionSet } from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

const CONTENT = join(import.meta.dir, "..", "content");
const PROBE = new Set([
  "cie-igcse-ict-21|Communication",
  "ial-chemistry-17|Energetics",
  "ial-chemistry-17|Organic Synthesis",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

let flagged = 0, stamped = 0;
const byCourse: Record<string, string[]> = {};

for (const dir of readdirSync(CONTENT).sort()) {
  const cp = join(CONTENT, dir);
  if (!statSync(cp).isDirectory()) continue;
  let sets: ExamQuestionTopic[], notes: RevisionNote[], cur: Curriculum;
  try {
    sets = JSON.parse(readFileSync(join(cp, "questions.json"), "utf8"));
    notes = JSON.parse(readFileSync(join(cp, "notes.json"), "utf8"));
    cur = JSON.parse(readFileSync(join(cp, "curriculum.json"), "utf8"));
  } catch { continue; }
  const sme = sets.filter((t) => (t.source?.provider ?? "").toLowerCase().includes("save my exams"));
  if (sme.length === 0) continue;
  const index = buildSpecTreeIndex(cur, { generalTopics: generalTopicsOfQuestionTopics(sets) });
  const subNode = (code: string) => index.subtopicByCode.get(code);
  const title = (code: string): string | null => {
    const n = subNode(code);
    return n ? (n.title ?? null) : null;
  };

  sme.forEach((s) => {
    const code = s.subtopicCode;
    const home = subtopicOfQuestionSet(s, index, notes);
    const key = `${dir}|${s.name}`;
    if (PROBE.has(key)) {
      console.log(`PROBE ${dir} :: ${s.name} :: stamped=${code} runtime=${home} homeTitle=${home ? title(home) : "-"}`);
    }
    if (code && code.includes(":SUB") && !code.endsWith(":SUB_")) {
      stamped++;
      const t = title(code);
      if (t) {
        const sim = jaccard(tokens(s.name), tokens(t));
        // section-aware: SME section title tokens should overlap destination topic too
        if (sim < 0.34) {
          (byCourse[dir] ||= []).push(
            `  "${s.name}" (${s.sectionSlug}) stamped ${code} title="${t}" sim=${sim.toFixed(2)} runtime=${home}`,
          );
          flagged++;
        }
      }
    }
  });
}

console.log(`\nstamped SUB sets checked: ${stamped}; low-similarity flags: ${flagged}`);
for (const [c, rows] of Object.entries(byCourse)) {
  console.log(`\n${c}:`);
  rows.forEach((r) => console.log(r));
}
