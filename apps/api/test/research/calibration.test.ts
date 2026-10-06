/**
 * T-MIG-062 route + service tests — the observable HTTP contract of
 * ResearchCalibrationController (GET /api/v1/research/learner-model/calibration)
 * over the REAL calibration service on stubbed sql (the classroom/smartmark
 * route-test pattern: auth injection + the real error boundary, routers at
 * the REAL mount prefix). Pins the frozen law @ 6cad6ef line-against-line:
 *
 *   - the authz shell (SecurityConfig :88-90 hasAnyRole TEACHER/ADMIN —
 *     Boot 401/403 BEFORE any query; the method-level @PreAuthorize re-gate
 *     collapses into the shell with identical outcomes),
 *   - the nodeId @RequestParam UUID law (unparseable → the :167-172 FIXED
 *     "malformed request" 400; parseable → canonical lowercase — UUID
 *     .fromString accepts mixed case, .toString() emits lowercase),
 *   - the honest-zero EMPTY report (every cell empty, fixed segment orders),
 *   - the EMISSION-MAPPED headline (C2: predicted = latent·(1−slip) +
 *     (1−latent)·guess with the per-format guess resolver — known-answer
 *     arithmetic, not restated formulas), Brier/ECE on the mapped prediction,
 *   - C7 k-anonymity (k=5): pooled + segment + bin-within-segment
 *     suppression with counts visible everywhere; the LEARNER unit (6 rows /
 *     2 learners would pass any row floor and still hides); empty cells
 *     distinct from suppressed cells; partition invariants (Σ segment
 *     sampleCounts = sampleCount on both axes),
 *   - the format-axis pricing fold (MCQ 2-3/4/5+/malformed, SHORT_ANSWER,
 *     STRUCTURED, UNTYPED for unrecognized/blank/missing — priced identically
 *     by the paper constant so the fold never mixes pricing; 4.9 truncates
 *     to 4 per the (int) cast),
 *   - the gap-axis τ bands (0/1-30/31-90/91-365/366+/UNKNOWN) with the
 *     meanAnchor law (anchors only over rows carrying one; suppressed →
 *     null) and the numeric-string gapDays parity ("30" bands, "30.5" is
 *     UNKNOWN — Long.parseLong strictness),
 *   - the nodeId filter landing filtered rows in NEITHER bucket
 *     ("filtered, not malformed"), strict string equality,
 *   - the skip-before-filter walk (malformed/legacy rows counted globally,
 *     never attributed; the defensive parsers: numeric-string decayedPrior
 *     aggregates, string correctness skips, "NaN" string skips).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createResearchRouter } from "../../src/routes/research";
import { buildResearchModule } from "../../src/services/research";
import { toErrorResponse } from "../../src/services/identity/errors";
import { calibrationReportSchema } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const L1 = "bb000000-0000-4000-8000-000000000001";
const L2 = "bb000000-0000-4000-8000-000000000002";
const L3 = "bb000000-0000-4000-8000-000000000003";
const L4 = "bb000000-0000-4000-8000-000000000004";
const L5 = "bb000000-0000-4000-8000-000000000005";
const NODE_A = "ff000000-0000-4000-8000-000000000001";
const NODE_B = "ff000000-0000-4000-8000-000000000002";
const T0 = "2026-10-01T10:00:00Z";

const FETCH = /select id, learner_id, payload, occurred_at from telemetry_events where event_type = \? order by occurred_at asc$/;

type Row = Record<string, unknown>;

let evSeq = 0;
/** A BKT_UPDATED telemetry row — payload carries the update-path contract keys. */
function ev(learnerId: string, payload: Record<string, unknown>): Row {
  evSeq++;
  return {
    id: `ee000000-0000-4000-8000-${String(evSeq).padStart(12, "0")}`,
    learner_id: learnerId,
    event_type: "BKT_UPDATED",
    payload,
    occurred_at: T0,
  };
}

/** The standard contract row: MCQ(4), latent 0.35, correct, gap 0, anchor 0.3. */
const mcq4 = (learnerId: string, nodeId: string = NODE_A): Row =>
  ev(learnerId, {
    nodeId,
    decayedPrior: 0.35,
    correctness: true,
    questionType: "MCQ_SINGLE",
    optionCount: 4,
    gapDays: 0,
    priorMastery: 0.3,
  });

function makeApp(auth: (c: Context) => Record<string, unknown> | null, rows: Row[]) {
  const routes: Route[] = [{ match: FETCH, rows }];
  const sql = fakeSql(routes);
  const module = buildResearchModule(sql);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/research", createResearchRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql };
}

const asTeacher = (): Record<string, unknown> => ({
  email: "t@example.edu",
  userId: "tt000000-0000-4000-8000-000000000001",
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asAdmin = (): Record<string, unknown> => ({
  email: "a@example.edu",
  userId: "aa000000-0000-4000-8000-000000000001",
  roles: ["ADMIN"],
  tokenVersion: 1,
});
const asStudent = (): Record<string, unknown> => ({
  email: "s@example.edu",
  userId: L1,
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): Record<string, unknown> | null => null;

const GET = "/api/v1/research/learner-model/calibration";

describe("authz shells (SecurityConfig.java:88-90 — BEFORE any query)", () => {
  test("anonymous → Boot 401 body with the request path, zero sql", async () => {
    const { app, sql } = makeApp(anon, []);
    const res = await app.request(GET);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/research/learner-model/calibration");
    expect(typeof body.timestamp).toBe("string");
    expect(sql.queries.length).toBe(0);
  });

  test("authenticated STUDENT → Boot 403 body (hasAnyRole TEACHER/ADMIN), zero sql", async () => {
    const { app, sql } = makeApp(asStudent, []);
    const res = await app.request(GET);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/api/v1/research/learner-model/calibration");
    expect(sql.queries.length).toBe(0);
  });

  test("ADMIN passes the shell (the method-level re-gate collapses into the same check)", async () => {
    const { app } = makeApp(asAdmin, []);
    const res = await app.request(GET);
    expect(res.status).toBe(200);
  });
});

describe("nodeId query binding (@RequestParam UUID — :167-172 law)", () => {
  test("unparseable nodeId → 400 bad_request with the FIXED 'malformed request' body, zero sql", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${GET}?nodeId=not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(sql.queries.length).toBe(0);
  });

  test("uppercase nodeId canonicalizes to lowercase before the STRICT payload comparison", async () => {
    const rows = [mcq4(L1), mcq4(L2), mcq4(L3), mcq4(L4), mcq4(L5)];
    const { app } = makeApp(asTeacher, rows);
    const upper = NODE_A.toUpperCase();
    const res = await app.request(`${GET}?nodeId=${upper}`);
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.sampleCount).toBe(5); // canonical lowercase matches the payload's lowercase nodeId
  });
});

describe("the honest-zero EMPTY report (fixed taxonomy render order)", () => {
  test("empty stream → schema-valid all-empty report, one fetch", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(GET);
    expect(res.status).toBe(200);
    const report = await res.json();
    // canonical wire validation (contracts/research.ts)
    const parsed = calibrationReportSchema.parse(report);
    expect(parsed.sampleCount).toBe(0);
    expect(parsed.skippedRows).toBe(0);
    expect(parsed.learnerCount).toBe(0);
    expect(parsed.suppressed).toBe(false);
    expect(parsed.brier).toBe(0);
    expect(parsed.ece).toBe(0);
    expect(parsed.segments.map((s) => s.segment)).toEqual([
      "MCQ_SINGLE(2-3)",
      "MCQ_SINGLE(4)",
      "MCQ_SINGLE(5+)",
      "MCQ_SINGLE(malformed)",
      "SHORT_ANSWER",
      "STRUCTURED",
      "UNTYPED",
    ]);
    expect(parsed.gapSegments.map((s) => s.segment)).toEqual(["0", "1-30", "31-90", "91-365", "366+", "UNKNOWN"]);
    for (const seg of [...parsed.segments, ...parsed.gapSegments]) {
      expect(seg.sampleCount).toBe(0); // EMPTY: honest zeros, suppressed FALSE — distinct from C7 suppression
      expect(seg.suppressed).toBe(false);
      expect(seg.learnerCount).toBe(0);
      expect(seg.brier).toBe(0);
      expect(seg.bins.length).toBe(10);
      for (const bin of seg.bins) {
        expect(bin.count).toBe(0);
        expect(bin.meanPredicted).toBe(0);
      }
    }
    expect(parsed.bins.length).toBe(10);
    expect(parsed.bins[3]!.lowerBound).toBe(0.3);
    expect(parsed.bins[3]!.upperBound).toBe(0.4);
    expect(sql.queries.length).toBe(1);
  });
});

describe("the emission-mapped headline + known-answer reportable cell (5 distinct learners)", () => {
  test("MCQ(4) latent 0.35 all-correct ×5 → pooled + segment + bin 3 reportable (hand-computed)", async () => {
    const rows = [mcq4(L1), mcq4(L2), mcq4(L3), mcq4(L4), mcq4(L5)];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    expect(res.status).toBe(200);
    const report = await res.json();

    // slip 0.1, guess = 1/4 = 0.25 → predicted = 0.35·0.9 + 0.65·0.25 = 0.4775
    // brier = (0.4775 − 1)² = 0.27300625; ece = 1·|0.4775 − 1| = 0.5225
    expect(report.sampleCount).toBe(5);
    expect(report.skippedRows).toBe(0);
    expect(report.learnerCount).toBe(5);
    expect(report.suppressed).toBe(false);
    expect(report.brier).toBeCloseTo(0.27300625, 12);
    expect(report.ece).toBeCloseTo(0.5225, 12);

    // pooled bin 3: [0.3, 0.4) holds all five rows
    const bin3 = report.bins[3];
    expect(bin3.count).toBe(5);
    expect(bin3.meanLatentPredicted).toBeCloseTo(0.35, 12);
    expect(bin3.meanPredicted).toBeCloseTo(0.4775, 12);
    expect(bin3.observedAccuracy).toBe(1);
    expect(bin3.meanBrier).toBeCloseTo(0.27300625, 12);
    expect(bin3.calibrationError).toBeCloseTo(-0.5225, 12);
    // every OTHER pooled bin: honest zeros (count 0)
    for (let i = 0; i < 10; i++) {
      if (i !== 3) {
        expect(report.bins[i].count).toBe(0);
        expect(report.bins[i].meanPredicted).toBe(0);
      }
    }

    // the MCQ_SINGLE(4) segment partitions all five rows, reportable
    const seg = report.segments.find((s: { segment: string }) => s.segment === "MCQ_SINGLE(4)")!;
    expect(seg.sampleCount).toBe(5);
    expect(seg.learnerCount).toBe(5);
    expect(seg.suppressed).toBe(false);
    expect(seg.brier).toBeCloseTo(0.27300625, 12);
    expect(seg.bins[3].count).toBe(5);
    // partition invariant: Σ segment sampleCounts = pooled sampleCount
    const sum = report.segments.reduce((a: number, s: { sampleCount: number }) => a + s.sampleCount, 0);
    expect(sum).toBe(5);

    // gap "0" reportable with meanAnchor = 0.3 (every row carries one)
    const gap0 = report.gapSegments.find((s: { segment: string }) => s.segment === "0")!;
    expect(gap0.sampleCount).toBe(5);
    expect(gap0.meanAnchor).toBeCloseTo(0.3, 12);
  });
});

describe("C7 k-anonymity (k=5, learner unit — counts stay, outcomes go)", () => {
  test("one learner × 6 rows → pooled, segment AND bin suppressed; counts visible; empty cells stay honest zeros", async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(() =>
      ev(L1, {
        nodeId: NODE_A,
        decayedPrior: 0.15,
        correctness: true,
        questionType: "MCQ_SINGLE",
        optionCount: 2,
        gapDays: 10,
        priorMastery: 0.3,
      }),
    );
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();

    // pooled: learnerCount 1 < 5 → headline statistics null
    expect(report.sampleCount).toBe(6);
    expect(report.learnerCount).toBe(1);
    expect(report.suppressed).toBe(true);
    expect(report.brier).toBe(null);
    expect(report.ece).toBe(null);

    // the touched bin: count visible, outcomes null (count 6 > 5 — the ROW
    // floor would pass; the LEARNER floor fails — the unit is the learner)
    const bin1 = report.bins[1];
    expect(bin1.count).toBe(6);
    expect(bin1.meanLatentPredicted).toBe(null);
    expect(bin1.meanPredicted).toBe(null);
    expect(bin1.observedAccuracy).toBe(null);
    expect(bin1.meanBrier).toBe(null);
    expect(bin1.calibrationError).toBe(null);
    // untouched bins: honest zeros (EMPTY ≠ SUPPRESSED)
    expect(report.bins[0].count).toBe(0);
    expect(report.bins[0].meanPredicted).toBe(0);

    // the MCQ_SINGLE(2-3) segment: sampleCount 6 + learnerCount 1 visible,
    // statistics null
    const seg = report.segments.find((s: { segment: string }) => s.segment === "MCQ_SINGLE(2-3)")!;
    expect(seg.sampleCount).toBe(6);
    expect(seg.learnerCount).toBe(1);
    expect(seg.suppressed).toBe(true);
    expect(seg.brier).toBe(null);
    expect(seg.ece).toBe(null);
    // partition invariants hold with counts only
    const segSum = report.segments.reduce((a: number, s: { sampleCount: number }) => a + s.sampleCount, 0);
    expect(segSum).toBe(6);
    const gapSum = report.gapSegments.reduce((a: number, s: { sampleCount: number }) => a + s.sampleCount, 0);
    expect(gapSum).toBe(6);
  });

  test("6 rows from 2 learners → suppressed (a row-count floor would pass a 6-row/2-learner cell)", async () => {
    const rows = [1, 2, 3].map(() => mcq4(L1)).concat([1, 2, 3].map(() => mcq4(L2)));
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();
    expect(report.sampleCount).toBe(6);
    expect(report.learnerCount).toBe(2);
    expect(report.suppressed).toBe(true);
    expect(report.brier).toBe(null);
    const bin3 = report.bins[3];
    expect(bin3.count).toBe(6); // traffic visible
    expect(bin3.meanPredicted).toBe(null); // outcomes hidden
  });

  test("exactly 5 distinct learners in a cell → REPORTABLE (the k boundary is inclusive)", async () => {
    const rows = [mcq4(L1), mcq4(L2), mcq4(L3), mcq4(L4), mcq4(L5)];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();
    expect(report.suppressed).toBe(false);
    expect(report.brier).not.toBe(null);
    const bin3 = report.bins[3];
    expect(bin3.meanPredicted).not.toBe(null);
  });
});

describe("the format-axis pricing fold (the resolver the update path uses)", () => {
  test("8 rows over 7 learners → segment membership visible, pooled known-answer over the mixed pricing", async () => {
    const mk = (learner: string, questionType: string | null, optionCount: number | null, correct: boolean): Row =>
      ev(learner, {
        nodeId: NODE_A,
        decayedPrior: 0.5,
        correctness: correct,
        questionType,
        optionCount,
        gapDays: 0,
        priorMastery: null,
      });
    const rows = [
      mk(L1, "MCQ_SINGLE", 2, true), // guess 1/2 → predicted 0.7
      mk(L2, "MCQ_SINGLE", 4.9, true), // (int) cast → 4 → MCQ_SINGLE(4), guess 0.25 → 0.575
      mk(L3, "MCQ_SINGLE", 5, true), // (5+), guess 0.2 → 0.55
      mk(L4, "MCQ_SINGLE", 1, true), // malformed, paper 0.25 → 0.575
      mk(L5, "SHORT_ANSWER", null, true), // 0.05 → 0.925
      mk(L1, "STRUCTURED", null, true), // 0.01 → 0.945
      mk(L2, "MCQ_MULTI", 4, true), // unrecognized → UNTYPED, paper 0.25 → 0.575
      mk(L3, "   ", 4, false), // blank → UNTYPED, outcome 0 → brier 0.575²
    ];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();

    expect(report.sampleCount).toBe(8);
    // rows reuse L1-L3 — the DISTINCT learner set is {L1..L5} = 5 (the
    // inclusive k boundary: exactly 5 → pooled reportable)
    expect(report.learnerCount).toBe(5);
    expect(report.suppressed).toBe(false);

    // pooled bin 5 (all latent 0.5 → floor(0.5·10) = 5): predicted =
    // 0.45 + 0.5·guess per row → [0.70, 0.575, 0.55, 0.575, 0.475, 0.455,
    // 0.575, 0.575], Σ = 4.48 → meanPredicted = 0.56; observed = 7/8;
    // brier Σ = 1.73765 → meanBrier = 0.21720625; ece = |0.56 − 0.875| = 0.315
    const bin4 = report.bins[5];
    expect(bin4.count).toBe(8);
    expect(bin4.meanLatentPredicted).toBeCloseTo(0.5, 12);
    expect(bin4.meanPredicted).toBeCloseTo(0.56, 12);
    expect(bin4.observedAccuracy).toBeCloseTo(0.875, 12);
    expect(bin4.meanBrier).toBeCloseTo(0.21720625, 12);
    expect(report.brier).toBeCloseTo(0.21720625, 12);
    expect(report.ece).toBeCloseTo(0.315, 12);

    // segment membership (counts visible regardless of per-segment suppression)
    const counts = Object.fromEntries(
      report.segments.map((s: { segment: string; sampleCount: number }) => [s.segment, s.sampleCount]),
    );
    expect(counts["MCQ_SINGLE(2-3)"]).toBe(1);
    expect(counts["MCQ_SINGLE(4)"]).toBe(1); // 4.9 truncated by the (int) cast law
    expect(counts["MCQ_SINGLE(5+)"]).toBe(1);
    expect(counts["MCQ_SINGLE(malformed)"]).toBe(1); // oc 1 → paper guess, malformed stratum
    expect(counts["SHORT_ANSWER"]).toBe(1);
    expect(counts["STRUCTURED"]).toBe(1);
    expect(counts["UNTYPED"]).toBe(2); // MCQ_MULTI + blank fold — priced identically (paper)
    const segSum = report.segments.reduce((a: number, s: { sampleCount: number }) => a + s.sampleCount, 0);
    expect(segSum).toBe(8);
  });
});

describe("the gap axis (τ bands, meanAnchor, UNKNOWN tail, string gapDays)", () => {
  test("band membership + anchor laws across 13 contract rows", async () => {
    const mk = (learner: string, gapDays: unknown, anchor: number | null): Row =>
      ev(learner, {
        nodeId: NODE_A,
        decayedPrior: 0.5,
        correctness: true,
        questionType: "SHORT_ANSWER",
        gapDays,
        priorMastery: anchor,
      });
    const rows = [
      mk(L1, 0, 0.3), // ── band "0" ×5 (5 learners → reportable, meanAnchor 0.3)
      mk(L2, 0, 0.3),
      mk(L3, 0, 0.3),
      mk(L4, 0, 0.3),
      mk(L5, 0, 0.3),
      mk(L1, 15, 0.2), // ── band "1-30" ×3 (3 learners → suppressed)
      mk(L2, 15, 0.4),
      mk(L3, "30", 0.1), // numeric STRING bands like the number (longValue)
      mk(L4, 60, null), // ── band "31-90" (anchorless row)
      mk(L5, 400, 0.9), // ── band "366+"
      mk(L1, "30.5", 0.5), // ── UNKNOWN ×3 (Long.parseLong strictness)
      mk(L2, -5, 0.5), // negative → UNKNOWN
      mk(L3, undefined, 0.5), // missing → UNKNOWN (a populated UNKNOWN is a payload finding)
    ];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();

    expect(report.sampleCount).toBe(13);
    expect(report.skippedRows).toBe(0);
    const byKey = Object.fromEntries(
      report.gapSegments.map((s: { segment: string }) => [s.segment, s]),
    );
    expect(byKey["0"].sampleCount).toBe(5);
    expect(byKey["0"].learnerCount).toBe(5);
    expect(byKey["0"].suppressed).toBe(false);
    expect(byKey["0"].meanAnchor).toBeCloseTo(0.3, 12);

    expect(byKey["1-30"].sampleCount).toBe(3);
    expect(byKey["1-30"].learnerCount).toBe(3);
    expect(byKey["1-30"].suppressed).toBe(true);
    expect(byKey["1-30"].meanAnchor).toBe(null); // suppressed — outcomes AND anchors hide

    expect(byKey["31-90"].sampleCount).toBe(1);
    expect(byKey["91-365"].sampleCount).toBe(0); // empty band renders with honest zeros
    expect(byKey["91-365"].meanAnchor).toBe(0); // anchor() with anchorN = 0 → 0.0, suppressed false
    expect(byKey["91-365"].suppressed).toBe(false);
    expect(byKey["366+"].sampleCount).toBe(1);
    expect(byKey["366+"].suppressed).toBe(true); // 1 learner < 5

    expect(byKey["UNKNOWN"].sampleCount).toBe(3); // "30.5" / −5 / missing all land UNKNOWN
    expect(byKey["UNKNOWN"].learnerCount).toBe(3);
  });
});

describe("the nodeId filter (filtered ≠ malformed; strict equality)", () => {
  test("other-node rows and non-string nodeIds land in NEITHER bucket", async () => {
    const rows = [
      mcq4(L1),
      mcq4(L2),
      mcq4(L3),
      mcq4(L4),
      mcq4(L5),
      mcq4(L1, NODE_B), // different node → filtered, NOT skipped
      mcq4(L2, NODE_B),
      ev(L3, { nodeId: 42, decayedPrior: 0.5, correctness: true }), // non-string nodeId never matches
    ];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(`${GET}?nodeId=${NODE_A}`);
    const report = await res.json();
    expect(report.sampleCount).toBe(5); // only NODE_A rows
    expect(report.skippedRows).toBe(0); // filtered rows count in NEITHER bucket
    expect(report.learnerCount).toBe(5);
  });

  test("no filter → every contract row aggregates", async () => {
    const rows = [
      mcq4(L1),
      mcq4(L2),
      mcq4(L3),
      mcq4(L4),
      mcq4(L5),
      mcq4(L1, NODE_B),
      ev(L3, { nodeId: 42, decayedPrior: 0.5, correctness: true, questionType: "MCQ_SINGLE", optionCount: 4 }),
    ];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();
    expect(report.sampleCount).toBe(7);
    expect(report.skippedRows).toBe(0);
  });
});

describe("the skip-before-filter walk (malformed/legacy rows — honest counting)", () => {
  test("missing/typed-wrong/out-of-range latents skip globally and never reach a segment; numeric-STRING decayedPrior aggregates", async () => {
    const rows = [
      mcq4(L1),
      mcq4(L2),
      mcq4(L3),
      mcq4(L4),
      // L5's valid row carries a STRING decayedPrior — the defensive parser accepts it
      ev(L5, {
        nodeId: NODE_A,
        decayedPrior: "0.35",
        correctness: true,
        questionType: "MCQ_SINGLE",
        optionCount: 4,
        gapDays: 0,
        priorMastery: 0.3,
      }),
      ev(L1, { correctness: true }), // no decayedPrior → legacy/pre-C1 → skipped
      ev(L2, { decayedPrior: 0.5, correctness: "true" }), // string correctness is NOT a boolean → skipped
      ev(L3, { decayedPrior: 1.5, correctness: true }), // latent > 1 → skipped
      ev(L4, { decayedPrior: -0.1, correctness: true }), // latent < 0 → skipped
      ev(L5, { decayedPrior: "NaN", correctness: true }), // hand-crafted NaN string → skipped (disclosed posture)
    ];
    const { app } = makeApp(asTeacher, rows);
    const res = await app.request(GET);
    const report = await res.json();
    expect(report.sampleCount).toBe(5);
    expect(report.skippedRows).toBe(5); // counted globally, never attributed to a segment
    const segSum = report.segments.reduce((a: number, s: { sampleCount: number }) => a + s.sampleCount, 0);
    expect(segSum).toBe(5); // the skipped rows appear in NO segment
    const bin3 = report.bins[3];
    expect(bin3.count).toBe(5); // the string-latent row binned identically (0.35 → bin 3)
  });
});
