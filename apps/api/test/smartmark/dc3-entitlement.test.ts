/**
 * DC-3 re-attempt entitlement tests (docs/DC3-REATTEMPT-ENTITLEMENT-PLAN.md;
 * spec §3.3 of record = SyllabAI-SmartChat-Mark-Design-Spec.docx, sha256
 * 0da8044a…) — the gate law over the stateful fakeSql ledger:
 *
 *   (a) Policy pin: free tier → the FIRST markAttempt on a part passes, the
 *       second is refused with the count disclosure; paid → both pass.
 *       (a3) unknown tier / unshipped policy row → fail-closed refusal.
 *       (a4) trial law: re_marks_per_day counts UTC-day re-marks.
 *   (b) Ordinal pin: ordinals live on the append-only ai_mark_events ledger
 *       (counted in the markAttempt path, never inferred); a scheme-revision
 *       bump is a NEW part id → fresh bucket, while the old part's events
 *       survive untouched.
 *   (c) Copy review: the gate meters ONLY new marking work — explainFeedback
 *       / improvementPlan never consult the entitlement tables, and a
 *       SCHEME_NOT_VALIDATED result consumes nothing.
 *   (+) envelope law: the wired tx runner holds gate+pass+stamp in one
 *       transaction (rollback on refusal); the unique-index collision
 *       surfaces as an honest 409 on the fallback path; the 402 wire body
 *       carries {error: entitlement_required, detail}.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  buildSmartMarkModule,
  StudentSmartMarkService,
  EntitlementError,
  ConflictError,
  type MarkingCandidateGenerator,
  type MarkingCandidate,
} from "../../src/services/smartmark";
import { createStudentSmartMarkRouter, dormantFeedbackLlm } from "../../src/routes/smartmark";
import { fakeSql, FIXED_CLOCK, gradedEvidenceRoutes, type Route } from "../assessment/helpers";

const ATTEMPT_ID = "9a000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PAPER_ID = "80000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const PART_B = "60000000-0000-0000-0000-000000000002";
const POINT_A1 = "61000000-0000-0000-0000-000000000001";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const ANSWER_B = "aa000000-0000-4000-8000-000000000002";
const SCHEME_ID = "70000000-0000-0000-0000-000000000009";

// ── fixtures ────────────────────────────────────────────────────────────────

const ATTEMPT_ROW = {
  id: ATTEMPT_ID,
  learner_id: LEARNER_ID,
  question_id: QUESTION_ID,
  exam_paper_id: PAPER_ID,
  marking_state: "PENDING",
  evidence_emitted: false,
};

function answerRow(id: string, partId: string) {
  return {
    id,
    question_part_id: partId,
    answer_text: "The student's written answer.",
    marks_awarded: null,
    marking_state: "PENDING",
    label: partId === PART_A ? "(a)" : "(b)",
    marks: 3,
  };
}

const okGenerator: MarkingCandidateGenerator = {
  proposeAll: async (ctxs) =>
    ctxs.map(() =>
      ({
        modelId: "glm-4.6",
        confidence: 0.9,
        rawOutput: "raw",
        allocations: [
          { markPointId: POINT_A1, ref: "a(i)", awarded: true, marksAwarded: 2, evidence: "quote", rationale: "why" },
        ],
      }) as unknown as MarkingCandidate,
    ),
  propose: async () =>
    ({
      modelId: "glm-4.6",
      confidence: 0.9,
      rawOutput: "raw",
      allocations: [
        { markPointId: POINT_A1, ref: "a(i)", awarded: true, marksAwarded: 2, evidence: "quote", rationale: "why" },
      ],
    }) as unknown as MarkingCandidate,
};

function llmStub() {
  return { available: () => true, generate: async () => "1. You earned 2 of 3 marks." };
}

// ── the stateful ledger simulation ─────────────────────────────────────────

const LOCK_MATCH = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \? for update of a$/;
const ATTEMPT_READ = /select a\.id, a\.learner_id, a\.question_id, a\.marking_state, a\.evidence_emitted, q\.exam_paper_id from attempts a join questions q on q\.id = a\.question_id where a\.id = \?$/;
const QUESTIONS_MATCH = /select id, question_type, marks from questions where id = \?/;
const ANSWERS_MATCH = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const VERSION_MATCH = /select id from question_versions where question_id = \? order by version desc/;
const VALIDATED_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? and validation_state = \? order by created_at desc/;
const NEWEST_SCHEME = /select id, validation_state from mark_schemes where question_version_id = \? order by created_at desc/;
const POINTS_MATCH = /select id, ref, ordering, text, marks, question_part_id from mark_points where mark_scheme_id = \? order by ordering/;
const KAPPA_PAPER = /select passed from smart_mark_agreement_evaluations where scope = \? and exam_paper_id = \? order by computed_at desc/;
const KAPPA_ALL = /select passed from smart_mark_agreement_evaluations where scope = \? order by computed_at desc/;
const KAPPA_SUBJECT = /select e2\.passed from smart_mark_agreement_evaluations e2/;
const TOPICS_MATCH = /select node_id from question_topics where question_id = \?/;
const RESULT_INSERT = /insert into smart_mark_results/;
const ANSWER_SMART_UPDATE = /update answers set marks_awarded = \? , marking_state = \? where id = \?/;
const ATTEMPT_SMART_UPDATE = /update attempts set marking_state = \? where id = \?/;
const ATTEMPT_TOTAL_UPDATE = /update attempts set marks_awarded = \? where id = \?/;
const FLIP_MATCH = /update attempts set evidence_emitted = true where id = \? and evidence_emitted = false/;
// DC-3 gate surface
const ADVISORY_MATCH = /select pg_advisory_xact_lock\(hashtextextended\(\s*\?\s*,\s*0\)\)/;
const PRIOR_MATCH = /select ans\.question_part_id, count\(e\.id\)::int as prior from answers ans left join ai_mark_events e on e\.learner_id = \? and e\.question_part_id = ans\.question_part_id where ans\.attempt_id = \? group by ans\.question_part_id/;
const ENTITLEMENT_MATCH = /select tier from mark_entitlements where learner_id = \?/;
const POLICY_MATCH = /select tier, re_marks_per_day as "reMarksPerDay", unlimited from mark_entitlement_policies where tier = \?/;
const USED_TODAY_MATCH = /select count\(\*\)::int as used from ai_mark_events where learner_id = \? and mark_ordinal >= 2 and created_at >= date_trunc\('day', now\(\) at time zone 'utc'\)/;
const STAMP_MATCH = /insert into ai_mark_events/;
const RESULT_LATEST = /select id, answer_id, model_id, marks_awarded, confidence, validation_passed, breakdown, failure_reason from smart_mark_results where answer_id = \? order by created_at desc/;
const FEEDBACK_SOURCE = /select ans\.id, ans\.question_part_id, ans\.answer_text, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.id = \? and ans\.attempt_id = \?/;

interface LedgerEvent {
  learner_id: string;
  question_part_id: string;
  mark_ordinal: number;
}

function dc3Routes(opts: {
  parts?: string[];
  answers?: Array<Record<string, unknown>>;
  entitlement?: Array<Record<string, unknown>>;
  policies?: Array<Record<string, unknown>>;
  usedToday?: number;
  validatedSchemes?: Array<Record<string, unknown>>;
  newestScheme?: Array<Record<string, unknown>>;
  failStamps?: boolean;
  events?: LedgerEvent[];
  kappaPaper?: Array<Record<string, unknown>>;
} = {}) {
  const parts = opts.parts ?? [PART_A];
  const events: LedgerEvent[] = opts.events ?? [];
  // the seeded policy rows of record (migration 0008): free (0 re-marks/day)
  // + paid (unlimited) — trial stays unshipped
  const policies = opts.policies ?? [
    { tier: "free", reMarksPerDay: 0, unlimited: false },
    { tier: "paid", reMarksPerDay: null, unlimited: true },
  ];
  const answers = opts.answers ?? parts.map((p, i) => answerRow(i === 0 ? ANSWER_A : ANSWER_B, p));
  const stampThrows = opts.failStamps ?? false;
  const routes: Route[] = [
    { match: LOCK_MATCH, rows: [ATTEMPT_ROW] },
    { match: ATTEMPT_READ, rows: [ATTEMPT_ROW] },
    { match: QUESTIONS_MATCH, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    ...gradedEvidenceRoutes({ marks: 4 }),
    { match: ANSWERS_MATCH, rows: answers },
    { match: VERSION_MATCH, rows: [{ id: "70000000-0000-0000-0000-000000000001" }] },
    { match: VALIDATED_SCHEME, rows: opts.validatedSchemes ?? [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: NEWEST_SCHEME, rows: opts.newestScheme ?? [{ id: SCHEME_ID, validation_state: "VALIDATED" }] },
    { match: POINTS_MATCH, rows: [
        { id: POINT_A1, ref: "a(i)", ordering: 1, text: "states the mole ratio", marks: 2, question_part_id: parts[0] },
      ] },
    { match: KAPPA_PAPER, rows: opts.kappaPaper ?? [{ passed: true }] },
    { match: KAPPA_ALL, rows: [] },
    { match: KAPPA_SUBJECT, rows: [] },
    { match: TOPICS_MATCH, rows: [{ node_id: "20000000-0000-0000-0000-000000000012" }] },
    { match: RESULT_INSERT, rows: [] },
    { match: ANSWER_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_SMART_UPDATE, rows: [] },
    { match: ATTEMPT_TOTAL_UPDATE, rows: [] },
    { match: FLIP_MATCH, rows: [] },
    // the gate surface — the ledger is STATEFUL: the stamp appends with the
    // atomically-computed ordinal (count+1), mirroring INSERT..SELECT
    { match: ADVISORY_MATCH, rows: [] },
    {
      match: PRIOR_MATCH,
      rows: [],
      rowsFor: () => parts.map((pid) => ({ question_part_id: pid, prior: events.filter((e) => e.question_part_id === pid).length })),
    },
    { match: ENTITLEMENT_MATCH, rows: opts.entitlement ?? [] },
    { match: POLICY_MATCH, rows: [], rowsFor: (p) => policies.filter((r) => r.tier === p[0]) },
    { match: USED_TODAY_MATCH, rows: [{ used: opts.usedToday ?? 0 }] },
    {
      match: STAMP_MATCH,
      rows: [],
      rowsFor: (params) => {
        if (stampThrows) {
          throw Object.assign(new Error('duplicate key value violates unique constraint "ux_ai_mark_events_learner_part_ordinal"'), { code: "23505" });
        }
        // params: [id, learner, question, attempt, answer, part, pipelineVersion, createdAt]
        const learner = String(params[1]);
        const part = String(params[5]);
        const ordinal = events.filter((e) => e.learner_id === learner && e.question_part_id === part).length + 1;
        events.push({ learner_id: learner, question_part_id: part, mark_ordinal: ordinal });
        return [];
      },
    },
    // feedback-source reads (acceptance (c) — the ungated surfaces)
    {
      match: RESULT_LATEST,
      rows: [{ id: "bb000000-0000-4000-8000-000000000001", answer_id: ANSWER_A, model_id: "glm-4.6", marks_awarded: 2, confidence: 0.9, validation_passed: true, breakdown: [], failure_reason: null }],
    },
    { match: FEEDBACK_SOURCE, rows: answers },
  ];
  return { events, routes };
}

function txShim(sql: ReturnType<typeof fakeSql>) {
  const wrapped = sql as ReturnType<typeof fakeSql> & {
    transaction: <T>(body: (tx: unknown) => Promise<T>) => Promise<T>;
    txCalls: number;
    rollbacks: number;
  };
  wrapped.txCalls = 0;
  wrapped.rollbacks = 0;
  wrapped.transaction = async <T>(body: (tx: unknown) => Promise<T>): Promise<T> => {
    wrapped.txCalls += 1;
    try {
      return await body(sql as unknown as Parameters<typeof body>[0]);
    } catch (e) {
      wrapped.rollbacks += 1;
      throw e;
    }
  };
  return wrapped;
}

// rebuild helper without the placeholder awkwardness
function buildService(sql: ReturnType<typeof fakeSql>, opts: { tx?: boolean } = {}) {
  const shim = opts.tx ? txShim(sql) : null;
  const module = buildSmartMarkModule(
    sql as never,
    okGenerator,
    { publishGraded: async () => false },
    FIXED_CLOCK,
    llmStub(),
    "VALIDATED_ONLY",
    shim ? (shim.transaction as never) : undefined,
  );
  return { student: module.student, shim };
}

// ── (a) the policy pin ──────────────────────────────────────────────────────

describe("DC-3 entitlement — the policy pin (a)", () => {
  test("row-absent learner = free: FIRST AI mark of a part passes (ordinal 1 stamped)", async () => {
    const { events, routes } = dc3Routes();
    const { student } = buildService(fakeSql(routes));
    const view = await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts).toHaveLength(1);
    expect(view.parts[0]!.validationPassed).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 });
  });

  test("free tier: the SECOND AI mark of the part is refused with the count disclosure; ledger untouched", async () => {
    const { events, routes } = dc3Routes({
      events: [{ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 }],
    });
    const { student } = buildService(fakeSql(routes));
    try {
      await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
      throw new Error("expected EntitlementError");
    } catch (e) {
      expect(e).toBeInstanceOf(EntitlementError);
      const err = e as EntitlementError;
      expect(err.message).toBe("Your first mark on this part is free -- re-marks need a paid plan.");
      expect(err.detail.reason).toBe("ENTITLEMENT_REMARK_NOT_ENTITLED");
      expect(err.detail.tier).toBe("free");
      expect(err.detail.parts).toHaveLength(1);
      expect(err.detail.parts[0]).toMatchObject({ partId: PART_A, priorMarks: 1, ordinal: 2 });
    }
    expect(events).toHaveLength(1); // the refused pass consumed nothing
  });

  test("paid tier (unlimited): first and second pass both pass; ordinals 1 then 2", async () => {
    const { events, routes } = dc3Routes({
      entitlement: [{ learner_id: LEARNER_ID, tier: "paid" }],
      policies: [{ tier: "paid", reMarksPerDay: null, unlimited: true }],
    });
    const { student } = buildService(fakeSql(routes));
    await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID); // the re-mark
    expect(events.map((e) => e.mark_ordinal).sort()).toEqual([1, 2]);
  });

  test("fail-closed: a tier whose policy row never shipped refuses (never a silent pass)", async () => {
    const { routes } = dc3Routes({
      entitlement: [{ learner_id: LEARNER_ID, tier: "trial" }],
      policies: [], // trial row unshipped (spec open question (a))
    });
    const { student } = buildService(fakeSql(routes));
    try {
      await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
      throw new Error("expected EntitlementError");
    } catch (e) {
      expect(e).toBeInstanceOf(EntitlementError);
      expect((e as EntitlementError).detail.reason).toBe("ENTITLEMENT_POLICY_UNCONFIGURED");
    }
  });

  test("trial law: re_marks_per_day meters UTC-day re-marks (allowed within quota, refused beyond)", async () => {
    // policy N=2, ledger already holds the first marks + 1 re-mark today
    const { events, routes } = dc3Routes({
      entitlement: [{ learner_id: LEARNER_ID, tier: "trial" }],
      policies: [{ tier: "trial", reMarksPerDay: 2, unlimited: false }],
      usedToday: 1,
      events: [
        { learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 },
        { learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 2 },
      ],
    });
    const { student } = buildService(fakeSql(routes));
    const view = await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID); // used 1 + 1 <= 2
    expect(view.parts[0]!.validationPassed).toBe(true);
    expect(events.filter((e) => e.mark_ordinal === 3)).toHaveLength(1);

    // now over quota: usedToday 2 + 1 > 2 → refused with the truthful count
    const { routes: routes2 } = dc3Routes({
      entitlement: [{ learner_id: LEARNER_ID, tier: "trial" }],
      policies: [{ tier: "trial", reMarksPerDay: 2, unlimited: false }],
      usedToday: 2,
      events: [
        { learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 },
        { learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 2 },
        { learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 3 },
      ],
    });
    const { student: student2 } = buildService(fakeSql(routes2));
    try {
      await student2.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
      throw new Error("expected EntitlementError");
    } catch (e) {
      expect(e).toBeInstanceOf(EntitlementError);
      const err = e as EntitlementError;
      expect(err.message).toBe("Your first mark on this part is free -- 0 re-marks left today.");
      expect(err.detail.reMarksUsedToday).toBe(2);
      expect(err.detail.reMarksPerDay).toBe(2);
    }
  });
});

// ── (b) the ordinal pin ─────────────────────────────────────────────────────

describe("DC-3 entitlement — the ordinal pin (b)", () => {
  test("scheme-revision bump = new part id → fresh bucket (ordinal 1 again); the old part's events survive", async () => {
    // the OLD scheme revision's ledger: part A marked once
    const preSeed: LedgerEvent[] = [{ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 }];
    // the bump: the attempt now carries a NEW part id (new question_version row)
    const { events, routes } = dc3Routes({ parts: [PART_B], events: preSeed });
    const { student } = buildService(fakeSql(routes));
    const view = await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts[0]!.validationPassed).toBe(true);
    // the new part started its own bucket at 1; the old part's row is intact
    expect(events.find((e) => e.question_part_id === PART_B)!.mark_ordinal).toBe(1);
    expect(events.find((e) => e.question_part_id === PART_A)).toMatchObject({ mark_ordinal: 1 });
    expect(events).toHaveLength(2);
  });

  test("ordinals are stamped by the path, never inferred: one event per marked part per pass", async () => {
    const { events, routes } = dc3Routes({ parts: [PART_A, PART_B] });
    const { student } = buildService(fakeSql(routes));
    await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.mark_ordinal === 1)).toBe(true);
  });
});

// ── (c) copy review — the gate meters only new marking work ────────────────

describe("DC-3 entitlement — copy review (c)", () => {
  test("explainFeedback never consults the entitlement tables (past marks + chat stay ungated)", async () => {
    const { routes } = dc3Routes({
      events: [{ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 }],
    });
    const sql = fakeSql(routes);
    const { student } = buildService(sql);
    const view = await student.explainFeedback(LEARNER_ID, ATTEMPT_ID, PART_A);
    expect(view.explanation).toContain("You earned 2 of 3");
    expect(sql.queries.some((q) => q.includes("mark_entitlement"))).toBe(false);
    expect(sql.queries.some((q) => q.includes("ai_mark_events"))).toBe(false);
  });

  test("SCHEME_NOT_VALIDATED results consume nothing (no marking work → no metering)", async () => {
    const { events, routes } = dc3Routes({
      validatedSchemes: [], // the engine's own refusal branch (race-window shape)
    });
    const sql = fakeSql(routes);
    const { student } = buildService(sql);
    const view = await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(view.parts[0]!.validationPassed).toBe(false);
    expect(view.parts[0]!.markingState).toBe("PENDING");
    expect(events).toHaveLength(0); // nothing was marked → nothing metered
    expect(sql.queries.some((q) => STAMP_MATCH.test(q))).toBe(false);
  });
});

// ── the envelope + wire laws ────────────────────────────────────────────────

describe("DC-3 entitlement — envelope + wire", () => {
  test("wired tx runner: gate+pass+stamp run in ONE transaction; a refusal rolls back", async () => {
    const { routes } = dc3Routes({
      events: [{ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 }], // re-mark on free
    });
    const sql = fakeSql(routes);
    const { student, shim } = buildService(sql, { tx: true });
    await expect(student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID)).rejects.toBeInstanceOf(EntitlementError);
    expect(shim!.txCalls).toBe(1);
    expect(shim!.rollbacks).toBe(1);
  });

  test("wired tx runner: a passing pass commits exactly once", async () => {
    const { routes } = dc3Routes();
    const sql = fakeSql(routes);
    const { student, shim } = buildService(sql, { tx: true });
    await student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID);
    expect(shim!.txCalls).toBe(1);
    expect(shim!.rollbacks).toBe(0);
  });

  test("fallback path: the unique-index collision surfaces as an honest 409", async () => {
    const { routes } = dc3Routes({ failStamps: true });
    const { student } = buildService(fakeSql(routes));
    await expect(student.smartMarkAttempt(LEARNER_ID, ATTEMPT_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  test("wire: 402 entitlement_required carries the count + reason detail", async () => {
    const { routes } = dc3Routes({
      events: [{ learner_id: LEARNER_ID, question_part_id: PART_A, mark_ordinal: 1 }],
    });
    const sql = fakeSql(routes);
    const module = buildSmartMarkModule(
      sql as never,
      okGenerator,
      { publishGraded: async () => false },
      FIXED_CLOCK,
      llmStub(),
      "VALIDATED_ONLY",
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("syllabai.auth" as never, { userId: LEARNER_ID } as never);
      await next();
    });
    app.route("/api/v1/learners/me/attempts", createStudentSmartMarkRouter(module));
    const res = await app.request(`/api/v1/learners/me/attempts/${ATTEMPT_ID}/smart-mark`, { method: "POST" });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("entitlement_required");
    expect(body.message).toBe("Your first mark on this part is free -- re-marks need a paid plan.");
    expect(body.detail.reason).toBe("ENTITLEMENT_REMARK_NOT_ENTITLED");
    expect(body.detail.parts[0].ordinal).toBe(2);
  });
});
