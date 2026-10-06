/**
 * Learner state-model read port (T-MIG-041 tranche 1) — the OBSERVED query
 * surface + view assembly of the frozen LearnerStateController.java /
 * LearnerModelService.java / TutorEngagementReader.java / ExamTargetReader.java
 * against the Flyway-owned tables (drizzle baseline 0000_organic_mauler.sql;
 * R-M-LAZY doctrine: port the repository call sequence, not the entity map).
 *
 * Frozen callers @ 6cad6ef:
 *   - LearnerStateController.state (:84-177) — the 9-leg composite
 *   - LearnerModelService.skillStates (:206-208)   -> ORDER BY last_practiced_at DESC
 *   - LearnerModelService.misconceptionReadings (:225-235)
 *       raw rows ORDER BY probability DESC, then RE-SORTED by the
 *       staleness-relaxed effective probability DESC ("a fresh 0.6 diagnosis
 *       must outrank a stale 0.9 one") — MED-2/ADR-032
 *   - TutorEngagementReader.groupEngagementSummary — first-seen grouping over
 *       the occurredAt DESC window, asks + refusedAny + lastAsked max +
 *       per-signal counts (null signal -> TOPIC_ENGAGEMENT), limit 10
 *   - ExamTargetReader.targetsFor (:29-46) — declared enrolments -> batched
 *       series lookup -> countdowns derived on the read (ADR-031)
 *   - CourseStatsController.courseStats (:51-57) — 4 counts
 *
 * DETERMINISM (ADR-031, mirrored from the frozen sources): every now()-
 * dependent value — decayed mastery, staleness-relaxed probability, exam
 * countdowns — is computed from an INJECTED clock/anchor passed by the
 * caller and is never persisted. The port recomputes exactly like the core;
 * the W4 golden tranche (T-MIG-040-PREP, cases w4-state-*) tolerates precisely
 * these fields on the wire.
 *
 * PRECISION NOTE (disclosed): the frozen decay/relaxation laws compute in
 * NANOSECOND precision (EbbinghausDecayService/BdtEngine docs: "no sub-second
 * truncation drift"). JS Date resolves to MILLISECONDS; for any sub-second age
 * the relative exponent error is ~1e-15 (below double epsilon), so the
 * millisecond form is numerically equivalent — disclosed rather than
 * re-implemented.
 */
import type { SqlFn } from "./sql";

// ── engine parameters (frozen defaults; the model_versions registry path is
//    tranche-3 — LearnerProperties normalization: <=0 falls back to paper) ──

/** DecayParams.paperDefaults() — mirrors contracts/src/decay.ts (T-MIG-038 #60). */
export interface LearnerDecayParams {
  tauLowDays: number; // 30
  tauMidDays: number; // 90
  tauHighDays: number; // 365
  lowBandCeiling: number; // 0.45
  highBandFloor: number; // 0.8
  floor: number; // 0.1 (= BKT L0)
  reviewBelow: number; // 0.6
}

/** LearnerProperties.Bdt normalization (LearnerProperties.java, Bdt record). */
export interface LearnerBdtParams {
  prior: number; // 0.3
  selectIfHeld: number; // 0.7 (unused on the read path — write-path BDT)
  selectIfNotHeld: number; // 0.1 (unused on the read path)
  activeThreshold: number; // 0.5
  stalenessTauDays: number; // 180
}

export const LEARNER_DECAY_PAPER_DEFAULTS: LearnerDecayParams = {
  tauLowDays: 30,
  tauMidDays: 90,
  tauHighDays: 365,
  lowBandCeiling: 0.45,
  highBandFloor: 0.8,
  floor: 0.1,
  reviewBelow: 0.6,
};

export const LEARNER_BDT_PAPER_DEFAULTS: LearnerBdtParams = {
  prior: 0.3,
  selectIfHeld: 0.7,
  selectIfNotHeld: 0.1,
  activeThreshold: 0.5,
  stalenessTauDays: 180,
};

const DAY_MS = 86_400_000;

function clamp01(v: number): number {
  return Math.max(0.0, Math.min(1.0, v));
}

/** DecayParams.tauFor (:59-68) — the band the given mastery falls into. */
function tauFor(mastery: number, p: LearnerDecayParams): number {
  if (mastery < p.lowBandCeiling) return p.tauLowDays;
  if (mastery < p.highBandFloor) return p.tauMidDays;
  return p.tauHighDays;
}

/** DecayParams.bandOf (:58-68): < lowBandCeiling -> LOW; < highBandFloor -> DEVELOPING; else SECURE. */
export function bandOf(mastery: number, p: LearnerDecayParams): "LOW" | "DEVELOPING" | "SECURE" {
  if (mastery < p.lowBandCeiling) return "LOW";
  if (mastery < p.highBandFloor) return "DEVELOPING";
  return "SECURE";
}

/**
 * EbbinghausDecayService.decayed (:29-40): P(t) = P0 * e^(-t/tau); tau frozen
 * on the STORED P0 (ADR-031 — "callers MUST pass the stored post-practice
 * posterior"); the result never drops below the floor; recomputed from the
 * anchor on every call and never persisted.
 */
export function decayedMastery(
  mastery: number,
  lastPracticedAt: Date,
  now: Date,
  p: LearnerDecayParams,
): number {
  if (!(now.getTime() > lastPracticedAt.getTime())) return clamp01(mastery);
  const elapsedMs = now.getTime() - lastPracticedAt.getTime();
  const tauMs = tauFor(mastery, p) * DAY_MS;
  const decayed = mastery * Math.exp(-elapsedMs / tauMs);
  return Math.max(p.floor, clamp01(decayed));
}

/**
 * BdtEngine.relaxedToPrior: effective = prior + (P_e - prior) * e^(-age/tau_s);
 * fresh or clock-skewed evidence returns the full posterior; ns precision in
 * the core (see the precision note above).
 */
export function relaxedToPrior(
  posterior: number,
  prior: number,
  lastEvidenceAt: Date,
  now: Date,
  stalenessTauDays: number,
): number {
  if (stalenessTauDays <= 0) {
    throw new Error("staleness tau must be positive, got " + stalenessTauDays);
  }
  const p = clamp01(posterior);
  const base = clamp01(prior);
  if (!(now.getTime() > lastEvidenceAt.getTime())) return p;
  const ageMs = now.getTime() - lastEvidenceAt.getTime();
  const tauMs = stalenessTauDays * DAY_MS;
  const relaxed = base + (p - base) * Math.exp(-ageMs / tauMs);
  return clamp01(relaxed);
}

// ── row shapes (snake_case columns as the selects read them) ──────────────

export interface SkillStateRow {
  nodeId: string;
  mastery: number;
  attempts: number;
  correctCount: number;
  lastPracticedAt: Date;
  proceduralFluencyGap: number | null;
}

export interface MisconceptionStateRow {
  misconceptionNodeId: string;
  probability: number;
  evidenceCount: number;
  lastEvidenceAt: Date;
}

export interface ReviewScheduleRow {
  nodeId: string;
  dueAt: Date;
  reason: "DECAY_CROSSED_THRESHOLD" | "TEACHER_ASSIGNED";
}

export interface TutorTopicEngagementRow {
  nodeId: string;
  occurredAt: Date;
  refused: boolean;
  signalType: string | null;
}

export interface FlashcardRatingRow {
  cardId: string;
  nodeId: string;
  rating: "KNOW" | "STILL_LEARNING";
  occurredAt: Date;
}

export interface NoteVoteRow {
  noteId: string;
  nodeId: string;
  vote: "HELPFUL" | "NOT_HELPFUL";
  occurredAt: Date;
}

export interface ExamSeriesRow {
  id: string;
  seriesCode: string;
  label: string;
  windowStart: string; // LocalDate (YYYY-MM-DD)
  windowEnd: string;
  entryDeadline: string | null;
  resultsDate: string | null;
  estimated: boolean;
}

export interface CourseEnrolmentRow {
  courseSlug: string;
  targetSeriesId: string;
}

// ── wire views (camelCase, mirrors the frozen records + 038 contracts) ────

export interface SkillStateView {
  nodeId: string;
  mastery: number;
  effectiveMastery: number;
  band: "LOW" | "DEVELOPING" | "SECURE";
  attempts: number;
  correctCount: number;
  lastPracticedAt: Date;
  proceduralFluencyGap: number | null;
  nodeName: string | null;
}

export interface MisconceptionStateView {
  misconceptionNodeId: string;
  probability: number; // the staleness-RELAXED value (MED-2/ADR-032)
  active: boolean;
  evidenceCount: number;
  lastEvidenceAt: Date;
  misconceptionName: string | null;
}

export interface ReviewView {
  nodeId: string;
  dueAt: Date;
  reason: "DECAY_CROSSED_THRESHOLD" | "TEACHER_ASSIGNED";
  nodeName: string | null;
}

export interface TutorEngagementView {
  nodeId: string;
  /** Frozen field name parity: LearnerStateView.java:77-79 uses nodeTitle
   *  (NOT nodeName — the SkillStateView/ReviewView fields keep nodeName).
   *  R-fix (tranche 2): tranche 1 drifted to nodeName; the contracts schema
   *  (tutorEngagementViewSchema, T-MIG-038 #60) pins nodeTitle and the wire
   *  must match the frozen DTO key for key. */
  nodeTitle: string | null;
  asks: number;
  lastAskedAt: Date;
  refusedAny: boolean;
  signalCounts: Record<string, number>;
}

export interface FlashcardRatingView {
  cardId: string;
  rating: string; // KNOW -> "know"; STILL_LEARNING -> "still-learning"
  subtopicCode: string | null; // null on the state read (no content bridge here)
  nodeId: string;
  occurredAt: Date;
}

export interface NoteVoteView {
  noteId: string;
  vote: string; // HELPFUL -> "helpful"; NOT_HELPFUL -> "not-helpful"
  subtopicCode: string | null;
  nodeId: string;
  occurredAt: Date;
}

export interface CourseExamTargetView {
  courseSlug: string;
  seriesId: string;
  seriesCode: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  entryDeadline: string | null;
  resultsDate: string | null;
  estimated: boolean;
  daysToWindowStart: number;
  daysToWindowEnd: number;
  entryDeadlinePassed: boolean;
}

export interface LearnerStateView {
  learnerId: string;
  skillStates: SkillStateView[];
  misconceptionStates: MisconceptionStateView[];
  pendingReviews: ReviewView[];
  tutorEngagements: TutorEngagementView[];
  flashcardRatings: FlashcardRatingView[];
  noteVotes: NoteVoteView[];
  examTargets: CourseExamTargetView[];
}

export interface CourseStatsView {
  learnerId: string;
  attempts: number;
  distinctQuestions: number;
  notesViewed: number;
  flashcardsRated: number;
}

// ── repo-port reads (the OBSERVED call sequence, one query per leg) ───────

const FLASHCARD_RATING_LIMIT = 50; // LearnerStateController:66 "same recency posture as tutor asks"
const NOTE_VOTE_LIMIT = 50; // LearnerStateController:69
const TUTOR_WINDOW_DAYS = 30; // V21 (P7): last 30 days
const TUTOR_SUMMARY_LIMIT = 10; // groupEngagementSummary(recent, 10, ...)

function mapDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

export async function skillStatesByRecency(
  sql: SqlFn,
  learnerId: string,
): Promise<SkillStateRow[]> {
  const rows = await sql`
    select node_id, mastery, attempts, correct_count, last_practiced_at, procedural_fluency_gap
    from skill_states
    where learner_id = ${learnerId}
    order by last_practiced_at desc
  `;
  return rows.map((r) => ({
    nodeId: String(r.node_id),
    mastery: Number(r.mastery),
    attempts: Number(r.attempts),
    correctCount: Number(r.correct_count),
    lastPracticedAt: mapDate(r.last_practiced_at),
    proceduralFluencyGap: r.procedural_fluency_gap == null ? null : Number(r.procedural_fluency_gap),
  }));
}

export async function misconceptionStatesByProbability(
  sql: SqlFn,
  learnerId: string,
): Promise<MisconceptionStateRow[]> {
  const rows = await sql`
    select misconception_node_id, probability, evidence_count, last_evidence_at
    from misconception_states
    where learner_id = ${learnerId}
    order by probability desc
  `;
  return rows.map((r) => ({
    misconceptionNodeId: String(r.misconception_node_id),
    probability: Number(r.probability),
    evidenceCount: Number(r.evidence_count),
    lastEvidenceAt: mapDate(r.last_evidence_at),
  }));
}

export async function pendingReviewsByDue(
  sql: SqlFn,
  learnerId: string,
): Promise<ReviewScheduleRow[]> {
  const rows = await sql`
    select node_id, due_at, reason
    from review_schedules
    where learner_id = ${learnerId} and status = ${"PENDING"}
    order by due_at asc
  `;
  return rows.map((r) => ({
    nodeId: String(r.node_id),
    dueAt: mapDate(r.due_at),
    reason: String(r.reason) as ReviewScheduleRow["reason"],
  }));
}

export async function recentTutorEngagements(
  sql: SqlFn,
  learnerId: string,
  now: Date,
): Promise<TutorTopicEngagementRow[]> {
  const since = new Date(now.getTime() - TUTOR_WINDOW_DAYS * DAY_MS);
  const rows = await sql`
    select node_id, occurred_at, refused, signal_type
    from tutor_topic_engagements
    where learner_id = ${learnerId} and occurred_at >= ${since}
    order by occurred_at desc
  `;
  return rows.map((r) => ({
    nodeId: String(r.node_id),
    occurredAt: mapDate(r.occurred_at),
    refused: Boolean(r.refused),
    signalType: r.signal_type == null ? null : String(r.signal_type),
  }));
}

export async function recentFlashcardRatings(
  sql: SqlFn,
  learnerId: string,
): Promise<FlashcardRatingRow[]> {
  const rows = await sql`
    select card_id, node_id, rating, occurred_at
    from flashcard_ratings
    where learner_id = ${learnerId}
    order by occurred_at desc
    limit ${FLASHCARD_RATING_LIMIT}
  `;
  return rows.map((r) => ({
    cardId: String(r.card_id),
    nodeId: String(r.node_id),
    rating: String(r.rating) as FlashcardRatingRow["rating"],
    occurredAt: mapDate(r.occurred_at),
  }));
}

export async function recentNoteVotes(sql: SqlFn, learnerId: string): Promise<NoteVoteRow[]> {
  const rows = await sql`
    select note_id, node_id, vote, occurred_at
    from note_votes
    where learner_id = ${learnerId}
    order by occurred_at desc
    limit ${NOTE_VOTE_LIMIT}
  `;
  return rows.map((r) => ({
    noteId: String(r.note_id),
    nodeId: String(r.node_id),
    vote: String(r.vote) as NoteVoteRow["vote"],
    occurredAt: mapDate(r.occurred_at),
  }));
}

/**
 * The one batched title lookup (LearnerStateController:101-104: "One batched
 * findAllById for all three collections"; V21 extends the set with engaged
 * topic ids BEFORE the lookup). A missing node row yields NO title — clients
 * keep their own fallback (the view's *Name stays null).
 */
export async function nodeTitles(
  sql: SqlFn,
  nodeIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set(nodeIds)];
  if (ids.length === 0) return new Map();
  const rows = await sql`
    select id, title from knowledge_nodes where id = any(${ids})
  `;
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r.id), String(r.title));
  return map;
}

export async function declaredEnrolments(
  sql: SqlFn,
  learnerId: string,
): Promise<CourseEnrolmentRow[]> {
  const rows = await sql`
    select course_slug, target_series_id
    from learner_course_enrolments
    where learner_id = ${learnerId} and target_series_id is not null
  `;
  return rows.map((r) => ({
    courseSlug: String(r.course_slug),
    targetSeriesId: String(r.target_series_id),
  }));
}

export async function examSeriesByIds(
  sql: SqlFn,
  seriesIds: Iterable<string>,
): Promise<Map<string, ExamSeriesRow>> {
  const ids = [...new Set(seriesIds)];
  const map = new Map<string, ExamSeriesRow>();
  if (ids.length === 0) return map;
  const rows = await sql`
    select id, series_code, label, window_start, window_end, entry_deadline, results_date, estimated
    from exam_series
    where id = any(${ids})
  `;
  for (const r of rows) {
    map.set(String(r.id), {
      id: String(r.id),
      seriesCode: String(r.series_code),
      label: String(r.label),
      windowStart: String(r.window_start),
      windowEnd: String(r.window_end),
      entryDeadline: r.entry_deadline == null ? null : String(r.entry_deadline),
      resultsDate: r.results_date == null ? null : String(r.results_date),
      estimated: Boolean(r.estimated),
    });
  }
  return map;
}

// ── pure assembly laws (verbatim from the frozen sources) ─────────────────

/** FlashcardRatingView.from (:14-16): rating wire = name lowercase with '_' -> '-'. */
export function flashcardRatingWire(rating: FlashcardRatingRow["rating"]): string {
  return rating.toLowerCase().replace(/_/g, "-");
}

/** NoteVote wire (NoteVote.vote().wire()): HELPFUL -> "helpful", NOT_HELPFUL -> "not-helpful". */
export function noteVoteWire(vote: NoteVoteRow["vote"]): string {
  return vote.toLowerCase().replace(/_/g, "-");
}

/**
 * TutorEngagementReader.groupEngagementSummary: group the occurredAt DESC
 * window in FIRST-SEEN order (LinkedHashMap), asks count + sticky refusedAny,
 * lastAsked = max(occurredAt), per-signal counts with null -> TOPIC_ENGAGEMENT
 * (insertion-ordered), then limit.
 */
export function groupEngagementSummary(
  recent: TutorTopicEngagementRow[],
  limit: number,
  titleResolver: (nodeId: string) => string | null,
): TutorEngagementView[] {
  const grouped = new Map<
    string,
    { asks: number; refusedAny: boolean; lastAskedAt: Date; signals: Map<string, number> }
  >();
  for (const e of recent) {
    let agg = grouped.get(e.nodeId);
    if (!agg) {
      agg = { asks: 0, refusedAny: false, lastAskedAt: e.occurredAt, signals: new Map() };
      grouped.set(e.nodeId, agg);
    }
    agg.asks += 1;
    if (e.refused) agg.refusedAny = true;
    if (e.occurredAt.getTime() > agg.lastAskedAt.getTime()) agg.lastAskedAt = e.occurredAt;
    const signal = e.signalType == null ? "TOPIC_ENGAGEMENT" : e.signalType;
    agg.signals.set(signal, (agg.signals.get(signal) ?? 0) + 1);
  }
  const views: TutorEngagementView[] = [];
  for (const [nodeId, agg] of grouped) {
    if (views.length >= limit) break;
    const signalCounts: Record<string, number> = {};
    for (const [k, v] of agg.signals) signalCounts[k] = v;
    views.push({
      nodeId,
      nodeTitle: titleResolver(nodeId),
      asks: agg.asks,
      lastAskedAt: agg.lastAskedAt,
      refusedAny: agg.refusedAny,
      signalCounts,
    });
  }
  return views;
}

/**
 * ExamTargetReader.targetsFor: declared enrolments (target_series_id NOT NULL)
 * -> batched series lookup -> rows whose series vanished are FILTERED (the
 * frozen code drops them via containsKey) -> countdowns derived on the read
 * from the caller's `today` (never stored, ADR-031). Days are WHOLE days
 * (ChronoUnit.DAYS.between) — negative when the window already opened.
 */
export function courseExamTargets(
  declared: CourseEnrolmentRow[],
  seriesById: Map<string, ExamSeriesRow>,
  today: string,
): CourseExamTargetView[] {
  const todayMs = Date.parse(today + "T00:00:00Z");
  const daysBetween = (from: string): number =>
    Math.round((Date.parse(from + "T00:00:00Z") - todayMs) / DAY_MS);
  return declared
    .filter((e) => seriesById.has(e.targetSeriesId))
    .map((e) => {
      const s = seriesById.get(e.targetSeriesId)!;
      return {
        courseSlug: e.courseSlug,
        seriesId: s.id,
        seriesCode: s.seriesCode,
        label: s.label,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        entryDeadline: s.entryDeadline,
        resultsDate: s.resultsDate,
        estimated: s.estimated,
        daysToWindowStart: daysBetween(s.windowStart),
        daysToWindowEnd: daysBetween(s.windowEnd),
        entryDeadlinePassed: s.entryDeadline != null && Date.parse(s.entryDeadline + "T00:00:00Z") < todayMs,
      };
    });
}

// ── the state composite (LearnerStateController.state :84-177, leg for leg) ──

export async function buildLearnerStateView(
  sql: SqlFn,
  learnerId: string,
  params: { decay: LearnerDecayParams; bdt: LearnerBdtParams },
  now: Date,
): Promise<LearnerStateView> {
  // legs 1-5 (independent reads, the frozen controller's call order)
  const skills = await skillStatesByRecency(sql, learnerId);
  const misconceptions = await misconceptionStatesByProbability(sql, learnerId);
  const reviews = await pendingReviewsByDue(sql, learnerId);
  const recentAsks = await recentTutorEngagements(sql, learnerId, now);
  const flashcards = await recentFlashcardRatings(sql, learnerId);
  const votes = await recentNoteVotes(sql, learnerId);
  const enrolments = await declaredEnrolments(sql, learnerId);

  // titles: node ids from skills + misconceptions + reviews + engaged topics
  // (V21: engaged topics resolved BEFORE the titles map so they get names too)
  const nodeIds = new Set<string>();
  for (const s of skills) nodeIds.add(s.nodeId);
  for (const m of misconceptions) nodeIds.add(m.misconceptionNodeId);
  for (const r of reviews) nodeIds.add(r.nodeId);
  for (const e of recentAsks) nodeIds.add(e.nodeId);
  const titles = await nodeTitles(sql, nodeIds);

  const seriesById = await examSeriesByIds(
    sql,
    enrolments.map((e) => e.targetSeriesId),
  );

  // leg: skills — read-time Ebbinghaus decay + band (LearnerStateController:113-123)
  const skillViews: SkillStateView[] = skills.map((s) => {
    const effective = decayedMastery(s.mastery, s.lastPracticedAt, now, params.decay);
    return {
      nodeId: s.nodeId,
      mastery: s.mastery,
      effectiveMastery: effective,
      band: bandOf(effective, params.decay),
      attempts: s.attempts,
      correctCount: s.correctCount,
      lastPracticedAt: s.lastPracticedAt,
      proceduralFluencyGap: s.proceduralFluencyGap,
      nodeName: titles.get(s.nodeId) ?? null,
    };
  });

  // leg: misconceptions — staleness-relaxed, RE-SORTED by effective DESC
  // (LearnerModelService.misconceptionReadings :225-235; the view shows the
  // relaxed value per MED-2/ADR-032; active = effective >= activeThreshold)
  const misconceptionViews: MisconceptionStateView[] = misconceptions
    .map((m) => {
      const effective = relaxedToPrior(
        m.probability,
        params.bdt.prior,
        m.lastEvidenceAt,
        now,
        params.bdt.stalenessTauDays,
      );
      return {
        misconceptionNodeId: m.misconceptionNodeId,
        probability: effective,
        active: effective >= params.bdt.activeThreshold,
        evidenceCount: m.evidenceCount,
        lastEvidenceAt: m.lastEvidenceAt,
        misconceptionName: titles.get(m.misconceptionNodeId) ?? null,
      };
    })
    .sort((a, b) => b.probability - a.probability);

  // leg: review queue (PENDING, dueAt ASC — the repo ordering IS the contract)
  const reviewViews: ReviewView[] = reviews.map((r) => ({
    nodeId: r.nodeId,
    dueAt: r.dueAt,
    reason: r.reason,
    nodeName: titles.get(r.nodeId) ?? null,
  }));

  // leg: tutor engagement summary (V21, grouped from the pre-fetched window)
  const engagementViews = groupEngagementSummary(recentAsks, TUTOR_SUMMARY_LIMIT, (id) =>
    titles.get(id) === undefined ? null : titles.get(id)!,
  );

  // legs: flashcard ratings + note votes — timing-only evidence windows,
  // subtopicCode is null here (no content bridge on the state read)
  const flashcardViews: FlashcardRatingView[] = flashcards.map((r) => ({
    cardId: r.cardId,
    rating: flashcardRatingWire(r.rating),
    subtopicCode: null,
    nodeId: r.nodeId,
    occurredAt: r.occurredAt,
  }));
  const noteVoteViews: NoteVoteView[] = votes.map((v) => ({
    noteId: v.noteId,
    vote: noteVoteWire(v.vote),
    subtopicCode: null,
    nodeId: v.nodeId,
    occurredAt: v.occurredAt,
  }));

  // leg: exam targets (T-C79/ADR-035 — countdowns derived on this read;
  // today is derived from the SAME injected clock as the decay math — the
  // frozen code uses LocalDate.now(ZoneOffset.UTC) here and Instant.now() in
  // state(); one injected clock keeps both honest and replayable)
  const today = now.toISOString().slice(0, 10);
  const examTargets = courseExamTargets(enrolments, seriesById, today);

  return {
    learnerId,
    skillStates: skillViews,
    misconceptionStates: misconceptionViews,
    pendingReviews: reviewViews,
    tutorEngagements: engagementViews,
    flashcardRatings: flashcardViews,
    noteVotes: noteVoteViews,
    examTargets,
  };
}

// ── /course-stats (CourseStatsController.courseStats :51-57 — 4 counts) ────

export async function buildCourseStatsView(
  sql: SqlFn,
  learnerId: string,
): Promise<CourseStatsView> {
  // attempts: every row (retries included — practice volume is real activity)
  const attemptRows = await sql`
    select count(*)::int as n from attempts where learner_id = ${learnerId}
  `;
  // distinct questions attempted (DISTINCT-coverage semantics)
  const questionRows = await sql`
    select count(distinct question_id)::int as n from attempts where learner_id = ${learnerId}
  `;
  // distinct notes viewed (revision_note_viewed is UNIQUE(note_id, user_id))
  const noteRows = await sql`
    select count(*)::int as n from revision_note_viewed where user_id = ${learnerId}
  `;
  // distinct cards rated (full-trail count — the state view serves only the
  // latest 50 events, so the distinct count must be computed here)
  const cardRows = await sql`
    select count(distinct card_id)::int as n from flashcard_ratings where learner_id = ${learnerId}
  `;
  return {
    learnerId,
    attempts: Number(attemptRows[0]?.n ?? 0),
    distinctQuestions: Number(questionRows[0]?.n ?? 0),
    notesViewed: Number(noteRows[0]?.n ?? 0),
    flashcardsRated: Number(cardRows[0]?.n ?? 0),
  };
}
