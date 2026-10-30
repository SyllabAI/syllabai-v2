/**
 * R3 mixed check types — the shared written-kind grading law (client-safe).
 *
 * Both renderer sites (guided-check.tsx read layer, guided-flow.tsx check stage)
 * import from here so the grading behaviour is lockstep by construction.
 *
 * Grading law of record (R3-MIXED-CHECK-TYPES, adapter spec 0.5 §6):
 *   - case-insensitive WHOLE-TOKEN match of the learner text against keywords[]
 *     (both sides tokenized on [a-z0-9]+ runs);
 *   - >=1 hit -> "correct"; 0 hits -> "notquite" (model answer shown either way);
 *   - empty/whitespace submit -> blocked by the renderers (button disabled);
 *   - keywords absent/empty -> "revealonly" (model answer shown, NO verdict) —
 *     fail-closed, never a silent wrong grade;
 *   - written item without modelAnswer -> "revealonly" (never gradeable, never blank);
 *   - unknown kind values -> "revealonly" (never guessed).
 */
import type { GuidedQuestion } from "@/lib/guided-lessons";

/** The three written kinds of record (SME mixed taxonomy: 1 MCQ + 2 recall + 1 explain-why + 1 application). */
export const WRITTEN_KINDS = ["recall", "explain-why", "application"] as const;
export type WrittenKind = (typeof WRITTEN_KINDS)[number];

const isWritten = (kind: string | undefined): kind is WrittenKind =>
  kind !== undefined && (WRITTEN_KINDS as readonly string[]).includes(kind);

/** How a question renders: mcq (existing path, untouched) | written | revealonly. */
export function checkMode(q: Pick<GuidedQuestion, "kind">): "mcq" | "written" | "revealonly" {
  if (q.kind === undefined || q.kind === "mcq") return "mcq";
  return isWritten(q.kind) ? "written" : "revealonly";
}

const TOKEN_RE = /[a-z0-9]+/g;
function tokenize(s: string): string[] {
  return s.toLowerCase().match(TOKEN_RE) ?? [];
}

export type WrittenVerdict = "correct" | "notquite" | "revealonly";

/**
 * Grade a written response. "revealonly" means: show the model answer, never a
 * verdict — used when keywords are absent/empty (or the kind is unknown); the
 * renderers block submission for these (the model answer is the settle).
 */
export function gradeWritten(q: Pick<GuidedQuestion, "kind" | "keywords">, text: string): WrittenVerdict {
  if (!isWritten(q.kind)) return "revealonly";
  if (!q.keywords || q.keywords.length === 0) return "revealonly";
  const learnerTokens = tokenize(text);
  if (learnerTokens.length === 0) return "notquite";
  const keyTokens = new Set(q.keywords.flatMap((k) => tokenize(k)));
  if (keyTokens.size === 0) return "revealonly";
  return learnerTokens.some((t) => keyTokens.has(t)) ? "correct" : "notquite";
}
