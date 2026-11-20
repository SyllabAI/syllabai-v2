/**
 * T-TUTOR-AIM-P3 (DC10 §7.9): the calibration read-out — the §7.4-gated
 * deterministic surface over the P2 confidence log + the P3 ledger.
 *
 * LAWS PINNED HERE:
 *   - the pairing: a logged ask pairs to the same-session ledger rows
 *     within the pairing window; a null-session ask pairs to NOTHING (the
 *     ledger is session-scoped — the honest coverage residual)
 *   - the outcome: graded drill parts at a covered ask's node codes within
 *     the 14-day window; correct = majority of the part's marks; each part
 *     attributes ONCE, to its NEAREST PRECEDING covered ask (latest-first)
 *   - rule 1's floor: under 15 covered asks → status "gathering" (the
 *     honest empty — no calibration claim is implied)
 *   - rule 5's noise gate: both endpoints present AND the gap under 10
 *     points → "no_signal" (stay log-only — the surface does NOT render a
 *     claim); either endpoint empty → the gate cannot fire
 *   - rule 1's per-learner law: the reader selects the learner's OWN rows
 *     only — no population stats ever
 *   - pure core: zero SQL knowledge, deterministic, no clock beyond the
 *     injected now
 */
import { describe, expect, test } from "bun:test";
import {
  ASK_PAIRING_WINDOW_MS,
  CALIBRATION_CORRECT_RATIO,
  CALIBRATION_MIN_ASKS,
  CALIBRATION_NOISE_GAP,
  CALIBRATION_OUTCOME_WINDOW_DAYS,
  calibrationReadout,
  type LoggedAskRow,
  type OutcomeRow,
  type ServedRow,
} from "../../src/services/tutor/calibration";
import { readCalibration } from "../../src/services/tutor/calibration";
import type { SqlFn } from "../../src/services/tutor/sql";

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SESSION = "cc000000-0000-4000-8000-000000000001";
const SESSION_2 = "cc000000-0000-4000-8000-000000000002";
const NODE_A = "aa000000-0000-4000-8000-00000000000a";
const CODE_A = "4CH1-U1-T2";

const T0 = new Date("2026-11-01T10:00:00Z");

const ask = (
  confidence: "sure" | "think_so" | "guessing",
  at: Date,
  sessionId: string | null = SESSION,
): LoggedAskRow => ({ sessionId, confidence, createdAt: at });

const served = (nodeId: string, at: Date, sessionId: string = SESSION): ServedRow => ({
  sessionId,
  specNodeId: nodeId,
  servedAt: at,
});

const outcome = (correct: boolean, at: Date, code: string = CODE_A): OutcomeRow => ({
  code,
  correct,
  gradedAt: at,
});

const nodeCodeOf = (nodeId: string): string | null =>
  nodeId === NODE_A ? CODE_A : null;

const NOW = new Date("2026-11-18T00:00:00Z");

describe("calibrationReadout (the pairing law)", () => {
  test("a logged ask pairs to its own session's served rows inside the window", () => {
    const readout = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + 1_000))],
      [],
      nodeCodeOf,
      NOW,
    );
    expect(readout.asksCovered).toBe(1);
  });

  test("the pairing window absorbs the two writers' clock skew, never the next turn", () => {
    const inside = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + ASK_PAIRING_WINDOW_MS))],
      [],
      nodeCodeOf,
      NOW,
    );
    const outside = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + ASK_PAIRING_WINDOW_MS + 1))],
      [],
      nodeCodeOf,
      NOW,
    );
    expect(inside.asksCovered).toBe(1);
    expect(outside.asksCovered).toBe(0);
  });

  test("a null-session ask pairs to NOTHING (the ledger is session-scoped)", () => {
    const readout = calibrationReadout(
      [ask("sure", T0, null)],
      [served(NODE_A, new Date(T0.getTime() + 1_000))],
      [],
      nodeCodeOf,
      NOW,
    );
    expect(readout.asksCovered).toBe(0);
    expect(readout.asksLogged).toBe(1);
  });

  test("a different session's rows never pair (the same-session law)", () => {
    const readout = calibrationReadout(
      [ask("sure", T0, SESSION)],
      [served(NODE_A, new Date(T0.getTime() + 1_000), SESSION_2)],
      [],
      nodeCodeOf,
      NOW,
    );
    expect(readout.asksCovered).toBe(0);
  });
});

describe("calibrationReadout (the outcome law)", () => {
  test("graded parts at the covered ask's node code within the window count", () => {
    const readout = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + 1_000))],
      [outcome(true, new Date(T0.getTime() + 86_400_000))],
      nodeCodeOf,
      NOW,
    );
    expect(readout.bands[0]).toEqual({ confidence: "sure", asks: 1, parts: 1, accuracy: 1 });
  });

  test("correct = majority of the part's marks (the marks-weighted posture)", () => {
    // exercised through the reader's projection — the pure core takes the
    // precomputed boolean; the ratio law is pinned in the reader test below
    expect(CALIBRATION_CORRECT_RATIO).toBe(0.5);
  });

  test("parts OUTSIDE the window never count (the 14-day horizon)", () => {
    const tooLate = new Date(T0.getTime() + (CALIBRATION_OUTCOME_WINDOW_DAYS + 1) * 86_400_000);
    const readout = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + 1_000))],
      [outcome(true, tooLate)],
      nodeCodeOf,
      NOW,
    );
    expect(readout.bands[0]!.parts).toBe(0);
    expect(readout.bands[0]!.accuracy).toBeNull();
  });

  test("a part BEFORE the ask never counts (the outcome follows the ask)", () => {
    const readout = calibrationReadout(
      [ask("sure", T0)],
      [served(NODE_A, new Date(T0.getTime() + 1_000))],
      [outcome(true, new Date(T0.getTime() - 86_400_000))],
      nodeCodeOf,
      NOW,
    );
    expect(readout.bands[0]!.parts).toBe(0);
  });

  test("each part attributes ONCE, to its NEAREST PRECEDING covered ask (latest-first)", () => {
    const earlier = new Date(T0.getTime() - 3_600_000);
    const later = new Date(T0.getTime() + 3_600_000);
    const readout = calibrationReadout(
      [ask("sure", earlier), ask("guessing", later)],
      [served(NODE_A, new Date(earlier.getTime() + 1_000)), served(NODE_A, new Date(later.getTime() + 1_000))],
      [outcome(false, new Date(later.getTime() + 86_400_000))],
      nodeCodeOf,
      NOW,
    );
    // one part, attributed to the LATER ask's band (the nearest preceding)
    expect(readout.bands.find((b) => b.confidence === "guessing")!.parts).toBe(1);
    expect(readout.bands.find((b) => b.confidence === "sure")!.parts).toBe(0);
    expect(readout.bands.find((b) => b.confidence === "guessing")!.accuracy).toBe(0);
  });
});

describe("calibrationReadout (the §7.4 gates)", () => {
  test("rule 1's floor: under 15 covered asks → gathering (the honest empty)", () => {
    const asks: LoggedAskRow[] = [];
    const servedRows: ServedRow[] = [];
    for (let i = 0; i < CALIBRATION_MIN_ASKS - 1; i++) {
      const at = new Date(T0.getTime() + i * 3_600_000);
      asks.push(ask("sure", at));
      servedRows.push(served(NODE_A, new Date(at.getTime() + 1_000)));
    }
    const readout = calibrationReadout(asks, servedRows, [], nodeCodeOf, NOW);
    expect(readout.status).toBe("gathering");
    expect(readout.asksCovered).toBe(CALIBRATION_MIN_ASKS - 1);
  });

  test("at the floor with endpoints present and a REAL gap → ok", () => {
    const asks: LoggedAskRow[] = [];
    const servedRows: ServedRow[] = [];
    const outcomes: OutcomeRow[] = [];
    // one ask per DAY — each ask's own outcome lands 12h after it, inside
    // its window and after every LATER ask's start (so the nearest-preceding
    // attribution lands each part on its own ask)
    for (let i = 0; i < CALIBRATION_MIN_ASKS; i++) {
      const at = new Date(T0.getTime() + i * 86_400_000);
      const confidence = i % 2 === 0 ? "sure" : "guessing";
      asks.push(ask(confidence, at));
      servedRows.push(served(NODE_A, new Date(at.getTime() + 1_000)));
      outcomes.push(
        outcome(
          confidence === "sure", // sure parts correct, guessing parts wrong
          new Date(at.getTime() + 43_200_000),
        ),
      );
    }
    const readout = calibrationReadout(asks, servedRows, outcomes, nodeCodeOf, NOW);
    expect(readout.status).toBe("ok");
    const sure = readout.bands.find((b) => b.confidence === "sure")!;
    const guessing = readout.bands.find((b) => b.confidence === "guessing")!;
    expect(sure.accuracy).toBe(1);
    expect(guessing.accuracy).toBe(0);
  });

  test("rule 5's noise gate: both endpoints present, gap under 10 points → no_signal", () => {
    const asks: LoggedAskRow[] = [];
    const servedRows: ServedRow[] = [];
    const outcomes: OutcomeRow[] = [];
    for (let i = 0; i < CALIBRATION_MIN_ASKS; i++) {
      const at = new Date(T0.getTime() + i * 86_400_000);
      const confidence = i % 2 === 0 ? "sure" : "guessing";
      asks.push(ask(confidence, at));
      servedRows.push(served(NODE_A, new Date(at.getTime() + 1_000)));
      // TTFF repeating: sure (even i) lands T,F,T,F… → 4/8 = 0.5;
      // guessing (odd i) lands T,F,T,F,T,F,T → 4/7 ≈ 0.571 — a 7-point gap
      outcomes.push(
        outcome(
          i % 4 === 0 || i % 4 === 1,
          new Date(at.getTime() + 43_200_000),
        ),
      );
    }
    const readout = calibrationReadout(asks, servedRows, outcomes, nodeCodeOf, NOW);
    expect(readout.status).toBe("no_signal");
  });

  test("the noise gate cannot fire when either endpoint is empty (the honest gate)", () => {
    const asks: LoggedAskRow[] = [];
    const servedRows: ServedRow[] = [];
    const outcomes: OutcomeRow[] = [];
    for (let i = 0; i < CALIBRATION_MIN_ASKS; i++) {
      const at = new Date(T0.getTime() + i * 3_600_000);
      asks.push(ask("sure", at)); // ONLY sure asks — guessing has no curve
      servedRows.push(served(NODE_A, new Date(at.getTime() + 1_000)));
      outcomes.push(outcome(true, new Date(at.getTime() + 86_400_000)));
    }
    const readout = calibrationReadout(asks, servedRows, outcomes, nodeCodeOf, NOW);
    expect(readout.status).toBe("ok");
    expect(readout.bands.find((b) => b.confidence === "guessing")!.accuracy).toBeNull();
  });

  test("the read-out carries the constants of record", () => {
    expect(CALIBRATION_MIN_ASKS).toBe(15);
    expect(CALIBRATION_NOISE_GAP).toBe(0.1);
    expect(CALIBRATION_OUTCOME_WINDOW_DAYS).toBe(14);
    const readout = calibrationReadout([], [], [], nodeCodeOf, NOW);
    expect(readout.outcomeWindowDays).toBe(14);
    expect(readout.status).toBe("gathering");
    expect(readout.bands.map((b) => b.confidence)).toEqual(["sure", "think_so", "guessing"]);
  });
});

describe("readCalibration (the reader — per-learner, own rows only)", () => {
  test("the reader resolves node ids to codes and feeds the pure core", async () => {
    const queries: Array<{ text: string; params: unknown[] }> = [];
    let step = 0;
    const sql = ((strings: TemplateStringsArray, ...params: unknown[]) => {
      queries.push({ text: strings.join(" "), params });
      step += 1;
      if (step === 1) {
        // tutor_ask_confidence — the learner's OWN rows
        return Promise.resolve([
          { session_id: SESSION, confidence: "sure", created_at: T0 },
        ]);
      }
      if (step === 2) {
        return Promise.resolve([
          { session_id: SESSION, spec_node_id: NODE_A, served_at: new Date(T0.getTime() + 500) },
        ]);
      }
      if (step === 3) {
        return Promise.resolve([
          { code: CODE_A, marks_awarded: 3, marks_possible: 4, created_at: new Date(T0.getTime() + 86_400_000) },
        ]);
      }
      return Promise.resolve([{ id: NODE_A, code: CODE_A }]);
    }) as unknown as SqlFn;
    const readout = await readCalibration(sql, { now: () => NOW }, LEARNER);
    // the ask paired; the 3/4 part is correct (0.75 >= 0.5)
    expect(readout.asksCovered).toBe(1);
    expect(readout.bands.find((b) => b.confidence === "sure")!.parts).toBe(1);
    expect(readout.bands.find((b) => b.confidence === "sure")!.accuracy).toBe(1);
    // every LEARNER-scoped read is bounded to the learner's own rows (the
    // §7.4 rule-1 law); the catalog resolve queries by the node-id ARRAY
    for (const q of queries.slice(0, 3)) expect(q.params).toContain(LEARNER);
    expect(JSON.stringify(queries[3]!.params)).toContain(NODE_A);
  });

  test("an ungraded part never attributes (the S1 graded discipline)", async () => {
    let step = 0;
    const sql = ((_strings: TemplateStringsArray, ..._params: unknown[]) => {
      step += 1;
      if (step === 1) {
        return Promise.resolve([
          { session_id: SESSION, confidence: "guessing", created_at: T0 },
        ]);
      }
      if (step === 2) {
        return Promise.resolve([
          { session_id: SESSION, spec_node_id: NODE_A, served_at: new Date(T0.getTime() + 500) },
        ]);
      }
      if (step === 3) {
        return Promise.resolve([]); // marks_awarded is not null filter → no rows
      }
      return Promise.resolve([{ id: NODE_A, code: CODE_A }]);
    }) as unknown as SqlFn;
    const readout = await readCalibration(sql, { now: () => NOW }, LEARNER);
    expect(readout.asksCovered).toBe(1);
    expect(readout.bands.find((b) => b.confidence === "guessing")!.parts).toBe(0);
  });
});
