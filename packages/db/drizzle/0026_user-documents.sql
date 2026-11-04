-- T-AUDIT-TIER1 run-003 — the workspace-document plane (0026).
--
-- ONE additive table backing the hub's remaining localStorage-only
-- workspace stores (operator order 2026-11-03: "things that are
-- localStorage-only, make them saved to account" — Tier-1 generalization
-- of the run-002 teacher-stores band). The three conversation pools this
-- band wires (tutor-threads / assistant-threads / cla-question-threads)
-- plus five named siblings join via the closed key vocabulary of
-- packages/contracts workspaceDocKeySchema — the key IS the routing
-- decision, so unknown keys fail validation_failed before any query.
--
-- Pure additive: NO column is added to or altered on any existing table.
-- Values are opaque jsonb (512KB plane cap is enforced at the ROUTER,
-- packages/contracts WORKSPACE_DOC_MAX_BYTES — the DB never re-litigates
-- the wire law). One row per (user_id, doc_key); last-write-wins per key
-- with a server updated_at of record (the hub's per-store conservative
-- union reconciles, the plane does not).
--
-- FK discipline follows the 0022/0023 personal-state precedent (itself
-- the 0019 learner_pdf_drawings law): these rows ARE the user's own
-- working state, not records of account; a deleted user takes them.
CREATE TABLE "user_documents" (
	"user_id" uuid NOT NULL,
	"doc_key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_documents_pk" PRIMARY KEY("user_id","doc_key")
);
--> statement-breakpoint
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
