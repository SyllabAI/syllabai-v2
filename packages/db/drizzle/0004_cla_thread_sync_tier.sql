CREATE TABLE "cla_thread_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"text" text,
	"question" text,
	"payload" jsonb,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_cla_thread_message_seq" UNIQUE("thread_id","seq"),
	CONSTRAINT "ck_cla_thread_message_kind" CHECK ((kind)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying, 'gate'::character varying, 'error'::character varying])::text[])),
	CONSTRAINT "ck_cla_thread_message_shape" CHECK (((kind)::text = 'assistant' AND payload IS NOT NULL AND text IS NULL AND question IS NULL) OR ((kind)::text <> 'assistant' AND text IS NOT NULL AND payload IS NULL)),
	CONSTRAINT "ck_cla_thread_message_question" CHECK (((kind)::text = 'error') = (question IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cla_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"surface" varchar(20) NOT NULL,
	"question_id" varchar(120),
	"question_number" integer,
	"course_slug" varchar(64),
	"title" varchar(120) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_cla_threads_surface" CHECK ((surface)::text = ANY ((ARRAY['question_cla'::character varying, 'assistant'::character varying])::text[])),
	CONSTRAINT "ck_cla_threads_question_scope" CHECK (((surface)::text = 'question_cla') = (("question_id")::text IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cla_thread_messages" ADD CONSTRAINT "cla_thread_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."cla_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_threads" ADD CONSTRAINT "cla_threads_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_cla_thread_messages_thread" ON "cla_thread_messages" USING btree ("thread_id" uuid_ops,"seq" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_cla_threads_learner_active" ON "cla_threads" USING btree ("learner_id" uuid_ops,"last_active_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_cla_threads_learner_question" ON "cla_threads" USING btree ("learner_id" uuid_ops,"question_id" text_ops);