/**
 * Identity-domain exceptions + the uniform ApiError body — ported from the
 * frozen core's shared package (GlobalExceptionHandler.java, ApiError.java)
 * restricted to the exceptions the identity module actually raises.
 *
 * Body parity (ApiError.java:13): {status:int, error:string, message:string,
 * timestamp:Instant}. Jackson (Boot default, JSR-310, write-dates-as-timestamps
 * disabled) renders Instant as ISO-8601 UTC — Date.toISOString() matches to
 * millisecond precision (golden tolerance treats timestamp as volatile).
 *
 * Error-code strings are load-bearing (golden cases compare them):
 *   NotFoundException  → 404 "not_found"            (GlobalExceptionHandler:35)
 *   BadRequestException→ 400 "bad_request"          (:41)
 *   ConflictException  → 409 "conflict"             (:47)
 *   ForbiddenException → 403 "forbidden"            (:56 — one status for
 *                          wrong-code and gate-unset; no config oracle)
 *   BadCredentials     → 401 "invalid_credentials"  (:199)
 *   RateLimitException → 429 "Too Many Requests" + Retry-After (:28-30 —
 *                        note the error code here is the literal reason
 *                        phrase, NOT a snake-case identifier; kept verbatim)
 */

/** Instant rendered the way Jackson's JSR-310 module writes it (ISO-8601, UTC). */
export function isoNow(): string {
  return new Date().toISOString();
}

export interface ApiErrorBody {
  status: number;
  error: string;
  message: string;
  timestamp: string;
}

export const apiError = (status: number, error: string, message: string): ApiErrorBody => ({
  status,
  error,
  message,
  timestamp: isoNow(),
});

export class NotFoundException extends Error {
  readonly status = 404;
  readonly code = "not_found";
  /** Port of NotFoundException(resource, id): message "%s %s not found". */
  constructor(resource: string, identifier: string) {
    super(`${resource} ${identifier} not found`);
  }
}

export class BadRequestException extends Error {
  readonly status = 400;
  readonly code = "bad_request";
}

export class ConflictException extends Error {
  readonly status = 409;
  readonly code = "conflict";
}

export class ForbiddenException extends Error {
  readonly status = 403;
  readonly code = "forbidden";
}

/** Port of Spring's BadCredentialsException — no echo of WHICH factor failed. */
export class BadCredentialsException extends Error {
  readonly status = 401;
  readonly code = "invalid_credentials";
  constructor() {
    super("invalid credentials");
  }
}

export class RateLimitException extends Error {
  readonly status = 429;
  readonly code = "Too Many Requests";
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    // Port of RateLimitException: message verbatim (:6), floor at 1s (:8).
    super("Too many attempts. Wait a moment and try again.");
    this.retryAfterSeconds = Math.max(1, Math.trunc(retryAfterSeconds));
  }
}

/**
 * Map any identity-domain error to its response pair (status + ApiError body).
 * Unknown errors fall through to the app-level 500 handler — never guessed here.
 */
export function toErrorResponse(err: unknown): { status: number; body: ApiErrorBody; headers?: Record<string, string> } | null {
  if (err instanceof NotFoundException) {
    return { status: 404, body: apiError(404, err.code, err.message) };
  }
  if (err instanceof BadRequestException) {
    return { status: 400, body: apiError(400, err.code, err.message) };
  }
  if (err instanceof ConflictException) {
    return { status: 409, body: apiError(409, err.code, err.message) };
  }
  if (err instanceof ForbiddenException) {
    return { status: 403, body: apiError(403, err.code, err.message) };
  }
  if (err instanceof BadCredentialsException) {
    return { status: 401, body: apiError(401, err.code, err.message) };
  }
  if (err instanceof RateLimitException) {
    return {
      status: 429,
      body: apiError(429, err.code, err.message),
      headers: { "Retry-After": String(err.retryAfterSeconds) },
    };
  }
  return null;
}
