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
import type { DrillPartView } from "@syllabai/contracts";

import type { DrillBank, DrillPartContent } from "./bank";
import { drawForAddress, DrillDrawError, DRAW_SIZE } from "./draw";
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
  parts: DrillPartView[];
}

export async function drawForLearner(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  input: { course: string; code: string; seed?: number },
): Promise<DrillDrawOutcome> {
  const pool = bank.poolOf(input.code);
  if (pool.length === 0) {
    throw new NotFoundException("drill address", `${input.course}/${input.code}`);
  }

  const seed = input.seed ?? randomSeed();
  const recent = await store.recentDrawnPartIds(learnerId, input.course, input.code);

  let result;
  try {
    result = drawForAddress(bank.parts, input.code, recent, seed, DRAW_SIZE);
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
}

export async function recordDrillEvidence(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  input: DrillEvidenceInput,
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

  return {
    evidenceId: recorded.id,
    drawId: input.drawId,
    partId: input.partId,
    correct,
    marksAwarded,
    marksPossible: part.marks,
    solutionMd: bank.solutionOf(input.partId),
  };
}
