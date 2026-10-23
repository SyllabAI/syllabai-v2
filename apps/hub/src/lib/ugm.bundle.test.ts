/**
 * T-UGM-HUB-CONSUME-3/-4/-5/-6 — the committed UGM bundle regression law.
 *
 * The bundle is committed data; the reader (ugm.ts) fail-closes on schema
 * drift. These tests pin BOTH planes against the shipped file, so a bad
 * regen (importer census drift, schema drift, coverage manufacturing)
 * fails here before it can reach a flagged surface:
 *
 *   - the committed bundle parses under the exact Zod schema the reader uses
 *   - the lane census of record (lanes 1-6; lane 3 = the first multi-station
 *     lane, lane 4 = the first STRAND lane: Circular measure drawn from four
 *     stations' sweeps, with its circles-strand mappings CROSS-LANE JOINED
 *     against the lane-3 bodies of record; lane 5 = the second two-station
 *     lane: Trigonometry's WHOLE substrate as text of record — 41 mapped +
 *     36 recorded non-overlaps imported unmapped — plus two cross-lane fact
 *     joins against the lane-2 bodies — no new entries, no body duplication,
 *     first-of-record body wins; lane 6 = the THIRD two-station lane:
 *     Series' whole two-station substrate as text of record — Sequences +
 *     Counting & Binomials, 49 mapped (43 substrate + 6 strays) + 50 recorded
 *     non-overlaps imported unmapped (the counting station is
 *     combinatorics/logic-dominated around a binomial core) — plus two
 *     cross-lane fact joins against the lane-2 bodies)
 *   - the honesty invariants: unique ids, non-overlaps carry reasons and no
 *     spec points, aligned resources carry spec points, primaryPick
 *     membership, per-body delimiter balance (renderer contract)
 *
 * Corpus of record: SyllabAI/syllabai-resources main@bcc36476 (PR #89) under
 * ADR-UGM-0001 as amended 2026-10-23 + the operator attestation of 2026-10-23.
 * Per-lane coverage blocks carry the enrichments-of-record censuses; the
 * FLEET census reflects the merged serve after the lane-4/5/6 cross-lane
 * joins (12 lane-3 non-overlaps flip to aligned under 1.4.1; lane 5's r9924
 * flips its lane-2 non-overlap of record under 1.5.4 while r8411 gains a
 * second spec row; lane 6's r7553/r9527 — both lane-2 ALIGNED of record —
 * gain one-to-many 1.6.3 rows; 113 non-overlaps remain).
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
      "main@bcc36476c3ee207f8e7ea77904e490f6fdbc0cd6",
    );
    expect(bundle.source.repo).toBe("SyllabAI/syllabai-resources");
    expect(bundle.rights.textOnly).toBe(true);
    expect(bundle.reviewState.state).toBe("SUGGESTED");
  });
});

describe("the lane census of record (6 lanes / 20 stations / 22 spec points)", () => {
  test("stations: the single-station lanes, the multi-station, strand and two-station lanes, and the eight-station series lane", () => {
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
      // lane 6 (series): the two dedicated stations + six cross-station strays
      "sequences",
      "counting-and-binomials",
      "chain-rule",
      "thinking-about-algebra",
      "divisibility-and-induction",
      "exp-and-log",
      "introducing-calculus",
      "product-rule",
    ]);
  });

  test("fleet census (merged serve): 363 bodies, 250 aligned, 113 non-overlaps, 320 rows", () => {
    expect(bundle.resources.length).toBe(363);
    expect(bundle.coverage.aligned).toBe(250);
    expect(bundle.coverage.nonOverlap).toBe(113);
    expect(bundle.coverage.candidateRows).toBe(320);
    expect(bundle.coverage.ugmResourcesConsidered).toBe(363);
    // the cross-lane joins of record: lane 4's 14 circles-strand alignments
    // + 2 cross-lane non-overlap confirmations against lane-3 bodies, lane
    // 5's 2 trigonometry fact joins (r9924/r8411) and lane 6's 2 series fact
    // joins (r7553/r9527) against lane-2 bodies
    expect(bundle.coverage.crossLaneJoined).toEqual({
      aligned: 18,
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
    expect(byStation("introducing-calculus").length).toBe(3); // lane-4 strand + lane-5 stray r7912 + lane-6 stray r6592
    expect(byStation("product-rule").length).toBe(2); // lane-4 strand + lane-6 stray r9312
    expect(byStation("chain-rule").length).toBe(3); // lane-4 strand x2 + lane-6 stray r5640
    // lane 5 trigonometry (PR #79): the whole two-station substrate of record
    expect(byStation("trigonometry-triangles-to-functions").length).toBe(48);
    expect(byStation("trigonometry-compound-angles").length).toBe(27);
    expect(byStation("exp-and-log").length).toBe(2); // stray r7184 + lane-6 stray r8260
    // lane 6 series (PR #89): the whole two-station substrate of record
    expect(byStation("sequences").length).toBe(42);
    expect(byStation("counting-and-binomials").length).toBe(51);
    expect(byStation("thinking-about-algebra").length).toBe(1); // stray r9404
    expect(byStation("divisibility-and-induction").length).toBe(1); // stray r9916
  });

  test("coverage.lanes carries the six lane keys incl. the two-station trigonometry and series lanes", () => {
    expect(bundle.coverage.lanes.map((l) => l.station)).toEqual([
      "quadratics",
      "combining-functions",
      "coordinate-geometry",
      "circular-measure",
      "trigonometry",
      "series",
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
    const lane6 = bundle.coverage.lanes[5];
    expect(lane6.stationTitle).toBe("Series");
    // the enrichment-of-record census is the two-station substrate (93 =
    // 42 Sequences + 51 Counting & Binomials); the 6 cross-station strays
    // ride stationBreakdown
    expect(lane6.ugmResourcesConsidered).toBe(93);
    expect(lane6.aligned).toBe(43);
    expect(lane6.nonOverlap).toBe(50);
    expect(lane6.candidateRows).toBe(56);
    expect((lane6 as unknown as { crossLaneAligned?: number }).crossLaneAligned).toBe(2);
    expect((lane6 as unknown as { crossLaneNonOverlap?: number }).crossLaneNonOverlap).toBe(0);
  });

  test("spec points: 22 codes across 1.1.x / 1.2.x / folded 1.3.x / folded 1.4.x / 1.5.x / 1.6.x", () => {
    expect(bundle.coverage.specPointsCovered).toEqual([
      "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5",
      "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2",
      "1.4.1",
      "1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5",
      "1.6.1", "1.6.2", "1.6.3", "1.6.4",
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

describe("the lane-6 cross-lane join (series facts served against lane-2 bodies)", () => {
  const sp163 = bundle.specPoints.find((s) => s.code === "1.6.3")!;

  test("1.6.3 serves 28 resources (26 new-text + 2 cross-lane) with primaryPick r8907", () => {
    expect(sp163.ugmIds.length).toBe(28);
    expect(sp163.resourceCount).toBe(28);
    expect(sp163.primaryPick).toBe("r8907");
    const r8907 = bundle.resources.find((r) => r.ugmId === "r8907")!;
    expect(r8907.station).toBe("sequences");
    expect(r8907.specPoints.find((s) => s.code === "1.6.3")?.primaryPick).toBe(true);
  });

  test("every 1.6.x ugmId resolves to a resource body (first-of-record wins)", () => {
    for (const code of ["1.6.1", "1.6.2", "1.6.3", "1.6.4"]) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      for (const id of sp.ugmIds) {
        expect(bundle.resources.some((r) => r.ugmId === id)).toBe(true);
      }
    }
  });

  test("one-to-many extensions: r7553 keeps 1.2.2 and gains 1.6.3; r9527 keeps 1.2.2+1.2.1 and gains 1.6.3", () => {
    const r7553 = bundle.resources.find((r) => r.ugmId === "r7553")!;
    expect(r7553.station).toBe("combining-functions");
    expect(r7553.nonOverlap).toBe(false);
    expect(r7553.specPoints.map((s) => s.code)).toEqual(["1.2.2", "1.6.3"]);
    const r9527 = bundle.resources.find((r) => r.ugmId === "r9527")!;
    expect(r9527.station).toBe("combining-functions");
    expect(r9527.nonOverlap).toBe(false);
    expect(r9527.specPoints.map((s) => s.code)).toEqual(["1.2.2", "1.2.1", "1.6.3"]);
  });

  test("the 50 recorded non-overlaps stay unmapped (39 counting + 11 sequences honesty)", () => {
    const cb = bundle.resources.filter((r) => r.station === "counting-and-binomials");
    const sq = bundle.resources.filter((r) => r.station === "sequences");
    expect(cb.filter((r) => r.nonOverlap).length).toBe(39);
    expect(sq.filter((r) => r.nonOverlap).length).toBe(11);
    for (const r of [...cb, ...sq].filter((x) => x.nonOverlap)) {
      expect(r.specPoints.length).toBe(0);
    }
  });

  test("lane-6 primary picks of record (per spec point)", () => {
    const picks: Record<string, string> = {
      "1.6.1": "r7078",
      "1.6.2": "sort-it-out",
      "1.6.4": "square-spirals",
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
