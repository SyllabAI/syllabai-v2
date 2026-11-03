/**
 * Route guard — the server-side half of the frontend-flow audit's A-2
 * (Tier 1 phase 1). Next 16's proxy convention (the successor of
 * middleware.ts; resolved at src/proxy.ts, Node runtime).
 *
 * The signed routing cookie (lib/session.ts) lets the server know who is
 * asking before first paint, so these decisions stop being
 * hydration-timed client work:
 *
 *   - A-1's server half: a signed-in identity opening `/` is redirected
 *     to the role home (lib/role-home.ts — the same resolver the logo,
 *     the header CTA and the identity menu use) with no hero flash.
 *     Tier 0's client-side role-home-redirect.tsx is removed in the same
 *     series — it loses every race to this redirect.
 *   - The RBAC line the audit flagged: a student reaching /teacher is
 *     redirected to /dashboard at the routing layer, before any
 *     RequireAuth mounts. RequireAuth stays as defense-in-depth and
 *     loading UX — its own doc comment already says it is "never
 *     authorization".
 *   - Teachers keep the explicit "Preview student view" path into
 *     /dashboard (shipped in Tier 0's identity menu), and the signed-out
 *     /dashboard demo keeps working (B-2's /dashboard-vs-/courses split
 *     is its own later decision — see SPEC reviewable decision 2).
 *   - /login is deliberately NOT redirected for signed-in users: the
 *     login page's "Signed in as …" panel (hub UI audit P3-7) and
 *     account switching both need /login to stay reachable.
 *
 * Matcher discipline: exactly four prefixes, nothing else. The hub serves
 * ~4.4k statically prerendered content pages; widening the matcher puts
 * every one of them behind a cookie check for zero benefit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { roleHome } from "@/lib/role-home";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

function isTeacher(pathname: string): boolean {
  return pathname === "/teacher" || pathname.startsWith("/teacher/");
}

/** Same-origin paths only: starts with a single "/" and never "//" or "\".
 * Everything else (absolute URLs, protocol-relative tricks) is dropped and
 * the caller falls back to the role home. */
function safeInternalNext(next: string | null): string | null {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return null;
  }
  return next;
}

function signInRedirect(request: NextRequest, next: string): NextResponse {
  // the same ?next contract signInHref() established in Tier 0 — the login
  // page's nextDestination() and the proxy speak one shape
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function roleHomeRedirect(
  request: NextRequest,
  session: SessionPayload,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = roleHome(session);
  url.search = "";
  return NextResponse.redirect(url);
}

/** A stale or garbage cookie is signed-out — and scrubbed, so it stops
 * riding along on every request. */
function scrubCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const here = `${pathname}${search}`;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (token && !session) {
    // invalid cookie: the teacher workspace gets the sign-in redirect,
    // everything else just proceeds as signed-out with the cookie cleared
    if (isTeacher(pathname)) {
      return scrubCookie(signInRedirect(request, here));
    }
    return scrubCookie(NextResponse.next());
  }

  // A-1, server-side: the returning user's session starts in the product,
  // not on the pitch — with no pre-hydration frame this time.
  if (session && pathname === "/") {
    return roleHomeRedirect(request, session);
  }

  if (isTeacher(pathname)) {
    if (!session) return signInRedirect(request, here);
    if (session.role !== "teacher") {
      // the audit's isolation line, now server-enforced
      return roleHomeRedirect(request, session);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/teacher", "/teacher/:path*"],
};
