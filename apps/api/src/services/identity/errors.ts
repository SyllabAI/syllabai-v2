/**
 * Error contract for the identity module — ported from the frozen core's
 * shared/ApiError.java + shared/GlobalExceptionHandler.java (verified
 * 2026-10-04, T-MIG-010).
 *
 * TWO distinct body shapes exist in the Java core and BOTH must be kept:
 *
 * 1. ApiError (GlobalExceptionHandler @ExceptionHandler bodies):
 *      { status: int, error: string, message: string, timestamp: Instant }
 *    Used for: 400 validation_failed / bad_request / malformed_body,
 *    401 invalid_credentials (BadCredentialsException), 403 forbidden,
 *    404 not_found, 409 conflict, 429 Too Many Requests (+ Retry-After).
 *
 * 2. Spring Boot's default /error JSON (sendError paths — SecurityConfig's
 *    authenticationEntryPoint calls response.sendError(401) and the default
 *    AccessDeniedHandler sendError(403); BasicErrorController renders):
 *      { timestamp, status: 401, error: "Unauthorized", path: "/..." }
 *    (message field omitted — server.error.include-message defaults to never).
 *    Used for: unauthenticated hits on protected routes (401) and RBAC role
 *    denials (403). NOT an ApiError — mirroring this exactly is what makes
 *    golden replay honest.
 */

/** Java Instant.now() ≈ ISO-8601 UTC; golden cases tolerate timestamps. */
const nowIso = (): string => new Date().toISOString();

export interface ApiErrorBody {
  status: number;
  error: string;
  message: string;
  timestamp: string;
}

export function apiError(status: number, error: string, message: string): ApiErrorBody {
  return { status, error, message, timestamp: nowIso() };
}

/** Boot /error shape for sendError(401|403) paths (see module doc). */
export function bootErrorBody(status: 401 | 403, path: string): {
  timestamp: string;
  status: number;
  error: string;
  path: string;
} {
  return {
    timestamp: nowIso(),
    status,
    error: status === 401 ? "Unauthorized" : "Forbidden",
    path,
  };
}

/** Base for exceptions mapped through GlobalExceptionHandler semantics. */
export class IdentityHttpError extends Error {
  readonly status: number;
  readonly errorCode: string;
  /** extra headers (Retry-After on 429) */
  readonly headers: Record<string, string>;

  constructor(status: number, errorCode: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.headers = headers;
  }

  body(): ApiErrorBody {
    return apiError(this.status, this.errorCode, this.message);
  }
}

export class ConflictError extends IdentityHttpError {
  constructor(message: string) {
    // GlobalExceptionHandler: 409, error "conflict", ex.getMessage()
    super(409, "conflict", message);
  }
}

export class BadRequestError extends IdentityHttpError {
  constructor(message: string) {
    // GlobalExceptionHandler: 400, error "bad_request", ex.getMessage()
    super(400, "bad_request", message);
  }
}

export class ForbiddenError extends IdentityHttpError {
  constructor(message: string) {
    // GlobalExceptionHandler: 403, error "forbidden", ex.getMessage() —
    // the SAME body for a wrong join code and a closed gate (no config oracle).
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends IdentityHttpError {
  constructor(message: string) {
    // GlobalExceptionHandler: 404, error "not_found", ex.getMessage()
    super(404, "not_found", message);
  }

  /** NotFoundException(resource, id): "%s %s not found".formatted(...) */
  static forResource(resource: string, id: string): NotFoundError {
    return new NotFoundError(`${resource} ${id} not found`);
  }
}

/** Spring BadCredentialsException → AuthenticationException handler:
 *  401 "invalid_credentials" / "invalid credentials" — no echo of which factor. */
export class BadCredentialsError extends IdentityHttpError {
  constructor() {
    super(401, "invalid_credentials", "invalid credentials");
  }
}

/** RateLimitException → 429 + Retry-After, error "Too Many Requests" (capital T),
 *  message fixed by the exception class. */
export class RateLimitError extends IdentityHttpError {
  constructor(retryAfterSeconds: number) {
    super(
      429,
      "Too Many Requests",
      "Too many attempts. Wait a moment and try again.",
      { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
    );
  }
}

/** MethodArgumentNotValidException → 400 "validation_failed",
 *  message "<field>: <defaultMessage>" of the FIRST field error. */
export class ValidationError extends IdentityHttpError {
  constructor(field: string, jakartaMessage: string) {
    super(400, "validation_failed", `${field}: ${jakartaMessage}`);
  }
}

/** HttpMessageNotReadableException → 400 "malformed_body", fixed text. */
export class MalformedBodyError extends IdentityHttpError {
  constructor() {
    super(400, "malformed_body", "request body is not readable (check field types and enum values)");
  }
}
