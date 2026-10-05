/**
 * Stubbed-sql unit tests for the learner state-model read port
 * (T-MIG-041 tranche 1) — the T-MIG-021 pattern: dispatch on rendered query
 * text, pin the SQL shape + the binding + the view assembly law.
 *
 * Every law pinned here is line-against-line from the frozen core @ 6cad6ef
 * (LearnerStateController.state, LearnerModelService.misconceptionReadings,
 * TutorEngagementReader.groupEngagementSummary, ExamTargetReader.targetsFor)
 * and cross-checked against the W4 live capture (golden/cases/w4-state-*,
 * T-MIG-040-PREP): the capture's wire shapes and tolerance posture are the
 * behavioral ground truth this port must reproduce.
 */
import { describe, expect, test } from "bun:test";
import {
  bandOf,
  buildLearnerStateView,
  decayedMastery,
  groupEngagementSummary,
  LEARNER_ENGINE_PAPER_DEFAULTS,
  relaxedToPrior,
} from "../../src/services/learner";
import {
  fakeSql,
  LEARNER,
  NODE_MISCONCEPTION,
  NODE_SUBTOPIC,
  NODE_TOPIC,
  NOW,
  SERIES_IAL,
} from "./helpers";

const DAY = 86_400_000;

function stateRoutes(overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {}) {
  return [
    {
      match: /select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap from skill_states/,
      rows: overrides.skills ?? [],
    },
    {
      match: /select misconception_node_id, probability, evidence_count, last_evidence_at from misconception_states/,
      rows: overrides.misconceptions ?? [],
    },
    {
      match: /select node_id, due_at, reason from review_schedules/,
      rows: overrides.reviews ?? [],
    },
    {
      match: /select node_id, occurred_at, refused, signal_type from tutor_topic_engagements/,
      rows: overrides.tutor ?? [],
    },
    {
      match: /select card_id, node_id, rating, occurred_at from flashcard_ratings/,
      rows: overrides.flashcards ?? [],
    },
    {
      match: /select note_id, node_id, vote, occurred_at from note_votes/,
      rows: overrides.votes ?? [],
    },
    {
      match: /select course_slug, target_series_id from learner_course_enrolments/,
      rows: overrides.enrolments ?? [],
    },
    {
      match: /select id, title from knowledge_nodes/,
      rows: overrides.titles ?? [],
    },
    {
      match: /select id, series_code, label, window_start, window_end, entry_deadline, results_date, estimated from exam_series/,
      rows: overrides.series ?? [],
    },
  ];
}

describe("learner state-model: pure laws (frozen 6cad6ef, ns->ms precision disclosed)", () => {
  test("decayedMastery: P(t)=P0*e^(-t/tau), tau frozen on the STORED P0 (mid band)", () => {
    const ninetyDaysAgo = new Date(NOW.getTime() - 90 * DAY);
    // mastery 0.5 -> DEVELOPING band -> tau 90d -> exactly one tau of decay
    expect(decayedMastery(0.5, ninetyDaysAgo, NOW, LEARNER_ENGINE_PAPER_DEFAULTS.decay)).toBeCloseTo(
      0.5 * Math.exp(-1),
      12,
    );
  });

  test("decayedMastery: floor keeps the value at/above L0 (total erasure not modelled)", () => {
    const thousandDaysAgo = new Date(NOW.getTime() - 1000 * DAY);
    // mastery 0.05 -> LOW band -> tau 30d -> e^(-33.3) ~ 3.6e-15 -> floored to 0.1
    expect(decayedMastery(0.05, thousandDaysAgo, NOW, LEARNER_ENGINE_PAPER_DEFAULTS.decay)).toBe(0.1);
  });

  test("decayedMastery: fresh/skewed evidence returns the clamped stored value", () => {
    const future = new Date(NOW.getTime() + DAY);
    expect(decayedMastery(0.7, future, NOW, LEARNER_ENGINE_PAPER_DEFAULTS.decay)).toBe(0.7);
  });

  test("bandOf: <0.45 LOW, <0.8 DEVELOPING, else SECURE (frozen :58-68 boundaries)", () => {
    const p = LEARNER_ENGINE_PAPER_DEFAULTS.decay;
    expect(bandOf(0.44, p)).toBe("LOW");
    expect(bandOf(0.45, p)).toBe("DEVELOPING"); // boundary: NOT < ceiling
    expect(bandOf(0.79, p)).toBe("DEVELOPING");
    expect(bandOf(0.8, p)).toBe("SECURE"); // boundary: >= floor
  });

  test("relaxedToPrior: effective = prior + (P_e - prior)*e^(-age/tau_s)", () => {
    const hundredEightyDaysAgo = new Date(NOW.getTime() - 180 * DAY);
    expect(
      relaxedToPrior(0.9, 0.3, hundredEightyDaysAgo, NOW, LEARNER_ENGINE_PAPER_DEFAULTS.bdt.stalenessTauDays),
    ).toBeCloseTo(0.3 + 0.6 * Math.exp(-1), 12);
  });

  test("relaxedToPrior: fresh evidence returns the full posterior (no relaxation)", () => {
    expect(relaxedToPrior(0.6, 0.3, NOW, NOW, 180)).toBe(0.6);
  });
});

describe("learner state-model: /state composite over stubbed sql", () => {
  test("empty learner: seven legs read, zero title/series queries, all lists empty", async () => {
    const sql = fakeSql(stateRoutes());
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.learnerId).toBe(LEARNER);
    expect(view.skillStates).toEqual([]);
    expect(view.misconceptionStates).toEqual([]);
    expect(view.pendingReviews).toEqual([]);
    expect(view.tutorEngagements).toEqual([]);
    expect(view.flashcardRatings).toEqual([]);
    expect(view.noteVotes).toEqual([]);
    expect(view.examTargets).toEqual([]);
    // no node ids and no declared enrolments -> the two batch lookups are skipped
    expect(sql.queries.length).toBe(7);
    expect(sql.queries.some((q) => q.includes("from knowledge_nodes"))).toBeFalse();
  });

  test("state SQL shape: each leg's ordering + filters are load-bearing parity", async () => {
    const sql = fakeSql(stateRoutes());
    await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(sql.queries[0]).toContain("from skill_states where learner_id = ? order by last_practiced_at desc");
    expect(sql.queries[1]).toContain("from misconception_states where learner_id = ? order by probability desc");
    expect(sql.queries[2]).toContain("status = ? order by due_at asc");
    expect(sql.queries[2]).toContain("from review_schedules where learner_id = ?");
    expect(sql.queries[3]).toContain("occurred_at >= ? order by occurred_at desc");
    expect(sql.queries[4]).toContain("from flashcard_ratings where learner_id = ? order by occurred_at desc limit ?");
    expect(sql.queries[5]).toContain("from note_votes where learner_id = ? order by occurred_at desc limit ?");
    expect(sql.queries[6]).toContain("target_series_id is not null");
  });

  test("skills: read-time decay + bandOf + title resolution (the w4-state capture law)", async () => {
    const ninetyDaysAgo = new Date(NOW.getTime() - 90 * DAY);
    const sql = fakeSql(
      stateRoutes({
        skills: [
          {
            node_id: NODE_TOPIC,
            mastery: 0.5,
            attempts: 3,
            correct_count: 2,
            last_practiced_at: ninetyDaysAgo,
            procedural_fluency_gap: 0.25,
          },
        ],
        titles: [{ id: NODE_TOPIC, title: "Formulae, Equations and Amount of Substance" }],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.skillStates.length).toBe(1);
    const s = view.skillStates[0]!;
    expect(s.mastery).toBe(0.5); // the ANCHOR P0 passes through untouched
    expect(s.effectiveMastery).toBeCloseTo(0.5 * Math.exp(-1), 12);
    expect(s.band).toBe("LOW"); // 0.184 < 0.45
    expect(s.attempts).toBe(3);
    expect(s.correctCount).toBe(2);
    expect(s.proceduralFluencyGap).toBe(0.25);
    expect(s.nodeName).toBe("Formulae, Equations and Amount of Substance");
  });

  test("misconceptions: staleness-relaxed probability, re-sorted by effective DESC — a fresh 0.6 outranks a stale 0.9 (MED-2/ADR-032)", async () => {
    const hundredEightyDaysAgo = new Date(NOW.getTime() - 180 * DAY);
    const sql = fakeSql(
      stateRoutes({
        // repo order = raw probability DESC: 0.9 (stale) before 0.6 (fresh)
        misconceptions: [
          {
            misconception_node_id: NODE_MISCONCEPTION,
            probability: 0.9,
            evidence_count: 4,
            last_evidence_at: hundredEightyDaysAgo,
          },
          {
            misconception_node_id: NODE_SUBTOPIC,
            probability: 0.6,
            evidence_count: 1,
            last_evidence_at: NOW,
          },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    const [first, second] = view.misconceptionStates;
    // re-sorted by EFFECTIVE: the fresh 0.6 (unrelaxed) now leads
    expect(first!.misconceptionNodeId).toBe(NODE_SUBTOPIC);
    expect(first!.probability).toBe(0.6); // fresh evidence: full posterior shown
    expect(first!.active).toBeTrue(); // 0.6 >= 0.5
    // the stale 0.9 relaxed toward prior 0.3 over exactly one tau_s
    expect(second!.misconceptionNodeId).toBe(NODE_MISCONCEPTION);
    expect(second!.probability).toBeCloseTo(0.3 + 0.6 * Math.exp(-1), 12);
    expect(second!.active).toBeTrue(); // 0.5207 >= 0.5
  });

  test("misconceptions: active flag is the effective value vs activeThreshold (0.5)", async () => {
    const longAgo = new Date(NOW.getTime() - 730 * DAY); // four tau_s
    const sql = fakeSql(
      stateRoutes({
        misconceptions: [
          {
            misconception_node_id: NODE_MISCONCEPTION,
            probability: 0.55,
            evidence_count: 2,
            last_evidence_at: longAgo,
          },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    const m = view.misconceptionStates[0]!;
    // 0.3 + 0.25*e^(-730/180) = 0.3 + 0.25*0.0171 ~ 0.3043 < 0.5 -> inactive
    expect(m.probability).toBeLessThan(0.5);
    expect(m.active).toBeFalse();
  });

  test("pendingReviews: PENDING dueAt-ASC passthrough with the reason enum verbatim", async () => {
    const dueSoon = new Date(NOW.getTime() + DAY);
    const dueLater = new Date(NOW.getTime() + 5 * DAY);
    const sql = fakeSql(
      stateRoutes({
        reviews: [
          { node_id: NODE_TOPIC, due_at: dueSoon, reason: "DECAY_CROSSED_THRESHOLD" },
          { node_id: NODE_SUBTOPIC, due_at: dueLater, reason: "TEACHER_ASSIGNED" },
        ],
        titles: [
          { id: NODE_TOPIC, title: "Formulae, Equations and Amount of Substance" },
          { id: NODE_SUBTOPIC, title: "Mole calculations and reacting masses" },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.pendingReviews.map((r) => r.reason)).toEqual([
      "DECAY_CROSSED_THRESHOLD",
      "TEACHER_ASSIGNED",
    ]);
    expect(view.pendingReviews[0]!.nodeName).toBe("Formulae, Equations and Amount of Substance");
  });

  test("tutor engagements: first-seen grouping over the DESC window, sticky refusedAny, lastAsked max, null signal -> TOPIC_ENGAGEMENT, limit 10", async () => {
    const t1 = new Date(NOW.getTime() - 3 * DAY);
    const t2 = new Date(NOW.getTime() - 2 * DAY);
    const t3 = new Date(NOW.getTime() - DAY);
    const sql = fakeSql(
      stateRoutes({
        tutor: [
          // repo order: occurredAt DESC
          { node_id: NODE_TOPIC, occurred_at: t3, refused: true, signal_type: "ASK" },
          { node_id: NODE_SUBTOPIC, occurred_at: t2, refused: false, signal_type: null },
          { node_id: NODE_TOPIC, occurred_at: t1, refused: false, signal_type: "TOPIC_ENGAGEMENT" },
        ],
        titles: [{ id: NODE_TOPIC, title: "Formulae, Equations and Amount of Substance" }],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.tutorEngagements.length).toBe(2); // grouped to 2 nodes
    const [topic, other] = view.tutorEngagements;
    // first-seen order: NODE_TOPIC (newest event) before NODE_SUBTOPIC
    expect(topic!.nodeId).toBe(NODE_TOPIC);
    expect(topic!.asks).toBe(2);
    expect(topic!.refusedAny).toBeTrue(); // sticky: one refusal marks the node
    expect(topic!.lastAskedAt).toEqual(t3); // max across the group
    expect(topic!.signalCounts).toEqual({ ASK: 1, TOPIC_ENGAGEMENT: 1 }); // per-signal counts
    expect(topic!.nodeName).toBe("Formulae, Equations and Amount of Substance");
    expect(other!.nodeId).toBe(NODE_SUBTOPIC);
    expect(other!.signalCounts).toEqual({ TOPIC_ENGAGEMENT: 1 }); // null signal -> TOPIC_ENGAGEMENT
    expect(other!.refusedAny).toBeFalse();
  });

  test("flashcard ratings window: latest 50, wire mapping KNOW->know / STILL_LEARNING->still-learning, subtopicCode null (no content bridge on this read)", async () => {
    const sql = fakeSql(
      stateRoutes({
        flashcards: [
          { card_id: "fl_w4_cap_001", node_id: NODE_TOPIC, rating: "KNOW", occurred_at: NOW },
          { card_id: "fl_w4_cap_003", node_id: NODE_TOPIC, rating: "STILL_LEARNING", occurred_at: NOW },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.flashcardRatings.map((r) => r.rating)).toEqual(["know", "still-learning"]);
    expect(view.flashcardRatings[0]!.subtopicCode).toBeNull();
    expect(view.flashcardRatings[0]!.cardId).toBe("fl_w4_cap_001");
  });

  test("note-votes window: wire mapping HELPFUL->helpful / NOT_HELPFUL->not-helpful", async () => {
    const sql = fakeSql(
      stateRoutes({
        votes: [
          { note_id: "note-1", node_id: NODE_TOPIC, vote: "HELPFUL", occurred_at: NOW },
          { note_id: "note-2", node_id: NODE_TOPIC, vote: "NOT_HELPFUL", occurred_at: NOW },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.noteVotes.map((v) => v.vote)).toEqual(["helpful", "not-helpful"]);
  });

  test("exam targets: declared enrolments -> batched series -> whole-day countdowns + entryDeadlinePassed; vanished series filtered", async () => {
    const sql = fakeSql(
      stateRoutes({
        enrolments: [
          { course_slug: "chm", target_series_id: SERIES_IAL },
          { course_slug: "phy", target_series_id: "0a000000-0000-0000-0000-00000000dead" },
        ],
        series: [
          {
            id: SERIES_IAL,
            series_code: "2026-october-november",
            label: "October/November 2026",
            window_start: "2026-11-01",
            window_end: "2026-11-30",
            entry_deadline: "2026-10-01",
            results_date: "2027-01-15",
            estimated: true,
          },
        ],
      }),
    );
    const view = await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    expect(view.examTargets.length).toBe(1); // the vanished series is dropped
    const t = view.examTargets[0]!;
    expect(t.courseSlug).toBe("chm");
    expect(t.seriesId).toBe(SERIES_IAL);
    expect(t.daysToWindowStart).toBe(26); // 2026-11-01 minus 2026-10-06, whole days
    expect(t.daysToWindowEnd).toBe(55);
    expect(t.entryDeadlinePassed).toBeTrue(); // 2026-10-01 < today
    expect(t.estimated).toBeTrue();
  });

  test("titles: ONE batched lookup covering skills + misconceptions + reviews + engaged topics (V21 order)", async () => {
    const sql = fakeSql(
      stateRoutes({
        skills: [{ node_id: NODE_TOPIC, mastery: 0.5, attempts: 1, correct_count: 0, last_practiced_at: NOW, procedural_fluency_gap: null }],
        misconceptions: [{ misconception_node_id: NODE_MISCONCEPTION, probability: 0.6, evidence_count: 1, last_evidence_at: NOW }],
        tutor: [{ node_id: NODE_SUBTOPIC, occurred_at: NOW, refused: false, signal_type: null }],
      }),
    );
    await buildLearnerStateView(sql, LEARNER, LEARNER_ENGINE_PAPER_DEFAULTS, NOW);
    const titleQueries = sql.queries.filter((q) => q.includes("from knowledge_nodes"));
    expect(titleQueries.length).toBe(1); // the frozen law: ONE batched findAllById
    expect(titleQueries[0]).toContain("where id = any( ? )");
  });
});

describe("groupEngagementSummary: direct law pins", () => {
  test("limit truncates in first-seen order (never re-ranked)", () => {
    const now = NOW;
    const rows = Array.from({ length: 12 }, (_, i) => ({
      nodeId: `node-${i}`,
      occurredAt: new Date(now.getTime() - i * 1000),
      refused: false,
      signalType: "TOPIC_ENGAGEMENT",
    }));
    const out = groupEngagementSummary(rows, 10, () => null);
    expect(out.length).toBe(10);
    expect(out[0]!.nodeId).toBe("node-0");
    expect(out[9]!.nodeId).toBe("node-9");
  });

  test("empty window -> empty summary", () => {
    expect(groupEngagementSummary([], 10, () => null)).toEqual([]);
  });
});
