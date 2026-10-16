/**
 * Card B — the model_versions registry reader pins (services/learner-model/
 * registry.ts): the pointer-row activation semantics, the four declared
 * fallbacks (degrade, never invert), the lenient jsonb normalization, and
 * the same-resolver invariant end-to-end through BOTH consumers (the
 * assessment publisher's write path and the research calibration read).
 *
 * Numeric pins are hand-derived, not tautologies:
 *   - 0.225625  = (0.5·0.8 + 0.5·0.25 − 1)² — the registry-slip-0.2 emission
 *                 mapping of a latent 0.5 correct four-option MCQ row,
 *   - 0.180625  = (0.5·0.9 + 0.5·0.25 − 1)² — the SAME row on the paper
 *                 constants (the pre-registry control),
 *   - the writer pins compare against the pinned engines (bktUpdate through
 *     resolveBktParams) instead of transcribed floats, and assert the
 *     registry base CHANGES the written anchor vs the paper base.
 */
import { describe, expect, test } from "bun:test";
import {
  updateOnAssessmentEvidence,
  bktUpdate,
  resolveBktParams,
  LEARNER_BKT_PAPER_DEFAULTS,
  type AssessmentEvidenceEvent,
  type ModelUpdateClock,
} from "../../src/services/learner-model/model-update";
import {
  LEARNER_BDT_PAPER_DEFAULTS,
  LEARNER_DECAY_PAPER_DEFAULTS,
} from "../../src/services/learner-model/decay";
import {
  activePointerKey,
  BKT_REGISTRY_FAMILY,
  normalizeBktParams,
  resolveActiveBktParams,
} from "../../src/services/learner-model/registry";
import { buildResearchModule } from "../../src/services/research";
import { fakeSql, type Route } from "./helpers";

const LEARNER = "00000000-0000-4000-8000-000000000041";
const NODE = "20000000-0000-0000-0000-000000000011";
const WHEN = "2026-10-05T15:48:32.549788Z";

const CLOCK: ModelUpdateClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => new Date("2026-10-05T15:50:00Z"),
};

const POINTER_SELECT = /^select version, params from model_versions/;
const TARGET_SELECT = /^select params from model_versions/;

const EVENT: AssessmentEvidenceEvent = {
  attemptId: "60000000-0000-0000-0000-000000000001",
  learnerId: LEARNER,
  questionId: "40000000-0000-0000-0000-000000000001",
  primaryTopicNodeId: NODE,
  secondaryTopicNodeIds: [],
  specPointNodeIds: [],
  correct: true,
  expressedMisconceptionIds: [],
  observedMisconceptionIds: [],
  questionType: "MCQ_SINGLE",
  optionCount: 4,
  occurredAt: WHEN,
};

/** The writer path's statement set (fresh skill row; no misconception or fluency writes). */
function writerRoutes() {
  const captured = { skillInsert: [] as unknown[][], telemetry: [] as unknown[][] };
  const routes: Route[] = [
    {
      match: /^select mastery, attempts, correct_count, last_practiced_at from skill_states/,
      rows: [],
    },
    {
      match: /insert into skill_states/,
      rows: [],
      rowsFor: (p) => {
        captured.skillInsert.push(p);
        return [];
      },
    },
    {
      match: /^select id from skill_states/,
      rows: [],
    },
    {
      match: /insert into telemetry_events/,
      rows: [],
      rowsFor: (p) => {
        captured.telemetry.push(p);
        return [];
      },
    },
  ];
  return { routes, captured };
}

/** The pointer select's row shape (params jsonb comes back parsed). */
function pointerRow(version: string, params: unknown = {}) {
  return { version, params };
}

describe("registry reader — activation semantics", () => {
  test("no pointer -> paper defaults, reason no-pointer, exactly one query", async () => {
    const sql = fakeSql([{ match: POINTER_SELECT, rows: [] }]);
    const r = await resolveActiveBktParams(sql);
    expect(r.params).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
    expect(r.source).toBe("paper-defaults");
    expect(r.version).toBeNull();
    expect(r.reason).toBe("no-pointer");
    expect(sql.queries.length).toBe(1);
    expect(sql.queries[0]).toContain("model_versions");
  });

  test("the pointer key is the reserved @active namespace over the family", () => {
    expect(activePointerKey(BKT_REGISTRY_FAMILY)).toBe("@active/learner.bkt");
  });

  test("single pointer -> the named target's params, source registry", async () => {
    const sql = fakeSql([
      { match: POINTER_SELECT, rows: [pointerRow("v1")] },
      { match: TARGET_SELECT, rows: [{ params: { l0: 0.2, structuredGuess: 0.02 } }] },
    ]);
    const r = await resolveActiveBktParams(sql);
    expect(r.source).toBe("registry");
    expect(r.version).toBe("v1");
    expect(r.reason).toBeNull();
    expect(r.params.l0).toBe(0.2);
    expect(r.params.structuredGuess).toBe(0.02);
    // the un-named knobs ride the paper constants (lenient, per-field)
    expect(r.params.slip).toBe(LEARNER_BKT_PAPER_DEFAULTS.slip);
    expect(r.params.guess).toBe(LEARNER_BKT_PAPER_DEFAULTS.guess);
  });

  test("ambiguous pointers -> paper defaults, reason ambiguous-pointer, no target read", async () => {
    const sql = fakeSql([
      { match: POINTER_SELECT, rows: [pointerRow("v1"), pointerRow("v2")] },
    ]);
    const r = await resolveActiveBktParams(sql);
    expect(r.params).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
    expect(r.reason).toBe("ambiguous-pointer");
    expect(sql.queries.length).toBe(1);
  });

  test("target-missing -> paper defaults, reason target-missing", async () => {
    const sql = fakeSql([
      { match: POINTER_SELECT, rows: [pointerRow("v9")] },
      { match: TARGET_SELECT, rows: [] },
    ]);
    const r = await resolveActiveBktParams(sql);
    expect(r.params).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
    expect(r.reason).toBe("target-missing");
  });

  test.each([["a json string", "not-an-object"], ["an array", [1, 2]], ["null", null]])(
    "malformed params (%s) -> paper defaults, reason malformed-params",
    async (_name, raw) => {
      const sql = fakeSql([
        { match: POINTER_SELECT, rows: [pointerRow("v1")] },
        { match: TARGET_SELECT, rows: [{ params: raw }] },
      ]);
      const r = await resolveActiveBktParams(sql);
      expect(r.params).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
      expect(r.reason).toBe("malformed-params");
    },
  );
});

describe("registry reader — lenient normalization (the compact-ctor law, hardened for jsonb)", () => {
  test("per-field: finite > 0 numbers ride; everything else falls back", () => {
    const n = normalizeBktParams({
      l0: 0.2,
      slip: 0, // <= 0 -> paper
      guess: "0.3", // non-number -> paper
      learnRate: Number.NaN, // NaN -> paper
      shortAnswerGuess: -0.5, // negative -> paper
      structuredGuess: 0.02, // rides
    });
    expect(n).toEqual({
      l0: 0.2,
      slip: LEARNER_BKT_PAPER_DEFAULTS.slip,
      guess: LEARNER_BKT_PAPER_DEFAULTS.guess,
      learnRate: LEARNER_BKT_PAPER_DEFAULTS.learnRate,
      shortAnswerGuess: LEARNER_BKT_PAPER_DEFAULTS.shortAnswerGuess,
      structuredGuess: 0.02,
    });
  });

  test("missing fields and non-objects normalize to the full paper record", () => {
    expect(normalizeBktParams({})).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
    expect(normalizeBktParams(undefined)).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
    expect(normalizeBktParams("x")).toEqual(LEARNER_BKT_PAPER_DEFAULTS);
  });
});

describe("same-resolver invariant — the writer consumes the registry base", () => {
  test("an activated l0 changes the written anchor exactly as the engine computes it", async () => {
    const registryBase = { ...LEARNER_BKT_PAPER_DEFAULTS, l0: 0.2 };
    const resolved = resolveBktParams("MCQ_SINGLE", 4, registryBase);

    const paper = writerRoutes();
    await updateOnAssessmentEvidence(fakeSql(paper.routes), EVENT, undefined, CLOCK);

    const registry = writerRoutes();
    await updateOnAssessmentEvidence(
      fakeSql(registry.routes),
      EVENT,
      {
        bkt: registryBase,
        decay: LEARNER_DECAY_PAPER_DEFAULTS,
        bdt: LEARNER_BDT_PAPER_DEFAULTS,
      },
      CLOCK,
    );

    // fresh-row insert: [id, learnerId, nodeId, mastery, attempts, correctCount, ...]
    const paperMastery = Number(paper.captured.skillInsert[0]![3]);
    const registryMastery = Number(registry.captured.skillInsert[0]![3]);
    expect(paperMastery).toBeCloseTo(bktUpdate(LEARNER_BKT_PAPER_DEFAULTS.l0, true, resolved), 15);
    expect(registryMastery).toBeCloseTo(bktUpdate(0.2, true, resolved), 15);
    expect(registryMastery).not.toBeCloseTo(paperMastery, 9);

    // the BKT_UPDATED telemetry rides the SAME update (decayedPrior = the
    // computed prior — a fresh row's prior is exactly l0; payload is bound
    // param index 3 as the jsonb string)
    const payload = JSON.parse(String(paper.captured.telemetry[0]![3])) as Record<string, unknown>;
    expect(payload["decayedPrior"]).toBeCloseTo(LEARNER_BKT_PAPER_DEFAULTS.l0, 15);
  });

  test("both consumers price the SAME config identically (overlap fields)", async () => {
    const { toParams } = await import("../../src/services/research");
    const sql = fakeSql([
      { match: POINTER_SELECT, rows: [pointerRow("v1")] },
      { match: TARGET_SELECT, rows: [{ params: { l0: 0.2, structuredGuess: 0.02 } }] },
    ]);
    const r = await resolveActiveBktParams(sql);
    const writerEmission = resolveBktParams("STRUCTURED", 0, r.params);
    const reporterEmission = toParams("STRUCTURED", 0, r.params);
    expect(writerEmission.guess).toBe(reporterEmission.guess);
    expect(writerEmission.guess).toBe(0.02);
    expect(writerEmission.slip).toBe(reporterEmission.slip);
  });
});

describe("same-resolver invariant — the reporter consumes the registry base", () => {
  // five distinct learners of the SAME evidence shape (latent 0.5, correct,
  // MCQ_SINGLE 4 options) — exactly the k=5 reportable floor.
  const telemetryRows = [1, 2, 3, 4, 5].map((i) => ({
    id: `70000000-0000-0000-0000-00000000000${i}`,
    learner_id: `a0000000-0000-4000-8000-00000000000${i}`,
    payload: {
      nodeId: NODE,
      decayedPrior: 0.5,
      correctness: true,
      questionType: "MCQ_SINGLE",
      optionCount: 4,
      gapDays: 0,
    },
    occurred_at: WHEN,
  }));

  const TELEMETRY_FETCH =
    /^select id, learner_id, payload, occurred_at from telemetry_events/;

  function reportRoutes(): Route[] {
    return [
      { match: POINTER_SELECT, rows: [] }, // default: no pointer (paper control)
      { match: TELEMETRY_FETCH, rows: telemetryRows },
    ];
  }

  test("no pointer -> the report is byte-identical to the pre-registry paper pricing", async () => {
    const module = buildResearchModule(fakeSql(reportRoutes()));
    const report = await module.calibrationReport(null);
    // paper: predicted = 0.5·0.9 + 0.5·0.25 = 0.575; brier = 0.425² = 0.180625
    expect(report.sampleCount).toBe(5);
    expect(report.brier).toBeCloseTo(0.180625, 15);
  });

  test("an activated slip=0.2 version re-prices the emission mapping exactly", async () => {
    const routes = reportRoutes();
    routes[0] = {
      match: POINTER_SELECT,
      rows: [pointerRow("v2")],
    };
    routes.splice(1, 0, {
      match: TARGET_SELECT,
      rows: [{ params: { slip: 0.2 } }],
    });
    const module = buildResearchModule(fakeSql(routes));
    const report = await module.calibrationReport(null);
    // registry slip 0.2: predicted = 0.5·0.8 + 0.5·0.25 = 0.525; brier = 0.475² = 0.225625
    expect(report.brier).toBeCloseTo(0.225625, 15);
  });
});
