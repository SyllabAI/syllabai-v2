/**
 * F-186 — the battle law battery (services/drill/battle.ts, laws B1..B8;
 * prereg docs/F186-BATTLE-MODE-PLAN.md). The compose-layer pins (the
 * eligible pool, the routes, the wire) live in routes.test.ts; this file
 * pins THE LAW over synthetic rows plus the REAL-bundle numbers of record.
 *
 * Golden card of record: seed 20261023 over parts p1(2 marks) / p2(1) /
 * p3(1) -> p1 correct (13116ms), p2 missed (5385ms), p3 missed (11217ms) —
 * bot 2 of a possible 4. Every settlement case below is hand-computed
 * against that card.
 */
import { describe, expect, test } from "bun:test";

import {
  BATTLE_CLOCK_MS,
  BATTLE_SIZE,
  BOT_ACCURACY,
  BOT_LATENCY_MAX_MS,
  BOT_LATENCY_MIN_MS,
  BOT_LAW,
  botCard,
  settleBattle,
  type BattleDrawInput,
  type BattleLearnerRow,
} from "../../src/services/drill/battle";
import { bundleBank } from "../../src/services/drill/bank";
import { mulberry32 } from "../../src/services/drill/draw";

const SEED = 20261023;
const DRAW_ID = "b1000000-0000-4000-8000-000000000001";
const START = "2026-10-23T00:00:00Z";
const DEADLINE_ISO = "2026-10-23T00:01:00.000Z"; // new Date(START).getTime() + 60_000, toISOString
const DEADLINE = DEADLINE_ISO;
const NOW = "2026-10-23T00:02:00Z"; // after the clock — every case settles
const IN_CLOCK = "2026-10-23T00:00:30Z";
const OVER_CLOCK = "2026-10-23T00:01:30Z";

const MARKS: Record<string, number> = { p1: 2, p2: 1, p3: 1 };
const PARTS = [
  { partId: "p1", marks: 2 },
  { partId: "p2", marks: 1 },
  { partId: "p3", marks: 1 },
];
const marksOf = (partId: string) => MARKS[partId] ?? null;

function draw(seed: number = SEED): BattleDrawInput {
  return { id: DRAW_ID, course: "igcse-chemistry-19", code: "4CH1-1.16", seed, partIds: ["p1", "p2", "p3"], createdAt: START };
}

function row(partId: string, correct: boolean | null, createdAt: string = IN_CLOCK): BattleLearnerRow {
  return { partId, correct, marksAwarded: correct === true ? MARKS[partId]! : correct === false ? 0 : null, marksPossible: MARKS[partId]!, createdAt };
}

// ---------------------------------------------------------------- the format (B2)

describe("F-186 battle law — the format of record (B2)", () => {
  test("3 questions / 60 seconds — the tracker row title verbatim", () => {
    expect(BATTLE_SIZE).toBe(3);
    expect(BATTLE_CLOCK_MS).toBe(60_000);
  });

  test("the opponent of record is disclosed as a seeded coin, not a model (B4)", () => {
    expect(BOT_LAW).toBe("seeded-coin-v1");
    expect(BOT_ACCURACY).toBe(0.5);
  });
});

// ---------------------------------------------------------------- the bot (B4)

describe("F-186 battle law — the seeded bot (B4)", () => {
  test("the golden card of record: seed 20261023 -> p1 scored, p2/p3 missed, latencies in band", () => {
    const card = botCard(SEED, PARTS);
    expect(card.opponent).toEqual({ kind: "bot", law: "seeded-coin-v1" });
    expect(card.parts).toEqual([
      { partId: "p1", marks: 2, correct: true, latencyMs: 13116 },
      { partId: "p2", marks: 1, correct: false, latencyMs: 5385 },
      { partId: "p3", marks: 1, correct: false, latencyMs: 11217 },
    ]);
  });

  test("pure: same (seed, parts) -> the identical card; the seed drives everything", () => {
    const a = botCard(SEED, PARTS);
    const b = botCard(SEED, PARTS);
    expect(a).toEqual(b);
    expect(botCard(SEED + 1, PARTS)).not.toEqual(a);
  });

  test("the latency band [5s, 15s] per part — max total 45s, always inside the 60s clock", () => {
    const card = botCard(SEED, PARTS);
    for (const p of card.parts) {
      expect(p.latencyMs).toBeGreaterThanOrEqual(BOT_LATENCY_MIN_MS);
      expect(p.latencyMs).toBeLessThan(BOT_LATENCY_MAX_MS);
    }
    const total = card.parts.reduce((s, p) => s + p.latencyMs, 0);
    expect(3 * BOT_LATENCY_MAX_MS).toBeLessThan(BATTLE_CLOCK_MS);
    expect(total).toBeLessThan(BATTLE_CLOCK_MS);
  });

  test("the fair-coin band: 400 coin draws land within [0.4, 0.6]", () => {
    const rand = mulberry32(999983);
    let hits = 0;
    for (let i = 0; i < 400; i += 1) if (rand() < BOT_ACCURACY) hits += 1;
    expect(hits).toBeGreaterThanOrEqual(160);
    expect(hits).toBeLessThanOrEqual(240);
  });

  test("no label exists anywhere on the bot card — the coin never picks an answer (B7)", () => {
    const card = botCard(SEED, PARTS);
    for (const p of card.parts) {
      expect(Object.keys(p)).toEqual(["partId", "marks", "correct", "latencyMs"]);
    }
  });
});

// ---------------------------------------------------------- the settlement (B5/B6/B7)

describe("F-186 battle law — the settlement (B5/B6/B7)", () => {
  test("WIN: learner takes p1 (split with the coin) + p2 (unopposed) — 3 vs 2 of 4", () => {
    // Coin of record: p1 correct, p2 missed, p3 missed.
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", true), row("p2", true), row("p3", false)], now: new Date(NOW) });
    expect(s.score).toEqual({ learner: 3, bot: 2, possible: 4 });
    expect(s.verdict).toBe("win");
    expect(s.parts[0]!.wonBy).toBe("split"); // both correct — the no-race law: BOTH score
    expect(s.parts[1]!.wonBy).toBe("learner");
    expect(s.parts[2]!.wonBy).toBe("neither");
    expect(s.clock).toEqual({ ms: 60_000, startedAt: START, deadline: "2026-10-23T00:01:00.000Z", closedBy: "all-answered" });
  });

  test("LOSS: the learner's in-clock answers miss where the coin scored — 0 vs 2 of 4", () => {
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", false), row("p2", false), row("p3", false)], now: new Date(NOW) });
    expect(s.score).toEqual({ learner: 0, bot: 2, possible: 4 });
    expect(s.verdict).toBe("loss");
    expect(s.parts[0]!.wonBy).toBe("bot");
  });

  test("DRAW: the learner matches the coin's p1 exactly — 2 vs 2, the split splits", () => {
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", true), row("p2", false), row("p3", false)], now: new Date(NOW) });
    expect(s.score).toEqual({ learner: 2, bot: 2, possible: 4 });
    expect(s.verdict).toBe("draw");
    expect(s.parts[0]!.wonBy).toBe("split");
  });

  test("marks are the currency: the 2-mark part outweighs the 1-mark parts (B6)", () => {
    // Learner misses p1 but takes both 1-markers; coin takes p1 only -> 2 vs 2.
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", false), row("p2", true), row("p3", true)], now: new Date(NOW) });
    expect(s.score).toEqual({ learner: 2, bot: 2, possible: 4 });
    expect(s.verdict).toBe("draw");
  });

  test("the clock law (B5): an over-clock answer stays evidence but scores zero, disclosed inClock false", () => {
    // Learner answers p1 correct IN clock and p2 correct AFTER the clock.
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", true), row("p2", true, OVER_CLOCK), row("p3", false)], now: new Date(NOW) });
    expect(s.parts[1]!.learner).toEqual({ answered: true, inClock: false, correct: true, marksAwarded: 1 });
    expect(s.score.learner).toBe(2); // p1 only — p2's late marks are real evidence, zero battle marks
    expect(s.score).toEqual({ learner: 2, bot: 2, possible: 4 });
    expect(s.verdict).toBe("draw");
  });

  test("the clock law (B5): unanswered parts after expiry settle unopposed; closedBy clock", () => {
    // Nothing answered: the coin's p1 hit lands unopposed ("bot"); its p2/p3
    // misses meet no learner answer either ("neither"). The coin plays every
    // part by construction — the clock path closes the battle either way.
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [], now: new Date(NOW) });
    expect(s.clock.closedBy).toBe("clock");
    for (const p of s.parts) expect(p.learner.answered).toBe(false);
    expect(s.parts[0]!.wonBy).toBe("bot");
    expect(s.parts[1]!.wonBy).toBe("neither");
    expect(s.parts[2]!.wonBy).toBe("neither");
    expect(s.score).toEqual({ learner: 0, bot: 2, possible: 4 });
    expect(s.verdict).toBe("loss");
  });

  test("a text (ungraded) row scores zero in the battle while remaining real evidence (B6)", () => {
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", null), row("p2", true), row("p3", false)], now: new Date(NOW) });
    expect(s.parts[0]!.learner.correct).toBeNull();
    expect(s.parts[0]!.wonBy).toBe("bot"); // the coin took p1; the seam never graded the text row
    expect(s.score.learner).toBe(1);
  });

  test("purity (B7): same inputs -> an identical settlement; generatedAt IS the injected now", () => {
    const input = { draw: draw(), marksOf, evidenceRows: [row("p1", true), row("p2", true), row("p3", true)], now: new Date(NOW) };
    const a = settleBattle(input);
    const b = settleBattle(input);
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
    // no input mutation
    expect(input.evidenceRows).toHaveLength(3);
    expect(input.draw.partIds).toEqual(["p1", "p2", "p3"]);
  });

  test("fail-closed: a part without marks of record (the bank changed under the draw) refuses", () => {
    expect(() => settleBattle({ draw: draw(), marksOf: () => null, evidenceRows: [], now: new Date(NOW) })).toThrow(
      "no marks of record",
    );
  });

  test("the settlement carries no answer key: no label/choice/solution field exists on any part (B7)", () => {
    const s = settleBattle({ draw: draw(), marksOf, evidenceRows: [row("p1", true), row("p2", true), row("p3", true)], now: new Date(NOW) });
    const flat = JSON.stringify(s);
    expect(flat).not.toContain("label");
    expect(flat).not.toContain("solution");
    expect(flat).not.toContain("isCorrect");
  });
});

// ---------------------------------------------------------- the real bundle (Q2/B3)

describe("F-186 battle law — the real bundle of record (Q2)", () => {
  const bank = bundleBank("igcse-chemistry-19");

  function eligibleCount(code: string): number {
    return bank.poolOf(code).filter((p) => {
      const c = bank.contentOf(p.partId);
      if (!c || !c.choices || c.choices.length === 0) return false;
      return bank.isCorrectChoice(p.partId, c.choices[0]!.label) !== null;
    }).length;
  }

  test("the course-wide numbers of record: 443 battle-eligible parts, 68 battle-ready addresses", () => {
    let eligible = 0;
    let ready = 0;
    for (const a of bank.addressRows) {
      if (!a.drillable) continue;
      const n = eligibleCount(a.code);
      eligible += n;
      if (n >= BATTLE_SIZE) ready += 1;
    }
    expect(eligible).toBe(443);
    expect(ready).toBe(68);
  });

  test("the drill's flagship 4CH1-1.25 carries exactly 2 eligible parts — the battle refuses there (fail-closed, real)", () => {
    expect(bank.poolOf("4CH1-1.25")).toHaveLength(155);
    expect(eligibleCount("4CH1-1.25")).toBe(2);
  });

  test("the strongest battle-ready address 4CH1-1.16 (70-part pool, 14 eligible) settles a real card end-to-end", () => {
    const pool = bank.poolOf("4CH1-1.16");
    expect(pool.length).toBe(70);
    expect(eligibleCount("4CH1-1.16")).toBe(14);
    const card = pool.slice(0, BATTLE_SIZE).map((p) => ({ partId: p.partId, marks: bank.marksOf(p.partId) ?? 0 }));
    const realDraw: BattleDrawInput = {
      id: DRAW_ID,
      course: bank.course,
      code: "4CH1-1.16",
      seed: SEED,
      partIds: card.map((p) => p.partId),
      createdAt: START,
    };
    const s = settleBattle({
      draw: realDraw,
      marksOf: (partId) => bank.marksOf(partId),
      evidenceRows: card.map((p) => ({ partId: p.partId, correct: true, marksAwarded: p.marks, marksPossible: p.marks, createdAt: IN_CLOCK })),
      now: new Date(NOW),
    });
    expect(s.course).toBe("igcse-chemistry-19");
    expect(s.code).toBe("4CH1-1.16");
    expect(s.parts).toHaveLength(BATTLE_SIZE);
    expect(s.score.possible).toBe(card.reduce((sum, p) => sum + p.marks, 0));
    expect(s.score.bot).toBeGreaterThanOrEqual(0);
    expect(s.opponent.law).toBe("seeded-coin-v1");
  });
});
