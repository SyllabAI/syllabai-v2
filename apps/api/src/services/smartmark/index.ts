/**
 * Smart Mark — the shared marking pipeline + the student-facing surface
 * (T-MIG-032 tranche 1, verbatim law from the frozen core @ 6cad6ef):
 *
 *   SmartMarkPipeline      — candidate generation (injected LLM seam) →
 *                            deterministic validation → Decision. Pure
 *                            orchestration; never mutates, never invents marks.
 *   MarkingValidator trio  — bounds (allocations reference exactly one
 *                            in-scheme point, no duplicates), coverage (every
 *                            point decided), mark-sum (per-point clamp +
 *                            part-ceiling bound).
 *   SmartMarkService       — markAttempt (the ONE engine: row lock first,
 *                            batched candidate generation with per-part
 *                            fallback ladder, honest SCHEME_NOT_VALIDATED
 *                            refusals per V34 G-2, append-only result rows,
 *                            κ-gated evidence at completion) +
 *                            kappaGatePassed (fail-closed: absence of any
 *                            evaluation = gated).
 *   StudentSmartMarkService— the learner half of F-047: ownership re-verify
 *                            (no existence leak), structured-only,
 *                            pre-settlement only, reveal-policy mirror
 *                            (VALIDATED_ONLY default; REJECTED/FLAGGED never
 *                            pass; withheld → 409), κ-gated `authoritative`
 *                            honesty flag, ephemeral feedback prose (generated
 *                            per request, NEVER persisted — consumption lands
 *                            as telemetry events via the Observer seam).
 *
 * Evidence follows the E-1 claim contract bound at T-MIG-030 tranche-2:
 * publishGraded resolves a claim (true = fired) and the service issues the
 * once-only guarded flip (update ... where evidence_emitted = false).
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists inline as static template text.
 */
import type { SqlFn } from "../assessment/sql";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  type GradedEvidencePublisher,
  type SubmitClock,
} from "../selfmark";

export type { GradedEvidencePublisher, SubmitClock } from "../selfmark";
export { NotFoundError, BadRequestError, ConflictError } from "../selfmark";

// ── pipeline types (MarkingContext / MarkingCandidate / Decision) ───────────

export interface MarkingPoint {
  id: string;
  ref: string;
  text: string;
  marks: number;
  questionPartId: string;
}

/** Raw mark_scheme_points row (snake columns) → the camel projection. */
export function toMarkingPoint(r: Record<string, unknown>): MarkingPoint {
  return {
    id: String(r.id),
    ref: String(r.ref),
    text: String(r.text),
    marks: Number(r.marks),
    questionPartId: String(r.question_part_id),
  };
}

export interface MarkingAnswerRef {
  id: string;
  attemptId: string;
  questionPartId: string;
  answerText: string | null;
  label: string;
  partMarks: number;
}

export interface MarkingContext {
  answer: MarkingAnswerRef;
  schemeId: string;
  schemeValidationState: string;
  points: MarkingPoint[];
}

export interface Allocation {
  markPointId: string;
  ref: string;
  awarded: boolean;
  marksAwarded: number;
  evidence: string;
  rationale: string;
}

/** MarkingCandidate.java — the generator's proposal. */
export interface MarkingCandidate {
  modelId: string | null;
  allocations: Allocation[];
  confidence: number | null;
  rawOutput: string | null;
}

export type DecisionBreakdownEntry = {
  markPointId: string;
  ref: string;
  marks: number;
  marksAwarded: number;
  awarded: boolean;
  evidence: string;
  rationale: string;
};

/** SmartMarkPipeline.Decision — accepted flags validators-passed marks. */
export interface Decision {
  accepted: boolean;
  marksAwarded: number;
  breakdown: DecisionBreakdownEntry[];
  failureReason: string | null;
  candidate: MarkingCandidate | null;
}

export function decisionRejected(reason: string, candidate: MarkingCandidate | null): Decision {
  return { accepted: false, marksAwarded: 0, breakdown: [], failureReason: reason, candidate };
}

export class CandidateGenerationError extends Error {
  constructor(
    public readonly reason: string,
    public readonly rawOutput: string | null = null,
  ) {
    super(reason);
  }
}

/** MarkingCandidateGenerator — the injected LLM seam (lifecycle-gated surface). */
export interface MarkingCandidateGenerator {
  proposeAll(contexts: MarkingContext[]): Promise<MarkingCandidate[]>;
  propose(context: MarkingContext): Promise<MarkingCandidate>;
}

/** MarkingValidator.java — pure, deterministic, never invents marks. */
export interface MarkingValidator {
  name(): string;
  validate(candidate: MarkingCandidate, context: MarkingContext): string[];
}

export function pointMarkCeiling(context: MarkingContext): number {
  return context.points.reduce((s, p) => s + p.marks, 0);
}

// ── the validator trio (verbatim law) ───────────────────────────────────────

/** BoundsMarkingValidator — no invented point ids, no duplicates. */
export const boundsValidator: MarkingValidator = {
  name: () => "bounds",
  validate(candidate, context) {
    const violations: string[] = [];
    const inScope = new Set(context.points.map((p) => p.id));
    const seen = new Set<string>();
    for (const allocation of candidate.allocations) {
      if (allocation.markPointId === null || !inScope.has(allocation.markPointId)) {
        violations.push(`allocation references unknown mark point ${allocation.ref}`);
      }
      if (allocation.markPointId !== null && seen.has(allocation.markPointId)) {
        violations.push(`duplicate allocation for mark point ${allocation.ref}`);
      } else if (allocation.markPointId !== null) {
        seen.add(allocation.markPointId);
      }
    }
    return violations;
  },
};

/** CoverageMarkingValidator — every in-scope point decided. */
export const coverageValidator: MarkingValidator = {
  name: () => "coverage",
  validate(candidate, context) {
    const violations: string[] = [];
    const decided = new Set(candidate.allocations.map((a) => a.markPointId));
    for (const point of context.points) {
      if (!decided.has(point.id)) {
        violations.push(`mark point ${point.ref} not decided`);
      }
    }
    return violations;
  },
};

/** MarkSumMarkingValidator — per-point clamp first, then the part ceiling. */
export const markSumValidator: MarkingValidator = {
  name: () => "mark-sum",
  validate(candidate, context) {
    const violations: string[] = [];
    const byId = new Map(context.points.map((p) => [p.id, p]));
    let awarded = 0;
    for (const a of candidate.allocations) {
      const point = byId.get(a.markPointId);
      // per-point clamp first: an over-award on one point must not eat the
      // part budget of the others
      awarded += point === undefined ? 0 : Math.max(0, Math.min(a.marksAwarded, point.marks));
    }
    const ceiling = pointMarkCeiling(context);
    if (awarded > ceiling) {
      violations.push(`awarded ${awarded} exceeds the part's ${ceiling} available marks`);
    }
    return violations;
  },
};

export const DEFAULT_VALIDATORS: MarkingValidator[] = [
  boundsValidator,
  coverageValidator,
  markSumValidator,
];

// ── the pipeline (verbatim law) ─────────────────────────────────────────────

export class SmartMarkPipeline {
  constructor(
    private readonly generator: MarkingCandidateGenerator,
    private readonly validators: MarkingValidator[] = DEFAULT_VALIDATORS,
  ) {}

  async run(context: MarkingContext): Promise<Decision> {
    if (context.points.length === 0) {
      return decisionRejected("NO_SCHEME_POINTS", null);
    }
    const answerText = context.answer.answerText;
    if (answerText === null || answerText.trim() === "") {
      // deterministic short-circuit: no evidence → no marks, no LLM call
      return {
        accepted: true,
        marksAwarded: 0,
        breakdown: blankBreakdown(context.points),
        failureReason: null,
        candidate: null,
      };
    }
    let candidate: MarkingCandidate;
    try {
      candidate = await this.generator.propose(context);
    } catch (e) {
      if (e instanceof CandidateGenerationError) {
        // self-forensic refusals: raw provider output persists for audit;
        // fail-closed semantics are untouched either way
        return e.rawOutput === null
          ? decisionRejected(e.reason, null)
          : decisionRejected(e.reason, { modelId: null, allocations: [], confidence: null, rawOutput: e.rawOutput });
      }
      throw e;
    }
    return decide(candidate, context, this.validators);
  }

  /**
   * One Decision per context, index-aligned. Deterministic short-circuits
   * never reach the generator; the rest goes through proposeAll — ONE
   * provider call for the attempt (v4 batch topology). Fallback ladder: any
   * batch failure (or a non-index-aligned result) re-marks the markable
   * contexts per part through run — one flaky batch call degrades to exactly
   * the pre-batching behaviour; never guess.
   */
  async runBatch(contexts: MarkingContext[]): Promise<Decision[]> {
    const decisions: Decision[] = new Array(contexts.length);
    const markable: number[] = [];
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i]!;
      if (context.points.length === 0) {
        decisions[i] = decisionRejected("NO_SCHEME_POINTS", null);
      } else if (context.answer.answerText === null || context.answer.answerText.trim() === "") {
        decisions[i] = {
          accepted: true,
          marksAwarded: 0,
          breakdown: blankBreakdown(context.points),
          failureReason: null,
          candidate: null,
        };
      } else {
        markable.push(i);
      }
    }
    if (markable.length > 0) {
      const markableContexts = markable.map((i) => contexts[i]!);
      let batch: MarkingCandidate[] | null = null;
      try {
        const proposed = await this.generator.proposeAll(markableContexts);
        batch = Array.isArray(proposed) && proposed.length === markableContexts.length ? proposed : null;
      } catch {
        batch = null; // provider unavailable / truncated / unparseable — refuse as a whole
      }
      if (batch !== null) {
        for (let j = 0; j < markable.length; j++) {
          decisions[markable[j]!] = await decide(batch[j]!, markableContexts[j]!, this.validators);
        }
      } else {
        // fallback ladder: per-part independence preserved
        for (let j = 0; j < markable.length; j++) {
          decisions[markable[j]!] = await this.run(markableContexts[j]!);
        }
      }
    }
    return decisions;
  }
}

function decide(
  candidate: MarkingCandidate,
  context: MarkingContext,
  validators: MarkingValidator[],
): Decision {
  const violations: string[] = [];
  for (const validator of validators) {
    violations.push(...validator.validate(candidate, context));
  }
  if (violations.length > 0) {
    const joined = violations.join("; ");
    const reason = joined.length > 190 ? joined.slice(0, 190) : joined;
    return decisionRejected(`VALIDATION_FAILED: ${reason}`, candidate);
  }
  const byId = new Map(context.points.map((p) => [p.id, p]));
  const breakdown: DecisionBreakdownEntry[] = [];
  let awarded = 0;
  for (const allocation of candidate.allocations) {
    const point = byId.get(allocation.markPointId);
    // per-point partial marks (v3): clamp defensively so a candidate can
    // never exceed the point's worth
    const resolved = point === undefined ? 0 : Math.min(allocation.marksAwarded, point.marks);
    awarded += Math.max(0, resolved);
    breakdown.push({
      markPointId: allocation.markPointId,
      ref: String(allocation.ref),
      marks: point?.marks ?? 0,
      marksAwarded: Math.max(0, resolved),
      awarded: allocation.awarded,
      evidence: String(allocation.evidence),
      rationale: String(allocation.rationale),
    });
  }
  return { accepted: true, marksAwarded: awarded, breakdown, failureReason: null, candidate };
}

function blankBreakdown(points: MarkingPoint[]): DecisionBreakdownEntry[] {
  return points.map((p) => ({
    markPointId: p.id,
    ref: String(p.ref),
    marks: p.marks,
    marksAwarded: 0,
    awarded: false,
    evidence: "",
    rationale: "blank answer: deterministic zero",
  }));
}

// ── views (StudentSmartMarkViews.java verbatim) ─────────────────────────────

export interface PointDecisionView {
  ref: string;
  pointLabel: string;
  marks: number;
  marksAwarded: number;
  awarded: boolean;
  evidence: string;
  rationale: string;
}

export interface PartSmartMarkView {
  partId: string;
  label: string;
  marksAwarded: number;
  marksPossible: number;
  markingState: string;
  /** κ release gate state at marking time — honest, not silent */
  authoritative: boolean;
  confidence: number | null;
  modelId: string | null;
  validationPassed: boolean;
  failureReason: string | null;
  breakdown: PointDecisionView[];
}

export interface AttemptSmartMarkView {
  attemptId: string;
  questionId: string;
  schemeValidationState: string;
  marksPossible: number;
  parts: PartSmartMarkView[];
}

export interface FeedbackExplanationView {
  partId: string;
  explanation: string;
  modelId: string | null;
  generatedAt: string;
}

export interface ImprovementPlanView {
  partId: string;
  plan: string;
  modelId: string | null;
  generatedAt: string;
}

/** SmartMarkResult row as the service selects it back for projection. */
export interface SmartMarkResultRow {
  id: string;
  answer_id: string;
  model_id: string | null;
  marks_awarded: number;
  confidence: number | null;
  validation_passed: boolean;
  breakdown: DecisionBreakdownEntry[] | null;
  failure_reason: string | null;
}

/** The LLM prose seam for the two feedback actions (ephemeral, never stored). */
export interface FeedbackLlm {
  available(): boolean;
  generate(systemPrompt: string, userPrompt: string, temperature: number): Promise<string>;
}

export class SmartFeedbackGenerationError extends Error {}

export type RevealPolicy = "VALIDATED_ONLY" | "INCLUDE_SUGGESTED";

/** SmartMarkAgreementEvaluation row (κ gate read). */
interface AgreementRow {
  passed: boolean;
}

/** answers JOIN question_parts row for the marking paths. */
interface AnswerPartRow {
  id: string;
  question_part_id: string;
  answer_text: string | null;
  marks_awarded: number | null;
  marking_state: string;
  label: string;
  marks: number;
}

interface AttemptLockRow {
  id: string;
  learner_id: string;
  question_id: string;
  exam_paper_id: string | null;
  marking_state: string;
  evidence_emitted: boolean;
}

const SETTABLE_STATES = new Set(["PENDING", "SMART_MARKED"]);
export const PIPELINE_VERSION = "1.3.0";

/**
 * SmartMarkService — the ONE engine (teacher queue + student surface share
 * it; T-MIG-033's teacher marking imports this module).
 */
export class SmartMarkService {
  constructor(
    private readonly sql: SqlFn,
    private readonly generator: MarkingCandidateGenerator,
    private readonly publisher: GradedEvidencePublisher,
    private readonly clock: SubmitClock,
  ) {}

  /** κ release gate (:333-344): newest ALL-scope eval, or the paper-scoped
   * one, must have passed. Absence of any evaluation = gated (fail-closed). */
  async kappaGatePassed(examPaperId: string | null): Promise<boolean> {
    const globalRows = (await this.sql`
      select passed from smart_mark_agreement_evaluations
      where scope = ${"ALL"} order by computed_at desc
    `) as unknown as AgreementRow[];
    const global = globalRows.length > 0 ? globalRows[0]!.passed : false;
    const paper =
      examPaperId !== null
        ? ((await this.sql`
            select passed from smart_mark_agreement_evaluations
            where scope = ${"PAPER"} and exam_paper_id = ${examPaperId}
            order by computed_at desc
          `) as unknown as AgreementRow[])
        : [];
    const paperPassed = paper.length > 0 ? paper[0]!.passed : false;
    return global || paperPassed;
  }

  /**
   * markAttempt (:195-293): the whole attempt's parts in ONE pass; the
   * attempt row lock serializes against self/teacher marking; a mid-pass
   * failure rolls back every provisional state change (transactional parity
   * disclosed at tranche-1: per-statement autocommit — the caller owns the
   * serialization).
   */
  async markAttempt(attemptId: string): Promise<Map<string, SmartMarkResultRow>> {
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, exam_paper_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId} for update
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    const answers = (await this.sql`
      select ans.id, ans.question_part_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             qp.label, qp.marks
      from answers ans join question_parts qp on qp.id = ans.question_part_id
      where ans.attempt_id = ${attemptId}
      order by ans.question_part_id
    `) as unknown as AnswerPartRow[];
    if (answers.length === 0) {
      throw new BadRequestError("attempt carries no part answers");
    }
    const versionRows = (await this.sql`
      select id from question_versions where question_id = ${attempt.question_id}
      order by version desc
    `) as unknown as Array<{ id: string }>;
    if (versionRows.length === 0) throw new NotFoundError("question version", attempt.question_id);
    const versionId = versionRows[0]!.id;

    // newest VALIDATED scheme backs marking; none → honest per-part refusal
    const validatedRows = (await this.sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${versionId} and validation_state = ${"VALIDATED"}
      order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (validatedRows.length === 0) {
      const refusals = new Map<string, SmartMarkResultRow>();
      for (const answer of answers) {
        refusals.set(answer.id, await this.refuseUnvalidatedScheme(answer, versionId));
      }
      return refusals;
    }
    const scheme = validatedRows[0]!;
    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_scheme_points where mark_scheme_id = ${scheme.id} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const points = pointRows.map(toMarkingPoint);

    const contexts: MarkingContext[] = answers.map((answer) => ({
      answer: {
        id: answer.id,
        attemptId,
        questionPartId: answer.question_part_id,
        answerText: answer.answer_text,
        label: answer.label,
        partMarks: answer.marks,
      },
      schemeId: scheme.id,
      schemeValidationState: scheme.validation_state,
      points: points.filter((p) => p.questionPartId === answer.question_part_id),
    }));

    const pipeline = new SmartMarkPipeline(this.generator);
    const decisions = await pipeline.runBatch(contexts);

    const anyAccepted = decisions.some((d) => d.accepted);
    // κ gate evaluated ONCE per pass
    const authoritative = anyAccepted && (await this.kappaGatePassed(attempt.exam_paper_id));

    const results = new Map<string, SmartMarkResultRow>();
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i]!;
      const decision = decisions[i]!;
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
        await this.sql`
          update answers set marks_awarded = ${decision.marksAwarded}, marking_state = ${"SMART_MARKED"}
          where id = ${answer.id}
        `;
        await this.sql`
          update attempts set marking_state = ${"SMART_MARKED"} where id = ${attemptId}
        `;
      }
      results.set(answer.id, resultRow);
    }

    if (anyAccepted) {
      // one recompute after every part is applied
      const total = answers
        .map((a) => {
          const r = results.get(a.id)!;
          return r.validation_passed ? r.marks_awarded : a.marks_awarded ?? 0;
        })
        .filter((m) => m !== null)
        .reduce((s, m) => s + (m ?? 0), 0);
      await this.sql`
        update attempts set marks_awarded = ${total} where id = ${attemptId}
      `;
      if (authoritative) {
        // evidence, exactly like the serial path's completing-part check:
        // fires only when NO part is still PENDING
        const stillPending = answers.some((a) => {
          const r = results.get(a.id)!;
          return !r.validation_passed && a.marking_state === "PENDING";
        });
        if (!stillPending) {
          const secondary = (await this.sql`
            select node_id from question_topics where question_id = ${attempt.question_id}
          `) as unknown as Array<{ node_id: string }>;
          const fired = await this.publisher.publishGraded({
            attemptId,
            learnerId: attempt.learner_id,
            questionId: attempt.question_id,
            marksAwarded: total,
            marksTotal: 0,
            correct: false,
            secondaryTopicNodeIds: secondary.map((r) => String(r.node_id)),
            occurredAt: this.clock.now().toISOString(),
          });
          if (fired) {
            await this.sql`
              update attempts set evidence_emitted = true
              where id = ${attemptId} and evidence_emitted = false
            `;
          }
        }
      }
    }
    return results;
  }

  /** Honest refusal (V34, gap G-2): append-only result row stamped with the
   * scheme it refused — nothing is marked, no state changes, no evidence. */
  private async refuseUnvalidatedScheme(
    answer: AnswerPartRow,
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
}

/**
 * StudentSmartMarkService — the learner half of F-047. One engine: runs the
 * SAME SmartMarkService pipeline as the teacher queue (this file); the
 * student surface adds ownership checks, never a second pipeline.
 */
export class StudentSmartMarkService {
  constructor(
    private readonly sql: SqlFn,
    private readonly smartMark: SmartMarkService,
    private readonly llm: FeedbackLlm,
    private readonly clock: SubmitClock,
    private readonly revealPolicy: RevealPolicy = "VALIDATED_ONLY",
  ) {}

  async smartMarkAttempt(learnerId: string, attemptId: string): Promise<AttemptSmartMarkView> {
    const ctx = await this.loadOwnedAttempt(learnerId, attemptId);
    for (const answer of ctx.answers) {
      if (!SETTABLE_STATES.has(answer.marking_state)) {
        throw new ConflictError(
          `attempt already settled (${answer.marking_state}) -- Smart Mark runs before a self-mark or teacher mark settles it`,
        );
      }
    }
    const scheme = await this.resolveScheme(ctx.attempt.question_id);
    this.requireRevealableScheme(scheme);

    const authoritative = await this.smartMark.kappaGatePassed(ctx.attempt.exam_paper_id);
    // one batched pass: the SAME engine the teacher queue runs
    const results = await this.smartMark.markAttempt(attemptId);
    const parts: PartSmartMarkView[] = [];
    for (const answer of ctx.answers) {
      const result = results.get(answer.id);
      if (result === undefined) {
        throw new Error(`smart mark pass returned no result row for answer ${answer.id}`);
      }
      parts.push(
        await this.project(answer, result, scheme.id, authoritative),
      );
    }
    return {
      attemptId,
      questionId: ctx.attempt.question_id,
      schemeValidationState: scheme.validation_state,
      marksPossible: ctx.questionMarks,
      parts,
    };
  }

  /** "Explain my feedback": grounded walk-through of the recorded per-point
   * decisions — the LLM explains decisions, it never makes them. 409 when no
   * accepted result exists yet. Prose is ephemeral (never persisted). */
  async explainFeedback(learnerId: string, attemptId: string, partId: string): Promise<FeedbackExplanationView> {
    const source = await this.loadFeedbackSource(learnerId, attemptId, partId);
    const text = await this.generate(explainSystemPrompt(), explainUserPrompt(source), 0.2);
    return { partId, explanation: text, modelId: source.result.model_id, generatedAt: this.clock.now().toISOString() };
  }

  /** "Improve my answer": coaching toward the not-awarded mark points. Coach —
   * never answer-writing, never scheme dumps. */
  async improvementPlan(learnerId: string, attemptId: string, partId: string): Promise<ImprovementPlanView> {
    const source = await this.loadFeedbackSource(learnerId, attemptId, partId);
    const text = await this.generate(improveSystemPrompt(), improveUserPrompt(source), 0.3);
    return { partId, plan: text, modelId: source.result.model_id, generatedAt: this.clock.now().toISOString() };
  }

  // ── grounding ─────────────────────────────────────────────────────────────

  private async loadOwnedAttempt(learnerId: string, attemptId: string) {
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, exam_paper_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId} for update
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    if (attempt.learner_id !== learnerId) {
      throw new NotFoundError("attempt", attemptId); // no existence leak
    }
    const questionRows = (await this.sql`
      select id, question_type, marks from questions where id = ${attempt.question_id}
    `) as unknown as Array<{ id: string; question_type: string; marks: number }>;
    const question = questionRows[0]!;
    if (question.question_type !== "STRUCTURED") {
      throw new BadRequestError("smart marking applies to structured attempts only");
    }
    const answers = (await this.sql`
      select ans.id, ans.question_part_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             qp.label, qp.marks
      from answers ans join question_parts qp on qp.id = ans.question_part_id
      where ans.attempt_id = ${attemptId}
      order by ans.question_part_id
    `) as unknown as AnswerPartRow[];
    if (answers.length === 0) {
      throw new BadRequestError("attempt carries no part answers");
    }
    return { attempt, answers, questionMarks: question.marks };
  }

  private async resolveScheme(questionId: string) {
    const versionRows = (await this.sql`
      select id from question_versions where question_id = ${questionId} order by version desc
    `) as unknown as Array<{ id: string }>;
    if (versionRows.length === 0) throw new NotFoundError("question version", questionId);
    const schemeRows = (await this.sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${versionRows[0]!.id} order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (schemeRows.length === 0) throw new NotFoundError("mark scheme", versionRows[0]!.id);
    return schemeRows[0]!;
  }

  /** The reveal-policy mirror (MarkSchemeRevealService parity): REJECTED/
   * FLAGGED never pass; SUGGESTED passes only under INCLUDE_SUGGESTED. */
  private requireRevealableScheme(scheme: { validation_state: string }): void {
    if (scheme.validation_state === "REJECTED" || scheme.validation_state === "FLAGGED") {
      throw new ConflictError(
        "mark scheme is not servable -- Smart Mark is unavailable for this question",
      );
    }
    if (scheme.validation_state === "SUGGESTED" && this.revealPolicy === "VALIDATED_ONLY") {
      throw new ConflictError(
        "mark scheme is pending teacher validation -- Smart Mark is unavailable until it validates",
      );
    }
  }

  private async loadFeedbackSource(learnerId: string, attemptId: string, partId: string) {
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, exam_paper_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId}
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0 || attemptRows[0]!.learner_id !== learnerId) {
      throw new NotFoundError("attempt", attemptId);
    }
    const attempt = attemptRows[0]!;
    const answerRows = (await this.sql`
      select ans.id, ans.question_part_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             qp.label, qp.marks
      from answers ans join question_parts qp on qp.id = ans.question_part_id
      where ans.attempt_id = ${attemptId}
      order by ans.question_part_id
    `) as unknown as AnswerPartRow[];
    const answer = answerRows.find((a) => a.question_part_id === partId);
    if (answer === undefined) throw new NotFoundError("part", partId);
    const resultRows = (await this.sql`
      select id, answer_id, model_id, marks_awarded, confidence, validation_passed,
             breakdown, failure_reason
      from smart_mark_results where answer_id = ${answer.id}
      order by created_at desc
    `) as unknown as SmartMarkResultRow[];
    const result = resultRows.find((r) => r.validation_passed);
    if (result === undefined) {
      throw new ConflictError(
        "no accepted Smart Mark result for this part yet -- run Smart mark first",
      );
    }
    const scheme = await this.resolveScheme(attempt.question_id);
    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_scheme_points where mark_scheme_id = ${scheme.id} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const points = pointRows.map(toMarkingPoint);
    return {
      attempt,
      answer,
      result,
      points: points.filter((p) => p.questionPartId === answer.question_part_id),
    };
  }

  private async project(
    answer: AnswerPartRow,
    result: SmartMarkResultRow,
    schemeId: string,
    authoritative: boolean,
  ): Promise<PartSmartMarkView> {
    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_scheme_points where mark_scheme_id = ${schemeId} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const points = pointRows.map(toMarkingPoint);
    const inScope = points.filter((p) => p.questionPartId === answer.question_part_id);
    const byId = new Map(inScope.map((p) => [p.id, p]));
    const breakdown: PointDecisionView[] = [];
    if (result.breakdown !== null) {
      for (const entry of result.breakdown) {
        const point = byId.get(entry.markPointId);
        breakdown.push({
          ref: String(entry.ref),
          pointLabel: point === undefined ? String(entry.ref) : pointLabel(point),
          marks: point?.marks ?? 0,
          marksAwarded: entry.marksAwarded,
          awarded: entry.awarded === true,
          evidence: String(entry.evidence ?? ""),
          rationale: String(entry.rationale ?? ""),
        });
      }
    }
    return {
      partId: answer.question_part_id,
      label: answer.label,
      marksAwarded: result.marks_awarded,
      marksPossible: inScope.reduce((s, p) => s + p.marks, 0),
      markingState: result.validation_passed ? "SMART_MARKED" : answer.marking_state,
      authoritative: authoritative && result.validation_passed,
      confidence: result.confidence,
      modelId: result.model_id,
      validationPassed: result.validation_passed,
      failureReason: result.failure_reason,
      breakdown,
    };
  }

  /** generate(:372-392): availability gate, empty-response guard, provider
   * errors → honest 503-shaped text (the route layer maps the error type). */
  private async generate(systemPrompt: string, userPrompt: string, temperature: number): Promise<string> {
    if (!this.llm.available()) {
      throw new SmartFeedbackGenerationError(
        "the marking feedback engine is temporarily unavailable -- try again shortly",
      );
    }
    const text = await this.llm.generate(systemPrompt, userPrompt, temperature);
    if (text === null || text.trim() === "") {
      throw new SmartFeedbackGenerationError("feedback generation returned an empty response -- try again");
    }
    return text.trim();
  }
}

/** pointLabel: the compact first meaningful line — the full scheme text never
 * leaks through the breakdown (operator scenario 2026-09-21). */
function pointLabel(point: MarkingPoint): string {
  const line = point.text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? point.ref;
}

// ── feedback prompts (verbatim law) ─────────────────────────────────────────

interface FeedbackSource {
  answer: AnswerPartRow;
  points: MarkingPoint[];
  result: SmartMarkResultRow;
}

export function explainSystemPrompt(): string {
  return `You are an exam tutor explaining a marking result to an IGCSE student.
You are given the question part, the student's answer, and the final
per-mark-point decisions (including partial marks) produced by the
marking pipeline. Structure your explanation EXACTLY like this:
1. One opening sentence: the marks earned out of the marks possible.
2. One short paragraph per mark point, in the order given, opening
   with the point's marks (e.g. "b: 1 of 3") — say what earned
   the credit (quoting the student's own words) and, for lost
   marks, exactly which sub-point content was missing.
3. If nothing was earned on a point, one sentence naming the
   specific missing content — never a generic fact dump.
Never change a mark decision, never invent mark points, never add
requirements beyond the provided decisions. Be specific and
encouraging. Under 200 words. Plain text; short paragraphs; no
markdown headings.`;
}

export function explainUserPrompt(source: FeedbackSource): string {
  return `${appendContext(source)}
TASK: Explain this marking result to the student — point by point,
in the order above. Start with one sentence on the overall result.
`;
}

export function improveSystemPrompt(): string {
  return `You are an exam coach helping an IGCSE student improve a marked answer.
You receive the question part, the student's answer, and the final
per-mark-point decisions (including partial marks). Structure your
coaching EXACTLY like this:
1. One opening sentence naming the marks still available (the gap
   between marks earned and marks possible).
2. For every point that lost marks — whole or partial — one short
   paragraph: what the student wrote vs. what the examiner needed
   for the missing sub-point, then ONE concrete actionable step
   phrased so the student could earn it next time. Stay tied to
   the missing sub-points; no general topic summaries, no facts
   the missing marks do not depend on.
3. If every mark was awarded, give one examiner-technique tip to
   make the answer examiner-proof instead.
Coach — do NOT write a finished answer for the student, do NOT
quote the mark scheme verbatim, do NOT change any mark decision.
Under 200 words. Plain text; short paragraphs; no markdown headings.`;
}

export function improveUserPrompt(source: FeedbackSource): string {
  return `${appendContext(source)}
TASK: Coach the student toward the missing marks (or give one
examiner-technique tip if everything was awarded).
`;
}

function appendContext(source: FeedbackSource): string {
  const byId = new Map(source.points.map((p) => [p.id, p]));
  const lines: string[] = [];
  lines.push(`QUESTION PART (${source.answer.label}):`);
  lines.push("");
  lines.push("STUDENT ANSWER:");
  lines.push(source.answer.answer_text ?? "");
  lines.push("");
  lines.push("MARKING DECISIONS:");
  for (const entry of source.result.breakdown ?? []) {
    const point = byId.get(entry.markPointId);
    const text = point === undefined ? entry.ref : point.text;
    lines.push(
      `- ${entry.ref} (${entry.marksAwarded}/${point?.marks ?? 0}${entry.awarded ? ", awarded" : ""}): ${text}`,
    );
  }
  return lines.join("\n");
}

export function buildSmartMarkModule(
  sql: SqlFn,
  generator: MarkingCandidateGenerator,
  publisher: GradedEvidencePublisher,
  clock: SubmitClock,
  llm: FeedbackLlm,
  revealPolicy: RevealPolicy = "VALIDATED_ONLY",
) {
  const smartMark = new SmartMarkService(sql, generator, publisher, clock);
  return {
    smartMark,
    student: new StudentSmartMarkService(sql, smartMark, llm, clock, revealPolicy),
  };
}
