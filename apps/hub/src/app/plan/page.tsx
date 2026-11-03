import type { Metadata } from "next";

import { RequireAuth } from "@/components/auth/require-auth";

import { PlanClient } from "./plan-client";

export const metadata: Metadata = { title: "Study plan" };

/**
 * Study-Plan Builder — the plan surface (spec §5.3; prereg of record
 * docs/STUDY-PLAN-BUILDER-PLAN.md). No plan → the three-step builder ("each
 * cheap and defaulted") with the generation interstitial; a plan → the
 * weekly page: goal card with the season chip, Edit plan action, day strip,
 * the "N of M" counter with a percent, and per-course task groups whose
 * completion states ride the DC-7 projection (never a local counter).
 *
 * B-3: the plan is core-backed (it builds from the account's subjects and
 * saves to it), so it sits in the proxy's session gate — the client-side
 * RequireAuth below is the defense-in-depth/loader fallback, not the gate.
 */
export default function PlanPage() {
  return (
    <RequireAuth>
      <PlanClient />
    </RequireAuth>
  );
}
