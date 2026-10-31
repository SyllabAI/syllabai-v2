/**
 * DC-7 — Progress Attribution pins (services/learner/progress-rollup.ts;
 * spec §3.7, prereg docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md).
 *
 * The acceptance law of record, pinned here over the repo's fakeSql module
 * harness (the engagement-recorder.test.ts style):
 *   (a) Event pins: a marked part, a checked note and a submitted MCQ each
 *       move EXACTLY the nodes they should — their node sets plus the
 *       PART_OF ancestors, and nothing else (untouched siblings stay zero).
 *   (b) Threshold pin: the FIFTH marked part flips the PRACTISE task; the
 *       first does not; a REVISE task flips on its note check alone; a
 *       single MCQ submit never completes PRACTISE.
 *   (c) Consistency pin: the plan projection and the ring projection agree
 *       on the same day's count — one builder, one `today`, by construction.
 *
 * Fixture: course igcse-chemistry-19 (code 4CH1) — subject 4CH1 → topic
 * 4CH1-S1 → subtopics 4CH1-S1-a / 4CH1-S1-b → spec points 4CH1-1.1 /
 * 4CH1-2.1; note-1 maps 4CH1-1.1, note-2 maps 4CH1-2.1; q1 (MCQ) touches
 * topic 4CH1-S1 + spec point 4CH1-1.1, q2 (structured) touches 4CH1-2.1.
 */
import { describe, expect, test } from "bun:test";
import {
  PROGRESS_PLAN_THRESHOLD_PRACTISE,
  buildPlanProjection,
  buildProgressProjection,
  dayStartOf,
} from "../../src/services/learner/progress-rollup";
import type { SqlFn } from "../../src/services/tutor/sql";

const NOW = new Date("2026-10-13T08:00:00Z");
const TODAY_ISO = "2026-10-13T";
const YESTERDAY_ISO = "2026-10-12T";
const LEARNER = "cc000000-0000-4000-8000-000000000001";

const N_SUBJECT = "a0000000-0000-4000-8000-000000000001";
const N_TOPIC = "a0000000-0000-4000-8000-000000000002";
const N_ST_A = "a0000000-0000-4000-8000-000000000003";
const N_ST_B = "a0000000-0000-4000-8000-000000000004";
const N_SP1 = "a0000000-0000-4000-8000-000000000005";
const N_SP2 = "a0000000-0000-4000-8000-000000000006";
const Q1 = "b0000000-0000-4000-8000-000000000001";
const Q2 = "b0000000-0000-4000-8000-000000000002";

function fixture(overrides: {
  marks?: Array<{ question_id: string; created_at: string }>;
  attempts?: Array<{ question_id: string; created_at: string; question_type: string }>;
  viewed?: Array<{ note_id: string; viewed_at: string }>;
  /** T-MG-FEEDBACK-1: the region-award join rows (the mark_awards →
   * mark_points → part → version → question chain, AS SERVED by the inner
   * joins — a row here is a ledger row the SQL attributed). */
  awards?: Array<{ document_ref_id: string; region_key: string; created_at: string; question_id: string }>;
} = {}) {
  const rows: Record<string, unknown[]> = {
    // ORDER MATTERS: the most specific key must precede any key that is a
    // substring of it ("revision_note_viewed" before the notes query key).
    "course_registry": [
      { code: "4CH1", curriculum_code: "4CH1-2017" },
    ],
    "knowledge_nodes": [
      { id: N_SUBJECT, code: "4CH1", node_type: "SUBJECT" },
      { id: N_TOPIC, code: "4CH1-S1", node_type: "TOPIC" },
      { id: N_ST_A, code: "4CH1-S1-a", node_type: "SUBTOPIC" },
      { id: N_ST_B, code: "4CH1-S1-b", node_type: "SUBTOPIC" },
      { id: N_SP1, code: "4CH1-1.1", node_type: "SPEC_POINT" },
      { id: N_SP2, code: "4CH1-2.1", node_type: "SPEC_POINT" },
    ],
    "knowledge_edges": [
      { source_node_id: N_SP1, target_node_id: N_ST_A },
      { source_node_id: N_ST_A, target_node_id: N_TOPIC },
      { source_node_id: N_TOPIC, target_node_id: N_SUBJECT },
      { source_node_id: N_SP2, target_node_id: N_ST_B },
      { source_node_id: N_ST_B, target_node_id: N_TOPIC },
    ],
    "question_topics": [
      { node_id: N_TOPIC, question_id: Q1 },
    ],
    "question_spec_points": [
      { node_id: N_SP1, question_id: Q1 },
      { node_id: N_SP2, question_id: Q2 },
    ],
    "viewed_at from revision_note_viewed": overrides.viewed ?? [],
    "spec_point_codes from revision_note": [
      { note_id: "note-1", spec_point_codes: "4CH1-1.1" },
      { note_id: "note-2", spec_point_codes: "4CH1-2.1" },
    ],
    "attempts a join questions": overrides.attempts ?? [],
    "ai_mark_events": overrides.marks ?? [],
    "mark_points mp on mp.id = a.mark_point_id": overrides.awards ?? [],
  };
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    for (const key of Object.keys(rows)) {
      if (text.includes(key)) return rows[key];
    }
    throw new Error(`progress-rollup.test fixture: unmatched query: ${text.slice(0, 120)}`);
  }) as unknown as SqlFn;
  return fn;
}

/** strict-index narrowing helper: a fixture projection missing a fixture node is a test bug, throw loud */
function nodeOf(
  p: Awaited<ReturnType<typeof buildProgressProjection>>,
  code: string,
) {
  const entry = p.nodes[code];
  if (!entry) throw new Error(`fixture: node ${code} missing from projection`);
  return entry;
}

describe("DC-7 progress rollup — (a) event pins", () => {
  test("a checked note moves exactly the note's nodes and their ancestors", async () => {
    const sql = fixture({
      viewed: [{ note_id: "note-1", viewed_at: `${TODAY_ISO}07:30:00Z` }],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    // leaf: 4CH1-1.1 binary-complete on the notes dimension
    expect(nodeOf(p, "4CH1-1.1").notes).toEqual({ done: 1, total: 1, fraction: 1, leafDone: true });
    // subtopic fraction: its own note read (1 of 1 in the subtopic); topic +
    // subject fractions: 1 of the 2 course notes
    expect(nodeOf(p, "4CH1-S1-a").notes).toEqual({ done: 1, total: 1, fraction: 1, leafDone: true });
    expect(nodeOf(p, "4CH1-S1").notes.fraction).toBe(0.5);
    expect(nodeOf(p, "4CH1").notes.fraction).toBe(0.5);
    // the untouched sibling subtree stays zero (EXACTLY the nodes they should)
    expect(nodeOf(p, "4CH1-2.1").notes.done).toBe(0);
    expect(nodeOf(p, "4CH1-S1-b").notes.done).toBe(0);
    // questions dimension untouched by a note event
    expect(nodeOf(p, "4CH1-1.1").questions.done).toBe(0);
  });

  test("a marked part moves exactly the question's nodes — and advances the tree", async () => {
    const sql = fixture({
      marks: [{ question_id: Q2, created_at: `${TODAY_ISO}07:00:00Z` }],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(nodeOf(p, "4CH1-2.1").questions.leafDone).toBe(true);
    expect(nodeOf(p, "4CH1-S1-b").questions.fraction).toBe(1);
    // the topic holds both questions (q1 via question_topics, q2 via the
    // SP2→ST-B→S1 ancestor walk): one of two graded
    expect(nodeOf(p, "4CH1-S1").questions).toEqual({ done: 1, total: 2, fraction: 0.5, leafDone: true });
    // the untouched sibling subtopic stays zero
    expect(nodeOf(p, "4CH1-S1-a").questions.done).toBe(0);
    // the notes dimension is untouched by a mark
    expect(nodeOf(p, "4CH1-2.1").notes.done).toBe(0);
    expect(p.today.markedParts).toBe(1);
  });

  test("a submitted MCQ moves exactly its nodes and counts in today", async () => {
    const sql = fixture({
      attempts: [
        { question_id: Q1, created_at: `${TODAY_ISO}06:50:00Z`, question_type: "MCQ_SINGLE" },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(nodeOf(p, "4CH1-1.1").questions.leafDone).toBe(true);
    expect(nodeOf(p, "4CH1-S1-a").questions.fraction).toBe(1);
    expect(p.today.mcqSubmitted).toBe(1);
    expect(p.today.markedParts).toBe(0);
    expect(p.today.notesChecked).toBe(0);
  });

  test("separate dimensions stay separate; yesterday's events stay out of today", async () => {
    const sql = fixture({
      viewed: [
        { note_id: "note-1", viewed_at: `${TODAY_ISO}07:30:00Z` },
        { note_id: "note-2", viewed_at: `${YESTERDAY_ISO}18:00:00Z` },
      ],
      attempts: [
        { question_id: Q1, created_at: `${YESTERDAY_ISO}09:00:00Z`, question_type: "MCQ_SINGLE" },
      ],
      marks: [{ question_id: Q2, created_at: `${YESTERDAY_ISO}10:00:00Z` }],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    // fractions count the events regardless of day (the tree is cumulative)
    expect(nodeOf(p, "4CH1-S1").notes.fraction).toBe(1);
    expect(nodeOf(p, "4CH1-S1").questions.fraction).toBe(1);
    // today is day-scoped on the injected clock (UTC day boundary)
    expect(p.today).toEqual({ notesChecked: 1, markedParts: 0, mcqSubmitted: 0 });
    expect(dayStartOf(NOW).toISOString()).toBe(`${TODAY_ISO}00:00:00.000Z`);
  });

  test("unknown course fails loud (NotFoundError), never an empty projection", async () => {
    const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.includes("course_registry")) return []; // course missing
      return [];
    }) as unknown as SqlFn;
    await expect(
      buildProgressProjection(fn, LEARNER, "no-such-course", NOW),
    ).rejects.toThrow();
  });
});

describe("DC-7 plan projection — (b) threshold pins", () => {
  test("the FIRST marked part does not flip the PRACTISE task", async () => {
    const sql = fixture({
      marks: [{ question_id: Q2, created_at: `${TODAY_ISO}07:00:00Z` }],
    });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    const practise = plan.tasks.find((t) => t.taskId === "practise:4CH1-S1-b")!;
    expect(practise.markedParts).toBe(1);
    expect(practise.threshold).toBe(PROGRESS_PLAN_THRESHOLD_PRACTISE);
    expect(practise.complete).toBe(false);
    expect(practise.autoCompletedBy).toBeNull();
  });

  test("the FIFTH marked part flips the PRACTISE task", async () => {
    const sql = fixture({
      marks: [
        { question_id: Q2, created_at: `${TODAY_ISO}06:00:00Z` },
        { question_id: Q2, created_at: `${TODAY_ISO}06:10:00Z` },
        { question_id: Q2, created_at: `${TODAY_ISO}06:20:00Z` },
        { question_id: Q2, created_at: `${TODAY_ISO}06:30:00Z` },
        { question_id: Q2, created_at: `${TODAY_ISO}06:40:00Z` },
      ],
    });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    const practise = plan.tasks.find((t) => t.taskId === "practise:4CH1-S1-b")!;
    expect(practise.markedParts).toBe(5);
    expect(practise.complete).toBe(true);
    expect(practise.autoCompletedBy).toBe("MARKED_PARTS");
    // the sibling subtopic's PRACTISE task stays open
    const sibling = plan.tasks.find((t) => t.taskId === "practise:4CH1-S1-a")!;
    expect(sibling.complete).toBe(false);
  });

  test("a REVISE task auto-completes when its note is checked — and only then", async () => {
    const viewed = [{ note_id: "note-1", viewed_at: `${TODAY_ISO}07:30:00Z` }];
    const sql = fixture({ viewed });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    const revise1 = plan.tasks.find((t) => t.taskId === "revise:note-1")!;
    const revise2 = plan.tasks.find((t) => t.taskId === "revise:note-2")!;
    expect(revise1.complete).toBe(true);
    expect(revise1.autoCompletedBy).toBe("NOTE_CHECK");
    expect(revise2.complete).toBe(false);
  });

  test("a single MCQ submit NEVER auto-completes a PRACTISE task", async () => {
    const sql = fixture({
      attempts: [
        { question_id: Q1, created_at: `${TODAY_ISO}06:50:00Z`, question_type: "MCQ_SINGLE" },
      ],
    });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    for (const t of plan.tasks.filter((t) => t.type === "PRACTISE")) {
      expect(t.complete).toBe(false);
      expect(t.autoCompletedBy).toBeNull();
    }
  });

  test("explicit task refs are honoured (the P2 builder's input shape)", async () => {
    const sql = fixture({
      viewed: [{ note_id: "note-2", viewed_at: `${TODAY_ISO}07:00:00Z` }],
      marks: [{ question_id: Q2, created_at: `${TODAY_ISO}07:05:00Z` }],
    });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW, [
      { taskId: "task-1", type: "REVISE", noteId: "note-2" },
      { taskId: "task-2", type: "PRACTISE", nodeCode: "4CH1-S1-b" },
    ]);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]!).toEqual({
      taskId: "task-1", type: "REVISE", complete: true, autoCompletedBy: "NOTE_CHECK",
    });
    expect(plan.tasks[1]!.markedParts).toBe(1);
    expect(plan.tasks[1]!.complete).toBe(false);
  });
});

describe("DC-7 — (c) consistency pin: one projection, one today", () => {
  test("plan projection and ring projection agree on the same day's counts", async () => {
    const overrides = {
      viewed: [{ note_id: "note-1", viewed_at: `${TODAY_ISO}07:30:00Z` }],
      attempts: [
        { question_id: Q1, created_at: `${TODAY_ISO}06:50:00Z`, question_type: "MCQ_SINGLE" },
      ],
      marks: [{ question_id: Q2, created_at: `${TODAY_ISO}07:10:00Z` }],
    };
    const p = await buildProgressProjection(fixture(overrides), LEARNER, "igcse-chemistry-19", NOW);
    const plan = await buildPlanProjection(fixture(overrides), LEARNER, "igcse-chemistry-19", NOW);
    expect(plan.today).toEqual(p.today);
    expect(plan.today).toEqual({ notesChecked: 1, markedParts: 1, mcqSubmitted: 1 });
    // and the ring fractions the plan's own tree-reading derives are the
    // SAME walk: the plan projection embeds the progress projection's today
    expect(plan.thresholds).toEqual({ practise: 5 });
  });
});

// ── T-MG-FEEDBACK-1 run-001 — the Phase-6 region-award join (plan §3.6) ────
// The pins: (a) ring pin — a region award advances the topic ring EXACTLY
// like a marked part (the DC-7 integration-test pattern, mirrored from the
// (a) event pins above); the unit law — one distinct marked region is one
// marked part, however many award rows its run assembled; and the
// honest-null law — an attributed question with no node links moves no
// ring (real ledger row, no fabricated anchor).
const PAPER = "d0000000-0000-4000-8000-000000000001";

describe("T-MG-FEEDBACK-1 — the region-award join (plan §3.6)", () => {
  test("(a) RING PIN: a region award advances the topic ring exactly like a marked part", async () => {
    // the SAME assertions the ai_mark_events row earned above, earned by a
    // mark_awards row attributed through the definition-plane join
    const sql = fixture({
      awards: [
        { document_ref_id: PAPER, region_key: "9.p1", created_at: `${TODAY_ISO}07:00:00Z`, question_id: Q2 },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(nodeOf(p, "4CH1-2.1").questions.leafDone).toBe(true);
    expect(nodeOf(p, "4CH1-S1-b").questions.fraction).toBe(1);
    expect(nodeOf(p, "4CH1-S1").questions).toEqual({ done: 1, total: 2, fraction: 0.5, leafDone: true });
    expect(nodeOf(p, "4CH1-S1-a").questions.done).toBe(0);
    expect(nodeOf(p, "4CH1-2.1").notes.done).toBe(0);
    expect(p.today.markedParts).toBe(1);
  });

  test("unit law: three award rows (P1/P1/C1) on ONE region count ONE marked part", async () => {
    const sql = fixture({
      awards: [
        { document_ref_id: PAPER, region_key: "17.p1", created_at: `${TODAY_ISO}07:00:00Z`, question_id: Q2 },
        { document_ref_id: PAPER, region_key: "17.p1", created_at: `${TODAY_ISO}07:00:01Z`, question_id: Q2 },
        { document_ref_id: PAPER, region_key: "17.p1", created_at: `${TODAY_ISO}07:00:02Z`, question_id: Q2 },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(p.today.markedParts).toBe(1);
    // the ring moves once (distinct questions, the same walk as smartmark's)
    expect(nodeOf(p, "4CH1-S1-b").questions.fraction).toBe(1);
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(plan.tasks.find((t) => t.taskId === "practise:4CH1-S1-b")!.markedParts).toBe(1);
  });

  test("two distinct regions on one paper are two marked parts", async () => {
    const sql = fixture({
      awards: [
        { document_ref_id: PAPER, region_key: "9.p1", created_at: `${TODAY_ISO}07:00:00Z`, question_id: Q2 },
        { document_ref_id: PAPER, region_key: "9.a", created_at: `${TODAY_ISO}07:05:00Z`, question_id: Q2 },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(p.today.markedParts).toBe(2);
    // rings stay per-question distinct (both facts attribute Q2)
    expect(nodeOf(p, "4CH1-S1-b").questions.fraction).toBe(1);
  });

  test("honest-null: an attributed question with no node links counts today, moves no ring", async () => {
    const UNLINKED = "b0000000-0000-4000-8000-000000000009";
    const sql = fixture({
      awards: [
        { document_ref_id: PAPER, region_key: "20.p1", created_at: `${TODAY_ISO}07:00:00Z`, question_id: UNLINKED },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    // the marked-part fact is real (the marking act happened)
    expect(p.today.markedParts).toBe(1);
    // but no node moves — no fabricated tree anchor
    expect(nodeOf(p, "4CH1-S1-b").questions.done).toBe(0);
    expect(nodeOf(p, "4CH1-S1-a").questions.done).toBe(0);
  });

  test("the FIFTH distinct marked region flips the PRACTISE task", async () => {
    const sql = fixture({
      awards: ["1", "2", "3", "4", "5"].map((n) => ({
        document_ref_id: PAPER,
        region_key: `9.p${n}`,
        created_at: `${TODAY_ISO}0${n}:00:00Z`,
        question_id: Q2,
      })),
    });
    const plan = await buildPlanProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    const practise = plan.tasks.find((t) => t.taskId === "practise:4CH1-S1-b")!;
    expect(practise.markedParts).toBe(5);
    expect(practise.complete).toBe(true);
    expect(practise.autoCompletedBy).toBe("MARKED_PARTS");
  });

  test("yesterday's region award is cumulative on the rings, out of today", async () => {
    const sql = fixture({
      awards: [
        { document_ref_id: PAPER, region_key: "9.p1", created_at: `${YESTERDAY_ISO}10:00:00Z`, question_id: Q2 },
      ],
    });
    const p = await buildProgressProjection(sql, LEARNER, "igcse-chemistry-19", NOW);
    expect(nodeOf(p, "4CH1-2.1").questions.leafDone).toBe(true);
    expect(p.today.markedParts).toBe(0);
  });
});
