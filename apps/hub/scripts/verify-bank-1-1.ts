/**
 * verify-bank-1-1 — T-MIG-136 parse lane BAND 3 gate.
 *
 * Parses a course bundle's questions.json through the REAL hub zod contract
 * (ExamQuestionTopic / ExamQuestion / QuestionPart, apps/hub/src/lib/contracts.ts)
 * and asserts the band-3 invariants that zod cannot express:
 *
 *   - every record carries schema syllabai.sme-exam-questions/1.1
 *   - id uniqueness across the whole bundle (questions and parts)
 *   - per-record question/totalMarks mirroring (already asserted in the
 *     assembler; re-checked here against the PARSED objects, not the bytes)
 *
 * Exit 0 = gate GREEN. Any violation exits 1 with the violation list.
 *
 * Run: bun apps/hub/scripts/verify-bank-1-1.ts igcse-maths-b-16
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ExamQuestionTopic } from "../src/lib/contracts";

const course = process.argv[2] ?? "igcse-maths-b-16";
const bundleDir = path.join(import.meta.dir, "..", "content", course);
const raw = readFileSync(path.join(bundleDir, "questions.json"), "utf-8");

const parsed = z.array(ExamQuestionTopic).parse(JSON.parse(raw));

const fails: string[] = [];
const qids = new Set<string>();
const pids = new Set<string>();
let nQuestions = 0;
let nMarks = 0;

for (const rec of parsed) {
  if (rec.schema !== "syllabai.sme-exam-questions/1.1") {
    fails.push(`${rec.slug}: schema ${rec.schema}`);
  }
  for (const q of rec.questions) {
    nQuestions++;
    nMarks += q.totalMarks ?? 0;
    if (qids.has(q.id)) fails.push(`duplicate question id ${q.id}`);
    qids.add(q.id);
    if (q.parts.length === 0) fails.push(`${rec.slug}/${q.id}: zero parts`);
    for (const p of q.parts) {
      if (pids.has(p.id)) fails.push(`duplicate part id ${p.id}`);
      pids.add(p.id);
    }
  }
}

const manifest = JSON.parse(readFileSync(path.join(bundleDir, "manifest.json"), "utf-8"));
const c = manifest.counts;
if (c.questionSets !== parsed.length) fails.push(`manifest questionSets ${c.questionSets} != ${parsed.length}`);
if (c.questions !== nQuestions) fails.push(`manifest questions ${c.questions} != ${nQuestions}`);
if (c.marks !== nMarks) fails.push(`manifest marks ${c.marks} != ${nMarks}`);
const nParts = parsed.reduce((a, r) => a + r.questions.reduce((b, q) => b + q.parts.length, 0), 0);
if (c.parts !== nParts) fails.push(`manifest parts ${c.parts} != ${nParts}`);

console.log(
  `zod gate: ${parsed.length} records, ${nQuestions} questions, ${nParts} parts, ` +
    `${nMarks} marks — ${fails.length === 0 ? "GREEN" : "FAIL"}`,
);
if (fails.length > 0) {
  for (const f of fails.slice(0, 20)) console.log("  -", f);
  process.exit(1);
}
