/**
 * T-MIG-061 — intervention-run contract pins (frozen law @ 6cad6ef).
 * Pins the wire shapes against the frozen InterventionRunViews.java records:
 * the six-value status enum + the terminal() law, the RunView reconstruction
 * (nullable identity refs, the string[] jsonb projections, the step/evidence
 * arrays), the step/evidence sub-views, and the four request records with
 * their INERT @Size caps reproduced as cap-less nullish fields (the frozen
 * controller binds bare @RequestBody — no bean validation runs; disclosed
 * on the module header).
 */
import { describe, expect, test } from "bun:test";
import {
  INTERVENTION_RUN_STATUSES,
  interventionCompleteRequestSchema,
  interventionEvidenceRequestSchema,
  interventionEvidenceViewSchema,
  interventionResumeRequestSchema,
  interventionRunStatusSchema,
  interventionRunStatusTerminal,
  interventionRunViewSchema,
  interventionStepRequestSchema,
  interventionStepViewSchema,
} from "./intervention";

const RUN_ID = "aa000000-0000-4000-8000-000000000001";
const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SUBJECT = "cc000000-0000-4000-8000-000000000001";
const CV = "cc000000-0000-4000-8000-000000000002";
const STEP_ID = "dd000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "ee000000-0000-4000-8000-000000000001";
const NODE = "ff000000-0000-4000-8000-000000000001";
const T0 = "2026-10-06T08:00:00Z";
const T1 = "2026-10-06T09:00:00Z";

const validRun = {
  runId: RUN_ID,
  learnerId: LEARNER,
  subjectId: SUBJECT,
  curriculumVersionId: CV,
  status: "ACTIVE",
  origin: "NBA",
  targetSpecificationPoints: [NODE],
  questionPartIds: [],
  evidenceRefs: [],
  diagnosisSnapshotRef: "nba:nba-rules/v1.3:" + NODE + ":" + NODE + ":rank1:LOW_MASTERY",
  learnerStateSnapshotRef: "skill-state:" + NODE + ":a3:u1728205200000",
  diagnosisVersion: "nba-rules/v1.3",
  actionType: "PRACTISE_QUESTIONS",
  interventionVersion: "practice-intervention/v1",
  interventionHash: "a".repeat(64),
  allowedToolIds: ["get_specification_context", "get_learner_state", "start_practice"],
  terminalOutcome: null,
  currentStep: 2,
  createdAt: T0,
  startedAt: T0,
  completedAt: null,
  cancelledAt: null,
  steps: [
    {
      stepId: STEP_ID,
      sequenceNo: 0,
      status: "DONE",
      observationType: "practice_set_started",
      inputEvidenceRef: null,
      outputEvidenceRef: "attempt:11111111-0000-4000-8000-000000000001",
      blockedReason: null,
      startedAt: T0,
      completedAt: T1,
    },
  ],
  evidence: [
    {
      id: EVIDENCE_ID,
      evidenceRef: "attempt:11111111-0000-4000-8000-000000000001",
      role: "ATTEMPT_EVIDENCE",
      capturedAt: T1,
    },
  ],
};

describe("intervention contracts (frozen @ 6cad6ef)", () => {
  test("status enum is the closed six-value InterventionRunStatus list, in declaration order", () => {
    expect(INTERVENTION_RUN_STATUSES).toEqual([
      "CREATED",
      "ACTIVE",
      "PAUSED",
      "COMPLETED",
      "CANCELLED",
      "FAILED",
    ]);
    expect(interventionRunStatusSchema.safeParse("DONE").success).toBe(false);
    expect(interventionRunStatusSchema.safeParse("CANCELLED").success).toBe(true);
  });

  test("terminal law: COMPLETED/CANCELLED/FAILED only — CREATED/ACTIVE/PAUSED stay open", () => {
    expect(interventionRunStatusTerminal("COMPLETED")).toBe(true);
    expect(interventionRunStatusTerminal("CANCELLED")).toBe(true);
    expect(interventionRunStatusTerminal("FAILED")).toBe(true);
    expect(interventionRunStatusTerminal("CREATED")).toBe(false);
    expect(interventionRunStatusTerminal("ACTIVE")).toBe(false);
    expect(interventionRunStatusTerminal("PAUSED")).toBe(false);
  });

  test("RunView parses the full reconstruction (steps + evidence embedded)", () => {
    const r = interventionRunViewSchema.parse(validRun);
    expect(r.status).toBe("ACTIVE");
    expect(r.steps).toHaveLength(1);
    expect(r.evidence).toHaveLength(1);
    expect(r.targetSpecificationPoints).toEqual([NODE]);
  });

  test("RunView nullable identity laws: subject/version/snapshot refs and the four instants", () => {
    const nullable = interventionRunViewSchema.safeParse({
      ...validRun,
      subjectId: null,
      curriculumVersionId: null,
      diagnosisSnapshotRef: null,
      learnerStateSnapshotRef: null,
      diagnosisVersion: null,
      terminalOutcome: null,
      currentStep: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    });
    expect(nullable.success).toBe(true);
    const bad = interventionRunViewSchema.safeParse({ ...validRun, runId: "not-a-uuid" });
    expect(bad.success).toBe(false);
  });

  test("StepView: completedAt nullable, startedAt NOT (V26 started_at not null)", () => {
    const open = interventionStepViewSchema.safeParse({
      stepId: STEP_ID,
      sequenceNo: 0,
      status: "IN_PROGRESS",
      observationType: "practice_set_started",
      inputEvidenceRef: null,
      outputEvidenceRef: null,
      blockedReason: null,
      startedAt: T0,
      completedAt: null,
    });
    expect(open.success).toBe(true);
    const noStart = interventionStepViewSchema.safeParse({
      stepId: STEP_ID,
      sequenceNo: 0,
      status: "DONE",
      observationType: "x",
      inputEvidenceRef: null,
      outputEvidenceRef: null,
      blockedReason: null,
      startedAt: null,
      completedAt: null,
    });
    expect(noStart.success).toBe(false);
  });

  test("EvidenceView: four fields, capturedAt required", () => {
    const e = interventionEvidenceViewSchema.safeParse({
      id: EVIDENCE_ID,
      evidenceRef: "attempt:x",
      role: "ATTEMPT_EVIDENCE",
      capturedAt: T1,
    });
    expect(e.success).toBe(true);
    const noRole = interventionEvidenceViewSchema.safeParse({
      id: EVIDENCE_ID,
      evidenceRef: "attempt:x",
      capturedAt: T1,
    });
    expect(noRole.success).toBe(false);
  });

  test("request records: fields nullish (bare @RequestBody — the @Size caps are INERT, disclosed)", () => {
    // all four parse the empty object — v1 accepts a body of every-null fields
    // and lets the controller requireText laws reject the mandatory ones
    expect(interventionResumeRequestSchema.safeParse({}).success).toBe(true);
    expect(interventionStepRequestSchema.safeParse({}).success).toBe(true);
    expect(interventionEvidenceRequestSchema.safeParse({}).success).toBe(true);
    expect(interventionCompleteRequestSchema.safeParse({}).success).toBe(true);
    // the inert-cap parity: a 600-char evidenceRef parses (no @Size enforcement)
    const long = "x".repeat(600);
    expect(interventionEvidenceRequestSchema.safeParse({ evidenceRef: long }).success).toBe(true);
    // (unknown-key rejection is the ROUTE layer's malformed_body law — Jackson
    // binding, not the contract's; the zod default strips, the route pins)
  });
});
