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
 *   BandMarkingPipeline    — the ADR-040 §5.4 band dispatch leg: the LEVELS
 *                            analog of the point pipeline (blank →
 *                            deterministic zero, band validators trio, ONE
 *                            provider call + the §2.2 hard-range ONE retry).
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
  assembleGradedEvidenceEvent,
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

/** Raw mark_points row (snake columns) → the camel projection. */
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

// ── band marking types (ADR-040 §2.2 — the LEVELS analogs) ──────────────────

export interface MarkingBand {
  id: string;
  levelIndex: number;
  marksMin: number;
  marksMax: number;
  descriptorMd: string;
  guidanceMd: string | null;
}

/** Raw mark_bands row (snake columns) → the camel projection. */
export function toMarkingBand(r: Record<string, unknown>): MarkingBand {
  return {
    id: String(r.id),
    levelIndex: Number(r.level_index),
    marksMin: Number(r.marks_min),
    marksMax: Number(r.marks_max),
    descriptorMd: String(r.descriptor_md),
    guidanceMd: r.guidance_md === null || r.guidance_md === undefined ? null : String(r.guidance_md),
  };
}

export interface BandMarkingContext {
  answer: MarkingAnswerRef;
  schemeId: string;
  schemeValidationState: string;
  /** the scheme's levels, ordered by level_index ascending */
  bands: MarkingBand[];
  /** question_parts.prompt — the LEVELS prompt sends the question text (§2.2) */
  partPrompt: string | null;
  /** mark_schemes.general_guidance — SENT for LEVELS from day one (§2.2;
   *  the point path discloses it as unsent, issue #276 §4.8) */
  generalGuidance: string | null;
}

export interface DescriptorHit {
  levelIndex: number;
  hit: boolean;
  rationale: string;
}

/** The generator's proposal: one ordinal placement + a within-band mark +
 *  the descriptor transparency. */
export interface BandPlacementCandidate {
  modelId: string | null;
  levelPlacement: number | null;
  awardedMarks: number;
  descriptorHits: DescriptorHit[];
  confidence: number | null;
  rawOutput: string | null;
}

/** The pinned breakdown shape of record for band rows (ADR-040 §2.2):
 *  smart_mark_results.breakdown carries this object (the point path stores
 *  the per-point array). */
export interface BandDecisionV1 {
  shape: "band_decision_v1";
  level_placement: number | null;
  awarded_marks: number;
  descriptor_hits: Array<{ level_index: number; hit: boolean; rationale: string }>;
  /** deterministic zero (R7 analog): no placement, no LLM call */
  blank?: boolean;
}

const BAND_DECISION_SHAPE = "band_decision_v1";

export function isBandDecisionV1(value: unknown): value is BandDecisionV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.shape === BAND_DECISION_SHAPE && typeof rec.awarded_marks === "number";
}

export interface BandDecision {
  accepted: boolean;
  marksAwarded: number;
  breakdown: BandDecisionV1;
  failureReason: string | null;
  candidate: BandPlacementCandidate | null;
}

/** The deterministic correction envelope for the §2.2 hard-range retry:
 *  the violations are stated back verbatim — never a fresh prompt, never a
 *  silent clamp. */
export interface BandCorrection {
  violations: string[];
}

/** BandMarkingCandidateGenerator — the injected LLM seam for LEVELS parts
 *  (lifecycle-gated surface, the band analog of MarkingCandidateGenerator). */
export interface BandMarkingCandidateGenerator {
  proposeBand(context: BandMarkingContext, correction?: BandCorrection): Promise<BandPlacementCandidate>;
  proposeBandsAll(contexts: BandMarkingContext[]): Promise<BandPlacementCandidate[]>;
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

// ── the band validators trio (ADR-040 §2.2 — pure, deterministic) ───────────

export interface BandValidator {
  name(): string;
  validate(candidate: BandPlacementCandidate, context: BandMarkingContext): string[];
}

/** BandScopeMarkingValidator — the bounds analog: the placement and every
 *  descriptor hit reference an in-scope level of the bound scheme. */
export const bandScopeValidator: BandValidator = {
  name: () => "band-scope",
  validate(candidate, context) {
    const violations: string[] = [];
    const inScope = new Set(context.bands.map((b) => b.levelIndex));
    if (candidate.levelPlacement !== null && !inScope.has(candidate.levelPlacement)) {
      violations.push(`placement references unknown level ${candidate.levelPlacement}`);
    }
    for (const hit of candidate.descriptorHits) {
      if (!inScope.has(hit.levelIndex)) {
        violations.push(`descriptor hit references unknown level ${hit.levelIndex}`);
      }
    }
    return violations;
  },
};

/** BandPlacementMarkingValidator — the coverage analog: exactly ONE level
 *  placement decided (no placement = no decision of record). */
export const bandPlacementValidator: BandValidator = {
  name: () => "band-placement",
  validate(candidate) {
    return candidate.levelPlacement === null ? ["no level placement decided"] : [];
  },
};

/** The range validator's message prefix — the pipeline classifies on it for
 *  the §2.2 hard-range retry law (only range violations are retryable). */
export const BAND_RANGE_PREFIX = "band-range: ";

/** BandRangeMarkingValidator — the HARD RANGE LAW (ADR-040 §2.2): awarded
 *  marks must sit inside the placed band's [marks_min, marks_max]. Outside
 *  is a violation, never a clamp target — silent clamping is forbidden. */
export const bandRangeValidator: BandValidator = {
  name: () => "band-range",
  validate(candidate, context) {
    const violations: string[] = [];
    if (candidate.levelPlacement === null) return violations;
    const placed = context.bands.find((b) => b.levelIndex === candidate.levelPlacement);
    if (placed === undefined) return violations; // the scope validator names it
    if (candidate.awardedMarks < placed.marksMin || candidate.awardedMarks > placed.marksMax) {
      violations.push(
        `${BAND_RANGE_PREFIX}awarded marks ${candidate.awardedMarks} fall outside the placed level ${placed.levelIndex} range ${placed.marksMin}..${placed.marksMax}`,
      );
    }
    return violations;
  },
};

export const DEFAULT_BAND_VALIDATORS: BandValidator[] = [
  bandScopeValidator,
  bandPlacementValidator,
  bandRangeValidator,
];

export function isBandRangeViolation(violation: string): boolean {
  return violation.startsWith(BAND_RANGE_PREFIX);
}

export function bandDecisionRejected(
  reason: string,
  candidate: BandPlacementCandidate | null,
): BandDecision {
  return {
    accepted: false,
    marksAwarded: 0,
    breakdown: { shape: BAND_DECISION_SHAPE, level_placement: null, awarded_marks: 0, descriptor_hits: [] },
    failureReason: reason,
    candidate,
  };
}

/** deterministic zero for a blank answer: no placement, no LLM call (R7). */
export function blankBandBreakdown(): BandDecisionV1 {
  return {
    shape: BAND_DECISION_SHAPE,
    level_placement: null,
    awarded_marks: 0,
    descriptor_hits: [],
    blank: true,
  };
}

function candidateToBreakdown(candidate: BandPlacementCandidate): BandDecisionV1 {
  return {
    shape: BAND_DECISION_SHAPE,
    level_placement: candidate.levelPlacement,
    awarded_marks: candidate.awardedMarks,
    descriptor_hits: candidate.descriptorHits.map((h) => ({
      level_index: h.levelIndex,
      hit: h.hit,
      rationale: h.rationale,
    })),
  };
}

function emptyBandCandidate(): BandPlacementCandidate {
  return {
    modelId: null,
    levelPlacement: null,
    awardedMarks: 0,
    descriptorHits: [],
    confidence: null,
    rawOutput: null,
  };
}

function runBandValidators(
  candidate: BandPlacementCandidate,
  context: BandMarkingContext,
  validators: BandValidator[],
): string[] {
  const violations: string[] = [];
  for (const validator of validators) {
    violations.push(...validator.validate(candidate, context));
  }
  return violations;
}

function trimViolations(violations: string[]): string {
  const joined = violations.join("; ");
  return joined.length > 190 ? joined.slice(0, 190) : joined;
}

/** BandMarkingPipeline — the LEVELS analog of SmartMarkPipeline: pure
 *  orchestration, never mutates, never invents marks. Blank answers
 *  short-circuit to the deterministic zero; everything else rides ONE
 *  proposeBand call — plus, when the candidate violates ONLY the hard range
 *  law, exactly ONE deterministic retry with the violations stated back
 *  (ADR-040 §2.2), then the honest refusal. Batch topology mirrors the v4
 *  point envelope with the per-part fallback ladder. */
export class BandMarkingPipeline {
  constructor(
    private readonly generator: BandMarkingCandidateGenerator,
    private readonly validators: BandValidator[] = DEFAULT_BAND_VALIDATORS,
  ) {}

  async run(context: BandMarkingContext): Promise<BandDecision> {
    if (context.bands.length === 0) {
      return bandDecisionRejected("NO_SCHEME_BANDS", null);
    }
    const answerText = context.answer.answerText;
    if (answerText === null || answerText.trim() === "") {
      // deterministic short-circuit: no evidence → no placement, no LLM call
      return {
        accepted: true,
        marksAwarded: 0,
        breakdown: blankBandBreakdown(),
        failureReason: null,
        candidate: null,
      };
    }
    let candidate: BandPlacementCandidate;
    try {
      candidate = await this.generator.proposeBand(context);
    } catch (e) {
      if (e instanceof CandidateGenerationError) {
        // self-forensic refusals: raw provider output persists for audit
        return e.rawOutput === null
          ? bandDecisionRejected(e.reason, null)
          : bandDecisionRejected(e.reason, { ...emptyBandCandidate(), rawOutput: e.rawOutput });
      }
      throw e;
    }
    return this.resolve(candidate, context);
  }

  /**
   * One BandDecision per context, index-aligned. Deterministic short-circuits
   * never reach the generator; the rest goes through proposeBandsAll — ONE
   * provider call for the attempt. A batch failure (or a non-index-aligned
   * result) degrades to exactly the per-part topology through run — never
   * guess. Per-part range retries stay bounded inside resolve.
   */
  async runBatch(contexts: BandMarkingContext[]): Promise<BandDecision[]> {
    const decisions: BandDecision[] = new Array(contexts.length);
    const markable: number[] = [];
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i]!;
      if (context.bands.length === 0) {
        decisions[i] = bandDecisionRejected("NO_SCHEME_BANDS", null);
      } else if (context.answer.answerText === null || context.answer.answerText.trim() === "") {
        decisions[i] = {
          accepted: true,
          marksAwarded: 0,
          breakdown: blankBandBreakdown(),
          failureReason: null,
          candidate: null,
        };
      } else {
        markable.push(i);
      }
    }
    if (markable.length > 0) {
      const markableContexts = markable.map((i) => contexts[i]!);
      let batch: BandPlacementCandidate[] | null = null;
      try {
        const proposed = await this.generator.proposeBandsAll(markableContexts);
        batch = Array.isArray(proposed) && proposed.length === markableContexts.length ? proposed : null;
      } catch {
        batch = null; // provider unavailable / truncated / unparseable — refuse as a whole
      }
      for (let j = 0; j < markable.length; j++) {
        const context = markableContexts[j]!;
        decisions[markable[j]!] =
          batch !== null ? await this.resolve(batch[j]!, context) : await this.run(context);
      }
    }
    return decisions;
  }

  /** The §2.2 hard range law: violations that are EXCLUSIVELY band-range
   *  violations get ONE deterministic retry; structural violations (unknown
   *  level, missing placement) refuse immediately. Still outside after the
   *  retry → the honest BAND_RANGE_VIOLATION refusal, raw output attached. */
  private async resolve(
    candidate: BandPlacementCandidate,
    context: BandMarkingContext,
  ): Promise<BandDecision> {
    let violations = runBandValidators(candidate, context, this.validators);
    if (violations.length > 0 && violations.every(isBandRangeViolation)) {
      try {
        candidate = await this.generator.proposeBand(context, { violations });
      } catch (e) {
        if (e instanceof CandidateGenerationError) {
          return e.rawOutput === null
            ? bandDecisionRejected(e.reason, null)
            : bandDecisionRejected(e.reason, { ...emptyBandCandidate(), rawOutput: e.rawOutput });
        }
        throw e;
      }
      violations = runBandValidators(candidate, context, this.validators);
      if (violations.length > 0) {
        return bandDecisionRejected(
          violations.every(isBandRangeViolation)
            ? "BAND_RANGE_VIOLATION"
            : `VALIDATION_FAILED: ${trimViolations(violations)}`,
          candidate,
        );
      }
      return this.accept(candidate);
    }
    if (violations.length > 0) {
      return bandDecisionRejected(`VALIDATION_FAILED: ${trimViolations(violations)}`, candidate);
    }
    return this.accept(candidate);
  }

  private accept(candidate: BandPlacementCandidate): BandDecision {
    return {
      accepted: true,
      marksAwarded: candidate.awardedMarks,
      breakdown: candidateToBreakdown(candidate),
      failureReason: null,
      candidate,
    };
  }
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
  /** ADR-040 §5.4: present ONLY for band-marked parts (the breakdown shape
   *  of record is band_decision_v1); breakdown stays empty for them. */
  bandDecision?: BandDecisionView;
}

/** The student-view projection of a band decision — the descriptor label is
 *  the compact first meaningful line (the full scheme text never leaks
 *  through the breakdown, mirroring pointLabel's law). */
export interface BandDecisionView {
  levelPlacement: number | null;
  awardedMarks: number;
  marksPossible: number;
  descriptorHits: Array<{ levelIndex: number; descriptorLabel: string; hit: boolean; rationale: string }>;
  blank: boolean;
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

/** SmartMarkResult row as the service selects it back for projection.
 *  ADR-040 §5.4: breakdown is the per-point array for POINTS rows and the
 *  pinned band_decision_v1 object for LEVELS rows. */
export interface SmartMarkResultRow {
  id: string;
  answer_id: string;
  model_id: string | null;
  marks_awarded: number;
  confidence: number | null;
  validation_passed: boolean;
  breakdown: DecisionBreakdownEntry[] | BandDecisionV1 | null;
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
  /** join-derived from questions.exam_paper_id — the frozen core reads paper
   *  scope off attempt.question() (SmartMarkService.java :139/:236,
   *  StudentSmartMarkService.java :163); the attempts table has no such column
   *  on the live baseline (42703 — T-MIG-050 R-050-A). */
  exam_paper_id: string | null;
  marking_state: string;
  evidence_emitted: boolean;
}

const SETTABLE_STATES = new Set(["PENDING", "SMART_MARKED"]);
export const PIPELINE_VERSION = "1.3.0";
/** ADR-040 §5.4: band rows stamp their own pipeline version — the flipped
 *  point set keeps 1.3.0 byte-identically (provenance, never a shared bump). */
export const BAND_PIPELINE_VERSION = "1.4.0";

/** ADR-040 §5.5 — the smart_mark_agreement_evaluations.metric discriminator
 *  (migration 0015's CHECK law): point rows carry POINT_UNWEIGHTED (the
 *  column default — every pre-existing row reads it), band rows carry
 *  BAND_QWK. The gate reads and the eval inserts are metric-kind-hard:
 *  one kind's rows can never release or calibrate the other's parts. */
export const METRIC_POINT_UNWEIGHTED = "POINT_UNWEIGHTED";
export const METRIC_BAND_QWK = "BAND_QWK";

/**
 * SmartMarkService — the ONE engine (teacher queue + student surface share
 * it; T-MIG-033's teacher marking imports this module).
 */

/** The structural shape applyAttemptDecisions consumes — Decision and
 *  BandDecision both satisfy it (the breakdown payload is kind-specific:
 *  per-point array vs the pinned band_decision_v1 object). */
interface ProvisionalDecision {
  accepted: boolean;
  marksAwarded: number;
  breakdown: unknown;
  failureReason: string | null;
  candidate: { modelId: string | null; confidence: number | null; rawOutput: string | null } | null;
}

export class SmartMarkService {
  constructor(
    private readonly sql: SqlFn,
    private readonly generator: MarkingCandidateGenerator,
    private readonly publisher: GradedEvidencePublisher,
    private readonly clock: SubmitClock,
    /** ADR-040 §5.4: the band dispatch seam. Absent (unwired legacy
     *  construction) → VALIDATED LEVELS schemes keep the §5.2 posture:
     *  per-part NO_SCHEME_BANDS refusals, no state change. */
    private readonly bandGenerator?: BandMarkingCandidateGenerator,
  ) {}

  /** κ release gate (:333-344 + T-SM-KAPPA-SUBJECT / D2, #29 comment 3):
   * newest ALL-scope eval, OR the paper-scoped one, OR the subject-scoped
   * one for the question's subject, must have passed. Absence of any
   * evaluation = gated (fail-closed, unchanged).
   *
   * ADR-040 §5.5 — the gate is METRIC-KIND-AWARE: `metric` (default
   * POINT_UNWEIGHTED, every pre-existing point caller byte-unchanged) is a
   * hard filter on ALL three reads — a BAND_QWK row can never release a
   * point part and a POINT_UNWEIGHTED row can never release a band part.
   * The band dispatch (markAttemptBands → applyAttemptDecisions) passes
   * METRIC_BAND_QWK; the mixed-course flip law (green on every metric kind
   * present) holds because each kind's rows only ever release their own
   * kind's attempts.
   *
   * Subject derivation (R2-audit-verified shape, #29 comment 2 addendum):
   * paper-bound questions resolve through exam_papers.subject_id;
   * topic-anchored questions walk the knowledge tree via question_topics ∪
   * question_spec_points up PART_OF edges to a SUBJECT node →
   * subjects.knowledge_node_id. The relation_type = 'PART_OF' filter and
   * the depth guard are LOAD-BEARING: the prereq-graph edges
   * (REQUIRES_PREREQUISITE / EXPLAINED_BY / REMEDIATED_BY) contain cycles —
   * an unfiltered walk does not terminate. ~105/11,879 corpus questions are
   * tree-unlinkable: for those the SUBJECT lane is skipped (no subject →
   * no eval row can match) and the gate stays fail-closed on ALL/PAPER.
   * teachermarking's evaluateAgreementForSubject mirrors this derivation —
   * full-literal SQL per the no-.raw() fleet convention. */
  async kappaGatePassed(
    examPaperId: string | null,
    questionId: string,
    metric: string = METRIC_POINT_UNWEIGHTED,
  ): Promise<boolean> {
    const globalRows = (await this.sql`
      select passed from smart_mark_agreement_evaluations
      where scope = ${"ALL"} and metric = ${metric} order by computed_at desc
    `) as unknown as AgreementRow[];
    const global = globalRows.length > 0 ? globalRows[0]!.passed : false;
    const paper =
      examPaperId !== null
        ? ((await this.sql`
            select passed from smart_mark_agreement_evaluations
            where scope = ${"PAPER"} and exam_paper_id = ${examPaperId} and metric = ${metric}
            order by computed_at desc
          `) as unknown as AgreementRow[])
        : [];
    const paperPassed = paper.length > 0 ? paper[0]!.passed : false;
    if (global || paperPassed) return true;

    const subjectRows = (await this.sql`
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
      select e2.passed from smart_mark_agreement_evaluations e2
      where e2.scope = ${"SUBJECT"}
        and e2.metric = ${metric}
        and e2.subject_id = (select subject_id from qsub
                             where question_id = ${questionId}
                             order by subject_id limit 1)
      order by e2.computed_at desc limit 1
    `) as unknown as AgreementRow[];
    return subjectRows.length > 0 ? subjectRows[0]!.passed : false;
  }

  /**
   * markAttempt (:195-293): the whole attempt's parts in ONE pass; the
   * attempt row lock serializes against self/teacher marking; a mid-pass
   * failure rolls back every provisional state change (transactional parity
   * disclosed at tranche-1: per-statement autocommit — the caller owns the
   * serialization).
   *
   * DC-3 (docs/DC3-REATTEMPT-ENTITLEMENT-PLAN.md): optional `tx` — the
   * entitlement envelope runs the WHOLE pass on the caller's transaction
   * (advisory lock → ordinal counts → policy decision → this pass → the
   * append-only ai_mark_events stamp, atomic). Absent = the historical
   * autocommit posture byte-identical (every existing caller unchanged).
   */
  async markAttempt(attemptId: string, tx?: SqlFn): Promise<Map<string, SmartMarkResultRow>> {
    const db = tx ?? this.sql;
    // paper scope via the attempt→question join (frozen derivation —
    // kappaGatePassed(question.examPaperId())); "for update of a" keeps the
    // lock surface on the attempt row only, matching the frozen pessimistic
    // read (the question load is unlocked there too).
    const attemptRows = (await db`
      select a.id, a.learner_id, a.question_id, a.marking_state, a.evidence_emitted,
             q.exam_paper_id
      from attempts a join questions q on q.id = a.question_id
      where a.id = ${attemptId} for update of a
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    const answers = (await db`
      select ans.id, ans.question_part_id, ans.answer_text, ans.marks_awarded, ans.marking_state,
             qp.label, qp.marks
      from answers ans join question_parts qp on qp.id = ans.question_part_id
      where ans.attempt_id = ${attemptId}
      order by ans.question_part_id
    `) as unknown as AnswerPartRow[];
    if (answers.length === 0) {
      throw new BadRequestError("attempt carries no part answers");
    }
    const versionRows = (await db`
      select id from question_versions where question_id = ${attempt.question_id}
      order by version desc
    `) as unknown as Array<{ id: string }>;
    if (versionRows.length === 0) throw new NotFoundError("question version", attempt.question_id);
    const versionId = versionRows[0]!.id;

    // ADR-040 §2.2 as amended (operator ruling A, trace 1a1776dff15bb991,
    // receipt adr040-bandshape-fit-r0): VALIDATED schemes resolve per PART —
    // a part-bound LEVELS scheme backs its part, the version-level unbound
    // scheme (the historical single scheme) backs the rest. Newest-first
    // scan keeps the newest law within each binding slot. None at all → the
    // honest per-part refusal (unchanged).
    const validatedRows = (await db`
      select id, validation_state, scheme_kind, question_part_id from mark_schemes
      where question_version_id = ${versionId} and validation_state = ${"VALIDATED"}
      order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string; scheme_kind: string | null; question_part_id: string | null }>;
    if (validatedRows.length === 0) {
      const refusals = new Map<string, SmartMarkResultRow>();
      for (const answer of answers) {
        refusals.set(answer.id, await this.refuseUnvalidatedScheme(answer, versionId, tx));
      }
      return refusals;
    }
    const byPart = new Map<string, { id: string; validation_state: string; scheme_kind: string | null }>();
    let unbound: { id: string; validation_state: string; scheme_kind: string | null } | null = null;
    for (const r of validatedRows) {
      const pid = r.question_part_id == null ? null : String(r.question_part_id);
      if (pid === null) {
        if (unbound === null) unbound = r;
      } else if (!byPart.has(pid)) {
        byPart.set(pid, r);
      }
    }

    // OD-1 MA-10 (multi-axis R4 consumption law, r0): a part with TWO OR
    // MORE VALIDATED part-bound LEVELS siblings is a multi-axis printed
    // grid — the per-axis dispatch leg is not wired yet, so a single-scheme
    // dispatch here would range-check an 8/12-mark essay against ONE axis's
    // bands. Refuse honestly (append-only row, nothing marked, no state
    // change) until PR-B wires the per-axis leg; single-axis parts are
    // unaffected (exactly one part-bound LEVELS sibling).
    const levelSiblingsByPart = new Map<string, number>();
    for (const r of validatedRows) {
      if ((r.scheme_kind ?? "POINTS") !== "LEVELS" || r.question_part_id == null) continue;
      const pid = String(r.question_part_id);
      levelSiblingsByPart.set(pid, (levelSiblingsByPart.get(pid) ?? 0) + 1);
    }

    // group the attempt's answers per resolved scheme; a part with no
    // resolvable scheme refuses honestly (V34 — the newest scheme stamps it)
    const groups = new Map<string, { scheme: { id: string; validation_state: string; scheme_kind: string | null }; answers: AnswerPartRow[] }>();
    const results = new Map<string, SmartMarkResultRow>();
    for (const answer of answers) {
      if ((levelSiblingsByPart.get(String(answer.question_part_id)) ?? 0) >= 2) {
        results.set(answer.id, await this.refuseMultiAxisDispatch(answer, versionId, tx));
        continue;
      }
      const scheme = byPart.get(String(answer.question_part_id)) ?? unbound;
      if (scheme === null) {
        results.set(answer.id, await this.refuseUnvalidatedScheme(answer, versionId, tx));
        continue;
      }
      const group = groups.get(scheme.id);
      if (group) group.answers.push(answer);
      else groups.set(scheme.id, { scheme, answers: [answer] });
    }

    // ONE dispatch per resolved scheme — no guessing; each kind rides the
    // same eligibility line (markAttempt ran it above), and band parts
    // still refuse honestly until their scheme is VALIDATED.
    for (const group of groups.values()) {
      if ((group.scheme.scheme_kind ?? "POINTS") === "LEVELS") {
        const bandResults = await this.markAttemptBands(db, attempt, group.answers, versionId, group.scheme, tx);
        for (const [k, v] of bandResults) results.set(k, v);
      } else {
        const pointResults = await this.markAttemptPoints(db, attempt, group.answers, group.scheme, tx);
        for (const [k, v] of pointResults) results.set(k, v);
      }
    }
    return results;
  }

  /** The point marking path for ONE resolved scheme's answer group (the
   *  historical markAttempt point leg, unchanged byte-for-byte except that
   *  `answers` may now be the part-bound group subset under ruling A). */
  private async markAttemptPoints(
    db: SqlFn,
    attempt: AttemptLockRow,
    answers: AnswerPartRow[],
    scheme: { id: string; validation_state: string; scheme_kind: string | null },
    tx?: SqlFn,
  ): Promise<Map<string, SmartMarkResultRow>> {
    const pointRows = (await db`
      select id, ref, ordering, text, marks, question_part_id
      from mark_points where mark_scheme_id = ${scheme.id} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const points = pointRows.map(toMarkingPoint);

    const contexts: MarkingContext[] = answers.map((answer) => ({
      answer: {
        id: answer.id,
        attemptId: attempt.id,
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

    return await this.applyAttemptDecisions(db, attempt, answers, scheme, decisions, PIPELINE_VERSION);
  }

  /** ADR-040 §5.4 — the band marking path for a VALIDATED LEVELS scheme
   *  (markAttempt topology). Unwired band seam → the §5.2 posture (per-part
   *  NO_SCHEME_BANDS refusals, append-only, no state change); empty bands on
   *  a wired seam → the same honest refusal (the LEVELS analog of
   *  NO_SCHEME_POINTS). Otherwise: bands + general guidance + part prompts
   *  load in three bounded reads (two-step retrieval, no N+1), the band
   *  pipeline decides, and the SHARED tail applies — append-only rows, state
   *  writes, κ gate, evidence — exactly like the point path. */
  private async markAttemptBands(
    db: SqlFn,
    attempt: AttemptLockRow,
    answers: AnswerPartRow[],
    versionId: string,
    scheme: { id: string; validation_state: string; scheme_kind: string | null },
    tx?: SqlFn,
  ): Promise<Map<string, SmartMarkResultRow>> {
    const bandGen = this.bandGenerator;
    if (bandGen === undefined) {
      return await this.refuseBandParts(db, answers, scheme, tx);
    }
    // internal guard + general guidance in ONE re-read: a kind mismatch
    // between dispatch and the bound scheme refuses loudly — never silently
    // re-routes (ADR-040 §2.2).
    const schemeFullRows = (await db`
      select validation_state, scheme_kind, general_guidance from mark_schemes where id = ${scheme.id}
    `) as unknown as Array<{ validation_state: string; scheme_kind: string | null; general_guidance: string | null }>;
    if (schemeFullRows.length === 0) throw new NotFoundError("mark scheme", scheme.id);
    const schemeFull = schemeFullRows[0]!;
    if ((schemeFull.scheme_kind ?? "POINTS") !== "LEVELS") {
      throw new ConflictError("mark scheme kind changed between dispatch and read -- refusing loudly");
    }
    const bandRows = (await db`
      select id, level_index, marks_min, marks_max, descriptor_md, guidance_md
      from mark_bands where mark_scheme_id = ${scheme.id} order by level_index
    `) as unknown as Array<Record<string, unknown>>;
    const bands = bandRows.map(toMarkingBand);
    if (bands.length === 0) {
      // NO_SCHEME_BANDS: a validated LEVELS scheme with no levels rows is
      // not band-markable — the honest refusal keeps telemetry truthful.
      return await this.refuseBandParts(db, answers, scheme, tx);
    }
    const promptRows = (await db`
      select id, prompt from question_parts where question_version_id = ${versionId}
    `) as unknown as Array<Record<string, unknown>>;
    const promptById = new Map(promptRows.map((r) => [String(r.id), String(r.prompt)]));

    const contexts: BandMarkingContext[] = answers.map((answer) => ({
      answer: {
        id: answer.id,
        attemptId: attempt.id,
        questionPartId: answer.question_part_id,
        answerText: answer.answer_text,
        label: answer.label,
        partMarks: answer.marks,
      },
      schemeId: scheme.id,
      schemeValidationState: scheme.validation_state,
      bands,
      partPrompt: promptById.get(answer.question_part_id) ?? null,
      generalGuidance: schemeFull.general_guidance,
    }));

    const bandPipeline = new BandMarkingPipeline(bandGen);
    const bandDecisions = await bandPipeline.runBatch(contexts);
    return await this.applyAttemptDecisions(db, attempt, answers, scheme, bandDecisions, BAND_PIPELINE_VERSION, METRIC_BAND_QWK);
  }

  /** Per-part NO_SCHEME_BANDS refusals (append-only rows, no state change) —
   *  the §5.2 posture, retired to the unwired-seam / empty-bands guard. */
  private async refuseBandParts(
    db: SqlFn,
    answers: AnswerPartRow[],
    scheme: { id: string; validation_state: string },
    tx?: SqlFn,
  ): Promise<Map<string, SmartMarkResultRow>> {
    const refusals = new Map<string, SmartMarkResultRow>();
    for (const answer of answers) {
      refusals.set(answer.id, await this.refuseBandScheme(answer, scheme, tx));
    }
    return refusals;
  }

  /** The shared tail of markAttempt (point + band dispatches): append-only
   *  result rows stamped with the scheme of record, provisional state
   *  writes, the ONE attempt-total recompute, and the κ-gated graded
   *  evidence. decisions are index-aligned with answers. The pipeline
   *  version stamps provenance per kind (1.3.0 points / 1.4.0 bands). */
  private async applyAttemptDecisions(
    db: SqlFn,
    attempt: AttemptLockRow,
    answers: AnswerPartRow[],
    scheme: { id: string; validation_state: string },
    decisions: ProvisionalDecision[],
    pipelineVersion: string,
    /** ADR-040 §5.5: the κ gate's metric kind — POINT_UNWEIGHTED for the
     *  point dispatch (the historical default), BAND_QWK for the band
     *  dispatch; a band row can never release on point evidence. */
    metric: string = METRIC_POINT_UNWEIGHTED,
  ): Promise<Map<string, SmartMarkResultRow>> {
    const attemptId = attempt.id;
    const anyAccepted = decisions.some((d) => d.accepted);
    // κ gate evaluated ONCE per pass
    const authoritative = anyAccepted && (await this.kappaGatePassed(attempt.exam_paper_id, attempt.question_id, metric));

    const results = new Map<string, SmartMarkResultRow>();
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i]!;
      const decision = decisions[i]!;
      const resultId = this.clock.newId();
      await db`
        insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
          marks_awarded, confidence, validation_passed, breakdown, failure_reason,
          mark_scheme_id, scheme_validation_state, raw_output, created_at)
        values (${resultId}, ${answer.id}, ${pipelineVersion}, ${decision.candidate?.modelId ?? null},
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
        breakdown: decision.breakdown as DecisionBreakdownEntry[] | BandDecisionV1,
        failure_reason: decision.failureReason,
      };
      if (decision.accepted) {
        await db`
          update answers set marks_awarded = ${decision.marksAwarded}, marking_state = ${"SMART_MARKED"}
          where id = ${answer.id}
        `;
        await db`
          update attempts set marking_state = ${"SMART_MARKED"} where id = ${attemptId}
        `;
      }
      results.set(answer.id, resultRow);
    }

    if (anyAccepted) {
      // one recompute after every part is applied — read FRESH from the
      // answers table: under the part-bound multi-scheme dispatch (ruling A,
      // trace 1a1776dff15bb991) a pass covers a GROUP of the attempt's parts
      // and earlier groups' awards are already persisted; the historical
      // in-memory sum over the pass's rows would under-count them. For the
      // single-group historical shape the fresh read is value-identical
      // (accepted rows were just written; non-accepted rows unchanged).
      const totalRows = (await db`
        select coalesce(sum(marks_awarded), 0) as total from answers where attempt_id = ${attemptId}
      `) as unknown as Array<{ total: string | number }>;
      const total = Number(totalRows[0]!.total);
      await db`
        update attempts set marks_awarded = ${total} where id = ${attemptId}
      `;
      if (authoritative) {
        // evidence, exactly like the serial path's completing-part check:
        // fires only when NO part of the ATTEMPT is still PENDING (fresh
        // read — the group pass may not cover every part under ruling A)
        const pendingRows = (await db`
          select 1 from answers where attempt_id = ${attemptId} and marking_state = ${"PENDING"} limit 1
        `) as unknown as Array<Record<string, unknown>>;
        const stillPending = pendingRows.length > 0;
        if (!stillPending) {
          // T-MIG-137a: the assembly is the shared assembler's (the frozen
          // publisher's own laws — EvidencePublisher.java:51-120). This also
          // retires the pre-wiring placeholder payload (marksTotal 0 / correct
          // false — dead fields under the claiming stub, load-bearing under
          // the live 137b publisher): marksTotal/correct now derive from the
          // question row per the frozen :56-60 rule, like selfmark/teachermark.
          const fired = await this.publisher.publishGraded(
            await assembleGradedEvidenceEvent(db, {
              attemptId,
              learnerId: attempt.learner_id,
              questionId: attempt.question_id,
              marksAwarded: total,
              occurredAt: this.clock.now().toISOString(),
            }),
          );
          if (fired) {
            await db`
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
    tx?: SqlFn,
  ): Promise<SmartMarkResultRow> {
    const db = tx ?? this.sql;
    const refusedRows = (await db`
      select id, validation_state from mark_schemes
      where question_version_id = ${questionVersionId} order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (refusedRows.length === 0) throw new NotFoundError("mark scheme", questionVersionId);
    const refused = refusedRows[0]!;
    const resultId = this.clock.newId();
    await db`
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

  /** OD-1 MA-10 — the multi-axis dispatch refusal: the honest append-only row
   *  stamped with the newest scheme of the version (the V34 law), failure
   *  reason MULTI_AXIS_DISPATCH_NOT_WIRED; nothing is marked, no state
   *  changes, no evidence. Lifted by PR-B's per-axis dispatch leg. */
  private async refuseMultiAxisDispatch(
    answer: AnswerPartRow,
    questionVersionId: string,
    tx?: SqlFn,
  ): Promise<SmartMarkResultRow> {
    const db = tx ?? this.sql;
    const refusedRows = (await db`
      select id, validation_state from mark_schemes
      where question_version_id = ${questionVersionId} order by created_at desc
    `) as unknown as Array<{ id: string; validation_state: string }>;
    if (refusedRows.length === 0) throw new NotFoundError("mark scheme", questionVersionId);
    const refused = refusedRows[0]!;
    const resultId = this.clock.newId();
    await db`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${PIPELINE_VERSION}, ${null}, ${0}, ${null}, ${false},
        ${JSON.stringify([])}, ${"MULTI_AXIS_DISPATCH_NOT_WIRED"}, ${refused.id},
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
      failure_reason: "MULTI_AXIS_DISPATCH_NOT_WIRED",
    };
  }

  /** Honest band refusal (ADR-040 §2.2): the LEVELS analog of
   *  NO_SCHEME_POINTS / SCHEME_NOT_VALIDATED — append-only result row stamped
   *  with the validated LEVELS scheme it refused; nothing is marked, no state
   *  changes, no evidence. §5.4 retired this as the ROUTE for validated
   *  LEVELS schemes; it remains the guard of record for the unwired band
   *  seam and for a validated scheme whose mark_bands rows are empty. */
  private async refuseBandScheme(
    answer: AnswerPartRow,
    scheme: { id: string; validation_state: string },
    tx?: SqlFn,
  ): Promise<SmartMarkResultRow> {
    const db = tx ?? this.sql;
    const resultId = this.clock.newId();
    await db`
      insert into smart_mark_results (id, answer_id, pipeline_version, model_id,
        marks_awarded, confidence, validation_passed, breakdown, failure_reason,
        mark_scheme_id, scheme_validation_state, raw_output, created_at)
      values (${resultId}, ${answer.id}, ${PIPELINE_VERSION}, ${null}, ${0}, ${null}, ${false},
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
}

// ── DC-3 re-attempt entitlement (docs/DC3-REATTEMPT-ENTITLEMENT-PLAN.md) ────
// The law of record (spec §3.3, sha256 0da8044a…): meter the SECOND AI mark
// of a part, not the first; the ordinal is first-class on the append-only
// ai_mark_events ledger (counted in THIS path, never inferred); the gate is
// an entitlement policy row read server-side, never UI styling; the count is
// disclosed at the point of gating.

/** Transaction runner (the createSql.transaction shape). The composition
 * root wires it so gate + pass + stamp run atomically under the
 * per-(learner,question) advisory lock; optional elsewhere. */
export type TxRunner = <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;

export interface EntitlementPartRefusal {
  partId: string;
  label: string;
  priorMarks: number;
  /** the would-be ordinal of the refused pass (>= 2 by construction) */
  ordinal: number;
}

export interface EntitlementRefusalDetail {
  tier: string;
  reMarksPerDay: number | null;
  unlimited: boolean;
  reMarksUsedToday: number;
  parts: EntitlementPartRefusal[];
  reason: "ENTITLEMENT_REMARK_NOT_ENTITLED" | "ENTITLEMENT_POLICY_UNCONFIGURED";
}

/** 402 of record: the gate never hides the count or the reason (silent
 * metering reads as breakage). */
export class EntitlementError extends Error {
  constructor(
    message: string,
    readonly detail: EntitlementRefusalDetail,
  ) {
    super(message);
  }
}

const FREE_TIER_DISCLOSURE =
  "Your first mark on this part is free -- re-marks need a paid plan.";
const ENTITLEMENT_POLICY_UNCONFIGURED_COPY =
  "Marking entitlement is not configured for this account tier -- Smart Mark re-marks are unavailable.";
function trialDisclosure(remaining: number): string {
  return `Your first mark on this part is free -- ${remaining} re-mark${remaining === 1 ? "" : "s"} left today.`;
}

/** The (learner, part, ordinal) UNIQUE index fail-closed: a concurrent
 * double-submit's colliding stamp surfaces as an honest 409 retry. */
function isOrdinalCollision(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /23505|unique constraint|duplicate key/i.test(msg);
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
    private readonly tx?: TxRunner,
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

    const authoritative = await this.smartMark.kappaGatePassed(ctx.attempt.exam_paper_id, ctx.attempt.question_id);
    // one batched pass: the SAME engine the teacher queue runs — behind the
    // DC-3 entitlement envelope (gate + pass + ordinal stamp)
    const results = await this.runEntitledPass(learnerId, attemptId, ctx);
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

  // ── DC-3 re-attempt entitlement (the gate of record) ────────────────────

  /** The entitled pass: ordinal counts → policy decision → the engine pass
   * → the append-only ai_mark_events stamp. With a tx runner the four steps
   * run inside ONE transaction under a per-(learner,question) advisory lock:
   * a refused pass rolls back to exactly nothing, and a concurrent double-
   * click's second leg sees the first leg's events and meters accordingly.
   * Without a runner (the legacy composition/test shape) the steps run
   * autocommit and the (learner, part, ordinal) UNIQUE index fail-closes any
   * race — the colliding stamp rethrows as a 409, the ledger stays exact.
   * A SCHEME_NOT_VALIDATED result consumes nothing (the engine's own law:
   * nothing was marked). */
  private async runEntitledPass(
    learnerId: string,
    attemptId: string,
    ctx: { attempt: AttemptLockRow; answers: AnswerPartRow[] },
  ): Promise<Map<string, SmartMarkResultRow>> {
    const run = async (db: SqlFn): Promise<Map<string, SmartMarkResultRow>> => {
      // the metering lock: one key per (learner, question) — self-inflicted
      // contention only, deadlock-free by construction
      await db`
        select pg_advisory_xact_lock(hashtextextended(${`dc3-aimark:${learnerId}:${ctx.attempt.question_id}`}, 0))
      `;
      // per-part prior AI-mark counts — version-scoped part ids make the
      // count per scheme revision by construction (acceptance (b))
      const priorRows = (await db`
        select ans.question_part_id, count(e.id)::int as prior
        from answers ans
        left join ai_mark_events e
          on e.learner_id = ${learnerId} and e.question_part_id = ans.question_part_id
        where ans.attempt_id = ${attemptId}
        group by ans.question_part_id
      `) as unknown as Array<{ question_part_id: string; prior: number }>;
      const priorByPart = new Map(priorRows.map((r) => [r.question_part_id, r.prior]));

      // the entitlement policy row: row-absent learner = free; an unknown
      // tier or unshipped policy = fail-closed refusal, never a silent pass
      const tierRows = (await db`
        select tier from mark_entitlements where learner_id = ${learnerId}
      `) as unknown as Array<{ tier: string }>;
      const tier = tierRows[0]?.tier ?? "free";
      const policyRows = (await db`
        select tier, re_marks_per_day as "reMarksPerDay", unlimited
        from mark_entitlement_policies where tier = ${tier}
      `) as unknown as Array<{ tier: string; reMarksPerDay: number | null; unlimited: boolean }>;
      if (policyRows.length === 0) {
        throw new EntitlementError(ENTITLEMENT_POLICY_UNCONFIGURED_COPY, {
          tier,
          reMarksPerDay: null,
          unlimited: false,
          reMarksUsedToday: 0,
          parts: [],
          reason: "ENTITLEMENT_POLICY_UNCONFIGURED",
        });
      }
      const policy = policyRows[0]!;

      // the DC-3 law: ordinal 1 is every tier's; a re-mark (would-be ordinal
      // >= 2) consumes the policy. Whole-pass refusal — never half-marked.
      const reMarkParts = ctx.answers.filter(
        (a) => (priorByPart.get(a.question_part_id) ?? 0) + 1 >= 2,
      );
      if (reMarkParts.length > 0 && !policy.unlimited) {
        const perDay = policy.reMarksPerDay ?? 0;
        const detailParts = reMarkParts.map((a) => ({
          partId: a.question_part_id,
          label: a.label,
          priorMarks: priorByPart.get(a.question_part_id) ?? 0,
          ordinal: (priorByPart.get(a.question_part_id) ?? 0) + 1,
        }));
        if (perDay === 0) {
          throw new EntitlementError(FREE_TIER_DISCLOSURE, {
            tier,
            reMarksPerDay: 0,
            unlimited: false,
            reMarksUsedToday: 0,
            parts: detailParts,
            reason: "ENTITLEMENT_REMARK_NOT_ENTITLED",
          });
        }
        const usedRows = (await db`
          select count(*)::int as used
          from ai_mark_events
          where learner_id = ${learnerId} and mark_ordinal >= 2
            and created_at >= date_trunc('day', now() at time zone 'utc')
        `) as unknown as Array<{ used: number }>;
        const usedToday = usedRows[0]!.used;
        if (usedToday + reMarkParts.length > perDay) {
          throw new EntitlementError(trialDisclosure(Math.max(perDay - usedToday, 0)), {
            tier,
            reMarksPerDay: perDay,
            unlimited: false,
            reMarksUsedToday: usedToday,
            parts: detailParts,
            reason: "ENTITLEMENT_REMARK_NOT_ENTITLED",
          });
        }
      }

      // the pass itself — on the enveloped transaction when one is wired
      const results = await this.smartMark.markAttempt(attemptId, this.tx ? db : undefined);

      // the append-only ordinal stamp: INSERT..SELECT computes the ordinal
      // atomically; the UNIQUE index fail-closes a fallback-path race
      for (const answer of ctx.answers) {
        const result = results.get(answer.id);
        if (result === undefined) {
          throw new Error(`smart mark pass returned no result row for answer ${answer.id}`);
        }
        if (result.failure_reason === "SCHEME_NOT_VALIDATED") continue;
        try {
          await db`
            insert into ai_mark_events (id, learner_id, question_id, attempt_id,
              answer_id, question_part_id, mark_ordinal, pipeline_version, created_at)
            select ${this.clock.newId()}, ${learnerId}, ${ctx.attempt.question_id}, ${attemptId},
              ${answer.id}, ${answer.question_part_id},
              (select count(*)::int + 1 from ai_mark_events e
                where e.learner_id = ${learnerId} and e.question_part_id = ${answer.question_part_id}),
              ${PIPELINE_VERSION}, ${this.clock.now().toISOString()}
          `;
        } catch (e) {
          if (isOrdinalCollision(e)) {
            throw new ConflictError("concurrent smart-mark pass on this part -- retry");
          }
          throw e;
        }
      }
      return results;
    };
    if (this.tx) return this.tx(run);
    return run(this.sql);
  }

  // ── grounding ─────────────────────────────────────────────────────────────

  private async loadOwnedAttempt(learnerId: string, attemptId: string) {
    // paper scope via the attempt→question join (frozen derivation,
    // StudentSmartMarkService.java :163); lock stays attempt-only ("of a").
    const attemptRows = (await this.sql`
      select a.id, a.learner_id, a.question_id, a.marking_state, a.evidence_emitted,
             q.exam_paper_id
      from attempts a join questions q on q.id = a.question_id
      where a.id = ${attemptId} for update of a
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
    // paper scope via the attempt→question join (frozen derivation); plain
    // read — this path takes no attempt lock in the frozen core either.
    const attemptRows = (await this.sql`
      select a.id, a.learner_id, a.question_id, a.marking_state, a.evidence_emitted,
             q.exam_paper_id
      from attempts a join questions q on q.id = a.question_id
      where a.id = ${attemptId}
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
    // ADR-040 §5.4 cycle-1 boundary: a band-marked part's breakdown is the
    // pinned band_decision_v1 object — the per-point feedback prompts have no
    // honest reading of it. Named refusal, never a degenerate
    // empty-decisions prose run; band-native prose is a band-wave follow-up.
    if (result.breakdown !== null && !Array.isArray(result.breakdown)) {
      throw new ConflictError(
        "this part is band-marked (levels-of-response) -- per-point feedback prose is not available for it",
      );
    }
    const scheme = await this.resolveScheme(attempt.question_id);
    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_points where mark_scheme_id = ${scheme.id} order by ordering
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
    // ADR-040 §5.4: a band row's breakdown is the pinned band_decision_v1
    // OBJECT — project it through the band view (the per-point loop below
    // would misread it; the shapes never mix within one result row).
    const rawBreakdown: unknown = result.breakdown;
    if (rawBreakdown !== null && !Array.isArray(rawBreakdown)) {
      return this.projectBand(answer, result, schemeId, authoritative, rawBreakdown);
    }
    const pointRows = (await this.sql`
      select id, ref, ordering, text, marks, question_part_id
      from mark_points where mark_scheme_id = ${schemeId} order by ordering
    `) as unknown as Array<Record<string, unknown>>;
    const points = pointRows.map(toMarkingPoint);
    const inScope = points.filter((p) => p.questionPartId === answer.question_part_id);
    const byId = new Map(inScope.map((p) => [p.id, p]));
    const breakdown: PointDecisionView[] = [];
    const pointEntries = result.breakdown as DecisionBreakdownEntry[] | null;
    if (pointEntries !== null) {
      for (const entry of pointEntries) {
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

  /** ADR-040 §5.4 — the band projection: the placement, the within-band
   *  marks, and the descriptor hits (labels compacted per the pointLabel
   *  privacy law). marksPossible is the part's printed marks — the §2.1
   *  tiling law guarantees the top band reaches it. An unparseable breakdown
   *  object projects honestly empty — never a guess. */
  private async projectBand(
    answer: AnswerPartRow,
    result: SmartMarkResultRow,
    schemeId: string,
    authoritative: boolean,
    raw: unknown,
  ): Promise<PartSmartMarkView> {
    const base = {
      partId: answer.question_part_id,
      label: answer.label,
      marksAwarded: result.marks_awarded,
      marksPossible: answer.marks,
      markingState: result.validation_passed ? "SMART_MARKED" : answer.marking_state,
      authoritative: authoritative && result.validation_passed,
      confidence: result.confidence,
      modelId: result.model_id,
      validationPassed: result.validation_passed,
      failureReason: result.failure_reason,
      breakdown: [] as PointDecisionView[],
    };
    if (!isBandDecisionV1(raw)) return base;
    const bandRows = (await this.sql`
      select level_index, descriptor_md from mark_bands where mark_scheme_id = ${schemeId} order by level_index
    `) as unknown as Array<Record<string, unknown>>;
    const descriptorLabelByIndex = new Map(
      bandRows.map((r) => [Number(r.level_index), bandDescriptorLabel(String(r.descriptor_md))]),
    );
    return {
      ...base,
      bandDecision: {
        levelPlacement: raw.level_placement,
        awardedMarks: raw.awarded_marks,
        marksPossible: answer.marks,
        descriptorHits: raw.descriptor_hits.map((h) => ({
          levelIndex: h.level_index,
          descriptorLabel: descriptorLabelByIndex.get(h.level_index) ?? `level ${h.level_index}`,
          hit: h.hit === true,
          rationale: String(h.rationale ?? ""),
        })),
        blank: raw.blank === true,
      },
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

/** bandDescriptorLabel: pointLabel's privacy law for level descriptors —
 * the student view shows the compact first line, never the full verbatim
 * descriptor (ADR-040 §5.4). */
export function bandDescriptorLabel(descriptorMd: string): string {
  const line = descriptorMd
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? "";
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
  // band rows never reach here (loadFeedbackSource refuses them upstream —
  // ADR-040 §5.4); the cast names the per-point array law for the reader.
  const entries = (source.result.breakdown ?? []) as DecisionBreakdownEntry[];
  for (const entry of entries) {
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
  txRunner?: TxRunner,
  bandGenerator?: BandMarkingCandidateGenerator,
) {
  const smartMark = new SmartMarkService(sql, generator, publisher, clock, bandGenerator);
  return {
    smartMark,
    student: new StudentSmartMarkService(sql, smartMark, llm, clock, revealPolicy, txRunner),
  };
}
