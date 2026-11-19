import type { Metadata } from "next";
import { WorkbenchClient } from "./workbench-client";

export const metadata: Metadata = {
  title: "Editor Workbench · SyllabAI",
  description: "ADR-044 Phase 2 — the gated editor plane (Tier 1 auto-merge, simulated PR transport).",
  robots: { index: false, follow: false },
};

export default function WorkbenchPage() {
  return <WorkbenchClient />;
}
