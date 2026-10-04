-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registry_key" varchar(60) NOT NULL,
	"version" varchar(30) NOT NULL,
	"template" text NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_prompt_version" UNIQUE("registry_key","version")
);
--> statement-breakpoint
CREATE TABLE "knowledge_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"node_type" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000),
	"validation_status" varchar(20) DEFAULT 'UNVALIDATED' NOT NULL,
	"provenance" varchar(300),
	"created_by" varchar(100),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"applicability" jsonb,
	CONSTRAINT "ck_node_type" CHECK ((node_type)::text = ANY ((ARRAY['SUBJECT'::character varying, 'UNIT'::character varying, 'TOPIC'::character varying, 'SUBTOPIC'::character varying, 'MISCONCEPTION'::character varying, 'CONCEPT'::character varying])::text[])),
	CONSTRAINT "ck_node_validation" CHECK ((validation_status)::text = ANY ((ARRAY['UNVALIDATED'::character varying, 'SUGGESTED'::character varying, 'VALIDATED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"token_version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"name" varchar(16) PRIMARY KEY NOT NULL,
	"description" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board" varchar(50) NOT NULL,
	"qualification" varchar(50) NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_curriculum_status" CHECK ((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"knowledge_node_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_edges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"relation_type" varchar(30) NOT NULL,
	"strength" double precision,
	"rationale" varchar(500),
	"validation_status" varchar(20) DEFAULT 'UNVALIDATED' NOT NULL,
	"provenance" varchar(300),
	"created_by" varchar(100),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_edge" UNIQUE("relation_type","source_node_id","target_node_id"),
	CONSTRAINT "ck_edge_relation" CHECK ((relation_type)::text = ANY ((ARRAY['PART_OF'::character varying, 'REQUIRES_PREREQUISITE'::character varying, 'RELATED_TO'::character varying, 'MISCONCEPTION_OF'::character varying, 'EXPLAINED_BY'::character varying, 'REMEDIATED_BY'::character varying, 'WRONG_ANSWER_PATTERN'::character varying, 'COMMONLY_CONFUSED_WITH'::character varying])::text[])),
	CONSTRAINT "ck_no_self_edge" CHECK (source_node_id <> target_node_id)
);
--> statement-breakpoint
CREATE TABLE "misconception_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"misconception_node_id" uuid NOT NULL,
	"probability" double precision NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_evidence_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_misconception_state" UNIQUE("learner_id","misconception_node_id"),
	CONSTRAINT "misconception_states_probability_check" CHECK ((probability >= (0)::double precision) AND (probability <= (1)::double precision))
);
--> statement-breakpoint
CREATE TABLE "telemetry_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_telemetry_type" CHECK ((event_type)::text = ANY ((ARRAY['ATTEMPT_SUBMITTED'::character varying, 'BKT_UPDATED'::character varying, 'BDT_UPDATED'::character varying, 'REVIEW_SCHEDULED'::character varying, 'DECAY_APPLIED'::character varying, 'SELF_DOUBT_FLAGGED'::character varying, 'SMART_MARK_COMPLETED'::character varying, 'HUMAN_MARK_RECORDED'::character varying, 'KA_RAG_COMPLETED'::character varying, 'STRUGGLE_INFERRED'::character varying, 'TUTOR_INTERVENTION_SELECTED'::character varying, 'CLA_EXCHANGE_COMPLETED'::character varying, 'SMART_FEEDBACK_EXPLAINED'::character varying, 'SMART_IMPROVEMENT_PLAN_VIEWED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "question_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_question_topic" UNIQUE("node_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"label" varchar(4) NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"misconception_node_id" uuid,
	"ordering" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_question_option_label" UNIQUE("label","question_id")
);
--> statement-breakpoint
CREATE TABLE "mark_schemes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_version_id" uuid NOT NULL,
	"version_label" varchar(20) DEFAULT '1' NOT NULL,
	"source_document_id" varchar(80),
	"validation_state" varchar(12) DEFAULT 'SUGGESTED' NOT NULL,
	"extraction_method" varchar(120),
	"created_at" timestamp with time zone NOT NULL,
	"general_guidance" text,
	CONSTRAINT "uq_mark_scheme" UNIQUE("question_version_id","version_label"),
	CONSTRAINT "ck_mark_scheme_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"chosen_option_id" uuid,
	"correct" boolean NOT NULL,
	"marks_awarded" integer,
	"response_time_ms" bigint NOT NULL,
	"confidence_level" integer,
	"self_doubt_flag" boolean DEFAULT false NOT NULL,
	"timed_condition" boolean DEFAULT false NOT NULL,
	"provenance" varchar(40) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"marking_state" varchar(16) DEFAULT 'AUTO_GRADED' NOT NULL,
	"evidence_emitted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "attempts_confidence_level_check" CHECK ((confidence_level >= 1) AND (confidence_level <= 5)),
	CONSTRAINT "attempts_response_time_ms_check" CHECK (response_time_ms >= 0),
	CONSTRAINT "ck_attempt_marking_state" CHECK ((marking_state)::text = ANY ((ARRAY['AUTO_GRADED'::character varying, 'PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "exam_papers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"board" varchar(40) NOT NULL,
	"qualification" varchar(20) NOT NULL,
	"unit" varchar(60),
	"session_label" varchar(60),
	"paper_code" varchar(30),
	"question_paper_document_id" varchar(80),
	"mark_scheme_document_id" varchar(80),
	"validation_state" varchar(12) DEFAULT 'SUGGESTED' NOT NULL,
	"provenance" varchar(20) DEFAULT 'PAST_PAPER' NOT NULL,
	"extraction_method" varchar(120),
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"series" varchar(3),
	"year" integer,
	CONSTRAINT "ck_exam_paper_provenance" CHECK ((provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying])::text[])),
	CONSTRAINT "ck_exam_paper_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])),
	CONSTRAINT "ck_exam_papers_series" CHECK ((series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[])))
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"stem" text NOT NULL,
	"marks" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"expected_time_seconds" integer NOT NULL,
	"command_word" varchar(30),
	"validation_state" varchar(12) DEFAULT 'SUGGESTED' NOT NULL,
	"source_document_id" varchar(80),
	"extraction_confidence" double precision,
	"extraction_method" varchar(120),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_question_version" UNIQUE("question_id","version"),
	CONSTRAINT "ck_question_version_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])),
	CONSTRAINT "question_versions_difficulty_check" CHECK ((difficulty >= 1) AND (difficulty <= 5)),
	CONSTRAINT "question_versions_expected_time_seconds_check" CHECK (expected_time_seconds > 0),
	CONSTRAINT "question_versions_extraction_confidence_check" CHECK ((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision)),
	CONSTRAINT "question_versions_marks_check" CHECK (marks > 0),
	CONSTRAINT "question_versions_version_check" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "question_parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_version_id" uuid NOT NULL,
	"label" varchar(12) NOT NULL,
	"prompt" text NOT NULL,
	"command_word" varchar(30),
	"marks" integer NOT NULL,
	"ordering" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_question_part" UNIQUE("label","question_version_id"),
	CONSTRAINT "question_parts_marks_check" CHECK (marks >= 0),
	CONSTRAINT "question_parts_ordering_check" CHECK (ordering >= 0)
);
--> statement-breakpoint
CREATE TABLE "mark_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mark_scheme_id" uuid NOT NULL,
	"question_part_id" uuid,
	"ref" varchar(20),
	"ordering" integer NOT NULL,
	"text" text NOT NULL,
	"marks" integer NOT NULL,
	"acceptance_criteria" jsonb,
	"extraction_confidence" double precision,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mark_points_extraction_confidence_check" CHECK ((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision)),
	CONSTRAINT "mark_points_marks_check" CHECK (marks > 0),
	CONSTRAINT "mark_points_ordering_check" CHECK (ordering >= 0)
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_part_id" uuid NOT NULL,
	"answer_text" text,
	"marks_awarded" integer,
	"marking_state" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_answer_per_part" UNIQUE("attempt_id","question_part_id"),
	CONSTRAINT "answers_marks_awarded_check" CHECK (marks_awarded >= 0),
	CONSTRAINT "ck_answer_marking_state" CHECK ((marking_state)::text = ANY ((ARRAY['PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "smart_mark_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"answer_id" uuid NOT NULL,
	"pipeline_version" varchar(20) NOT NULL,
	"model_id" varchar(80),
	"marks_awarded" integer NOT NULL,
	"confidence" double precision,
	"validation_passed" boolean NOT NULL,
	"breakdown" jsonb,
	"failure_reason" varchar(200),
	"raw_output" text,
	"created_at" timestamp with time zone NOT NULL,
	"mark_scheme_id" uuid,
	"scheme_validation_state" varchar(12),
	CONSTRAINT "smart_mark_results_confidence_check" CHECK ((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)),
	CONSTRAINT "smart_mark_results_marks_awarded_check" CHECK (marks_awarded >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"mastery" double precision NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"procedural_fluency_gap" double precision,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_skill_state" UNIQUE("learner_id","node_id"),
	CONSTRAINT "skill_states_mastery_check" CHECK ((mastery >= (0)::double precision) AND (mastery <= (1)::double precision)),
	CONSTRAINT "skill_states_procedural_fluency_gap_check" CHECK ((procedural_fluency_gap >= ('-1'::integer)::double precision) AND (procedural_fluency_gap <= (1)::double precision))
);
--> statement-breakpoint
CREATE TABLE "human_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"answer_id" uuid NOT NULL,
	"marker_id" uuid NOT NULL,
	"marks_awarded" integer NOT NULL,
	"per_point_decisions" jsonb,
	"comments" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "human_marks_marks_awarded_check" CHECK (marks_awarded >= 0)
);
--> statement-breakpoint
CREATE TABLE "smart_mark_agreement_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" varchar(12) NOT NULL,
	"exam_paper_id" uuid,
	"sample_size" integer NOT NULL,
	"kappa" double precision NOT NULL,
	"observed_agreement" double precision NOT NULL,
	"threshold" double precision DEFAULT 0.6 NOT NULL,
	"passed" boolean NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"computed_by" uuid,
	CONSTRAINT "ck_agreement_paper" CHECK (((scope)::text <> 'PAPER'::text) OR (exam_paper_id IS NOT NULL)),
	CONSTRAINT "ck_agreement_scope" CHECK ((scope)::text = ANY ((ARRAY['PAPER'::character varying, 'ALL'::character varying])::text[])),
	CONSTRAINT "smart_mark_agreement_evaluations_sample_size_check" CHECK (sample_size > 0)
);
--> statement-breakpoint
CREATE TABLE "struggle_inferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_node_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"subtype" varchar(80) NOT NULL,
	"probability" double precision NOT NULL,
	"supporting_evidence" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"teacher_override" varchar(40),
	"overridden_by" uuid,
	"overridden_at" timestamp with time zone,
	CONSTRAINT "struggle_inferences_check" CHECK (expires_at > generated_at),
	CONSTRAINT "struggle_inferences_probability_check" CHECK ((probability >= (0)::double precision) AND (probability <= (1)::double precision))
);
--> statement-breakpoint
CREATE TABLE "campaign_db_identity" (
	"id" smallint PRIMARY KEY NOT NULL,
	"campaign_label" varchar(80) NOT NULL,
	"db_name" varchar(80) NOT NULL,
	"host_addr" varchar(80),
	"core_commit" varchar(40),
	"note" varchar(200),
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_db_identity_id_check" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "teacher_validation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"importer_run_id" uuid NOT NULL,
	"decision_seq" integer NOT NULL,
	"decision_hash" char(64) NOT NULL,
	"action" varchar(12) NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"target_label" text DEFAULT '' NOT NULL,
	"reviewer" varchar(80) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"result_state" varchar(12) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tve_decision" UNIQUE("decision_hash","decision_seq"),
	CONSTRAINT "ck_tve_action" CHECK ((action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'REVERSE'::character varying])::text[])),
	CONSTRAINT "ck_tve_result_state" CHECK ((result_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying])::text[])),
	CONSTRAINT "ck_tve_target_type" CHECK ((target_type)::text = ANY ((ARRAY['question_version'::character varying, 'mark_scheme'::character varying, 'exam_paper'::character varying])::text[])),
	CONSTRAINT "ck_tve_targets_differ" CHECK (NOT (((action)::text = 'REVERSE'::text) AND (decision_seq <= 0)))
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_ref" varchar(80),
	"question_type" varchar(20) DEFAULT 'MCQ_SINGLE' NOT NULL,
	"stem" text NOT NULL,
	"marks" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"expected_time_seconds" integer NOT NULL,
	"command_word" varchar(30),
	"primary_topic_node_id" uuid,
	"provenance" varchar(20) DEFAULT 'SEED_DEMO' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"exam_paper_id" uuid,
	"difficulty_source" varchar(30),
	CONSTRAINT "ck_question_provenance" CHECK ((provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying, 'EXTERNAL_BANK'::character varying])::text[])),
	CONSTRAINT "ck_question_type" CHECK ((question_type)::text = ANY ((ARRAY['MCQ_SINGLE'::character varying, 'SHORT_ANSWER'::character varying, 'STRUCTURED'::character varying])::text[])),
	CONSTRAINT "questions_difficulty_check" CHECK ((difficulty >= 1) AND (difficulty <= 5)),
	CONSTRAINT "questions_expected_time_seconds_check" CHECK (expected_time_seconds > 0),
	CONSTRAINT "questions_marks_check" CHECK (marks > 0)
);
--> statement-breakpoint
CREATE TABLE "review_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" varchar(40) DEFAULT 'DECAY_CROSSED_THRESHOLD' NOT NULL,
	"mastery_at_trigger" double precision,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_review_reason" CHECK ((reason)::text = ANY ((ARRAY['DECAY_CROSSED_THRESHOLD'::character varying, 'TEACHER_ASSIGNED'::character varying])::text[])),
	CONSTRAINT "ck_review_status" CHECK ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "intervention_run_step" (
	"step_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"observation_type" varchar(64) NOT NULL,
	"input_evidence_ref" text,
	"output_evidence_ref" text,
	"blocked_reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "intervention_run_step_unique_seq" UNIQUE("run_id","sequence_no"),
	CONSTRAINT "intervention_run_step_sequence_ck" CHECK (sequence_no >= 0)
);
--> statement-breakpoint
CREATE TABLE "flyway_schema_history" (
	"installed_rank" integer PRIMARY KEY NOT NULL,
	"version" varchar(50),
	"description" varchar(200) NOT NULL,
	"type" varchar(20) NOT NULL,
	"script" varchar(1000) NOT NULL,
	"checksum" integer,
	"installed_by" varchar(100) NOT NULL,
	"installed_on" timestamp DEFAULT now() NOT NULL,
	"execution_time" integer NOT NULL,
	"success" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"experiment_key" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"hypothesis" text,
	"pinned_provider" varchar(30),
	"pinned_model" varchar(100),
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"params" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "experiments_experiment_key_key" UNIQUE("experiment_key"),
	CONSTRAINT "ck_experiment_status" CHECK ((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'RUNNING'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'ARCHIVED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registry_key" varchar(60) NOT NULL,
	"version" varchar(30) NOT NULL,
	"params" jsonb NOT NULL,
	"provenance" varchar(300),
	"notes" varchar(500),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_model_version" UNIQUE("registry_key","version")
);
--> statement-breakpoint
CREATE TABLE "intervention_run_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"evidence_ref" varchar(512) NOT NULL,
	"role" varchar(32) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_note" (
	"note_id" varchar(256) PRIMARY KEY NOT NULL,
	"topic_order" integer NOT NULL,
	"topic_title" varchar(512) NOT NULL,
	"subtopic_order" integer NOT NULL,
	"subtopic_title" varchar(512) NOT NULL,
	"note_order" integer NOT NULL,
	"title" varchar(512) NOT NULL,
	"body_md" text NOT NULL,
	"spec_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spec_point_codes" text DEFAULT '' NOT NULL,
	"source_url" text,
	"ingested_at" timestamp with time zone NOT NULL,
	"corpus_version" varchar(128) NOT NULL,
	CONSTRAINT "revision_note_order_unique" UNIQUE("note_order","subtopic_order","topic_order")
);
--> statement-breakpoint
CREATE TABLE "revision_note_asset" (
	"filename" varchar(512) PRIMARY KEY NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"bytes" "bytea" NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "revision_note_asset_name_ck" CHECK ((filename)::text !~ '[/\\]'::text)
);
--> statement-breakpoint
CREATE TABLE "revision_note_viewed" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" varchar(256) NOT NULL,
	"viewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "revision_note_viewed_unique" UNIQUE("note_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bootstrap_admin_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"state" varchar(10) DEFAULT 'PENDING' NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_admin_state_id_check" CHECK (id = 1),
	CONSTRAINT "ck_bas_state" CHECK ((state)::text = ANY ((ARRAY['PENDING'::character varying, 'CONSUMED'::character varying, 'EXPIRED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "intervention_run" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"subject_id" uuid,
	"curriculum_version_id" uuid,
	"status" varchar(16) NOT NULL,
	"origin" varchar(64) NOT NULL,
	"target_specification_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_part_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diagnosis_snapshot_ref" text,
	"learner_state_snapshot_ref" text,
	"diagnosis_version" varchar(128),
	"action_type" varchar(32) NOT NULL,
	"intervention_version" varchar(128) NOT NULL,
	"intervention_hash" varchar(128) NOT NULL,
	"allowed_tool_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terminal_outcome" varchar(64),
	"current_step" integer,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "intervention_run_status_ck" CHECK ((status)::text = ANY ((ARRAY['CREATED'::character varying, 'ACTIVE'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])),
	CONSTRAINT "intervention_run_terminal_ck" CHECK ((((status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])) AND (terminal_outcome IS NOT NULL)) OR ((status)::text <> ALL ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" varchar(80) NOT NULL,
	"schema_version" varchar(10) NOT NULL,
	"doc_version" integer DEFAULT 1 NOT NULL,
	"kind" varchar(20) NOT NULL,
	"source_uri" varchar(500) NOT NULL,
	"file_name" varchar(300),
	"mime_type" varchar(100) NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"checksum_algorithm" varchar(20) DEFAULT 'SHA-256' NOT NULL,
	"page_count" integer NOT NULL,
	"element_count" integer NOT NULL,
	"text_element_count" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"source_engine" varchar(60) NOT NULL,
	"source_engine_version" varchar(40) NOT NULL,
	"extracted_at" timestamp with time zone,
	"canonical_json" jsonb NOT NULL,
	"ingested_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"validation_state" varchar(20) DEFAULT 'SUGGESTED' NOT NULL,
	CONSTRAINT "ck_documents_kind" CHECK ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[])),
	CONSTRAINT "ck_documents_validation_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])),
	CONSTRAINT "documents_chunk_count_check" CHECK (chunk_count >= 0),
	CONSTRAINT "documents_doc_version_check" CHECK (doc_version > 0),
	CONSTRAINT "documents_element_count_check" CHECK (element_count >= 0),
	CONSTRAINT "documents_page_count_check" CHECK (page_count > 0),
	CONSTRAINT "documents_text_element_count_check" CHECK (text_element_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_spec_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"spec_point_node_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"provenance" varchar(40) DEFAULT 'AI_VALIDATED' NOT NULL,
	"validation_state" varchar(16) DEFAULT 'AI_VALIDATED' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_question_spec_point" UNIQUE("question_id","spec_point_node_id"),
	CONSTRAINT "ck_qsp_role" CHECK ((role)::text = ANY ((ARRAY['PRIMARY'::character varying, 'SECONDARY'::character varying])::text[])),
	CONSTRAINT "ck_qsp_state" CHECK ((validation_state)::text = ANY ((ARRAY['AI_VALIDATED'::character varying, 'HUMAN_VALIDATED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_row_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"element_ids" jsonb NOT NULL,
	"token_estimate" integer NOT NULL,
	"embedding" vector(768),
	"embedding_model" varchar(60),
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
	"kind" varchar(20),
	"subject_id" uuid,
	"series" varchar(3),
	"year" integer,
	"paper_code" varchar(20),
	"atom_number" varchar(10),
	"spec_codes" jsonb,
	"embed_rev" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_document_chunk" UNIQUE("chunk_index","document_row_id"),
	CONSTRAINT "ck_document_chunks_kind" CHECK ((kind IS NULL) OR ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[]))),
	CONSTRAINT "ck_document_chunks_series" CHECK ((series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[]))),
	CONSTRAINT "document_chunks_chunk_index_check" CHECK (chunk_index >= 0),
	CONSTRAINT "document_chunks_embed_rev_check" CHECK (embed_rev > 0),
	CONSTRAINT "document_chunks_token_estimate_check" CHECK (token_estimate > 0)
);
--> statement-breakpoint
CREATE TABLE "question_asset" (
	"filename" varchar(512) PRIMARY KEY NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"bytes" "bytea" NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "question_asset_name_ck" CHECK ((filename)::text !~ '[/\\]'::text)
);
--> statement-breakpoint
CREATE TABLE "decay_job_runs" (
	"window_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"trigger_kind" varchar(20) NOT NULL,
	"decayed" integer NOT NULL,
	"reviews_scheduled" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_self_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"answer_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"marks_awarded" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "learner_self_marks_marks_awarded_check" CHECK (marks_awarded >= 0)
);
--> statement-breakpoint
CREATE TABLE "tutor_topic_engagements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"evidence_count" integer NOT NULL,
	"refused" boolean NOT NULL,
	"answer_model" varchar(120),
	"created_at" timestamp with time zone NOT NULL,
	"signal_type" varchar(24) DEFAULT 'TOPIC_ENGAGEMENT' NOT NULL,
	"surface" varchar(24) DEFAULT 'FREE_TUTOR' NOT NULL,
	"response_mode" varchar(20),
	"context_kind" varchar(32),
	"context_reference" uuid,
	"classifier_version" varchar(48) DEFAULT 'tutor-signals/v1' NOT NULL,
	CONSTRAINT "ck_tte_signal" CHECK ((signal_type)::text = ANY ((ARRAY['TOPIC_ENGAGEMENT'::character varying, 'EXPLANATION_REQUEST'::character varying, 'DOUBT_SIGNAL'::character varying, 'MISCONCEPTION_RELATED'::character varying, 'PREREQUISITE_HELP'::character varying, 'CLARIFICATION_REQUEST'::character varying])::text[])),
	CONSTRAINT "ck_tte_surface" CHECK ((surface)::text = ANY ((ARRAY['FREE_TUTOR'::character varying, 'CONTEXTUAL_ASSISTANT'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "content_review_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" varchar(254) DEFAULT '' NOT NULL,
	"action" varchar(24) NOT NULL,
	"target_type" varchar(24) NOT NULL,
	"target_id" uuid NOT NULL,
	"from_state" varchar(12),
	"to_state" varchar(12),
	"detail" text DEFAULT '' NOT NULL,
	CONSTRAINT "ck_cra_action" CHECK ((action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'VALIDATE_ALL'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'UNFLAG'::character varying, 'PLACE'::character varying, 'MAP_TOPICS'::character varying])::text[])),
	CONSTRAINT "ck_cra_target_type" CHECK ((target_type)::text = ANY (ARRAY[('exam_paper'::character varying)::text, ('question_version'::character varying)::text, ('mark_scheme'::character varying)::text, ('question'::character varying)::text, ('document'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "glm_ocr_bridge_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paper_id" uuid NOT NULL,
	"bridge" varchar(30) DEFAULT 'glm-ocr-v1' NOT NULL,
	"qp_document_id" varchar(80) NOT NULL,
	"ms_document_id" varchar(80) NOT NULL,
	"qp_document_row_id" uuid,
	"ms_document_row_id" uuid,
	"qp_checksum" varchar(128) NOT NULL,
	"ms_checksum" varchar(128) NOT NULL,
	"extraction_methods" varchar(120) NOT NULL,
	"reconciliation_status" varchar(20) NOT NULL,
	"review_findings" jsonb NOT NULL,
	"qp_draft" jsonb NOT NULL,
	"ms_draft" jsonb NOT NULL,
	"reconciliation" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_glm_ocr_reconciliation_status" CHECK ((reconciliation_status)::text = ANY ((ARRAY['OK'::character varying, 'REVIEW_REQUIRED'::character varying, 'SUPERSEDED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "archive_tc27_card_wave_20260928" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" varchar(80) NOT NULL,
	"schema_version" varchar(10) NOT NULL,
	"doc_version" integer DEFAULT 1 NOT NULL,
	"kind" varchar(20) NOT NULL,
	"source_uri" varchar(500) NOT NULL,
	"file_name" varchar(300),
	"mime_type" varchar(100) NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"checksum_algorithm" varchar(20) DEFAULT 'SHA-256' NOT NULL,
	"page_count" integer NOT NULL,
	"element_count" integer NOT NULL,
	"text_element_count" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"source_engine" varchar(60) NOT NULL,
	"source_engine_version" varchar(40) NOT NULL,
	"extracted_at" timestamp with time zone,
	"canonical_json" jsonb NOT NULL,
	"ingested_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"validation_state" varchar(20) DEFAULT 'SUGGESTED' NOT NULL,
	CONSTRAINT "ck_documents_kind" CHECK ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[])),
	CONSTRAINT "ck_documents_validation_state" CHECK ((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])),
	CONSTRAINT "documents_chunk_count_check" CHECK (chunk_count >= 0),
	CONSTRAINT "documents_doc_version_check" CHECK (doc_version > 0),
	CONSTRAINT "documents_element_count_check" CHECK (element_count >= 0),
	CONSTRAINT "documents_page_count_check" CHECK (page_count > 0),
	CONSTRAINT "documents_text_element_count_check" CHECK (text_element_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "tutor_session_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"answer_model" varchar(120),
	"answer_provider" varchar(60),
	"latency_ms" double precision,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_tutor_session_turn_seq" UNIQUE("seq","session_id"),
	CONSTRAINT "ck_tutor_session_turn_role" CHECK ((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text]))
);
--> statement-breakpoint
CREATE TABLE "flashcard_ratings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"card_id" varchar(64) NOT NULL,
	"rating" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "flashcard_ratings_rating_check" CHECK ((rating)::text = ANY ((ARRAY['STILL_LEARNING'::character varying, 'KNOW'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"questions_completed" integer NOT NULL,
	"score" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assignment_submissions_questions_completed_check" CHECK (questions_completed >= 0),
	CONSTRAINT "assignment_submissions_score_check" CHECK ((score IS NULL) OR (score >= 0))
);
--> statement-breakpoint
CREATE TABLE "note_votes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"note_id" varchar(64) NOT NULL,
	"vote" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "note_votes_vote_check" CHECK ((vote)::text = ANY ((ARRAY['HELPFUL'::character varying, 'NOT_HELPFUL'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "tutor_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	"course_ref" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"teacher_id" uuid NOT NULL,
	"course_slug" varchar(64) NOT NULL,
	"course_label" varchar(120) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "classes_status_check" CHECK ((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrolled_by" uuid NOT NULL,
	"enrolled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ux_cmember_pair" UNIQUE("class_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"category" varchar(20) DEFAULT 'GENERAL' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "announcements_category_check" CHECK ((category)::text = ANY ((ARRAY['GENERAL'::character varying, 'HOMEWORK'::character varying, 'NOTICE'::character varying, 'EXAM_REMINDER'::character varying, 'RESOURCE'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"teacher_id" uuid NOT NULL,
	"course_slug" varchar(64) NOT NULL,
	"course_label" varchar(120) NOT NULL,
	"title" varchar(200) NOT NULL,
	"spec_refs" jsonb NOT NULL,
	"marks_total" integer NOT NULL,
	"question_count" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"class_id" uuid,
	CONSTRAINT "assignments_marks_total_check" CHECK (marks_total >= 1),
	CONSTRAINT "assignments_question_count_check" CHECK (question_count >= 1),
	CONSTRAINT "assignments_status_check" CHECK ((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "exam_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board" varchar(50) NOT NULL,
	"qualification" varchar(50) NOT NULL,
	"series_code" varchar(60) NOT NULL,
	"label" varchar(120) NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"entry_deadline" date,
	"results_date" date,
	"published" boolean DEFAULT true NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"source_url" varchar(500) NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_exam_series" UNIQUE("board","qualification","series_code"),
	CONSTRAINT "ck_exam_series_window" CHECK (window_end >= window_start)
);
--> statement-breakpoint
CREATE TABLE "learner_course_enrolments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"course_slug" varchar(100) NOT NULL,
	"target_series_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_learner_course_enrolment" UNIQUE("course_slug","learner_id")
);
--> statement-breakpoint
CREATE TABLE "teaching_coverage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" uuid NOT NULL,
	"spec_point_node_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"previous_status" varchar(16),
	"actor_id" uuid NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_tcov_event_prev" CHECK ((previous_status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])),
	CONSTRAINT "ck_tcov_event_status" CHECK ((status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("role","user_id")
);
--> statement-breakpoint
CREATE TABLE "announcement_reads" (
	"announcement_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_ann_read" PRIMARY KEY("announcement_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "teaching_coverage" (
	"class_id" uuid NOT NULL,
	"spec_point_node_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "teaching_coverage_pkey" PRIMARY KEY("class_id","spec_point_node_id"),
	CONSTRAINT "ck_tcov_status" CHECK ((status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_states" ADD CONSTRAINT "misconception_states_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD CONSTRAINT "mark_schemes_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_parts" ADD CONSTRAINT "question_parts_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_points" ADD CONSTRAINT "mark_points_mark_scheme_id_fkey" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."mark_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_points" ADD CONSTRAINT "mark_points_question_part_id_fkey" FOREIGN KEY ("question_part_id") REFERENCES "public"."question_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_part_id_fkey" FOREIGN KEY ("question_part_id") REFERENCES "public"."question_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_mark_results" ADD CONSTRAINT "smart_mark_results_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_mark_results" ADD CONSTRAINT "smart_mark_results_mark_scheme_id_fkey" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."mark_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_states" ADD CONSTRAINT "skill_states_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_marks" ADD CONSTRAINT "human_marks_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_mark_agreement_evaluations" ADD CONSTRAINT "smart_mark_agreement_evaluations_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "struggle_inferences" ADD CONSTRAINT "struggle_inferences_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "struggle_inferences" ADD CONSTRAINT "struggle_inferences_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "struggle_inferences" ADD CONSTRAINT "struggle_inferences_topic_node_id_fkey" FOREIGN KEY ("topic_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_run_step" ADD CONSTRAINT "intervention_run_step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."intervention_run"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_run_evidence" ADD CONSTRAINT "intervention_run_evidence_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."intervention_run"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_note_viewed" ADD CONSTRAINT "revision_note_viewed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_admin_state" ADD CONSTRAINT "bootstrap_admin_state_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_run" ADD CONSTRAINT "intervention_run_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_spec_points" ADD CONSTRAINT "question_spec_points_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_spec_points" ADD CONSTRAINT "question_spec_points_spec_point_node_id_fkey" FOREIGN KEY ("spec_point_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_row_id_fkey" FOREIGN KEY ("document_row_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_self_marks" ADD CONSTRAINT "learner_self_marks_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_self_marks" ADD CONSTRAINT "learner_self_marks_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_topic_engagements" ADD CONSTRAINT "tutor_topic_engagements_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_review_audit" ADD CONSTRAINT "content_review_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glm_ocr_bridge_records" ADD CONSTRAINT "glm_ocr_bridge_records_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session_turns" ADD CONSTRAINT "tutor_session_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "fk_cmember_class" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "fk_ann_class" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_course_enrolments" ADD CONSTRAINT "learner_course_enrolments_target_series_id_fkey" FOREIGN KEY ("target_series_id") REFERENCES "public"."exam_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_coverage_events" ADD CONSTRAINT "teaching_coverage_events_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_coverage_events" ADD CONSTRAINT "teaching_coverage_events_spec_point_node_id_fkey" FOREIGN KEY ("spec_point_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_fkey" FOREIGN KEY ("role") REFERENCES "public"."roles"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "fk_ann_read_ann" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_coverage" ADD CONSTRAINT "teaching_coverage_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_coverage" ADD CONSTRAINT "teaching_coverage_spec_point_node_id_fkey" FOREIGN KEY ("spec_point_node_id") REFERENCES "public"."knowledge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_knowledge_node_type" ON "knowledge_nodes" USING btree ("node_type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_knowledge_node_code" ON "knowledge_nodes" USING btree ("code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree (lower((email)::text) text_ops);--> statement-breakpoint
CREATE INDEX "ix_edge_source_type" ON "knowledge_edges" USING btree ("source_node_id" text_ops,"relation_type" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_edge_target_type" ON "knowledge_edges" USING btree ("target_node_id" text_ops,"relation_type" text_ops);--> statement-breakpoint
CREATE INDEX "ix_telemetry_learner_time" ON "telemetry_events" USING btree ("learner_id" timestamptz_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_telemetry_type" ON "telemetry_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "ix_options_question" ON "question_options" USING btree ("question_id" int4_ops,"ordering" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_one_correct_option" ON "question_options" USING btree ("question_id" uuid_ops) WHERE is_correct;--> statement-breakpoint
CREATE INDEX "ix_attempts_learner_time" ON "attempts" USING btree ("learner_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_attempts_question" ON "attempts" USING btree ("question_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_exam_papers_paper_year_series" ON "exam_papers" USING btree ("paper_code" text_ops,"year" int4_ops,"series" int4_ops) WHERE (paper_code IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_exam_papers_subject" ON "exam_papers" USING btree ("subject_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exam_paper_identity" ON "exam_papers" USING btree ("paper_code" text_ops,"session_label" text_ops) WHERE (paper_code IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_question_versions_question" ON "question_versions" USING btree ("question_id" int4_ops,"version" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_question_parts_version" ON "question_parts" USING btree ("question_version_id" int4_ops,"ordering" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_mark_points_part" ON "mark_points" USING btree ("question_part_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_mark_points_scheme" ON "mark_points" USING btree ("mark_scheme_id" int4_ops,"ordering" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_answers_attempt" ON "answers" USING btree ("attempt_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_answers_part" ON "answers" USING btree ("question_part_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_answers_state" ON "answers" USING btree ("marking_state" text_ops);--> statement-breakpoint
CREATE INDEX "ix_smart_mark_results_answer" ON "smart_mark_results" USING btree ("answer_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_skill_states_last_practice" ON "skill_states" USING btree ("last_practiced_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_skill_states_node" ON "skill_states" USING btree ("node_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_human_marks_answer" ON "human_marks" USING btree ("answer_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_learner_expiry" ON "struggle_inferences" USING btree ("learner_id" float8_ops,"expires_at" uuid_ops,"probability" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_learner_topic_expiry" ON "struggle_inferences" USING btree ("learner_id" float8_ops,"topic_node_id" float8_ops,"expires_at" timestamptz_ops,"probability" float8_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_supersede" ON "struggle_inferences" USING btree ("learner_id" timestamptz_ops,"topic_node_id" timestamptz_ops,"type" timestamptz_ops,"expires_at" uuid_ops) WHERE (superseded_at IS NULL);--> statement-breakpoint
CREATE INDEX "ix_tve_run" ON "teacher_validation_events" USING btree ("importer_run_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_tve_target" ON "teacher_validation_events" USING btree ("target_type" text_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "ix_questions_paper" ON "questions" USING btree ("exam_paper_id" uuid_ops) WHERE (exam_paper_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_questions_topic" ON "questions" USING btree ("primary_topic_node_id" uuid_ops) WHERE active;--> statement-breakpoint
CREATE INDEX "ix_review_learner_status" ON "review_schedules" USING btree ("learner_id" text_ops,"status" uuid_ops,"due_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_review_status_due" ON "review_schedules" USING btree ("status" text_ops,"due_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_step_run_idx" ON "intervention_run_step" USING btree ("run_id" int4_ops,"sequence_no" uuid_ops);--> statement-breakpoint
CREATE INDEX "flyway_schema_history_s_idx" ON "flyway_schema_history" USING btree ("success" bool_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_evidence_run_idx" ON "intervention_run_evidence" USING btree ("run_id" timestamptz_ops,"captured_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "revision_note_tree_idx" ON "revision_note" USING btree ("topic_order" int4_ops,"subtopic_order" int4_ops,"note_order" int4_ops);--> statement-breakpoint
CREATE INDEX "revision_note_viewed_user_idx" ON "revision_note_viewed" USING btree ("user_id" timestamptz_ops,"viewed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_learner_created_idx" ON "intervention_run" USING btree ("learner_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_documents_created" ON "documents" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_documents_kind" ON "documents" USING btree ("kind" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_documents_canonical_id" ON "documents" USING btree ("document_id" text_ops,"doc_version" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_documents_checksum" ON "documents" USING btree ("checksum" text_ops);--> statement-breakpoint
CREATE INDEX "ix_qsp_node" ON "question_spec_points" USING btree ("spec_point_node_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_qsp_question" ON "question_spec_points" USING btree ("question_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_chunks_content_tsv" ON "document_chunks" USING gin ("content_tsv" tsvector_ops);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_document" ON "document_chunks" USING btree ("document_row_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_embedding" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_pending" ON "document_chunks" USING btree ("document_row_id" uuid_ops) WHERE (embedding IS NULL);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_spec_codes" ON "document_chunks" USING gin ("spec_codes" jsonb_ops) WHERE (spec_codes IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_subject_kind" ON "document_chunks" USING btree ("subject_id" text_ops,"kind" uuid_ops) WHERE (subject_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_subject_year_series" ON "document_chunks" USING btree ("subject_id" text_ops,"year" uuid_ops,"series" int4_ops) WHERE (subject_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_lsm_answer" ON "learner_self_marks" USING btree ("answer_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_lsm_learner" ON "learner_self_marks" USING btree ("learner_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_tte_learner_recent" ON "tutor_topic_engagements" USING btree ("learner_id" timestamptz_ops,"occurred_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_tte_learner_signal" ON "tutor_topic_engagements" USING btree ("learner_id" uuid_ops,"signal_type" text_ops);--> statement-breakpoint
CREATE INDEX "ix_tte_learner_surface" ON "tutor_topic_engagements" USING btree ("learner_id" text_ops,"surface" text_ops,"occurred_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_tte_node" ON "tutor_topic_engagements" USING btree ("node_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_cra_actor" ON "content_review_audit" USING btree ("actor_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_cra_occurred" ON "content_review_audit" USING btree ("occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_cra_target" ON "content_review_audit" USING btree ("target_type" uuid_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "ix_glm_ocr_bridge_reconciliation" ON "glm_ocr_bridge_records" USING btree ("reconciliation_status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_glm_ocr_bridge_pair" ON "glm_ocr_bridge_records" USING btree ("qp_document_id" text_ops,"ms_document_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_glm_ocr_bridge_paper" ON "glm_ocr_bridge_records" USING btree ("paper_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "archive_tc27_card_wave_20260928_checksum_idx" ON "archive_tc27_card_wave_20260928" USING btree ("checksum" text_ops);--> statement-breakpoint
CREATE INDEX "archive_tc27_card_wave_20260928_created_at_idx" ON "archive_tc27_card_wave_20260928" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "archive_tc27_card_wave_20260928_document_id_doc_version_idx" ON "archive_tc27_card_wave_20260928" USING btree ("document_id" text_ops,"doc_version" text_ops);--> statement-breakpoint
CREATE INDEX "archive_tc27_card_wave_20260928_kind_idx" ON "archive_tc27_card_wave_20260928" USING btree ("kind" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tutor_session_turns_session" ON "tutor_session_turns" USING btree ("session_id" int4_ops,"seq" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_fr_learner_card" ON "flashcard_ratings" USING btree ("learner_id" text_ops,"card_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_fr_learner_recent" ON "flashcard_ratings" USING btree ("learner_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_asub_assignment_recent" ON "assignment_submissions" USING btree ("assignment_id" timestamptz_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_asub_learner" ON "assignment_submissions" USING btree ("learner_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_nv_learner_note" ON "note_votes" USING btree ("learner_id" uuid_ops,"note_id" text_ops);--> statement-breakpoint
CREATE INDEX "ix_nv_learner_recent" ON "note_votes" USING btree ("learner_id" uuid_ops,"occurred_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_tutor_sessions_learner_active" ON "tutor_sessions" USING btree ("learner_id" timestamptz_ops,"last_active_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_class_teacher" ON "classes" USING btree ("teacher_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_class_teacher_course_name" ON "classes" USING btree (teacher_id text_ops,course_slug text_ops,lower((name)::text) text_ops) WHERE ((status)::text = 'ACTIVE'::text);--> statement-breakpoint
CREATE INDEX "ix_cmember_student" ON "class_members" USING btree ("student_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_ann_class_recent" ON "announcements" USING btree ("class_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_as_class" ON "assignments" USING btree ("class_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_as_created" ON "assignments" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_as_teacher" ON "assignments" USING btree ("teacher_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_exam_series_lookup" ON "exam_series" USING btree ("board" date_ops,"qualification" text_ops,"published" date_ops,"window_start" text_ops);--> statement-breakpoint
CREATE INDEX "ix_learner_course_enrolment_series" ON "learner_course_enrolments" USING btree ("target_series_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_tcov_event_point" ON "teaching_coverage_events" USING btree ("class_id" uuid_ops,"spec_point_node_id" timestamptz_ops,"created_at" uuid_ops);
*/