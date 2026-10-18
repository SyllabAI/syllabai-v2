/**
 * T-MIG-131 fidelity pins — the struggle-inference WRITE path (the frozen
 * StruggleInferenceService diagnosis engine @ 6cad6ef, rules-v0.2).
 *
 * Every probability pin below is a FROZEN hand-derived constant, not a
 * tautology:
 *   - 0.70 = clamp(0.55 + (0.50 - 0.35), 0.55, 0.95) — the prereq-gap vector
 *     (:82) for a weakest prerequisite at mastery 0.35,
 *   - 0.95 = the clamp ceiling — mastery 0.0 (1.05) and fluency gap 0.60
 *     (1.10) both pin the ceiling (:82/:96),
 *   - 0.65 = the fluency boundary vector — gap EXACTLY 0.15 fires
 *     (the guard is `< 0.15` returns, :94),
 *   - 0.80 = the fixed self-doubt probability (:41, :62-63).
 */
import { describe, expect, test } from "bun:test";
import {
  inferStrugglesOnAssessmentEvidence,
  prerequisiteChain,
  STRUGGLE_MODEL_VERSION,
  STRUGGLE_EXPIRY_DAYS,
  type StruggleEvidenceEvent,
} from "../../src/services/learner-model/struggle-inference";
import { createLearnerModelEvidencePublisher } from "../../src/routes/assessment/index";
import type { ModelUpdateClock } from "../../src/services/learner-model/model-update";
import { fakeSql, type Route } from "./helpers";

const LEARNER = "00000000-0000-4000-8000-000000000041";
const TOPIC = "20000000-0000-0000-0000-000000000011";
const TOPIC2 = "20000000-0000-0000-0000-000000000012";
const PREREQ_A = "20000000-0000-0000-0000-0000000000a1";
const PREREQ_B = "20000000-0000-0000-0000-0000000000a2";
const ATTEMPT = "40000000-0000-4000-8000-000000000001";
const OCCURRED = "2026-10-05T15:48:32.549788Z"; // the w4 capture instant
// JS Date = millisecond precision (the frozen core kept Instant nanos — the
// v2 wire convention disclosed at the same precision everywhere else:
// model-update passes event.occurredAt through new Date() identically).
const GENERATED = "2026-10-05T15:48:32.549Z";
const EXPIRES = "2026-10-12T15:48:32.549Z"; // + Duration.ofDays(7), EXACT

const CLOCK: ModelUpdateClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => new Date("2026-10-05T15:50:00Z"), // NOT the generated_at law — event.at wins
};

// ── stub routes (the engine's exact statement set) ────────────────────────

const STATES_SELECT =
  /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states where learner_id = \? order by last_practiced_at desc/;
const CLOSURE_SELECT =
  /with recursive prereq as \(.+REQUIRES_PREREQUISITE.+depth < 10.+\) select p\.node_id, max\(p\.depth\) as depth, n\.code, n\.title from prereq p join knowledge_nodes n on n\.id = p\.node_id group by p\.node_id, n\.code, n\.title order by depth desc, p\.node_id/;
const PRIOR_SELECT =
  /select id from struggle_inferences where learner_id = \? and topic_node_id = \? and type = \? and expires_at > \? and superseded_at is null/;
const SUPERSEDE_UPDATE =
  /update struggle_inferences set superseded_at = \? where id = \? and superseded_at is null/;
const STRUGGLE_INSERT = /insert into struggle_inferences/;

function engineRoutes(opts: {
  stateRows?: Array<Record<string, unknown>>;
  closureRows?: Array<Record<string, unknown>>;
  priorIds?: string[];
} = {}) {
  const captured = {
    supersede: [] as unknown[][],
    inserts: [] as unknown[][],
    closureQueries: 0,
  };
  const routes: Array<Route & { kind: string }> = [
    { kind: "states", match: STATES_SELECT, rows: opts.stateRows ?? [] },
    {
      kind: "closure",
      match: CLOSURE_SELECT,
      rows: opts.closureRows ?? [],
      rowsFor: (params) => {
        void params;
        return opts.closureRows ?? [];
      },
    },
    { kind: "prior", match: PRIOR_SELECT, rows: (opts.priorIds ?? []).map((id) => ({ id })) },
    { kind: "supersede", match: SUPERSEDE_UPDATE, rows: [] },
    { kind: "insert", match: STRUGGLE_INSERT, rows: [] },
  ];
  const sql = fakeSql(routes);
  const realFn = sql as unknown as (
    strings: TemplateStringsArray,
    ...params: unknown[]
  ) => Promise<Array<Record<string, unknown>>>;
  // intercept the capture kinds (fakeSql dispatches; we mirror-capture here)
  const wrapped = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    if (CLOSURE_SELECT.test(text)) captured.closureQueries++;
    if (SUPERSEDE_UPDATE.test(text)) captured.supersede.push(params);
    if (STRUGGLE_INSERT.test(text)) captured.inserts.push(params);
    return realFn(strings, ...params);
  }) as unknown as typeof sql;
  // the live query log (fakeSql pushes into this same array)
  (wrapped as unknown as { queries: string[] }).queries = sql.queries;
  return { sql: wrapped, captured };
}

function event(overrides: Partial<StruggleEvidenceEvent> = {}): StruggleEvidenceEvent {
  return {
    attemptId: ATTEMPT,
    learnerId: LEARNER,
    primaryTopicNodeId: TOPIC,
    secondaryTopicNodeIds: [],
    selfDoubtFlag: false,
    occurredAt: OCCURRED,
    ...overrides,
  };
}

/** The insert params, positionally: (id, learner, topic, type, subtype, p, evidence, model, generated, expires). */
function insertOf(captured: { inserts: unknown[][] }, index = 0) {
  expect(captured.inserts.length).toBeGreaterThan(index);
  const p = captured.inserts[index]!;
  return {
    learnerId: p[1],
    topicId: p[2],
    type: p[3],
    subtype: p[4],
    probability: p[5],
    evidence: JSON.parse(p[6] as string),
    modelVersion: p[7],
    generatedAt: p[8],
    expiresAt: p[9],
  };
}

// ── the prerequisite-gap rule (:67-89) ────────────────────────────────────

describe("T-MIG-131 struggle-inference writer", () => {
  test("prerequisite gap: weakest prereq mastery 0.35 -> p 0.70, codes in evidence", async () => {
    const { sql, captured } = engineRoutes({
      stateRows: [
        { node_id: PREREQ_A, mastery: 0.35, attempts: 2, correct_count: 0, last_practiced_at: OCCURRED, procedural_fluency_gap: null },
      ],
      closureRows: [
        { node_id: PREREQ_A, depth: 1, code: "WCH11-1.1", title: "Wave calculations" },
        { node_id: PREREQ_B, depth: 2, code: "WCH11-1.2", title: "Wave basics" },
      ],
    });
    await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
    expect(captured.inserts.length).toBe(1);
    const row = insertOf(captured);
    expect(row.learnerId).toBe(LEARNER);
    expect(row.topicId).toBe(TOPIC);
    expect(row.type).toBe("PREREQUISITE_GAP");
    expect(row.subtype).toBe("1a_weak_prerequisite_mastery");
    // the frozen double EXACT: IEEE 754 gives 0.55 + (0.5 - 0.35) =
    // 0.7000000000000001 — the Java engine produced the identical double.
    expect(row.probability).toBe(0.55 + (0.5 - 0.35));
    expect(row.evidence.signal).toBe("weak_prerequisite_mastery");
    expect(row.evidence.weakest_mastery).toBe(0.35);
    expect(row.evidence.prerequisite_count).toBe(1);
    expect(row.evidence.prerequisite_codes).toEqual(["WCH11-1.1"]);
    expect(row.modelVersion).toBe("rules-v0.2");
    expect(STRUGGLE_MODEL_VERSION).toBe("rules-v0.2");
  });

  test("prerequisite gap: mastery 0.0 clamps to the 0.95 ceiling; unmeasured prereq is no evidence, never a crash", async () => {
    const { sql, captured } = engineRoutes({
      stateRows: [
        { node_id: PREREQ_A, mastery: 0.0, attempts: 1, correct_count: 0, last_practiced_at: OCCURRED, procedural_fluency_gap: null },
        // PREREQ_B has NO state row — filtered BEFORE pairing (:71-72)
      ],
      closureRows: [
        { node_id: PREREQ_A, depth: 1, code: "WCH11-1.1", title: "Wave calculations" },
        { node_id: PREREQ_B, depth: 2, code: "WCH11-1.2", title: "Wave basics" },
      ],
    });
    await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
    expect(captured.inserts.length).toBe(1);
    expect(insertOf(captured).probability).toBe(0.95);
    expect(insertOf(captured).evidence.prerequisite_count).toBe(1);
  });

  test("prerequisite gap: mastery 0.50 exactly is NOT weak (strict <), no row", async () => {
    const { sql, captured } = engineRoutes({
      stateRows: [
        { node_id: PREREQ_A, mastery: 0.5, attempts: 3, correct_count: 2, last_practiced_at: OCCURRED, procedural_fluency_gap: null },
      ],
      closureRows: [{ node_id: PREREQ_A, depth: 1, code: "WCH11-1.1", title: "Wave calculations" }],
    });
    await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
    expect(captured.inserts.length).toBe(0);
  });

  test("no prerequisite chain -> no row and no node fetch (the closure query never runs twice)", async () => {
    const { sql, captured } = engineRoutes({ closureRows: [] });
    await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
    expect(captured.closureQueries).toBe(1);
    expect(captured.inserts.length).toBe(0);
  });

  // ── the procedural-fluency rule (:91-98) ────────────────────────────────

  test("fluency: gap 0.20 -> p 0.70 EXAM_LITERACY; boundary gap 0.15 fires at 0.65; clamp ceiling 0.95", async () => {
    for (const [gap, expected] of [
      [0.2, 0.7],
      [0.15, 0.65],
      [0.6, 0.95],
    ] as const) {
      const { sql, captured } = engineRoutes({
        stateRows: [
          { node_id: TOPIC, mastery: 0.9, attempts: 5, correct_count: 5, last_practiced_at: OCCURRED, procedural_fluency_gap: gap },
        ],
      });
      await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
      expect(captured.inserts.length).toBe(1);
      const row = insertOf(captured);
      expect(row.type).toBe("EXAM_LITERACY");
      expect(row.subtype).toBe("3b_procedural_fluency");
      expect(row.probability).toBe(expected);
      expect(row.evidence).toEqual({ signal: "procedural_fluency_gap", gap });
    }
  });

  test("fluency: gap 0.14 and null gap never fire", async () => {
    for (const gap of [0.14, null]) {
      const { sql, captured } = engineRoutes({
        stateRows: [
          { node_id: TOPIC, mastery: 0.9, attempts: 5, correct_count: 5, last_practiced_at: OCCURRED, procedural_fluency_gap: gap },
        ],
      });
      await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
      expect(captured.inserts.length).toBe(0);
    }
  });

  // ── the metacognitive rule (:62-63) ─────────────────────────────────────

  test("self-doubt: fixed p 0.80, attempt_id in the evidence, generated_at = the EVENT instant (not the clock)", async () => {
    const { sql, captured } = engineRoutes();
    await inferStrugglesOnAssessmentEvidence(sql, event({ selfDoubtFlag: true }), CLOCK);
    expect(captured.inserts.length).toBe(1);
    const row = insertOf(captured);
    expect(row.type).toBe("METACOGNITIVE");
    expect(row.subtype).toBe("5a_self_efficacy");
    expect(row.probability).toBe(0.8);
    expect(row.evidence).toEqual({ signal: "self_doubt_flag", attempt_id: ATTEMPT });
    expect(row.generatedAt).toBe(GENERATED);
    expect(row.expiresAt).toBe(EXPIRES);
    expect(STRUGGLE_EXPIRY_DAYS).toBe(7);
  });

  test("no self-doubt flag -> no metacognitive row (honest-empty parity)", async () => {
    const { sql, captured } = engineRoutes();
    await inferStrugglesOnAssessmentEvidence(sql, event(), CLOCK);
    expect(captured.inserts.length).toBe(0);
  });

  // ── the firing scope (:59, EvidencePublisher.topicNodeIds :111-120) ─────

  test("topics: primary first + secondary deduped; a secondary dup of primary never double-fires", async () => {
    const { sql, captured } = engineRoutes({
      stateRows: [
        { node_id: TOPIC, mastery: 0.9, attempts: 5, correct_count: 5, last_practiced_at: OCCURRED, procedural_fluency_gap: 0.3 },
        { node_id: TOPIC2, mastery: 0.9, attempts: 5, correct_count: 5, last_practiced_at: OCCURRED, procedural_fluency_gap: 0.3 },
      ],
    });
    await inferStrugglesOnAssessmentEvidence(
      sql,
      event({ secondaryTopicNodeIds: [TOPIC, TOPIC2] }),
      CLOCK,
    );
    const topics = captured.inserts.map((p) => (p as unknown[])[2]);
    expect(topics).toEqual([TOPIC, TOPIC2]); // fluency fires per distinct topic
  });

  test("zero topics (anonymous/unmapped) -> zero reads, zero rows", async () => {
    const { sql, captured } = engineRoutes();
    await inferStrugglesOnAssessmentEvidence(
      sql,
      event({ primaryTopicNodeId: null, secondaryTopicNodeIds: [] }),
      CLOCK,
    );
    expect(captured.inserts.length).toBe(0);
    expect(captured.closureQueries).toBe(0);
    expect(sql.queries.length).toBe(1); // the states read only — then nothing
  });

  // ── the supersede law (save :100-114) ───────────────────────────────────

  test("supersede: prior ACTIVE row is stamped at the new generated_at, first-writer-kept, insert still lands", async () => {
    const { sql, captured } = engineRoutes({ priorIds: ["11111111-1111-1111-1111-111111111111"] });
    await inferStrugglesOnAssessmentEvidence(sql, event({ selfDoubtFlag: true }), CLOCK);
    expect(captured.supersede.length).toBe(1);
    expect(captured.supersede[0]![0]).toBe(GENERATED);
    expect(captured.supersede[0]![1]).toBe("11111111-1111-1111-1111-111111111111");
    expect(captured.inserts.length).toBe(1);
  });

  test("no prior active row -> no supersede update, insert only", async () => {
    const { sql, captured } = engineRoutes({ priorIds: [] });
    await inferStrugglesOnAssessmentEvidence(sql, event({ selfDoubtFlag: true }), CLOCK);
    expect(captured.supersede.length).toBe(0);
    expect(captured.inserts.length).toBe(1);
  });

  // ── the per-module closure read (PrerequisiteView parity) ───────────────

  test("prerequisiteChain: deepest-first with code and title", async () => {
    const { sql } = engineRoutes({
      closureRows: [
        { node_id: PREREQ_B, depth: 2, code: "WCH11-1.2", title: "Wave basics" },
        { node_id: PREREQ_A, depth: 1, code: "WCH11-1.1", title: "Wave calculations" },
      ],
    });
    const chain = await prerequisiteChain(sql, TOPIC);
    expect(chain.map((p) => p.id)).toEqual([PREREQ_B, PREREQ_A]);
    expect(chain[0]).toEqual({ id: PREREQ_B, code: "WCH11-1.2", title: "Wave basics", depth: 2 });
  });

  // ── the wiring order (the @Order(100) after the @Order(10) model) ───────

  test("publisher wiring: the struggle states read rides AFTER the model phases (post-update snapshot)", async () => {
    // The FULL live seam: registry read -> model phases -> struggle reads,
    // one fakeSql over both modules' statement sets (the minimal honest-empty
    // matrix: fresh skill row, no misconceptions, no fluency history, no
    // closure, no doubt).
    const queries: string[] = [];
    const routeSet: Route[] = [
      { match: /select version, params from model_versions/, rows: [] },
      { match: /select mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = \? and node_id = \?/, rows: [] },
      { match: /insert into skill_states/, rows: [] },
      { match: /select probability, evidence_count from misconception_states/, rows: [] },
      { match: /select id from skill_states where learner_id = \? and node_id = \?/, rows: [] },
      { match: /select a\.timed_condition as timed, count\(\*\) as total/, rows: [{ timed: 0, total: 0 }] },
      { match: /insert into telemetry_events/, rows: [] },
      { match: STATES_SELECT, rows: [] },
      { match: CLOSURE_SELECT, rows: [] },
      { match: PRIOR_SELECT, rows: [] },
      { match: SUPERSEDE_UPDATE, rows: [] },
      { match: STRUGGLE_INSERT, rows: [] },
    ];
    const sql = fakeSql(routeSet);
    const realFn = sql as unknown as (
      strings: TemplateStringsArray,
      ...params: unknown[]
    ) => Promise<Array<Record<string, unknown>>>;
    const wrapped = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
      queries.push(text);
      return realFn(strings, ...params);
    }) as unknown as typeof sql;

    const publisher = createLearnerModelEvidencePublisher(wrapped as never);
    await publisher.publishMcq({
      attemptId: ATTEMPT,
      learnerId: LEARNER,
      questionId: "40000000-0000-4000-8000-000000000002",
      chosenOptionId: "40000000-0000-4000-8000-000000000003",
      correct: false,
      marksAwarded: 0,
      primaryTopicNodeId: TOPIC,
      secondaryTopicNodeIds: [],
      specPointNodeIds: [],
      expressedMisconceptionIds: [],
      observedMisconceptionIds: [],
      questionType: "MCQ_SINGLE",
      optionCount: 4,
      selfDoubtFlag: false,
      occurredAt: OCCURRED,
    });

    const lastModelPhase = queries.findIndex((q) => /update skill_states set procedural_fluency_gap|insert into skill_states/.test(q));
    const struggleRead = queries.findIndex((q) => STATES_SELECT.test(q));
    expect(lastModelPhase).toBeGreaterThanOrEqual(0);
    expect(struggleRead).toBeGreaterThan(lastModelPhase);
    expect(queries.some((q) => /insert into struggle_inferences/.test(q))).toBe(false);
  });
});
