/**
 * T-MIG-061 — intervention-run contracts (frozen law @ 6cad6ef, syllabai-core).
 *
 * The Wave-6 intervention band's wire shapes, ported line-against-line from:
 *
 *   - intervention/dto/InterventionRunViews.java :16-89 → runViewSchema
 *     (RunView: the full reconstruction — identity + snapshot REFERENCES +
 *     ordered step observations + evidence references; the run carries
 *     references, never canonical evidence copies and never learner-state
 *     values to act on) + the four request records.
 *   - intervention/InterventionRunStatus.java :3-14 → the closed six-value
 *     status enum + the terminal() law (COMPLETED | CANCELLED | FAILED).
 *   - V26__intervention_runs.sql — the storage law the views must round-trip
 *     (status varchar(16) with the six-value check; terminal_outcome NOT
 *     NULL when terminal — see the CANCELLED finding on the service module).
 *
 * REQUEST VALIDATION LAW (disclosed dead branch): the four request records
 * carry @Size caps (R13) in the frozen source, but the frozen controller
 * binds them with bare @RequestBody — NO @Valid — so bean validation never
 * runs on this surface (contrast ClaController :97 @Valid @RequestBody).
 * The caps are INERT in v1; a 500-char evidenceRef is accepted exactly as a
 * 5-char one. The port reproduces the absence (zod .nullish() without
 * length caps) — the controller-layer requireText laws (the "{field} is
 * required" 400s) are the only gate, carried by the service module.
 *
 * LAWS CARRIED ELSEWHERE (tranche-1 split): the state machine (activate/
 * pause/resume/complete/cancel, the verbatim conflict messages), the
 * version-mismatch named 409 (intervention_version_mismatch, GlobalExceptionHandler
 * :71-77), the NBA-backed scenario derivation (InterventionRunScenarioService
 * :55-116) and the SHA-256 intervention hash live in
 * apps/api/src/services/intervention — this file is the wire shapes only.
 */

import { javaInstantSchema } from "./assessment";
import { z } from "zod";

/** InterventionRunStatus (:3-14) — closed enum, extensible by decision only. */
export const INTERVENTION_RUN_STATUSES = [
  "CREATED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

export const interventionRunStatusSchema = z.enum(INTERVENTION_RUN_STATUSES);
export type InterventionRunStatus = z.infer<typeof interventionRunStatusSchema>;

/** Status.terminal() (:11-13) — COMPLETED | CANCELLED | FAILED. */
export function interventionRunStatusTerminal(s: InterventionRunStatus): boolean {
  return s === "COMPLETED" || s === "CANCELLED" || s === "FAILED";
}

/** RunView.StepView (:63-73) — one ordered step observation. */
export const interventionStepViewSchema = z.object({
  stepId: z.string().uuid(),
  sequenceNo: z.number().int(),
  status: z.string(),
  observationType: z.string(),
  inputEvidenceRef: z.string().nullable(),
  outputEvidenceRef: z.string().nullable(),
  blockedReason: z.string().nullable(),
  startedAt: javaInstantSchema,
  completedAt: javaInstantSchema.nullable(),
});
export type InterventionStepView = z.infer<typeof interventionStepViewSchema>;

/** RunView.EvidenceView (:75-81) — an attached evidence REFERENCE. */
export const interventionEvidenceViewSchema = z.object({
  id: z.string().uuid(),
  evidenceRef: z.string(),
  role: z.string(),
  capturedAt: javaInstantSchema,
});
export type InterventionEvidenceView = z.infer<typeof interventionEvidenceViewSchema>;

/**
 * RunView (:18-61) — the full run reconstruction. The jsonb array columns
 * arrive on the wire as string[] via the controller's jsonArrayList parser
 * (a controlled shape written by this app — the parser is ported verbatim
 * on the service module, including its quote-stripping leniency).
 */
export const interventionRunViewSchema = z.object({
  runId: z.string().uuid(),
  learnerId: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  curriculumVersionId: z.string().uuid().nullable(),
  status: interventionRunStatusSchema,
  origin: z.string(),
  targetSpecificationPoints: z.array(z.string()),
  questionPartIds: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  diagnosisSnapshotRef: z.string().nullable(),
  learnerStateSnapshotRef: z.string().nullable(),
  diagnosisVersion: z.string().nullable(),
  actionType: z.string(),
  interventionVersion: z.string(),
  interventionHash: z.string(),
  allowedToolIds: z.array(z.string()),
  terminalOutcome: z.string().nullable(),
  currentStep: z.number().int().nullable(),
  createdAt: javaInstantSchema,
  startedAt: javaInstantSchema.nullable(),
  completedAt: javaInstantSchema.nullable(),
  cancelledAt: javaInstantSchema.nullable(),
  steps: z.array(interventionStepViewSchema),
  evidence: z.array(interventionEvidenceViewSchema),
});
export type InterventionRunView = z.infer<typeof interventionRunViewSchema>;

/**
 * ResumeRequest (:83-85) — resume identity (contract §6): both fields are
 * mandatory in BEHAVIOR (the controller requireText 400s), nullable in TYPE
 * (bare @RequestBody, no bean validation). The service module carries the
 * "interventionVersion is required" / "interventionHash is required" laws.
 */
export const interventionResumeRequestSchema = z.object({
  interventionVersion: z.string().nullish(),
  interventionHash: z.string().nullish(),
});
export type InterventionResumeRequest = z.infer<typeof interventionResumeRequestSchema>;

/**
 * StepRequest (:87-94) — one ordered step observation; the SEQUENCE NUMBER
 * IS SERVER-ASSIGNED (never a client field). status defaults to "DONE" at
 * the controller layer (a DONE step is the one that completes instantly —
 * completed_at set; any other status leaves it open). @Size caps inert —
 * see the header disclosure.
 */
export const interventionStepRequestSchema = z.object({
  status: z.string().nullish(),
  observationType: z.string().nullish(),
  inputEvidenceRef: z.string().nullish(),
  outputEvidenceRef: z.string().nullish(),
  blockedReason: z.string().nullish(),
});
export type InterventionStepRequest = z.infer<typeof interventionStepRequestSchema>;

/**
 * EvidenceRequest (:96-98) — an evidence REFERENCE attachment; the canonical
 * record is never copied (E2 acceptance criterion 5). role defaults to
 * "ATTEMPT_EVIDENCE" at the controller layer.
 */
export const interventionEvidenceRequestSchema = z.object({
  evidenceRef: z.string().nullish(),
  role: z.string().nullish(),
});
export type InterventionEvidenceRequest = z.infer<typeof interventionEvidenceRequestSchema>;

/** CompleteRequest (:100-102) — terminal outcome (e.g. EVIDENCE_COLLECTED). */
export const interventionCompleteRequestSchema = z.object({
  terminalOutcome: z.string().nullish(),
});
export type InterventionCompleteRequest = z.infer<typeof interventionCompleteRequestSchema>;
