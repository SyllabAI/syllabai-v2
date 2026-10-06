/**
 * T-MIG-043 tranche 1 — learner-me services (frozen law @ 6cad6ef).
 *
 * The learner-me surface band that the 041 state-model cluster does NOT
 * own (r7a's lane owns /state + /course-stats + /knowledge-graph):
 *
 *   - LearnerAgendaController (:97-154)      → buildAgenda
 *     (T-C76 executive read model: dueReviews PENDING due-soonest-first,
 *     the V49/V51 visible assignments re-ordered dueAt asc / createdAt
 *     DESC — distinct from the list endpoint's created-desc order — the
 *     latest append-only hand-in beside each, the optional NBA block, and
 *     the T-C79 exam targets. Deliberately absent per the frozen javadoc
 *     :60-64: no derived overdue/done flags, no streaks/notifications/
 *     plan persistence.)
 *   - FlashcardRatingController (:84-115)    → recordFlashcardRating
 *     (V47 evidence class: tolerant rating parse, FAIL-CLOSED anchor
 *     attribution — unknown codes and non-structure nodes 404 and nothing
 *     is written; APPEND-ONLY; NEVER mastery — no BKT/SkillState/
 *     misconception/review writes, the honesty pin.)
 *   - FlashcardRatingTrailController (:90-140) → flashcardTrailPage
 *     (T-C61 bounded keyset walk: 200 default / 500 clamp / <1 → 400,
 *     total order (occurred_at DESC, id DESC), +1 hasMore probe,
 *     exclusive-tuple page 2+, TrailCursor opaque FAIL-CLOSED codec,
 *     batched anchor-code resolution with the honest null.)
 *   - FlashcardReviewScheduleController (:79-125) → flashcardReviewSchedule
 *     (T-C53: the Ebbinghaus queue derived at READ from the append-only
 *     trail — persisted nowhere, ADR-031; hub-parity ladder 1·2·4·8·16
 *     capped 32; trailing-KNOW streak; TIMING ONLY.)
 *   - NoteVoteController (:67-100)           → recordNoteVote
 *     (V48 evidence class — same posture as ratings, note anchor family.)
 *   - LearnerExamSeriesController (:59-117)  → examSeriesCalendar /
 *     setTargetSeries / clearTargetSeries (+ ExamTargetReader.targetsFor
 *     :28-52 — the shared T-C79 read model; see the PARALLEL-LANE note)
 *     (T-C79/ADR-035: the learner picks an id, never types a date;
 *     countdowns derived at READ on the server clock, never stored.)
 *   - LearnerAssignmentController (:69-117)  → learnerAssignments /
 *     submitAssignment
 *     (V49/V51: NULL class target = every enabled student, class target =
 *     members only; append-only hand-ins; the per-assignment bounds.)
 *
 * OUT OF FENCE (tranche-2, flagged per the 010/020/021/030/031/032/034
 * ratified precedent): routes + mounts — LANDED in tranche-2 as
 * routes/learnerme.ts + the index.ts mount (operator trace
 * 1a10eae6bc2044c1). The NBA engine (NextBestActionService :79-554,
 * nba-rules/v1.3) is tranche-2's ./nba.ts and is now the DEFAULT
 * nextBestActions provider; the honest 501 (owning task id
 * T-MIG-043 tranche-2) stays in buildAgenda as the no-provider safety
 * net. knowledge-graph/smart-lesson (041's controller / Wave-5 band),
 * intervention-runs (Wave-6) and the NightlyDecayJob write path (the 042P
 * seam names a separate decay lane) stay OUT of this task entirely.
 *
 * PARALLEL-LANE DISCLOSURE (run-001-claim.json + the task yaml):
 * ExamTargetReader is ALSO inside r7a's 041 tranche-1 (PR #65). This
 * module carries its own copy under the per-module structural-seam
 * doctrine ("structural typing makes the duplicate zero-cost and keeps
 * the fences independent" — services/assessment/sql.ts header);
 * consolidation to ONE canonical reader is requested as an R0 intake
 * ruling after 041/043 both land (#56 arbitration precedent). Zero file
 * overlap either way: this module owns services/learner-me/** only.
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists and state-bearing predicates inline as static
 * template text. Multi-id lookups use the fleet's `= any(${ids}::uuid[])`
 * convention.
 *
 * Instant rendering follows the landed fleet convention
 * (services/assessment/history.ts: `new Date(x).toISOString()`, ISO-8601
 * UTC). HONEST LIMIT disclosed for tranche-2's golden replay: the pg text
 * carries sub-millisecond precision and Date truncates to millis — the
 * same posture every landed lane ships; the 040-PREP capture's tolerance
 * law governs at replay time.
 */
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, ConflictError, type SubmitClock } from "../selfmark";
import { buildNbaEngine, type NbaDeps } from "./nba";
import { LearnerMeForbiddenError, LearnerMeNotImplementedError, LearnerMeNotFoundError } from "./errors";
import type {
  AssignmentSubmissionRequest,
  CardScheduleView,
  CourseExamTargetView,
  FlashcardRatingTrailView,
  FlashcardRatingView,
  FlashcardReviewScheduleView,
  LearnerAssignmentView,
  NextBestActionsView,
  NoteVoteView,
  ReviewView,
  SetTargetRequest,
} from "@syllabai/contracts";

// ── errors (message-carrying; the route layer owns status mapping) ──────────
//
// BadRequestError / ConflictError are the fleet's own classes from
// services/selfmark (composition, never a fork — the existing routes
// already map them). The three learner-me classes live in ./errors.ts
// (tranche-2 moved the definitions so the NBA engine avoids a barrel
// cycle); they are RE-EXPORTED here — every tranche-1 import path keeps
// working — and map:
//   LearnerMeNotFoundError     → 404 not_found (e.message verbatim)
//   LearnerMeForbiddenError    → 403 forbidden
//   LearnerMeNotImplementedError → 501 not_implemented (owning task id)

export { LearnerMeForbiddenError, LearnerMeNotImplementedError, LearnerMeNotFoundError } from "./errors";

// tranche-2: the NBA engine + the T-C11 loader, re-exported from the barrel
export {
  NBA_POLICY,
  NBA_BDT_PAPER_DEFAULTS,
  NBA_DECAY_PAPER_DEFAULTS,
  RECOMMENDATION_PAPER_DEFAULTS,
  buildNbaEngine,
  nbaActionsFor,
  nbaBandOf,
  nbaDecayedMastery,
  nbaRelaxedToPrior,
  kgTreeWithMisconceptions,
  prerequisiteRelations,
  skillStatesFor,
  misconceptionReadingsFor,
  type NbaDeps,
  type RecommendationParams,
} from "./nba";
export {
  NBA_CONCEPT_GRAPH,
  buildConceptDependencyGraphFromSnapshot,
  conceptDependencyGraphOf,
  SEMANTIC_RELATIONS,
  type ConceptDependencyGraph,
  type ConceptEdge,
  type SemanticRelation,
} from "./nba-concept-graph";

// ── frozen constants ─────────────────────────────────────────────────────────

/** LearnerAgendaController.ASSIGNMENT_LIMIT (:70-71) — the agenda bound. */
export const AGENDA_ASSIGNMENT_LIMIT = 50;
/** LearnerAssignmentController.LIST_LIMIT (:56-57) — the list bound. */
export const LEARNER_ASSIGNMENT_LIST_LIMIT = 50;
/** Both controllers' latest-hand-in window (:123 / :80-82): page 0, 2000. */
export const SUBMISSION_LOOKUP_WINDOW = 2000;
/** FlashcardRatingTrailController (:94-95, contracts TRAIL_* of record). */
export const TRAIL_DEFAULT_LIMIT = 200;
export const TRAIL_MAX_LIMIT = 500;
/** ExamSeriesView.BOARD_PEARSON_EDEXCEL (:26) — the only imported board. */
export const EXAM_SERIES_BOARD_PEARSON_EDEXCEL = "PEARSON_EDEXCEL";
/** Assignment.status column values (db check) — the wire form is lowercase. */
export const ASSIGNMENT_STATUS_OPEN = "OPEN";
export const ASSIGNMENT_STATUS_CLOSED = "CLOSED";

/**
 * ReviewSchedule.Status / .Reason (ReviewSchedule.java :31-32). Only the
 * PENDING + the reason NAMES cross this module's wire (ReviewView.reason
 * serializes .name()).
 */
export const REVIEW_STATUS_PENDING = "PENDING";
export const REVIEW_REASONS = ["DECAY_CROSSED_THRESHOLD", "TEACHER_ASSIGNED"] as const;

/**
 * The deck/note anchor structure gate (FlashcardRatingController :96-100 /
 * NoteVoteController :81-85): the anchor must resolve to a
 * CURRICULUM-STRUCTURE node below the subject root — the subject root
 * (SUBJECT), the semantic layer (CONCEPT/MISCONCEPTION) and unknown codes
 * are all 404. The gate accepts the whole structure RANGE rather than
 * hard-coding one level (the graph's level naming is ingestion-dependent).
 */
const STRUCTURE_NODE_TYPES = ["UNIT", "TOPIC", "SUBTOPIC"] as const;
const isStructureNodeType = (t: string): boolean =>
  (STRUCTURE_NODE_TYPES as readonly string[]).includes(t.toUpperCase());

// ── row shapes (snake_case, as the sql adapter returns them) ────────────────

/** knowledge_nodes lookup row for the anchor gate. */
interface NodeRefRow {
  id: string;
  node_type: string;
}

/** flashcard_ratings row as the trail/schedule reads select it. */
interface RatingRow {
  id: string;
  node_id: string;
  card_id: string;
  rating: string;
  occurred_at: string;
}

/** assignments row as the learner list selects it. */
interface AssignmentRow {
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

/** assignment_submissions row as the latest-hand-in lookup selects it. */
interface SubmissionRow {
  assignment_id: string;
  questions_completed: number;
  score: number | null;
  occurred_at: string;
}

/** exam_series row as the picker/target reads select them. */
interface ExamSeriesRow {
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
}

/** learner_course_enrolments row (target reads). */
interface EnrolmentRow {
  id: string;
  learner_id: string;
  course_slug: string;
  target_series_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── shared helpers ───────────────────────────────────────────────────────────

/** The fleet's Instant rendering (see the file header's honest-limit note). */
const toInstant = (value: string | Date): string => new Date(value).toISOString();

/** LocalDate.now(ZoneOffset.UTC) — the UTC calendar date of the clock. */
const utcToday = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * ChronoUnit.DAYS.between(today, window) — WHOLE calendar days between two
 * ISO local dates (UTC). Calendar-day arithmetic on date STRINGS (both
 * normalized YYYY-MM-DD), not on ms timestamps — a UTC-day boundary never
 * shifts under a timezone here, and a partial day does not round.
 */
const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
};

// ── flashcard ratings (V47 evidence class) ───────────────────────────────────

export type FlashcardRatingValue = "STILL_LEARNING" | "KNOW";
export type FlashcardRatingWire = "still-learning" | "know";

/**
 * FlashcardRating.Rating.parse (:43-52) — tolerant parse for the hub's
 * lowercase wire forms: trim, lowercase, '_' → '-', then the accepted set
 * {still-learning, stilllearning, know}. null → the caller's 400.
 */
export function parseFlashcardRating(raw: string | null | undefined): FlashcardRatingValue | null {
  if (raw == null) return null;
  switch (raw.trim().toLowerCase().replace(/_/g, "-")) {
    case "still-learning":
    case "stilllearning":
      return "STILL_LEARNING";
    case "know":
      return "KNOW";
    default:
      return null;
  }
}

/** FlashcardRatingView.from (:15-18): name().toLowerCase().replace('_','-'). */
export function ratingWire(rating: FlashcardRatingValue): FlashcardRatingWire {
  return rating === "STILL_LEARNING" ? "still-learning" : "know";
}

export interface FlashcardRatingRecordDeps {
  sql: SqlFn;
  clock: SubmitClock;
}

/**
 * POST /api/v1/learners/me/flashcard-ratings (FlashcardRatingController
 * :84-107). Law, in order: (1) rating parse else 400 verbatim; (2) anchor
 * lookup else 404 verbatim; (3) structure gate else 404 verbatim; (4)
 * APPEND-ONLY insert (every action is a row; occurred_at = now). The view
 * echoes the RESOLVED anchor code (validated by construction here).
 */
export async function recordFlashcardRating(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  request: { cardId: string; rating: string; subtopicCode: string },
): Promise<FlashcardRatingView> {
  const rating = parseFlashcardRating(request.rating);
  if (rating === null) {
    throw new BadRequestError(
      'rating must be "still-learning" or "know": ' + request.rating,
    );
  }
  const nodeRows = (await deps.sql`
    select id, node_type from knowledge_nodes
    where code = ${request.subtopicCode}`) as unknown as NodeRefRow[];
  const node = nodeRows[0]!;
  if (!node) {
    throw new LearnerMeNotFoundError(
      "unknown subtopic anchor: " + request.subtopicCode,
    );
  }
  if (!isStructureNodeType(node.node_type)) {
    throw new LearnerMeNotFoundError(
      "not a deck anchor (needs a curriculum-structure node below the subject root): " +
        request.subtopicCode,
    );
  }
  const now = deps.clock.now();
  const id = deps.clock.newId();
  await deps.sql`
    insert into flashcard_ratings
      (id, learner_id, node_id, card_id, rating, occurred_at, created_at)
    values (${id}, ${learnerId}, ${node.id}, ${request.cardId}, ${rating},
            ${now.toISOString()}, ${now.toISOString()})`;
  return {
    cardId: request.cardId,
    rating: ratingWire(rating),
    subtopicCode: request.subtopicCode,
    nodeId: node.id,
    occurredAt: toInstant(now),
  };
}

// ── TrailCursor (T-C61 opaque keyset codec) ─────────────────────────────────

/**
 * A keyset position: the (occurred_at, id) of a trail row. The timestamp
 * is the RAW adapter text of the row (full precision — the cursor
 * round-trips the EXACT instant the database returned, the TrailCursor
 * javadoc's load-bearing rule; an epoch-millis cursor would truncate and
 * break strict keyset semantics inside the sub-milli band). Opaque to
 * clients either way; the payload carries nothing but the position.
 */
export interface TrailPosition {
  occurredAt: string;
  id: string;
}

const TRAIL_TS_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Encode a keyset position into the opaque wire form: base64url (unpadded)
 * of the two-field JSON object {t, i} (TrailCursor.encode :59-71). Throws
 * on a null/undefined field (the caller's programming error, as frozen).
 */
export function encodeTrailCursor(position: TrailPosition): string {
  if (!position.occurredAt || !position.id) {
    throw new Error("cursor position needs occurredAt and id");
  }
  const json = JSON.stringify({ t: position.occurredAt, i: position.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

const hasNonNullString = (obj: Record<string, unknown>, key: string): boolean =>
  typeof obj[key] === "string" && obj[key] !== null && (obj[key] as string).length > 0;

/**
 * Decode an opaque cursor into its keyset position — FAIL-CLOSED
 * (TrailCursor.decode :73-99): any malformed input throws and the caller
 * maps to 400, never a guess. The error MESSAGES are the frozen
 * IllegalArgumentException texts (the 400 body carries them after the
 * "malformed cursor: " prefix): blank, not decodable, not a trail
 * position (wrong JSON shape / size != 2 / missing fields), not parseable
 * (bad instant or uuid). The base64url alphabet is enforced strictly —
 * Java's URL decoder rejects '+' and '/' rather than tolerating them.
 */
export function decodeTrailCursor(raw: string): TrailPosition {
  if (raw == null || raw.trim().length === 0) {
    throw new Error("cursor is blank");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error("cursor is not decodable");
  }
  let node: unknown;
  try {
    const bytes = Buffer.from(raw, "base64url").toString("utf8");
    node = JSON.parse(bytes);
  } catch {
    throw new Error("cursor is not decodable");
  }
  if (
    node === null ||
    typeof node !== "object" ||
    Array.isArray(node) ||
    Object.keys(node as Record<string, unknown>).length !== 2 ||
    !hasNonNullString(node as Record<string, unknown>, "t") ||
    !hasNonNullString(node as Record<string, unknown>, "i")
  ) {
    throw new Error("cursor is not a trail position");
  }
  const obj = node as { t: string; i: string };
  if (!TRAIL_TS_RE.test(obj.t) || Number.isNaN(Date.parse(obj.t))) {
    throw new Error("cursor position is not parseable");
  }
  if (!UUID_RE.test(obj.i)) {
    throw new Error("cursor position is not parseable");
  }
  return { occurredAt: obj.t, id: obj.i.toLowerCase() };
}

// ── flashcard rating trail (T-C61 bounded keyset walk) ──────────────────────

/**
 * GET /api/v1/learners/me/flashcard-rating-trail (FlashcardRatingTrail
 * Controller :90-140). Law: limit null → 200; < 1 → 400 verbatim; above
 * the cap CLAMPS (a client bug, not a learner-owned error); the +1 probe
 * decides hasMore; the total order is (occurred_at DESC, id DESC) — the id
 * is the deterministic tiebreaker because V47's UUID id carries no time
 * information; page 2+ walks STRICTLY AFTER the cursor position via the
 * exclusive-tuple predicate; a malformed cursor is a 400, never a guess.
 * Anchor codes resolve in ONE batched read, first-wins, honest null on an
 * absent node row (degrades the CODE, never the row — attribution was
 * fail-closed validated at write time).
 */
export async function flashcardTrailPage(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  params: { limit?: number; cursor?: string },
): Promise<FlashcardRatingTrailView> {
  let pageSize: number;
  if (params.limit == null) {
    pageSize = TRAIL_DEFAULT_LIMIT;
  } else if (params.limit < 1) {
    throw new BadRequestError("limit must be >= 1: " + params.limit);
  } else {
    pageSize = Math.min(params.limit, TRAIL_MAX_LIMIT);
  }

  const firstPage = params.cursor == null || params.cursor.trim().length === 0;
  let rows: RatingRow[];
  if (firstPage) {
    rows = (await deps.sql`
      select id, node_id, card_id, rating, occurred_at
      from flashcard_ratings
      where learner_id = ${learnerId}
      order by occurred_at desc, id desc
      limit ${pageSize + 1}`) as unknown as RatingRow[];
  } else {
    let pos: TrailPosition;
    try {
      pos = decodeTrailCursor(params.cursor as string);
    } catch (e) {
      throw new BadRequestError("malformed cursor: " + (e as Error).message);
    }
    rows = (await deps.sql`
      select id, node_id, card_id, rating, occurred_at
      from flashcard_ratings
      where learner_id = ${learnerId}
        and (occurred_at, id) < (${pos.occurredAt}, ${pos.id})
      order by occurred_at desc, id desc
      limit ${pageSize + 1}`) as unknown as RatingRow[];
  }

  const hasMore = rows.length > pageSize;
  const served = hasMore ? rows.slice(0, pageSize) : rows;

  const nodeIds = [...new Set(served.map((r) => r.node_id))];
  const nodeCodes = new Map<string, string>();
  if (nodeIds.length > 0) {
    const codeRows = (await deps.sql`
      select id, code from knowledge_nodes
      where id = any(${nodeIds}::uuid[])`) as unknown as Array<{ id: string; code: string }>;
    for (const row of codeRows) {
      if (!nodeCodes.has(row.id)) nodeCodes.set(row.id, row.code);
    }
  }

  const events = served.map((r) => ({
    cardId: r.card_id,
    rating: ratingWire(r.rating as FlashcardRatingValue),
    subtopicCode: nodeCodes.get(r.node_id) ?? null,
    nodeId: r.node_id,
    occurredAt: toInstant(r.occurred_at),
  }));

  let nextCursor: string | null = null;
  if (hasMore && served.length > 0) {
    const last = served[served.length - 1]!;
    nextCursor = encodeTrailCursor({ occurredAt: last.occurred_at, id: last.id });
  }
  return { events, nextCursor, hasMore, generatedAt: toInstant(deps.clock.now()) };
}

// ── flashcard review schedule (T-C53 — derived, never stored) ───────────────

/**
 * FlashcardReviewParams.DEFAULT_INTERVAL_DAYS (:28-31) — the shipped
 * ladder, hub parity with syllabai-hub lib/flashcard-review.ts:
 * 1·2·4·8·16 days, then a capped 32-day maintenance cycle. Trail caps
 * cannot understate an interval — any streak ≥ the ladder length maps to
 * the cap.
 */
export const FLASHCARD_REVIEW_DEFAULT_INTERVAL_DAYS: readonly number[] = [1, 2, 4, 8, 16, 32];

/**
 * FlashcardReviewParams' lenient normalization (the compact constructor
 * :33-37): a missing, empty or malformed ladder (any null/non-positive
 * entry) falls back to the shipped default rather than failing the read.
 */
export function normalizeFlashcardLadder(
  intervalDays: readonly number[] | null | undefined,
): readonly number[] {
  if (
    intervalDays == null ||
    intervalDays.length === 0 ||
    intervalDays.some((d) => d == null || d <= 0)
  ) {
    return FLASHCARD_REVIEW_DEFAULT_INTERVAL_DAYS;
  }
  return [...intervalDays];
}

/**
 * FlashcardReviewParams.intervalDaysFor (:44-49): streak 0 ("still
 * learning" tail) → 0 — due immediately; a know-streak of n resurfaces
 * after ladder[min(n-1, size-1)] days (the last entry is the cap).
 */
export function flashcardIntervalDaysFor(ladder: readonly number[], knowStreak: number): number {
  if (knowStreak <= 0) return 0;
  return ladder[Math.min(knowStreak - 1, ladder.length - 1)]!;
}

/** FlashcardReviewScheduler.CardSchedule — a view over the trail, never a row. */
export interface CardSchedule {
  cardId: string;
  nodeId: string;
  rating: FlashcardRatingValue;
  streak: number;
  lastRatedAt: string;
  dueAt: string;
  due: boolean;
  intervalDays: number;
}

/**
 * FlashcardReviewScheduler.scheduleCard (:57-86) — pure and stateless (the
 * BktEngine pattern). trail = ONE card's rating events, oldest first (the
 * repository's card-grouped, occurred-at-ascending read); the streak is
 * the trailing run of consecutive KNOW ratings (a "still learning" tail
 * means streak 0 — due immediately); dueAt = the latest rating's
 * occurred_at + intervalDays days (Date arithmetic on the UTC timeline —
 * Java's plus(Duration.ofDays(n)) is exact n*86400s); due = !now.isBefore
 * (dueAt). A re-rate resets the clock by construction. An empty trail is a
 * programming error (never-rated cards have no schedule) — frozen throws
 * IllegalArgumentException, this port throws Error.
 */
export function scheduleCard(
  cardId: string,
  trail: RatingRow[],
  now: Date,
  ladder: readonly number[],
): CardSchedule {
  if (trail.length === 0) {
    throw new Error("empty trail for card " + cardId + " — never-rated cards have no schedule");
  }
  const latest = trail[trail.length - 1]!;
  let streak = 0;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i]!.rating !== "KNOW") break;
    streak += 1;
  }
  const intervalDays = flashcardIntervalDaysFor(ladder, streak);
  const lastRated = new Date(latest.occurred_at);
  const dueAtMs = lastRated.getTime() + intervalDays * 86_400_000;
  const due = now.getTime() >= dueAtMs;
  return {
    cardId,
    nodeId: latest.node_id,
    rating: latest.rating as FlashcardRatingValue,
    streak,
    lastRatedAt: toInstant(lastRated),
    dueAt: toInstant(new Date(dueAtMs)),
    due,
    intervalDays,
  };
}

/**
 * GET /api/v1/learners/me/flashcard-review-schedule (FlashcardReviewSchedule
 * Controller :79-125). Law: the FULL trail read in the repository's
 * card-grouped chronological order (ORDER BY card_id ASC, occurred_at ASC,
 * id ASC — the id tiebreaker keeps the read deterministic on ties);
 * per-card grouping in memory (insertion-ordered map = the LinkedHashMap);
 * the feed sorts dueAt asc then cardId asc; the summary counts due vs
 * scheduled and takes nextDueAt = the EARLIEST unduer dueAt (null when
 * nothing is pending); anchor codes resolve batched, first-wins, honest
 * null. COMPUTED AT READ, NEVER PERSISTED (ADR-031); TIMING ONLY (a due
 * card says nothing about mastery).
 */
export async function flashcardReviewSchedule(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  ladderOverride?: readonly number[],
): Promise<FlashcardReviewScheduleView> {
  const now = deps.clock.now();
  const ladder = normalizeFlashcardLadder(ladderOverride);

  const trail = (await deps.sql`
    select id, node_id, card_id, rating, occurred_at
    from flashcard_ratings
    where learner_id = ${learnerId}
    order by card_id asc, occurred_at asc, id asc`) as unknown as RatingRow[];

  const byCard = new Map<string, RatingRow[]>();
  for (const r of trail) {
    const list = byCard.get(r.card_id);
    if (list) list.push(r);
    else byCard.set(r.card_id, [r]);
  }

  const schedules = [...byCard.entries()]
    .map(([cardId, rows]) => scheduleCard(cardId, rows, now, ladder))
    .sort((a, b) => {
      const dueDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      return dueDiff !== 0 ? dueDiff : a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
    });

  const nodeIds = [...new Set(schedules.map((s) => s.nodeId))];
  const nodeCodes = new Map<string, string>();
  if (nodeIds.length > 0) {
    const codeRows = (await deps.sql`
      select id, code from knowledge_nodes
      where id = any(${nodeIds}::uuid[])`) as unknown as Array<{ id: string; code: string }>;
    for (const row of codeRows) {
      if (!nodeCodes.has(row.id)) nodeCodes.set(row.id, row.code);
    }
  }

  const cards: CardScheduleView[] = schedules.map((s) => ({
    cardId: s.cardId,
    subtopicCode: nodeCodes.get(s.nodeId) ?? null,
    nodeId: s.nodeId,
    rating: ratingWire(s.rating),
    streak: s.streak,
    lastRatedAt: s.lastRatedAt,
    dueAt: s.dueAt,
    due: s.due,
    intervalDays: s.intervalDays,
  }));

  const dueCount = schedules.filter((s) => s.due).length;
  let nextDueAt: string | null = null;
  for (const s of schedules) {
    if (!s.due && (nextDueAt === null || s.dueAt < nextDueAt)) nextDueAt = s.dueAt;
  }

  return {
    learnerId,
    generatedAt: toInstant(now),
    summary: {
      due: dueCount,
      scheduled: schedules.length - dueCount,
      nextDueAt,
    },
    cards,
  };
}

// ── note votes (V48 evidence class) ─────────────────────────────────────────

export type NoteVoteValue = "HELPFUL" | "NOT_HELPFUL";
export type NoteVoteWire = "helpful" | "not-helpful";

/**
 * NoteVote.Vote.parse (:46-55) — tolerant parse for the hub's wire forms.
 * NOTE the deliberate asymmetry with Rating.parse: NO underscore→dash
 * replacement (the frozen switch accepts helpful|up and
 * not-helpful|nothelpful|down on raw.trim().toLowerCase() only).
 */
export function parseNoteVote(raw: string | null | undefined): NoteVoteValue | null {
  if (raw == null) return null;
  switch (raw.trim().toLowerCase()) {
    case "helpful":
    case "up":
      return "HELPFUL";
    case "not-helpful":
    case "nothelpful":
    case "down":
      return "NOT_HELPFUL";
    default:
      return null;
  }
}

/** NoteVote.Vote.wire (:59-62): HELPFUL → "helpful", else "not-helpful". */
export function noteVoteWire(vote: NoteVoteValue): NoteVoteWire {
  return vote === "HELPFUL" ? "helpful" : "not-helpful";
}

/**
 * POST /api/v1/learners/me/note-votes (NoteVoteController :67-100) — the
 * V48 twin of the rating law: parse else 400 verbatim; anchor lookup else
 * 404 "unknown note anchor: {code}"; structure gate else 404 "not a note
 * anchor (...)"; APPEND-ONLY insert (a vote CHANGE is preserved as new
 * evidence rather than overwriting the old). NEVER a content-quality
 * judgement: the pipeline's VALIDATED states are operator-owned.
 */
export async function recordNoteVote(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  request: { noteId: string; vote: string; subtopicCode: string },
): Promise<NoteVoteView> {
  const vote = parseNoteVote(request.vote);
  if (vote === null) {
    throw new BadRequestError(
      'vote must be "helpful" or "not-helpful": ' + request.vote,
    );
  }
  const nodeRows = (await deps.sql`
    select id, node_type from knowledge_nodes
    where code = ${request.subtopicCode}`) as unknown as NodeRefRow[];
  const node = nodeRows[0]!;
  if (!node) {
    throw new LearnerMeNotFoundError("unknown note anchor: " + request.subtopicCode);
  }
  if (!isStructureNodeType(node.node_type)) {
    throw new LearnerMeNotFoundError(
      "not a note anchor (needs a curriculum-structure node below the subject root): " +
        request.subtopicCode,
    );
  }
  const now = deps.clock.now();
  const id = deps.clock.newId();
  await deps.sql`
    insert into note_votes
      (id, learner_id, node_id, note_id, vote, occurred_at, created_at)
    values (${id}, ${learnerId}, ${node.id}, ${request.noteId}, ${vote},
            ${now.toISOString()}, ${now.toISOString()})`;
  return {
    noteId: request.noteId,
    vote: noteVoteWire(vote),
    subtopicCode: request.subtopicCode,
    nodeId: node.id,
    occurredAt: toInstant(now),
  };
}

// ── exam series + target-series (T-C79 / ADR-035) ───────────────────────────

/** LearnerExamSeriesController.validatedSlug (:113-117). */
export function isValidCourseSlug(courseSlug: string): boolean {
  return courseSlug != null && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(courseSlug);
}

const toExamSeriesView = (s: ExamSeriesRow) => ({
  id: s.id,
  board: s.board,
  qualification: s.qualification,
  seriesCode: s.series_code,
  label: s.label,
  windowStart: s.window_start,
  windowEnd: s.window_end,
  entryDeadline: s.entry_deadline,
  resultsDate: s.results_date,
  estimated: s.estimated,
  sourceUrl: s.source_url,
  retrievedAt: toInstant(s.retrieved_at),
});

/**
 * GET /api/v1/learners/me/exam-series (LearnerExamSeriesController :59-69)
 * — the published calendar powering the hub add-course picker: no
 * qualification filter → the whole published calendar; a blank filter is
 * treated as absent; with a filter → the board-scoped qualification list.
 * Both reads order window_start ASC (soonest window first). An empty
 * calendar is the honest empty state, never a fake list.
 */
export async function examSeriesCalendar(
  deps: FlashcardRatingRecordDeps,
  qualification?: string,
): Promise<ReturnType<typeof toExamSeriesView>[]> {
  if (qualification == null || qualification.trim().length === 0) {
    const rows = (await deps.sql`
      select id, board, qualification, series_code, label, window_start,
             window_end, entry_deadline, results_date, estimated,
             source_url, retrieved_at
      from exam_series
      where published = true
      order by window_start asc`) as unknown as ExamSeriesRow[];
    return rows.map(toExamSeriesView);
  }
  const rows = (await deps.sql`
    select id, board, qualification, series_code, label, window_start,
           window_end, entry_deadline, results_date, estimated,
           source_url, retrieved_at
    from exam_series
    where board = ${EXAM_SERIES_BOARD_PEARSON_EDEXCEL}
      and qualification = ${qualification}
      and published = true
    order by window_start asc`) as unknown as ExamSeriesRow[];
  return rows.map(toExamSeriesView);
}

/**
 * CourseExamTargetView.of (CourseExamTargetView.java :40-55) — the
 * countdown derived on THIS read against the server clock (ADR-031:
 * derived is recomputed, never stored): whole calendar days
 * (ChronoUnit.DAYS.between) to windowStart/windowEnd; entryDeadlinePassed
 * = entryDeadline != null && entryDeadline.isBefore(today) — STRICTLY
 * before: the deadline day itself still allows entry.
 */
export function courseExamTargetView(
  enrolment: EnrolmentRow,
  series: ExamSeriesRow,
  today: string,
): CourseExamTargetView {
  return {
    courseSlug: enrolment.course_slug,
    seriesId: series.id,
    seriesCode: series.series_code,
    label: series.label,
    windowStart: series.window_start,
    windowEnd: series.window_end,
    // FIDELITY NOTE (R0 flag, see the PR): the frozen CourseExamTargetView
    // record renders entryDeadline/resultsDate as the raw LocalDate columns
    // — NULL when the series row has no deadline/results date — but the
    // landed courseExamTargetViewSchema (learner.ts, canonical #60) typed
    // both z.string(). The W4 capture never exercised a null-deadline
    // series, so the gates never caught it. This port passes the column
    // through HONESTLY (null allowed at runtime) and the schema correction
    // (.nullable()) is requested at review — never widened silently.
    entryDeadline: series.entry_deadline as string,
    resultsDate: series.results_date as string,
    estimated: series.estimated,
    daysToWindowStart: daysBetween(today, series.window_start),
    daysToWindowEnd: daysBetween(today, series.window_end),
    entryDeadlinePassed: series.entry_deadline != null && series.entry_deadline < today,
  };
}

/**
 * PUT /api/v1/learners/me/courses/{courseSlug}/target-series
 * (LearnerExamSeriesController :71-91): slug kebab-case else 400 verbatim;
 * series must exist else 404 verbatim; only PUBLISHED series can be
 * targeted else 400 verbatim; the enrolment row is an IDEMPOTENT UPSERT
 * (declare/correct the target; a second PUT with the same id is a no-op
 * semantically — updated_at still moves, the frozen retarget(series.id,
 * now) does the same); the view derives the countdown on this read.
 */
export async function setTargetSeries(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  courseSlug: string,
  request: SetTargetRequest,
): Promise<CourseExamTargetView> {
  if (!isValidCourseSlug(courseSlug)) {
    throw new BadRequestError("course slug must be a kebab-case registry key");
  }
  const seriesRows = (await deps.sql`
    select id, board, qualification, series_code, label, window_start,
           window_end, entry_deadline, results_date, estimated,
           source_url, retrieved_at, published
    from exam_series
    where id = ${request.seriesId}`) as unknown as Array<ExamSeriesRow & { published: boolean }>;
  const series = seriesRows[0]!;
  if (!series) {
    throw new LearnerMeNotFoundError("exam series " + request.seriesId + " does not exist");
  }
  if (!series.published) {
    throw new BadRequestError(
      "only published exam series can be targeted: " + series.series_code,
    );
  }
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  const existing = (await deps.sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${learnerId} and course_slug = ${courseSlug}`) as unknown as EnrolmentRow[];
  let enrolment: EnrolmentRow;
  if (existing.length > 0) {
    const prev = existing[0]!;
    enrolment = { ...prev, target_series_id: series.id, updated_at: nowIso };
    await deps.sql`
      update learner_course_enrolments
      set target_series_id = ${series.id}, updated_at = ${nowIso}
      where learner_id = ${learnerId} and course_slug = ${courseSlug}`;
  } else {
    enrolment = {
      id: deps.clock.newId(),
      learner_id: learnerId,
      course_slug: courseSlug,
      target_series_id: series.id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await deps.sql`
      insert into learner_course_enrolments
        (id, learner_id, course_slug, target_series_id, created_at, updated_at)
      values (${enrolment.id}, ${learnerId}, ${courseSlug}, ${series.id},
              ${nowIso}, ${nowIso})`;
  }
  return courseExamTargetView(enrolment, series, utcToday(now));
}

/**
 * DELETE /api/v1/learners/me/courses/{courseSlug}/target-series
 * (LearnerExamSeriesController :93-103): "not sure yet" is honest — the
 * target clears, the enrolment row REMAINS; a course with no enrolment is
 * a no-op (204 either way, the frozen ifPresent posture).
 */
export async function clearTargetSeries(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  courseSlug: string,
): Promise<void> {
  if (!isValidCourseSlug(courseSlug)) {
    throw new BadRequestError("course slug must be a kebab-case registry key");
  }
  await deps.sql`
    update learner_course_enrolments
    set target_series_id = null, updated_at = ${deps.clock.now().toISOString()}
    where learner_id = ${learnerId} and course_slug = ${courseSlug}`;
}

/**
 * ExamTargetReader.targetsFor (exam/ExamTargetReader.java :28-52) — the
 * read-model block shared with /state and /agenda: every course this
 * learner declared a target series for, the series batched in ONE read
 * (first-wins), vanished-series rows filtered, countdowns derived on this
 * read against `today` (UTC). An empty list IS the honest "no series
 * declared" state — clients render "add your exam series", never an
 * invented date.
 *
 * PARALLEL-LANE NOTE (disclosed, see file header): r7a's 041 tranche-1
 * (PR #65) carries its own copy inside services/learner/**; consolidation
 * to ONE canonical reader is requested as an R0 intake ruling after both
 * lanes land (#56 arbitration precedent).
 */
export async function examTargetsFor(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  today?: string,
): Promise<CourseExamTargetView[]> {
  const todayIso = today ?? utcToday(deps.clock.now());
  const declared = (await deps.sql`
    select id, learner_id, course_slug, target_series_id, created_at, updated_at
    from learner_course_enrolments
    where learner_id = ${learnerId} and target_series_id is not null`) as unknown as EnrolmentRow[];
  if (declared.length === 0) return [];
  const seriesIds = [...new Set(declared.map((e) => e.target_series_id as string))];
  const seriesRows = (await deps.sql`
    select id, board, qualification, series_code, label, window_start,
           window_end, entry_deadline, results_date, estimated,
           source_url, retrieved_at
    from exam_series
    where id = any(${seriesIds}::uuid[])`) as unknown as ExamSeriesRow[];
  const seriesById = new Map<string, ExamSeriesRow>();
  for (const s of seriesRows) {
    if (!seriesById.has(s.id)) seriesById.set(s.id, s);
  }
  return declared
    .filter((e) => seriesById.has(e.target_series_id as string))
    .map((e) => courseExamTargetView(e, seriesById.get(e.target_series_id as string)!, todayIso));
}

// ── learner assignments (V49/V51) ───────────────────────────────────────────

const toAssignmentView = (a: AssignmentRow) => ({
  id: a.id,
  title: a.title,
  courseSlug: a.course_slug,
  courseLabel: a.course_label,
  specRefs: a.spec_refs,
  marksTotal: a.marks_total,
  questionCount: a.question_count,
  dueAt: toInstant(a.due_at),
  status: (a.status === ASSIGNMENT_STATUS_CLOSED ? "closed" : "open") as "open" | "closed",
  classId: a.class_id,
  createdAt: toInstant(a.created_at),
});

interface AssignmentLists {
  mine: Map<string, SubmissionRow>;
  visible: AssignmentRow[];
}

/**
 * The shared fetch behind the list endpoint and the agenda block: the
 * learner's latest hand-in per assignment (append-only trail, newest
 * first, putIfAbsent — the FIRST row per assignment wins because the read
 * is already occurrence-desc; the 2000-row window is the frozen bound)
 * beside the newest-first 50-row assignment list, V51 visibility applied
 * (NULL class target = every enabled student, the V49 default; a class
 * target = members only — the membership rows are the authorization, no
 * membership row, no classroom work).
 */
async function fetchAssignmentLists(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  assignmentLimit: number,
): Promise<AssignmentLists> {
  const submissionRows = (await deps.sql`
    select assignment_id, questions_completed, score, occurred_at
    from assignment_submissions
    where learner_id = ${learnerId}
    order by occurred_at desc
    limit ${SUBMISSION_LOOKUP_WINDOW}`) as unknown as SubmissionRow[];
  const mine = new Map<string, SubmissionRow>();
  for (const s of submissionRows) {
    if (!mine.has(s.assignment_id)) mine.set(s.assignment_id, s);
  }
  const allRows = (await deps.sql`
    select id, title, course_slug, course_label, spec_refs, marks_total,
           question_count, due_at, status, class_id, created_at
    from assignments
    order by created_at desc
    limit ${assignmentLimit}`) as unknown as AssignmentRow[];
  const visible: AssignmentRow[] = [];
  for (const a of allRows) {
    if (a.class_id == null) {
      visible.push(a);
      continue;
    }
    const memberRows = (await deps.sql`
      select 1 as one from class_members
      where class_id = ${a.class_id} and student_id = ${learnerId}
      limit 1`) as unknown as Array<{ one: number }>;
    if (memberRows.length > 0) visible.push(a);
  }
  return { mine, visible };
}

/**
 * GET /api/v1/learners/me/assignments (LearnerAssignmentController :69-88)
 * — newest-created first (the LIST order; the agenda re-orders), each row
 * the assignment beside the learner's own latest hand-in (null until they
 * submit).
 */
export async function learnerAssignments(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
): Promise<LearnerAssignmentView[]> {
  const { mine, visible } = await fetchAssignmentLists(
    deps,
    learnerId,
    LEARNER_ASSIGNMENT_LIST_LIMIT,
  );
  return visible.map((a) => learnerAssignmentView(a, mine));
}

const learnerAssignmentView = (
  a: AssignmentRow,
  mine: Map<string, SubmissionRow>,
): LearnerAssignmentView => {
  const s = mine.get(a.id);
  return {
    assignment: toAssignmentView(a),
    mySubmission: s
      ? { questionsCompleted: s.questions_completed, score: s.score, submittedAt: toInstant(s.occurred_at) }
      : null,
  };
};

/**
 * POST /api/v1/learners/me/assignments/{id}/submissions
 * (LearnerAssignmentController :91-110) — the append-only hand-in.
 * Law, in order: assignment exists else 404 verbatim; the V51 hand-in
 * gate (class-targeted accepts members only — 403 verbatim); CLOSED
 * rejects (409 verbatim); questionsCompleted > questionCount rejects
 * (400 verbatim); score > marksTotal rejects (400 verbatim); then the
 * append (occurred_at = now; the schema's score >= 0 check backs the
 * request bound). The mastery evidence practice generates flows through
 * the existing attempt pipeline — this write touches ONLY the submission
 * trail (the AssignmentFlowIT honesty pin).
 */
export async function submitAssignment(
  deps: FlashcardRatingRecordDeps,
  learnerId: string,
  assignmentId: string,
  request: AssignmentSubmissionRequest,
): Promise<{ questionsCompleted: number; score: number | null; submittedAt: string }> {
  const assignmentRows = (await deps.sql`
    select id, title, course_slug, course_label, spec_refs, marks_total,
           question_count, due_at, status, class_id, created_at
    from assignments
    where id = ${assignmentId}`) as unknown as AssignmentRow[];
  const assignment = assignmentRows[0]!;
  if (!assignment) {
    throw new LearnerMeNotFoundError("unknown assignment: " + assignmentId);
  }
  if (assignment.class_id != null) {
    const memberRows = (await deps.sql`
      select 1 as one from class_members
      where class_id = ${assignment.class_id} and student_id = ${learnerId}
      limit 1`) as unknown as Array<{ one: number }>;
    if (memberRows.length === 0) {
      throw new LearnerMeForbiddenError("this assignment targets a class you are not in");
    }
  }
  if (assignment.status === ASSIGNMENT_STATUS_CLOSED) {
    throw new ConflictError("assignment is closed: " + assignment.title);
  }
  if (request.questionsCompleted > assignment.question_count) {
    throw new BadRequestError(
      "questionsCompleted " + request.questionsCompleted +
        " exceeds the assignment's " + assignment.question_count + " questions",
    );
  }
  if (request.score != null && request.score > assignment.marks_total) {
    throw new BadRequestError(
      "score " + request.score +
        " exceeds the assignment's " + assignment.marks_total + " marks",
    );
  }
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  await deps.sql`
    insert into assignment_submissions
      (id, assignment_id, learner_id, questions_completed, score, occurred_at, created_at)
    values (${deps.clock.newId()}, ${assignmentId}, ${learnerId},
            ${request.questionsCompleted}, ${request.score ?? null},
            ${nowIso}, ${nowIso})`;
  return {
    questionsCompleted: request.questionsCompleted,
    score: request.score ?? null,
    submittedAt: toInstant(now),
  };
}

// ── the agenda (T-C76 executive read model) ─────────────────────────────────

/**
 * The NBA composition seam — tranche-2 injects the NextBestActionService
 * port here (NBA.actionsFor(learnerId, rootId), policy nba-rules/v1.3).
 * Until then the agenda is composed honestly WITHOUT the actions block.
 */
export type NextBestActionsProvider = (
  learnerId: string,
  rootId: string,
) => Promise<NextBestActionsView>;

export interface AgendaDeps {
  sql: SqlFn;
  clock: SubmitClock;
  /** tranche-2: the NBA engine port; absent → rootId calls return 501. */
  nextBestActions?: NextBestActionsProvider;
}

/**
 * GET /api/v1/learners/me/agenda (LearnerAgendaController :97-154) — one
 * call composes what is on this learner's plate, every row a durable
 * evidence row served through its owning module:
 *   1. dueReviews — the forgetting-curve's PENDING schedule
 *      (ReviewScheduleRepository.findByLearnerIdAndStatusOrderByDueAtAsc),
 *      due soonest first, node titles resolved in ONE batched read
 *      (first-wins), ReviewView.reason = .name();
 *   2. assignments — the SAME visible rows the list endpoint serves
 *      (50-row bound, latest hand-in beside each), RE-ORDERED for the
 *      agenda question: dueAt asc, then createdAt DESC (an agenda answers
 *      "what is due", not "what was just set"); due_at is NOT NULL (V49) —
 *      there is no undated case;
 *   3. actions — the NBA block for the requested subject rootId, or null
 *      when no root is supplied; rootId WITHOUT a ported engine = the
 *      honest 501 (owning task id T-MIG-043 tranche-2), never a fake 200;
 *   4. examTargets — the declared series' countdown (T-C79), derived on
 *      this read (ADR-031); empty when nothing is declared.
 * Deliberately absent (frozen javadoc :60-64): any derived "overdue"/
 * "done" flags, streaks, notifications, plan persistence.
 */
export async function buildAgenda(
  deps: AgendaDeps,
  learnerId: string,
  rootId?: string,
): Promise<{
  learnerId: string;
  asOf: string;
  dueReviews: ReviewView[];
  assignments: LearnerAssignmentView[];
  actions: NextBestActionsView | null;
  examTargets: CourseExamTargetView[];
}> {
  const now = deps.clock.now();

  // 1) due spaced reviews — same query as the learner-state read model
  const reviewRows = (await deps.sql`
    select node_id, due_at, reason
    from review_schedules
    where learner_id = ${learnerId} and status = 'PENDING'
    order by due_at asc`) as unknown as Array<{ node_id: string; due_at: string; reason: string }>;
  const reviewNodeIds = [...new Set(reviewRows.map((r) => r.node_id))];
  const titles = new Map<string, string>();
  if (reviewNodeIds.length > 0) {
    const titleRows = (await deps.sql`
      select id, title from knowledge_nodes
      where id = any(${reviewNodeIds}::uuid[])`) as unknown as Array<{ id: string; title: string }>;
    for (const row of titleRows) {
      if (!titles.has(row.id)) titles.set(row.id, row.title);
    }
  }
  const dueReviews: ReviewView[] = reviewRows.map((r) => ({
    nodeId: r.node_id,
    dueAt: toInstant(r.due_at),
    reason: r.reason as (typeof REVIEW_REASONS)[number],
    nodeName: titles.get(r.node_id) ?? null,
  }));

  // 2) assignments — same query + filter as the list endpoint, re-ordered
  const { mine, visible } = await fetchAssignmentLists(deps, learnerId, AGENDA_ASSIGNMENT_LIMIT);
  const ordered = [...visible].sort((a, b) => {
    const dueDiff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    if (dueDiff !== 0) return dueDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const assignmentRows = ordered.map((a) => learnerAssignmentView(a, mine));

  // 3) next best actions — only when the caller asks for a subject root
  const actions =
    rootId == null
      ? null
      : deps.nextBestActions
        ? await deps.nextBestActions(learnerId, rootId)
        : (() => {
            throw new LearnerMeNotImplementedError(
              "not implemented: next-best-action engine (T-MIG-043 tranche-2 owns /agenda rootId + /recommendations)",
            );
          })();

  // 4) exam targets (T-C79, ADR-031) — the declared series' countdown
  const examTargets = await examTargetsFor(deps, learnerId);

  return {
    learnerId,
    asOf: toInstant(now),
    dueReviews,
    assignments: assignmentRows,
    actions,
    examTargets,
  };
}

// ── module factory (the buildTeacherMarkingModule shape) ────────────────────

export interface LearnerMeModule {
  recordFlashcardRating: (
    learnerId: string,
    request: { cardId: string; rating: string; subtopicCode: string },
  ) => Promise<FlashcardRatingView>;
  flashcardTrailPage: (
    learnerId: string,
    params: { limit?: number; cursor?: string },
  ) => Promise<FlashcardRatingTrailView>;
  flashcardReviewSchedule: (learnerId: string) => Promise<FlashcardReviewScheduleView>;
  recordNoteVote: (
    learnerId: string,
    request: { noteId: string; vote: string; subtopicCode: string },
  ) => Promise<NoteVoteView>;
  examSeriesCalendar: (qualification?: string) => Promise<ReturnType<typeof toExamSeriesView>[]>;
  setTargetSeries: (
    learnerId: string,
    courseSlug: string,
    request: SetTargetRequest,
  ) => Promise<CourseExamTargetView>;
  clearTargetSeries: (learnerId: string, courseSlug: string) => Promise<void>;
  examTargetsFor: (learnerId: string) => Promise<CourseExamTargetView[]>;
  learnerAssignments: (learnerId: string) => Promise<LearnerAssignmentView[]>;
  submitAssignment: (
    learnerId: string,
    assignmentId: string,
    request: AssignmentSubmissionRequest,
  ) => Promise<{ questionsCompleted: number; score: number | null; submittedAt: string }>;
  buildAgenda: (
    learnerId: string,
    rootId?: string,
  ) => Promise<{
    learnerId: string;
    asOf: string;
    dueReviews: ReviewView[];
    assignments: LearnerAssignmentView[];
    actions: NextBestActionsView | null;
    examTargets: CourseExamTargetView[];
  }>;
}

/**
 * The composition root seam: inject the sql adapter + clock (+ the
 * tranche-2 NBA provider and an optional ladder override; the ladder
 * parameter exists for the V59 registry wiring `learner.flashcard-review`
 * — the production composition root reads the registry, tests pin the
 * lenient normalization).
 *
 * TRANCHE-2 FLIP: `nextBestActions` now DEFAULTS to the ported engine
 * (buildNbaEngine over the same sql + clock — the nba.ts port of
 * NextBestActionService :79-554, policy nba-rules/v1.3, the packaged T-C11
 * snapshot). An explicit `opts.nextBestActions` still wins (the test
 * injection seam tranche-1 pinned); the honest 501 in buildAgenda remains
 * as the no-engine safety net for deps constructed without a provider.
 */
export function buildLearnerMeModule(
  sql: SqlFn,
  clock: SubmitClock,
  opts?: {
    nextBestActions?: NextBestActionsProvider;
    flashcardReviewIntervalDays?: readonly number[];
    nba?: Omit<NbaDeps, "sql" | "clock">;
  },
): LearnerMeModule {
  const deps = { sql, clock };
  const nextBestActions =
    opts?.nextBestActions ??
    buildNbaEngine(sql, clock, opts?.nba);
  return {
    recordFlashcardRating: (learnerId, request) => recordFlashcardRating(deps, learnerId, request),
    flashcardTrailPage: (learnerId, params) => flashcardTrailPage(deps, learnerId, params),
    flashcardReviewSchedule: (learnerId) =>
      flashcardReviewSchedule(deps, learnerId, opts?.flashcardReviewIntervalDays),
    recordNoteVote: (learnerId, request) => recordNoteVote(deps, learnerId, request),
    examSeriesCalendar: (qualification) => examSeriesCalendar(deps, qualification),
    setTargetSeries: (learnerId, courseSlug, request) =>
      setTargetSeries(deps, learnerId, courseSlug, request),
    clearTargetSeries: (learnerId, courseSlug) => clearTargetSeries(deps, learnerId, courseSlug),
    examTargetsFor: (learnerId) => examTargetsFor(deps, learnerId),
    learnerAssignments: (learnerId) => learnerAssignments(deps, learnerId),
    submitAssignment: (learnerId, assignmentId, request) =>
      submitAssignment(deps, learnerId, assignmentId, request),
    buildAgenda: (learnerId, rootId) =>
      buildAgenda(
        { sql, clock, nextBestActions },
        learnerId,
        rootId,
      ),
  };
}
