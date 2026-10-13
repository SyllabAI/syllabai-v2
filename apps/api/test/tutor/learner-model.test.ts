/**
 * T-MIG-124 Phase 1 — the sql-backed LearnerModelPort adapter pins
 * (services/tutor/learner-model.ts, buildSqlLearnerModel). The frozen read
 * laws the wiring turns LIVE in serving (frozen sources @ 6cad6ef):
 *
 *   - skillStates: the recency-ordered full list (reuse of
 *     skillStatesByRecency — the row shape IS context.ts SkillState);
 *   - misconceptionReadings: the staleness-RELAXED probability per row
 *     (MED-2/ADR-032: effective = prior + (P_e − prior)·e^(−age/τ), prior
 *     0.3 / τ 180d — the tutor's own copy) AND the RE-SORT by effective
 *     desc — a fresh 0.6 outranks a stale 0.9 (frozen
 *     LearnerModelService.misconceptionReadings :225-246);
 *   - activeStruggleInferences: un-expired + un-superseded only, ordered
 *     probability DESC then generatedAt DESC (ties break by recency); the
 *     teacher override maps CONFIRMED/REJECTED → the booleans
 *     (StruggleInference.java :131-137) and REJECTED rows are NOT dropped
 *     here — the policy filters (frozen parity);
 *   - topicEngagements: matched-topic scoped with NO time window (the 30d
 *     window is the learner-me V21 surface law, a different read), null
 *     signal_type reads TOPIC_ENGAGEMENT, an empty topic set queries
 *     nothing;
 *   - pendingReviews: PENDING rows, matched-topic scoped, {nodeId} shape.
 *
 * The in-memory fakeSql pattern is the tutor-routes.test.ts dispatch style
 * (substring routing + query capture — no Neon).
 */
import { describe, expect, test } from "bun:test";
import { buildSqlLearnerModel } from "../../src/services/tutor/learner-model";
import type { SqlFn } from "../../src/services/tutor/sql";
import type { Clock } from "../../src/services/tutor/session-store";

const NOW = new Date("2026-10-13T08:00:00Z");
const NOW_ISO = "2026-10-13T08:00:00.000Z";
const clock: Clock = { now: () => NOW };
const LEARNER = "bb000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;
function fakeSql(responses: Record<string, Row[]>) {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);
    void params;
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

describe("buildSqlLearnerModel — the Phase 1 adapter", () => {
  test("skillStates reuses the recency-ordered read; the shape is SkillState", async () => {
    const sql = fakeSql({
      "from skill_states": [
        {
          node_id: "n1",
          mastery: 0.4,
          attempts: 2,
          correct_count: 1,
          last_practiced_at: NOW_ISO,
          procedural_fluency_gap: 0.15,
        },
      ],
    });
    const model = buildSqlLearnerModel(sql, clock);
    const states = await model.skillStates(LEARNER);
    expect(states).toEqual([
      {
        nodeId: "n1",
        mastery: 0.4,
        attempts: 2,
        correctCount: 1,
        lastPracticedAt: new Date(NOW_ISO),
        proceduralFluencyGap: 0.15,
      },
    ]);
  });

  test("misconceptionReadings relaxes per MED-2/ADR-032 and RE-SORTS by effective desc — a fresh 0.6 outranks a stale 0.9", async () => {
    // stale 0.9 at 720d = 4τ: effective = 0.3 + 0.6·e^−4 ≈ 0.311 — the raw
    // probability order (0.9 first) must FLIP under the effective order.
    const sql = fakeSql({
      "from misconception_states": [
        {
          misconception_node_id: "m-stale",
          probability: 0.9,
          evidence_count: 5,
          last_evidence_at: "2024-10-23T08:00:00Z",
        },
        {
          misconception_node_id: "m-fresh",
          probability: 0.6,
          evidence_count: 2,
          last_evidence_at: NOW_ISO,
        },
      ],
    });
    const model = buildSqlLearnerModel(sql, clock);
    const readings = await model.misconceptionReadings(LEARNER);
    expect(readings[0]?.misconceptionNodeId).toBe("m-fresh");
    expect(readings[0]?.effective).toBeCloseTo(0.6, 10); // age 0 → unrelaxed
    expect(readings[1]?.misconceptionNodeId).toBe("m-stale");
    expect(readings[1]?.effective).toBeGreaterThan(0.3);
    expect(readings[1]?.effective).toBeLessThan(0.32);
  });

  test("activeStruggleInferences: the read contract is in the QUERY (expiry, supersede, recency-tie order) and the override maps verbatim", async () => {
    const sql = fakeSql({
      "from struggle_inferences": [
        {
          topic_node_id: "n1",
          probability: 0.7,
          teacher_override: "CONFIRMED",
          type: "PREREQUISITE_GAP",
          subtype: "weak-basics",
        },
        {
          topic_node_id: "n2",
          probability: 0.55,
          teacher_override: "REJECTED",
          type: "METACOGNITIVE",
          subtype: null,
        },
        {
          topic_node_id: "n3",
          probability: 0.4,
          teacher_override: null,
          type: "EXAM_LITERACY",
          subtype: "timing",
        },
      ],
    });
    const model = buildSqlLearnerModel(sql, clock);
    const rows = await model.activeStruggleInferences(LEARNER);
    const query = sql.queries[0] ?? "";
    expect(query).toContain("expires_at >");
    expect(query).toContain("superseded_at is null");
    expect(query).toContain("order by probability desc, generated_at desc");
    expect(rows[0]).toEqual({
      topicNodeId: "n1",
      probability: 0.7,
      teacherConfirmed: true,
      teacherRejected: false,
      type: "PREREQUISITE_GAP",
      subtype: "weak-basics",
    });
    expect(rows[1]?.teacherConfirmed).toBe(false);
    expect(rows[1]?.teacherRejected).toBe(true); // NOT dropped here — the policy filters
    expect(rows[1]?.subtype).toBeNull();
    expect(rows[2]?.teacherConfirmed).toBe(false);
    expect(rows[2]?.teacherRejected).toBe(false);
  });

  test("topicEngagements: matched-topic scoped with NO time window; null signal_type reads TOPIC_ENGAGEMENT; empty topics query nothing", async () => {
    const sql = fakeSql({
      "from tutor_topic_engagements": [
        { node_id: "n1", signal_type: "DOUBT_SIGNAL", occurred_at: NOW_ISO },
        { node_id: "n2", signal_type: null, occurred_at: NOW_ISO },
      ],
    });
    const model = buildSqlLearnerModel(sql, clock);
    const rows = await model.topicEngagements(LEARNER, ["n1", "n2", "n1"]);
    expect(rows[0]).toEqual({
      nodeId: "n1",
      signalType: "DOUBT_SIGNAL",
      occurredAt: new Date(NOW_ISO),
    });
    expect(rows[1]?.signalType).toBe("TOPIC_ENGAGEMENT");
    const query = sql.queries[0] ?? "";
    expect(query).toContain("node_id = any(");
    expect(query).not.toContain("occurred_at >="); // the 30d window is the learner-me law, not this read
    // empty topic set: the guard queries nothing (never `= any(#{})`)
    const quiet = fakeSql({});
    const none = await buildSqlLearnerModel(quiet, clock).topicEngagements(LEARNER, []);
    expect(none).toEqual([]);
    expect(quiet.queries.length).toBe(0);
  });

  test("pendingReviews: PENDING + matched-topic scoped; empty topics query nothing", async () => {
    const sql = fakeSql({
      "from review_schedules": [{ node_id: "n1" }, { node_id: "n2" }],
    });
    const model = buildSqlLearnerModel(sql, clock);
    const rows = await model.pendingReviews(LEARNER, ["n1"]);
    expect(rows).toEqual([{ nodeId: "n1" }, { nodeId: "n2" }]);
    const query = sql.queries[0] ?? "";
    expect(query).toContain("status =");
    expect(query).toContain("node_id = any(");
    const quiet = fakeSql({});
    const none = await buildSqlLearnerModel(quiet, clock).pendingReviews(LEARNER, []);
    expect(none).toEqual([]);
    expect(quiet.queries.length).toBe(0);
  });
});
