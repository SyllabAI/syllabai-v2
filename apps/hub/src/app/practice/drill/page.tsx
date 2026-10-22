import type { Metadata } from "next";

import { DrillClient } from "./client";

export const metadata: Metadata = { title: "Spec-point drill" };

/**
 * F-182 — the per-spec-point drill surface (Kognity Deep Dive D §8.5 row 1).
 * Chemistry (4CH1) is the censused course of record: the drill ships ONLY
 * where the spec-tagging census exists (the anchor law), so the course is
 * pinned server-side and the picker serves only drillable addresses.
 */
export default function DrillPage() {
  return <DrillClient course="igcse-chemistry-19" />;
}
