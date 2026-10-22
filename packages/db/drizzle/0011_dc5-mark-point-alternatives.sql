CREATE TABLE "mark_point_alternatives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mark_point_id" uuid NOT NULL,
	"mark_scheme_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"value" text NOT NULL,
	"normalised" text NOT NULL,
	"source_span" text,
	"extraction_method" varchar(120),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_mpa_row" UNIQUE("mark_point_id","kind","normalised"),
	CONSTRAINT "ck_mpa_kind" CHECK ((kind)::text = ANY ((ARRAY['ALTERNATIVE'::character varying, 'NUMERIC'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "mark_point_alternatives" ADD CONSTRAINT "mpa_mark_point_fk" FOREIGN KEY ("mark_point_id") REFERENCES "public"."mark_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_point_alternatives" ADD CONSTRAINT "mpa_mark_scheme_fk" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."mark_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_mpa_scheme" ON "mark_point_alternatives" USING btree ("mark_scheme_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_mpa_point" ON "mark_point_alternatives" USING btree ("mark_point_id" uuid_ops);