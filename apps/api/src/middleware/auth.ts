/**
 * JWT authentication + RBAC middleware — the JwtAuthenticationFilter and
 * SecurityConfig route-rule port (T-MIG-010).
 * Frozen sources (verified 2026-10-04):
 *   identity/JwtAuthenticationFilter.java — bearer parse, fail-closed
 *     revocation (unknown user / disabled account / stale-or-null ver ALL
 *     leave the context empty), ROLE_* authorities, userId request attribute
 *   identity/SecurityConfig.java — authenticationEntryPoint sendError(401)
 *     (Boot /error body), route rules (admin/teacher/research prefixes),
 *     default AccessDeniedHandler sendError(403)
 */

import type { Context, Next } from "hono";
import { bootErrorBody } from "../services/identity/errors";
import type { IdentityStore, UserRow } from "../services/identity/store";
import type { JwtPort } from "../services/identity/jwt";

export interface IdentityContext {
  email: string;
  userId: string;
  roles: string[];
  token: JwtServiceTokenInfo;
}

type JwtServiceTokenInfo = Awaited<ReturnType<JwtPort["parse"]>>;

declare module "hono" {
  interface ContextVariableMap {
    identity?: IdentityContext;
    /** Java core's request attribute "com.syllabai.userId" analog */
    syllabaiUserId?: string;
  }
}

export interface AuthMiddlewareDeps {
  jwt: JwtPort;
  store: IdentityStore;
}

/**
 * Filter port: attempts bearer resolution on every request; on any failure
 * the context stays EMPTY (never an inline 401) — the route guard decides.
 * Revocation check is fail-closed: unknown user, disabled account, null ver
 * or ver mismatch all resolve to "unauthenticated".
 */
export function createJwtAuthMiddleware(deps: AuthMiddlewareDeps) {
  return async (c: Context, next: Next): Promise<void> => {
    const header = c.req.header("Authorization");
    if (header && header.startsWith("Bearer ")) {
      try {
        const info = await deps.jwt.parse(header.slice(7));
        const user: UserRow | null = await deps.store.findById(info.userId);
        if (
          user !== null &&
          user.enabled &&
          info.tokenVersion !== null &&
          user.tokenVersion === info.tokenVersion
        ) {
          c.set("identity", {
            email: info.subject,
            userId: info.userId,
            roles: info.roles,
            token: info,
          });
          c.set("syllabaiUserId", info.userId);
        }
      } catch {
        // invalid token: context stays empty; protected routes will reject
      }
    }
    await next();
  };
}

/** anyRequest().authenticated() analog — 401 via the Boot /error shape. */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  if (!c.get("identity")) {
    return c.json(bootErrorBody(401, c.req.path), 401);
  }
  await next();
}

/**
 * hasRole(...) analog — Spring's AccessDeniedHandler default: sendError(403)
 * rendered as the Boot /error body (NOT an ApiError).
 */
export function requireRoles(...allowed: readonly string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const identity = c.get("identity");
    if (!identity) {
      return c.json(bootErrorBody(401, c.req.path));
    }
    const ok = identity.roles.some((r) => allowed.includes(r));
    if (!ok) {
      return c.json(bootErrorBody(403, c.req.path));
    }
    await next();
  };
}

/**
 * The identity-relevant slice of the SecurityConfig route map, as data —
 * /api/v1/admin/** → ADMIN, /api/v1/teacher|research/** → TEACHER+ADMIN,
 * everything non-public authenticated. Other modules mount their guards
 * from this map (single source of truth for the coarse route rules).
 */
export const ROUTE_ROLE_MAP: ReadonlyArray<{ prefix: string; roles: readonly string[] }> = [
  { prefix: "/api/v1/admin", roles: ["ADMIN"] },
  { prefix: "/api/v1/teacher", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/v1/research", roles: ["TEACHER", "ADMIN"] },
];
