/**
 * F-184 build — the strength route battery (GET /drill/strengths + services/
 * drill/strength-serve) over a SYNTHETIC bank on stubbed sql (the routes.test
 * fakeSql style). The pure-law pins (S1..S6) stay in strength.test.ts,
 * untouched; this battery pins the WIRE:
 *   - the authz shell (anonymous 401 BEFORE any handler)
 *   - the contracts binding (missing course -> 400 bad_request) + the
 *     fail-closed registry (unknown course -> 404 not_found)
 *   - the projection: bars only for GRADED evidence at DRILLABLE addresses,
 *     weakest first; the practice-now queue rides beside the bars; the
 *     SERVER's BAR_SEMANTICS ride verbatim (the client renders, never
 *     re-derives); generatedAt is the injected read clock (ADR-031 posture)
 *   - decay conformance THROUGH the wire (the opening's hand-computed case)
 *   - the honest absences: no evidence -> an empty projection; ungraded-only
 *     addresses disclosed in the summary, never a fabricated bar
 *   - adjacency (S6): evidence at thin/unknown codes never surfaces
 *   - the zero-stakes law on the wire: every SQL the route fires is a SELECT
 *     on the drill's own evidence lane (no insert/update, no other table)
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";

import { strengthResponseSchema } from "@syllabai/contracts";

import { createDrillRouter, drillErrorResponse } from "../../src/routes/drill";
import { UnknownCourseError, type DrillBank } from "../../src/services/drill/bank";
import { createDrillStore } from "../../src/services/drill/store";
import type { SqlFn } from "../../src/services/tutor/sql";
import { fakeSql } from "../assessment/helpers";

const LEARNER_ID = "cc000000-0000-4000-8000-000000000002";

// ---------------------------------------------------------------- bank stub

const CODE = "4CH1-1.25"; // drillable — decaying SECURE evidence
const CODE2 = "4CH1-2.10"; // drillable — fresh DEVELOPING evidence (queues)
const CODE3 = "4CH1-3.15"; // drillable — ungraded-only evidence (no bar, law S4)
const THIN = "4CH1-9.99"; // in the census, below the fail-closed floor
const PART_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];

function bankStub(): DrillBank {
  const parts = PART_IDS.map((_, i) => ({
    partId: PART_IDS[i]!,
    questionId: `q${i}`,
    setId: "official-4ch1-1c-2019-06",
    plane: "official" as const,
    order: i,
    marks: 1,
    specPointCodes: [CODE, CODE2, CODE3],
  }));
  const content = new Map(
    PART_IDS.map((id, i) => [
      id,
      {
        problemMd: `problem ${id}`,
        questionType: "multiple_choice",
        commandWord: null,
        choices: [
          { label: "A", textMd: "wrong" },
          { label: "B", textMd: "right" },
        ],
      },
    ]),
  );
  return {
    course: "igcse-chemistry-19",
    parts,
    addressRows: [
      { code: CODE, official: 7, topic: 0, combined: 7, drillable: true },
      { code: CODE2, official: 6, topic: 0, combined: 6, drillable: true },
      { code: CODE3, official: 5, topic: 0, combined: 5, drillable: true },
      { code: THIN, official: 2, topic: 0, combined: 2, drillable: false },
    ],
    censusSummary: { specPointAddresses: 182, covered: 171, drillable: 157, thin: 14, uncovered: 11 },
    poolOf: (code) => (code === CODE || code === CODE2 || code === CODE3 ? parts : []),
    contentOf: (id) => content.get(id) ?? null,
    marksOf: (id) => (content.has(id) ? 1 : null),
    isCorrectChoice: (id, label) => (content.has(id) ? label === "B" : null),
    solutionOf: (id) => (content.has(id) ? `solution ${id}` : null),
    markSchemeOf: () => null,
  };
}

// ---------------------------------------------------------------- store stub

const T0 = "2026-10-01T09:00:00.000Z";
const NOW = new Date("2026-10-23T09:00:00.000Z"); // 22 days after T0
const NOW_ISO = "2026-10-23T09:00:00.000Z";

function evidenceRow(code: string, partId: string, marksAwarded: number | null, createdAt: string) {
  return { code, part_id: partId, marks_awarded: marksAwarded, marks_possible: 1, created_at: createdAt };
}

/** The evidence lane of record for the projection battery (order asc). */
function evidenceRows(): Array<Record<string, unknown>> {
  return [
    // CODE: 4/5 graded at T0 -> anchor 0.8 -> decayed 22d on tau 365 -> 0.7533 (not queued)
    evidenceRow(CODE, "p1", 1, T0),
    evidenceRow(CODE, "p2", 1, T0),
    evidenceRow(CODE, "p3", 1, T0),
    evidenceRow(CODE, "p4", 1, T0),
    evidenceRow(CODE, "p5", 0, T0),
    // CODE also carries one ungraded structured row — disclosed, never fabricated (S4)
    evidenceRow(CODE, "p6", null, T0),
    // CODE2: 1/2 graded FRESH (created_at == now) -> strength 0.5 < 0.6 -> queues
    evidenceRow(CODE2, "p7", 1, NOW_ISO),
    evidenceRow(CODE2, "p8", 0, NOW_ISO),
    // CODE3: ungraded-only -> NO bar, disclosed in the summary (law S4)
    evidenceRow(CODE3, "p9", null, T0),
    // adjacency probes (S6): a thin-census row and a code the census does not offer
    evidenceRow(THIN, "p1", 0, T0),
    evidenceRow("4CH1-8.88", "p2", 0, T0),
  ];
}

function sqlStub(rows: Array<Record<string, unknown>>): SqlFn & { queries: string[] } {
  return fakeSql([
    {
      match: /select code, part_id, marks_awarded, marks_possible, created_at from drill_part_evidence/,
      rows,
    },
  ]) as unknown as SqlFn & { queries: string[] };
}

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  bank: DrillBank = bankStub(),
  sql: SqlFn & { queries: string[] } = sqlStub(evidenceRows()),
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
  app.route(
    "/api/v1/learners/me/drill",
    createDrillRouter({
      bankOf,
      store: createDrillStore(sql),
      nowOf: () => NOW, // the injected read clock (ADR-031 posture)
    }),
  );
  app.onError((err, c) => {
    const mapped = drillErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: NOW_ISO }, 500 as const);
  });
  return app;
}

const STUDENT = { email: "student@example.edu", userId: LEARNER_ID, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const PATH = "/api/v1/learners/me/drill/strengths?course=igcse-chemistry-19";

// ---------------------------------------------------------------- authz shell

test("anonymous GET /strengths -> 401 (never 404)", async () => {
  const res = await makeApp(anon).request(PATH);
  expect(res.status).toBe(401);
});

// ---------------------------------------------------------------- the projection

describe("GET /strengths — the decay-driven projection", () => {
  test("bars + queue + semantics ride the pinned wire shape, weakest first", async () => {
    const res = await makeApp(asStudent).request(PATH);
    expect(res.status).toBe(200);
    const body = strengthResponseSchema.parse(await res.json());

    expect(body.course).toBe("igcse-chemistry-19");
    expect(body.generatedAt).toBe(NOW_ISO);
    // the SERVER's BAR_SEMANTICS ride verbatim (law S3 — the client renders, never re-derives)
    expect(body.semantics.formula).toBe("Strength = mastery x decay");
    expect(body.semantics.notAGrade).toContain("not a grade");
    expect(body.semantics.decay).toContain("never stored");

    // bars: graded drillable addresses only, weakest first (S5 ordering on the wall)
    expect(body.bars.map((b) => b.code)).toEqual([CODE2, CODE]);
    expect(body.bars[0]!.strength).toBe(0.5);
    // decay conformance THROUGH the wire: 0.8 * e^(-22/365), band re-banded on the decayed value
    expect(body.bars[1]!.anchor).toBe(0.8);
    expect(body.bars[1]!.strength).toBeCloseTo(0.8 * Math.exp(-22 / 365), 12);
    expect(body.bars[1]!.band).toBe("DEVELOPING");
    expect(body.bars[1]!.lastGradedAt).toBe(T0);
    expect(body.bars[1]!.gradedCount).toBe(5);
    expect(body.bars[1]!.ungradedCount).toBe(1);

    // the queue: below reviewBelow 0.6 only — the fresh 0.5 queues, the 0.7533 does not
    expect(body.queue.map((q) => q.code)).toEqual([CODE2]);

    // the honest summary: ungraded-only disclosed (law S4), adjacency silent (S6)
    expect(body.summary).toEqual({
      drillableAddresses: 3,
      addressesWithEvidence: 3,
      ungradedOnlyAddresses: 1,
      bars: 2,
      queued: 1,
    });
  });

  test("no evidence -> the empty projection (honest zeros, never a fabricated bar)", async () => {
    const res = await makeApp(asStudent, bankStub(), sqlStub([])).request(PATH);
    expect(res.status).toBe(200);
    const body = strengthResponseSchema.parse(await res.json());
    expect(body.bars).toEqual([]);
    expect(body.queue).toEqual([]);
    expect(body.summary).toEqual({
      drillableAddresses: 3,
      addressesWithEvidence: 0,
      ungradedOnlyAddresses: 0,
      bars: 0,
      queued: 0,
    });
  });
});

// ---------------------------------------------------------------- binding + registry

describe("GET /strengths — binding and the fail-closed registry", () => {
  test("missing course -> 400 bad_request; unknown course -> 404 not_found", async () => {
    const missing = await makeApp(asStudent).request("/api/v1/learners/me/drill/strengths");
    expect(missing.status).toBe(400);
    const unknown = await makeApp(asStudent).request("/api/v1/learners/me/drill/strengths?course=not-a-course");
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { message: string }).message).toContain("not served");
  });
});

// ---------------------------------------------------------------- the zero-stakes law

describe("GET /strengths — the zero-stakes law on the wire", () => {
  test("every SQL the route fires is a SELECT on the drill's own evidence lane", async () => {
    const sql = sqlStub(evidenceRows());
    const res = await makeApp(asStudent, bankStub(), sql).request(PATH);
    expect(res.status).toBe(200);
    expect(sql.queries.length).toBeGreaterThan(0);
    for (const q of sql.queries) {
      expect(q.startsWith("select")).toBe(true);
      expect(q).toContain("from drill_part_evidence");
      expect(q).not.toContain("insert");
      expect(q).not.toContain("update");
      expect(q).not.toContain("attempts");
      expect(q).not.toContain("ai_mark_events");
    }
  });
});
