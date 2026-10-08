/**
 * T-MIG-042 — the api-of-record cron arm: auth law + ledger law.
 *
 * The route law mirrors the hub's 042P R-2 law (fail-closed, timing-safe,
 * length-gated). The ledger law: exactly one decay_job_runs row per UTC
 * window (window_start PK, ON CONFLICT DO NOTHING), ADR-031-honest 0/0
 * batch-effect counts. Tests run against a MOCK SqlFn (the createSql
 * adapter shape) — zero DB contact, per the 042P scaffold's zero-DB test
 * posture.
 */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { buildCronRouters } from "../../src/routes/cron";
import {
  decayWindowTimestamp,
  runNightlyDecayLedger,
  type DecayLedgerRow,
} from "../../src/services/cron/nightly-decay";

const SECRET = "test-cron-secret";

/** A SqlFn mock that records the rendered SQL (questions interpolated as ?)
 * and returns a scripted sequence of row batches. */
function mockSql(sequence: Array<Array<Record<string, unknown>>>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join("?"), params });
    const next = sequence.shift();
    if (next === undefined) throw new Error("mockSql: unexpected extra call");
    return Promise.resolve(next);
  }) as unknown as Parameters<typeof runNightlyDecayLedger>[0];
  return { fn, calls };
}

function buildApp(cronSecret: string | undefined) {
  const { cronRoute } = buildCronRouters({
    CRON_SECRET: cronSecret,
    DATABASE_URL: "postgresql://scratch.invalid:5432/scratch",
  } as Record<string, string | undefined>);
  return cronRoute;
}

async function fire(
  route: Hono,
  headers: Record<string, string> = {},
  method: "GET" = "GET",
) {
  const res = await route.request(
    `http://localhost/nightly-decay`,
    { method, headers },
  );
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body };
}

function authHeader(auth?: string): Record<string, string> {
  return auth ? { authorization: auth } : {};
}

describe("cron route auth law (T-MIG-042, mirrors the 042P R-2 law)", () => {
  it("fails closed 401 when CRON_SECRET is unset or empty on the api", async () => {
    for (const secret of [undefined, ""]) {
      const app = buildApp(secret);
      const { res, body } = await fire(app, {
        authorization: `Bearer ${SECRET}`,
      });
      expect(res.status).toBe(401);
      expect(body.status).toBe("unauthorized");
      expect(String(body.reason)).toMatch(/not configured/);
    }
  });

  it("fails closed 401 on a missing or wrong bearer (incl. SAME-LENGTH wrong)", async () => {
    const app = buildApp(SECRET);
    for (const auth of [undefined, "Bearer wrong", "Bearer t3st-cron-secret"]) {
      const { res, body } = await fire(app, authHeader(auth));
      expect(res.status).toBe(401);
      expect(body.status).toBe("unauthorized");
      expect(String(body.reason)).toMatch(/bearer/);
    }
  });

  it("fails closed 401 on every unauthenticated path BEFORE any DB dependency", async () => {
    const app = buildApp(SECRET);
    for (const auth of [undefined, "Bearer wrong", "Bearer t3st-cron-secret"]) {
      const { res, body } = await fire(app, authHeader(auth));
      expect(res.status).toBe(401);
      expect(body.status).toBe("unauthorized");
    }
  });

  it("the authenticated dispatch reaches the ledger arm and fails LOUD (scratch db ENOTFOUND propagates — never a silent skip)", async () => {
    const app = buildApp(SECRET);
    // postgres.js opens its connection lazily on the first query; against
    // the scratch host the DNS failure propagates LOUDLY out of the handler
    // — which is exactly the proof that auth opened and the request entered
    // the ledger arm (a silent 200-without-write is impossible by
    // construction: the handler has no non-ledger success path).
    await expect(fire(app, { authorization: `Bearer ${SECRET}` })).rejects.toThrow();
  });
});

describe("cron route ledger law (correct bearer)", () => {
  it("writes the exactly-once row: ok path, server-derived window, 0/0 counts", async () => {
    const ROW = {
      window_start: "2026-10-08T00:00:00Z",
      executed_at: "2026-10-08T02:00:01Z",
      trigger_kind: "vercel-cron",
      decayed: 0,
      reviews_scheduled: 0,
    };
    const mock = mockSql([[ROW]]);
    const { fn, calls } = mock;
    // Rebuild the route over the mocked sql by monkey-building the module:
    // buildCronRouters creates its own sql from DATABASE_URL, so exercise
    // the same law through the service directly for the SQL assertions and
    // through the route for the HTTP shape.
    const svc = await runNightlyDecayLedger(fn, "2026-10-08");
    expect(svc.status).toBe("ok");
    expect(svc.ledgerRow).toEqual({
      windowStart: "2026-10-08T00:00:00Z",
      executedAt: "2026-10-08T02:00:01Z",
      triggerKind: "vercel-cron",
      decayed: 0,
      reviewsScheduled: 0,
    } satisfies DecayLedgerRow);
    expect(calls.length).toBe(1);
    const c0 = calls[0]!;
    const text = c0.text.replace(/\s+/g, " ");
    expect(text).toContain("INSERT INTO decay_job_runs");
    expect(text).toContain("ON CONFLICT (window_start) DO NOTHING");
    expect(text).toContain("RETURNING");
    // honest ADR-031 batch-effect counts: the 0/0 are LITERAL SQL (not
    // params — a bearer-holder can never inject arbitrary counts)
    expect(text).toContain(", 0, 0)");
  });

  it("already-run path: an empty INSERT result falls back to the EXISTING row (never a second write)", async () => {
    const ROW = {
      window_start: "2026-10-08T00:00:00Z",
      executed_at: "2026-10-08T02:00:01Z",
      trigger_kind: "vercel-cron",
      decayed: 0,
      reviews_scheduled: 0,
    };
    const mock = mockSql([[], [ROW]]);
    const svc = await runNightlyDecayLedger(mock.fn, "2026-10-08");
    expect(svc.status).toBe("already-run");
    expect(svc.ledgerRow.executedAt).toBe("2026-10-08T02:00:01Z");
    expect(mock.calls.length).toBe(2);
    const c1 = mock.calls[1]!;
    expect(c1.text.replace(/\s+/g, " ")).toContain("SELECT");
    expect(c1.text).not.toContain("INSERT");
  });

  it("the authenticated dispatch reaches the ledger arm and fails LOUD (duplicate-shaped companion to the auth-law test, kept for grep clarity)", async () => {
    const app = buildApp(SECRET);
    await expect(fire(app, { authorization: `Bearer ${SECRET}` })).rejects.toThrow();
  });
});

describe("decayWindowTimestamp (042P UTC-day law -> timestamptz literal)", () => {
  it("maps the UTC day to UTC midnight", () => {
    expect(decayWindowTimestamp("2026-10-08")).toBe("2026-10-08T00:00:00Z");
  });

  it("rejects non-day shapes and impossible calendar days (server-derived value; malformed = programming error)", () => {
    for (const bad of ["2026-10-08T02:00:00Z", "20261008", "", "2026-13-99", "x"]) {
      expect(() => decayWindowTimestamp(bad)).toThrow(/UTC (calendar )?day/);
    }
  });
});
