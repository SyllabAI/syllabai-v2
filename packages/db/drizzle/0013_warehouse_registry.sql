CREATE TABLE "warehouse_registry" (
	"course_group" varchar(60) PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"warehouse_url_env" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'ASSIGNED' NOT NULL,
	"template_version" varchar(20) NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"serving_since" timestamp with time zone,
	CONSTRAINT "ck_warehouse_registry_status" CHECK ((status)::text = ANY ((ARRAY['ASSIGNED'::character varying, 'SERVING'::character varying, 'RETIRED'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "warehouse_registry" ADD CONSTRAINT "warehouse_registry_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_warehouse_registry_subject" ON "warehouse_registry" USING btree ("subject_id" uuid_ops);--> statement-breakpoint
-- Seed of record (T-OPS-PLANE-001 run-003 assignment): W1 = maths-4ma1,
-- ep-calm-queen-az36lppq (ap-southeast-1), template wh-v1. Status stays
-- ASSIGNED — the serving flip itself is the operator's T1 order (UPDATE
-- status='SERVING', serving_since=now()), never part of the migration.
INSERT INTO "warehouse_registry" ("course_group", "subject_id", "warehouse_url_env", "status", "template_version", "assigned_at")
VALUES ('maths-4ma1', '763dfe2d-d2b5-48fb-ba4c-2f708c637b26', 'SYLLABAI_WAREHOUSE_URL_MATHS_4MA1', 'ASSIGNED', 'wh-v1', now())
ON CONFLICT ("course_group") DO NOTHING;
