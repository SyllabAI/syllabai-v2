-- T-MG-AWARDS-1 run-001 (plan of record: docs/MG-MARK-PARITY-PLAN.md §3.2)
-- Additive v2-native pair: the AWARD plane (runtime, per-learner,
-- per-region award ledger joined to the definition plane) + the working
-- evidence blocks its workingRef points at. Pure additive: NO column is
-- added to any existing table.
--
-- mark_awards — the per-award ledger (the thing THEIRS lacks: MG's ledger
-- is region-grain; ours is award-grain with a per-award id, so duplicate
-- codes (P1/P1) and regrades are row-addressable). The unique constraint
-- IS the DC-7 claim: INSERT ... ON CONFLICT DO NOTHING is the
-- claim-before-write once-only law at row granularity
-- (createGradedEvidencePublisher's evidence_emitted guard, award-shaped).
-- mark_working_blocks — the workingBlocks slot of record; award rows point
-- here by working_ref (the evidence-pointer law). Exercised by Phase 4's
-- crop-mark pipeline; the table lands now so the pointer target exists.
CREATE TABLE "mark_awards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"document_ref_type" text NOT NULL,
	"document_ref_id" uuid NOT NULL,
	"region_key" text NOT NULL,
	"mark_point_id" uuid,
	"page" integer,
	"code" text NOT NULL,
	"awarded" boolean NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"working_ref" uuid,
	"pipeline_version" text NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mark_awards_learner_doc_region_code_ordinal" UNIQUE("learner_id","document_ref_id","region_key","code","ordinal")
);
--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Ledger-preserving law: NO cascade on mark_point_id — award rows are the
-- learner's record of record and must outlive mark-scheme edits; a
-- mark_points delete with live awards fails loud (default no action), the
-- opposite posture of the derived-geometry cascade on mark_point_rects.
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_mark_point_id_fkey" FOREIGN KEY ("mark_point_id") REFERENCES "public"."mark_points"("id") ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_mark_awards_learner_doc" ON "mark_awards" USING btree ("learner_id" uuid_ops,"document_ref_type" text_ops,"document_ref_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_score_check" CHECK (score >= 0 AND score <= max_score);
--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_max_score_check" CHECK (max_score > 0);
--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_ordinal_check" CHECK (ordinal >= 0);
--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_page_check" CHECK (page IS NULL OR page > 0);
--> statement-breakpoint
CREATE TABLE "mark_working_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"document_ref_type" text NOT NULL,
	"document_ref_id" uuid NOT NULL,
	"region_key" text NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mark_working_blocks" ADD CONSTRAINT "mark_working_blocks_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_mark_working_blocks_learner_doc" ON "mark_working_blocks" USING btree ("learner_id" uuid_ops,"document_ref_type" text_ops,"document_ref_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "mark_working_blocks" ADD CONSTRAINT "mark_working_blocks_kind_check" CHECK (kind IN ('ink', 'text', 'structure'));
