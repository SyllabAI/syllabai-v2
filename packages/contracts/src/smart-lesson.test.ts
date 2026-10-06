/**
 * T-MIG-053 tranche-4 contract pins (r3a) — the Smart Lesson wire, frozen
 * laws @ 6cad6ef (SmartLessonView.java). The WIRE ITSELF was already ratified
 * in learner.ts (T-MIG-041's band pinned the SmartLessonView records in
 * advance — reuse-not-redeclare, the TS2308/F-034 law): this file pins the
 * smart-lesson-specific laws against THAT ratified module and adds no new
 * schema.
 *
 *   - the policy literal "smart-lesson/v2" is exact (:42);
 *   - the action/reason vocabularies are the full frozen enums (:45-73);
 *   - the honest diagnosis: mastery + effectiveMastery nullable, coverage
 *     the 3-state UNMEASURED|PARTIAL|ESTABLISHED (rejects band names — a
 *     measured fact, not a band, :94-104);
 *   - questionId nullable (ASK_TUTOR carries no starter question, :88);
 *   - prerequisite attempts nullable (unmeasured = honest gap, :117);
 *   - misconception probability nullable + remediationNodeCode nullable
 *     (no validated REMEDIATED_BY edge = no invented corrective, :125-127);
 *   - evidence facts are deterministic string pairs (:107-108).
 */
import { describe, expect, test } from "bun:test";
import {
  lessonActionViewSchema,
  SMART_LESSON_POLICY,
  smartLessonViewSchema,
  topicStatusViewSchema,
} from "./learner.js";

const UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = "2026-10-06T01:02:03Z";

const action = {
  actionType: "PRACTISE_QUESTIONS",
  reasonCode: "LOW_MASTERY",
  targetNodeId: UUID(10),
  targetCode: "4CH1-2.31",
  targetTitle: "pH and indicators",
  questionId: UUID(20),
  servableQuestionCount: 3,
  reasonDetail: "Measured mastery 0.25 over 4 attempts — keep practising 4CH1-2.31",
};

const status = {
  coverage: "ESTABLISHED",
  attempts: 4,
  mastery: 0.25,
  effectiveMastery: 0.21,
  reviewDue: false,
  strongestMisconceptionProbability: null,
  fluencyGap: null,
  tutorAsks: 0,
  servableQuestions: 3,
};

const view = {
  learnerId: UUID(1),
  rootId: UUID(2),
  topicNodeId: UUID(10),
  topicCode: "4CH1-2.31",
  topicTitle: "pH and indicators",
  asOf: T,
  policy: "smart-lesson/v2",
  action,
  topicStatus: status,
  prerequisites: [
    {
      nodeId: UUID(11),
      code: "4CH1-2.30",
      title: "Acids and alkalis",
      effectiveMastery: null,
      attempts: null,
      measuredWeak: false,
    },
  ],
  misconceptions: [
    {
      nodeId: UUID(12),
      code: "M-ACID-BASE",
      title: "Acids neutralise alkalis",
      probability: null,
      active: false,
      remediationNodeCode: null,
    },
  ],
  evidence: [
    { key: "topic", value: "4CH1-2.31 — pH and indicators" },
    { key: "attempts", value: "4" },
  ],
};

describe("smart-lesson contracts — the deterministic read model", () => {
  test("the policy literal is exact (smart-lesson/v2, :42)", () => {
    expect(SMART_LESSON_POLICY).toBe("smart-lesson/v2");
    expect(smartLessonViewSchema.safeParse({ ...view, policy: "smart-lesson/v1" }).success).toBeFalse();
    expect(smartLessonViewSchema.safeParse({ ...view, policy: "nba-rules/v1.3" }).success).toBeFalse();
  });

  test("the action + reason vocabularies are the full frozen enums (:45-73)", () => {
    expect(lessonActionViewSchema.shape.actionType.options).toEqual([
      "REMEDIATE_PREREQUISITE", "STUDY_CORRECTIVE", "ASK_TUTOR", "REVIEW_TOPIC",
      "TIMED_PRACTICE", "PRACTISE_QUESTIONS", "ADVANCE_TOPIC",
    ]);
    expect(lessonActionViewSchema.shape.reasonCode.options).toEqual([
      "PREREQUISITE_WEAK", "MISCONCEPTION_REMEDIATION", "MISCONCEPTION_SUSPECTED",
      "DUE_REVIEW", "FLUENCY_GAP", "LOW_MASTERY", "TUTOR_ENGAGED",
      "INSUFFICIENT_COVERAGE", "TOPIC_MASTERED",
    ]);
  });

  test("the honest diagnosis: coverage is 3-state measured facts, not bands (:94-104)", () => {
    expect(topicStatusViewSchema.parse({ ...status, coverage: "UNMEASURED", mastery: null, effectiveMastery: null, attempts: 0 }).coverage).toBe("UNMEASURED");
    expect(topicStatusViewSchema.parse({ ...status, coverage: "PARTIAL", attempts: 1 }).coverage).toBe("PARTIAL");
    // a mastery BAND name is not a coverage state — different vocabulary, §13.3
    // (the cross-field honesty — mastery null ⇔ UNMEASURED — is the SERVICE's
    // law, pinned in the service tests; the schema stays shape-level)
    expect(topicStatusViewSchema.safeParse({ ...status, coverage: "SECURE" }).success).toBeFalse();
    expect(topicStatusViewSchema.safeParse({ ...status, coverage: "MEASURED" }).success).toBeFalse();
  });

  test("ASK_TUTOR carries no starter question — questionId nullable (:88)", () => {
    expect(lessonActionViewSchema.parse({
      ...action, actionType: "ASK_TUTOR", reasonCode: "MISCONCEPTION_SUSPECTED", questionId: null,
    }).questionId).toBeNull();
    expect(lessonActionViewSchema.safeParse({ ...action, questionId: "not-a-uuid" }).success).toBeFalse();
  });

  test("prerequisite attempts nullable — the unmeasured honest gap (:117)", () => {
    const v = smartLessonViewSchema.parse(view);
    expect(v.prerequisites[0]!.attempts).toBeNull();
    expect(v.prerequisites[0]!.measuredWeak).toBe(false);
  });

  test("misconception probability + remediation both nullable (:125-127)", () => {
    const v = smartLessonViewSchema.parse(view);
    expect(v.misconceptions[0]!.probability).toBeNull();
    expect(v.misconceptions[0]!.remediationNodeCode).toBeNull();
  });

  test("evidence facts are deterministic string pairs (:107-108)", () => {
    const v = smartLessonViewSchema.parse(view);
    expect(v.evidence).toEqual([
      { key: "topic", value: "4CH1-2.31 — pH and indicators" },
      { key: "attempts", value: "4" },
    ]);
    expect(smartLessonViewSchema.safeParse({
      ...view, evidence: [{ key: "topic", value: 42 }],
    }).success).toBeFalse();
  });

  test("the root: asOf is the instant-string wire, policy literal strict", () => {
    const v = smartLessonViewSchema.parse(view);
    expect(v.asOf).toBe(T);
    // javaInstantSchema is the string-shaped instant wire (the assessment
    // precedent) — a non-string is the binding failure
    expect(smartLessonViewSchema.safeParse({ ...view, asOf: 42 }).success).toBeFalse();
  });
});
