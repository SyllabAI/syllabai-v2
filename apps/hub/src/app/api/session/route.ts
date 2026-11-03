/**
 * /api/session — issue, read and clear the signed routing cookie
 * (frontend-flow audit A-2, Tier 1 phase 1).
 *
 * The auth session itself lives in localStorage via lib/api.ts (core
 * bearer token; Wave-4 hardening). This endpoint is its SERVER-side
 * mirror: after a successful core login the login page calls
 * mirrorRoutingSession() (lib/session-cookie.ts), which POSTs the core
 * user's routing facts here and gets back a signed httpOnly cookie the
 * proxy can read.
 *
 *   POST   { sub?, name, email, role } → Set-Cookie sai_session=<jwt>;
 *          responds { identity, roleHome } so the caller can route in the
 *          same round trip.
 *   GET    → { identity, roleHome } for client code that wants the
 *          server's view of the session.
 *   DELETE → clears the cookie (lib/api.ts clearSession() calls this
 *          fire-and-forget, which also covers the 401 session-expired
 *          path).
 *
 * Reads go through request.cookies (not next/headers) so the handler is
 * identical across Next 15/16 route-handler semantics.
 *
 * This endpoint issues ROUTING identity for the hub only. It is not an
 * auth token for any API — data authorization stays with the core bearer
 * token on every fetch (lib/api.ts), and the API enforces RBAC itself.
 */
import { NextResponse, type NextRequest } from "next/server";
import { roleHome } from "@/lib/role-home";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

const NAME_MAX_CHARS = 80;
const EMAIL_MAX_CHARS = 254;

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const { sub, name, email, role } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return badRequest("name is required");
  }
  if (name.trim().length > NAME_MAX_CHARS) {
    return badRequest(`name must be at most ${NAME_MAX_CHARS} characters`);
  }
  if (typeof email !== "string" || !email.includes("@") || email.length > EMAIL_MAX_CHARS) {
    return badRequest("a valid email is required");
  }
  if (role !== "student" && role !== "teacher") {
    return badRequest("role must be \"student\" or \"teacher\"");
  }

  // Reuse the core account id when provided so the routing session's sub
  // is stable across logins; the login mirror always sends it.
  const payload: SessionPayload = {
    sub:
      typeof sub === "string" && sub.length > 0 && sub.length <= 64
        ? sub
        : crypto.randomUUID(),
    name: name.trim(),
    email: email.trim(),
    role,
  };

  const token = await signSession(payload);

  const response = NextResponse.json({
    identity: {
      name: payload.name,
      email: payload.email,
      role: payload.role,
    },
    roleHome: roleHome(payload),
  });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(SESSION_TTL_SECONDS),
  );
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return NextResponse.json({
    identity: session
      ? { name: session.name, email: session.email, role: session.role }
      : null,
    roleHome: session ? roleHome(session) : null,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ identity: null });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
