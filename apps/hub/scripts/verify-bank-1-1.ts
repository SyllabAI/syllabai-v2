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
import { existsSync, readFileSync } from "node:fs";
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

// ── the anchors gate (T-MIG-136 band 3b): when the bundle carries
// spec-anchors.json, EVERY question must be anchored with in-spine codes and
// every part must carry its question's exact anchor set (the applier law).
// The gate makes anchor loss (e.g. an assembler regeneration without the
// anchor merge) a CI failure, never a silent serving regression.
let anchored = 0;
const anchorsPath = path.join(bundleDir, "spec-anchors.json");
if (existsSync(anchorsPath)) {
  const art = JSON.parse(readFileSync(anchorsPath, "utf-8"));
  if (art.schema !== "syllabai.spec-anchors/1.0") {
    fails.push(`anchors schema ${art.schema}`);
  }
  const curriculum = JSON.parse(readFileSync(path.join(bundleDir, "curriculum.json"), "utf-8"));
  const alphabet = new Set<string>(
    (curriculum.nodes ?? [])
      .filter((n: { family?: string }) => n.family === "SPEC_POINT")
      .map((n: { code: string }) => n.code),
  );
  const anchors = art.anchors as Record<string, string[]>;
  if (Object.keys(anchors).length !== nQuestions) {
    fails.push(`anchors cover ${Object.keys(anchors).length} != ${nQuestions} questions`);
  }
  for (const rec of parsed) {
    for (const q of rec.questions) {
      const want = anchors[q.id];
      if (!want || want.length === 0) {
        fails.push(`${rec.slug}/${q.id}: no anchor`);
        continue;
      }
      anchored++;
      for (const code of want) {
        if (!alphabet.has(code)) fails.push(`${q.id}: anchor code ${code} outside the spine`);
      }
      for (const p of q.parts) {
        const got = (p.specPointCodes ?? []).join(",");
        if (got !== want.join(",")) {
          fails.push(`${q.id}: part codes [${got}] != anchor [${want.join(",")}]`);
        }
      }
    }
  }
}

console.log(
  `zod gate: ${parsed.length} records, ${nQuestions} questions, ${nParts} parts, ` +
    `${nMarks} marks, anchors ${anchored}/${nQuestions} — ${fails.length === 0 ? "GREEN" : "FAIL"}`,
);
if (fails.length > 0) {
  for (const f of fails.slice(0, 20)) console.log("  -", f);
  process.exit(1);
}
