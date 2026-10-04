/**
 * LoginAttemptBudget port — per-TARGET-ACCOUNT failed-login budget (R5).
 * Frozen source: ratelimit/LoginAttemptBudget.java (verified 2026-10-04).
 *
 * Why per-account (verbatim from the core's javadoc): on Render the proxy
 * forwards the client's own X-Forwarded-For verbatim, so a source-IP bound
 * is bypassable by rotating fake XFF values. The bound that survives source
 * spoofing is keyed on the ACCOUNT being attacked, checked BEFORE any bcrypt
 * work. A successful login clears the account's history — a legitimate user
 * mistyping twice is never locked out by their own history.
 *
 * Shape: in-memory fixed windows on an injectable clock, single-instance
 * semantics, size-guarded map (MAX_KEYS 100_000 sweep), `enabled` switch.
 * Defaults from RateLimitProperties: window 60s, loginPerAccount 10.
 */

import { RateLimitError } from "./errors";

const MAX_KEYS = 100_000;

interface Window {
  startMs: number;
  count: number;
}

export interface LoginBudgetDeps {
  enabled: boolean;
  windowMs: number;
  loginPerAccount: number;
  now?: () => number;
}

export interface LoginBudgetPort {
  /** @throws RateLimitError when this account's budget is exhausted */
  checkAllowed(email: string | null | undefined): void;
  recordFailure(email: string | null | undefined): void;
  recordSuccess(email: string | null | undefined): void;
  /** test-visible current count for a key */
  currentCount(email: string): number;
}

const keyOf = (email: string): string => email.trim().toLowerCase();

export function createLoginBudget(deps: LoginBudgetDeps): LoginBudgetPort {
  const now = deps.now ?? Date.now;
  const failures = new Map<string, Window>();

  const insideWindow = (w: Window): boolean => now() <= w.startMs + deps.windowMs;

  return {
    checkAllowed(email) {
      if (!deps.enabled || !email || email.trim() === "") return;
      const w = failures.get(keyOf(email));
      if (w && insideWindow(w) && w.count >= deps.loginPerAccount) {
        throw new RateLimitError(retryAfterSeconds(w));
      }
    },

    recordFailure(email) {
      if (!deps.enabled || !email || email.trim() === "") return;
      const k = keyOf(email);
      const nowMs = now();
      const windowStart = Math.floor(nowMs / deps.windowMs) * deps.windowMs;
      const existing = failures.get(k);
      if (!existing || !insideWindow(existing)) {
        failures.set(k, { startMs: windowStart, count: 1 });
      } else {
        existing.count += 1;
      }
      if (failures.size > MAX_KEYS) {
        for (const [k, w] of failures) if (!insideWindow(w)) failures.delete(k);
      }
    },

    recordSuccess(email) {
      if (!email || email.trim() === "") return;
      failures.delete(keyOf(email));
    },

    currentCount(email) {
      const w = failures.get(keyOf(email));
      return !w || !insideWindow(w) ? 0 : w.count;
    },
  };

  /** Java: max(1, min(remaining-to-window-end, aligned-window-end)/1000 + 1) */
  function retryAfterSeconds(w: Window): number {
    const nowMs = now();
    const remaining = w.startMs + deps.windowMs - nowMs;
    const alignedEnd = (Math.floor(nowMs / deps.windowMs) + 1) * deps.windowMs - nowMs;
    const bounded = Math.min(remaining, alignedEnd);
    return Math.max(1, Math.floor(bounded / 1000) + 1);
  }
}
