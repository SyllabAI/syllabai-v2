/**
 * The learner-model WRITE path (T-MIG-102) — port of the frozen
 * LearnerModelService evidence listener (syllabai-core @ 6cad6ef :74-203):
 * on every marked-attempt evidence event the model upserts BKT mastery
 * (skill_states), BDT misconception probabilities (misconception_states) and
 * the Paper B §16 procedural-fluency gap — the writes the T-MIG-101
 * adjudication proved absent (zero writers in v2; the two declared-justified
 * corpus rows exist because of exactly this gap).
 *
 * LINE-AGAINST-LINE provenance @ 6cad6ef:
 *   onAssessmentEvidence      :74-81   -> updateOnAssessmentEvidence (same
 *                                        order: mastery -> misconceptions -> fluency)
 *   updateMastery             :83-136  -> updateMastery (evidence nodes =
 *                                        primary topic first, secondary deduped,
 *                                        spec points appended deduped; get-or-create
 *                                        at l0; the C1 prior is the COMPUTED decayed
 *                                        anchor — consumed, never persisted; the
 *                                        posterior becomes the new anchor)
 *   updateMisconceptions      :138-167 -> updateMisconceptions (correct weakens every
 *                                        monitored misconception; wrong strengthens
 *                                        only the expressed distractor's; an untagged
 *                                        wrong answer is ambiguous evidence and
 *                                        updates nothing)
 *   updateFluencyGaps         :180-203 -> updateFluencyGaps (TOPIC-scoped only, existing
 *                                        rows only; untimed - timed accuracy over GRADED
 *                                        attempts; null until BOTH conditions observed)
 *   BktEngine.posterior/update :19-39  -> bktUpdate (Corbett & Anderson 1995)
 *   BdtEngine.updateOnTaggedDistractor/updateOnCorrect :16-37 -> bdtUpdate*
 *   LearnerProperties.Bkt.toParams :95-109 -> resolveBktParams (S2/ADR-033
 *                                        format-aware guess pricing: MCQ_SINGLE ->
 *                                        1/optionCount when >= 2 else the paper 0.25;
 *                                        SHORT_ANSWER -> 0.05; STRUCTURED -> 0.01;
 *                                        untyped -> 0.25; clamped strictly below
 *                                        1 - slip so a misconfigured knob degrades,
 *                                        never inverts)
 *
 * CONFIG (first-hand application.yml @ 6cad6ef :218-236): the boot's effective
 * syllabai.learner layer EQUALS the paper-default records — bkt
 * 0.1/0.1/0.25/0.1 (+ shortAnswerGuess 0.05, structuredGuess 0.01), decay
 * 30/90/365 0.45/0.8 floor 0.1 review-below 0.6, bdt 0.3/0.7/0.1 threshold 0.5
 * — so the v2 defaults (LEARNER_DECAY_PAPER_DEFAULTS / LEARNER_BDT_PAPER_DEFAULTS
 * in ./decay.ts, the T-MIG-066 canonical owner) are the effective config; this
 * module consumes them verbatim and adds the BKT record (no BKT reader existed).
 *
 * ADR-031 LAW (the card's forbidden list): the PERSISTED value is the P0
 * posterior anchor — the decayed forecast is consumed by the update prior and
 * NEVER written (the C1/S2 amendment, frozen :105-119, is ported exactly).
 * Reads recompute decay/relaxation from the anchors (services/learner/state.ts).
 *
 * PERSISTENCE SHAPE (R-M-LAZY: the repository call sequence, not the entity
 * map): per node one SELECT (findByLearnerIdAndNodeId parity) then INSERT
 * (fresh at l0, recordAttempt already applied) or UPDATE (mastery/attempts/
 * correct_count/last_practiced_at + updated_at + the JPA @Version bump);
 * misconception rows likewise (uq_skill_state / uq_misconception_state carry
 * the uniqueness the frozen @UniqueConstraint declared). Disclosed deviations:
 *   - the optimistic-lock 409 mapping (C-4) is not ported — v2 has no shared
 *     OptimisticLockingFailureException handler; the version column is still
 *     maintained (+1 per write) but a concurrent submit race loses the
 *     version bump, not silently the evidence (both writes apply; the corpus
 *     and the golden surface are sequential).
 *   - MasteryUpdatedEvent / MisconceptionUpdatedEvent (:123-131/:158-160): the
 *     frozen events fed BKT_UPDATED/BDT_UPDATED research telemetry through a
 *     listener-side observer. v2 has no event bus, so the seam writes the
 *     telemetry rows DIRECTLY (Card A — the T-MIG-101 dormant-seam activation,
 *     operator trace 1a1409875a8e9279): one BKT_UPDATED row per evidence node
 *     and one BDT_UPDATED row per updated misconception, each AFTER its state
 *     write (the frozen publish-after-save order). BKT_UPDATED payload = the
 *     research ROW CONTRACT verbatim (services/research/index.ts header):
 *     decayedPrior is the COMPUTED C1 prior (never the stored anchor),
 *     correctness a STRICT boolean, questionType/optionCount verbatim (a null
 *     type folds UNTYPED on read), gapDays = floor(elapsed days) computed
 *     alongside the decay (0 on fresh rows and clock skew — the decay branch
 *     consumed zero elapsed), priorMastery = the raw stored anchor on
 *     EXISTING rows only (a fresh row's pre-attempt estimate is exactly
 *     decayedPrior — no independent anchor side to report). BDT_UPDATED
 *     carries prior/posterior/updateKind plus the emission context — it has
 *     NO frozen reader; that payload is the v2 contract for the future BDT
 *     calibration band (misconception states do not decay — relaxation is
 *     read-time — so no gapDays/decayedPrior). occurred_at = the evidence
 *     event's occurredAt (the attempt instant); schema_version rides the
 *     column default 1. Posture: fail-loud — a telemetry failure fails the
 *     evidence write exactly like any state write (the module's
 *     no-silent-skip law; the frozen synchronous @Transactional listener
 *     propagated the same way).
 *   - occurredAt: the frozen publisher stamps Instant.now() at emit
 *     (EvidencePublisher.java :88 — the capture's lastPracticedAt sits ~9ms
 *     after the attempt's submittedAt); the v2 seam (T-MIG-030 of record)
 *     carries the attempt's createdAt as the event's occurredAt — a sub-10ms
 *     deviation inside the tolerated now-dependent identity class
 *     (lastPracticedAt/lastEvidenceAt are tolerated corpus-wide). The listener
 *     port consumes event.occurredAt verbatim (frozen :89/:140).
 *   - a NULL primary_topic_node_id flows into the evidence nodes exactly like
 *     the frozen topicNodeIds (:111-120) — the frozen save then violates the
 *     NOT NULL node_id and fails the submit; v2 keeps the same fail-loud
 *     posture (fail-closed on data defects, never a silent skip).
 */
import {
  LEARNER_DECAY_PAPER_DEFAULTS,
  LEARNER_BDT_PAPER_DEFAULTS,
  decayedMastery,
  type LearnerBdtParams,
  type LearnerDecayParams,
} from "./decay";

/** Structural sql seam — declared per-module (the fence convention). */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

// ── BKT parameters (LearnerProperties.Bkt + the ADR-033 pricing) ───────────

/** LearnerProperties.Bkt (frozen :52-61) — the paper-default record. */
export interface LearnerBktParams {
  l0: number; // 0.1
  slip: number; // 0.1
  guess: number; // 0.25 (the four-option-MCQ base)
  learnRate: number; // 0.1
  shortAnswerGuess: number; // 0.05 (S2 C5)
  structuredGuess: number; // 0.01 (S2: full marks by luck ~impossible)
}

export const LEARNER_BKT_PAPER_DEFAULTS: LearnerBktParams = {
  l0: 0.1,
  slip: 0.1,
  guess: 0.25,
  learnRate: 0.1,
  shortAnswerGuess: 0.05,
  structuredGuess: 0.01,
};

/** The resolved per-event emission shape (BktParams — l0/slip/guess/T). */
export interface ResolvedBktParams {
  l0: number;
  slip: number;
  guess: number;
  learnRate: number;
}

/**
 * LearnerProperties.Bkt.toParams (:95-109) — format-aware emission pricing
 * (S2/ADR-033). Resolution: MCQ_SINGLE with a usable count -> 1/optionCount
 * (the paper 0.25 is exactly N=4); SHORT_ANSWER -> 0.05; STRUCTURED -> 0.01;
 * null/blank/unknown -> the paper 0.25 (strict refinement, legacy behaviour
 * preserved). Guards (S2 C3): a count below 2 degrades to the paper default
 * (1/1 = 1.0 would make WRONG answers RAISE mastery); the resolved guess is
 * clamped strictly below 1 - slip (at guess >= 1 - slip a wrong answer stops
 * being evidence of anything — degrade, never invert).
 */
export function resolveBktParams(
  questionType: string | null,
  optionCount: number,
  p: LearnerBktParams = LEARNER_BKT_PAPER_DEFAULTS,
): ResolvedBktParams {
  let resolved: number;
  if (questionType === "MCQ_SINGLE") {
    resolved = optionCount >= 2 ? 1.0 / optionCount : p.guess;
  } else if (questionType === "SHORT_ANSWER") {
    resolved = p.shortAnswerGuess;
  } else if (questionType === "STRUCTURED") {
    resolved = p.structuredGuess;
  } else {
    resolved = p.guess;
  }
  resolved = Math.min(resolved, 1.0 - p.slip - 1e-9);
  return { l0: p.l0, slip: p.slip, guess: resolved, learnRate: p.learnRate };
}

// ── the engines (pure domain math, BktEngine/BdtEngine ports) ──────────────

function clamp01(v: number): number {
  return Math.max(0.0, Math.min(1.0, v));
}

// ── research telemetry (the dormant seam — BKT_UPDATED/BDT_UPDATED) ─────────

/** Whole-day floor for gapDays — the decay math's own day unit (decay.ts). */
const DAY_MS = 86_400_000;

/**
 * The BKT_UPDATED payload — the research ROW CONTRACT (services/research
 * header): the fields the calibration service's defensive parsers read
 * (decayedPrior via doubleValue, gapDays via longValue, correctness as a
 * STRICT boolean, questionType/optionCount through the SAME resolver).
 */
export interface BktTelemetryPayload {
  nodeId: string;
  /** the computed C1 prior the update consumed — NEVER the stored anchor */
  decayedPrior: number;
  correctness: boolean;
  questionType: string | null;
  optionCount: number;
  /** whole elapsed days the decay branch consumed (0 = no decay applied) */
  gapDays: number;
  /** the raw stored anchor — existing rows only; omitted on fresh rows */
  priorMastery?: number;
}

/**
 * The BDT_UPDATED payload — NO frozen reader exists (the frozen
 * MisconceptionUpdatedEvent consumer predates the telemetry contract); these
 * fields are the v2 contract for the future BDT calibration band. Misconception
 * states do not decay (relaxation is read-time) — so no gapDays/decayedPrior.
 */
export interface BdtTelemetryPayload {
  misconceptionNodeId: string;
  /** the pre-update probability the engine consumed (bdt.prior on fresh rows) */
  prior: number;
  /** the new anchor written to misconception_states */
  posterior: number;
  correctness: boolean;
  updateKind: "CORRECT" | "TAGGED_DISTRACTOR";
  questionType: string | null;
  optionCount: number;
}

/**
 * One telemetry_events row (schema_version rides the column default 1).
 * The jsonb param follows the repo insert convention (JSON.stringify ::jsonb,
 * review-writes.ts/concept-seed.ts). Fail-loud: the caller writes telemetry
 * AFTER its state write on the same SqlFn — a failure propagates and fails
 * the evidence write (the no-silent-skip law).
 */
async function writeTelemetry(
  sql: SqlFn,
  eventType: "BKT_UPDATED" | "BDT_UPDATED",
  learnerId: string,
  payload: BktTelemetryPayload | BdtTelemetryPayload,
  occurredAt: Date,
  clock: ModelUpdateClock,
): Promise<void> {
  await sql`
    insert into telemetry_events (id, learner_id, event_type, payload, occurred_at)
    values (${clock.newId()}, ${learnerId}, ${eventType}, ${JSON.stringify(payload)}::jsonb,
            ${occurredAt.toISOString()})
  `;
}

/**
 * BktEngine.update (:36-39): the next-step mastery including the learning
 * transition — Bayesian evidence posterior, then P(L_{t+1}) =
 * posterior + (1 - posterior) * T.
 */
export function bktUpdate(prior: number, correct: boolean, p: ResolvedBktParams): number {
  const x = clamp01(prior);
  const evidence = correct
    ? (x * (1 - p.slip)) / (x * (1 - p.slip) + (1 - x) * p.guess)
    : (x * p.slip) / (x * p.slip + (1 - x) * (1 - p.guess));
  const posterior = clamp01(evidence);
  return clamp01(posterior + (1 - posterior) * p.learnRate);
}

/** BdtEngine.updateOnTaggedDistractor (:16-21) — the distractor was chosen. */
export function bdtUpdateOnTaggedDistractor(prior: number, p: LearnerBdtParams): number {
  const x = clamp01(prior);
  const posterior = (x * p.selectIfHeld) / (x * p.selectIfHeld + (1 - x) * p.selectIfNotHeld);
  return clamp01(posterior);
}

/** BdtEngine.updateOnCorrect (:27-37) — P(correct|held) = 1 - selectIfHeld. */
export function bdtUpdateOnCorrect(prior: number, p: LearnerBdtParams): number {
  const x = clamp01(prior);
  const likeIfHeld = 1 - p.selectIfHeld;
  const likeIfNot = 1 - p.selectIfNotHeld;
  const posterior = (x * likeIfHeld) / (x * likeIfHeld + (1 - x) * likeIfNot);
  return clamp01(posterior);
}

// ── the evidence event (AssessmentEvidenceRecordedEvent port) ──────────────

/**
 * The observable core of AssessmentEvidenceRecordedEvent (frozen
 * shared/events :55-73) — the fields the listener consumes. The publisher
 * (services/assessment/submit.ts, EvidencePublisher.publishMcq parity)
 * assembles it: topicNodeIds = primary first + secondary deduped
 * (EvidencePublisher.topicNodeIds :111-120), specPointNodeIds deduped
 * (:100-109), questionType = type.name() (null-safe), optionCount = the LIVE
 * MCQ count or 0 (:86-87).
 */
export interface AssessmentEvidenceEvent {
  attemptId: string;
  learnerId: string;
  questionId: string;
  primaryTopicNodeId: string | null;
  secondaryTopicNodeIds: string[];
  specPointNodeIds: string[];
  correct: boolean;
  expressedMisconceptionIds: string[]; // the chosen distractor's tags
  observedMisconceptionIds: string[]; // every monitored misconception
  questionType: string | null;
  optionCount: number;
  occurredAt: string; // ISO instant
}

/** Injectable clock (the entity PrePersist parity — uuid + wall clock). */
export interface ModelUpdateClock {
  newId(): string;
  now(): Date;
}

export const defaultModelUpdateClock: ModelUpdateClock = {
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
};

export interface ModelUpdateParams {
  bkt: LearnerBktParams;
  decay: LearnerDecayParams;
  bdt: LearnerBdtParams;
}

export const LEARNER_MODEL_PAPER_DEFAULTS: ModelUpdateParams = {
  bkt: LEARNER_BKT_PAPER_DEFAULTS,
  decay: LEARNER_DECAY_PAPER_DEFAULTS,
  bdt: LEARNER_BDT_PAPER_DEFAULTS,
};

/** skill_states row as the listener reads it (plain column names). */
interface SkillStateRow {
  mastery: number;
  attempts: number;
  correct_count: number;
  last_practiced_at: string | Date | null;
}

/** misconception_states row as the listener reads it. */
interface MisconceptionStateRow {
  probability: number;
  evidence_count: number;
}

/**
 * onAssessmentEvidence (:74-81) — the listener, phase for phase in the frozen
 * order: mastery -> misconceptions -> fluency gaps. Every phase ports its
 * frozen method line-against-line (see the file header).
 */
export async function updateOnAssessmentEvidence(
  sql: SqlFn,
  event: AssessmentEvidenceEvent,
  params: ModelUpdateParams = LEARNER_MODEL_PAPER_DEFAULTS,
  clock: ModelUpdateClock = defaultModelUpdateClock,
): Promise<void> {
  const when = new Date(event.occurredAt);
  await updateMastery(sql, event, when, params, clock);
  await updateMisconceptions(sql, event, when, params, clock);
  await updateFluencyGaps(sql, event, when, clock);
}

/**
 * updateMastery (:83-136). Evidence nodes: the topic list (primary first,
 * secondary deduped against it) then the mapped spec points appended deduped
 * — every node gets the SAME marked-attempt update (T-C18: one marked attempt
 * is one BKT update per node it honestly tests). Get-or-create at l0; the C1
 * prior is the COMPUTED decayed anchor (consumed, never persisted — ADR-031);
 * the posterior becomes the new anchor; recordAttempt (:89-96) applies
 * attempts/correctCount/lastPracticedAt.
 */
async function updateMastery(
  sql: SqlFn,
  event: AssessmentEvidenceEvent,
  when: Date,
  params: ModelUpdateParams,
  clock: ModelUpdateClock,
): Promise<void> {
  const resolved = resolveBktParams(event.questionType, event.optionCount, params.bkt);

  // topicNodeIds(question, secondaryTopics) (:111-120) + the spec-point append
  // (:94-99): one evidence-node list, first-seen dedup, spec points LAST.
  const evidenceNodes: string[] = [];
  if (event.primaryTopicNodeId !== undefined && event.primaryTopicNodeId !== null) {
    evidenceNodes.push(event.primaryTopicNodeId);
  }
  for (const secondary of event.secondaryTopicNodeIds) {
    if (!evidenceNodes.includes(secondary)) evidenceNodes.push(secondary);
  }
  for (const sp of event.specPointNodeIds) {
    if (!evidenceNodes.includes(sp)) evidenceNodes.push(sp);
  }

  for (const node of evidenceNodes) {
    const existing = (await sql`
      select mastery, attempts, correct_count, last_practiced_at
      from skill_states
      where learner_id = ${event.learnerId} and node_id = ${node}
    `) as unknown as SkillStateRow[];
    const state = existing[0];
    // findByLearnerIdAndNodeId -> orElseGet(new SkillState(..., bktParams.l0(), when))
    // (:102-104): a fresh row's prior is l0 (its lastPracticedAt is the event
    // instant — the constructor sets it — so the C1 decay branch never fires).
    const stored = state ? Number(state.mastery) : resolved.l0;
    const lastPracticed =
      state && state.last_practiced_at !== null
        ? new Date(state.last_practiced_at as string | Date)
        : null;
    // gapDays = the whole elapsed days the decay branch consumes, computed
    // alongside the decay (the research gap segments are τ-aligned to these);
    // 0 when no decay applies (fresh rows — the fresh anchor's lastPracticedAt
    // is the event instant — and clock skew, where decayedMastery clamps).
    const gapDays =
      lastPracticed !== null && when.getTime() > lastPracticed.getTime()
        ? Math.floor((when.getTime() - lastPracticed.getTime()) / DAY_MS)
        : 0;
    const prior = lastPracticed !== null ? decayedMastery(stored, lastPracticed, when, params.decay) : stored;
    const posterior = bktUpdate(prior, event.correct, resolved);
    if (!state) {
      // INSERT with recordAttempt already applied (:89-96 on the fresh entity:
      // mastery = posterior, attempts = 1, correctCount += correct).
      await sql`
        insert into skill_states
          (id, learner_id, node_id, mastery, attempts, correct_count,
           last_practiced_at, created_at, updated_at)
        values
          (${clock.newId()}, ${event.learnerId}, ${node}, ${posterior}, ${1},
           ${event.correct ? 1 : 0}, ${when.toISOString()}, ${clock.now().toISOString()},
           ${clock.now().toISOString()})
      `;
    } else {
      await sql`
        update skill_states
        set mastery = ${posterior},
            attempts = ${Number(state.attempts) + 1},
            correct_count = ${Number(state.correct_count) + (event.correct ? 1 : 0)},
            last_practiced_at = ${when.toISOString()},
            updated_at = ${clock.now().toISOString()},
            version = version + 1
        where learner_id = ${event.learnerId} and node_id = ${node}
      `;
    }
    // research telemetry AFTER the state write (frozen publish-after-save):
    // decayedPrior is the COMPUTED C1 prior above; priorMastery (the raw
    // anchor side) only when a prior row existed.
    await writeTelemetry(
      sql,
      "BKT_UPDATED",
      event.learnerId,
      {
        nodeId: node,
        decayedPrior: prior,
        correctness: event.correct,
        questionType: event.questionType,
        optionCount: event.optionCount,
        gapDays,
        ...(state ? { priorMastery: stored } : {}),
      },
      when,
      clock,
    );
  }
}

/**
 * updateMisconceptions (:138-167): correct -> weaken EVERY monitored
 * misconception (observedMisconceptionIds); wrong -> strengthen only the
 * misconception expressed via the chosen distractor (expressedMisconceptionIds);
 * a wrong answer on an untagged distractor is ambiguous evidence and updates
 * nothing (empty targets). Get-or-create at the 0.3 prior; the BDT posterior
 * anchors the row (evidence_count++, last_evidence_at = when).
 */
async function updateMisconceptions(
  sql: SqlFn,
  event: AssessmentEvidenceEvent,
  when: Date,
  params: ModelUpdateParams,
  clock: ModelUpdateClock,
): Promise<void> {
  const targets = event.correct ? event.observedMisconceptionIds : event.expressedMisconceptionIds;
  if (targets.length === 0) return; // frozen :162: save nothing when nothing updated

  for (const misconception of targets) {
    const existing = (await sql`
      select probability, evidence_count
      from misconception_states
      where learner_id = ${event.learnerId} and misconception_node_id = ${misconception}
    `) as unknown as MisconceptionStateRow[];
    const state = existing[0];
    const prior = state ? Number(state.probability) : params.bdt.prior;
    const posterior = event.correct
      ? bdtUpdateOnCorrect(prior, params.bdt)
      : bdtUpdateOnTaggedDistractor(prior, params.bdt);
    if (!state) {
      // fresh MisconceptionState(..., bdtParams.prior(), when).update(posterior, when)
      // (:150-151 + :77-81): probability = posterior, evidence_count = 1.
      await sql`
        insert into misconception_states
          (id, learner_id, misconception_node_id, probability, evidence_count,
           last_evidence_at, created_at, updated_at)
        values
          (${clock.newId()}, ${event.learnerId}, ${misconception}, ${posterior}, ${1},
           ${when.toISOString()}, ${clock.now().toISOString()}, ${clock.now().toISOString()})
      `;
    } else {
      await sql`
        update misconception_states
        set probability = ${posterior},
            evidence_count = ${Number(state.evidence_count) + 1},
            last_evidence_at = ${when.toISOString()},
            updated_at = ${clock.now().toISOString()},
            version = version + 1
        where learner_id = ${event.learnerId} and misconception_node_id = ${misconception}
      `;
    }
    // research telemetry AFTER the state write (frozen publish-after-save):
    // the v2 BDT_UPDATED contract — prior/posterior + the evidence polarity.
    await writeTelemetry(
      sql,
      "BDT_UPDATED",
      event.learnerId,
      {
        misconceptionNodeId: misconception,
        prior,
        posterior,
        correctness: event.correct,
        updateKind: event.correct ? "CORRECT" : "TAGGED_DISTRACTOR",
        questionType: event.questionType,
        optionCount: event.optionCount,
      },
      when,
      clock,
    );
  }
}

/**
 * updateFluencyGaps (:180-203): Paper B §16 procedural fluency gap per
 * affected TOPIC node (deliberately topic-scoped even when the event carries
 * spec points — the fluency aggregate attributes attempts via the question's
 * primary topic, so per-point condition splits would always aggregate empty);
 * only EXISTING skill rows are touched (ifPresent); the gap = untimed accuracy
 * - timed accuracy over GRADED (evidence-fired) attempts, null until BOTH
 * conditions are observed. Derived metric — BKT mastery stays
 * condition-agnostic.
 */
async function updateFluencyGaps(
  sql: SqlFn,
  event: AssessmentEvidenceEvent,
  when: Date,
  clock: ModelUpdateClock,
): Promise<void> {
  // the topic-node list ONLY (frozen :181 iterates event.topicNodeIds — no
  // spec points): primary first, secondary deduped.
  const topicNodes: string[] = [];
  if (event.primaryTopicNodeId !== undefined && event.primaryTopicNodeId !== null) {
    topicNodes.push(event.primaryTopicNodeId);
  }
  for (const secondary of event.secondaryTopicNodeIds) {
    if (!topicNodes.includes(secondary)) topicNodes.push(secondary);
  }

  for (const node of topicNodes) {
    const existing = (await sql`
      select id from skill_states
      where learner_id = ${event.learnerId} and node_id = ${node}
    `);
    if (existing.length === 0) continue; // ifPresent — no row, no fluency write

    // AttemptRepository.aggregateGradedCorrectnessByCondition (native SQL
    // verbatim): graded = evidence_emitted TRUE; mappings = primary topic OR
    // question_topics; grouped by timed_condition.
    const rows = (await sql`
      select a.timed_condition as timed, count(*) as total,
             sum(case when a.correct then 1 else 0 end) as correct
      from attempts a
      join questions q on q.id = a.question_id
      where a.learner_id = ${event.learnerId}
        and a.evidence_emitted = true
        and (q.primary_topic_node_id = ${node} or exists (
              select 1 from question_topics qt
              where qt.question_id = q.id and qt.node_id = ${node}))
      group by a.timed_condition
    `) as unknown as Array<{ timed: boolean; total: string | number; correct: string | number }>;

    let timedAccuracy: number | null = null;
    let untimedAccuracy: number | null = null;
    for (const row of rows) {
      const total = Number(row.total);
      const correct = Number(row.correct);
      const accuracy = total === 0 ? 0.0 : correct / total;
      if (row.timed) timedAccuracy = accuracy;
      else untimedAccuracy = accuracy;
    }
    // frozen :197-198: null until both conditions observed (F-162).
    const gap =
      timedAccuracy === null || untimedAccuracy === null ? null : untimedAccuracy - timedAccuracy;
    await sql`
      update skill_states
      set procedural_fluency_gap = ${gap},
          updated_at = ${clock.now().toISOString()},
          version = version + 1
      where learner_id = ${event.learnerId} and node_id = ${node}
    `;
  }
}


