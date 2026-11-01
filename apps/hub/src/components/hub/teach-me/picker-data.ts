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
import type { Curriculum } from "@/lib/contracts";
import { normalizeSpecText } from "@/lib/spec-text";
import { bySpecPointOrder } from "@/lib/spec-tree";

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
