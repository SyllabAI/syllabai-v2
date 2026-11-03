/**
 * Route guard — the server-side half of the frontend-flow audit's A-2
 * (Tier 1 phase 1), extended by B-2 and consolidated by B-3. Next 16's
 * proxy convention (the successor of middleware.ts; resolved at
 * src/proxy.ts, Node runtime).
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
 *   - B-2: /dashboard requires a session. The product's home URL stops
 *     doubling as the anonymous demo — public browsing lives at /courses
 *     (the login page's "Browse without an account" link points there),
 *     and a signed-out hit on /dashboard gets the same ?next sign-in
 *     redirect as every other gated surface, so a bookmarked dashboard
 *     survives sign-in. Students get their dashboard; teachers keep the
 *     explicit "Preview student view" path (Tier 0's identity menu).
 *   - B-3: one policy for every gated surface (lib/route-gate.ts). A
 *     signed-out request to any session-gated path gets the ONE signed-out
 *     treatment — 307 to /login?next=<path+query> — instead of the eight
 *     bespoke inline states the audit inventoried; /teacher additionally
 *     requires the teacher role; everything ungated passes untouched.
 *   - /login is deliberately NOT redirected for signed-in users: the
 *     login page's "Signed in as …" panel (hub UI audit P3-7) and
 *     account switching both need /login to stay reachable.
 *
 * Matcher discipline: the literal below mirrors lib/route-gate.ts —
 * the gated rows plus "/" and "/login" — and route-gate.test.ts fails the
 * day the policy and this list drift. The hub serves ~4.4k statically
 * prerendered content pages and they stay outside the matcher — widening
 * to them would put every content page behind a cookie check for zero
 * benefit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { roleHome } from "@/lib/role-home";
import { gateForPath } from "@/lib/route-gate";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

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
  const gate = gateForPath(pathname);

  if (token && !session) {
    // invalid cookie: gated surfaces get the sign-in redirect, everything
    // else just proceeds as signed-out with the cookie cleared
    if (gate) {
      return scrubCookie(signInRedirect(request, here));
    }
    return scrubCookie(NextResponse.next());
  }

  // A-1, server-side: the returning user's session starts in the product,
  // not on the pitch — with no pre-hydration frame this time.
  if (session && pathname === "/") {
    return roleHomeRedirect(request, session);
  }

  if (gate === "teacher") {
    if (!session) return signInRedirect(request, here);
    if (session.role !== "teacher") {
      // the audit's isolation line, now server-enforced
      return roleHomeRedirect(request, session);
    }
  }

  // B-2/B-3: every session-gated surface answers anonymous requests with
  // the one sign-in redirect — the surface's own signed-out states were
  // bespoke copies of this contract and are deleted client-side.
  if (gate === "session" && !session) {
    return signInRedirect(request, here);
  }

  return NextResponse.next();
}

export const config = {
  // Next statically parses this field, so the matcher must be a literal
  // here — an imported array is rejected at build time. The value mirrors
  // lib/route-gate.ts's PROXY_MATCHER (the gated rows + "/" and "/login"),
  // and src/lib/route-gate.test.ts fails the suite the day the two drift.
  matcher: [
    "/",
    "/login",
    "/dashboard",
    "/dashboard/:path*",
    "/tutor",
    "/tutor/:path*",
    "/assistant",
    "/assistant/:path*",
    "/learner",
    "/learner/:path*",
    "/plan",
    "/plan/:path*",
    "/practice/drill",
    "/practice/drill/:path*",
    "/practice/battle",
    "/practice/battle/:path*",
    "/teacher",
    "/teacher/:path*",
  ],
};
