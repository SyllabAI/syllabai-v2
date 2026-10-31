-- T-TEACHME-001 run-002 (plan of record: docs/TEACH_ME_PLAN.md §6; doctrine: ADR-040)
-- Additive v2-native pair for the Teach-Me API lane: the transcript plane
-- (teach_messages — student + pupil turns, the judge's {{TRANSCRIPT}} ground)
-- and the review-card plane (teach_review_cards — the session permalink's
-- ReviewCard of record). Pure additive: NO column added to or altered on any
-- pre-existing table.
--
-- CHANGE CONTROL (disclosed, receipted): run-001's 0020 migration shipped
--   CREATE UNIQUE INDEX "teach_candidates_open_idx" ON teach_misconception_candidates (status) WHERE status='candidate'
-- which admits exactly ONE open candidate row GLOBALLY — the second session
-- ever to reach end-of-session review would fail its candidate insert
-- (Wave 0 day one). This migration re-scopes the partial unique index to
-- (session_id) — one open candidate per session, which is the BDT candidate
-- queue's actual grain (plan §2.3). Own-band table, change control WITH this
-- receipt per the 0020 header's own disclosure law.
CREATE TABLE "teach_messages" (
        "id" uuid PRIMARY KEY NOT NULL,
        "session_id" uuid NOT NULL,
        "seq" integer NOT NULL,
        "role" text NOT NULL,
        "kind" text,
        "text" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "teach_messages_role_check" CHECK (role IN ('student','pupil')),
        CONSTRAINT "teach_messages_kind_check" CHECK (kind IN ('opening','paraphrase_probe','clarify_nudge','confusion'))
);
--> statement-breakpoint
CREATE INDEX "teach_messages_session_seq_idx" ON "teach_messages" USING btree ("session_id" uuid_ops,"seq" int4_ops);
--> statement-breakpoint
ALTER TABLE "teach_messages" ADD CONSTRAINT "teach_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."teach_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teach_review_cards" (
        "id" uuid PRIMARY KEY NOT NULL,
        "session_id" uuid NOT NULL,
        "card" jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "teach_review_cards_session_idx" ON "teach_review_cards" USING btree ("session_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "teach_review_cards" ADD CONSTRAINT "teach_review_cards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."teach_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "teach_candidates_open_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "teach_candidates_open_idx" ON "teach_misconception_candidates" USING btree ("session_id" uuid_ops) WHERE status = 'candidate';
