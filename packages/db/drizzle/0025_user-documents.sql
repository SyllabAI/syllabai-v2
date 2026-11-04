-- T-AUDIT-TIER1 run-003 — the account-backed workspace document plane.
-- One row per (user, doc key): the hub's client workspace stores (deck
-- sessions, guided-flow state, progress overlays, teacher classes,
-- test-builder drafts, tutor/assistant/CLA thread transcripts) persist HERE
-- in addition to their reactive localStorage cache, so every surface follows
-- the signed-in account across devices and nothing learner/teacher-shaped
-- lives only in a browser profile.
-- Doc keys are app-pinned (packages/contracts workspaceDocKeySchema);
-- values are opaque JSONB documents the contracts cap at 512 KB.
-- Pure additive: NO column added to or altered on any pre-existing table.
CREATE TABLE "user_documents" (
	"user_id" uuid NOT NULL,
	"doc_key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_documents_pk" PRIMARY KEY ("user_id","doc_key")
);
--> statement-breakpoint
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
