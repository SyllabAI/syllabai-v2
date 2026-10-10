/**
 * Teacher marking service unit tests (T-MIG-033 tranche 1) — stubbed sql via
 * fakeSql (+ a test-local param-capturing wrapper). Pins the frozen law
 * @ 6cad6ef: the per-answer Smart Mark topology (lock-first, V34 refusal,
 * kappa-gated authoritative, evidence settle rule), the human-mark law
 * (lock-first, part-bound 409, override vs first mark, evidence completion),
 * the kappa pairing law (newest-run-then-filter, clampBinary, degenerate
 * convention), the deterministic queue ordering (section-7), the honest
 * throughput counts, and the bounded batch outcomes.
 */
import { describe, expect, test } from "bun:test";
import {
  buildTeacherMarkingModule,
  cohenKappa,
  parseMarkingState,
  type MarkingQueueItem,
  type MarkingQueuePageView,
  type TeacherMarkingModule,
} from "../../src/services/teachermarking";
import type { GradedEvidencePublisher, SubmitClock } from "../../src/services/selfmark";
import type { MarkingContext, MarkingCandidateGenerator } from "../../src/services/smartmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures ────────────────────────────────────────────────────────────────

const ATTEMPT_ID = "b0000000-0000-4000-8000-000000000001";
const ATTEMPT2_ID = "b0000000-0000-4000-8000-000000000002";
const LEARNER_ID = "aa000000-0000-4000-8000-000000000001";
const QUESTION_ID = "c0000000-0000-4000-8000-000000000001";
const PAPER_ID = "d0000000-0000-4000-8000-000000000001";
const PAPER2_ID = "d0000000-0000-4000-8000-000000000002";
const PART_A = "60000000-0000-4000-8000-000000000001";
const PART_B = "60000000-0000-4000-8000-000000000002";
const POINT_A1 = "61000000-0000-4000-8000-000000000001";
const POINT_A2 = "61000000-0000-4000-8000-000000000002";
const POINT_B1 = "61000000-0000-4000-8000-000000000003";
const ANSWER_A = "e0000000-0000-4000-8000-000000000001";
const ANSWER_B = "e0000000-0000-4000-8000-000000000002";
const ANSWER_C = "e0000000-0000-4000-8000-000000000003";
const ANSWER_U = "e0000000-0000-4000-8000-000000000009";
const FOURTH = "e0000000-0000-4000-8000-000000000004";
const ATTEMPT3_ID = "b0000000-0000-4000-8000-000000000003";
const SCHEME_ID = "70000000-0000-4000-8000-000000000009";
const SCHEME_SUGGESTED_ID = "70000000-0000-4000-8000-000000000008";
const MARKER_ID = "f0000000-0000-4000-8000-000000000001";
const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const T3 = "2026-10-03T10:00:00Z";

let NOW = new Date("2026-10-05T07:45:00Z");
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};

function spyPublisher(): GradedEvidencePublisher & {
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    publishGraded: async (event) => {
      calls.push(event as Record<string, unknown>);
      return true;
    },
  };
}

/**
 * fakeSql + parameter capture (test-local): the shared helper records the
 * rendered text; the wrapper additionally records every bind-parameter list
 * so tests can pin params (kappa inserts, countSince windows, any() ids).
 */
function spySql(routes: Route[]) {
  const inner = fakeSql(routes);
  const paramsLog: unknown[][] = [];
  const wrapped = (strings: TemplateStringsArray, ...params: unknown[]) => {
    paramsLog.push(params);
    return inner(strings, ...params);
  };
  return Object.assign(wrapped, {
    queries: inner.queries,
    paramsLog,
  });
}

/** Full findWithPartAndAttempt-graph row (the alias shape teachermarking selects). */
function answerRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: ANSWER_A,
    attempt_id: ATTEMPT_ID,
    answer_text: "The student's written answer.",
    marks_awarded: null,
    marking_state: "PENDING",
    question_part_id: PART_A,
    label: "(a)",
    prompt: "Explain the observation.",
    part_marks: 3,
    learner_id: LEARNER_ID,
    attempt_created_at: T1,
    evidence_emitted: false,
    question_id: QUESTION_ID,
    external_ref: "q01-abc",
    exam_paper_id: PAPER_ID,
    question_marks: 5,
    ...overrides,
  };
}

const ATTEMPT_LOCK = {
  id: ATTEMPT_ID,
  learner_id: LEARNER_ID,
  question_id: QUESTION_ID,
  exam_paper_id: PAPER_ID,
  marking_state: "PENDING",
  evidence_emitted: false,
};

const POINT_ROWS = [
  { id: POINT_A1, ref: "a(i)", ordering: 0, text: "states the mole ratio", marks: 2, question_part_id: PART_A },
  { id: POINT_A2, ref: "a(ii)", ordering: 1, text: "correct unit handling", marks: 1, question_part_id: PART_A },
  { id: POINT_B1, ref: "b(i)", ordering: 2, text: "other part point", marks: 2, question_part_id: PART_B },
];

function okGenerator(): MarkingCandidateGenerator & { contexts: MarkingContext[] } {
  const contexts: MarkingContext[] = [];
  const respond = (ctx: MarkingContext) => ({
    modelId: "glm-4.6",
    confidence: 0.9,
    rawOutput: "raw",
    allocations: ctx.points.map((p, i) => ({
      markPointId: p.id,
      ref: p.ref,
      awarded: i === 0,
      marksAwarded: i === 0 ? p.marks : 0,
      evidence: "quote",
      rationale: "why",
    })),
  });
  return {
    contexts,
    proposeAll: async (ctxs) => {
      contexts.push(...ctxs);
      return ctxs.map(respond);
    },
    propose: async (ctx) => {
      contexts.push(ctx);
      return respond(ctx);
    },
  };
}

/** The full route set for a happy-path markAnswer on ANSWER_A (kappa released). */
function markAnswerRoutes(overrides: {
  kappaPassed?: boolean;
  reRead?: Array<Record<string, unknown>>;
} = {}): Route[] {
  return [
    {
      match: /select a\.attempt_id from answers a where a\.id = \?$/,
      rows: [{ attempt_id: ATTEMPT_ID }],
    },
    { match: /from attempts where id = \? for update$/, rows: [ATTEMPT_LOCK] },
    {
      match: /from answers ans join question_parts/,
      rows: [],
      rowsFor: (params) => {
        const id = String(params[0]);
        if (id === ANSWER_A) return [answerRow()];
        if (id === ANSWER_B) return [answerRow({ id: ANSWER_B, question_part_id: PART_B, label: "(b)" })];
        if (id === ANSWER_C) return [answerRow({ id: ANSWER_C, exam_paper_id: PAPER2_ID })];
        if (id === ANSWER_U) return [answerRow({ id: ANSWER_U, exam_paper_id: null })];
        return [];
      },
    },
    { match: /select id from question_versions/, rows: [{ id: "v1" }] },
    {
      match: /select id, validation_state from mark_schemes where question_version_id = \? and validation_state = \?/,
      rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }],
    },
    { match: /from mark_points/, rows: POINT_ROWS },
    { match: /insert into smart_mark_results/, rows: [] },
    { match: /update answers set/, rows: [] },
    { match: /update attempts set marking_state/, rows: [] },
    {
      match: /select id, marks_awarded, marking_state from answers/,
      rows: overrides.reRead ?? [
        { id: ANSWER_A, marks_awarded: 2, marking_state: "SMART_MARKED" },
        { id: ANSWER_B, marks_awarded: 3, marking_state: "HUMAN_MARKED" },
      ],
    },
    { match: /update attempts set marks_awarded/, rows: [] },
    {
      match: /select passed from smart_mark_agreement_evaluations/,
      rows: [{ passed: overrides.kappaPassed ?? true }],
    },
    { match: /select node_id from question_topics/, rows: [{ node_id: "n1" }, { node_id: "n2" }] },
    { match: /update attempts set evidence_emitted/, rows: [] },
    { match: /insert into human_marks/, rows: [] },
  ];
}

function build(routes: Route[], publisher = spyPublisher(), generator = okGenerator()) {
  const sql = spySql(routes);
  const module: TeacherMarkingModule = buildTeacherMarkingModule(sql, generator, publisher, clock);
  return { sql, module, publisher, generator };
}

// ── parseMarkingState (C-9) ─────────────────────────────────────────────────

describe("parseMarkingState", () => {
  test("accepts the four states case-insensitively", () => {
    expect(parseMarkingState("pending")).toBe("PENDING");
    expect(parseMarkingState("SMART_MARKED")).toBe("SMART_MARKED");
    expect(parseMarkingState("human_marked")).toBe("HUMAN_MARKED");
    expect(parseMarkingState("Overridden")).toBe("OVERRIDDEN");
  });

  test("SELF_MARKED is a legal queue filter (F-33-1(b) pin — frozen valueOf accepts the five-value enum)", () => {
    expect(parseMarkingState("SELF_MARKED")).toBe("SELF_MARKED");
    expect(parseMarkingState("self_marked")).toBe("SELF_MARKED");
  });

  test("unknown filter is a 400 bad_request with the verbatim body, never a 404", () => {
    expect(() => parseMarkingState("BOGUS")).toThrow(
      "unknown marking state: BOGUS (expected PENDING, SMART_MARKED, HUMAN_MARKED or OVERRIDDEN)");
  });
});

// ── cohenKappa (pure law) ───────────────────────────────────────────────────

describe("cohenKappa", () => {
  test("perfect agreement = 1; total disagreement = -1 (expected < 1, real law); degenerate → 0", () => {
    expect(cohenKappa([[1, 1], [0, 0]]).kappa).toBe(1);
    // complete disagreement with mixed marginals: observed 0, expected 0.5 → -1
    expect(cohenKappa([[1, 0], [0, 1]]).kappa).toBe(-1);
    // one rater always awards, the other never: observed 0, expected 0 → κ 0
    expect(cohenKappa([[1, 0], [1, 0]]).kappa).toBe(0);
    // degenerate guard: perfect agreement with chance agreement ≈ 1 → κ 1
    expect(cohenKappa([[1, 1], [1, 1]]).kappa).toBe(1);
  });

  test("mid agreement follows the (observed - expected) / (1 - expected) law", () => {
    const s = cohenKappa([[1, 1], [1, 0], [0, 1], [0, 0]]);
    expect(s.sampleSize).toBe(4);
    expect(s.observedAgreement).toBe(0.5);
    expect(s.kappa).toBeCloseTo(0);
  });

  test("empty pairs and non-binary decisions are rejected", () => {
    expect(() => cohenKappa([])).toThrow("kappa requires at least one paired decision");
    expect(() => cohenKappa([[2, 1]])).toThrow("decisions must be binary 0/1 pairs");
    expect(() => cohenKappa([[1] as unknown as [number, number]])).toThrow(
      "decisions must be binary 0/1 pairs");
  });
});

// ── TeacherSmartMarkService.markAnswer (per-answer topology) ───────────────

describe("markAnswer — per-answer Smart Mark topology", () => {
  test("unknown answer 404 before any state load", async () => {
    const { module } = build([
      { match: /select a\.attempt_id from answers a where a\.id = \?$/, rows: [] },
    ]);
    await expect(module.teacherSmartMark.markAnswer(ANSWER_A)).rejects.toThrow("answer");
  });

  test("gate order: attempt_id lookup, then attempt row lock, then the answer graph", async () => {
    const { module, sql } = build(markAnswerRoutes());
    await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(sql.queries[0]).toContain("select a.attempt_id from answers");
    expect(sql.queries[1]).toContain("from attempts where id = ? for update");
    expect(sql.queries[2]).toContain("from answers ans join question_parts");
  });

  test("happy path: result row saved, provisional marks applied, total recomputed with correct", async () => {
    const { module, sql } = build(markAnswerRoutes());
    const result = await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(result.validation_passed).toBe(true);
    expect(result.marks_awarded).toBe(2);
    expect(result.model_id).toBe("glm-4.6");
    const insertIdx = sql.queries.findIndex((q) => q.includes("insert into smart_mark_results"));
    expect(insertIdx).toBeGreaterThan(0);
    expect(sql.queries.some((q) => q.includes("update answers set"))).toBeTrue();
    // recompute pins recordTotalMarks law: total 5, correct true, attempt id
    const totalIdx = sql.queries.findIndex((q) => q.includes("update attempts set marks_awarded"));
    expect(sql.paramsLog[totalIdx]![0]).toBe(5);
    expect(sql.paramsLog[totalIdx]![1]).toBe(true);
    expect(sql.paramsLog[totalIdx]![2]).toBe(ATTEMPT_ID);
  });

  test("kappa gate released + attempt complete → evidence fired with the faithful payload", async () => {
    const { module, publisher } = build(markAnswerRoutes());
    await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(publisher.calls.length).toBe(1);
    const event = publisher.calls[0]!;
    expect(event.attemptId).toBe(ATTEMPT_ID);
    expect(event.marksAwarded).toBe(5);
    expect(event.marksTotal).toBe(5);
    expect(event.correct).toBe(true);
    expect(event.secondaryTopicNodeIds).toEqual(["n1", "n2"]);
  });

  test("kappa gate NOT passed → provisional (state applied, evidence never fired)", async () => {
    const { module, publisher, sql } = build(markAnswerRoutes({ kappaPassed: false }));
    const result = await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(result.validation_passed).toBe(true);
    expect(publisher.calls.length).toBe(0);
    expect(sql.queries.some((q) => q.includes("update attempts set evidence_emitted"))).toBeFalse();
  });

  test("attempt still has a PENDING part → evidence waits (authoritative but incomplete)", async () => {
    const { module, publisher } = build(
      markAnswerRoutes({
        reRead: [
          { id: ANSWER_A, marks_awarded: 2, marking_state: "SMART_MARKED" },
          { id: ANSWER_B, marks_awarded: null, marking_state: "PENDING" },
        ],
      }),
    );
    await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(publisher.calls.length).toBe(0);
  });

  test("V34 refusal: newest scheme stamped, nothing marked, no evidence", async () => {
    const routes = markAnswerRoutes().map((r) =>
      r.match.source.includes("and validation_state") ? { ...r, rows: [] } : r,
    );
    routes.splice(4, 0, {
      match: /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc$/,
      rows: [{ id: SCHEME_SUGGESTED_ID, validation_state: "SUGGESTED" }],
    });
    const { module, publisher, sql } = build(routes);
    const result = await module.teacherSmartMark.markAnswer(ANSWER_A);
    expect(result.validation_passed).toBeFalse();
    expect(result.failure_reason).toBe("SCHEME_NOT_VALIDATED");
    expect(result.marks_awarded).toBe(0);
    const insert = sql.queries.findIndex((q) => q.includes("insert into smart_mark_results"));
    expect(insert).toBeGreaterThan(0);
    expect(sql.queries.some((q) => q.includes("update answers set"))).toBeFalse();
    expect(publisher.calls.length).toBe(0);
  });

  test("no scheme row at all → 404 mark scheme", async () => {
    const routes = markAnswerRoutes().map((r) =>
      r.match.source.includes("and validation_state") ? { ...r, rows: [] } : r,
    );
    routes.splice(4, 0, {
      match: /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc$/,
      rows: [],
    });
    const { module } = build(routes);
    await expect(module.teacherSmartMark.markAnswer(ANSWER_A)).rejects.toThrow("mark scheme");
  });

  test("in-scope point filter: only the answer's part points reach the pipeline", async () => {
    const { module, generator } = build(markAnswerRoutes());
    await module.teacherSmartMark.markAnswer(ANSWER_A);
    const ctx = generator.contexts[0]!;
    expect(ctx.points.map((p) => p.id)).toEqual([POINT_A1, POINT_A2]);
    expect(ctx.schemeId).toBe(SCHEME_ID);
    expect(ctx.answer.partMarks).toBe(3);
  });
});

// ── TeacherMarkingService.recordHumanMark ───────────────────────────────────

describe("recordHumanMark — the authoritative mark law", () => {
  test("unknown answer / unknown attempt 404s in gate order", async () => {
    const { module } = build([
      { match: /select a\.attempt_id from answers a where a\.id = \?$/, rows: [] },
    ]);
    await expect(module.marking.recordHumanMark(ANSWER_A, MARKER_ID, 2, null, null))
      .rejects.toThrow("answer");

    const { module: m2 } = build([
      { match: /select a\.attempt_id from answers a where a\.id = \?$/, rows: [{ attempt_id: ATTEMPT_ID }] },
      { match: /from attempts where id = \? for update$/, rows: [] },
    ]);
    await expect(m2.marking.recordHumanMark(ANSWER_A, MARKER_ID, 2, null, null))
      .rejects.toThrow("attempt");
  });

  test("part bound: 409 with the verbatim en-dash body; bound=0 admits 0", async () => {
    const { module } = build(markAnswerRoutes());
    await expect(module.marking.recordHumanMark(ANSWER_A, MARKER_ID, 4, null, null))
      .rejects.toThrow("marks 4 outside part bound 0–3");
    await expect(module.marking.recordHumanMark(ANSWER_A, MARKER_ID, -1, null, null))
      .rejects.toThrow("marks -1 outside part bound 0–3");
    const routes = markAnswerRoutes();
    const zeroBound = routes.map((r) =>
      r.match.source.includes("from answers ans join")
        ? { ...r, rows: [answerRow({ part_marks: 0 })] }
        : r,
    );
    const { module: m2 } = build(zeroBound);
    const view = await m2.marking.recordHumanMark(ANSWER_A, MARKER_ID, 0, null, null);
    expect(view.marksAwarded).toBe(0);
  });

  test("first authoritative mark that completes the attempt fires evidence once", async () => {
    const { module, publisher, sql } = build(
      markAnswerRoutes({
        reRead: [
          { id: ANSWER_A, marks_awarded: 2, marking_state: "HUMAN_MARKED" },
          { id: ANSWER_B, marks_awarded: 3, marking_state: "HUMAN_MARKED" },
        ],
      }),
    );
    const view = await module.marking.recordHumanMark(ANSWER_A, MARKER_ID, 2, { [POINT_A1]: 1 }, "good");
    expect(view.marksAwarded).toBe(2);
    expect(view.perPointDecisions).toEqual({ [POINT_A1]: 1 });
    // answers → HUMAN_MARKED, attempts → HUMAN_MARKED (revising=false) — via params
    const answerUpdate = sql.queries.findIndex((q) => q.includes("update answers set"));
    expect(sql.paramsLog[answerUpdate]).toContain("HUMAN_MARKED");
    const attemptStateIdx = sql.queries.findIndex((q) => q.includes("update attempts set marking_state"));
    expect(sql.paramsLog[attemptStateIdx]).toContain("HUMAN_MARKED");
    // evidence with the faithful payload (total 5 / marks 5 → correct)
    expect(publisher.calls.length).toBe(1);
    expect(publisher.calls[0]!.marksAwarded).toBe(5);
    expect(publisher.calls[0]!.marksTotal).toBe(5);
    expect(publisher.calls[0]!.correct).toBe(true);
    expect(sql.queries.some((q) => q.includes("update attempts set evidence_emitted"))).toBeTrue();
    expect(sql.queries.some((q) => q.includes("insert into human_marks"))).toBeTrue();
  });

  test("revising mark (evidence already emitted) → OVERRIDDEN, never re-fires evidence", async () => {
    const routes = markAnswerRoutes({
      reRead: [
        { id: ANSWER_A, marks_awarded: 2, marking_state: "OVERRIDDEN" },
        { id: ANSWER_B, marks_awarded: 3, marking_state: "HUMAN_MARKED" },
      ],
    });
    const lockRoute = routes.find((r) => r.match.source.includes("for update"))!;
    lockRoute.rows = [{ ...ATTEMPT_LOCK, evidence_emitted: true }];
    const { module, publisher, sql } = build(routes);
    await module.marking.recordHumanMark(ANSWER_A, MARKER_ID, 2, null, null);
    const attemptStateIdx = sql.queries.findIndex((q) => q.includes("update attempts set marking_state"));
    expect(sql.paramsLog[attemptStateIdx]).toContain("OVERRIDDEN");
    expect(publisher.calls.length).toBe(0);
    expect(sql.queries.some((q) => q.includes("update attempts set evidence_emitted"))).toBeFalse();
  });

  test("evidence waits while any part stays PENDING (multi-part attempt)", async () => {
    const { module, publisher } = build(
      markAnswerRoutes({
        reRead: [
          { id: ANSWER_A, marks_awarded: 2, marking_state: "HUMAN_MARKED" },
          { id: ANSWER_B, marks_awarded: null, marking_state: "PENDING" },
        ],
      }),
    );
    await module.marking.recordHumanMark(ANSWER_A, MARKER_ID, 2, null, null);
    expect(publisher.calls.length).toBe(0);
  });
});

// ── evaluateAgreement (kappa pairing law) ───────────────────────────────────

const VALID_RUN = {
  id: "r1",
  answer_id: ANSWER_A,
  model_id: "glm-4.6",
  marks_awarded: 2,
  confidence: 0.9,
  validation_passed: true,
  breakdown: [
    { markPointId: POINT_A1, ref: "a(i)", marks: 2, marksAwarded: 2, awarded: true, evidence: "e", rationale: "r" },
    { markPointId: POINT_A2, ref: "a(ii)", marks: 1, marksAwarded: 0, awarded: false, evidence: "e", rationale: "r" },
  ],
  failure_reason: null,
  created_at: T1,
};

function kappaRoutes(humanRows: Array<Record<string, unknown>>, smartRows: Array<Record<string, unknown>>): Route[] {
  return [
    {
      match: /select id, answer_id, marker_id, marks_awarded, per_point_decisions,\s*comments, created_at\s*from human_marks order by created_at asc/,
      rows: humanRows,
    },
    {
      match: /select h\.id, h\.answer_id/,
      rows: humanRows,
    },
    {
      match: /from smart_mark_results where answer_id = \? order by created_at desc limit 1/,
      rows: [],
      rowsFor: (params) => (String(params[0]) === ANSWER_A ? smartRows.slice(0, 1) : []),
    },
    { match: /insert into smart_mark_agreement_evaluations/, rows: [] },
  ];
}

const HUMAN_MARK_ROW = {
  id: "h1",
  answer_id: ANSWER_A,
  marker_id: MARKER_ID,
  marks_awarded: 2,
  per_point_decisions: { [POINT_A1]: 1, [POINT_A2]: 0 },
  comments: null,
  created_at: T1,
};

describe("evaluateAgreement — pairing, scoping, persistence", () => {
  test("pairs the newest VALIDATED run with the human decisions; scope ALL; kappa 1", async () => {
    const { module, sql } = build(kappaRoutes([HUMAN_MARK_ROW], [VALID_RUN]));
    const view = await module.marking.evaluateAgreement(null, MARKER_ID);
    expect(view.scope).toBe("ALL");
    expect(view.paperId).toBeNull();
    expect(view.sampleSize).toBe(2);
    expect(view.kappa).toBe(1);
    expect(view.passed).toBe(true);
    expect(view.threshold).toBe(0.6);
    const insertIdx = sql.queries.findIndex((q) => q.includes("insert into smart_mark_agreement_evaluations"));
    expect(insertIdx).toBeGreaterThan(0);
    const params = sql.paramsLog[insertIdx]!;
    expect(params[1]).toBe("ALL");
    expect(params[2]).toBeNull();
    expect(params[3]).toBe(2);
    expect(params[7]).toBe(true);
  });

  test("newest run only: a non-validated newest run is skipped even if older runs passed", async () => {
    const stale = { ...VALID_RUN, id: "r2", validation_passed: false, created_at: T2 };
    const { module } = build(kappaRoutes([HUMAN_MARK_ROW], [stale, VALID_RUN]));
    await expect(module.marking.evaluateAgreement(null, MARKER_ID)).rejects.toThrow(
      "no paired smart/human mark-point decisions available for κ evaluation");
  });

  test("marks without point-level decisions cannot pair (documented skip)", async () => {
    const { module } = build(
      kappaRoutes([{ ...HUMAN_MARK_ROW, per_point_decisions: null }], [VALID_RUN]),
    );
    await expect(module.marking.evaluateAgreement(null, MARKER_ID)).rejects.toThrow(
      "no paired smart/human mark-point decisions available for κ evaluation");
  });

  test("human decisions clamp binary (5 → 1) and unpaired points drop", async () => {
    const clampRow = { ...HUMAN_MARK_ROW, per_point_decisions: { [POINT_A1]: 5, [POINT_B1]: 1 } };
    const { module, sql } = build(kappaRoutes([clampRow], [VALID_RUN]));
    const view = await module.marking.evaluateAgreement(null, MARKER_ID);
    expect(view.sampleSize).toBe(1);
    expect(view.kappa).toBe(1);
    const insertIdx = sql.queries.findIndex((q) => q.includes("insert into smart_mark_agreement_evaluations"));
    expect(sql.paramsLog[insertIdx]![3]).toBe(1);
  });

  test("paper scope joins through the answer's question; scope + paperId persist", async () => {
    const { module, sql } = build(kappaRoutes([HUMAN_MARK_ROW], [VALID_RUN]));
    const view = await module.marking.evaluateAgreement(PAPER_ID, MARKER_ID);
    expect(view.scope).toBe("PAPER");
    expect(view.paperId).toBe(PAPER_ID);
    expect(sql.queries[0]).toContain("where q.exam_paper_id = ?");
    const insertIdx = sql.queries.findIndex((q) => q.includes("insert into smart_mark_agreement_evaluations"));
    expect(sql.paramsLog[insertIdx]![1]).toBe("PAPER");
    expect(sql.paramsLog[insertIdx]![2]).toBe(PAPER_ID);
  });

  test("empty sample → 409 (kappa is never invented)", async () => {
    const { module } = build(kappaRoutes([], [VALID_RUN]));
    await expect(module.marking.evaluateAgreement(null, MARKER_ID)).rejects.toThrow(
      "no paired smart/human mark-point decisions available for κ evaluation");
  });
});

// ── TeacherMarkingQueueService — deterministic ordering law ─────────────────

function queueAnswers(): Array<Record<string, unknown>> {
  return [
    // paper P1, attempt 1 (oldest): parts (b) then (a) — within-paper label order
    answerRow({ id: ANSWER_A, attempt_id: ATTEMPT_ID, attempt_created_at: T1, label: "(b)", question_part_id: PART_B }),
    answerRow({ id: ANSWER_B, attempt_id: ATTEMPT_ID, attempt_created_at: T1, label: "(a)", question_part_id: PART_A }),
    // paper P2, newer attempt
    answerRow({ id: ANSWER_C, attempt_id: ATTEMPT2_ID, attempt_created_at: T2, exam_paper_id: PAPER2_ID, learner_id: LEARNER_ID }),
    // unfiled (question-bank) answer — newest but must group LAST
    answerRow({ id: ANSWER_U, attempt_id: "b0000000-0000-4000-8000-000000000003", attempt_created_at: T3, exam_paper_id: null, question_id: "c0000000-0000-4000-8000-000000000002" }),
  ];
}

function queueRoutes(rows: Array<Record<string, unknown>>): Route[] {
  return [
    {
      match: /from answers ans join question_parts/,
      rows: [],
      rowsFor: (params) => {
        const state = String(params[0]);
        return state === "PENDING" ? rows : [];
      },
    },
    {
      match: /from exam_papers where id = any/,
      rows: [],
      rowsFor: (params) => {
        const ids = params[0] as string[];
        return [
          { id: PAPER_ID, title: "Physics Paper 1", session_label: "May/June 2026", paper_code: "0625/12" },
          { id: PAPER2_ID, title: "Chemistry Paper 2", session_label: "May/June 2026", paper_code: "0620/22" },
        ].filter((p) => ids.includes(p.id));
      },
    },
    { match: /from smart_mark_results where answer_id = any/, rows: [] },
    { match: /from human_marks where answer_id = any/, rows: [] },
    {
      match: /from users where id = any/,
      rows: [{ id: LEARNER_ID, display_name: "Ada" }],
    },
  ];
}

describe("markingQueue — section-7 ordering + batching", () => {
  test("groups: oldest-waiting paper first, unfiled bucket LAST; within-paper label order; chain across groups", async () => {
    const { module } = build(queueRoutes(queueAnswers()));
    const view = await module.queue.markingQueue("PENDING");
    expect(view.state).toBe("PENDING");
    expect(view.groups.map((g) => g.paperId)).toEqual([PAPER_ID, PAPER2_ID, null]);
    expect(view.groups[0]!.paperTitle).toBe("Physics Paper 1");
    expect(view.groups[0]!.count).toBe(2);
    expect(view.groups[2]!.paperId).toBeNull();
    expect(view.groups[2]!.paperTitle).toBeNull();
    // within the first paper: (a) before (b) — same attempt, label order
    expect(view.items.map((i: MarkingQueueItem) => i.answer.answerId)).toEqual([
      ANSWER_B, ANSWER_A, ANSWER_C, ANSWER_U,
    ]);
    // mark→next chain across the whole ordered queue, null on the last item
    expect(view.items[0]!.nextAnswerId).toBe(ANSWER_A);
    expect(view.items[2]!.nextAnswerId).toBe(ANSWER_U);
    expect(view.items[3]!.nextAnswerId).toBeNull();
  });

  test("group tie on oldest timestamp → the bigger group first; unfiled still last", async () => {
    const rows = [
      answerRow({ id: ANSWER_U, attempt_id: "b0000000-0000-4000-8000-000000000003", attempt_created_at: T1, exam_paper_id: null }),
      answerRow({ id: ANSWER_A, attempt_created_at: T1 }),
      answerRow({ id: ANSWER_B, attempt_created_at: T1, question_part_id: PART_B, label: "(b)" }),
    ];
    const { module } = build(queueRoutes(rows));
    const view = await module.queue.markingQueue("PENDING");
    expect(view.groups.map((g) => g.paperId)).toEqual([PAPER_ID, null]);
    expect(view.groups[0]!.count).toBe(2);
  });

  test("oldest-waiting hours floor to whole hours; future timestamps render null", async () => {
    const { module } = build(queueRoutes([
      answerRow({ id: ANSWER_A, attempt_created_at: "2026-10-05T05:15:00Z" }), // 2.5h before NOW
    ]));
    const view = await module.queue.markingQueue("PENDING");
    expect(view.groups[0]!.oldestWaitingHours).toBe(2);
    NOW = new Date("2026-09-01T00:00:00Z"); // make the timestamp future relative to the clock
    const { module: m2 } = build(queueRoutes([
      answerRow({ id: ANSWER_A, attempt_created_at: "2099-01-01T00:00:00Z" }),
    ]));
    const future = await m2.queue.markingQueue("PENDING");
    expect(future.groups[0]!.oldestWaitingHours).toBeNull();
    NOW = new Date("2026-10-05T07:45:00Z"); // restore
  });

  test("batched lookups: exactly one queue query + one paper + one smart + one human + one identity lookup", async () => {
    const { module, sql } = build(queueRoutes(queueAnswers()));
    await module.queue.markingQueue("PENDING");
    const count = (re: RegExp) => sql.queries.filter((q) => re.test(q)).length;
    expect(count(/from exam_papers where id = any/)).toBe(1);
    expect(count(/from smart_mark_results where answer_id = any/)).toBe(1);
    expect(count(/from human_marks where answer_id = any/)).toBe(1);
    expect(count(/from users where id = any/)).toBe(1);
  });

  test("latest smart/human per answer: oldest-first overwrite keeps the newest; names first-wins", async () => {
    const routes = queueRoutes(queueAnswers());
    routes.splice(2, 0, {
      match: /from smart_mark_results where answer_id = any/,
      rows: [
        { id: "old", answer_id: ANSWER_A, model_id: "m-old", marks_awarded: 1, confidence: 0.5, validation_passed: true, breakdown: [], failure_reason: null, created_at: T1 },
        { id: "new", answer_id: ANSWER_A, model_id: "m-new", marks_awarded: 2, confidence: 0.9, validation_passed: true, breakdown: [], failure_reason: null, created_at: T2 },
      ],
    });
    const { module } = build(routes);
    const view = await module.queue.markingQueue("PENDING");
    const itemA = view.items.find((i) => i.answer.answerId === ANSWER_A)!;
    expect(itemA.answer.latestSmartMark!.modelId).toBe("m-new");
    expect(itemA.answer.learnerDisplayName).toBe("Ada");
  });
});

describe("markingQueuePaged — G-5 whole-paper-group pagination", () => {
  function pagedRoutes(): Route[] {
    const rows = [
      ...queueAnswers(),
      answerRow({ id: FOURTH, attempt_id: ATTEMPT3_ID, attempt_created_at: T2, exam_paper_id: PAPER_ID }),
    ]; // groups: P1(3), P2(1), null(1) — P1 items: (a),(b),fourth; P2: C; unfiled: U
    return queueRoutes(rows);
  }

  test("page bounds: page < 0 and size out of 1..100 are 400s with verbatim bodies", async () => {
    const { module } = build(pagedRoutes());
    await expect(module.queue.markingQueuePaged("PENDING", -1, null)).rejects.toThrow("page must be >= 0");
    await expect(module.queue.markingQueuePaged("PENDING", null, 101)).rejects.toThrow(
      "size must be between 1 and 100 (paper groups per page)");
  });

  test("whole paper groups per page; the mark→next chain restarts inside the page", async () => {
    const { module } = build(pagedRoutes());
    const page = (await module.queue.markingQueuePaged("PENDING", 0, 2)) as MarkingQueuePageView;
    // groups: P1(3 items), P2(1), null(1) — page 0 carries the WHOLE first two groups
    expect(page.groups.map((g) => g.paperId)).toEqual([PAPER_ID, PAPER2_ID]);
    expect(page.items.map((i) => i.answer.answerId)).toEqual([ANSWER_B, ANSWER_A, FOURTH, ANSWER_C]);
    expect(page.items[0]!.nextAnswerId).toBe(ANSWER_A);
    expect(page.items[2]!.nextAnswerId).toBe(ANSWER_C);
    expect(page.items[3]!.nextAnswerId).toBeNull(); // no off-page links
    expect(page.totalGroups).toBe(3);
    expect(page.totalItems).toBe(5);
    expect(page.totalPages).toBe(2);
  });

  test("past-the-end page is honestly empty with the real totals", async () => {
    const { module } = build(pagedRoutes());
    const page = (await module.queue.markingQueuePaged("PENDING", 9, 2)) as MarkingQueuePageView;
    expect(page.groups).toEqual([]);
    expect(page.items).toEqual([]);
    expect(page.totalGroups).toBe(3);
    expect(page.totalPages).toBe(2);
  });

  test("no page/size params → the unchanged full view (compatibility surface)", async () => {
    const { module } = build(pagedRoutes());
    const full = await module.queue.markingQueuePaged("PENDING", null, null);
    expect(full.groups.length).toBe(3);
    expect(full.items[full.items.length - 1]!.nextAnswerId).toBeNull();
  });
});

// ── throughput — honest counts ───────────────────────────────────────────────

describe("throughput", () => {
  test("zeroes every state then applies the grouped counts; windows use the exact since bounds", async () => {
    const routes: Route[] = [
      {
        match: /from answers ans join question_parts/,
        rows: [],
        rowsFor: (params) => (String(params[0]) === "PENDING" ? [answerRow()] : []),
      },
      {
        match: /select marking_state, count\(\*\) as count from answers group by marking_state/,
        rows: [
          { marking_state: "PENDING", count: "5" },
          { marking_state: "SMART_MARKED", count: "1" },
        ],
      },
      { match: /from exam_papers where id = any/, rows: [{ id: PAPER_ID, title: "Physics Paper 1", session_label: null, paper_code: "0625/12" }] },
      { match: /select count\(\*\) as count from human_marks where created_at >= \?/, rows: [{ count: "3" }] },
    ];
    const { module, sql } = build(routes);
    const view = await module.queue.throughput();
    expect(view.answersByState).toEqual({
      PENDING: 5,
      SMART_MARKED: 1,
      HUMAN_MARKED: 0,
      OVERRIDDEN: 0,
      SELF_MARKED: 0, // F-33-1(a) pin — the frozen zero-fill renders all FIVE states (Answer.java:34)
    });
    expect(view.humanMarks24h).toBe(3);
    expect(view.humanMarks7d).toBe(3);
    const sinceParams = sql.paramsLog
      .map((p, i) => (sql.queries[i]!.includes("where created_at >= ?") ? p[0] : null))
      .filter((v): v is string => v !== null);
    expect(sinceParams.length).toBe(2);
    const nowMs = NOW.getTime();
    expect(Date.parse(sinceParams[0]!)).toBe(nowMs - 24 * 3_600_000);
    expect(Date.parse(sinceParams[1]!)).toBe(nowMs - 7 * 24 * 3_600_000);
    // leaders: count desc, key asc; oldest pending age floors
    expect(view.pendingByPaper).toEqual([
      { paperId: PAPER_ID, paperTitle: "Physics Paper 1", paperCode: "0625/12", pending: 1 },
    ]);
    // value equality, not wire format (instant serialization is the route tranche's law)
    expect(new Date(view.oldestPendingAt!).getTime()).toBe(Date.parse(T1));
  });

  test("empty pending queue → null oldest age and no leaders, never invented numbers", async () => {
    const routes: Route[] = [
      { match: /from answers ans join question_parts/, rows: [] },
      { match: /select marking_state, count\(\*\) as count from answers group by marking_state/, rows: [] },
      { match: /select count\(\*\) as count from human_marks where created_at >= \?/, rows: [{ count: 0 }] },
    ];
    const { module } = build(routes);
    const view = await module.queue.throughput();
    expect(view.pendingByPaper).toEqual([]);
    expect(view.oldestPendingAt).toBeNull();
    expect(view.oldestPendingHours).toBeNull();
    expect(view.answersByState).toEqual({ PENDING: 0, SMART_MARKED: 0, HUMAN_MARKED: 0, OVERRIDDEN: 0, SELF_MARKED: 0 }); // F-33-1(a): five-key zero-fill even on an empty corpus
  });
});

// ── answerById — the detail projection law (T-MIG-114) ──────────────────────

describe("answerById — the detail projection law (T-MIG-114)", () => {
  // The live driver hands the jsonb per_point_decisions column as a STRING
  // (the normalizeBreakdown driver law); the frozen core serves the HYDRATED
  // map on the detail read (HumanMarkRepository.findLatest selects the full
  // entity; TeacherViews.HumanMarkView.from renders the Map field — source
  // first-hand at 6cad6ef; the capture leg-35 body of record IS the map, and
  // the 113 run-002 red was v2's raw string vs that map). The detail read
  // must render the hydrated map; null stays null (the D04 both-sides-null
  // law). The POST echo is a different path (recordHumanMark returns the
  // parsed INPUT) and is pinned separately by the recordHumanMark tests.
  function answerByIdRoutes(humanRow: Record<string, unknown>): Route[] {
    return [
      {
        match: /from answers ans join question_parts/,
        rows: [answerRow()],
      },
      { match: /from smart_mark_results where answer_id = \?/, rows: [] },
      { match: /from human_marks where answer_id = \?/, rows: [humanRow] },
      { match: /from users where id = \?/, rows: [{ id: LEARNER_ID, display_name: "Ada" }] },
    ];
  }

  const markRow = (perPointDecisions: unknown) => ({
    id: "f1000000-0000-4000-8000-000000000001",
    answer_id: ANSWER_A,
    marker_id: MARKER_ID,
    marks_awarded: 2,
    per_point_decisions: perPointDecisions,
    comments: "probe mark: full credit part (a)",
    created_at: T1,
  });

  test("stringified jsonb renders the HYDRATED map on latestHumanMark (the core wire law)", async () => {
    const { module } = build(answerByIdRoutes(markRow(JSON.stringify({ [POINT_A1]: 1, [POINT_A2]: 0 }))));
    const view = await module.queue.answerById(ANSWER_A);
    expect(view).not.toBeNull();
    expect(view!.latestHumanMark!.perPointDecisions).toEqual({ [POINT_A1]: 1, [POINT_A2]: 0 });
  });

  test("parsed-object jsonb renders unchanged; null stays null (the D04 law)", async () => {
    const parsedRoutes = answerByIdRoutes(markRow({ [POINT_A1]: 1 }));
    const { module } = build(parsedRoutes);
    const view = await module.queue.answerById(ANSWER_A);
    expect(view!.latestHumanMark!.perPointDecisions).toEqual({ [POINT_A1]: 1 });

    const { module: m2 } = build(answerByIdRoutes(markRow(null)));
    const v2 = await m2.queue.answerById(ANSWER_A);
    expect(v2!.latestHumanMark!.perPointDecisions).toBeNull();
  });

  test("no human mark at all → latestHumanMark null (the pre-mark detail law)", async () => {
    const routes = answerByIdRoutes(markRow(null));
    routes[2] = { match: /from human_marks where answer_id = \?/, rows: [] };
    const { module } = build(routes);
    const view = await module.queue.answerById(ANSWER_A);
    expect(view!.latestHumanMark).toBeNull();
  });
});

// ── smartMarkBatch — bounded, idempotent, partial-success-preserving ─────────

describe("smartMarkBatch", () => {
  test("empty batch is a 400 with the verbatim body", async () => {
    const { module } = build([]);
    await expect(module.queue.smartMarkBatch([])).rejects.toThrow("answerIds must not be empty");
  });

  test("dedup is order-preserving; over-limit unique ids are a 400 with the verbatim body", async () => {
    const currentRoute: Route = {
      match: /select id, marking_state, marks_awarded from answers where id = any/,
      rows: [answerRow(), answerRow({ id: ANSWER_B, marking_state: "SMART_MARKED", marks_awarded: 2 })],
    };
    const { module: m2, sql } = build([...markAnswerRoutes(), currentRoute]);
    const view = await m2.queue.smartMarkBatch([ANSWER_A, ANSWER_A, ANSWER_B]);
    expect(view.requested).toBe(2); // deduplicated, order preserved
    const bigIds = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await expect(m2.queue.smartMarkBatch(bigIds)).rejects.toThrow(
      "batch too large: 51 > 50 — dispatch smaller batches");
  });

  test("outcomes: not-found FAILED, non-PENDING SKIPPED, accepted run MARKED", async () => {
    const currentRoute: Route = {
      match: /select id, marking_state, marks_awarded from answers where id = any/,
      rows: [
        answerRow(), // ANSWER_A — PENDING → pipeline runs
        answerRow({ id: ANSWER_B, marking_state: "SMART_MARKED", marks_awarded: 2 }),
        answerRow({ id: ANSWER_C, marking_state: "HUMAN_MARKED", marks_awarded: 3 }),
      ],
    };
    const { module } = build([...markAnswerRoutes(), currentRoute]);
    const view = await module.queue.smartMarkBatch([
      "00000000-0000-4000-8000-0000000000ff", // missing
      ANSWER_B, // non-PENDING
      ANSWER_A, // PENDING → pipeline accepts
    ]);
    expect(view.requested).toBe(3);
    expect(view.items[0]).toEqual({
      answerId: "00000000-0000-4000-8000-0000000000ff",
      outcome: "FAILED",
      marksAwarded: null,
      reason: "answer not found",
    });
    expect(view.items[1]).toEqual({
      answerId: ANSWER_B,
      outcome: "SKIPPED_ALREADY_MARKED",
      marksAwarded: 2,
      reason: "state SMART_MARKED",
    });
    expect(view.items[2]!.outcome).toBe("MARKED");
    expect(view.items[2]!.marksAwarded).toBe(2);
    expect(view.marked).toBe(1);
    expect(view.skipped).toBe(1);
    expect(view.failed).toBe(1);
  });

  test("per-item pipeline failure → stable UNEXPECTED_ERROR code, batch continues", async () => {
    const failingGenerator = okGenerator();
    failingGenerator.propose = async () => {
      throw new Error("provider exploded with secrets");
    };
    const currentRoute: Route = {
      match: /select id, marking_state, marks_awarded from answers where id = any/,
      rows: [answerRow()],
    };
    const { module } = build([...markAnswerRoutes(), currentRoute], spyPublisher(), failingGenerator);
    const view = await module.queue.smartMarkBatch([ANSWER_A]);
    expect(view.items[0]).toEqual({
      answerId: ANSWER_A,
      outcome: "FAILED",
      marksAwarded: null,
      reason: "UNEXPECTED_ERROR",
    });
    expect(view.failed).toBe(1);
  });
});

// ── T-MIG-051 (N-4 closure): java.util.UUID.compareTo SIGNED tie-break law ──
//
// The golden capture w3-teacher-marking-queue-v2-rich-200 exhibits the
// frozen in-memory ordering law: with attempt created_at tied, the
// 0xf0ae6395-… attempt sorts BEFORE the 0x4e094481-… one — the 0xf0…
// most-significant 64-bit half is NEGATIVE as a signed long — exactly the
// reverse of unsigned/hex-lex order (the former disclosed string-lex class).
// These pins carry the same vectors the capture pinned, plus the
// least-significant-half boundary case.

describe("uuidCompare (T-MIG-051 N-4 signed uuid law)", () => {
  const { uuidCompare } = require("../../src/services/teachermarking/index") as {
    uuidCompare: (a: string, b: string) => number;
  };

  test("captured tie-break pair: 0xf0ae… msb (negative signed) sorts BEFORE 0x4e09…", () => {
    const first = "f0ae6395-1c08-4e5e-bd61-d566ea7ed61e";
    const second = "4e094481-de2e-4cb2-9895-950660303cc4";
    expect(uuidCompare(first, second)).toBeLessThan(0);
    expect(uuidCompare(second, first)).toBeGreaterThan(0);
  });

  test("least-significant-half boundary: 0x8000_0000_0000_0000 lsb is signed-negative", () => {
    // msb equal (0x0…0); lsb 0x7fff… is +2^63-1 while 0x8000… is -2^63 —
    // signed order puts 0x8000… FIRST, unsigned would reverse it.
    const maxPositive = "00000000-0000-0000-7fff-ffffffffffff";
    const minNegative = "00000000-0000-0000-8000-000000000000";
    expect(uuidCompare(minNegative, maxPositive)).toBeLessThan(0);
    expect(uuidCompare(maxPositive, minNegative)).toBeGreaterThan(0);
  });

  test("equal uuids compare 0; plain low uuids keep the natural order", () => {
    const a = "40000000-0000-0000-0000-000000000001";
    expect(uuidCompare(a, a)).toBe(0);
    expect(uuidCompare("40000000-0000-0000-0000-000000000001", "40000000-0000-0000-0000-000000000002")).toBeLessThan(0);
  });
});

// ── T-MIG-051: the throughput answersByState WIRE order (Java HashMap law) ──
//
// The frozen ThroughputView serializes a HashMap<String,Long> seeded in enum
// order; Jackson renders it in JAVA HASHMAP ITERATION ORDER — for these five
// String keys a pure function of the spec-fixed String.hashCode (capacity 16,
// five puts, no resize, bucket = (h ^ h>>>16) & 15). The golden capture
// w3-teacher-marking-throughput-rich-200 pins the rendered order; this test
// pins the port's initialization to the same derived order.

describe("BY_STATE_WIRE_ORDER (T-MIG-051 Java HashMap iteration law)", () => {
  const { BY_STATE_WIRE_ORDER, MARKING_STATES } = require("../../src/services/teachermarking/index") as {
    BY_STATE_WIRE_ORDER: readonly string[];
    MARKING_STATES: readonly string[];
  };

  test("wire order matches the derived HashMap order (and the captured golden body)", () => {
    expect([...BY_STATE_WIRE_ORDER]).toEqual([
      "HUMAN_MARKED",
      "SMART_MARKED",
      "PENDING",
      "SELF_MARKED",
      "OVERRIDDEN",
    ]);
  });

  test("same key SET as the enum (only the wire order differs)", () => {
    expect([...BY_STATE_WIRE_ORDER].sort()).toEqual([...MARKING_STATES].sort());
  });
});
