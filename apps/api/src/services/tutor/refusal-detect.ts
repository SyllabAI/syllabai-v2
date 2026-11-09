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

/** T-TUTOR-PIVOT-1 run-002 (live finding, 2026-11-05 prod replay): the
 *  rotated pool's DOMINANT refusal family skips the apology entirely —
 *  "The supplied sources do not contain information about …" (groq),
 *  "The provided sources do not contain information or definitions …"
 *  (gemini). The stem names the material itself, so the gate is a
 *  content-LACK verb in the tail — correction verbs ("do not support",
 *  "do not say") stay deliberately UNLISTED so a corrective opener
 *  ("The sources do not support that claim — here is the correction")
 *  never records refused. */
export const SOURCE_STEMS = [
  "the supplied sources",
  "the provided sources",
  "the sources",
  // the bare "none of the …" opener (the negation is IN the stem) — the
  // tail only needs to name the material
  "none of the",
] as const;

/** Content-lack verbs for the SOURCE_STEMS tier. */
export const SOURCE_LACK_MARKERS = [
  "do not contain",
  "do not cover",
  "do not include",
  "do not provide",
  "do not have",
  "do not state",
  "do not mention",
  "don't contain",
  "don't cover",
  "don't have",
  "none of",
  "no information",
  "no matching",
] as const;

/** A material-limitation phrase must follow the apology stem — the refusal
 *  is about what the SOURCES (not the learner) lack. */
export const REFUSAL_MATERIAL_MARKERS = [
  "sources",
  "course material",
  "validated",
  "supplied",
  "provided",
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
  // T-TUTOR-PIVOT-1 run-002 (live finding): "I'm sorry, but none of the
  // supplied sources contain that information." — the "none of" family
  "none of",
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
  // run-002 tier: the source-first family (the rotated pool's dominant
  // wording) — the material is in the stem; a content-LACK verb decides.
  // "none of the …" carries its negation in the stem, so the material
  // markers decide for that prefix.
  const srcStem = SOURCE_STEMS.find((s) => head.startsWith(s));
  if (srcStem != null) {
    const tail = head.slice(srcStem.length);
    if (srcStem === "none of the") {
      return REFUSAL_MATERIAL_MARKERS.some((m) => tail.includes(m));
    }
    return SOURCE_LACK_MARKERS.some((m) => tail.includes(m));
  }
  const stem = APOLOGY_REFUSAL_STEMS.find((s) => head.startsWith(s));
  if (stem == null) return false;
  const tail = head.slice(stem.length);
  const material = REFUSAL_MATERIAL_MARKERS.some((m) => tail.includes(m));
  const negated = REFUSAL_NEGATIONS.some((n) => tail.includes(n));
  return material && negated;
}

/** T-TUTOR-PIVOT-1 run-002 — the DETERMINISTIC redirect. Run-001's live
 *  replay (prod, post-deploy) measured the small-model pool ignoring the
 *  v17 redirect law: 6/6 model-worded refusals ended bare, no way forward
 *  for the learner. A prompt law is not a foundation — the pipeline now
 *  appends the redirect line itself whenever a model-worded refusal is
 *  detected (blocking: before the answer returns; streaming: as a tail
 *  delta before the completed event). Idempotent: an answer that already
 *  carries a redirect (law-compliant model, or the deterministic
 *  TUTOR_REFUSAL's own "Try naming the topic …") is returned untouched. */
export const REFUSAL_REDIRECT_SUFFIX =
  "\n\nCould you rephrase the question, or start a new conversation on this topic?";

/** True when the answer already carries a redirect line (either wording of
 *  the law or the appended suffix). */
export function hasRedirectLine(answer: string): boolean {
  const lower = answer.toLowerCase();
  return lower.includes("rephrase") || lower.includes("new conversation");
}

/** The deterministic redirect append — the pipeline's own way-forward line
 *  on every detected model-worded refusal. */
export function withRefusalRedirect(answer: string): string {
  if (hasRedirectLine(answer)) return answer;
  return answer + REFUSAL_REDIRECT_SUFFIX;
}
