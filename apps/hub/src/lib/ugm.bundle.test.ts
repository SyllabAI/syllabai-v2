/**
 * T-UGM-HUB-CONSUME-3/-4/-5/-6/-7/-8/-8a — the committed UGM bundle regression law.
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
 * main@ac1fc90b09008ee8d2eb1aff6892a9f2cb05f594 (PR #96 + the T-UGM-MODE1-8
 * amendment PR #99 + the T-UGM-ASSETS-1 image-plane PR #107 + its integrity
 * manifest 0b976cc) for the pure-1 bundle; the PURE-3 bundle (below) pins
 * main@bb78ae371da1a2d0f5c166e82899e828b1208b4d (lane 9, corpus PR #114 +
 * lane 10, corpus PR #119 + the T-UGM-MODE1-10 stationScope amendment
 * 2f31fcad + lane 11, corpus PR #126 + lane 12, corpus PR #134 + the two
 * T-UGM-MODE1-12 amendments of record). Under
 * ADR-UGM-0001 as amended 2026-10-23 + the operator attestations of
 * 2026-10-23 (text) and 2026-10-24 (static figures). Per-lane coverage blocks
 * carry the
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
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
      "main@ac1fc90b09008ee8d2eb1aff6892a9f2cb05f594",
    );
    expect(bundle.source.repo).toBe("SyllabAI/syllabai-resources");
    // T-UGM-HUB-CONSUME-8a: the image plane landed (corpus PR #107) —
    // textOnly flips to false under the 2026-10-24 attestation
    expect(bundle.rights.textOnly).toBe(false);
    expect(bundle.source.operatorAttestation).toMatch(/2026-10-24/);
    expect(bundle.source.figureMap).toBe("UGM-Resources/figures-map.json");
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

  test("primaryPick: each spec point's pick is among its rows; pick flags ride distinct codes (the T-UGM-MODE1-9 two-code law allows a two-code resource to be the pick of BOTH codes — pure-1's of-record shape stays ≤1)", () => {
    const pickCount = new Map<string, number>();
    for (const sp of bundle.specPoints) {
      expect(sp.primaryPick).not.toBeNull(); // schema 1.2: no honest-gap spec point on the 1.1-shaped pure-1 plane
      expect(sp.ugmIds).toContain(sp.primaryPick!);
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
    }
    for (const r of bundle.resources) {
      const codes = r.specPoints.filter((s) => s.primaryPick).map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
      if (codes.length > 0) pickCount.set(r.ugmId, codes.length);
      // pure-1 of-record shape: no two-code picks exist on this plane
      expect(codes.length).toBeLessThanOrEqual(1);
    }
    // every declared spec-point primaryPick resolves to a resource that knows it
    // (schema 1.2: a null pick is the honest-gap shape — impossible on this
    // 1.1-shaped plane, asserted explicitly)
    for (const sp of bundle.specPoints) {
      expect(sp.primaryPick).not.toBeNull();
      expect(pickCount.has(sp.primaryPick!)).toBe(true);
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

describe("the image plane (T-UGM-HUB-CONSUME-8a / T-UGM-ASSETS-1, corpus PR #107)", () => {
  test("fleet figure census matches the corpus map of record", () => {
    expect(bundle.coverage.figures).toEqual({
      figureRefs: 1233,
      resources: 275,
      uniqueAssets: 976,
      inlineRewritten: 282,
    });
    const withFigures = bundle.resources.filter((r) => r.figures > 0);
    expect(withFigures.length).toBe(275);
    const refs = bundle.resources.reduce((n, r) => n + r.figures, 0);
    expect(refs).toBe(1233);
    // T-UGM-HUB-CONSUME-8b: 282 of them render inline at the converter's
    // position-accurate placeholder spots, 951 stay section-anchored
    const inline = bundle.resources.reduce((n, r) => n + (r.figuresInline ?? 0), 0);
    expect(inline).toBe(282);
  });

  test("every injected /ugm-assets/ ref resolves to a committed public/ugm-assets file", () => {
    const pubDir = join(import.meta.dir, "../../public/ugm-assets");
    const have = new Set<string>();
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else have.add(p);
      }
    };
    walk(pubDir);
    const refRe = /\/ugm-assets\/([A-Za-z0-9_\-.\/]+\.(?:png|svg|jpe?g|gif))/g;
    let checked = 0;
    for (const r of bundle.resources) {
      for (const m of r.bodyMd.matchAll(refRe)) {
        expect(have.has(join(pubDir, m[1]))).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(1233);
  });

  test("injection is section-anchored: walk-sorting carries its 32 figures inside their sections", () => {
    const r = bundle.resources.find((x) => x.ugmId === "walk-sorting")!;
    expect(r.figures).toBe(32);
    const refRe = /\/ugm-assets\//g;
    expect((r.bodyMd.match(refRe) ?? []).length).toBe(32);
    // every ref sits AFTER its own section heading and BEFORE the next one:
    // walk the body, track the current section, refs never precede their sec
    const lines = r.bodyMd.split("\n");
    let current = "";
    for (const line of lines) {
      const h = line.match(/^## (.+)$/);
      if (h) current = h[1].trim();
      if (line.includes("/ugm-assets/")) expect(current.length).toBeGreaterThan(0);
    }
  });

  test("resources without figures are byte-shaped as before (figures=0, no injected refs)", () => {
    const noFigs = bundle.resources.filter((r) => r.figures === 0);
    expect(noFigs.length).toBe(204);
    for (const r of noFigs) expect(r.bodyMd).not.toContain("/ugm-assets/");
  });
});

describe("prose figure localization (T-UGM-HUB-CONSUME-8b, 'Localize them')", () => {
  const PLACEHOLDER_RE =
    /(?:>\s*)?\[figure:\s*(.*?)\s*—\s*`([^`]+)`\]\s*\(([^)]*)\)(\.)?/g;
  const UGM_IMG =
    /^https?:\/\/(?:www\.)?undergroundmathematics\.org\/.*\.(?:png|jpe?g|gif|svg|webp)$/i;

  test("zero un-localized image placeholders remain in any served body", () => {
    let residue = 0;
    for (const r of bundle.resources) {
      for (const m of r.bodyMd.matchAll(PLACEHOLDER_RE)) {
        if (UGM_IMG.test(m[2])) residue++;
      }
    }
    expect(residue).toBe(0);
    // and no /ugm-assets/ ref may still sit inside a blockquote wrapper
    for (const r of bundle.resources) {
      expect(/^\s*>[^\n]*\/ugm-assets\//m.test(r.bodyMd)).toBe(false);
    }
  });

  test("placeholders render as position-accurate local images (spot checks)", () => {
    // discriminating: the card-sort table cells became a real image grid
    const disc = bundle.resources.find((x) => x.ugmId === "discriminating")!;
    expect(disc.bodyMd).toContain(
      "| ![graph showing y equals minus x squared plus 1](/ugm-assets/quadratics/discriminating/images/q1a.png)",
    );
    expect(disc.figuresInline).toBeGreaterThan(0);
    // which-parabola: the empty-caption placeholder under '## Question' took
    // its placeholder caption; the figure is inline, not a link to ugm
    const wp = bundle.resources.find((x) => x.ugmId === "which-parabola")!;
    expect(wp.bodyMd).toContain(
      "![12 parabolas](/ugm-assets/quadratics/which-parabola/images/parabolalabelledthick.png)",
    );
    // every placeholder-bearing resource carries figuresInline > 0
    const withInline = bundle.resources.filter((r) => (r.figuresInline ?? 0) > 0);
    expect(withInline.length).toBe(54);
  });

  test("no external ugm image links remain in any served body", () => {
    // beyond markdown images, no bare external UGM image URL may survive
    const URL_RE = /https?:\/\/[^\s<>)\]"'`]+/g;
    let hits = 0;
    for (const r of bundle.resources) {
      const stripped = r.bodyMd.replace(/\[[^\]]*\]\([^)]*\)/g, "");
      for (const m of stripped.matchAll(URL_RE)) {
        if (/undergroundmathematics\.org/i.test(m[0]) && /\.(png|jpe?g|gif|svg|webp)$/i.test(m[0])) hits++;
      }
    }
    expect(hits).toBe(0);
  });
});

// ── T-UGM-HUB-CONSUME-9/-10/-11/-12: the pure-3 course plane (lanes 9-12) ──
// The FIRST through FOURTH lanes on a SECOND course plane: CIE 9709 Pure 3
// subtopic 3.1 Algebra (lane 9, spec points 3.1.1–3.1.6, the repaired spine
// rows of record per T-SPECS-CIE-PARSE-REPAIR-1), subtopic 3.2 Logarithmic
// and exponential functions (lane 10, spec points 3.2.1–3.2.4, the verbatim
// spine rows; corpus PR #119 + the T-UGM-MODE1-10 stationScope amendment),
// subtopic 3.3 Trigonometry (lane 11, spec points 3.3.1–3.3.2, corpus PR
// #126 — the first mostly-mapping lane) and subtopic 3.4 Differentiation
// (lane 12, spec points 3.4.1–3.4.3, corpus PR #134 + the two T-UGM-MODE1-12
// amendments of record — the LARGEST FRESH-TEXT LANE SINCE LANE 9: 40 fresh
// bodies 13×3.4.1 / 12×3.4.2 / 15×3.4.3 across the ten scoped stations, the
// single cross-course flip r8931 riding its lane-7 body under
// pure-1-differentiation, 29 non-overlaps by reference with 3 honest
// re-routings of lane-10 bearings, picks r6938/r6530/r8620 all fresh).
// Lane 9 is the candidate-model shape (lane-8 law): no dedicated UGM 'algebra'
// station — the 35 fresh bodies span 15 corpus stations. Lane 10 is the
// dedicated-station-plus-strays shape (the lanes 1-3 shape on the pure-3
// plane): the dedicated Exponentials & Logarithms station (31 fresh of 34)
// plus 3 strays (to-the-limit, r7077, powerful-fractions). 26 lane-10
// non-overlaps ride nonOverlapRows with bodyImported=false (by reference, NO
// text of record — disclosed in coverage, never served); the lane-9
// nonOverlapByReference row to-log-or-not-to-log FLIPS to aligned WITH a
// fresh lane-10 body under 3.2.3 (the CONSUME-10 supersede law drops its
// stale lane-9 byref row — the bundle never declares a resource body-less
// while serving its body). Lane 11's 23 lane-5-pool flips + lane 12's 18
// supersede drops (its fresh bodies retire the stale lane-9/10/11 byref rows
// whose slugs now carry fresh text) ride the same laws. The 42 cross-lane
// rows are CROSS-COURSE joins against pure-1 bodies (served by reference
// with servedUnder pointers — first-of-record body wins under the pure-1
// bundle, nothing duplicated here). Figure plane: the figures-map of record
// predates all four lanes and the rebuilt converter emits no placeholders,
// so the pure-3 serve ships figures=0 honestly pending a T-UGM-ASSETS-2
// corpus amendment.
// Lane 15 (T-UGM-HUB-CONSUME-15, corpus PR #149, merge b151f65a) is the
// SEVENTH pure-3 lane — 3.7 Vectors, spec points 3.7.1–3.7.7 — the FIRST
// ZERO-JOIN/ZERO-FLIP lane of record:
// 20 aligned rows ALL fresh bodies (vector-geometry 15 + combining-vectors
// 5 — the stations the spec names are the stations the corpus serves from;
// CIE pure-1 carries no vectors, so 3.7 is their first claimant), zero
// cross-lane joins, zero flips, zero cross-course traffic. THE DESIGNED
// HONEST GAP: 3.7.7 is the spec's own exclusion row ('Knowledge of the
// vector product is not required.') and carries zero rows by rule — the
// second honest gap of record after 3.5.4, this time by design. 6
// non-overlap companion disclosures ride nonOverlapByReference (the plane
// class is-it-a-plane/r6006/r9794/r7187 — P3 3.7 is lines-only; r5089
// rejected BY the 3.7.7 exclusion note; r8828 vs the 3.7.5
// common-perpendicular exclusion); the r8456 PROMOTION retires its stale
// lane-3-algebra byref row (the r8013 supersede precedent). The lane's
// stations list is the FULL 21-station sweep closure (the lane-13
// convention) — all 21 already declared, so the unique-station count stays
// 25 while the declared-row count grows 66 → 87. Figure plane unchanged:
// figures=0 honestly.
// Lane 16 (T-UGM-HUB-CONSUME-16, corpus PRs #155 + the #157 amendment, pin
// c8b80c6a) is the EIGHTH pure-3 lane — 3.8 Differential equations, spec
// points 3.8.1–3.8.4 — THE ZERO-FRESH-BODY LANE OF RECORD, the exact
// mirror of lane 15: 2 aligned rows, BOTH cross-course joins by reference
// (r6959 rides its pure-1-differentiation 1.7.3 body; r7410 rides its
// pure-1-integration 1.8.2 body — the lane-9 law), ZERO fresh bodies
// (res_dir NOT created; the importer's zero-fresh law consumes the
// file_count-0 MANIFEST block), ZERO new served resources, ZERO new
// index memberships. The index stays fresh-only with resourceCount 0 /
// ugmIds [] while the PICKS ride the reference rows (the r6018 law — the
// first spec points of record whose picks ride reference rows with an
// EMPTY fresh index). 4 non-overlap companion disclosures (the
// modelling-recognition class picture-the-process-i/ii + the beyond-spec
// separable-DE class weight-pulling + from-parabolas-to-catenaries — the
// LAST of which the supersede law correctly drops from byref: it is
// SERVED by its lane-9 3.1.6 body, so byref lands at 94 + 3 = 97). THE
// CORPUS-BOUNDARY DISCLOSURE: the site's own differential-equations
// station is EMPTY (0 resources, id 11, created 2015-11-04, never
// populated — verified live with a populated-station control). The
// lane's stations list is the FULL 19-station sweep closure — all 19
// already declared, so the unique-station count stays 25 while the
// declared-row count grows 87 → 106. Figure plane unchanged: figures=0
// honestly.
// Lane 17 (T-UGM-HUB-CONSUME-17, corpus PR #168, pin c0d12159) is the
// NINTH and FINAL pure-3 lane — 3.9 Complex numbers — THE CORPUS-BOUNDARY
// LANE OF RECORD and the FIRST ZERO-ALIGNED LANE of record: the UGM site
// never published its complex-numbers substrate — both dedicated stations
// (complex-numbers-faces id 8 / complex-numbers-plane id 9) are post-freeze
// AcademicReview shells with ZERO public resources (re-verified live with a
// populated-station control; all four never-captured stations are empty
// shells), so the corpus is FINAL at 855 resources / 25 stations. The lane
// serves ZERO fresh bodies and ZERO aligned rows of any kind (no joins, no
// flips, no one-to-many — the pure-1 plane carries no complex numbers
// either): every spec point 3.9.1–3.9.8 is an HONEST-EMPTY block (the
// lane-13 honest-gap law applied lane-wide for the first time —
// primaryPick null, ugmIds [], the verbatim spine rows carried; the
// 3.9.1 interleaved-column and 3.9.5 dropped-math-run parse artifacts are
// the spine's, carried verbatim). The ONE companion disclosure rides
// nonOverlapByReference (absurder — the conjugate-pair factorisation aside
// a²+b²=(a+ib)(a−ib) derived from i²=−1; the lane-9 row stands — the
// bundle now carries BOTH rows with their distinct reasons). 43 candidates
// closed exactly = 0 + 1 + 42 (37 prior-home/row closures + 5 fresh
// rejections). The stations list is the FULL 18-station sweep closure —
// all 18 already declared, so the unique-station count stays 25 while the
// declared-row count grows 106 → 124. Figure plane unchanged: figures=0
// honestly.
describe("the pure-3 course plane (T-UGM-HUB-CONSUME-9/-10/-11/-12/-13/-14/-15/-16/-17, lanes 9-17)", () => {
  const B3_PATH = join(
    import.meta.dir,
    "../../content/cie-a-level-maths-20-pure-3/ugm-resources.json",
  );
  const b3 = UgmLaneBundle.parse(JSON.parse(readFileSync(B3_PATH, "utf8")));

  test("schema + the corpus pin of record (post-#168 merge, T-UGM-HUB-CONSUME-17)", () => {
    expect(b3.schema).toBe("syllabai-demo.ugm-lane-resources/1.2"); // 1.2 = the honest-gap law (primaryPick nullable); the pure-1 bundle stays 1.1 — both reader-accepted
    expect(b3.lane).toBe("cie-a-level-maths-20-pure-3");
    expect(b3.source.ref).toBe(
      "main@c0d12159325de18c549a32842ebd72e13f057f53",
    );
    expect(b3.source.enrichment).toEqual([
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-algebra.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-logarithmic-and-exponential-functions.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-trigonometry.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-differentiation.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-integration.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-iteration.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-vectors.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-differential-equations.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-3-complex-numbers.json",
    ]);
    expect(b3.source.resourcesDir).toEqual([
      "UGM-Resources/pure-3-algebra",
      "UGM-Resources/pure-3-logarithmic-and-exponential-functions",
      "UGM-Resources/pure-3-trigonometry",
      "UGM-Resources/pure-3-differentiation",
      "UGM-Resources/pure-3-integration",
      "UGM-Resources/pure-3-iteration",
      "UGM-Resources/pure-3-vectors",
      "UGM-Resources/pure-3-differential-equations", // declared, NOT on disk — the zero-fresh law (file_count 0)
      "UGM-Resources/pure-3-complex-numbers", // declared, NOT on disk — the byref-only law (file_count 0; the corpus-boundary lane)
    ]);
    expect(b3.reviewState.state).toBe("SUGGESTED");
  });

  test("the lanes 9-17 fleet census of record: 149 bodies / 232 rows / 43 spec points / 124 station rows", () => {
    expect(b3.resources.length).toBe(149);
    expect(b3.coverage.aligned).toBe(149); // the served corpus — all 149 bodies aligned (lane 16 adds NONE — the zero-fresh lane)
    expect(b3.coverage.nonOverlap).toBe(0); // served non-overlap bodies: none (by-reference law)
    expect(b3.coverage.candidateRows).toBe(232); // 180 memberships over 149 bodies (unchanged — lane 16 serves no bodies) + 52 cross-course rows (lane-16 adds r6959 + r7410)
    expect(b3.coverage.ugmResourcesConsidered).toBe(149);
    expect(b3.coverage.specPointsCovered).toEqual([
      "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.3.1", "3.3.2",
      "3.4.1", "3.4.2", "3.4.3",
      "3.5.1", "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6",
      "3.6.1", "3.6.2", "3.6.3",
      "3.7.1", "3.7.2", "3.7.3", "3.7.4", "3.7.5", "3.7.6", "3.7.7",
      "3.8.1", "3.8.2", "3.8.3", "3.8.4",
      "3.9.1", "3.9.2", "3.9.3", "3.9.4", "3.9.5", "3.9.6", "3.9.7", "3.9.8",
    ]);
    expect(b3.stations.length).toBe(124); // 15 + 3 + 3 + 10 + 15 + 20 + 21 + 19 + 18 declared rows; lane 17's 18-station sweep closure adds NO new slug (the lane-13 convention: every sweep station was already declared by lanes 9–16)
    expect(new Set(b3.stations.map((s) => s.slug)).size).toBe(25); // unchanged — the corpus-boundary lane claims no new stations (the corpus's 25 populated stations are all of record)
    expect(b3.coverage.lanes.length).toBe(9);
    expect(b3.coverage.lanes[0]).toMatchObject({
      station: "algebra",
      stationTitle: "Algebra",
      ugmResourcesConsidered: 35,
      aligned: 47,
      nonOverlap: 16,
      candidateRows: 47,
      crossLaneAligned: 9,
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[1]).toMatchObject({
      station: "logarithmic-and-exponential-functions",
      stationTitle: "Logarithmic and exponential functions",
      ugmResourcesConsidered: 71, // the lane-10 enrichment's sweep universe of record (71 candidates)
      aligned: 39,
      nonOverlap: 26,
      candidateRows: 39,
      crossLaneAligned: 5,
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[2]).toMatchObject({
      station: "trigonometry",
      stationTitle: "Trigonometry",
      ugmResourcesConsidered: 103, // the lane-11 enrichment's sweep universe of record (103 candidates)
      aligned: 28,
      nonOverlap: 42,
      candidateRows: 28,
      crossLaneAligned: 27,
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[3]).toMatchObject({
      station: "differentiation",
      stationTitle: "Differentiation",
      ugmResourcesConsidered: 189, // the lane-12 enrichment's sweep universe of record (189 candidates)
      aligned: 41,
      nonOverlap: 29,
      candidateRows: 41,
      crossLaneAligned: 1, // the r8931 cross-course flip — the lane's only by-reference aligned row
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[4]).toMatchObject({
      station: "integration",
      stationTitle: "Integration",
      ugmResourcesConsidered: 102, // the lane-13 enrichment's sweep universe of record (102 candidates)
      aligned: 23,
      nonOverlap: 11,
      candidateRows: 35, // 30 fresh memberships over 16 bodies (multi-code law) + 5 cross-course rows
      crossLaneAligned: 7, // 1 flip (circular-slice → 3.5.6/3.5.2) + 6 one-to-many joins beside standing alignments
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[5]).toMatchObject({
      station: "iteration",
      stationTitle: "Numerical solution of equations",
      ugmResourcesConsidered: 48, // the lane-14 enrichment's sweep universe of record (48 candidates)
      aligned: 11,
      nonOverlap: 1,
      candidateRows: 15, // 4 fresh memberships over 3 bodies (staircase-sequences flags twice) + 7 cross-course pairs (5 rider slugs) + 4 same-course pairs (3 rider bodies)
      crossLaneAligned: 8, // 1 flip (r8404 → 3.6.2/3.6.3) + 7 one-to-many joins beside standing alignments
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[6]).toMatchObject({
      station: "vectors",
      stationTitle: "Vectors",
      ugmResourcesConsidered: 136, // the lane-15 enrichment's sweep universe of record (136 candidates)
      aligned: 20,
      nonOverlap: 6,
      candidateRows: 29, // 2/11/5/3/4/4 over 3.7.1–3.7.6 — the zero-join lane: no join codes, no cross-course pairs (the lane-14 shape inverted)
      // no crossLaneAligned key: the FIRST lane of record whose enrichment carries none (zero joins, zero flips)
    });
    expect(b3.coverage.lanes[7]).toMatchObject({
      station: "differential-equations",
      stationTitle: "Differential equations",
      ugmResourcesConsidered: 53, // the lane-16 enrichment's sweep universe of record (53 candidates)
      aligned: 2, // BOTH cross-course joins — the ZERO-FRESH lane of record
      nonOverlap: 4,
      candidateRows: 7, // r6959 ×4 codes + r7410 ×3 codes — all cross-course by reference (the index stays fresh-only: resourceCount 0/ugmIds [])
      crossLaneAligned: 2,
      crossLaneNonOverlap: 0,
    });
    expect(b3.coverage.lanes[8]).toMatchObject({
      station: "complex-numbers",
      stationTitle: "Complex numbers",
      ugmResourcesConsidered: 43, // the lane-17 enrichment's sweep universe of record (43 candidates)
      aligned: 0, // THE FIRST ZERO-ALIGNED LANE of record — the corpus-boundary lane
      nonOverlap: 1, // the absurder companion disclosure
      candidateRows: 0, // the first ZERO-ROW lane the importer serves
      alignedShare: 0.0,
      // no crossLaneAligned key: like lane 15, the enrichment carries none (zero joins, zero flips)
    });
    // the 35 fresh lane-9 bodies by station of record
    const byStation = (slug: string) => b3.resources.filter((r) => r.station === slug);
    expect(byStation("polynomials").length).toBe(26); // lane-9's strays + lane-14's r8711 (the purest sign-change search in the corpus)
    expect(byStation("product-rule").length).toBe(20); // lane-9's 3 + lane-12's 13 + lane-13's 4 fresh
    expect(byStation("thinking-about-functions").length).toBe(2);
    expect(byStation("power-series").length).toBe(2);
    expect(byStation("chain-rule").length).toBe(28); // lane-9's 2 + lane-12's 21 + lane-13's 5 fresh
    expect(byStation("hyperbolic-functions").length).toBe(1);
    // the 34 fresh lane-10 bodies by station of record (dedicated station + strays)
    expect(byStation("exp-and-log").length).toBe(32); // + lane-14's r8013 (the graphical 3^x=3x+2)
    expect(byStation("thinking-about-algebra").length).toBe(2);
    // lane 11's single fresh body: the 3.3.1 pick r7616, a calculus-trig-log
    // stray (the dedicated trigonometry stations ride by-reference rows — the
    // whole-imported lane-5 law)
    expect(byStation("calculus-trig-log").length).toBe(15); // lane-10's to-the-limit + r7616 + lane-12's six strays + lane-13's seven fresh
    expect(byStation("trigonometry-compound-angles").length).toBe(0);
    expect(byStation("trigonometry-triangles-to-functions").length).toBe(0);
    // lane 12's 40 fresh bodies by station of record (chain-rule 21 +
    // product-rule 13 fresh + six calculus-trig-log strays; calculus-of-
    // powers carries NO fresh body — its stationScope aligned row is the
    // r8931 flip, which rides the lane-7 body under pure-1-differentiation)
    expect(byStation("calculus-of-powers").length).toBe(0);
    expect(byStation("calculus-meets-functions").length).toBe(0);
    // lane 15's 20 fresh bodies land ONLY on the two vector stations (the
    // zero-join law — the stations the spec names are the stations the
    // corpus serves from): vector-geometry 15 + combining-vectors 5; the
    // other 19 sweep-closure stations carry zero fresh bodies by design
    expect(byStation("vector-geometry").length).toBe(15); // lane-15's vector-geometry fresh bodies — the station's FIRST served bodies (the zero-join lane)
    expect(byStation("combining-vectors").length).toBe(5); // lane-15's combining-vectors fresh bodies
    // lane 13's 16 fresh bodies land ONLY on the three calculus stations
    // (calculus-trig-log 7 + chain-rule 5 + product-rule 4 — the
    // three-station-plus-strays law): the 12 further scoped stations carry
    // by-reference rows only. THE HONEST GAP: 3.5.4 carries ZERO rows of
    // record corpus-wide (rule 3 — no f'(x)/f(x) resource exists); its
    // spec-point block pins resourceCount 0 + primaryPick null.
    const gap354 = b3.specPoints.find((sp) => sp.code === "3.5.4")!;
    expect(gap354.resourceCount).toBe(0);
    expect(gap354.ugmIds).toEqual([]);
    expect(gap354.primaryPick).toBeNull();
    expect(gap354.officialText).toContain("integrand");
    // lane 14's 3 fresh bodies land on three scattered stations (the
    // scattered-substrate law — polynomials r8711, exp-and-log r8013,
    // thinking-about-numbers staircase-sequences). NO honest gap this lane:
    // 3.6.1/3.6.2/3.6.3 all carry rows (4/2/2 served; the pure-1 riders
    // r5948/r7549/r8231/r9082 ride by reference and stay out of ugmIds).
    expect(byStation("thinking-about-numbers").length).toBe(1); // staircase-sequences, the lane's third fresh body
    const it61 = b3.specPoints.find((sp) => sp.code === "3.6.1")!;
    expect(it61.resourceCount).toBe(4);
    expect(it61.ugmIds).toEqual(["r8013", "r8711", "see-the-power", "to-log-or-not-to-log"]);
    expect(it61.primaryPick).toBe("r8711");
    const it62 = b3.specPoints.find((sp) => sp.code === "3.6.2")!;
    expect(it62.resourceCount).toBe(2);
    expect(it62.primaryPick).toBe("r8404"); // rides its lane-6 body — the r6018 convention, disclosed
    const it63 = b3.specPoints.find((sp) => sp.code === "3.6.3")!;
    expect(it63.resourceCount).toBe(2);
    expect(it63.primaryPick).toBe("r8231"); // rides its lane-3 body — disclosed
    // lane 15's 3.7 blocks of record: THE DESIGNED HONEST GAP — 3.7.7 is
    // the spec's own exclusion row and carries zero rows by rule (the
    // second honest gap of record after 3.5.4, this time by design);
    // 3.7.1–3.7.6 carry 2/11/5/3/4/4 all-fresh rows with fresh picks
    const vec71 = b3.specPoints.find((sp) => sp.code === "3.7.1")!;
    expect(vec71.resourceCount).toBe(2);
    expect(vec71.ugmIds).toEqual(["hit-the-spot", "r9629"]);
    expect(vec71.primaryPick).toBe("hit-the-spot");
    const vec72 = b3.specPoints.find((sp) => sp.code === "3.7.2")!;
    expect(vec72.resourceCount).toBe(11);
    expect(vec72.primaryPick).toBe("r8215");
    const vec73 = b3.specPoints.find((sp) => sp.code === "3.7.3")!;
    expect(vec73.resourceCount).toBe(5);
    expect(vec73.primaryPick).toBe("r9575");
    const vec74 = b3.specPoints.find((sp) => sp.code === "3.7.4")!;
    expect(vec74.resourceCount).toBe(3);
    expect(vec74.primaryPick).toBe("lots-of-vector-lines");
    const vec75 = b3.specPoints.find((sp) => sp.code === "3.7.5")!;
    expect(vec75.resourceCount).toBe(4);
    expect(vec75.primaryPick).toBe("three-lines");
    const vec76 = b3.specPoints.find((sp) => sp.code === "3.7.6")!;
    expect(vec76.resourceCount).toBe(4);
    expect(vec76.ugmIds).toEqual(["r5813", "r6493", "r7272", "r8456"]); // the PROMOTED r8456 rides its fresh lane-15 body
    expect(vec76.primaryPick).toBe("r6493");
    const gap377 = b3.specPoints.find((sp) => sp.code === "3.7.7")!;
    expect(gap377.resourceCount).toBe(0);
    expect(gap377.ugmIds).toEqual([]);
    expect(gap377.primaryPick).toBeNull();
    expect(gap377.officialText).toContain("vector product is not required"); // the spec's own exclusion row — the designed honest gap of record
    // lane 16's 3.8 blocks of record: the ZERO-FRESH shape — resourceCount 0
    // + ugmIds [] (the fresh-only index law) while the PICKS ride the
    // reference rows (the r6018 law; the first spec points whose picks ride
    // reference rows over an EMPTY fresh index — the lane-8 all-cross-pick
    // precedent taken to its honest end)
    const de381 = b3.specPoints.find((sp) => sp.code === "3.8.1")!;
    expect(de381.resourceCount).toBe(0);
    expect(de381.ugmIds).toEqual([]);
    expect(de381.primaryPick).toBe("r6959"); // rides its pure-1-differentiation 1.7.3 body — the r6018 convention
    expect(de381.officialText).toContain("rate of change as a differential equation");
    const de382 = b3.specPoints.find((sp) => sp.code === "3.8.2")!;
    expect(de382.resourceCount).toBe(0);
    expect(de382.primaryPick).toBe("r7410"); // rides its pure-1-integration 1.8.2 body — disclosed
    const de383 = b3.specPoints.find((sp) => sp.code === "3.8.3")!;
    expect(de383.resourceCount).toBe(0);
    expect(de383.primaryPick).toBe("r7410");
    const de384 = b3.specPoints.find((sp) => sp.code === "3.8.4")!;
    expect(de384.resourceCount).toBe(0);
    expect(de384.primaryPick).toBe("r6959");
    expect(de384.officialText).toContain("interpret the solution of a differential equation");
    // lane 17's 3.9 blocks of record: the CORPUS-BOUNDARY shape — ALL EIGHT
    // spec points are honest-empty (the lane-13 honest-gap law applied
    // lane-wide for the first time): resourceCount 0 + ugmIds [] +
    // primaryPick null, NO reference rows either (zero cross-course traffic),
    // the verbatim spine rows carried (the 3.9.1 interleaved-column and
    // 3.9.5 dropped-math-run parse artifacts are the spine's)
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const cn = b3.specPoints.find((sp) => sp.code === `3.9.${i}`)!;
      expect(cn.resourceCount).toBe(0);
      expect(cn.ugmIds).toEqual([]);
      expect(cn.primaryPick).toBeNull();
      expect(cn.officialText!.length).toBeGreaterThan(0);
    }
    expect(b3.specPoints.find((sp) => sp.code === "3.9.1")!.officialText).toContain("understand the idea of a complex number");
    expect(b3.specPoints.find((sp) => sp.code === "3.9.6")!.officialText).toContain("two square roots of a complex number");
    expect(b3.specPoints.find((sp) => sp.code === "3.9.7")!.officialText).toContain("geometrical effects of conjugating");
    const r7616 = b3.resources.find((r) => r.ugmId === "r7616");
    expect(r7616).toBeDefined();
    expect(r7616!.specPoints.map((s) => s.code)).toEqual(["3.3.1", "3.5.1"]); // lane-13's one-to-many join rides the served lane-11 body beside its standing 3.3.1 pick
    expect(r7616!.specPoints[0].primaryPick).toBe(true);
  });

  test("cross-course joins of record: 52 by-reference rows served under pure-1 (31 flips + 28 one-to-many events)", () => {
    expect(b3.coverage.crossLaneJoined).toEqual({ aligned: 63, nonOverlap: 0 }); // 52 cross-course + 11 same-course joins (lane-13's r7616/r8774 + lane-14's r8679/to-log-or-not-to-log/see-the-power joins ride same-course bodies)
    const cc = b3.coverage.crossCourse!;
    expect(cc.aligned).toBe(52);
    expect(cc.nonOverlapRef).toBe(0);
    expect(cc.flips).toBe(31); // lane-9's 5 + lane-11's 23 (the lane-5 pre-baked pool) + lane-12's r8931 + lane-13's circular-slice + lane-14's r8404; lanes 10/15/16 add none (lane-16's joins are one_to_many)
    expect(cc.oneToMany).toBe(28); // lane-9's 4 + lane-10's 5 + lane-11's 4 + lane-13's 6 + lane-14's 7 join events + lane-16's 2 (r6959 + r7410 — the ZERO-FRESH lane's whole aligned set rides reference rows)
    expect(cc.courses).toEqual({ "cie-a-level-maths-20-pure-1": 52 });
    expect(cc.rows.length).toBe(52);
    for (const row of cc.rows) {
      expect(row.servedUnder).toBe("cie-a-level-maths-20-pure-1");
      expect(row.textOfRecordUnder).toMatch(/^UGM-Resources\/pure-1-/);
    }
    const slugs = cc.rows.map((r) => r.ugmSlug).sort();
    expect(slugs).toEqual([
      "circular-slice", "equation-or-identity-ii", "going-round-in-circles",
      "inspecting-identities", "lost-but-lovely-the-haversine", "muddled-trig",
      "proving-half-angle-formulae", "r5113", "r5129", "r5245", "r5362",
      "r5723", "r5948", "r6018", "r6039", "r6120", "r6137", "r6295", "r6340",
      "r6696", "r6807", "r6959", "r7021", "r7050", "r7184", "r7410", "r7477",
      "r7549", "r7581", "r7604", "r7607", "r8231", "r8260", "r8404", "r8427",
      "r8525", "r8557", "r8648", "r8709", "r8931", "r9082", "r9082", "r9312",
      "r9523", "r9701", "r9701", "r9740", "r9782", "r9824", "t-for-tan",
      "transformation-or-not", "trig-tables",
    ]); // 52 rows over 50 distinct slugs — r9701 rides twice (lane-9's 3.1.5 + lane-13's 3.5 join) AND r9082 rides twice (lane-9's 3.1.4 + lane-14's 3.6.1 join); r8404's one row carries both its 3.6.2/3.6.3 codes, r8231's one row carries both its 3.6.1/3.6.3 codes; lane-16 adds r6959 (3.8.1-3.8.4) + r7410 (3.8.1-3.8.3) — the DE pipeline embodiments
    // the lane-11 additions: the 23 flips of the lane-5 pre-baked 'P3 2.3'
    // pool + the 4 one-to-many (going-round-in-circles, muddled-trig,
    // trig-tables under 3.3.1; r7021 under 3.3.2) — all riding
    // pure-1-trigonometry bodies of record (the lane-9 flip law)
    for (const s of ["equation-or-identity-ii", "r6018", "r9740", "t-for-tan"] as const) {
      expect(slugs).toContain(s);
    }
    // the lane-12 addition: the r8931 flip under 3.4.2 — the lane-7
    // non-overlap row whose whole-station body of record lives under
    // pure-1-differentiation (the lane-9 flip law, one lane further)
    // the lane-13 additions: the circular-slice flip (3.5.6/3.5.2 — its
    // lane-4 body under pure-1-circular-measure, the lane-9 flip law two
    // courses on) + the r9312/r9701 one-to-many joins (the twice-by-parts
    // envelope integral and the partial-fraction INTEGRATION row)
    // the lane-14 additions: the r8404 flip (3.6.2/3.6.3 — its lane-6 body
    // under pure-1-series carries spec_points [] UNMAPPED-BY-DESIGN under
    // rule 3: the FIRST flip of record whose prior body carried no spec
    // assertion, the circular-slice precedent one step further) + the
    // r8231/r7549/r5948/r9082(one-to-many) cross-course riders
    // the lane-16 additions: r6959 (3.8.1-3.8.4 — its lane-7 body under
    // pure-1-differentiation carries the 1.7.3 chain-rule reading; the
    // part-(i) DE pipeline is the 3.8 embodiment) + r7410 (3.8.1-3.8.3 —
    // its lane-8 body under pure-1-integration carries the 1.8.2
    // constant-of-integration reading) — BOTH one_to_many beside standing
    // alignments (the lane-6 r7553/r9527 law, cross-course)
    // first-of-record body law: NO cross-course slug may carry a body here
    const ids = new Set(b3.resources.map((r) => r.ugmId));
    for (const s of slugs) expect(ids.has(s)).toBe(false);
    // and the index stays fresh-only: every spec-point ugmId resolves locally
    for (const sp of b3.specPoints) {
      for (const id of sp.ugmIds) expect(ids.has(id)).toBe(true);
    }
  });

  test("non-overlaps by reference: 98 rows with bodyImported=false — reasons disclosed, zero bodies", () => {
    const nbr = b3.coverage.nonOverlapByReference!;
    expect(nbr.count).toBe(98); // 94 prior + lane-16's 4 newly-disclosed rows MINUS from-parabolas-to-catenaries (superseded — served by its lane-9 3.1.6 body) + lane-17's 1 companion disclosure (absurder — NOT superseded: the corpus-boundary lane serves no body and absurder has no pure-3 body, so its lane-9 row AND its lane-17 row both stand)
    expect(nbr.rows.length).toBe(98);
    for (const row of nbr.rows) {
      expect(row.reason).toBeDefined();
      expect((row.reason ?? "").length).toBeGreaterThan(0);
      expect(b3.resources.find((r) => r.ugmId === row.ugmSlug)).toBeUndefined();
    }
    // CONSUME-10 supersede law: to-log-or-not-to-log's lane-9 byref row is
    // GONE — lane 10 flips it to aligned WITH a fresh body (3.2.3), and the
    // bundle never declares a resource body-less while serving its body
    expect(nbr.rows.find((r) => r.ugmSlug === "to-log-or-not-to-log")).toBeUndefined();
    // lane-14 supersede law: r8013's stale bearing row is GONE — its fresh
    // 3.6.1 body serves it now; and the companion disclosure is IN
    expect(nbr.rows.find((r) => r.ugmSlug === "r8013")).toBeUndefined();
    expect(nbr.rows.find((r) => r.ugmSlug === "staircase-sequences-revisited")).toBeDefined();
    // lane-15 supersede law: r8456's stale lane-3-algebra row is GONE — the
    // PROMOTION of record; its fresh body serves 3.7.2/3.7.6 now. The 6
    // companion disclosures are IN (4 under combining-vectors, 2 under
    // vector-geometry sweep stations — the plane class, r5089, r8828)
    expect(nbr.rows.find((r) => r.ugmSlug === "r8456")).toBeUndefined();
    for (const s of ["is-it-a-plane", "r6006", "r9794", "r7187", "r5089", "r8828"]) {
      expect(nbr.rows.find((r) => r.ugmSlug === s)).toBeDefined();
    }
    const flipped = b3.resources.find((r) => r.ugmId === "to-log-or-not-to-log");
    expect(flipped).toBeDefined();
    expect(flipped!.specPoints.map((s) => s.code)).toEqual(["3.2.3", "3.6.1"]); // the lane-14 one-to-many join rides the lane-9/10 body beside its standing 3.2.3 pick
    // and no served resource is a non-overlap (they are all aligned)
    expect(b3.resources.every((r) => !r.nonOverlap)).toBe(true);
    // lane-11's 42 by-reference rows ride the sweep's stations of record —
    // the two dedicated trigonometry stations contribute their stationScope
    // non-overlap counts (compound-angles 1, TTF 2; the other 39 ride the
    // sweep's other stations incl. calculus-trig-log, whose byref rows mix
    // with the earlier lanes' rows)
    const bySt = (s: string) => nbr.rows.filter((r) => r.station === s).length;
    expect(bySt("trigonometry-compound-angles")).toBe(1);
    expect(bySt("trigonometry-triangles-to-functions")).toBe(2);
    // lane-15's 6 by-reference rows ALL ride combining-vectors (the plane
    // class is-it-a-plane/r6006/r7187/r9794 + r5089 + r8828) beside the
    // standing r6449; vector-geometry's 4 rows are the standing prior rows
    // (make-it-stop/r6009/one-windy-day/r7678 — the lane-15 sweep adds none
    // there: every vector-geometry candidate was aligned or rejected)
    expect(bySt("combining-vectors")).toBe(7);
    expect(bySt("vector-geometry")).toBe(4);
    // lane-16's surviving disclosures: PTP-I rides thinking-about-functions
    // (its first byref row there), PTP-II rides combining-functions (its
    // first), weight-pulling joins hyperbolic-functions' prior rows; the
    // from-parabolas-to-catenaries row is superseded (served at 3.1.6) and
    // its 3.8 reading stays of record in the corpus enrichment only
    expect(bySt("thinking-about-functions")).toBe(4);
    expect(bySt("combining-functions")).toBe(2);
    expect(bySt("hyperbolic-functions")).toBe(7);
    expect(nbr.rows.find((r) => r.ugmSlug === "from-parabolas-to-catenaries")).toBeUndefined();
    for (const s of ["picture-the-process-i", "picture-the-process-ii", "weight-pulling"]) {
      expect(nbr.rows.find((r) => r.ugmSlug === s)).toBeDefined();
    }
    // lane-17's companion disclosure: absurder now rides TWO rows (lane-9's
    // 3.1-era row + lane-17's 3.9 companion disclosure — distinct reasons,
    // the same honest fact; both ride polynomials, the disclosure station)
    const absurderRows = nbr.rows.filter((r) => r.ugmSlug === "absurder");
    expect(absurderRows.length).toBe(2);
    for (const r of absurderRows) {
      expect(r.station).toBe("polynomials");
      expect(r.reason).toContain("rationalisation");
    }
    expect(bySt("polynomials")).toBe(7); // 6 standing rows + lane-17's absurder companion disclosure
  });

  test("the thirty-five picks of record (r6018 rides its reference row — the lane-11 pick law, joined by r8404 and r8231 in lane 14 and by r6959/r7410 in lane 16; 3.5.4 and 3.7.7 keep the honest gaps and lane 17 takes the honest gap lane-wide — 3.9.1-3.9.8 carry no rows and no picks; the multi-code law: 25 bodies flag twice-or-more)", () => {
    const picks = Object.fromEntries(b3.specPoints.map((sp) => [sp.code, sp.primaryPick]));
    expect(picks).toEqual({
      "3.1.1": "absolutely",
      "3.1.2": "inequalities",
      "3.1.3": "whats-left",
      "3.1.4": "r6577",
      "3.1.5": "r7792",
      "3.1.6": "r7436",
      "3.2.1": "proving-laws-of-logs",
      "3.2.2": "an-irrational-inequality",
      "3.2.3": "to-log-or-not-to-log",
      "3.2.4": "how-far-did-the-earth-move",
      "3.3.1": "r7616",
      "3.3.2": "r6018",
      "3.4.1": "r6938",
      "3.4.2": "r6530",
      "3.4.3": "r8620",
      "3.5.1": "r8679",
      "3.5.2": "r9297",
      "3.5.3": "r5126",
      "3.5.4": null, // the honest gap of record — no f'(x)/f(x) resource exists corpus-wide (rule 3)
      "3.5.5": "r8134",
      "3.5.6": "r8890",
      "3.6.1": "r8711",
      "3.6.2": "r8404", // rides its lane-6 body — the r6018 convention
      "3.6.3": "r8231", // rides its lane-3 body — disclosed
      "3.7.1": "hit-the-spot",
      "3.7.2": "r8215",
      "3.7.3": "r9575",
      "3.7.4": "lots-of-vector-lines",
      "3.7.5": "three-lines",
      "3.7.6": "r6493",
      "3.7.7": null, // the DESIGNED honest gap of record — the spec's own exclusion row (the second gap after 3.5.4, by design)
      "3.8.1": "r6959", // rides its pure-1-differentiation 1.7.3 body — the r6018 convention (the ZERO-FRESH lane: every pick rides a reference row)
      "3.8.2": "r7410", // rides its pure-1-integration 1.8.2 body — disclosed
      "3.8.3": "r7410",
      "3.8.4": "r6959",
      "3.9.1": null, // the CORPUS-BOUNDARY lane: the FIRST lane-wide honest gap — no 3.9 skill is exercised anywhere in the corpus (rule 3)
      "3.9.2": null,
      "3.9.3": null,
      "3.9.4": null,
      "3.9.5": null,
      "3.9.6": null,
      "3.9.7": null,
      "3.9.8": null, // all eight 3.9 spec points honest-empty — no picks, no pickDisclosure arises
    });
    const flags = new Map<string, string[]>();
    for (const r of b3.resources) {
      const codes = r.specPoints.filter((s) => s.primaryPick).map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length); // pick flags ride distinct codes
      if (codes.length) flags.set(r.ugmId, codes);
    }
    expect(flags.get("inequalities")?.sort()).toEqual(["3.1.1", "3.1.2"]);
    expect(flags.get("r6577")?.sort()).toEqual(["3.1.3", "3.1.4"]);
    expect(flags.get("r7616")).toEqual(["3.3.1"]);
    expect(flags.get("r6938")).toEqual(["3.4.1"]); // lane-12's picks are all fresh bodies — the lane-11 reference-pick law does not recur
    expect(flags.get("r8679")).toEqual(["3.5.1"]); // unchanged — the lane-14 join codes ride pick-less (3.6.2's pick r8404 and 3.6.3's pick r8231 ride reference rows)
    expect(flags.get("r8711")).toEqual(["3.6.1"]); // lane-14's only pick with a served body — r8404/r8231 ride reference rows like r6018 (the pick lives on the index only)
    expect(flags.get("r9297")).toEqual(["3.5.2"]);
    expect(flags.get("r5126")!.sort()).toEqual(["3.5.3", "3.5.5"]); // rides its lane-9 body — the lane-11 r6018 convention, one course on
    expect(flags.get("r8134")!.sort()).toEqual(["3.5.2", "3.5.5"]); // the dual-bearing heritage (lane-10 + lane-12 both bore r8134 at 3.5)
    expect(flags.get("r8890")).toEqual(["3.5.6"]);
    // lane-15's picks ALL ride fresh bodies — the r6018 reference-pick law does not recur (the zero-join lane);
    // the corpus carries the dual row-level flags of record (hit-the-spot 3.7.1+3.7.2, r8215 3.7.2+3.7.3,
    // lots-of-vector-lines/three-lines 3.7.4+3.7.5) beside the index-level picks
    expect(flags.get("hit-the-spot")!.sort()).toEqual(["3.7.1", "3.7.2"]); // the dual-bearing 3.7.1/3.7.2 pick
    expect(flags.get("r8215")!.sort()).toEqual(["3.7.2", "3.7.3"]); // the corpus's dual row-level flag (3.7.2 level-pick; 3.7.3 rides beside level-pick r9575)
    expect(flags.get("r9575")).toEqual(["3.7.3"]);
    expect(flags.get("lots-of-vector-lines")!.sort()).toEqual(["3.7.4", "3.7.5"]); // the dual flag pair with three-lines
    expect(flags.get("three-lines")!.sort()).toEqual(["3.7.4", "3.7.5"]); // 3.7.5's level pick rides both flags
    expect(flags.get("r6493")).toEqual(["3.7.6"]);
    expect(flags.size).toBe(26); // 20 prior + 6 lane-15 fresh picks — lane 16 adds NONE (its picks ride reference rows over an empty fresh index; the corpus-level row flags live in the pure-1 bundles)
    // 180 memberships over 149 bodies: 151 prior + 29 lane-15 fresh (2/11/5/
    // 3/4/4 — all fresh, no join codes; the cross-course riders' memberships
    // live in the pure-1 bundle); lane 16 adds ZERO memberships (the
    // zero-fresh law — the index stays fresh-only)
    const memberships = b3.resources.reduce((n, r) => n + r.specPoints.length, 0);
    expect(memberships).toBe(180);
    const multiCode = b3.resources.filter((r) => r.specPoints.length >= 2).map((r) => r.ugmId).sort();
    expect(multiCode).toEqual([
      "constant-consistency", "hit-the-spot", "inequalities", "integral-chasing-2",
      "lots-of-vector-lines", "r5126", "r5276", "r6007", "r6577", "r7285",
      "r7616", "r8134", "r8215", "r8456", "r8679", "r8694", "r8774", "r8778",
      "r9629", "see-the-power", "staircase-sequences", "three-lines",
      "to-log-or-not-to-log", "trigsy-integrals", "vector-squares",
    ]); // 11 two-code + 4 three-code (r5126, integral-chasing-2, constant-consistency, r8679) + r8694 four-code + lane-15's 9 dual-code bodies (hit-the-spot/r8215/r9629/r6007/r7285 share 3.7.2; lots-of-vector-lines/three-lines/vector-squares share 3.7.4+3.7.5; r8456 rides 3.7.2+3.7.6)
  });

  test("figure plane honesty: the map of record predates lanes 9-12 — figures=0, zero /ugm-assets/ refs, zero external ugm image links, zero placeholders", () => {
    expect(b3.coverage.figures).toEqual({
      figureRefs: 0,
      resources: 0,
      uniqueAssets: 0,
      inlineRewritten: 0,
    });
    for (const r of b3.resources) {
      expect(r.figures).toBe(0);
      expect(r.figuresInline ?? 0).toBe(0);
      expect(r.bodyMd).not.toContain("/ugm-assets/");
      expect(/\[figure:\s*.*`https:\/\/undergroundmathematics\.org/.test(r.bodyMd)).toBe(false);
    }
    const URL_RE = /https?:\/\/[^\s<>)\]"'`]+/g;
    for (const r of b3.resources) {
      const stripped = r.bodyMd.replace(/\[[^\]]*\]\([^)]*\)/g, "");
      for (const m of stripped.matchAll(URL_RE)) {
        expect(/undergroundmathematics\.org/i.test(m[0]) && /\.(png|jpe?g|gif|svg|webp)$/i.test(m[0])).toBe(false);
      }
    }
  });

  test("pure-3 honesty invariants: unique ids, declared stations, delimiter balance, SUGGESTED provenance", () => {
    const ids = b3.resources.map((r) => r.ugmId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(149);
    const slugs = new Set(b3.stations.map((s) => s.slug));
    for (const r of b3.resources) expect(slugs.has(r.station)).toBe(true);
    for (const r of b3.resources) {
      const openParen = (r.bodyMd.match(/\\\(/g) ?? []).length;
      const closeParen = (r.bodyMd.match(/\\\)/g) ?? []).length;
      const openBracket = (r.bodyMd.match(/\\\[/g) ?? []).length;
      const closeBracket = (r.bodyMd.match(/\\\]/g) ?? []).length;
      expect(openParen).toBe(closeParen);
      expect(openBracket).toBe(closeBracket);
    }
    expect(b3.rights.textOnly).toBe(false);
    expect(b3.source.figureMap).toBe("UGM-Resources/figures-map.json");
  });

  test("the flag law: all three course planes are flagged for the surface", () => {
    const flags = JSON.parse(
      readFileSync(join(import.meta.dir, "../../content/flags.json"), "utf8"),
    );
    const courses = flags.flags.ugmLaneResources.courses;
    expect(courses).toContain("cie-a-level-maths-20-pure-1");
    expect(courses).toContain("cie-a-level-maths-20-pure-3");
    expect(courses).toContain("cie-a-level-maths-20-pure-2");
  });
});

describe("the pure-2 course plane (T-UGM-HUB-CONSUME-P2, lane 18 — the FIRST lane on a THIRD course plane)", () => {
  const B2_PATH = join(
    import.meta.dir,
    "../../content/cie-a-level-maths-20-pure-2/ugm-resources.json",
  );
  const b2 = UgmLaneBundle.parse(JSON.parse(readFileSync(B2_PATH, "utf8")));

  test("schema + the corpus pin of record (post-#226 merge, T-UGM-P2-1)", () => {
    expect(b2.schema).toBe("syllabai-demo.ugm-lane-resources/1.2");
    expect(b2.lane).toBe("cie-a-level-maths-20-pure-2");
    expect(b2.source.ref).toBe(
      "main@3b2ce8da700b80f51700fb34fc721c90d6654d6b",
    );
    expect(b2.source.enrichment).toEqual([
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-algebra.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-logarithmic-and-exponential-functions.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-trigonometry.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-differentiation.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-integration.json",
      "UGM-Enrichment/cie-a-level-maths-20-pure-2-numerical-solution-of-equations.json",
    ]);
    // the COURSE-PLANE SERVE LAW: the plane owns NO capture dirs — the 12
    // pure-1/pure-3 capture dirs of record supply the served text
    expect(b2.source.resourcesDir).toEqual([
      "UGM-Resources/pure-1-circular-measure",
      "UGM-Resources/pure-1-coordinate-geometry",
      "UGM-Resources/pure-1-differentiation",
      "UGM-Resources/pure-1-functions",
      "UGM-Resources/pure-1-series",
      "UGM-Resources/pure-1-trigonometry",
      "UGM-Resources/pure-3-algebra",
      "UGM-Resources/pure-3-differentiation",
      "UGM-Resources/pure-3-integration",
      "UGM-Resources/pure-3-iteration",
      "UGM-Resources/pure-3-logarithmic-and-exponential-functions",
      "UGM-Resources/pure-3-trigonometry",
    ]);
    expect(b2.reviewState.state).toBe("SUGGESTED");
    expect(b2.rights.textOnly).toBe(false);
  });

  test("the course-plane fleet census of record: 166 bodies / 178 claims / 17 spec points / 27 station rows", () => {
    expect(b2.resources.length).toBe(166);
    expect(b2.coverage.aligned).toBe(166); // every served body carries its P2 rows
    expect(b2.coverage.nonOverlap).toBe(0); // the ONE companion rides byref, never served
    expect(b2.coverage.candidateRows).toBe(178); // the 17-code index claims (own 171 + sibling riders 7)
    expect(b2.coverage.ugmResourcesConsidered).toBe(166);
    expect(b2.coverage.alignedShare).toBe(1.0);
    expect(b2.coverage.specPointsCovered).toEqual([
      "2.1.1", "2.1.2", "2.2.1", "2.2.2", "2.2.3", "2.2.4",
      "2.3.1", "2.3.2", "2.4.1", "2.4.2", "2.4.3",
      "2.5.1", "2.5.2", "2.5.3", "2.6.1", "2.6.2", "2.6.3",
    ]);
    expect(b2.stations.length).toBe(27); // 4 + 5 + 3 + 4 + 4 + 7 declared rows
    expect(new Set(b2.stations.map((s) => s.slug)).size).toBe(16); // all from the 25-station capture catalog — zero new stations
    expect(b2.coverage.lanes.length).toBe(6);
    expect(b2.coverage.lanes[0]).toMatchObject({
      station: "algebra",
      stationTitle: "Algebra",
      ugmResourcesConsidered: 31,
      aligned: 0, // the fresh-only counting law (the lane-16 law)
      nonOverlap: 0,
      candidateRows: 33, // the lane's index claims (31 own + 2 from the two-code rows... the 2.1.2 three-bullet merge delivers 27)
      crossLaneAligned: 31,
    });
    expect(b2.coverage.lanes[4]).toMatchObject({
      station: "integration",
      stationTitle: "Integration",
      ugmResourcesConsidered: 22,
      aligned: 0,
      nonOverlap: 1, // the r5324 capture-gap companion
      candidateRows: 23,
      crossLaneAligned: 20, // 15 one_to_many + the FIVE trapezium flips
    });
    expect(b2.coverage.lanes[5]).toMatchObject({
      station: "numerical-solution-of-equations",
      stationTitle: "Numerical solution of equations",
      ugmResourcesConsidered: 7,
      aligned: 0,
      nonOverlap: 0,
      candidateRows: 10,
      crossLaneAligned: 7,
    });
  });

  test("the course-plane serve law: provenance on every served body, zero corpus text moves", () => {
    // every served body carries its corpus path of record + owning course
    for (const r of b2.resources) {
      expect(r.textOfRecordUnder).toMatch(/^UGM-Resources\/pure-(1|3)-[a-z-]+\//);
      expect(
        r.servedFromCourse === "cie-a-level-maths-20-pure-1" ||
          r.servedFromCourse === "cie-a-level-maths-20-pure-3",
      ).toBe(true);
    }
    const courses = b2.coverage.coursePlaneJoins?.courses ?? {};
    expect(courses).toEqual({
      "cie-a-level-maths-20-pure-3": 117,
      "cie-a-level-maths-20-pure-1": 49,
    });
    expect(b2.coverage.coursePlaneJoins?.kinds).toEqual({
      one_to_many: 161,
      flip: 5,
    });
    expect(b2.coverage.coursePlaneJoins?.count).toBe(166);
    expect(b2.coverage.coursePlaneJoins?.byrefNonOverlap).toBe(1);
  });

  test("the trapezium realization: 2.5.3 serves the five flips + the two standing-home joins", () => {
    const sp = b2.specPoints.find((s) => s.code === "2.5.3");
    expect(sp?.ugmIds).toEqual([
      "approximating-areas",
      "r5642",
      "r6592",
      "r7903",
      "r7912",
      "r8140",
      "underneath-the-arches",
    ]);
    expect(sp?.primaryPick).toBe("r7903");
    // the P2-unique code: NO other bundle carries 2.5.3 — every served body
    // of the cluster is a flip of a beyond-spec routing of record (or the
    // two standing-home trapezium joins r6592/r7912)
    const flips = ["approximating-areas", "r5642", "r7903", "r8140", "underneath-the-arches"];
    for (const slug of flips) {
      const r = b2.resources.find((x) => x.ugmId === slug);
      expect(r).toBeDefined();
      expect(r?.specPoints.map((s) => s.code)).toContain("2.5.3");
    }
  });

  test("the rider reconciliation: sibling-code claims land in the owning lane's index", () => {
    // 2.6.1 = 5 numerical rows + 3 riders (r9082 algebra / see-the-power +
    // to-log-or-not-to-log logs-exp)
    expect(b2.specPoints.find((s) => s.code === "2.6.1")?.ugmIds).toEqual([
      "r5948", "r7549", "r8013", "r8231", "r8711", "r9082", "see-the-power", "to-log-or-not-to-log",
    ]);
    // 2.5.1 = 7 integration rows + 2 riders (r7616 trigonometry / r8774
    // differentiation — appended in lane order after the owning lane's own
    // claims, the rider-reconciliation order of record)
    expect(b2.specPoints.find((s) => s.code === "2.5.1")?.ugmIds).toEqual([
      "inverse-integrals", "r7074", "r8679", "r9184", "stretching-an-integral", "trigsy-integrals", "two-for-one", "r7616", "r8774",
    ]);
    // r8679's row rides BOTH 2.6.2 and 2.6.3 from the integration lane
    const r8679 = b2.resources.find((r) => r.ugmId === "r8679");
    expect(r8679?.specPoints.map((s) => s.code).sort()).toEqual(["2.5.1", "2.6.2", "2.6.3"]);
  });

  test("the seventeen picks of record — every pick rides a SERVED body (the r6018 law at its honest end)", () => {
    const picks: Record<string, string> = {
      "2.1.1": "absolutely",
      "2.1.2": "can-you-find-cubic-edition",
      "2.2.1": "calculators1950",
      "2.2.2": "an-irrational-inequality",
      "2.2.3": "powerful-fractions",
      "2.2.4": "how-far-did-the-earth-move",
      "2.3.1": "going-round-in-circles",
      "2.3.2": "equation-or-identity-ii",
      "2.4.1": "can-you-find-chain-rule-edition",
      "2.4.2": "how-does-your-rectangle-grow",
      "2.4.3": "implicit-circles",
      "2.5.1": "inverse-integrals",
      "2.5.2": "circular-slice",
      "2.5.3": "r7903",
      "2.6.1": "r5948",
      "2.6.2": "r8404",
      "2.6.3": "r8231",
    };
    const served = new Set(b2.resources.map((r) => r.ugmId));
    for (const [code, pick] of Object.entries(picks)) {
      const sp = b2.specPoints.find((s) => s.code === code);
      expect(sp?.primaryPick).toBe(pick);
      expect(served.has(pick)).toBe(true); // every pick has a served body under pure-2
    }
  });

  test("the ONE byref companion: r5324 (capture gap) disclosed, never served", () => {
    const byref = b2.coverage.nonOverlapByReference;
    expect(byref?.count).toBe(1);
    expect(byref?.rows[0]?.ugmSlug).toBe("r5324");
    expect(byref?.rows[0]?.reason).toMatch(/COMPANION DISCLOSURE/);
    expect(b2.resources.find((r) => r.ugmId === "r5324")).toBeUndefined();
  });

  test("the image plane: 147 refs localized across 33 resources (all committed under public/ugm-assets)", () => {
    expect(b2.coverage.figures).toEqual({
      figureRefs: 147,
      resources: 33,
      uniqueAssets: 123,
      inlineRewritten: 20,
    });
    let refs = 0;
    for (const r of b2.resources) {
      const found = r.bodyMd.match(/\/ugm-assets\/[^)\s]+/g) ?? [];
      refs += found.length;
      for (const ref of found) {
        const p = join(import.meta.dir, "../../public", ref);
        expect(existsSync(p)).toBe(true);
      }
    }
    expect(refs).toBe(147);
  });

  test("pure-2 honesty invariants: unique ids, declared stations, delimiter balance, SUGGESTED provenance", () => {
    const ids = b2.resources.map((r) => r.ugmId);
    expect(new Set(ids).size).toBe(ids.length);
    const declared = new Set(b2.stations.map((s) => s.slug));
    for (const r of b2.resources) {
      expect(declared.has(r.station)).toBe(true);
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBeGreaterThan(0);
      expect((r.bodyMd.match(/\\\(/g) ?? []).length).toBe(
        (r.bodyMd.match(/\\\)/g) ?? []).length,
      );
      expect((r.bodyMd.match(/\\\[/g) ?? []).length).toBe(
        (r.bodyMd.match(/\\\]/g) ?? []).length,
      );
    }
    expect(b2.reviewState.state).toBe("SUGGESTED");
    // the two station-less standing-home rows resolve via front-matter
    for (const slug of ["r6592", "r7912"]) {
      const r = b2.resources.find((x) => x.ugmId === slug);
      expect(r?.station).toBe("introducing-calculus");
      expect(r?.specPoints.map((s) => s.code)).toContain("2.5.3");
    }
  });
});

describe("the cross-board mirror plane (T-UGM-XBOARD-IAL-1 X1 — the FIRST IAL bundle, vehicle V1)", () => {
  const XB_PATH = join(
    import.meta.dir,
    "../../content/ial-maths-20-pure-1/ugm-resources.json",
  );
  const xb = UgmLaneBundle.parse(
    JSON.parse(readFileSync(XB_PATH, "utf8")),
  );

  test("parse succeeds under the reader schema (1.2 honest-gap law)", () => {
    expect(xb.schema).toBe("syllabai-demo.ugm-lane-resources/1.2");
    expect(xb.lane).toBe("ial-maths-20-pure-1");
    expect(xb.reviewState.state).toBe("SUGGESTED");
    expect(xb.reviewState.note).toContain("Cross-board mirror");
  });

  test("spec-point index: 22 codes biject the IAL pure-1 curriculum spine", () => {
    const cur = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../content/ial-maths-20-pure-1/curriculum.json"),
        "utf8",
      ),
    ) as { nodes: Array<{ family?: string; code?: string; title?: string }> };
    const codes = cur.nodes
      .filter((n) => n.family === "SPEC_POINT")
      .map((n) => n.code as string)
      .sort();
    expect(xb.specPoints).toHaveLength(22);
    expect([...xb.specPoints.map((s) => s.code)].sort()).toEqual(codes);
    // spine verbatim law: officialText is the curriculum title of record
    for (const sp of xb.specPoints) {
      const node = cur.nodes.find((n) => n.code === sp.code);
      expect(sp.officialText).toBe(node?.title ?? null);
    }
  });

  test("mirror census of record (run-001 matrix P1: 15 SERVES + 7 SERVES_WITH_GUARD, zero INSUFFICIENT)", () => {
    expect(xb.resources).toHaveLength(301);
    expect(xb.coverage.specPointsCovered).toHaveLength(22);
    for (const sp of xb.specPoints) {
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
      if (sp.primaryPick !== null) expect(sp.ugmIds).toContain(sp.primaryPick);
    }
    expect(xb.coverage.coursePlaneJoins?.kinds).toEqual({
      cross_board_mirror: 301,
    });
  });

  test("every mirrored row is a byte-true CIE mirror with provenance of record", () => {
    const sources = new Map<string, { bodyMd: string }>();
    for (const c of [
      "cie-a-level-maths-20-pure-1",
      "cie-a-level-maths-20-pure-2",
      "cie-a-level-maths-20-pure-3",
    ]) {
      const b = JSON.parse(
        readFileSync(
          join(import.meta.dir, "../../content", c, "ugm-resources.json"),
          "utf8",
        ),
      ) as { resources: Array<{ ugmId: string; bodyMd: string }> };
      for (const r of b.resources) sources.set(`${c}/${r.ugmId}`, r);
    }
    for (const r of xb.resources) {
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBeGreaterThan(0);
      expect(r.servedFromCourse).toMatch(/^cie-a-level-maths-20-pure-[123]$/);
      expect(r.textOfRecordUnder).toBe(`${r.servedFromCourse}/ugm-resources.json`);
      const src = sources.get(`${r.servedFromCourse}/${r.ugmId}`);
      expect(src).toBeDefined();
      expect(src?.bodyMd).toBe(r.bodyMd); // the byte-true mirror law
      for (const sp of r.specPoints) {
        expect(sp.note ?? "").toMatch(/^\[(SERVES|SERVES_WITH_GUARD)\] <- CIE /);
      }
    }
  });

  test("the guard language rides exactly the 7 thin rows of record", () => {
    const guardCodes = new Set(
      xb.resources
        .flatMap((r) => r.specPoints)
        .filter((s) => (s.note ?? "").startsWith("[SERVES_WITH_GUARD]"))
        .map((s) => s.code),
    );
    expect(guardCodes.size).toBe(7);
  });
});

describe("the cross-board mirror plane (T-UGM-XBOARD-IAL-1 X2 — the SECOND IAL bundle, vehicle V1)", () => {
  const XB2_PATH = join(
    import.meta.dir,
    "../../content/ial-maths-20-pure-2/ugm-resources.json",
  );
  const xb2 = UgmLaneBundle.parse(
    JSON.parse(readFileSync(XB2_PATH, "utf8")),
  );

  test("parse succeeds under the reader schema (1.2 honest-gap law)", () => {
    expect(xb2.schema).toBe("syllabai-demo.ugm-lane-resources/1.2");
    expect(xb2.lane).toBe("ial-maths-20-pure-2");
    expect(xb2.reviewState.state).toBe("SUGGESTED");
    expect(xb2.reviewState.note).toContain("Cross-board mirror");
  });

  test("spec-point index: 19 codes biject the IAL pure-2 curriculum spine", () => {
    const cur = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../content/ial-maths-20-pure-2/curriculum.json"),
        "utf8",
      ),
    ) as { nodes: Array<{ family?: string; code?: string; title?: string }> };
    const codes = cur.nodes
      .filter((n) => n.family === "SPEC_POINT")
      .map((n) => n.code as string)
      .sort();
    expect(xb2.specPoints).toHaveLength(19);
    expect([...xb2.specPoints.map((s) => s.code)].sort()).toEqual(codes);
    // spine verbatim law: officialText is the curriculum title of record
    for (const sp of xb2.specPoints) {
      const node = cur.nodes.find((n) => n.code === sp.code);
      expect(sp.officialText).toBe(node?.title ?? null);
    }
  });

  test("mirror census of record (run-001 matrix P2: 14 SERVES + 5 SERVES_WITH_GUARD, zero INSUFFICIENT)", () => {
    expect(xb2.resources).toHaveLength(302);
    expect(xb2.coverage.specPointsCovered).toHaveLength(19);
    for (const sp of xb2.specPoints) {
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
      if (sp.primaryPick !== null) expect(sp.ugmIds).toContain(sp.primaryPick);
    }
    expect(xb2.coverage.coursePlaneJoins?.kinds).toEqual({
      cross_board_mirror: 302,
    });
  });

  test("every mirrored row is a byte-true CIE mirror with provenance of record", () => {
    const sources = new Map<string, { bodyMd: string }>();
    for (const c of [
      "cie-a-level-maths-20-pure-1",
      "cie-a-level-maths-20-pure-2",
      "cie-a-level-maths-20-pure-3",
    ]) {
      const b = JSON.parse(
        readFileSync(
          join(import.meta.dir, "../../content", c, "ugm-resources.json"),
          "utf8",
        ),
      ) as { resources: Array<{ ugmId: string; bodyMd: string }> };
      for (const r of b.resources) sources.set(`${c}/${r.ugmId}`, r);
    }
    for (const r of xb2.resources) {
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBeGreaterThan(0);
      expect(r.servedFromCourse).toMatch(/^cie-a-level-maths-20-pure-[123]$/);
      expect(r.textOfRecordUnder).toBe(`${r.servedFromCourse}/ugm-resources.json`);
      const src = sources.get(`${r.servedFromCourse}/${r.ugmId}`);
      expect(src).toBeDefined();
      expect(src?.bodyMd).toBe(r.bodyMd); // the byte-true mirror law
      for (const sp of r.specPoints) {
        expect(sp.note ?? "").toMatch(/^\[(SERVES|SERVES_WITH_GUARD)\] <- CIE /);
      }
    }
  });

  test("the guard language rides exactly the 5 thin rows of record", () => {
    const guardCodes = new Set(
      xb2.resources
        .flatMap((r) => r.specPoints)
        .filter((s) => (s.note ?? "").startsWith("[SERVES_WITH_GUARD]"))
        .map((s) => s.code),
    );
    expect(guardCodes.size).toBe(5);
  });
});

describe("the cross-board mirror plane (T-UGM-XBOARD-IAL-1 X3 — the THIRD IAL bundle, vehicle V1)", () => {
  const XB3_PATH = join(
    import.meta.dir,
    "../../content/ial-maths-20-pure-3/ugm-resources.json",
  );
  const xb3 = UgmLaneBundle.parse(
    JSON.parse(readFileSync(XB3_PATH, "utf8")),
  );

  test("parse succeeds under the reader schema (1.2 honest-gap law)", () => {
    expect(xb3.schema).toBe("syllabai-demo.ugm-lane-resources/1.2");
    expect(xb3.lane).toBe("ial-maths-20-pure-3");
    expect(xb3.reviewState.state).toBe("SUGGESTED");
    expect(xb3.reviewState.note).toContain("Cross-board mirror");
  });

  test("spec-point index: 18 codes biject the IAL pure-3 curriculum spine", () => {
    const cur = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../content/ial-maths-20-pure-3/curriculum.json"),
        "utf8",
      ),
    ) as { nodes: Array<{ family?: string; code?: string; title?: string }> };
    const codes = cur.nodes
      .filter((n) => n.family === "SPEC_POINT")
      .map((n) => n.code as string)
      .sort();
    expect(xb3.specPoints).toHaveLength(18);
    expect([...xb3.specPoints.map((s) => s.code)].sort()).toEqual(codes);
    // spine verbatim law: officialText is the curriculum title of record
    for (const sp of xb3.specPoints) {
      const node = cur.nodes.find((n) => n.code === sp.code);
      expect(sp.officialText).toBe(node?.title ?? null);
    }
  });

  test("mirror census of record (run-001 matrix P3: 11 SERVES + 7 SERVES_WITH_GUARD, zero INSUFFICIENT)", () => {
    expect(xb3.resources).toHaveLength(185);
    expect(xb3.coverage.specPointsCovered).toHaveLength(18);
    for (const sp of xb3.specPoints) {
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
      if (sp.primaryPick !== null) expect(sp.ugmIds).toContain(sp.primaryPick);
    }
    expect(xb3.coverage.coursePlaneJoins?.kinds).toEqual({
      cross_board_mirror: 185,
    });
  });

  test("every mirrored row is a byte-true CIE mirror with provenance of record", () => {
    const sources = new Map<string, { bodyMd: string }>();
    for (const c of [
      "cie-a-level-maths-20-pure-1",
      "cie-a-level-maths-20-pure-2",
      "cie-a-level-maths-20-pure-3",
    ]) {
      const b = JSON.parse(
        readFileSync(
          join(import.meta.dir, "../../content", c, "ugm-resources.json"),
          "utf8",
        ),
      ) as { resources: Array<{ ugmId: string; bodyMd: string }> };
      for (const r of b.resources) sources.set(`${c}/${r.ugmId}`, r);
    }
    for (const r of xb3.resources) {
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBeGreaterThan(0);
      expect(r.servedFromCourse).toMatch(/^cie-a-level-maths-20-pure-[123]$/);
      expect(r.textOfRecordUnder).toBe(`${r.servedFromCourse}/ugm-resources.json`);
      const src = sources.get(`${r.servedFromCourse}/${r.ugmId}`);
      expect(src).toBeDefined();
      expect(src?.bodyMd).toBe(r.bodyMd); // the byte-true mirror law
      for (const sp of r.specPoints) {
        expect(sp.note ?? "").toMatch(/^\[(SERVES|SERVES_WITH_GUARD)\] <- CIE /);
      }
    }
  });

  test("the guard language rides exactly the 7 thin rows of record", () => {
    const guardCodes = new Set(
      xb3.resources
        .flatMap((r) => r.specPoints)
        .filter((s) => (s.note ?? "").startsWith("[SERVES_WITH_GUARD]"))
        .map((s) => s.code),
    );
    expect(guardCodes.size).toBe(7);
  });
});

describe("the cross-board mirror plane (T-UGM-XBOARD-IAL-1 X4 — the FOURTH IAL bundle, vehicle V1)", () => {
  const XB4_PATH = join(
    import.meta.dir,
    "../../content/ial-maths-20-pure-4/ugm-resources.json",
  );
  const xb4 = UgmLaneBundle.parse(
    JSON.parse(readFileSync(XB4_PATH, "utf8")),
  );

  test("parse succeeds under the reader schema (1.2 honest-gap law)", () => {
    expect(xb4.schema).toBe("syllabai-demo.ugm-lane-resources/1.2");
    expect(xb4.lane).toBe("ial-maths-20-pure-4");
    expect(xb4.reviewState.state).toBe("SUGGESTED");
    expect(xb4.reviewState.note).toContain("Cross-board mirror");
  });

  test("spec-point index: 18 codes biject the IAL pure-4 curriculum spine", () => {
    const cur = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../content/ial-maths-20-pure-4/curriculum.json"),
        "utf8",
      ),
    ) as { nodes: Array<{ family?: string; code?: string; title?: string }> };
    const codes = cur.nodes
      .filter((n) => n.family === "SPEC_POINT")
      .map((n) => n.code as string)
      .sort();
    expect(xb4.specPoints).toHaveLength(18);
    expect([...xb4.specPoints.map((s) => s.code)].sort()).toEqual(codes);
    // spine verbatim law: officialText is the curriculum title of record
    for (const sp of xb4.specPoints) {
      const node = cur.nodes.find((n) => n.code === sp.code);
      expect(sp.officialText).toBe(node?.title ?? null);
    }
  });

  test("mirror census of record (run-001 matrix P4: 8 SERVES + 8 SERVES_WITH_GUARD + 2 INSUFFICIENT)", () => {
    expect(xb4.resources).toHaveLength(119);
    expect(xb4.coverage.specPointsCovered).toHaveLength(16);
    for (const sp of xb4.specPoints) {
      expect(sp.resourceCount).toBe(sp.ugmIds.length);
      if (sp.primaryPick !== null) expect(sp.ugmIds).toContain(sp.primaryPick);
    }
    expect(xb4.coverage.coursePlaneJoins?.kinds).toEqual({
      cross_board_mirror: 119,
    });
  });

  test("the two hard GAPs of record (5.2 DE formation, 6.4 separable DEs) carry null pick + zero rows", () => {
    // the schema-1.2 honest-gap law, exercised for the first time on the
    // IAL mirror plane: INSUFFICIENT rows are disclosed, never served
    for (const gap of ["5.2", "6.4"]) {
      const sp = xb4.specPoints.find((s) => s.code === gap);
      expect(sp).toBeDefined();
      expect(sp?.primaryPick).toBeNull();
      expect(sp?.resourceCount).toBe(0);
      expect(sp?.ugmIds).toEqual([]);
      expect(xb4.coverage.specPointsCovered).not.toContain(gap);
      for (const r of xb4.resources) {
        expect(r.specPoints.map((e) => e.code)).not.toContain(gap);
      }
    }
  });

  test("every mirrored row is a byte-true CIE mirror with provenance of record", () => {
    const sources = new Map<string, { bodyMd: string }>();
    for (const c of [
      "cie-a-level-maths-20-pure-1",
      "cie-a-level-maths-20-pure-2",
      "cie-a-level-maths-20-pure-3",
    ]) {
      const b = JSON.parse(
        readFileSync(
          join(import.meta.dir, "../../content", c, "ugm-resources.json"),
          "utf8",
        ),
      ) as { resources: Array<{ ugmId: string; bodyMd: string }> };
      for (const r of b.resources) sources.set(`${c}/${r.ugmId}`, r);
    }
    for (const r of xb4.resources) {
      expect(r.nonOverlap).toBe(false);
      expect(r.specPoints.length).toBeGreaterThan(0);
      expect(r.servedFromCourse).toMatch(/^cie-a-level-maths-20-pure-[123]$/);
      expect(r.textOfRecordUnder).toBe(`${r.servedFromCourse}/ugm-resources.json`);
      const src = sources.get(`${r.servedFromCourse}/${r.ugmId}`);
      expect(src).toBeDefined();
      expect(src?.bodyMd).toBe(r.bodyMd); // the byte-true mirror law
      for (const sp of r.specPoints) {
        expect(sp.note ?? "").toMatch(/^\[(SERVES|SERVES_WITH_GUARD)\] <- CIE /);
      }
    }
  });

  test("the guard language rides exactly the 8 thin rows of record", () => {
    const guardCodes = new Set(
      xb4.resources
        .flatMap((r) => r.specPoints)
        .filter((s) => (s.note ?? "").startsWith("[SERVES_WITH_GUARD]"))
        .map((s) => s.code),
    );
    expect(guardCodes.size).toBe(8);
  });
});
