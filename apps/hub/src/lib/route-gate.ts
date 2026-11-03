/**
 * Route gate — the gating policy in ONE place (frontend-flow audit B-3).
 *
 * The policy, written down once:
 *
 *   1. Core-backed surfaces gate — any signed-in identity passes. These
 *      are the surfaces whose substance is the learner's own account
 *      data: the dashboard, the tutor, the assistant, My Progress, the
 *      study plan, and the two identity-bearing practice surfaces (the
 *      drill and the battle draw and key evidence to the learner).
 *   2. The teacher workspace additionally requires the teacher role.
 *   3. Corpus surfaces stay open — the marketing hero, /courses, the
 *      course hubs, past papers, and the practice index (a launcher over
 *      the modes; the modes themselves gate). Browsing never meets a
 *      login wall.
 *
 * Consumers:
 *   - src/proxy.ts enforces the routing half server-side: a gated path
 *     without a valid routing session gets the one signed-out treatment
 *     (307 → /login?next=<path+query>, Tier 0's signInHref contract).
 *   - RequireAuth (components/auth/require-auth.tsx) stays client-side
 *     as defense-in-depth, loading UX and the session-expired fallback —
 *     its prompt never races the proxy's redirect for anonymous visitors,
 *     it only shows when a session dies mid-flight.
 *
 * Before B-3 this policy lived in eight bespoke inline states (each with
 * its own copy, its own link, and its own chance at a next-param bug);
 * the audit's direction was "one wrapper, one copy block" — this module
 * plus RequireAuth are that one place.
 */

export type GateClass = "session" | "teacher";

interface GatedRoute {
  /** Path prefix — matches the path itself and everything under it. */
  prefix: string;
  gate: GateClass;
}

/**
 * The gated set. Order is irrelevant (prefixes do not overlap). Adding a
 * core-backed surface means adding one row here — the proxy matcher, the
 * signed-out treatment and the ?next serialisation all follow.
 */
export const GATED_ROUTES: readonly GatedRoute[] = [
  { prefix: "/dashboard", gate: "session" }, // B-2: accounts, not the demo
  { prefix: "/tutor", gate: "session" },
  { prefix: "/assistant", gate: "session" },
  { prefix: "/learner", gate: "session" },
  { prefix: "/plan", gate: "session" },
  { prefix: "/practice/drill", gate: "session" },
  { prefix: "/practice/battle", gate: "session" },
  { prefix: "/teacher", gate: "teacher" },
];

/** The gate class for a pathname, or null when the path is open (policy 3). */
export function gateForPath(pathname: string): GateClass | null {
  for (const { prefix, gate } of GATED_ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return gate;
  }
  return null;
}

/**
 * The proxy matcher, derived from the same rows — the list Next's proxy
 * compiles against and gateForPath() cannot drift apart. "/" and "/login"
 * are outside the policy: "/" redirects signed-in identities to their role
 * home (A-1) and /login stays reachable signed-in (P3-7 panel, account
 * switching). The ~4.4k statically prerendered corpus pages stay outside —
 * widening to them would put every content page behind a cookie check for
 * zero benefit.
 */
export const PROXY_MATCHER = [
  "/",
  "/login",
  ...GATED_ROUTES.flatMap(({ prefix }) => [prefix, `${prefix}/:path*`]),
];
