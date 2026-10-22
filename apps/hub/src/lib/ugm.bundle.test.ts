/**
 * T-UGM-HUB-CONSUME-3 — the committed UGM bundle regression law.
 *
 * The bundle is committed data; the reader (ugm.ts) fail-closes on schema
 * drift. These tests pin BOTH planes against the shipped file, so a bad
 * regen (importer census drift, schema drift, coverage manufacturing)
 * fails here before it can reach a flagged surface:
 *
 *   - the committed bundle parses under the exact Zod schema the reader uses
 *   - the lane census of record (lanes 1-3; lane 3 = the first multi-station
 *     lane: Geometry of Equations + Circles under one spine subtopic)
 *   - the honesty invariants: unique ids, non-overlaps carry reasons and no
 *     spec points, aligned resources carry spec points, primaryPick
 *     membership, per-body delimiter balance (renderer contract)
 *
 * Corpus of record: SyllabAI/syllabai-resources main@7e11a74c (PR #66) under
 * ADR-UGM-0001 as amended 2026-10-23 + the operator attestation of 2026-10-23.
 */
import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ugm.ts is a server module (import "server-only"); the package is a Next.js
// build-time stub absent from the bun-test module graph — shim it BEFORE the
// module under test loads (the books-lesson.test.ts law).
mock.module("server-only", () => ({}));

const { UgmLaneBundle } = await import("./ugm");

const BUNDLE_PATH = join(
  import.meta.dir,
  "../../content/cie-a-level-maths-20-pure-1/ugm-resources.json",
);
const bundle = UgmLaneBundle.parse(
  JSON.parse(readFileSync(BUNDLE_PATH, "utf8")),
);

const byStation = (slug: string) =>
  bundle.resources.filter((r) => r.station === slug);

describe("the committed UGM bundle parses under the reader schema (fail-closed law)", () => {
  test("schema of record: syllabai-demo.ugm-lane-resources/1.1", () => {
    expect(bundle.schema).toBe("syllabai-demo.ugm-lane-resources/1.1");
  });

  test("parse succeeds — schema drift must degrade the surface, never serve raw", () => {
    // UgmLaneBundle.parse above THROWS on drift; reaching here is the pass.
    expect(bundle.resources.length).toBeGreaterThan(0);
  });

  test("the corpus pin of record", () => {
    expect(bundle.source.ref).toBe(
      "main@7e11a74c40eb5667fedea5cd9a3c49e03b302e8b",
    );
    expect(bundle.source.repo).toBe("SyllabAI/syllabai-resources");
    expect(bundle.rights.textOnly).toBe(true);
    expect(bundle.reviewState.state).toBe("SUGGESTED");
  });
});

describe("the lane census of record (3 lanes / 4 stations / 12 spec points)", () => {
  test("stations: the two single-station lanes + the first multi-station lane", () => {
    expect(bundle.stations.map((s) => s.slug)).toEqual([
      "quadratics",
      "combining-functions",
      "geometry-of-equations",
      "circles",
    ]);
  });

  test("fleet census: 182 bodies, 144 aligned, 38 non-overlaps, 188 rows", () => {
    expect(bundle.resources.length).toBe(182);
    expect(bundle.coverage.aligned).toBe(144);
    expect(bundle.coverage.nonOverlap).toBe(38);
    expect(bundle.coverage.candidateRows).toBe(188);
    expect(bundle.coverage.ugmResourcesConsidered).toBe(182);
  });

  test("per-station census matches the enrichments of record", () => {
    // lane 1 quadratics (#55/#58): 59 considered, 56 aligned, 3 non-overlap
    expect(byStation("quadratics").length).toBe(59);
    // lane 2 functions (PR #61): 38 considered, 27 aligned, 11 non-overlap
    expect(byStation("combining-functions").length).toBe(38);
    // lane 3 coordinate geometry (PR #66): the two-station split of record
    expect(byStation("geometry-of-equations").length).toBe(38);
    expect(byStation("circles").length).toBe(47);
  });

  test("coverage.lanes carries the three lane keys incl. the multi-station lane", () => {
    expect(bundle.coverage.lanes.map((l) => l.station)).toEqual([
      "quadratics",
      "combining-functions",
      "coordinate-geometry",
    ]);
    const lane3 = bundle.coverage.lanes[2];
    expect(lane3.stationTitle).toBe("Coordinate Geometry");
    expect(lane3.aligned).toBe(61);
    expect(lane3.nonOverlap).toBe(24);
    expect(lane3.candidateRows).toBe(77);
  });

  test("spec points: 12 codes across 1.1.x / 1.2.x / folded 1.3.x", () => {
    expect(bundle.coverage.specPointsCovered).toEqual([
      "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5",
      "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2",
    ]);
    // the fold law: hub-spine parse fragments 1.3.1a/1.3.2a stay folded into
    // the parent codes — no .a rows in the bundle
    expect(bundle.coverage.specPointsCovered.some((c) => c.endsWith("a"))).toBe(false);
    expect(bundle.specPoints.find((s) => s.code === "1.3.1")?.ugmIds.length).toBe(17);
    expect(bundle.specPoints.find((s) => s.code === "1.3.2")?.ugmIds.length).toBe(60);
  });
});

describe("honesty invariants (AGENT.md rules 2-3 mirrored hub-side)", () => {
  test("ugmIds are unique fleet-wide", () => {
    const ids = bundle.resources.map((r) => r.ugmId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every resource's station is a declared bundle station", () => {
    const slugs = new Set(bundle.stations.map((s) => s.slug));
    for (const r of bundle.resources) expect(slugs.has(r.station)).toBe(true);
  });

  test("non-overlaps: reason present, zero spec points; aligned: spec points present", () => {
    for (const r of bundle.resources) {
      if (r.nonOverlap) {
        expect(r.nonOverlapReason).toBeDefined();
        expect(r.nonOverlapReason?.length ?? 0).toBeGreaterThan(0);
        expect(r.specPoints.length).toBe(0);
      } else {
        expect(r.specPoints.length).toBeGreaterThan(0);
      }
    }
  });

  test("primaryPick: each spec point's pick is among its rows; ≤1 pick per resource", () => {
    const pickCount = new Map<string, number>();
    for (const sp of bundle.specPoints) {
      expect(sp.ugmIds).toContain(sp.primaryPick);
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
    }
    for (const r of bundle.resources) {
      const n = r.specPoints.filter((s) => s.primaryPick).length;
      expect(n).toBeLessThanOrEqual(1);
      if (n === 1) pickCount.set(r.ugmId, 1);
    }
    // every declared spec-point primaryPick resolves to a resource that knows it
    for (const sp of bundle.specPoints) {
      expect(pickCount.has(sp.primaryPick)).toBe(true);
    }
  });

  test("per-body delimiter balance (the renderer contract)", () => {
    for (const r of bundle.resources) {
      const openParen = (r.bodyMd.match(/\\\(/g) ?? []).length;
      const closeParen = (r.bodyMd.match(/\\\)/g) ?? []).length;
      const openBracket = (r.bodyMd.match(/\\\[/g) ?? []).length;
      const closeBracket = (r.bodyMd.match(/\\\]/g) ?? []).length;
      expect(openParen).toBe(closeParen);
      expect(openBracket).toBe(closeBracket);
    }
  });
});
