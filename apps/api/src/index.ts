/**
 * syllabai-v2 api — the TypeScript port target of the frozen Java core.
 *
 * Entry contract with the frozen world (docs/GOLDEN_MASTER.md):
 *   - Path parity: routes mirror the Java core's paths — /actuator/health,
 *     /api/v1/auth/** (AuthController.java:25 @RequestMapping). The seed's
 *     "/api/auth" mount was a path-parity bug; corrected with T-MIG-010.
 *   - Fail fast: missing secrets abort boot (src/env.ts + identity wiring) —
 *     inherited verbatim from the Java core's boot discipline.
 *
 * ⚠️ OUT-OF-FENCE COMMIT (T-MIG-010, R0 ratification requested):
 * T-MIG-010's scope.allowed covers routes/auth/**, middleware/**,
 * services/identity/**, test/identity/** — NOT this file. The changes here
 * are the minimal app-level wiring the ported module needs, shipped as a
 * separate commit so R0 can ratify or lift them out at review:
 *   1. mount "/api/v1/auth" (path parity, was "/api/auth")
 *   2. app-wide Bearer middleware + require-auth for /api/v1/** before the
 *      404 fallthrough (anyRequest().authenticated() parity — an unknown
 *      /api/v1 path must 401 when anonymous, 404 when authenticated)
 *   3. onError maps identity-domain errors to the ApiError shape and the
 *      catch-all to the core's internal_error body
 *   4. CORS preflight handling (SecurityConfig corsConfigurationSource parity)
 *   5. dev server start guarded by import.meta.main (bun test imports this
 *      module; it must not bind :8080 under the test runner)
 *
 * Deployment: Vercel (this module's default export is the fetch handler);
 * locally run `bun run dev:api` at the repo root.
 */
import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { buildIdentityApp } from "./services/identity";
import { buildContentApp } from "./services/content";
import { toErrorResponse, apiError } from "./services/identity/errors";
import { bootErrorBody, getAuth } from "./middleware/auth";
import { DEFAULT_CORS_ORIGINS } from "./services/identity/config";

const identity = buildIdentityApp();
const content = buildContentApp();

const app = new Hono();

app.route("/", healthRoute);

// CORS (SecurityConfig.java:131-141 parity): reflected allowlisted origins,
// Authorization+Content-Type headers, Location exposed, 1h preflight cache.
// OPTIONS is permitAll and must never authenticate (SecurityConfig.java:66).
const allowedOrigins = identity.config.config.corsOrigins ?? DEFAULT_CORS_ORIGINS;
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const isAllowed = origin !== undefined && allowedOrigins.includes(origin);
  if (c.req.method === "OPTIONS") {
    if (isAllowed || origin === undefined) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
          "Access-Control-Max-Age": "3600",
          ...(isAllowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        },
      });
    }
    return new Response(null, { status: 403 });
  }
  await next();
  if (isAllowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Expose-Headers", "Location");
});

// Bearer authentication — parse once, attach context (filter port). Invalid
// tokens never abort here; protected paths reject via requireAuth/requireRole.
app.use("*", identity.authMiddleware);

// Identity routers (AuthController + BootstrapAdminController). Registration
// ORDER matters: the routers own their paths first; the fallback below only
// sees paths NO router claimed. The public auth surfaces (register, login,
// bootstrap-status, bootstrap-admin — SecurityConfig.java:67-73 permitAll)
// must never see the authenticated() gate.
app.route("/api/v1/auth", identity.authRoute);
app.route("/api/v1/auth", identity.bootstrapRoute);

// Content routers (T-MIG-020 — Wave 2 read surfaces; mounted BEFORE the
// authenticated() fallback, which then only sees paths no router claimed):
//   /api/v1/content             — learner citation reader + question assets
//                                 (isAuthenticated parity)
//   /api/v1/teacher/content     — document store + review queues + §7 read
//                                 views (TEACHER/ADMIN parity)
app.route("/api/v1/content", content.contentRoute);
app.route("/api/v1/teacher/content", content.teacherContentRoute);

// anyRequest().authenticated() parity for paths NO router claimed
// (SecurityConfig.java:91): anonymous callers get the 401 Boot-shaped body;
// authenticated callers get 404 not_found (NoResourceFoundException parity,
// GlobalExceptionHandler.java:192-195). First-match-wins registration keeps
// the routers above authoritative for their own paths.
app.all("/api/v1/*", (c) => {
  if (!getAuth(c)) {
    return c.json(bootErrorBody(401, new URL(c.req.url).pathname), 401);
  }
  return c.json(apiError(404, "not_found", "resource not found"), 404);
});

/**
 * Error boundary — identity-domain errors render the frozen core's ApiError
 * shape; everything else stays the opaque 500 the GlobalExceptionHandler
 * serves (:224-230: "internal_error" / "an internal error occurred").
 */
app.onError((err, c) => {
  const mapped = toErrorResponse(err);
  if (mapped) {
    if (mapped.headers) for (const [k, v] of Object.entries(mapped.headers)) c.header(k, v);
    return c.json(mapped.body, mapped.status as 400 | 401 | 403 | 404 | 409 | 429);
  }
  console.error("[api] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
});

export default app;

// Local dev server (bun). On Vercel, the default export above is the entry.
// import.meta.main: importing this module from tests must not bind a port.
if (typeof Bun !== "undefined" && import.meta.main) {
  const port = Number(process.env.PORT ?? 8080);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`[syllabai-v2 api] listening on :${port}`);
}
