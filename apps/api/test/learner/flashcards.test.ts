/**
 * T-MIG-043 tranche-1 pins — flashcard surfaces (rating append law, keyset
 * trail, derived review schedule) over the stubbed SqlFn (033/041 template).
 * Every verbatim message below is pinned against the frozen core @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_INTERVAL_DAYS,
  LearnerSurfaceHttpError,
  decodeTrailCursor,
  encodeTrailCursor,
  intervalDaysFor,
  normalizeIntervalDays,
  parseFlashcardRating,
  ratingStorageName,
  rateFlashcard,
  ratingTrail,
  resolveTrailLimit,
  reviewSchedule,
  scheduleCard,
  storedRatingToWire,
  type ScheduleTrailRow,
} from "../../src/services/learner";
import { fakeSql, type Route } from "./helpers";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const LEARNER = "22222222-2222-4222-8222-222222222222";
const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");

function clock() {
  return FIXED_NOW;
}
let seq = 0;
function newId() {
  seq += 1;
  return `00000000-0000-4000-8000-00000000000${seq}`.slice(0, 36);
}

const anchorRoute: Route = {
  match: /select id, node_type, code from knowledge_nodes where code = \?$/,
  rows: [{ id: NODE_ID, node_type: "TOPIC", code: "WCH11-T1" }],
};
const insertRoute: Route = {
  match: /^insert into flashcard_ratings/,
  rows: [],
};

// ── rating parse law (:47-53 + :90-93) ─────────────────────────────────────

describe("flashcard rating parse law", () => {
  test("tolerant forms map to the wire vocabulary", () => {
    expect(parseFlashcardRating("know")).toBe("know");
    expect(parseFlashcardRating("  KNOW ")).toBe("know");
    expect(parseFlashcardRating("still-learning")).toBe("still-learning");
    expect(parseFlashcardRating("stilllearning")).toBe("still-learning");
    expect(parseFlashcardRating("STILL_LEARNING")).toBe("still-learning");
  });

  test("unknown value -> 400 with the verbatim controller message", () => {
    expect(() => parseFlashcardRating("easy")).toThrow(
      'rating must be "still-learning" or "know": easy',
    );
    try {
      parseFlashcardRating("easy");
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).status).toBe(400);
    }
  });

  test("storage form is the enum NAME; view form is the wire", () => {
    expect(ratingStorageName("know")).toBe("KNOW");
    expect(ratingStorageName("still-learning")).toBe("STILL_LEARNING");
    expect(storedRatingToWire("KNOW")).toBe("know");
    expect(storedRatingToWire("STILL_LEARNING")).toBe("still-learning");
  });
});

// ── constraint layer (jakarta defaults, declaration order — R-1 law) ───────

describe("flashcard rating constraint layer", () => {
  const base = { learnerId: LEARNER, cardId: "card-abc-123", rating: "know", subtopicCode: "WCH11-T1" };

  test("blank cardId fails first with the jakarta default", async () => {
    try {
      await rateFlashcard(fakeSql([anchorRoute, insertRoute]), { ...base, cardId: "" }, { now: clock, newId });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("cardId: must not be blank");
      expect((e as LearnerSurfaceHttpError).status).toBe(400);
    }
  });

  test("cardId size + pattern laws (declaration order)", async () => {
    try {
      await rateFlashcard(fakeSql([]), { ...base, cardId: "ab" }, { now: clock, newId });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("cardId: size must be between 3 and 64");
    }
    try {
      await rateFlashcard(fakeSql([]), { ...base, cardId: "card.abc" }, { now: clock, newId });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("cardId: card id must be the hub content id");
    }
  });

  test("subtopicCode size + pattern laws", async () => {
    try {
      await rateFlashcard(fakeSql([]), { ...base, subtopicCode: "W" }, { now: clock, newId });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("subtopicCode: size must be between 2 and 64");
    }
    try {
      await rateFlashcard(fakeSql([]), { ...base, subtopicCode: "WCH11_T1" }, { now: clock, newId });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe('subtopicCode: must match "^[A-Za-z0-9-]+$"');
    }
  });

  test("constraint failure on cardId beats the unknown-rating parse (:87 @Valid first)", async () => {
    await rateFlashcard(fakeSql([]), { ...base, cardId: "ab", rating: "easy" }, { now: clock, newId }).catch(
      (e) => expect((e as LearnerSurfaceHttpError).message).toBe("cardId: size must be between 3 and 64"),
    );
  });
});

// ── POST append path (:86-114) ──────────────────────────────────────────────

describe("flashcard rating append path", () => {
  test("201 view: request subtopicCode verbatim, injected now/id, ONE insert", async () => {
    const sql = fakeSql([anchorRoute, insertRoute]);
    const view = await rateFlashcard(
      sql,
      { learnerId: LEARNER, cardId: "card-abc-123", rating: "KNOW ", subtopicCode: "WCH11-T1" },
      { now: clock, newId },
    );
    expect(view).toEqual({
      cardId: "card-abc-123",
      rating: "know",
      subtopicCode: "WCH11-T1",
      nodeId: NODE_ID,
      occurredAt: FIXED_NOW.toISOString(),
    });
    expect(sql.queries.length).toBe(2);
    expect(sql.queries[1]).toMatch(/^insert into flashcard_ratings/);
    expect(sql.queries[1]).toContain("occurred_at");
  });

  test("insert stores the rating as the enum NAME (:90)", async () => {
    let captured = "";
    const sql = fakeSql([
      anchorRoute,
      {
        match: /^insert into flashcard_ratings/,
        rows: [],
        rowsFor: (params) => {
          captured = String(params[4]);
          return [];
        },
      },
    ]);
    await rateFlashcard(
      sql,
      { learnerId: LEARNER, cardId: "card-abc-123", rating: "still-learning", subtopicCode: "WCH11-T1" },
      { now: clock, newId },
    );
    expect(captured).toBe("STILL_LEARNING");
  });

  test("unknown anchor -> 404 verbatim (:97-99)", async () => {
    const sql = fakeSql([{ match: /knowledge_nodes where code/, rows: [] }]);
    try {
      await rateFlashcard(
        sql,
        { learnerId: LEARNER, cardId: "card-abc-123", rating: "know", subtopicCode: "NOPE-X1" },
        { now: clock, newId },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("unknown subtopic anchor: NOPE-X1");
      expect((e as LearnerSurfaceHttpError).status).toBe(404);
    }
  });

  test("structure gate: a SUBJECT node is not a deck anchor -> 404 verbatim (:100-105)", async () => {
    const sql = fakeSql([
      { match: /knowledge_nodes where code/, rows: [{ id: NODE_ID, node_type: "SUBJECT", code: "WCH11" }] },
    ]);
    try {
      await rateFlashcard(
        sql,
        { learnerId: LEARNER, cardId: "card-abc-123", rating: "know", subtopicCode: "WCH11" },
        { now: clock, newId },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe(
        "not a deck anchor (needs a curriculum-structure node below the subject root): WCH11",
      );
    }
  });

  test("UNIT and SUBTOPIC anchors pass the structure gate", async () => {
    for (const nodeType of ["UNIT", "SUBTOPIC"]) {
      const sql = fakeSql([
        { match: /knowledge_nodes where code/, rows: [{ id: NODE_ID, node_type: nodeType, code: "WCH11-U1" }] },
        insertRoute,
      ]);
      const view = await rateFlashcard(
        sql,
        { learnerId: LEARNER, cardId: "card-abc-123", rating: "know", subtopicCode: "WCH11-U1" },
        { now: clock, newId },
      );
      expect(view.rating).toBe("know");
    }
  });
});

// ── trail limit + cursor laws (:92-135 + TrailCursor) ──────────────────────

describe("trail limit + cursor laws", () => {
  test("limit: null -> 200; <1 -> 400 verbatim; clamp to 500", () => {
    expect(resolveTrailLimit(null)).toBe(200);
    expect(resolveTrailLimit(undefined)).toBe(200);
    expect(resolveTrailLimit(37)).toBe(37);
    expect(resolveTrailLimit(9999)).toBe(500);
    try {
      resolveTrailLimit(0);
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).message).toBe("limit must be >= 1: 0");
    }
  });

  test("cursor codec round-trips unpadded base64url {t,i}", () => {
    const enc = encodeTrailCursor({ t: "2026-06-01T11:00:00.000Z", i: NODE_ID });
    expect(enc).not.toContain("=");
    expect(decodeTrailCursor(enc)).toEqual({ t: "2026-06-01T11:00:00.000Z", i: NODE_ID });
  });

  test("fail-closed decode errors (wrapped 400 'malformed cursor: ...' at the boundary)", () => {
    expect(() => decodeTrailCursor("")).toThrow("cursor is blank");
    expect(() => decodeTrailCursor("!!!not-base64!!!")).toThrow("cursor is not decodable");
    expect(() => decodeTrailCursor(Buffer.from('{"t":"2026-06-01T11:00:00Z"}').toString("base64url"))).toThrow(
      "cursor is not a trail position",
    );
    expect(() =>
      decodeTrailCursor(Buffer.from('{"t":"not-a-time","i":"x"}').toString("base64url")),
    ).toThrow("cursor position is not parseable");
    try {
      decodeTrailCursor("!!!not-base64!!!");
    } catch (e) {
      expect((e as Error).message).toBe("cursor is not decodable");
    }
  });
});

describe("rating trail keyset page", () => {
  const row = (n: number, rating: string): Record<string, unknown> => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    card_id: `card-${n}`,
    node_id: NODE_ID,
    rating,
    occurred_at: `2026-05-${20 + n}T10:00:00.000Z`,
  });
  const trailRoute = (rows: Array<Record<string, unknown>>): Route => ({
    match: /^select id, card_id, node_id, rating, occurred_at from flashcard_ratings/,
    rows,
  });
  const codeRoute: Route = {
    match: /^select id, code from knowledge_nodes where id in \(/,
    rows: [{ id: NODE_ID, code: "WCH11-T1" }],
  };

  test("page+1 probe: hasMore + nextCursor iff hasMore; events carry resolved codes", async () => {
    const rows = [row(1, "KNOW"), row(2, "KNOW"), row(3, "STILL_LEARNING")];
    const sql = fakeSql([trailRoute([rows[0]!, rows[1]!, rows[2]!, row(4, "KNOW")]), codeRoute]);
    const view = await ratingTrail(
      sql,
      { learnerId: LEARNER, limit: 3 },
      { now: clock },
    );
    expect(view.hasMore).toBe(true);
    expect(view.events.length).toBe(3);
    expect(view.events[0]!.subtopicCode).toBe("WCH11-T1");
    expect(view.events[2]!.rating).toBe("still-learning");
    expect(view.nextCursor).not.toBeNull();
    expect(sql.queries[0]).toContain("limit ?"); // pageSize + 1 probe (bound param)
    expect(sql.queries[0]).toContain("order by occurred_at desc, id desc");
    const decoded = decodeTrailCursor(view.nextCursor!);
    expect(decoded.i).toBe(rows[2]!.id as string);
  });

  test("last page: hasMore false, nextCursor null", async () => {
    const sql = fakeSql([trailRoute([row(1, "KNOW")]), codeRoute]);
    const view = await ratingTrail(sql, { learnerId: LEARNER, limit: 3 }, { now: clock });
    expect(view.hasMore).toBe(false);
    expect(view.nextCursor).toBeNull();
  });

  test("cursor page 2+ uses the exclusive-tuple WHERE clause", async () => {
    const sql = fakeSql([trailRoute([]), codeRoute]);
    const cursor = encodeTrailCursor({ t: "2026-05-30T10:00:00.000Z", i: "00000000-0000-4000-8000-000000000003" });
    await ratingTrail(sql, { learnerId: LEARNER, cursor }, { now: clock });
    expect(sql.queries[0]).toContain("occurred_at < ?");
    expect(sql.queries[0]).toContain("occurred_at = ? and id < ?");
  });

  test("malformed cursor -> 400 'malformed cursor: ...' (:146)", async () => {
    const sql = fakeSql([]);
    try {
      await ratingTrail(sql, { learnerId: LEARNER, cursor: "!!!nope!!!" }, { now: clock });
      expect.unreachable();
    } catch (e) {
      expect((e as LearnerSurfaceHttpError).status).toBe(400);
      expect((e as LearnerSurfaceHttpError).message).toBe("malformed cursor: cursor is not decodable");
    }
  });

  test("vanished node -> honest null code, never a 404", async () => {
    const sql = fakeSql([trailRoute([row(1, "KNOW")]), { match: /knowledge_nodes where id in/, rows: [] }]);
    const view = await ratingTrail(sql, { learnerId: LEARNER }, { now: clock });
    expect(view.events[0]!.subtopicCode).toBeNull();
  });
});

// ── review schedule (FlashcardReviewScheduler + :79-125) ───────────────────

describe("review schedule ladder + scheduler law", () => {
  const params = { intervalDays: DEFAULT_INTERVAL_DAYS };

  test("intervalDaysFor: streak<=0 -> 0; ladder[min(streak-1, size-1)]", () => {
    expect(intervalDaysFor(0, params)).toBe(0);
    expect(intervalDaysFor(-3, params)).toBe(0);
    expect(intervalDaysFor(1, params)).toBe(1);
    expect(intervalDaysFor(2, params)).toBe(2);
    expect(intervalDaysFor(3, params)).toBe(4);
    expect(intervalDaysFor(4, params)).toBe(8);
    expect(intervalDaysFor(5, params)).toBe(16);
    expect(intervalDaysFor(6, params)).toBe(32);
    expect(intervalDaysFor(99, params)).toBe(32); // cap, never overstated
  });

  test("lenient normalization: null/empty/non-positive -> the default ladder", () => {
    expect(normalizeIntervalDays(null)).toEqual(DEFAULT_INTERVAL_DAYS);
    expect(normalizeIntervalDays([])).toEqual(DEFAULT_INTERVAL_DAYS);
    expect(normalizeIntervalDays([1, -2, 4])).toEqual(DEFAULT_INTERVAL_DAYS);
    expect(normalizeIntervalDays([3, 5])).toEqual([3, 5]);
  });

  const trailOf = (ratings: string[], startHour = 10): ScheduleTrailRow[] =>
    ratings.map((r, i) => ({
      card_id: "card-1",
      node_id: NODE_ID,
      rating: r,
      occurred_at: new Date(
        Date.UTC(2026, 4, 30, startHour, 0, 0, 0) + i * 3_600_000,
      ).toISOString(),
    }));

  test("scheduleCard: trailing KNOW streak; STILL_LEARNING tail = due now", () => {
    const now = new Date("2026-05-31T00:00:00.000Z");
    const know = scheduleCard("card-1", trailOf(["STILL_LEARNING", "KNOW", "KNOW"]), now, params);
    expect(know.streak).toBe(2);
    expect(know.intervalDays).toBe(2);
    expect(know.rating).toBe("know");
    // latest occurred_at = 2026-05-30T12:00Z; +2d = 2026-06-01T12:00Z; now
    // (05-31T00:00) is BEFORE it -> not due
    expect(know.due).toBe(false);
    expect(know.dueAt).toBe("2026-06-01T12:00:00.000Z");

    const reset = scheduleCard("card-1", trailOf(["KNOW", "KNOW", "STILL_LEARNING"]), now, params);
    expect(reset.streak).toBe(0);
    expect(reset.intervalDays).toBe(0);
    expect(reset.due).toBe(true);
    expect(reset.dueAt).toBe(reset.lastRatedAt);
  });

  test("scheduleCard rejects an empty trail (never-rated cards have no schedule)", () => {
    expect(() => scheduleCard("card-1", [], new Date(), params)).toThrow(
      "empty trail for card card-1 — never-rated cards have no schedule",
    );
  });

  test("derived queue: feed ordering, summary(due, total-due, nextDueAt), zero writes", async () => {
    const sql = fakeSql([
      {
        match: /^select card_id, node_id, rating, occurred_at from flashcard_ratings/,
        rows: [
          { card_id: "card-b", node_id: NODE_ID, rating: "KNOW", occurred_at: "2026-05-30T01:00:00.000Z" },
          { card_id: "card-a", node_id: NODE_ID, rating: "STILL_LEARNING", occurred_at: "2026-05-30T02:00:00.000Z" },
          { card_id: "card-c", node_id: NODE_ID, rating: "KNOW", occurred_at: "2026-05-30T03:00:00.000Z" },
        ],
      },
      { match: /^select id, code from knowledge_nodes where id in \(/, rows: [{ id: NODE_ID, code: "WCH11-T1" }] },
    ]);
    const now = new Date("2026-05-31T00:00:00.000Z");
    const view = await reviewSchedule(sql, LEARNER, { now: () => now });
    expect(sql.queries[0]).toContain("order by card_id asc, occurred_at asc, id asc");
    expect(view.cards.length).toBe(3);
    expect(view.cards.every((c) => c.subtopicCode === "WCH11-T1")).toBe(true);
    // card-b: KNOW @05-30T01:00 +1d = 05-31T01:00 -> now (05-31T00:00) is
    // BEFORE it -> not due; card-c: +1d = 05-31T03:00 -> not due; card-a:
    // STILL_LEARNING tail -> streak 0 -> dueAt = its own occurred_at
    // (05-30T02:00) -> already past -> due
    expect(view.summary.due).toBe(1);
    expect(view.summary.scheduled).toBe(2); // total - due
    expect(view.summary.nextDueAt).toBe("2026-05-31T01:00:00.000Z");
    // feed ordering: dueAt asc then cardId asc
    const dues = view.cards.map((c) => c.dueAt);
    expect([...dues].sort()).toEqual(dues);
    // ADR-031: the schedule is COMPUTED — the only queries are the trail
    // read + the anchor codes; zero INSERT/UPDATE on this path
    expect(sql.queries.some((q) => /^(insert|update)/i.test(q))).toBe(false);
  });

  test("nextDueAt = min dueAt of the !due cards, else null", async () => {
    const sql = fakeSql([
      {
        match: /^select card_id, node_id, rating, occurred_at from flashcard_ratings/,
        rows: [
          { card_id: "card-future", node_id: NODE_ID, rating: "KNOW", occurred_at: "2026-05-30T23:00:00.000Z" },
        ],
      },
      { match: /^select id, code from knowledge_nodes where id in \(/, rows: [] },
    ]);
    const now = new Date("2026-05-31T00:00:00.000Z");
    const view = await reviewSchedule(sql, LEARNER, { now: () => now });
    expect(view.summary.due).toBe(0);
    expect(view.summary.scheduled).toBe(1);
    expect(view.summary.nextDueAt).toBe("2026-05-31T23:00:00.000Z"); // +1d ladder
    expect(view.cards[0]!.due).toBe(false);
  });
});
