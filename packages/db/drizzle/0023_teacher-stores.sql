-- T-TIER1 run-002 — the account-backed teacher stores (frontend deep-audit
-- Tier 2, operator order 2026-11-03: "things that are localStorage-only,
-- make them saved to account").
--
-- Three ADDITIVE tables backing the hub teacher stores that until now lived
-- in ONE browser only (localStorage "syllabai.savedTests.v1",
-- "syllabai.teachingCoverage.v1", "syllabai.contentReviews.v1"). Pure
-- additive: NO column is added to or altered on any existing table.
-- Vocabularies are text + CHECK per the v2-native migration law (no new pg
-- enums — 0018/0019/0020/0022 precedent).
--
-- FK discipline follows the 0022 personal-state precedent (itself the 0019
-- learner_pdf_drawings law) — these rows ARE the teacher's own working
-- state (saved test-library entries, a taught-codes overlay, validation
-- verdicts), not records of account; a deleted user takes them with them.
CREATE TABLE "teacher_saved_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"course_slug" text NOT NULL,
	"course_code" text NOT NULL,
	"subtopics" jsonb NOT NULL,
	"target_marks" integer,
	"max_questions" integer,
	"question_ids" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "teacher_saved_tests_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "teacher_saved_tests_subtopics_check" CHECK (jsonb_typeof(subtopics) = 'array'),
	CONSTRAINT "teacher_saved_tests_question_ids_check" CHECK (question_ids IS NULL OR jsonb_typeof(question_ids) = 'array'),
	CONSTRAINT "teacher_saved_tests_bounds_check" CHECK ((target_marks IS NULL OR target_marks >= 0) AND (max_questions IS NULL OR max_questions >= 0))
);
--> statement-breakpoint
CREATE INDEX "teacher_saved_tests_user_idx" ON "teacher_saved_tests" USING btree ("user_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "teacher_saved_tests" ADD CONSTRAINT "teacher_saved_tests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teacher_teaching_coverage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"codes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_teaching_coverage_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "teacher_teaching_coverage_codes_check" CHECK (jsonb_typeof(codes) = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_teaching_coverage_user_course_idx" ON "teacher_teaching_coverage" USING btree ("user_id" uuid_ops,"course_slug" text_ops);
--> statement-breakpoint
ALTER TABLE "teacher_teaching_coverage" ADD CONSTRAINT "teacher_teaching_coverage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "teacher_content_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"course_slug" text NOT NULL,
	"course_code" text NOT NULL,
	"kind" text NOT NULL,
	"verdict" text NOT NULL,
	"comment" text NOT NULL,
	"reviewer" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "teacher_content_reviews_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "teacher_content_reviews_kind_check" CHECK (kind IN ('solution','note','flashcard')),
	CONSTRAINT "teacher_content_reviews_verdict_check" CHECK (verdict IN ('approved','edited','rejected'))
);
--> statement-breakpoint
CREATE INDEX "teacher_content_reviews_user_idx" ON "teacher_content_reviews" USING btree ("user_id" uuid_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_content_reviews_user_resource_idx" ON "teacher_content_reviews" USING btree ("user_id" uuid_ops,"resource_id" text_ops);
--> statement-breakpoint
ALTER TABLE "teacher_content_reviews" ADD CONSTRAINT "teacher_content_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
