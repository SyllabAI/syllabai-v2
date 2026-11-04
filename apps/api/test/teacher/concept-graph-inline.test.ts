/**
 * T-TUTOR-EXP-1 run-001 — the inline concept-graph asset law, CI-enforced.
 *
 * The 2026-11-03 tutor outage (the whole 08:48–14:13 UTC window, every ask
 * 500) was the deploy-plane corollary of the frozen fail-closed law: a CLI
 * stage deploy without the six YAML files beside api/index.js booted fine
 * and failed at the FIRST snapshot read. The committed inline module closes
 * that class by construction — and THIS test closes the only remaining gap:
 * a YAML re-sync or a pin move that forgets the regeneration step now fails
 * here (CI) instead of in production. The generator asserts the same pins
 * pre-write; this test asserts the committed OUTPUT stays on-pin. The disk
 * bytes are cross-checked too, so a partial re-sync (files moved, module
 * not regenerated — or the reverse) is caught from BOTH directions.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONCEPTS_SHA256,
  CONCEPT_EDGES_SHA256,
  PRACTICALS_SHA256,
  RELATIONSHIPS_SHA256,
  SPEC_POINTS_SHA256,
  TOPICS_SHA256,
  loadConceptGraphSnapshot,
} from "../../src/services/teacher";
import { CONCEPT_GRAPH_INLINE_ASSETS } from "../../src/services/teacher/concept-graph-assets.gen";

const RESOURCES: ReadonlyArray<{
  key: string;
  disk: string;
  pin: string;
}> = [
  {
    key: "concept-graph/specification_points.yaml",
    disk: "src/services/teacher/concept-graph/specification_points.yaml",
    pin: SPEC_POINTS_SHA256,
  },
  {
    key: "concept-graph/topics.yaml",
    disk: "src/services/teacher/concept-graph/topics.yaml",
    pin: TOPICS_SHA256,
  },
  {
    key: "concept-graph/relationships.yaml",
    disk: "src/services/teacher/concept-graph/relationships.yaml",
    pin: RELATIONSHIPS_SHA256,
  },
  {
    key: "concept-graph/concepts.yaml",
    disk: "src/services/learner-me/concept-graph/concepts.yaml",
    pin: CONCEPTS_SHA256,
  },
  {
    key: "concept-graph/concept_edges.yaml",
    disk: "src/services/learner-me/concept-graph/concept_edges.yaml",
    pin: CONCEPT_EDGES_SHA256,
  },
  {
    key: "concept-graph/practicals.yaml",
    disk: "src/services/learner-me/concept-graph/practicals.yaml",
    pin: PRACTICALS_SHA256,
  },
];

describe("T-TUTOR-EXP-1 — the inline concept-graph asset law", () => {
  test("the inline module carries exactly the six pinned resources, byte-identical to disk", () => {
    expect(Object.keys(CONCEPT_GRAPH_INLINE_ASSETS).sort()).toEqual(
      RESOURCES.map((r) => r.key).sort(),
    );
    for (const r of RESOURCES) {
      const inline = CONCEPT_GRAPH_INLINE_ASSETS[r.key];
      expect(inline).toBeDefined();
      if (inline == null) throw new Error("inline asset missing: " + r.key);
      const disk = readFileSync(join(import.meta.dir, "../../", r.disk), "utf8");
      // inline == disk == pin: neither plane may drift alone
      expect(inline).toBe(disk);
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(inline);
      expect(hasher.digest("hex")).toBe(r.pin);
    }
  });

  test("the loader serves the pinned snapshot from the inline bytes (no disk dependency)", () => {
    // with the inline module present, the load succeeds and satisfies the
    // frozen V15 store-fact counts — the same gate the disk path obeys
    const snap = loadConceptGraphSnapshot();
    expect(snap.specPoints).toHaveLength(182);
    expect(snap.sections).toHaveLength(4);
    expect(snap.subsections).toHaveLength(28);
  });
});
