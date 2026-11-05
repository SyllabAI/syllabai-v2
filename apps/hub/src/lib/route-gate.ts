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
 *
 * T-ACCOUNT-ONLY run-001 (operator order 2026-11-05: "remove device-local
 * things completely — every single thing must be saved in account"): the
 * sweep moved EVERY user state onto the account, so every stateful surface
 * gates — the course hubs (progress overlays, flashcards, guided lessons,
 * question players), past papers (mocks, marking, ink) and the practice
 * index now require a signed-in identity, exactly like the dashboard.
 * Only the marketing/public pages stay open (the corpus landing, the
 * knowledge graph explorer, about/sources/demo/experiments — nothing
 * there persists user state).
 */
export const GATED_ROUTES: readonly GatedRoute[] = [
  { prefix: "/dashboard", gate: "session" }, // B-2: accounts, not the demo
  { prefix: "/courses", gate: "session" }, // T-ACCOUNT-ONLY run-001
  { prefix: "/past-papers", gate: "session" }, // T-ACCOUNT-ONLY run-001
  { prefix: "/practice", gate: "session" }, // T-ACCOUNT-ONLY run-001 (drill/battle were already gated)
  { prefix: "/tutor", gate: "session" },
  { prefix: "/assistant", gate: "session" },
  { prefix: "/learner", gate: "session" },
  { prefix: "/plan", gate: "session" },
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
 * The policy's statement of the proxy matcher: the gated rows plus "/"
 * and "/login". Next statically parses src/proxy.ts's config field, so
 * the matcher there is a LITERAL copy of this list — route-gate.test.ts
 * fails the day the two drift. "/" and "/login" sit outside the policy:
 * "/" redirects signed-in identities to their role home (A-1) and /login
 * stays reachable signed-in (P3-7 panel, account switching). The ~4.4k
 * statically prerendered corpus pages stay outside — widening to them
 * would put every content page behind a cookie check for zero benefit.
 */
export const PROXY_MATCHER = [
  "/",
  "/login",
  ...GATED_ROUTES.flatMap(({ prefix }) => [prefix, `${prefix}/:path*`]),
];
