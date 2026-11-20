/**
 * Workbench fields — ADR-044 run-011 (B5, the client-side half of the
 * single-module gate law). The pure functions that turn the SERVED
 * question into the structured-edit surface of record:
 *
 *   - editableFields: the canonical field list (the QuestionPart grammar —
 *     problemMd / solutionMd / marks / commandWord per part, textMd /
 *     isCorrect per choice), each with its served value as the delta's
 *     "before" (the served artifact IS the base of record, ADR §6 step 1)
 *   - baseCtxOf: the base-shape context the engine validates part/choice
 *     references against (part count + served choice labels)
 *   - deltaFromEdits: the candidate delta — only fields the editor actually
 *     changed, before = the served value, after = the edited value
 *
 * Pure and dependency-free besides the hub's own contracts type: the
 * engine import happens in the component (client bundle) and on the api —
 * this module only shapes data.
 */
import type { ExamQuestion } from "@/lib/contracts";
import type { FieldDelta } from "@syllabai/editor-gates";

/** The part shape (the element type of the served question's parts array). */
type QuestionPartT = ExamQuestion["parts"][number];

export interface WorkbenchField {
  /** the canonical field path of record, e.g. parts[0].problemMd */
  path: string;
  /** human label (part/choice context + field name) */
  label: string;
  kind: "prose" | "marks" | "commandWord" | "isCorrect";
  /** the served value — the delta's "before" */
  current: string;
  /** false when the served value is null (the field exists but is unset) */
  present: boolean;
}

function partLabel(p: QuestionPartT, index: number): string {
  const cmd = p.commandWord ? ` (${p.commandWord})` : "";
  return `Part ${String.fromCharCode(97 + index)}${cmd} · ${p.marks} mark${p.marks === 1 ? "" : "s"}`;
}

/** The canonical editable fields of the served question, in render order. */
export function editableFields(q: ExamQuestion): WorkbenchField[] {
  const fields: WorkbenchField[] = [];
  q.parts.forEach((p, i) => {
    fields.push({
      path: `parts[${i}].problemMd`,
      label: `${partLabel(p, i)} — question text`,
      kind: "prose",
      current: p.problemMd,
      present: true,
    });
    fields.push({
      path: `parts[${i}].solutionMd`,
      label: `${partLabel(p, i)} — worked answer`,
      kind: "prose",
      current: p.solutionMd ?? "",
      present: p.solutionMd != null,
    });
    fields.push({
      path: `parts[${i}].marks`,
      label: `${partLabel(p, i)} — marks`,
      kind: "marks",
      current: String(p.marks),
      present: true,
    });
    fields.push({
      path: `parts[${i}].commandWord`,
      label: `${partLabel(p, i)} — command word`,
      kind: "commandWord",
      current: p.commandWord ?? "",
      present: p.commandWord != null,
    });
    (p.choices ?? []).forEach((c) => {
      fields.push({
        path: `parts[${i}].choices[${c.label}].textMd`,
        label: `${partLabel(p, i)} — option ${c.label}`,
        kind: "prose",
        current: c.textMd,
        present: true,
      });
      fields.push({
        path: `parts[${i}].choices[${c.label}].isCorrect`,
        label: `${partLabel(p, i)} — option ${c.label} answer key`,
        kind: "isCorrect",
        current: String(c.isCorrect),
        present: true,
      });
    });
  });
  return fields;
}

/** The base-shape context of record (the served artifact's shape). */
export function baseCtxOf(q: ExamQuestion): {
  partCount: number;
  choiceLabels: Record<string, string[]>;
} {
  return {
    partCount: q.parts.length,
    choiceLabels: Object.fromEntries(
      q.parts.map((p, i) => [String(i), (p.choices ?? []).map((c) => c.label)]),
    ),
  };
}

/** The candidate delta: only the fields whose edited value differs from the
 * served value; before is ALWAYS the served value (the served artifact is
 * the base of record — never the editor's clipboard). */
export function deltaFromEdits(
  q: ExamQuestion,
  edits: Record<string, string>,
): FieldDelta[] {
  const delta: FieldDelta[] = [];
  for (const f of editableFields(q)) {
    const edited = edits[f.path];
    if (edited === undefined) continue;
    if (edited === f.current) continue;
    delta.push({ field: f.path, before: f.current, after: edited });
  }
  return delta;
}

/** Whether any edit is pending (the propose button's gate). */
export function hasEdits(q: ExamQuestion, edits: Record<string, string>): boolean {
  return deltaFromEdits(q, edits).length > 0;
}
