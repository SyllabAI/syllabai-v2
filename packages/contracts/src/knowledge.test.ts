/**
 * Knowledge + coverage wire-contract pins (T-MIG-053 tranche 1) — the
 * schemas ported from NodeView/PrerequisiteView, ClassKnowledgeGraphViews,
 * LearnerKnowledgeGraphView and TeachingCoverageViews + the
 * TeachingCoverageController MarkRequest (frozen @ 6cad6ef). The parse/
 * wire LAWS (Status.parse/.wire, the 404-first node law, the idempotent
 * identical-re-mark no-op, the V39 spec-point gate) are SERVICE law —
 * they land in services/knowledge with their pin tests; this file pins
 * the SCHEMA law: constraints copied exactly, the Java record wins.
 */
import { describe, expect, test } from "bun:test";
import {
  classGraphNodeViewSchema,
  classGraphEdgeViewSchema,
  classKnowledgeGraphViewSchema,
  classNodeStudentViewSchema,
  classNodeStudentsViewSchema,
  coverageEventViewSchema,
  coverageMarkRequestSchema,
  coverageRowViewSchema,
  nodeViewSchema,
  prerequisiteViewSchema,
  studentEvidenceItemViewSchema,
  studentMisconceptionViewSchema,
} from "./knowledge.js";
import {
  learnerKnowledgeGraphViewSchema,
  nodeWithStateViewSchema,
} from "./learner.js";

const UUID_A = "0f0e0d0c-0b0a-4987-8675-4321fedcba98"; // version-field-pinned uuid
const UUID_B = "10203040-5060-4789-a0bc-def012345678";
const T = "2026-10-06T02:48:25.000Z";

describe("NodeView (KnowledgeController :17-46)", () => {
  test("flat projection: empty children, nullable description/provenance/applicability", () => {
    const flat = {
      id: UUID_A,
      code: "4CH1/1.2",
      type: "SUBTOPIC",
      title: "Titration calculations",
      description: null,
      validationStatus: "VALIDATED",
      provenance: null,
      applicability: { papers: ["1CH1"], tier: "foundation" },
      children: [],
    };
    expect(nodeViewSchema.safeParse(flat).success).toBeTrue();
  });

  test("recursive tree view parses nested children", () => {
    const tree = {
      id: UUID_A, code: "4CH1", type: "SUBJECT", title: "Chemistry",
      description: "root", validationStatus: "VALIDATED", provenance: "seed",
      applicability: null,
      children: [{
        id: UUID_B, code: "4CH1/1", type: "UNIT", title: "Unit 1",
        description: null, validationStatus: "SUGGESTED", provenance: null,
        applicability: null, children: [],
      }],
    };
    const r = nodeViewSchema.safeParse(tree);
    expect(r.success).toBeTrue();
  });

  test("rejects a node type outside the NodeType enum (incl. concept lowercase)", () => {
    expect(
      nodeViewSchema.safeParse({
        id: UUID_A, code: "x", type: "concept", title: "t", description: null,
        validationStatus: "UNVALIDATED", provenance: null, applicability: null,
        children: [],
      }).success
    ).toBeFalse();
  });
});

describe("PrerequisiteView", () => {
  test("depth 1 = direct; int required", () => {
    expect(
      prerequisiteViewSchema.safeParse({ id: UUID_A, code: "4CH1/1.1", type: "SUBTOPIC", title: "Moles", depth: 1 })
        .success
    ).toBeTrue();
    expect(
      prerequisiteViewSchema.safeParse({ id: UUID_A, code: "c", type: "TOPIC", title: "t", depth: 1.5 }).success
    ).toBeFalse();
  });
});

describe("ClassKnowledgeGraphView (F-072 heatmap, §13.3/§13.4)", () => {
  const node = {
    id: UUID_A, code: "4CH1/1.2", type: "SUBTOPIC", title: "Titration",
    description: null, childIds: [], coverageState: "unrecorded",
    specPoints: 1, recordedSpecPoints: 0, taughtSpecPoints: 0,
    learnersMeasured: 0, meanMastery: null, meanBand: "UNMEASURED",
    strugglingCount: 0, developingCount: 0, proficientCount: 0,
    attempts: 0, correctCount: 0, learnersWithActiveMisconception: 0,
  };

  test("unmeasured honesty: null mean/band + zero counts parse", () => {
    const view = {
      classId: UUID_B, className: "10A", rootId: UUID_A, rootCode: "4CH1",
      rootTitle: "Chemistry", learnersEnrolled: 0, asOf: T,
      nodes: [node], prerequisiteEdges: [],
    };
    expect(classKnowledgeGraphViewSchema.safeParse(view).success).toBeTrue();
  });

  test("coverageState is the 3-state honest vocabulary — 'unrecorded' allowed, 'maybe' not", () => {
    expect(classGraphNodeViewSchema.safeParse({ ...node, coverageState: "taught" }).success).toBeTrue();
    expect(classGraphNodeViewSchema.safeParse({ ...node, coverageState: "not-taught" }).success).toBeTrue();
    expect(classGraphNodeViewSchema.safeParse({ ...node, coverageState: "maybe" }).success).toBeFalse();
  });

  test("meanBand is the NEVER-null 4-state union (:504 default UNMEASURED, :528 bandOf)", () => {
    expect(classGraphNodeViewSchema.safeParse({ ...node, meanBand: "SECURE" }).success).toBeTrue();
    expect(classGraphNodeViewSchema.safeParse({ ...node, meanBand: "UNMEASURED" }).success).toBeTrue();
    expect(classGraphNodeViewSchema.safeParse({ ...node, meanBand: "GOLD" }).success).toBeFalse();
    expect(classGraphNodeViewSchema.safeParse({ ...node, meanBand: null }).success).toBeFalse();
  });

  test("prerequisite edge shape", () => {
    expect(
      classGraphEdgeViewSchema.safeParse({
        prerequisiteId: UUID_A, prerequisiteCode: "4CH1/1.1", nodeId: UUID_B, nodeCode: "4CH1/1.2",
      }).success
    ).toBeTrue();
  });
});

describe("ClassNodeStudentsView drill-down (TFA-07 §13.5)", () => {
  test("unmeasured student: null mastery/band + empty evidence, honestly", () => {
    const payload = {
      classId: UUID_B, className: "10A", rootId: UUID_A, nodeId: UUID_A,
      nodeCode: "4CH1/1.2", nodeTitle: "Titration", nodeType: "SUBTOPIC",
      coverageState: "unrecorded", learnersEnrolled: 1,
      strugglingCount: 0, developingCount: 0, proficientCount: 0, asOf: T,
      students: [{
        learnerId: UUID_B, displayName: "Ada", mastery: null,
        effectiveMastery: null, band: null, attempts: null, correctCount: null,
        lastPracticedAt: null, misconceptions: [], recentAttempts: [],
      }],
    };
    expect(classNodeStudentsViewSchema.safeParse(payload).success).toBeTrue();
    expect(classNodeStudentViewSchema.safeParse(payload.students[0]).success).toBeTrue();
  });

  test("evidence item: marksAwarded nullable, questionMarks required int", () => {
    const item = {
      attemptId: UUID_A, questionId: UUID_B, questionRef: "Q7", correct: false,
      marksAwarded: null, questionMarks: 3, markingState: "MARKED", createdAt: T,
    };
    expect(studentEvidenceItemViewSchema.safeParse(item).success).toBeTrue();
    expect(studentEvidenceItemViewSchema.safeParse({ ...item, questionMarks: 3.5 }).success).toBeFalse();
  });

  test("misconception estimate shape", () => {
    expect(
      studentMisconceptionViewSchema.safeParse({
        misconceptionNodeId: UUID_A, code: "M-1", title: "inverts ratio",
        probability: 0.73, active: true,
      }).success
    ).toBeTrue();
  });
});

describe("LearnerKnowledgeGraphView (F-034 via the class endpoint)", () => {
  test("unpractised node: null proficiency fields never zeros", () => {
    const view = {
      learnerId: UUID_B, rootId: UUID_A, rootCode: "4CH1", rootTitle: "Chemistry",
      asOf: T,
      nodes: [{
        id: UUID_A, code: "4CH1/1.2", type: "SUBTOPIC", title: "Titration",
        description: null, childIds: [], mastery: null, effectiveMastery: null,
        band: null, attempts: null, correctCount: null, lastPracticedAt: null,
        proceduralFluencyGap: null, reviewDueAt: null, reviewReason: null,
        misconceptionProbability: null, misconceptionActive: null,
        applicability: { papers: ["1CH1"] },
      }],
      prerequisiteEdges: [],
    };
    expect(learnerKnowledgeGraphViewSchema.safeParse(view).success).toBeTrue();
    expect(nodeWithStateViewSchema.safeParse(view.nodes[0]).success).toBeTrue();
  });
});

describe("TeachingCoverage wire (V52, TFA-03)", () => {
  test("CoverageRowView: status is the canonical wire form", () => {
    const row = {
      specPointNodeId: UUID_A, code: "4CH1/1.2", title: "Titration",
      status: "taught", markedBy: UUID_B, markedAt: T, note: null, firstMarkedAt: T,
    };
    expect(coverageRowViewSchema.safeParse(row).success).toBeTrue();
    expect(coverageRowViewSchema.safeParse({ ...row, status: "TAUGHT" }).success).toBeFalse();
  });

  test("CoverageEventView: previousStatus null on the trail's first event", () => {
    const ev = { status: "taught", previousStatus: null, actorId: UUID_B, note: "covered in W2", createdAt: T };
    expect(coverageEventViewSchema.safeParse(ev).success).toBeTrue();
    expect(
      coverageEventViewSchema.safeParse({ ...ev, previousStatus: "not-taught" }).success
    ).toBeTrue();
  });

  test("MarkRequest: @NotBlank status + @Size(max 500) optional note (exact)", () => {
    expect(coverageMarkRequestSchema.safeParse({ status: "taught" }).success).toBeTrue();
    expect(coverageMarkRequestSchema.safeParse({ status: "taught", note: "ok" }).success).toBeTrue();
    expect(coverageMarkRequestSchema.safeParse({ status: "", note: null }).success).toBeFalse();
    expect(
      coverageMarkRequestSchema.safeParse({ status: "taught", note: "x".repeat(501) }).success
    ).toBeFalse();
  });
});
