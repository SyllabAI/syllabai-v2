/**
 * T-MIG-042-PREP — NightlyDecayJob Vercel Cron scaffold: decision law + wiring seam.
 * T-MIG-042 — the seam is now IMPLEMENTED (the Wave-4 cron port, CUTOVER_RUNBOOK
 * §3 "nightly decay takeover"): the seam forwards to the api-of-record's
 * /api/v1/cron/nightly-decay, which owns the decay_job_runs ledger write
 * (the hub stays DB-less — no db driver in apps/hub, by architecture law).
 *
 * SCAFFOLD HISTORY (operator directive trace 1a10c9d1ef9ebbe1): schedule +
 * invoke shape + wiring seam landed with NO decay port (the Wave-4 owner's
 * lane); the port was claimed under the operator's "DECAY GO" order
 * (trace 1a11c1d07db6a9dd) after the Task-50 readiness leg proved the port
 * absent at tip (the runbook §3.1 "it is not [absent]" parenthetical was
 * stale — enabling the env on the stub would 501 every night with ZERO
 * ledger rows, red-ing the §4 watch by its own metric).
 *
 * DECISION LAW (unchanged):
 * - Fail-closed: 401 unless the bearer matches CRON_SECRET (timing-safe,
 *   length-gated — review finding R-2 law).
 * - Env-gated OFF by default: 200 {status:"skipped"} while
 *   DECAY_CRON_ENABLED != "1" (BASELINE_DB §4.3 — the Java core's scheduler
 *   owned decay until the Wave-7 cutover; enabling early risks
 *   double-decay, a correctness bug).
 * - Enabled: the seam runs (T-MIG-042). ADR-031 note: learner-model decay
 *   is READ-TIME math (recomputed from anchors, never persisted — the
 *   T-MIG-066 canonical owner); the nightly job's residual role is the
 *   exactly-once decay_job_runs ledger row (window_start PK idempotency)
 *   that §3.3 / §4 cross-check.
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

/** Result contract the port returns (T-MIG-042 refinement of the 042P
 * contract: the implemented variant carries the api-of-record's ledger
 * outcome — 'ok' (row written) or 'already-run' (window taken by a prior
 * writer) — and the mirrored ledger row, so the cron response is the §3.3
 * cross-check evidence verbatim). */
export interface DecayLedgerRowMirror {
  windowStart: string;
  executedAt: string;
  triggerKind: string;
  decayed: number;
  reviewsScheduled: number;
}

export type DecayRunResult =
  | { implemented: false }
  | {
      implemented: true;
      status: "ok" | "already-run";
      ledgerRow: DecayLedgerRowMirror;
    };

/** Seam invocation deps (T-MIG-042): the takeover writes NO rows from the
 * hub — it forwards the bearer to the api-of-record, which owns the DB.
 * fetchImpl is the test seam; production uses global fetch. */
export interface NightlyDecayDeps {
  /** Server-side base of the v2 api (NEXT_PUBLIC_API_V2_BASE_URL). */
  apiBase: string | undefined;
  /** The incoming (Vercel-Cron-validated) Authorization header, forwarded
   * verbatim — the same CRON_SECRET value is configured on both projects. */
  bearer: string | null;
  fetchImpl?: typeof fetch;
}

/** The wiring seam — IMPLEMENTED by the T-MIG-042 port.
 *
 *  1. window confirmation: the caller's UTC-day window (042P
 *     computeWindowStart law) is forwarded for observability only — the api
 *     derives its OWN server-side window for the ledger row, so a
 *     bearer-holder can never backfill arbitrary windows.
 *  2. the decay_job_runs ledger row is written by the api-of-record
 *     (window_start PK => ON CONFLICT DO NOTHING — a Vercel retry never
 *     double-writes).
 *  3. decay math: RETIRED by the ADR-031 read-time law (T-MIG-066) — the
 *     job's batch-decay role does not exist in v2; the ledger row's
 *     decayed/reviews_scheduled are the honest 0/0.
 *  4. flyway_schema_history / core bookkeeping: untouched (the api route
 *     writes ONLY decay_job_runs).
 *  5. this endpoint remains the ONLY Vercel Cron entry (apps/hub/vercel.json
 *     unchanged; no scheduler was added anywhere).
 *
 * Failure law: LOUD — a misconfigured/unreachable api or a 401 bearer-drift
 * throws (surfacing as a 5xx on the cron hit + the §4 "missing row" metric
 * + deployment logs). The scaffold's 501 not-implemented shape remains in
 * the route as the honest regression signal only. */
export async function runNightlyDecay(
  _windowStart: string,
  deps: NightlyDecayDeps,
): Promise<DecayRunResult> {
  if (!deps.apiBase) {
    throw new Error(
      "[nightly-decay] NEXT_PUBLIC_API_V2_BASE_URL is not configured — the decay takeover seam cannot reach the api-of-record (T-MIG-042)",
    );
  }
  const base = deps.apiBase.replace(/\/+$/, "");
  const res = await (deps.fetchImpl ?? fetch)(`${base}/api/v1/cron/nightly-decay`, {
    method: "GET",
    headers: deps.bearer ? { authorization: deps.bearer } : {},
  });
  if (res.status === 401) {
    throw new Error(
      "[nightly-decay] api-of-record rejected the decay bearer — CRON_SECRET drift between the hub and api projects? (T-MIG-042)",
    );
  }
  if (!res.ok) {
    throw new Error(`[nightly-decay] api-of-record decay ledger write failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { status?: string; ledgerRow?: DecayLedgerRowMirror };
  if (!body?.ledgerRow) {
    throw new Error(
      "[nightly-decay] api-of-record returned no ledgerRow — refusing to report takeover success without ledger evidence (T-MIG-042)",
    );
  }
  return {
    implemented: true,
    status: body.status === "already-run" ? "already-run" : "ok",
    ledgerRow: body.ledgerRow,
  };
}
