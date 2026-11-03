/**
 * Role home — the one concept of "where this identity's day starts"
 * (frontend-flow audit A-1 / B-1).
 *
 * Every persistent entry point resolves through this helper so the student
 * dashboard can never be a teacher's accidental landing:
 *
 *   - the `/` marketing hero redirects signed-in identities here
 *     SERVER-side via the routing-session guard (src/proxy.ts, A-2 —
 *     Tier 0's client-side role-home-redirect was removed once the proxy
 *     could win that race)
 *   - the header logo goes here for signed-in users, "/" for visitors (C-5)
 *   - the header CTA and the identity menu's primary item point here
 *   - the proxy's student-off-/teacher bounce lands here (A-2)
 *
 * Signed-out callers resolve to the anonymous dashboard demo on purpose:
 * Tier 0 keeps the demo where it is (B-2's /dashboard-vs-/courses split is
 * Tier 1 — it needs the cookie session). The logo branches explicitly on
 * identity instead of calling this helper, because a visitor's home is the
 * marketing hero, not the demo.
 */
import type { Identity } from "@/lib/identity";

export function roleHome(identity: Pick<Identity, "role"> | null): string {
  return identity?.role === "teacher" ? "/teacher" : "/dashboard";
}
