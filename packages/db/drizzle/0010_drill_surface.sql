CREATE TABLE "drill_draws" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"course" varchar(64) NOT NULL,
	"code" varchar(32) NOT NULL,
	"seed" bigint NOT NULL,
	"part_ids" jsonb NOT NULL,
	"pool_size" integer NOT NULL,
	"fresh_pool_size" integer NOT NULL,
	"used_fallback" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_drill_draws_seed" CHECK (seed >= 0 AND seed <= 4294967295),
	CONSTRAINT "ck_drill_draws_pool_sizes" CHECK (pool_size >= 0 AND fresh_pool_size >= 0)
);
--> statement-breakpoint
CREATE TABLE "drill_part_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"draw_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"course" varchar(64) NOT NULL,
	"code" varchar(32) NOT NULL,
	"part_id" varchar(80) NOT NULL,
	"question_id" varchar(80) NOT NULL,
	"set_id" varchar(120) NOT NULL,
	"response_kind" varchar(8) NOT NULL,
	"response" jsonb NOT NULL,
	"correct" boolean,
	"marks_awarded" integer,
	"marks_possible" integer NOT NULL,
	"response_time_ms" bigint NOT NULL,
	"confidence_level" integer,
	"self_doubt_flag" boolean DEFAULT false NOT NULL,
	"provenance" varchar(40) DEFAULT 'DRILL' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_drill_evidence_draw_part" UNIQUE("draw_id","part_id"),
	CONSTRAINT "ck_drill_evidence_confidence" CHECK (confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5)),
	CONSTRAINT "ck_drill_evidence_time" CHECK (response_time_ms >= 0),
	CONSTRAINT "ck_drill_evidence_response_kind" CHECK ((response_kind)::text = ANY ((ARRAY['choice'::character varying, 'text'::character varying])::text[])),
	CONSTRAINT "ck_drill_evidence_marks" CHECK (marks_awarded IS NULL OR (marks_awarded >= 0 AND marks_awarded <= marks_possible))
);
--> statement-breakpoint
ALTER TABLE "drill_draws" ADD CONSTRAINT "fk_drill_draws_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_part_evidence" ADD CONSTRAINT "fk_drill_evidence_draw" FOREIGN KEY ("draw_id") REFERENCES "public"."drill_draws"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_part_evidence" ADD CONSTRAINT "fk_drill_evidence_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_drill_draws_learner_course_code_time" ON "drill_draws" USING btree ("learner_id" uuid_ops,"course" text_ops,"code" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_drill_evidence_learner_time" ON "drill_part_evidence" USING btree ("learner_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_drill_evidence_code" ON "drill_part_evidence" USING btree ("course" text_ops,"code" text_ops);