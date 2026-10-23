-- 0012 — Study-Plan Builder (docs/STUDY-PLAN-BUILDER-PLAN.md, launch trace
-- 1a1658959017ed4d): the learner's plan-config row — the three builder
-- steps of record (step 1 courses, step 2 per-course exam seasons, step 3
-- per-day minutes) — the ONLY persisted state of the lane. The generated
-- week and every task completion state stay query-time projections over the
-- DC-7 event rows (never stored: "the tree wrote the plan, not the
-- learner"). V2-NATIVE, ADDITIVE-ONLY (BASELINE_DB.md §4): CREATE-only —
-- zero bytes change on any Flyway-era table. uq_study_plan_learner = ONE
-- active plan per learner (the observed product's single plan; PUT
-- replaces). Anchor immutability: created_at is the day-walk anchor and
-- never moves on edit (updated_at carries the edit).
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"courses" jsonb NOT NULL,
	"seasons" jsonb NOT NULL,
	"weekday_minutes" integer NOT NULL,
	"weekend_minutes" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_study_plan_learner" UNIQUE("learner_id"),
	CONSTRAINT "ck_study_plan_minutes" CHECK (((weekday_minutes >= 0) AND (weekend_minutes >= 0)))
);
--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "fk_study_plans_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;