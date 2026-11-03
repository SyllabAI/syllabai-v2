-- T-TIER1 run-001 — the account-backed "last opened" pointer + mock-exam results
-- (frontend deep-audit Tier 1, operator order 2026-11-03: "things that are
-- localStorage-only, make them saved to account").
--
-- Two ADDITIVE tables backing the hub stores that until now lived in ONE
-- browser only (localStorage "syllabai.lastOpened.v1" and
-- "syllabai.mockResults.v1"). Pure additive: NO column is added to or
-- altered on any existing table. Vocabularies are text + CHECK per the
-- v2-native migration law (no new pg enums — 0018/0019/0020 precedent).
--
-- FK discipline follows the 0019 personal-state precedent
-- (learner_pdf_drawings: ON DELETE cascade) — these rows ARE the learner's
-- own ephemeral state (a pointer, self-marked tallies), not records of
-- account; a deleted user takes them with them. 0020's NO ACTION law was
-- for AI-session RECORDS (teach_*); this is the other class.
CREATE TABLE "learner_last_opened" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"course_slug" text NOT NULL,
	"resource" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_last_opened_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "learner_last_opened_resource_check" CHECK (resource IN ('hub','revision-notes','exam-questions','flashcards','strengths','past-papers','practice-papers'))
);
--> statement-breakpoint
ALTER TABLE "learner_last_opened" ADD CONSTRAINT "learner_last_opened_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "learner_mock_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"client_id" text NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"session_id" text NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"time_used_sec" integer NOT NULL,
	"marks" integer NOT NULL,
	"total" integer NOT NULL,
	"ended" text NOT NULL,
	"questions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_mock_results_course_slug_check" CHECK (course_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "learner_mock_results_ended_check" CHECK (ended IN ('time-up','self','exited')),
	CONSTRAINT "learner_mock_results_marks_check" CHECK (marks >= 0 AND total >= 0 AND duration_min >= 0 AND time_used_sec >= 0),
	CONSTRAINT "learner_mock_results_questions_check" CHECK (questions IS NULL OR jsonb_typeof(questions) = 'array')
);
--> statement-breakpoint
CREATE INDEX "learner_mock_results_user_course_idx" ON "learner_mock_results" USING btree ("user_id" uuid_ops,"course_slug" text_ops);
--> statement-breakpoint
ALTER TABLE "learner_mock_results" ADD CONSTRAINT "learner_mock_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
