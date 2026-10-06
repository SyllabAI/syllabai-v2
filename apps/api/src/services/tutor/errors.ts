/**
 * Tutor module errors — the shared.* exception laws the frozen tutor stack
 * relies on (T-MIG-060 tranche 1; frozen sources @ 6cad6ef).
 *
 *   - NotFoundException  (shared/NotFoundException.java): a foreign session id
 *     is INDISTINGUISHABLE from an unknown one — the message names the type
 *     and the id but carries no existence signal (TutorSessionService.java
 *     :276-279 `owned(...)`). Routes render 404.
 *   - ConflictException  (shared/ConflictException.java): the V53
 *     course-consistency law (TutorSessionService.java :225-259) and the R13
 *     per-learner session cap (:97-110). Routes render 409.
 *   - IllegalArgumentException: the blank-question guard (KaRagService.java
 *     :419-421) and the RRF k guard (ReciprocalRankFusion.java :31-33).
 *     Routes render 400 malformed.
 *   - TutorGenerationError: the ONLY generation-failure channel — every
 *     path throws with the FIXED client-safe text (GroundedTutorGenerator
 *     .UNAVAILABLE_MESSAGE :106-111, deep-audit 09-28 M2: upstream provider
 *     error bodies are untrusted third-party content and never reach a
 *     client body).
 */
export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/** GroundedTutorGenerator.UNAVAILABLE_MESSAGE :110-111 — verbatim. */
export const TUTOR_UNAVAILABLE_MESSAGE =
  "the tutor is temporarily unavailable — please try again shortly";

export class TutorGenerationError extends Error {
  constructor(message: string = TUTOR_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "TutorGenerationError";
  }
}
