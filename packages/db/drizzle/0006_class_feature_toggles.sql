-- 0006 — T-TEACH-002 (ADR-CLASS-0001): class-scoped AI-feature toggles +
-- the course_registry bridge. V2-NATIVE, ADDITIVE-ONLY (BASELINE_DB.md §4):
-- zero bytes change on any Flyway-era table; the feature state rides a
-- side table keyed to classes(id) so the core-era row is untouched.
--> statement-breakpoint
CREATE TABLE "class_features" (
	"class_id" uuid PRIMARY KEY NOT NULL,
	"smart_mark" boolean DEFAULT true NOT NULL,
	"tutor" boolean DEFAULT true NOT NULL,
	"cla" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "fk_class_features_class" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE TABLE "course_registry" (
	"course_slug" varchar(100) PRIMARY KEY NOT NULL,
	"curriculum_code" varchar(50),
	"level" varchar(40) NOT NULL,
	"subject" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"board" varchar(50),
	"label" varchar(160),
	"status" varchar(16) NOT NULL,
	"source" varchar(200) NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ix_course_registry_cc" ON "course_registry" USING "btree" ("curriculum_code") WHERE "curriculum_code" IS NOT NULL;
