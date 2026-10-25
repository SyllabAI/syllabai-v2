/**
 * ADR-040 §5.4 — the hub band dispatch: the band pipeline (blank
 * deterministic zero, the validators trio, the §2.2 hard-range ONE-retry
 * law), the SmartMarkService LEVELS dispatch leg (wired seam marks for real;
 * unwired seam / empty bands keep the §5.2 NO_SCHEME_BANDS posture; the
 * dispatch/read kind mismatch refuses loudly), the pinned band_decision_v1
 * breakdown shape, and the student-view band projection + the per-point
 * feedback refusal for band-marked parts.
 */
import { describe, expect, test } from "bun:test";
import {
  BandMarkingPipeline,
  SmartMarkService,
  StudentSmartMarkService,
  CandidateGenerationError,
  BAND_RANGE_PREFIX,
  bandRangeValidator,
  bandScopeValidator,
  bandPlacementValidator,
  isBandDecisionV1,
  toMarkingBand,
  type BandCorrection,
  type BandMarkingCandidateGenerator,
  type BandMarkingContext,
  type BandPlacementCandidate,
} from "../../src/services/smartmark";
import { fakeSql, FIXED_CLOCK, gradedEvidenceRoutes, type Route } from "../assessment/helpers";

const ATTEMPT_ID = "9a000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PAPER_ID = "80000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const SCHEME_ID = "70000000-0000-0000-0000-000000000009";
const VERSION_ID = "70000000-0000-0000-0000-000000000001";

// ── fixtures ────────────────────────────────────────────────────────────────

function bandRows(): Array<Record<string, unknown>> {
  return [
    { id: "b1000000-0000-0000-0000-000000000001", level_index: 1, marks_min: 1, marks_max: 2, descriptor_md: "Answers make basic statements.\nSecond line.", guidance_md: null, question_part_id: PART_A },
    { id: "b1000000-0000-0000-0000-000000000002", level_index: 2, marks_min: 3, marks_max: 4, descriptor_md: "Answers use some precise scientific terminology.", guidance_md: "Reward linked statements.", question_part_id: PART_A },
  ];
}

function bandContext(overrides: Partial<BandMarkingContext> = {}): BandMarkingContext {
  return {
    answer: {
      id: ANSWER_A,
      attemptId: ATTEMPT_ID,
      questionPartId: PART_A,
      answerText: "The student's written answer.",
      label: "(a)",
      partMarks: 4,
    },
    schemeId: SCHEME_ID,
    schemeValidationState: "VALIDATED",
    bands: bandRows().map(toMarkingBand),
    partPrompt: "Explain why the reaction is exothermic.",
    generalGuidance: "Marks are for linked statements, not lists.",
    ...overrides,
  };
}

function bandCandidate(overrides: Partial<BandPlacementCandidate> = {}): BandPlacementCandidate {
  return {
    modelId: "glm-4.6",
    levelPlacement: 2,
    awardedMarks: 3,
    descriptorHits: [{ levelIndex: 2, hit: true, rationale: "linked statements" }],
    confidence: 0.9,
    rawOutput: "raw",
    ...overrides,
  };
}

/** Capturing band generator: first call returns `first`, later calls
 *  `retry ?? first`; every (context, correction) pair is recorded. */
function bandGenerator(
  first: Partial<BandPlacementCandidate> = {},
  retry?: Partial<BandPlacementCandidate>,
) {
  const calls: Array<{ context: BandMarkingContext; correction?: BandCorrection }> = [];
  const gen: BandMarkingCandidateGenerator = {
    proposeBand: async (context, correction) => {
      calls.push({ context, correction });
      return bandCandidate(calls.length === 1 ? first : (retry ?? first));
    },
    proposeBandsAll: async (contexts) => {
      for (const context of contexts) calls.push({ context });
      return contexts.map(() => bandCandidate(first));
    },
  };
  return Object.assign(gen, { calls });
}

const failingBandGen = (reason: string, raw: string | null = null): BandMarkingCandidateGenerator => ({
  proposeBand: async () => {
    throw new CandidateGenerationError(reason, raw ?? undefined);
  },
  proposeBandsAll: async () => {
    throw new CandidateGenerationError(reason, raw ?? undefined);
  },
});

// ── the band pipeline (pure) ────────────────────────────────────────────────

describe("BandMarkingPipeline — deterministic law", () => {
  test("no bands → rejected NO_SCHEME_BANDS (never reaches the generator)", async () => {
    const gen = bandGenerator();
    const decision = await new BandMarkingPipeline(gen).run(bandContext({ bands: [] }));
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toBe("NO_SCHEME_BANDS");
    expect(gen.calls.length).toBe(0);
  });

  test("blank answer → deterministic zero: accepted, no placement, no LLM call (R7)", async () => {
    const gen = bandGenerator();
    const decision = await new BandMarkingPipeline(gen).run(bandContext({ answer: { id: ANSWER_A, attemptId: ATTEMPT_ID, questionPartId: PART_A, answerText: "   ", label: "(a)", partMarks: 4 } }));
    expect(decision.accepted).toBe(true);
    expect(decision.marksAwarded).toBe(0);
    expect(decision.candidate).toBeNull();
    expect(decision.breakdown).toEqual({
      shape: "band_decision_v1",
      level_placement: null,
      awarded_marks: 0,
      descriptor_hits: [],
      blank: true,
    });
    expect(gen.calls.length).toBe(0);
  });

  test("accepted placement → the pinned band_decision_v1 breakdown of record", async () => {
    const gen = bandGenerator();
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(true);
    expect(decision.marksAwarded).toBe(3);
    expect(decision.failureReason).toBeNull();
    expect(decision.breakdown).toEqual({
      shape: "band_decision_v1",
      level_placement: 2,
      awarded_marks: 3,
      descriptor_hits: [{ level_index: 2, hit: true, rationale: "linked statements" }],
    });
    expect(decision.breakdown.blank).toBeUndefined();
  });

  test("hard range law: out-of-range candidate gets ONE deterministic retry with the violations stated back", async () => {
    const gen = bandGenerator({ awardedMarks: 6 }, { awardedMarks: 3 });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(true);
    expect(decision.marksAwarded).toBe(3);
    expect(gen.calls.length).toBe(2);
    const correction = gen.calls[1]!.correction;
    expect(correction).toBeDefined();
    expect(correction!.violations).toEqual([
      `${BAND_RANGE_PREFIX}awarded marks 6 fall outside the placed level 2 range 3..4`,
    ]);
  });

  test("hard range law: still outside after the retry → honest BAND_RANGE_VIOLATION, never a silent clamp", async () => {
    const gen = bandGenerator({ awardedMarks: 6 });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toBe("BAND_RANGE_VIOLATION");
    expect(decision.marksAwarded).toBe(0);
    expect(decision.candidate?.rawOutput).toBe("raw");
    expect(gen.calls.length).toBe(2);
  });

  test("structural violation (unknown level) → VALIDATION_FAILED with NO retry (one call)", async () => {
    const gen = bandGenerator({ levelPlacement: 7 });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toContain("VALIDATION_FAILED");
    expect(decision.failureReason).toContain("placement references unknown level 7");
    expect(gen.calls.length).toBe(1);
  });

  test("mixed violations (unknown level + out of range) → no retry: only EXCLUSIVE range violations retry", async () => {
    const gen = bandGenerator({ levelPlacement: 7, awardedMarks: 99 });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toContain("VALIDATION_FAILED");
    expect(gen.calls.length).toBe(1);
  });

  test("missing placement → 'no level placement decided' (the coverage analog)", async () => {
    const gen = bandGenerator({ levelPlacement: null });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toContain("no level placement decided");
  });

  test("descriptor hit out of scope → violation named (the bounds analog)", async () => {
    const gen = bandGenerator({ descriptorHits: [{ levelIndex: 9, hit: true, rationale: "x" }] });
    const decision = await new BandMarkingPipeline(gen).run(bandContext());
    expect(decision.accepted).toBe(false);
    expect(decision.failureReason).toContain("descriptor hit references unknown level 9");
  });

  test("CandidateGenerationError with raw output → self-forensic refusal; without → candidate null", async () => {
    const withRaw = await new BandMarkingPipeline(failingBandGen("PROVIDER_UNAVAILABLE", "{partial")).run(bandContext());
    expect(withRaw.failureReason).toBe("PROVIDER_UNAVAILABLE");
    expect(withRaw.candidate?.rawOutput).toBe("{partial");
    const withoutRaw = await new BandMarkingPipeline(failingBandGen("PROVIDER_UNAVAILABLE")).run(bandContext());
    expect(withoutRaw.failureReason).toBe("PROVIDER_UNAVAILABLE");
    expect(withoutRaw.candidate).toBeNull();
  });

  test("batch: one proposeBandsAll call decides every markable part; batch failure degrades to the per-part ladder", async () => {
    const batchGen = bandGenerator();
    const contexts = [bandContext(), bandContext({ answer: { id: ANSWER_A, attemptId: ATTEMPT_ID, questionPartId: PART_A, answerText: null, label: "(b)", partMarks: 4 } })];
    const decisions = await new BandMarkingPipeline(batchGen).runBatch(contexts);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.accepted).toBe(true);
    expect(decisions[1]!.accepted).toBe(true); // blank deterministic zero, no call
    expect(batchGen.calls.length).toBe(1); // ONE provider call for the attempt

    // batch failure → the fallback ladder re-marks per part through run
    const ladderGen = bandGenerator();
    ladderGen.proposeBandsAll = async () => {
      throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
    };
    const fallback = await new BandMarkingPipeline(ladderGen).runBatch([bandContext()]);
    expect(fallback[0]!.accepted).toBe(true); // the per-part call succeeds
    expect(ladderGen.calls.length).toBe(1); // the ladder's per-part propose
  });
});

describe("band validators — the trio", () => {
  test("bandRangeValidator names the placed level and its printed range", () => {
    const context = bandContext();
    const violations = bandRangeValidator.validate(bandCandidate({ awardedMarks: 0 }), context);
    expect(violations).toEqual([`${BAND_RANGE_PREFIX}awarded marks 0 fall outside the placed level 2 range 3..4`]);
    expect(bandRangeValidator.validate(bandCandidate({ awardedMarks: 4 }), context)).toEqual([]);
  });

  test("bandScopeValidator + bandPlacementValidator hold the boundary laws", () => {
    expect(bandScopeValidator.validate(bandCandidate({ levelPlacement: 3 }), bandContext())).toEqual([
      "placement references unknown level 3",
    ]);
    expect(bandPlacementValidator.validate(bandCandidate({ levelPlacement: null }), bandContext())).toEqual([
      "no level placement decided",
    ]);
  });

  test("isBandDecisionV1 pins the shape guard", () => {
    expect(isBandDecisionV1({ shape: "band_decision_v1", level_placement: 1, awarded_marks: 2, descriptor_hits: [] })).toBe(true);
    expect(isBandDecisionV1([{ markPointId: "x" }])).toBe(false);
    expect(isBandDecisionV1(null)).toBe(false);
    expect(isBandDecisionV1({ shape: "other" })).toBe(false);
  });
});

// ── SmartMarkService.markAttempt — the band dispatch leg (stubbed sql) ──────

const LOCK_MATCH = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \? for update of a$/;
const ANSWERS_MATCH = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const VERSION_MATCH = /select id from question_versions where question_id = \? order by version desc/;
const VALIDATED_SCHEME = /select id, validation_state, scheme_kind from mark_schemes where question_version_id = \? and validation_state = \? order by created_at desc/;
const NEWEST_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc/;
const SCHEME_FULL = /select validation_state, scheme_kind, general_guidance from mark_schemes where id = \?$/;
const BANDS_MATCH = /select id, level_index, marks_min, marks_max, descriptor_md, guidance_md from mark_bands where mark_scheme_id = \? order by level_index/;
const PROMPTS_MATCH = /select id, prompt from question_parts where question_version_id = \?$/;
const KAPPA_ALL = /select passed from smart_mark_agreement_evaluations where scope = \? order by computed_at desc/;
const KAPPA_PAPER = /select passed from smart_mark_agreement_evaluations where scope = \? and exam_paper_id = \? order by computed_at desc/;
const KAPPA_SUBJECT = /select e2\.passed from smart_mark_agreement_evaluations e2/;
const RESULT_INSERT = /insert into smart_mark_results/;
const ANSWER_SMART_UPDATE = /update answers set marks_awarded = \? , marking_state = \? where id = \?/;
const ATTEMPT_SMART_UPDATE = /update attempts set marking_state = \? where id = \?/;
const ATTEMPT_TOTAL_UPDATE = /update attempts set marks_awarded = \? where id = \?/;
const FLIP_MATCH = /update attempts set evidence_emitted = true where id = \? and evidence_emitted = false/;

const ATTEMPT_ROW = {
  id: ATTEMPT_ID,
  learner_id: LEARNER_ID,
  question_id: QUESTION_ID,
  exam_paper_id: PAPER_ID,
  marking_state: "PENDING",
  evidence_emitted: false,
};

const LEVELS_SCHEME_ROW = { id: SCHEME_ID, validation_state: "VALIDATED", scheme_kind: "LEVELS" };

function answerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANSWER_A,
    question_part_id: PART_A,
    answer_text: "The student's written answer.",
    marks_awarded: null,
    marking_state: "PENDING",
    label: "(a)",
    marks: 4,
    ...overrides,
  };
}

function bandRoutes(opts: {
  answers?: Array<Record<string, unknown>>;
  validatedSchemes?: Array<Record<string, unknown>>;
  schemeFull?: Array<Record<string, unknown>>;
  bands?: Array<Record<string, unknown>>;
  kappaPaper?: Array<Record<string, unknown>>;
  onFlip?: () => void;
} = {}): Route[] {
  return [
    { match: LOCK_MATCH, rows: [ATTEMPT_ROW] },
    { match: /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \?$/, rows: [ATTEMPT_ROW] },
    { match: /select id, question_type, marks from questions where id = \?/, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    ...gradedEvidenceRoutes({ marks: 4 }),
    { match: ANSWERS_MATCH, rows: opts.answers ?? [answerRow()] },
    { match: VERSION_MATCH, rows: [{ id: VERSION_ID }] },
    { match: VALIDATED_SCHEME, rows: opts.validatedSchemes ?? [LEVELS_SCHEME_ROW] },
    { match: NEWEST_SCHEME, rows: opts.validatedSchemes ?? [LEVELS_SCHEME_ROW] },
    { match: SCHEME_FULL, rows: opts.schemeFull ?? [{ validation_state: "VALIDATED", scheme_kind: "LEVELS", general_guidance: "Marks are for linked statements, not lists." }] },
    { match: BANDS_MATCH, rows: opts.bands ?? bandRows() },
    { match: PROMPTS_MATCH, rows: [{ id: PART_A, prompt: "Explain why the reaction is exothermic." }] },
    { match: KAPPA_ALL, rows: [] },
    { match: KAPPA_PAPER, rows: opts.kappaPaper ?? [], rowsFor: (p) => (p[1] === PAPER_ID ? opts.kappaPaper ?? [] : []) },
    { match: KAPPA_SUBJECT, rows: [] },
    { match: RESULT_INSERT, rows: [] },
    { match: ANSWER_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_TOTAL_UPDATE, rows: [] },
    { match: /select node_id from question_topics where question_id = \?/, rows: [{ node_id: "20000000-0000-0000-0000-000000000012" }] },
    { match: FLIP_MATCH, rows: [], rowsFor: () => { opts.onFlip?.(); return []; } },
    { match: /select pg_advisory_xact_lock/, rows: [] },
    { match: /select ans\.question_part_id, count\(e\.id\)::int as prior/, rows: [{ question_part_id: PART_A, prior: 0 }] },
    { match: /select tier from mark_entitlements where learner_id = \?/, rows: [] },
    { match: /select tier, re_marks_per_day/, rows: [{ tier: "paid", reMarksPerDay: null, unlimited: true }] },
    { match: /select count\(\*\)::int as used from ai_mark_events/, rows: [{ used: 0 }] },
    { match: /insert into ai_mark_events/, rows: [] },
  ];
}

function publisherSpy() {
  const calls: unknown[] = [];
  return Object.assign({ publishGraded: async (event: unknown) => { calls.push(event); return true; } }, { calls });
}

/** The point seam must never fire on a LEVELS scheme — the stub fails loudly
 *  if a dispatch ever leaks band parts into the point path. */
const neverPointGenerator = {
  propose: async () => {
    throw new Error("point generator must never fire on a LEVELS scheme");
  },
  proposeAll: async () => {
    throw new Error("point generator must never fire on a LEVELS scheme");
  },
};

describe("SmartMarkService.markAttempt — the ADR-040 §5.4 band dispatch leg", () => {
  test("wired seam + VALIDATED LEVELS scheme → band decisions through the SHARED tail (rows, state, total)", async () => {
    const gen = bandGenerator();
    const pub = publisherSpy();
    const inserts: unknown[][] = [];
    const routes = bandRoutes({ kappaPaper: [{ passed: true }] });
    const insertRoute = routes.find((r) => RESULT_INSERT.test(String(r.match.source)));
    if (insertRoute) insertRoute.rowsFor = (p) => { inserts.push(p as unknown[]); return []; };
    const sql = fakeSql(routes);
    const results = await new SmartMarkService(sql, neverPointGenerator, pub, FIXED_CLOCK, gen).markAttempt(ATTEMPT_ID);
    expect(results.size).toBe(1);
    const row = results.get(ANSWER_A)!;
    expect(row.validation_passed).toBe(true);
    expect(row.marks_awarded).toBe(3);
    expect(isBandDecisionV1(row.breakdown)).toBe(true);
    expect(row.breakdown).toEqual({
      shape: "band_decision_v1",
      level_placement: 2,
      awarded_marks: 3,
      descriptor_hits: [{ level_index: 2, hit: true, rationale: "linked statements" }],
    });
    expect(row.model_id).toBe("glm-4.6");
    // the shared tail applied, byte-for-byte like the point path
    expect(sql.queries.filter((q) => RESULT_INSERT.test(q)).length).toBe(1);
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(true);
    expect(sql.queries.some((q) => ATTEMPT_SMART_UPDATE.test(q))).toBe(true);
    expect(sql.queries.some((q) => ATTEMPT_TOTAL_UPDATE.test(q))).toBe(true);
    // the band insert stamps the BAND pipeline version (bind slot 3), never 1.3.0
    expect(inserts).toHaveLength(1);
    expect(inserts[0]![2]).toBe("1.4.0");
    // the κ gate + evidence rode the shared tail
    expect(pub.calls.length).toBe(1);
  });

  test("the band prompt inputs load verbatim: bands ordered, part prompt, general guidance", async () => {
    const gen = bandGenerator();
    const sql = fakeSql(bandRoutes());
    await new SmartMarkService(sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK, gen).markAttempt(ATTEMPT_ID);
    expect(gen.calls.length).toBeGreaterThanOrEqual(1);
    const context = gen.calls[0]!.context;
    expect(context.bands.map((b) => b.levelIndex)).toEqual([1, 2]);
    expect(context.bands[1]!.descriptorMd).toBe("Answers use some precise scientific terminology.");
    expect(context.bands[1]!.guidanceMd).toBe("Reward linked statements.");
    expect(context.partPrompt).toBe("Explain why the reaction is exothermic.");
    expect(context.generalGuidance).toBe("Marks are for linked statements, not lists.");
  });

  test("unwired band seam (legacy 4-arg construction) → per-part NO_SCHEME_BANDS; no bands/prompts read", async () => {
    const sql = fakeSql(bandRoutes());
    const results = await new SmartMarkService(sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    const row = results.get(ANSWER_A)!;
    expect(row.failure_reason).toBe("NO_SCHEME_BANDS");
    expect(row.validation_passed).toBe(false);
    expect(row.breakdown).toEqual([]);
    expect(sql.queries.some((q) => SCHEME_FULL.test(q))).toBe(false);
    expect(sql.queries.some((q) => BANDS_MATCH.test(q))).toBe(false);
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(false);
  });

  test("wired seam + empty mark_bands → per-part NO_SCHEME_BANDS (the LEVELS analog of NO_SCHEME_POINTS)", async () => {
    const sql = fakeSql(bandRoutes({ bands: [] }));
    const results = await new SmartMarkService(sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK, bandGenerator()).markAttempt(ATTEMPT_ID);
    expect(results.get(ANSWER_A)!.failure_reason).toBe("NO_SCHEME_BANDS");
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(false);
  });

  test("kind mismatch between dispatch and the bound scheme → loud ConflictError, never a silent re-route", async () => {
    const sql = fakeSql(bandRoutes({ schemeFull: [{ validation_state: "VALIDATED", scheme_kind: "POINTS", general_guidance: null }] }));
    await expect(
      new SmartMarkService(sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK, bandGenerator()).markAttempt(ATTEMPT_ID),
    ).rejects.toThrow("mark scheme kind changed between dispatch and read -- refusing loudly");
  });

  test("blank band answer → deterministic zero through the shared tail: accepted, no LLM call, marked 0", async () => {
    const gen = bandGenerator();
    const sql = fakeSql(bandRoutes({ answers: [answerRow({ answer_text: "" })] }));
    const results = await new SmartMarkService(sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK, gen).markAttempt(ATTEMPT_ID);
    const row = results.get(ANSWER_A)!;
    expect(row.validation_passed).toBe(true);
    expect(row.marks_awarded).toBe(0);
    expect(row.breakdown).toEqual({
      shape: "band_decision_v1",
      level_placement: null,
      awarded_marks: 0,
      descriptor_hits: [],
      blank: true,
    });
    expect(gen.calls.length).toBe(0);
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(true);
  });

  test("band refusal of record: out-of-range after retry stamps BAND_RANGE_VIOLATION on the append-only row", async () => {
    const sql = fakeSql(bandRoutes());
    const results = await new SmartMarkService(
      sql, neverPointGenerator, publisherSpy(), FIXED_CLOCK,
      bandGenerator({ awardedMarks: 9 }), // out of range on BOTH calls
    ).markAttempt(ATTEMPT_ID);
    const row = results.get(ANSWER_A)!;
    expect(row.failure_reason).toBe("BAND_RANGE_VIOLATION");
    expect(row.validation_passed).toBe(false);
    expect(row.marks_awarded).toBe(0);
    expect(sql.queries.some((q) => ANSWER_SMART_UPDATE.test(q))).toBe(false);
    expect(sql.queries.some((q) => ATTEMPT_TOTAL_UPDATE.test(q))).toBe(false);
  });
});

// ── the student view + feedback boundary ────────────────────────────────────

const RESULTS_READ = /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/;
const BANDS_PROJECTION_MATCH = /select level_index, descriptor_md from mark_bands where mark_scheme_id = \? order by level_index/;

const BAND_RESULT_ROW = {
  id: "bb000000-0000-4000-8000-000000000001",
  answer_id: ANSWER_A,
  model_id: "glm-4.6",
  marks_awarded: 3,
  confidence: 0.9,
  validation_passed: true,
  breakdown: {
    shape: "band_decision_v1",
    level_placement: 2,
    awarded_marks: 3,
    descriptor_hits: [{ level_index: 2, hit: true, rationale: "linked statements" }],
  },
  failure_reason: null,
};

function studentBandRoutes(): Route[] {
  const routes = bandRoutes({ kappaPaper: [{ passed: true }], answers: [answerRow({ marking_state: "SMART_MARKED", marks_awarded: 3 })] });
  routes.push({ match: RESULTS_READ, rows: [BAND_RESULT_ROW] });
  routes.push({ match: BANDS_PROJECTION_MATCH, rows: bandRows() });
  return routes;
}

function studentService(sql: ReturnType<typeof fakeSql>) {
  const neverPointGen = {
    propose: async () => { throw new Error("point generator must never fire on a LEVELS scheme"); },
    proposeAll: async () => { throw new Error("point generator must never fire on a LEVELS scheme"); },
  };
  const smartMark = new SmartMarkService(
    sql, neverPointGen, { publishGraded: async () => false }, FIXED_CLOCK,
    bandGenerator(), // the band seam — the pass produces the band rows
  );
  return new StudentSmartMarkService(sql, smartMark, { available: () => true, generate: async () => "prose" }, FIXED_CLOCK);
}

describe("StudentSmartMarkService — the band view of record", () => {
  test("band row projects the bandDecision view: placement, marks, compact descriptor labels, no verbatim leak", async () => {
    const view = await studentService(fakeSql(studentBandRoutes())).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts).toHaveLength(1);
    const part = view.parts[0]!;
    expect(part.breakdown).toEqual([]);
    expect(part.bandDecision).toBeDefined();
    expect(part.bandDecision!.levelPlacement).toBe(2);
    expect(part.bandDecision!.awardedMarks).toBe(3);
    expect(part.bandDecision!.marksPossible).toBe(4);
    expect(part.bandDecision!.blank).toBe(false);
    expect(part.bandDecision!.descriptorHits).toEqual([
      { levelIndex: 2, descriptorLabel: "Answers use some precise scientific terminology.", hit: true, rationale: "linked statements" },
    ]);
  });

  test("band-marked part → per-point feedback refuses honestly (the §5.4 cycle-1 boundary)", async () => {
    const service = studentService(fakeSql(studentBandRoutes()));
    await expect(
      service.explainFeedback(LEARNER_ID, ATTEMPT_ID, PART_A),
    ).rejects.toThrow("this part is band-marked (levels-of-response) -- per-point feedback prose is not available for it");
    await expect(
      service.improvementPlan(LEARNER_ID, ATTEMPT_ID, PART_A),
    ).rejects.toThrow("this part is band-marked (levels-of-response) -- per-point feedback prose is not available for it");
  });
});
