/**
 * Task A operator audit — dump the selector-of-record per course.
 *
 * Walks every content course exactly like verify_sme_wire_r0.ts, builds the
 * production spec-tree index (same options courses.ts uses at runtime) and
 * emits, per course: the TOPIC/SUBTOPIC tree (display numbering) and every
 * SME question set with its canonical home + inferred placement rung.
 *
 * Output: JSON files under /home/z/my-project/scratch/align/hub/
 * Run: bun apps/hub/scripts/dump_selector_rows.ts
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSpecTreeIndex,
  generalTopicsOfQuestionTopics,
  subtopicOfQuestionSet,
} from "../src/lib/spec-tree";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "../src/lib/contracts";

const CONTENT = join(import.meta.dir, "..", "content");
const OUT = process.env.ALIGN_OUT ?? "/home/z/my-project/scratch/align/hub";

mkdirSync(OUT, { recursive: true });

let files = 0;
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
  if (sme.length === 0 && !notes.length) continue;
  const index = buildSpecTreeIndex(cur, {
    generalTopics: generalTopicsOfQuestionTopics(sets),
  });

  const tree = index.tree.topics.map((t) => ({
    code: t.code,
    number: t.number,
    title: t.title,
    subtopics: t.subtopics.map((s) => ({
      code: s.code,
      label: s.label,
      title: s.title,
      gen: s.code.endsWith("-gen"),
      nSpecPoints: s.specPointCodes.length,
    })),
  }));

  const dumped = sme.map((t) => {
    const home = subtopicOfQuestionSet(t, index, notes);
    let rung: string | null = null;
    if (home) {
      if (t.subtopicCode && t.subtopicCode === home) rung = "1-resolved-code";
      else if (t.topicSlug && t.topicSlug === home) rung = "2-topic-slug";
      else if (home.endsWith("-gen")) rung = "6/7-topic-level";
      else rung = "3/4/5-inferred";
    }
    return {
      slug: t.slug,
      name: t.name,
      setName: t.setName ?? null,
      section: t.section ?? null,
      sectionSlug: t.sectionSlug ?? null,
      topicSlug: t.topicSlug ?? null,
      subtopicCode: t.subtopicCode ?? null,
      home: home ?? null,
      rung,
      nQuestions: t.questions.length,
    };
  });

  writeFileSync(
    join(OUT, `${dir}.json`),
    JSON.stringify({
      course: dir,
      subjectCode: index.tree.subjectCode,
      subjectTitle: index.tree.subjectTitle,
      topics: tree,
      sets: dumped,
    }),
  );
  files++;
}
console.log("courses dumped:", files);
