/**
 * Wave-9 scoping census (READ-ONLY, throwaway for lane prep; NOT a gate).
 * The user-facing loose: smeRowOfNote resolution (the W8 mirror law) —
 * what the /revision-notes selector actually renders fleet-wide today.
 * Companion to rn_selector_census.ts (official-spine anchoring).
 */
import { readFile, readdir } from "node:fs/promises";
import { buildSpecTreeIndex, generalTopicsOfQuestionTopics, smeRowOfNote } from "../src/lib/spec-tree";
import type { RevisionNote, ExamQuestionTopic } from "../src/lib/contracts";

interface Node { code: string; family: string; title: string | null; parents: string[]; provenanceTier?: string; order?: number }
interface Note extends RevisionNote { contentKind?: string; sourceUrl?: string }

async function main() {
  const slugs = (await readdir("content", { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  console.log("course\tnotes\tresolved\texamTech\tLOOSE\tsmeLayer\tunresolvedPairs");
  for (const slug of slugs) {
    let curriculum: { nodes: Node[] }, notes: Note[], qsets: ExamQuestionTopic[];
    try {
      curriculum = JSON.parse(await readFile(`content/${slug}/curriculum.json`, "utf8"));
      notes = JSON.parse(await readFile(`content/${slug}/notes.json`, "utf8"));
      qsets = JSON.parse(await readFile(`content/${slug}/questions.json`, "utf8"));
    } catch {
      continue;
    }
    const index = buildSpecTreeIndex(curriculum as never, {
      generalTopics: generalTopicsOfQuestionTopics(qsets as never),
    } as never);
    let resolved = 0;
    const un: Note[] = [];
    for (const n of notes) {
      if (smeRowOfNote(n, index)) resolved++;
      else un.push(n);
    }
    const examTech = un.filter((n) => n.contentKind === "exam-technique").length;
    const loose = un.length - examTech;
    const smeLayer = curriculum.nodes.some((n) => n.provenanceTier === "SME_REFERENCE");
    const pairs = [...new Set(un.map((n) => `${n.sectionSlug}/${n.topicSlug}`))].length;
    console.log(`${slug}\t${notes.length}\t${resolved}\t${examTech}\t${loose}\t${smeLayer ? "yes" : "no"}\t${pairs}`);
  }
}
main();
