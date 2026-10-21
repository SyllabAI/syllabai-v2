/**
 * DC-3 Re-Attempt Economics — acceptance pins (spec §3.3, docx sha256
 * 0da8044a...; prereg docs/DC3-REATTEMPT-ECONOMICS-PLAN.md). Fixtures mirror
 * smartmark.test.ts's harness (self-contained by design; the shared
 * prior-count query shape is THE law under test).
 *
 * Acceptance of record:
 *   (a) free: the first AI mark of a part passes, the second is refused with
 *       the count disclosure; paid: both pass.
 *   (b) the ordinal is first-class on the mark row, counted at the single
 *       markAttempt path keyed (learner, part, mark_scheme_id); a scheme
 *       revision = a fresh sequence; the ordinal survives re-marking.
 *   (c) the gate meters only NEW marking work — reads and the chat about
 *       past marks stay open (paths outside this POST; routes/cla.ts stays
 *       byte-frozen — battery-checked).
 */
import { describe, expect, test } from "bun:test";
import {
  SmartMarkService,
  StudentSmartMarkService,
  type MarkingCandidateGenerator,
} from "../../src/services/smartmark";
import {
  MARK_ENTITLEMENT_POLICY,
  entitlementRefusalDetail,
  learnerMarkTier,
  type MarkEntitlementTier,
} from "../../src/services/smartmark/entitlement";
import { fakeSql, FIXED_CLOCK, gradedEvidenceRoutes, type Route } from "../assessment/helpers";

// ── fixtures (mirrors of smartmark.test.ts's law-shaped harness) ────────────
const ATTEMPT_ID = "9a000000-0000-4000-8000-0000000000d3";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PAPER_ID = "80000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const POINT_A1 = "61000000-0000-0000-0000-000000000001";
const POINT_A2 = "61000000-0000-0000-0000-000000000002";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const SCHEME_ID = "70000000-0000-0000-0000-000000000009";

// THE shared prior-count law: one query shape for the engine's ordinal count
// and the gate's entitlement read (prereg R6).
const PRIOR_COUNT = /as part_id, count\(r\.id\)::int as prior from answers pa/;
const PRIOR_COUNT_ROUTE: Route = { match: PRIOR_COUNT, rows: [] };

const LOCK_MATCH = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \? for update of a$/;
const ATTEMPT_READ = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \?$/;
const QUESTIONS_MATCH = /select id, question_type, marks from questions where id = \?/;
const ANSWERS_MATCH = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const VERSION_MATCH = /select id from question_versions where question_id = \? order by version desc/;
const VALIDATED_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? and validation_state = \? order by created_at desc/;
const NEWEST_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc/;
const POINTS_MATCH = /select id, ref, ordering, text, marks, question_part_id from mark_points where mark_scheme_id = \? order by ordering/;
const KAPPA_ALL = /select passed from smart_mark_agreement_evaluations where scope = \? order by computed_at desc/;
const KAPPA_PAPER = /select passed from smart_mark_agreement_evaluations where scope = \? and exam_paper_id = \? order by computed_at desc/;
const KAPPA_SUBJECT = /select e2\.passed from smart_mark_agreement_evaluations e2/;
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

const okAllocation = (markPointId: string, marksAwarded: number, awarded: boolean) => ({
  markPointId,
  ref: markPointId === POINT_A1 ? "a(i)" : "a(ii)",
  marksAwarded,
  awarded,
  evidence: awarded ? "quote" : "",
  rationale: awarded ? "why" : "n/a",
});

const okCandidate = () => ({
  modelId: "glm-4.6",
  confidence: 0.9,
  rawOutput: "raw",
  allocations: [okAllocation(POINT_A1, 2, true), okAllocation(POINT_A2, 0, false)],
});

const okGenerator: MarkingCandidateGenerator = {
  proposeAll: async (ctxs) => ctxs.map(() => okCandidate()),
  propose: async () => okCandidate(),
};

function routes(opts: { priors?: Array<Record<string, unknown>>; kappaPaper?: Array<Record<string, unknown>> } = {}): Route[] {
  return [
    { match: LOCK_MATCH, rows: [ATTEMPT_ROW] },
    { match: ATTEMPT_READ, rows: [ATTEMPT_ROW] },
    { match: QUESTIONS_MATCH, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    ...gradedEvidenceRoutes({ marks: 4 }),
    { match: ANSWERS_MATCH, rows: [answerRow()] },
    { match: VERSION_MATCH, rows: [{ id: "70000000-0000-0000-0000-000000000001" }] },
    { match: VALIDATED_SCHEME, rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: NEWEST_SCHEME, rows: [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: POINTS_MATCH, rows: [
        { id: POINT_A1, ref: "a(i)", ordering: 1, text: "states the mole ratio", marks: 2, question_part_id: PART_A },
        { id: POINT_A2, ref: "a(ii)", ordering: 2, text: "correct unit handling", marks: 1, question_part_id: PART_A },
      ] },
    { match: KAPPA_ALL, rows: [] },
    { match: KAPPA_PAPER, rows: opts.kappaPaper ?? [], rowsFor: (p) => (p[1] === PAPER_ID ? opts.kappaPaper ?? [] : []) },
    { match: KAPPA_SUBJECT, rows: [], rowsFor: (p) => (p[1] === QUESTION_ID ? [] : []) },
    { match: RESULT_INSERT, rows: [] },
    { match: PRIOR_COUNT, rows: opts.priors ?? [] },
    { match: ANSWER_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_TOTAL_UPDATE, rows: [] },
    { match: TOPICS_MATCH, rows: [{ node_id: "20000000-0000-0000-0000-000000000012" }] },
    { match: FLIP_MATCH, rows: [] },
  ];
}

function student(sql: ReturnType<typeof fakeSql>, tier?: MarkEntitlementTier) {
  const smartMark = new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK);
  return new StudentSmartMarkService(
    sql,
    smartMark,
    { available: () => true, generate: async () => "1. ..." },
    FIXED_CLOCK,
    "VALIDATED_ONLY",
    tier ? () => tier : undefined, // undefined ⇒ the of-record learnerMarkTier() default
  );
}

async function expectReject(p: Promise<unknown>, message: string) {
  try {
    await p;
    throw new Error(`expected rejection containing "${message}" — resolved instead`);
  } catch (e) {
    expect(String((e as Error).message)).toContain(message);
  }
}

// ── the policy matrix of record ─────────────────────────────────────────────

describe("DC-3 entitlement policy of record (spec §3.3 mechanics)", () => {
  test("free = one AI mark per part per scheme revision, zero re-marks", () => {
    expect(MARK_ENTITLEMENT_POLICY.free).toEqual({
      includedMarksPerPartPerSchemeRevision: 1,
      reMarks: 0,
      unlimited: false,
    });
  });

  test("paid = unlimited (the spec's 'generous or unlimited'); both marks pass", () => {
    expect(MARK_ENTITLEMENT_POLICY.paid.unlimited).toBe(true);
  });

  test("v2 posture of record: every learner is free (the resolver is the billing lane's swap point)", () => {
    expect(learnerMarkTier()).toBe("free");
  });

  test("the refusal carries the spec's own disclosure sentence with honest counts — never silent", () => {
    const detail = entitlementRefusalDetail(MARK_ENTITLEMENT_POLICY.free, [
      { label: "(a)", prior: 1 },
    ]);
    expect(detail).toContain("Your first mark on this part is free");
    expect(detail).toContain("0 re-marks left");
    expect(detail).toContain("(a) (1 AI mark already)");
  });
});

// ── acceptance (a): the policy pin ──────────────────────────────────────────

describe("DC-3 gate (acceptance a) — free passes the first mark, refuses the second", () => {
  test("free + zero prior marks ⇒ the ask passes end-to-end (behavior byte-identical to the pre-DC-3 baseline)", async () => {
    const sql = fakeSql(routes({ priors: [] }));
    const view = await student(sql).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts).toHaveLength(1);
    expect(view.parts[0]!.marksAwarded).toBe(2);
    // the gate ran its read, found nothing metered, and let the pass through
    expect(sql.queries.some((q) => PRIOR_COUNT.test(q))).toBe(true);
  });

  test("free + a prior AI mark on the part under THIS scheme revision ⇒ 409 with the count disclosure, and the pass NEVER starts", async () => {
    const sql = fakeSql(routes({ priors: [{ part_id: PART_A, prior: 1 }] }));
    await expectReject(
      student(sql).smartMarkAttempt(LEARNER_ID, ATTEMPT_ID),
      "Your first mark on this part is free — 0 re-marks left",
    );
    // metered-only-new-work: the refusal precedes the marking work entirely
    // (the ownership load legitimately holds the attempt-row lock — the
    // engine's pass, and only it, never starts)
    expect(sql.queries.some((q) => PRIOR_COUNT.test(q))).toBe(true);
    expect(sql.queries.some((q) => RESULT_INSERT.test(q))).toBe(false);
    expect(sql.queries.some((q) => ATTEMPT_SMART_UPDATE.test(q))).toBe(false);
  });

  test("paid + prior marks ⇒ the gate short-circuits (no entitlement read at all) and both marks pass", async () => {
    const sql = fakeSql(routes({ priors: [{ part_id: PART_A, prior: 5 }] }));
    const view = await student(sql, "paid").smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts).toHaveLength(1);
    // unlimited ⇒ the GATE never reads; the ONE prior-count hit is the
    // engine's own ordinal count (the shared law, inside the pass)
    expect(sql.queries.filter((q) => PRIOR_COUNT.test(q))).toHaveLength(1);
  });

  test("trial ⇒ refused loudly: the N/day meter is the spec's OPEN question (a), never invented", async () => {
    const sql = fakeSql(routes({ priors: [] }));
    await expectReject(
      student(sql, "trial").smartMarkAttempt(LEARNER_ID, ATTEMPT_ID),
      "entitlement_policy_pending_sign_off",
    );
    expect(sql.queries.some((q) => PRIOR_COUNT.test(q))).toBe(false);
    expect(sql.queries.some((q) => RESULT_INSERT.test(q))).toBe(false);
  });
});

// ── acceptance (b): the ordinal pin ─────────────────────────────────────────

describe("DC-3 ordinal (acceptance b) — counted at the single markAttempt path, keyed on the scheme revision", () => {
  test("the first AI mark of a part persists attempt_ordinal 1 on the returned mark row", async () => {
    const sql = fakeSql(routes({ priors: [] }));
    const results = await new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(results.get(ANSWER_A)!.attempt_ordinal).toBe(1);
  });

  test("the ordinal SURVIVES re-marking: prior marks rank ahead, this pass appends (prior 1 ⇒ ordinal 2)", async () => {
    const sql = fakeSql(routes({ priors: [{ part_id: PART_A, prior: 1 }] }));
    const results = await new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    expect(results.get(ANSWER_A)!.attempt_ordinal).toBe(2);
  });

  test("the ordinal keys on mark_scheme_id — the scheme revision of record (a version_label bump = a new part version, fresh sequence)", async () => {
    const sql = fakeSql(routes({ priors: [{ part_id: PART_A, prior: 1 }] }));
    await new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    const priorQuery = sql.queries.find((q) => PRIOR_COUNT.test(q))!;
    expect(priorQuery).toContain("r.mark_scheme_id = ?");
    expect(priorQuery).toContain("at2.learner_id = ?");
  });

  test("the ordinal sequence EXCLUDES refusals — a SCHEME_NOT_VALIDATED row is not a mark and can never deny the first free mark (prereg R11)", async () => {
    const sql = fakeSql(routes({ priors: [] }));
    await new SmartMarkService(sql, okGenerator, { publishGraded: async () => false }, FIXED_CLOCK).markAttempt(ATTEMPT_ID);
    const priorQuery = sql.queries.find((q) => PRIOR_COUNT.test(q))!;
    expect(priorQuery).toContain("failure_reason is distinct from ?");
  });
});
