/**
 * T-MIG-033 tranche 1 — teacher marking services (frozen law @ 6cad6ef).
 *
 * Ports, constraint-for-constraint:
 *   - SmartMarkService.markAnswer (:87-171)      → TeacherSmartMarkService.markAnswer
 *     (the per-answer topology 032 did NOT port — 032's markAttempt is the
 *     batched learner half; the teacher queue is serial per answer. Same
 *     serialization point: the attempt row lock is taken BEFORE any state
 *     load, so a kappa-released smart mark racing a human mark re-reads the
 *     winner's committed state instead of a stale evidenceEmitted flag.)
 *   - TeacherMarkingService (:84-216)            → TeacherMarkingService
 *     (recordHumanMark lock-first evidence law + evaluateAgreement kappa
 *     pairing; KappaAgreementService.cohenKappa ported as a pure function).
 *   - TeacherMarkingQueueService (:50-494)       → TeacherMarkingQueueService
 *     (deterministic section-7 ordering, batched read models, honest counts,
 *     bounded smart-mark batch, G-5 opt-in pagination).
 *   - TeacherViews + controller records          → the view types below
 *     (frozen record component names are the DTO-boundary law).
 *
 * Cross-slice contract (recorded in T-MIG-032's yaml): this module IMPORTS
 * the shared pipeline from services/smartmark — SmartMarkPipeline.run,
 * toMarkingPoint, PIPELINE_VERSION, SmartMarkService.kappaGatePassed
 * (composition, never a fork; the kappa gate law lives once). Zero edits to
 * services/smartmark.
 *
 * Spring application events (HumanMarkRecordedEvent / SmartMarkCompletedEvent)
 * stay DORMANT-disclosed per the 032 posture: the port has no event bus; the
 * evidence contract itself is live through the GradedEvidencePublisher seam
 * (E-1 claim + guarded flip, T-MIG-030's binding).
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists inline as static template text. Multi-id lookups
 * use the fleet's `= any(${ids}::uuid[])` convention.
 */
import type { SqlFn } from "../assessment/sql";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  type GradedEvidencePublisher,
  type SubmitClock,
} from "../selfmark";
import {
  PIPELINE_VERSION,
  SmartMarkPipeline,
  SmartMarkService,
  toMarkingPoint,
  type Decision,
  type MarkingCandidateGenerator,
  type MarkingContext,
  type SmartMarkResultRow,
} from "../smartmark";

// ── frozen constants (TeacherMarkingController :89-91, QueueService :56/:95-97) ──

export const DEFAULT_ANSWER_PAGE_SIZE = 50;
export const MAX_ANSWER_PAGE_SIZE = 200;
export const DEFAULT_PAPER_GROUPS_PER_PAGE = 5;
export const MAX_PAPER_GROUPS_PER_PAGE = 100;
export const SMART_MARK_BATCH_LIMIT = 50;
/** SmartMarkAgreementEvaluation.DEFAULT_THRESHOLD (0.60). */
export const KAPPA_DEFAULT_THRESHOLD = 0.6;
export const SCOPE_ALL = "ALL";
export const SCOPE_PAPER = "PAPER";
/**
 * Answer.MarkingState.values() — the throughput overview zeroes every state.
 * FIVE values per frozen Answer.java:34 = { PENDING, SMART_MARKED,
 * HUMAN_MARKED, OVERRIDDEN, SELF_MARKED } (F-33-1 fix, R0-executed on
 * R0-ROUND-6C merge authority — the missing SELF_MARKED zero-filled the
 * throughput shape wrong and 400'd a legal queue filter). The C-9 error
 * MESSAGE at parseMarkingState keeps the frozen 4-state enumeration quirk
 * verbatim — the accepted-set is what changes, not the message.
 */
export const MARKING_STATES = ["PENDING", "SMART_MARKED", "HUMAN_MARKED", "OVERRIDDEN", "SELF_MARKED"] as const;

// ── row shapes (snake_case, as the sql adapter returns them) ────────────────

/** findWithPartAndAttempt graph (EntityGraph questionPart, attempt, attempt.question). */
interface MarkingAnswerRow {
  id: string;
  attempt_id: string;
  learner_id: string;
  attempt_created_at: string;
  evidence_emitted: boolean;
  question_id: string;
  external_ref: string | null;
  exam_paper_id: string | null;
  question_marks: number;
  question_part_id: string;
  label: string;
  prompt: string;
  part_marks: number;
  answer_text: string;
  marking_state: string;
  marks_awarded: number | null;
}

interface AttemptLockRow {
  id: string;
  learner_id: string;
  question_id: string;
  marking_state: string;
  evidence_emitted: boolean;
}

/** findByAttemptIdOrderByQuestionPartId / recompute re-read (state + marks only). */
interface AttemptAnswerStateRow {
  id: string;
  marks_awarded: number | null;
  marking_state: string;
}

interface SmartRunRow {
  id: string;
  answer_id: string;
  pipeline_version: string;
  model_id: string | null;
  marks_awarded: number;
  confidence: number | null;
  validation_passed: boolean;
  breakdown: unknown;
  failure_reason: string | null;
  created_at: string;
}

interface HumanMarkRow {
  id: string;
  answer_id: string;
  marker_id: string;
  marks_awarded: number;
  per_point_decisions: Record<string, number> | null;
  comments: string | null;
  created_at: string;
}

interface PaperRow {
  id: string;
  title: string | null;
  session_label: string | null;
  paper_code: string | null;
}

interface UserNameRow {
  id: string;
  display_name: string;
}

interface StateCountRow {
  marking_state: string;
  count: number | string;
}

interface CountRow {
  count: number | string;
}

// ── views (frozen record component names — the DTO-boundary law) ────────────

export interface SmartMarkView {
  id: string;
  pipelineVersion: string;
  modelId: string | null;
  marksAwarded: number;
  confidence: number | null;
  validationPassed: boolean;
  failureReason: string | null;
  breakdown: unknown;
  createdAt: string;
}

export interface HumanMarkView {
  id: string;
  markerId: string;
  marksAwarded: number;
  perPointDecisions: Record<string, number> | null;
  comments: string | null;
  createdAt: string;
}

/** TeacherViews.AnswerMarkingView — the queue read model row. */
export interface AnswerMarkingView {
  answerId: string;
  attemptId: string;
  learnerId: string;
  learnerDisplayName: string | null;
  questionId: string;
  questionExternalRef: string | null;
  partLabel: string;
  partPrompt: string;
  partMarks: number;
  answerText: string;
  markingState: string;
  marksAwarded: number | null;
  latestSmartMark: SmartMarkView | null;
  latestHumanMark: HumanMarkView | null;
  examPaperId: string | null;
  paperTitle: string | null;
}

/** TeacherViews.AnswerMarkingPageView — G-5 opt-in envelope (database counts). */
export interface AnswerMarkingPageView {
  items: AnswerMarkingView[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** QueueService.MarkingGroupView — one paper group (the reviewer's unit). */
export interface MarkingGroupView {
  paperId: string | null;
  paperTitle: string | null;
  sessionLabel: string | null;
  paperCode: string | null;
  count: number;
  oldestPendingAt: string;
  oldestWaitingHours: number | null;
}

/** QueueService.MarkingQueueItem — the marking view + paper context + next link. */
export interface MarkingQueueItem {
  answer: AnswerMarkingView;
  paperId: string | null;
  paperTitle: string | null;
  sessionLabel: string | null;
  paperCode: string | null;
  evidenceEmitted: boolean;
  nextAnswerId: string | null;
}

export interface MarkingQueueView {
  state: string;
  groups: MarkingGroupView[];
  items: MarkingQueueItem[];
}

/** QueueService.MarkingQueuePageView — whole paper groups per page, honest totals. */
export interface MarkingQueuePageView {
  state: string;
  groups: MarkingGroupView[];
  items: MarkingQueueItem[];
  page: number;
  size: number;
  totalGroups: number;
  totalItems: number;
  totalPages: number;
}

/** QueueService.ThroughputView — counts of what happened, never estimates. */
export interface ThroughputView {
  answersByState: Record<string, number>;
  humanMarks24h: number;
  humanMarks7d: number;
  pendingByPaper: PendingPaperView[];
  oldestPendingAt: string | null;
  oldestPendingHours: number | null;
}

export interface PendingPaperView {
  paperId: string | null;
  paperTitle: string | null;
  paperCode: string | null;
  pending: number;
}

export interface SmartMarkBatchItem {
  answerId: string;
  outcome: "MARKED" | "SKIPPED_ALREADY_MARKED" | "FAILED";
  marksAwarded: number | null;
  reason: string | null;
}

export interface SmartMarkBatchView {
  requested: number;
  marked: number;
  skipped: number;
  failed: number;
  items: SmartMarkBatchItem[];
}

/** Controller record KappaEvaluationView (:318-327). */
export interface KappaEvaluationView {
  id: string;
  scope: string;
  paperId: string | null;
  sampleSize: number;
  kappa: number;
  observedAgreement: number;
  threshold: number;
  passed: boolean;
  computedAt: string;
}

// ── KappaAgreementService port (pure domain law, :22-64) ────────────────────

export interface KappaStats {
  kappa: number;
  observedAgreement: number;
  sampleSize: number;
}

/**
 * Cohen's kappa over paired binary mark-point decisions [smart, human].
 * Degenerate convention (documented at :54-56): chance agreement total →
 * perfect agreement = 1, any disagreement = 0. Binary/length validation
 * precedes element access, exactly as the frozen law orders it.
 */
export function cohenKappa(pairs: Array<[number, number]>): KappaStats {
  if (pairs.length === 0) {
    throw new Error("kappa requires at least one paired decision");
  }
  const n = pairs.length;
  let smartYes = 0;
  let humanYes = 0;
  let bothYes = 0;
  let bothNo = 0;
  for (const pair of pairs) {
    if (pair.length !== 2) {
      throw new Error("decisions must be binary 0/1 pairs");
    }
    const smart = pair[0]!;
    const human = pair[1]!;
    if ((smart !== 0 && smart !== 1) || (human !== 0 && human !== 1)) {
      throw new Error("decisions must be binary 0/1 pairs");
    }
    if (smart === 1) smartYes++;
    if (human === 1) humanYes++;
    if (smart === 1 && human === 1) bothYes++;
    if (smart === 0 && human === 0) bothNo++;
  }
  const observed = (bothYes + bothNo) / n;
  const pSmartYes = smartYes / n;
  const pHumanYes = humanYes / n;
  const expected = pSmartYes * pHumanYes + (1 - pSmartYes) * (1 - pHumanYes);
  let kappa: number;
  if (expected >= 1.0 - 1e-12) {
    kappa = observed >= 1.0 - 1e-12 ? 1.0 : 0.0;
  } else {
    kappa = (observed - expected) / (1.0 - expected);
  }
  return { kappa, observedAgreement: observed, sampleSize: n };
}

// ── shared helpers ───────────────────────────────────────────────────────────

/**
 * C-9 law (controller :178-187): an unknown marking-state filter is a
 * malformed request (400), never a 404 — 404 is reserved for real lookups.
 */
export function parseMarkingState(state: string): string {
  const upper = state.toUpperCase();
  if (!(MARKING_STATES as readonly string[]).includes(upper)) {
    throw new BadRequestError(
      "unknown marking state: " + state +
        " (expected PENDING, SMART_MARKED, HUMAN_MARKED or OVERRIDDEN)");
  }
  return upper;
}

function smartMarkView(run: SmartRunRow | null): SmartMarkView | null {
  if (run === null) return null;
  return {
    id: run.id,
    // N-2 executed: the STORED run version renders — never the current-code
    // constant (a run made under an older pipeline displays its own version;
    // the constant is write-side only, on the INSERT paths)
    pipelineVersion: run.pipeline_version,
    modelId: run.model_id,
    marksAwarded: run.marks_awarded,
    confidence: run.confidence,
    validationPassed: run.validation_passed,
    failureReason: run.failure_reason,
    breakdown: normalizeBreakdown(run.breakdown),
    createdAt: run.created_at,
  };
}

function humanMarkView(mark: HumanMarkRow | null): HumanMarkView | null {
  if (mark === null) return null;
  return {
    id: mark.id,
    markerId: mark.marker_id,
    marksAwarded: mark.marks_awarded,
    perPointDecisions: mark.per_point_decisions,
    comments: mark.comments,
    createdAt: mark.created_at,
  };
}

/** jsonb arrives parsed from both live drivers and the stub; tolerate strings. */
function normalizeBreakdown(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** TeacherViews.answer — the full builder (:99-111). All nullable inputs render honestly. */
function answerMarkingView(
  a: MarkingAnswerRow,
  learnerDisplayName: string | null,
  smart: SmartRunRow | null,
  human: HumanMarkRow | null,
  paperTitle: string | null,
): AnswerMarkingView {
  return {
    answerId: a.id,
    attemptId: a.attempt_id,
    learnerId: a.learner_id,
    learnerDisplayName,
    questionId: a.question_id,
    questionExternalRef: a.external_ref,
    partLabel: a.label,
    partPrompt: a.prompt,
    partMarks: a.part_marks,
    answerText: a.answer_text,
    markingState: a.marking_state,
    marksAwarded: a.marks_awarded,
    latestSmartMark: smartMarkView(smart),
    latestHumanMark: humanMarkView(human),
    examPaperId: a.exam_paper_id,
    paperTitle,
  };
}

/**
 * Duration.toHours() truncates toward zero; frozen guards negative ages by
 * returning null when the timestamp is in the future (:254, :328-330).
 */
function waitingHours(oldestAt: Date, now: Date): number | null {
  if (oldestAt.getTime() > now.getTime()) return null;
  return Math.floor((now.getTime() - oldestAt.getTime()) / 3_600_000);
}

/**
 * The mark→next chain over the ordered items (:144-151): null on the last
 * item; the paged queue re-chains inside the page (a next link pointing
 * off-page would break the one-paper contract, :102-104).
 */
function chainNext(items: MarkingQueueItem[]): MarkingQueueItem[] {
  const out = items.map((i) => ({ ...i }));
  for (let i = 0; i < out.length; i++) {
    out[i]!.nextAnswerId = i + 1 < out.length ? out[i + 1]!.answer.answerId : null;
  }
  return out;
}

// ── per-answer Smart Mark topology (frozen SmartMarkService.markAnswer) ─────

/**
 * The findWithPartAndAttempt graph (EntityGraph questionPart, attempt,
 * attempt.question) as inline SQL — inlined at every site per the fleet
 * bind-slot discipline (a ${} slot is a parameter, never SQL text).
 */

export class TeacherSmartMarkService {
  private readonly pipeline: SmartMarkPipeline;

  constructor(
    private readonly sql: SqlFn,
    generator: MarkingCandidateGenerator,
    /**
     * The 032 shared engine — composed ONLY for kappaGatePassed so the gate
     * law (newest ALL-scope eval OR the paper-scoped one, fail-closed)
     * lives exactly once (cross-slice contract, T-MIG-032 yaml).
     */
    private readonly shared: SmartMarkService,
    private readonly publisher: GradedEvidencePublisher,
    private readonly clock: SubmitClock,
  ) {
    this.pipeline = new SmartMarkPipeline(generator);
  }

  /**
   * markAnswer (:87-171): one answer through the pipeline; append-only
   * result row; provisional marks applied; evidence only when accepted AND
   * kappa-released AND the attempt's marking is COMPLETE (no PENDING part).
   */
  async markAnswer(answerId: string): Promise<SmartMarkResultRow> {
    // serialization point FIRST (:95-98) — the lock precedes every state load
    const attemptIdRows = (await this.sql`
      select a.attempt_id from answers a where a.id = ${answerId}
    `) as unknown as Array<{ attempt_id: string }>;
    if (attemptIdRows.length === 0) throw new NotFoundError("answer", answerId);
    const attemptId = attemptIdRows[0]!.attempt_id;
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId} for update
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    const answerRows = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.id = ${answerId}
    `) as unknown as MarkingAnswerRow[];
    if (answerRows.length === 0) throw new NotFoundError("answer", answerId);
    const answer = answerRows[0]!;

    const versionRows = (await this.sql`
      select id from question_versions where question_id = ${answer.question_id}
      order by version desc
    `) as unknown as Array<{ id: string }>;
    if (versionRows.length === 0) {
      throw new NotFoundError("question version", answer.question_id);
    }
    const versionId = versionRows[0]!.id;

    // newest VALIDATED scheme backs marking (V34); none → honest refusal
    const validatedRows = (await this.sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${versionId} and validation_state = ${"VALIDATED"}
      order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (validatedRows.length === 0) {
      return this.refuseUnvalidatedScheme(answer, versionId);
    }
    const scheme = validatedRows[0]!;

    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_scheme_points where mark_scheme_id = ${scheme.id} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const context: MarkingContext = {
      answer: {
        id: answer.id,
        attemptId,
        questionPartId: answer.question_part_id,
        answerText: answer.answer_text,
        label: answer.label,
        partMarks: answer.part_marks,
      },
      schemeId: scheme.id,
      schemeValidationState: scheme.validation_state,
      points: pointRows
        .map(toMarkingPoint)
        .filter((p) => p.questionPartId === answer.question_part_id),
    };
    const decision: Decision = await this.pipeline.run(context);

    const resultId = this.clock.newId();
    await this.sql`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${PIPELINE_VERSION}, ${decision.candidate?.modelId ?? null},
        ${decision.marksAwarded}, ${decision.candidate?.confidence ?? null}, ${decision.accepted},
        ${JSON.stringify(decision.breakdown)}, ${decision.failureReason}, ${scheme.id},
        ${scheme.validation_state}, ${decision.candidate?.rawOutput ?? null}, ${this.clock.now().toISOString()})
    `;
    const resultRow: SmartMarkResultRow = {
      id: resultId,
      answer_id: answer.id,
      model_id: decision.candidate?.modelId ?? null,
      marks_awarded: decision.marksAwarded,
      confidence: decision.candidate?.confidence ?? null,
      validation_passed: decision.accepted,
      breakdown: decision.breakdown,
      failure_reason: decision.failureReason,
    };

    if (decision.accepted) {
      // provisional mark application (:135-138)
      await this.sql`
        update answers set marks_awarded = ${decision.marksAwarded}, marking_state = ${"SMART_MARKED"}
        where id = ${answer.id}
      `;
      await this.sql`
        update attempts set marking_state = ${"SMART_MARKED"} where id = ${attemptId}
      `;
      const total = await this.recomputeAttemptTotal(attemptId, answer.question_marks);
      const authoritative = await this.shared.kappaGatePassed(answer.exam_paper_id);
      if (authoritative) {
        // evidence only when the attempt's marking is COMPLETE (:145-157);
        // re-read mirrors findByAttemptIdOrderByQuestionPartId (the frozen
        // completeness check re-reads the attempt's answers after the write)
        const stillPending = (await this.sql`
          select id, marks_awarded, marking_state from answers
          where attempt_id = ${attemptId} order by question_part_id
        `) as unknown as AttemptAnswerStateRow[];
        if (!stillPending.some((a) => a.marking_state === "PENDING")) {
          // publishGraded receives the ATTEMPT — its payload carries the
          // recomputed total, not the single answer's marks (:150)
          await this.fireEvidence(attempt, answer, total);
        }
      }
    }
    return resultRow;
  }

  /** V34 honest refusal (:106-127): newest scheme stamped, nothing marked. */
  private async refuseUnvalidatedScheme(
    answer: MarkingAnswerRow,
    questionVersionId: string,
  ): Promise<SmartMarkResultRow> {
    const refusedRows = (await this.sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${questionVersionId} order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (refusedRows.length === 0) throw new NotFoundError("mark scheme", questionVersionId);
    const refused = refusedRows[0]!;
    const resultId = this.clock.newId();
    await this.sql`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${PIPELINE_VERSION}, ${null}, ${0}, ${null}, ${false},
        ${JSON.stringify([])}, ${"SCHEME_NOT_VALIDATED"}, ${refused.id},
        ${refused.validation_state}, ${null}, ${this.clock.now().toISOString()})
    `;
    return {
      id: resultId,
      answer_id: answer.id,
      model_id: null,
      marks_awarded: 0,
      confidence: null,
      validation_passed: false,
      breakdown: [],
      failure_reason: "SCHEME_NOT_VALIDATED",
    };
  }

  /**
   * recomputeAttemptTotal (:146-153): re-reads the attempt's answers AFTER
   * the state write, sums non-null marks, and applies recordTotalMarks law —
   * marks_awarded AND the correct flag (Attempt.java:153-156: correct only
   * when the total reaches the question's marks total).
   */
  private async recomputeAttemptTotal(
    attemptId: string,
    questionMarks: number,
  ): Promise<number> {
    const rows = (await this.sql`
      select id, marks_awarded, marking_state from answers
      where attempt_id = ${attemptId} order by question_part_id
    `) as unknown as AttemptAnswerStateRow[];
    const total = rows
      .map((r) => r.marks_awarded)
      .filter((m): m is number => m !== null)
      .reduce((s, m) => s + m, 0);
    await this.sql`
      update attempts set marks_awarded = ${total}, correct = ${questionMarks > 0 && total >= questionMarks}
      where id = ${attemptId}
    `;
    return total;
  }

  /** E-1 claim + guarded flip (T-MIG-030's binding; Attempt.java:158-161). */
  private async fireEvidence(
    attempt: AttemptLockRow,
    answer: MarkingAnswerRow,
    marksAwarded: number,
  ): Promise<void> {
    const secondary = (await this.sql`
      select node_id from question_topics where question_id = ${attempt.question_id}
    `) as unknown as Array<{ node_id: string }>;
    const fired = await this.publisher.publishGraded({
      attemptId: attempt.id,
      learnerId: attempt.learner_id,
      questionId: attempt.question_id,
      marksAwarded,
      marksTotal: answer.question_marks,
      correct: answer.question_marks > 0 && marksAwarded >= answer.question_marks,
      secondaryTopicNodeIds: secondary.map((r) => String(r.node_id)),
      occurredAt: this.clock.now().toISOString(),
    });
    if (fired) {
      await this.sql`
        update attempts set evidence_emitted = true
        where id = ${attempt.id} and evidence_emitted = false
      `;
    }
  }
}

// ── TeacherMarkingService port (:44-216) ─────────────────────────────────────

export class TeacherMarkingService {
  constructor(
    private readonly sql: SqlFn,
    private readonly publisher: GradedEvidencePublisher,
    private readonly clock: SubmitClock,
  ) {}

  /**
   * recordHumanMark (:85-150): human marks are the authoritative grade.
   * Lock-first evidence law (the :87-98 concurrency fix), part-bound 409,
   * revising = attempt.evidenceEmitted → OVERRIDDEN vs HUMAN_MARKED, total
   * recompute, evidence only on the FIRST authoritative mark that COMPLETES
   * the attempt's marking.
   */
  async recordHumanMark(
    answerId: string,
    markerId: string,
    marksAwarded: number,
    perPointDecisions: Record<string, number> | null,
    comments: string | null,
  ): Promise<HumanMarkView> {
    // serialization point FIRST (:95-98) — same law as markAnswer
    const attemptIdRows = (await this.sql`
      select a.attempt_id from answers a where a.id = ${answerId}
    `) as unknown as Array<{ attempt_id: string }>;
    if (attemptIdRows.length === 0) throw new NotFoundError("answer", answerId);
    const attemptId = attemptIdRows[0]!.attempt_id;
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId} for update
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    const answerRows = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.id = ${answerId}
    `) as unknown as MarkingAnswerRow[];
    if (answerRows.length === 0) throw new NotFoundError("answer", answerId);
    const answer = answerRows[0]!;

    const bound = Math.max(answer.part_marks, 0);
    if (marksAwarded < 0 || (bound > 0 && marksAwarded > bound)) {
      throw new ConflictError("marks " + marksAwarded + " outside part bound 0–" + bound);
    }

    // an override revises marks; it never re-fires evidence (:111)
    const revising = attempt.evidence_emitted;
    const answerState = revising ? "OVERRIDDEN" : "HUMAN_MARKED";
    await this.sql`
      update answers set marks_awarded = ${marksAwarded}, marking_state = ${answerState}
      where id = ${answer.id}
    `;
    await this.sql`
      update attempts set marking_state = ${revising ? "OVERRIDDEN" : "HUMAN_MARKED"}
      where id = ${attemptId}
    `;

    // total recompute on the post-write re-read (:121-125)
    const attemptAnswers = (await this.sql`
      select id, marks_awarded, marking_state from answers
      where attempt_id = ${attemptId} order by question_part_id
    `) as unknown as AttemptAnswerStateRow[];
    const total = attemptAnswers
      .map((r) => r.marks_awarded)
      .filter((m): m is number => m !== null)
      .reduce((s, m) => s + m, 0);
    await this.sql`
      update attempts set marks_awarded = ${total}, correct = ${answer.question_marks > 0 && total >= answer.question_marks}
      where id = ${attemptId}
    `;

    // fire once, at the mark that COMPLETES the attempt's marking (:127-140)
    if (!revising && !attemptAnswers.some((a) => a.marking_state === "PENDING")) {
      await this.fireEvidence(attempt, answer, total);
    }

    const markId = this.clock.newId();
    const createdAt = this.clock.now().toISOString();
    await this.sql`
      insert into human_marks (id, answer_id, marker_id, marks_awarded,
        per_point_decisions, comments, created_at)
      values (${markId}, ${answer.id}, ${markerId}, ${marksAwarded},
        ${perPointDecisions === null ? null : JSON.stringify(perPointDecisions)},
        ${comments}, ${createdAt})
    `;
    return {
      id: markId,
      markerId,
      marksAwarded,
      perPointDecisions,
      comments,
      createdAt,
    };
  }

  /** E-1 claim + guarded flip — the same seam contract as the smart path. */
  private async fireEvidence(
    attempt: AttemptLockRow,
    answer: MarkingAnswerRow,
    marksAwarded: number,
  ): Promise<void> {
    const secondary = (await this.sql`
      select node_id from question_topics where question_id = ${attempt.question_id}
    `) as unknown as Array<{ node_id: string }>;
    const fired = await this.publisher.publishGraded({
      attemptId: attempt.id,
      learnerId: attempt.learner_id,
      questionId: attempt.question_id,
      marksAwarded,
      marksTotal: answer.question_marks,
      correct: answer.question_marks > 0 && marksAwarded >= answer.question_marks,
      secondaryTopicNodeIds: secondary.map((r) => String(r.node_id)),
      occurredAt: this.clock.now().toISOString(),
    });
    if (fired) {
      await this.sql`
        update attempts set evidence_emitted = true
        where id = ${attempt.id} and evidence_emitted = false
      `;
    }
  }

  /**
   * evaluateAgreement (:160-212): paired per-mark-point decisions between
   * the newest smart run (findLatest THEN validationPassed filter — never
   * newest-VALIDATED) and the human mark, Cohen's kappa, persisted with the
   * threshold so the release decision is auditable.
   */
  async evaluateAgreement(
    examPaperId: string | null,
    computedBy: string,
  ): Promise<KappaEvaluationView> {
    const humanSample: HumanMarkRow[] =
      examPaperId === null
        ? ((await this.sql`
            select id, answer_id, marker_id, marks_awarded, per_point_decisions,
                   comments, created_at
            from human_marks order by created_at asc
          `) as unknown as HumanMarkRow[])
        : ((await this.sql`
            select h.id, h.answer_id, h.marker_id, h.marks_awarded, h.per_point_decisions,
                   h.comments, h.created_at
            from human_marks h
            join answers ans on ans.id = h.answer_id
            join attempts at on at.id = ans.attempt_id
            join questions q on q.id = at.question_id
            where q.exam_paper_id = ${examPaperId}
            order by h.created_at asc
          `) as unknown as HumanMarkRow[]);

    const pairs: Array<[number, number]> = [];
    for (const mark of humanSample) {
      if (mark.per_point_decisions === null || Object.keys(mark.per_point_decisions).length === 0) {
        continue; // cannot pair without point-level decisions (documented)
      }
      // newest run first, THEN the validation filter (:170-172)
      const smartRows = (await this.sql`
        select id, answer_id, model_id, marks_awarded, confidence, validation_passed,
               breakdown, failure_reason, created_at
        from smart_mark_results where answer_id = ${mark.answer_id}
        order by created_at desc limit 1
      `) as unknown as SmartRunRow[];
      const smart = smartRows[0];
      if (!smart || !smart.validation_passed) continue;
      const breakdown = normalizeBreakdown(smart.breakdown) as
        | Array<Record<string, unknown>>
        | null;
      if (!Array.isArray(breakdown)) continue;
      const smartDecisions = new Map<string, number>();
      for (const entry of breakdown) {
        const pointId = entry["markPointId"];
        const awarded = entry["awarded"];
        if (pointId != null && typeof awarded === "boolean") {
          smartDecisions.set(String(pointId), awarded ? 1 : 0);
        }
      }
      for (const [pointId, humanDecision] of Object.entries(mark.per_point_decisions)) {
        const smartDecision = smartDecisions.get(pointId);
        if (smartDecision !== undefined) {
          pairs.push([smartDecision, humanDecision !== 0 ? 1 : 0]);
        }
      }
    }
    if (pairs.length === 0) {
      throw new ConflictError(
        "no paired smart/human mark-point decisions available for κ evaluation");
    }

    const stats = cohenKappa(pairs);
    const evaluationId = this.clock.newId();
    const scope = examPaperId === null ? SCOPE_ALL : SCOPE_PAPER;
    const passed = stats.kappa >= KAPPA_DEFAULT_THRESHOLD;
    const computedAt = this.clock.now().toISOString();
    await this.sql`
      insert into smart_mark_agreement_evaluations (id, scope, exam_paper_id,
        sample_size, kappa, observed_agreement, threshold, passed, computed_at, computed_by)
      values (${evaluationId}, ${scope}, ${examPaperId}, ${stats.sampleSize},
        ${stats.kappa}, ${stats.observedAgreement}, ${KAPPA_DEFAULT_THRESHOLD},
        ${passed}, ${computedAt}, ${computedBy})
    `;
    return {
      id: evaluationId,
      scope,
      paperId: examPaperId,
      sampleSize: stats.sampleSize,
      kappa: stats.kappa,
      observedAgreement: stats.observedAgreement,
      threshold: KAPPA_DEFAULT_THRESHOLD,
      passed,
      computedAt,
    };
  }

  /**
   * T-MIG-033 tranche-2 — kappa/latest read (:282-293): the newest evaluation
   * for the scope (ALL when paperId null, else PAPER + paper). findFirst…OrderBy
   * ComputedAtDesc parity; id-desc tie-break added for determinism (disclosed
   * read-model choice, the compareWithinPaper string-lexicographic class).
   */
  async latestEvaluation(paperId: string | null): Promise<KappaEvaluationView | null> {
    const rows =
      paperId === null
        ? ((await this.sql`
            select id, scope, exam_paper_id, sample_size, kappa, observed_agreement,
                   threshold, passed, computed_at
            from smart_mark_agreement_evaluations
            where scope = ${SCOPE_ALL}
            order by computed_at desc, id desc
            limit 1
          `) as unknown as Array<{
            id: string; scope: string; exam_paper_id: string | null; sample_size: number;
            kappa: number; observed_agreement: number; threshold: number; passed: boolean;
            computed_at: string;
          }>)
        : ((await this.sql`
            select id, scope, exam_paper_id, sample_size, kappa, observed_agreement,
                   threshold, passed, computed_at
            from smart_mark_agreement_evaluations
            where scope = ${SCOPE_PAPER} and exam_paper_id = ${paperId}
            order by computed_at desc, id desc
            limit 1
          `) as unknown as Array<{
            id: string; scope: string; exam_paper_id: string | null; sample_size: number;
            kappa: number; observed_agreement: number; threshold: number; passed: boolean;
            computed_at: string;
          }>);
    const e = rows[0];
    if (!e) return null;
    return {
      id: e.id,
      scope: e.scope,
      paperId: e.exam_paper_id,
      sampleSize: e.sample_size,
      kappa: e.kappa,
      observedAgreement: e.observed_agreement,
      threshold: e.threshold,
      passed: e.passed,
      computedAt: e.computed_at,
    };
  }
}

// ── TeacherMarkingQueueService port (:51-494) ────────────────────────────────

interface Assembled {
  groupViews: MarkingGroupView[];
  itemsByGroup: MarkingQueueItem[][];
}

export class TeacherMarkingQueueService {
  constructor(
    private readonly sql: SqlFn,
    private readonly smartMark: TeacherSmartMarkService,
    private readonly clock: SubmitClock,
  ) {}

  /** markingQueue (:86-92): the full v2 queue with the mark→next chain. */
  async markingQueue(state: string): Promise<MarkingQueueView> {
    const assembled = await this.assemble(state);
    const items = chainNext(assembled.itemsByGroup.flat());
    return { state, groups: assembled.groupViews, items };
  }

  /**
   * Opt-in paged v2 queue (:109-142): pages of WHOLE paper groups — papers
   * never split across a boundary; bounds page >= 0, 1..100 papers per page
   * default 5; past-the-end is an honestly empty page, not an error; totals
   * are the real counts of the whole state.
   */
  async markingQueuePaged(
    state: string,
    page: number | null,
    size: number | null,
  ): Promise<MarkingQueueView | MarkingQueuePageView> {
    if (page === null && size === null) return this.markingQueue(state);
    const p = page === null ? 0 : page;
    const s = size === null ? DEFAULT_PAPER_GROUPS_PER_PAGE : size;
    if (p < 0) throw new BadRequestError("page must be >= 0");
    if (s < 1 || s > MAX_PAPER_GROUPS_PER_PAGE) {
      throw new BadRequestError(
        "size must be between 1 and " + MAX_PAPER_GROUPS_PER_PAGE + " (paper groups per page)");
    }
    const assembled = await this.assemble(state);
    const totalGroups = assembled.groupViews.length;
    const totalItems = assembled.itemsByGroup.reduce((sum, g) => sum + g.length, 0);
    const totalPages = totalGroups === 0 ? 0 : Math.floor((totalGroups + s - 1) / s);
    if (p >= totalPages) {
      return {
        state, groups: [], items: [],
        page: p, size: s, totalGroups, totalItems, totalPages,
      };
    }
    const fromGroup = p * s;
    const toGroup = Math.min(fromGroup + s, totalGroups);
    const groups = assembled.groupViews.slice(fromGroup, toGroup);
    const items = chainNext(assembled.itemsByGroup.slice(fromGroup, toGroup).flat());
    return { state, groups, items, page: p, size: s, totalGroups, totalItems, totalPages };
  }

  /**
   * The shared assembly (:166-263): one queue query + one paper lookup + one
   * smart-mark lookup + one human-mark lookup + one identity lookup;
   * deterministic group ordering (oldest-waiting paper first, then more
   * pending, then id — unfiled LAST); deterministic within-paper order.
   */
  private async assemble(state: string): Promise<Assembled> {
    const queue = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.marking_state = ${state}
      order by ans.created_at asc
    `) as unknown as MarkingAnswerRow[];
    if (queue.length === 0) return { groupViews: [], itemsByGroup: [] };

    // paper context in one lookup; question-bank answers carry NO paper by
    // design — nulls filtered before the lookup, the unfiled bucket renders
    // paper == null honestly (:172-184, :238-245)
    const paperIds = [...new Set(queue.map((a) => a.exam_paper_id).filter((v): v is string => v !== null))];
    const papers = new Map<string, PaperRow>();
    if (paperIds.length > 0) {
      const paperRows = (await this.sql`
        select id, title, session_label, paper_code from exam_papers
        where id = any(${paperIds}::uuid[])
      `) as unknown as PaperRow[];
      for (const p of paperRows) papers.set(p.id, p);
    }

    // newest smart run per answer: oldest-first overwrite (:186-191)
    const answerIds = queue.map((a) => a.id);
    const latestSmart = new Map<string, SmartRunRow>();
    const smartRuns = (await this.sql`
      select id, answer_id, pipeline_version, model_id, marks_awarded, confidence,
             validation_passed, breakdown, failure_reason, created_at
      from smart_mark_results where answer_id = any(${answerIds}::uuid[])
      order by created_at asc
    `) as unknown as SmartRunRow[];
    for (const run of smartRuns) latestSmart.set(run.answer_id, run);

    // newest human mark per answer: oldest-first overwrite (:193-199)
    const latestHuman = new Map<string, HumanMarkRow>();
    const humanRuns = (await this.sql`
      select id, answer_id, marker_id, marks_awarded, per_point_decisions,
             comments, created_at
      from human_marks where answer_id = any(${answerIds}::uuid[])
      order by created_at asc
    `) as unknown as HumanMarkRow[];
    for (const mark of humanRuns) latestHuman.set(mark.answer_id, mark);

    // learner display names, first-wins on duplicates (:309-316 toMap merge (a,b)->a)
    const learnerIds = [...new Set(queue.map((a) => a.learner_id))];
    const names = new Map<string, string>();
    if (learnerIds.length > 0) {
      const userRows = (await this.sql`
        select id, display_name from users where id = any(${learnerIds}::uuid[])
      `) as unknown as UserNameRow[];
      for (const u of userRows) if (!names.has(u.id)) names.set(u.id, u.display_name);
    }

    // group by paper, first-seen order, then re-sorted deterministically
    const byPaper = new Map<string | null, MarkingAnswerRow[]>();
    for (const a of queue) {
      const key = a.exam_paper_id;
      const group = byPaper.get(key);
      if (group) group.push(a);
      else byPaper.set(key, [a]);
    }
    for (const group of byPaper.values()) group.sort(compareWithinPaper);

    const groups = [...byPaper.values()];
    const now = this.clock.now();
    groups.sort((g1, g2) => {
      const byOldest = Date.parse(g1[0]!.attempt_created_at) - Date.parse(g2[0]!.attempt_created_at);
      if (byOldest !== 0) return byOldest;
      const bySize = g2.length - g1.length;
      if (bySize !== 0) return bySize;
      // null-safe tie-break, unfiled group LAST (:225-231)
      const p1 = g1[0]!.exam_paper_id;
      const p2 = g2[0]!.exam_paper_id;
      if (p1 !== null && p2 !== null) return p1 < p2 ? -1 : p1 > p2 ? 1 : 0;
      if (p1 === null && p2 === null) return 0;
      return p1 === null ? 1 : -1;
    });

    const groupViews: MarkingGroupView[] = [];
    const itemsByGroup: MarkingQueueItem[][] = [];
    for (const group of groups) {
      const paperId = group[0]!.exam_paper_id;
      const paper = paperId === null ? null : papers.get(paperId) ?? null;
      const oldestAt = new Date(group[0]!.attempt_created_at);
      groupViews.push({
        paperId,
        paperTitle: paper?.title ?? null,
        sessionLabel: paper?.session_label ?? null,
        paperCode: paper?.paper_code ?? null,
        count: group.length,
        oldestPendingAt: group[0]!.attempt_created_at,
        oldestWaitingHours: waitingHours(oldestAt, now),
      });
      itemsByGroup.push(
        group.map((a) => this.item(a, paper, names, latestSmart, latestHuman)),
      );
    }
    return { groupViews, itemsByGroup };
  }

  /**
   * T-MIG-033 tranche-2 — the UNPAGED /answers list (controller queueList,
   * :102-113): the shape the web marking UI reads. One state query + one
   * batched identity lookup + one batched paper lookup; smart/human runs are
   * NOT loaded (TeacherViews.answer receives null, null — only the single
   * answer view :243-252 includes them). Java's findByMarkingState is a
   * derived query with NO OrderBy (database order); the port pins the
   * paged surface's TOTAL order (createdAt asc, id asc) for determinism —
   * disclosed read-model choice, same class as compareWithinPaper.
   */
  async answersList(state: string): Promise<AnswerMarkingView[]> {
    const rows = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.marking_state = ${state}
      order by ans.created_at asc, ans.id asc
    `) as unknown as MarkingAnswerRow[];
    if (rows.length === 0) return [];
    return this.viewsFor(rows);
  }

  /**
   * T-MIG-033 tranche-2 — the OPT-IN paged /answers (:148-176, G-5): the same
   * read model under the TOTAL order (createdAt asc, then id asc — stable
   * page boundaries), sliced by the DATABASE's own count, never an estimate
   * (Spring Data Page.getTotalElements/getTotalPages parity). Bounds live in
   * the ROUTE (Java validates in the controller :156-163) — page >= 0,
   * size 1..200 default 50.
   */
  async answersPaged(
    state: string,
    page: number,
    size: number,
  ): Promise<AnswerMarkingPageView> {
    const rows = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.marking_state = ${state}
      order by ans.created_at asc, ans.id asc
      limit ${size} offset ${page * size}
    `) as unknown as MarkingAnswerRow[];
    const countRows = (await this.sql`
      select count(*)::int as total from answers where marking_state = ${state}
    `) as unknown as Array<{ total: number }>;
    const totalElements = countRows[0]?.total ?? 0;
    const totalPages = totalElements === 0 ? 0 : Math.floor((totalElements + size - 1) / size);
    return {
      items: rows.length === 0 ? [] : await this.viewsFor(rows),
      page,
      size,
      totalElements,
      totalPages,
    };
  }

  /**
   * Shared read-model composition (controller :102-113 / :164-175): one
   * batched identity lookup (first-wins) + one batched paper lookup;
   * smart/human runs stay null on the list surfaces.
   */
  private async viewsFor(rows: MarkingAnswerRow[]): Promise<AnswerMarkingView[]> {
    const learnerIds = [...new Set(rows.map((a) => a.learner_id))];
    const names = new Map<string, string>();
    if (learnerIds.length > 0) {
      const userRows = (await this.sql`
        select id, display_name from users where id = any(${learnerIds}::uuid[])
      `) as unknown as UserNameRow[];
      for (const u of userRows) if (!names.has(u.id)) names.set(u.id, u.display_name);
    }
    // batched paper titles for the queue rows (:115-136); question-bank
    // answers carry NO paper by design — null key renders null title
    const paperIds = [...new Set(rows.map((a) => a.exam_paper_id).filter((v): v is string => v !== null))];
    const papers = new Map<string, PaperRow>();
    if (paperIds.length > 0) {
      const paperRows = (await this.sql`
        select id, title, session_label, paper_code from exam_papers
        where id = any(${paperIds}::uuid[])
      `) as unknown as PaperRow[];
      for (const p of paperRows) papers.set(p.id, p);
    }
    return rows.map((a) => {
      const paper = a.exam_paper_id === null ? null : papers.get(a.exam_paper_id) ?? null;
      return answerMarkingView(a, names.get(a.learner_id) ?? null, null, null, paper?.title ?? null);
    });
  }

  /**
   * T-MIG-033 tranche-2 — the rich single-answer view (:243-252): answer with
   * part + attempt, NEWEST smart run (findLatest), NEWEST human mark
   * (findLatest), one identity lookup. Null when the answer does not exist —
   * the route maps it to NotFound("answer", id) (404 is for real lookups).
   * findLatest parity: order created_at desc with the id-desc tie-break
   * (disclosed determinism, as above).
   *
   * R0 intake fix R-2 (fidelity vs TeacherViews.java :87-90): the controller
   * calls the FOUR-ARG TeacherViews.answer(answer, name, smart, human) here —
   * that overload delegates with paperTitle = null (:88 `answer(a,
   * learnerDisplayName, smart, human, null)`). examPaperId still renders
   * (it comes from the question row regardless), but the TITLE stays null on
   * this surface even when a paper row exists — Java does no paper lookup
   * here. The queued 5-arg list surfaces (:110-111/:171-172) keep their
   * batched titles.
   */
  async answerById(id: string): Promise<AnswerMarkingView | null> {
    const rows = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.id = ${id}
    `) as unknown as MarkingAnswerRow[];
    const a = rows[0];
    if (!a) return null;

    const smartRuns = (await this.sql`
      select id, answer_id, pipeline_version, model_id, marks_awarded, confidence,
             validation_passed, breakdown, failure_reason, created_at
      from smart_mark_results where answer_id = ${id}
      order by created_at desc, id desc limit 1
    `) as unknown as SmartRunRow[];
    const humanRuns = (await this.sql`
      select id, answer_id, marker_id, marks_awarded, per_point_decisions,
             comments, created_at
      from human_marks where answer_id = ${id}
      order by created_at desc, id desc limit 1
    `) as unknown as HumanMarkRow[];

    const userRows = (await this.sql`
      select id, display_name from users where id = ${a.learner_id}
    `) as unknown as UserNameRow[];

    // the 4-arg overload (:87-90): NO paper lookup, title renders null —
    // examPaperId (from the question row) still renders via the view builder
    return answerMarkingView(
      a,
      userRows[0]?.display_name ?? null,
      smartRuns[0] ?? null,
      humanRuns[0] ?? null,
      null,
    );
  }

  /** throughput (:270-331): workload by state, human windows, leaders, oldest age. */
  async throughput(): Promise<ThroughputView> {
    const byState: Record<string, number> = {};
    for (const s of MARKING_STATES) byState[s] = 0;
    const stateRows = (await this.sql`
      select marking_state, count(*) as count from answers group by marking_state
    `) as unknown as StateCountRow[];
    for (const row of stateRows) byState[row.marking_state] = Number(row.count);

    const now = this.clock.now();
    const countSince = async (hours: number): Promise<number> => {
      const rows = (await this.sql`
        select count(*) as count from human_marks where created_at >= ${new Date(now.getTime() - hours * 3_600_000).toISOString()}
      `) as unknown as CountRow[];
      return Number(rows[0]!.count);
    };
    const human24h = await countSince(24);
    const human7d = await countSince(24 * 7);

    // pending-by-paper leaders from the pending queue itself (:283-316)
    const pending = (await this.sql`
      select ans.id, ans.attempt_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             ans.question_part_id, qp.label, qp.prompt, qp.marks as part_marks,
             at.learner_id, at.created_at as attempt_created_at, at.evidence_emitted,
             at.question_id, q.external_ref, q.exam_paper_id, q.marks as question_marks
      from answers ans
      join question_parts qp on qp.id = ans.question_part_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      where ans.marking_state = ${"PENDING"}
      order by ans.created_at asc
    `) as unknown as MarkingAnswerRow[];
    const pendingByPaper = new Map<string | null, number>();
    const papers = new Map<string, PaperRow>();
    if (pending.length > 0) {
      const paperIds = [...new Set(pending.map((a) => a.exam_paper_id).filter((v): v is string => v !== null))];
      if (paperIds.length > 0) {
        const paperRows = (await this.sql`
          select id, title, session_label, paper_code from exam_papers
          where id = any(${paperIds}::uuid[])
        `) as unknown as PaperRow[];
        for (const p of paperRows) papers.set(p.id, p);
      }
      for (const a of pending) {
        pendingByPaper.set(a.exam_paper_id, (pendingByPaper.get(a.exam_paper_id) ?? 0) + 1);
      }
    }
    const leaders: PendingPaperView[] = [...pendingByPaper.entries()]
      .sort((e1, e2) => {
        const byCount = e2[1] - e1[1];
        if (byCount !== 0) return byCount;
        // null-safe key tie-break, unfiled bucket LAST (:302-307)
        const k1 = e1[0];
        const k2 = e2[0];
        if (k1 !== null && k2 !== null) return k1 < k2 ? -1 : k1 > k2 ? 1 : 0;
        if (k1 === null && k2 === null) return 0;
        return k1 === null ? 1 : -1;
      })
      .slice(0, 5)
      .map(([paperId, count]) => {
        const p = paperId === null ? null : papers.get(paperId) ?? null;
        return { paperId, paperTitle: p?.title ?? null, paperCode: p?.paper_code ?? null, pending: count };
      });
    const oldestPending = pending.length
      ? pending.map((a) => Date.parse(a.attempt_created_at)).reduce((m, t) => Math.min(m, t))
      : null;
    const oldestPendingAt = oldestPending === null ? null : new Date(oldestPending).toISOString();

    return {
      answersByState: byState,
      humanMarks24h: human24h,
      humanMarks7d: human7d,
      pendingByPaper: leaders,
      oldestPendingAt,
      oldestPendingHours:
        oldestPending === null || oldestPending > now.getTime()
          ? null
          : Math.floor((now.getTime() - oldestPending) / 3_600_000),
    };
  }

  /**
   * Bounded Smart Mark batch (:340-392): the per-answer pipeline once per
   * answer, each item isolated (partial success preserved); idempotent —
   * non-PENDING answers are SKIPPED, not re-marked; per-item failures serve
   * the stable UNEXPECTED_ERROR code, never raw exception text (R9).
   */
  async smartMarkBatch(answerIds: string[]): Promise<SmartMarkBatchView> {
    if (answerIds === null || answerIds.length === 0) {
      throw new BadRequestError("answerIds must not be empty");
    }
    // de-duplicate, order-preserving
    const unique = [...new Set(answerIds)];
    if (unique.length > SMART_MARK_BATCH_LIMIT) {
      throw new BadRequestError(
        "batch too large: " + unique.length + " > " + SMART_MARK_BATCH_LIMIT +
          " — dispatch smaller batches");
    }

    const current = new Map<string, { id: string; marking_state: string; marks_awarded: number | null }>();
    if (unique.length > 0) {
      const rows = (await this.sql`
        select id, marking_state, marks_awarded from answers where id = any(${unique}::uuid[])
      `) as unknown as Array<{ id: string; marking_state: string; marks_awarded: number | null }>;
      for (const r of rows) current.set(r.id, r);
    }

    const results: SmartMarkBatchItem[] = [];
    for (const id of unique) {
      const a = current.get(id);
      if (a === undefined) {
        results.push({ answerId: id, outcome: "FAILED", marksAwarded: null, reason: "answer not found" });
        continue;
      }
      if (a.marking_state !== "PENDING") {
        results.push({
          answerId: id,
          outcome: "SKIPPED_ALREADY_MARKED",
          marksAwarded: a.marks_awarded,
          reason: "state " + a.marking_state,
        });
        continue;
      }
      try {
        const run = await this.smartMark.markAnswer(id);
        results.push({
          answerId: id,
          outcome: run.validation_passed ? "MARKED" : "FAILED",
          marksAwarded: run.validation_passed ? run.marks_awarded : null,
          reason: run.validation_passed
            ? null
            : run.failure_reason === null ? "FAILED" : run.failure_reason,
        });
      } catch {
        // stable failure code; the raw error lives in the log, not the body
        results.push({ answerId: id, outcome: "FAILED", marksAwarded: null, reason: "UNEXPECTED_ERROR" });
      }
    }
    const marked = results.filter((r) => r.outcome === "MARKED").length;
    const skipped = results.filter((r) => r.outcome === "SKIPPED_ALREADY_MARKED").length;
    const failed = results.filter((r) => r.outcome === "FAILED").length;
    return { requested: results.length, marked, skipped, failed, items: results };
  }

  /** item (:405-422): the marking view + paper context + evidence flag. */
  private item(
    a: MarkingAnswerRow,
    paper: PaperRow | null,
    names: Map<string, string>,
    latestSmart: Map<string, SmartRunRow>,
    latestHuman: Map<string, HumanMarkRow>,
  ): MarkingQueueItem {
    const base = answerMarkingView(
      a,
      names.get(a.learner_id) ?? null,
      latestSmart.get(a.id) ?? null,
      latestHuman.get(a.id) ?? null,
      paper?.title ?? null,
    );
    return {
      answer: base,
      paperId: paper?.id ?? null,
      paperTitle: paper?.title ?? null,
      sessionLabel: paper?.session_label ?? null,
      paperCode: paper?.paper_code ?? null,
      evidenceEmitted: a.evidence_emitted,
      nextAnswerId: null,
    };
  }
}

/**
 * Deterministic within-paper order (:394-403): attempt age, then attempt id,
 * then part label, then answer id. Tie-break uuid comparisons use
 * string-lexicographic order (the Postgres convention) — a disclosed,
 * read-model-only deviation from Java's bit-pattern UUID.compareTo that can
 * only re-order timestamp-tied rows (section 7: ordering changes which
 * answer a reviewer SEES first, never a mark, gate, or evidence semantic).
 */
function compareWithinPaper(a1: MarkingAnswerRow, a2: MarkingAnswerRow): number {
  const byAttempt =
    Date.parse(a1.attempt_created_at) - Date.parse(a2.attempt_created_at);
  if (byAttempt !== 0) return byAttempt;
  const byAttemptId = a1.attempt_id < a2.attempt_id ? -1 : a1.attempt_id > a2.attempt_id ? 1 : 0;
  if (byAttemptId !== 0) return byAttemptId;
  const byPart = a1.label < a2.label ? -1 : a1.label > a2.label ? 1 : 0;
  if (byPart !== 0) return byPart;
  return a1.id < a2.id ? -1 : a1.id > a2.id ? 1 : 0;
}

// ── module composition ───────────────────────────────────────────────────────

export interface TeacherMarkingModule {
  teacherSmartMark: TeacherSmartMarkService;
  marking: TeacherMarkingService;
  queue: TeacherMarkingQueueService;
}

export function buildTeacherMarkingModule(
  sql: SqlFn,
  generator: MarkingCandidateGenerator,
  publisher: GradedEvidencePublisher,
  clock: SubmitClock,
): TeacherMarkingModule {
  // the 032 shared engine: composed for the kappa gate law (lives once)
  const shared = new SmartMarkService(sql, generator, publisher, clock);
  const teacherSmartMark = new TeacherSmartMarkService(sql, generator, shared, publisher, clock);
  const marking = new TeacherMarkingService(sql, publisher, clock);
  const queue = new TeacherMarkingQueueService(sql, teacherSmartMark, clock);
  return { teacherSmartMark, marking, queue };
}
