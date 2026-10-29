-- 0014 — T-SENECA-001 run-004 (the placement rework): the two assignment
-- side tables land on the MAIN chain WITHOUT any seneca FK. Ruling of
-- record (operator trace 1a16adad843081b1, receipt run-003): seneca_resources
-- is a CORPUS plane — it lives in the sci-chem course-group warehouse
-- (template wh-v2 = frozen wh-v1 + the pack DDL fragment), never in main
-- (docs/DATA-PLANE-PLACEMENT.md; docs/ADR-038-COURSE_GROUP_VECTOR_WAREHOUSES.md).
-- Seam law §4.1: ids are the contract — assignment_resources.resource_id stays
-- a plain varchar(64) id reference resolved against the warehouse at serving
-- time (the registry row seeds SYLLABAI_WAREHOUSE_URL_SCI_CHEM at T1); the
-- fail-closed existence/course validation lives app-side (plan D5). Live-main
-- convergence: run-002's pre-ruling apply created these tables WITH
-- fk_assignment_resources_resource -> seneca_resources — the T1 step drops
-- that FK together with the zero-residue seneca_resources drop (no dual
-- writes ever). Additive-only (BASELINE_DB.md §4); the core-era assignments
-- row is never ALTERed — the pack hangs off it by FK.
--> statement-breakpoint
CREATE TABLE "assignment_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"resource_id" varchar(64) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_assignment_resources_pair" UNIQUE ("assignment_id", "resource_id"),
	CONSTRAINT "fk_assignment_resources_assignment" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
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
