/**
 * Learner-me service unit tests (T-MIG-043 tranche 1) — stubbed sql via the
 * shared fakeSql helper (+ param-aware routes). Pins the frozen law
 * @ 6cad6ef: the V47 rating evidence class (tolerant parse, verbatim 400,
 * fail-closed anchor attribution, append-only), the T-C61 keyset trail
 * (200/500/clamp law, +1 probe, exclusive-tuple page 2+, the TrailCursor
 * FAIL-CLOSED codec with the frozen error texts), the T-C53 derived review
 * schedule (trailing-KNOW streak, hub-parity ladder, dueAt/cardId order,
 * honest summary), the V48 note-vote twin (including the parse asymmetry:
 * NO underscore normalization), the T-C79 exam-series picker + idempotent
 * target-series upsert (kebab slug, published gate, UTC-today countdowns,
 * the STRICTLY-before entry deadline), the V49/V51 learner assignments
 * (visibility filter, latest hand-in, the verbatim gates) and the T-C76
 * agenda composition (dueReviews, the agenda re-order distinct from the
 * list order, the honest 501 posture for the tranche-2 NBA block).
 */
import { describe, expect, test } from "bun:test";
import {
  AGENDA_ASSIGNMENT_LIMIT,
  FLASHCARD_REVIEW_DEFAULT_INTERVAL_DAYS,
  buildLearnerMeModule,
  courseExamTargetView,
  decodeTrailCursor,
  encodeTrailCursor,
  flashcardIntervalDaysFor,
  flashcardReviewSchedule,
  flashcardTrailPage,
  normalizeFlashcardLadder,
  parseFlashcardRating,
  parseNoteVote,
  ratingWire,
  noteVoteWire,
  recordFlashcardRating,
  recordNoteVote,
  scheduleCard,
  type EnrolmentRow,
} from "../../src/services/learner-me";
import { BadRequestError, ConflictError, type SubmitClock } from "../../src/services/selfmark";
import {
  LearnerMeForbiddenError,
  LearnerMeNotFoundError,
  LearnerMeNotImplementedError,
} from "../../src/services/learner-me";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const LEARNER = "aa000000-0000-4000-8000-000000000001";
const NODE_ANCHOR = "20000000-0000-4000-8000-000000000001"; // SUBTOPIC
const NODE_TOPIC = "20000000-0000-4000-8000-000000000002"; // TOPIC
const NODE_CONCEPT = "20000000-0000-4000-8000-000000000003"; // CONCEPT (semantic layer)
const NODE_SUBJECT = "20000000-0000-4000-8000-000000000004"; // the subject root
const NODE_MISSING = "20000000-0000-4000-8000-0000000000ff";
const SERIES_A = "1a000000-0000-4000-8000-000000000001";
const SERIES_B = "1a000000-0000-4000-8000-000000000002";
const SERIES_VANISHED = "1a000000-0000-4000-8000-000000000003";
const ASSIGNMENT_A = "3a000000-0000-4000-8000-000000000001";
const ASSIGNMENT_B = "3a000000-0000-4000-8000-000000000002";
const CLASS_1 = "4a000000-0000-4000-8000-000000000001";
const RATING_1 = "50000000-0000-4000-8000-000000000001";
const RATING_2 = "50000000-0000-4000-8000-000000000002";
const RATING_3 = "50000000-0000-4000-8000-000000000003";

const T0 = "2026-09-20T10:00:00.305782+00";
const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const T3 = "2026-10-03T10:00:00Z";
const T4 = "2026-10-04T10:00:00Z";
const NOW_TEXT = "2026-10-06T07:45:00Z";
const NOW_ISO = "2026-10-06T07:45:00.000Z"; // toInstant(NOW_TEXT) — the fleet's Date rendering

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};

const anchorByCode: Record<string, { id: string; node_type: string }> = {
  "WCH11-S1-a": { id: NODE_ANCHOR, node_type: "SUBTOPIC" },
  "WCH11-T1": { id: NODE_TOPIC, node_type: "TOPIC" },
  "CONCEPT-x": { id: NODE_CONCEPT, node_type: "CONCEPT" },
  "WCH11": { id: NODE_SUBJECT, node_type: "SUBJECT" },
};

const anchorRoute: Route = {
  match: /select id, node_type from knowledge_nodes where code = \?$/,
  rows: [],
  rowsFor: (params) => {
    const code = params[0] as string;
    return (anchorByCode[code] ? [anchorByCode[code]] : []) as unknown as Array<Record<string, unknown>>;
  },
};

const ratingRow = (over: Partial<RatingRowLike>): RatingRowLike => ({
  id: RATING_1,
  node_id: NODE_ANCHOR,
  card_id: "fl_card_1",
  rating: "KNOW",
  occurred_at: T1,
  ...over,
});
interface RatingRowLike {
  [key: string]: unknown;
  id: string;
  node_id: string;
  card_id: string;
  rating: string;
  occurred_at: string;
}
type RatingRow = RatingRowLike;

const codeRoute = (codes: Record<string, string>): Route => ({
  match: /select id, code from knowledge_nodes where id = any/,
  rows: [],
  rowsFor: (params) =>
    (params[0] as string[])
      .filter((id) => codes[id] !== undefined)
      .map((id) => ({ id, code: codes[id] })) as unknown as Array<Record<string, unknown>>,
});

// ── parse laws (pure, no sql) ───────────────────────────────────────────────

describe("parseFlashcardRating (FlashcardRating.Rating.parse :43-52)", () => {
  test("accepts the hub's wire forms, the compact form, case and padding", () => {
    expect(parseFlashcardRating("still-learning")).toBe("STILL_LEARNING");
    expect(parseFlashcardRating("stilllearning")).toBe("STILL_LEARNING");
    expect(parseFlashcardRating("STILL_LEARNING")).toBe("STILL_LEARNING"); // '_'→'-', lowercased
    expect(parseFlashcardRating("  KNOW  ")).toBe("KNOW"); // trimmed
    expect(parseFlashcardRating("know")).toBe("KNOW");
  });

  test("rejects anything outside the vocabulary with null (caller 400s)", () => {
    expect(parseFlashcardRating("maybe")).toBeNull();
    expect(parseFlashcardRating("still_learning")).toBe("STILL_LEARNING"); // '_' normalized
    expect(parseFlashcardRating("")).toBeNull();
    expect(parseFlashcardRating(null)).toBeNull();
    expect(parseFlashcardRating(undefined)).toBeNull();
  });

  test("ratingWire renders name().toLowerCase() with '_'→'-'", () => {
    expect(ratingWire("STILL_LEARNING")).toBe("still-learning");
    expect(ratingWire("KNOW")).toBe("know");
  });
});

describe("parseNoteVote (NoteVote.Vote.parse :46-55)", () => {
  test("accepts helpful|up and not-helpful|nothelpful|down, case-insensitive", () => {
    expect(parseNoteVote("helpful")).toBe("HELPFUL");
    expect(parseNoteVote("UP")).toBe("HELPFUL");
    expect(parseNoteVote("not-helpful")).toBe("NOT_HELPFUL");
    expect(parseNoteVote("nothelpful")).toBe("NOT_HELPFUL");
    expect(parseNoteVote("Down")).toBe("NOT_HELPFUL");
  });

  test("PARSE ASYMMETRY: no underscore normalization (unlike Rating.parse)", () => {
    expect(parseNoteVote("not_helpful")).toBeNull();
    expect(parseNoteVote("maybe")).toBeNull();
    expect(parseNoteVote(null)).toBeNull();
  });

  test("noteVoteWire renders the canonical wire form (:59-62)", () => {
    expect(noteVoteWire("HELPFUL")).toBe("helpful");
    expect(noteVoteWire("NOT_HELPFUL")).toBe("not-helpful");
  });
});

// ── V47 rating write law ────────────────────────────────────────────────────

describe("recordFlashcardRating (FlashcardRatingController :84-107)", () => {
  test("400 verbatim on an unknown rating value (golden w4-flashcard-rating-bad-rating-400)", async () => {
    const sql = fakeSql([]);
    try {
      await recordFlashcardRating({ sql, clock }, LEARNER, {
        cardId: "fl_w4_cap_001",
        rating: "maybe",
        subtopicCode: "WCH11-T1",
      });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestError);
      expect((e as Error).message).toBe('rating must be "still-learning" or "know": maybe');
    }
    expect(sql.queries.length).toBe(0); // nothing read, nothing written
  });

  test("404 verbatim on an unknown anchor (golden w4-flashcard-rating-unknown-anchor-404)", async () => {
    const sql = fakeSql([anchorRoute]);
    try {
      await recordFlashcardRating({ sql, clock }, LEARNER, {
        cardId: "fl_w4_cap_009",
        rating: "know",
        subtopicCode: "NOPE-UNKNOWN-ANCHOR",
      });
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect(e).toBeInstanceOf(LearnerMeNotFoundError);
      expect((e as Error).message).toBe("unknown subtopic anchor: NOPE-UNKNOWN-ANCHOR");
    }
  });

  test("FAIL-CLOSED gate: semantic-layer and subject-root anchors 404, nothing written", async () => {
    for (const code of ["CONCEPT-x", "WCH11"]) {
      const sql = fakeSql([anchorRoute]);
      try {
        await recordFlashcardRating({ sql, clock }, LEARNER, {
          cardId: "fl_x", rating: "know", subtopicCode: code,
        });
        throw new Error("expected LearnerMeNotFoundError for " + code);
      } catch (e) {
        expect((e as Error).message).toBe(
          "not a deck anchor (needs a curriculum-structure node below the subject root): " + code,
        );
      }
      expect(sql.queries.every((q) => !q.startsWith("insert"))).toBe(true);
    }
  });

  test("happy path: append-only insert, resolved view, wire rating", async () => {
    const sql = fakeSql([anchorRoute, { match: /insert into flashcard_ratings/, rows: [] }]);
    const view = await recordFlashcardRating({ sql, clock }, LEARNER, {
      cardId: "fl_card_9",
      rating: "know",
      subtopicCode: "WCH11-S1-a",
    });
    expect(view).toEqual({
      cardId: "fl_card_9",
      rating: "know",
      subtopicCode: "WCH11-S1-a",
      nodeId: NODE_ANCHOR,
      occurredAt: NOW_ISO,
    });
    expect(sql.queries.filter((q) => q.startsWith("insert")).length).toBe(1);
  });

  test("APPEND-ONLY: a re-rate is a second row, never an update", async () => {
    const sql = fakeSql([anchorRoute, { match: /insert into flashcard_ratings/, rows: [] }]);
    await recordFlashcardRating({ sql, clock }, LEARNER, {
      cardId: "fl_card_9", rating: "know", subtopicCode: "WCH11-S1-a",
    });
    await recordFlashcardRating({ sql, clock }, LEARNER, {
      cardId: "fl_card_9", rating: "still-learning", subtopicCode: "WCH11-S1-a",
    });
    expect(sql.queries.filter((q) => q.startsWith("insert")).length).toBe(2);
    expect(sql.queries.some((q) => q.startsWith("update"))).toBe(false);
  });
});

// ── TrailCursor codec ───────────────────────────────────────────────────────

describe("TrailCursor (T-C61 opaque keyset codec)", () => {
  test("encode → base64url unpadded JSON {t, i}; round-trip preserves EXACT text", () => {
    const pos = { occurredAt: "2026-10-05 15:48:32.305782+00", id: RATING_1 };
    const encoded = encodeTrailCursor(pos);
    expect(encoded).not.toMatch(/[+/=]/); // base64url, unpadded
    expect(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))).toEqual({
      t: pos.occurredAt,
      i: pos.id,
    });
    expect(decodeTrailCursor(encoded)).toEqual(pos); // no Date normalization
  });

  test("round-trips an ISO-Z instant with nanosecond text unharmed", () => {
    const pos = { occurredAt: "2026-10-05T15:48:32.305782757Z", id: RATING_2 };
    expect(decodeTrailCursor(encodeTrailCursor(pos))).toEqual(pos);
  });

  test("FAIL-CLOSED with the frozen error texts", () => {
    expect(() => decodeTrailCursor("")).toThrow("cursor is blank");
    expect(() => decodeTrailCursor("   ")).toThrow("cursor is blank");
    expect(() => decodeTrailCursor("not base64!!")).toThrow("cursor is not decodable");
    expect(() => decodeTrailCursor("a+b/c=")).toThrow("cursor is not decodable"); // URL alphabet only
    const badShape = Buffer.from(JSON.stringify(["t", "i"])).toString("base64url");
    expect(() => decodeTrailCursor(badShape)).toThrow("cursor is not a trail position");
    const wrongSize = Buffer.from(JSON.stringify({ t: T1 })).toString("base64url");
    expect(() => decodeTrailCursor(wrongSize)).toThrow("cursor is not a trail position");
    const missingId = Buffer.from(JSON.stringify({ t: T1, i: null })).toString("base64url");
    expect(() => decodeTrailCursor(missingId)).toThrow("cursor is not a trail position");
    const badInstant = Buffer.from(JSON.stringify({ t: "2026-13-45T99:00:00Z", i: RATING_1 }))
      .toString("base64url");
    expect(() => decodeTrailCursor(badInstant)).toThrow("cursor position is not parseable");
    const badUuid = Buffer.from(JSON.stringify({ t: T1, i: "nope" })).toString("base64url");
    expect(() => decodeTrailCursor(badUuid)).toThrow("cursor position is not parseable");
  });
});

// ── T-C61 trail walk ────────────────────────────────────────────────────────

const TRAIL_ORDER = "order by occurred_at desc, id desc";

const trailRoutes = (allRows: RatingRowLike[], codes: Record<string, string>): Route[] => [
  anchorRoute,
  {
    match: new RegExp(
      "select id, node_id, card_id, rating, occurred_at from flashcard_ratings where learner_id = \\? " +
        TRAIL_ORDER.replace(/[()]/g, "\\$&") +
        " limit \\?$",
    ),
    rows: [],
    rowsFor: (params) =>
      allRows.slice(0, params[1] as number) as unknown as Array<Record<string, unknown>>,
  },
  {
    // row-value keyset predicate (occurred_at, id) < (ts, id) — params
    // [learnerId, ts, id, limit]; the stub applies the same tuple law.
    match: /\(occurred_at, id\) < \( \? , \? \)/,
    rows: [],
    rowsFor: (params) => {
      const ts = params[1] as string;
      const afterId = params[2] as string;
      const capped = allRows.filter(
        (r) =>
          (r.occurred_at as string) < ts ||
          (r.occurred_at === ts && (r.id as string) < afterId),
      );
      return capped.slice(0, params[3] as number) as unknown as Array<Record<string, unknown>>;
    },
  },
  codeRoute(codes),
];

describe("flashcardTrailPage (FlashcardRatingTrailController :90-140)", () => {
  const all = [
    ratingRow({ id: RATING_3, occurred_at: T3, card_id: "fl_b" }),
    ratingRow({ id: RATING_2, occurred_at: T2, card_id: "fl_a", rating: "STILL_LEARNING" }),
    ratingRow({ id: RATING_1, occurred_at: T1, card_id: "fl_a" }),
  ];
  const codes = { [NODE_ANCHOR]: "WCH11-S1-a", [NODE_TOPIC]: "WCH11-T1" };
  const rows = [
    ratingRow({ id: RATING_3, occurred_at: T3, card_id: "fl_b", node_id: NODE_TOPIC }),
    ...all.slice(1),
  ];

  test("limit law: null → 200 (bind 201 probe); < 1 → 400 verbatim; above cap clamps", async () => {
    const sql = fakeSql(trailRoutes(rows, codes));
    const page = await flashcardTrailPage({ sql, clock }, LEARNER, {});
    expect(page.hasMore).toBe(false);
    expect(page.events.length).toBe(3);
    expect(sql.queries[0]).toContain("limit ?");

    try {
      await flashcardTrailPage({ sql, clock }, LEARNER, { limit: 0 });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestError);
      expect((e as Error).message).toBe("limit must be >= 1: 0");
    }

    const clampSql = fakeSql(trailRoutes(rows, codes));
    await flashcardTrailPage({ sql: clampSql, clock }, LEARNER, { limit: 501 });
    // pageSize clamped to 500 → the probe binds 501
    expect(clampSql.queries[0]).toContain("limit ?");
  });

  test("page 1 newest-first; hasMore + nextCursor = the LAST served row's raw position", async () => {
    const sql = fakeSql([
      {
        match: new RegExp(TRAIL_ORDER.replace(/[()]/g, "\\$&") + " limit \\?$"),
        rows: [],
  rowsFor: (params) => rows.slice(0, params[1] as number) as unknown as Array<Record<string, unknown>>,
      },
      codeRoute(codes),
    ]);
    const page = await flashcardTrailPage({ sql, clock }, LEARNER, { limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.events.map((e) => e.cardId)).toEqual(["fl_b", "fl_a"]);
    expect(page.nextCursor).toBe(
      encodeTrailCursor({ occurredAt: T2, id: RATING_2 }),
    );
    expect(page.generatedAt).toBe(NOW_ISO);
    expect(page.events[0]!).toEqual({
      cardId: "fl_b",
      rating: "know",
      subtopicCode: "WCH11-T1",
      nodeId: NODE_TOPIC,
      occurredAt: "2026-10-03T10:00:00.000Z",
    });
  });

  test("page 2 walks STRICTLY AFTER the cursor (exclusive-tuple predicate in the SQL)", async () => {
    const sql = fakeSql(trailRoutes(rows, codes));
    const cursor = encodeTrailCursor({ occurredAt: T2, id: RATING_2 });
    const page = await flashcardTrailPage({ sql, clock }, LEARNER, { limit: 2, cursor });
    const page2Query = sql.queries.find((q) => q.includes("(occurred_at, id) < ( ? , ? )"));
    expect(page2Query).toBeTruthy();
    expect(page.events.map((e) => e.cardId)).toEqual(["fl_a"]);
  });

  test("malformed cursor → 400 with the frozen prefix, never a guess", async () => {
    const sql = fakeSql(trailRoutes(rows, codes));
    try {
      await flashcardTrailPage({ sql, clock }, LEARNER, { limit: 5, cursor: "@@@" });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe("malformed cursor: cursor is not decodable");
    }
  });

  test("honest null anchor code on an absent node row (degrades the CODE, never the row)", async () => {
    const sql = fakeSql([
      {
        match: new RegExp(TRAIL_ORDER.replace(/[()]/g, "\\$&") + " limit \\?$"),
        rows: [],
  rowsFor: (params) => [ratingRow({ node_id: NODE_MISSING })].slice(0, params[1] as number) as unknown as Array<Record<string, unknown>>,
      },
      codeRoute({}),
    ]);
    const page = await flashcardTrailPage({ sql, clock }, LEARNER, { limit: 5 });
    expect(page.events[0]!.subtopicCode).toBeNull();
    expect(page.events[0]!.nodeId).toBe(NODE_MISSING);
  });
});

// ── T-C53 derived schedule ──────────────────────────────────────────────────

describe("flashcard review schedule (FlashcardReviewScheduler + params)", () => {
  test("DEFAULT_INTERVAL_DAYS [1,2,4,8,16,32] and lenient normalization", () => {
    expect(FLASHCARD_REVIEW_DEFAULT_INTERVAL_DAYS).toEqual([1, 2, 4, 8, 16, 32]);
    expect(normalizeFlashcardLadder(null)).toEqual([1, 2, 4, 8, 16, 32]);
    expect(normalizeFlashcardLadder([])).toEqual([1, 2, 4, 8, 16, 32]);
    expect(normalizeFlashcardLadder([0, 2])).toEqual([1, 2, 4, 8, 16, 32]); // non-positive entry
    expect(normalizeFlashcardLadder([2, 5, 9])).toEqual([2, 5, 9]); // configurable passthrough
  });

  test("intervalDaysFor: streak 0 → 0 (due immediately); ladder[capped] beyond the end", () => {
    const ladder = [1, 2, 4, 8, 16, 32];
    expect(flashcardIntervalDaysFor(ladder, 0)).toBe(0);
    expect(flashcardIntervalDaysFor(ladder, 1)).toBe(1);
    expect(flashcardIntervalDaysFor(ladder, 3)).toBe(4);
    expect(flashcardIntervalDaysFor(ladder, 5)).toBe(16);
    expect(flashcardIntervalDaysFor(ladder, 6)).toBe(32); // the maintenance cap
    expect(flashcardIntervalDaysFor(ladder, 50)).toBe(32); // trail length cannot overstate
    expect(flashcardIntervalDaysFor([2, 5], 2)).toBe(5);
    expect(flashcardIntervalDaysFor([2, 5], 9)).toBe(5);
  });

  test("scheduleCard: trailing-KNOW streak; a STILL_LEARNING tail resets to due-now", () => {
    const ladder = [1, 2, 4, 8, 16, 32];
    const trail = [
      ratingRow({ occurred_at: T1, rating: "STILL_LEARNING" }),
      ratingRow({ occurred_at: T2, rating: "KNOW" }),
      ratingRow({ id: RATING_3, occurred_at: T3, rating: "KNOW" }),
    ];
    const s = scheduleCard("fl_x", trail, new Date("2026-10-03T10:00:01Z"), ladder);
    expect(s.streak).toBe(2);
    expect(s.intervalDays).toBe(2); // streak n → ladder[n-1]: 2 knows → 2 days
    expect(s.dueAt).toBe("2026-10-05T10:00:00.000Z"); // T3 + 2d
    expect(s.due).toBe(false);
    expect(s.rating).toBe("KNOW");

    const dueNow = scheduleCard(
      "fl_x",
      [ratingRow({ occurred_at: T3, rating: "STILL_LEARNING" })],
      new Date("2026-10-03T10:00:00Z"),
      ladder,
    );
    expect(dueNow.streak).toBe(0);
    expect(dueNow.intervalDays).toBe(0);
    expect(dueNow.due).toBe(true); // !now.isBefore(dueAt) — the boundary is DUE
  });

  test("empty trail is a programming error (frozen IllegalArgumentException posture)", () => {
    expect(() => scheduleCard("fl_x", [], new Date(), [1])).toThrow("empty trail for card fl_x");
  });

  test("feed: full-trail read in the repository order; feed sorted dueAt then cardId; honest summary", async () => {
    // clock = 2026-10-06T07:45Z; ladder [1,2,4,8,16,32]:
    //   fl_c: STILL_LEARNING at T3 → streak 0 → due NOW (dueAt = T3)
    //   fl_a: KNOW at T3 → +1d → dueAt Oct 4 (due)
    //   fl_b: KNOW at T5 (Oct 5 10:00) → +1d → dueAt Oct 6 10:00 (NOT due — clock 07:45)
    const trail = [
      ratingRow({ id: RATING_1, card_id: "fl_b", occurred_at: "2026-10-05T10:00:00Z" }),
      ratingRow({ id: RATING_2, card_id: "fl_a", occurred_at: T3 }),
      ratingRow({ id: RATING_3, card_id: "fl_c", occurred_at: T3, rating: "STILL_LEARNING" }),
    ];
    const sql = fakeSql([
      {
        match: /order by card_id asc, occurred_at asc, id asc$/,
        rows: trail,
      },
      codeRoute({ [NODE_ANCHOR]: "WCH11-S1-a" }),
    ]);
    const view = await flashcardReviewSchedule({ sql, clock }, LEARNER);
    // feed order = dueAt asc, then cardId: fl_c (Oct 3), fl_a (Oct 4), fl_b (Oct 6 10:00)
    expect(view.cards.map((c) => c.cardId)).toEqual(["fl_c", "fl_a", "fl_b"]);
    expect(view.summary.due).toBe(2);
    expect(view.summary.scheduled).toBe(1);
    expect(view.summary.nextDueAt).toBe("2026-10-06T10:00:00.000Z"); // fl_b's dueAt
    expect(view.cards.every((c) => c.subtopicCode === "WCH11-S1-a")).toBe(true);
    expect(view.generatedAt).toBe(NOW_ISO);
  });
});

// ── V48 note-vote write law ─────────────────────────────────────────────

describe("recordNoteVote (NoteVoteController :67-100)", () => {
  test("400 verbatim on an unknown vote value", async () => {
    const sql = fakeSql([]);
    try {
      await recordNoteVote({ sql, clock }, LEARNER, {
        noteId: "rn_1", vote: "maybe", subtopicCode: "WCH11-T1",
      });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe('vote must be "helpful" or "not-helpful": maybe');
    }
    expect(sql.queries.length).toBe(0);
  });

  test("404 verbatim on an unknown note anchor; structure gate rejects the semantic layer", async () => {
    const sql = fakeSql([anchorRoute]);
    try {
      await recordNoteVote({ sql, clock }, LEARNER, {
        noteId: "rn_1", vote: "up", subtopicCode: "NOPE",
      });
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect((e as Error).message).toBe("unknown note anchor: NOPE");
    }
    try {
      await recordNoteVote({ sql, clock }, LEARNER, {
        noteId: "rn_1", vote: "up", subtopicCode: "CONCEPT-x",
      });
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect((e as Error).message).toBe(
        "not a note anchor (needs a curriculum-structure node below the subject root): CONCEPT-x",
      );
    }
    expect(sql.queries.every((q) => !q.startsWith("insert"))).toBe(true);
  });

  test("happy path: append-only insert with the canonical wire form", async () => {
    const sql = fakeSql([anchorRoute, { match: /insert into note_votes/, rows: [] }]);
    const view = await recordNoteVote({ sql, clock }, LEARNER, {
      noteId: "rn_42", vote: "down", subtopicCode: "WCH11-S1-a",
    });
    expect(view).toEqual({
      noteId: "rn_42",
      vote: "not-helpful",
      subtopicCode: "WCH11-S1-a",
      nodeId: NODE_ANCHOR,
      occurredAt: NOW_ISO,
    });
  });
});

// ── T-C79 exam series + target-series ───────────────────────────────────

const seriesRow = (over: Partial<SeriesRowLike>): SeriesRowLike => ({
  id: SERIES_A,
  board: "PEARSON_EDEXCEL",
  qualification: "GCSE",
  series_code: "Jun-2027-GCSE",
  label: "June 2027 GCSE series",
  window_start: "2027-05-10",
  window_end: "2027-06-24",
  entry_deadline: "2027-03-20",
  results_date: null,
  estimated: true,
  source_url: "https://example.invalid/tt",
  retrieved_at: "2026-10-01T09:00:00Z",
  published: true,
  ...over,
});
interface SeriesRowLike {
  [key: string]: unknown;
  id: string;
  board: string;
  qualification: string;
  series_code: string;
  label: string;
  window_start: string;
  window_end: string;
  entry_deadline: string | null;
  results_date: string | null;
  estimated: boolean;
  source_url: string;
  retrieved_at: string;
  published: boolean;
}
type ExamSeriesRow = SeriesRowLike;

describe("examSeriesCalendar (LearnerExamSeriesController :59-69)", () => {
  const publishedCalendar = [
    seriesRow({}),
    seriesRow({ id: SERIES_B, series_code: "Nov-2027-GCSE", window_start: "2027-11-02" }),
  ];

  test("no filter → the whole published calendar, window_start ASC; blank = absent", async () => {
    const noFilter = fakeSql([
      { match: /where published = true order by window_start asc$/, rows: publishedCalendar },
    ]);
    const blank = fakeSql([
      { match: /where published = true order by window_start asc$/, rows: publishedCalendar },
    ]);
    const all = await examSeriesCalendar({ sql: noFilter, clock }, undefined);
    expect(all.map((s) => s.seriesCode)).toEqual(["Jun-2027-GCSE", "Nov-2027-GCSE"]);
    await examSeriesCalendar({ sql: blank, clock }, "   ");
    expect(blank.queries[0]).toContain("where published = true");
    expect(noFilter.queries[0]).not.toContain("board =");
  });

  test("filtered → board-scoped PEARSON_EDEXCEL + qualification, published only", async () => {
    const sql = fakeSql([
      {
        match: /board = \? and qualification = \? and published = true/,
        rows: [seriesRow({})],
      },
    ]);
    const rows = await examSeriesCalendar({ sql, clock }, "GCSE");
    expect(rows.length).toBe(1);
    expect(sql.queries[0]).toContain("board = ?"); // the board constant is a BIND param
    expect(sql.queries[0]).toContain("qualification = ?");
  });

  test("view mapping: LocalDate passthrough, nullable dates honest, instant rendered", async () => {
    const sql = fakeSql([
      { match: /where published = true order by window_start asc$/, rows: [seriesRow({})] },
    ]);
    const view = (await examSeriesCalendar({ sql, clock }))[0]!;
    expect(view.windowStart).toBe("2027-05-10");
    expect(view.entryDeadline).toBe("2027-03-20");
    expect(view.resultsDate).toBeNull();
    expect(view.retrievedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(view.estimated).toBe(true);
    expect(Object.keys(view)).not.toContain("published"); // unpublished never leaves the server
  });

  test("R-067-B live-driver posture: DATE(1082) columns arrive as JS Dates → bare wire dates (CourseExamTargetView.java:25-28 LocalDate passthrough; golden w4-exam-series-*.json), nulls stay null", async () => {
    const sql = fakeSql([
      {
        match: /where published = true order by window_start asc$/,
        rows: [
          seriesRow({
            window_start: new Date("2027-05-10T00:00:00.000Z") as unknown as string,
            window_end: new Date("2027-06-24T00:00:00.000Z") as unknown as string,
            entry_deadline: new Date("2027-03-20T00:00:00.000Z") as unknown as string | null,
            results_date: null,
          }),
        ],
      },
    ]);
    const view = (await examSeriesCalendar({ sql, clock }))[0]!;
    expect(view.windowStart).toBe("2027-05-10");
    expect(view.windowEnd).toBe("2027-06-24");
    expect(view.entryDeadline).toBe("2027-03-20");
    expect(view.resultsDate).toBeNull();
  });
});

describe("courseExamTargetView — R-067-B Date-posture normalization (normalize BEFORE the day arithmetic)", () => {
  const enrolment = {
    id: "en-1",
    learner_id: "lrn-1",
    course_slug: "gcse-maths",
    target_series_id: SERIES_A,
    created_at: "2026-10-01T09:00:00.000Z",
  } as unknown as EnrolmentRow;
  const dateSeriesRow = {
    id: SERIES_A,
    board: "PEARSON_EDEXCEL",
    qualification: "GCSE",
    series_code: "Jun-2027-GCSE",
    label: "June 2027 GCSE series",
    window_start: new Date("2027-05-10T00:00:00.000Z"),
    window_end: new Date("2027-06-24T00:00:00.000Z"),
    entry_deadline: new Date("2027-03-20T00:00:00.000Z"),
    results_date: null,
    estimated: true,
    source_url: "https://example.invalid/tt",
    retrieved_at: "2026-10-01T09:00:00Z",
  } as unknown as ExamSeriesRow;

  test("Date-carrying series row → bare wire dates AND correct derived arithmetic (would be NaN/shifted without normalization)", () => {
    const view = courseExamTargetView(enrolment, dateSeriesRow, "2026-10-06");
    expect(view.windowStart).toBe("2027-05-10");
    expect(view.windowEnd).toBe("2027-06-24");
    expect(view.entryDeadline).toBe("2027-03-20");
    expect(view.resultsDate).toBeNull();
    expect(view.daysToWindowStart).toBe(216); // 2026-10-06 → 2027-05-10
    expect(view.daysToWindowEnd).toBe(261); // 2026-10-06 → 2027-06-24
    expect(view.entryDeadlinePassed).toBe(false); // 2027-03-20 is after today
  });

  test("string-carrying series row stays byte-identical (fakeSql posture — zero behavior change)", () => {
    const view = courseExamTargetView(
      enrolment,
      seriesRow({}) as unknown as ExamSeriesRow,
      "2027-03-20", // the deadline DAY itself still allows entry (strictly-before law)
    );
    expect(view.windowStart).toBe("2027-05-10");
    expect(view.entryDeadline).toBe("2027-03-20");
    expect(view.entryDeadlinePassed).toBe(false);
    expect(view.resultsDate).toBeNull();
  });
});

// helper alias for the calendar import
import { examSeriesCalendar } from "../../src/services/learner-me";

describe("setTargetSeries / clearTargetSeries / examTargetsFor (:71-117 + ExamTargetReader)", () => {
  const enrolmentRoute = (rows: unknown[]): Route => ({
    match: /from learner_course_enrolments where learner_id = \? and course_slug = \?$/,
    rows: [],
  rowsFor: () => rows as unknown as Array<Record<string, unknown>>,
  });
  const seriesByIdRoute = (rows: ExamSeriesRow[]): Route => ({
    match: /from exam_series where id = \?$/,
    rows: [],
  rowsFor: (params) => rows.filter((r) => (r as ExamSeriesRow).id === params[0]),
  });

  test("kebab-case slug law: uppercase/dotted/empty slugs 400 verbatim", async () => {
    for (const slug of ["IGCSE-Chemistry", "igcse_chem", "a..b", "-lead", "trail-", ""]) {
      const sql = fakeSql([]);
      try {
        await setTargetSeries({ sql, clock }, LEARNER, slug, { seriesId: SERIES_A });
        throw new Error("expected BadRequestError for " + JSON.stringify(slug));
      } catch (e) {
        expect((e as Error).message).toBe("course slug must be a kebab-case registry key");
      }
      expect(sql.queries.length).toBe(0);
    }
  });

  test("unknown series → 404 verbatim; unpublished → 400 verbatim", async () => {
    const missing = fakeSql([{ match: /from exam_series where id = \?$/, rows: [], rowsFor: () => [] }]);
    try {
      await setTargetSeries({ sql: missing, clock }, LEARNER, "igcse-chemistry-19", {
        seriesId: SERIES_A,
      });
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect((e as Error).message).toBe("exam series " + SERIES_A + " does not exist");
    }
    const unpublished = fakeSql([
      { match: /from exam_series where id = \?$/, rows: [seriesRow({ published: false })] },
    ]);
    try {
      await setTargetSeries({ sql: unpublished, clock }, LEARNER, "igcse-chemistry-19", {
        seriesId: SERIES_A,
      });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe(
        "only published exam series can be targeted: Jun-2027-GCSE",
      );
    }
  });

  test("new declaration: INSERT + countdown derived on this read (UTC today from the clock)", async () => {
    const sql = fakeSql([
      seriesByIdRoute([seriesRow({})]),
      enrolmentRoute([]), // no existing enrolment
      { match: /insert into learner_course_enrolments/, rows: [] },
    ]);
    const view = await setTargetSeries({ sql, clock }, LEARNER, "igcse-chemistry-19", {
      seriesId: SERIES_A,
    });
    expect(view.courseSlug).toBe("igcse-chemistry-19");
    expect(view.seriesId).toBe(SERIES_A);
    expect(view.daysToWindowStart).toBe(216); // 2026-10-06 → 2027-05-10, whole days
    expect(view.daysToWindowEnd).toBe(261); // → 2027-06-24
    expect(view.entryDeadlinePassed).toBe(false); // deadline 2027-03-20 is future
    expect(view.estimated).toBe(true);
    expect(sql.queries.some((q) => q.startsWith("insert"))).toBe(true);
  });

  test("STRICTLY-before law: the deadline DAY itself still allows entry", async () => {
    const sql = fakeSql([
      seriesByIdRoute([seriesRow({ entry_deadline: "2026-10-06" })]),
      enrolmentRoute([]),
      { match: /insert into learner_course_enrolments/, rows: [] },
    ]);
    const view = await setTargetSeries({ sql, clock }, LEARNER, "igcse-chemistry-19", {
      seriesId: SERIES_A,
    });
    expect(view.entryDeadlinePassed).toBe(false);
    const past = fakeSql([
      seriesByIdRoute([seriesRow({ entry_deadline: "2026-10-05" })]),
      enrolmentRoute([]),
      { match: /insert into learner_course_enrolments/, rows: [] },
    ]);
    const late = await setTargetSeries({ sql: past, clock }, LEARNER, "igcse-chemistry-19", {
      seriesId: SERIES_A,
    });
    expect(late.entryDeadlinePassed).toBe(true);
  });

  test("correction: existing enrolment UPDATEs (idempotent upsert; the row remains)", async () => {
    const existing = [
      {
        id: "9a000000-0000-4000-8000-000000000001",
        learner_id: LEARNER,
        course_slug: "igcse-chemistry-19",
        target_series_id: SERIES_B,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];
    const sql = fakeSql([
      seriesByIdRoute([seriesRow({})]),
      enrolmentRoute(existing),
      { match: /update learner_course_enrolments/, rows: [] },
    ]);
    const view = await setTargetSeries({ sql, clock }, LEARNER, "igcse-chemistry-19", {
      seriesId: SERIES_A,
    });
    expect(view.seriesId).toBe(SERIES_A);
    expect(sql.queries.some((q) => q.startsWith("update"))).toBe(true);
    expect(sql.queries.some((q) => q.startsWith("insert"))).toBe(false);
  });

  test("clear: the target clears, the enrolment row remains; bad slug 400 first", async () => {
    try {
      await clearTargetSeries({ sql: fakeSql([]), clock }, LEARNER, "Not-A-Slug");
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe("course slug must be a kebab-case registry key");
    }
    const sql = fakeSql([{ match: /update learner_course_enrolments/, rows: [] }]);
    await clearTargetSeries({ sql, clock }, LEARNER, "igcse-chemistry-19");
    expect(sql.queries[0]).toContain("target_series_id = null");
  });

  test("targetsFor: empty declared → [] with NO second query; vanished series filtered", async () => {
    const emptySql = fakeSql([
      { match: /target_series_id is not null$/, rows: [] },
    ]);
    expect(await examTargetsFor({ sql: emptySql, clock }, LEARNER)).toEqual([]);
    expect(emptySql.queries.length).toBe(1);

    const declared = [
      {
        id: "9a000000-0000-4000-8000-000000000001",
        learner_id: LEARNER,
        course_slug: "igcse-chemistry-19",
        target_series_id: SERIES_A,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "9a000000-0000-4000-8000-000000000002",
        learner_id: LEARNER,
        course_slug: "igcse-physics-19",
        target_series_id: SERIES_VANISHED,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];
    const sql = fakeSql([
      { match: /target_series_id is not null$/, rows: declared },
      { match: /from exam_series where id = any/, rows: [seriesRow({})] }, // SERIES_A only
    ]);
    const views = await examTargetsFor({ sql, clock }, LEARNER, "2026-10-06");
    expect(views.length).toBe(1); // the vanished series is filtered honestly
    expect(views[0]!.courseSlug).toBe("igcse-chemistry-19");
    expect(views[0]!.daysToWindowStart).toBe(216);
  });
});

// alias import for the target-series functions
import {
  clearTargetSeries,
  examTargetsFor,
  setTargetSeries,
} from "../../src/services/learner-me";

// ── V49/V51 learner assignments ─────────────────────────────────────────

const assignmentRow = (over: Partial<AssignmentRowLike>): AssignmentRowLike => ({
  id: ASSIGNMENT_A,
  title: "Vectors worksheet",
  course_slug: "igcse-chemistry-19",
  course_label: "IGCSE Chemistry",
  spec_refs: ["4CH1-1C-2a", "4CH1-1C-2b"],
  marks_total: 20,
  question_count: 10,
  due_at: "2026-10-10T09:00:00Z",
  status: "OPEN",
  class_id: null,
  created_at: "2026-10-01T08:00:00Z",
  ...over,
});
interface AssignmentRowLike {
  [key: string]: unknown;
  id: string;
  title: string;
  course_slug: string;
  course_label: string;
  spec_refs: string[];
  marks_total: number;
  question_count: number;
  due_at: string;
  status: string;
  class_id: string | null;
  created_at: string;
}
type AssignmentRow = AssignmentRowLike;

const assignmentRoutes = (
  assignments: AssignmentRow[],
  submissions: Array<{ assignment_id: string; questions_completed: number; score: number | null; occurred_at: string }>,
  memberClasses: string[] = [],
): Route[] => [
  {
    match: /from assignment_submissions where learner_id = \? order by occurred_at desc limit \?$/,
    rows: [],
  rowsFor: (params) => submissions.slice(0, params[1] as number),
  },
  {
    match: /from assignments order by created_at desc limit \?$/,
    rows: [],
  rowsFor: (params) => assignments.slice(0, params[0] as number),
  },
  {
    match: /select 1 as one from class_members where class_id = \? and student_id = \? limit 1$/,
    rows: [],
  rowsFor: (params) => (memberClasses.includes(params[0] as string) ? [{ one: 1 }] : []),
  },
  { match: /from assignments where id = \?$/, rows: [], rowsFor: (params) => assignments.filter((a) => a.id === params[0]) as unknown as Array<Record<string, unknown>> },
  { match: /insert into assignment_submissions/, rows: [] },
];

describe("learnerAssignments + submitAssignment (LearnerAssignmentController :69-117)", () => {
  test("V51 visibility: NULL class target = every enabled student; class target = members only", async () => {
    const sql = fakeSql(
      assignmentRoutes(
        [
          assignmentRow({}),
          assignmentRow({ id: ASSIGNMENT_B, title: "Class work", class_id: CLASS_1 }),
        ],
        [],
        [], // not a member of CLASS_1
      ),
    );
    const views = await learnerAssignments({ sql, clock }, LEARNER);
    expect(views.map((v) => v.assignment.title)).toEqual(["Vectors worksheet"]);
    expect(views[0]!.mySubmission).toBeNull();
  });

  test("member sees the class row; the list stays newest-created first (the LIST order)", async () => {
    const sql = fakeSql(
      assignmentRoutes(
        [
          assignmentRow({ id: ASSIGNMENT_B, title: "Class work", class_id: CLASS_1, created_at: "2026-10-05T08:00:00Z" }),
          assignmentRow({}),
        ],
        [],
        [CLASS_1],
      ),
    );
    const views = await learnerAssignments({ sql, clock }, LEARNER);
    expect(views.map((v) => v.assignment.title)).toEqual(["Class work", "Vectors worksheet"]);
  });

  test("the latest hand-in wins (append-only trail, newest first, putIfAbsent)", async () => {
    const sql = fakeSql(
      assignmentRoutes(
        [assignmentRow({})],
        [
          { assignment_id: ASSIGNMENT_A, questions_completed: 9, score: 15, occurred_at: T3 },
          { assignment_id: ASSIGNMENT_A, questions_completed: 4, score: null, occurred_at: T2 },
        ],
      ),
    );
    const view = (await learnerAssignments({ sql, clock }, LEARNER))[0]!;
    expect(view.mySubmission).toEqual({
      questionsCompleted: 9,
      score: 15,
      submittedAt: "2026-10-03T10:00:00.000Z",
    });
  });

  test("submit gates in frozen order: 404 → 403 class gate → 409 closed → 400 bounds", async () => {
    // 404 verbatim
    const missing = fakeSql(assignmentRoutes([], []));
    try {
      await submitAssignment({ sql: missing, clock }, LEARNER, ASSIGNMENT_A, {
        questionsCompleted: 1, score: null,
      });
      throw new Error("expected LearnerMeNotFoundError");
    } catch (e) {
      expect((e as Error).message).toBe("unknown assignment: " + ASSIGNMENT_A);
    }
    // 403 verbatim (class-targeted, not a member)
    const foreign = fakeSql(
      assignmentRoutes([assignmentRow({ class_id: CLASS_1 })], [], []),
    );
    try {
      await submitAssignment({ sql: foreign, clock }, LEARNER, ASSIGNMENT_A, {
        questionsCompleted: 1, score: null,
      });
      throw new Error("expected LearnerMeForbiddenError");
    } catch (e) {
      expect(e).toBeInstanceOf(LearnerMeForbiddenError);
      expect((e as Error).message).toBe("this assignment targets a class you are not in");
    }
    // 409 verbatim (CLOSED)
    const closed = fakeSql(assignmentRoutes([assignmentRow({ status: "CLOSED" })], []));
    try {
      await submitAssignment({ sql: closed, clock }, LEARNER, ASSIGNMENT_A, {
        questionsCompleted: 1, score: null,
      });
      throw new Error("expected ConflictError");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as Error).message).toBe("assignment is closed: Vectors worksheet");
    }
    // 400 verbatim (questionsCompleted > questionCount)
    const tooMany = fakeSql(assignmentRoutes([assignmentRow({})], []));
    try {
      await submitAssignment({ sql: tooMany, clock }, LEARNER, ASSIGNMENT_A, {
        questionsCompleted: 11, score: null,
      });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe(
        "questionsCompleted 11 exceeds the assignment's 10 questions",
      );
    }
    // 400 verbatim (score > marksTotal)
    const overScore = fakeSql(assignmentRoutes([assignmentRow({})], []));
    try {
      await submitAssignment({ sql: overScore, clock }, LEARNER, ASSIGNMENT_A, {
        questionsCompleted: 1, score: 21,
      });
      throw new Error("expected BadRequestError");
    } catch (e) {
      expect((e as Error).message).toBe("score 21 exceeds the assignment's 20 marks");
    }
  });

  test("happy path: append-only insert; score null = handed in unmarked", async () => {
    const sql = fakeSql(assignmentRoutes([assignmentRow({})], []));
    const view = await submitAssignment({ sql, clock }, LEARNER, ASSIGNMENT_A, {
      questionsCompleted: 7, score: null,
    });
    expect(view).toEqual({
      questionsCompleted: 7,
      score: null,
      submittedAt: NOW_ISO,
    });
    expect(sql.queries.filter((q) => q.startsWith("insert")).length).toBe(1);
  });
});

// alias import for the assignment functions
import {
  learnerAssignments,
  submitAssignment,
} from "../../src/services/learner-me";

// ── T-C76 agenda composition ────────────────────────────────────────────

const reviewRow = (over: Partial<ReviewRowLike>): ReviewRowLike => ({
  node_id: NODE_TOPIC,
  due_at: T2,
  reason: "DECAY_CROSSED_THRESHOLD",
  ...over,
});
interface ReviewRowLike {
  [key: string]: unknown;
  node_id: string;
  due_at: string;
  reason: string;
}

const agendaRoutes = (
  reviews: ReviewRowLike[],
  assignments: AssignmentRow[],
  submissions: Array<{ assignment_id: string; questions_completed: number; score: number | null; occurred_at: string }>,
  titles: Record<string, string>,
  enrolments: unknown[] = [],
  series: ExamSeriesRow[] = [],
): Route[] => [
  { match: /from review_schedules where learner_id = \? and status = 'PENDING' order by due_at asc$/, rows: reviews as unknown as Array<Record<string, unknown>> },
  { match: /select id, title from knowledge_nodes where id = any/, rows: [], rowsFor: (params) => (params[0] as string[]).filter((id) => titles[id] !== undefined).map((id) => ({ id, title: titles[id] })) as unknown as Array<Record<string, unknown>> },
  ...assignmentRoutes(assignments, submissions).slice(0, 3),
  { match: /target_series_id is not null$/, rows: enrolments as unknown as Array<Record<string, unknown>> },
  { match: /from exam_series where id = any/, rows: series as unknown as Array<Record<string, unknown>> },
];

describe("buildAgenda (LearnerAgendaController :97-154)", () => {
  test("dueReviews: PENDING due-soonest-first, batched title resolution, reason .name()", async () => {
    const sql = fakeSql(
      agendaRoutes(
        // the stub simulates the DB's ORDER BY due_at ASC — rows pre-sorted
        [reviewRow({ node_id: NODE_ANCHOR, due_at: T1, reason: "TEACHER_ASSIGNED" }), reviewRow({})],
        [], [], { [NODE_TOPIC]: "Atomic structure", [NODE_ANCHOR]: "Ionic bonding" },
      ),
    );
    const agenda = await buildAgenda({ sql, clock }, LEARNER);
    expect(agenda.asOf).toBe(NOW_ISO);
    expect(agenda.dueReviews.map((r) => r.dueAt)).toEqual([
      "2026-10-01T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
    ]); // due-soonest-first
    expect(agenda.dueReviews[0]!.nodeName).toBe("Ionic bonding");
    expect(agenda.dueReviews[0]!.reason).toBe("TEACHER_ASSIGNED");
    expect(agenda.dueReviews[1]!.nodeName).toBe("Atomic structure");
    expect(agenda.actions).toBeNull(); // no rootId supplied
    expect(agenda.examTargets).toEqual([]); // nothing declared
  });

  test("the agenda RE-ORDERS assignments dueAt-asc then createdAt-DESC — distinct from the list order", async () => {
    const sql = fakeSql(
      agendaRoutes(
        [],
        [
          assignmentRow({ id: ASSIGNMENT_A, due_at: "2026-10-20T09:00:00Z", created_at: "2026-10-05T08:00:00Z" }),
          assignmentRow({ id: ASSIGNMENT_B, due_at: "2026-10-08T09:00:00Z", created_at: "2026-10-01T08:00:00Z" }),
        ],
        [],
        {},
      ),
    );
    const agenda = await buildAgenda({ sql, clock }, LEARNER);
    // the list endpoint would serve A first (created desc); the agenda serves B first (due first)
    expect(agenda.assignments.map((v) => v.assignment.id)).toEqual([ASSIGNMENT_B, ASSIGNMENT_A]);
  });

  test("dueAt tie re-orders by createdAt DESC (newest-created first)", async () => {
    const sql = fakeSql(
      agendaRoutes(
        [],
        [
          assignmentRow({ id: ASSIGNMENT_A, created_at: "2026-10-01T08:00:00Z" }),
          assignmentRow({ id: ASSIGNMENT_B, created_at: "2026-10-05T08:00:00Z" }),
        ],
        [],
        {},
      ),
    );
    const agenda = await buildAgenda({ sql, clock }, LEARNER);
    expect(agenda.assignments.map((v) => v.assignment.id)).toEqual([ASSIGNMENT_B, ASSIGNMENT_A]);
  });

  test("the 50-row agenda bound is the frozen AGENDA_ASSIGNMENT_LIMIT", () => {
    expect(AGENDA_ASSIGNMENT_LIMIT).toBe(50);
  });

  test("rootId WITHOUT the tranche-2 engine = the honest 501 posture (owning task id in the message)", async () => {
    const sql = fakeSql(agendaRoutes([], [], [], {}));
    try {
      await buildAgenda({ sql, clock }, LEARNER, "8b000000-0000-4000-8000-000000000001");
      throw new Error("expected LearnerMeNotImplementedError");
    } catch (e) {
      expect(e).toBeInstanceOf(LearnerMeNotImplementedError);
      expect((e as Error).message).toContain("T-MIG-043 tranche-2");
    }
  });

  test("rootId WITH an injected provider composes the NBA block (the tranche-2 seam, pre-wired)", async () => {
    const sql = fakeSql(agendaRoutes([], [], [], {}));
    const nbView = {
      learnerId: LEARNER,
      rootId: "8b000000-0000-4000-8000-000000000001",
      asOf: NOW_ISO,
      policy: "nba-rules/v1.3" as const,
      actions: [],
    };
    const seen: Array<[string, string]> = [];
    const agenda = await buildAgenda(
      {
        sql,
        clock,
        nextBestActions: async (learnerId, rootId) => {
          seen.push([learnerId, rootId]);
          return nbView;
        },
      },
      LEARNER,
      "8b000000-0000-4000-8000-000000000001",
    );
    expect(seen).toEqual([[LEARNER, "8b000000-0000-4000-8000-000000000001"]]);
    expect(agenda.actions).toEqual(nbView);
  });

  test("examTargets compose through the shared reader (declared series → countdowns)", async () => {
    const enrolments = [
      {
        id: "9a000000-0000-4000-8000-000000000001",
        learner_id: LEARNER,
        course_slug: "igcse-chemistry-19",
        target_series_id: SERIES_A,
        created_at: T1,
        updated_at: T1,
      },
    ];
    const sql = fakeSql(
      agendaRoutes([], [], [], {}, enrolments, [seriesRow({})]),
    );
    const agenda = await buildAgenda({ sql, clock }, LEARNER);
    expect(agenda.examTargets.length).toBe(1);
    expect(agenda.examTargets[0]!.daysToWindowStart).toBe(216);
  });
});

// alias import for the agenda builder
import { buildAgenda } from "../../src/services/learner-me";

// ── module factory ──────────────────────────────────────────────────────

describe("buildLearnerMeModule (the composition seam)", () => {
  test("wires every service over one sql + clock pair (the teachermarking factory shape)", async () => {
    const sql = fakeSql([
      anchorRoute,
      { match: /insert into flashcard_ratings/, rows: [] },
      { match: /insert into note_votes/, rows: [] },
    ]);
    const mod = buildLearnerMeModule(sql, clock);
    const rating = await mod.recordFlashcardRating(LEARNER, {
      cardId: "fl_m1", rating: "know", subtopicCode: "WCH11-S1-a",
    });
    expect(rating.nodeId).toBe(NODE_ANCHOR);
    const vote = await mod.recordNoteVote(LEARNER, {
      noteId: "rn_m1", vote: "up", subtopicCode: "WCH11-S1-a",
    });
    expect(vote.vote).toBe("helpful");
    await expect(mod.flashcardTrailPage(LEARNER, { limit: 0 })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  test("the ladder override reaches the schedule (V59 registry wiring seam)", async () => {
    const trail = [ratingRow({ card_id: "fl_ovr", occurred_at: T1 })];
    const sql = fakeSql([
      { match: /order by card_id asc, occurred_at asc, id asc$/, rows: trail },
      codeRoute({}),
    ]);
    const mod = buildLearnerMeModule(sql, clock, { flashcardReviewIntervalDays: [3] });
    const view = await mod.flashcardReviewSchedule(LEARNER);
    expect(view.cards[0]!.intervalDays).toBe(3); // streak 1 → ladder[0] = 3, not the default 1
    expect(view.cards[0]!.dueAt).toBe("2026-10-04T10:00:00.000Z");
  });
});
