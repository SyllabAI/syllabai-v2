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
