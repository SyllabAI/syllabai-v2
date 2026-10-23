/**
 * T-UGM-HUB-CONSUME-3/-4/-5 — the committed UGM bundle regression law.
 *
 * The bundle is committed data; the reader (ugm.ts) fail-closes on schema
 * drift. These tests pin BOTH planes against the shipped file, so a bad
 * regen (importer census drift, schema drift, coverage manufacturing)
 * fails here before it can reach a flagged surface:
 *
 *   - the committed bundle parses under the exact Zod schema the reader uses
 *   - the lane census of record (lanes 1-5; lane 3 = the first multi-station
 *     lane, lane 4 = the first STRAND lane: Circular measure drawn from four
 *     stations' sweeps, with its circles-strand mappings CROSS-LANE JOINED
 *     against the lane-3 bodies of record; lane 5 = the second two-station
 *     lane: Trigonometry's WHOLE substrate as text of record — 41 mapped +
 *     36 recorded non-overlaps imported unmapped — plus two cross-lane fact
 *     joins against the lane-2 bodies — no new entries, no body duplication,
 *     first-of-record body wins)
 *   - the honesty invariants: unique ids, non-overlaps carry reasons and no
 *     spec points, aligned resources carry spec points, primaryPick
 *     membership, per-body delimiter balance (renderer contract)
 *
 * Corpus of record: SyllabAI/syllabai-resources main@cf79ecd2 (PR #79) under
 * ADR-UGM-0001 as amended 2026-10-23 + the operator attestation of 2026-10-23.
 * Per-lane coverage blocks carry the enrichments-of-record censuses; the
 * FLEET census reflects the merged serve after the lane-4 and lane-5
 * cross-lane joins (12 lane-3 non-overlaps flip to aligned under 1.4.1;
 * lane 5's r9924 flips its lane-2 non-overlap of record under 1.5.4 while
 * r8411 gains a second spec row; 63 non-overlaps remain).
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
      "main@cf79ecd2f49aae81b7bb0db9721b79623f3dd5fd",
    );
    expect(bundle.source.repo).toBe("SyllabAI/syllabai-resources");
    expect(bundle.rights.textOnly).toBe(true);
    expect(bundle.reviewState.state).toBe("SUGGESTED");
  });
});

describe("the lane census of record (5 lanes / 12 stations / 18 spec points)", () => {
  test("stations: the single-station lanes, the multi-station and strand lanes, and the two-station trigonometry lane", () => {
    expect(bundle.stations.map((s) => s.slug)).toEqual([
      "quadratics",
      "combining-functions",
      "geometry-of-equations",
      "circles",
      "thinking-about-geometry",
      "introducing-calculus",
      "product-rule",
      "chain-rule",
      "trigonometry-triangles-to-functions",
      "trigonometry-compound-angles",
      // introducing-calculus appears once per lane block: lane 4 swept it for
      // its strand, lane 5 carries the stray r7912 whose tested skill is 1.5.x
      "introducing-calculus",
      "exp-and-log",
    ]);
  });

  test("fleet census (merged serve): 264 bodies, 201 aligned, 63 non-overlaps, 262 rows", () => {
    expect(bundle.resources.length).toBe(264);
    expect(bundle.coverage.aligned).toBe(201);
    expect(bundle.coverage.nonOverlap).toBe(63);
    expect(bundle.coverage.candidateRows).toBe(262);
    expect(bundle.coverage.ugmResourcesConsidered).toBe(264);
    // the cross-lane joins of record: lane 4's 14 circles-strand alignments
    // + 2 cross-lane non-overlap confirmations against lane-3 bodies, and
    // lane 5's 2 trigonometry fact joins (r9924/r8411) against lane-2 bodies
    expect(bundle.coverage.crossLaneJoined).toEqual({
      aligned: 16,
      nonOverlap: 2,
    });
  });

  test("per-station census matches the enrichments of record", () => {
    // lane 1 quadratics (#55/#58): 59 considered, 56 aligned, 3 non-overlap
    expect(byStation("quadratics").length).toBe(59);
    // lane 2 functions (PR #61): 38 considered, 27 aligned, 11 non-overlap
    expect(byStation("combining-functions").length).toBe(38);
    // lane 3 coordinate geometry (PR #66): the two-station split of record
    expect(byStation("geometry-of-equations").length).toBe(38);
    expect(byStation("circles").length).toBe(47);
    // lane 4 circular measure (PR #74): the strand lane's new-text subset
    expect(byStation("thinking-about-geometry").length).toBe(1);
    expect(byStation("introducing-calculus").length).toBe(2); // lane-4 strand + lane-5 stray r7912
    expect(byStation("product-rule").length).toBe(1);
    expect(byStation("chain-rule").length).toBe(2);
    // lane 5 trigonometry (PR #79): the whole two-station substrate of record
    expect(byStation("trigonometry-triangles-to-functions").length).toBe(48);
    expect(byStation("trigonometry-compound-angles").length).toBe(27);
    expect(byStation("exp-and-log").length).toBe(1); // stray r7184
  });

  test("coverage.lanes carries the five lane keys incl. the two-station trigonometry lane", () => {
    expect(bundle.coverage.lanes.map((l) => l.station)).toEqual([
      "quadratics",
      "combining-functions",
      "coordinate-geometry",
      "circular-measure",
      "trigonometry",
    ]);
    const lane3 = bundle.coverage.lanes[2];
    expect(lane3.stationTitle).toBe("Coordinate Geometry");
    expect(lane3.aligned).toBe(61);
    expect(lane3.nonOverlap).toBe(24);
    expect(lane3.candidateRows).toBe(77);
    const lane4 = bundle.coverage.lanes[3];
    expect(lane4.stationTitle).toBe("Circular Measure");
    // the enrichment-of-record census (hub-facing new-text subset), NOT the
    // merged-serve numbers — the cross-lane join is recorded on the block
    expect(lane4.aligned).toBe(3);
    expect(lane4.nonOverlap).toBe(2);
    expect(lane4.candidateRows).toBe(3);
    expect((lane4 as unknown as { crossLaneAligned?: number }).crossLaneAligned).toBe(14);
    expect((lane4 as unknown as { crossLaneNonOverlap?: number }).crossLaneNonOverlap).toBe(2);
    const lane5 = bundle.coverage.lanes[4];
    expect(lane5.stationTitle).toBe("Trigonometry");
    // the enrichment-of-record census is the two-station substrate (75 =
    // 48 TTF + 27 TCA); the 2 cross-station strays ride stationBreakdown
    expect(lane5.ugmResourcesConsidered).toBe(75);
    expect(lane5.aligned).toBe(39);
    expect(lane5.nonOverlap).toBe(36);
    expect(lane5.candidateRows).toBe(55);
    expect((lane5 as unknown as { crossLaneAligned?: number }).crossLaneAligned).toBe(2);
    expect((lane5 as unknown as { crossLaneNonOverlap?: number }).crossLaneNonOverlap).toBe(0);
  });

  test("spec points: 18 codes across 1.1.x / 1.2.x / folded 1.3.x / folded 1.4.x / 1.5.x", () => {
    expect(bundle.coverage.specPointsCovered).toEqual([
      "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5",
      "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2",
      "1.4.1",
      "1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5",
    ]);
    // the fold law: hub-spine parse fragments 1.3.1a/1.3.2a/1.4.1a stay folded
    // into the parent codes — no .a rows in the bundle
    expect(bundle.coverage.specPointsCovered.some((c) => c.endsWith("a"))).toBe(false);
    expect(bundle.specPoints.find((s) => s.code === "1.3.1")?.ugmIds.length).toBe(17);
    expect(bundle.specPoints.find((s) => s.code === "1.3.2")?.ugmIds.length).toBe(60);
  });
});

describe("the lane-4 cross-lane join (strand lane served against existing bodies)", () => {
  const sp141 = bundle.specPoints.find((s) => s.code === "1.4.1")!;

  test("1.4.1 serves 17 resources (3 new-text + 14 cross-lane) with primaryPick r5534", () => {
    expect(sp141.ugmIds.length).toBe(17);
    expect(sp141.resourceCount).toBe(17);
    expect(sp141.primaryPick).toBe("r5534");
    const r5534 = bundle.resources.find((r) => r.ugmId === "r5534")!;
    expect(r5534.station).toBe("thinking-about-geometry");
    expect(r5534.specPoints.find((s) => s.code === "1.4.1")?.primaryPick).toBe(true);
  });

  test("every 1.4.1 ugmId resolves to a resource body (first-of-record wins)", () => {
    for (const id of sp141.ugmIds) {
      expect(bundle.resources.some((r) => r.ugmId === id)).toBe(true);
    }
  });

  test("the circles-strand flips of record: belt aligned to 1.4.1, lane-3 reason retained", () => {
    const belt = bundle.resources.find((r) => r.ugmId === "belt")!;
    expect(belt.nonOverlap).toBe(false);
    expect(belt.specPoints.map((s) => s.code)).toEqual(["1.4.1"]);
    expect(belt.nonOverlapReason).toBeDefined();
    const r9423 = bundle.resources.find((r) => r.ugmId === "r9423")!;
    expect(r9423.nonOverlap).toBe(false);
    expect(r9423.specPoints.map((s) => s.code)).toEqual(["1.4.1"]);
  });

  test("one-to-many extensions: r8946/r9386 keep 1.3.2 and gain 1.4.1", () => {
    for (const id of ["r8946", "r9386"]) {
      const r = bundle.resources.find((x) => x.ugmId === id)!;
      expect(r.specPoints.map((s) => s.code)).toEqual(["1.3.2", "1.4.1"]);
      expect(r.nonOverlap).toBe(false);
    }
  });

  test("cross-lane non-overlaps stay non-overlaps (cones, cutting-spheres)", () => {
    for (const id of ["cones", "cutting-spheres"]) {
      const r = bundle.resources.find((x) => x.ugmId === id)!;
      expect(r.nonOverlap).toBe(true);
      expect(r.specPoints.length).toBe(0);
      expect(r.nonOverlapReason).toBeDefined();
    }
  });
});

describe("the lane-5 cross-lane join (trigonometry facts served against lane-2 bodies)", () => {
  const sp154 = bundle.specPoints.find((s) => s.code === "1.5.4")!;

  test("1.5.4 serves 14 resources (12 new-text + 2 cross-lane) with primaryPick r5269", () => {
    expect(sp154.ugmIds.length).toBe(14);
    expect(sp154.resourceCount).toBe(14);
    expect(sp154.primaryPick).toBe("r5269");
    const r5269 = bundle.resources.find((r) => r.ugmId === "r5269")!;
    expect(r5269.station).toBe("trigonometry-triangles-to-functions");
    expect(r5269.specPoints.find((s) => s.code === "1.5.4")?.primaryPick).toBe(true);
  });

  test("every 1.5.x ugmId resolves to a resource body (first-of-record wins)", () => {
    for (const code of ["1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5"]) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      for (const id of sp.ugmIds) {
        expect(bundle.resources.some((r) => r.ugmId === id)).toBe(true);
      }
    }
  });

  test("the flip of record: lane-2 non-overlap r9924 aligns under 1.5.4, lane-2 reason retained", () => {
    const r9924 = bundle.resources.find((r) => r.ugmId === "r9924")!;
    expect(r9924.station).toBe("combining-functions");
    expect(r9924.nonOverlap).toBe(false);
    expect(r9924.specPoints.map((s) => s.code)).toEqual(["1.5.4"]);
    expect(r9924.nonOverlapReason).toBeDefined();
  });

  test("one-to-many extension: r8411 keeps 1.2.2 and gains 1.5.4", () => {
    const r8411 = bundle.resources.find((r) => r.ugmId === "r8411")!;
    expect(r8411.specPoints.map((s) => s.code)).toEqual(["1.2.2", "1.5.4"]);
    expect(r8411.nonOverlap).toBe(false);
  });

  test("the 36 recorded non-overlaps stay unmapped (compound-angles P3 2.3 honesty)", () => {
    const tca = bundle.resources.filter((r) => r.station === "trigonometry-compound-angles");
    expect(tca.filter((r) => r.nonOverlap).length).toBe(24);
    for (const r of tca.filter((x) => x.nonOverlap)) {
      expect(r.specPoints.length).toBe(0);
    }
  });

  test("lane-5 primary picks of record (per spec point)", () => {
    const picks: Record<string, string> = {
      "1.5.1": "going-round-in-circles",
      "1.5.2": "trig-tables",
      "1.5.3": "inverse-or-not",
      "1.5.5": "r6138",
    };
    for (const [code, pick] of Object.entries(picks)) {
      expect(bundle.specPoints.find((s) => s.code === code)?.primaryPick).toBe(pick);
    }
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
