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
 *   3. Corpus surfaces stay open — the marketing hero, the /courses
 *      directory, past papers' index siblings and the practice index stay
 *      within the policy's reach; browsing never meets a login wall where
 *      the surface is pure corpus data.
 *
 *      OPTION 1 AMENDMENT (operator ruling 2026-11-07, trace
 *      1a1b53d8068b9b7d, "option 1"): the directory ROOT /courses re-opens.
 *      It renders static registry data only — no user state, no session
 *      read, statically prerendered — so the anonymous directory is honest
 *      browsing, and the login page's "Browse without an account" link
 *      finally resolves (it 307-looped while T-ACCOUNT-ONLY gated the very
 *      route it named). The per-course hub subtree (/courses/<slug>/…)
 *      KEEPS the session gate: progress overlays, flashcards, guided
 *      lessons and question players are account surfaces. The row below
 *      therefore prefixes with the trailing slash: "/courses/" matches
 *      everything under the directory but never the root itself.
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
 *
 * OPTION 1 AMENDMENT (operator ruling 2026-11-07, trace 1a1b53d8068b9b7d,
 * "option 1"): the directory ROOT /courses re-opens — it is statically
 * prerendered registry data with zero user state, so the account-only
 * premise does not reach it. The hub subtree keeps the gate via the
 * trailing-slash prefix "/courses/"; the exact root never matches it.
 */
export const GATED_ROUTES: readonly GatedRoute[] = [
  { prefix: "/dashboard", gate: "session" }, // B-2: accounts, not the demo
  // T-ACCOUNT-ONLY run-001, narrowed by option 1 (trace 1a1b53d8068b9b7d):
  // the DIRECTORY root /courses is public (static registry, no user state);
  // the trailing slash keeps /courses/<slug>/… (progress, flashcards,
  // players) session-gated while the bare root never matches.
  { prefix: "/courses/", gate: "session" },
  { prefix: "/past-papers", gate: "session" }, // T-ACCOUNT-ONLY run-001
  { prefix: "/practice", gate: "session" }, // T-ACCOUNT-ONLY run-001 (drill/battle were already gated)
  { prefix: "/tutor", gate: "session" },
  { prefix: "/assistant", gate: "session" },
  { prefix: "/learner", gate: "session" },
  { prefix: "/plan", gate: "session" },
  { prefix: "/teacher", gate: "teacher" },
];

/** The gate class for a pathname, or null when the path is open (policy 3).
 *
 * One trailing slash is normalized before matching: "/courses/" must
 * classify as the OPEN directory root (option 1), never as a hub-subtree
 * hit on the "/courses/" prefix — and "…/x/" must classify exactly like
 * "…/x" everywhere else. (Next itself 308-normalizes trailing slashes;
 * the normalization here is the policy-level guarantee so the law does
 * not depend on the router's order of operations.) */
export function gateForPath(pathname: string): GateClass | null {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  for (const { prefix, gate } of GATED_ROUTES) {
    // The subtree arm appends "/" only when the prefix doesn't already end
    // in one — the "/courses/" row's arm is "/courses/" itself, not the
    // never-matching "/courses//".
    const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (path === prefix || path.startsWith(base)) return gate;
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
  // A trailing-slash prefix ("/courses/", the option-1 subtree row) yields
  // its :path* arm WITHOUT a doubled slash — the strip keeps the derived
  // matcher equal to proxy.ts's literal (the no-drift test pins it).
  ...GATED_ROUTES.flatMap(({ prefix }) => [
    prefix,
    `${prefix.replace(/\/+$/, "")}/:path*`,
  ]),
];
