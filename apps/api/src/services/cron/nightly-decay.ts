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
 */
import type { SqlFn } from "../identity/users";

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
