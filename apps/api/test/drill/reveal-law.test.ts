/**
 * F-183 — the instant MS-reveal law battery (services/drill/reveal.ts + the
 * evidence seam wiring). The law is the prereg of record
 * docs/F183-MS-REVEAL-LAW-PLAN.md §2 (L1..L6); the real-bundle MS pins live
 * in bank.test.ts, the F-182 route battery stays untouched in routes.test.ts.
 *
 * Pinned here:
 *   - L3 verbatim: the ack's markScheme IS the bank's MS of record (deep
 *     equality; corpus order; derived marksTotal; answerStatus verbatim)
 *   - L2 never teacher-gated: NO validationState exists anywhere on the drill
 *     MS view — the AI-extracted mark_schemes plane cannot reach the ack
 *   - L4 method credit: structured text responses get the Smart Mark verdict
 *     (per-point boolean + rationale + creditsTotal); MCQ parts NEVER do
 *   - L6 honest nulls: unlinked parts, dormant generators, invalid generator
 *     output, missing MS — the ack degrades, never paraphrases
 *   - L5 boundaries: the draw response schema carries no reveal fields; the
 *     evidence ack with no generator composed still reveals the MS
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  drillDrawResponseSchema,
  drillEvidenceResponseSchema,
} from "@syllabai/contracts";

import { createDrillRouter, drillErrorResponse } from "../../src/routes/drill";
import { UnknownCourseError, type DrillBank, type DrillBankMarkScheme } from "../../src/services/drill/bank";
import {
  revealForEvidence,
  validateMethodCreditAllocations,
  type DrillMethodCreditGenerator,
} from "../../src/services/drill/reveal";
import { createDrillStore } from "../../src/services/drill/store";
import type { SqlFn } from "../../src/services/tutor/sql";
import { fakeSql } from "../assessment/helpers";

const LEARNER_ID = "cc000000-0000-4000-8000-000000000001";
const DRAW_ID = "d1000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "e1000000-0000-4000-8000-000000000001";
const CODE = "4CH1-1.25";
const PART_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];

// The MS of record fixture (the corpus shape: corpus point ids, verbatim text)
const MS_P1: DrillBankMarkScheme = {
  answerStatus: "linked",
  points: [
    { ref: "2019-06-2-a-MP1", textMd: "State that the crystal dissolves in the water; **[1 mark]**", marks: 1 },
    { ref: "2019-06-2-a-MP2", textMd: "Method: filter the residue and wash with distilled water", marks: 1 },
  ],
  marksTotal: 2,
};

/** The wire projection of MS_P1 (the bank shape + the corpus-of-record stamp). */
const MS_P1_WIRE = { source: "corpus-of-record" as const, ...MS_P1, points: [...MS_P1.points] };

function part(i: number) {
  return {
    partId: PART_IDS[i]!,
    questionId: `q${i}`,
    setId: "official-4ch1-1c-2019-06",
    plane: "official" as const,
    order: i,
    marks: i === 0 ? 2 : 1, // p1 carries the two-point MS of record
    specPointCodes: [CODE],
  };
}

/** MS-bearing bank stub: p1 linked (2 points), p2 structured unlinked, evens MCQ. */
function msBankStub(): DrillBank {
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
  const correctChoice = new Map(PART_IDS.filter((_, i) => i % 2 === 0).map((id) => [id, "B"]));
  const ms = new Map<string, DrillBankMarkScheme>([["p1", MS_P1]]);
  return {
    course: "igcse-chemistry-19",
    parts,
    addressRows: [{ code: CODE, official: 7, topic: 0, combined: 7, drillable: true }],
    censusSummary: { specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 },
    poolOf: (code) => (code === CODE ? parts : []),
    contentOf: (id) => content.get(id) ?? null,
    marksOf: (id) => (content.has(id) ? (id === "p1" ? 2 : 1) : null),
    isCorrectChoice: (id, label) => {
      const right = correctChoice.get(id);
      return right === undefined ? null : right === label;
    },
    solutionOf: (id) => (content.has(id) ? `solution ${id}` : null),
    markSchemeOf: (id) => ms.get(id) ?? null,
  };
}

function stubGenerator(overrides: {
  available?: () => boolean;
  credit?: () => Promise<
    { ref: string; methodCredited: boolean; rationale: string }[]
  >;
} = {}): DrillMethodCreditGenerator {
  return {
    pipelineVersion: "f183-method-credit-test-1.0.0",
    available: overrides.available ?? (() => true),
    credit:
      overrides.credit ??
      (() =>
        Promise.resolve([
          { ref: "2019-06-2-a-MP1", methodCredited: true, rationale: "The response states the crystal dissolves." },
          { ref: "2019-06-2-a-MP2", methodCredited: false, rationale: "No filtering method is described." },
        ])),
  };
}

function sqlStub() {
  return fakeSql([
    {
      match: /insert into drill_draws/,
      rows: [{ id: DRAW_ID, created_at: "2026-10-23T00:00:00Z" }],
    },
    { match: /select part_ids from drill_draws/, rows: [{ part_ids: [] }] },
    {
      match: /select id, learner_id, course, code, seed, part_ids, pool_size, fresh_pool_size, used_fallback, created_at from drill_draws/,
      rows: [],
      rowsFor: (p: unknown[]) =>
        [{ id: DRAW_ID, learner_id: LEARNER_ID, course: "igcse-chemistry-19", code: CODE, seed: 7, part_ids: PART_IDS, pool_size: 7, fresh_pool_size: 7, used_fallback: false, created_at: "2026-10-23T00:00:00Z" }].filter(
          (d) => d.id === p[0] && d.learner_id === p[1],
        ) as unknown as Array<Record<string, unknown>>,
    },
    { match: /select id from drill_part_evidence/, rows: [] },
    { match: /insert into drill_part_evidence/, rows: [{ id: EVIDENCE_ID, created_at: "2026-10-23T00:00:01Z" }] },
  ]) as unknown as SqlFn;
}

function makeApp(generator: DrillMethodCreditGenerator | null = null) {
  const bank = msBankStub();
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a: Record<string, unknown> | null = { email: "student@example.edu", userId: LEARNER_ID, roles: ["STUDENT"], tokenVersion: 1 };
    c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const bankOf = (course: string) => {
    if (course !== bank.course) throw new UnknownCourseError(course);
    return bank;
  };
  app.route("/api/v1/learners/me/drill", createDrillRouter({ bankOf, store: createDrillStore(sqlStub()), methodCreditGenerator: generator }));
  app.onError((err, c) => {
    const mapped = drillErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    return c.json({ status: 500, error: "internal_error", message: "internal", timestamp: "2026-10-23T00:00:00Z" }, 500 as const);
  });
  return app;
}

const evidenceInit = (partId: string, kind: "choice" | "text") => ({
  method: "POST" as const,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    kind === "choice"
      ? { drawId: DRAW_ID, partId, response: { kind: "choice", label: "B" }, responseTimeMs: 4211, confidenceLevel: 4, selfDoubtFlag: false }
      : { drawId: DRAW_ID, partId, response: { kind: "text", text: "The crystal dissolves in the water and then I would filter it." }, responseTimeMs: 90034, confidenceLevel: 3, selfDoubtFlag: true },
  ),
});

// ---------------------------------------------------------------- law L3

describe("F-183 law L3 — the MS of record renders VERBATIM", () => {
  test("revealForEvidence passes the bank's MS through deep-equal (corpus order, derived marksTotal)", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p1", { responseKind: "text", responseText: "x" }, stubGenerator());
    expect(reveal.markScheme).not.toBeNull();
    expect(reveal.markScheme!).toEqual(MS_P1_WIRE); // verbatim: refs, textMd, marks, order, answerStatus + the source stamp
    expect(reveal.methodCredit).not.toBeNull();
  });

  test("the drill MS view has NO validationState — the gated plane cannot reach the ack (law L2)", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p1", null, null);
    expect(reveal.markScheme).not.toBeNull();
    expect(Object.keys(reveal.markScheme!).sort()).toEqual(["answerStatus", "marksTotal", "points", "source"]);
    expect("validationState" in reveal.markScheme!).toBe(false); // law L2: the gated plane's field cannot exist here
  });
});

// ---------------------------------------------------------------- law L4

describe("F-183 law L4 — Smart Mark method credit on structured parts", () => {
  test("structured text response + live generator -> the per-point verdict with creditsTotal", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p1", { responseKind: "text", responseText: "answer" }, stubGenerator());
    expect(reveal.methodCredit).toEqual({
      engine: "smart-mark",
      pipelineVersion: "f183-method-credit-test-1.0.0",
      allocations: [
        { ref: "2019-06-2-a-MP1", methodCredited: true, rationale: "The response states the crystal dissolves." },
        { ref: "2019-06-2-a-MP2", methodCredited: false, rationale: "No filtering method is described." },
      ],
      creditsTotal: 1,
    });
  });

  test("MCQ parts NEVER carry a method-credit verdict (server-graded already)", async () => {
    const bank = msBankStub();
    const gen = stubGenerator();
    const spy = (() => {
      let called = 0;
      const inner = gen.credit.bind(gen);
      (gen as { credit: typeof gen.credit }).credit = (input) => {
        called += 1;
        return inner(input);
      };
      return () => called;
    })();
    const reveal = await revealForEvidence(bank, "p1", { responseKind: "choice", responseText: "" }, gen);
    expect(reveal.methodCredit).toBeNull();
    expect(spy()).toBe(0); // the generator is never even consulted for MCQ
  });

  test("structured part with NO MS of record -> no verdict, generator never called (L4 against MS of record only)", async () => {
    const bank = msBankStub();
    const gen = stubGenerator();
    let called = 0;
    const inner = gen.credit.bind(gen);
    (gen as { credit: typeof gen.credit }).credit = (input) => {
      called += 1;
      return inner(input);
    };
    const reveal = await revealForEvidence(bank, "p3", { responseKind: "text", responseText: "answer" }, gen);
    expect(reveal.markScheme).toBeNull();
    expect(reveal.methodCredit).toBeNull();
    expect(called).toBe(0);
  });
});

// ---------------------------------------------------------------- law L6

describe("F-183 law L6 — the honest nulls (never paraphrase, never invent)", () => {
  test("dormant generator (zero-key posture) -> methodCredit null, the MS still reveals", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p1", { responseKind: "text", responseText: "answer" }, stubGenerator({ available: () => false }));
    expect(reveal.markScheme).toEqual(MS_P1_WIRE);
    expect(reveal.methodCredit).toBeNull();
  });

  test("generator throws (provider unavailable / truncated) -> null verdict, MS unaffected", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(
      bank,
      "p1",
      { responseKind: "text", responseText: "answer" },
      stubGenerator({ credit: () => Promise.reject(new Error("PROVIDER_UNAVAILABLE")) }),
    );
    expect(reveal.markScheme).toEqual(MS_P1_WIRE);
    expect(reveal.methodCredit).toBeNull();
  });

  test("invented point ref -> null verdict (the validator-trio law adapted)", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(
      bank,
      "p1",
      { responseKind: "text", responseText: "answer" },
      stubGenerator({ credit: () => Promise.resolve([{ ref: "INVENTED-MP9", methodCredited: true, rationale: "hallucinated" }]) }),
    );
    expect(reveal.methodCredit).toBeNull();
    expect(reveal.markScheme).toEqual(MS_P1_WIRE);
  });

  test("duplicate point ref -> null verdict", async () => {
    const bank = msBankStub();
    const dup = { ref: "2019-06-2-a-MP1", methodCredited: true, rationale: "dup" };
    const reveal = await revealForEvidence(
      bank,
      "p1",
      { responseKind: "text", responseText: "answer" },
      stubGenerator({ credit: () => Promise.resolve([dup, { ...dup, rationale: "dup2" }]) }),
    );
    expect(reveal.methodCredit).toBeNull();
  });

  test("empty rationale -> null verdict", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(
      bank,
      "p1",
      { responseKind: "text", responseText: "answer" },
      stubGenerator({ credit: () => Promise.resolve([{ ref: "2019-06-2-a-MP1", methodCredited: true, rationale: "" }]) }),
    );
    expect(reveal.methodCredit).toBeNull();
  });

  test("no generator composed at all -> null verdict, MS still reveals (the default route posture)", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p1", { responseKind: "text", responseText: "answer" }, null);
    expect(reveal.markScheme).toEqual(MS_P1_WIRE);
    expect(reveal.methodCredit).toBeNull();
  });

  test("unlinked part -> markScheme null (honest absence; never paraphrased into a fake MS)", async () => {
    const bank = msBankStub();
    const reveal = await revealForEvidence(bank, "p3", { responseKind: "text", responseText: "answer" }, stubGenerator());
    expect(reveal.markScheme).toBeNull();
    expect(bank.solutionOf("p3")).not.toBeNull(); // the prose solution still rides the ack
  });
});

// ---------------------------------------------------------------- validator unit

describe("validateMethodCreditAllocations — the validator-trio analog", () => {
  const points = [{ ref: "A" }, { ref: "B" }];
  test("valid allocations pass through", () => {
    const allocations = [
      { ref: "A", methodCredited: true, rationale: "r1" },
      { ref: "B", methodCredited: false, rationale: "r2" },
    ];
    expect(validateMethodCreditAllocations(allocations, points)).toEqual(allocations);
  });
  test("unknown ref refuses", () => {
    expect(validateMethodCreditAllocations([{ ref: "C", methodCredited: true, rationale: "r" }], points)).toBeNull();
  });
  test("duplicate ref refuses", () => {
    expect(
      validateMethodCreditAllocations(
        [{ ref: "A", methodCredited: true, rationale: "r" }, { ref: "A", methodCredited: false, rationale: "r2" }],
        points,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------- the wire

describe("F-183 on the wire — the evidence ack and the draw boundary", () => {
  test("evidence ack carries the MS of record + the method-credit verdict (contracts-validated)", async () => {
    const res = await makeApp(stubGenerator()).request("/api/v1/learners/me/drill/evidence", evidenceInit("p1", "text"));
    expect(res.status).toBe(201);
    const body = drillEvidenceResponseSchema.parse(await res.json());
    expect(body.markScheme).toEqual({
      source: "corpus-of-record",
      answerStatus: "linked",
      points: [...MS_P1.points],
      marksTotal: 2,
    });
    expect(body.methodCredit?.creditsTotal).toBe(1);
    expect(body.methodCredit?.allocations).toHaveLength(2);
  });

  test("evidence with NO generator composed -> MS reveals, methodCredit honest null", async () => {
    const res = await makeApp(null).request("/api/v1/learners/me/drill/evidence", evidenceInit("p1", "text"));
    expect(res.status).toBe(201);
    const body = drillEvidenceResponseSchema.parse(await res.json());
    expect(body.markScheme?.points).toEqual([...MS_P1.points]);
    expect(body.methodCredit).toBeNull();
  });

  test("law L5 on the wire: the draw response carries NO reveal fields — no solutionMd, no markScheme, no methodCredit", async () => {
    const res = await makeApp(stubGenerator()).request("/api/v1/learners/me/drill/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "igcse-chemistry-19", code: CODE, seed: 7 }),
    });
    expect(res.status).toBe(201);
    const raw = await res.json();
    const body = drillDrawResponseSchema.parse(raw);
    expect(body.parts.length).toBeGreaterThan(0);
    const flat = JSON.stringify(raw);
    expect(flat.includes("solutionMd")).toBe(false);
    expect(flat.includes("markScheme")).toBe(false);
    expect(flat.includes("methodCredit")).toBe(false);
    expect(flat.includes("methodCredited")).toBe(false);
  });
});
