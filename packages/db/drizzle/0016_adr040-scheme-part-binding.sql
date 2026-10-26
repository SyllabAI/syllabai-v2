ALTER TABLE "mark_schemes" ADD COLUMN "question_part_id" uuid;--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD CONSTRAINT "mark_schemes_question_part_id_fkey" FOREIGN KEY ("question_part_id") REFERENCES "public"."question_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_mark_schemes_part" ON "mark_schemes" USING btree ("question_part_id" uuid_ops);
