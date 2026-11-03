import type { Metadata } from "next";

import { RequireAuth } from "@/components/auth/require-auth";

import { DrillClient } from "./client";

export const metadata: Metadata = { title: "Spec-point drill" };

/**
 * F-182 — the per-spec-point drill surface (Kognity Deep Dive D §8.5 row 1).
 * Chemistry (4CH1) is the censused course of record: the drill ships ONLY
 * where the spec-tagging census exists (the anchor law), so the course is
 * pinned server-side and the picker serves only drillable addresses.
 *
 * B-3: the drill is an identity-bearing surface (draws and attempt evidence
 * key to the learner), so it sits in the proxy's session gate — the
 * client-side RequireAuth is the fallback, not the gate.
 */
export default function DrillPage() {
  return (
    <RequireAuth>
      <DrillClient course="igcse-chemistry-19" />
    </RequireAuth>
  );
}
