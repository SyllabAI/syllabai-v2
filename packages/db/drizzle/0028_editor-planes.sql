-- ADR-044 run-002 — the editor planes (0028). Design of record:
-- docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md §3 (the grant plane) and
-- §7 (the proposal/receipt planes). Phase 1 "role plumbing and history" —
-- the tables the requireEditor shell and GET /api/v1/editor/me read.
--
-- THREE additive tables. The ADR §7 header says "two tables" but §3 cards
-- editor_grants explicitly (the grant ROW is the role — requireEditor has
-- nothing to check without it), so the migration creates all three; the
-- receipt discloses the §7 undercount rather than silently resolving it.
--
-- Pure additive: NO column is added to or altered on any existing table.
-- FK discipline follows the 0022/0023 personal-state law for the user-
-- owned rows (grants + proposals ARE the user's editor state; a deleted
-- user takes them). Receipts are the append-only audit plane (the P1
-- receipt pattern extended to humans): their rows cascade with their
-- proposal, and their actor column is deliberately FK-free so the audit
-- trail survives actor-account deletion (integrity is app-enforced from
-- Phase 2's proposal router, which only ever writes the session user's
-- own id).
--
-- Applied as RAW SQL per the 0007 disclosure law (no drizzle bookkeeping
-- on apply); the grants lane (scripts/editor-apply-0028.ts + the
-- workflow_dispatch runner) carries the F5-S7 app-role grants and the
-- census receipts — the Phase 1 exit criterion.

-- ── editor_grants (ADR-044 §3) ──────────────────────────────────────────────
-- Possession of an unrevoked row IS the role. scopes is the closed
-- vocabulary of packages/contracts editorScopeSchema ("workbench" is the
-- Phase 1/2 member). granted_by is FK-free on purpose: the grant record
-- survives grantor-account deletion (who granted is data, not a live
-- reference). One active grant per user — the partial unique index.
CREATE TABLE "editor_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "editor_grants" ADD CONSTRAINT "editor_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_editor_grants_active_user" ON "editor_grants" ("user_id") WHERE "revoked_at" IS NULL;

-- ── editor_edit_proposals (ADR-044 §7) ──────────────────────────────────────
-- One human edit proposal. tier is SERVER-CLASSIFIED (the §6 classifier —
-- no client byte is authoritative); course_slug is re-verified server-side
-- as defense-in-depth (the kebab CHECK here is the DB-level backstop);
-- fields is the field-level before/after delta (jsonb, capped at the
-- router by EDITOR_FIELD_DELTA_MAX_BYTES — the DB never re-litigates the
-- wire law); base_sha is the corpus commit the edit was cut against;
-- proposal_pr stays NULL until the PR exists (§6 step 3).
CREATE TABLE "editor_edit_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" varchar(120) NOT NULL,
	"bank" varchar(20) NOT NULL,
	"target_path" text NOT NULL,
	"tier" smallint NOT NULL,
	"fields" jsonb NOT NULL,
	"base_sha" text NOT NULL,
	"proposal_pr" text,
	"state" varchar(30) NOT NULL DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editor_edit_proposals" ADD CONSTRAINT "editor_edit_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_editor_edit_proposals_user" ON "editor_edit_proposals" ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_editor_edit_proposals_state" ON "editor_edit_proposals" ("state");
--> statement-breakpoint
ALTER TABLE "editor_edit_proposals" ADD CONSTRAINT "editor_edit_proposals_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
--> statement-breakpoint
ALTER TABLE "editor_edit_proposals" ADD CONSTRAINT "editor_edit_proposals_bank_check" CHECK (bank IN ('questions', 'notes', 'flashcards'));
--> statement-breakpoint
ALTER TABLE "editor_edit_proposals" ADD CONSTRAINT "editor_edit_proposals_tier_check" CHECK (tier IN (1, 2, 3));
--> statement-breakpoint
ALTER TABLE "editor_edit_proposals" ADD CONSTRAINT "editor_edit_proposals_state_check" CHECK (state IN ('draft', 'preflight_failed', 'queued_review', 'approved', 'merged', 'rejected', 'superseded'));

-- ── editor_edit_receipts (ADR-044 §7) ───────────────────────────────────────
-- The append-only journal (propose / preflight_refusal / approve / reject /
-- stale_regate / merge / serve). hashes + gate_run_id stay nullable — an
-- action need not carry every evidence field; detail carries the rest as
-- jsonb. Append-only by APPLICATION law (no UPDATE/DELETE grant is issued
-- to the app role for this table by the grants lane — the F5-S7 grants are
-- the enforcement, not a trigger).
CREATE TABLE "editor_edit_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposal_id" uuid NOT NULL,
	"actor" uuid NOT NULL,
	"action" varchar(30) NOT NULL,
	"before_hash" text,
	"after_hash" text,
	"gate_run_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editor_edit_receipts" ADD CONSTRAINT "editor_edit_receipts_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."editor_edit_proposals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_editor_edit_receipts_proposal" ON "editor_edit_receipts" ("proposal_id");
--> statement-breakpoint
ALTER TABLE "editor_edit_receipts" ADD CONSTRAINT "editor_edit_receipts_action_check" CHECK (action IN ('propose', 'preflight_refusal', 'approve', 'reject', 'stale_regate', 'merge', 'serve'));
