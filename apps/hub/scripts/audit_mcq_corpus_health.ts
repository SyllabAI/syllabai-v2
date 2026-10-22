/**
 * CORPUS-WIDE MCQ / content-health audit — trace 1a163c51b0b2948d.
 *
 * Operator order: "check if there are more errors like this through all
 * exam questions" — the reported error class is the MCQ honesty notice
 * ("option content and answer key were not captured") rendered by
 * McqPart whenever `answerable` is false.
 *
 * This script replicates the player's EXACT classification law
 * (question-player.tsx @ ad1e3873) over EVERY part of EVERY question of
 * EVERY course bundle in apps/hub/content/, and reports:
 *
 *  ERROR classes (learner-visible degradation):
 *    E1  mcq_not_answerable           — the reported notice (with sub-reasons)
 *    E2  structured_no_solution       — structured part with no solutionMd
 *    E3  empty_problem                — part with empty/blank problemMd
 *    E4  question_no_parts            — question carrying zero parts
 *  INFO classes (designed honest states, counted for the report):
 *    I1  letter_only_artwork_hidden   — letter-keyed, option art in stem
 *                                        image/table not visible
 *    I2  ambiguous_key                — choices present, !=1 isCorrect
 *                                        (honest notice by design)
 *
 * Zero writes to any content file — read-only census.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CONTENT = new URL("../content", import.meta.url).pathname;

// ── exact player law (verbatim from question-player.tsx @ ad1e3873) ──────
type Choice = { label: string | null; textMd: string; isCorrect: boolean };
type Part = {
  id: string;
  questionType: string | null;
  problemMd: string | null;
  solutionMd: string | null;
  choices: Choice[] | null;
  marks: number | null;
};
type Question = { id: string; parts: Part[]; totalMarks: number | null };

function hasUsableChoices(part: Part): boolean {
  const c = part.choices;
  if (!c || c.length === 0) return false;
  return (
    c.some((o) => o.label && o.textMd.trim()) &&
    c.filter((o) => o.isCorrect).length === 1
  );
}

function hasAnswerKey(part: Part): boolean {
  const c = part.choices;
  if (!c || c.length < 2) return false;
  return c.every((o) => !!o.label) && c.filter((o) => o.isCorrect).length === 1;
}

function parseOptions(problemMd: string): { letter: string; text: string }[] {
  const lines = problemMd.split("\n");
  const opts: { letter: string; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-D])[\.\)]\s+(.+)$/);
    if (m) opts.push({ letter: m[1], text: m[2].trim() });
  }
  return opts;
}

function parseCorrectOption(solutionMd: string | null): string | null {
  if (!solutionMd) return null;
  const m = solutionMd.match(/correct answer is\s*\**\s*([A-D])/i);
  return m ? m[1].toUpperCase() : null;
}

const IMG = /!\[[^\]]*\]\([^)]+\)|<img\b/;
const TABLE = /^\s*\|.+\|$/m;
function mcqOptionsVisible(parts: Part[], idx: number): boolean {
  for (let i = 0; i <= idx; i++) {
    const md = parts[i]?.problemMd ?? "";
    if (IMG.test(md) || TABLE.test(md)) return true;
  }
  return false;
}

// ── census walk ───────────────────────────────────────────────────────────
const courses = readdirSync(CONTENT).filter((n) => {
  const p = join(CONTENT, n, "questions.json");
  try { return statSync(p).isFile(); } catch { return false; }
});

const census = {
  courses: 0, topics: 0, questions: 0, parts: 0,
  questionTypes: {} as Record<string, number>,
  mcq: {
    total: 0, keyedText: 0, letterOnly: 0, legacy: 0, notAnswerable: 0,
    letterOnlyArtworkHidden: 0, ambiguousKey: 0, choiceRows: 0,
  },
  structured: { total: 0, noSolution: 0 },
  emptyProblemParts: 0,
  questionNoParts: 0,
  errors: [] as unknown[],
};

type Err = {
  cls: string; course: string; topic: string; question: string; part: string;
  reason?: string; correctLetterFromSolution?: string | null; nChoices?: number;
  nCorrect?: number; labeled?: number; withText?: number;
};

for (const course of courses.sort()) {
  const topics = JSON.parse(readFileSync(join(CONTENT, course, "questions.json"), "utf8")) as
    { slug: string; topicSlug?: string; questions: Question[] }[];
  census.courses++;
  for (const topic of topics) {
    census.topics++;
    const tslug = topic.topicSlug ?? topic.slug;
    for (const q of topic.questions ?? []) {
      census.questions++;
      if (!q.parts || q.parts.length === 0) {
        census.questionNoParts++;
        (census.errors as Err[]).push({ cls: "E4_question_no_parts", course, topic: tslug, question: q.id, part: "-" });
        continue;
      }
      q.parts.forEach((p, idx) => {
        census.parts++;
        const qt = p.questionType ?? "(null)";
        census.questionTypes[qt] = (census.questionTypes[qt] ?? 0) + 1;

        const pm = p.problemMd ?? "";
        if (!pm.trim()) {
          census.emptyProblemParts++;
          (census.errors as Err[]).push({ cls: "E3_empty_problem", course, topic: tslug, question: q.id, part: p.id });
        }

        if (qt === "multiple_choice") {
          census.mcq.total++;
          census.mcq.choiceRows += p.choices?.length ?? 0;
          const nCorr = p.choices?.filter((o) => o.isCorrect).length ?? 0;
          const nLab = p.choices?.filter((o) => !!o.label).length ?? 0;
          const nTxt = p.choices?.filter((o) => o.textMd && o.textMd.trim()).length ?? 0;

          if (hasUsableChoices(p)) {
            census.mcq.keyedText++;
          } else if (hasAnswerKey(p)) {
            census.mcq.letterOnly++;
            if (!mcqOptionsVisible(q.parts, idx)) census.mcq.letterOnlyArtworkHidden++;
          } else {
            // legacy fallback path
            const correct = parseCorrectOption(p.solutionMd);
            const opts = parseOptions(pm);
            if (opts.length > 0 && correct !== null) {
              census.mcq.legacy++;
            } else {
              census.mcq.notAnswerable++;
              let reason: string;
              if (!p.choices || p.choices.length === 0) reason = "no_choices";
              else if (nCorr !== 1) reason = `ambiguous_key(${nCorr}_correct)`;
              else if (nLab < (p.choices?.length ?? 0)) reason = "unlabeled_choices";
              else reason = "degenerate_choices+parse_fail";
              if (nCorr !== 1) census.mcq.ambiguousKey++;
              (census.errors as Err[]).push({
                cls: "E1_mcq_not_answerable", course, topic: tslug, question: q.id, part: p.id,
                reason, correctLetterFromSolution: parseCorrectOption(p.solutionMd),
                nChoices: p.choices?.length ?? 0, nCorrect: nCorr, labeled: nLab, withText: nTxt,
              });
            }
          }
          // ambiguous keys that are STILL answerable via keyedText? impossible
          // (keyedText demands exactly-one) — but letterOnly/keyedText with
          // >1 isCorrect can't exist either; the 4 ambiguous parts of record
          // are counted only when they fall through to notAnswerable.
          // Count ambiguous-with-choices separately for the report:
          if (p.choices && p.choices.length > 0 && nCorr !== 1 && hasUsableChoices(p) === false && hasAnswerKey(p) === false) {
            // already recorded above
          } else if (p.choices && p.choices.length > 0 && nCorr !== 1 && (hasUsableChoices(p) || hasAnswerKey(p))) {
            census.mcq.ambiguousKey++;
            (census.errors as Err[]).push({
              cls: "I2_ambiguous_key_answerable_otherwise", course, topic: tslug,
              question: q.id, part: p.id, nChoices: p.choices.length, nCorrect: nCorr,
            });
          }
        } else {
          census.structured.total++;
          if (!p.solutionMd || !p.solutionMd.trim()) {
            census.structured.noSolution++;
            (census.errors as Err[]).push({ cls: "E2_structured_no_solution", course, topic: tslug, question: q.id, part: p.id });
          }
        }
      });
    }
  }
}

// wave-15 spotlight: the content the sibling landed mid-turn
let w15 = { mcq: 0, mcqNoChoices: 0, structured: 0, structuredNoSolution: 0, topics: 0, questions: 0, parts: 0 };
const w15topics = JSON.parse(readFileSync(join(CONTENT, "igcse-chemistry-19", "questions.json"), "utf8"));
for (const t of w15topics) {
  w15.topics++;
  for (const q of t.questions ?? []) {
    w15.questions++;
    for (const p of q.parts ?? []) {
      w15.parts++;
      if (p.questionType === "multiple_choice") { w15.mcq++; if (!p.choices || p.choices.length === 0) w15.mcqNoChoices++; }
      else { w15.structured++; if (!p.solutionMd || !p.solutionMd.trim()) w15.structuredNoSolution++; }
    }
  }
}

console.log(JSON.stringify({ census, wave15_igcse_chemistry_19: w15 }, null, 2));
const e1 = (census.errors as Err[]).filter((e) => e.cls === "E1_mcq_not_answerable");
console.error(`\nSUMMARY: courses=${census.courses} parts=${census.parts} mcq=${census.mcq.total} ` +
  `answerable=${census.mcq.total - census.mcq.notAnswerable} NOT_ANSWERABLE=${census.mcq.notAnswerable} ` +
  `structured_no_solution=${census.structured.noSolution} empty_problem=${census.emptyProblemParts} ` +
  `no_part_questions=${census.questionNoParts} ambiguous=${census.mcq.ambiguousKey}`);
if (e1.length) { console.error("E1 DETAILS:"); for (const e of e1.slice(0, 50)) console.error(JSON.stringify(e)); }
