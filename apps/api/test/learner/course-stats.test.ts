/**
 * Stubbed-sql unit tests for the /course-stats read port (T-MIG-041 tranche 1).
 *
 * Frozen law (CourseStatsController.courseStats :51-57 + CourseStatsView docs):
 * attempts counts EVERY row (retries included — practice volume is real
 * activity) while the other three are DISTINCT-coverage counts (questions /
 * notes / cards); exposure/history/stats only, never competence (the honesty
 * rule pinned by FlashcardRatingFlowIT on the core side).
 */
import { describe, expect, test } from "bun:test";
import { buildCourseStatsView } from "../../src/services/learner";
import { fakeSql, LEARNER } from "./helpers";

type Rows = Array<Record<string, unknown>>;

function statsRoutes(overrides: { attempts?: Rows; distinctQuestions?: Rows; noteViews?: Rows; distinctCards?: Rows } = {}) {
  return [
    {
      match: /select count\(\*\)::int as n from attempts where learner_id = \?$/,
      rows: overrides.attempts ?? [{ n: 7 }],
    },
    {
      match: /select count\(distinct question_id\)::int as n from attempts/,
      rows: overrides.distinctQuestions ?? [{ n: 5 }],
    },
    {
      match: /select count\(\*\)::int as n from revision_note_viewed where user_id = \?$/,
      rows: overrides.noteViews ?? [{ n: 3 }],
    },
    {
      match: /select count\(distinct card_id\)::int as n from flashcard_ratings/,
      rows: overrides.distinctCards ?? [{ n: 12 }],
    },
  ];
}

describe("learner /course-stats over stubbed sql", () => {
  test("four counts with the exact DISTINCT/total semantics + wire mapping", async () => {
    const sql = fakeSql(statsRoutes());
    const view = await buildCourseStatsView(sql, LEARNER);
    expect(view).toEqual({
      learnerId: LEARNER,
      attempts: 7, // every attempt row, retries included
      distinctQuestions: 5, // count(distinct question_id)
      notesViewed: 3, // revision_note_viewed rows for the user
      flashcardsRated: 12, // count(distinct card_id) — full-trail coverage
    });
  });

  test("SQL shape: each count targets its own table with the learner/user filter", async () => {
    const sql = fakeSql(statsRoutes());
    await buildCourseStatsView(sql, LEARNER);
    expect(sql.queries[0]).toContain("select count(*)::int as n from attempts where learner_id = ?");
    expect(sql.queries[1]).toContain(
      "select count(distinct question_id)::int as n from attempts where learner_id = ?",
    );
    expect(sql.queries[2]).toContain(
      "select count(*)::int as n from revision_note_viewed where user_id = ?",
    );
    expect(sql.queries[3]).toContain(
      "select count(distinct card_id)::int as n from flashcard_ratings where learner_id = ?",
    );
    expect(sql.queries.length).toBe(4);
  });

  test("empty learner: zeros (the honest cold-start state — w4-course-stats-empty-200 posture)", async () => {
    const sql = fakeSql(
      statsRoutes({ attempts: [{ n: 0 }], distinctQuestions: [{ n: 0 }], noteViews: [{ n: 0 }], distinctCards: [{ n: 0 }] }),
    );
    const view = await buildCourseStatsView(sql, LEARNER);
    expect(view.attempts).toBe(0);
    expect(view.distinctQuestions).toBe(0);
    expect(view.notesViewed).toBe(0);
    expect(view.flashcardsRated).toBe(0);
  });
});
