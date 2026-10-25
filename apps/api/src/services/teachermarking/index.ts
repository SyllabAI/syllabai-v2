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
 *
 * ── T-TEACH-003 — ADR-027 D1: the marking surfaces are enrollment-scoped ────
 *
 * ADR-027 (canonical master-pack record) fixed the scoping law before the
 * classroom lane existed: every teacher-facing surface that exposes learner
 * answer content — the marking queue (all states), the paged answers lists,
 * the throughput view, the rich single-answer view, the per-answer
 * smart/human mark paths and the Run-Smart-Mark batch — shows ONLY answers
 * from learners enrolled in classes ASSIGNED TO the requesting teacher.
 * Independent learners (no class enrollment) never appear on any teacher
 * surface, and the global `findByMarkingState` read became a DEFECT (not a
 * cleanup item) the moment T-MIG-052 landed the Class/membership model.
 * The interim pilot-scope mode expires with this change.
 *
 * Mechanics (D1/D4): visibility is computed LIVE per request — an EXISTS
 * predicate over teacher → classes → class_members → attempts.learner_id,
 * inlined at every read (never an inner join: a learner in two of the
 * teacher's classes must not duplicate queue rows; never a snapshot or
 * cache). Membership rows are the single source of truth: un-enrollment is
 * the only revocation — an ARCHIVED class keeps its roster, so pending work
 * never vanishes by an archive action (disclosed reading of D4's
 * no-erasure spirit; enrollment, not class status, is the law). The
 * single-answer paths fold the same join into their FIRST lookup, so an
 * out-of-scope answer is indistinguishable from a nonexistent one
 * (NotFoundError — no existence leak; D1 "teacher-invisible"). The batch
 * classifies per item and reports out-of-scope ids as the honest
 * SKIPPED_OUT_OF_SCOPE outcome with an explicit reason and a null
 * marksAwarded (rendering the learner's marks would leak answer state).
 * The κ endpoints are UNCHANGED per the ADR's own implementation note: the
 * human sample composes upstream (marks can only ARISE in scope through the
 * gated write paths), so no gate-math change.
 */
import type { SqlFn } from "../assessment/sql";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  type GradedEvidencePublisher,
  type SubmitClock,
  assembleGradedEvidenceEvent,
} from "../selfmark";
import {
  BAND_PIPELINE_VERSION,
  BandMarkingPipeline,
  PIPELINE_VERSION,
  SmartMarkPipeline,
  SmartMarkService,
  toMarkingBand,
  toMarkingPoint,
  type BandDecision,
  type BandMarkingCandidateGenerator,
  type BandMarkingContext,
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
/** T-SM-KAPPA-SUBJECT (D2, #29 comment 3): subject-level calibration packet
 *  scope — one subject's served papers + topic-anchored corpus, one κ row. */
export const SCOPE_SUBJECT = "SUBJECT";
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

/**
 * T-MIG-051: the throughput answersByState WIRE order — Java HashMap
 * iteration order over the five enum-name String keys (QueueService :271
 * `new HashMap<>()` seeded from MarkingState.values() in enum order; Jackson
 * serializes map iteration order). Derived, not asserted: with default
 * capacity 16 and five puts (no resize), bucket = (h ^ (h>>>16)) & 15 of the
 * spec-fixed String.hashCode — computed order HUMAN_MARKED, SMART_MARKED,
 * PENDING, SELF_MARKED, OVERRIDDEN, byte-matching the golden capture
 * w3-teacher-marking-throughput-rich-200 on every boot.
 */
export const BY_STATE_WIRE_ORDER = [
  "HUMAN_MARKED",
  "SMART_MARKED",
  "PENDING",
  "SELF_MARKED",
  "OVERRIDDEN",
] as const;

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
  /** ADR-027 D1 (T-TEACH-003): SKIPPED_OUT_OF_SCOPE — the honest per-item
   *  report for an answer outside the requesting teacher's enrollment scope
   *  (explicit reason, marksAwarded null — no answer-state leak). */
  outcome: "MARKED" | "SKIPPED_ALREADY_MARKED" | "SKIPPED_OUT_OF_SCOPE" | "FAILED";
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
  /** T-SM-KAPPA-SUBJECT: the subject key on SUBJECT-scope rows; null on
   *  ALL/PAPER rows (additive DTO law — new field, names unchanged). */
  subjectId: string | null;
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

/**
 * TeacherViews.SmartMarkView.from (T-MIG-122, the B1-DEFECT-1 fix): the
 * SINGLE smart-mark tail's controller projection — the FRESH result row
 * mapped field-for-field through the envelope, exactly the frozen
 * TeacherMarkingController :255-259 → TeacherViews.SmartMarkView.from
 * (first-hand at 6cad6ef: r.id(), r.pipelineVersion(), r.modelId(),
 * r.marksAwarded(), r.confidence(), r.validationPassed(), r.failureReason(),
 * r.breakdown(), r.createdAt()). The raw SmartMarkResult persistence row is
 * NEVER the wire — the 116 run-002 t01 leg caught exactly that (the
 * snake_case row served where the core serves the camelCase envelope).
 *
 * pipelineVersion: the constant — this is the WRITE-side echo of the row
 * just stamped with PIPELINE_VERSION (the core's fresh entity defaults its
 * pipelineVersion to SmartMarkResult.PIPELINE_VERSION at construction).
 * The N-2 stored-version law governs the STORED-run reads (smartMarkView
 * above), not the fresh-result echo — the two paths are different cores.
 *
 * createdAt: passed in by the caller — the core's value is the @PrePersist
 * instant born at save (SmartMarkResult.java :134, the wall clock, not the
 * injected clock); the route passes the analog wall-clock instant.
 */
export function smartMarkResultView(
  row: SmartMarkResultRow,
  createdAt: string,
): SmartMarkView {
  return {
    id: row.id,
    pipelineVersion: PIPELINE_VERSION,
    modelId: row.model_id,
    marksAwarded: row.marks_awarded,
    confidence: row.confidence,
    validationPassed: row.validation_passed,
    failureReason: row.failure_reason,
    breakdown: row.breakdown,
    createdAt,
  };
}

function humanMarkView(mark: HumanMarkRow | null): HumanMarkView | null {
  if (mark === null) return null;
  return {
    id: mark.id,
    markerId: mark.marker_id,
    marksAwarded: mark.marks_awarded,
    // T-MIG-114 (the detail projection law of record): the jsonb column
    // arrives as a STRING from the live driver (the exact driver law
    // normalizeBreakdown documents for the smart path's breakdown). The
    // frozen core serves the HYDRATED map on BOTH the detail read and the
    // POST echo — HumanMarkRepository.findLatest selects the full entity
    // (`select h from HumanMark h`; the JSONB Map<String,Integer> field
    // hydrates) and TeacherViews.HumanMarkView.from renders
    // h.perPointDecisions() directly (source first-hand at 6cad6ef; the
    // capture leg-35 body is the map — the 113 run-002 red of record was
    // v2's raw string vs the core's map). Render the hydrated map; null
    // stays null (the D04 both-sides-null law). The POST echo is untouched
    // — recordHumanMark returns the parsed INPUT (the leg-34 law: the two
    // shapes are byte-equal on the core).
    perPointDecisions: normalizeBreakdown(mark.per_point_decisions) as
      | Record<string, number>
      | null,
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
  private readonly bandPipeline: BandMarkingPipeline | null;

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
    /** ADR-040 §5.4: the band dispatch seam for the per-answer topology.
     *  Absent (unwired legacy construction) → VALIDATED LEVELS schemes
     *  refuse per-answer with the honest NO_SCHEME_BANDS row. */
    bandGenerator?: BandMarkingCandidateGenerator,
  ) {
    this.pipeline = new SmartMarkPipeline(generator);
    this.bandPipeline = bandGenerator === undefined ? null : new BandMarkingPipeline(bandGenerator);
  }

  /**
   * markAnswer (:87-171): one answer through the pipeline; append-only
   * result row; provisional marks applied; evidence only when accepted AND
   * kappa-released AND the attempt's marking is COMPLETE (no PENDING part).
   *
   * T-TEACH-003 (ADR-027 D1): `teacherId` is the requesting teacher — the
   * FIRST lookup folds the enrollment join (answers → attempts →
   * class_members → classes where teacher_id), so an out-of-scope answer
   * 404s exactly like a nonexistent one BEFORE any state load or lock. The
   * batch re-rides this gate per dispatched item (defense in depth).
   */
  async markAnswer(answerId: string, teacherId: string): Promise<SmartMarkResultRow> {
    // scope gate + serialization-point prelude FIRST (:95-98 analog — the
    // attempt id resolves only INSIDE the requesting teacher's enrollment
    // scope; the lock still precedes every state load)
    const attemptIdRows = (await this.sql`
      select a.attempt_id
      from answers a
      join attempts at on at.id = a.attempt_id
      where a.id = ${answerId}
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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

    // newest VALIDATED scheme backs marking (V34); none → honest refusal.
    // ADR-040 §5.4: the scheme's kind rides along so the dispatch below can
    // hold the point/LEVELS boundary in this topology too.
    const validatedRows = (await this.sql`
      select id, validation_state, scheme_kind from mark_schemes
      where question_version_id = ${versionId} and validation_state = ${"VALIDATED"}
      order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string; scheme_kind: string | null }>;
    if (validatedRows.length === 0) {
      return this.refuseUnvalidatedScheme(answer, versionId);
    }
    const scheme = validatedRows[0]!;
    if ((scheme.scheme_kind ?? "POINTS") === "LEVELS") {
      // ADR-040 §5.4 — the band dispatch leg, per-answer topology: the bound
      // scheme's kind selects the marker path. ONE dispatch, no guessing;
      // band parts refuse honestly until their scheme is VALIDATED (the
      // refusal below stamps the newest scheme per the V34 law).
      return this.markAnswerBand(attemptId, attempt, answer, scheme);
    }

    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_points where mark_scheme_id = ${scheme.id} order by ordering
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
      await this.applyProvisionalMark(attemptId, attempt, answer, decision.marksAwarded);
    }
    return resultRow;
  }

  /** ADR-040 §5.4 — the band marking path for a VALIDATED LEVELS scheme
   *  (per-answer topology). Unwired band seam → the honest NO_SCHEME_BANDS
   *  refusal row (append-only, no state change); empty bands on a wired seam
   *  → the same refusal. Otherwise: kind re-assert + general guidance in ONE
   *  read (the internal guard refuses a dispatch/read kind mismatch loudly —
   *  never silently re-routes), the bands read, and the band pipeline decides;
   *  the accepted tail is the SHARED provisional-mark law (same writes, same
   *  κ gate, same evidence) with the band pipeline version stamped. */
  private async markAnswerBand(
    attemptId: string,
    attempt: AttemptLockRow,
    answer: MarkingAnswerRow,
    scheme: { id: string; validation_state: string; scheme_kind: string | null },
  ): Promise<SmartMarkResultRow> {
    if (this.bandPipeline === null) {
      return this.refuseBandScheme(answer, scheme);
    }
    const schemeFullRows = (await this.sql`
      select validation_state, scheme_kind, general_guidance from mark_schemes where id = ${scheme.id}
    `) as unknown as Array<{ validation_state: string; scheme_kind: string | null; general_guidance: string | null }>;
    if (schemeFullRows.length === 0) throw new NotFoundError("mark scheme", scheme.id);
    const schemeFull = schemeFullRows[0]!;
    if ((schemeFull.scheme_kind ?? "POINTS") !== "LEVELS") {
      throw new ConflictError("mark scheme kind changed between dispatch and read -- refusing loudly");
    }
    const bandRows = (await this.sql`
      select id, level_index, marks_min, marks_max, descriptor_md, guidance_md
      from mark_bands where mark_scheme_id = ${scheme.id} order by level_index
    `) as unknown as Array<Record<string, unknown>>;
    const bands = bandRows.map(toMarkingBand);
    if (bands.length === 0) {
      return this.refuseBandScheme(answer, scheme);
    }
    const context: BandMarkingContext = {
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
      bands,
      // the per-answer row already carries the part's prompt (:626 select)
      partPrompt: answer.prompt,
      generalGuidance: schemeFull.general_guidance,
    };
    const decision: BandDecision = await this.bandPipeline.run(context);

    const resultId = this.clock.newId();
    await this.sql`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${BAND_PIPELINE_VERSION}, ${decision.candidate?.modelId ?? null},
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
      await this.applyProvisionalMark(attemptId, attempt, answer, decision.marksAwarded);
    }
    return resultRow;
  }

  /** Honest band refusal (ADR-040 §2.2), per-answer topology — the mirror of
   *  SmartMarkService.refuseBandScheme: append-only row stamped with the
   *  validated LEVELS scheme it refused; nothing is marked, no state
   *  changes, no evidence. */
  private async refuseBandScheme(
    answer: MarkingAnswerRow,
    scheme: { id: string; validation_state: string },
  ): Promise<SmartMarkResultRow> {
    const resultId = this.clock.newId();
    await this.sql`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${BAND_PIPELINE_VERSION}, ${null}, ${0}, ${null}, ${false},
        ${JSON.stringify([])}, ${"NO_SCHEME_BANDS"}, ${scheme.id},
        ${scheme.validation_state}, ${null}, ${this.clock.now().toISOString()})
    `;
    return {
      id: resultId,
      answer_id: answer.id,
      model_id: null,
      marks_awarded: 0,
      confidence: null,
      validation_passed: false,
      breakdown: [],
      failure_reason: "NO_SCHEME_BANDS",
    };
  }

  /** The shared accepted tail of markAnswer (point + band dispatches),
   *  verbatim from the frozen inline block: provisional mark application
   *  (:135-138), the recomputed total, and the κ-gated evidence only when
   *  the attempt's marking is COMPLETE (:145-157). */
  private async applyProvisionalMark(
    attemptId: string,
    attempt: AttemptLockRow,
    answer: MarkingAnswerRow,
    marksAwarded: number,
  ): Promise<void> {
    // provisional mark application (:135-138)
    await this.sql`
      update answers set marks_awarded = ${marksAwarded}, marking_state = ${"SMART_MARKED"}
      where id = ${answer.id}
    `;
    await this.sql`
      update attempts set marking_state = ${"SMART_MARKED"} where id = ${attemptId}
    `;
    const total = await this.recomputeAttemptTotal(attemptId, answer.question_marks);
    const authoritative = await this.shared.kappaGatePassed(answer.exam_paper_id, answer.question_id);
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
    _answer: MarkingAnswerRow,
    marksAwarded: number,
  ): Promise<void> {
    // T-MIG-137a: the assembly is the shared assembler's — the frozen
    // publisher's own laws (marksTotal/correct :56-60, topicNodeIds :111-120,
    // specPointNodeIds :100-109, empty misconception lists :61, the attempt's
    // selfDoubtFlag :79) in ONE place; the recomputed ATTEMPT total stays the
    // marksAwarded source (:150, not the single answer's marks).
    const fired = await this.publisher.publishGraded(
      await assembleGradedEvidenceEvent(this.sql, {
        attemptId: attempt.id,
        learnerId: attempt.learner_id,
        questionId: attempt.question_id,
        marksAwarded,
        occurredAt: this.clock.now().toISOString(),
      }),
    );
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
   *
   * T-TEACH-003 (ADR-027 D1): `markerId` doubles as the scope principal
   * (the route passes the JWT identity) — the FIRST lookup folds the
   * enrollment join, so a human mark on an out-of-scope answer 404s exactly
   * like a nonexistent one BEFORE any state load or lock (D3: paired κ
   * calibration originates exclusively where a human marker holds
   * authorization — a mark outside scope can never be recorded).
   */
  async recordHumanMark(
    answerId: string,
    markerId: string,
    marksAwarded: number,
    perPointDecisions: Record<string, number> | null,
    comments: string | null,
  ): Promise<HumanMarkView> {
    // scope gate + serialization point FIRST (:95-98 analog) — the attempt
    // id resolves only INSIDE the marker's enrollment scope
    const attemptIdRows = (await this.sql`
      select a.attempt_id
      from answers a
      join attempts at on at.id = a.attempt_id
      where a.id = ${answerId}
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${markerId}
        )
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
    _answer: MarkingAnswerRow,
    marksAwarded: number,
  ): Promise<void> {
    // T-MIG-137a: the assembly is the shared assembler's — the frozen
    // publisher's own laws (marksTotal/correct :56-60, topicNodeIds :111-120,
    // specPointNodeIds :100-109, empty misconception lists :61, the attempt's
    // selfDoubtFlag :79) in ONE place; the recomputed ATTEMPT total stays the
    // marksAwarded source (:150, not the single answer's marks).
    const fired = await this.publisher.publishGraded(
      await assembleGradedEvidenceEvent(this.sql, {
        attemptId: attempt.id,
        learnerId: attempt.learner_id,
        questionId: attempt.question_id,
        marksAwarded,
        occurredAt: this.clock.now().toISOString(),
      }),
    );
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

    const pairs = await this.collectPairs(humanSample);

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
      subjectId: null,
      sampleSize: stats.sampleSize,
      kappa: stats.kappa,
      observedAgreement: stats.observedAgreement,
      threshold: KAPPA_DEFAULT_THRESHOLD,
      passed,
      computedAt,
    };
  }

  /** T-SM-KAPPA-SUBJECT — the pairing law of evaluateAgreement (:170-212)
   *  verbatim, extracted so the ALL/PAPER lane and the SUBJECT lane share
   *  ONE implementation (composition, never a fork). Newest smart run per
   *  answer (findLatest THEN validation_passed filter), point-level pairing
   *  against the human mark's per_point_decisions; ConflictError when no
   *  pairable decisions exist (parity with the frozen :952 guard). */
  private async collectPairs(humanSample: HumanMarkRow[]): Promise<Array<[number, number]>> {
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
    return pairs;
  }

  /** T-SM-KAPPA-SUBJECT (D2, #29 comment 3) — subject-level calibration
   *  packet: same pairing + persistence law as evaluateAgreement (:897),
   *  sampled across the subject's served papers AND topic-anchored corpus.
   *  Subject membership derivation mirrors kappaGatePassed's (R2-audit
   *  verified shape, #29 comment 2 addendum): paper lane via
   *  exam_papers.subject_id, tree lane via question_topics ∪
   *  question_spec_points up PART_OF edges to a SUBJECT node →
   *  subjects.knowledge_node_id. relation_type = 'PART_OF' and the depth
   *  guard are LOAD-BEARING (prereq-graph cycles); full-literal SQL per the
   *  no-.raw() fleet convention. Operator-triggered only — the unfiltered
   *  walk scans the question_topics/qsp bridges (~12k rows, seconds on
   *  prod-sized data; measured during the R2 audit). */
  async evaluateAgreementForSubject(
    subjectId: string,
    computedBy: string,
  ): Promise<KappaEvaluationView> {
    const humanSample: HumanMarkRow[] = (await this.sql`
      with recursive qn as (
        select distinct question_id, node_id from question_topics
        union
        select distinct question_id, spec_point_node_id as node_id
        from question_spec_points where spec_point_node_id is not null
      ), up as (
        select qn.question_id, tn.id as node_id, 0 as depth,
               case when tn.node_type = 'SUBJECT' then tn.id end as subj_node
        from qn join knowledge_nodes tn on tn.id = qn.node_id
        union all
        select up.question_id, p.id, up.depth + 1,
               case when p.node_type = 'SUBJECT' then p.id else up.subj_node end
        from up
        join knowledge_edges e
          on e.source_node_id = up.node_id and e.relation_type = 'PART_OF'
        join knowledge_nodes p on p.id = e.target_node_id
        where up.subj_node is null and up.depth < 8
      ), qsub as (
        select q.id as question_id, ep.subject_id as subject_id
        from questions q join exam_papers ep on ep.id = q.exam_paper_id
        union
        select distinct u.question_id, s.id as subject_id
        from (select distinct question_id, subj_node from up
              where subj_node is not null) u
        join subjects s on s.knowledge_node_id = u.subj_node
      )
      select h.id, h.answer_id, h.marker_id, h.marks_awarded, h.per_point_decisions,
             h.comments, h.created_at
      from human_marks h
      join answers ans on ans.id = h.answer_id
      join attempts at on at.id = ans.attempt_id
      join qsub on qsub.question_id = at.question_id
      where qsub.subject_id = ${subjectId}
      order by h.created_at asc
    `) as unknown as HumanMarkRow[];

    const pairs = await this.collectPairs(humanSample);
    const stats = cohenKappa(pairs);
    const evaluationId = this.clock.newId();
    const passed = stats.kappa >= KAPPA_DEFAULT_THRESHOLD;
    const computedAt = this.clock.now().toISOString();
    await this.sql`
      insert into smart_mark_agreement_evaluations (id, scope, exam_paper_id, subject_id,
        sample_size, kappa, observed_agreement, threshold, passed, computed_at, computed_by)
      values (${evaluationId}, ${SCOPE_SUBJECT}, null, ${subjectId}, ${stats.sampleSize},
        ${stats.kappa}, ${stats.observedAgreement}, ${KAPPA_DEFAULT_THRESHOLD},
        ${passed}, ${computedAt}, ${computedBy})
    `;
    return {
      id: evaluationId,
      scope: SCOPE_SUBJECT,
      paperId: null,
      subjectId,
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
      subjectId: null,
      sampleSize: e.sample_size,
      kappa: e.kappa,
      observedAgreement: e.observed_agreement,
      threshold: e.threshold,
      passed: e.passed,
      computedAt: e.computed_at,
    };
  }

  /** T-SM-KAPPA-SUBJECT (D2, #29 comment 3) — newest SUBJECT-scope evaluation
   *  for one subject. Same read law as latestEvaluation (:282-293):
   *  findFirst…OrderByComputedAtDesc with the id-desc determinism tie-break;
   *  null when none exists → the route 404s. The partial index
   *  idx_agreement_subject_latest backs this lookup. */
  async latestSubjectEvaluation(subjectId: string): Promise<KappaEvaluationView | null> {
    const rows = (await this.sql`
      select id, scope, exam_paper_id, subject_id, sample_size, kappa, observed_agreement,
             threshold, passed, computed_at
      from smart_mark_agreement_evaluations
      where scope = ${SCOPE_SUBJECT} and subject_id = ${subjectId}
      order by computed_at desc, id desc
      limit 1
    `) as unknown as Array<{
      id: string; scope: string; exam_paper_id: string | null; subject_id: string | null;
      sample_size: number; kappa: number; observed_agreement: number; threshold: number;
      passed: boolean; computed_at: string;
    }>;
    const e = rows[0];
    if (!e) return null;
    return {
      id: e.id,
      scope: e.scope,
      paperId: e.exam_paper_id,
      subjectId: e.subject_id,
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

  /**
   * markingQueue (:86-92): the full v2 queue with the mark→next chain.
   * T-TEACH-003 (ADR-027 D1): scoped to the requesting teacher's enrollment
   * (teacherId — the route's JWT identity); an out-of-scope answer never
   * appears, exactly as a filtered-out row never did.
   */
  async markingQueue(state: string, teacherId: string): Promise<MarkingQueueView> {
    const assembled = await this.assemble(state, teacherId);
    const items = chainNext(assembled.itemsByGroup.flat());
    return { state, groups: assembled.groupViews, items };
  }

  /**
   * Opt-in paged v2 queue (:109-142): pages of WHOLE paper groups — papers
   * never split across a boundary; bounds page >= 0, 1..100 papers per page
   * default 5; past-the-end is an honestly empty page, not an error; totals
   * are the real counts of the whole state — WHOLE state means the teacher's
   * enrollment-scoped state (T-TEACH-003, ADR-027 D1): totals, page math and
   * chains all compute inside the scope, never against the global corpus.
   */
  async markingQueuePaged(
    state: string,
    page: number | null,
    size: number | null,
    teacherId: string,
  ): Promise<MarkingQueueView | MarkingQueuePageView> {
    if (page === null && size === null) return this.markingQueue(state, teacherId);
    const p = page === null ? 0 : page;
    const s = size === null ? DEFAULT_PAPER_GROUPS_PER_PAGE : size;
    if (p < 0) throw new BadRequestError("page must be >= 0");
    if (s < 1 || s > MAX_PAPER_GROUPS_PER_PAGE) {
      throw new BadRequestError(
        "size must be between 1 and " + MAX_PAPER_GROUPS_PER_PAGE + " (paper groups per page)");
    }
    const assembled = await this.assemble(state, teacherId);
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
   *
   * T-TEACH-003 (ADR-027 D1/D4): the queue query is enrollment-scoped — the
   * EXISTS predicate resolves the requesting teacher's classes → members
   * LIVE on every request (no snapshot); EXISTS (not an inner join) keeps a
   * learner enrolled in two of the teacher's classes from duplicating rows.
   */
  private async assemble(state: string, teacherId: string): Promise<Assembled> {
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
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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
   * T-TEACH-003 (ADR-027 D1): enrollment-scoped like every read above.
   */
  async answersList(state: string, teacherId: string): Promise<AnswerMarkingView[]> {
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
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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
   * T-TEACH-003 (ADR-027 D1): BOTH the page query and the total count are
   * enrollment-scoped — the envelope's totals are the teacher's own truth.
   */
  async answersPaged(
    state: string,
    page: number,
    size: number,
    teacherId: string,
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
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
      order by ans.created_at asc, ans.id asc
      limit ${size} offset ${page * size}
    `) as unknown as MarkingAnswerRow[];
    const countRows = (await this.sql`
      select count(*)::int as total
      from answers ans
      join attempts at on at.id = ans.attempt_id
      where ans.marking_state = ${state}
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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
   *
   * T-TEACH-003 (ADR-027 D1): the answer row resolves only INSIDE the
   * requesting teacher's enrollment scope — an out-of-scope answer renders
   * null (the route's NotFound) exactly like a nonexistent one: no
   * existence leak, the smart/human tails never run for it.
   */
  async answerById(id: string, teacherId: string): Promise<AnswerMarkingView | null> {
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
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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

  /**
   * throughput (:270-331): workload by state, human windows, leaders, oldest age.
   * T-TEACH-003 (ADR-027 D1): every read is enrollment-scoped to the
   * requesting teacher — the answersByState group-by and the pending-by-paper
   * leaders join the enrollment chain (exists), and the human-mark windows
   * count marks on in-scope answers only (the same chain through
   * human_marks → answers → attempts). The ADR's implementation note names
   * "queue + throughput + pending-by-paper" as the scoped replacement set;
   * the by-state counts ride along because they drive the same console.
   */
  async throughput(teacherId: string): Promise<ThroughputView> {
    const byState: Record<string, number> = {};
    // T-MIG-051 (N-4 rich-200 capture): the frozen ThroughputView serializes
    // a HashMap<String,Long> seeded in enum order (QueueService :271-276) —
    // Jackson renders it in JAVA HASHMAP ITERATION ORDER, which for these
    // five String keys is deterministic (String.hashCode is spec-fixed):
    // capacity 16, five puts (no resize), bucket = (h ^ h>>>16) & 15. The
    // derived order below reproduces the captured wire order exactly (and
    // differs from enum/declaration order): HUMAN_MARKED, SMART_MARKED,
    // PENDING, SELF_MARKED, OVERRIDDEN. Zeroed in THAT order so the wire
    // bytes match the frozen core; the counts fill in from the group-by.
    for (const s of BY_STATE_WIRE_ORDER) byState[s] = 0;
    const stateRows = (await this.sql`
      select ans.marking_state as marking_state, count(*) as count
      from answers ans
      join attempts at on at.id = ans.attempt_id
      where exists (
        select 1 from class_members cm
        join classes c on c.id = cm.class_id
        where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
      )
      group by ans.marking_state
    `) as unknown as StateCountRow[];
    for (const row of stateRows) byState[row.marking_state] = Number(row.count);

    const now = this.clock.now();
    const countSince = async (hours: number): Promise<number> => {
      const rows = (await this.sql`
        select count(*) as count
        from human_marks h
        join answers ans on ans.id = h.answer_id
        join attempts at on at.id = ans.attempt_id
        where h.created_at >= ${new Date(now.getTime() - hours * 3_600_000).toISOString()}
          and exists (
            select 1 from class_members cm
            join classes c on c.id = cm.class_id
            where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
          )
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
        and exists (
          select 1 from class_members cm
          join classes c on c.id = cm.class_id
          where cm.student_id = at.learner_id and c.teacher_id = ${teacherId}
        )
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
        // null-safe key tie-break, unfiled bucket LAST (:302-307); the key
        // comparison is the frozen in-memory UUID.compareTo — SIGNED
        // (uuidCompare, the T-MIG-051 N-4 law), not hex-lex
        const k1 = e1[0];
        const k2 = e2[0];
        if (k1 !== null && k2 !== null) return uuidCompare(k1, k2);
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
   *
   * T-TEACH-003 (ADR-027 D1): `teacherId` scopes the batch. The scope
   * resolves ONCE (live, D4) for the per-item classification; every
   * dispatched item then re-rides markAnswer's own enrollment join (defense
   * in depth — a mid-batch un-enrollment answers FAILED "answer not found",
   * never a mark on a revoked learner). Out-of-scope ids report the honest
   * SKIPPED_OUT_OF_SCOPE with an explicit reason and marksAwarded null
   * (rendering the learner's current marks would leak answer state to a
   * teacher who must not see the answer at all) — the ADR's batch note
   * verbatim: never silently dropped, never fabricated.
   */
  async smartMarkBatch(answerIds: string[], teacherId: string): Promise<SmartMarkBatchView> {
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

    // the requesting teacher's LIVE enrollment scope (one grouped read)
    const scopeRows = (await this.sql`
      select distinct cm.student_id
      from class_members cm
      join classes c on c.id = cm.class_id
      where c.teacher_id = ${teacherId}
    `) as unknown as Array<{ student_id: string }>;
    const scope = new Set(scopeRows.map((r) => r.student_id));

    const current = new Map<
      string,
      { id: string; marking_state: string; marks_awarded: number | null; learner_id: string }
    >();
    if (unique.length > 0) {
      const rows = (await this.sql`
        select ans.id, ans.marking_state, ans.marks_awarded, at.learner_id
        from answers ans
        join attempts at on at.id = ans.attempt_id
        where ans.id = any(${unique}::uuid[])
      `) as unknown as Array<{ id: string; marking_state: string; marks_awarded: number | null; learner_id: string }>;
      for (const r of rows) current.set(r.id, r);
    }

    const results: SmartMarkBatchItem[] = [];
    for (const id of unique) {
      const a = current.get(id);
      if (a === undefined) {
        results.push({ answerId: id, outcome: "FAILED", marksAwarded: null, reason: "answer not found" });
        continue;
      }
      if (!scope.has(a.learner_id)) {
        results.push({
          answerId: id,
          outcome: "SKIPPED_OUT_OF_SCOPE",
          marksAwarded: null, // no answer-state leak (ADR-027 D1)
          reason: "out of scope: the learner is not enrolled in one of your classes",
        });
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
        const run = await this.smartMark.markAnswer(id, teacherId);
        results.push({
          answerId: id,
          outcome: run.validation_passed ? "MARKED" : "FAILED",
          marksAwarded: run.validation_passed ? run.marks_awarded : null,
          reason: run.validation_passed
            ? null
            : run.failure_reason === null ? "FAILED" : run.failure_reason,
        });
      } catch (err) {
        // the scope gate inside markAnswer fires only on a mid-batch
        // un-enrollment race (the item was in scope at classification);
        // its NotFound message is the honest "answer not found" class —
        // everything else stays the stable UNEXPECTED_ERROR code
        if (err instanceof NotFoundError) {
          results.push({ answerId: id, outcome: "FAILED", marksAwarded: null, reason: "answer not found" });
          continue;
        }
        // stable failure code; the raw error lives in the log, not the body
        results.push({ answerId: id, outcome: "FAILED", marksAwarded: null, reason: "UNEXPECTED_ERROR" });
      }
    }
    const marked = results.filter((r) => r.outcome === "MARKED").length;
    const skipped = results.filter(
      (r) => r.outcome === "SKIPPED_ALREADY_MARKED" || r.outcome === "SKIPPED_OUT_OF_SCOPE",
    ).length;
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
// ── java.util.UUID.compareTo, byte-faithful (T-MIG-051 N-4 closure) ─────────
//
// The frozen core's IN-MEMORY orderings compare the two 64-bit halves of a
// uuid as SIGNED longs (java.util.UUID.compareTo). The golden capture
// w3-teacher-marking-queue-v2-rich-200 exhibits the law: with attempt
// created_at tied, 0xf0ae6395-… sorts BEFORE 0x4e094481-… — the 0xf0… msb
// is NEGATIVE as a signed long — exactly the reverse of unsigned/hex-lex
// order. The former string-lex tie-breaks here were a disclosed divergence
// (T-MIG-033 run-005 N-4); the N-4 capture condition fires and the
// comparator is now ported bit-faithfully. BigInt keeps the 64-bit signed
// math exact (no Number precision loss on the 64-bit halves).
const I64_MSB = 1n << 63n;
const I64_MOD = 1n << 64n;
function signedI64(hex: string): bigint {
  const v = BigInt("0x" + hex);
  return v >= I64_MSB ? v - I64_MOD : v;
}
export function uuidCompare(a: string, b: string): number {
  const ha = a.replaceAll("-", "");
  const hb = b.replaceAll("-", "");
  const am = signedI64(ha.slice(0, 16));
  const bm = signedI64(hb.slice(0, 16));
  if (am !== bm) return am < bm ? -1 : 1;
  const al = signedI64(ha.slice(16));
  const bl = signedI64(hb.slice(16));
  if (al !== bl) return al < bl ? -1 : 1;
  return 0;
}

function compareWithinPaper(a1: MarkingAnswerRow, a2: MarkingAnswerRow): number {
  const byAttempt =
    Date.parse(a1.attempt_created_at) - Date.parse(a2.attempt_created_at);
  if (byAttempt !== 0) return byAttempt;
  // attempt.id / answer.id tie-breaks: java.util.UUID.compareTo SIGNED law
  // (see uuidCompare) — TeacherMarkingQueueService.compareWithinPaper :395-403
  const byAttemptId = uuidCompare(a1.attempt_id, a2.attempt_id);
  if (byAttemptId !== 0) return byAttemptId;
  const byPart = a1.label < a2.label ? -1 : a1.label > a2.label ? 1 : 0;
  if (byPart !== 0) return byPart;
  return uuidCompare(a1.id, a2.id);
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
  bandGenerator?: BandMarkingCandidateGenerator,
): TeacherMarkingModule {
  // the 032 shared engine: composed for the kappa gate law (lives once)
  const shared = new SmartMarkService(sql, generator, publisher, clock, bandGenerator);
  const teacherSmartMark = new TeacherSmartMarkService(sql, generator, shared, publisher, clock, bandGenerator);
  const marking = new TeacherMarkingService(sql, publisher, clock);
  const queue = new TeacherMarkingQueueService(sql, teacherSmartMark, clock);
  return { teacherSmartMark, marking, queue };
}
