/**
 * Per-IP RateLimitFilter port — frozen source:
 *   com/syllabai/ratelimit/RateLimitFilter.java  (deep-audit 09-28 M1)
 *   com/syllabai/ratelimit/RateLimitProperties.java (audited budget defaults)
 *   SecurityConfig.java:96-99 (addFilterAfter JwtAuthenticationFilter — the
 *   LLM tier keys on the learner identity the JWT filter resolved, so this
 *   middleware mounts AFTER identity.authMiddleware in apps/api/src/index.ts).
 *
 * The per-TARGET-ACCOUNT half of the M1 pair (LoginAttemptBudget, R5) already
 * lives at services/identity/budget.ts — this module is the OTHER half: the
 * filter-level budgets that run BEFORE any controller work.
 *
 * Two tiers, enforced before any route handler (RateLimitFilter.java:126-161):
 *   auth tier   — POST /api/v1/auth/{login,register,bootstrap-admin,password}
 *                 keyed by client IP (4 independent buckets)
 *   llm tier    — POST tutor/cla/transcribe/smart-mark surfaces, keyed by
 *                 learner (userId → authenticated subject → client IP)
 *
 * Semantics preserved line-for-line (Java line refs in comments):
 *   - in-memory fixed windows: windowStart = floor(now/window)*window (:237)
 *   - window reset by ALIGNMENT COMPARE, not insideWindow (:242-245) —
 *     deliberately different from LoginAttemptBudget's semantics
 *   - reject when count > limit (strictly; the Nth request that reaches the
 *     limit exactly is admitted) (:249)
 *   - retryAfterSeconds = max(1, floor((windowEnd-now+999)/1000)), computed
 *     BEFORE the bump — identical for admit and reject (:238-240)
 *   - MAX_KEYS = 100_000; size guard sweeps windows older than 2×window (:246)
 *   - OPTIONS bypass + enabled=false master switch bypass (:106-109)
 *   - fail-open on internal limiter errors — availability control, not a
 *     data gate (:117-121)
 *   - XFF trusted-chain walk: FIRST PUBLIC address from the RIGHT is the key;
 *     private-range hops (incl. CGNAT 100.64/10 — the live-probed Render
 *     topology) are skipped, all-private falls back to the socket peer
 *     (:191-231). The literal "172.2" prefix predicate is preserved verbatim
 *     (it covers 172.20-29 alongside the explicit 16-19/30/31 matches).
 *
 * 429 body parity (RateLimitFilter.java:258-267) — load-bearing difference
 * from the exception path (RateLimitException via GlobalExceptionHandler):
 *   filter path  → message "Too many requests. Wait a moment and try again."
 *                  WITH retryAfterSeconds as a body field (+ Retry-After hdr)
 *   exception    → message "Too many attempts. Wait a moment and try again."
 *                  (ApiError shape, NO retryAfterSeconds body field)
 * Both are pinned by the frozen source; do NOT unify them.
 *
 * Divergence note (disclosed): in Java the fail-open catch lexically contains
 * chain.doFilter (admit() runs inside the try), but downstream failures there
 * surface as ServletException/IOException (checked) — never RuntimeException —
 * so the catch's re-dispatch is unreachable in practice. This port keeps a
 * single downstream dispatch: next() is invoked outside the try, and the
 * catch fails open by invoking next() exactly once.
 */
import type { Context, Next } from "hono";
import { getAuth, type AuthContext } from "./auth";
import { systemClock, type BudgetClock } from "../services/identity/budget";
import { isoNow } from "../services/identity/errors";

/** The five per-window budgets this filter enforces (RateLimitProperties). */
export interface RateLimitBudgets {
  loginPerIp: number;
  registerPerIp: number;
  bootstrapPerIp: number;
  passwordPerIp: number;
  llmPerLearner: number;
}

export interface RateLimitFilterOptions {
  enabled: boolean;
  windowMs: number;
  budgets: RateLimitBudgets;
  clock?: BudgetClock;
}

/** One request's classification: tier+route prefix, keyed subject, per-window limit (:82-89). */
export interface Budget {
  tier: string;
  subject: string;
  limit: number;
}

export const budgetKey = (b: Budget): string => b.tier + ":" + b.subject;

/** LLM tier key: JWT userId first, then authenticated subject, then client IP (:163-175). */
function learnerKey(auth: AuthContext | null, ip: string): string {
  if (auth && auth.userId !== "") return auth.userId;
  if (auth && auth.email !== "" && auth.email.trim() !== "") return auth.email;
  return ip;
}

/**
 * Reserved-range check (:213-231) — verbatim predicate including the CGNAT
 * octet check and the literal "172.2" prefix quirk. Malformed 100.x that is
 * not 4 octets (or a non-numeric second octet) is treated PUBLIC, exactly as
 * the Java's NumberFormatException fallthrough does.
 */
export function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("100.")) {
    const oct = ip.split(".");
    if (oct.length === 4) {
      const secondRaw = oct[1] as string | undefined; // length===4 guarantees presence
      if (secondRaw === undefined) return false; // unreachable; NumberFormatException parity
      const second = Number.parseInt(secondRaw, 10);
      if (Number.isNaN(second)) return false;
      return second >= 64 && second <= 127;
    }
    return false;
  }
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("127.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip === "::1" ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.")
  );
}

/**
 * Client-IP key for the auth tier (:191-205) — rightmost-first walk of
 * X-Forwarded-For, skipping empty and private hops; the first PUBLIC address
 * is the key. No public hop → socket peer; no peer → "unknown".
 */
export function clientIp(xff: string | undefined | null, remoteAddr: string | null | undefined): string {
  if (xff != null && xff.trim() !== "") {
    const hops = xff.split(",");
    for (let i = hops.length - 1; i >= 0; i--) {
      const raw = hops[i];
      if (raw === undefined) continue; // noUncheckedIndexedAccess guard
      const hop = raw.trim(); // Java hops[i].strip() (:197) — BEFORE the checks
      if (hop === "" || isPrivateAddress(hop)) continue;
      return hop;
    }
  }
  return remoteAddr == null || remoteAddr === "" ? "unknown" : remoteAddr;
}

/** Route classification table (:126-161). Pure; test-visible via subclassing. */
export function classifyRequest(
  method: string,
  path: string,
  auth: AuthContext | null,
  ip: string,
  budgets: RateLimitBudgets,
): Budget | null {
  const post = method === "POST";
  if (post && path === "/api/v1/auth/login") {
    return { tier: "auth:login", subject: ip, limit: budgets.loginPerIp };
  }
  if (post && path === "/api/v1/auth/register") {
    return { tier: "auth:register", subject: ip, limit: budgets.registerPerIp };
  }
  if (post && path === "/api/v1/auth/bootstrap-admin") {
    return { tier: "auth:bootstrap", subject: ip, limit: budgets.bootstrapPerIp };
  }
  if (post && path === "/api/v1/auth/password") {
    return { tier: "auth:password", subject: ip, limit: budgets.passwordPerIp };
  }
  if (
    post &&
    (path === "/api/v1/tutor/ask" ||
      // the SSE twin spends the same tokens — one tier, same budget (:141-143)
      path === "/api/v1/tutor/ask/stream" ||
      path === "/api/v1/learners/me/cla/ask" ||
      // transcription pays vision-model tokens exactly like an ask (:145-148)
      path === "/api/v1/learners/me/answer-input/transcribe" ||
      // Smart Mark surfaces run the marking pipeline once per PART (:149-157)
      (path.startsWith("/api/v1/learners/me/attempts/") &&
        (path.endsWith("/smart-mark") ||
          path.endsWith("/feedback-explanation") ||
          path.endsWith("/improvement-plan"))))
  ) {
    return { tier: "llm:ask", subject: learnerKey(auth, ip), limit: budgets.llmPerLearner };
  }
  return null;
}

/** Hono/Bun socket peer, when the runtime exposes one (Java getRemoteAddr fallback). */
function remoteAddrOf(c: Context): string | undefined {
  const info = (c as unknown as { info?: { remote?: { address?: string } } }).info;
  return info?.remote?.address;
}

export class RateLimitFilter {
  /** Hard cap before a sweep of expired windows runs (:66-68). */
  static readonly MAX_KEYS = 100_000;

  private readonly buckets = new Map<string, { start: number; count: number }>();

  constructor(private readonly options: RateLimitFilterOptions) {}

  private get clock(): BudgetClock {
    return this.options.clock ?? systemClock;
  }

  /** Subclass-visible classification (Java package-private budgetOf, :124-126). */
  protected classify(method: string, path: string, auth: AuthContext | null, ip: string): Budget | null {
    return classifyRequest(method, path, auth, ip, this.options.budgets);
  }

  /** Fixed-window admit (:233-256). Returns the reject decision when over budget. */
  private admit(budget: Budget): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.clock.instant().getTime();
    const windowMs = this.options.windowMs;
    const windowStart = Math.floor(now / windowMs) * windowMs; // (:237)
    // same whether admitted or not (:238-240)
    const retryAfterSeconds = Math.max(1, Math.floor((windowStart + windowMs - now + 999) / 1000));
    const key = budgetKey(budget);
    const existing = this.buckets.get(key);
    // reset by alignment compare — NOT insideWindow (:242-245)
    const updated =
      existing === undefined || existing.start !== windowStart
        ? { start: windowStart, count: 1 }
        : { start: existing.start, count: existing.count + 1 };
    this.buckets.set(key, updated);
    if (this.buckets.size > RateLimitFilter.MAX_KEYS) {
      this.sweepExpired(now); // (:246-248)
    }
    if (updated.count > budget.limit) {
      // reject when STRICTLY over (:249-253)
      return { ok: false, retryAfterSeconds };
    }
    return { ok: true };
  }

  /** Evict windows that started at least two window-lengths ago (:269-278). */
  private sweepExpired(now: number): void {
    const cutoff = now - this.options.windowMs * 2;
    for (const [key, window] of this.buckets) {
      if (window.start < cutoff) this.buckets.delete(key);
    }
  }

  /** Test-visible current count for a key (mirrors LoginAttemptBudget.currentCount). */
  currentCount(tier: string, subject: string): number {
    const w = this.buckets.get(tier + ":" + subject);
    const now = this.clock.instant().getTime();
    return w !== undefined && w.start + this.options.windowMs > now ? w.count : 0;
  }

  /**
   * Hono middleware adapter — the doFilterInternal port (:102-122). OPTIONS
   * and enabled=false pass through before any classification; internal
   * errors fail OPEN (log + single next()).
   */
  handle = async (c: Context, next: Next): Promise<Response | void> => {
    if (!this.options.enabled || c.req.method === "OPTIONS") {
      return next(); // (:106-109)
    }
    try {
      const path = new URL(c.req.url).pathname;
      const auth = getAuth(c);
      const ip = clientIp(c.req.header("X-Forwarded-For"), remoteAddrOf(c));
      const budget = this.classify(c.req.method, path, auth, ip);
      if (budget === null) {
        return next(); // (:112-115)
      }
      const result = this.admit(budget);
      if (!result.ok) {
        // reject() (:258-267): Retry-After header + the hand-written body —
        // note retryAfterSeconds is a BODY FIELD here and the message says
        // "requests", both deliberately different from the exception path
        c.header("Retry-After", String(result.retryAfterSeconds));
        return c.json(
          {
            status: 429,
            error: "Too Many Requests",
            message: "Too many requests. Wait a moment and try again.",
            retryAfterSeconds: result.retryAfterSeconds,
            timestamp: isoNow(),
          },
          429,
        );
      }
    } catch (e) {
      // fail-open: availability control, not a gate (:117-121)
      console.error("[ratelimit] rate limiter failed open on an internal error:", e);
      return next();
    }
    return next();
  };
}
