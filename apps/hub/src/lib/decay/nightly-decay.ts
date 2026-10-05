/**
 * T-MIG-042-PREP — NightlyDecayJob Vercel Cron scaffold: decision law + wiring seam.
 *
 * SCOPE GUARD (operator directive trace 1a10c9d1ef9ebbe1): this file is
 * SCAFFOLD ONLY — schedule + invoke shape + wiring seam. NO decay port, NO
 * decay math, NO DB calls. The Wave-4 port (MIGRATION_PLAN: T-MIG-040..043,
 * "Ebbinghaus decay subsystem (NightlyDecayJob -> Vercel Cron; decay math is
 * deterministic -> golden-gated)") implements the seam below.
 *
 * DOCTRINE (BASELINE_DB §4.3): the nightly decay job moves to Vercel Cron at
 * cutover; until then the Java core's scheduler keeps running and v2 must
 * NOT double-schedule decay against the same branch — double-decay is a
 * correctness bug, not a perf bug. Hence the scaffold is env-gated OFF by
 * default (DECAY_CRON_ENABLED != "1" => 200 {status:"skipped"}) and touches
 * zero data on every path.
 */
import { timingSafeEqual } from "node:crypto";

/** UTC calendar-day window key (YYYY-MM-DD). The Wave-4 port owns the exact
 * V38 window semantics; the scaffold uses the UTC day so scheduled hits while
 * OFF still log/report a meaningful window. */
export function computeWindowStart(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type DecayCronDecision =
  | {
      action: "unauthorized";
      httpStatus: 401;
      body: { status: "unauthorized"; reason: string };
    }
  | {
      action: "skipped";
      httpStatus: 200;
      body: { status: "skipped"; reason: string; windowStart: string };
    }
  | { action: "run"; httpStatus: null; windowStart: string };

/** Timing-safe bearer comparison (review finding R-2, self-review under
 * delegated authority trace 1a10cbee26611c61): constant-time equality on the
 * full "Bearer <secret>" payload, length-gated before timingSafeEqual. */
function bearerMatches(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Pure cron-invocation decision law (unit-tested; the route is a thin adapter).
 *
 * 1. Fail-closed auth: if CRON_SECRET is unset/empty, or the request's
 *    Authorization header is not exactly `Bearer <CRON_SECRET>` (timing-safe
 *    compare), refuse (401). Vercel Cron sends that header automatically when
 *    CRON_SECRET is set on the project; manual/local callers must present it
 *    explicitly.
 * 2. Env gate: DECAY_CRON_ENABLED != "1" => 200 {status:"skipped"} — the
 *    scheduled hit is a harmless no-op (§4.3 default until Wave-7 cutover).
 * 3. Otherwise the seam is invoked (which currently reports not-implemented).
 */
export function decideDecayCron(input: {
  authHeader: string | null;
  cronSecret: string | undefined;
  decayEnabled: string | undefined;
  now?: Date;
}): DecayCronDecision {
  const { authHeader, cronSecret, decayEnabled } = input;

  if (!cronSecret) {
    return {
      action: "unauthorized",
      httpStatus: 401,
      body: {
        status: "unauthorized",
        reason:
          "CRON_SECRET is not configured on this deployment — the decay cron endpoint fails closed (set CRON_SECRET to enable authenticated Vercel Cron invocations)",
      },
    };
  }

  if (!bearerMatches(authHeader, cronSecret)) {
    return {
      action: "unauthorized",
      httpStatus: 401,
      body: {
        status: "unauthorized",
        reason:
          "missing or wrong Authorization bearer — Vercel Cron sends 'Authorization: Bearer $CRON_SECRET' when CRON_SECRET is set",
      },
    };
  }

  const windowStart = computeWindowStart(input.now ?? new Date());

  if (decayEnabled !== "1") {
    return {
      action: "skipped",
      httpStatus: 200,
      body: {
        status: "skipped",
        reason:
          "DECAY_CRON_ENABLED != '1' — decay cron is env-gated OFF (BASELINE_DB §4.3: the Java core's scheduler owns decay until the Wave-7 cutover; enabling early risks double-decay, a correctness bug)",
        windowStart,
      },
    };
  }

  return { action: "run", httpStatus: null, windowStart };
}

/** Result contract the Wave-4 port must return. */
export type DecayRunResult =
  | { implemented: false }
  | {
      implemented: true;
      /** Mirror of the decay_job_runs ledger row written by the port. */
      ledgerRow: {
        windowStart: string;
        executedAt: string;
        [k: string]: unknown;
      };
    };

/** The wiring seam the Wave-4 NightlyDecayJob port implements.
 *
 * Scaffold stub: reports not-implemented and performs NOTHING (zero DB
 * contact, zero writes). The port (T-MIG-042, Wave 4) must:
 *  1. confirm the UTC decay window (V38 semantics; window_start is the
 *     decay_job_runs primary key — retries must be idempotent),
 *  2. write the decay_job_runs ledger row (window_start PK => ON-CONFLICT
 *     skip semantics, so a Vercel retry never double-decays),
 *  3. apply the deterministic Ebbinghaus decay math — golden-gated per
 *     MIGRATION_PLAN Wave 4,
 *  4. never touch flyway_schema_history or any core-owned bookkeeping table,
 *  5. keep this endpoint the ONLY Vercel Cron entry (no second scheduler).
 */
export async function runNightlyDecay(_windowStart: string): Promise<DecayRunResult> {
  console.info(
    "[nightly-decay] seam invoked — decay port NOT implemented (T-MIG-042-PREP scaffold; the Wave-4 port owns the implementation)",
  );
  return { implemented: false };
}
