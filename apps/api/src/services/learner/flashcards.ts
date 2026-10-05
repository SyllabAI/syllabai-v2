/**
 * Learner flashcard surfaces (T-MIG-043 tranche 1) — the append-only rating
 * law, the keyset trail, and the derived review schedule. Frozen law
 * @ 6cad6ef, line-against-line:
 *
 *   - FlashcardRatingController.java :84-115      POST /flashcard-ratings
 *   - FlashcardRatingTrailController.java :90-146 GET /flashcard-rating-trail
 *   - FlashcardReviewScheduleController.java :79-125 GET /flashcard-review-schedule
 *   - TrailCursor.java (fail-closed cursor codec)
 *   - FlashcardReviewScheduler.java :38-87 + FlashcardReviewParams (:11-24)
 *   - FlashcardRating.java :85-96 (entity: rating stored as enum NAME;
 *     @PrePersist id/createdAt) + FlashcardRatingView.from (:17-20)
 *
 * Laws that travel with the port:
 *   - Constraint errors (jakarta defaults, declaration order) come FIRST
 *     (@Valid binds before the body), then the tolerant rating parse, then
 *     the anchor 404, then the structure-gate 404 (:87-105).
 *   - The trail is append-only; the schedule is COMPUTED AT READ, NEVER
 *     PERSISTED (ADR-031), TIMING ONLY — a due card never implies mastery
 *     (V47 honesty pin).
 *   - Writes are SINGLE-STATEMENT (one INSERT, no read-modify-write), per
 *     the R-TX doctrine note on the module's SqlFn seam.
 *   - `now`/uuid are INJECTED (determinism law, mirrors index.ts).
 *
 * Surface-map credit: w0a's T-MIG-043 prior claim (db87a9a); every range
 * above re-verified line-against-line by this lane before implementation.
 */
import {
  type CardScheduleView,
  type FlashcardRatingTrailView,
  type FlashcardRatingView,
  type FlashcardReviewScheduleView,
} from "@syllabai/contracts";
import type { SqlFn } from "./sql";

/**
 * HTTP-shaped error the route layer (tranche-2) maps 1:1 onto the frozen
 * envelopes (400 bad_request / 400 validation_failed / 404 not_found).
 */
export class LearnerSurfaceHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The wire rating vocabulary (FlashcardRating.Rating :43-52 -> wire form). */
export type FlashcardRatingWire = "still-learning" | "know";

/**
 * Rating.parse (:47-53) — tolerant: trim, lowercase, '_'->'-';
 * {"still-learning","stilllearning"} -> STILL_LEARNING; {"know"} -> KNOW;
 * else null. The controller turns null into 400 with the VERBATIM message
 * (:90-93): 'rating must be "still-learning" or "know": {raw}'.
 */
export function parseFlashcardRating(raw: string | null | undefined): FlashcardRatingWire {
  const normalized = (raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "still-learning" || normalized === "stilllearning") return "still-learning";
  if (normalized === "know") return "know";
  throw new LearnerSurfaceHttpError(
    400,
    `rating must be "still-learning" or "know": ${raw ?? "null"}`,
  );
}

/** Entity storage form: rating.name() (FlashcardRating :90). */
export function ratingStorageName(wire: FlashcardRatingWire): string {
  return wire === "know" ? "KNOW" : "STILL_LEARNING";
}

/** FlashcardRatingView.from (:18-19): name().toLowerCase().replace('_','-'). */
export function storedRatingToWire(stored: string): FlashcardRatingWire {
  return stored.toLowerCase().replace(/_/g, "-") as FlashcardRatingWire;
}

// ── constraint layer (jakarta defaults, declaration order — R-1 law) ───────

type Constraint = { field: string; ok: boolean; message: string };

/**
 * FlashcardRatingRequest (:109-116) — @NotBlank, @Size, @Pattern in
 * DECLARATION ORDER with the jakarta default messages (the only custom
 * message is cardId's @Pattern). First failure wins; rendered per the
 * ratified two-envelope classifier as 'field: message'.
 */
export function validateRatingRequest(body: {
  cardId: string | null | undefined;
  rating: string | null | undefined;
  subtopicCode: string | null | undefined;
}): void {
  const checks: Constraint[] = [
    {
      field: "cardId",
      ok: body.cardId != null && body.cardId.trim().length > 0,
      message: "must not be blank",
    },
    {
      field: "cardId",
      ok: body.cardId != null && body.cardId.length >= 3 && body.cardId.length <= 64,
      message: "size must be between 3 and 64",
    },
    {
      field: "cardId",
      ok: body.cardId != null && /^[A-Za-z0-9_-]+$/.test(body.cardId),
      message: "card id must be the hub content id",
    },
    {
      field: "rating",
      ok: body.rating != null && body.rating.trim().length > 0,
      message: "must not be blank",
    },
    {
      field: "subtopicCode",
      ok: body.subtopicCode != null && body.subtopicCode.trim().length > 0,
      message: "must not be blank",
    },
    {
      field: "subtopicCode",
      ok: body.subtopicCode != null && body.subtopicCode.length >= 2 && body.subtopicCode.length <= 64,
      message: "size must be between 2 and 64",
    },
    {
      field: "subtopicCode",
      ok: body.subtopicCode != null && /^[A-Za-z0-9-]+$/.test(body.subtopicCode),
      message: 'must match "^[A-Za-z0-9-]+$"',
    },
  ];
  const first = checks.find((c) => !c.ok);
  if (first) {
    throw new LearnerSurfaceHttpError(400, `${first.field}: ${first.message}`);
  }
}

// ── cursor codec (TrailCursor.java, fail-closed) ────────────────────────────

export interface TrailPosition {
  /** ISO-8601 instant of the cursor row's occurred_at. */
  t: string;
  /** the cursor row's id (uuid). */
  i: string;
}

/** TrailCursor.encode (:24-32) — base64url UNPADDED JSON {t,i}. */
export function encodeTrailCursor(position: TrailPosition): string {
  if (!position.t || !position.i) {
    throw new Error("cursor position needs occurredAt and id");
  }
  const json = JSON.stringify({ t: position.t, i: position.i });
  return Buffer.from(json, "utf8").toString("base64url").replace(/=+$/, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TrailCursor.decode (:34-62) — fail-closed: blank -> 'cursor is blank';
 * undecodable -> 'cursor is not decodable'; non-object / size!=2 / missing
 * fields -> 'cursor is not a trail position'; unparseable instant/uuid ->
 * 'cursor position is not parseable'. The controller wraps EVERY failure as
 * 400 'malformed cursor: {msg}' (:146).
 */
export function decodeTrailCursor(raw: string | undefined | null): TrailPosition {
  if (raw == null || raw.trim() === "") {
    throw new Error("cursor is blank");
  }
  let node: unknown;
  try {
    node = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("cursor is not decodable");
  }
  if (
    node === null ||
    typeof node !== "object" ||
    Array.isArray(node) ||
    Object.keys(node).length !== 2 ||
    !("t" in node) ||
    !("i" in node) ||
    typeof (node as Record<string, unknown>).t !== "string" ||
    typeof (node as Record<string, unknown>).i !== "string"
  ) {
    throw new Error("cursor is not a trail position");
  }
  const { t, i } = node as { t: string; i: string };
  if (Number.isNaN(Date.parse(t)) || !UUID_RE.test(i)) {
    throw new Error("cursor position is not parseable");
  }
  return { t, i };
}

/** Trail limit law (:98-103): null -> 200, <1 -> 400, then clamp to 500. */
export function resolveTrailLimit(limit: number | null | undefined): number {
  if (limit == null) return 200;
  if (limit < 1) {
    throw new LearnerSurfaceHttpError(400, `limit must be >= 1: ${limit}`);
  }
  return Math.min(limit, 500);
}

// ── POST /flashcard-ratings (:84-115) ───────────────────────────────────────

export interface RateFlashcardCommand {
  learnerId: string;
  cardId: string;
  /** the RAW client rating — constraint layer first, then the parse law. */
  rating: string | null | undefined;
  subtopicCode: string;
}

/**
 * The append path (:86-114): constraints -> tolerant parse -> anchor 404
 * ('unknown subtopic anchor: {code}') -> structure gate 404 ('not a deck
 * anchor (needs a curriculum-structure node below the subject root): {code}')
 * -> ONE append-only INSERT (occurred_at = now injected; rating stored as
 * the enum NAME; @PrePersist id/createdAt supplied explicitly). Returns the
 * wire view with the REQUEST's subtopicCode verbatim (:114).
 */
export async function rateFlashcard(
  sql: SqlFn,
  cmd: RateFlashcardCommand,
  opts: { now: () => Date; newId: () => string },
): Promise<FlashcardRatingView> {
  validateRatingRequest(cmd);
  const rating = parseFlashcardRating(cmd.rating);
  const nodes = await sql`
    select id, node_type, code from knowledge_nodes where code = ${cmd.subtopicCode}
  `;
  if (nodes.length === 0) {
    throw new LearnerSurfaceHttpError(404, `unknown subtopic anchor: ${cmd.subtopicCode}`);
  }
  const node = nodes[0]!;
  const structural = ["UNIT", "TOPIC", "SUBTOPIC"];
  if (!structural.includes(String(node.node_type))) {
    throw new LearnerSurfaceHttpError(
      404,
      `not a deck anchor (needs a curriculum-structure node below the subject root): ${cmd.subtopicCode}`,
    );
  }
  const occurredAt = opts.now();
  const id = opts.newId();
  await sql`
    insert into flashcard_ratings (id, learner_id, card_id, node_id, rating, occurred_at, created_at)
    values (${id}, ${cmd.learnerId}, ${cmd.cardId}, ${String(node.id)}, ${ratingStorageName(rating)}, ${occurredAt.toISOString()}, ${occurredAt.toISOString()})
  `;
  return {
    cardId: cmd.cardId,
    rating,
    subtopicCode: cmd.subtopicCode,
    nodeId: String(node.id),
    occurredAt: occurredAt.toISOString(),
  };
}

// ── GET /flashcard-rating-trail (:90-146) ───────────────────────────────────

export interface TrailQuery {
  learnerId: string;
  limit?: number | null;
  cursor?: string | null;
}

interface TrailRow {
  id: string;
  card_id: string;
  node_id: string;
  rating: string;
  occurred_at: string;
}

/** The module's row discipline: coerce each field, never cast the record. */
function toTrailRow(r: Record<string, unknown>): TrailRow {
  return {
    id: String(r.id),
    card_id: String(r.card_id),
    node_id: String(r.node_id),
    rating: String(r.rating),
    occurred_at: String(r.occurred_at),
  };
}

/**
 * Keyset page over the append-only trail (:92-135): (occurred_at DESC,
 * id DESC); page size + 1 hasMore probe; exclusive-tuple cursor on page 2+
 * (occurred_at < t OR (occurred_at = t AND id < i)); nextCursor encoded IFF
 * hasMore; batch node-code resolution first-wins with honest null codes
 * (display-only — a vanished node never 404s the trail).
 */
export async function ratingTrail(
  sql: SqlFn,
  q: TrailQuery,
  opts: { now: () => Date },
): Promise<FlashcardRatingTrailView> {
  const pageSize = resolveTrailLimit(q.limit);
  let cursor: TrailPosition | null = null;
  if (q.cursor != null) {
    try {
      cursor = decodeTrailCursor(q.cursor);
    } catch (e) {
      throw new LearnerSurfaceHttpError(400, `malformed cursor: ${(e as Error).message}`);
    }
  }
  const cursorT = cursor ? new Date(cursor.t).toISOString() : null;
  const rawRows =
    cursor && cursorT
      ? await sql`
      select id, card_id, node_id, rating, occurred_at from flashcard_ratings
      where learner_id = ${q.learnerId}
        and (occurred_at < ${cursorT} or (occurred_at = ${cursorT} and id < ${cursor.i}))
      order by occurred_at desc, id desc
      limit ${pageSize + 1}
    `
      : await sql`
      select id, card_id, node_id, rating, occurred_at from flashcard_ratings
      where learner_id = ${q.learnerId}
      order by occurred_at desc, id desc
      limit ${pageSize + 1}
    `;
  const rows = rawRows.map(toTrailRow);
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nodeIds = [...new Set(page.map((r) => String(r.node_id)))];
  const codeByNode = new Map<string, string>();
  if (nodeIds.length > 0) {
    const found = await sql(nodeCodeTemplate(nodeIds.length), ...nodeIds);
    for (const row of found) {
      if (!codeByNode.has(String(row.id))) codeByNode.set(String(row.id), String(row.code));
    }
  }
  const events: FlashcardRatingView[] = page.map((r) => ({
    cardId: r.card_id,
    rating: storedRatingToWire(r.rating),
    subtopicCode: codeByNode.get(String(r.node_id)) ?? null,
    nodeId: String(r.node_id),
    occurredAt: new Date(r.occurred_at).toISOString(),
  }));
  const last = page[page.length - 1];
  return {
    events,
    nextCursor:
      hasMore && last ? encodeTrailCursor({ t: new Date(last.occurred_at).toISOString(), i: last.id }) : null,
    hasMore,
    generatedAt: opts.now().toISOString(),
  };
}

/**
 * Builds a tagged-template with n bind slots for the node-code batch lookup
 * over the module's structural SqlFn seam (the seam renders via
 * strings.join(" ? "), so n slots = n+1 static parts). Same discipline as
 * every other template in this module: static text inlined, values as bind
 * parameters.
 */
function nodeCodeTemplate(n: number): TemplateStringsArray {
  const parts: string[] = ["select id, code from knowledge_nodes where id in ("];
  for (let i = 1; i < n; i++) parts.push(", ");
  parts.push(")");
  const arr = parts as unknown as TemplateStringsArray;
  Object.defineProperty(arr, "raw", { value: [...parts], writable: false });
  return arr;
}

// ── GET /flashcard-review-schedule (:79-125) ────────────────────────────────

/** FlashcardReviewParams (:4-24) — DEFAULT_INTERVAL_DAYS + lenient normalization. */
export const DEFAULT_INTERVAL_DAYS: readonly number[] = [1, 2, 4, 8, 16, 32];

export interface FlashcardReviewParams {
  intervalDays: readonly number[];
}

export const FLASHCARD_REVIEW_PAPER_DEFAULTS: FlashcardReviewParams = {
  intervalDays: DEFAULT_INTERVAL_DAYS,
};

/** Compact-constructor law: null/empty/any null-or-non-positive -> the ladder. */
export function normalizeIntervalDays(configured: readonly number[] | null | undefined): readonly number[] {
  if (!configured || configured.length === 0 || configured.some((d) => d == null || d <= 0)) {
    return DEFAULT_INTERVAL_DAYS;
  }
  return [...configured];
}

/** intervalDaysFor (:20-22): streak<=0 -> 0; else ladder[min(streak-1, size-1)]. */
export function intervalDaysFor(knowStreak: number, params: FlashcardReviewParams): number {
  if (knowStreak <= 0) return 0;
  return params.intervalDays[Math.min(knowStreak - 1, params.intervalDays.length - 1)]!;
}

export interface ScheduleTrailRow {
  card_id: string;
  node_id: string;
  rating: string;
  occurred_at: string;
}

/** Coerce a stub/driver record into the scheduler's row shape. */
function toScheduleRow(r: Record<string, unknown>): ScheduleTrailRow {
  return {
    card_id: String(r.card_id),
    node_id: String(r.node_id),
    rating: String(r.rating),
    occurred_at: String(r.occurred_at),
  };
}

/**
 * FlashcardReviewScheduler.scheduleCard (:38-87) — PURE. Trail MUST be
 * chronological (oldest first — the controller's ORDER BY card_id,
 * occurred_at, id read). streak = trailing KNOW run (a STILL_LEARNING tail
 * = streak 0 = due immediately); intervalDays = ladder law; dueAt =
 * latest.occurredAt + intervalDays days; due = !now.isBefore(dueAt). A
 * re-rate resets the clock by construction.
 */
export function scheduleCard(
  cardId: string,
  trail: ScheduleTrailRow[],
  now: Date,
  params: FlashcardReviewParams,
): CardScheduleView {
  if (trail.length === 0) {
    throw new Error(`empty trail for card ${cardId} — never-rated cards have no schedule`);
  }
  const latest = trail[trail.length - 1]!;
  let streak = 0;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (storedRatingToWire(trail[i]!.rating) !== "know") break;
    streak += 1;
  }
  const intervalDays = intervalDaysFor(streak, params);
  const lastRatedAt = new Date(latest.occurred_at);
  const dueAt = new Date(lastRatedAt.getTime() + intervalDays * 86_400_000);
  const due = !(now.getTime() < dueAt.getTime());
  return {
    cardId,
    subtopicCode: null, // the batch anchor resolution below fills this
    nodeId: String(latest.node_id),
    rating: storedRatingToWire(latest.rating),
    streak,
    lastRatedAt: lastRatedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    due,
    intervalDays,
  };
}

/**
 * The derived queue (:60-124): full trail ORDER BY card_id ASC, occurred_at
 * ASC, id ASC -> per-card grouping (first-seen == card_id asc); scheduleCard
 * per card; Summary(due, schedules.size() - due, nextDueAt = min dueAt of
 * the !due cards else null) (:122-123); feed sorted dueAt asc then cardId
 * asc; batch anchor codes first-wins honest-null. COMPUTED AT READ, NEVER
 * PERSISTED (ADR-031); TIMING ONLY (V47).
 */
export async function reviewSchedule(
  sql: SqlFn,
  learnerId: string,
  opts: { now: () => Date; params?: FlashcardReviewParams },
): Promise<FlashcardReviewScheduleView> {
  const configured = opts.params ?? FLASHCARD_REVIEW_PAPER_DEFAULTS;
  const params: FlashcardReviewParams = { intervalDays: normalizeIntervalDays(configured.intervalDays) };
  const now = opts.now();
  const rows = (await sql`
    select card_id, node_id, rating, occurred_at from flashcard_ratings
    where learner_id = ${learnerId}
    order by card_id asc, occurred_at asc, id asc
  `).map(toScheduleRow);
  const byCard = new Map<string, ScheduleTrailRow[]>();
  for (const row of rows) {
    if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
    byCard.get(row.card_id)!.push(row);
  }
  const schedules: CardScheduleView[] = [];
  for (const [cardId, trail] of byCard) {
    schedules.push(scheduleCard(cardId, trail, now, params));
  }
  const nodeIds = [...new Set(schedules.map((c) => c.nodeId))];
  const codeByNode = new Map<string, string>();
  if (nodeIds.length > 0) {
    const found = await sql(nodeCodeTemplate(nodeIds.length), ...nodeIds);
    for (const row of found) {
      if (!codeByNode.has(String(row.id))) codeByNode.set(String(row.id), String(row.code));
    }
  }
  for (const card of schedules) {
    card.subtopicCode = codeByNode.get(card.nodeId) ?? null;
  }
  schedules.sort((a, b) => {
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });
  const due = schedules.filter((c) => c.due).length;
  const nextDueAt = schedules
    .filter((c) => !c.due)
    .map((c) => c.dueAt)
    .sort()[0];
  return {
    learnerId,
    generatedAt: now.toISOString(),
    summary: { due, scheduled: schedules.length - due, nextDueAt: nextDueAt ?? null },
    cards: schedules,
  };
}

