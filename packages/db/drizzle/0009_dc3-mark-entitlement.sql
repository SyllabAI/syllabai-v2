-- 0009 — DC-3 re-attempt entitlement (docs/DC3-REATTEMPT-ENTITLEMENT-PLAN.md):
-- (authored as 0008; RENUMBERED 0009 at the merge gate per first-pushed —
-- T-TEACH-011 teaching_toolkit took the 0008 slot mid-flight @337344dc;
-- DDL statements byte-preserved):
-- the append-only ai_mark_events ordinal ledger (counted in the markAttempt
-- path, never inferred; (learner, part, ordinal) UNIQUE = the ledger's
-- fail-closed exactness law) + the entitlement side tables (the 0006
-- class_features precedent; row-absent = free). V2-NATIVE, ADDITIVE-ONLY
-- (BASELINE_DB.md §4): CREATE-only — zero bytes change on any Flyway-era
-- table. Policy seed rows: free (0 re-marks/day) + paid (unlimited) — the
-- two tiers acceptance (a) pins; trial stays unshipped (spec open question
-- (a): the business value N is operator-gated, the row ships when the
-- ruling lands).
CREATE TABLE "ai_mark_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"answer_id" uuid NOT NULL,
	"question_part_id" uuid NOT NULL,
	"mark_ordinal" integer NOT NULL,
	"pipeline_version" varchar(24) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_mark_events_ordinal_check" CHECK (mark_ordinal >= 1)
);
--> statement-breakpoint
CREATE TABLE "mark_entitlement_policies" (
	"tier" varchar(16) PRIMARY KEY NOT NULL,
	"re_marks_per_day" integer,
	"unlimited" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ck_mark_entitlement_policies_tier" CHECK ((tier)::text = ANY ((ARRAY['free'::character varying, 'trial'::character varying, 'paid'::character varying])::text[])),
	CONSTRAINT "ck_mark_entitlement_policies_law" CHECK ((unlimited IS TRUE) OR (re_marks_per_day IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mark_entitlements" (
	"learner_id" uuid PRIMARY KEY NOT NULL,
	"tier" varchar(16) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_mark_events" ADD CONSTRAINT "fk_ai_mark_events_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_mark_events" ADD CONSTRAINT "fk_ai_mark_events_attempt" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_mark_events" ADD CONSTRAINT "fk_ai_mark_events_answer" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_entitlements" ADD CONSTRAINT "fk_mark_entitlements_learner" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_entitlements" ADD CONSTRAINT "fk_mark_entitlements_tier" FOREIGN KEY ("tier") REFERENCES "public"."mark_entitlement_policies"("tier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_ai_mark_events_learner_part_ordinal" ON "ai_mark_events" USING btree ("learner_id","question_part_id","mark_ordinal");--> statement-breakpoint
CREATE INDEX "ix_ai_mark_events_learner_part" ON "ai_mark_events" USING btree ("learner_id" uuid_ops,"question_part_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_ai_mark_events_attempt" ON "ai_mark_events" USING btree ("attempt_id" uuid_ops);
--> statement-breakpoint
INSERT INTO "mark_entitlement_policies" ("tier", "re_marks_per_day", "unlimited", "updated_at")
	VALUES ('free', 0, false, now()), ('paid', NULL, true, now());
