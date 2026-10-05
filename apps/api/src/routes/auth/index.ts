/**
 * /api/v1/auth/** — port of AuthController.java + BootstrapAdminController.java
 * (path parity: @RequestMapping("/api/v1/auth"), AuthController.java:25 —
 * the seed mounted "/api/auth"; the corrected mount is part of this task's
 * OUT-OF-FENCE index.ts commit, flagged for R0 ratification).
 *
 * Response/status parity table (each row test-backed in test/identity/):
 *   POST /register   201 + Location:/api/v1/auth/me + AuthResponse (:34-41)
 *                    400 validation_failed  — bean validation; body message is
 *                      "field: defaultMessage" of the FIRST field error
 *                      (GlobalExceptionHandler:158-165), Hibernate-default
 *                      messages ("size must be between X and Y", "must be a
 *                      valid email", "must not be blank", @Pattern customs)
 *                    400 malformed_body — unreadable body (:175-180, verbatim)
 *                    409 conflict "email already registered" (:68)
 *                    400 bad_request "unknown role: <trimmed>" (:100)
 *                    403 forbidden (ADMIN refusal / join-code gate, :103/:119)
 *   POST /login      200 AuthResponse (:43-51)
 *                    401 invalid_credentials "invalid credentials" (handler :199)
 *                    429 "Too Many Requests" + Retry-After (R5 budget, :25-31)
 *   GET  /me         200 UserView (:53-56) — requires auth
 *                    404 not_found "user <email> not found" (:146)
 *   POST /password   204 (:64-69) — requires auth
 *                    401 invalid_credentials (wrong current, no echo)
 *                    404 not_found (unknown user)
 *                    400 validation_failed (new-password floor)
 *   GET  /bootstrap-status  200 {"available":bool} (:33-36)
 *   POST /bootstrap-admin   200 AuthResponse (:38-42; OK, not 201)
 *                    409 conflict — disabled/window closed/admin exists/CONSUMED
 *                    400 bad_request — bootstrap password strength (verbatim)
 *
 * Jackson binding shims (parity with Spring Boot default Jackson):
 *   - unknown JSON properties IGNORED (no .strict()) — contracts header note
 *   - scalar → String coercion ({"email":123} binds as "123" in Java)
 *   - wrong JSON shapes for string fields (arrays/objects) and syntactically
 *     invalid JSON → HttpMessageNotReadableException → malformed_body
 */
import { Hono } from "hono";
import {
  loginRequestSchema,
  passwordChangeRequestSchema,
  registerRequestSchema,
} from "@syllabai/contracts";
import type { z } from "zod";
import { AuthService } from "../../services/identity/service";
import { apiError, toErrorResponse } from "../../services/identity/errors";
import { requireAuth } from "../../middleware/auth";
import type { IdentityServices } from "../../services/identity/config";

/** Field → @Size bounds from the frozen DTOs (Hibernate-default message). */
const SIZE_BOUNDS: Record<string, [number, number]> = {
  email: [0, 254], // RegisterRequest @Size(max=254); LoginRequest email has NO @Size
  password: [12, 100], // the R6 platform floor
  displayName: [2, 100],
  newPassword: [12, 100], // PasswordChangeRequest — the same register floor (R6)
};

/** Fields whose null binding jakarta serves as "must not be blank" (@NotBlank skips null but fails it; @Email/@Size pass). */
const REQUIRED_STRING_FIELDS = new Set(["email", "password", "displayName", "currentPassword", "newPassword"]);

/**
 * GlobalExceptionHandler.invalid (:158-165): FIRST field error, rendered
 * "field: defaultMessage". Issue order from the contracts mirrors the Java
 * annotation order (email → password → displayName), and refinement order
 * matches jakarta's per-field constraint order — so issues[0] is the port of
 * the first violation, with the message normalised to Hibernate's defaults.
 *
 * R0 correction (T-MIG-017): live capture proves Hibernate's property
 * traversal does NOT follow the DTO annotation order — both missing-fields
 * captures (auth-login-missing-fields-400, auth-register-missing-fields-400)
 * report the PASSWORD field first. The port therefore ranks issues by the
 * core's OBSERVED traversal order (password → email → rest in schema order)
 * instead of trusting zod's schema order. Update this list only with new
 * capture evidence — never by assumption.
 */
const HIBERNATE_TRAVERSAL_ORDER = ["password", "email", "displayName", "currentPassword", "newPassword"];

export function validationMessage(error: z.ZodError): string {
  const issues = [...error.issues].sort((a, b) => {
    const pa = HIBERNATE_TRAVERSAL_ORDER.indexOf(String(a.path[0] ?? ""));
    const pb = HIBERNATE_TRAVERSAL_ORDER.indexOf(String(b.path[0] ?? ""));
    return (pa === -1 ? Number.MAX_SAFE_INTEGER : pa) - (pb === -1 ? Number.MAX_SAFE_INTEGER : pb);
  });
  const issue = issues[0];
  if (!issue) return "request invalid";
  const field = issue.path.join(".");
  // null bound to a required string field: @NotBlank is the violation jakarta
  // reports (constraints skip null; @NotBlank fails it) — "must not be blank".
  if (issue.code === "invalid_type" && REQUIRED_STRING_FIELDS.has(field)) {
    const received = (issue as { received?: unknown }).received;
    if (received === "null" || received === "undefined") {
      return `${field}: must not be blank`;
    }
  }
  const raw = issue.message;
  let message = raw;
  // jakarta evaluates @NotBlank BEFORE @Size (declaration order in the frozen
  // DTOs) — zod's chain orders min/max first, so when a notBlank violation
  // co-exists with a size violation the served message must be notBlank's.
  if (issue.code === "too_big" || issue.code === "too_small") {
    const blankAlso = error.issues.some((i) => i.message === "must not be blank");
    if (blankAlso) return `${field}: must not be blank`;
    const bounds = SIZE_BOUNDS[field];
    if (bounds) message = `size must be between ${bounds[0]} and ${bounds[1]}`;
  }
  return `${field}: ${message}`;
}

/**
 * Jackson scalar→String coercion shim: numbers/booleans become strings for
 * string-typed fields; arrays/objects are unreadable (malformed_body).
 * Returns null when the body itself must be treated as unreadable.
 */
export function coerceStringFields(
  body: unknown,
  stringFields: readonly string[],
): Record<string, unknown> | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (stringFields.includes(k)) {
      if (v === null || v === undefined) out[k] = v ?? null;
      else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = String(v);
      } else return null; // array/object for a string field → unreadable
    } else {
      out[k] = v; // unknown properties carried through (Jackson ignores them)
    }
  }
  return out;
}

/** HttpMessageNotReadableException handler body (:175-180) — verbatim. */
const malformedBody = () => apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null; // syntax error / empty body → unreadable
  }
  return raw as Record<string, unknown>;
}

export function createAuthRoute(authService: AuthService) {
  const STRING_FIELDS = ["email", "password", "displayName", "role", "joinCode"] as const;
  const LOGIN_FIELDS = ["email", "password"] as const;
  const PASSWORD_FIELDS = ["currentPassword", "newPassword"] as const;

  return new Hono()
    // ── POST /register ────────────────────────────────────────────────
    .post("/register", async (c) => {
      const body = await readJsonBody(c);
      if (body === null) return c.json(malformedBody(), 400);
      const coerced = coerceStringFields(body, STRING_FIELDS);
      if (coerced === null) return c.json(malformedBody(), 400);
      const parsed = registerRequestSchema.safeParse(coerced);
      if (!parsed.success) {
        return c.json(apiError(400, "validation_failed", validationMessage(parsed.error)), 400);
      }
      const response = await authService.register(parsed.data);
      return c.json(response, 201, { Location: "/api/v1/auth/me" });
    })
    // ── POST /login ───────────────────────────────────────────────────
    .post("/login", async (c) => {
      const body = await readJsonBody(c);
      if (body === null) return c.json(malformedBody(), 400);
      const coerced = coerceStringFields(body, LOGIN_FIELDS);
      if (coerced === null) return c.json(malformedBody(), 400);
      const parsed = loginRequestSchema.safeParse(coerced);
      if (!parsed.success) {
        return c.json(apiError(400, "validation_failed", validationMessage(parsed.error)), 400);
      }
      const response = await authService.login(parsed.data);
      return c.json(response, 200);
    })
    // ── GET /me ───────────────────────────────────────────────────────
    .get("/me", async (c) => {
      const auth = requireAuth(c);
      if (auth instanceof Response) return auth;
      const user = await authService.me(auth.email);
      return c.json(user, 200);
    })
    // ── POST /password ────────────────────────────────────────────────
    .post("/password", async (c) => {
      const auth = requireAuth(c);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(c);
      if (body === null) return c.json(malformedBody(), 400);
      const coerced = coerceStringFields(body, PASSWORD_FIELDS);
      if (coerced === null) return c.json(malformedBody(), 400);
      const parsed = passwordChangeRequestSchema.safeParse(coerced);
      if (!parsed.success) {
        return c.json(apiError(400, "validation_failed", validationMessage(parsed.error)), 400);
      }
      await authService.changePassword(auth.email, parsed.data);
      return c.body(null, 204);
    });
}

/**
 * Bootstrap surface (same @RequestMapping base, BootstrapAdminController.java:24).
 * Mounted by the router in routes/auth/index.ts consumer — exported separately
 * to keep the anonymous-vs-authenticated wiring explicit.
 */
export function createBootstrapRoutes(
  bootstrap: {
    claimable(): Promise<boolean>;
    claim(request: { email: string; password: string; displayName: string }): Promise<{
      accessToken: string;
      tokenType: "Bearer";
      user: unknown;
    }>;
  },
) {
  return new Hono()
    .get("/bootstrap-status", async (c) => {
      return c.json({ available: await bootstrap.claimable() }, 200);
    })
    .post("/bootstrap-admin", async (c) => {
      const body = await readJsonBody(c);
      if (body === null) return c.json(malformedBody(), 400);
      const coerced = coerceStringFields(body, ["email", "password", "displayName", "role", "joinCode"]);
      if (coerced === null) return c.json(malformedBody(), 400);
      const parsed = registerRequestSchema.safeParse(coerced);
      if (!parsed.success) {
        return c.json(apiError(400, "validation_failed", validationMessage(parsed.error)), 400);
      }
      const response = await bootstrap.claim(parsed.data);
      return c.json(response, 200);
    });
}

export type { IdentityServices };
