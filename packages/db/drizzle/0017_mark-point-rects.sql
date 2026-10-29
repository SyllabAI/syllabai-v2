-- T-MG-MP-RECT-1 run-001 (plan of record: docs/MG-MARK-PARITY-PLAN.md §3.1)
-- Additive v2-native side table: normalized region geometry for mark_points
-- (the MathsGenie rects plane adopted onto the definition plane). Pure
-- additive: NO column is added to mark_points itself; the join is by
-- mark_point_id FK. Geometry is normalized 0..1 per page (multi-rect per
-- mark point, ordinal-disambiguated — their rects[] as rows).
CREATE TABLE "mark_point_rects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mark_point_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"extraction_confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mark_point_rect_point_ordinal" UNIQUE("mark_point_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_mark_point_id_fkey" FOREIGN KEY ("mark_point_id") REFERENCES "public"."mark_points"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_mark_point_rects_point" ON "mark_point_rects" USING btree ("mark_point_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "ix_mark_point_rects_page" ON "mark_point_rects" USING btree ("page" int4_ops);
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_page_check" CHECK (page > 0);
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_x_check" CHECK ((x >= (0)::double precision) AND (x <= (1)::double precision));
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_y_check" CHECK ((y >= (0)::double precision) AND (y <= (1)::double precision));
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_width_check" CHECK ((width >= (0)::double precision) AND (width <= (1)::double precision));
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_height_check" CHECK ((height >= (0)::double precision) AND (height <= (1)::double precision));
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_ordinal_check" CHECK (ordinal >= 0);
--> statement-breakpoint
ALTER TABLE "mark_point_rects" ADD CONSTRAINT "mark_point_rects_extraction_confidence_check" CHECK ((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision));
