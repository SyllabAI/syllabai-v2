import { describe, expect, it } from "bun:test";
import {
  computeWindowStart,
  decideDecayCron,
  runNightlyDecay,
} from "./nightly-decay";

const NOW = new Date("2026-10-05T02:00:01.000Z");
const SECRET = "test-cron-secret";

describe("decideDecayCron (T-MIG-042-PREP invoke-shape decision law)", () => {
  it("fails closed when CRON_SECRET is unset or empty (401, no execution)", () => {
    for (const cronSecret of [undefined, ""]) {
      const d = decideDecayCron({
        authHeader: `Bearer anything`,
        cronSecret,
        decayEnabled: "1",
        now: NOW,
      });
      expect(d.action).toBe("unauthorized");
      expect(d.httpStatus).toBe(401);
      if (d.action === "unauthorized") {
        expect(d.body.reason).toMatch(/fails closed|not configured/);
      }
    }
  });

  it("rejects a wrong bearer (401)", () => {
    const d = decideDecayCron({
      authHeader: "Bearer wrong",
      cronSecret: SECRET,
      decayEnabled: "1",
      now: NOW,
    });
    expect(d.action).toBe("unauthorized");
    expect(d.httpStatus).toBe(401);
  });

  it("rejects a SAME-LENGTH wrong bearer (401 — timing-safe compare path)", () => {
    // 't3st-cron-secret' has exactly the same length as 'test-cron-secret',
    // so the comparison exercises the timingSafeEqual branch, not the
    // length gate.
    const d = decideDecayCron({
      authHeader: "Bearer t3st-cron-secret",
      cronSecret: SECRET,
      decayEnabled: "1",
      now: NOW,
    });
    expect(d.action).toBe("unauthorized");
    expect(d.httpStatus).toBe(401);
  });

  it("rejects a missing Authorization header even with a configured secret (401)", () => {
    const d = decideDecayCron({
      authHeader: null,
      cronSecret: SECRET,
      decayEnabled: "1",
      now: NOW,
    });
    expect(d.action).toBe("unauthorized");
  });

  it("skips (200) while DECAY_CRON_ENABLED != '1' — the §4.3 OFF-by-default gate", () => {
    for (const decayEnabled of [undefined, "", "0", "true", "yes"]) {
      const d = decideDecayCron({
        authHeader: `Bearer ${SECRET}`,
        cronSecret: SECRET,
        decayEnabled,
        now: NOW,
      });
      expect(d.action).toBe("skipped");
      expect(d.httpStatus).toBe(200);
      if (d.action === "skipped") {
        expect(d.body.status).toBe("skipped");
        expect(d.body.reason).toMatch(/§4\.3/);
        expect(d.body.windowStart).toBe("2026-10-05");
      }
    }
  });

  it("proceeds to the seam only with correct bearer AND DECAY_CRON_ENABLED=1", () => {
    const d = decideDecayCron({
      authHeader: `Bearer ${SECRET}`,
      cronSecret: SECRET,
      decayEnabled: "1",
      now: NOW,
    });
    expect(d.action).toBe("run");
    if (d.action === "run") {
      expect(d.windowStart).toBe("2026-10-05");
    }
  });
});

describe("computeWindowStart (UTC day key)", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(computeWindowStart(new Date("2026-10-05T02:00:01.000Z"))).toBe("2026-10-05");
    expect(computeWindowStart(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12-31");
  });

  it("rolls at the UTC midnight boundary (not local midnight)", () => {
    expect(computeWindowStart(new Date("2026-10-06T00:00:00.000Z"))).toBe("2026-10-06");
    expect(computeWindowStart(new Date("2026-10-05T23:59:59.999Z"))).toBe("2026-10-05");
  });
});

describe("runNightlyDecay seam (T-MIG-042 port: ledger write via the api-of-record)", () => {
  const ROW = {
    windowStart: "2026-10-08T00:00:00Z",
    executedAt: "2026-10-08T02:00:01Z",
    triggerKind: "vercel-cron",
    decayed: 0,
    reviewsScheduled: 0,
  };
  const apiResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  it("maps the api-of-record 200 ok response to implemented:true / ok with the ledger row", async () => {
    let captured = { url: "", auth: "" };
    const r = await runNightlyDecay("2026-10-08", {
      apiBase: "https://api.example.com/",
      bearer: "Bearer test-cron-secret",
      fetchImpl: (async (url: any, init: any) => {
        captured = { url: String(url), auth: init?.headers?.authorization ?? "" };
        return apiResponse({ status: "ok", ledgerRow: ROW });
      }) as unknown as typeof fetch,
    });
    expect(r).toEqual({ implemented: true, status: "ok", ledgerRow: ROW });
    expect(captured.url).toBe("https://api.example.com/api/v1/cron/nightly-decay");
    expect(captured.auth).toBe("Bearer test-cron-secret");
  });

  it("forwards 'already-run' honestly (the exactly-once window law)", async () => {
    const r = await runNightlyDecay("2026-10-08", {
      apiBase: "https://api.example.com",
      bearer: "Bearer test-cron-secret",
      fetchImpl: (async () =>
        apiResponse({ status: "already-run", ledgerRow: ROW })) as unknown as typeof fetch,
    });
    expect(r).toEqual({ implemented: true, status: "already-run", ledgerRow: ROW });
  });

  it("throws LOUD on a 401 (CRON_SECRET drift between the projects)", async () => {
    await expect(
      runNightlyDecay("2026-10-08", {
        apiBase: "https://api.example.com",
        bearer: "Bearer stale-secret",
        fetchImpl: (async () => apiResponse({}, 401)) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/rejected the decay bearer/);
  });

  it("throws LOUD on a non-401 api failure", async () => {
    await expect(
      runNightlyDecay("2026-10-08", {
        apiBase: "https://api.example.com",
        bearer: "Bearer test-cron-secret",
        fetchImpl: (async () => apiResponse({}, 500)) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("refuses to report success without ledger evidence", async () => {
    await expect(
      runNightlyDecay("2026-10-08", {
        apiBase: "https://api.example.com",
        bearer: "Bearer test-cron-secret",
        fetchImpl: (async () => apiResponse({ status: "ok" })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/no ledgerRow/);
  });

  it("throws LOUD when the api base is unconfigured (misconfig, never a silent skip)", async () => {
    await expect(
      runNightlyDecay("2026-10-08", { apiBase: undefined, bearer: null }),
    ).rejects.toThrow(/not configured/);
  });
});
