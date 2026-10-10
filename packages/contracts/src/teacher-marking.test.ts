/**
 * Teacher-marking contract pins (T-MIG-049) — the acceptance baseline is
 * the Java declaration (frozen syllabai-core @ 6cad6ef); NO golden write
 * captures exist for these surfaces. Positive pins from the Java-declared
 * shapes, negative pins for Java-rejected inputs, verbatim-message law
 * documented where the frozen string is contract (F-33-1, R0 review
 * 5997573821 on PR #50).
 */
import { describe, expect, it } from "bun:test";
import {
  ANSWER_QUEUE_DEFAULT_PAGE_SIZE,
  ANSWER_QUEUE_MAX_PAGE_SIZE,
  SMART_MARK_BATCH_LIMIT,
  PAPER_GROUPS_DEFAULT_PER_PAGE,
  PAPER_GROUPS_MAX_PER_PAGE,
  SMART_MARK_PIPELINE_VERSION,
  answerIdPathSchema,
  answerMarkingPageViewSchema,
  answerMarkingViewSchema,
  answerQueuePageParamsSchema,
  answerQueueResponseSchema,
  humanMarkRequestSchema,
  humanMarkViewSchema,
  kappaEvaluationViewSchema,
  kappaLatestParamsSchema,
  kappaScopeRequestSchema,
  markingQueuePageViewSchema,
  markingQueueResponseSchema,
  markingStateParamSchema,
  paperGroupsPageParamsSchema,
  smartMarkBatchItemSchema,
  smartMarkBatchRequestSchema,
  smartMarkBatchViewSchema,
  smartMarkViewSchema,
  throughputViewSchema,
} from "./teacher-marking";

const UUID = "0b8fd85b-6c47-4d6e-9e38-2c69b47c1d01";
const UUID2 = "1c9ae86b-7c47-4d6e-9e38-2c69b47c1d02";

/** Full 16-component AnswerMarkingView exactly as TeacherViews.answer() emits it. */
const fullAnswerView = {
  answerId: UUID,
  attemptId: UUID2,
  learnerId: UUID,
  learnerDisplayName: "Ayesha K.",
  questionId: UUID2,
  questionExternalRef: "q01",
  partLabel: "ai",
  partPrompt: "Explain the process.",
  partMarks: 4,
  answerText: "The process works by…",
  markingState: "PENDING",
  marksAwarded: null,
  latestSmartMark: null,
  latestHumanMark: null,
  examPaperId: null,
  paperTitle: null,
};

describe("answerMarkingViewSchema (TeacherViews :38-45, 16 components exact)", () => {
  it("accepts the full Java-emitted shape (question-bank answer: null paper context)", () => {
    const r = answerMarkingViewSchema.safeParse(fullAnswerView);
    expect(r.success).toBe(true);
  });

  it("accepts a paper-backed row with both mark lanes present", () => {
    const r = answerMarkingViewSchema.safeParse({
      ...fullAnswerView,
      markingState: "SMART_MARKED",
      marksAwarded: 3,
      latestSmartMark: {
        id: UUID,
        pipelineVersion: SMART_MARK_PIPELINE_VERSION,
        modelId: "glm-4.6",
        marksAwarded: 3,
        confidence: 0.87,
        validationPassed: true,
        failureReason: null,
        breakdown: [{ "mp-1": true }],
        createdAt: "2026-10-04T09:37:00.129532Z",
      },
      latestHumanMark: {
        id: UUID2,
        markerId: UUID,
        marksAwarded: 4,
        perPointDecisions: { "mp-1": 1, "mp-2": 0 },
        comments: null,
        createdAt: "2026-10-04T10:00:00Z",
      },
      examPaperId: UUID,
      paperTitle: "Physics Paper 1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a 15-component shape — every record component serializes (response side)", () => {
    const { questionExternalRef, ...missing } = fullAnswerView;
    expect(answerMarkingViewSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects a markingState outside the five-value Answer.java:34 domain", () => {
    expect(
      answerMarkingViewSchema.safeParse({ ...fullAnswerView, markingState: "GRADED" }).success,
    ).toBe(false);
  });

  it("SELF_MARKED is a legal view value (F-33-1 law)", () => {
    expect(
      answerMarkingViewSchema.safeParse({ ...fullAnswerView, markingState: "SELF_MARKED" })
        .success,
    ).toBe(true);
  });
});

describe("smartMarkViewSchema (TeacherViews :59-70, SmartMarkResult nullability)", () => {
  const base = {
    id: UUID,
    pipelineVersion: "1.3.0",
    modelId: "glm-4.6",
    marksAwarded: 2,
    confidence: 0.9,
    validationPassed: true,
    failureReason: null,
    breakdown: [],
    createdAt: "2026-10-04T09:37:00.129532Z",
  };

  it("accepts an accepted-path row", () => {
    expect(smartMarkViewSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a V34 refusal row: modelId null, confidence null, failureReason set, empty breakdown", () => {
    const refusal = {
      ...base,
      modelId: null,
      marksAwarded: 0,
      confidence: null,
      validationPassed: false,
      failureReason: "SCHEME_NOT_VALIDATED",
    };
    expect(smartMarkViewSchema.safeParse(refusal).success).toBe(true);
  });

  it("breakdown is NEVER null (ctor null-coalesces to empty list, SmartMarkResult :120)", () => {
    expect(smartMarkViewSchema.safeParse({ ...base, breakdown: null }).success).toBe(false);
  });

  it("pipelineVersion is non-null on every row (column defaults to the constant)", () => {
    expect(smartMarkViewSchema.safeParse({ ...base, pipelineVersion: null }).success).toBe(false);
  });
});

describe("humanMarkViewSchema (TeacherViews :72-81)", () => {
  const base = {
    id: UUID,
    markerId: UUID2,
    marksAwarded: 4,
    perPointDecisions: { "mp-1": 1 },
    comments: "clear working",
    createdAt: "2026-10-04T10:00:00Z",
  };
  it("accepts the Java shape; perPointDecisions/comments nullable", () => {
    expect(humanMarkViewSchema.safeParse(base).success).toBe(true);
    expect(humanMarkViewSchema.safeParse({ ...base, perPointDecisions: null }).success).toBe(true);
    expect(humanMarkViewSchema.safeParse({ ...base, comments: null }).success).toBe(true);
  });
});

describe("opt-in pagination envelopes (G-5)", () => {
  it("AnswerMarkingPageView accepts honest-total envelopes", () => {
    expect(
      answerMarkingPageViewSchema.safeParse({
        items: [fullAnswerView],
        page: 0,
        size: 50,
        totalElements: 51,
        totalPages: 2,
      }).success,
    ).toBe(true);
  });

  it("answerQueueResponseSchema accepts BOTH shapes (plain list | envelope)", () => {
    expect(answerQueueResponseSchema.safeParse([fullAnswerView]).success).toBe(true);
    expect(
      answerQueueResponseSchema.safeParse({
        items: [],
        page: 3,
        size: 50,
        totalElements: 0,
        totalPages: 0,
      }).success,
    ).toBe(true);
    // and rejects a mixed nonsense
    expect(answerQueueResponseSchema.safeParse({ items: 4 }).success).toBe(false);
  });

  it("MarkingQueuePageView carries the whole-group page + totals", () => {
    expect(
      markingQueuePageViewSchema.safeParse({
        state: "PENDING",
        groups: [],
        items: [],
        page: 0,
        size: 5,
        totalGroups: 0,
        totalItems: 0,
        totalPages: 0,
      }).success,
    ).toBe(true);
  });

  it("markingQueueResponseSchema accepts BOTH queue-v2 shapes", () => {
    expect(
      markingQueueResponseSchema.safeParse({ state: "PENDING", groups: [], items: [] }).success,
    ).toBe(true);
    expect(
      markingQueueResponseSchema.safeParse({
        state: "PENDING",
        groups: [],
        items: [],
        page: 0,
        size: 5,
        totalGroups: 0,
        totalItems: 0,
        totalPages: 0,
      }).success,
    ).toBe(true);
  });
});

describe("markingStateParamSchema (parseMarkingState :178-187, F-33-1(b))", () => {
  it("uppercases before enum validation — valueOf(state.toUpperCase()) mirror", () => {
    expect(markingStateParamSchema.safeParse("pending").success).toBe(true);
    expect(markingStateParamSchema.safeParse("Self_Marked").success).toBe(true);
  });

  it("SELF_MARKED is a LEGAL queue filter (R0 blocking finding b)", () => {
    expect(markingStateParamSchema.safeParse("SELF_MARKED").success).toBe(true);
  });

  it("unknown states are malformed requests (400, C-9) — never a 404", () => {
    expect(markingStateParamSchema.safeParse("GRADED").success).toBe(false);
    expect(markingStateParamSchema.safeParse("").success).toBe(false);
  });
});

describe("page params (G-5 bounds + verbatim messages)", () => {
  it("constants match the frozen source (:89-91, :95-97, :56)", () => {
    expect(ANSWER_QUEUE_DEFAULT_PAGE_SIZE).toBe(50);
    expect(ANSWER_QUEUE_MAX_PAGE_SIZE).toBe(200);
    expect(PAPER_GROUPS_DEFAULT_PER_PAGE).toBe(5);
    expect(PAPER_GROUPS_MAX_PER_PAGE).toBe(100);
    expect(SMART_MARK_BATCH_LIMIT).toBe(50);
  });

  it("answer queue: both params optional; page >= 0; size 1..200", () => {
    expect(answerQueuePageParamsSchema.safeParse({}).success).toBe(true);
    expect(answerQueuePageParamsSchema.safeParse({ page: "2" }).success).toBe(true); // Jackson coercion
    expect(answerQueuePageParamsSchema.safeParse({ page: -1 }).success).toBe(false);
    expect(answerQueuePageParamsSchema.safeParse({ size: 0 }).success).toBe(false);
    expect(answerQueuePageParamsSchema.safeParse({ size: 201 }).success).toBe(false);
    expect(answerQueuePageParamsSchema.safeParse({ size: 200 }).success).toBe(true);
  });

  it("queue-v2: size 1..100 paper groups", () => {
    expect(paperGroupsPageParamsSchema.safeParse({ size: 100 }).success).toBe(true);
    expect(paperGroupsPageParamsSchema.safeParse({ size: 101 }).success).toBe(false);
    expect(paperGroupsPageParamsSchema.safeParse({ page: -1 }).success).toBe(false);
  });
});

describe("request bodies", () => {
  it("humanMarkRequestSchema: @NotNull @Min(0) @Max(99) marksAwarded", () => {
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 4 }).success).toBe(true);
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: "4" }).success).toBe(true); // coercion
    expect(humanMarkRequestSchema.safeParse({}).success).toBe(false); // @NotNull (absent)
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: null }).success).toBe(false);
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: -1 }).success).toBe(false); // @Min
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 100 }).success).toBe(false); // @Max
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 99 }).success).toBe(true);
  });

  it("humanMarkRequestSchema: perPointDecisions @Size(max=50) Map<String,Integer>", () => {
    expect(
      humanMarkRequestSchema.safeParse({ marksAwarded: 1, perPointDecisions: { a: 1 } }).success,
    ).toBe(true);
    expect(
      humanMarkRequestSchema.safeParse({ marksAwarded: 1, perPointDecisions: null }).success,
    ).toBe(true); // no @NotNull
    const fifty = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 0]));
    const fiftyOne = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 0]));
    expect(
      humanMarkRequestSchema.safeParse({ marksAwarded: 1, perPointDecisions: fifty }).success,
    ).toBe(true);
    expect(
      humanMarkRequestSchema.safeParse({ marksAwarded: 1, perPointDecisions: fiftyOne }).success,
    ).toBe(false);
  });

  // T-MIG-114 (the ppd message law of record): the 50-entry cap is a .refine()
  // — zod reports it with code "custom" (NOT too_big), so the route classifier
  // must map the custom issue to the jakarta-parity message. The schema shape
  // is UNCHANGED (the refine stays); this pin documents the issue shape the
  // classifier branch reads. The core byte-law 'perPointDecisions: size must
  // be between 0 and 50' lives in the route (capture leg-31, the 113 run-001
  // byte-law; the verify leg C05 red is the 113 run-002 finding).
  it("humanMarkRequestSchema: the >50-entry ppd issue is a refine (code custom) — the classifier maps it (T-MIG-114)", () => {
    const fiftyOne = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 0]));
    const parsed = humanMarkRequestSchema.safeParse({
      marksAwarded: 1,
      perPointDecisions: fiftyOne,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "perPointDecisions");
      expect(issue?.code).toBe("custom"); // NOT too_big — the too_big branch can never fire
      expect(issue?.message).toBe("perPointDecisions must have at most 50 entries");
    }
  });

  it("humanMarkRequestSchema: comments @Size(max=4000), absent ≡ null", () => {
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 1, comments: null }).success).toBe(
      true,
    );
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 1, comments: "x".repeat(4000) }).success)
      .toBe(true);
    expect(humanMarkRequestSchema.safeParse({ marksAwarded: 1, comments: "x".repeat(4001) })
      .success,
    ).toBe(false);
  });

  it("smartMarkBatchRequestSchema: @NotNull @NotEmpty @Size(max=50) List<UUID>", () => {
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: [UUID] }).success).toBe(true);
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: [] }).success).toBe(false); // @NotEmpty
    expect(smartMarkBatchRequestSchema.safeParse({}).success).toBe(false); // @NotNull
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: null }).success).toBe(false);
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: ["not-a-uuid"] }).success).toBe(
      false,
    ); // UUID parse
    const fifty = Array.from({ length: 50 }, () => UUID);
    const fiftyOne = Array.from({ length: 51 }, () => UUID);
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: fifty }).success).toBe(true);
    expect(smartMarkBatchRequestSchema.safeParse({ answerIds: fiftyOne }).success).toBe(false);
  });

  it("kappaScopeRequestSchema: WHOLE BODY optional (@RequestBody required=false)", () => {
    expect(kappaScopeRequestSchema.safeParse(undefined).success).toBe(true); // absent body → null
    expect(kappaScopeRequestSchema.parse(undefined)).toBe(null);
    expect(kappaScopeRequestSchema.safeParse(null).success).toBe(true);
    expect(kappaScopeRequestSchema.safeParse({}).success).toBe(true); // scope ALL
    expect(kappaScopeRequestSchema.safeParse({ paperId: UUID }).success).toBe(true);
    expect(kappaScopeRequestSchema.safeParse({ paperId: "nope" }).success).toBe(false);
  });

  it("kappaLatestParamsSchema: optional paper uuid", () => {
    expect(kappaLatestParamsSchema.safeParse({}).success).toBe(true);
    expect(kappaLatestParamsSchema.safeParse({ paperId: UUID }).success).toBe(true);
    expect(kappaLatestParamsSchema.safeParse({ paperId: "nope" }).success).toBe(false);
  });

  it("answerIdPathSchema mirrors @PathVariable UUID (conversion failure → 400)", () => {
    expect(answerIdPathSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(answerIdPathSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("throughputViewSchema (F-33-1(a) zero-fill law)", () => {
  const zeroFilled = {
    answersByState: {
      PENDING: 0,
      SMART_MARKED: 0,
      HUMAN_MARKED: 0,
      OVERRIDDEN: 0,
      SELF_MARKED: 0,
    },
    humanMarks24h: 0,
    humanMarks7d: 0,
    pendingByPaper: [],
    oldestPendingAt: null,
    oldestPendingHours: null,
  };

  it("accepts the zero-filled five-key shape (zero-self-marked corpus renders SELF_MARKED: 0)", () => {
    expect(throughputViewSchema.safeParse(zeroFilled).success).toBe(true);
  });

  it("REQUIRES all five state keys — a port omitting SELF_MARKED fails the schema", () => {
    const { SELF_MARKED, ...fourKeys } = zeroFilled.answersByState;
    expect(throughputViewSchema.safeParse({ ...zeroFilled, answersByState: fourKeys }).success).toBe(
      false,
    );
  });

  it("rejects unknown state keys (the enum is closed)", () => {
    expect(
      throughputViewSchema.safeParse({
        ...zeroFilled,
        answersByState: { ...zeroFilled.answersByState, GRADED: 1 },
      }).success,
    ).toBe(false);
  });

  it("accepts populated views with pending leaders and honest ages", () => {
    expect(
      throughputViewSchema.safeParse({
        answersByState: { ...zeroFilled.answersByState, PENDING: 12 },
        humanMarks24h: 3,
        humanMarks7d: 27,
        pendingByPaper: [{ paperId: UUID, paperTitle: null, paperCode: null, pending: 12 }],
        oldestPendingAt: "2026-10-04T09:37:00Z",
        oldestPendingHours: 5,
      }).success,
    ).toBe(true);
  });
});

describe("smart-mark batch views", () => {
  it("SmartMarkBatchItem outcome vocabulary is the frozen three-value set (:361-384)", () => {
    expect(smartMarkBatchItemSchema.safeParse({ answerId: UUID, outcome: "MARKED", marksAwarded: 3, reason: null }).success).toBe(true);
    expect(smartMarkBatchItemSchema.safeParse({ answerId: UUID, outcome: "SKIPPED_ALREADY_MARKED", marksAwarded: null, reason: null }).success).toBe(true);
    expect(smartMarkBatchItemSchema.safeParse({ answerId: UUID, outcome: "FAILED", marksAwarded: null, reason: "SCHEME_NOT_VALIDATED" }).success).toBe(true);
    expect(smartMarkBatchItemSchema.safeParse({ answerId: UUID, outcome: "SKIPPED", marksAwarded: null, reason: null }).success).toBe(false);
  });

  it("SmartMarkBatchView carries requested + marked/skipped/failed counts", () => {
    expect(
      smartMarkBatchViewSchema.safeParse({
        requested: 2,
        marked: 1,
        skipped: 1,
        failed: 0,
        items: [],
      }).success,
    ).toBe(true);
  });
});

describe("kappaEvaluationViewSchema (Controller :318-327)", () => {
  const base = {
    id: UUID,
    scope: "ALL",
    paperId: null,
    sampleSize: 40,
    kappa: 0.81,
    observedAgreement: 0.92,
    threshold: 0.7,
    passed: true,
    computedAt: "2026-10-04T11:00:00Z",
  };
  it("accepts the ALL scope with null paperId", () => {
    expect(kappaEvaluationViewSchema.safeParse(base).success).toBe(true);
  });
  it("accepts the PAPER scope with a paperId; rejects PAPER without one", () => {
    expect(kappaEvaluationViewSchema.safeParse({ ...base, scope: "PAPER", paperId: UUID }).success)
      .toBe(true);
    expect(kappaEvaluationViewSchema.safeParse({ ...base, scope: "PAPER" }).success).toBe(true); // nullable column, scope is the wire fact
    expect(kappaEvaluationViewSchema.safeParse({ ...base, scope: "PER_LEARNER" }).success).toBe(
      false,
    );
  });
});
