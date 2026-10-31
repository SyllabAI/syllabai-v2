-- T-TEACHME-001 run-001 (plan of record: docs/TEACH_ME_PLAN.md; doctrine: ADR-040)
-- Additive v2-native quartet for the learn-by-teaching lane: the session plane
-- (teach_sessions), its spec-point-grounded objectives (teach_objectives), the
-- APPEND-ONLY coverage ledger (teach_objective_coverages) and the BDT
-- misconception candidate queue (teach_misconception_candidates). Pure
-- additive: NO column is added to or altered on any existing table.
-- Vocabularies are text + CHECK per the v2-native migration law (no new pg
-- enums — 0018/0019 precedent). ADR-040 D1 (operator "accept all",
-- 2026-11-01): this lane appends AI_SUGGESTED evidence (kind TEACH_SESSION)
-- ONLY; of-record mastery is untouched; the only promotion path is teacher
-- ratification in the workbench. FKs are NO ACTION on purpose: sessions are
-- records, never cascade-deleted. The quota/ceiling law (D3: 3/day,
-- Quick=3/In-Depth=4, <=10 LLM calls, <=60k tokens) and the anti-gaming law
-- (D4: >=40 words, 0.80 overlap, 7-day dedupe) live in the app config, not in
-- DDL — the schema only carries the counters (message_count, llm_call_count,
-- tokens_used, flags) the sentinel reads.
CREATE TABLE "teach_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"spec_point_ids" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"length" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"llm_call_count" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "teach_sessions_spec_points_check" CHECK (jsonb_typeof(spec_point_ids) = 'array' AND jsonb_array_length(spec_point_ids) BETWEEN 1 AND 3),
	CONSTRAINT "teach_sessions_difficulty_check" CHECK (difficulty IN ('easy','medium','hard')),
	CONSTRAINT "teach_sessions_length_check" CHECK (length IN ('quick','in_depth')),
	CONSTRAINT "teach_sessions_mode_check" CHECK (mode IN ('chat')),
	CONSTRAINT "teach_sessions_status_check" CHECK (status IN ('active','review_pending','completed','abandoned'))
);
--> statement-breakpoint
CREATE INDEX "teach_sessions_user_created_idx" ON "teach_sessions" USING btree ("user_id" uuid_ops,"created_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX "teach_sessions_course_created_idx" ON "teach_sessions" USING btree ("course_id" text_ops,"created_at" timestamptz_ops);
--> statement-breakpoint
ALTER TABLE "teach_sessions" ADD CONSTRAINT "teach_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teach_objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"text" text NOT NULL,
	"spec_point_ids" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teach_objectives_ordinal_check" CHECK (ordinal BETWEEN 1 AND 4),
	CONSTRAINT "teach_objectives_status_check" CHECK (status IN ('not_started','covered','not_covered','flagged'))
);
--> statement-breakpoint
CREATE INDEX "teach_objectives_session_idx" ON "teach_objectives" USING btree ("session_id" uuid_ops,"ordinal" int2_ops);
--> statement-breakpoint
ALTER TABLE "teach_objectives" ADD CONSTRAINT "teach_objectives_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."teach_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teach_objective_coverages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"message_seq" integer NOT NULL,
	"covered" boolean NOT NULL,
	"evidence_quote" text NOT NULL,
	"verdict" text NOT NULL,
	"contradiction_detected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "teach_coverages_objective_idx" ON "teach_objective_coverages" USING btree ("objective_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "teach_coverages_session_seq_idx" ON "teach_objective_coverages" USING btree ("session_id" uuid_ops,"message_seq" int4_ops);
--> statement-breakpoint
ALTER TABLE "teach_objective_coverages" ADD CONSTRAINT "teach_objective_coverages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."teach_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teach_objective_coverages" ADD CONSTRAINT "teach_objective_coverages_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."teach_objectives"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teach_misconception_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"spec_point_ids" jsonb NOT NULL,
	"statement" text NOT NULL,
	"matched_misconception_id" text,
	"confidence" double precision NOT NULL,
	"status" text NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teach_candidates_confidence_check" CHECK (confidence >= 0 AND confidence <= 1),
	CONSTRAINT "teach_candidates_status_check" CHECK (status IN ('candidate','ratified','rejected'))
);
--> statement-breakpoint
CREATE INDEX "teach_candidates_session_idx" ON "teach_misconception_candidates" USING btree ("session_id" uuid_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX "teach_candidates_open_idx" ON "teach_misconception_candidates" USING btree ("status" text_ops) WHERE status = 'candidate';
--> statement-breakpoint
ALTER TABLE "teach_misconception_candidates" ADD CONSTRAINT "teach_misconception_candidates_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."teach_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- ADR-040 D1 append-only law: the coverage ledger takes INSERTs only. Drizzle
-- does not model triggers (db:pull leaves this untouched — it lives in the DB,
-- not the TS schema). If a future migration legitimately needs to rewrite
-- history, drop the trigger under change control WITH a receipt in
-- .syllabai/receipts/T-TEACHME-001/.
CREATE OR REPLACE FUNCTION "teach_forbid_mutation"() RETURNS trigger AS $func$ BEGIN RAISE EXCEPTION 'teach_objective_coverages is append-only (ADR-040 D1)'; END; $func$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "teach_coverages_append_only" BEFORE UPDATE OR DELETE ON "teach_objective_coverages" FOR EACH ROW EXECUTE FUNCTION "teach_forbid_mutation"();
