/**
 * F-186 — the Strength Battle law: the drill's own bank and draw wearing
 * competitive energy (tracker F-186, repo syllabai-v2, deps F-182 / F-185).
 *
 * Spec of record: docs/F186-BATTLE-MODE-PLAN.md (committed WITH this
 * implementation per the #216/#225/#229/#232/DC-4/F182/F183/F184/F185
 * pattern); product spec = Kognity dossier v1.1 Deep Dive D §8.5 row 5
 * (tracker F-186): "Same bank, 3-question / 60-second head-to-head vs
 * classmate or a bot; class brackets for teachers. Explicitly a later wave —
 * only after #1–#4 exist, so battles inherit model-drawn sets."
 *
 * THE LAWS (B1..B8 — pinned by apps/api/test/drill/battle.test.ts):
 *   B1  SAME BANK, SECOND MODE — the draw laws are the F-185 model law
 *       M1..M8 with the sparse fallback to P1..P6, composed exactly as
 *       drawForLearner composes them (this module adds ZERO draw math; the
 *       compose lives in battle-serve.ts over the battle-eligible pool).
 *   B2  THE FORMAT OF RECORD — BATTLE_SIZE = 3 parts, BATTLE_CLOCK_MS =
 *       60_000 (the tracker row title verbatim); the unit is the PART (P1),
 *       the address is one spine code (P2), the floor is fail-closed at 3
 *       (P3 — never a short battle).
 *   B3  FAIRNESS: ONE DRAW, ONE GRADER, SAME FORMAT — both sides face the
 *       exact same part set (the battle draw), the same clock, and THE one
 *       server-side grading law (bank.isCorrectChoice). The eligible pool is
 *       choice-gradable parts only: a head-to-head cannot server-grade a
 *       structured part without inventing marks, and the seam refuses.
 *   B4  THE OPPONENT OF RECORD — the seeded bot: per part, one uniform draw
 *       u = mulberry32(draw.seed)(); credited iff u < BOT_ACCURACY (0.5, the
 *       fair coin); latency = a second uniform draw in [5s, 15s] — inside
 *       the clock by construction. HONEST DISCLOSURE: a seeded coin, not a
 *       model (the wire names the law; the model bot is the residual behind
 *       this seam). Pure: same (seed, parts) -> identical card.
 *   B5  THE CLOCK LAW — the start of record is the draw row's created_at;
 *       an evidence row counts toward the battle iff its immutable write
 *       time <= the deadline. Over-clock rows stay REAL drill evidence (the
 *       strength reading reads them — zero stakes untouched) but score zero
 *       here and are disclosed per-part (inClock false).
 *   B6  THE SCORE OF RECORD — marks are the currency (the seam's own grading
 *       law): a part's marks to the learner iff their row is server-graded
 *       correct within the clock; the same marks to the bot iff the coin
 *       credits the part. Both correct -> BOTH score (wonBy "split") —
 *       deliberately NO race: DB write jitter is not a speed skill.
 *   B7  SETTLEMENT COMPUTED, NEVER PERSISTED (ADR-031 posture) — the
 *       settlement is a pure projection over the immutable draw + evidence
 *       rows + the bot law, computed AT READ against the injected now,
 *       writing nothing: no battle table exists, none is added. It carries
 *       NO answer key (the coin never picks a label; the reveal facts are
 *       the learner's own acks — the F-183 law untouched).
 *   B8  ZERO STAKES + OPT-IN (P6 verbatim) — a battle exists only when the
 *       learner POSTs it; battles write ONLY the same drill_draws +
 *       drill_part_evidence rows the drill already writes; no gradebook
 *       surface, no progress-bearing read, no leaderboard.
 */
import { mulberry32 } from "./draw";

/** Law B2 — the battle's part count of record (the tracker row's "3-question"). */
export const BATTLE_SIZE = 3;

/** Law B2 — the battle clock of record in ms (the tracker row's "60-second"). */
export const BATTLE_CLOCK_MS = 60_000;

/** Law B4 — the opponent law of record (the honest disclosure string on the wire). */
export const BOT_LAW = "seeded-coin-v1";

/** Law B4 — the bot's credit probability (the fair coin — calibration-neutral). */
export const BOT_ACCURACY = 0.5;

/** Law B4/Q4 — the bot's per-part latency band; max total 45s < the 60s clock. */
export const BOT_LATENCY_MIN_MS = 5_000;
export const BOT_LATENCY_MAX_MS = 15_000;

/** The opponent disclosure carried by the start outcome and the settlement. */
export interface BattleOpponent {
  readonly kind: "bot";
  readonly law: string;
}

export const BOT_OPPONENT: BattleOpponent = { kind: "bot", law: BOT_LAW };

/** One part of the bot's card (law B4): its coin verdict + its latency. No label — the coin never picks one (law B7). */
export interface BattleBotPart {
  readonly partId: string;
  readonly marks: number;
  readonly correct: boolean;
  readonly latencyMs: number;
}

/** The bot's full card over the battle's part order. Pure function of (seed, parts). */
export interface BattleBotCard {
  readonly opponent: BattleOpponent;
  readonly parts: readonly BattleBotPart[];
}

/**
 * Law B4 — the bot of record: per part (in the draw's part order), one coin
 * draw for the credit verdict and one latency draw from the SAME stream.
 * Pure: same (seed, parts) -> exactly the same card; reconstructible from
 * the draw audit row (the seed is on it — the M6 posture).
 */
export function botCard(
  seed: number,
  parts: readonly { partId: string; marks: number }[],
): BattleBotCard {
  const rand = mulberry32(seed);
  const out = parts.map((p) => {
    const u = rand();
    const latencyU = rand();
    return {
      partId: p.partId,
      marks: p.marks,
      correct: u < BOT_ACCURACY,
      latencyMs: Math.floor(BOT_LATENCY_MIN_MS + latencyU * (BOT_LATENCY_MAX_MS - BOT_LATENCY_MIN_MS)),
    };
  });
  return { opponent: BOT_OPPONENT, parts: out };
}

/**
 * One immutable drill_part_evidence row as the settlement reads it — the
 * store's projection shape (the store's own evidence projection columns,
 * draw-scoped). `correct` is the seam's grading law verbatim: null for the
 * ungraded (text) rows — the battle credits exactly `correct === true` rows
 * within the clock and never invents marks (law B6).
 */
export interface BattleLearnerRow {
  readonly partId: string;
  readonly correct: boolean | null;
  readonly marksAwarded: number | null;
  readonly marksPossible: number;
  /** The immutable row's write time (ISO-8601) — the battle clock reads it (law B5). */
  readonly createdAt: string;
}

/** Who takes a part (law B6): "split" = both correct (the no-race law). */
export type BattlePartWinner = "learner" | "bot" | "split" | "neither";

export interface BattleSettlementPart {
  readonly partId: string;
  readonly marks: number;
  readonly learner: {
    readonly answered: boolean;
    readonly inClock: boolean;
    readonly correct: boolean | null;
    readonly marksAwarded: number | null;
  };
  readonly bot: {
    readonly correct: boolean;
    readonly latencyMs: number;
  };
  readonly wonBy: BattlePartWinner;
}

export interface BattleSettlement {
  readonly drawId: string;
  readonly course: string;
  readonly code: string;
  /** Law B7 — the read stamp (generatedAt === the injected now, verbatim). */
  readonly generatedAt: string;
  readonly opponent: BattleOpponent;
  readonly clock: {
    readonly ms: number;
    readonly startedAt: string;
    readonly deadline: string;
    readonly closedBy: "all-answered" | "clock";
  };
  readonly parts: readonly BattleSettlementPart[];
  readonly score: {
    readonly learner: number;
    readonly bot: number;
    readonly possible: number;
  };
  readonly verdict: "win" | "loss" | "draw";
}

/** The draw-side input of record (the immutable drill_draws row the compose already owns). */
export interface BattleDrawInput {
  readonly id: string;
  readonly course: string;
  readonly code: string;
  readonly seed: number;
  readonly partIds: readonly string[];
  readonly createdAt: string;
}

/**
 * Laws B5/B6/B7 — the settlement of record: a pure projection over the
 * immutable draw + evidence rows + the bot card, computed against the
 * explicit now. Same inputs -> an identical settlement (pinned); writes
 * nothing; carries no answer key (pinned).
 */
export function settleBattle(input: {
  draw: BattleDrawInput;
  /** Marks of record per part (the bank's own marks — the currency of law B6). */
  marksOf: (partId: string) => number | null;
  /** The learner's OWN evidence rows for this draw (the compose scopes them). */
  evidenceRows: readonly BattleLearnerRow[];
  now: Date;
}): BattleSettlement {
  const { draw, marksOf, evidenceRows, now } = input;
  const startMs = Date.parse(draw.createdAt);
  if (Number.isNaN(startMs)) {
    throw new Error(`battle ${draw.id}: the draw row's created_at is not a readable clock of record`);
  }
  const deadlineMs = startMs + BATTLE_CLOCK_MS;

  // Fail-closed marks of record FIRST: the battle is the bank's own currency
  // (law B6) — a part without marks means the bank changed under the draw.
  const marksByPart = new Map<string, number>();
  for (const partId of draw.partIds) {
    const marks = marksOf(partId);
    if (marks === null) {
      throw new Error(`battle ${draw.id}: drawn part ${partId} has no marks of record — the bank changed under the draw`);
    }
    marksByPart.set(partId, marks);
  }

  const card = botCard(draw.seed, draw.partIds.map((partId) => ({ partId, marks: marksByPart.get(partId)! })));
  const botByPart = new Map(card.parts.map((b) => [b.partId, b]));
  const rowsByPart = new Map(evidenceRows.map((r) => [r.partId, r]));

  let allAnswered = true;
  for (const partId of draw.partIds) {
    if (!rowsByPart.has(partId)) allAnswered = false;
  }
  const closedBy: "all-answered" | "clock" = allAnswered ? "all-answered" : "clock";

  let learnerScore = 0;
  let botScore = 0;
  let possible = 0;
  const parts: BattleSettlementPart[] = draw.partIds.map((partId) => {
    const marks = marksByPart.get(partId)!;
    possible += marks;

    const row = rowsByPart.get(partId);
    const answered = row !== undefined;
    const inClock = answered ? Date.parse(row!.createdAt) <= deadlineMs : false;
    // Law B6: the battle credits exactly the server-graded correct rows
    // within the clock; text rows (correct null) and over-clock rows score
    // zero here while remaining real evidence for the reading (law B5).
    const learnerTookIt = answered && inClock && row!.correct === true;
    const learnerMarks = learnerTookIt ? marks : 0;
    learnerScore += learnerMarks;

    const bot = botByPart.get(partId);
    if (!bot) {
      throw new Error(`battle ${draw.id}: the bot card lost part ${partId} — refusing to settle a partial battle`);
    }
    const botMarks = bot.correct ? marks : 0;
    botScore += botMarks;

    const wonBy: BattlePartWinner = learnerTookIt && bot.correct ? "split" : learnerTookIt ? "learner" : bot.correct ? "bot" : "neither";

    return {
      partId,
      marks,
      learner: {
        answered,
        inClock,
        correct: row ? row.correct : null,
        marksAwarded: row ? row.marksAwarded : null,
      },
      bot: { correct: bot.correct, latencyMs: bot.latencyMs },
      wonBy,
    };
  });

  return {
    drawId: draw.id,
    course: draw.course,
    code: draw.code,
    generatedAt: now.toISOString(),
    opponent: BOT_OPPONENT,
    clock: {
      ms: BATTLE_CLOCK_MS,
      startedAt: draw.createdAt,
      deadline: new Date(deadlineMs).toISOString(),
      closedBy,
    },
    parts,
    score: { learner: learnerScore, bot: botScore, possible },
    verdict: learnerScore > botScore ? "win" : learnerScore < botScore ? "loss" : "draw",
  };
}
