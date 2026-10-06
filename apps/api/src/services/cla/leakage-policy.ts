/**
 * The deterministic exam-question answer-leakage gate (T-MIG-067 tranche-1a).
 * Frozen source: syllabai-core @ 6cad6ef cla/ClaLeakagePolicy.java, ported
 * line-against-line (CLA contract §7.4: "implemented in application code
 * over resolved ids and attempt state — never delegated to the model, never
 * prompt-only").
 *
 * Two deterministic decisions, both pure functions of the resolved
 * ClaResourceContext, the ResponseMode and the evidence item:
 *
 *   1. Mode admission — CHECK on a question context requires attempt
 *      evidence for the requesting learner and question (§7.3, read from
 *      attempt history — the same substrate as Review Hub). Pre-attempt
 *      CHECK throws ClaAttemptRequiredError BEFORE retrieval or generation
 *      runs.
 *   2. Evidence eligibility — what may enter the SOURCES block:
 *        - PAST_PAPER_QUESTION / QUESTION_PART: mark-scheme DOCUMENT chunks
 *          are NEVER eligible (canonical mark-scheme chunks are PAGE-level
 *          and cannot be bound to one question deterministically — serving
 *          them could leak a sibling question's pending points).
 *          Post-attempt full feedback grounds on the question's OWN
 *          VALIDATED assessment-model scheme points instead (prepended by
 *          the pipeline as synthesized evidence).
 *        - KG_TOPIC (and the topic-anchored kinds): mark-scheme document
 *          chunks are allowed (tutor parity) — a free topic discussion is
 *          not anchored to assessment content.
 *        - HINT on a question context additionally never receives the
 *          synthesized scheme-point evidence, pre- or post-attempt (§7.2:
 *          scaffolding only).
 */
import type { EvidenceItem } from "../tutor/evidence";
import { isQuestionContext, type ClaResourceContext } from "./context";

/** The response mode — ResponseMode.java :22-36. The mode is DATA. */
export type ClaResponseMode = "EXPLAIN" | "SUMMARIZE" | "HINT" | "CHECK";

/**
 * The deterministic answer-leakage refusal (AttemptRequiredException :11-15):
 * CHECK was requested on a question context whose attempt evidence does not
 * exist for the requesting learner. Thrown BEFORE any retrieval or
 * generation — a pre-attempt CHECK can never reach question content, a
 * provider, or evidence assembly. The body is the fixed 409 text
 * (contracts CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE).
 */
export class ClaAttemptRequiredError extends Error {
  constructor() {
    super(
      "full feedback requires an attempt on this question first — " +
        "the answer-leakage gate unlocks CHECK after attempt evidence exists",
    );
    this.name = "ClaAttemptRequiredError";
  }
}

/**
 * §7.3/§7.4: CHECK requires attempt evidence on question contexts
 * (checkModeAdmission :52-58). The attempted read is the resolver's
 * DETERMINISTIC attempt-history probe (null on non-question contexts).
 */
export function checkModeAdmission(
  context: ClaResourceContext,
  mode: ClaResponseMode,
): void {
  if (isQuestionContext(context) && mode === "CHECK" && context.attempted !== true) {
    throw new ClaAttemptRequiredError();
  }
}

/**
 * §7.2/§7.4: may a mark-scheme DOCUMENT chunk enter evidence for this
 * context? (markSchemeDocumentChunkAllowed :61-66) — step 2, question
 * contexts: never (page-level chunks cannot be bound to one question
 * deterministically — strict-safe exclusion).
 */
export function markSchemeDocumentChunkAllowed(
  context: ClaResourceContext,
  _mode: ClaResponseMode,
): boolean {
  return !isQuestionContext(context);
}

/**
 * §7.2: may the question's OWN scheme-point evidence enter a HINT? Never.
 * (schemePointEvidenceAllowed :69-73) — post-attempt only, and HINT never.
 */
export function schemePointEvidenceAllowed(
  context: ClaResourceContext,
  mode: ClaResponseMode,
): boolean {
  return isQuestionContext(context) && context.attempted === true && mode !== "HINT";
}

/**
 * The deterministic evidence filter applied post-fusion, pre-gate
 * (evidenceEligible :76-86): a MARK_SCHEME DOCUMENT chunk (rowId present)
 * is excluded on question contexts entirely.
 */
export function evidenceEligible(
  context: ClaResourceContext,
  mode: ClaResponseMode,
  item: EvidenceItem,
): boolean {
  void mode;
  if (item.source === "MARK_SCHEME" && isQuestionContext(context) && item.documentRowId !== null) {
    return false;
  }
  return true;
}
