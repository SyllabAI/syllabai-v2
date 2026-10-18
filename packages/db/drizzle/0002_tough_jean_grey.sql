CREATE TABLE "book_chapters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" varchar(80) NOT NULL,
	"doc_version" integer DEFAULT 1 NOT NULL,
	"course_id" varchar(60) NOT NULL,
	"unit_index" integer,
	"unit_title" text,
	"chapter_index" integer NOT NULL,
	"chapter_key" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"book_page_start" integer,
	"book_page_end" integer,
	"pdf_page_start" integer,
	"pdf_page_end" integer,
	"learning_objective" text,
	"spec_codes" jsonb NOT NULL,
	"validation_state" varchar(20) DEFAULT 'SUGGESTED' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_book_chapters_validation_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])),
	CONSTRAINT "ck_book_chapters_doc_version" CHECK (doc_version > 0)
);
--> statement-breakpoint
ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_document_fkey" FOREIGN KEY ("document_id","doc_version") REFERENCES "public"."documents"("document_id","doc_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_chapters_identity" ON "book_chapters" USING btree ("document_id" text_ops,"doc_version" int4_ops,"chapter_key" text_ops);--> statement-breakpoint
CREATE INDEX "ix_book_chapters_course" ON "book_chapters" USING btree ("course_id" text_ops);