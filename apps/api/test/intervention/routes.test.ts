/**
 * T-MIG-061 tranche-2 route tests — the observable HTTP contract of
 * InterventionRunController (POST /api/v1/learners/me/intervention-runs — the
 * nine endpoints) over the REAL intervention module on stubbed sql (fakeSql +
 * the in-memory run store, the tranche-1 harness shapes). 200/201 bodies are
 * validated against the CANONICAL contracts schemas (interventionRunViewSchema).
 * Error envelopes pinned to the frozen GlobalExceptionHandler law: the :167
 * FIXED "malformed request" body for the IllegalArgument class (an UNKNOWN run
 * is a 400, NOT a 404 — runs.get throws the :167 class first), the verbatim
 * requireText 400s, the state-machine 409s, the NAMED intervention_version_mismatch
 * 409, malformed_body for unreadable/non-object bodies, validation_failed for a
 * missing @RequestParam, and the Boot 401 shell. The route-owned complete-endpoint
 * controller law ("terminalOutcome is required" AFTER ownedRun, BEFORE the state
 * machine — :131-137) is pinned on BOTH the ACTIVE and the wrong-state path.
 * F-061-A: cancel writes NO terminal_outcome (disclosed).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createInterventionRouter } from "../../src/routes/intervention";
import { buildInterventionModule } from "../../src/services/intervention";
import { toErrorResponse } from "../../src/services/identity/errors";
import { interventionRunViewSchema } from "@syllabai/contracts";
import type { SubmitClock } from "../../src/services/selfmark";
import type { NextBestActionsView } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (the tranche-1 harness constants) ──────────────────────────────

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
const INTERVENTION_VERSION = "practice-intervention/v1";

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
  allowed_tool_ids: '["get_specification_context","get_learner_state","start_practice"]',
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

// ── the fakeSql route shapes (the tranche-1 harness) ────────────────────────

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

const nbaView = (actions: NbaAction[]): NextBestActionsView => ({
  learnerId: LEARNER,
  rootId: ROOT,
  asOf: NOW_ISO,
  policy: "nba-rules/v1.3",
  actions,
});

// ── the harness ──────────────────────────────────────────────────────────────

type Store = { row: Row | null; steps: Row[]; evidence: Row[] };

const mkStore = (row: Row | null = null): Store => ({ row, steps: [], evidence: [] });

const BASE = "/api/v1/learners/me/intervention-runs";
const STUDENT = { email: "student@example.edu", userId: LEARNER, roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const asOther = () => ({ ...STUDENT, userId: OTHER_LEARNER });
const anon = () => null;

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  opts: {
    store?: Store;
    nba?: (learnerId: string, rootId: string) => Promise<NextBestActionsView>;
    subjectFound?: boolean;
  } = {},
) {
  const store = opts.store ?? mkStore();
  const sql = fakeSql([
    runSelectRoute(store),
    insertRunRoute(store),
    activateRoute(store),
    completeRoute(store),
    cancelRoute(store),
    stepCurrentRoute(store),
    insertStepRoute(store),
    stepsSelectRoute(store),
    insertEvidenceRoute(store),
    evidenceSelectRoute(store),
    subjectRoute(opts.subjectFound ?? true),
    skillStateRoute(true),
  ]);
  const nba = opts.nba ?? (async () => nbaView([practiseAction()]));
  const mod = buildInterventionModule({ sql, clock, nextBestActions: nba });
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route(BASE, createInterventionRouter(mod));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" }, 500 as const);
  });
  return { app, store };
}

// ── POST / — createFromRecommendation (:62-68) ──────────────────────────────

describe("POST /api/v1/learners/me/intervention-runs (create-from-recommendation)", () => {
  test("happy: 201 CREATED (@ResponseStatus :63), canonical RunView — CREATED status, the NBA scenario snapshot, the derived hash", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}?rootId=${ROOT}`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(interventionRunViewSchema.parse(body)).toMatchObject({
      runId: NEW_ID_1,
      learnerId: LEARNER,
      subjectId: SUBJECT,
      curriculumVersionId: CV,
      status: "CREATED",
      origin: "NBA",
      targetSpecificationPoints: [NODE],
      questionPartIds: [],
      evidenceRefs: [],
      diagnosisSnapshotRef: `nba:nba-rules/v1.3:${ROOT}:${NODE}:rank1:LOW_MASTERY`,
      learnerStateSnapshotRef: `skill-state:${NODE}:a3:u${NOW_MILLIS}`,
      diagnosisVersion: "nba-rules/v1.3",
      actionType: "PRACTISE_QUESTIONS",
      interventionVersion: INTERVENTION_VERSION,
      interventionHash: DERIVED_HASH,
      allowedToolIds: ["get_specification_context", "get_learner_state", "start_practice"],
      terminalOutcome: null,
      currentStep: null,
      startedAt: null,
      steps: [],
      evidence: [],
    });
  });

  test("missing rootId → 400 validation_failed 'missing required parameter: rootId' (:185-190, the session-56 law)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: rootId");
  });

  test("malformed rootId → 400 bad_request FIXED 'malformed request' (:167-170, MethodArgumentTypeMismatch)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}?rootId=not-a-uuid`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown subject root → 404 not_found 'subject for knowledge root … not found' (the scenario fail-closed law)", async () => {
    const { app } = makeApp(asStudent, { subjectFound: false, nba: async () => nbaView([practiseAction()]) }); // subjectFound:false overrides the harness default
    const res = await app.request(`${BASE}?rootId=${ROOT}`, { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`subject for knowledge root ${ROOT} not found`);
  });

  test("no PRACTISE_QUESTIONS action → 404 not_found, the practice-recommendation message (never a fabricated run)", async () => {
    const { app } = makeApp(asStudent, { nba: async () => nbaView([]) });
    const res = await app.request(`${BASE}?rootId=${ROOT}`, { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`practice recommendation for learner ${LEARNER} under root ${ROOT} not found`);
  });

  test("anonymous → 401 Boot body (the SecurityConfig :91 shell answers before any handler)", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`${BASE}?rootId=${ROOT}`, { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ── GET /{runId} (:71-75) ────────────────────────────────────────────────────

describe("GET /api/v1/learners/me/intervention-runs/:runId", () => {
  test("happy: 200 full reconstruction (ordered steps + evidence), canonical RunView", async () => {
    const store = mkStore(freshRun({ current_step: 0 }));
    store.steps.push(stepRow({}));
    store.evidence.push(evidenceRow({}));
    const { app } = makeApp(asStudent, { store });
    const res = await app.request(`${BASE}/${RUN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = interventionRunViewSchema.parse(body);
    expect(parsed.runId).toBe(RUN);
    expect(parsed.status).toBe("CREATED");
    expect(parsed.currentStep).toBe(0);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]).toMatchObject({ stepId: STEP_ID, sequenceNo: 0, status: "DONE", observationType: "practice_set_started" });
    expect(parsed.evidence).toHaveLength(1);
    expect(parsed.evidence[0]).toMatchObject({ id: EV_ID, role: "ATTEMPT_EVIDENCE" });
  });

  test("unknown run → 400 bad_request FIXED 'malformed request' (the :167 IllegalArgument class — NOT a 404, runs.get :171-173)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(null) });
    const res = await app.request(`${BASE}/${RUN}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("foreign run → 404 not_found 'intervention run {id} not found' (ownedRun :147-154 — no existence oracle)", async () => {
    const { app } = makeApp(asOther, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`intervention run ${RUN} not found`);
  });

  test("path var not-a-uuid → 400 bad_request FIXED 'malformed request' (:167-170)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}/not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("malformed request");
  });
});

// ── POST /{runId}/activate + /pause (:77-87) ────────────────────────────────

describe("POST …/:runId/activate", () => {
  test("CREATED → 200 ACTIVE, startedAt set on the first activation", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/activate`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(interventionRunViewSchema.parse(body)).toMatchObject({ status: "ACTIVE", startedAt: NOW_ISO });
  });

  test("COMPLETED → 409 conflict 'Terminal run cannot be changed' (the entity law, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "COMPLETED", terminal_outcome: "EVIDENCE_COLLECTED" })) });
    const res = await app.request(`${BASE}/${RUN}/activate`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("Terminal run cannot be changed");
  });

  test("ACTIVE → 409 conflict 'Run cannot become ACTIVE from ACTIVE' (the transition law, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/activate`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe("Run cannot become ACTIVE from ACTIVE");
  });
});

// ── POST /{runId}/resume (:90-98) — the NAMED 409 surface ───────────────────

describe("POST …/:runId/resume", () => {
  test("exact stored identity → 200 ACTIVE (startedAt preserved from the first activation)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interventionVersion: INTERVENTION_VERSION, interventionHash: DERIVED_HASH }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // the stored started_at (T0) round-trips through javaInstantSchema's millis rendering
    expect(interventionRunViewSchema.parse(body)).toMatchObject({ status: "ACTIVE", startedAt: "2026-10-01T10:00:00.000Z" });
  });

  test("wrong hash → 409 intervention_version_mismatch, the message carries the RUN's stored identity (:71-77)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interventionVersion: INTERVENTION_VERSION, interventionHash: "deadbeef" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("intervention_version_mismatch");
    expect(body.message).toBe(
      `Intervention definition mismatch for run ${RUN}; expected version=${INTERVENTION_VERSION}, hash=${DERIVED_HASH}`,
    );
  });

  test("missing interventionVersion → 400 bad_request 'interventionVersion is required' (requireText :234-238, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interventionHash: DERIVED_HASH }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("interventionVersion is required");
  });

  test("non-object body → 400 malformed_body (HttpMessageNotReadable parity — the whole document must bind)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });
});

// ── POST /{runId}/steps (:101-116) — the server-assigned sequence ───────────

describe("POST …/:runId/steps", () => {
  test("happy DONE on a fresh run: 200, sequenceNo 0 (server-assigned from current_step null), completedAt set", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { app } = makeApp(asStudent, { store });
    const res = await app.request(`${BASE}/${RUN}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ observationType: "practice_set_started", status: "DONE", outputEvidenceRef: "attempt:11111111-0000-4000-8000-000000000001" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = interventionRunViewSchema.parse(body);
    expect(parsed.currentStep).toBe(0);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]).toMatchObject({ sequenceNo: 0, status: "DONE", completedAt: NOW_ISO });
  });

  test("missing observationType → 400 bad_request 'observationType is required' (requireText, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("observationType is required");
  });

  test("ABSENT status → 400 bad_request FIXED 'malformed request' (the DONE default neutralizes the VALIDATION pass only — the RAW null reaches the entity law :60-62, the :167 body never echoes it)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ observationType: "practice_set_started" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("PAUSED run → 409 conflict 'Only ACTIVE runs can record steps' (the state machine precedes the insert, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "PAUSED", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ observationType: "practice_set_started", status: "DONE" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe("Only ACTIVE runs can record steps");
  });
});

// ── POST /{runId}/evidence (:119-129) — references only ─────────────────────

describe("POST …/:runId/evidence", () => {
  test("happy: 200, an explicit role attaches the reference (nothing copied — the canonical record stays outside)", async () => {
    const store = mkStore(freshRun({ status: "ACTIVE", started_at: T0 }));
    const { app } = makeApp(asStudent, { store });
    const res = await app.request(`${BASE}/${RUN}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceRef: "attempt:11111111-0000-4000-8000-000000000001", role: "ATTEMPT_EVIDENCE" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = interventionRunViewSchema.parse(body);
    expect(parsed.evidence).toHaveLength(1);
    // the id is SERVER-ASSIGNED (clock.newId() → NEW_ID_1), capturedAt is the clock's now
    expect(parsed.evidence[0]).toMatchObject({ id: NEW_ID_1, evidenceRef: "attempt:11111111-0000-4000-8000-000000000001", role: "ATTEMPT_EVIDENCE", capturedAt: NOW_ISO });
  });

  test("ABSENT role → 400 bad_request FIXED 'malformed request' (F-061-D wire parity: the ATTEMPT_EVIDENCE default neutralizes the VALIDATION pass only — the RAW null role reaches the Evidence entity constructor :42-45, the :167 body never echoes it)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceRef: "attempt:11111111-0000-4000-8000-000000000001" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("missing evidenceRef → 400 bad_request 'evidenceRef is required' (requireText :123, verbatim — it precedes the entity law)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("evidenceRef is required");
  });
});

// ── POST /{runId}/complete (:131-137) — the ROUTE-OWNED controller law ──────

describe("POST …/:runId/complete (the controller requireText is route-owned)", () => {
  test("happy on ACTIVE: 200 COMPLETED, terminalOutcome + completedAt set", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalOutcome: "EVIDENCE_COLLECTED" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(interventionRunViewSchema.parse(body)).toMatchObject({
      status: "COMPLETED",
      terminalOutcome: "EVIDENCE_COLLECTED",
      completedAt: NOW_ISO,
    });
  });

  test("ACTIVE + missing terminalOutcome → 400 bad_request 'terminalOutcome is required' (the CONTROLLER field name, not the entity's 'outcome')", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "ACTIVE", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("terminalOutcome is required");
  });

  test("CREATED + missing terminalOutcome → 400 'terminalOutcome is required' — the controller law PRECEDES the state machine (the wire-parity pin: the module alone would 409 here)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("terminalOutcome is required");
  });

  test("PAUSED + a present outcome → 409 conflict 'Only ACTIVE runs can complete' (the state machine, verbatim)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "PAUSED", started_at: T0 })) });
    const res = await app.request(`${BASE}/${RUN}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalOutcome: "EVIDENCE_COLLECTED" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe("Only ACTIVE runs can complete");
  });
});

// ── POST /{runId}/cancel (:139-143) — F-061-A disclosed ─────────────────────

describe("POST …/:runId/cancel", () => {
  test("CREATED → 200 CANCELLED, cancelledAt set, terminal_outcome stays null (F-061-A: the frozen write carries NO outcome — the V26 terminal-ck live-DB 500 class, disclosed)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun()) });
    const res = await app.request(`${BASE}/${RUN}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(interventionRunViewSchema.parse(body)).toMatchObject({
      status: "CANCELLED",
      cancelledAt: NOW_ISO,
      terminalOutcome: null,
      completedAt: null,
    });
  });

  test("COMPLETED → 409 conflict 'Terminal run cannot be changed' (terminal runs immutable everywhere)", async () => {
    const { app } = makeApp(asStudent, { store: mkStore(freshRun({ status: "COMPLETED", terminal_outcome: "EVIDENCE_COLLECTED" })) });
    const res = await app.request(`${BASE}/${RUN}/cancel`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe("Terminal run cannot be changed");
  });
});
