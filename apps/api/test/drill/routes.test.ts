/**
 * F-182 build — the drill route battery (routes/drill + services/drill/{serve,
 * store,bank}) over a SYNTHETIC bank on stubbed sql (the assessment/helpers
 * fakeSql style). The real-bundle integration pins live in bank.test.ts; the
 * opening's pure-module pins (P1..P6) stay in draw.test.ts, untouched.
 *
 * Pinned here:
 *   - the authz shell (anonymous 401 BEFORE any handler — all three paths)
 *   - addresses: the census summary + drillable-only rows; unknown course 404
 *   - draw: 201 happy path (contracts-validated, no answer facts in the
 *     payload); determinism (same seed + recency -> same parts); the store
 *     records the draw; below-floor 409 (P3 verbatim); unknown address 404;
 *     malformed bodies 400
 *   - evidence: the F-055 shape over the drill address space — MCQ
 *     server-graded (correct + marksAwarded + instant solutionMd reveal),
 *     structured recorded UNGRADED (null/null — never 0), duplicate 409
 *     (immutability), part-not-in-draw 400, unknown/foreign draw 404
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";

import {
  drillAddressesResponseSchema,
  drillDrawResponseSchema,
  drillEvidenceResponseSchema,
} from "@syllabai/contracts";

import { createDrillRouter, drillErrorResponse } from "../../src/routes/drill";
import { UnknownCourseError, type DrillBank } from "../../src/services/drill/bank";
import { createDrillStore } from "../../src/services/drill/store";
import type { SqlFn } from "../../src/services/tutor/sql";
import { fakeSql } from "../assessment/helpers";

const LEARNER_ID = "cc000000-0000-4000-8000-000000000001";
const DRAW_ID = "d1000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "e1000000-0000-4000-8000-000000000001";

// ---------------------------------------------------------------- bank stub

const CODE = "4CH1-1.25";
const THIN = "4CH1-9.99";
const PART_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];

function part(i: number) {
  return {
    partId: PART_IDS[i]!,
    questionId: `q${i}`,
    setId: "official-4ch1-1c-2019-06",
    plane: "official" as const,
    order: i,
    marks: 1,
    specPointCodes: [CODE],
  };
}

function bankStub(): DrillBank {
  const parts = PART_IDS.map((_, i) => part(i));
  const content = new Map(
    PART_IDS.map((id, i) => [
      id,
      {
        problemMd: `problem ${id}`,
        questionType: i % 2 === 0 ? "multiple_choice" : "structured",
        commandWord: null,
        choices:
          i % 2 === 0
            ? [
                { label: "A", textMd: "wrong" },
                { label: "B", textMd: "right" },
              ]
            : null,
      },
    ]),
  );
  const correctChoice = new Map(
    PART_IDS.filter((_, i) => i % 2 === 0).map((id) => [id, "B"]),
  );
  return {
    course: "igcse-chemistry-19",
    parts,
    addressRows: [
      { code: CODE, official: 7, topic: 0, combined: 7, drillable: true },
      { code: THIN, official: 2, topic: 0, combined: 2, drillable: false },
    ],
    censusSummary: { specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 },
    poolOf: (code) => (code === CODE ? parts : []),
    contentOf: (id) => content.get(id) ?? null,
    marksOf: (id) => (content.has(id) ? 1 : null),
    isCorrectChoice: (id, label) => {
      const right = correctChoice.get(id);
      return right === undefined ? null : right === label;
    },
    solutionOf: (id) => (content.has(id) ? `solution ${id}` : null),
    markSchemeOf: () => null, // F-183: this battery keeps the MS-less stub; the law battery carries the MS-bearing one
  };
}

// ---------------------------------------------------------------- store stub

function sqlStub(rows: Record<string, Array<Record<string, unknown>>> = {}) {
  return fakeSql([
    {
      match: /insert into drill_draws/,
      rows: [{ id: DRAW_ID, created_at: "2026-10-23T00:00:00Z" }],
    },
    { match: /select part_ids from drill_draws/, rows: rows.recent ?? [{ part_ids: [] }] },
    {
      match: /select id, learner_id, course, code, seed, part_ids, pool_size, fresh_pool_size, used_fallback, created_at from drill_draws/,
      rows: rows.draws ?? [],
      rowsFor: (p) =>
        (rows.draws ?? []).filter((d) => d.id === p[0] && d.learner_id === p[1]) as Array<Record<string, unknown>>,
    },
    { match: /select id from drill_part_evidence/, rows: rows.existingEvidence ?? [] },
    { match: /insert into drill_part_evidence/, rows: [{ id: EVIDENCE_ID, created_at: "2026-10-23T00:00:01Z" }] },
    {
      // F-185 — the draw's reading read: the SAME read-only projection the
      // F-184 strengths route serves from (the drill's own evidence lane).
      match: /select code, part_id, marks_awarded, marks_possible, created_at from drill_part_evidence/,
      rows: rows.evidence ?? [],
      rowsFor: (p) =>
        (rows.evidence ?? []).filter((e) => e.learner_id === p[0] && e.course === p[1]) as Array<
          Record<string, unknown>
        >,
    },
  ]) as unknown as SqlFn & { queries: string[] };
}

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  bank: DrillBank = bankStub(),
  sql: SqlFn = sqlStub(),
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  // the fail-closed registry, mirrored at the seam: only the stub's course resolves
  const bankOf = (course: string) => {
    if (course !== bank.course) throw new UnknownCourseError(course);
    return bank;
  };
  app.route("/api/v1/learners/me/drill", createDrillRouter({ bankOf, store: createDrillStore(sql) }));
  app.onError((err, c) => {
    const mapped = drillErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-23T00:00:00Z" }, 500 as const);
  });
  return app;
}

const STUDENT = { email: "student@example.edu", userId: LEARNER_ID, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

// ---------------------------------------------------------------- authz shell

describe("drill authz shell", () => {
  for (const [path, init] of [
    ["/api/v1/learners/me/drill/addresses?course=igcse-chemistry-19", { method: "GET" }],
    ["/api/v1/learners/me/drill/draw", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
    ["/api/v1/learners/me/drill/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
  ] as const) {
    test(`anonymous ${path.split("?")[0]} -> 401 (never 404)`, async () => {
      const res = await makeApp(anon).request(path, init);
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------- addresses

describe("GET /addresses", () => {
  test("serves the census summary + drillable-only rows (policy P3)", async () => {
    const res = await makeApp(asStudent).request("/api/v1/learners/me/drill/addresses?course=igcse-chemistry-19");
    expect(res.status).toBe(200);
    const body = drillAddressesResponseSchema.parse(await res.json());
    expect(body.summary).toEqual({ specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 });
    expect(body.addresses.map((a) => a.code)).toEqual([CODE]); // THIN stays out
  });

  test("missing course -> 400 bad_request; unknown course -> 404 not_found", async () => {
    const missing = await makeApp(asStudent).request("/api/v1/learners/me/drill/addresses");
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("bad_request");

    const unknown = await makeApp(asStudent).request("/api/v1/learners/me/drill/addresses?course=igcse-physics-19");
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe("not_found");
  });
});

// ---------------------------------------------------------------- draw

describe("POST /draw", () => {
  test("201: contracts-validated draw with NO answer facts in the payload", async () => {
    const res = await makeApp(asStudent).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
    });
    expect(res.status).toBe(201);
    const body = drillDrawResponseSchema.parse(await res.json());
    expect(body.code).toBe(CODE);
    expect(body.seed).toBe(7);
    expect(body.parts).toHaveLength(5);
    expect(body.usedFallback).toBe(false);
    expect(body.freshPoolSize).toBe(7);
    // F-185 — the stub carries no evidence: the sparse-state law (M4) serves
    // the random policy of record (P1..P6 verbatim), disclosed on the wire.
    expect(body.selection).toEqual({ policy: "random", sparseFallback: true, explorationSlots: 0 });
    for (const p of body.parts) {
      expect(p.problemMd).toMatch(/^problem p\d$/);
      if (p.choices) for (const ch of p.choices) expect(Object.keys(ch).sort()).toEqual(["label", "textMd"]);
      expect(JSON.stringify(body)).not.toContain("solution");
      expect(JSON.stringify(p)).not.toContain("isCorrect");
    }
  });

  test("determinism (P5): same seed + same recency -> the same part order", async () => {
    const call = async () =>
      await makeApp(asStudent).request("/api/v1/learners/me/drill/draw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 42 }),
      });
    const a = (await (await call()).json()) as { parts: { partId: string }[] };
    const b = (await (await call()).json()) as { parts: { partId: string }[] };
    expect(a.parts.map((p) => p.partId)).toEqual(b.parts.map((p) => p.partId));
  });

  test("recency (P4): recent parts excluded while the fresh pool covers a full draw", async () => {
    const recent = [{ part_ids: ["p1", "p2"] }, { part_ids: ["p3"] }];
    const res = await makeApp(asStudent, bankStub(), sqlStub({ recent })).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
    });
    const body = drillDrawResponseSchema.parse(await res.json());
    expect(body.freshPoolSize).toBe(4);
    // 7-part pool, 3 recently-seen -> fresh pool 4 < DRAW_SIZE: the thin-pool
    // retakability override (P4) draws from the FULL pool and discloses it.
    expect(body.usedFallback).toBe(true);
    expect(body.parts).toHaveLength(5);
    expect(body.poolSize).toBe(7);
    const drawn = body.parts.map((p) => p.partId);
    expect(new Set(drawn).size).toBe(5);
  });

  test("recency (P4) strict path: enough fresh parts -> no fallback, recent ids never drawn", async () => {
    const recent = [{ part_ids: ["p1", "p2"] }];
    const bank = bankStub();
    const res = await makeApp(asStudent, bank, sqlStub({ recent })).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
    });
    const body = drillDrawResponseSchema.parse(await res.json());
    expect(body.freshPoolSize).toBe(5);
    expect(body.usedFallback).toBe(false);
    for (const p of body.parts) expect(["p1", "p2"]).not.toContain(p.partId);
  });

  test("below-floor address -> 409 conflict (P3 verbatim message)", async () => {
    const thinBank: DrillBank = {
      ...bankStub(),
      parts: [part(0), part(1), part(2)],
      poolOf: (code) => (code === THIN ? [part(0), part(1), part(2)] : []),
    };
    const res = await makeApp(asStudent, thinBank).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: THIN, seed: 7 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toContain("below the drillable floor");
  });

  test("unknown address -> 404 not_found", async () => {
    const res = await makeApp(asStudent).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: "4CH1-8.88", seed: 7 }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  test("malformed body -> 400 malformed_body (empty body, bad seed, missing code)", async () => {
    const app = makeApp(asStudent);
    const empty = await app.request("/api/v1/learners/me/drill/draw", { method: "POST" });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe("malformed_body");

    const badSeed = await app.request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 1.5 }),
    });
    expect(badSeed.status).toBe(400);
  });
});

// ------------------------------------------------- F-185 the model-driven draw

describe("POST /draw — F-185 the model-driven selection", () => {
  const W2 = "4CH1-2.10";
  const S2 = "4CH1-3.30";

  // a model bank: every part rides the address; ga-weak ALSO rides the weak
  // secondary code, gz-sec ALSO rides the secure one (the M3 discriminators).
  function modelBank(): DrillBank {
    const ids = ["ga-weak", "gz-sec", "gb-0", "gc-1", "gd-2", "ge-3", "gf-4"];
    const codes = (id: string) => (id === "ga-weak" ? [CODE, W2] : id === "gz-sec" ? [CODE, S2] : [CODE]);
    const parts = ids.map((id, i) => ({
      partId: id,
      questionId: `q-${id}`,
      setId: "official-4ch1-1c-2019-06",
      plane: "official" as const,
      order: i,
      marks: 1,
      specPointCodes: codes(id),
    }));
    const content = new Map(ids.map((id) => [id, {
      problemMd: `problem ${id}`,
      questionType: "multiple_choice",
      commandWord: null,
      choices: [{ label: "A", textMd: "wrong" }],
    }]));
    return {
      course: "igcse-chemistry-19",
      parts,
      addressRows: [{ code: CODE, official: ids.length, topic: 0, combined: ids.length, drillable: true }],
      censusSummary: { specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 },
      poolOf: (code) => (code === CODE ? parts : []),
      contentOf: (id) => content.get(id) ?? null,
      marksOf: (id) => (content.has(id) ? 1 : null),
      isCorrectChoice: () => null,
      solutionOf: (id) => (content.has(id) ? `solution ${id}` : null),
      markSchemeOf: () => null,
    };
  }

  // 5 graded rows course-wide (the M4 floor met): 3 weak rows (anchor 0 ->
  // the floor 0.1 strength) + 2 secure rows graded THIS instant (strength 1).
  const NOW = "2026-10-23T12:00:00Z";
  function modelEvidence() {
    return [
      { learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: W2, part_id: "w1", marks_awarded: 0, marks_possible: 1, created_at: "2026-09-01T00:00:00Z" },
      { learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: W2, part_id: "w2", marks_awarded: 0, marks_possible: 1, created_at: "2026-09-02T00:00:00Z" },
      { learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: W2, part_id: "w3", marks_awarded: 0, marks_possible: 1, created_at: "2026-09-03T00:00:00Z" },
      { learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: S2, part_id: "s1", marks_awarded: 1, marks_possible: 1, created_at: NOW },
      { learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: S2, part_id: "s2", marks_awarded: 1, marks_possible: 1, created_at: NOW },
    ];
  }

  test("the model policy serves above the sparse floor and discloses itself (never a state number)", async () => {
    const res = await makeApp(asStudent, modelBank(), sqlStub({ evidence: modelEvidence() })).request(
      "/api/v1/learners/me/drill/draw",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 20261023 }),
      },
    );
    expect(res.status).toBe(201);
    const body = drillDrawResponseSchema.parse(await res.json());
    expect(body.selection).toEqual({ policy: "model", sparseFallback: false, explorationSlots: 1 });
    // the weak-secondary part always rides the greedy slot 1 (M3 through the wire)
    expect(body.parts.map((p) => p.partId)).toContain("ga-weak");
    expect(body.parts).toHaveLength(5);
    // anti-gaming (M6): the wire carries the POLICY, never the reading's numbers
    expect(JSON.stringify(body)).not.toContain("strength");
  });

  test("M6 determinism through the wire: same seed + same evidence -> the same model draw", async () => {
    const call = async () =>
      await makeApp(asStudent, modelBank(), sqlStub({ evidence: modelEvidence() })).request(
        "/api/v1/learners/me/drill/draw",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
        },
      );
    const a = (await (await call()).json()) as { parts: { partId: string }[] };
    const b = (await (await call()).json()) as { parts: { partId: string }[] };
    expect(a.parts.map((p) => p.partId)).toEqual(b.parts.map((p) => p.partId));
  });

  test("the zero-stakes law on the wire: the draw's SQL is SELECTs on the drill's own lane + the draw insert", async () => {
    const sql = sqlStub({ evidence: modelEvidence() });
    await makeApp(asStudent, modelBank(), sql).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
    });
    expect(sql.queries.length).toBeGreaterThan(0); // the shell is not vacuous: the draw fired its reads
    for (const q of sql.queries) {
      expect(q.startsWith("select") || q.startsWith("insert into drill_draws")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- evidence

function drawRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DRAW_ID,
    learner_id: LEARNER_ID,
    course: "igcse-chemistry-19",
    code: CODE,
    seed: 7,
    part_ids: ["p1", "p2"],
    pool_size: 7,
    fresh_pool_size: 7,
    used_fallback: false,
    created_at: "2026-10-23T00:00:00Z",
    ...overrides,
  };
}

describe("POST /evidence — the F-055-shaped seam", () => {
  const base = {
    drawId: DRAW_ID,
    partId: "p1",
    response: { kind: "choice", label: "B" },
    responseTimeMs: 4200,
    confidenceLevel: 4,
    selfDoubtFlag: false,
  };

  test("MCQ: server-graded (correct B -> marksAwarded 1) + the instant solutionMd reveal", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()] })).request(
      "/api/v1/learners/me/drill/evidence",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      },
    );
    expect(res.status).toBe(201);
    const body = drillEvidenceResponseSchema.parse(await res.json());
    expect(body.correct).toBe(true);
    expect(body.marksAwarded).toBe(1);
    expect(body.marksPossible).toBe(1);
    expect(body.solutionMd).toBe("solution p1");
  });

  test("MCQ wrong label -> correct false, marksAwarded 0, the reveal still instant", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()] })).request(
      "/api/v1/learners/me/drill/evidence",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, response: { kind: "choice", label: "A" } }),
      },
    );
    expect(res.status).toBe(201);
    const body = drillEvidenceResponseSchema.parse(await res.json());
    expect(body.correct).toBe(false);
    expect(body.marksAwarded).toBe(0);
    expect(body.solutionMd).toBe("solution p1");
  });

  test("structured: recorded UNGRADED — correct/marksAwarded null, never 0; reveal rides the ack", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()] })).request(
      "/api/v1/learners/me/drill/evidence",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, partId: "p2", response: { kind: "text", text: "condensation" } }),
      },
    );
    expect(res.status).toBe(201);
    const body = drillEvidenceResponseSchema.parse(await res.json());
    expect(body.correct).toBeNull();
    expect(body.marksAwarded).toBeNull();
    expect(body.marksPossible).toBe(1);
    expect(body.solutionMd).toBe("solution p2");
  });

  test("second evidence write for the same (draw, part) -> 409 conflict (immutability)", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()], existingEvidence: [{ id: EVIDENCE_ID }] })).request(
      "/api/v1/learners/me/drill/evidence",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("conflict");
  });

  test("part not in the draw -> 400 bad_request", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()] })).request(
      "/api/v1/learners/me/drill/evidence",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, partId: "p5" }),
      },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
  });

  test("unknown or foreign draw -> 404 not_found (ownership-scoped, no state leak)", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub({ draws: [] })).request("/api/v1/learners/me/drill/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(base),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  test("choice response on a structured part -> 400 bad_request (the bank refuses to grade what has no choices)", async () => {
    const app = makeApp(asStudent, bankStub(), sqlStub({ draws: [drawRow()] }));
    const structured = await app.request("/api/v1/learners/me/drill/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, partId: "p2", response: { kind: "choice", label: "B" } }),
    });
    expect(structured.status).toBe(400);

    const badConfidence = await app.request("/api/v1/learners/me/drill/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, confidenceLevel: 9 }),
    });
    expect(badConfidence.status).toBe(400);
    expect((await badConfidence.json()).error).toBe("malformed_body");
  });
});
