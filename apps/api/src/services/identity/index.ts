/**
 * Identity module composition root — builds every piece of the T-MIG-010
 * port from env, fail-fast (blank SYLLABAI_JWT_SECRET / DATABASE_URL refuses
 * boot — carried from the Java core's boot discipline, see apps/api/src/env.ts).
 *
 * Consumers (routes/index wiring in apps/api/src/index.ts) get:
 *   authRoute        — /register /login /me /password          (AuthController)
 *   bootstrapRoute   — /bootstrap-status /bootstrap-admin      (BootstrapAdminController)
 *   authMiddleware   — Bearer authenticator (JwtAuthenticationFilter port);
 *                      mount app-wide so unknown /api/v1/** paths answer
 *                      401 unauthenticated (anyRequest().authenticated() parity)
 *   errorMapper      — domain-error → ApiError response translator
 */
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql, createUsersRepository, UsersRepository } from "./users";
import { readIdentityConfig, buildIdentityServices, type IdentityServices } from "./config";
import { AuthService } from "./service";
import { BootstrapStateStore, BootstrapAdminService } from "./bootstrap";
import { createAuthRoute, createBootstrapRoutes } from "../../routes/auth";
import { createJwtAuthenticator, createAuthMiddleware } from "../../middleware/auth";
import type { Hono } from "hono";

export interface IdentityApp {
  config: IdentityServices;
  users: UsersRepository;
  authService: AuthService;
  bootstrapService: BootstrapAdminService;
  authRoute: Hono;
  bootstrapRoute: Hono;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
}

export function buildIdentityApp(env: Record<string, string | undefined> = process.env): IdentityApp {
  const config = readIdentityConfig(env);
  const identity = buildIdentityServices(config);
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const users = new UsersRepository(sql);
  const authService = new AuthService(users, identity);
  const stateStore = new BootstrapStateStore(sql);
  const bootstrapService = new BootstrapAdminService(stateStore, users, identity, databaseUrl);
  return {
    config: identity,
    users,
    authService,
    bootstrapService,
    authRoute: createAuthRoute(authService),
    bootstrapRoute: createBootstrapRoutes(bootstrapService),
    authMiddleware: createAuthMiddleware(createJwtAuthenticator(identity.jwt, users)),
  };
}
