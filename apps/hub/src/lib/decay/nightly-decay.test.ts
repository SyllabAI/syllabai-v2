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

describe("runNightlyDecay seam (scaffold stub)", () => {
  it("reports not-implemented and performs nothing (zero-DB scaffold)", async () => {
    const r = await runNightlyDecay("2026-10-05");
    expect(r).toEqual({ implemented: false });
  });
});
