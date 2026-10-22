-- 0010 — T-SENECA-001: Seneca resource packs. V2-NATIVE, ADDITIVE-ONLY
-- (BASELINE_DB.md §4; the 0006 class_features side-table precedent): zero
-- bytes change on any Flyway-era table — the pack hangs off the core-era
-- `assignments` row by FK, never reshapes it. Resource rows are the
-- operator-approved Seneca Resource Hub harvest (syllabai-experimental
-- @ d67bc1e3, PII-scrubbed), linked ONLY to hub courses that exist
-- (courses.json; pilot: igcse-chemistry-19 = Edexcel IGCSE Chemistry 4CH1).
--> statement-breakpoint
CREATE TABLE "seneca_resources" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"course_slug" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"title" text,
	"topic_path" text,
	"marks_total" integer,
	"question_type" varchar(60),
	"content_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seneca_resources_kind_check" CHECK ("kind"::text = ANY (ARRAY['courseSection'::character varying, 'examQuestion'::character varying, 'quiz'::character varying]::text[])),
	CONSTRAINT "seneca_resources_marks_check" CHECK ("marks_total" IS NULL OR "marks_total" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ix_seneca_resources_course_kind" ON "seneca_resources" USING "btree" ("course_slug", "kind");
--> statement-breakpoint
CREATE INDEX "ix_seneca_resources_topic" ON "seneca_resources" USING "btree" ("course_slug", "topic_path");
--> statement-breakpoint
CREATE TABLE "assignment_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"resource_id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_assignment_resources_pair" UNIQUE ("assignment_id", "resource_id"),
	CONSTRAINT "fk_assignment_resources_assignment" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT "fk_assignment_resources_resource" FOREIGN KEY ("resource_id") REFERENCES "public"."seneca_resources"("id"),
	CONSTRAINT "assignment_resources_position_check" CHECK ("position" >= 1)
);
--> statement-breakpoint
CREATE INDEX "ix_assignment_resources_assignment" ON "assignment_resources" USING "btree" ("assignment_id", "position");
--> statement-breakpoint
CREATE INDEX "ix_assignment_resources_resource" ON "assignment_resources" USING "btree" ("resource_id");
--> statement-breakpoint
CREATE TABLE "assignment_resource_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"resource_id" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'todo' NOT NULL,
	"marks_awarded" integer,
	"score" double precision,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_assignment_resource_states_triple" UNIQUE ("assignment_id", "learner_id", "resource_id"),
	CONSTRAINT "fk_assignment_resource_states_assignment" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT "fk_assignment_resource_states_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT "assignment_resource_states_status_check" CHECK ("status"::text = ANY (ARRAY['todo'::character varying, 'complete'::character varying]::text[])),
	CONSTRAINT "assignment_resource_states_marks_check" CHECK ("marks_awarded" IS NULL OR "marks_awarded" >= 0),
	CONSTRAINT "assignment_resource_states_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1))
);
--> statement-breakpoint
CREATE INDEX "ix_assignment_resource_states_learner" ON "assignment_resource_states" USING "btree" ("learner_id");
--> statement-breakpoint
CREATE INDEX "ix_assignment_resource_states_assignment" ON "assignment_resource_states" USING "btree" ("assignment_id");
