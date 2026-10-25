/**
 * ADR-040 §5.5 — the band eval lane: quadratic-weighted κ over the ordinal
 * level placements (the pure law, hand-computed vectors), the band pairing
 * law (band_placement-bearing human marks; newest-run-then-validate; skips
 * documented, never errors), the D5-β minimum-packet floors (unmet → ONE
 * ConflictError, NO row — absence stays gated), the metric-kind-hard
 * persistence (metric = 'BAND_QWK' on band rows; the κ gate filters by
 * metric on every read), and the human capture side (band_placement
 * validated against the bound bands BEFORE any state write — honest 409,
 * never a clamp).
 */
import { describe, expect, test } from "bun:test";
import {
  buildTeacherMarkingModule,
  quadraticWeightedKappa,
  type KappaEvaluationView,
  type TeacherMarkingModule,
} from "../../src/services/teachermarking";
import {
  SmartMarkService,
  METRIC_BAND_QWK,
  METRIC_POINT_UNWEIGHTED,
  type BandMarkingCandidateGenerator,
  type BandPlacementCandidate,
  type MarkingCandidateGenerator,
} from "../../src/services/smartmark";
import type { GradedEvidencePublisher, SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures ────────────────────────────────────────────────────────────────

const MARKER_ID = "f0000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "ab000000-0000-4000-8000-000000000001";
const PAPER_ID = "ac000000-0000-4000-8000-000000000001";
const QUESTION_ID = "c0000000-0000-4000-8000-000000000001";
const PAPER2_ID = "d0000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "b0000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa000000-0000-4000-8000-000000000001";
const PART_A = "60000000-0000-4000-8000-000000000001";
const ANSWER_A = "e0000000-0000-4000-8000-000000000001";
const SCHEME_ID = "70000000-0000-4000-8000-000000000009";
const VERSION_ID = "70000000-0000-4000-8000-000000000001";
const T1 = "2026-10-01T10:00:00Z";

let NOW = new Date("2026-10-05T07:45:00Z");
const clock: SubmitClock = {
  newId: (() => {
    let n = 0;
    return () => `7e571d00-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  })(),
  now: () => NOW,
};

function spySql(routes: Route[]) {
  const inner = fakeSql(routes);
  const paramsLog: unknown[][] = [];
  const wrapped = (strings: TemplateStringsArray, ...params: unknown[]) => {
    paramsLog.push(params);
    return inner(strings, ...params);
  };
  return Object.assign(wrapped, { queries: inner.queries, paramsLog });
}

/** The packet's bands: level 1 = 1..2, level 2 = 3..4 (contiguous tiling 1..4). */
function bandRanges(): Array<Record<string, unknown>> {
  return [
    { mark_scheme_id: SCHEME_ID, level_index: 1, marks_min: 1, marks_max: 2 },
    { mark_scheme_id: SCHEME_ID, level_index: 2, marks_min: 3, marks_max: 4 },
  ];
}

const PACKET_SIZE = 30;

/**
 * A floor-meeting packet: 30 marks, placements alternating 1/2, the human
 * mark always AT an edge-within-one position (level 1 → 2 = its max; level
 * 2 → 3 = its min), so every scored pair boundary-straddles. `smartOffset`
 * maps the smart side's placement (1 = agree, 2 = the disagreeing variant).
 */
function packetFixture(mode: "agree" | "disagree"): {
  humanRows: Array<Record<string, unknown>>;
  runRoutes: Route[];
} {
  const humanRows: Array<Record<string, unknown>> = [];
  const runsByAnswer = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < PACKET_SIZE; i++) {
    const answerId = `e1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const humanPlacement = i % 2 === 0 ? 1 : 2;
    let smartPlacement = humanPlacement;
    let effectiveHumanPlacement = humanPlacement;
    if (mode === "disagree") {
      // a designed disagreement split (overrides the parity alternation):
      // 15 × [1,1], 10 × [1,2], 5 × [2,1] — hand-computed below
      smartPlacement = i < 15 ? 1 : i < 25 ? 1 : 2;
      effectiveHumanPlacement = i < 15 ? 1 : i < 25 ? 2 : 1;
    }
    const humanMarks = effectiveHumanPlacement === 1 ? 2 : 3; // edge-within-one, always
    const smartMarks = smartPlacement === 1 ? 2 : 3;
    humanRows.push({
      id: `h2000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      answer_id: answerId,
      marker_id: MARKER_ID,
      marks_awarded: humanMarks,
      per_point_decisions: null,
      band_placement: {
        shape: "band_decision_v1",
        level_placement: effectiveHumanPlacement,
        awarded_marks: humanMarks,
        descriptor_hits: [],
      },
      comments: null,
      created_at: T1,
    });
    runsByAnswer.set(answerId, {
      id: `r3000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      answer_id: answerId,
      model_id: "glm-4.6",
      marks_awarded: smartMarks,
      confidence: 0.9,
      validation_passed: true,
      breakdown: {
        shape: "band_decision_v1",
        level_placement: smartPlacement,
        awarded_marks: smartMarks,
        descriptor_hits: [],
      },
      failure_reason: null,
      mark_scheme_id: SCHEME_ID,
      created_at: T1,
    });
  }
  const runRoutes: Route[] = [
    {
      match: /from smart_mark_results where answer_id = \? order by created_at desc limit 1/,
      rows: [],
      rowsFor: (params) => {
        const run = runsByAnswer.get(String(params[0]));
        return run ? [run] : [];
      },
    },
  ];
  return { humanRows, runRoutes };
}

/** The full route set for a band eval over the given human rows. */
function bandEvalRoutes(
  humanRows: Array<Record<string, unknown>>,
  runRoutes: Route[],
  bandRows: Array<Record<string, unknown>> = bandRanges(),
): Route[] {
  return [
    {
      match: /select id, answer_id, marker_id, marks_awarded, per_point_decisions,\s*band_placement, comments, created_at\s*from human_marks order by created_at asc/,
      rows: humanRows,
    },
    {
      match: /select h\.id, h\.answer_id/,
      rows: humanRows,
    },
    ...runRoutes,
    {
      match: /from mark_bands\s*where mark_scheme_id = any/,
      rows: bandRows,
    },
    { match: /insert into smart_mark_agreement_evaluations/, rows: [] },
  ];
}

/** A generator placeholder for rigs that never touch the point path — it
 *  throws only if CALLED (the band lanes never call it). */
const noPointGenerator = (() => {
  throw new Error("no point generator in this rig");
}) as unknown as MarkingCandidateGenerator;

function build(routes: Route[], publisher = spyPublisher(), generator?: MarkingCandidateGenerator, bandGenerator?: BandMarkingCandidateGenerator) {
  const sql = spySql(routes);
  const module: TeacherMarkingModule = buildTeacherMarkingModule(
    sql,
    generator ?? noPointGenerator,
    publisher,
    clock,
    bandGenerator,
  );
  return { sql, module, publisher };
}

function spyPublisher(): GradedEvidencePublisher & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    publishGraded: async (event: Parameters<GradedEvidencePublisher["publishGraded"]>[0]) => {
      calls.push(event as unknown as Record<string, unknown>);
      return true;
    },
  } as unknown as GradedEvidencePublisher & { calls: Array<Record<string, unknown>> };
}

const insertIdx = (sql: ReturnType<typeof spySql>) =>
  sql.queries.findIndex((q) => q.includes("insert into smart_mark_agreement_evaluations"));

// ── quadraticWeightedKappa (the pure law) ───────────────────────────────────

describe("quadraticWeightedKappa", () => {
  test("perfect agreement → 1", () => {
    const s = quadraticWeightedKappa([[1, 1], [2, 2], [3, 3]]);
    expect(s.kappa).toBe(1);
    expect(s.observedAgreement).toBe(1);
    expect(s.sampleSize).toBe(3);
  });

  test("balanced symmetric disagreement on a 2-level scale → 0 (chance-level)", () => {
    const s = quadraticWeightedKappa([[1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(s.kappa).toBe(0);
    expect(s.observedAgreement).toBe(0.5);
  });

  test("hand-computed ordinal case → 0.5 (near-miss weighted less than far miss)", () => {
    // pairs: [1,1], [1,1], [2,1], [2,2] — one near miss, one far miss
    const s = quadraticWeightedKappa([[1, 1], [1, 1], [2, 1], [2, 2]]);
    expect(s.kappa).toBeCloseTo(0.5, 10);
  });

  test("hand-computed packet vector → −0.2857… (worse than chance)", () => {
    const pairs: Array<[number, number]> = [
      ...Array.from({ length: 15 }, () => [1, 1] as [number, number]),
      ...Array.from({ length: 10 }, () => [1, 2] as [number, number]),
      ...Array.from({ length: 5 }, () => [2, 1] as [number, number]),
    ];
    const s = quadraticWeightedKappa(pairs);
    expect(s.kappa).toBeCloseTo(-0.2857142857, 6);
    expect(s.observedAgreement).toBeCloseTo(0.5, 10);
  });

  test("adjacent placements weigh (K-1)² less than distant ones (same marginals, same off-diagonal count)", () => {
    // identical marginals (L1×1, L2×2, L3×1 on both sides), 2 off-diagonal
    // pairs each — only the DISTANCE differs: step-1 vs step-2
    const near = quadraticWeightedKappa([[1, 2], [2, 3], [3, 2], [2, 1]]);
    const far = quadraticWeightedKappa([[1, 3], [3, 1], [2, 2], [2, 2]]);
    expect(near.kappa).toBe(0); // step-1 misses at exactly chance weighting
    expect(far.kappa).toBe(-1); // step-2 misses at maximum weighted disagreement
    expect(near.kappa).toBeGreaterThan(far.kappa);
  });

  test("degenerate conventions are documented, never invented into a pass", () => {
    // K = 1 (single-category packet) → perfect agreement by definition
    expect(quadraticWeightedKappa([[1, 1], [1, 1]]).kappa).toBe(1);
    // zero weighted-chance denominator (unanimous on level 2, K = 2) →
    // observed perfect → 1; the D5-β level-span floor refuses this upstream
    expect(quadraticWeightedKappa([[2, 2], [2, 2]]).kappa).toBe(1);
  });

  test("refuses the empty packet and non-ordinal payloads", () => {
    expect(() => quadraticWeightedKappa([])).toThrow("kappa requires at least one paired decision");
    expect(() => quadraticWeightedKappa([[0, 1]])).toThrow("band placements must be integer level pairs");
    expect(() => quadraticWeightedKappa([[1.5, 1]])).toThrow("band placements must be integer level pairs");
  });
});

// ── evaluateBandAgreement — pairing, floors, persistence ────────────────────

describe("evaluateBandAgreement — the ALL/PAPER band lane", () => {
  test("perfect floor-meeting packet → QWK 1, metric BAND_QWK, within-band disclosed", async () => {
    const { humanRows, runRoutes } = packetFixture("agree");
    const { module, sql } = build(bandEvalRoutes(humanRows, runRoutes));
    const view = await module.marking.evaluateBandAgreement(null, MARKER_ID);
    expect(view.scope).toBe("ALL");
    expect(view.paperId).toBeNull();
    expect(view.metric).toBe(METRIC_BAND_QWK);
    expect(view.kappa).toBe(1);
    expect(view.observedAgreement).toBe(1);
    expect(view.sampleSize).toBe(PACKET_SIZE);
    expect(view.passed).toBe(true);
    expect(view.threshold).toBe(0.6);
    expect(view.withinBandMae).toBe(0);
    expect(view.withinBandExactRate).toBe(1);
    const idx = insertIdx(sql);
    expect(idx).toBeGreaterThan(0);
    const params = sql.paramsLog[idx]!;
    expect(params[1]).toBe("ALL");
    expect(params[2]).toBeNull();
    expect(params[3]).toBe(PACKET_SIZE);
    expect(params[7]).toBe(true);
    expect(params[10]).toBe("BAND_QWK"); // the metric discriminator, of record
  });

  test("the disagreeing hand-computed packet → QWK −0.2857, passed false", async () => {
    const { humanRows, runRoutes } = packetFixture("disagree");
    const { module } = build(bandEvalRoutes(humanRows, runRoutes));
    const view = await module.marking.evaluateBandAgreement(null, MARKER_ID);
    expect(view.kappa).toBeCloseTo(-0.2857142857, 6);
    expect(view.passed).toBe(false);
    // within-band leg: only the 15 placement-matched pairs disclose
    expect(view.withinBandMae).toBe(0);
    expect(view.withinBandExactRate).toBe(1);
  });

  test("paper scope joins through the answer's question; scope + paperId persist", async () => {
    const { humanRows, runRoutes } = packetFixture("agree");
    const { module, sql } = build(bandEvalRoutes(humanRows, runRoutes));
    const view = await module.marking.evaluateBandAgreement(PAPER_ID, MARKER_ID);
    expect(view.scope).toBe("PAPER");
    expect(view.paperId).toBe(PAPER_ID);
    expect(sql.queries[0]).toContain("where q.exam_paper_id = ?");
    const params = sql.paramsLog[insertIdx(sql)]!;
    expect(params[1]).toBe("PAPER");
    expect(params[2]).toBe(PAPER_ID);
    expect(params[10]).toBe("BAND_QWK");
  });

  test("empty packet (no band placements in scope) → 409, no row", async () => {
    const pointRow = {
      id: "h9", answer_id: ANSWER_A, marker_id: MARKER_ID, marks_awarded: 2,
      per_point_decisions: { p1: 1 }, band_placement: null, comments: null, created_at: T1,
    };
    const { module, sql } = build(bandEvalRoutes([pointRow], []));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      "no band-placement human marks available for the band calibration packet (D5-β)",
    );
    expect(insertIdx(sql)).toBe(-1);
  });

  test("malformed band_placement shapes never join the packet (zero inference)", async () => {
    const broken = {
      id: "h8", answer_id: "e8000000-0000-4000-8000-000000000001", marker_id: MARKER_ID,
      marks_awarded: 2, per_point_decisions: null,
      band_placement: { level_placement: 1, awarded_marks: 2 }, // no shape tag
      comments: null, created_at: T1,
    };
    const { module, sql } = build(bandEvalRoutes([broken], []));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      "no band-placement human marks available",
    );
    expect(insertIdx(sql)).toBe(-1);
  });

  test("unmet floors refuse with EVERY shortfall named — no row is written", async () => {
    const { humanRows, runRoutes } = packetFixture("agree");
    const { module, sql } = build(bandEvalRoutes(humanRows.slice(0, 3), runRoutes));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      /band calibration floors unmet \(D5-β\): n_pairs 3 < 25; boundary_straddling 3 < 10/,
    );
    expect(insertIdx(sql)).toBe(-1);
  });

  test("skips are documented: unvalidated runs and point-shaped breakdowns cannot pair", async () => {
    const { humanRows } = packetFixture("agree");
    const runsByAnswer = new Map<string, Record<string, unknown>>();
    for (const row of humanRows) runsByAnswer.set(String(row.answer_id), {
      id: "r", answer_id: row.answer_id, marks_awarded: 2, validation_passed: false,
      breakdown: { shape: "band_decision_v1", level_placement: 1, awarded_marks: 2, descriptor_hits: [] },
      failure_reason: "BAND_RANGE_VIOLATION", mark_scheme_id: SCHEME_ID,
    });
    const { module } = build(bandEvalRoutes(humanRows, [{
      match: /from smart_mark_results where answer_id = \? order by created_at desc limit 1/,
      rows: [],
      rowsFor: (params) => {
        const run = runsByAnswer.get(String(params[0]));
        return run ? [run] : [];
      },
    }]));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      /n_pairs 0 < 25/,
    );
  });

  test("missing runs count against the capture floor, not the packet", async () => {
    const { humanRows } = packetFixture("agree");
    // no smart runs at all: the run select answers empty for every answer
    const { module } = build(bandEvalRoutes(humanRows, [
      { match: /from smart_mark_results where answer_id = \? order by created_at desc limit 1/, rows: [] },
    ]));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      /capture 0\/30 < 80%/,
    );
  });

  test("point-shaped (array) breakdowns never pair into the band packet", async () => {
    const { humanRows } = packetFixture("agree");
    const runsByAnswer = new Map<string, Record<string, unknown>>();
    for (const row of humanRows) runsByAnswer.set(String(row.answer_id), {
      id: "r", answer_id: row.answer_id, marks_awarded: 2, validation_passed: true,
      breakdown: [{ markPointId: "p1", awarded: true }], // the POINT shape
      failure_reason: null, mark_scheme_id: SCHEME_ID,
    });
    const { module } = build(bandEvalRoutes(humanRows, [{
      match: /from smart_mark_results where answer_id = \? order by created_at desc limit 1/,
      rows: [],
      rowsFor: (params) => {
        const run = runsByAnswer.get(String(params[0]));
        return run ? [run] : [];
      },
    }]));
    await expect(module.marking.evaluateBandAgreement(null, MARKER_ID)).rejects.toThrow(
      /n_pairs 0 < 25/,
    );
  });
});

// ── evaluateBandAgreementForSubject — the 0007-infrastructure lane ──────────

describe("evaluateBandAgreementForSubject", () => {
  test("SUBJECT-scope row persists with subject_id + metric BAND_QWK", async () => {
    const { humanRows, runRoutes } = packetFixture("agree");
    const { module, sql } = build(bandEvalRoutes(humanRows, runRoutes));
    const view = await module.marking.evaluateBandAgreementForSubject(SUBJECT_ID, MARKER_ID);
    expect(view.scope).toBe("SUBJECT");
    expect(view.subjectId).toBe(SUBJECT_ID);
    expect(view.paperId).toBeNull();
    expect(view.metric).toBe(METRIC_BAND_QWK);
    expect(view.kappa).toBe(1);
    expect(view.passed).toBe(true);
    expect(sql.queries[0]).toContain("where qsub.subject_id = ?");
    // the SUBJECT insert inlines exam_paper_id null (not a bind slot — the
    // point lane's frozen shape): [id, SUBJECT, subjectId, sampleSize, …]
    const params = sql.paramsLog[insertIdx(sql)]!;
    expect(params[1]).toBe("SUBJECT");
    expect(params[2]).toBe(SUBJECT_ID);
    expect(params[10]).toBe("BAND_QWK");
  });
});

// ── the metric-kind-hard κ gate (band rows can never release point parts) ──

const BAND_MARKING_ROUTES: Route[] = [
  {
    match: /from attempts a join questions q on q\.id = a\.question_id\s*where a\.id = \? for update of a$/,
    rows: [{
      id: ATTEMPT_ID, learner_id: LEARNER_ID, question_id: QUESTION_ID,
      marking_state: "PENDING", evidence_emitted: false, exam_paper_id: PAPER_ID,
    }],
  },
  {
    match: /from answers ans join question_parts qp on qp\.id = ans\.question_part_id\s*where ans\.attempt_id = \?\s*order by ans\.question_part_id/,
    rows: [{
      id: ANSWER_A, question_part_id: PART_A, answer_text: "The learner's essay.",
      marks_awarded: null, marking_state: "PENDING", label: "(a)", marks: 4,
    }],
  },
  { match: /select id from question_versions/, rows: [{ id: VERSION_ID }] },
  {
    match: /select id, validation_state, scheme_kind from mark_schemes where question_version_id = \? and validation_state = \?/,
    rows: [{ id: SCHEME_ID, validation_state: "VALIDATED", scheme_kind: "LEVELS" }],
  },
  {
    match: /select validation_state, scheme_kind, general_guidance from mark_schemes where id = \?/,
    rows: [{ validation_state: "VALIDATED", scheme_kind: "LEVELS", general_guidance: "Reward linked statements." }],
  },
  { match: /from mark_bands where mark_scheme_id = \? order by level_index/, rows: [
    { id: "b1", level_index: 1, marks_min: 1, marks_max: 2, descriptor_md: "Basic statements.", guidance_md: null },
    { id: "b2", level_index: 2, marks_min: 3, marks_max: 4, descriptor_md: "Precise terminology.", guidance_md: null },
  ] },
  { match: /select id, prompt from question_parts where question_version_id = \?/, rows: [{ id: PART_A, prompt: "Explain." }] },
  { match: /insert into smart_mark_results/, rows: [] },
  { match: /update answers set/, rows: [] },
  { match: /update attempts set marking_state/, rows: [] },
  { match: /select id, marks_awarded, marking_state, marking_state from answers/, rows: [] },
  {
    match: /select id, marks_awarded, marking_state from answers\s*where attempt_id = \?\s*order by question_part_id/,
    rows: [{ id: ANSWER_A, marks_awarded: 3, marking_state: "PENDING" }], // still PENDING → no evidence
  },
  { match: /update attempts set marks_awarded/, rows: [] },
  { match: /select passed from smart_mark_agreement_evaluations/, rows: [] },
  { match: /select e2\.passed from smart_mark_agreement_evaluations/, rows: [] },
];

function bandGeneratorStub(): BandMarkingCandidateGenerator {
  const candidate: BandPlacementCandidate = {
    modelId: "glm-4.6",
    levelPlacement: 2,
    awardedMarks: 3,
    descriptorHits: [{ levelIndex: 2, hit: true, rationale: "linked" }],
    confidence: 0.9,
    rawOutput: "raw",
  };
  return {
    proposeBand: async () => candidate,
    proposeBandsAll: async (contexts) => contexts.map(() => candidate),
  };
}

describe("the κ gate is metric-kind-hard (SmartMarkService.markAttempt)", () => {
  test("the band dispatch gates on BAND_QWK rows — every gate read binds BAND_QWK", async () => {
    const sql = spySql(BAND_MARKING_ROUTES);
    const service = new SmartMarkService(
      sql,
      noPointGenerator,
      spyPublisher(),
      clock,
      bandGeneratorStub(),
    );
    await service.markAttempt(ATTEMPT_ID);
    const gateParams = sql.paramsLog.filter((_, i) =>
      sql.queries[i]!.includes("smart_mark_agreement_evaluations"),
    );
    expect(gateParams.length).toBeGreaterThan(0);
    for (const params of gateParams) {
      expect(params).toContain(METRIC_BAND_QWK);
      expect(params).not.toContain(METRIC_POINT_UNWEIGHTED);
    }
  });

  test("the point dispatch keeps the POINT_UNWEIGHTED gate (byte-neutral default)", async () => {
    const pointRoutes: Route[] = [
      ...BAND_MARKING_ROUTES.filter((r) => !r.match.source.includes("mark_schemes")),
      {
        match: /select id, validation_state, scheme_kind from mark_schemes where question_version_id = \? and validation_state = \?/,
        rows: [{ id: SCHEME_ID, validation_state: "VALIDATED", scheme_kind: "POINTS" }],
      },
      {
        match: /from mark_points/,
        rows: [{ id: "p1", ref: "a(i)", ordering: 0, text: "point", marks: 2, question_part_id: PART_A }],
      },
    ];
    const sql = spySql(pointRoutes);
    const generator: MarkingCandidateGenerator = {
      proposeAll: async (contexts) => contexts.map((ctx) => ({
        modelId: "glm-4.6", confidence: 0.9, rawOutput: "raw",
        allocations: ctx.points.map((p) => ({
          markPointId: p.id, ref: p.ref, awarded: true, marksAwarded: p.marks,
          evidence: "e", rationale: "r",
        })),
      })),
      propose: async () => { throw new Error("unused"); },
    };
    const service = new SmartMarkService(sql, generator, spyPublisher(), clock);
    await service.markAttempt(ATTEMPT_ID);
    const gateParams = sql.paramsLog.filter((_, i) =>
      sql.queries[i]!.includes("smart_mark_agreement_evaluations"),
    );
    expect(gateParams.length).toBeGreaterThan(0);
    for (const params of gateParams) {
      expect(params).toContain(METRIC_POINT_UNWEIGHTED);
      expect(params).not.toContain(METRIC_BAND_QWK);
    }
  });
});

// ── the human capture side (recordHumanMark + band_placement) ───────────────

const BA_ID = "e5000000-0000-4000-8000-000000000001";

function captureRoutes(overrides: {
  schemes?: Array<Record<string, unknown>>;
  bands?: Array<Record<string, unknown>>;
} = {}): Route[] {
  return [
    {
      match: /select a\.attempt_id\s*from answers a\s*join attempts at on at\.id = a\.attempt_id\s*where a\.id = \? and exists/,
      rows: [{ attempt_id: ATTEMPT_ID }],
    },
    { match: /from attempts where id = \? for update$/, rows: [{
      id: ATTEMPT_ID, learner_id: LEARNER_ID, question_id: QUESTION_ID,
      marking_state: "PENDING", evidence_emitted: false,
    }] },
    {
      match: /from answers ans join question_parts/,
      rows: [],
      rowsFor: (params) => (String(params[0]) === BA_ID ? [{
        id: BA_ID, attempt_id: ATTEMPT_ID, answer_text: "essay", marks_awarded: null,
        marking_state: "PENDING", question_part_id: PART_A, label: "(a)", prompt: "Explain.",
        part_marks: 4, learner_id: LEARNER_ID, attempt_created_at: T1, evidence_emitted: false,
        question_id: QUESTION_ID, external_ref: "q1", exam_paper_id: PAPER_ID, question_marks: 5,
      }] : []),
    },
    {
      match: /select ms\.id, ms\.scheme_kind from mark_schemes ms/,
      rows: overrides.schemes ?? [{ id: SCHEME_ID, scheme_kind: "LEVELS" }],
    },
    {
      match: /select level_index, marks_min, marks_max from mark_bands/,
      rows: overrides.bands ?? [
        { level_index: 1, marks_min: 1, marks_max: 2 },
        { level_index: 2, marks_min: 3, marks_max: 4 },
      ],
    },
    { match: /update answers set/, rows: [] },
    { match: /update attempts set marking_state/, rows: [] },
    {
      match: /select id, marks_awarded, marking_state from answers/,
      rows: [{ id: BA_ID, marks_awarded: null, marking_state: "PENDING" }], // still PENDING → no evidence
    },
    { match: /update attempts set marks_awarded/, rows: [] },
    { match: /insert into human_marks/, rows: [] },
  ];
}

const BAND_CAPTURE = { levelPlacement: 2, awardedMarks: 3 };

describe("recordHumanMark — the band capture side (ADR-040 §5.5)", () => {
  test("a band part capture writes the pinned band_decision_v1 shape + echoes the view", async () => {
    const { module, sql } = build(captureRoutes());
    const view = await module.marking.recordHumanMark(
      BA_ID, MARKER_ID, 3, null, "linked statements", BAND_CAPTURE,
    );
    expect(view.bandPlacement).toEqual(BAND_CAPTURE);
    const idx = sql.queries.findIndex((q) => q.includes("insert into human_marks"));
    expect(idx).toBeGreaterThan(0);
    expect(sql.paramsLog[idx]![7]).toBe(
      JSON.stringify({ shape: "band_decision_v1", level_placement: 2, awarded_marks: 3, descriptor_hits: [] }),
    );
  });

  test("the point path stays byte-identical: no placement → the column binds null", async () => {
    const { module, sql } = build(captureRoutes());
    const view = await module.marking.recordHumanMark(BA_ID, MARKER_ID, 2, { p1: 1 }, null);
    expect(view.bandPlacement).toBeUndefined();
    const idx = sql.queries.findIndex((q) => q.includes("insert into human_marks"));
    expect(sql.paramsLog[idx]![7]).toBeNull();
  });

  test("a non-LEVELS scheme refuses the capture BEFORE any state write", async () => {
    const { module, sql } = build(captureRoutes({ schemes: [{ id: SCHEME_ID, scheme_kind: "POINTS" }] }));
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 3, null, null, BAND_CAPTURE),
    ).rejects.toThrow("band placement requires a LEVELS mark scheme with bound bands");
    expect(sql.queries.some((q) => q.includes("update answers set"))).toBe(false);
    expect(sql.queries.some((q) => q.includes("insert into human_marks"))).toBe(false);
  });

  test("no scheme at all refuses the same honest way", async () => {
    const { module } = build(captureRoutes({ schemes: [] }));
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 3, null, null, BAND_CAPTURE),
    ).rejects.toThrow("band placement requires a LEVELS mark scheme with bound bands");
  });

  test("bound-band-less LEVELS scheme refuses (a placement against nothing is never guessed)", async () => {
    const { module } = build(captureRoutes({ bands: [] }));
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 3, null, null, BAND_CAPTURE),
    ).rejects.toThrow("band placement requires a LEVELS mark scheme with bound bands");
  });

  test("an unknown level refuses with the bound levels named", async () => {
    const { module } = build(captureRoutes());
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 3, null, null, { levelPlacement: 5, awardedMarks: 3 }),
    ).rejects.toThrow("band placement level 5 is not one of the bound levels 1, 2");
  });

  test("the HARD RANGE LAW holds on the human side too: out-of-band marks are a 409, never a clamp", async () => {
    const { module } = build(captureRoutes());
    // inside the part bound (2 ≤ 4) but BELOW level 2's printed minimum (3)
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 2, null, null, { levelPlacement: 2, awardedMarks: 2 }),
    ).rejects.toThrow("awarded marks 2 outside level 2's printed range 3–4");
  });

  test("the placement's within-band mark must equal marksAwarded (one grade of record)", async () => {
    const { module } = build(captureRoutes());
    await expect(
      module.marking.recordHumanMark(BA_ID, MARKER_ID, 2, null, null, BAND_CAPTURE),
    ).rejects.toThrow("band placement awardedMarks 3 must equal the mark's marksAwarded 2");
  });
});

// ── the metric-kind-hard latest reads ───────────────────────────────────────

describe("latestEvaluation / latestSubjectEvaluation — metric-threaded reads", () => {
  const latestRows = [{
    id: "k1", scope: "ALL", exam_paper_id: null, sample_size: 30, kappa: 0.9,
    observed_agreement: 0.95, threshold: 0.6, passed: true, computed_at: T1, metric: "BAND_QWK",
  }];

  test("latestEvaluation filters by metric and reads the stored discriminator", async () => {
    const { module, sql } = build([
      { match: /from smart_mark_agreement_evaluations\s*where scope = \? and metric = \?/, rows: latestRows },
    ]);
    const view: KappaEvaluationView | null = await module.marking.latestEvaluation(null, METRIC_BAND_QWK);
    expect(view).not.toBeNull();
    expect(view!.metric).toBe("BAND_QWK");
    expect(view!.withinBandMae).toBeNull(); // not stored on the row — the view discloses nulls
    const q = sql.queries.find((q) => q.includes("smart_mark_agreement_evaluations"))!;
    expect(q).toContain("metric = ?");
  });

  test("latestSubjectEvaluation carries the same law", async () => {
    const { module, sql } = build([
      { match: /from smart_mark_agreement_evaluations\s*where scope = \? and subject_id = \? and metric = \?/, rows: [{
        ...latestRows[0]!, scope: "SUBJECT", subject_id: SUBJECT_ID,
      }] },
    ]);
    const view = await module.marking.latestSubjectEvaluation(SUBJECT_ID, METRIC_BAND_QWK);
    expect(view).not.toBeNull();
    expect(view!.subjectId).toBe(SUBJECT_ID);
    expect(view!.metric).toBe("BAND_QWK");
    expect(sql.paramsLog[0]).toEqual(["SUBJECT", SUBJECT_ID, "BAND_QWK"]);
  });
});
