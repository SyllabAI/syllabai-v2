/**
 * T-MIG-102 fidelity pins — the learner-model WRITE path against the frozen
 * vectors (LearnerModelServiceTest.java @ 6cad6ef, 368 lines) + the w4
 * capture math the T-MIG-101 adjudication verified first-hand.
 *
 * Every numeric pin below is a FROZEN hand-derived constant, not a tautology:
 *   - 0.11313868613138686 = bktUpdate(0.1, false, {slip .1, guess .25, T .1})
 *     — the w4-state-practiced-200 capture's mastery EXACTLY (first attempt,
 *     wrong, four-option MCQ),
 *   - 0.8331298589765962 = the C1 long-gap vector (:145-173 — prior is the
 *     DECAYED anchor 0.9·e^(−180/365) = 0.5496293150633604, never the anchor),
 *   - 0.3571428571428572 = the decay-floor vector (:176-198 — a decade-gone
 *     0.15 anchor updates from l0 = 0.1),
 *   - 0.75 / 0.5 = the BDT strengthen/weaken vectors (:80-94/:64-78),
 *   - 0.9181818181818182 / 0.4 / 0.18256880733944955 / 0.2058823529411765 =
 *     the S2/ADR-033 format-pricing vectors (:307-367).
 */
import { describe, expect, test } from "bun:test";
import {
  updateOnAssessmentEvidence,
  bktUpdate,
  bdtUpdateOnCorrect,
  bdtUpdateOnTaggedDistractor,
  resolveBktParams,
  LEARNER_BKT_PAPER_DEFAULTS,
  type AssessmentEvidenceEvent,
  type ModelUpdateClock,
  type SqlFn,
} from "../../src/services/learner-model/model-update";
import { fakeSql, type Route } from "./helpers";

const LEARNER = "da30cee5-cb41-4565-9e8c-713894319ca8"; // the w4 capture identity
const NODE = "20000000-0000-0000-0000-000000000012"; // primary topic (the capture's skill row)
const SP1 = "20000000-0000-0000-0000-0000000000aa";
const SP2 = "20000000-0000-0000-0000-0000000000ab";
const MISCONCEPTION = "30000000-0000-0000-0000-000000000001"; // the capture's misconception
const WHEN = "2026-10-05T15:48:32.549788Z"; // the capture's lastPracticedAt

const CLOCK: ModelUpdateClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => new Date("2026-10-05T15:50:00Z"),
};

// ── stub routes (the listener's exact statement set) ──────────────────────

const SKILL_SELECT =
  /select mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = \? and node_id = \?/;
const SKILL_INSERT = /insert into skill_states/;
const SKILL_UPDATE = /update skill_states set mastery/;
const MISCONCEPTION_SELECT =
  /select probability, evidence_count from misconception_states where learner_id = \? and misconception_node_id = \?/;
const MISCONCEPTION_INSERT = /insert into misconception_states/;
const MISCONCEPTION_UPDATE = /update misconception_states set probability/;
const FLUENCY_EXISTS = /select id from skill_states where learner_id = \? and node_id = \?/;
const FLUENCY_AGGREGATE = /select a\.timed_condition as timed, count\(\*\) as total/;
const FLUENCY_UPDATE = /update skill_states set procedural_fluency_gap/;

/** Captures bound params per matched statement kind. */
function listenerRoutes(opts: {
  skillRow?: Record<string, unknown> | null; // null -> fresh (empty select)
  skillRowFor?: (nodeId: string) => Record<string, unknown> | null;
  misconceptionRow?: Record<string, unknown> | null;
  fluencyExists?: boolean;
  fluencyRows?: Array<Record<string, unknown>>;
} = {}) {
  const captured = {
    skillInsert: [] as unknown[][],
    skillUpdate: [] as unknown[][],
    misconceptionInsert: [] as unknown[][],
    misconceptionUpdate: [] as unknown[][],
    fluencyUpdate: [] as unknown[][],
  };
  const routes: Array<Route & { kind: string }> = [
    {
      kind: "skillSelect",
      match: SKILL_SELECT,
      rows: [],
      rowsFor: (p) => {
        const node = String(p[1]);
        const row = opts.skillRowFor
          ? opts.skillRowFor(node)
          : opts.skillRow === undefined
            ? null
            : opts.skillRow;
        return row ? [row] : [];
      },
    },
    {
      kind: "skillInsert",
      match: SKILL_INSERT,
      rows: [],
      rowsFor: (p) => {
        captured.skillInsert.push(p);
        return [];
      },
    },
    {
      kind: "skillUpdate",
      match: SKILL_UPDATE,
      rows: [],
      rowsFor: (p) => {
        captured.skillUpdate.push(p);
        return [];
      },
    },
    {
      kind: "misconceptionSelect",
      match: MISCONCEPTION_SELECT,
      rows: [],
      rowsFor: () => (opts.misconceptionRow ? [opts.misconceptionRow] : []),
    },
    {
      kind: "misconceptionInsert",
      match: MISCONCEPTION_INSERT,
      rows: [],
      rowsFor: (p) => {
        captured.misconceptionInsert.push(p);
        return [];
      },
    },
    {
      kind: "misconceptionUpdate",
      match: MISCONCEPTION_UPDATE,
      rows: [],
      rowsFor: (p) => {
        captured.misconceptionUpdate.push(p);
        return [];
      },
    },
    {
      kind: "fluencyExists",
      match: FLUENCY_EXISTS,
      rows: [],
      rowsFor: () => (opts.fluencyExists === false ? [] : [{ id: "x" }]),
    },
    {
      kind: "fluencyAggregate",
      match: FLUENCY_AGGREGATE,
      rows: [],
      rowsFor: () => opts.fluencyRows ?? [],
    },
    {
      kind: "fluencyUpdate",
      match: FLUENCY_UPDATE,
      rows: [],
      rowsFor: (p) => {
        captured.fluencyUpdate.push(p);
        return [];
      },
    },
  ];
  return { sql: fakeSql(routes as Route[]) as unknown as SqlFn, captured, routes };
}

/** The w4 capture event: wrong first attempt, 4-option MCQ, tagged distractor. */
function w4Event(overrides: Partial<AssessmentEvidenceEvent> = {}): AssessmentEvidenceEvent {
  return {
    attemptId: "35f91760-15c7-4be2-9e92-527547d1ce32",
    learnerId: LEARNER,
    questionId: "40000000-0000-0000-0000-000000000001",
    primaryTopicNodeId: NODE,
    secondaryTopicNodeIds: [],
    specPointNodeIds: [],
    correct: false,
    expressedMisconceptionIds: [MISCONCEPTION],
    observedMisconceptionIds: [MISCONCEPTION],
    questionType: "MCQ_SINGLE",
    optionCount: 4,
    occurredAt: WHEN,
    ...overrides,
  };
}

describe("T-MIG-102 — the learner-model write path (frozen vectors @ 6cad6ef)", () => {
  test("the w4 capture vector: wrong first attempt writes the EXACT capture rows", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(sql, w4Event(), undefined, CLOCK);

    // BKT: one skill row — mastery 0.11313868613138686, attempts 1, correct 0
    expect(captured.skillInsert.length).toBe(1);
    const ins = captured.skillInsert[0]! as unknown[];
    expect(ins[2]).toBe(NODE); // node_id
    expect(ins[3]).toBe(0.11313868613138686); // mastery — the capture's P0 EXACTLY
    expect(ins[4]).toBe(1); // attempts
    expect(ins[5]).toBe(0); // correct_count
    expect(ins[6]).toBe("2026-10-05T15:48:32.549Z"); // last_practiced_at = the event instant (JS Date ms precision — the disclosed state.ts precision note)

    // BDT: one misconception row — 0.75 anchor, evidenceCount 1
    expect(captured.misconceptionInsert.length).toBe(1);
    const mins = captured.misconceptionInsert[0]! as unknown[];
    expect(mins[2]).toBe(MISCONCEPTION);
    expect(mins[3]).toBe(0.75); // 0.3*0.7/(0.3*0.7 + 0.7*0.1) — the capture's anchor
    expect(mins[4]).toBe(1); // evidence_count

    // fluency: the fresh row exists in the persistence context (frozen JPA
    // auto-flush parity) — the aggregate sees one untimed attempt only -> gap null
    expect(captured.fluencyUpdate.length).toBe(1);
    expect(captured.fluencyUpdate[0]![0]).toBeNull(); // procedural_fluency_gap
  });

  test("C1 long gap: the prior is the DECAYED anchor — 180-day return at 0.9 -> 0.8331298589765962", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: {
        mastery: 0.9,
        attempts: 3,
        correct_count: 2,
        last_practiced_at: "2026-04-08T15:48:32.549788Z", // WHEN - 180d
      },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ correct: true, expressedMisconceptionIds: [], observedMisconceptionIds: [] }),
      undefined,
      CLOCK,
    );
    // the update consumed 0.9·e^(−180/365) = 0.5496293150633604, then the BKT
    // correct path + T — NOT the legacy 0.9731 that erased the gap
    expect(captured.skillUpdate.length).toBe(1);
    expect(captured.skillUpdate[0]![0]).toBe(0.8331298589765962);
    expect(captured.skillUpdate[0]![1]).toBe(4); // attempts + 1
    expect(captured.skillUpdate[0]![2]).toBe(3); // correct_count + 1
    expect(captured.skillUpdate[0]![3]).toBe("2026-10-05T15:48:32.549Z"); // last_practiced_at = when (ms precision)
  });

  test("C1 decay floor: a decade-gone 0.15 anchor updates from l0 — 0.3571428571428572", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: {
        mastery: 0.15,
        attempts: 1,
        correct_count: 0,
        last_practiced_at: "2016-10-07T15:48:32.549788Z", // WHEN - 3650d, low band tau 30d
      },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ correct: true, expressedMisconceptionIds: [], observedMisconceptionIds: [] }),
      undefined,
      CLOCK,
    );
    expect(captured.skillUpdate[0]![0]).toBe(0.3571428571428572);
  });

  test("C1 clock skew: evidence older than the anchor clamps to the anchor — never a gain", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: {
        mastery: 0.77,
        attempts: 2,
        correct_count: 2,
        last_practiced_at: "2026-10-05T16:48:32.549788Z", // WHEN + 1h
      },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ correct: true, expressedMisconceptionIds: [], observedMisconceptionIds: [] }),
      undefined,
      CLOCK,
    );
    // prior = anchor 0.77 (no decay) — the posterior of the plain 0.77 update
    expect(captured.skillUpdate[0]![0]).toBe(bktUpdate(0.77, true, resolveBktParams(null, 0)));
  });

  test("BDT correct weakens every monitored misconception (0.75 -> 0.5, evidenceCount 2)", async () => {
    const { sql, captured } = listenerRoutes({
      misconceptionRow: { probability: 0.75, evidence_count: 1 },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ correct: true, expressedMisconceptionIds: [], observedMisconceptionIds: [MISCONCEPTION] }),
      undefined,
      CLOCK,
    );
    expect(captured.misconceptionUpdate.length).toBe(1);
    expect(captured.misconceptionUpdate[0]![0]).toBe(0.5); // 0.75*0.3/(0.75*0.3 + 0.25*0.9)
    expect(captured.misconceptionUpdate[0]![1]).toBe(2); // evidence_count + 1
    expect(captured.skillUpdate.length).toBe(0); // correct -> no misconception INSERT either
    expect(captured.misconceptionInsert.length).toBe(0);
  });

  test("a wrong answer on an untagged distractor is neutral — no misconception writes", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ expressedMisconceptionIds: [], observedMisconceptionIds: [MISCONCEPTION] }),
      undefined,
      CLOCK,
    );
    expect(captured.misconceptionInsert.length).toBe(0);
    expect(captured.misconceptionUpdate.length).toBe(0);
  });

  test("a correct answer with no monitored misconceptions updates nothing", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ correct: true, expressedMisconceptionIds: [], observedMisconceptionIds: [] }),
      undefined,
      CLOCK,
    );
    expect(captured.misconceptionInsert.length).toBe(0);
    expect(captured.misconceptionUpdate.length).toBe(0);
  });

  test("spec points ride the same evidence class — NODE first, then SP1, SP2 (frozen :221-244)", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({
        correct: true,
        expressedMisconceptionIds: [],
        observedMisconceptionIds: [],
        specPointNodeIds: [SP1, SP2],
      }),
      undefined,
      CLOCK,
    );
    expect(captured.skillInsert.map((p) => p[2])).toEqual([NODE, SP1, SP2]);
    for (const p of captured.skillInsert) {
      expect(p[4]).toBe(1); // attempts
      expect(p[5]).toBe(1); // correctCount
    }
  });

  test("a spec point that IS the topic node is deduped — one update per node per attempt", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({
        correct: true,
        expressedMisconceptionIds: [],
        observedMisconceptionIds: [],
        specPointNodeIds: [NODE],
      }),
      undefined,
      CLOCK,
    );
    expect(captured.skillInsert.length).toBe(1);
    expect(captured.skillInsert[0]![2]).toBe(NODE);
  });

  // ── S2/ADR-033 format-aware emission pins (frozen :307-367) ───────────────

  test("structured-correct is fully credited: l0 0.1 reads 0.9181818181818182 (2.57x)", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({
        correct: true,
        expressedMisconceptionIds: [],
        observedMisconceptionIds: [],
        questionType: "STRUCTURED",
        optionCount: 0,
      }),
      undefined,
      CLOCK,
    );
    expect(captured.skillInsert[0]![3]).toBe(0.9181818181818182);
  });

  test("five-option MCQ: correct from l0 0.1 reads exactly 0.4 (guess 1/5)", async () => {
    const { sql, captured } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({
        correct: true,
        expressedMisconceptionIds: [],
        observedMisconceptionIds: [],
        optionCount: 5,
      }),
      undefined,
      CLOCK,
    );
    expect(captured.skillInsert[0]![3]).toBe(0.4);
  });

  test("a wrong structured answer is not over-forgiven: prior 0.5 -> 0.18256880733944955", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: { mastery: 0.5, attempts: 1, correct_count: 1, last_practiced_at: WHEN },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ questionType: "STRUCTURED", optionCount: 0 }),
      undefined,
      CLOCK,
    );
    expect(captured.skillUpdate[0]![0]).toBe(0.18256880733944955);
  });

  test("untyped wrong keeps the legacy path (0.2058823529411765) — strict refinement", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: { mastery: 0.5, attempts: 1, correct_count: 1, last_practiced_at: WHEN },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ questionType: null, optionCount: 0 }),
      undefined,
      CLOCK,
    );
    expect(captured.skillUpdate[0]![0]).toBe(0.2058823529411765);
  });

  test("C3 behaviour pin: a malformed 1-option MCQ degrades to the paper path, never inverts", async () => {
    const { sql, captured } = listenerRoutes({
      skillRow: { mastery: 0.5, attempts: 1, correct_count: 1, last_practiced_at: WHEN },
    });
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ optionCount: 1 }),
      undefined,
      CLOCK,
    );
    expect(captured.skillUpdate[0]![0]).toBe(0.2058823529411765);
  });

  // ── fluency gap (Paper B §16 / frozen :180-203) ───────────────────────────

  test("fluency gap: both conditions observed -> untimed - timed (F-162)", async () => {
    const { sql, captured } = listenerRoutes({
      fluencyRows: [
        { timed: false, total: 4, correct: 3 }, // untimed 0.75
        { timed: true, total: 2, correct: 1 }, // timed 0.5
      ],
    });
    await updateOnAssessmentEvidence(sql, w4Event(), undefined, CLOCK);
    expect(captured.fluencyUpdate[0]![0]).toBe(0.25);
  });

  test("fluency gap: one condition only -> null (the capture's posture)", async () => {
    const { sql, captured } = listenerRoutes({
      fluencyRows: [{ timed: false, total: 1, correct: 0 }],
    });
    await updateOnAssessmentEvidence(sql, w4Event(), undefined, CLOCK);
    expect(captured.fluencyUpdate[0]![0]).toBeNull();
  });

  test("fluency stays TOPIC-scoped — spec points get no aggregate", async () => {
    const { sql } = listenerRoutes();
    await updateOnAssessmentEvidence(
      sql,
      w4Event({ specPointNodeIds: [SP1] }),
      undefined,
      CLOCK,
    );
    const aggregates = (sql as unknown as { queries: string[] }).queries.filter((q) =>
      FLUENCY_AGGREGATE.test(q),
    );
    expect(aggregates.length).toBe(1); // the topic node only
  });

  // ── pure-engine cross-pins (the corpus math is the engine math) ──────────

  test("engine parity: the w4 capture constants fall out of the pure functions", () => {
    const fourOption = resolveBktParams("MCQ_SINGLE", 4);
    expect(fourOption.guess).toBe(0.25); // 1/4 — the paper constant IS N=4
    expect(bktUpdate(0.1, false, fourOption)).toBe(0.11313868613138686);
    expect(bdtUpdateOnTaggedDistractor(0.3, { ...LEARNER_BKT_PAPER_DEFAULTS, prior: 0.3, selectIfHeld: 0.7, selectIfNotHeld: 0.1, activeThreshold: 0.5, stalenessTauDays: 180 })).toBe(0.75);
    expect(bdtUpdateOnCorrect(0.75, { ...LEARNER_BKT_PAPER_DEFAULTS, prior: 0.3, selectIfHeld: 0.7, selectIfNotHeld: 0.1, activeThreshold: 0.5, stalenessTauDays: 180 })).toBe(0.5);
  });

  test("guess clamp: the resolved guess never reaches 1 - slip (degrade, never invert)", () => {
    const absurd = { ...LEARNER_BKT_PAPER_DEFAULTS, guess: 0.9 };
    expect(resolveBktParams(null, 0, absurd).guess).toBeLessThan(1 - 0.1);
  });
});
