/**
 * T-TUTOR-AIM-P2 (DC10 §7.3): the ask-side command-word classifier.
 *
 * The v18 law teaches the six exam answer shapes; before this module the
 * DETECTION of which shape governs a given ask was left to the model's own
 * reading of the question — the small-model pool mis-keyed it (the P1 task
 * card's disclosed deviation: "the ask-side command-word classifier is a
 * P2 refinement"). This module pins the detection deterministically: a
 * fixed keyword table over the learner's question selects the command word
 * of record, and the user prompt renders the classification as one line —
 * the model stops guessing WHICH shape applies and starts executing the
 * one that is pinned.
 *
 * PRECISION-FIRST posture (disclosed): only an UNAMBIGUOUS command word
 * pins — it must be the FIRST word of the question (exam papers open
 * questions with the command word: "Explain why…", "Calculate the…").
 * A noun usage ("the state of matter"), a mid-sentence verb ("can you
 * explain…") and natural-language markers ("how", "why", "give", "name")
 * classify NULL and render NOTHING — the byte-stability law — and the
 * model's own v18 shape law still governs those asks untouched. A pin
 * REFINES the law for this ask; it never replaces it.
 *
 * Pure + deterministic — no LLM, no reads, no new learner contact (the
 * §7.3 shapes are presentation-only; sourcing stays sovereign). Exported
 * for the DC10 §10 retirement test ("revert the classifier to optional" is
 * a one-line call-site change — the prompt law alone remains correct).
 */

export type CommandWordFamily =
  | "STATE"
  | "DESCRIBE"
  | "EXPLAIN"
  | "CALCULATE"
  | "COMPARE"
  | "EVALUATE";

export interface CommandWordClassification {
  /** the command word of record, lower-case (the classifier's own token) */
  word: string;
  family: CommandWordFamily;
}

/** The six exam command words of the v18 shape law, first-word-matched
 *  (case-insensitive). "why" is deliberately ABSENT: it is natural-language
 *  vocabulary, not an exam command word — the EXPLAIN family stays pinned
 *  only where the paper's own convention would pin it. */
const COMMAND_WORDS: ReadonlyArray<{ word: string; family: CommandWordFamily }> = [
  { word: "state", family: "STATE" },
  { word: "describe", family: "DESCRIBE" },
  { word: "explain", family: "EXPLAIN" },
  { word: "calculate", family: "CALCULATE" },
  { word: "compare", family: "COMPARE" },
  { word: "evaluate", family: "EVALUATE" },
];

/** Classify the ask's opening command word, or null when the question does
 *  not OPEN with one (precision-first — see the header). The classification
 *  keys on the RAW trimmed question; the fence/untrusted doctrine is
 *  unaffected (the rendered line is OUR deterministic metadata, outside the
 *  fences, derived from the same question the fence already carries). */
export function classifyCommandWord(query: string): CommandWordClassification | null {
  const first = query.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  for (const { word, family } of COMMAND_WORDS) {
    if (first === word) return { word, family };
  }
  return null;
}
