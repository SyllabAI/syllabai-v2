/**
 * T-MIG-061 — intervention-run services (frozen law @ 6cad6ef, syllabai-core).
 * The Wave-6 intervention band, ported line-against-line:
 *
 *   - InterventionRunService.java :33-178      → the lifecycle module below
 *     (create / activate / pause / resume / recordStep / attachEvidence /
 *     stepsOf / evidenceOf / complete / cancel / get).
 *   - InterventionRun.java :14-211             → the entity construction laws
 *     (requireText/requireJson "{field} is required" 400s, status starts
 *     CREATED) + the STATE MACHINE (:168-201, verbatim conflict messages):
 *     activate CREATED|PAUSED→ACTIVE (startedAt only on first activation),
 *     pause ACTIVE→PAUSED, recordStep ACTIVE-only with the monotonic
 *     sequence law, complete ACTIVE→COMPLETED with the outcome text,
 *     cancel any-open→CANCELLED; terminal runs immutable everywhere
 *     ("Terminal run cannot be changed").
 *   - InterventionRunScenarioService.java :46-116 → createFromRecommendation:
 *     the diagnosis snapshot IS the existing deterministic NBA output
 *     (referenced, never recomputed or reinterpreted — contract §7); the
 *     intervention definition is the fixed practice-intervention/v1 with its
 *     bounded application-defined tool list (contract §8, LLMs never expand
 *     it); the learner-state snapshot is a REFERENCE (node:attempts:update
 *     instant), an unmeasured topic pinned honestly as unmeasured (never
 *     zero); fail-closed: unknown subject root 404, no PRACTISE_QUESTIONS
 *     action 404 — never a fabricated or empty run.
 *   - InterventionRunController.java :62-239   → the controller-layer laws
 *     folded into the module (tranche-1 021/033/043/052 convention): the
 *     ownership gate FIRST on every endpoint (another learner's run is an
 *     indistinguishable 404 — no existence oracle), then the requireText
 *     "{field} is required" 400s, then the state machine; the
 *     IllegalStateException → ConflictException boundary translation (:204-216,
 *     the version-mismatch subclass passes through UNCHANGED for its NAMED
 *     409); the server-assigned step sequence (next = current+1, DONE steps
 *     complete instantly); the role/status defaults; the jsonArrayList wire
 *     parser (ported verbatim, quote-stripping leniency included).
 *
 * ERROR→STATUS ROUTE LAW (for tranche-2, GlobalExceptionHandler :33-77,
 * :167-171 — the module throws typed errors; routes own the mapping):
 *   - InterventionIllegalArgumentError → 400 bad_request "malformed request"
 *     (the FROZEN FIXED body — the :167 handler never echoes the exception
 *     detail, so "Unknown intervention run: …" and the hash-identity guard
 *     never reach the client).
 *   - InterventionBadRequestError      → 400 bad_request, message verbatim
 *     (the controller requireText laws — "{field} is required").
 *   - InterventionNotFoundError        → 404 not_found, message verbatim
 *     (the shared NotFoundException (resource, id) format — "intervention
 *     run {id} not found" and the scenario 404s).
 *   - InterventionConflictError        → 409 conflict, message verbatim (the
 *     state-machine texts, translated at the frozen controller boundary).
 *   - InterventionVersionMismatchError → 409 intervention_version_mismatch,
 *     message verbatim (GlobalExceptionHandler :71-77 — the named conflict;
 *     the client must start a new run, not retry).
 *
 * FROZEN FINDINGS PINNED (see the test file):
 *   - F-061-A (the R-043-A class): V26's intervention_run_terminal_ck
 *     requires terminal_outcome NOT NULL on every terminal status — but the
 *     frozen cancel() (:196-200) sets CANCELLED + cancelled_at WITHOUT an
 *     outcome, so the LIVE database rejects the write
 *     (DataIntegrityViolation → 500) while the domain layer reports success.
 *     The port writes exactly what v1 writes (the unit pins assert the write
 *     shape); the 500 is the storage seam's frozen behavior, disclosed and
 *     replayable.
 *   - F-061-B: the request records' @Size caps (R13) are INERT — the frozen
 *     controller binds bare @RequestBody (no @Valid), so no bean validation
 *     runs on this surface (contrast ClaController :97). Reproduced as the
 *     honest absence; disclosed on the contracts header.
 *   - F-061-C (dead-branch resolution, 053 classifier precedent): the Step
 *     entity's monotonic-sequence guard (:186-191) is UNREACHABLE through
 *     the module surface — the controller assigns next = current+1 (or 0),
 *     which always increases; a direct entity-level caller could violate it
 *     in v1's unit tests, but no wire path reaches it. Resolved as a comment
 *     (not code) with this disclosure.
 */

import { createHash } from "node:crypto";
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";
import type { NextBestActionsProvider } from "../learner-me";
import type {
  InterventionRunStatus,
  InterventionRunView,
} from "@syllabai/contracts";

// ── errors (message-carrying; the route layer owns status mapping) ──────────

/** Any IllegalArgumentException reaching the handler → 400 with the FIXED
 *  body "malformed request" (:167-171 — the detail is never echoed). */
export class InterventionIllegalArgumentError extends Error {}
/** shared BadRequestException / the requireText laws → 400, message verbatim. */
export class InterventionBadRequestError extends Error {}
/** shared NotFoundException (resource, id) → 404, message verbatim. */
export class InterventionNotFoundError extends Error {}
/** IllegalStateException at the controller boundary (:204-216) → 409, message verbatim. */
export class InterventionConflictError extends Error {}
/** InterventionVersionMismatchException → the NAMED 409 intervention_version_mismatch. */
export class InterventionVersionMismatchError extends Error {}

// ── the fixed prototype intervention definition (ScenarioService :57-67) ────

/** contract §4.1 intervention block — the prototype definition. */
export const INTERVENTION_VERSION = "practice-intervention/v1";

/** contract §8 — application-defined, LLMs never expand it. */
export const ALLOWED_TOOLS_JSON =
  '["get_specification_context","get_learner_state","start_practice"]';

export const INTERVENTION_ORIGIN_NBA = "NBA";

// ── status law (InterventionRunStatus :11-13) ───────────────────────────────

function isTerminal(status: InterventionRunStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED" || status === "FAILED";
}

// ── row shapes (V26 columns, plain names) ───────────────────────────────────

interface RunRow {
  run_id: string;
  learner_id: string;
  subject_id: string | null;
  curriculum_version_id: string | null;
  status: string;
  origin: string;
  target_specification_points: string;
  question_part_ids: string;
  evidence_refs: string;
  diagnosis_snapshot_ref: string | null;
  learner_state_snapshot_ref: string | null;
  diagnosis_version: string | null;
  action_type: string;
  intervention_version: string;
  intervention_hash: string;
  allowed_tool_ids: string;
  terminal_outcome: string | null;
  current_step: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface StepRow {
  step_id: string;
  run_id: string;
  sequence_no: number;
  status: string;
  observation_type: string;
  input_evidence_ref: string | null;
  output_evidence_ref: string | null;
  blocked_reason: string | null;
  started_at: string;
  completed_at: string | null;
}

interface EvidenceRow {
  id: string;
  run_id: string;
  evidence_ref: string;
  role: string;
  captured_at: string;
}

/** java Instant wire form — the fleet's Date rendering (toInstant parity). */
function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// ── commands (Service :165-177 records) ─────────────────────────────────────

export interface InterventionCreateCommand {
  learnerId: string;
  subjectId: string | null;
  curriculumVersionId: string | null;
  origin: string;
  targetSpecificationPoints: string;
  questionPartIds: string;
  evidenceRefs: string;
  diagnosisSnapshotRef: string | null;
  learnerStateSnapshotRef: string | null;
  diagnosisVersion: string | null;
  actionType: string;
  interventionVersion: string;
  /** blank/null → the hash is DERIVED (Service :48-51). */
  interventionHash: string | null;
  allowedToolIds: string;
}

export interface InterventionStepRequestBody {
  status?: string | null;
  observationType?: string | null;
  inputEvidenceRef?: string | null;
  outputEvidenceRef?: string | null;
  blockedReason?: string | null;
}

// ── the entity construction + hash laws ─────────────────────────────────────

function requireText(value: string | null | undefined, field: string): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    throw new InterventionBadRequestError(`${field} is required`);
  }
  return value;
}

function requireJson(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    throw new InterventionBadRequestError("JSON field is required");
  }
  return value;
}

/** Service :153-164 — SHA-256 over the canonical
 *  "version\nactionType\nallowedToolIds" triple, hex; a blank identity member
 *  throws the :167 IllegalArgumentException class (400 FIXED body). */
export function hashIntervention(
  version: string,
  actionType: string,
  allowedToolIds: string,
): string {
  const require = (value: string): string => {
    if (!value || value.trim().length === 0) {
      throw new InterventionIllegalArgumentError("Required intervention identity is missing");
    }
    return value;
  };
  const canonical = `${require(version)}\n${require(actionType)}\n${require(allowedToolIds)}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Controller :223-238 jsonArrayList — the run's JSON-array columns are
 * controlled shapes written by this app; the parser is ported VERBATIM
 * including its leniency (blank → [], bracket strip, comma split, quote
 * strip, empty-part skip).
 */
export function jsonArrayList(json: string | null): string[] {
  if (json === null) return [];
  let body = json.trim();
  if (body.startsWith("[")) body = body.substring(1);
  if (body.endsWith("]")) body = body.substring(0, body.length - 1);
  if (body.trim().length === 0) return [];
  const out: string[] = [];
  for (const part of body.split(",")) {
    let value = part.trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.substring(1, value.length - 1);
    }
    if (value.length > 0) out.push(value);
  }
  return out;
}

// ── view builders (Controller :218-247) ─────────────────────────────────────

function stepViewOf(s: StepRow): InterventionRunView["steps"][number] {
  return {
    stepId: s.step_id,
    sequenceNo: s.sequence_no,
    status: s.status,
    observationType: s.observation_type,
    inputEvidenceRef: s.input_evidence_ref,
    outputEvidenceRef: s.output_evidence_ref,
    blockedReason: s.blocked_reason,
    startedAt: iso(s.started_at) as string,
    completedAt: iso(s.completed_at),
  };
}

function evidenceViewOf(e: EvidenceRow): InterventionRunView["evidence"][number] {
  return {
    id: e.id,
    evidenceRef: e.evidence_ref,
    role: e.role,
    capturedAt: iso(e.captured_at) as string,
  };
}

function runViewOf(
  run: RunRow,
  steps: ReturnType<typeof stepViewOf>[],
  evidence: ReturnType<typeof evidenceViewOf>[],
): InterventionRunView {
  return {
    runId: run.run_id,
    learnerId: run.learner_id,
    subjectId: run.subject_id,
    curriculumVersionId: run.curriculum_version_id,
    status: run.status as InterventionRunStatus,
    origin: run.origin,
    targetSpecificationPoints: jsonArrayList(run.target_specification_points),
    questionPartIds: jsonArrayList(run.question_part_ids),
    evidenceRefs: jsonArrayList(run.evidence_refs),
    diagnosisSnapshotRef: run.diagnosis_snapshot_ref,
    learnerStateSnapshotRef: run.learner_state_snapshot_ref,
    diagnosisVersion: run.diagnosis_version,
    actionType: run.action_type,
    interventionVersion: run.intervention_version,
    interventionHash: run.intervention_hash,
    allowedToolIds: jsonArrayList(run.allowed_tool_ids),
    terminalOutcome: run.terminal_outcome,
    currentStep: run.current_step,
    createdAt: iso(run.created_at) as string,
    startedAt: iso(run.started_at),
    completedAt: iso(run.completed_at),
    cancelledAt: iso(run.cancelled_at),
    steps,
    evidence,
  };
}

// ── the module ──────────────────────────────────────────────────────────────

export interface InterventionDeps {
  sql: SqlFn;
  clock: SubmitClock;
  /** the deterministic NBA engine port (NextBestActionService.actionsFor) —
   *  the scenario service composes it, never reinterprets it (contract §7). */
  nextBestActions: NextBestActionsProvider;
}

export interface InterventionSubjectRow {
  id: string;
  curriculum_version_id: string;
}

export interface InterventionModule {
  /** GET /{runId} — ownedRun, then the full reconstruction. */
  runView(learnerId: string, runId: string): Promise<InterventionRunView>;
  /** the raw service get (:171-173) — exposed for the tranche-2 routes'
   *  existence-adjacent needs; unknown → IllegalArgument class (400 FIXED). */
  getRun(runId: string): Promise<RunRow>;
  /** the raw service create (:44-59) — the scenario path composes this. */
  create(command: InterventionCreateCommand): Promise<RunRow>;
  createFromRecommendation(learnerId: string, rootId: string): Promise<InterventionRunView>;
  activate(learnerId: string, runId: string): Promise<InterventionRunView>;
  pause(learnerId: string, runId: string): Promise<InterventionRunView>;
  resume(
    learnerId: string,
    runId: string,
    interventionVersion?: string | null,
    interventionHash?: string | null,
  ): Promise<InterventionRunView>;
  recordStep(
    learnerId: string,
    runId: string,
    request: InterventionStepRequestBody,
  ): Promise<InterventionRunView>;
  attachEvidence(
    learnerId: string,
    runId: string,
    evidenceRef?: string | null,
    role?: string | null,
  ): Promise<InterventionRunView>;
  complete(
    learnerId: string,
    runId: string,
    terminalOutcome?: string | null,
  ): Promise<InterventionRunView>;
  cancel(learnerId: string, runId: string): Promise<InterventionRunView>;
}

/**
 * The port of InterventionRunService + InterventionRunScenarioService + the
 * controller-layer laws (see the header). The tranche-2 routes construct
 * this with the driver's SqlFn, the shared clock and the NBA engine port.
 */
export function buildInterventionModule(deps: InterventionDeps): InterventionModule {
  const { sql, clock } = deps;


  /** Service get() :171-173 — unknown run → the :167 IllegalArgumentException
   *  class (route law: 400 FIXED "malformed request"). */
  async function getRun(runId: string): Promise<RunRow> {
    const rows = (await sql`
      select run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at from intervention_run where run_id = ${runId}::uuid`) as unknown as RunRow[];
    const run = rows[0] as RunRow | undefined;
    if (!run) throw new InterventionIllegalArgumentError(`Unknown intervention run: ${runId}`);
    return run;
  }

  /** Controller ownedRun() :181-189 — another learner's run is an
   *  INDISTINGUISHABLE 404 (no existence oracle across learners). */
  async function ownedRun(learnerId: string, runId: string): Promise<RunRow> {
    const run = await getRun(runId);
    if (run.learner_id !== learnerId) {
      throw new InterventionNotFoundError(`intervention run ${runId} not found`);
    }
    return run;
  }

  async function stepsOf(runId: string): Promise<StepRow[]> {
    return (await sql`
      select step_id, run_id, sequence_no, status, observation_type,
             input_evidence_ref, output_evidence_ref, blocked_reason,
             started_at, completed_at
      from intervention_run_step where run_id = ${runId}::uuid
      order by sequence_no asc`) as unknown as StepRow[];
  }

  async function evidenceOf(runId: string): Promise<EvidenceRow[]> {
    return (await sql`
      select id, run_id, evidence_ref, role, captured_at
      from intervention_run_evidence where run_id = ${runId}::uuid
      order by captured_at asc`) as unknown as EvidenceRow[];
  }

  /** the full reconstruction (Controller get :72-75 + view :218-247). */
  async function runView(learnerId: string, runId: string): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    const [steps, evidence] = [await stepsOf(runId), await evidenceOf(runId)];
    return runViewOf(
      run,
      steps.map(stepViewOf),
      evidence.map(evidenceViewOf),
    );
  }

  /** Service create() :44-59 — the hash derives when the command carries
   *  none; the entity constructor laws run first; status starts CREATED;
   *  @PrePersist (:96-101) generates the id + created_at. */
  async function create(command: InterventionCreateCommand): Promise<RunRow> {
    // the entity constructor laws (:112-133): origin/actionType/interventionVersion
    // are requireText ("{field} is required"), the four jsonb fields requireJson
    // ("JSON field is required")
    requireText(command.origin, "origin");
    requireJson(command.targetSpecificationPoints);
    requireJson(command.questionPartIds);
    requireJson(command.evidenceRefs);
    requireText(command.actionType, "actionType");
    requireText(command.interventionVersion, "interventionVersion");
    requireJson(command.allowedToolIds);
    const hash =
      command.interventionHash === null || command.interventionHash.trim().length === 0
        ? hashIntervention(command.interventionVersion, command.actionType, command.allowedToolIds)
        : command.interventionHash;
    const runId = clock.newId();
    const createdAt = clock.now();
    const saved = (await sql`
      insert into intervention_run (run_id, learner_id, subject_id, curriculum_version_id,
        status, origin, target_specification_points, question_part_ids, evidence_refs,
        diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version, action_type,
        intervention_version, intervention_hash, allowed_tool_ids, terminal_outcome,
        current_step, created_at, started_at, completed_at, cancelled_at)
      values (${runId}::uuid, ${command.learnerId}::uuid, ${command.subjectId}::uuid,
        ${command.curriculumVersionId}::uuid, 'CREATED', ${command.origin},
        ${command.targetSpecificationPoints}, ${command.questionPartIds},
        ${command.evidenceRefs}, ${command.diagnosisSnapshotRef},
        ${command.learnerStateSnapshotRef}, ${command.diagnosisVersion},
        ${command.actionType}, ${command.interventionVersion}, ${hash},
        ${command.allowedToolIds}, null, null,
        ${createdAt.toISOString()}::timestamptz, null, null, null)
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return saved[0] as RunRow;
  }

  /** Entity activate() :168-175 — CREATED|PAUSED → ACTIVE; startedAt only on
   *  the first activation (a PAUSED resume keeps the original start). */
  async function activate(learnerId: string, runId: string): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    const status = run.status as InterventionRunStatus;
    if (isTerminal(status)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (status !== "CREATED" && status !== "PAUSED") {
      throw new InterventionConflictError(`Run cannot become ACTIVE from ${status}`);
    }
    const now = clock.now();
    const firstActivation = run.started_at === null;
    const updated = (await sql`
      update intervention_run set status = 'ACTIVE',
        started_at = ${firstActivation ? now.toISOString() : run.started_at}::timestamptz
      where run_id = ${runId}::uuid
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return runViewOf(updated[0] as RunRow, [], []);
  }

  /** Entity pause() :177-181 — ACTIVE only. */
  async function pause(learnerId: string, runId: string): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    const status = run.status as InterventionRunStatus;
    if (isTerminal(status)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (status !== "ACTIVE") {
      throw new InterventionConflictError("Only ACTIVE runs can pause");
    }
    const updated = (await sql`
      update intervention_run set status = 'PAUSED'
      where run_id = ${runId}::uuid
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return runViewOf(updated[0] as RunRow, [], []);
  }

  /** Controller resume (:85-96) + Service resume (:66-77) + the entity
   *  activate — the EXACT stored identity or the NAMED 409 (the message
   *  carries the RUN's stored definition — what the client must match). */
  async function resume(
    learnerId: string,
    runId: string,
    interventionVersion?: string | null,
    interventionHash?: string | null,
  ): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    requireText(interventionVersion, "interventionVersion");
    requireText(interventionHash, "interventionHash");
    if (
      run.intervention_version !== interventionVersion ||
      run.intervention_hash !== interventionHash
    ) {
      throw new InterventionVersionMismatchError(
        `Intervention definition mismatch for run ${runId}; expected version=${run.intervention_version}, hash=${run.intervention_hash}`,
      );
    }
    const status = run.status as InterventionRunStatus;
    if (isTerminal(status)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (status !== "CREATED" && status !== "PAUSED") {
      throw new InterventionConflictError(`Run cannot become ACTIVE from ${status}`);
    }
    const now = clock.now();
    const firstActivation = run.started_at === null;
    const updated = (await sql`
      update intervention_run set status = 'ACTIVE',
        started_at = ${firstActivation ? now.toISOString() : run.started_at}::timestamptz
      where run_id = ${runId}::uuid
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return runViewOf(updated[0] as RunRow, [], []);
  }

  /** Controller recordStep (:101-117) + Service recordStep (:79-89) + the
   *  Step entity laws — the sequence number is SERVER-ASSIGNED (next =
   *  current+1, or 0 on the first step); the controller's "DONE" default
   *  neutralizes the VALIDATION pass only — the RAW null status reaches the
   *  Step entity constructor (:60-62), whose IllegalArgumentException gives
   *  the 400 FIXED body (:167; the entity's message never echoes). The state
   *  machine precedes the entity law (the frozen save order). F-061-C: the
   *  entity's monotonic guard is a dead branch on this path (server-assigned
   *  next always increases). */
  async function recordStep(
    learnerId: string,
    runId: string,
    request: InterventionStepRequestBody,
  ): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    const observationType = requireText(request.observationType, "observationType");
    requireText(
      request.status === null || request.status === undefined ? "DONE" : request.status,
      "status",
    );
    if (isTerminal(run.status as InterventionRunStatus)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (run.status !== "ACTIVE") {
      throw new InterventionConflictError("Only ACTIVE runs can record steps");
    }
    if (request.status === null || request.status === undefined) {
      // the Step entity constructor law (:60-62) on the RAW field — the
      // controller default never rewrites what the command carries
      throw new InterventionIllegalArgumentError("status is required");
    }
    const status = request.status;
    const next = run.current_step === null ? 0 : run.current_step + 1;
    const now = clock.now();
    const completedAt = status === "DONE" ? now : null;
    const stepId = clock.newId();
    await sql`
      update intervention_run set current_step = ${next}
      where run_id = ${runId}::uuid`;
    await sql`
      insert into intervention_run_step (step_id, run_id, sequence_no, status,
        observation_type, input_evidence_ref, output_evidence_ref, blocked_reason,
        started_at, completed_at)
      values (${stepId}::uuid, ${runId}::uuid, ${next}, ${status}, ${observationType},
        ${request.inputEvidenceRef ?? null}, ${request.outputEvidenceRef ?? null},
        ${request.blockedReason ?? null}, ${now.toISOString()}::timestamptz,
        ${completedAt === null ? null : completedAt.toISOString()}::timestamptz)`;
    return await runView(learnerId, runId);
  }

  /** Controller attachEvidence (:119-129) + Service attachEvidence (:91-106) —
   *  the canonical record is never copied (E2 criterion 5); terminal runs
   *  fail closed (contract §5). The "ATTEMPT_EVIDENCE" default neutralizes
   *  the VALIDATION pass only — the RAW null role reaches the Evidence
   *  entity constructor (:42-45), whose IllegalArgumentException gives the
   *  400 FIXED body (:167). The terminal check precedes the entity law. */
  async function attachEvidence(
    learnerId: string,
    runId: string,
    evidenceRef?: string | null,
    role?: string | null,
  ): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    requireText(evidenceRef, "evidenceRef");
    requireText(role === null || role === undefined ? "ATTEMPT_EVIDENCE" : role, "role");
    if (isTerminal(run.status as InterventionRunStatus)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (role === null || role === undefined) {
      // the Evidence entity constructor law (:42-45) on the RAW field
      throw new InterventionIllegalArgumentError("role is required");
    }
    const capturedAt = clock.now();
    const evidenceId = clock.newId();
    await sql`
      insert into intervention_run_evidence (id, run_id, evidence_ref, role, captured_at)
      values (${evidenceId}::uuid, ${runId}::uuid, ${evidenceRef}, ${role},
        ${capturedAt.toISOString()}::timestamptz)`;
    return await runView(learnerId, runId);
  }

  /** Entity complete() :193-199 — ACTIVE only, the outcome text mandatory
   *  (the "outcome is required" 400 carries the ENTITY's field name). */
  async function complete(
    learnerId: string,
    runId: string,
    terminalOutcome?: string | null,
  ): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    if (isTerminal(run.status as InterventionRunStatus)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    if (run.status !== "ACTIVE") {
      throw new InterventionConflictError("Only ACTIVE runs can complete");
    }
    const outcome = requireText(terminalOutcome, "outcome");
    const now = clock.now();
    const updated = (await sql`
      update intervention_run set status = 'COMPLETED',
        terminal_outcome = ${outcome}, completed_at = ${now.toISOString()}::timestamptz
      where run_id = ${runId}::uuid
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return runViewOf(updated[0] as RunRow, [], []);
  }

  /** Entity cancel() :196-200 — any OPEN status cancels. F-061-A: the frozen
   *  write carries NO terminal_outcome, which V26's terminal_ck rejects on a
   *  live database (500 at the storage seam — the domain layer never sees
   *  it). The port writes exactly what v1 writes. */
  async function cancel(learnerId: string, runId: string): Promise<InterventionRunView> {
    const run = await ownedRun(learnerId, runId);
    if (isTerminal(run.status as InterventionRunStatus)) {
      throw new InterventionConflictError("Terminal run cannot be changed");
    }
    const now = clock.now();
    const updated = (await sql`
      update intervention_run set status = 'CANCELLED',
        cancelled_at = ${now.toISOString()}::timestamptz
      where run_id = ${runId}::uuid
      returning run_id, learner_id, subject_id, curriculum_version_id, status, origin,
             target_specification_points, question_part_ids, evidence_refs,
             diagnosis_snapshot_ref, learner_state_snapshot_ref, diagnosis_version,
             action_type, intervention_version, intervention_hash, allowed_tool_ids,
             terminal_outcome, current_step, created_at, started_at, completed_at, cancelled_at`) as unknown as RunRow[];
    return runViewOf(updated[0] as RunRow, [], []);
  }

  /** ScenarioService :69-116 — the E2 first scenario, composition only
   *  (no new semantics invented): the NBA output is referenced, never
   *  recomputed; fail-closed 404s on both the subject root and the missing
   *  PRACTISE_QUESTIONS action. */
  async function createFromRecommendation(
    learnerId: string,
    rootId: string,
  ): Promise<InterventionRunView> {
    const subjectRows = (await sql`
      select id, curriculum_version_id from subjects
      where knowledge_node_id = ${rootId}::uuid
      limit 1`) as unknown as InterventionSubjectRow[];
    const subject = subjectRows[0] as InterventionSubjectRow | undefined;
    if (!subject) {
      throw new InterventionNotFoundError(`subject for knowledge root ${rootId} not found`);
    }

    const view = await deps.nextBestActions(learnerId, rootId);
    const action = view.actions.find((a) => a.actionType === "PRACTISE_QUESTIONS");
    if (!action) {
      throw new InterventionNotFoundError(
        `practice recommendation for learner ${learnerId} under root ${rootId} not found`,
      );
    }

    // the learner-state snapshot REFERENCE (ScenarioService :90-97): what the
    // recommendation observed at creation time (attempts + last update pin
    // the row); an unmeasured topic pins honestly as unmeasured
    const stateRows = (await sql`
      select attempts, updated_at from skill_states
      where learner_id = ${learnerId}::uuid and node_id = ${action.targetNodeId}::uuid
      limit 1`) as Array<{ attempts: number; updated_at: string | null }>;
    const state = stateRows[0] as { attempts: number; updated_at: string | null } | undefined;
    const learnerStateRef = state
      ? `skill-state:${action.targetNodeId}:a${state.attempts}:u${state.updated_at === null ? 0 : new Date(state.updated_at).getTime()}`
      : `skill-state:${action.targetNodeId}:unmeasured`;

    const diagnosisRef = `nba:${view.policy}:${rootId}:${action.targetNodeId}:rank${action.rank}:${action.reasonCode}`;

    const created = await create({
      learnerId,
      subjectId: subject.id,
      curriculumVersionId: subject.curriculum_version_id,
      origin: INTERVENTION_ORIGIN_NBA,
      targetSpecificationPoints: `["${action.targetNodeId}"]`,
      questionPartIds: "[]",
      evidenceRefs: "[]",
      diagnosisSnapshotRef: diagnosisRef,
      learnerStateSnapshotRef: learnerStateRef,
      diagnosisVersion: view.policy,
      actionType: action.actionType,
      interventionVersion: INTERVENTION_VERSION,
      interventionHash: null,
      allowedToolIds: ALLOWED_TOOLS_JSON,
    });
    return runViewOf(created, [], []);
  }

  return {
    runView,
    getRun,
    create,
    createFromRecommendation,
    activate,
    pause,
    resume,
    recordStep,
    attachEvidence,
    complete,
    cancel,
  };
}
