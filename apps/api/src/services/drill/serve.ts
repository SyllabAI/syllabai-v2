/**
 * F-182 build — the drill serve service: the draw + the F-055-shaped
 * evidence seam, composed from the pure opening modules (drawForAddress —
 * policies P1..P5 untouched), the bank port, and the store.
 *
 * Error laws (each pinned in test/drill/routes.test.ts):
 *   - unknown course            -> UnknownCourseError         (404 not_found)
 *   - unknown address           -> NotFoundException           (404 not_found)
 *   - address below the floor   -> the pure DrillDrawError, rethrown as
 *                                  ConflictException           (409 conflict —
 *                                  policy P3: fail-closed, never a short draw)
 *   - unknown/foreign draw      -> NotFoundException           (404 not_found —
 *                                  ownership-scoped, no state leak)
 *   - part not in the draw      -> BadRequestException         (400 bad_request)
 *   - unknown MCQ label         -> BadRequestException         (400 bad_request)
 *   - second evidence write for
 *     the same (draw, part)     -> ConflictException           (409 conflict —
 *                                  immutability, ADR-016)
 *
 * Zero-stakes law: this service WRITES ONLY drill_draws + drill_part_evidence
 * (store.ts) — no attempts, no ai_mark_events, no gradebook surface, and no
 * read of any progress-bearing table. The clock is injected (ADR-031 posture)
 * but touches nothing — the draw itself stays the pure, clockless opening
 * module (P6).
 */
import { getRandomValues } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "../identity/errors";
import type { DrillMarkSchemeView, DrillMethodCreditView, DrillPartView } from "@syllabai/contracts";

import type { DrillDrawSelection } from "@syllabai/contracts";

import type { DrillBank, DrillPartContent } from "./bank";
import { drawForAddress, DrillDrawError, DRAW_SIZE } from "./draw";
import {
  learnerReading,
  modelDrawForReading,
  sparseState,
  RANDOM_SELECTION,
} from "./model-draw";
import { revealForEvidence, type DrillMethodCreditGenerator } from "./reveal";
import type { DrillPart } from "./census";
import type { DrillEvidenceInsert, DrillStore } from "./store";

/** Server-drawn seed when the client omits one (uint32, the mulberry32 domain). */
export function randomSeed(): number {
  return getRandomValues(new Uint32Array(1))[0]! >>> 0;
}

function partViewOf(part: DrillPart, content: DrillPartContent): DrillPartView {
  return {
    partId: part.partId,
    questionId: part.questionId,
    setId: part.setId,
    plane: part.plane,
    order: part.order,
    marks: part.marks,
    questionType: content.questionType,
    commandWord: content.commandWord,
    problemMd: content.problemMd,
    choices: content.choices ? content.choices.map((ch) => ({ label: ch.label, textMd: ch.textMd })) : null,
    specPointCodes: [...part.specPointCodes],
  };
}

export interface DrillDrawOutcome {
  drawId: string;
  course: string;
  code: string;
  seed: number;
  poolSize: number;
  freshPoolSize: number;
  usedFallback: boolean;
  /** F-185 — the policy disclosure (which law served this draw; no learner-state numbers). */
  selection: DrillDrawSelection;
  parts: DrillPartView[];
}

/**
 * F-185 — the draw composition of record: the model-driven selection law
 * (M1..M8) over the learner's read-only evidence projection, with the
 * sparse-state fallback to the F-182 random law (P1..P6 verbatim). ADR-031:
 * every learner number in the reading is computed AT READ from the immutable
 * evidence rows and never persisted; the zero-stakes law is untouched (the
 * added read is the strengths projection's own SELECT — the drill's own
 * table, read-only).
 */
export async function drawForLearner(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  input: { course: string; code: string; seed?: number },
  /** The injected clock for the reading's decay-at-read (ADR-031 posture; tests freeze it). */
  opts: { now?: Date } = {},
): Promise<DrillDrawOutcome> {
  const pool = bank.poolOf(input.code);
  if (pool.length === 0) {
    throw new NotFoundException("drill address", `${input.course}/${input.code}`);
  }

  const seed = input.seed ?? randomSeed();
  const recent = await store.recentDrawnPartIds(learnerId, input.course, input.code);

  // F-185: ONE read-only SELECT over the drill's own evidence lane (the
  // F-184 strengths projection's read, reused verbatim) feeds the reading;
  // the sparse law (M4) falls back to the random draw below the floor.
  const evidenceRows = await store.evidenceForCourse(learnerId, input.course);
  const reading = learnerReading(evidenceRows, opts.now ?? new Date());

  let result;
  try {
    result = sparseState(reading)
      ? {
          // The random law of record, verbatim — disclosed as the sparse fallback.
          ...drawForAddress(bank.parts, input.code, recent, seed, DRAW_SIZE),
          selection: RANDOM_SELECTION,
        }
      : modelDrawForReading(bank.parts, input.code, recent, reading, seed, DRAW_SIZE);
  } catch (err) {
    if (err instanceof DrillDrawError) {
      // Policy P3 verbatim: the address exists but cannot serve a full drill.
      throw new ConflictException(err.message);
    }
    throw err;
  }

  const parts: DrillPartView[] = [];
  for (const part of result.parts) {
    const content = bank.contentOf(part.partId);
    if (!content) {
      throw new Error(`drill bank ${bank.course}: drawn part ${part.partId} has no content view`);
    }
    parts.push(partViewOf(part, content));
  }

  const recorded = await store.recordDraw({
    learnerId,
    course: input.course,
    code: input.code,
    seed,
    partIds: result.parts.map((p) => p.partId),
    poolSize: result.poolSize,
    freshPoolSize: result.freshPoolSize,
    usedFallback: result.usedFallback,
  });

  return {
    drawId: recorded.id,
    course: input.course,
    code: input.code,
    seed,
    poolSize: result.poolSize,
    freshPoolSize: result.freshPoolSize,
    usedFallback: result.usedFallback,
    selection: result.selection,
    parts,
  };
}

export interface DrillEvidenceInput {
  drawId: string;
  partId: string;
  response: { kind: "choice"; label: string } | { kind: "text"; text: string };
  responseTimeMs: number;
  confidenceLevel?: number;
  selfDoubtFlag?: boolean;
}

export interface DrillEvidenceOutcome {
  evidenceId: string;
  drawId: string;
  partId: string;
  correct: boolean | null;
  marksAwarded: number | null;
  marksPossible: number;
  solutionMd: string | null;
  /** F-183 — the MS of record, verbatim (null when the part carries no linked MS — law L6). */
  markScheme: DrillMarkSchemeView | null;
  /** F-183 — the Smart Mark method-credit verdict on structured parts (ephemeral, never stored). */
  methodCredit: DrillMethodCreditView | null;
}

export async function recordDrillEvidence(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  input: DrillEvidenceInput,
  /** F-183 — the injected method-credit seam (null = the dormant posture). */
  methodCreditGenerator: DrillMethodCreditGenerator | null = null,
): Promise<DrillEvidenceOutcome> {
  const draw = await store.drawOf(learnerId, input.drawId);
  if (!draw) {
    throw new NotFoundException("drill draw", input.drawId);
  }
  if (!draw.partIds.includes(input.partId)) {
    throw new BadRequestException(`part ${input.partId} is not part of drill draw ${input.drawId}`);
  }

  const existing = await store.evidenceIdOf(input.drawId, input.partId);
  if (existing) {
    throw new ConflictException(`evidence already recorded for part ${input.partId} in draw ${input.drawId}`);
  }

  const part = bank.parts.find((p) => p.partId === input.partId);
  const content = bank.contentOf(input.partId);
  if (!part || !content) {
    throw new Error(`drill bank ${bank.course}: drawn part ${input.partId} vanished from the bank of record`);
  }

  // The seam's grading law: MCQ server-graded from the bank's private
  // isCorrect map; structured recorded UNGRADED (null, never 0 — the server
  // refuses to invent marks; the learner self-checks against the reveal).
  let correct: boolean | null = null;
  let marksAwarded: number | null = null;
  if (input.response.kind === "choice") {
    const graded = bank.isCorrectChoice(input.partId, input.response.label);
    if (graded === null) {
      throw new BadRequestException(`choice ${input.response.label} is not an option for part ${input.partId}`);
    }
    correct = graded;
    marksAwarded = graded ? part.marks : 0;
  }

  const insert: DrillEvidenceInsert = {
    drawId: input.drawId,
    learnerId,
    course: draw.course,
    code: draw.code,
    partId: input.partId,
    questionId: part.questionId,
    setId: part.setId,
    responseKind: input.response.kind,
    response: input.response.kind === "choice" ? { label: input.response.label } : { text: input.response.text },
    correct,
    marksAwarded,
    marksPossible: part.marks,
    responseTimeMs: input.responseTimeMs,
    confidenceLevel: input.confidenceLevel ?? null,
    selfDoubtFlag: input.selfDoubtFlag ?? false,
  };
  const recorded = await store.recordEvidence(insert);

  // F-183 law L1 — the reveal rides THIS ack, post-attempt by construction:
  // the evidence row above is already immutable-committed. L3: the MS of
  // record passes through verbatim; L4: the method-credit verdict (structured
  // parts only) computes against it and is NEVER persisted (zero-stakes law).
  const reveal = await revealForEvidence(
    bank,
    input.partId,
    { responseKind: input.response.kind, responseText: input.response.kind === "text" ? input.response.text : "" },
    methodCreditGenerator,
  );

  return {
    evidenceId: recorded.id,
    drawId: input.drawId,
    partId: input.partId,
    correct,
    marksAwarded,
    marksPossible: part.marks,
    solutionMd: bank.solutionOf(input.partId),
    markScheme: reveal.markScheme,
    methodCredit: reveal.methodCredit,
  };
}
