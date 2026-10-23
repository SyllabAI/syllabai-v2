import type { Metadata } from "next";

import { BattleClient } from "./client";

export const metadata: Metadata = { title: "Strength Battle" };

/**
 * F-186 — the Strength Battle surface (Kognity Deep Dive D §8.5 row 5).
 * Chemistry (4CH1) is the censused course of record: the battle ships ONLY
 * where the spec-tagging census exists (the anchor law), over the same bank
 * the drill serves. Strictly a later wave than the drill surface and the
 * model-driven draw — battles inherit model-drawn sets.
 */
export default function BattlePage() {
  return <BattleClient course="igcse-chemistry-19" />;
}
