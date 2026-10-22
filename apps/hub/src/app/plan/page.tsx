import type { Metadata } from "next";

import { PlanClient } from "./plan-client";

export const metadata: Metadata = { title: "Study plan" };

/**
 * Study-Plan Builder — the plan surface (spec §5.3; prereg of record
 * docs/STUDY-PLAN-BUILDER-PLAN.md). No plan → the three-step builder ("each
 * cheap and defaulted") with the generation interstitial; a plan → the
 * weekly page: goal card with the season chip, Edit plan action, day strip,
 * the "N of M" counter with a percent, and per-course task groups whose
 * completion states ride the DC-7 projection (never a local counter).
 */
export default function PlanPage() {
  return <PlanClient />;
}
