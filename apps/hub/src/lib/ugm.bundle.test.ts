/**
 * T-UGM-HUB-CONSUME-3/-4/-5/-6/-7/-8 — the committed UGM bundle regression law.
 *
 * The bundle is committed data; the reader (ugm.ts) fail-closes on schema
 * drift. These tests pin BOTH planes against the shipped file, so a bad
 * regen (importer census drift, schema drift, coverage manufacturing)
 * fails here before it can reach a flagged surface:
 *
 *   - the committed bundle parses under the exact Zod schema the reader uses
 *   - the lane census of record (lanes 1-8; lane 3 = the first multi-station
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
 *     cross-lane fact joins against the lane-2 bodies; lane 7 = the FOURTH
 *     two-station lane: Differentiation's whole two-station calculus
 *     substrate as text of record — 40 mapped + 32 recorded non-overlaps —
 *     plus five cross-station stray stations and three cross-lane fact
 *     joins; lane 8 = the SECOND STRAND lane: Integration's 10 unrecorded
 *     calculus-family resources as new text with every further 1.8 alignment
 *     CROSS-LANE JOINED against the lane-7 bodies — the first lane whose
 *     pick set is entirely joined text (r8716/r7734/r6067/r9357, pick-flagged
 *     on the crossLaneAligned rows by the T-UGM-MODE1-8 amendment #99))
 *   - the honesty invariants: unique ids, non-overlaps carry reasons and no
 *     spec points, aligned resources carry spec points, primaryPick
 *     membership, per-body delimiter balance (renderer contract)
 *
 * Corpus of record: SyllabAI/syllabai-resources
 * main@8c6339bd115034d2762e6c142256151f9ded3412 (PR #96 + the T-UGM-MODE1-8
 * amendment PR #99) under ADR-UGM-0001 as amended 2026-10-23 + the operator
 * attestation of 2026-10-23. Per-lane coverage blocks carry the
 * enrichments-of-record censuses; the FLEET census reflects the merged serve
 * after the lane-4/5/6/7/8 cross-lane joins (12 lane-3 non-overlaps flip to
 * aligned under 1.4.1; lane 5's r9924 flips its lane-2 non-overlap of record
 * under 1.5.4 while r8411 gains a second spec row; lane 6's r7553/r9527 —
 * both lane-2 ALIGNED of record — gain one-to-many 1.6.3 rows; lane 7's
 * r7115 flips its lane-4 non-overlap of record under 1.7.4 while r8936
 * (lane-4 aligned) and r5640 (lane-6 aligned) gain one-to-many 1.7.x rows;
 * lane 8's 18 integration joins flip 13 of lane 7's 17 integration-dressed
 * Calculus-of-Powers non-overlaps to 1.8.x alignments (reasons retained)
 * while r5768/r7734/r9138/r7386/r7861 gain one-to-many 1.8.x rows beside
 * their standing 1.7 alignments; 131 non-overlaps remain).
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
      "main@8c6339bd115034d2762e6c142256151f9ded3412",
    );
    expect(bundle.source.repo).toBe("SyllabAI/syllabai-resources");
    expect(bundle.rights.textOnly).toBe(true);
    expect(bundle.reviewState.state).toBe("SUGGESTED");
  });
});

describe("the lane census of record (8 lanes / 30 stations / 30 spec points)", () => {
  test("stations: the single-station lanes, the multi-station, strand and two-station lanes, the eight-station series lane, the seven-station differentiation lane and the three-station integration strand", () => {
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
      // lane 7 (differentiation): the two dedicated calculus stations + five
      // cross-station strays whose tested skill is 1.7.x (station reuse by
      // design: introducing-calculus x4, chain-rule x3, product-rule x3)
      "introducing-calculus",
      "calculus-of-powers",
      "chain-rule",
      "calculus-meets-functions",
      "calculus-trig-log",
      "product-rule",
      "power-series",
      // lane 8 (integration): the strand lane's three-station calculus family
      // (station reuse by design: calculus-meets-functions x2, chain-rule x3,
      // product-rule x3)
      "calculus-meets-functions",
      "chain-rule",
      "product-rule",
    ]);
  });

  test("fleet census (merged serve): 479 bodies, 348 aligned, 131 non-overlaps, 459 rows", () => {
    expect(bundle.resources.length).toBe(479);
    expect(bundle.coverage.aligned).toBe(348);
    expect(bundle.coverage.nonOverlap).toBe(131);
    expect(bundle.coverage.candidateRows).toBe(459);
    expect(bundle.coverage.ugmResourcesConsidered).toBe(479);
    // the cross-lane joins of record: lane 4's 14 circles-strand alignments
    // + 2 cross-lane non-overlap confirmations against lane-3 bodies, lane
    // 5's 2 trigonometry fact joins (r9924/r8411) and lane 6's 2 series fact
    // joins (r7553/r9527) against lane-2 bodies, lane 7's 4 differentiation
    // code rows (r5640 → 1.7.2+1.7.4; r7115/r8936 → 1.7.4) against lane-4/6
    // bodies, and lane 8's 18 integration rows against lane-7 bodies
    // (13 flips + 5 one-to-many)
    expect(bundle.coverage.crossLaneJoined).toEqual({
      aligned: 40,
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
    expect(byStation("introducing-calculus").length).toBe(27); // lane-4 strand + lane-5 stray r7912 + lane-6 stray r6592 + lane-7 substrate 24
    // lane 5 trigonometry (PR #79): the whole two-station substrate of record
    expect(byStation("trigonometry-triangles-to-functions").length).toBe(48);
    expect(byStation("trigonometry-compound-angles").length).toBe(27);
    expect(byStation("exp-and-log").length).toBe(2); // stray r7184 + lane-6 stray r8260
    // lane 6 series (PR #89): the whole two-station substrate of record
    expect(byStation("sequences").length).toBe(42);
    expect(byStation("counting-and-binomials").length).toBe(51);
    expect(byStation("thinking-about-algebra").length).toBe(1); // stray r9404
    expect(byStation("divisibility-and-induction").length).toBe(1); // stray r9916
    // lane 7 differentiation (PR #91): the whole two-station calculus
    // substrate + the five stray stations of record
    expect(byStation("calculus-of-powers").length).toBe(48);
    expect(byStation("calculus-meets-functions").length).toBe(30); // lane-7 strays + lane-8 strand x7
    expect(byStation("calculus-trig-log").length).toBe(1); // lane-7 stray
    expect(byStation("power-series").length).toBe(1); // lane-7 stray
    // lane 8 integration (PR #96): the strand lane's new-text subsets ride
    // the front-matter stations (7 CMF + 2 chain-rule + 1 product-rule)
    expect(byStation("chain-rule").length).toBe(12); // lane-4 x2 + lane-6 stray + lane-7 strays x7 + lane-8 x2
    expect(byStation("product-rule").length).toBe(5); // lane-4 + lane-6 stray + lane-7 strays x2 + lane-8 x1
  });

  test("coverage.lanes carries the eight lane keys incl. the two-station trigonometry, series and differentiation lanes and the integration strand", () => {
    expect(bundle.coverage.lanes.map((l) => l.station)).toEqual([
      "quadratics",
      "combining-functions",
      "coordinate-geometry",
      "circular-measure",
      "trigonometry",
      "series",
      "differentiation",
      "integration",
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
    const lane7 = bundle.coverage.lanes[6];
    expect(lane7.stationTitle).toBe("Differentiation");
    // the enrichment-of-record census is the two-station substrate (72 =
    // 24 Introducing Calculus + 48 Calculus of Powers, the 3 already-of-record
    // IC resources excluded); the 34 cross-station strays ride stationBreakdown
    expect(lane7.ugmResourcesConsidered).toBe(72);
    expect(lane7.aligned).toBe(40);
    expect(lane7.nonOverlap).toBe(32);
    expect(lane7.candidateRows).toBe(107);
    expect((lane7 as unknown as { crossLaneAligned?: number }).crossLaneAligned).toBe(3);
    expect((lane7 as unknown as { crossLaneNonOverlap?: number }).crossLaneNonOverlap).toBe(0);
    const lane8 = bundle.coverage.lanes[7];
    expect(lane8.stationTitle).toBe("Integration");
    // the strand-lane enrichment-of-record census: the 10 new-text
    // calculus-family resources (7 CMF + 2 chain-rule + 1 product-rule),
    // 0 new non-overlaps; the 18 cross-lane joins are recorded on the block
    expect(lane8.ugmResourcesConsidered).toBe(10);
    expect(lane8.aligned).toBe(28);
    expect(lane8.nonOverlap).toBe(0);
    expect(lane8.candidateRows).toBe(28);
    expect((lane8 as unknown as { crossLaneAligned?: number }).crossLaneAligned).toBe(18);
    expect((lane8 as unknown as { crossLaneNonOverlap?: number }).crossLaneNonOverlap).toBe(0);
  });

  test("spec points: 30 codes across 1.1.x / 1.2.x / folded 1.3.x / folded 1.4.x / 1.5.x / 1.6.x / 1.7.x / 1.8.x", () => {
    expect(bundle.coverage.specPointsCovered).toEqual([
      "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5",
      "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
      "1.3.1", "1.3.2",
      "1.4.1",
      "1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5",
      "1.6.1", "1.6.2", "1.6.3", "1.6.4",
      "1.7.1", "1.7.2", "1.7.3", "1.7.4",
      "1.8.1", "1.8.2", "1.8.3", "1.8.4",
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

describe("the lane-7 cross-lane join (differentiation facts served against earlier-lane bodies)", () => {
  test("1.7.x serves 111 rows (107 new-text + 4 cross-lane) with the picks of record", () => {
    const counts: Record<string, number> = {
      "1.7.1": 5,
      "1.7.2": 39, // 38 new-text + cross-lane r5640
      "1.7.3": 29,
      "1.7.4": 38, // 35 new-text + cross-lane r5640/r7115/r8936
    };
    const picks: Record<string, string> = {
      "1.7.1": "binomials-are-the-answer",
      "1.7.2": "r9942",
      "1.7.3": "r8065",
      "1.7.4": "r9260",
    };
    for (const [code, n] of Object.entries(counts)) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      expect(sp.ugmIds.length).toBe(n);
      expect(sp.resourceCount).toBe(n);
      expect(sp.primaryPick).toBe(picks[code]);
    }
    const pick = bundle.resources.find((r) => r.ugmId === "binomials-are-the-answer")!;
    expect(pick.station).toBe("calculus-of-powers");
    expect(pick.specPoints.find((s) => s.code === "1.7.1")?.primaryPick).toBe(true);
  });

  test("every 1.7.x ugmId resolves to a resource body (first-of-record wins)", () => {
    for (const code of ["1.7.1", "1.7.2", "1.7.3", "1.7.4"]) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      for (const id of sp.ugmIds) {
        expect(bundle.resources.some((r) => r.ugmId === id)).toBe(true);
      }
    }
  });

  test("one-to-many extensions of record: r5640 keeps 1.6.1 and gains 1.7.2+1.7.4; r8936 keeps 1.4.1 and gains 1.7.4", () => {
    const r5640 = bundle.resources.find((r) => r.ugmId === "r5640")!;
    expect(r5640.station).toBe("chain-rule");
    expect(r5640.nonOverlap).toBe(false);
    expect(r5640.specPoints.map((s) => s.code)).toEqual(["1.6.1", "1.7.2", "1.7.4"]);
    const r8936 = bundle.resources.find((r) => r.ugmId === "r8936")!;
    expect(r8936.station).toBe("product-rule");
    expect(r8936.nonOverlap).toBe(false);
    expect(r8936.specPoints.map((s) => s.code)).toEqual(["1.4.1", "1.7.4"]);
  });

  test("the flip of record: lane-4 non-overlap r7115 aligns under 1.7.4, lane-4 reason retained", () => {
    const r7115 = bundle.resources.find((r) => r.ugmId === "r7115")!;
    expect(r7115.station).toBe("chain-rule");
    expect(r7115.nonOverlap).toBe(false);
    expect(r7115.specPoints.map((s) => s.code)).toEqual(["1.7.4"]);
    expect(r7115.nonOverlapReason).toBeDefined();
  });

  test("the recorded non-overlaps stay unmapped (15 trapezium-rule/kinematics + the 4 integration-dressed survivors)", () => {
    const ic = bundle.resources.filter((r) => r.station === "introducing-calculus");
    const cop = bundle.resources.filter((r) => r.station === "calculus-of-powers");
    expect(ic.filter((r) => r.nonOverlap).length).toBe(15);
    // lane 7 recorded 17 integration-dressed non-overlaps; lane 8's strand
    // join flipped 13 of them to 1.8.x alignments (reasons retained), so 4
    // survive unmapped of record (calculus-of-variations, queen-dido,
    // r7724, r8931)
    expect(cop.filter((r) => r.nonOverlap).length).toBe(4);
    for (const r of [...ic, ...cop].filter((x) => x.nonOverlap)) {
      expect(r.specPoints.length).toBe(0);
    }
  });
});

describe("the lane-8 cross-lane join (integration facts served against lane-7 bodies)", () => {
  test("1.8.x serves 28 rows (10 new-text + 18 cross-lane) with the first all-cross-lane pick set", () => {
    const counts: Record<string, number> = {
      "1.8.1": 2,
      "1.8.2": 4,
      "1.8.3": 10,
      "1.8.4": 12,
    };
    const picks: Record<string, string> = {
      "1.8.1": "r8716",
      "1.8.2": "r7734",
      "1.8.3": "r6067",
      "1.8.4": "r9357",
    };
    for (const [code, n] of Object.entries(counts)) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      expect(sp.ugmIds.length).toBe(n);
      expect(sp.resourceCount).toBe(n);
      expect(sp.primaryPick).toBe(picks[code]);
    }
    // the T-UGM-MODE1-8 amendment (#99) law: all four picks ride the
    // cross-lane join, so the RESOURCE rows must carry the pick flags
    // themselves — the parity the honesty invariant below requires
    for (const [code, pick] of Object.entries(picks)) {
      const r = bundle.resources.find((x) => x.ugmId === pick)!;
      expect(r.station).toBe("calculus-of-powers");
      expect(r.specPoints.find((s) => s.code === code)?.primaryPick).toBe(true);
    }
  });

  test("every 1.8.x ugmId resolves to a resource body (first-of-record wins)", () => {
    for (const code of ["1.8.1", "1.8.2", "1.8.3", "1.8.4"]) {
      const sp = bundle.specPoints.find((s) => s.code === code)!;
      for (const id of sp.ugmIds) {
        expect(bundle.resources.some((r) => r.ugmId === id)).toBe(true);
      }
    }
  });

  test("the 13 flips of record: lane-7 integration-dressed non-overlaps align under 1.8.x, reasons retained", () => {
    for (const id of [
      "integral-chasing", "meaningful-areas", "r5007", "r5584", "r6067",
      "r6372", "r7236", "r7444", "r7628", "r8350", "r8716", "r9357",
      "stretch-the-function",
    ]) {
      const r = bundle.resources.find((x) => x.ugmId === id)!;
      expect(r.station).toBe("calculus-of-powers");
      expect(r.nonOverlap).toBe(false);
      expect(r.nonOverlapReason).toBeDefined();
      expect(r.specPoints.length).toBe(1);
      expect(r.specPoints[0].code).toMatch(/^1\.8\./);
    }
  });

  test("one-to-many extensions of record: the five standing-1.7 alignments gain 1.8.x rows", () => {
    const expected: Record<string, string[]> = {
      r5768: ["1.7.4", "1.8.2"],
      r7734: ["1.7.3", "1.8.2"],
      r9138: ["1.7.3", "1.8.4"],
      r7386: ["1.7.2", "1.7.4", "1.8.4"],
      r7861: ["1.7.4", "1.8.4"],
    };
    for (const [id, codes] of Object.entries(expected)) {
      const r = bundle.resources.find((x) => x.ugmId === id)!;
      expect(r.specPoints.map((s) => s.code)).toEqual(codes);
      expect(r.nonOverlap).toBe(false);
    }
  });

  test("the lane-8 new-text strand: 10 mapped bodies (7 CMF + 2 chain-rule + 1 product-rule), 0 non-overlaps", () => {
    const newtext: Record<string, string> = {
      "additional-integrals": "calculus-meets-functions",
      r5090: "calculus-meets-functions",
      r5549: "calculus-meets-functions",
      r8105: "calculus-meets-functions",
      r8130: "calculus-meets-functions",
      "thinking-constantly": "calculus-meets-functions",
      "what-else-do-you-know": "calculus-meets-functions",
      r9701: "chain-rule",
      "slippery-areas": "chain-rule",
      r7410: "product-rule",
    };
    for (const [id, station] of Object.entries(newtext)) {
      const r = bundle.resources.find((x) => x.ugmId === id)!;
      expect(r.station).toBe(station);
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBe(1);
      expect(r.specPoints[0].code).toMatch(/^1\.8\./);
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
