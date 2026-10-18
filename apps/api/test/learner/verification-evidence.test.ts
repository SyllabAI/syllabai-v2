import { describe, expect, test } from "bun:test";
import {
  classifyVerificationEvidence,
  type VerificationAttempt,
} from "../../src/services/learner-model/verification-evidence";

const DAY = 86_400_000;
const policy = { minimumTransferDelayMs: DAY };

function attempt(overrides: Partial<VerificationAttempt> = {}): VerificationAttempt {
  return {
    attemptId: "a-current",
    questionId: "q-current",
    occurredAt: "2026-10-10T12:00:00.000Z",
    correct: true,
    assistance: "NONE",
    answerExposedBeforeAttempt: false,
    isTransferAssessment: false,
    specificationPointIds: ["sp-1"],
    ...overrides,
  };
}

describe("verification-evidence proof of concept (not wired to mastery writes)", () => {
  test("wrong or ungraded response remains ATTEMPTED", () => {
    expect(classifyVerificationEvidence(attempt({ correct: false }), [], policy).level).toBe("ATTEMPTED");
    expect(classifyVerificationEvidence(attempt({ correct: null }), [], policy).level).toBe("ATTEMPTED");
  });

  test("a correct response after a hint is SUPPORTED_SUCCESS, not independent", () => {
    const result = classifyVerificationEvidence(attempt({ assistance: "HINT" }), [], policy);
    expect(result.level).toBe("SUPPORTED_SUCCESS");
    expect(result.masteryMutation).toBe("NONE");
  });

  test("answer exposure blocks independence even if assistance says NONE", () => {
    expect(classifyVerificationEvidence(
      attempt({ answerExposedBeforeAttempt: true }), [], policy,
    ).level).toBe("SUPPORTED_SUCCESS");
  });

  test("unknown assistance fails closed rather than inventing independent success", () => {
    const result = classifyVerificationEvidence(attempt({ assistance: "UNKNOWN" }), [], policy);
    expect(result.level).toBe("ATTEMPTED");
    expect(result.reasonCodes).toContain("ASSISTANCE_UNKNOWN_OR_UNVERIFIED");
  });

  test("clean correct response is independent, but never mutates mastery", () => {
    const result = classifyVerificationEvidence(attempt(), [], policy);
    expect(result.level).toBe("INDEPENDENT_SUCCESS");
    expect(result.masteryMutation).toBe("NONE");
  });

  test("transfer requires a different question, overlapping SpecificationPoint, and delay", () => {
    const prior = attempt({
      attemptId: "a-prior",
      questionId: "q-prior",
      occurredAt: "2026-10-08T12:00:00.000Z",
      correct: true,
      assistance: "HINT",
      isTransferAssessment: false,
    });
    const current = attempt({ isTransferAssessment: true });
    expect(classifyVerificationEvidence(current, [prior], policy).level).toBe("TRANSFER_SUCCESS");
    expect(classifyVerificationEvidence(
      current, [attempt({ ...prior, questionId: current.questionId })], policy,
    ).level).toBe("INDEPENDENT_SUCCESS");
    expect(classifyVerificationEvidence(
      current, [attempt({ ...prior, occurredAt: "2026-10-10T11:30:00.000Z" })], policy,
    ).level).toBe("INDEPENDENT_SUCCESS");
    expect(classifyVerificationEvidence(
      current, [attempt({ ...prior, specificationPointIds: ["sp-other"] })], policy,
    ).level).toBe("INDEPENDENT_SUCCESS");
  });

  test("does not treat a later-dated or ungraded prior row as transfer evidence", () => {
    const current = attempt({ isTransferAssessment: true });
    const future = attempt({
      attemptId: "a-future",
      questionId: "q-future",
      occurredAt: "2026-10-12T12:00:00.000Z",
    });
    const ungraded = attempt({
      attemptId: "a-ungraded",
      questionId: "q-ungraded",
      occurredAt: "2026-10-08T12:00:00.000Z",
      correct: null,
    });
    expect(classifyVerificationEvidence(current, [future, ungraded], policy).level).toBe("INDEPENDENT_SUCCESS");
  });

  test("missing SpecificationPoint anchors cannot produce transfer success", () => {
    const prior = attempt({
      attemptId: "a-prior",
      questionId: "q-prior",
      occurredAt: "2026-10-08T12:00:00.000Z",
    });
    expect(classifyVerificationEvidence(
      attempt({ isTransferAssessment: true, specificationPointIds: [] }),
      [prior],
      policy,
    ).level).toBe("INDEPENDENT_SUCCESS");
  });

  test("rejects invalid policy instead of silently weakening the gate", () => {
    expect(() => classifyVerificationEvidence(attempt(), [], { minimumTransferDelayMs: -1 }))
      .toThrow("minimumTransferDelayMs");
  });
});
