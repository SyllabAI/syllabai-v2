import { decideDecayCron, runNightlyDecay } from "@/lib/decay/nightly-decay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/nightly-decay — Vercel Cron invoke shape for the
 * NightlyDecayJob (T-MIG-042-PREP scaffold: schedule + invoke shape + wiring
 * seam, NO decay port).
 *
 * - Vercel Cron (vercel.json) calls this daily with
 *   `Authorization: Bearer $CRON_SECRET` (when CRON_SECRET is configured).
 * - Fail-closed: 401 unless the bearer matches CRON_SECRET.
 * - Env-gated OFF by default: 200 {status:"skipped"} while
 *   DECAY_CRON_ENABLED != "1" (BASELINE_DB §4.3 — no double-schedule of
 *   decay until the Wave-7 cutover; the Java core's scheduler keeps owning
 *   decay until then).
 * - When explicitly enabled: invokes the wiring seam, which reports
 *   not-implemented until the Wave-4 port lands (501). ZERO DB contact on
 *   every path in this scaffold.
 */
export async function GET(request: Request) {
  const decision = decideDecayCron({
    authHeader: request.headers.get("authorization"),
    cronSecret: process.env.CRON_SECRET,
    decayEnabled: process.env.DECAY_CRON_ENABLED,
  });

  if (decision.action === "run") {
    // T-MIG-042 port: the seam forwards the (bearer-validated) request to
    // the api-of-record, which owns the decay_job_runs ledger write — the
    // hub stays DB-less by architecture law.
    const result = await runNightlyDecay(decision.windowStart, {
      apiBase: process.env.NEXT_PUBLIC_API_V2_BASE_URL,
      bearer: request.headers.get("authorization"),
    });
    if (!result.implemented) {
      return Response.json(
        {
          status: "not-implemented",
          message:
            "NightlyDecayJob port lands in Wave-4 (T-MIG-042); this is the T-MIG-042-PREP scaffold (schedule + invoke shape + wiring seam only)",
          windowStart: decision.windowStart,
        },
        { status: 501 },
      );
    }
    return Response.json({ status: result.status, ledgerRow: result.ledgerRow });
  }

  return Response.json(decision.body, { status: decision.httpStatus });
}
