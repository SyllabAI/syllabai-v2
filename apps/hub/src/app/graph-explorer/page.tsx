import type { Metadata } from "next";
import { GraphExplorerClient } from "./client";

export const metadata: Metadata = {
  title: "Graph Explorer",
  description:
    "The prototype build lab for the knowledge-graph visualizer — the product surface is Knowledge Graph.",
};

/**
 * Graph Explorer — Phase 1 integration of the operator's OpenHuman visualizer
 * prototype (docs/KNOWLEDGE_GRAPH_VISUALIZER_INTEGRATION.md).
 *
 * The builds are self-contained HTML files served byte-faithful from
 * /public/kg/ — this page is only the host chrome (build switcher, live data
 * stats from the decoupled artifact, fullscreen/new-tab). The renderer is
 * never modified; the contract boundary (GRAPH_CONTRACT v1.0) stays intact.
 */
export default function GraphExplorerPage() {
  return <GraphExplorerClient />;
}
