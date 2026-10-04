/**
 * LoginAttemptBudget port — per-TARGET-ACCOUNT failed-login budget
 * (frozen source: com/syllabai/ratelimit/LoginAttemptBudget.java, deep-audit
 * re-derivation R5).
 *
 * Why per-account (not per-IP): on Render the proxy forwards client-supplied
 * X-Forwarded-For verbatim, so any per-IP tier is bypassable by header
 * rotation. The bound that survives source spoofing is keyed on the account
 * being attacked — checked BEFORE any bcrypt work (AuthService.java:129),
 * success clears the account's history (a legitimate user mistyping twice
 * is never locked out by their own history).
 *
 * Semantics preserved bit-for-bit:
 *   - in-memory fixed windows on an injectable Clock (test-visible)
 *   - window alignment: windowStart = floor(now/window)*window
 *   - MAX_KEYS = 100_000 sweep against unbounded key growth (:38)
 *   - retryAfter = max(1, min(remaining, aligned)/1000 + 1) (:110)
 *   - key = email.strip().toLowerCase() (:114)
 *   - enabled=false → all operations are no-ops (:62)
 *   - recordSuccess ignores the enabled switch (:91 — matches the Java)
 */
import { RateLimitException } from "./errors";

export interface BudgetClock {
  instant(): Date;
}

export const systemClock: BudgetClock = { instant: () => new Date() };

export class LoginAttemptBudget {
  /** Guard against unbounded key growth (mirror of the M1 MAX_KEYS sweep). */
  static readonly MAX_KEYS = 100_000;

  private readonly failures = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly options: {
      windowMs: number;
      loginPerAccount: number;
      enabled: boolean;
      clock?: BudgetClock;
    },
  ) {}

  private get clock(): BudgetClock {
    return this.options.clock ?? systemClock;
  }

  private static key(email: string): string {
    return email.trim().toLowerCase();
  }

  private insideWindow(w: { start: number }): boolean {
    return this.clock.instant().getTime() <= w.start + this.options.windowMs;
  }

  /** Throws RateLimitException when this account's budget is exhausted. */
  checkAllowed(email: string | null | undefined): void {
    if (!this.options.enabled || !email || email.trim() === "") return;
    const w = this.failures.get(LoginAttemptBudget.key(email));
    if (w && this.insideWindow(w) && w.count >= this.options.loginPerAccount) {
      throw new RateLimitException(this.retryAfterSeconds(w));
    }
  }

  /** Count one FAILED attempt against the account. */
  recordFailure(email: string | null | undefined): void {
    if (!this.options.enabled || !email || email.trim() === "") return;
    const key = LoginAttemptBudget.key(email);
    const nowMs = this.clock.instant().getTime();
    const windowMs = this.options.windowMs;
    const windowStart = Math.floor(nowMs / windowMs) * windowMs;
    const existing = this.failures.get(key);
    this.failures.set(
      key,
      !existing || !this.insideWindow(existing)
        ? { start: windowStart, count: 1 }
        : { start: existing.start, count: existing.count + 1 },
    );
    if (this.failures.size > LoginAttemptBudget.MAX_KEYS) {
      for (const [k, w] of this.failures) {
        if (!this.insideWindow(w)) this.failures.delete(k);
      }
    }
  }

  /** A successful login clears the account's history. */
  recordSuccess(email: string | null | undefined): void {
    if (!email || email.trim() === "") return;
    this.failures.delete(LoginAttemptBudget.key(email));
  }

  private retryAfterSeconds(w: { start: number }): number {
    const nowMs = this.clock.instant().getTime();
    const windowMs = this.options.windowMs;
    const remaining = w.start + windowMs - nowMs;
    const alignedWindowStart = Math.floor(nowMs / windowMs) * windowMs;
    const aligned = alignedWindowStart + windowMs - nowMs;
    return Math.trunc(Math.max(1, Math.min(remaining, aligned) / 1000 + 1));
  }

  /** test-visible current count for a key */
  currentCount(email: string): number {
    const w = this.failures.get(LoginAttemptBudget.key(email));
    return w && this.insideWindow(w) ? w.count : 0;
  }
}
