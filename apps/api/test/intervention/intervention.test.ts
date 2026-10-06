/**
 * Intervention-run service unit tests (T-MIG-061 tranche 1) — stubbed sql via
 * the shared fakeSql helper (+ a tiny in-memory row the UPDATE routes mutate,
 * so state-machine sequences run end-to-end). Pins the frozen law @ 6cad6ef:
 * the SHA-256 intervention-identity hash (known-answer vector + the blank
 * guard), the entity construction laws ("{field} is required" 400s, "JSON
 * field is required"), the state machine (verbatim conflict messages:
 * "Terminal run cannot be changed" / "Run cannot become ACTIVE from X" /
 * "Only ACTIVE runs can pause|record steps|complete"), the resume NAMED 409
 * (intervention_version_mismatch — the message carries the RUN's stored
 * definition), the ownership gate (unknown run → the :167 IllegalArgument
 * class whose route body is the FIXED "malformed request"; a foreign run →
 * the indistinguishable 404, no existence oracle), the server-assigned step
 * sequence (next = current+1, DONE completes instantly, run-UPDATE-before-
 * step-INSERT order), the evidence attachment law (terminal freeze, role
 * default, captured_at asc order), the complete/cancel laws (outcome text
 * mandatory; F-061-A: cancel writes NO terminal_outcome — the live-DB 500
 * class, disclosed) and the NBA-backed scenario derivation (composition
 * only: the PRACTISE_QUESTIONS filter, the skill-state REFERENCE format
 * incl. the honest unmeasured pin, the nba: diagnosis-ref format, the fixed
 * practice-intervention/v1 definition + bounded tool list, the derived hash).
 */
import { describe, expect, test } from "bun:test";
import {
  ALLOWED_TOOLS_JSON,
  INTERVENTION_VERSION,
  InterventionBadRequestError,
  InterventionConflictError,
  InterventionIllegalArgumentError,
  InterventionNotFoundError,
  InterventionVersionMismatchError,
  buildInterventionModule,
  hashIntervention,
  jsonArrayList,
} from "../../src/services/intervention";
import type { SubmitClock } from "../../src/services/selfmark";
import type { NextBestActionsView } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const OTHER_LEARNER = "bb000000-0000-4000-8000-000000000002";
const RUN = "cd000000-0000-4000-8000-000000000001";
const SUBJECT = "cc000000-0000-4000-8000-000000000001";
const CV = "cc000000-0000-4000-8000-000000000002";
const ROOT = "ff000000-0000-4000-8000-000000000001";
const NODE = "ff000000-0000-4000-8000-000000000002";
const STEP_ID = "dd000000-0000-4000-8000-000000000001";
const EV_ID = "ee000000-0000-4000-8000-000000000001";
const NEW_ID_1 = "7e571d00-0000-4000-8000-000000000001";
const NEW_ID_2 = "7e571d00-0000-4000-8000-000000000002";

const T0 = "2026-10-01T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z"; // toInstant(NOW_TEXT) — the fleet's Date rendering
const NOW_MILLIS = Date.parse(NOW_TEXT);

let NOW = new Date(NOW_TEXT);
let idSeq = 0;
const clock: SubmitClock = {
  newId: () => (idSeq++ % 2 === 0 ? NEW_ID_1 : NEW_ID_2),
  now: () => NOW,
};

/** The known-answer vector: SHA-256 over the canonical prototype triple. */
const DERIVED_HASH = "83951aefcf74e8ed7196cfd94fb6b6cc47d4625ab8fdd1eca6964a63d0d6180b";

// ── the in-memory run row the routes read/mutate ────────────────────────────

type Row = Record<string, unknown>;

const freshRun = (over: Row = {}): Row => ({
  run_id: RUN,
  learner_id: LEARNER,
  subject_id: SUBJECT,
  curriculum_version_id: CV,
  status: "CREATED",
  origin: "NBA",
  target_specification_points: `["${NODE}"]`,
  question_part_ids: "[]",
  evidence_refs: "[]",
  diagnosis_snapshot_ref: `nba:nba-rules/v1.3:${ROOT}:${NODE}:rank1:LOW_MASTERY`,
  learner_state_snapshot_ref: `skill-state:${NODE}:a3:u${NOW_MILLIS}`,
  diagnosis_version: "nba-rules/v1.3",
  action_type: "PRACTISE_QUESTIONS",
  intervention_version: INTERVENTION_VERSION,
  intervention_hash: DERIVED_HASH,
  allowed_tool_ids: ALLOWED_TOOLS_JSON,
  terminal_outcome: null,
  current_step: null,
  created_at: T0,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  ...over,
});

const stepRow = (over: Row = {}): Row => ({
  step_id: STEP_ID,
  run_id: RUN,
  sequence_no: 0,
  status: "DONE",
  observation_type: "practice_set_started",
  input_evidence_ref: null,
  output_evidence_ref: "attempt:11111111-0000-4000-8000-000000000001",
  blocked_reason: null,
  started_at: NOW_ISO,
  completed_at: NOW_ISO,
  ...over,
});

const evidenceRow = (over: Row = {}): Row => ({
  id: EV_ID,
  run_id: RUN,
  evidence_ref: "attempt:11111111-0000-4000-8000-000000000001",
  role: "ATTEMPT_EVIDENCE",
  captured_at: NOW_ISO,
  ...over,
});

// ── shared route shapes ─────────────────────────────────────────────────────

const runSelectRoute = (store: { row: Row | null }): Route => ({
  match: /from intervention_run where run_id = \? ::uuid$/,
  rows: [],
  rowsFor: () => (store.row ? [store.row] : []),
});

const insertRunRoute = (store: { row: Row | null }): Route => ({
  match: /^insert into intervention_run \(run_id, learner_id/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    store.row = freshRun({
      run_id: p[0],
      learner_id: p[1],
      subject_id: p[2],
      curriculum_version_id: p[3],
      origin: p[4],
      target_specification_points: p[5],
      question_part_ids: p[6],
      evidence_refs: p[7],
      diagnosis_snapshot_ref: p[8],
      learner_state_snapshot_ref: p[9],
      diagnosis_version: p[10],
      action_type: p[11],
      intervention_version: p[12],
      intervention_hash: p[13],
      allowed_tool_ids: p[14],
      created_at: new Date(p[15] as string).toISOString(),
    });
    return [store.row];
  },
});

const activateRoute = (store: { row: Row | null }): Route => ({
  match: /update intervention_run set status = 'ACTIVE', started_at = \? ::timestamptz where run_id = \? ::uuid returning/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    store.row = {
      ...(store.row as Row),
      status: "ACTIVE",
      started_at: new Date(p[0] as string).toISOString(),
    };
    return [store.row as Row];
  },
});

const pauseRoute = (store: { row: Row | null }): Route => ({
  match: /update intervention_run set status = 'PAUSED' where run_id = \? ::uuid returning/,
  rows: [],
  rowsFor: () => {
    store.row = { ...(store.row as Row), status: "PAUSED" };
    return [store.row as Row];
  },
});

const completeRoute = (store: { row: Row | null }): Route => ({
  match: /update intervention_run set status = 'COMPLETED', terminal_outcome = \? , completed_at = \? ::timestamptz where run_id = \? ::uuid returning/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    store.row = {
      ...(store.row as Row),
      status: "COMPLETED",
      terminal_outcome: p[0],
      completed_at: new Date(p[1] as string).toISOString(),
    };
    return [store.row as Row];
  },
});

const cancelRoute = (store: { row: Row | null }): Route => ({
  match: /update intervention_run set status = 'CANCELLED', cancelled_at = \? ::timestamptz where run_id = \? ::uuid returning/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    store.row = {
      ...(store.row as Row),
      status: "CANCELLED",
      cancelled_at: new Date(p[0] as string).toISOString(),
      // F-061-A: terminal_outcome stays whatever it was (null on the open run)
    };
    return [store.row as Row];
  },
});

const stepCurrentRoute = (store: { row: Row | null }): Route => ({
  match: /^update intervention_run set current_step = \? where run_id = \? ::uuid$/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    store.row = { ...(store.row as Row), current_step: p[0] };
    return [];
  },
});

const insertStepRoute = (store: { steps: Row[] }): Route => ({
  match: /^insert into intervention_run_step \(step_id, run_id, sequence_no/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    const row = stepRow({
      step_id: p[0],
      run_id: p[1],
      sequence_no: p[2],
      status: p[3],
      observation_type: p[4],
      input_evidence_ref: p[5],
      output_evidence_ref: p[6],
      blocked_reason: p[7],
      started_at: new Date(p[8] as string).toISOString(),
      completed_at: p[9] === null ? null : new Date(p[9] as string).toISOString(),
    });
    store.steps.push(row);
    return [row];
  },
});

const stepsSelectRoute = (store: { steps: Row[] }): Route => ({
  match: /from intervention_run_step where run_id = \? ::uuid order by sequence_no asc$/,
  rows: [],
  rowsFor: () => [...store.steps].sort((a, b) => (a.sequence_no as number) - (b.sequence_no as number)),
});

const insertEvidenceRoute = (store: { evidence: Row[] }): Route => ({
  match: /^insert into intervention_run_evidence \(id, run_id, evidence_ref/,
  rows: [],
  rowsFor: (params) => {
    const p = params as unknown[];
    const row = evidenceRow({
      id: p[0],
      run_id: p[1],
      evidence_ref: p[2],
      role: p[3],
      captured_at: new Date(p[4] as string).toISOString(),
    });
    store.evidence.push(row);
    return [row];
  },
});

const evidenceSelectRoute = (store: { evidence: Row[] }): Route => ({
  match: /from intervention_run_evidence where run_id = \? ::uuid order by captured_at asc$/,
  rows: [],
  rowsFor: () =>
    [...store.evidence].sort((a, b) => String(a.captured_at).localeCompare(String(b.captured_at))),
});

const subjectRoute = (found: boolean): Route => ({
  match: /from subjects where knowledge_node_id = \? ::uuid limit 1$/,
  rows: found ? [{ id: SUBJECT, curriculum_version_id: CV }] : [],
});

const skillStateRoute = (found: boolean, attempts = 3): Route => ({
  match: /from skill_states where learner_id = \? ::uuid and node_id = \? ::uuid limit 1$/,
  rows: found ? [{ attempts, updated_at: NOW_TEXT }] : [],
});

// ── the NBA provider fake ───────────────────────────────────────────────────

type NbaAction = NextBestActionsView["actions"][number];

const practiseAction = (over: Partial<NbaAction> = {}): NbaAction => ({
  rank: 1,
  actionType: "PRACTISE_QUESTIONS",
  reasonCode: "LOW_MASTERY",
  targetNodeId: NODE,
  targetCode: "4CH1-1.18",
  targetTitle: "Electrolysis",
  questionId: null,
  servableQuestionCount: 12,
  reasonDetail: "mastery 0.21 below the 0.35 practice line",
  ...over,
});

const nbaView = (
  actions: NbaAction[],
  policy: NextBestActionsView["policy"] = "nba-rules/v1.3",
): NextBestActionsView => ({
  learnerId: LEARNER,
  rootId: ROOT,
  asOf: NOW_ISO,
  policy,
  actions,
});

// ── helpers ──────────────────────────────────────────────────────────────────

const isWrite = (q: string): boolean =>
  q.startsWith("update") || q.startsWith("insert");

type Store = { row: Row | null; steps: Row[]; evidence: Row[] };

const mkStore = (row: Row | null = null): Store => ({ row, steps: [], evidence: [] });

// ── module builder ──────────────────────────────────────────────────────────

function harness(opts: {
  store?: { row: Row | null; steps: Row[]; evidence: Row[] };
  nba?: (learnerId: string, rootId: string) => Promise<NextBestActionsView>;
} = {}) {
  const store = opts.store ?? mkStore();
  const sql = fakeSql([
    runSelectRoute(store),
    insertRunRoute(store),
    activateRoute(store),
    pauseRoute(store),
    completeRoute(store),
    cancelRoute(store),
    stepCurrentRoute(store),
    insertStepRoute(store),
    stepsSelectRoute(store),
    insertEvidenceRoute(store),
    evidenceSelectRoute(store),
    subjectRoute(opts.nba !== undefined),
    skillStateRoute(true),
  ]);
  const nba =
    opts.nba ?? (async () => nbaView([practiseAction()]));
  const mod = buildInterventionModule({ sql, clock, nextBestActions: nba });
  return { mod, sql, store };
}

// ── the hash law (Service :153-164) ─────────────────────────────────────────

describe("intervention identity hash (frozen @ 6cad6ef)", () => {
  test("known-answer: SHA-256 hex over version\\nactionType\\nallowedToolIds", () => {
    expect(hashIntervention(INTERVENTION_VERSION, "PRACTISE_QUESTIONS", ALLOWED_TOOLS_JSON)).toBe(
      DERIVED_HASH,
    );
  });

  test("order-sensitive: swapping members changes the digest (the \\n join is the canonical form)", () => {
    expect(hashIntervention("PRACTISE_QUESTIONS", INTERVENTION_VERSION, ALLOWED_TOOLS_JSON)).not.toBe(
      DERIVED_HASH,
    );
  });

  test("a blank identity member throws the :167 IllegalArgument class (400 FIXED body at the route)", () => {
    expect(() => hashIntervention("", "PRACTISE_QUESTIONS", ALLOWED_TOOLS_JSON)).toThrow(
      InterventionIllegalArgumentError,
    );
    expect(() => hashIntervention(INTERVENTION_VERSION, "  ", ALLOWED_TOOLS_JSON)).toThrow(
      InterventionIllegalArgumentError,
    );
    expect(() => hashIntervention(INTERVENTION_VERSION, "PRACTISE_QUESTIONS", "")).toThrow(
      InterventionIllegalArgumentError,
    );
  });
});

// ── the jsonArrayList wire parser (Controller :223-238, verbatim) ───────────

describe("jsonArrayList (the controlled-shape wire parser)", () => {
  test("null → [] (the column is NOT NULL by V26, but the parser keeps the guard)", () => {
    expect(jsonArrayList(null)).toEqual([]);
  });

  test("empty and blank arrays", () => {
    expect(jsonArrayList("[]")).toEqual([]);
    expect(jsonArrayList("  []  ")).toEqual([]);
  });

  test("quoted values strip, spaces trim, empties skip — the leniency is the frozen behavior", () => {
    expect(jsonArrayList('["a","b"]')).toEqual(["a", "b"]);
    expect(jsonArrayList('[ "a" , "b" ]')).toEqual(["a", "b"]);
    expect(jsonArrayList('["x",, "y"]')).toEqual(["x", "y"]);
    expect(jsonArrayList('[""]')).toEqual([]);
  });

  test("unquoted values pass through as-is (the app writes the quotes; the parser tolerates)", () => {
    expect(jsonArrayList("[a, b]")).toEqual(["a", "b"]);
  });
});

// ── create (Service :44-59 + the entity construction laws :112-133) ─────────

describe("intervention create (the entity construction laws)", () => {
  test("happy path: status CREATED, the hash derives, created_at is the clock, timestamps open", async () => {
    const { mod } = harness();
    const row = await mod.create({
      learnerId: LEARNER,
      subjectId: SUBJECT,
      curriculumVersionId: CV,
      origin: "NBA",
      targetSpecificationPoints: `["${NODE}"]`,
      questionPartIds: "[]",
      evidenceRefs: "[]",
      diagnosisSnapshotRef: null,
      learnerStateSnapshotRef: null,
      diagnosisVersion: null,
      actionType: "PRACTISE_QUESTIONS",
      interventionVersion: INTERVENTION_VERSION,
      interventionHash: null,
      allowedToolIds: ALLOWED_TOOLS_JSON,
    });
    expect(row.status).toBe("CREATED");
    expect(row.intervention_hash).toBe(DERIVED_HASH);
    expect(row.terminal_outcome).toBeNull();
    expect(row.current_step).toBeNull();
    expect(new Date(row.created_at as unknown as string).toISOString()).toBe(NOW_ISO);
    expect(row.started_at).toBeNull();
  });

  test("a supplied hash passes through unchanged (the derivation is conditional, :48-51)", async () => {
    const { mod } = harness();
    const row = await mod.create({
      learnerId: LEARNER,
      subjectId: null,
      curriculumVersionId: null,
      origin: "MANUAL",
      targetSpecificationPoints: "[]",
      questionPartIds: "[]",
      evidenceRefs: "[]",
      diagnosisSnapshotRef: null,
      learnerStateSnapshotRef: null,
      diagnosisVersion: null,
      actionType: "PRACTISE_QUESTIONS",
      interventionVersion: "practice-intervention/v2",
      interventionHash: "b".repeat(64),
      allowedToolIds: "[]",
    });
    expect(row.intervention_hash).toBe("b".repeat(64));
  });

  test("the {field} is required 400s (requireText) — origin, actionType, interventionVersion", async () => {
    const { mod } = harness();
    const base = {
      learnerId: LEARNER,
      subjectId: null,
      curriculumVersionId: null,
      origin: "NBA",
      targetSpecificationPoints: "[]",
      questionPartIds: "[]",
      evidenceRefs: "[]",
      diagnosisSnapshotRef: null,
      learnerStateSnapshotRef: null,
      diagnosisVersion: null,
      actionType: "PRACTISE_QUESTIONS",
      interventionVersion: INTERVENTION_VERSION,
      interventionHash: null,
      allowedToolIds: ALLOWED_TOOLS_JSON,
    };
    expect(mod.create({ ...base, origin: " " }).catch((e) => e.message)).resolves.toBe(
      "origin is required",
    );
    expect(mod.create({ ...base, actionType: "" }).catch((e) => e.message)).resolves.toBe(
      "actionType is required",
    );
    expect(mod.create({ ...base, interventionVersion: "" }).catch((e) => e)).resolves.toBeInstanceOf(
      InterventionBadRequestError,
    );
  });

  test("the JSON field is required 400 (requireJson) — the four jsonb members", async () => {
    const { mod } = harness();
    const base = {
      learnerId: LEARNER,
      subjectId: null,
      curriculumVersionId: null,
      origin: "NBA",
      targetSpecificationPoints: "[]",
      questionPartIds: "[]",
      evidenceRefs: "[]",
      diagnosisSnapshotRef: null,
      learnerStateSnapshotRef: null,
      diagnosisVersion: null,
      actionType: "PRACTISE_QUESTIONS",
      interventionVersion: INTERVENTION_VERSION,
      interventionHash: null,
      allowedToolIds: ALLOWED_TOOLS_JSON,
    };
    expect(mod.create({ ...base, targetSpecificationPoints: "" }).catch((e) => e.message)).resolves.toBe(
      "JSON field is required",
    );
    expect(mod.create({ ...base, allowedToolIds: "" }).catch((e) => e.message)).resolves.toBe(
      "JSON field is required",
    );
  });
});

// ── createFromRecommendation (ScenarioService :69-116) ──────────────────────

describe("intervention createFromRecommendation (the E2 first scenario)", () => {
  test("unknown subject root → 404 'subject for knowledge root {id} not found' (no NBA call)", async () => {
    const store = mkStore();
    const sql = fakeSql([
      runSelectRoute(store),
      insertRunRoute(store),
      subjectRoute(false),
      skillStateRoute(false),
    ]);
    let nbaCalled = false;
    const mod = buildInterventionModule({
      sql,
      clock,
      nextBestActions: async () => {
        nbaCalled = true;
        return nbaView([]);
      },
    });
    try {
      await mod.createFromRecommendation(LEARNER, ROOT);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionNotFoundError);
      expect((e as Error).message).toBe(`subject for knowledge root ${ROOT} not found`);
    }
    expect(nbaCalled).toBe(false);
  });

  test("no PRACTISE_QUESTIONS action → 404 'practice recommendation for learner … under root … not found' — never a fabricated run", async () => {
    const { mod, store } = harness({ nba: async () => nbaView([practiseAction({ actionType: "REVIEW_TOPIC" })]) });
    try {
      await mod.createFromRecommendation(LEARNER, ROOT);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionNotFoundError);
      expect((e as Error).message).toBe(
        `practice recommendation for learner ${LEARNER} under root ${ROOT} not found`,
      );
    }
    expect(store.row).toBeNull();
  });

  test("happy path: the FIRST PRACTISE_QUESTIONS action wins; the snapshot refs are the frozen formats; the hash derives", async () => {
    const { mod, sql } = harness({
      nba: async () =>
        nbaView([
          practiseAction({ rank: 2, actionType: "REVIEW_TOPIC" }),
          practiseAction({ rank: 4, reasonCode: "FLUENCY_GAP" }),
          practiseAction({ rank: 7, reasonCode: "FLUENCY_GAP", targetNodeId: NODE }),
        ]),
    });
    const view = await mod.createFromRecommendation(LEARNER, ROOT);
    expect(view.status).toBe("CREATED");
    expect(view.origin).toBe("NBA");
    expect(view.actionType).toBe("PRACTISE_QUESTIONS");
    expect(view.interventionVersion).toBe(INTERVENTION_VERSION);
    expect(view.interventionHash).toBe(DERIVED_HASH);
    expect(view.diagnosisVersion).toBe("nba-rules/v1.3");
    expect(view.allowedToolIds).toEqual([
      "get_specification_context",
      "get_learner_state",
      "start_practice",
    ]);
    expect(view.targetSpecificationPoints).toEqual([NODE]);
    expect(view.diagnosisSnapshotRef).toBe(
      `nba:nba-rules/v1.3:${ROOT}:${NODE}:rank4:FLUENCY_GAP`,
    );
    expect(view.learnerStateSnapshotRef).toBe(`skill-state:${NODE}:a3:u${NOW_MILLIS}`);
    expect(view.steps).toEqual([]);
    expect(view.evidence).toEqual([]);
    // the write order: subject read → skill-state read → run INSERT
    const queries = sql.queries;
    expect(queries.findIndex((q) => q.includes("from subjects"))).toBeLessThan(
      queries.findIndex((q) => q.includes("from skill_states")),
    );
    expect(queries.findIndex((q) => q.includes("from skill_states"))).toBeLessThan(
      queries.findIndex((q) => q.startsWith("insert into intervention_run")),
    );
  });

  test("an unmeasured topic pins honestly as 'unmeasured' — never as a zero", async () => {
    const store = mkStore();
    const sql = fakeSql([
      runSelectRoute(store),
      insertRunRoute(store),
      subjectRoute(true),
      skillStateRoute(false),
    ]);
    const mod = buildInterventionModule({ sql, clock, nextBestActions: async () => nbaView([practiseAction()]) });
    const view = await mod.createFromRecommendation(LEARNER, ROOT);
    expect(view.learnerStateSnapshotRef).toBe(`skill-state:${NODE}:unmeasured`);
  });
});

// ── the ownership gate (Controller ownedRun :181-189) ───────────────────────

describe("the ownership gate (no existence oracle across learners)", () => {
  test("unknown run → the :167 IllegalArgument class (route body: FIXED 'malformed request')", async () => {
    const { mod } = harness({ store: mkStore() });
    try {
      await mod.runView(LEARNER, RUN);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionIllegalArgumentError);
    }
  });

  test("a foreign run is an INDISTINGUISHABLE 404 carrying the frozen message", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ learner_id: OTHER_LEARNER })) });
    try {
      await mod.runView(LEARNER, RUN);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionNotFoundError);
      expect((e as Error).message).toBe(`intervention run ${RUN} not found`);
    }
  });

  test("ownership precedes the state machine on every endpoint (activate on a foreign terminal run → 404, not 409)", async () => {
    const { mod } = harness({
      store: mkStore(freshRun({ learner_id: OTHER_LEARNER, status: "COMPLETED" })),
    });
    try {
      await mod.activate(LEARNER, RUN);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionNotFoundError);
    }
  });
});

// ── the state machine (Entity :168-201, verbatim messages) ──────────────────

describe("the run state machine (activate / pause / resume)", () => {
  test("activate: CREATED → ACTIVE, started_at set on the FIRST activation, empty steps/evidence", async () => {
    const store = mkStore(freshRun());
    const { mod } = harness({ store });
    const view = await mod.activate(LEARNER, RUN);
    expect(view.status).toBe("ACTIVE");
    expect(view.startedAt).toBe(NOW_ISO);
    expect(view.steps).toEqual([]);
    expect(view.evidence).toEqual([]);
  });

  test("activate: PAUSED → ACTIVE keeps the ORIGINAL started_at (a resume is not a restart)", async () => {
    const store = mkStore(freshRun({ status: "PAUSED", started_at: T0 }));
    const { mod } = harness({ store });
    const view = await mod.activate(LEARNER, RUN);
    expect(view.status).toBe("ACTIVE");
    expect(view.startedAt).toBe(new Date(T0).toISOString());
  });

  test("activate: ACTIVE → 409 'Run cannot become ACTIVE from ACTIVE'", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    try {
      await mod.activate(LEARNER, RUN);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionConflictError);
      expect((e as Error).message).toBe("Run cannot become ACTIVE from ACTIVE");
    }
  });

  test("terminal runs are immutable everywhere — activate/pause/step/evidence/complete/cancel all 409 'Terminal run cannot be changed'", async () => {
    for (const status of ["COMPLETED", "CANCELLED", "FAILED"]) {
      const store = mkStore(freshRun({ status, terminal_outcome: "EVIDENCE_COLLECTED" }));
      const { mod } = harness({ store });
      for (const [name, call] of [
        ["activate", () => mod.activate(LEARNER, RUN)],
        ["pause", () => mod.pause(LEARNER, RUN)],
        ["recordStep", () => mod.recordStep(LEARNER, RUN, { status: "DONE", observationType: "x" })],
        ["attachEvidence", () => mod.attachEvidence(LEARNER, RUN, "attempt:x")],
        ["complete", () => mod.complete(LEARNER, RUN, "EVIDENCE_COLLECTED")],
        ["cancel", () => mod.cancel(LEARNER, RUN)],
      ] as Array<[string, () => Promise<unknown>]>) {
        try {
          await call();
          throw new Error(`${name} should have thrown`);
        } catch (e) {
          expect(e).toBeInstanceOf(InterventionConflictError);
          expect((e as Error).message).toBe("Terminal run cannot be changed");
        }
      }
    }
  });

  test("pause: ACTIVE → PAUSED; from CREATED → 409 'Only ACTIVE runs can pause'", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    expect((await mod.pause(LEARNER, RUN)).status).toBe("PAUSED");
    const { mod: mod2 } = harness({ store: mkStore(freshRun()) });
    try {
      await mod2.pause(LEARNER, RUN);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("Only ACTIVE runs can pause");
    }
  });

  test("resume: the EXACT stored identity reactivates (PAUSED → ACTIVE, original started_at kept)", async () => {
    const store = mkStore(freshRun({ status: "PAUSED", started_at: T0 }));
    const { mod } = harness({ store });
    const view = await mod.resume(LEARNER, RUN, INTERVENTION_VERSION, DERIVED_HASH);
    expect(view.status).toBe("ACTIVE");
    expect(view.startedAt).toBe(new Date(T0).toISOString());
  });

  test("resume against a materially different definition → the NAMED 409; the message carries the RUN's stored identity", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "PAUSED", started_at: T0 })) });
    try {
      await mod.resume(LEARNER, RUN, "practice-intervention/v2", DERIVED_HASH);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionVersionMismatchError);
      expect((e as Error).message).toBe(
        `Intervention definition mismatch for run ${RUN}; expected version=${INTERVENTION_VERSION}, hash=${DERIVED_HASH}`,
      );
    }
    const { mod: mod2 } = harness({ store: mkStore(freshRun({ status: "PAUSED", started_at: T0 })) });
    try {
      await mod2.resume(LEARNER, RUN, INTERVENTION_VERSION, "0".repeat(64));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionVersionMismatchError);
    }
  });

  test("resume: the requireText 400s fire BEFORE the state machine (missing fields on a terminal run → 400, not 409)", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "COMPLETED", terminal_outcome: "x" })) });
    try {
      await mod.resume(LEARNER, RUN, null, null);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionBadRequestError);
      expect((e as Error).message).toBe("interventionVersion is required");
    }
    const { mod: mod2 } = harness({ store: mkStore(freshRun({ status: "COMPLETED", terminal_outcome: "x" })) });
    try {
      await mod2.resume(LEARNER, RUN, INTERVENTION_VERSION, " ");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("interventionHash is required");
    }
  });

  test("resume from CREATED → ACTIVE (the activate law allows CREATED; the identity must still match)", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "CREATED" })) });
    const view = await mod.resume(LEARNER, RUN, INTERVENTION_VERSION, DERIVED_HASH);
    expect(view.status).toBe("ACTIVE");
  });
});

// ── recordStep (Controller :101-117 + Service :79-89) ───────────────────────

describe("recordStep (the server-assigned sequence, DONE completes instantly)", () => {
  test("first step: next = 0; the run UPDATE precedes the step INSERT; DONE sets completed_at = the same instant", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod, sql } = harness({ store });
    const view = await mod.recordStep(LEARNER, RUN, {
      status: "DONE",
      observationType: "practice_set_started",
      inputEvidenceRef: null,
      outputEvidenceRef: "attempt:11111111-0000-4000-8000-000000000001",
      blockedReason: null,
    });
    const updateAt = sql.queries.findIndex((q) => q.startsWith("update intervention_run set current_step"));
    const insertAt = sql.queries.findIndex((q) => q.startsWith("insert into intervention_run_step"));
    expect(updateAt).toBeGreaterThanOrEqual(0);
    expect(insertAt).toBe(updateAt + 1);
    expect(view.currentStep).toBe(0);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]!.sequenceNo).toBe(0);
    expect(view.steps[0]!.completedAt).toBe(NOW_ISO);
    expect(view.steps[0]!.startedAt).toBe(NOW_ISO);
  });

  test("the sequence number is SERVER-assigned: current_step 0 → next 1 (never a client field)", async () => {
    const store = {
      row: freshRun({ status: "ACTIVE", started_at: T0, current_step: 0 }),
      steps: [],
      evidence: [],
    };
    const { mod } = harness({ store });
    const view = await mod.recordStep(LEARNER, RUN, { status: "DONE", observationType: "step-2" });
    expect(view.steps[0]!.sequenceNo).toBe(1);
    expect(view.currentStep).toBe(1);
  });

  test("a non-DONE status leaves completed_at open (only DONE completes instantly, :111)", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod } = harness({ store });
    const view = await mod.recordStep(LEARNER, RUN, { status: "IN_PROGRESS", observationType: "watch" });
    expect(view.steps[0]!.completedAt).toBeNull();
    expect(view.steps[0]!.status).toBe("IN_PROGRESS");
  });

  test("the RAW null status reaches the entity law: IllegalArgument class (400 FIXED body), NO writes — the DONE default neutralizes the VALIDATION pass only", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod, sql } = harness({ store });
    try {
      await mod.recordStep(LEARNER, RUN, { status: null, observationType: "x" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionIllegalArgumentError);
      expect((e as Error).message).toBe("status is required");
    }
    expect(sql.queries.filter(isWrite).length).toBe(0);
  });

  test("a blank status ('') is the VERBATIM 400 (the requireText law, not the entity law)", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod } = harness({ store });
    try {
      await mod.recordStep(LEARNER, RUN, { status: " ", observationType: "x" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionBadRequestError);
      expect((e as Error).message).toBe("status is required");
    }
  });

  test("from CREATED → 409 'Only ACTIVE runs can record steps'", async () => {
    const { mod } = harness({ store: mkStore(freshRun()) });
    try {
      await mod.recordStep(LEARNER, RUN, { status: "DONE", observationType: "x" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("Only ACTIVE runs can record steps");
    }
  });
});

// ── attachEvidence (Controller :119-129 + Service :91-106) ──────────────────

describe("attachEvidence (references only; the terminal freeze)", () => {
  test("happy path: the reference row inserts with an explicit role and captured_at = the clock", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod } = harness({ store });
    const view = await mod.attachEvidence(LEARNER, RUN, "attempt:11111111-0000-4000-8000-000000000001", "ATTEMPT_EVIDENCE");
    expect(view.evidence).toHaveLength(1);
    expect(view.evidence[0]!.role).toBe("ATTEMPT_EVIDENCE");
    expect(view.evidence[0]!.capturedAt).toBe(NOW_ISO);
    expect(view.evidence[0]!.evidenceRef).toBe("attempt:11111111-0000-4000-8000-000000000001");
  });

  test("the RAW null role reaches the entity law: IllegalArgument class (400 FIXED body) — the ATTEMPT_EVIDENCE default is validation-only; a blank role is the VERBATIM 400", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod, sql } = harness({ store });
    try {
      await mod.attachEvidence(LEARNER, RUN, "attempt:x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionIllegalArgumentError);
      expect((e as Error).message).toBe("role is required");
    }
    expect(sql.queries.filter(isWrite).length).toBe(0);
    const { mod: mod2 } = harness({ store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    try {
      await mod2.attachEvidence(LEARNER, RUN, "attempt:x", "");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionBadRequestError);
      expect((e as Error).message).toBe("role is required");
    }
  });

  test("an explicit role carries through; a missing evidenceRef → 400 'evidenceRef is required' before any write", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod, sql } = harness({ store });
    const view = await mod.attachEvidence(LEARNER, RUN, "attempt:x", "NOTE_SECTION_READ");
    expect(view.evidence[0]!.role).toBe("NOTE_SECTION_READ");
    const before = sql.queries.filter(isWrite).length;
    try {
      await mod.attachEvidence(LEARNER, RUN, null);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("evidenceRef is required");
    }
    expect(sql.queries.filter(isWrite).length).toBe(before);
  });

  test("the returned view is the FULL reconstruction (steps + evidence together)", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0, current_step: 1 }));
    const { mod } = harness({ store });
    store.steps.push(stepRow({ sequence_no: 0 }), stepRow({ sequence_no: 1, status: "IN_PROGRESS", completed_at: null }));
    const view = await mod.attachEvidence(LEARNER, RUN, "attempt:x", "NOTE_SECTION_READ");
    expect(view.steps).toHaveLength(2);
    expect(view.steps.map((s) => s.sequenceNo)).toEqual([0, 1]);
    expect(view.evidence).toHaveLength(1);
  });
});

// ── complete / cancel (:193-200) ────────────────────────────────────────────

describe("complete and cancel (the terminal writes)", () => {
  test("complete: ACTIVE + the outcome text → COMPLETED with terminal_outcome + completed_at verbatim", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { mod } = harness({ store });
    const view = await mod.complete(LEARNER, RUN, "EVIDENCE_COLLECTED");
    expect(view.status).toBe("COMPLETED");
    expect(view.terminalOutcome).toBe("EVIDENCE_COLLECTED");
    expect(view.completedAt).toBe(NOW_ISO);
  });

  test("complete: a missing outcome → 400 'outcome is required' (the ENTITY's field name); from CREATED → 409 'Only ACTIVE runs can complete'", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    try {
      await mod.complete(LEARNER, RUN, " ");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InterventionBadRequestError);
      expect((e as Error).message).toBe("outcome is required");
    }
    const { mod: mod2 } = harness({ store: mkStore(freshRun()) });
    try {
      await mod2.complete(LEARNER, RUN, "EVIDENCE_COLLECTED");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("Only ACTIVE runs can complete");
    }
  });

  test("cancel: CREATED → CANCELLED + cancelled_at; F-061-A — the write carries NO terminal_outcome (the live-DB 500 class, disclosed)", async () => {
    const { mod, sql } = harness({ store: mkStore(freshRun()) });
    const view = await mod.cancel(LEARNER, RUN);
    expect(view.status).toBe("CANCELLED");
    expect(view.cancelledAt).toBe(NOW_ISO);
    expect(view.terminalOutcome).toBeNull();
    const update = sql.queries.find((q) => q.includes("set status = 'CANCELLED'"));
    expect(update).toBeDefined();
    // F-061-A is about the SET clause — the RETURNING projection legitimately lists every column
    expect((update as string).split(" returning ")[0]).not.toContain("terminal_outcome");
  });

  test("cancel from PAUSED also opens (any non-terminal status); the run stays honestly replayable as the 500 it is on live", async () => {
    const { mod } = harness({ store: mkStore(freshRun({ status: "PAUSED", started_at: T0 })) });
    const view = await mod.cancel(LEARNER, RUN);
    expect(view.status).toBe("CANCELLED");
  });
});

// ── the full reconstruction (GET /{runId} → view :218-247) ──────────────────

describe("the full reconstruction (run + ordered steps + evidence)", () => {
  test("steps serve sequence_no ASC; evidence serves captured_at ASC (attachment order)", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0, current_step: 2 }));
    store.steps.push(
      stepRow({ sequence_no: 1 }),
      stepRow({ sequence_no: 0 }),
      stepRow({ sequence_no: 2, status: "IN_PROGRESS", completed_at: null }),
    );
    store.evidence.push(
      evidenceRow({ id: "ee000000-0000-4000-8000-000000000002", captured_at: "2026-10-02T10:00:00Z" }),
      evidenceRow({ captured_at: "2026-10-01T10:00:00Z" }),
    );
    const { mod, sql } = harness({ store });
    const view = await mod.runView(LEARNER, RUN);
    expect(view.steps.map((s) => s.sequenceNo)).toEqual([0, 1, 2]);
    expect(view.evidence.map((e) => e.capturedAt)).toEqual([
      "2026-10-01T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
    ]);
    expect(sql.queries.find((q) => q.includes("intervention_run_step"))).toContain(
      "order by sequence_no asc",
    );
    expect(sql.queries.find((q) => q.includes("intervention_run_evidence"))).toContain(
      "order by captured_at asc",
    );
  });

  test("the wire projections: jsonb columns arrive as string[] through the verbatim parser", async () => {
    const store = mkStore(freshRun());
    const { mod } = harness({ store });
    const view = await mod.runView(LEARNER, RUN);
    expect(view.targetSpecificationPoints).toEqual([NODE]);
    expect(view.questionPartIds).toEqual([]);
    expect(view.allowedToolIds).toEqual([
      "get_specification_context",
      "get_learner_state",
      "start_practice",
    ]);
    expect(view.status).toBe("CREATED");
    expect(view.currentStep).toBeNull();
    expect(view.terminalOutcome).toBeNull();
  });
});
