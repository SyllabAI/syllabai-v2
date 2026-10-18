/**
 * PROPOSED proof of concept: evidence-verification labels.
 *
 * This is deliberately a pure classifier, not a learner-state writer.
 * It adds a second, explicit evidence view alongside probabilistic BKT/BDT;
 * it must not replace those models or mutate mastery.
 *
 * IMPORTANT: callers must populate assistance/exposure and transfer flags
 * from application-controlled assessment/session metadata, never from an
 * LLM-generated assertion. Missing/unknown assistance fails closed: a correct
 * response with unknown assistance is ATTEMPTED, not independent success.
 */
export type AssistanceLevel =
  | "NONE"
  | "HINT"
  | "STEP_BY_STEP"
  | "TEACHER_SUPPORT"
  | "ANSWER_EXPOSED"
  | "UNKNOWN";

export type VerificationLevel =
  | "ATTEMPTED"
  | "SUPPORTED_SUCCESS"
  | "INDEPENDENT_SUCCESS"
  | "TRANSFER_SUCCESS";

export interface VerificationAttempt {
  attemptId: string;
  questionId: string;
  occurredAt: string;
  /** null means not yet authoritatively graded. */
  correct: boolean | null;
  /** Must be app-authored/validated, not inferred from free-form chat. */
  assistance: AssistanceLevel;
  /** True when the answer/solution was exposed before this attempt. */
  answerExposedBeforeAttempt: boolean;
  /** True only when the assessment is explicitly designated as transfer. */
  isTransferAssessment: boolean;
  /** Canonical SpecificationPoint ids; empty means transfer cannot be claimed. */
  specificationPointIds: string[];
}

export interface VerificationPolicy {
  /**
   * Proposed experiment parameter. No scientific default is imposed here;
   * callers must choose and version this threshold before evaluation.
   */
  minimumTransferDelayMs: number;
}

export interface VerificationResult {
  level: VerificationLevel;
  reasonCodes: string[];
  /** This classifier never promotes mastery; application logic remains owner. */
  masteryMutation: "NONE";
}

/**
 * Classifies one attempt against prior provenance-bearing attempts.
 *
 * Transfer is intentionally conservative: current response must be correct,
 * explicitly independent, explicitly tagged as a transfer assessment, target
 * at least one canonical SpecificationPoint, and follow earlier evidence on
 * an overlapping SpecificationPoint using a different canonical question
 * after the configured delay. This is an evidence label, not a causal claim.
 */
export function classifyVerificationEvidence(
  current: VerificationAttempt,
  priorAttempts: readonly VerificationAttempt[],
  policy: VerificationPolicy,
): VerificationResult {
  if (!Number.isFinite(policy.minimumTransferDelayMs) || policy.minimumTransferDelayMs < 0) {
    throw new RangeError("minimumTransferDelayMs must be a finite non-negative number");
  }

  if (current.correct === null || current.correct === false) {
    return {
      level: "ATTEMPTED",
      reasonCodes: [current.correct === null ? "NOT_YET_GRADED" : "INCORRECT_RESPONSE"],
      masteryMutation: "NONE",
    };
  }

  if (current.answerExposedBeforeAttempt || current.assistance === "ANSWER_EXPOSED") {
    return {
      level: "SUPPORTED_SUCCESS",
      reasonCodes: ["ANSWER_OR_SOLUTION_EXPOSED"],
      masteryMutation: "NONE",
    };
  }

  if (current.assistance === "HINT" || current.assistance === "STEP_BY_STEP" ||
      current.assistance === "TEACHER_SUPPORT") {
    return {
      level: "SUPPORTED_SUCCESS",
      reasonCodes: ["ASSISTANCE_RECORDED"],
      masteryMutation: "NONE",
    };
  }

  if (current.assistance !== "NONE") {
    return {
      level: "ATTEMPTED",
      reasonCodes: ["ASSISTANCE_UNKNOWN_OR_UNVERIFIED"],
      masteryMutation: "NONE",
    };
  }

  const currentTime = Date.parse(current.occurredAt);
  if (!Number.isFinite(currentTime)) {
    return {
      level: "ATTEMPTED",
      reasonCodes: ["INVALID_CURRENT_TIMESTAMP"],
      masteryMutation: "NONE",
    };
  }

  if (current.isTransferAssessment && current.specificationPointIds.length > 0) {
    const currentPoints = new Set(current.specificationPointIds);
    const hasQualifyingPrior = priorAttempts.some((prior) => {
      if (prior.attemptId === current.attemptId || prior.questionId === current.questionId) return false;
      if (prior.correct === null || prior.specificationPointIds.length === 0) return false;
      const priorTime = Date.parse(prior.occurredAt);
      if (!Number.isFinite(priorTime) || priorTime >= currentTime) return false;
      if (currentTime - priorTime < policy.minimumTransferDelayMs) return false;
      return prior.specificationPointIds.some((pointId) => currentPoints.has(pointId));
    });

    if (hasQualifyingPrior) {
      return {
        level: "TRANSFER_SUCCESS",
        reasonCodes: ["CORRECT_INDEPENDENT_TRANSFER_AFTER_DELAY"],
        masteryMutation: "NONE",
      };
    }
  }

  return {
    level: "INDEPENDENT_SUCCESS",
    reasonCodes: [
      "CORRECT_RESPONSE",
      ...(current.isTransferAssessment ? ["TRANSFER_GATE_NOT_MET"] : []),
    ],
    masteryMutation: "NONE",
  };
}
