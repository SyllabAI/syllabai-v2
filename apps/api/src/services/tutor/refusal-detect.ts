/**
 * Model-worded refusal detection (T-TUTOR-PIVOT-1 run-001) — the refusal-
 * truth patch. The deterministic refusal (zero surviving evidence) already
 * records refused=true BY CONSTRUCTION (karag's evidence-length law). The
 * MEASURED gap is the model-worded refusal: evidence present but wrong →
 * the honesty floor refuses in the model's own words and the turn recorded
 * refused=false — invisible to the tutor analytics and the struggle
 * signals (the 2026-11-05 live report, session bd6c89ff seq 13-16:
 * "I'm sorry, but the supplied sources do not contain any information
 * about the difference between boiling and evaporation.").
 *
 * The v17 refusal shape law (prompt.ts) pins the canonical stem the model
 * must open a refusal with; this detector keys on that stem (tier 1) plus
 * a tolerant apology family (tier 2) for provider-rotated wording that
 * complies imperfectly. Every test is a deterministic string operation on
 * the FINISHED answer — stream parity: the same test on the accumulated
 * text at completion. R-LLM doctrine holds: LLM outputs are never
 * golden-gated; this is best-effort truth on the analytics plane (the
 * refused flag of the turn + the research event), never a safety gate.
 */

/** The v17 canonical stem — the instructed refusal opener. If an answer
 *  opens with it, it IS a refusal: the phrase cannot plausibly open a
 *  grounded answer, so no further gate applies. */
export const CANONICAL_REFUSAL_STEMS = [
  "i can't answer that from the validated course material",
  "i cannot answer that from the validated course material",
] as const;

/** The tolerant apology family — provider-rotated models that did not
 *  follow the v17 stem still refuse recognisably (the measured live
 *  wording opens "I'm sorry, but ..."). These stems alone are NOT
 *  sufficient: a corrective answer may legitimately open with an apology. */
export const APOLOGY_REFUSAL_STEMS = [
  "i'm sorry, but",
  "i am sorry, but",
  "sorry, but",
] as const;

/** A material-limitation phrase must follow the apology stem — the refusal
 *  is about what the SOURCES (not the learner) lack. */
export const REFUSAL_MATERIAL_MARKERS = [
  "sources",
  "course material",
  "validated",
  "supplied",
] as const;

/** And the limitation must be NEGATED — "the sources do not contain" is a
 *  refusal; "your answer used the sources incorrectly" is a correction and
 *  must NOT record refused=true. */
export const REFUSAL_NEGATIONS = [
  "do not",
  "does not",
  "don't",
  "doesn't",
  "cannot",
  "can't",
  "could not",
  "couldn't",
  "no information",
  "no matching",
  "no row",
  "no source",
  "not contain",
  "not covered",
  "not in the",
  "nothing",
  "missing",
  "insufficient",
  "lack",
] as const;

/** The stem + limitation phrase live in the answer's opening; the head
 *  window keeps the tests anchored there (a citation of the phrase mid-
 *  answer — e.g. inside a quoted earlier turn — must not trigger). */
export const REFUSAL_HEAD_CHARS = 300;

/**
 * The refusal truth for a finished answer: true exactly when the answer
 * opens with the canonical stem, or opens with the apology family AND
 * names the material AND negates it — all within the head window.
 * Deterministic, allocation-free, stream-parity (the same verdict on the
 * accumulated text the blocking path sees).
 */
export function modelRefusalLikely(answer: string | null | undefined): boolean {
  if (answer == null) return false;
  const norm = answer.toLowerCase().replace(/\s+/g, " ").trimStart();
  const head = norm.slice(0, REFUSAL_HEAD_CHARS);
  for (const stem of CANONICAL_REFUSAL_STEMS) {
    if (head.startsWith(stem)) return true;
  }
  const stem = APOLOGY_REFUSAL_STEMS.find((s) => head.startsWith(s));
  if (stem == null) return false;
  const tail = head.slice(stem.length);
  const material = REFUSAL_MATERIAL_MARKERS.some((m) => tail.includes(m));
  const negated = REFUSAL_NEGATIONS.some((n) => tail.includes(n));
  return material && negated;
}
