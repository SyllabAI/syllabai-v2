/**
 * T-MIG-043 — the learner-me error classes (tranche-1 defined them in the
 * module barrel; tranche-2 moves the DEFINITIONS here so the NBA engine can
 * raise the 404 without a barrel cycle — the barrel re-exports keep every
 * existing import path working, byte-for-byte).
 *
 * Message-carrying; the route layer owns status mapping:
 *   LearnerMeNotFoundError     → 404 not_found (e.message verbatim)
 *   LearnerMeForbiddenError    → 403 forbidden
 *   LearnerMeNotImplementedError → 501 not_implemented (owning task id)
 */
export class LearnerMeNotFoundError extends Error {}
export class LearnerMeForbiddenError extends Error {}
export class LearnerMeNotImplementedError extends Error {}
