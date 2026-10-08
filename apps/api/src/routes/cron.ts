/**
 * T-MIG-042 — GET /api/v1/cron/nightly-decay — the api-of-record arm of the
 * NightlyDecayJob takeover (CUTOVER_RUNBOOK §3).
 *
 * Topology of record: the ONLY Vercel Cron entry is the hub's
 * /api/cron/nightly-decay (042P scaffold, apps/hub/vercel.json "0 2 * * *").
 * The hub is DB-less, so its implemented seam (the T-MIG-042 port) forwards
 * here with the SAME bearer Vercel Cron sent; this route performs the
 * decay_job_runs ledger write this api owns.
 *
 * Auth law — mirrors the hub's 042P R-2 law verbatim: fail-closed 401 when
 * CRON_SECRET is unset/empty on this deployment, and a constant-time,
 * length-gated compare on the full "Bearer <secret>" payload otherwise.
 * The SAME secret value is configured on BOTH Vercel projects (hub + api);
 * drift is a loud 401 at the seam (surfaced in the hub route's 5xx, the
 * §4 watch's "missing row" metric, and the deployment logs).
 *
 * The hub's DECAY_CRON_ENABLED=1 gate stays the single OFF-switch law
 * (§3.1): this api route is keyed purely by the bearer, so disabling the
 * takeover means unsetting the flag on the hub alone — the api route
 * simply stops being called.
 *
 * This is an INFRA-CLASS surface (cron ledger bookkeeping, no
 * learner/teacher domain data): no golden case pins it; the unit battery +
 * the §4 decay_job_runs watch govern it (disclosed in the T-MIG-042 card).
 */
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { runNightlyDecayLedger } from "../services/cron/nightly-decay";

/** Constant-time bearer compare on the full "Bearer <secret>" payload,
 * length-gated before timingSafeEqual (the 042P R-2 law, mirrored). */
function bearerMatches(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildCronRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);

  const r = new Hono();

  r.get("/nightly-decay", async (c) => {
    const cronSecret = env.CRON_SECRET;
    if (!cronSecret) {
      return c.json(
        {
          status: "unauthorized",
          reason:
            "CRON_SECRET is not configured on this api — the decay takeover route fails closed (T-MIG-042)",
        },
        401,
      );
    }
    if (!bearerMatches(c.req.header("authorization") ?? null, cronSecret)) {
      return c.json(
        {
          status: "unauthorized",
          reason:
            "missing or wrong Authorization bearer — the hub seam forwards the Vercel Cron bearer verbatim",
        },
        401,
      );
    }

    // Server-derived window (UTC day, the 042P law) — client-supplied
    // windows are ignored by design (no arbitrary-window backfill).
    const windowStart = new Date().toISOString().slice(0, 10);
    const result = await runNightlyDecayLedger(sql, windowStart);
    return c.json(result, 200);
  });

  return { cronRoute: r };
}
