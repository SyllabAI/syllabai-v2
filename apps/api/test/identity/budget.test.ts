/**
 * LoginAttemptBudget port pins — T-MIG-010.
 * Frozen spec: ratelimit/LoginAttemptBudget.java (R5) + RateLimitProperties
 * defaults (window 60s, loginPerAccount 10, enabled true).
 */
import { describe, expect, test } from "bun:test";
import { createLoginBudget } from "../../src/services/identity/budget";
import { RateLimitError } from "../../src/services/identity/errors";

const DEFAULTS = { enabled: true, windowMs: 60_000, loginPerAccount: 10 };

describe("per-TARGET-account budget (R5)", () => {
  test("10 failures exhaust the budget → 429 with Retry-After ≥ 1", () => {
    const budget = createLoginBudget(DEFAULTS);
    for (let i = 0; i < 10; i++) budget.recordFailure("victim@example.invalid");
    expect(budget.currentCount("victim@example.invalid")).toBe(10);
    expect(() => budget.checkAllowed("victim@example.invalid")).toThrow(RateLimitError);
    try {
      budget.checkAllowed("victim@example.invalid");
    } catch (e) {
      const rle = e as RateLimitError;
      expect(rle.status).toBe(429);
      expect(rle.errorCode).toBe("Too Many Requests");
      expect(rle.message).toBe("Too many attempts. Wait a moment and try again.");
      expect(Number(rle.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    }
  });

  test("budget is keyed on the TARGET account, not the source", () => {
    const budget = createLoginBudget(DEFAULTS);
    for (let i = 0; i < 10; i++) budget.recordFailure("victim@example.invalid");
    // a different account is untouched
    expect(() => budget.checkAllowed("other@example.invalid")).not.toThrow();
  });

  test("success clears the account's history (typo-twice never locks out)", () => {
    const budget = createLoginBudget(DEFAULTS);
    for (let i = 0; i < 9; i++) budget.recordFailure("student@example.invalid");
    budget.recordSuccess("student@example.invalid");
    expect(budget.currentCount("student@example.invalid")).toBe(0);
    expect(() => budget.checkAllowed("student@example.invalid")).not.toThrow();
  });

  test("window expiry frees the budget (fixed-window semantics, injectable clock)", () => {
    let nowMs = 10_000_000;
    const budget = createLoginBudget({ ...DEFAULTS, now: () => nowMs });
    for (let i = 0; i < 10; i++) budget.recordFailure("victim@example.invalid");
    expect(() => budget.checkAllowed("victim@example.invalid")).toThrow();
    nowMs += 60_001; // window elapsed
    expect(budget.currentCount("victim@example.invalid")).toBe(0);
    expect(() => budget.checkAllowed("victim@example.invalid")).not.toThrow();
  });

  test("key normalization: case + surrounding whitespace collapse (key = strip+lower)", () => {
    const budget = createLoginBudget(DEFAULTS);
    budget.recordFailure("  Victim@Example.invalid ");
    budget.recordFailure("victim@example.invalid");
    expect(budget.currentCount("VICTIM@example.invalid")).toBe(2);
  });

  test("master switch off → no budgeting (IT-profile parity)", () => {
    const budget = createLoginBudget({ ...DEFAULTS, enabled: false });
    for (let i = 0; i < 25; i++) budget.recordFailure("victim@example.invalid");
    expect(() => budget.checkAllowed("victim@example.invalid")).not.toThrow();
  });

  test("blank email is never budgeted (guard in checkAllowed/recordFailure)", () => {
    const budget = createLoginBudget(DEFAULTS);
    expect(() => budget.checkAllowed("")).not.toThrow();
    expect(() => budget.checkAllowed("   ")).not.toThrow();
  });
});
