/**
 * T-SME-SEL-W7 closeout — Revision Notes selector census (READ-ONLY).
 * Replicates loadHubCourse's placement exactly (buildSpecTreeIndex +
 * subtopicOfNote over the committed corpus — the same functions the runtime
 * calls) without the server-only import: what the /revision-notes selector
 * renders per course, fleet-wide.
 */
import { readFile, readdir } from "node:fs/promises";
import { buildSpecTreeIndex, generalTopicsOfQuestionTopics, subtopicOfNote } from "../src/lib/spec-tree";
import type { RevisionNote, ExamQuestionTopic } from "../src/lib/contracts";

interface Node { code: string; family: string; title: string | null; parents: string[]; provenanceTier?: string; order?: number; smeSectionSlug?: string }
interface Note extends RevisionNote { contentKind?: string }

async function main() {
  const slugs = (await readdir("content", { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  console.log("course\tnotes\ttopicGroups\tsubRows\tanchored\texamTech\tloose\tSMElayer");
  for (const slug of slugs) {
    let curriculum: { nodes: Node[]; edges?: unknown[] }, notes: Note[], qsets: ExamQuestionTopic[];
    try {
      curriculum = JSON.parse(await readFile(`content/${slug}/curriculum.json`, "utf8"));
      notes = JSON.parse(await readFile(`content/${slug}/notes.json`, "utf8"));
      qsets = JSON.parse(await readFile(`content/${slug}/questions.json`, "utf8"));
    } catch {
      console.log(`${slug}\tSKIP(no bundle files)`);
      continue;
    }
    const index = buildSpecTreeIndex(curriculum as never, {
      generalTopics: generalTopicsOfQuestionTopics(qsets as never),
    } as never);
    const noteSubtopic: Record<string, string | null> = {};
    for (const n of notes) noteSubtopic[n.noteId] = subtopicOfNote(n, index);
    let subRows = 0, topicGroups = 0;
    for (const t of index.tree.topics) {
      const rows = t.subtopics.filter((s) => (index.subtopicByCode.has(s.code)) &&
        notes.some((n) => noteSubtopic[n.noteId] === s.code) ||
        // NotesIndex filters by counts[sub.code].notes — resourceCounts counts notes anchored to the row
        false);
      // honest recount via per-sub note counts:
      const withNotes = t.subtopics.filter((s) => notes.some((n) => noteSubtopic[n.noteId] === s.code));
      if (withNotes.length > 0) topicGroups++;
      subRows += withNotes.length;
      void rows;
    }
    const anchored = Object.values(noteSubtopic).filter(Boolean).length;
    const un = notes.filter((n) => !noteSubtopic[n.noteId]);
    const examTech = un.filter((n) => n.contentKind === "exam-technique").length;
    const loose = un.length - examTech;
    const smeLayer = curriculum.nodes.some((n) => n.provenanceTier === "SME_REFERENCE");
    console.log(`${slug}\t${notes.length}\t${topicGroups}\t${subRows}\t${anchored}\t${examTech}\t${loose}\t${smeLayer ? "yes" : "no"}`);
  }
}
main();
