/**
 * T-TUTOR-AIM-P3 RUN-002 — the nightly wiring of the served-evidence
 * retention sweep (the DC10 §7.7 run-001 receipt's disclosed residual,
 * closed here on the operator's "proceed").
 *
 * THE LAWS PINNED HERE (all through the runNightlyDispatch composition —
 * the mock-SqlFn pattern of record, zero DB contact):
 *   - the sweep rides AFTER the window's bare ledger INSERT (the call
 *     order of record): the T-MIG-126 window transaction is UNTOUCHED and
 *     the purge is never transaction-bound
 *   - the sweep rides BOTH dispatch outcomes (ok AND already-run): the
 *     delete is idempotent housekeeping (served_at < cutoff), a re-hit
 *     re-sweeps harmlessly and heals a first fire that degraded
 *   - degrade-never-block: a sweep throw NEVER fails the dispatch — the
 *     window result rides untouched, servedEvidencePurged degrades to
 *     null, the error discloses under the stable [served-evidence-purge]
 *     log prefix
 *   - the count of record is the HONEST CTE count, disclosed via the log
 *     line only — it NEVER rides the wire (the hub seam forwards
 *     {status, ledgerRow} only)
 */
import { describe, expect, test } from "bun:test";
import {
  runNightlyDispatch,
  SERVED_EVIDENCE_PURGE_LOG_PREFIX,
  type DecayLedgerRow,
  type DecayWindowSql,
} from "../../src/services/cron/nightly-decay";

const WINDOW = "2026-11-19";

const ROW: Record<string, unknown> = {
  window_start: "2026-11-19T00:00:00Z",
  executed_at: "2026-11-19T02:00:01Z",
  trigger_kind: "vercel-cron",
  decayed: 0,
  reviews_scheduled: 0,
};

const clock = {
  newId: () => "test-id-1",
  now: () => new Date("2026-11-19T02:00:01Z"),
};

/** A scripted SqlFn mock with the transaction passthrough (the
 * DecayWindowSql shape — the createSql adapter's begin/commit collapse to
 * the same recorded stream; call ORDER is the law under test). A scripted
 * Error entry makes that call reject. */
function dispatchSql(
  sequence: Array<Array<Record<string, unknown>> | Error>,
): { fn: DecayWindowSql; calls: Array<{ text: string; params: unknown[] }> } {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join("?"), params });
    const next = sequence.shift();
    if (next === undefined) throw new Error("dispatchSql: unexpected extra call");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }) as unknown as DecayWindowSql;
  (fn as unknown as { transaction: unknown }).transaction = async <T>(
    body: (tx: DecayWindowSql) => Promise<T>,
  ): Promise<T> => body(fn);
  return { fn, calls };
}

const norm = (s: string): string => s.replace(/\s+/g, " ").toLowerCase();

describe("runNightlyDispatch (the T-TUTOR-AIM-P3 run-002 nightly composition)", () => {
  test("the sweep rides AFTER the window's bare ledger INSERT — the call order of record", async () => {
    const { fn, calls } = dispatchSql([
      [], // 1. the gate: SELECT decay_job_runs -> no row
      [], // 2. the review pass: SELECT skill_states -> empty first page
      [ROW], // 3. the bare ledger INSERT RETURNING
      [{ deleted: 7 }], // 4. the retention sweep CTE
    ]);
    const outcome = await runNightlyDispatch(fn, clock, { windowStart: WINDOW });
    expect(outcome.result.status).toBe("ok");
    expect(outcome.result.ledgerRow).toEqual({
      windowStart: "2026-11-19T00:00:00Z",
      executedAt: "2026-11-19T02:00:01Z",
      triggerKind: "vercel-cron",
      decayed: 0,
      reviewsScheduled: 0,
    } satisfies DecayLedgerRow);
    expect(outcome.servedEvidencePurged).toBe(7);
    expect(calls.length).toBe(4);
    expect(norm(calls[0]!.text)).toContain("from decay_job_runs where window_start");
    expect(norm(calls[2]!.text)).toContain("insert into decay_job_runs");
    // the sweep's CTE — and it is the LAST call: after the window's
    // transaction body, never inside it (the placement law)
    const sweep = norm(calls[3]!.text);
    expect(sweep).toContain("with deleted as");
    expect(sweep).toContain("delete from tutor_served_evidence where served_at <");
    expect(sweep).toContain("returning 1");
    expect(sweep).toContain("select count(*)::int as deleted from deleted");
  });

  test("the sweep rides the already-run dispatch too (a re-hit re-sweeps — idempotent housekeeping)", async () => {
    const { fn, calls } = dispatchSql([
      [ROW], // the gate finds the window's row -> already-run
      [{ deleted: 0 }], // the sweep still runs
    ]);
    const outcome = await runNightlyDispatch(fn, clock, { windowStart: WINDOW });
    expect(outcome.result.status).toBe("already-run");
    expect(outcome.servedEvidencePurged).toBe(0);
    expect(calls.length).toBe(2);
    expect(norm(calls[1]!.text)).toContain("with deleted as");
  });

  test("a sweep throw DEGRADES: the window result rides untouched, the count is null, no rejection (degrade-never-block)", async () => {
    const errors: Array<unknown> = [];
    const infos: Array<string> = [];
    const origError = console.error;
    const origInfo = console.info;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    console.info = (...args: unknown[]) => {
      infos.push(args.map(String).join(" "));
    };
    try {
      const { fn, calls } = dispatchSql([
        [], // the gate: no row
        [], // the review pass: empty page
        [ROW], // the bare ledger INSERT
        new Error("purge boom"), // the sweep THROWS
      ]);
      const outcome = await runNightlyDispatch(fn, clock, { windowStart: WINDOW });
      // the window result is INTACT — the dispatch never rejects on the
      // sweep's behalf (housekeeping never fails the nightly band)
      expect(outcome.result.status).toBe("ok");
      expect(outcome.result.ledgerRow.windowStart).toBe("2026-11-19T00:00:00Z");
      expect(outcome.servedEvidencePurged).toBe(null);
      expect(calls.length).toBe(4);
      // the degrade discloses under the stable prefix
      expect(errors.length).toBe(1);
      expect(String(errors[0])).toContain(SERVED_EVIDENCE_PURGE_LOG_PREFIX);
      expect(infos.some((l) => l.includes("degraded"))).toBe(true);
    } finally {
      console.error = origError;
      console.info = origInfo;
    }
  });

  test("the log law: the honest count of record lives under the [served-evidence-purge] prefix, never on the wire", async () => {
    const infos: Array<string> = [];
    const origInfo = console.info;
    console.info = (...args: unknown[]) => {
      infos.push(args.map(String).join(" "));
    };
    try {
      const { fn } = dispatchSql([
        [],
        [],
        [ROW],
        [{ deleted: 3 }],
      ]);
      const outcome = await runNightlyDispatch(fn, clock, { windowStart: WINDOW });
      expect(outcome.servedEvidencePurged).toBe(3);
      // the ledger result carries NO sweep field — the wire shape is the
      // T-MIG-126 law's (status + ledgerRow only)
      expect(Object.keys(outcome.result)).toEqual(["status", "ledgerRow"]);
      expect(infos.some((l) => l.includes(SERVED_EVIDENCE_PURGE_LOG_PREFIX) && l.includes("deleted=3"))).toBe(
        true,
      );
    } finally {
      console.info = origInfo;
    }
  });
});
