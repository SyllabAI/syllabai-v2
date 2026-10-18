/**
 * Spec-quiz debris strip — the deterministic, zero-LLM companion to the
 * v11 prompt law "the specification is a map the tutor reads, not content
 * the learner memorises" (run-014, operator trace 1a14ee89eede4265
 * "Proceed"; the defect class the operator measured: the improvised quiz
 * asked "What is the specification code that covers …" — and the operator
 * has seen the tutor treat the specification as memorisable content
 * repeatedly).
 *
 * WHY THIS LAYER EXISTS (R-LLM doctrine: LLM outputs are never
 * golden-gated; the deterministic plumbing is). The v11 system-prompt law
 * lowers the frequency of spec-metadata quiz items; it cannot guarantee
 * their absence. This strip is the render-boundary belt-and-braces: the
 * tutor chat does not QUIZ THE LEARNER on corpus plumbing. The s22 record
 * stays verbatim of record — same posture as the citation-debris strip.
 *
 * PRECISION-FIRST LAWS (the stem-hygiene doctrine: every rule traces to a
 * measured shape and none may damage legitimate content):
 *   R1  quiz-item shape only — a line opening as a numbered item
 *       ("1. ", "2) ") or a bullet ("- ", "* ", "+ "). Prose paragraphs,
 *       the explanation body and scaffolding headers ("*Understanding
 *       check*") never match, so an explanation sentence like "The IGCSE
 *       specification lists a practical test for water …" is untouched.
 *   R2  meta vocabulary OUTSIDE parentheses — specification(s)/spec(s)/
 *       syllabus(US|i) (word-bounded: \bspec\b never matches "species" or
 *       "specimen"), "topic code", "node code", "learning objective".
 *       A chemistry item that merely CARRIES provenance — "…with water
 *       (specification 2.49)." — keeps its line (the R4 carve-out).
 *   R3  question shape — the line asks or requests: it contains "?", or
 *       it ends without terminal punctuation AND opens with an
 *       interrogative or recall verb (the MEASURED truncated row:
 *       "2. What is the specification code that covers" — the
 *       interrogative gate keeps unterminated EXPLANATION bullets like
 *       "- The specification lists three tests" safe), or it opens with
 *       a recall imperative (state/name/give/recall/quote/identify/
 *       write/list/define). A numbered statement with a full stop and no
 *       ask is left alone (disclosed boundary).
 *   R4  provenance carve-out — if the meta vocabulary matches ONLY inside
 *       parenthetical spans, the line is a provenance-carrying content
 *       item and is KEPT.
 *   A matching line is dropped whole (a half-stripped quiz item would be
 *   a worse artefact than the item). Whitespace collapses with the line.
 *   FAIL-OPEN: a result that would be empty for non-empty input returns
 *   the input unchanged — an answer stripped to nothing serves nothing.
 *
 * Boundary of record: operates line-by-line — a quiz item hard-wrapped
 * mid-ask across two raw lines whose meta vocabulary sits on the second
 * line is a miss (no measured row carries that shape; the prompt law
 * covers the residual).
 */

/** R1 — the quiz-item marker shapes the improvised quiz emits. */
const QUIZ_ITEM_MARKER = /^\s*(?:\d{1,2}[.)]\s+|[-*+]\s+)/;

/** R2 — the corpus-metadata vocabulary, word-bounded. */
const META_VOCAB =
  /\b(?:specifications?|specs?|syllab(?:us|i)|topic\s+code|node\s+code|learning\s+objectives?)\b/i;

/** R3 — terminal punctuation that marks a COMPLETE declarative line. */
const TERMINAL_PUNCT = /[.!?)\]…"']\s*$/;
/** R3 — interrogative openers (after the R1 marker). */
const INTERROGATIVE = /^(?:what|which|how|why|when|where|who|is|are|do|does|can|could|should)\b/i;
/** R3 — recall imperatives that turn a numbered line into an ask. */
const RECALL_VERB = /^(?:state|name|give|recall|quote|identify|write|list|define)\b/i;

function isSpecQuizItem(line: string): boolean {
  const afterMarker = line.replace(QUIZ_ITEM_MARKER, "");
  if (afterMarker === line) return false; // R1: not a quiz-item shape
  // R4 carve-out first: vocabulary that lives only inside parentheses is
  // provenance, not the ask's target.
  const outsideParens = line.replace(/\([^)]*\)/g, " ");
  if (!META_VOCAB.test(outsideParens)) return false;
  if (line.includes("?")) return true;
  // R3 truncated branch: unterminated AND already asking (the measured row)
  if (!TERMINAL_PUNCT.test(line) && (INTERROGATIVE.test(afterMarker) || RECALL_VERB.test(afterMarker))) {
    return true;
  }
  return RECALL_VERB.test(afterMarker);
}

export function stripSpecQuizDebris(text: string): string {
  const lines = text.split("\n");
  const hadContent = lines.some((line) => line.trim() !== "");
  const kept = lines.filter((line) => !isSpecQuizItem(line));
  const keptHasContent = kept.some((line) => line.trim() !== "");
  // FAIL-OPEN: stripping must never erase the answer — if every content
  // line was debris, the input serves unchanged (disclosed posture; the
  // v11 prompt law is the primary gate for that degenerate case).
  if (hadContent && !keptHasContent) return text;
  // collapse runs of blank lines left by dropped items (max 1 blank)
  const out: string[] = [];
  for (const line of kept) {
    const last = out[out.length - 1];
    if (line.trim() === "" && last != null && last.trim() === "") {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
