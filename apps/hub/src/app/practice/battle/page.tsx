import type { Metadata } from "next";

import { battleCourse } from "@/lib/battle-course";

import { BattleClient } from "./client";

export const metadata: Metadata = { title: "Strength Battle" };

/**
 * F-186 — the Strength Battle surface (Kognity Deep Dive D §8.5 row 5).
 * Chemistry (4CH1) is the censused course of record: the battle ships ONLY
 * where the spec-tagging census exists (the anchor law), over the same bank
 * the drill serves. Strictly a later wave than the drill surface and the
 * model-driven draw — battles inherit model-drawn sets. The pin itself is
 * the F-186 rollout law of record (lib/battle-course.ts) — the course-page
 * card keys its live-vs-roadmap state on the same list.
 */
export default function BattlePage() {
  return <BattleClient course={battleCourse()} />;
}
