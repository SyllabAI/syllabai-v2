/**
 * CORS middleware — the SecurityConfig#corsConfigurationSource port.
 * Frozen source (verified 2026-10-04): identity/SecurityConfig.java
 *   allowedOrigins  = SYLLABAI_CORS_ORIGINS (default localhost:3000 +
 *                     https://syllabai.vercel.app — application.yml)
 *   allowedMethods  = GET, POST, PUT, PATCH, DELETE, OPTIONS
 *   allowedHeaders  = Authorization, Content-Type
 *   exposedHeaders  = Location (register's 201 needs this hub-side)
 *   maxAge          = 3600
 *   OPTIONS /**     = permitAll (preflight never requires auth)
 *
 * Preflight: allowed → 200 with the CORS headers; denied → 403 "Invalid
 * CORS request" (Spring's DefaultCorsProcessor text). Actual responses get
 * Access-Control-Allow-Origin + Vary when the origin is allowed.
 */

import type { Context, Next } from "hono";

export interface CorsDeps {
  allowedOrigins: readonly string[];
}

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const EXPOSED_HEADERS = "Location";
const MAX_AGE = "3600";

export function createCorsMiddleware(deps: CorsDeps) {
  const allowAll = deps.allowedOrigins.includes("*");

  function isAllowed(origin: string): boolean {
    return allowAll || deps.allowedOrigins.includes(origin);
  }

  return async (c: Context, next: Next): Promise<Response | void> => {
    const origin = c.req.header("Origin");
    const isPreflight =
      c.req.method === "OPTIONS" &&
      origin !== undefined &&
      c.req.header("Access-Control-Request-Method") !== undefined;

    if (isPreflight) {
      if (origin && isAllowed(origin)) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
        c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        c.header("Access-Control-Max-Age", MAX_AGE);
        c.header("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
        return c.body(null, 200);
      }
      return c.text("Invalid CORS request", 403);
    }

    if (origin && isAllowed(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Expose-Headers", EXPOSED_HEADERS);
      c.header("Vary", "Origin");
    }
    await next();
  };
}
