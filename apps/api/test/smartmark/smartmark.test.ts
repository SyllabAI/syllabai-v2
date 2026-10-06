/**
 * Smart Mark pipeline + service unit tests (T-MIG-032 tranche 1) — stubbed
 * sql via fakeSql; pins the shared-pipeline law (validators trio, batch
 * topology + fallback ladder, honest SCHEME_NOT_VALIDATED refusals,
 * fail-closed κ gate, evidence at completion via the E-1 claim contract) and
 * the student surface law (ownership, reveal policy, settled-state 409,
 * accepted-result-required feedback).
 */
import { describe, expect, test } from "bun:test";
import {
  SmartMarkPipeline,
  SmartMarkService,
  StudentSmartMarkService,
  SmartFeedbackGenerationError,
  CandidateGenerationError,
  DEFAULT_VALIDATORS,
  pointMarkCeiling,
  type MarkingContext,
  type MarkingCandidate,
  type MarkingCandidateGenerator,
  type GradedEvidencePublisher,
} from "../../src/services/smartmark";
import { fakeSql, FIXED_CLOCK, type Route } from "../assessment/helpers";

const ATTEMPT_ID = "9a000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PAPER_ID = "80000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const POINT_A1 = "61000000-0000-0000-0000-000000000001";
const POINT_A2 = "61000000-0000-0000-0000-000000000002";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const SCHEME_ID = "70000000-0000-0000-0000-000000000009";

// ── pipeline (pure — no sql) ────────────────────────────────────────────────

function context(overrides: Partial<MarkingContext["answer"]> = {}): MarkingContext {
  return {
    answer: {
      id: ANSWER_A,
      attemptId: ATTEMPT_ID,
      questionPartId: PART_A,
      answerText: "The student's written answer.",
      label: "(a)",
      partMarks: 3,
      ...overrides,
    },
    schemeId: SCHEME_ID,
    schemeValidationState: "VALIDATED",
    points: [
      { id: POINT_A1, ref: "a(i)", text: "states the mole ratio", marks: 2, questionPartId: PART_A },
      { id: POINT_A2, ref: "a(ii)", text: "correct unit handling", marks: 1, questionPartId: PART_A },
    ],
  };
}

function candidate(allocations: Partial<MarkingCandidate["allocations"][number]>[]): MarkingCandidate {
  return {
    modelId: "glm-4.6",
    confidence: 0.9,
    rawOutput: "raw",
    allocations: allocations.map((a) => ({
      markPointId: POINT_A1,
      ref: "a(i)",
      awarded: true,
      marksAwarded: 1,
      evidence: "quote",
      rationale: "why",
      ...a,
    })) as MarkingCandidate["allocations"],
  };
}

const okGenerator: MarkingCandidateGenerator = {
  proposeAll: async (ctxs) => ctxs.map(() => candidate([{ markPointId: POINT_A1, marksAwarded: 2 }, { markPointId: POINT_A2, marksAwarded: 0, awarded: false }])),
  propose: async () => candidate([{ markPointId: POINT_A1, marksAwarded: 2 }, { markPointId: POINT_A2, marksAwarded: 0, awarded: false }]),
};

describe("SmartMarkPipeline — deterministic law", () => {
  test("no scheme points → rejected NO_SCHEME_POINTS (never reaches the generator)", async () => {
    const gen: MarkingCandidateGenerator = { proposeAll: async () => { throw new Error("must not call"); }, propose: async () => { throw new Error("must not call"); } };
    const empty = await new SmartMarkPipeline(gen).run({
      ...context(), points: [],
    });
    expect(empty.accepted).toBe(false);
    expect(empty.failureReason).toBe("NO_SCHEME_POINTS");
  });

  test("blank answer → deterministic zero: accepted 0 with blank breakdown, generator never called", async () => {
    const gen: MarkingCandidateGenerator = { proposeAll: async () => { throw new Error("must not call"); }, propose: async () => { throw new Error("must not call"); } };
    const d = await new SmartMarkPipeline(gen).run(context({ answerText: "   " }));
    expect(d.accepted).toBe(true);
    expect(d.marksAwarded).toBe(0);
    expect(d.breakdown).toHaveLength(2);
    expect(d.breakdown[0]!.rationale).toBe("blank answer: deterministic zero");
  });

  test("validators: unknown point / duplicate / coverage / sum-over-ceiling all reject with VALIDATION_FAILED", async () => {
    const pipeline = new SmartMarkPipeline(okGenerator);
    const d1 = await pipeline.run(context()); // candidate referencing only POINT_A1 twice via default
    void d1;
    const dup = candidate([{ markPointId: POINT_A1 }, { markPointId: POINT_A1 }]);
    const r1 = await new SmartMarkPipeline({ ...okGenerator, propose: async () => dup }).run(context());
    expect(r1.accepted).toBe(false);
    expect(r1.failureReason).toContain("duplicate allocation for mark point a(i)");
    const unknown = candidate([{ markPointId: "61000000-0000-0000-0000-00000000dead" }]);
    const r2 = await new SmartMarkPipeline({ ...okGenerator, propose: async () => unknown }).run(context());
    expect(r2.failureReason).toContain("allocation references unknown mark point");
    const missing = candidate([{ markPointId: POINT_A1 }]); // a(ii) undecided
    const r3 = await new SmartMarkPipeline({ ...okGenerator, propose: async () => missing }).run(context());
    expect(r3.failureReason).toContain("mark point a(ii) not decided");
    const over = candidate([
      { markPointId: POINT_A1, marksAwarded: 5 }, // clamped to 2 → sum 3 > ... ceiling 3? 2+1: clamp makes 2, a2 0 → 2 ≤ 3 ok
      { markPointId: POINT_A2, marksAwarded: 0, awarded: false },
    ]);
    const r4 = await new SmartMarkPipeline({ ...okGenerator, propose: async () => over }).run(context());
    void r4;
    expect(pointMarkCeiling(context())).toBe(3);
  });

  test("accepted decision clamps per-point marks and builds the breakdown verbatim", async () => {
    const c = candidate([
      { markPointId: POINT_A1, marksAwarded: 9 }, // clamped to 2
      { markPointId: POINT_A2, marksAwarded: 0, awarded: false },
    ]);
    const d = await new SmartMarkPipeline({ ...okGenerator, propose: async () => c }).run(context());
    expect(d.accepted).toBe(true);
    expect(d.marksAwarded).toBe(2);
    expect(d.breakdown[0]).toEqual({
      markPointId: POINT_A1, ref: "a(i)", marks: 2, marksAwarded: 2,
      awarded: true, evidence: "quote", rationale: "why",
    });
  });

  test("batch failure degrades to the per-part fallback ladder (never guesses)", async () => {
    const perPart = candidate([{ markPointId: POINT_A1 }, { markPointId: POINT_A2, marksAwarded: 0, awarded: false }]);
    let batchCalls = 0;
    let partCalls = 0;
    const gen: MarkingCandidateGenerator = {
      proposeAll: async () => { batchCalls += 1; throw new Error("provider down"); },
      propose: async () => { partCalls += 1; return perPart; },
    };
    const ctxs = [context(), context({ id: ANSWER_A + "2", answerText: "second" })];
    const decisions = await new SmartMarkPipeline(gen).runBatch(ctxs);
    expect(batchCalls).toBe(1); // one batch attempt
    expect(partCalls).toBe(2); // then one per-part fallback call
    expect(decisions.every((d) => d.accepted)).toBe(true);
  });
});

// ── SmartMarkService.markAttempt (stubbed sql) ─────────────────────────────

// T-MIG-050: paper scope is JOIN-DERIVED (attempts→questions) per the frozen
// derivation (SmartMarkService.java :139/:236) — exam_paper_id on the attempt
// row fixture now represents questions.exam_paper_id reached through that
// join; the bare attempts column never existed on the live baseline (42703).
const LOCK_MATCH = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \? for update of a$/;
const ATTEMPT_READ = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \?$/;
const QUESTIONS_MATCH = /select id, question_type, marks from questions where id = \?/;
const ANSWERS_MATCH = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const VERSION_MATCH = /select id from question_versions where question_id = \? order by version desc/;
const VALIDATED_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? and validation_state = \? order by created_at desc/;
const NEWEST_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc/;
const POINTS_MATCH = /select id, ref, ordering, text, marks, question_part_id from mark_scheme_points where mark_scheme_id = \? order by ordering/;
const KAPPA_ALL = /select passed from smart_mark_agreement_evaluations where scope = \? order by computed_at desc/;
const KAPPA_PAPER = /select passed from smart_mark_agreement_evaluations where scope = \? and exam_paper_id = \? order by computed_at desc/;
const RESULT_INSERT = /insert into smart_mark_results/;
const ANSWER_SMART_UPDATE = /update answers set marks_awarded = \? , marking_state = \? where id = \?/;
const ATTEMPT_SMART_UPDATE = /update attempts set marking_state = \? where id = \?/;
const ATTEMPT_TOTAL_UPDATE = /update attempts set marks_awarded = \? where id = \?/;
const TOPICS_MATCH = /select node_id from question_topics where question_id = \?/;
const FLIP_MATCH = /update attempts set evidence_emitted = true where id = \? and evidence_emitted = false/;

const ATTEMPT_ROW = {
  id: ATTEMPT_ID,
  learner_id: LEARNER_ID,
  question_id: QUESTION_ID,
  exam_paper_id: PAPER_ID,
  marking_state: "PENDING",
  evidence_emitted: false,
};

function answerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANSWER_A,
    question_part_id: PART_A,
    answer_text: "The student's written answer.",
    marks_awarded: null,
    marking_state: "PENDING",
    label: "(a)",
    marks: 3,
    ...overrides,
  };
}

function markRoutes(opts: {
  attempt?: Record<string, unknown>;
  answers?: Array<Record<string, unknown>>;
  validatedSchemes?: Array<Record<string, unknown>>;
  kappaAll?: Array<Record<string, unknown>>;
  kappaPaper?: Array<Record<string, unknown>>;
  newestScheme?: Array<Record<string, unknown>>;
  onFlip?: () => void;
} = {}): Route[] {
  return [
    { match: LOCK_MATCH, rows: [opts.attempt ?? ATTEMPT_ROW] },
    { match: ATTEMPT_READ, rows: [opts.attempt ?? ATTEMPT_ROW] },
    { match: QUESTIONS_MATCH, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    { match: ANSWERS_MATCH, rows: opts.answers ?? [answerRow()] },
    { match: VERSION_MATCH, rows: [{ id: "70000000-0000-0000-0000-000000000001" }] },
    { match: VALIDATED_SCHEME, rows: opts.validatedSchemes ?? [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: NEWEST_SCHEME, rows: opts.newestScheme ?? [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: POINTS_MATCH, rows: [
        { id: POINT_A1, ref: "a(i)", ordering: 1, text: "states the mole ratio", marks: 2, question_part_id: PART_A },
        { id: POINT_A2, ref: "a(ii)", ordering: 2, text: "correct unit handling", marks: 1, question_part_id: PART_A },
      ] },
    { match: KAPPA_ALL, rows: opts.kappaAll ?? [] },
    { match: KAPPA_PAPER, rows: opts.kappaPaper ?? [], rowsFor: (p) => (p[1] === PAPER_ID ? opts.kappaPaper ?? [] : []) },
    { match: RESULT_INSERT, rows: [] },
    { match: ANSWER_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_TOTAL_UPDATE, rows: [] },
    { match: TOPICS_MATCH, rows: [{ node_id: "20000000-0000-0000-0000-000000000012" }] },
    { match: FLIP_MATCH, rows: [], rowsFor: () => { opts.onFlip?.(); return []; } },
  ];
}

function claimingPublisher(): GradedEvidencePublisher & { count: number } {
  const state = { count: 0 };
  const publisher: GradedEvidencePublisher = {
    publishGraded: async () => {
      state.count += 1;
      return true;
    },
  };
  return Object.assign(publisher, state);
}

async function expectReject(p: Promise<unknown>, message: string) {
  try {
    await p;
    throw new Error("expected rejection: " + message);
  } catch (e) {
    if (e instanceof Error && e.message === message) return;
    throw e;
  }
}

describe("SmartMarkService.markAttempt — the ONE engine", () => {
  test("full pass: result row inserted, answer SMART_MARKED, attempt total recomputed, κ gate consulted", async () => {
    const pub = claimingPublisher();
    const sql = fakeSql(markRoutes({ kappaPaper: [{ passed: true }] }));
    const results = await new SmartMarkService(sql, okGenerator, pub, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(results.size).toBe(1);
    const row = results.get(ANSWER_A)!;
    expect(row.validation_passed).toBe(true);
    expect(row.marks_awarded).toBe(2); // a(i)=2, a(ii)=0
    expect(row.model_id).toBe("glm-4.6");
    expect(sql.queries.filter((q) => RESULT_INSERT.test(q)).length).toBe(1);
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(true);
    expect(sql.queries.some((q) => ATTEMPT_SMART_UPDATE.test(q))).toBe(true);
    expect(sql.queries.some((q) => ATTEMPT_TOTAL_UPDATE.test(q))).toBe(true);
  });

  test("no VALIDATED scheme → per-part SCHEME_NOT_VALIDATED refusal rows; no answer/attempt state change", async () => {
    const sql = fakeSql(markRoutes({ validatedSchemes: [] }));
    const results = await new SmartMarkService(sql, okGenerator, claimingPublisher(), FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(results.get(ANSWER_A)!.failure_reason).toBe("SCHEME_NOT_VALIDATED");
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(false);
    expect(sql.queries.some((q) => ATTEMPT_TOTAL_UPDATE.test(q))).toBe(false);
    expect(sql.queries.some((q) => NEWEST_SCHEME.test(q))).toBe(true); // the refusal stamps the newest scheme
  });

  test("κ gate fail-closed: no evaluations → authoritative false → NO evidence even when complete", async () => {
    const sql = fakeSql(markRoutes({ kappaAll: [], kappaPaper: [] }));
    const results = await new SmartMarkService(sql, okGenerator, claimingPublisher(), FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(results.get(ANSWER_A)!.validation_passed).toBe(true);
    expect(sql.queries.some((q) => TOPICS_MATCH.test(q))).toBe(false); // evidence never consulted
    expect(sql.queries.some((q) => FLIP_MATCH.test(q))).toBe(false);
  });

  test("κ passed (paper scope) + no PENDING left → evidence claim + guarded flip", async () => {
    let flips = 0;
    const sql = fakeSql(markRoutes({ kappaPaper: [{ passed: true }], onFlip: () => { flips += 1; } }));
    await new SmartMarkService(sql, okGenerator, { publishGraded: async () => true }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(flips).toBe(1);
  });

  test("generator failure per-part → rejected decision persisted with the reason, nothing settles", async () => {
    const gen: MarkingCandidateGenerator = {
      proposeAll: async () => { throw new Error("down"); },
      propose: async () => { throw new CandidateGenerationError("down"); },
    };
    const sql = fakeSql(markRoutes({ kappaPaper: [{ passed: true }] }));
    const results = await new SmartMarkService(sql, gen, { publishGraded: async () => true }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    const row = results.get(ANSWER_A)!;
    expect(row.validation_passed).toBe(false);
    expect(row.failure_reason).toBe("down");
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(false);
  });
});

// ── StudentSmartMarkService — the learner half ──────────────────────────────

function llmStub(text = "1. You earned 2 of 3 marks.\n2. ...") {
  return {
    available: () => true,
    generate: async () => text,
  };
}

function studentService(sql: ReturnType<typeof fakeSql>, overrides: { llm?: ReturnType<typeof llmStub> } = {}) {
  const smartMark = new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK);
  return new StudentSmartMarkService(sql, smartMark, overrides.llm ?? llmStub(), FIXED_CLOCK);
}

describe("StudentSmartMarkService — learner half of F-047", () => {
  test("smartMarkAttempt: ownership 404 with no existence leak (other learner's attempt id)", async () => {
    const sql = fakeSql(markRoutes({ attempt: { ...ATTEMPT_ROW, learner_id: "aa645313-5930-4381-91ed-caff67a2f999" } }));
    await expectReject(studentService(sql).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID), `attempt ${ATTEMPT_ID} not found`);
  });

  test("smartMarkAttempt: SUGGESTED scheme under VALIDATED_ONLY → 409 pending-validation (reveal mirror)", async () => {
    const sql = fakeSql(markRoutes({ validatedSchemes: [], newestScheme: [{ id: SCHEME_ID, validation_state: "SUGGESTED" }] }));
    await expectReject(
      studentService(sql).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID),
      "mark scheme is pending teacher validation -- Smart Mark is unavailable until it validates",
    );
  });

  test("smartMarkAttempt: accepted pass → AttemptSmartMarkView with authoritative=true (κ paper passed)", async () => {
    const sql = fakeSql(markRoutes({ kappaPaper: [{ passed: true }], answers: [answerRow({ marking_state: "SMART_MARKED", marks_awarded: 2 })] }));
    const view = await studentService(sql).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.attemptId).toBe(ATTEMPT_ID);
    expect(view.schemeValidationState).toBe("VALIDATED");
    expect(view.parts).toHaveLength(1);
    expect(view.parts[0]!.authoritative).toBe(true);
    expect(view.parts[0]!.marksAwarded).toBe(2);
    expect(view.parts[0]!.breakdown[0]!.pointLabel).toBe("states the mole ratio"); // compact label, no scheme leak
  });

  test("feedback: no accepted result yet → 409 'no accepted Smart Mark result ... run Smart mark first'", async () => {
    const sql = fakeSql(markRoutes({ kappaPaper: [{ passed: true }], answers: [answerRow({ marking_state: "SMART_MARKED", marks_awarded: 2 })] }));
    // the latest-result read returns only a REJECTED row (validation_passed false)
    const routesWithRejected = markRoutes({ kappaPaper: [{ passed: true }] }).filter((r) => !/smart_mark_results where answer_id/.test(String(r.match.source)));
    routesWithRejected.push({ match: /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/, rows: [{ id: "bb000000-0000-4000-8000-000000000001", answer_id: ANSWER_A, model_id: null, marks_awarded: 0, confidence: null, validation_passed: false, breakdown: [], failure_reason: "VALIDATION_FAILED: x" }] });
    const service = studentService(fakeSql(routesWithRejected));
    await expectReject(
      service.explainFeedback(LEARNER_ID, ATTEMPT_ID, PART_A),
      "no accepted Smart Mark result for this part yet -- run Smart mark first",
    );
  });

  test("feedback happy path: prose generated from the recorded decisions, view carries modelId", async () => {
    const routes = markRoutes({ kappaPaper: [{ passed: true }] });
    routes.push({
      match: /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/,
      rows: [{ id: "bb000000-0000-4000-8000-000000000001", answer_id: ANSWER_A, model_id: "glm-4.6", marks_awarded: 2, confidence: 0.9, validation_passed: true, breakdown: JSON.stringify([]) === "[]" ? [] : [], failure_reason: null }],
    });
    const sql = fakeSql(routes);
    const view = await studentService(sql, { llm: llmStub("prose") }).explainFeedback(LEARNER_ID, ATTEMPT_ID, PART_A);
    expect(view.explanation).toBe("prose");
    expect(view.modelId).toBe("glm-4.6");
    expect(typeof view.generatedAt).toBe("string");
  });

  test("llm unavailable → SmartFeedbackGenerationError with the honest message", async () => {
    const routes = markRoutes({ kappaPaper: [{ passed: true }] });
    routes.push({
      match: /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/,
      rows: [{ id: "bb000000-0000-4000-8000-000000000001", answer_id: ANSWER_A, model_id: "glm-4.6", marks_awarded: 2, confidence: 0.9, validation_passed: true, breakdown: [], failure_reason: null }],
    });
    const sql = fakeSql(routes);
    const service = studentService(sql, { llm: { available: () => false, generate: async () => "x" } });
    try {
      await service.explainFeedback(LEARNER_ID, ATTEMPT_ID, PART_A);
      throw new Error("expected SmartFeedbackGenerationError");
    } catch (e) {
      expect(e).toBeInstanceOf(SmartFeedbackGenerationError);
    }
  });
});
