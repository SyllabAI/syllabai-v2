/**
 * The Teach-Me wizard's spec-point picker tree (T-TEACHME-001 run-003).
 *
 * Pure projection over the course's committed curriculum of record (the
 * same CurriculumNode families the spec tree and sidebar walk): SUBJECT →
 * TOPIC (4CH1-S1) → SUBTOPIC (4CH1-S1-a) → SPEC_POINT (4CH1-1.1 …). The
 * dotted spec codes here are the family the API's canon gate validates
 * against (knowledge_nodes SPEC_POINT codes, the {subject}-{code} dotted
 * law of the serving corpus) — the wizard sends exactly these to
 * POST /teach-me/sessions, and the G1–G4 content gates stay the fail-closed
 * law of what is actually servable.
 *
 * No eligibility is fabricated hub-side: every committed spec point is
 * offered; create() refuses honestly when the serving corpus cannot ground
 * a pick (COURSE_NOT_ELIGIBLE, by design — run-002 receipt).
 */
import type { Curriculum, RevisionNote } from "@/lib/contracts";
import { normalizeSpecText } from "@/lib/spec-text";
import { buildSpecTreeIndex, bySpecPointOrder, subtopicOfNote } from "@/lib/spec-tree";

export interface TeachMePickerPoint {
  /** the canon spec code of record, e.g. "4CH1-2.3" */
  code: string;
  /** the spec statement (normalized corpus text) */
  title: string;
}

export interface TeachMePickerSubtopic {
  code: string;
  /** the official-tree suffix label ("a", "b" …) or corpus label */
  label: string;
  title: string;
  points: TeachMePickerPoint[];
}

export interface TeachMePickerTopic {
  code: string;
  /** 1-based display number (corpus order) — the MG "grade-banded" grouping */
  number: number;
  title: string;
  subtopics: TeachMePickerSubtopic[];
}

const byOrderThenCode = (a: { order?: number; code: string }, b: { order?: number; code: string }) =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  a.code.localeCompare(b.code);

/** Spec points order by the house numeric-aware law ("4CH1-2.10" after "4CH1-2.3"). */
const byOrderThenSpecPoint = (
  a: { order?: number; code: string },
  b: { order?: number; code: string },
) =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  bySpecPointOrder(a.code, b.code);

/**
 * The sub-topic display label — the same law as spec-tree.ts subtopicLabel:
 * official-tree codes suffix a letter ("4CH1-S1-a" → "a"); SME-native
 * slugs lead with a number ("1-1-formulae-and-equations" → "1.1").
 */
function subtopicLabel(subtopicCode: string, topicCode: string, ordinal: number): string {
  const suffix = subtopicCode.slice(topicCode.length);
  if (suffix.startsWith("-") && /^[a-z]\d*$/i.test(suffix.slice(1))) return suffix.slice(1);
  const m = subtopicCode.match(/^(\d+)-(\d+)-/);
  if (m) return `${m[1]}.${m[2]}`;
  return String(ordinal + 1);
}

export function buildTeachMePickerTree(curriculum: Curriculum): TeachMePickerTopic[] {
  const nodes = curriculum.nodes;
  const topics = nodes.filter((n) => n.family === "TOPIC").sort(byOrderThenCode);
  const tree: TeachMePickerTopic[] = [];

  for (const [i, topic] of topics.entries()) {
    const subtopics: TeachMePickerSubtopic[] = [];
    const subs = nodes
      .filter((n) => n.family === "SUBTOPIC" && n.parents.includes(topic.code))
      .sort(byOrderThenCode);

    for (const [j, sub] of subs.entries()) {
      const points = nodes
        .filter((n) => n.family === "SPEC_POINT" && n.parents.includes(sub.code))
        .sort(byOrderThenSpecPoint)
        .map((p) => ({ code: p.code, title: normalizeSpecText(p.title) }));
      if (points.length === 0) continue;
      subtopics.push({
        code: sub.code,
        label: subtopicLabel(sub.code, topic.code, j),
        title: normalizeSpecText(sub.title),
        points,
      });
    }

    // orphan spec points (no committed subtopic parent) keep their honest
    // place under the topic — the spec statement is the label of record
    const orphans = nodes
      .filter(
        (n) =>
          n.family === "SPEC_POINT" &&
          n.parents.includes(topic.code) &&
          !subtopics.some((s) => s.points.some((p) => p.code === n.code)),
      )
      .sort(byOrderThenSpecPoint)
      .map((p) => ({ code: p.code, title: normalizeSpecText(p.title) }));
    if (orphans.length > 0) {
      subtopics.push({
        code: `${topic.code}-points`,
        label: "·",
        title: "Spec points",
        points: orphans,
      });
    }

    if (subtopics.length > 0) {
      tree.push({
        code: topic.code,
        number: i + 1,
        title: normalizeSpecText(topic.title),
        subtopics,
      });
    }
  }
  return tree;
}

/** The wizard may ground a session on at most 3 spec points (MG parity; contract max). */
export const TEACH_ME_MAX_SPEC_POINTS = 3;

export function canPickMore(selected: readonly string[]): boolean {
  return selected.length < TEACH_ME_MAX_SPEC_POINTS;
}

/* ---------------------------------------------------------------------- */
/* T-TEACHGENIE-002 — the note-driven picker projection                    */
/* The operator order (chat trace 1a1a84b5cf0e865d): Teach Genie should    */
/* let the learner choose a REVISION NOTE of the course — organized under  */
/* unit/topic dropdowns — instead of hand-picking spec points. The         */
/* grouping of record is the SAME canonical spec tree every other notes    */
/* surface uses (never a second taxonomy): TOPIC = the unit dropdown,      */
/* SUBTOPIC = the topic dropdown, and each note rides the sub-topic its    */
/* canon codes anchor it to (subtopicOfNote — the notes-index law).        */
/* Notes that no code/topicSlug anchors keep the honest loose-notes group. */
/*                                                                        */
/* A picked note's specPointCodes ARE the session's ground truth: the      */
/* client sends them verbatim as the create request's specPointIds (the    */
/* contract ceiling is 8 since T-TEACHGENIE-002 — corpus max 4). The API's */
/* G1 canon gate stays the fail-closed law of what is actually servable;   */
/* no hub-side eligibility is fabricated here, exactly like the            */
/* spec-point picker above.                                                */
/* ---------------------------------------------------------------------- */

export interface TeachGeniePickerNote {
  noteId: string;
  title: string;
  /** canon spec codes of record — sent verbatim as the session's specPointIds */
  specPointCodes: string[];
}

export interface TeachGeniePickerSubtopicNotes {
  code: string;
  /** the official-tree suffix label ("a", "b" …) or corpus label */
  label: string;
  title: string;
  notes: TeachGeniePickerNote[];
}

export interface TeachGeniePickerNoteTopic {
  code: string;
  /** 1-based display number (corpus order) */
  number: number;
  title: string;
  subtopics: TeachGeniePickerSubtopicNotes[];
}

/** The trailing group for notes no code/topicSlug anchors to a sub-topic. */
export const TEACH_GENIE_LOOSE_TOPIC_CODE = "teach-genie-loose";

export function buildTeachGenieNoteTree(
  curriculum: Curriculum,
  notes: RevisionNote[],
): TeachGeniePickerNoteTopic[] {
  const index = buildSpecTreeIndex(curriculum);

  // bucket every note once, by its first placed sub-topic (the notes-index
  // law of record); input order is the corpus order — preserved, never re-sorted
  const bySubtopic = new Map<string, TeachGeniePickerNote[]>();
  const loose: TeachGeniePickerNote[] = [];
  for (const n of notes) {
    if (n.specPointCodes.length === 0) {
      // a note with no canon code cannot ground a session (the create gate
      // would refuse it) — it is not offered, honestly, by omission
      continue;
    }
    const note: TeachGeniePickerNote = {
      noteId: n.noteId,
      title: n.title,
      specPointCodes: [...n.specPointCodes],
    };
    const s = subtopicOfNote(n, index);
    if (s == null) {
      loose.push(note);
    } else {
      const list = bySubtopic.get(s);
      if (list) list.push(note);
      else bySubtopic.set(s, [note]);
    }
  }

  const pickerTopics: TeachGeniePickerNoteTopic[] = [];
  for (const [i, topic] of index.tree.topics.entries()) {
    const subtopics: TeachGeniePickerSubtopicNotes[] = [];
    for (const sub of topic.subtopics) {
      const group = bySubtopic.get(sub.code);
      if (!group || group.length === 0) continue;
      subtopics.push({ code: sub.code, label: sub.label, title: sub.title, notes: group });
    }
    if (subtopics.length === 0) continue; // a unit with no notes is not offered
    pickerTopics.push({
      code: topic.code,
      number: i + 1,
      title: topic.title,
      subtopics,
    });
  }

  if (loose.length > 0) {
    pickerTopics.push({
      code: TEACH_GENIE_LOOSE_TOPIC_CODE,
      number: pickerTopics.length + 1,
      title: "Other notes",
      subtopics: [
        {
          code: `${TEACH_GENIE_LOOSE_TOPIC_CODE}-all`,
          label: "·",
          title: "Notes without a spec-tree home yet",
          notes: loose,
        },
      ],
    });
  }

  return pickerTopics;
}
