/**
 * verify_qbox_box_law.ts — the option-box law for the official-paper plane
 * (W1 PR-2, Task-38 UX fix plan §5.4 "import-time guard").
 *
 * Runs in the hub prebuild chain (before next build), so a corpus whose
 * option-box construct regressed — a collapsed box stem, a re-introduced
 * inline table echo, a mutated box word list — fails the build instead of
 * reaching students. Read-only over the content banks; fails closed.
 *
 * The law, per part of every content/<course>/official-papers.json:
 *
 *  R1 box law        — any part whose problemMd mentions "the box" must
 *                      either carry a blockquote box line ("> a · b · c"),
 *                      or be exempted in qbox_box_law_spec.json with a
 *                      documented reason (physical box, data box, drawing
 *                      area), or be a cross-ref whose sibling part carries
 *                      the box.
 *  R2 spec pin       — every part in the spec's "normalized" table must
 *                      carry its box word list verbatim as a blockquote
 *                      line. Any regeneration that re-collapses, reorders
 *                      or edits the word list fails here (AC-8 pin).
 *  R3 de-dup law     — every pinned echo string (F-QB-1b inline table
 *                      duplication) must NOT reappear in any part of its
 *                      course. Byte-exact forbidden substrings.
 *  R4 paper census   — per official paper (topic), box-requiring parts ==
 *                      blockquote-carrying parts (the runtime form of the
 *                      Task-37 probe's box assertion).
 *
 * Exemption table of record: apps/hub/scripts/import_corpus/qbox_box_law_spec.json
 * (23 entries: 3 cross-refs, 14 physical boxes, 3 data boxes, 3 maths-b
 * physical boxes — every entry carries a reason string).
 *
 * Stdlib only. Exit 0 = clean, 1 = findings, 2 = usage/corrupt.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONTENT = join(import.meta.dir, "..", "content");
const SPEC_PATH = join(import.meta.dir, "import_corpus", "qbox_box_law_spec.json");

type SpecEntry = { course?: string; topic?: string; paper?: string; items?: string[]; echo?: string; echoStripped?: boolean };
type GuardSpec = { normalized: Record<string, SpecEntry>; dedupOnly: Record<string, SpecEntry>; exemptions: Record<string, string> };

const BOX_MENTION = /\bthe box\b/i;
const BQ_LINE = /^> /m;
const BQ_BOX_LINE = /^> .+ · .+ · /m; // an option list: >= 3 middle-dot items

const spec: GuardSpec = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));

type Part = { id: string; problemMd?: string };
type Question = { id?: string; parts?: Part[] };
type Topic = { slug?: string; questions?: Question[] };

const findings: string[] = [];
let papersChecked = 0;
let boxPartsChecked = 0;
let bqPartsChecked = 0;
let specPinsChecked = 0;
let echoPinsChecked = 0;

const courses = readdirSync(CONTENT).filter((c) =>
  existsSync(join(CONTENT, c, "official-papers.json")),
);
if (courses.length === 0) {
  console.error("box law: no official-papers.json banks found under content/ — aborting");
  process.exit(2);
}

for (const course of courses) {
  const bank: Topic[] = JSON.parse(readFileSync(join(CONTENT, course, "official-papers.json"), "utf-8"));

  // part index for cross-ref sibling checks
  const partById = new Map<string, { md: string; question: Question }>();
  const topics: Array<{ slug: string; questions: Question[] }> = [];
  for (const t of bank) {
    if (!(t.slug ?? "").includes("official")) continue;
    topics.push({ slug: t.slug ?? "?", questions: t.questions ?? [] });
    for (const q of t.questions ?? []) {
      for (const p of q.parts ?? []) {
        partById.set(p.id, { md: p.problemMd ?? "", question: q });
      }
    }
  }
  papersChecked += topics.length;

  for (const t of topics) {
    for (const q of t.questions) {
      for (const p of q.parts ?? []) {
        const md = p.problemMd ?? "";
        if (!BOX_MENTION.test(md)) continue;
        boxPartsChecked++;
        const hasBq = BQ_LINE.test(md);
        if (hasBq) bqPartsChecked++;

        const exemptReason = spec.exemptions[p.id];
        if (exemptReason !== undefined) {
          // cross-ref entries must still verify their sibling really carries the box
          const sibling = /sibling part (\S+)/.exec(exemptReason)?.[1];
          if (sibling) {
            const sib = partById.get(sibling);
            if (!sib || !BQ_BOX_LINE.test(sib.md)) {
              findings.push(`R1 cross-ref ${p.id}: sibling ${sibling} carries no box line`);
            }
          }
          continue;
        }
        if (!hasBq) {
          findings.push(`R1 collapsed ${course}/${p.id}: stem mentions the box with no blockquote box line`);
        }
      }
    }
    // R4 paper census: box-requiring parts (mention + not exempt) == blockquote parts
    let requires = 0;
    let carries = 0;
    for (const q of t.questions) {
      for (const p of q.parts ?? []) {
        const md = p.problemMd ?? "";
        if (!BOX_MENTION.test(md)) continue;
        if (spec.exemptions[p.id] !== undefined) continue;
        requires++;
        if (BQ_LINE.test(md)) carries++;
      }
    }
    if (requires !== carries) {
      findings.push(`R4 census ${course}/${t.slug}: ${requires} box-requiring part(s) vs ${carries} blockquote part(s)`);
    }
  }

  // R2 spec pins + R3 echo bans
  for (const [partId, entry] of Object.entries(spec.normalized)) {
    if (entry.course !== course) continue;
    const part = partById.get(partId);
    if (!part) {
      findings.push(`R2 pin ${course}/${partId}: part listed in the box-law spec but absent from the bank`);
      continue;
    }
    specPinsChecked++;
    const items = entry.items ?? [];
    const expected = "> " + items.join(" · ");
    const lines = part.md.split("\n").filter((l) => l.startsWith("> "));
    if (!lines.includes(expected)) {
      findings.push(`R2 pin ${course}/${partId}: box word list drifted (expected ${JSON.stringify(expected)})`);
    }
  }
  const echoEntries = Object.entries(spec.normalized).concat(Object.entries(spec.dedupOnly));
  for (const [partId, entry] of echoEntries) {
    if (entry.course !== course || !entry.echo) continue;
    echoPinsChecked++;
    for (const [pid, part] of partById) {
      if (part.md.includes(entry.echo)) {
        findings.push(`R3 echo ${course}/${pid}: inline table echo of record (${partId}) re-appeared`);
      }
    }
  }
}

console.log(`box law: ${courses.length} course bank(s), ${papersChecked} official paper(s)`);
console.log(`  box-mention parts checked : ${boxPartsChecked}`);
console.log(`  blockquote-carrying parts : ${bqPartsChecked}`);
console.log(`  spec word-list pins       : ${specPinsChecked}`);
console.log(`  echo bans enforced        : ${echoPinsChecked}`);

if (findings.length > 0) {
  console.error(`\nbox law: RED — ${findings.length} finding(s)`);
  for (const f of findings.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log("box law: CLEAN");
process.exit(0);
