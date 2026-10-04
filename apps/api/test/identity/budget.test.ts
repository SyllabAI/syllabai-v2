import { describe, expect, test } from "bun:test";
import { LoginAttemptBudget, type BudgetClock } from "../../src/services/identity/budget";

/**
 * LoginAttemptBudget parity tests (LoginAttemptBudget.java, R5):
 * fixed window per TARGET account, checked before bcrypt, success clears.
 */
class FakeClock implements BudgetClock {
  constructor(public now = Date.now()) {}
  instant(): Date {
    return new Date(this.now);
  }
  advance(ms: number) {
    this.now += ms;
  }
}

const OPTS = (clock: FakeClock, enabled = true) => ({
  windowMs: 60_000,
  loginPerAccount: 10,
  enabled,
  clock,
});

describe("LoginAttemptBudget — window semantics (LoginAttemptBudget.java:61-111)", () => {
  test("allows loginPerAccount failures, then throws with Retry-After >= 1", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    for (let i = 0; i < 10; i++) {
      budget.checkAllowed("victim@example.invalid"); // attempts 1..10 pass (count < cap)
      budget.recordFailure("victim@example.invalid");
    }
    // 10 recorded failures = at the cap: the 11th ATTEMPT is refused
    // (LoginAttemptBudget.java:66 — count >= loginPerAccount)
    expect(() => budget.checkAllowed("victim@example.invalid")).toThrow(
      "Too many attempts. Wait a moment and try again.",
    );
    try {
      budget.checkAllowed("victim@example.invalid");
    } catch (e) {
      const r = e as { retryAfterSeconds: number };
      expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(61);
    }
  });

  test("window expiry unblocks the account (fixed-window semantics)", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    for (let i = 0; i < 11; i++) budget.recordFailure("victim@example.invalid");
    expect(() => budget.checkAllowed("victim@example.invalid")).toThrow();
    clock.advance(60_001);
    expect(() => budget.checkAllowed("victim@example.invalid")).not.toThrow();
  });

  test("success clears the account's history (:89-95)", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    for (let i = 0; i < 9; i++) budget.recordFailure("u@example.invalid");
    budget.recordSuccess("u@example.invalid");
    expect(budget.currentCount("u@example.invalid")).toBe(0);
    expect(() => budget.checkAllowed("u@example.invalid")).not.toThrow();
  });

  test("key normalisation: strip + lowercase (:113-115)", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    budget.recordFailure("  Victim@Example.invalid ");
    expect(budget.currentCount("victim@example.invalid")).toBe(1);
    budget.recordFailure("VICTIM@example.invalid");
    expect(budget.currentCount("victim@example.invalid")).toBe(2);
  });

  test("per-account isolation: other accounts unaffected", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    for (let i = 0; i < 15; i++) budget.recordFailure("hammered@example.invalid");
    expect(() => budget.checkAllowed("innocent@example.invalid")).not.toThrow();
  });

  test("blank/unknown emails are ignored (:62-63)", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock));
    budget.recordFailure("   ");
    budget.recordFailure(null as unknown as string);
    expect(() => budget.checkAllowed(undefined as unknown as string)).not.toThrow();
  });

  test("disabled switch: all no-ops (properties.enabled, :62)", () => {
    const clock = new FakeClock();
    const budget = new LoginAttemptBudget(OPTS(clock, false));
    for (let i = 0; i < 50; i++) budget.recordFailure("x@example.invalid");
    expect(() => budget.checkAllowed("x@example.invalid")).not.toThrow();
    expect(budget.currentCount("x@example.invalid")).toBe(0);
  });

  test("recordSuccess carries NO enabled guard (:90-95) — safe no-op on a disabled budget", () => {
    const clock = new FakeClock();
    const disabled = new LoginAttemptBudget({ ...OPTS(clock, true), enabled: false });
    expect(() => disabled.recordSuccess("y@example.invalid")).not.toThrow(); // Java recordSuccess ignores enabled
  });

  test("MAX_KEYS sweep exists (100_000, :38)", () => {
    expect(LoginAttemptBudget.MAX_KEYS).toBe(100_000);
  });
});
