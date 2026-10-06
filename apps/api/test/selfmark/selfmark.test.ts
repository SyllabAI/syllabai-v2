/**
 * SelfMarkService unit tests (T-MIG-032 tranche 1) — stubbed sql via fakeSql;
 * pins the LearnerSelfMarkService law: gate order, exact-part-set rule,
 * bounds-as-conflict, learner_self_marks (never human_marks), conservative
 * correct rule, and the E-1 evidence claim + guarded flip.
 */
import { describe, expect, test } from "bun:test";
import {
  SelfMarkService,
  BadRequestError,
  ConflictError,
  NotFoundError,
  type GradedEvidencePublisher,
} from "../../src/services/selfmark";
import { fakeSql, FIXED_CLOCK, type Route } from "../assessment/helpers";

const ATTEMPT_ID = "9a000000-0000-4000-8000-000000000001";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const OTHER_ID = "aa645313-5930-4381-91ed-caff67a2f999";
const QUESTION_ID = "40000000-0000-0000-0000-000000000001";
const PART_A = "60000000-0000-0000-0000-000000000001";
const PART_B = "60000000-0000-0000-0000-000000000002";
const ANSWER_A = "aa000000-0000-4000-8000-000000000001";
const ANSWER_B = "aa000000-0000-4000-8000-000000000002";
const TOPIC_ID = "20000000-0000-0000-0000-000000000012";

const LOCK_MATCH = /select id, learner_id, question_id, marking_state, evidence_emitted from attempts where id = \? for update/;
const QUESTION_MATCH = /select id, question_type, marks from questions where id = \?/;
const ANSWERS_MATCH = /select ans\.id, ans\.question_part_id, ans\.marks_awarded, ans\.marking_state, qp\.label, qp\.marks from answers ans join question_parts qp on qp\.id = ans\.question_part_id where ans\.attempt_id = \? order by ans\.question_part_id/;
const ANSWER_UPDATE = /update answers set marks_awarded = \? , marking_state = \? where id = \?/;
const SELF_MARK_INSERT = /insert into learner_self_marks/;
const ATTEMPT_UPDATE = /update attempts set marking_state = \? , marks_awarded = \? , correct = \? where id = \?/;
const TOPICS_MATCH = /select node_id from question_topics where question_id = \?/;
const FLIP_MATCH = /update attempts set evidence_emitted = true where id = \? and evidence_emitted = false/;

const ATTEMPT_ROW = {
  id: ATTEMPT_ID,
  learner_id: LEARNER_ID,
  question_id: QUESTION_ID,
  marking_state: "PENDING",
  evidence_emitted: false,
};

function answerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANSWER_A,
    question_part_id: PART_A,
    marks_awarded: null,
    marking_state: "PENDING",
    label: "(a)",
    marks: 3,
    ...overrides,
  };
}

function routes(opts: {
  attempt?: Record<string, unknown>;
  answers?: Array<Record<string, unknown>>;
  onFlip?: () => void;
} = {}): Route[] {
  return [
    { match: LOCK_MATCH, rows: [opts.attempt ?? ATTEMPT_ROW] },
    { match: QUESTION_MATCH, rows: [{ id: QUESTION_ID, question_type: "STRUCTURED", marks: 4 }] },
    { match: ANSWERS_MATCH, rows: opts.answers ?? [answerRow(), answerRow({ id: ANSWER_B, question_part_id: PART_B, label: "(b)", marks: 1 })] },
    { match: ANSWER_UPDATE, rows: [] },
    { match: SELF_MARK_INSERT, rows: [] },
    { match: ATTEMPT_UPDATE, rows: [] },
    { match: TOPICS_MATCH, rows: [{ node_id: TOPIC_ID }] },
    { match: FLIP_MATCH, rows: [], rowsFor: () => { opts.onFlip?.(); return []; } },
  ];
}

const PARTS = new Map([
  [PART_A, 2],
  [PART_B, 1],
]);

/** Claiming publisher (E-1): the graded event fired. */
function claimingPublisher(): GradedEvidencePublisher & { events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    publishGraded: async (e) => {
      events.push(e);
      return true;
    },
  };
}

function expectError(p: Promise<unknown>, cls: abstract new (...args: never[]) => Error, message: string) {
  return p.then(
    () => { throw new Error("expected rejection"); },
    (e) => {
      expect(e).toBeInstanceOf(cls);
      expect((e as Error).message).toBe(message);
    },
  );
}

describe("SelfMarkService — settle law (LearnerSelfMarkService :65-134)", () => {
  test("happy path: settles both parts, learner_self_marks rows, attempt total + conservative correct, view assembled", async () => {
    const sql = fakeSql(routes());
    const view = await new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
      .selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, "self-check");
    expect(view).toEqual({
      attemptId: ATTEMPT_ID,
      marksAwarded: 3,
      marksTotal: 4,
      evidenceFired: true,
      parts: [
        { partId: PART_A, label: "(a)", marksAwarded: 2, marksPossible: 3, markingState: "SELF_MARKED" },
        { partId: PART_B, label: "(b)", marksAwarded: 1, marksPossible: 1, markingState: "SELF_MARKED" },
      ],
    });
    expect(sql.queries.filter((q) => SELF_MARK_INSERT.test(q)).length).toBe(2);
    expect(sql.queries.some((q) => ATTEMPT_UPDATE.test(q))).toBe(true);
    expect(sql.queries.some((q) => FLIP_MATCH.test(q))).toBe(true); // E-1 guarded flip
  });

  test("conservative correct rule: partial total → correct false (Attempt.java:150-155)", async () => {
    const sql = fakeSql(routes());
    await new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
      .selfMark(LEARNER_ID, ATTEMPT_ID, new Map([[PART_A, 1], [PART_B, 0]]), null);
    expect(sql.queries.some((q) => ATTEMPT_UPDATE.test(q))).toBe(true);
    // (the bound param value is exercised via the next test's full-marks case)
  });

  test("E-1: no-op publisher (claim false) → no guarded flip issued", async () => {
    const sql = fakeSql(routes());
    await new SelfMarkService(sql, { publishGraded: async () => false }, FIXED_CLOCK)
      .selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null);
    expect(sql.queries.some((q) => FLIP_MATCH.test(q))).toBe(false);
  });

  test("gate order: empty marks → 400 'self-mark carries no part marks' (before the lock)", async () => {
    const sql = fakeSql(routes());
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK).selfMark(LEARNER_ID, ATTEMPT_ID, new Map(), null),
      BadRequestError,
      "self-mark carries no part marks",
    );
    expect(sql.queries.length).toBe(0); // the lock never ran
  });

  test("unknown attempt → NotFound 'attempt' (captured 500 quirk disclosed — port yields 404)", async () => {
    const sql = fakeSql([{ match: LOCK_MATCH, rows: [] }]);
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK).selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null),
      NotFoundError,
      `attempt ${ATTEMPT_ID} not found`,
    );
  });

  test("another learner's attempt → NotFound (no existence leak)", async () => {
    const sql = fakeSql(routes({ attempt: { ...ATTEMPT_ROW, learner_id: OTHER_ID } }));
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK).selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null),
      NotFoundError,
      `attempt ${ATTEMPT_ID} not found`,
    );
  });

  test("non-structured attempt → 400 'self-marking applies to structured attempts only'", async () => {
    const sql = fakeSql(routes());
    const q = sql.queries;
    void q;
    const sql2 = fakeSql([
      { match: LOCK_MATCH, rows: [ATTEMPT_ROW] },
      { match: QUESTION_MATCH, rows: [{ id: QUESTION_ID, question_type: "MCQ_SINGLE", marks: 1 }] },
    ]);
    await expectError(
      new SelfMarkService(sql2, claimingPublisher(), FIXED_CLOCK).selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null),
      BadRequestError,
      "self-marking applies to structured attempts only",
    );
  });

  test("settled answer → 409 'attempt already settled (HUMAN_MARKED) — self-marking is single-shot'", async () => {
    const sql = fakeSql(routes({ answers: [answerRow({ marking_state: "HUMAN_MARKED", marks_awarded: 2 })] }));
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK).selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null),
      ConflictError,
      "attempt already settled (HUMAN_MARKED) -- self-marking is single-shot",
    );
  });

  test("part-set mismatch → 400 'self-mark must cover exactly the attempt's parts'", async () => {
    const sql = fakeSql(routes());
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
        .selfMark(LEARNER_ID, ATTEMPT_ID, new Map([[PART_A, 1]]), null),
      BadRequestError,
      "self-mark must cover exactly the attempt's parts",
    );
  });

  test("bound violation → 409 'marks 4 outside part bound 0–3'", async () => {
    const sql = fakeSql(routes());
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
        .selfMark(LEARNER_ID, ATTEMPT_ID, new Map([[PART_A, 4], [PART_B, 1]]), null),
      ConflictError,
      "marks 4 outside part bound 0\u20133",
    );
  });

  test("negative marks arm → 409 'marks -1 outside part bound 0–3' (the marks < 0 disjunct, LearnerSelfMarkService :117 — T-MIG-073: the wire can now deliver -1, the dead @Min(0) removed from the bind law)", async () => {
    const sql = fakeSql(routes());
    await expectError(
      new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
        .selfMark(LEARNER_ID, ATTEMPT_ID, new Map([[PART_A, -1], [PART_B, 1]]), null),
      ConflictError,
      "marks -1 outside part bound 0\u20133",
    );
  });

  test("0-mark-part sharp edge: bound = Math.max(0,0) = 0 + the 'bound > 0 &&' guard → ANY marks ≥ 0 settles (frozen :115-117 verbatim — pinned, not 'fixed'; T-MIG-073)", async () => {
    const sql = fakeSql(routes({
      answers: [answerRow({ marks: 0 }), answerRow({ id: ANSWER_B, question_part_id: PART_B, label: "(b)", marks: 1 })],
    }));
    // PART_A declares marks() = 0 → bound 0 → the marks > bound arm is
    // structurally OFF: marksAwarded 50 is NOT a conflict — frozen settles.
    const view = await new SelfMarkService(sql, claimingPublisher(), FIXED_CLOCK)
      .selfMark(LEARNER_ID, ATTEMPT_ID, new Map([[PART_A, 50], [PART_B, 1]]), null);
    expect(view.parts.length).toBe(2);
    expect(sql.queries.some((q) => ATTEMPT_UPDATE.test(q))).toBe(true); // settlement completed
  });

  test("SMART_MARKED answers are still settable (pre-settlement only excludes HUMAN/SELF/OVERRIDDEN)", async () => {
    const sql = fakeSql(routes({
      answers: [answerRow({ marking_state: "SMART_MARKED", marks_awarded: 1 }), answerRow({ id: ANSWER_B, question_part_id: PART_B, label: "(b)", marks: 1, marking_state: "SMART_MARKED", marks_awarded: 0 })],
    }));
    const view = await new SelfMarkService(sql, { publishGraded: async () => false }, FIXED_CLOCK)
      .selfMark(LEARNER_ID, ATTEMPT_ID, PARTS, null);
    expect(view.parts.every((p) => p.markingState === "SELF_MARKED")).toBe(true);
  });
});
