/**
 * T-MIG-126 — the review-schedules writer band battery: the pass law, the
 * window composition law, and the C-4 race law, against a MOCK SqlFn (the
 * createSql adapter shape — zero DB contact, the 042 test posture).
 *
 * Frozen pins (NightlyDecayJob.java :1-191 @ core 6cad6ef, the run-002
 * spec of record): idle grace 2d, page 500 ORDER BY last_practiced_at ASC
 * id ASC with the ALWAYS-terminating empty-page query, effective =
 * P0·e^(−t/τ) recomputed and never written back, decayed = effective <
 * prior (:164), review threshold STRICT < 0.6 (:163), the PENDING
 * exists-dedup (:172-174), the INSERT shape due_at=created_at=pass-instant
 * reason=DECAY_CROSSED_THRESHOLD (:175-177); the window law: gate ->
 * pass -> BARE ledger INSERT with the REAL counts (a window race fails
 * the loser's transaction — C-4, :47-49); a quiet night records an honest
 * 0/0 row. Boundary values verified first-hand (node, whole-day elapses):
 * 0.62 @ 3d idle -> 0.5996739822988436 (row); just past the 2d grace the
 * effective stays ~0.6064 (no row, strict <).
 */
import { describe, expect, it } from "bun:test";
import {
  findDecayLedgerRow,
  runNightlyDecayWindow,
  type DecayLedgerRow,
  type DecayWindowSql,
} from "../../src/services/cron/nightly-decay";
import {
  runReviewSchedulerPass,
  REVIEW_IDLE_GRACE_DAYS,
  REVIEW_PAGE_SIZE,
} from "../../src/services/cron/review-scheduler";
import type { ModelUpdateClock } from "../../src/services/learner-model/model-update";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-18T02:05:00Z");

/** Fixed clock: deterministic ids (the pass reads newId only; now() is
 * pinned for type completeness — the pass takes its instant via opts.now). */
let idCounter = 0;
const clock: ModelUpdateClock = {
  newId: () => `test-uuid-${++idCounter}`,
  now: () => NOW,
};

/** A SqlFn mock that records rendered SQL and returns a scripted sequence
 * of row batches; an Error entry THROWS at that call (the C-4 violation
 * pin). transaction(body) runs the body against the same mock (the adapter
 * shape — one connection, one transaction). */
function mockSql(sequence: Array<Array<Record<string, unknown>> | Error>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join("?"), params });
    const next = sequence.shift();
    if (next === undefined) throw new Error("mockSql: unexpected extra call");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }) as unknown as DecayWindowSql;
  (fn as unknown as { transaction: unknown }).transaction = async (
    body: (tx: unknown) => Promise<unknown>,
  ) => body(fn);
  return { fn, calls };
}

function state(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    learner_id: "11111111-1111-1111-1111-111111111111",
    node_id: "22222222-2222-2222-2222-222222222222",
    mastery: 0.35,
    last_practiced_at: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
    ...overrides,
  };
}

const LEDGER_ROW = {
  window_start: "2026-10-18T00:00:00Z",
  executed_at: "2026-10-18T02:05:01Z",
  trigger_kind: "vercel-cron",
  decayed: 1,
  reviews_scheduled: 1,
};

describe("runReviewSchedulerPass (the T-MIG-126 pass law)", () => {
  it("threshold crossing inserts: P0=0.35 @ 30d idle (low band) -> row with the EXACT IEEE effective", async () => {
    const { fn, calls } = mockSql([
      [state()], // page 1
      [], // pending check -> none
      [], // the INSERT (no RETURNING read)
      [], // page 2 (the terminating empty query)
    ]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 1, reviewsScheduled: 1 });
    // call order: page -> pending -> insert -> terminating page
    expect(calls.length).toBe(4);
    expect(calls[0]!.text).toContain("from skill_states");
    expect(calls[1]!.text.replace(/\s+/g, " ")).toContain(
      "from review_schedules where learner_id",
    );
    expect(calls[1]!.text).toContain("status");
    expect(calls[1]!.text).toContain("limit 1");
    const ins = calls[2]!;
    expect(ins.text.replace(/\s+/g, " ")).toContain(
      "insert into review_schedules",
    );
    // the row-shape pin: the full column list, incl. mastery_at_trigger
    // (research traceability); the literals ride as PARAMS, not SQL text
    expect(ins.text.replace(/\s+/g, " ")).toContain(
      "(id, learner_id, node_id, due_at, reason, mastery_at_trigger, status, created_at)",
    );
    // params: [id, learner, node, due_at, reason, effective, status, created_at]
    expect(ins.params[0]).toBe("test-uuid-1");
    expect(ins.params[1]).toBe("11111111-1111-1111-1111-111111111111");
    expect(ins.params[2]).toBe("22222222-2222-2222-2222-222222222222");
    expect(ins.params[3]).toBe(NOW.toISOString());
    expect(ins.text).toContain("::timestamptz");
    expect(ins.params[4]).toBe("DECAY_CROSSED_THRESHOLD");
    // the frozen IEEE double, computed by the SAME expression as the source
    expect(ins.params[5]).toBe(0.35 * Math.exp(-1));
    expect(ins.params[6]).toBe("PENDING");
    expect(ins.params[7]).toBe(NOW.toISOString());
  });

  it("STRICT < boundary: 0.62 @ ~2d idle -> effective ~0.6064 >= 0.6 = NO row, but decayed counts", async () => {
    const { fn, calls } = mockSql([
      [state({ mastery: 0.62, last_practiced_at: new Date(NOW.getTime() - (2 * DAY_MS + 3_600_000)).toISOString() })],
      [], // terminating page
    ]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 1, reviewsScheduled: 0 });
    // exactly 2 calls: NO pending read, NO insert (the threshold never opened)
    expect(calls.length).toBe(2);
    expect(calls.every((c) => !c.text.includes("review_schedules"))).toBe(true);
  });

  it("crossing fires 1 ulp below the boundary: 0.62 @ 3d idle -> effective 0.5996739822988436 < 0.6 -> row", async () => {
    const { fn, calls } = mockSql([
      [state({ mastery: 0.62, last_practiced_at: new Date(NOW.getTime() - 3 * DAY_MS).toISOString() })],
      [],
      [],
      [],
    ]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 1, reviewsScheduled: 1 });
    const ins = calls[2]!;
    expect(ins.params[5]).toBe(0.62 * Math.exp(-(3 * DAY_MS) / (90 * DAY_MS)));
  });

  it("the PENDING dedup: an existing PENDING row suppresses the insert, decayed still counts (:172-174)", async () => {
    const { fn, calls } = mockSql([
      [state()],
      [{ "?column?": 1 }], // the exists-dedup read HITS
      [], // terminating page
    ]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 1, reviewsScheduled: 0 });
    expect(calls.length).toBe(3);
    expect(calls.every((c) => !c.text.includes("insert into review_schedules"))).toBe(
      true,
    );
  });

  it("the idle-grace + paging law: WHERE rides now−2d, ORDER BY last_practiced_at asc, id asc, LIMIT 500, and the terminating empty page always issues", async () => {
    const { fn, calls } = mockSql([[]]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 0, reviewsScheduled: 0 });
    expect(calls.length).toBe(1);
    const c0 = calls[0]!;
    const text = c0.text.replace(/\s+/g, " ");
    expect(text).toContain("last_practiced_at <");
    expect(text).toContain("order by last_practiced_at asc, id asc");
    expect(text).toContain("limit");
    expect(text).toContain("offset");
    // param 0 = the idle-since instant: now − REVIEW_IDLE_GRACE_DAYS (2d);
    // the ::timestamptz cast rides the SQL text, the param stays the ISO string
    expect(REVIEW_IDLE_GRACE_DAYS).toBe(2);
    expect(c0.params[0]).toBe(
      new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
    );
    expect(c0.text).toContain("::timestamptz");
    expect(REVIEW_PAGE_SIZE).toBe(500);
  });

  it("pagination advances by 500 and ALWAYS issues the terminating empty-page query (the frozen while-shape)", async () => {
    const { fn, calls } = mockSql([
      [state()], // page 1 (offset 0) — a partial page still queries on
      [],
      [],
      [], // page 2 (offset 500) — the terminating empty query
    ]);
    await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(calls.length).toBe(4);
    expect(calls[0]!.params).toContain(0); // offset 0
    expect(calls[3]!.params).toContain(500); // offset 500
    // scripting economy: one scripted state stands for the 601-state
    // two-page shape — the MECHANISM (offset += 500 after every page,
    // empty page terminates) is what this battery pins
  });

  it("zero idle states = the honest no-op (byte-identical to the pre-band wire)", async () => {
    const { fn, calls } = mockSql([[]]);
    const outcome = await runReviewSchedulerPass(fn, clock, { now: NOW });
    expect(outcome).toEqual({ decayed: 0, reviewsScheduled: 0 });
    expect(calls.length).toBe(1); // one page read, zero writes
    expect(calls.every((c) => !c.text.includes("insert"))).toBe(true);
  });
});

describe("runNightlyDecayWindow (the T-MIG-126 window composition law)", () => {
  it("ok path: gate -> pass -> BARE ledger INSERT carrying the REAL counts", async () => {
    const { fn, calls } = mockSql([
      [], // gate: window not run
      [state()], // pass page 1
      [], // pending check
      [], // review INSERT
      [], // pass page 2 (terminating)
      [LEDGER_ROW], // ledger INSERT RETURNING
    ]);
    const result = await runNightlyDecayWindow(fn, clock, {
      windowStart: "2026-10-18",
      now: NOW,
    });
    expect(result.status).toBe("ok");
    expect(result.ledgerRow).toEqual({
      windowStart: "2026-10-18T00:00:00Z",
      executedAt: "2026-10-18T02:05:01Z",
      triggerKind: "vercel-cron",
      decayed: 1,
      reviewsScheduled: 1,
    } satisfies DecayLedgerRow);
    const gate = calls[0]!;
    expect(gate.text).toContain("decay_job_runs");
    const ledger = calls[5]!;
    const ledgerText = ledger.text.replace(/\s+/g, " ");
    expect(ledgerText).toContain("INSERT INTO decay_job_runs");
    expect(ledgerText).toContain("RETURNING");
    // the C-4 law: the window claim is a BARE insert — a race must FAIL
    // the loser's transaction, never no-op through it
    expect(ledgerText).not.toContain("ON CONFLICT");
    // the honest counts ride as params (server-computed, injection-safe)
    expect(ledger.params).toContain(1); // decayed
    expect(ledger.params).toContain(1); // reviewsScheduled
  });

  it("already-run gate: a handled window short-circuits BEFORE the pass (never a second pass, never a second write)", async () => {
    const { fn, calls } = mockSql([
      [
        {
          window_start: "2026-10-18T00:00:00Z",
          executed_at: "2026-10-18T02:05:01Z",
          trigger_kind: "vercel-cron",
          decayed: 7,
          reviews_scheduled: 3,
        },
      ],
    ]);
    const result = await runNightlyDecayWindow(fn, clock, {
      windowStart: "2026-10-18",
      now: NOW,
    });
    expect(result.status).toBe("already-run");
    expect(result.ledgerRow.decayed).toBe(7);
    expect(result.ledgerRow.reviewsScheduled).toBe(3);
    expect(calls.length).toBe(1); // the gate read ONLY
    expect(calls[0]!.text).toContain("decay_job_runs");
  });

  it("the C-4 race pin: the ledger PK violation THROWS out of the transaction (the loser's review inserts roll back with it)", async () => {
    const { fn } = mockSql([
      [], // gate
      [state()], // pass page 1
      [], // pending check
      [], // review INSERT (inside the doomed transaction)
      [], // terminating page
      new Error("unique_violation: decay_job_runs_pkey (the C-4 loser)"),
    ]);
    await expect(
      runNightlyDecayWindow(fn, clock, { windowStart: "2026-10-18", now: NOW }),
    ).rejects.toThrow(/decay_job_runs_pkey/);
  });

  it("a quiet night still records its row with honest 0/0 counts (zero idle states, never a silent skip)", async () => {
    const { fn, calls } = mockSql([
      [], // gate
      [], // pass page 1 = zero idle states
      [{ ...LEDGER_ROW, decayed: 0, reviews_scheduled: 0 }],
    ]);
    const result = await runNightlyDecayWindow(fn, clock, {
      windowStart: "2026-10-18",
      now: NOW,
    });
    expect(result.status).toBe("ok");
    expect(result.ledgerRow.decayed).toBe(0);
    expect(result.ledgerRow.reviewsScheduled).toBe(0);
    expect(calls.length).toBe(3);
    expect(calls.every((c) => !c.text.includes("review_schedules"))).toBe(true);
  });

  it("findDecayLedgerRow: the gate read maps the row or returns null", async () => {
    const hit = mockSql([[LEDGER_ROW]]);
    const row = await findDecayLedgerRow(hit.fn, "2026-10-18");
    expect(row).not.toBeNull();
    expect(row!.decayed).toBe(1);
    const miss = mockSql([[]]);
    expect(await findDecayLedgerRow(miss.fn, "2026-10-18")).toBeNull();
  });
});
