CREATE TABLE "mark_bands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mark_scheme_id" uuid NOT NULL,
	"level_index" integer NOT NULL,
	"marks_min" integer NOT NULL,
	"marks_max" integer NOT NULL,
	"descriptor_md" text NOT NULL,
	"guidance_md" text,
	"extraction_confidence" double precision,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_mark_band_level" UNIQUE("mark_scheme_id","level_index"),
	CONSTRAINT "mark_bands_level_index_check" CHECK (level_index >= 1),
	CONSTRAINT "mark_bands_marks_min_check" CHECK (marks_min >= 0),
	CONSTRAINT "mark_bands_marks_range_check" CHECK (marks_max >= marks_min),
	CONSTRAINT "mark_bands_extraction_confidence_check" CHECK ((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision))
);
--> statement-breakpoint
ALTER TABLE "human_marks" ADD COLUMN "band_placement" jsonb;--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD COLUMN "scheme_kind" varchar(10) DEFAULT 'POINTS' NOT NULL;--> statement-breakpoint
ALTER TABLE "smart_mark_agreement_evaluations" ADD COLUMN "metric" varchar(20) DEFAULT 'POINT_UNWEIGHTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "mark_bands" ADD CONSTRAINT "mark_bands_mark_scheme_id_fkey" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."mark_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_mark_bands_scheme" ON "mark_bands" USING btree ("mark_scheme_id" uuid_ops,"level_index" int4_ops);--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD CONSTRAINT "ck_mark_scheme_kind" CHECK ((scheme_kind)::text = ANY ((ARRAY['POINTS'::character varying, 'LEVELS'::character varying])::text[]));--> statement-breakpoint
ALTER TABLE "smart_mark_agreement_evaluations" ADD CONSTRAINT "ck_agreement_metric" CHECK ((metric)::text = ANY ((ARRAY['POINT_UNWEIGHTED'::character varying, 'BAND_QWK'::character varying])::text[]));
