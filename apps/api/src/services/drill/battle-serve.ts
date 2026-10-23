/**
 * F-186 — the battle serve layer: the compose that wears the drill's own
 * draw laws as a battle. This file adds ZERO draw math, ZERO grading math,
 * ZERO settlement math — it composes THE laws of record:
 *   - the draw: learnerReading/sparseState (M1..M4) + modelDrawForReading or
 *     drawForAddress (P1..P6 verbatim) over the BATTLE-ELIGIBLE pool at the
 *     address with floor BATTLE_SIZE (laws B1..B3);
 *   - the grading: stays where it already lives — battle answers ride the
 *     UNCHANGED POST /drill/evidence seam (the F-183 reveal law covers
 *     battles verbatim — dossier law 2);
 *   - the settlement: settleBattle (laws B5..B7) over the immutable rows.
 *
 * Prereg of record: docs/F186-BATTLE-MODE-PLAN.md (committed WITH this
 * implementation). Zero-stakes law: the only writes are the drill's own
 * draw/evidence rows; the only reads are the drill's own SELECTs; no
 * gradebook surface, no progress-bearing table, no leaderboard.
 */
import { ConflictException, NotFoundException } from "../identity/errors";
import type { DrillDrawSelection, DrillPartView } from "@syllabai/contracts";

import {
  BATTLE_CLOCK_MS,
  BATTLE_SIZE,
  BOT_OPPONENT,
  settleBattle,
  type BattleSettlement,
} from "./battle";
import type { DrillBank } from "./bank";
import { drawForAddress, DrillDrawError } from "./draw";
import { learnerReading, modelDrawForReading, RANDOM_SELECTION, sparseState } from "./model-draw";
import { partViewOf, randomSeed } from "./serve";
import type { DrillPart } from "./census";
import type { DrillStore } from "./store";

/**
 * Law B3 — the battle-eligible pool of record: the parts at the address the
 * ONE server-side grading law can grade, i.e. choice-bearing parts whose
 * grading lookup answers (isCorrectChoice null = not MCQ or no flagged
 * choice — the bank's own vocabulary). A head-to-head cannot server-grade a
 * structured part without inventing marks, and the seam refuses.
 */
export function battleEligiblePool(bank: DrillBank, code: string): DrillPart[] {
  return bank.poolOf(code).filter((p) => {
    const content = bank.contentOf(p.partId);
    if (!content || !content.choices || content.choices.length === 0) return false;
    return bank.isCorrectChoice(p.partId, content.choices[0]!.label) !== null;
  });
}

/** The battle start outcome: the draw facts + the opponent + the clock of record. */
export interface BattleStartOutcome {
  drawId: string;
  course: string;
  code: string;
  seed: number;
  /** The BATTLE-ELIGIBLE pool size (law B3's pool, not the raw address pool). */
  poolSize: number;
  freshPoolSize: number;
  usedFallback: boolean;
  /** The F-185 policy disclosure — battles inherit model-drawn sets verbatim (law B1). */
  selection: DrillDrawSelection;
  opponent: typeof BOT_OPPONENT;
  /** Law B2 — BATTLE_CLOCK_MS on the wire (the tracker row's "60-second"). */
  clockMs: number;
  /** Law B5 — the battle start of record: the draw row's own createdAt stamp. */
  startedAt: string;
  parts: DrillPartView[];
}

/**
 * Laws B1..B3, B8 — one battle: a 3-part model-drawn draw at one spec-point
 * address over the battle-eligible pool, recorded as a drill_draws row (same
 * table, same recency substrate — law B1 "same bank"). Sparse state serves
 * the random law verbatim (M4 disclosed); otherwise the model law M1..M8
 * picks. Below 3 eligible parts the battle refuses (P3 verbatim -> 409).
 * Opt-in by construction: this runs only when the learner POSTs it (law B8).
 */
export async function drawForBattle(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  input: { course: string; code: string; seed?: number },
  /** The injected clock for the reading's decay-at-read (the ADR-031 posture; tests freeze it). */
  opts: { now?: Date } = {},
): Promise<BattleStartOutcome> {
  const raw = bank.poolOf(input.code);
  if (raw.length === 0) {
    throw new NotFoundException("drill address", `${input.course}/${input.code}`);
  }
  const pool = battleEligiblePool(bank, input.code);

  const seed = input.seed ?? randomSeed();
  const recent = await store.recentDrawnPartIds(learnerId, input.course, input.code);
  const evidenceRows = await store.evidenceForCourse(learnerId, input.course);
  const reading = learnerReading(evidenceRows, opts.now ?? new Date());

  let result;
  try {
    result = sparseState(reading)
      ? {
          // The random law of record, verbatim — disclosed as the sparse fallback.
          ...drawForAddress(pool, input.code, recent, seed, BATTLE_SIZE),
          selection: RANDOM_SELECTION,
        }
      : modelDrawForReading(pool, input.code, recent, reading, seed, BATTLE_SIZE);
  } catch (err) {
    if (err instanceof DrillDrawError) {
      // Policy P3 verbatim at the battle floor: the address exists but cannot
      // serve a full battle — 409, never a short battle (law B2/B3).
      throw new ConflictException(err.message);
    }
    throw err;
  }

  const parts: DrillPartView[] = [];
  for (const part of result.parts) {
    const content = bank.contentOf(part.partId);
    if (!content) {
      throw new Error(`drill bank ${bank.course}: battle part ${part.partId} has no content view`);
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
    opponent: BOT_OPPONENT,
    clockMs: BATTLE_CLOCK_MS,
    startedAt: recorded.createdAt,
    parts,
  };
}

/**
 * Laws B5..B7 — the settlement of record for one battle: ownership-scoped
 * draw read (a foreign drawId is indistinguishable from an unknown one),
 * the battle discriminator (a battle IS a 3-part draw — law B2/Q8; only the
 * battle route draws 3), the draw-scoped evidence read, the live gate
 * (Q5: settle when all parts carry evidence OR the clock expired, else 409),
 * then the pure settleBattle projection. Computed AT READ against the
 * injected now — writes nothing (ADR-031 posture, law B7).
 */
export async function settlementForLearner(
  bankOf: (course: string) => DrillBank,
  store: DrillStore,
  learnerId: string,
  drawId: string,
  now: Date,
): Promise<BattleSettlement> {
  const draw = await store.drawOf(learnerId, drawId);
  if (!draw) {
    throw new NotFoundException("drill draw", drawId);
  }
  if (draw.partIds.length !== BATTLE_SIZE) {
    throw new ConflictException(
      `drill draw ${drawId} is not a battle — a battle is a ${BATTLE_SIZE}-part draw`,
    );
  }
  // The course lives on the draw row: the bank resolves only after the draw
  // itself is known to be ours (the /evidence ownership-scoped pattern).
  const bank = bankOf(draw.course);

  const rows = await store.evidenceForDraw(drawId, learnerId);
  const answered = new Set(rows.map((r) => r.partId));
  const allAnswered = draw.partIds.every((p) => answered.has(p));
  const deadline = Date.parse(draw.createdAt) + BATTLE_CLOCK_MS;
  if (!allAnswered && now.getTime() < deadline) {
    throw new ConflictException(
      `battle ${drawId} is still live — the clock runs to ${new Date(deadline).toISOString()}`,
    );
  }

  return settleBattle({
    draw: {
      id: draw.id,
      course: draw.course,
      code: draw.code,
      seed: draw.seed,
      partIds: draw.partIds,
      createdAt: draw.createdAt,
    },
    marksOf: (partId) => bank.marksOf(partId),
    evidenceRows: rows,
    now,
  });
}
