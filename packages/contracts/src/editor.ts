/**
 * Editor-me standalone wire — ADR-044 Phase 1 (v2-NATIVE, additive; NO
 * frozen-core counterpart — the frozen core's Role vocabulary stays exactly
 * { STUDENT, TEACHER, ADMIN }; editor-ness is a GRANT ROW, not an enum
 * member, the workspace-docs class). Design of record:
 * docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md §3 (the grant plane), §5
 * (the capability matrix), §7 (the data plane + caps).
 *
 * Phase 1 law (this module):
 *  - GET /api/v1/editor/me → EditorMeView (200, the capability surface:
 *    { editor: true, scopes }) for a holder of an unrevoked editor_grants
 *    row; the Boot 403 body otherwise; the Boot 401 body unauthenticated.
 *    Revocation is effective on the next request — the API checks the grant
 *    at request time, never inside a token (ADR §3).
 *  - scopes ride the closed vocabulary editorScopeSchema. "workbench" is
 *    the Phase 1/2 member (gates the Workbench surfaces, ADR §5/§9). The
 *    vocabulary is CLOSED: an unknown scope cannot bind (validation_failed
 *    at grant time, Phase 2's grant tooling) and cannot round-trip here.
 *
 * Phase 2 law (pinned NOW so caps are the law of record before any writer
 * exists — ADR §7 "every cap is a pinned test"):
 *  - EDITOR_OPEN_PROPOSALS_MAX — open proposals per user (10).
 *  - EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX — receipt rows per proposal (200).
 *  - EDITOR_FIELD_DELTA_MAX_BYTES — field-delta bytes per proposal; the
 *    WORKSPACE_DOC_MAX_BYTES figure (512KB) reused because it is already
 *    load-tested (ADR §7 verbatim). The DB never re-litigates the wire law.
 *
 * The proposal/receipt record schemas are ALSO pinned here in Phase 1 —
 * they mirror the 0028_editor-planes.sql census exactly (the migration is
 * the shape law; the schemas are its wire image) so Phase 2's router cannot
 * drift from the tables it writes. No endpoint serves them yet.
 */
import { z } from "zod";
import { WORKSPACE_DOC_MAX_BYTES } from "./workspace-docs";

/** The kebab-case registry key law (the teacher-me slug grammar, verbatim). */
export const editorKebabSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must match "^[a-z0-9]+(-[a-z0-9]+)*$"');

// ── the grant plane (§3) ─────────────────────────────────────────────────────

/** Closed scope vocabulary. Phase 1/2 member: "workbench". */
export const EDITOR_SCOPES = ["workbench"] as const;
export const editorScopeSchema = z.enum(EDITOR_SCOPES);
export type EditorScope = z.infer<typeof editorScopeSchema>;

/** GET /api/v1/editor/me — 200 body for grant holders (ADR §5/§8). */
export const editorMeViewSchema = z.object({
  editor: z.literal(true),
  scopes: z.array(editorScopeSchema),
});
export type EditorMeView = z.infer<typeof editorMeViewSchema>;

// ── the caps (§7 — pinned tests below; enforced by Phase 2's router) ────────

export const EDITOR_OPEN_PROPOSALS_MAX = 10;
export const EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX = 200;
export const EDITOR_FIELD_DELTA_MAX_BYTES = WORKSPACE_DOC_MAX_BYTES;
/** Shape bound (not an ADR cap): the per-proposal fields[] array length.
 * The payload law is the BYTES cap above; this just keeps the array shape
 * bounded so a proposal can never be a dump — disclosed in the receipt. */
export const EDITOR_FIELDS_PER_PROPOSAL_MAX = 100;

// ── the proposal/receipt planes (§7 — the wire image of 0028_editor-planes.sql) ──

/** Closed bank vocabulary (the 0028 bank CHECK, verbatim). */
export const EDITOR_BANKS = ["questions", "notes", "flashcards"] as const;
export const editorBankSchema = z.enum(EDITOR_BANKS);
export type EditorBank = z.infer<typeof editorBankSchema>;

/** Closed proposal-state vocabulary (the 0028 state CHECK, verbatim). */
export const EDITOR_PROPOSAL_STATES = [
  "draft",
  "preflight_failed",
  "queued_review",
  "approved",
  "merged",
  "rejected",
  "superseded",
] as const;
export const editorProposalStateSchema = z.enum(EDITOR_PROPOSAL_STATES);
export type EditorProposalState = z.infer<typeof editorProposalStateSchema>;

/** Tier vocabulary — SERVER-CLASSIFIED (§6; no client byte is authoritative). */
export const EDITOR_TIERS = [1, 2, 3] as const;
export const editorTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type EditorTier = z.infer<typeof editorTierSchema>;

/** Closed receipt-action vocabulary (the 0028 action CHECK, verbatim). */
export const EDITOR_RECEIPT_ACTIONS = [
  "propose",
  "preflight_refusal",
  "approve",
  "reject",
  "stale_regate",
  "merge",
  "serve",
] as const;
export const editorReceiptActionSchema = z.enum(EDITOR_RECEIPT_ACTIONS);
export type EditorReceiptAction = z.infer<typeof editorReceiptActionSchema>;

/** One field-level before/after delta (the fields[] member — §6 step 3). */
export const editorFieldDeltaSchema = z.object({
  field: z.string().min(1).max(200),
  before: z.string().max(EDITOR_FIELD_DELTA_MAX_BYTES),
  after: z.string().max(EDITOR_FIELD_DELTA_MAX_BYTES),
});
export type EditorFieldDelta = z.infer<typeof editorFieldDeltaSchema>;

/** The proposal record (the editor_edit_proposals wire image). */
export const editorEditProposalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  courseSlug: editorKebabSlugSchema,
  bank: editorBankSchema,
  /** corpus-relative target path in syllabai-resources of record */
  targetPath: z.string().min(1).max(400),
  tier: editorTierSchema,
  fields: z.array(editorFieldDeltaSchema).max(EDITOR_FIELDS_PER_PROPOSAL_MAX),
  baseSha: z.string().min(7).max(80),
  proposalPr: z.string().max(200).nullable(),
  state: editorProposalStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EditorEditProposal = z.infer<typeof editorEditProposalSchema>;

/** The receipt record (the editor_edit_receipts wire image; append-only). */
export const editorEditReceiptSchema = z.object({
  id: z.string().uuid(),
  proposalId: z.string().uuid(),
  actor: z.string().uuid(),
  action: editorReceiptActionSchema,
  beforeHash: z.string().max(128).nullable(),
  afterHash: z.string().max(128).nullable(),
  gateRunId: z.string().max(128).nullable(),
  detail: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type EditorEditReceipt = z.infer<typeof editorEditReceiptSchema>;

// ── the Phase 2 proposal plane (§8 — requests, verdicts, inventory) ──────────
//
// The wire law of the run-011 build. The typed refusal/warning shapes here
// are the WIRE IMAGE of @syllabai/editor-gates' GateRefusal/GateWarning —
// the engine stays dependency-free, so this module mirrors its shapes by
// law (the parity is pinned by the api service tests, which run the real
// engine through these schemas on every golden-path case). Request schemas
// are two-envelope-shaped: the shell classifies malformed_body BEFORE
// validation_failed (the workspace-docs R-1 law, verbatim).

/** The G-SCOPE/G-CANON/G-SER/G-FIELD/G-CHAR/G-ASSET/G-EYES families (the
 * engine's own vocabulary, mirrored verbatim — a drifted family refuses). */
const GATE_FAMILIES_WIRE = [
  "G-CANON",
  "G-SER",
  "G-FIELD",
  "G-CHAR",
  "G-ASSET",
  "G-EYES",
  "G-SCOPE",
] as const;

/** The typed gate refusal (the editor-readable refusal of record). */
export const editorGateRefusalSchema = z.object({
  code: z.string().min(1).max(80),
  family: z.enum(GATE_FAMILIES_WIRE),
  field: z.string().max(200).nullable(),
  message: z.string().max(500),
  hint: z.string().max(500),
});
export type EditorGateRefusal = z.infer<typeof editorGateRefusalSchema>;

/** Non-preflight advisory (never blocks a proposal). */
export const editorGateWarningSchema = z.object({
  code: z.string().min(1).max(80),
  field: z.string().max(200).nullable(),
  message: z.string().max(500),
});
export type EditorGateWarning = z.infer<typeof editorGateWarningSchema>;

/** Base-shape context derived from the SERVED artifact (advisory data the
 * engine validates field references against — the hub derives it from the
 * served question it renders; the server cannot independently verify it in
 * Phase 2, which every affected receipt discloses). */
export const editorBaseCtxSchema = z.object({
  partCount: z.number().int().positive().max(50).optional(),
  choiceLabels: z
    .record(z.string().regex(/^\d+$/), z.array(z.string().regex(/^[A-F]$/)).max(8))
    .optional(),
  assetPaths: z.array(z.string().min(1).max(300)).max(2000).optional(),
});
export type EditorBaseCtx = z.infer<typeof editorBaseCtxSchema>;

/** POST /api/v1/editor/preflight — stateless gate run (persists nothing). */
export const editorPreflightRequestSchema = z.object({
  bank: editorBankSchema,
  targetPath: z.string().min(1).max(400),
  fields: z.array(editorFieldDeltaSchema).min(1).max(EDITOR_FIELDS_PER_PROPOSAL_MAX),
  baseCtx: editorBaseCtxSchema.optional(),
});
export type EditorPreflightRequest = z.infer<typeof editorPreflightRequestSchema>;

export const editorPreflightResponseSchema = z.object({
  ok: z.boolean(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  tierReasons: z.array(z.string().max(400)),
  refusals: z.array(editorGateRefusalSchema),
  warnings: z.array(editorGateWarningSchema),
  disclosure: z.string().max(1000),
});
export type EditorPreflightResponse = z.infer<typeof editorPreflightResponseSchema>;

/** POST /api/v1/editor/proposals — create (the server re-runs the engine;
 * the client's tier is advisory, never authoritative, ADR §6). */
export const editorCreateProposalRequestSchema = editorPreflightRequestSchema.extend({
  baseSha: z.string().min(7).max(80),
});
export type EditorCreateProposalRequest = z.infer<typeof editorCreateProposalRequestSchema>;

export const editorProposalCreateResponseSchema = z.object({
  proposal: editorEditProposalSchema,
  receipts: z.array(editorEditReceiptSchema).max(EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX),
  autoMerged: z.boolean(),
  /** The server-side engine verdict that decided the outcome (the client's
   * own preflight was advisory; this verdict is the one of record). */
  verdict: editorPreflightResponseSchema,
  disclosure: z.string().max(1000),
});
export type EditorProposalCreateResponse = z.infer<typeof editorProposalCreateResponseSchema>;

export const editorProposalListSchema = z.object({
  proposals: z.array(editorEditProposalSchema),
});
export type EditorProposalList = z.infer<typeof editorProposalListSchema>;

export const editorProposalReceiptsSchema = z.object({
  proposal: editorEditProposalSchema,
  receipts: z.array(editorEditReceiptSchema),
});
export type EditorProposalReceipts = z.infer<typeof editorProposalReceiptsSchema>;

/** GET /api/v1/editor/banks — the corpus inventory of record. Phase 2
 * derives it from the LIVE resources HEAD (read-only GitHub REST; the
 * commit/PR transport is what stays simulated until Phase 3). */
export const editorBankCountsSchema = z.object({
  questions: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  flashcards: z.number().int().nonnegative(),
});
export type EditorBankCounts = z.infer<typeof editorBankCountsSchema>;

export const editorBankInventorySchema = z.object({
  headSha: z.string().min(7).max(80),
  fetchedAt: z.string(),
  disclosure: z.string().max(1000),
  truncated: z.boolean().optional(),
  courses: z
    .array(
      z.object({
        slug: editorKebabSlugSchema,
        counts: editorBankCountsSchema,
      }),
    )
    .max(300),
});
export type EditorBankInventory = z.infer<typeof editorBankInventorySchema>;

/** The error codes of record — the router raises exactly these (the caps
 * are the contracts law; the upstream class mirrors editor-history's). */
export const EDITOR_ERR_OPEN_PROPOSALS_CAP = "editor_cap_open_proposals" as const;
export const EDITOR_ERR_FIELD_DELTA_CAP = "editor_field_delta_too_large" as const;
export const EDITOR_ERR_UPSTREAM = "upstream_unavailable" as const;
export const EDITOR_ERR_RATE_LIMITED = "rate_limited" as const;
export const EDITOR_ERR_NOT_FOUND = "not_found" as const;
/** Tier 3 is refused, never carried (ADR §6: the Workbench discloses the
 * classification and stops; the lane pipeline owns structural surgery). */
export const EDITOR_ERR_TIER3_REFUSED = "editor_tier3_refused" as const;
/** The Phase 2 merge-transport disclosure — the string lives in
 * @syllabai/shared (byte-identical across planes by law: the hub renders
 * it in the Workbench banner and cannot consume this package), re-exported
 * here so the api's wire law keeps ONE import path. */
export { EDITOR_PHASE2_MERGE_DISCLOSURE } from "@syllabai/shared";
