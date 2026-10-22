// ── DC-4 — Lens Cards as Navigation (docs/DC4-LENS-CARDS-NAVIGATION-PLAN.md)
// A lens is a DATA ROW (id, surface, template id, router target) — never a
// code branch (spec §3.4 mechanics). The notes rows carry the operator
// spec's card texts VERBATIM (moved unchanged out of note-cla.tsx's inline
// QUICK_ACTIONS; byte-pinned in lens-registry.test.ts). Router targets
// follow the observed product's mapping of record: Flashcards for
// Definitions and Pitfalls, Exam Questions for Summary and Exam help.
// The free-text mode that follows a lens is governed by the existing prompt
// laws unchanged — identity of record stays tutor-grounded/v15.

import {
  BookMarked,
  GraduationCap,
  ListChecks,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LensSurface = "notes" | "questions";

/** CLA ask modes a lens can ride (the shipped mode vocabularies). */
export type LensAskMode = "EXPLAIN" | "SUMMARIZE" | "HINT";

/**
 * Closed router-target vocabulary (spec §3.4 acceptance (b)): every lens
 * declares exactly one target. Route-kind targets resolve through
 * lensRouteHrefFor; in-chat targets ARE the governed ask (the quiz-scaffold
 * precedent); the tutor-mark-context target deep-links the free tutor (the
 * question player's helpHref pattern) because the CLA route plane is
 * byte-frozen and cannot carry mark state — the tutor pipeline owns the
 * DC-1 markContext, and its own fail-open law governs the ask.
 */
export type LensRouterTarget =
  | { kind: "route"; to: "flashcards" | "exam-questions" }
  | { kind: "in-chat"; mode: LensAskMode }
  | { kind: "tutor-mark-context" };

export interface LensRow {
  id: string;
  surface: LensSurface;
  /** pinned template id of record */
  templateId: string;
  title: string;
  /** the card's one-line description */
  description: string;
  icon: LucideIcon;
  target: LensRouterTarget;
  /** the deterministic pinned ask (notes rows are static) */
  prompt: string;
}

/**
 * The notes surface's four lens rows — the operator spec, VERBATIM
 * (titles, descriptions and prompts byte-identical to the shipped cards;
 * pinned byte-for-byte in lens-registry.test.ts).
 */
export const NOTES_LENSES: (LensRow & { mode: "EXPLAIN" | "SUMMARIZE" })[] = [
  {
    id: "definitions",
    surface: "notes",
    templateId: "note-definitions-v1",
    title: "Definitions",
    description: "Define the key terms in this revision note",
    prompt: "Define the key terms in this revision note",
    mode: "EXPLAIN",
    target: { kind: "route", to: "flashcards" },
    icon: BookMarked,
  },
  {
    id: "summary",
    surface: "notes",
    templateId: "note-summary-v1",
    title: "Summary",
    description: "Summarise the key points",
    prompt: "Summarise the key points",
    mode: "SUMMARIZE",
    target: { kind: "route", to: "exam-questions" },
    icon: ListChecks,
  },
  {
    id: "pitfalls",
    surface: "notes",
    templateId: "note-pitfalls-v1",
    title: "Pitfalls",
    description: "Examine common misconceptions",
    prompt: "Examine common misconceptions",
    mode: "EXPLAIN",
    target: { kind: "route", to: "flashcards" },
    icon: TriangleAlert,
  },
  {
    id: "exam-help",
    surface: "notes",
    templateId: "note-exam-help-v1",
    title: "Exam help",
    description: "Tips for understanding this topic",
    prompt: "Give tips for understanding this topic and how it is examined",
    mode: "EXPLAIN",
    target: { kind: "route", to: "exam-questions" },
    icon: GraduationCap,
  },
];

// ── questions-surface lens templates (pinned constants/builders; the
// shipped chips' ask bytes move here unchanged) ──────────────────────────

/** The `understand` lens — byte-identical to the shipped chip's prompt. */
export const QUESTION_UNDERSTAND_PROMPT =
  "What is this question asking me to do? Walk through each part — the command words, the marks, and what the examiner is looking for. Don't tell me the answers.";

/**
 * The `approach` lens (the approach scaffold as a governed in-chat HINT
 * ask) — deterministic over the resolved target; both branches byte-exact
 * to the shipped chip.
 */
export function questionApproachPrompt(
  target: {
    anchor: "QUESTION_PART" | "PAST_PAPER_QUESTION" | "QUESTION";
    label: string;
  } | null,
): string {
  return target && target.anchor === "QUESTION_PART"
    ? `Help me work through part (${target.label}) step by step — coach me toward the answer without giving it away.`
    : "Help me work through this question step by step — coach me toward the answer without giving it away.";
}

/**
 * The `why-marked` lens — "Why was I marked this" (spec §3.4), routed to
 * the DC-1 marking context through the free tutor's anchored deep link
 * (`/tutor?course=…&q=…`, the question player's helpHref pattern of
 * record). Mark context resolves per DC-1's own law — fail-open to the
 * ordinary grounded ask when no marked attempt/pin resolves.
 */
export function questionWhyMarkedHref(
  course: string,
  questionFirstLine: string | null,
): string {
  const q = (questionFirstLine ?? "").trim();
  const ask = q
    ? `Why was I marked this? Help me with this exam question: ${q} — walk me through the mark I received`
    : "Why was I marked this? Walk me through the mark I received on my latest attempt";
  return `/tutor?course=${encodeURIComponent(course)}&q=${encodeURIComponent(ask)}`;
}

/** Card metadata of record for the why-marked lens. */
export const QUESTION_WHY_MARKED = {
  id: "why-marked",
  surface: "questions" as const,
  templateId: "question-why-marked-v1",
  title: "Why was I marked this",
  description: "Walk me through my mark — opens the Tutor",
};

/** Route-kind href resolution (acceptance (b)). */
export function lensRouteHrefFor(
  course: string,
  to: "flashcards" | "exam-questions",
): string {
  return `/courses/${encodeURIComponent(course)}/${to}`;
}

/**
 * The route-kind target of a lens id (acceptance (b)) — null for in-chat
 * and tutor-deep-link lenses and for unknown ids (fail-open).
 */
export function lensRouteTargetFor(
  lensId: string,
): { to: "flashcards" | "exam-questions" } | null {
  const row = NOTES_LENSES.find((l) => l.id === lensId);
  return row && row.target.kind === "route" ? { to: row.target.to } : null;
}
