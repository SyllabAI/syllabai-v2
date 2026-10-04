/**
 * /api/v1/auth/** — the identity module port (Wave 1, T-MIG-010).
 *
 * Frozen spec: AuthController.java, BootstrapAdminController.java,
 * AuthService.java, BootstrapAdminService.java, SecurityConfig.java,
 * GlobalExceptionHandler.java (all verified 2026-10-04; per-boundary cites
 * live in the service/middleware files this router composes).
 *
 * Parity surface:
 *   POST /api/v1/auth/register          201 + Location, body AuthResponse
 *   POST /api/v1/auth/login             200 AuthResponse | 401 | 429
 *   GET  /api/v1/auth/me                200 UserView (authenticated)
 *   POST /api/v1/auth/password          204 (authenticated + current pw)
 *   GET  /api/v1/auth/bootstrap-status  200 {"available": bool}
 *   POST /api/v1/auth/bootstrap-admin   200 AuthResponse (one-time V19 window)
 *   everything unmounted                404 "not_found" (NoResourceFound)
 *   unhandled                           500 "internal_error" (opaque body)
 *
 * This file also exports createAuthApp() — the composition root. apps/api/
 * src/index.ts (mount re-point disclosed per R0 ruling) delegates here, and
 * the identity tests build their own app with an injected memory runtime.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { createDb } from "@syllabai/db";
import {
  buildIdentityConfig,
  type IdentityConfig,
  type IdentityEnv,
} from "../../services/identity/env";
import { createJwtService, type JwtPort } from "../../services/identity/jwt";
import { createLoginBudget, type LoginBudgetPort } from "../../services/identity/budget";
import { bunBcryptPasswordPort, type PasswordPort } from "../../services/identity/password";
import {
  MemoryIdentityStore,
  PgIdentityStore,
  type IdentityStore,
} from "../../services/identity/store";
import { createAuthService } from "../../services/identity/service";
import { createBootstrapService } from "../../services/identity/bootstrap";
import {
  IdentityHttpError,
  ValidationError,
} from "../../services/identity/errors";
import {
  validateLogin,
  validatePasswordChange,
  validateRegister,
} from "../../services/identity/validation";
import {
  createJwtAuthMiddleware,
  requireAuth,
} from "../../middleware/auth";
import { createCorsMiddleware } from "../../middleware/cors";
import { legacyAuthStub } from "./stub";

export interface IdentityRuntime {
  config: IdentityConfig;
  jwt: JwtPort;
  budget: LoginBudgetPort;
  store: IdentityStore;
  passwords: PasswordPort;
  auth: ReturnType<typeof createAuthService>;
  bootstrap: ReturnType<typeof createBootstrapService>;
}

export interface RuntimeOverrides {
  config: IdentityConfig;
  store: IdentityStore;
  passwords?: PasswordPort;
  now?: () => number;
}

/** Wire a full runtime around an explicit store (tests inject Memory). */
export function createIdentityRuntime(overrides: RuntimeOverrides): IdentityRuntime {
  const passwords = overrides.passwords ?? bunBcryptPasswordPort;
  const jwt = createJwtService({
    secret: overrides.config.jwtSecret,
    ttlMs: overrides.config.jwtTtlMs,
    now: overrides.now,
  });
  const budget = createLoginBudget({
    enabled: true,
    windowMs: 60_000,
    loginPerAccount: 10,
    now: overrides.now,
  });
  const auth = createAuthService({
    store: overrides.store,
    passwords,
    jwt,
    budget,
    teacherJoinCode: overrides.config.teacherJoinCode,
  });
  const bootstrap = createBootstrapService({
    store: overrides.store,
    passwords,
    jwt,
    enabled: overrides.config.bootstrapEnabled,
    now: overrides.now,
  });
  return {
    config: overrides.config,
    jwt,
    budget,
    store: overrides.store,
    passwords,
    auth,
    bootstrap,
  };
}

/**
 * Deployment runtime from env. Boot-fail-fast parity: a bad JWT secret
 * throws here (called at composition time). A missing DATABASE_URL defers
 * to first use with a loud, named error — the "boot with a WARN, fail
 * loudly on first use naming the missing setting" doctrine the core applies
 * to its R2-tier secrets; bare unit-test boots stay possible without env.
 */
export function createEnvRuntime(): IdentityRuntime {
  return createIdentityRuntime({
    config: buildIdentityConfig(process.env as Partial<IdentityEnv>),
    store: new PgIdentityStore(createDb()),
  });
}

/**
 * deferred runtime: never constructed successfully — every touch fails loudly
 * naming the missing setting (the core's R2-tier doctrine); the route error
 * stays an opaque 500 like the core's, the reason reaches the server log.
 */
function deferredRuntime(reason: string): IdentityRuntime {
  const boom = (): never => {
    throw new Error(`[api] fail-fast: ${reason}`);
  };
  const throwing = new Proxy({}, {
    get() {
      return boom;
    },
  });
  return throwing as unknown as IdentityRuntime;
}

function isUsable(rt: IdentityRuntime): boolean {
  return typeof (rt as { boom?: unknown }).boom !== "function";
}

function mapError(err: unknown, c: Context): Response {
  if (err instanceof IdentityHttpError) {
    const res = c.json(err.body(), err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
    for (const [k, v] of Object.entries(err.headers)) res.headers.set(k, v);
    return res;
  }
  console.error("[api] unhandled error:", err);
  // GlobalExceptionHandler.unexpected — opaque 500, detail only in logs
  return c.json(
    { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: new Date().toISOString() },
    500,
  );
}

export interface CreateAuthAppOptions {
  runtime?: IdentityRuntime;
}

/**
 * Composition root. Mounts (parity-critical):
 *   /actuator/health   byte-exact {"status":"UP"} (seed parity, unmodified)
 *   /api/v1/auth/**    the real identity port (frozen core paths)
 *   /api/auth/**       deprecated legacy alias → 501 stub (seed tests)
 */
export function createAuthApp(options: CreateAuthAppOptions = {}): Hono {
  const app = new Hono();

  let runtime: IdentityRuntime;
  if (options.runtime) {
    runtime = options.runtime;
  } else {
    try {
      runtime = createEnvRuntime();
    } catch (e) {
      // boot WARN (not silent): identity routes fail loudly on first use
      console.warn(`[api] identity runtime deferred: ${(e as Error).message}`);
      runtime = deferredRuntime((e as Error).message);
    }
  }

  const cors = createCorsMiddleware({
    allowedOrigins: isUsable(runtime)
      ? runtime.config.corsOrigins
      : ["http://localhost:3000", "https://syllabai.vercel.app"],
  });

  app.use("*", cors);
  app.use("*", createJwtAuthMiddleware({ jwt: runtime.jwt, store: runtime.store }));

  // GET /actuator/health — path + payload parity with Spring Boot actuator.
  // Do not "improve" the shape — parity wins (seed comment preserved).
  app.get("/actuator/health", (c) => c.json({ status: "UP" }));

  const v1 = new Hono();

  v1.post("/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = validateRegister(body);
    if (!parsed.ok) throw new ValidationError(parsed.field!, parsed.message!);
    const result = await runtime.auth.register(parsed.data!);
    // Spring: ResponseEntity.created(uri.path("/api/v1/auth/me").build()) —
    // absolute URL built from the request (R6 capture will pin the exact form)
    const location = new URL("/api/v1/auth/me", c.req.url).toString();
    return c.json(result, 201, { Location: location });
  });

  v1.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = validateLogin(body);
    if (!parsed.ok) throw new ValidationError(parsed.field!, parsed.message!);
    const result = await runtime.auth.login(parsed.data!);
    return c.json(result, 200);
  });

  v1.get("/me", requireAuth, async (c) => {
    const identity = c.get("identity")!;
    // Authentication.getName() === JWT subject === the stored (lowercased) email
    const user = await runtime.auth.me(identity.email);
    return c.json(user, 200);
  });

  v1.post("/password", requireAuth, async (c) => {
    const identity = c.get("identity")!;
    const body = await c.req.json().catch(() => null);
    const parsed = validatePasswordChange(body);
    if (!parsed.ok) throw new ValidationError(parsed.field!, parsed.message!);
    await runtime.auth.changePassword(identity.email, parsed.data!.currentPassword, parsed.data!.newPassword);
    return c.body(null, 204);
  });

  v1.get("/bootstrap-status", async (c) => {
    return c.json({ available: await runtime.bootstrap.claimable() }, 200);
  });

  v1.post("/bootstrap-admin", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = validateRegister(body);
    if (!parsed.ok) throw new ValidationError(parsed.field!, parsed.message!);
    const result = await runtime.bootstrap.claim(parsed.data!);
    return c.json(result, 200);
  });

  app.route("/api/v1/auth", v1);
  app.route("/api/auth", legacyAuthStub); // deprecated alias — see stub.ts

  // Global error shape — Java-parity: GlobalExceptionHandler renders ApiError
  // for domain errors and an opaque 500 otherwise (seed's speculative
  // "Internal Server Error" shape replaced by the frozen core's).
  app.onError((err, c) => mapError(err, c));

  // NoResourceFoundException → 404 "not_found" / "resource not found"
  app.notFound((c) =>
    c.json(
      { status: 404, error: "not_found", message: "resource not found", timestamp: new Date().toISOString() },
      404,
    ),
  );

  return app;
}
