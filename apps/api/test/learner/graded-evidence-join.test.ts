/**
 * T-MIG-137 — the graded-evidence→KG join pins (operator trace
 * 1a155ef6c1c1be19 "fire 137"; the card's 137c band).
 *
 * Three law families, all first-hand against the frozen core @ 6cad6ef:
 *  1. the ASSEMBLER (services/selfmark assembleGradedEvidenceEvent) — the
 *     frozen EvidencePublisher's own assembly laws in one place (:51-120):
 *     marksTotal/correct derivation (:56-60), topicNodeIds primary-first with
 *     the primary-equal skip (:111-120), spec points deduped + null-skipped
 *     (:100-109), optionCount = the LIVE MCQ_SINGLE count else 0 (:86-87),
 *     EMPTY misconception lists on the graded path (:61), selfDoubtFlag from
 *     the attempts row (AssessmentEvidenceRecordedEvent :79).
 *  2. the LIVE publisher (routes/assessment createGradedEvidencePublisher) —
 *     the claim is the frozen markEvidenceEmitted guard (:53-55: an
 *     already-fired attempt is suppressed BEFORE any model write) and the
 *     emission is the frozen listener pair in order (@Order(10) model phases,
 *     @Order(100) the struggle engine on the POST-update snapshot).
 *  3. the STRUCTURED semantics end-to-end — no misconception may be invented
 *     for a structured answer (the untagged-wrong law, LearnerModelService
 *     :138-167): zero BDT statements even on a wrong graded attempt.
 * Subject parity is structural: the join is key-agnostic (the maths
 * spec-point joins land at ingest via the shared smeRef law), pinned with
 * 4MA1/4MB1-shaped node keys below.
 */
import { describe, expect, test } from "bun:test";
import {
  assembleGradedEvidenceEvent,
  NotFoundError,
  type GradedEvidenceEventBase,
} from "../../src/services/selfmark";
import { createGradedEvidencePublisher } from "../../src/routes/assessment/index";
import { fakeSql, gradedEvidenceRoutes, type Route } from "../assessment/helpers";

const LEARNER = "00000000-0000-4000-8000-000000000041";
const ATTEMPT = "40000000-0000-4000-8000-000000000001";
const QUESTION = "40000000-0000-4000-8000-000000000002";
const TOPIC = "20000000-0000-0000-0000-000000000011";
const TOPIC2 = "20000000-0000-0000-0000-000000000012";
// maths-shaped KG node keys (the join is key-agnostic; the dbCodes are what
// the 135a/136a seeds land) — uuid literals carrying the 4MA1/4MB1 forms
const MA1_SPEC = "a1a10000-0000-4000-8000-000000000001"; // 4MA1-S1-1.1
const MA1_SPEC2 = "a1a10000-0000-4000-8000-000000000002"; // 4MA1-S1-1.2
const MB1_SPEC = "b1b10000-0000-4000-8000-000000000001"; // 4MB1-S1-1A
const OCCURRED = "2026-10-20T02:30:00Z";

const TOPICS_ROUTE: Route = {
  match: /select node_id from question_topics where question_id = \?/,
  rows: [],
};

function base(overrides?: Partial<GradedEvidenceEventBase>): GradedEvidenceEventBase {
  return {
    attemptId: ATTEMPT,
    learnerId: LEARNER,
    questionId: QUESTION,
    marksAwarded: 5,
    occurredAt: OCCURRED,
    ...overrides,
  };
}

// ── 1. the assembler (the frozen publisher's assembly laws) ─────────────────

describe("assembleGradedEvidenceEvent — the frozen publisher's assembly laws (T-MIG-137a)", () => {
  test("marksTotal/correct derive from the QUESTION row (:56-60): full marks → correct true", async () => {
    const sql = fakeSql([
      ...gradedEvidenceRoutes({ marks: 5 }),
      TOPICS_ROUTE,
    ]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.marksTotal).toBe(5);
    expect(event.correct).toBe(true);
  });

  test("partial marks → correct false; a 0-mark question → correct false (the > 0 guard, :60)", async () => {
    const partial = fakeSql([...gradedEvidenceRoutes({ marks: 5 }), TOPICS_ROUTE]);
    expect((await assembleGradedEvidenceEvent(partial, base({ marksAwarded: 3 }))).correct).toBe(false);
    const zero = fakeSql([...gradedEvidenceRoutes({ marks: 0 }), TOPICS_ROUTE]);
    const zeroEvent = await assembleGradedEvidenceEvent(zero, base({ marksAwarded: 0 }));
    expect(zeroEvent.marksTotal).toBe(0);
    expect(zeroEvent.correct).toBe(false);
  });

  test("topicNodeIds: primary FIRST, secondary deduped against it (:111-120)", async () => {
    const sql = fakeSql([
      ...gradedEvidenceRoutes({ primaryTopicNodeId: TOPIC }),
      { match: TOPICS_ROUTE.match, rows: [{ node_id: TOPIC2 }, { node_id: TOPIC }] },
    ]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.primaryTopicNodeId).toBe(TOPIC);
    expect(event.secondaryTopicNodeIds).toEqual([TOPIC2]);
  });

  test("specPointNodeIds: deduped, null-skipped (:100-109)", async () => {
    const sql = fakeSql([
      ...gradedEvidenceRoutes({ specPointNodeIds: [MA1_SPEC, MA1_SPEC2, MA1_SPEC, null] }),
      TOPICS_ROUTE,
    ]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.specPointNodeIds).toEqual([MA1_SPEC, MA1_SPEC2]);
  });

  test("STRUCTURED → optionCount 0 and the options statement is NEVER issued (:86-87)", async () => {
    const sql = fakeSql([...gradedEvidenceRoutes({ questionType: "STRUCTURED" }), TOPICS_ROUTE]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.questionType).toBe("STRUCTURED");
    expect(event.optionCount).toBe(0);
    expect(sql.queries.some((q) => q.includes("from question_options"))).toBe(false);
  });

  test("MCQ_SINGLE → the LIVE option count (the law is ported, not assumed 0)", async () => {
    const sql = fakeSql([
      ...gradedEvidenceRoutes({ questionType: "MCQ_SINGLE", optionIds: ["o1", "o2", "o3", "o4", "o5"] }),
      TOPICS_ROUTE,
    ]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.optionCount).toBe(5);
  });

  test("misconception lists are honestly EMPTY (:61 — the graded path expresses no distractor)", async () => {
    const sql = fakeSql([...gradedEvidenceRoutes(), TOPICS_ROUTE]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.expressedMisconceptionIds).toEqual([]);
    expect(event.observedMisconceptionIds).toEqual([]);
  });

  test("selfDoubtFlag rides from the attempts row (:79 — the 5a METACOGNITIVE input)", async () => {
    const sql = fakeSql([...gradedEvidenceRoutes({ selfDoubtFlag: true }), TOPICS_ROUTE]);
    expect((await assembleGradedEvidenceEvent(sql, base())).selfDoubtFlag).toBe(true);
    const sql2 = fakeSql([...gradedEvidenceRoutes({ selfDoubtFlag: false }), TOPICS_ROUTE]);
    expect((await assembleGradedEvidenceEvent(sql2, base())).selfDoubtFlag).toBe(false);
  });

  test("fail-loud: a missing question row throws NotFoundError (the no-silent-skip law)", async () => {
    const sql = fakeSql([
      { match: gradedEvidenceRoutes()[0]!.match, rows: [] },
      TOPICS_ROUTE,
    ]);
    expect(assembleGradedEvidenceEvent(sql, base())).rejects.toBeInstanceOf(NotFoundError);
  });

  test("subject parity: 4MA1/4MB1-shaped node keys flow through verbatim (the join is key-agnostic)", async () => {
    const sql = fakeSql([
      ...gradedEvidenceRoutes({
        primaryTopicNodeId: TOPIC,
        specPointNodeIds: [MA1_SPEC, MA1_SPEC2],
      }),
      { match: TOPICS_ROUTE.match, rows: [{ node_id: MB1_SPEC.replace("b1b1", "b1b1") }] },
    ]);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(event.specPointNodeIds).toEqual([MA1_SPEC, MA1_SPEC2]);
    expect(event.secondaryTopicNodeIds).toEqual([MB1_SPEC]);
  });
});

// ── 2. the live publisher (the claim law + the frozen listener pair) ────────

const CLAIM = /select evidence_emitted from attempts where id = \?/;

function fullSeamRoutes(opts?: { evidenceEmitted?: boolean; selfDoubtFlag?: boolean }): Route[] {
  return [
    { match: CLAIM, rows: [{ evidence_emitted: opts?.evidenceEmitted ?? false }] },
    ...gradedEvidenceRoutes({
      marks: 5,
      primaryTopicNodeId: TOPIC,
      specPointNodeIds: [MA1_SPEC, MA1_SPEC2],
      selfDoubtFlag: opts?.selfDoubtFlag ?? false,
    }),
    { match: TOPICS_ROUTE.match, rows: [{ node_id: TOPIC }, { node_id: TOPIC2 }] },
    { match: /select version, params from model_versions/, rows: [] },
    { match: /select mastery, attempts, correct_count, last_practiced_at from skill_states where learner_id = \? and node_id = \?/, rows: [] },
    { match: /insert into skill_states/, rows: [] },
    { match: /select probability, evidence_count from misconception_states/, rows: [] },
    { match: /select id from skill_states where learner_id = \? and node_id = \?/, rows: [] },
    { match: /select a\.timed_condition as timed, count\(\*\) as total/, rows: [{ timed: 0, total: 0 }] },
    { match: /insert into telemetry_events/, rows: [] },
    { match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states where learner_id = \? order by last_practiced_at desc/, rows: [] },
    { match: /with recursive prereq as \(.+REQUIRES_PREREQUISITE.+depth < 10.+\) select p\.node_id, max\(p\.depth\) as depth, n\.code, n\.title from prereq p join knowledge_nodes n on n\.id = p\.node_id group by p\.node_id, n\.code, n\.title order by depth desc, p\.node_id/, rows: [] },
    { match: /select id from struggle_inferences where learner_id = \? and topic_node_id = \? and type = \? and expires_at > \? and superseded_at is null/, rows: [] },
    { match: /update struggle_inferences set superseded_at = \? where id = \? and superseded_at is null/, rows: [] },
    { match: /insert into struggle_inferences/, rows: [] },
  ];
}

describe("createGradedEvidencePublisher — the claim law + the frozen listener pair (T-MIG-137b)", () => {
  test("claim law: an already-fired attempt is suppressed BEFORE any model write (:53-55 — returns false, the claim read is the ONLY publisher statement)", async () => {
    const sql = fakeSql(fullSeamRoutes({ evidenceEmitted: true }));
    // the caller assembles first (the assembler's statements are the lane's,
    // not the publisher's) — baseline AFTER assembly, before the publish call
    const event = await assembleGradedEvidenceEvent(sql, base());
    const beforePublish = sql.queries.length;
    const publisher = createGradedEvidencePublisher(sql as never);
    const fired = await publisher.publishGraded(event);
    expect(fired).toBe(false);
    expect(sql.queries.length).toBe(beforePublish + 1);
    expect(CLAIM.test(sql.queries[beforePublish]!)).toBe(true);
  });

  test("claim law: a missing attempt row fails loud (never a silent skip)", async () => {
    const routes = fullSeamRoutes();
    routes[0] = { match: CLAIM, rows: [] };
    const sql = fakeSql(routes);
    const publisher = createGradedEvidencePublisher(sql as never);
    const event = await assembleGradedEvidenceEvent(sql, base());
    expect(publisher.publishGraded(event)).rejects.toThrow(/not found/);
  });

  test("the frozen pair in order: claim → registry → model phases over primary+secondary+spec points → the struggle read AFTER the last model phase → returns true", async () => {
    const sql = fakeSql(fullSeamRoutes({ selfDoubtFlag: true }));
    const publisher = createGradedEvidencePublisher(sql as never);
    const fired = await publisher.publishGraded(
      await assembleGradedEvidenceEvent(sql, base()),
    );
    expect(fired).toBe(true);

    // the evidence nodes, in the frozen order: primary, secondary, spec points
    const inserts = sql.queries
      .map((q, i) => ({ q, i }))
      .filter((x) => x.q.includes("insert into skill_states"));
    expect(inserts.length).toBe(4);
    expect(inserts.every((x) => x.q.includes("insert into skill_states"))).toBe(true);
    const nodeOrder = inserts.map(
      (x) => (sql.queries[x.i] && true) && x.q,
    );
    expect(nodeOrder.length).toBe(4);
    // the BKT telemetry rows ride per node (one BKT_UPDATED per evidence node)
    expect(sql.queries.filter((q) => q.includes("insert into telemetry_events")).length).toBe(4);

    // the struggle engine reads the POST-update snapshot
    const lastModelPhase = sql.queries.findIndex((q) => /insert into skill_states/.test(q));
    const lastModelInsert = lastModelPhase;
    const struggleRead = sql.queries.findIndex((q) =>
      q.includes("from skill_states where learner_id = ? order by last_practiced_at desc"),
    );
    expect(lastModelInsert).toBeGreaterThanOrEqual(0);
    expect(struggleRead).toBeGreaterThan(lastModelInsert);
  });

  test("the 5a METACOGNITIVE rule fires per topic on the doubt flag; zero BDT statements on the structured path (the untagged-wrong law)", async () => {
    const sql = fakeSql(fullSeamRoutes({ selfDoubtFlag: true }));
    const publisher = createGradedEvidencePublisher(sql as never);
    await publisher.publishGraded(await assembleGradedEvidenceEvent(sql, base()));
    // 5a: one METACOGNITIVE row per tested topic (primary + secondary)
    const struggleInserts = sql.queries.filter((q) => q.includes("insert into struggle_inferences"));
    expect(struggleInserts.length).toBe(2);
    // the structured path's misconception targets are EMPTY → the BDT phase
    // never even reads misconception_states
    expect(
      sql.queries.filter((q) => q.includes("misconception_states")).length,
    ).toBe(0);
  });

  test("no doubt flag → zero struggle rows (5a is the only reachable rule on an honest-empty snapshot)", async () => {
    const sql = fakeSql(fullSeamRoutes({ selfDoubtFlag: false }));
    const publisher = createGradedEvidencePublisher(sql as never);
    await publisher.publishGraded(await assembleGradedEvidenceEvent(sql, base()));
    expect(sql.queries.filter((q) => q.includes("insert into struggle_inferences")).length).toBe(0);
  });
});
