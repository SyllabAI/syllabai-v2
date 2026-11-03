/**
 * Session — the signed routing cookie (frontend-flow audit A-2, Tier 1
 * phase 1).
 *
 * Why this exists: the hub's auth session lives in localStorage
 * (lib/api.ts "syllabai.token"/"syllabai.user" — the v0 pilot shape, with
 * httpOnly-cookie hardening tracked as Wave 4). A localStorage token is
 * invisible to the server, so every gate was a hydration-timed client
 * render and /teacher answered 200 to any browser. This module adds the
 * ROUTING half of that hardening: a signed, httpOnly cookie that mirrors
 * who is signed in, so server code (proxy.ts) can make routing decisions
 * before first paint.
 *
 * Deliberate scope boundary: this cookie authorizes ROUTING only. API
 * authorization is unchanged — every data call still carries the core
 * bearer token (lib/api.ts), and the API still enforces authn/RBAC on
 * each request. The cookie carries only what routing needs: sub, name,
 * email, role (TEACHER/ADMIN → "teacher", the same mapping as
 * lib/identity.ts).
 *
 * Consumers:
 *   - src/proxy.ts — reads request.cookies and verifies via
 *     verifySessionToken() (edge/Node-safe, jose)
 *   - src/app/api/session/route.ts — issues (POST), reads (GET) and
 *     clears (DELETE) the cookie; the client mirror lives in
 *     lib/session-cookie.ts
 *   - server components (later tiers) — readSession()
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sai_session";

/** 30 days — the pilot is 8 weeks; one login per cycle is the right ask. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionRole = "student" | "teacher";

export interface SessionPayload {
  /** Core account id (AuthResponse.user.id) — stable across logins. */
  sub: string;
  name: string;
  email: string;
  role: SessionRole;
}

const ISSUER = "syllabai-hub";
const AUDIENCE = "syllabai-hub";

/**
 * Fail closed, loudly: a missing/short secret must stop session issuance
 * and make the proxy's verify reject, never silently fall back to a dev
 * constant in production. Set SESSION_SECRET (32+ chars) in Vercel env for
 * every environment and in .env.local for development.
 */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters — set it in Vercel project env + .env.local before serving authenticated routes.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    name: payload.name,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

/** Null on any failure (bad signature, expired, wrong claims) — callers
 * treat null as "signed out", never as an error page. */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"], // allowlist — never trust the token's header
    });
    const role = payload.role;
    if (role !== "student" && role !== "teacher") return null;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      role,
    };
  } catch {
    return null;
  }
}

/** Shared cookie flags so POST (issue) and every clearing path agree. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  } as const;
}

/**
 * Server-component read helper (layouts, pages) — NOT usable in the proxy
 * (that reads request.cookies directly) and NOT usable client-side.
 * `cookies()` is async on Next 15+/16. Dynamic import keeps this module
 * importable from the proxy bundle without dragging server-only APIs into
 * client bundles.
 */
export async function readSession(): Promise<SessionPayload | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}
