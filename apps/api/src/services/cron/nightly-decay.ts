/**
 * T-MIG-042 — the NightlyDecayJob ledger writer (the Wave-4 cron port's
 * DB arm, CUTOVER_RUNBOOK §3 "nightly decay takeover").
 *
 * ARCHITECTURE LAW: the hub is DB-less (the frontend never touches Neon —
 * no db driver in apps/hub). The vercel.json cron entry lives on the hub
 * (the 042P scaffold, the ONLY Vercel Cron entry), so the takeover seam
 * forwards here — the api-of-record — which owns every DB write.
 *
 * ADR-031 LAW (T-MIG-066 canonical owner, services/learner-model/decay.ts):
 * learner-model decay is READ-TIME math — recomputed from the stored anchors
 * on every call and NEVER persisted. The core's NightlyDecayJob batch-decay
 * role is therefore RETIRED in v2, not ported: decayed = 0 and
 * reviews_scheduled = 0 are the honest batch-effect counts of the read-time
 * architecture. The ledger row's residual job is the §3.3 / §4 watch
 * evidence of record: exactly one row per UTC window at 02:00 UTC+ε — the
 * takeover proof the runbook cross-checks the morning after the env act.
 *
 * IDEMPOTENCY (the 042P seam contract item 2): window_start is the
 * decay_job_runs PRIMARY KEY; the INSERT is ON CONFLICT DO NOTHING, so a
 * Vercel retry, a manual first-fire, or the scheduled hit racing a manual
 * one can NEVER double-write a window. `executed_at` preserves the FIRST
 * writer (DO NOTHING keeps the original row) — exactly-once semantics.
 *
 * The window law is the 042P scaffold's computeWindowStart (UTC day,
 * YYYY-MM-DD) — the V38/@Scheduled hour confirmation the 042P acceptance
 * deferred to port time stays empirically open (the frozen core source is
 * not lane-readable and api.neon.tech is egress-blocked for lane reads);
 * the CUTOVER_RUNBOOK §1.2/§4 pins 02:00 UTC as the law of record and the
 * core-era ledger rows will confirm the historical hour at the §3.3
 * cross-check. This service derives its own window server-side and IGNORES
 * any client-supplied window — a bearer-holder can never backfill
 * arbitrary windows.
 *
 * T-MIG-126 ADDENDUM (the review-schedules WRITER BAND, built on operator
 * trace 1a1501aea6c2b049 "build it"; spec = the run-002 band_spec of
 * record, PR #193): the route's window flow gains the review-scheduler
 * pass COMPOSED INTO ONE transaction — runNightlyDecayWindow(sql, clock,
 * {windowStart}) runs [ledger gate -> runReviewSchedulerPass -> BARE
 * ledger INSERT carrying the pass's REAL decayed/reviewsScheduled
 * counts]. The bare INSERT is the C-4 law verbatim (the frozen job's
 * race posture: "the ledger's primary key fails the loser's transaction
 * and its idempotent writes roll back" — NightlyDecayJob.java :47-49): a
 * concurrent window loser raises unique_violation and its review inserts
 * roll back with it. The legacy runNightlyDecayLedger (below) is
 * UNTOUCHED — its ON CONFLICT DO NOTHING + literal 0,0 contract stays
 * the standalone 042 law (its pins stay byte-green); the band's real
 * counts ride the window path only. The 042 zero-cell era ends by law:
 * the columns were built for exactly these counts (DecayLedgerRow
 * already carried them).
 */
import type { SqlFn } from "../identity/users";
import type { ModelUpdateClock as Clock } from "../learner-model/model-update";
import { runReviewSchedulerPass } from "./review-scheduler";

export interface DecayLedgerRow {
  windowStart: string;
  executedAt: string;
  triggerKind: string;
  decayed: number;
  reviewsScheduled: number;
}

export type DecayLedgerResult =
  | { status: "ok"; ledgerRow: DecayLedgerRow }
  | { status: "already-run"; ledgerRow: DecayLedgerRow };

/** 'YYYY-MM-DD' (the 042P UTC-day law) -> a UTC-midnight timestamptz literal
 * for the decay_job_runs.window_start PK. Validates the CALENDAR too (a
 * shape-only regex would accept 2026-13-99); this is a server-derived
 * value, so a malformed shape is a programming error. */
export function decayWindowTimestamp(windowStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(windowStart);
  if (!m) {
    throw new Error(`[decay-ledger] windowStart must be the UTC day 'YYYY-MM-DD' (042P law), got: ${windowStart}`);
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`[decay-ledger] windowStart is not a real UTC calendar day: ${windowStart}`);
  }
  return `${windowStart}T00:00:00Z`;
}

function toLedgerRow(r: Record<string, unknown>): DecayLedgerRow {
  return {
    windowStart: String(r.window_start ?? ""),
    executedAt: String(r.executed_at ?? ""),
    triggerKind: String(r.trigger_kind ?? ""),
    decayed: Number(r.decayed ?? 0),
    reviewsScheduled: Number(r.reviews_scheduled ?? 0),
  };
}

/** Writes (or finds) the exactly-one ledger row for the window.
 *
 * NOTE (adapter law): the createSql adapter (services/identity/users) exposes
 * only the tagged-template fn + transaction — NO `.raw()` — so the column
 * list is inlined literally (a constant, injection-free by construction). */
export async function runNightlyDecayLedger(
  sql: SqlFn,
  windowStart: string,
  opts: { now?: Date; triggerKind?: string } = {},
): Promise<DecayLedgerResult> {
  const windowTs = decayWindowTimestamp(windowStart);
  const executedAt = (opts.now ?? new Date()).toISOString();
  const triggerKind = opts.triggerKind ?? "vercel-cron"; // varchar(20) law

  const inserted = (await sql`
    INSERT INTO decay_job_runs (window_start, executed_at, trigger_kind, decayed, reviews_scheduled)
    VALUES (${windowTs}::timestamptz, ${executedAt}::timestamptz, ${triggerKind}, 0, 0)
    ON CONFLICT (window_start) DO NOTHING
    RETURNING window_start::text, executed_at::text, trigger_kind, decayed, reviews_scheduled
  `) as Array<Record<string, unknown>>;

  if (inserted.length > 0 && inserted[0] !== undefined) {
    return { status: "ok", ledgerRow: toLedgerRow(inserted[0]) };
  }

  // The window already has its row (retry / manual-fire race / scheduled
  // re-hit) — report the EXISTING row, never a second write.
  const existing = (await sql`
    SELECT window_start::text, executed_at::text, trigger_kind, decayed, reviews_scheduled
    FROM decay_job_runs WHERE window_start = ${windowTs}::timestamptz
  `) as Array<Record<string, unknown>>;

  if (existing.length > 0 && existing[0] !== undefined) {
    return { status: "already-run", ledgerRow: toLedgerRow(existing[0]) };
  }

  // Only reachable if a concurrent writer deleted the row between the
  // INSERT and the SELECT — no code path does this; fail loud rather than
  // fabricate a row.
  throw new Error(
    `[decay-ledger] window ${windowStart} lost between INSERT-conflict and SELECT — refusing to fabricate`,
  );
}

/** The transaction-capable adapter shape (createSql returns exactly this;
 * the concrete NeonSql class is unexported, so the band pins the STRUCTURE). */
export type DecayWindowSql = SqlFn & {
  transaction<T>(fn: (tx: SqlFn) => Promise<T>): Promise<T>;
};

/** The ledger gate read (the frozen existsById(windowStart) check
 * :103-106) — null when the window has not run yet. */
export async function findDecayLedgerRow(
  sql: SqlFn,
  windowStart: string,
): Promise<DecayLedgerRow | null> {
  const windowTs = decayWindowTimestamp(windowStart);
  const existing = (await sql`
    SELECT window_start::text, executed_at::text, trigger_kind, decayed, reviews_scheduled
    FROM decay_job_runs WHERE window_start = ${windowTs}::timestamptz
  `) as Array<Record<string, unknown>>;
  const row = existing[0];
  return row === undefined ? null : toLedgerRow(row);
}

/**
 * T-MIG-126 — the FULL nightly window law, composed: ONE transaction
 * containing [the ledger gate -> the review-scheduler pass -> the BARE
 * ledger INSERT with the pass's REAL counts].
 *
 * Transaction shape = the frozen NightlyDecayJob.applyForgettingDecay
 * (:94-115, @Transactional): the gate read (:103-106) short-circuits the
 * window (already-run = no second pass — a retry, a manual first-fire
 * racing the scheduled hit, or a re-hit never double-writes); the pass
 * runs inside the caller's transaction exactly like the frozen private
 * runDecayPass; the ledger INSERT is BARE (no ON CONFLICT) so a window
 * race fails the loser's whole transaction — review inserts included —
 * the C-4 posture verbatim (:47-49). Exactly-once semantics are
 * PRESERVED and UPGRADED: the 042 INSERT-first claim becomes
 * gate-first-pass-then-claim, and the claimed row now carries the honest
 * batch-effect counts instead of the read-time-era 0,0.
 */
export async function runNightlyDecayWindow(
  sql: DecayWindowSql,
  clock: Clock,
  opts: { windowStart: string; now?: Date; triggerKind?: string },
): Promise<DecayLedgerResult> {
  const windowTs = decayWindowTimestamp(opts.windowStart);
  const executedAt = (opts.now ?? new Date()).toISOString();
  const triggerKind = opts.triggerKind ?? "vercel-cron"; // varchar(20) law
  return sql.transaction(async (tx) => {
    // :103-106 — the gate: a handled window is never re-run
    const existing = await findDecayLedgerRow(tx, opts.windowStart);
    if (existing != null) {
      return { status: "already-run", ledgerRow: existing } satisfies DecayLedgerResult;
    }
    // the review-scheduling arm of the frozen pass (:133-190)
    const counts = await runReviewSchedulerPass(tx, clock, { now: opts.now ?? new Date() });
    // :110-111 — decayJobRuns.save(new DecayJobRun(windowStart, now, trigger, outcome))
    // BARE insert: a concurrent window claim must FAIL this transaction
    // (the C-4 loser rollback), never no-op through it.
    const inserted = (await tx`
      INSERT INTO decay_job_runs (window_start, executed_at, trigger_kind, decayed, reviews_scheduled)
      VALUES (${windowTs}::timestamptz, ${executedAt}::timestamptz, ${triggerKind}, ${counts.decayed}, ${counts.reviewsScheduled})
      RETURNING window_start::text, executed_at::text, trigger_kind, decayed, reviews_scheduled
    `) as Array<Record<string, unknown>>;
    const row = inserted[0];
    if (row === undefined) {
      // Unreachable while the gate + the PK hold (the gate read and the
      // insert run in the same transaction); fail loud rather than
      // fabricate — the 042 refusal law.
      throw new Error(
        `[decay-ledger] window ${opts.windowStart} INSERT returned no row — refusing to fabricate`,
      );
    }
    return { status: "ok", ledgerRow: toLedgerRow(row) } satisfies DecayLedgerResult;
  });
}
