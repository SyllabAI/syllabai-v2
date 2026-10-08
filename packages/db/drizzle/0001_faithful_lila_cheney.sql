ALTER TABLE "revision_note_asset" DROP CONSTRAINT "revision_note_asset_name_ck";--> statement-breakpoint
ALTER TABLE "question_asset" DROP CONSTRAINT "question_asset_name_ck";--> statement-breakpoint
DROP INDEX "uq_users_email";--> statement-breakpoint
DROP INDEX "ix_edge_source_type";--> statement-breakpoint
DROP INDEX "ix_edge_target_type";--> statement-breakpoint
DROP INDEX "ix_telemetry_learner_time";--> statement-breakpoint
DROP INDEX "ix_options_question";--> statement-breakpoint
DROP INDEX "ix_attempts_learner_time";--> statement-breakpoint
DROP INDEX "ix_exam_papers_paper_year_series";--> statement-breakpoint
DROP INDEX "ix_question_versions_question";--> statement-breakpoint
DROP INDEX "ix_question_parts_version";--> statement-breakpoint
DROP INDEX "ix_mark_points_scheme";--> statement-breakpoint
DROP INDEX "ix_smart_mark_results_answer";--> statement-breakpoint
DROP INDEX "ix_human_marks_answer";--> statement-breakpoint
DROP INDEX "idx_struggle_inference_learner_expiry";--> statement-breakpoint
DROP INDEX "idx_struggle_inference_learner_topic_expiry";--> statement-breakpoint
DROP INDEX "idx_struggle_inference_supersede";--> statement-breakpoint
DROP INDEX "ix_tve_target";--> statement-breakpoint
DROP INDEX "ix_review_learner_status";--> statement-breakpoint
DROP INDEX "intervention_run_step_run_idx";--> statement-breakpoint
DROP INDEX "intervention_run_evidence_run_idx";--> statement-breakpoint
DROP INDEX "revision_note_viewed_user_idx";--> statement-breakpoint
DROP INDEX "intervention_run_learner_created_idx";--> statement-breakpoint
DROP INDEX "ix_document_chunks_subject_kind";--> statement-breakpoint
DROP INDEX "ix_document_chunks_subject_year_series";--> statement-breakpoint
DROP INDEX "ix_tte_learner_recent";--> statement-breakpoint
DROP INDEX "ix_tte_learner_surface";--> statement-breakpoint
DROP INDEX "ix_cra_target";--> statement-breakpoint
DROP INDEX "archive_tc27_card_wave_20260928_document_id_doc_version_idx";--> statement-breakpoint
DROP INDEX "idx_tutor_session_turns_session";--> statement-breakpoint
DROP INDEX "ix_fr_learner_card";--> statement-breakpoint
DROP INDEX "ix_asub_assignment_recent";--> statement-breakpoint
DROP INDEX "ix_nv_learner_recent";--> statement-breakpoint
DROP INDEX "idx_tutor_sessions_learner_active";--> statement-breakpoint
DROP INDEX "ux_class_teacher_course_name";--> statement-breakpoint
DROP INDEX "ix_ann_class_recent";--> statement-breakpoint
DROP INDEX "ix_exam_series_lookup";--> statement-breakpoint
DROP INDEX "ix_tcov_event_point";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree (lower((email)::text));--> statement-breakpoint
CREATE INDEX "ix_edge_source_type" ON "knowledge_edges" USING btree ("source_node_id" uuid_ops,"relation_type" text_ops);--> statement-breakpoint
CREATE INDEX "ix_edge_target_type" ON "knowledge_edges" USING btree ("target_node_id" uuid_ops,"relation_type" text_ops);--> statement-breakpoint
CREATE INDEX "ix_telemetry_learner_time" ON "telemetry_events" USING btree ("learner_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_options_question" ON "question_options" USING btree ("question_id" uuid_ops,"ordering" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_attempts_learner_time" ON "attempts" USING btree ("learner_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_exam_papers_paper_year_series" ON "exam_papers" USING btree ("paper_code" text_ops,"year" int4_ops,"series" text_ops) WHERE (paper_code IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_question_versions_question" ON "question_versions" USING btree ("question_id" uuid_ops,"version" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_question_parts_version" ON "question_parts" USING btree ("question_version_id" uuid_ops,"ordering" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_mark_points_scheme" ON "mark_points" USING btree ("mark_scheme_id" uuid_ops,"ordering" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_smart_mark_results_answer" ON "smart_mark_results" USING btree ("answer_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_human_marks_answer" ON "human_marks" USING btree ("answer_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_learner_expiry" ON "struggle_inferences" USING btree ("learner_id" uuid_ops,"expires_at" timestamptz_ops,"probability" float8_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_learner_topic_expiry" ON "struggle_inferences" USING btree ("learner_id" uuid_ops,"topic_node_id" uuid_ops,"expires_at" timestamptz_ops,"probability" float8_ops);--> statement-breakpoint
CREATE INDEX "idx_struggle_inference_supersede" ON "struggle_inferences" USING btree ("learner_id" uuid_ops,"topic_node_id" uuid_ops,"type" text_ops,"expires_at" timestamptz_ops) WHERE (superseded_at IS NULL);--> statement-breakpoint
CREATE INDEX "ix_tve_target" ON "teacher_validation_events" USING btree ("target_type" text_ops,"target_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ix_review_learner_status" ON "review_schedules" USING btree ("learner_id" uuid_ops,"status" text_ops,"due_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_step_run_idx" ON "intervention_run_step" USING btree ("run_id" uuid_ops,"sequence_no" int4_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_evidence_run_idx" ON "intervention_run_evidence" USING btree ("run_id" uuid_ops,"captured_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "revision_note_viewed_user_idx" ON "revision_note_viewed" USING btree ("user_id" uuid_ops,"viewed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "intervention_run_learner_created_idx" ON "intervention_run" USING btree ("learner_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_subject_kind" ON "document_chunks" USING btree ("subject_id" uuid_ops,"kind" text_ops) WHERE (subject_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_document_chunks_subject_year_series" ON "document_chunks" USING btree ("subject_id" uuid_ops,"year" int4_ops,"series" text_ops) WHERE (subject_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "ix_tte_learner_recent" ON "tutor_topic_engagements" USING btree ("learner_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_tte_learner_surface" ON "tutor_topic_engagements" USING btree ("learner_id" uuid_ops,"surface" text_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_cra_target" ON "content_review_audit" USING btree ("target_type" text_ops,"target_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "archive_tc27_card_wave_20260928_document_id_doc_version_idx" ON "archive_tc27_card_wave_20260928" USING btree ("document_id" text_ops,"doc_version" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_tutor_session_turns_session" ON "tutor_session_turns" USING btree ("session_id" uuid_ops,"seq" int4_ops);--> statement-breakpoint
CREATE INDEX "ix_fr_learner_card" ON "flashcard_ratings" USING btree ("learner_id" uuid_ops,"card_id" text_ops);--> statement-breakpoint
CREATE INDEX "ix_asub_assignment_recent" ON "assignment_submissions" USING btree ("assignment_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_nv_learner_recent" ON "note_votes" USING btree ("learner_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_tutor_sessions_learner_active" ON "tutor_sessions" USING btree ("learner_id" uuid_ops,"last_active_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_class_teacher_course_name" ON "classes" USING btree (teacher_id,course_slug,lower((name)::text)) WHERE ((status)::text = 'ACTIVE'::text);--> statement-breakpoint
CREATE INDEX "ix_ann_class_recent" ON "announcements" USING btree ("class_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ix_exam_series_lookup" ON "exam_series" USING btree ("board" text_ops,"qualification" text_ops,"published" bool_ops,"window_start" date_ops);--> statement-breakpoint
CREATE INDEX "ix_tcov_event_point" ON "teaching_coverage_events" USING btree ("class_id" uuid_ops,"spec_point_node_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
ALTER TABLE "revision_note_asset" ADD CONSTRAINT "revision_note_asset_name_ck" CHECK ((filename)::text !~ '[/\]'::text);--> statement-breakpoint
ALTER TABLE "question_asset" ADD CONSTRAINT "question_asset_name_ck" CHECK ((filename)::text !~ '[/\]'::text);