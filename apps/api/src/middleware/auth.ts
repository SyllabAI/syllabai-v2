/**
 * JWT authentication middleware — port of JwtAuthenticationFilter.java +
 * the SecurityConfig route rules that identity surfaces depend on.
 *
 * Filter semantics preserved (JwtAuthenticationFilter.java:40-76):
 *   - Bearer header present → parse; ANY failure (signature, expiry, format)
 *     leaves the context EMPTY — the request proceeds anonymously and
 *     protected paths reject later (fail-closed, never 500).
 *   - A signature-VALID token is honored only if:
 *       (a) the user row still exists (findById),
 *       (b) the account is enabled,
 *       (c) the token's ver claim matches users.token_version — null ver
 *           (pre-V46 token) is a MISMATCH (fail-closed, :66-68).
 *   - On success the request carries: email (subject), userId, roles
 *     (ROLE_-prefixed authorities in Java → plain role names here).
 *
 * The SecurityConfig 401/403 shapes are preserved via two entry points:
 *   - requireAuth: unauthenticated → 401 sendError (SecurityConfig.java:92-94)
 *     → Spring Boot default /error body: {timestamp, status, error:"Unauthorized",
 *       path} (include-message=never is Boot's default; include-stacktrace=never
 *     is pinned by application.yml). 404-after-auth parity (NoResourceFound →
 *     {status:404,error:"not_found",...}) is a router concern.
 *   - requireRole: authenticated but insufficient → 403 sendError → same Boot
 *     body with error:"Forbidden" (GlobalExceptionHandler rethrows
 *     AccessDeniedException → ExceptionTranslationFilter → 403, :218-222).
 */
import type { Context, Next } from "hono";
import type { UsersRepository } from "../services/identity/users";
import type { Role } from "../services/identity/jwt";
import { JwtException } from "../services/identity/jwt";
import type { JwtService } from "../services/identity/jwt";

/** Boot-style /error body for sendError()-style rejections (no message). */
export function bootErrorBody(status: 401 | 403, path: string) {
  return {
    timestamp: new Date().toISOString(),
    status,
    error: status === 401 ? "Unauthorized" : "Forbidden",
    path,
  };
}

export interface AuthContext {
  email: string;
  userId: string;
  roles: Role[];
  tokenVersion: number;
}

const AUTH_KEY = "syllabai.auth";

/**
 * Bearer-token authenticator. Non-throwing by design: an invalid token never
 * aborts the request — it just leaves the context empty (filter parity).
 */
export function createJwtAuthenticator(jwt: JwtService, users: UsersRepository) {
  return async (authorizationHeader: string | undefined): Promise<AuthContext | null> => {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return null;
    let info;
    try {
      info = jwt.parse(authorizationHeader.slice(7));
    } catch (e) {
      if (e instanceof JwtException) return null;
      throw e; // infrastructure errors are NOT auth failures — do not mask
    }
    // fail-closed revocation check (R1/R2): unknown user, disabled account,
    // or stale/null ver all leave the context empty
    const user = await users.findById(info.userId);
    if (
      !user ||
      !user.enabled ||
      info.tokenVersion === null ||
      user.tokenVersion !== info.tokenVersion
    ) {
      return null;
    }
    return {
      email: info.subject,
      userId: user.id,
      roles: info.roles,
      tokenVersion: user.tokenVersion,
    };
  };
}

/** Attaches the authenticator result to the Hono context (per request). */
export function createAuthMiddleware(authenticate: (h: string | undefined) => Promise<AuthContext | null>) {
  return async (c: Context, next: Next) => {
    const auth = await authenticate(c.req.header("Authorization"));
    if (auth) c.set(AUTH_KEY as never, auth as never);
    await next();
  };
}

export function getAuth(c: Context): AuthContext | null {
  return (c.get(AUTH_KEY as never) as AuthContext | undefined) ?? null;
}

/** 401 entry point (SecurityConfig.authenticationEntryPoint parity). */
export function requireAuth(c: Context): AuthContext | Response {
  const auth = getAuth(c);
  if (!auth) return c.json(bootErrorBody(401, new URL(c.req.url).pathname), 401);
  return auth;
}

/** 403 for authenticated-but-insufficient (@PreAuthorize / route-rule parity). */
export function requireRole(c: Context, ...allowed: Role[]): AuthContext | Response {
  const auth = getAuth(c);
  if (!auth) return c.json(bootErrorBody(401, new URL(c.req.url).pathname), 401);
  if (!auth.roles.some((r) => allowed.includes(r))) {
    return c.json(bootErrorBody(403, new URL(c.req.url).pathname), 403);
  }
  return auth;
}
