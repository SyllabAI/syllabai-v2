import { pgTable, unique, uuid, varchar, text, timestamp, index, uniqueIndex, check, integer, jsonb, boolean, bigint, foreignKey, doublePrecision, smallint, bigserial, char, vector, date, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { bytea, tsvector } from "./custom_types"



export const promptVersions = pgTable("prompt_versions", {
	id: uuid().primaryKey().notNull(),
	registryKey: varchar("registry_key", { length: 60 }).notNull(),
	version: varchar({ length: 30 }).notNull(),
	template: text().notNull(),
	notes: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("uq_prompt_version").on(table.registryKey, table.version),
]);

export const knowledgeNodes = pgTable("knowledge_nodes", {
	id: uuid().primaryKey().notNull(),
	code: varchar({ length: 40 }).notNull(),
	nodeType: varchar("node_type", { length: 20 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: varchar({ length: 1000 }),
	validationStatus: varchar("validation_status", { length: 20 }).default('UNVALIDATED').notNull(),
	provenance: varchar({ length: 300 }),
	createdBy: varchar("created_by", { length: 100 }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	applicability: jsonb(),
}, (table) => [
	index("ix_knowledge_node_type").using("btree", table.nodeType.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_knowledge_node_code").using("btree", table.code.asc().nullsLast().op("text_ops")),
	check("ck_node_type", sql`(node_type)::text = ANY ((ARRAY['SUBJECT'::character varying, 'UNIT'::character varying, 'TOPIC'::character varying, 'SUBTOPIC'::character varying, 'MISCONCEPTION'::character varying, 'CONCEPT'::character varying])::text[])`),
	check("ck_node_validation", sql`(validation_status)::text = ANY ((ARRAY['UNVALIDATED'::character varying, 'SUGGESTED'::character varying, 'VALIDATED'::character varying])::text[])`),
]);

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	email: varchar({ length: 254 }).notNull(),
	passwordHash: varchar("password_hash", { length: 100 }).notNull(),
	displayName: varchar("display_name", { length: 100 }).notNull(),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tokenVersion: bigint("token_version", { mode: "number" }).default(1).notNull(),
}, (table) => [
	uniqueIndex("uq_users_email").using("btree", sql`lower((email)::text)`),
]);

export const roles = pgTable("roles", {
	name: varchar({ length: 16 }).primaryKey().notNull(),
	description: varchar({ length: 200 }).notNull(),
});

export const curriculumVersions = pgTable("curriculum_versions", {
	id: uuid().primaryKey().notNull(),
	board: varchar({ length: 50 }).notNull(),
	qualification: varchar({ length: 50 }).notNull(),
	code: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	status: varchar({ length: 16 }).default('DRAFT').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	check("ck_curriculum_status", sql`(status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])`),
]);

export const subjects = pgTable("subjects", {
	id: uuid().primaryKey().notNull(),
	curriculumVersionId: uuid("curriculum_version_id").notNull(),
	code: varchar({ length: 20 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	knowledgeNodeId: uuid("knowledge_node_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.curriculumVersionId],
			foreignColumns: [curriculumVersions.id],
			name: "subjects_curriculum_version_id_fkey"
		}),
]);

export const knowledgeEdges = pgTable("knowledge_edges", {
	id: uuid().primaryKey().notNull(),
	sourceNodeId: uuid("source_node_id").notNull(),
	targetNodeId: uuid("target_node_id").notNull(),
	relationType: varchar("relation_type", { length: 30 }).notNull(),
	strength: doublePrecision(),
	rationale: varchar({ length: 500 }),
	validationStatus: varchar("validation_status", { length: 20 }).default('UNVALIDATED').notNull(),
	provenance: varchar({ length: 300 }),
	createdBy: varchar("created_by", { length: 100 }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_edge_source_type").using("btree", table.sourceNodeId.asc().nullsLast().op("text_ops"), table.relationType.asc().nullsLast().op("uuid_ops")),
	index("ix_edge_target_type").using("btree", table.targetNodeId.asc().nullsLast().op("text_ops"), table.relationType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sourceNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "knowledge_edges_source_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "knowledge_edges_target_node_id_fkey"
		}).onDelete("cascade"),
	unique("uq_edge").on(table.relationType, table.sourceNodeId, table.targetNodeId),
	check("ck_edge_relation", sql`(relation_type)::text = ANY ((ARRAY['PART_OF'::character varying, 'REQUIRES_PREREQUISITE'::character varying, 'RELATED_TO'::character varying, 'MISCONCEPTION_OF'::character varying, 'EXPLAINED_BY'::character varying, 'REMEDIATED_BY'::character varying, 'WRONG_ANSWER_PATTERN'::character varying, 'COMMONLY_CONFUSED_WITH'::character varying])::text[])`),
	check("ck_no_self_edge", sql`source_node_id <> target_node_id`),
]);

export const misconceptionStates = pgTable("misconception_states", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	misconceptionNodeId: uuid("misconception_node_id").notNull(),
	probability: doublePrecision().notNull(),
	evidenceCount: integer("evidence_count").default(0).notNull(),
	lastEvidenceAt: timestamp("last_evidence_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	version: bigint({ mode: "number" }).default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "misconception_states_learner_id_fkey"
		}).onDelete("cascade"),
	unique("uq_misconception_state").on(table.learnerId, table.misconceptionNodeId),
	check("misconception_states_probability_check", sql`(probability >= (0)::double precision) AND (probability <= (1)::double precision)`),
]);

export const telemetryEvents = pgTable("telemetry_events", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	eventType: varchar("event_type", { length: 40 }).notNull(),
	schemaVersion: integer("schema_version").default(1).notNull(),
	payload: jsonb().notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_telemetry_learner_time").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_telemetry_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "telemetry_events_learner_id_fkey"
		}).onDelete("cascade"),
	check("ck_telemetry_type", sql`(event_type)::text = ANY ((ARRAY['ATTEMPT_SUBMITTED'::character varying, 'BKT_UPDATED'::character varying, 'BDT_UPDATED'::character varying, 'REVIEW_SCHEDULED'::character varying, 'DECAY_APPLIED'::character varying, 'SELF_DOUBT_FLAGGED'::character varying, 'SMART_MARK_COMPLETED'::character varying, 'HUMAN_MARK_RECORDED'::character varying, 'KA_RAG_COMPLETED'::character varying, 'STRUGGLE_INFERRED'::character varying, 'TUTOR_INTERVENTION_SELECTED'::character varying, 'CLA_EXCHANGE_COMPLETED'::character varying, 'SMART_FEEDBACK_EXPLAINED'::character varying, 'SMART_IMPROVEMENT_PLAN_VIEWED'::character varying])::text[])`),
]);

export const questionTopics = pgTable("question_topics", {
	id: uuid().primaryKey().notNull(),
	questionId: uuid("question_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "question_topics_question_id_fkey"
		}).onDelete("cascade"),
	unique("uq_question_topic").on(table.nodeId, table.questionId),
]);

export const questionOptions = pgTable("question_options", {
	id: uuid().primaryKey().notNull(),
	questionId: uuid("question_id").notNull(),
	label: varchar({ length: 4 }).notNull(),
	optionText: text("option_text").notNull(),
	isCorrect: boolean("is_correct").default(false).notNull(),
	misconceptionNodeId: uuid("misconception_node_id"),
	ordering: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_options_question").using("btree", table.questionId.asc().nullsLast().op("int4_ops"), table.ordering.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_one_correct_option").using("btree", table.questionId.asc().nullsLast().op("uuid_ops")).where(sql`is_correct`),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "question_options_question_id_fkey"
		}).onDelete("cascade"),
	unique("uq_question_option_label").on(table.label, table.questionId),
]);

export const markSchemes = pgTable("mark_schemes", {
	id: uuid().primaryKey().notNull(),
	questionVersionId: uuid("question_version_id").notNull(),
	versionLabel: varchar("version_label", { length: 20 }).default('1').notNull(),
	sourceDocumentId: varchar("source_document_id", { length: 80 }),
	validationState: varchar("validation_state", { length: 12 }).default('SUGGESTED').notNull(),
	extractionMethod: varchar("extraction_method", { length: 120 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	generalGuidance: text("general_guidance"),
}, (table) => [
	foreignKey({
			columns: [table.questionVersionId],
			foreignColumns: [questionVersions.id],
			name: "mark_schemes_question_version_id_fkey"
		}).onDelete("cascade"),
	unique("uq_mark_scheme").on(table.questionVersionId, table.versionLabel),
	check("ck_mark_scheme_state", sql`(validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])`),
]);

export const attempts = pgTable("attempts", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	questionId: uuid("question_id").notNull(),
	chosenOptionId: uuid("chosen_option_id"),
	correct: boolean().notNull(),
	marksAwarded: integer("marks_awarded"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	responseTimeMs: bigint("response_time_ms", { mode: "number" }).notNull(),
	confidenceLevel: integer("confidence_level"),
	selfDoubtFlag: boolean("self_doubt_flag").default(false).notNull(),
	timedCondition: boolean("timed_condition").default(false).notNull(),
	provenance: varchar({ length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	markingState: varchar("marking_state", { length: 16 }).default('AUTO_GRADED').notNull(),
	evidenceEmitted: boolean("evidence_emitted").default(false).notNull(),
}, (table) => [
	index("ix_attempts_learner_time").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_attempts_question").using("btree", table.questionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "attempts_learner_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "attempts_question_id_fkey"
		}),
	check("attempts_confidence_level_check", sql`(confidence_level >= 1) AND (confidence_level <= 5)`),
	check("attempts_response_time_ms_check", sql`response_time_ms >= 0`),
	check("ck_attempt_marking_state", sql`(marking_state)::text = ANY ((ARRAY['AUTO_GRADED'::character varying, 'PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[])`),
]);

export const examPapers = pgTable("exam_papers", {
	id: uuid().primaryKey().notNull(),
	subjectId: uuid("subject_id").notNull(),
	title: varchar({ length: 200 }).notNull(),
	board: varchar({ length: 40 }).notNull(),
	qualification: varchar({ length: 20 }).notNull(),
	unit: varchar({ length: 60 }),
	sessionLabel: varchar("session_label", { length: 60 }),
	paperCode: varchar("paper_code", { length: 30 }),
	questionPaperDocumentId: varchar("question_paper_document_id", { length: 80 }),
	markSchemeDocumentId: varchar("mark_scheme_document_id", { length: 80 }),
	validationState: varchar("validation_state", { length: 12 }).default('SUGGESTED').notNull(),
	provenance: varchar({ length: 20 }).default('PAST_PAPER').notNull(),
	extractionMethod: varchar("extraction_method", { length: 120 }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	series: varchar({ length: 3 }),
	year: integer(),
}, (table) => [
	index("ix_exam_papers_paper_year_series").using("btree", table.paperCode.asc().nullsLast().op("text_ops"), table.year.asc().nullsLast().op("int4_ops"), table.series.asc().nullsLast().op("int4_ops")).where(sql`(paper_code IS NOT NULL)`),
	index("ix_exam_papers_subject").using("btree", table.subjectId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_exam_paper_identity").using("btree", table.paperCode.asc().nullsLast().op("text_ops"), table.sessionLabel.asc().nullsLast().op("text_ops")).where(sql`(paper_code IS NOT NULL)`),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjects.id],
			name: "exam_papers_subject_id_fkey"
		}),
	check("ck_exam_paper_provenance", sql`(provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying])::text[])`),
	check("ck_exam_paper_state", sql`(validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])`),
	check("ck_exam_papers_series", sql`(series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[]))`),
]);

export const questionVersions = pgTable("question_versions", {
	id: uuid().primaryKey().notNull(),
	questionId: uuid("question_id").notNull(),
	version: integer().notNull(),
	stem: text().notNull(),
	marks: integer().notNull(),
	difficulty: integer().notNull(),
	expectedTimeSeconds: integer("expected_time_seconds").notNull(),
	commandWord: varchar("command_word", { length: 30 }),
	validationState: varchar("validation_state", { length: 12 }).default('SUGGESTED').notNull(),
	sourceDocumentId: varchar("source_document_id", { length: 80 }),
	extractionConfidence: doublePrecision("extraction_confidence"),
	extractionMethod: varchar("extraction_method", { length: 120 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_question_versions_question").using("btree", table.questionId.asc().nullsLast().op("int4_ops"), table.version.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "question_versions_question_id_fkey"
		}).onDelete("cascade"),
	unique("uq_question_version").on(table.questionId, table.version),
	check("ck_question_version_state", sql`(validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])`),
	check("question_versions_difficulty_check", sql`(difficulty >= 1) AND (difficulty <= 5)`),
	check("question_versions_expected_time_seconds_check", sql`expected_time_seconds > 0`),
	check("question_versions_extraction_confidence_check", sql`(extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision)`),
	check("question_versions_marks_check", sql`marks > 0`),
	check("question_versions_version_check", sql`version > 0`),
]);

export const questionParts = pgTable("question_parts", {
	id: uuid().primaryKey().notNull(),
	questionVersionId: uuid("question_version_id").notNull(),
	label: varchar({ length: 12 }).notNull(),
	prompt: text().notNull(),
	commandWord: varchar("command_word", { length: 30 }),
	marks: integer().notNull(),
	ordering: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_question_parts_version").using("btree", table.questionVersionId.asc().nullsLast().op("int4_ops"), table.ordering.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.questionVersionId],
			foreignColumns: [questionVersions.id],
			name: "question_parts_question_version_id_fkey"
		}).onDelete("cascade"),
	unique("uq_question_part").on(table.label, table.questionVersionId),
	check("question_parts_marks_check", sql`marks >= 0`),
	check("question_parts_ordering_check", sql`ordering >= 0`),
]);

export const markPoints = pgTable("mark_points", {
	id: uuid().primaryKey().notNull(),
	markSchemeId: uuid("mark_scheme_id").notNull(),
	questionPartId: uuid("question_part_id"),
	ref: varchar({ length: 20 }),
	ordering: integer().notNull(),
	text: text().notNull(),
	marks: integer().notNull(),
	acceptanceCriteria: jsonb("acceptance_criteria"),
	extractionConfidence: doublePrecision("extraction_confidence"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_mark_points_part").using("btree", table.questionPartId.asc().nullsLast().op("uuid_ops")),
	index("ix_mark_points_scheme").using("btree", table.markSchemeId.asc().nullsLast().op("int4_ops"), table.ordering.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.markSchemeId],
			foreignColumns: [markSchemes.id],
			name: "mark_points_mark_scheme_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.questionPartId],
			foreignColumns: [questionParts.id],
			name: "mark_points_question_part_id_fkey"
		}),
	check("mark_points_extraction_confidence_check", sql`(extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision)`),
	check("mark_points_marks_check", sql`marks > 0`),
	check("mark_points_ordering_check", sql`ordering >= 0`),
]);

export const answers = pgTable("answers", {
	id: uuid().primaryKey().notNull(),
	attemptId: uuid("attempt_id").notNull(),
	questionPartId: uuid("question_part_id").notNull(),
	answerText: text("answer_text"),
	marksAwarded: integer("marks_awarded"),
	markingState: varchar("marking_state", { length: 16 }).default('PENDING').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_answers_attempt").using("btree", table.attemptId.asc().nullsLast().op("uuid_ops")),
	index("ix_answers_part").using("btree", table.questionPartId.asc().nullsLast().op("uuid_ops")),
	index("ix_answers_state").using("btree", table.markingState.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attemptId],
			foreignColumns: [attempts.id],
			name: "answers_attempt_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.questionPartId],
			foreignColumns: [questionParts.id],
			name: "answers_question_part_id_fkey"
		}),
	unique("uq_answer_per_part").on(table.attemptId, table.questionPartId),
	check("answers_marks_awarded_check", sql`marks_awarded >= 0`),
	check("ck_answer_marking_state", sql`(marking_state)::text = ANY ((ARRAY['PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[])`),
]);

export const smartMarkResults = pgTable("smart_mark_results", {
	id: uuid().primaryKey().notNull(),
	answerId: uuid("answer_id").notNull(),
	pipelineVersion: varchar("pipeline_version", { length: 20 }).notNull(),
	modelId: varchar("model_id", { length: 80 }),
	marksAwarded: integer("marks_awarded").notNull(),
	confidence: doublePrecision(),
	validationPassed: boolean("validation_passed").notNull(),
	breakdown: jsonb(),
	failureReason: varchar("failure_reason", { length: 200 }),
	rawOutput: text("raw_output"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	markSchemeId: uuid("mark_scheme_id"),
	schemeValidationState: varchar("scheme_validation_state", { length: 12 }),
}, (table) => [
	index("ix_smart_mark_results_answer").using("btree", table.answerId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.answerId],
			foreignColumns: [answers.id],
			name: "smart_mark_results_answer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.markSchemeId],
			foreignColumns: [markSchemes.id],
			name: "smart_mark_results_mark_scheme_id_fkey"
		}),
	check("smart_mark_results_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
	check("smart_mark_results_marks_awarded_check", sql`marks_awarded >= 0`),
]);

export const skillStates = pgTable("skill_states", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	mastery: doublePrecision().notNull(),
	attempts: integer().default(0).notNull(),
	correctCount: integer("correct_count").default(0).notNull(),
	lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	proceduralFluencyGap: doublePrecision("procedural_fluency_gap"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	version: bigint({ mode: "number" }).default(0).notNull(),
}, (table) => [
	index("ix_skill_states_last_practice").using("btree", table.lastPracticedAt.asc().nullsLast().op("timestamptz_ops")),
	index("ix_skill_states_node").using("btree", table.nodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "skill_states_learner_id_fkey"
		}).onDelete("cascade"),
	unique("uq_skill_state").on(table.learnerId, table.nodeId),
	check("skill_states_mastery_check", sql`(mastery >= (0)::double precision) AND (mastery <= (1)::double precision)`),
	check("skill_states_procedural_fluency_gap_check", sql`(procedural_fluency_gap >= ('-1'::integer)::double precision) AND (procedural_fluency_gap <= (1)::double precision)`),
]);

export const humanMarks = pgTable("human_marks", {
	id: uuid().primaryKey().notNull(),
	answerId: uuid("answer_id").notNull(),
	markerId: uuid("marker_id").notNull(),
	marksAwarded: integer("marks_awarded").notNull(),
	perPointDecisions: jsonb("per_point_decisions"),
	comments: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_human_marks_answer").using("btree", table.answerId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.answerId],
			foreignColumns: [answers.id],
			name: "human_marks_answer_id_fkey"
		}).onDelete("cascade"),
	check("human_marks_marks_awarded_check", sql`marks_awarded >= 0`),
]);

export const smartMarkAgreementEvaluations = pgTable("smart_mark_agreement_evaluations", {
	id: uuid().primaryKey().notNull(),
	scope: varchar({ length: 12 }).notNull(),
	examPaperId: uuid("exam_paper_id"),
	sampleSize: integer("sample_size").notNull(),
	kappa: doublePrecision().notNull(),
	observedAgreement: doublePrecision("observed_agreement").notNull(),
	threshold: doublePrecision().default(0.6).notNull(),
	passed: boolean().notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).notNull(),
	computedBy: uuid("computed_by"),
}, (table) => [
	foreignKey({
			columns: [table.examPaperId],
			foreignColumns: [examPapers.id],
			name: "smart_mark_agreement_evaluations_exam_paper_id_fkey"
		}),
	check("ck_agreement_paper", sql`((scope)::text <> 'PAPER'::text) OR (exam_paper_id IS NOT NULL)`),
	check("ck_agreement_scope", sql`(scope)::text = ANY ((ARRAY['PAPER'::character varying, 'ALL'::character varying])::text[])`),
	check("smart_mark_agreement_evaluations_sample_size_check", sql`sample_size > 0`),
]);

export const struggleInferences = pgTable("struggle_inferences", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	topicNodeId: uuid("topic_node_id").notNull(),
	type: varchar({ length: 40 }).notNull(),
	subtype: varchar({ length: 80 }).notNull(),
	probability: doublePrecision().notNull(),
	supportingEvidence: jsonb("supporting_evidence").notNull(),
	modelVersion: varchar("model_version", { length: 80 }).notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	supersededAt: timestamp("superseded_at", { withTimezone: true, mode: 'string' }),
	teacherOverride: varchar("teacher_override", { length: 40 }),
	overriddenBy: uuid("overridden_by"),
	overriddenAt: timestamp("overridden_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_struggle_inference_learner_expiry").using("btree", table.learnerId.asc().nullsLast().op("float8_ops"), table.expiresAt.desc().nullsFirst().op("uuid_ops"), table.probability.desc().nullsFirst().op("uuid_ops")),
	index("idx_struggle_inference_learner_topic_expiry").using("btree", table.learnerId.asc().nullsLast().op("float8_ops"), table.topicNodeId.asc().nullsLast().op("float8_ops"), table.expiresAt.desc().nullsFirst().op("timestamptz_ops"), table.probability.desc().nullsFirst().op("float8_ops")),
	index("idx_struggle_inference_supersede").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.topicNodeId.asc().nullsLast().op("timestamptz_ops"), table.type.asc().nullsLast().op("timestamptz_ops"), table.expiresAt.desc().nullsFirst().op("uuid_ops")).where(sql`(superseded_at IS NULL)`),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "struggle_inferences_learner_id_fkey"
		}),
	foreignKey({
			columns: [table.overriddenBy],
			foreignColumns: [users.id],
			name: "struggle_inferences_overridden_by_fkey"
		}),
	foreignKey({
			columns: [table.topicNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "struggle_inferences_topic_node_id_fkey"
		}),
	check("struggle_inferences_check", sql`expires_at > generated_at`),
	check("struggle_inferences_probability_check", sql`(probability >= (0)::double precision) AND (probability <= (1)::double precision)`),
]);

export const campaignDbIdentity = pgTable("campaign_db_identity", {
	id: smallint().primaryKey().notNull(),
	campaignLabel: varchar("campaign_label", { length: 80 }).notNull(),
	dbName: varchar("db_name", { length: 80 }).notNull(),
	hostAddr: varchar("host_addr", { length: 80 }),
	coreCommit: varchar("core_commit", { length: 40 }),
	note: varchar({ length: 200 }),
	claimedAt: timestamp("claimed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("campaign_db_identity_id_check", sql`id = 1`),
]);

export const teacherValidationEvents = pgTable("teacher_validation_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	importerRunId: uuid("importer_run_id").notNull(),
	decisionSeq: integer("decision_seq").notNull(),
	decisionHash: char("decision_hash", { length: 64 }).notNull(),
	action: varchar({ length: 12 }).notNull(),
	targetType: varchar("target_type", { length: 20 }).notNull(),
	targetId: uuid("target_id").notNull(),
	targetLabel: text("target_label").default('').notNull(),
	reviewer: varchar({ length: 80 }).notNull(),
	note: text().default('').notNull(),
	resultState: varchar("result_state", { length: 12 }).notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_tve_run").using("btree", table.importerRunId.asc().nullsLast().op("uuid_ops")),
	index("ix_tve_target").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	unique("uq_tve_decision").on(table.decisionHash, table.decisionSeq),
	check("ck_tve_action", sql`(action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'REVERSE'::character varying])::text[])`),
	check("ck_tve_result_state", sql`(result_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying])::text[])`),
	check("ck_tve_target_type", sql`(target_type)::text = ANY ((ARRAY['question_version'::character varying, 'mark_scheme'::character varying, 'exam_paper'::character varying])::text[])`),
	check("ck_tve_targets_differ", sql`NOT (((action)::text = 'REVERSE'::text) AND (decision_seq <= 0))`),
]);

export const questions = pgTable("questions", {
	id: uuid().primaryKey().notNull(),
	externalRef: varchar("external_ref", { length: 80 }),
	questionType: varchar("question_type", { length: 20 }).default('MCQ_SINGLE').notNull(),
	stem: text().notNull(),
	marks: integer().notNull(),
	difficulty: integer().notNull(),
	expectedTimeSeconds: integer("expected_time_seconds").notNull(),
	commandWord: varchar("command_word", { length: 30 }),
	primaryTopicNodeId: uuid("primary_topic_node_id"),
	provenance: varchar({ length: 20 }).default('SEED_DEMO').notNull(),
	active: boolean().default(true).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	examPaperId: uuid("exam_paper_id"),
	difficultySource: varchar("difficulty_source", { length: 30 }),
}, (table) => [
	index("ix_questions_paper").using("btree", table.examPaperId.asc().nullsLast().op("uuid_ops")).where(sql`(exam_paper_id IS NOT NULL)`),
	index("ix_questions_topic").using("btree", table.primaryTopicNodeId.asc().nullsLast().op("uuid_ops")).where(sql`active`),
	foreignKey({
			columns: [table.examPaperId],
			foreignColumns: [examPapers.id],
			name: "questions_exam_paper_id_fkey"
		}),
	check("ck_question_provenance", sql`(provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying, 'EXTERNAL_BANK'::character varying])::text[])`),
	check("ck_question_type", sql`(question_type)::text = ANY ((ARRAY['MCQ_SINGLE'::character varying, 'SHORT_ANSWER'::character varying, 'STRUCTURED'::character varying])::text[])`),
	check("questions_difficulty_check", sql`(difficulty >= 1) AND (difficulty <= 5)`),
	check("questions_expected_time_seconds_check", sql`expected_time_seconds > 0`),
	check("questions_marks_check", sql`marks > 0`),
]);

export const reviewSchedules = pgTable("review_schedules", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }).notNull(),
	reason: varchar({ length: 40 }).default('DECAY_CROSSED_THRESHOLD').notNull(),
	masteryAtTrigger: doublePrecision("mastery_at_trigger"),
	status: varchar({ length: 16 }).default('PENDING').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_review_learner_status").using("btree", table.learnerId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("uuid_ops"), table.dueAt.asc().nullsLast().op("timestamptz_ops")),
	index("ix_review_status_due").using("btree", table.status.asc().nullsLast().op("text_ops"), table.dueAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "review_schedules_learner_id_fkey"
		}).onDelete("cascade"),
	check("ck_review_reason", sql`(reason)::text = ANY ((ARRAY['DECAY_CROSSED_THRESHOLD'::character varying, 'TEACHER_ASSIGNED'::character varying])::text[])`),
	check("ck_review_status", sql`(status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])`),
]);

export const interventionRunStep = pgTable("intervention_run_step", {
	stepId: uuid("step_id").primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	sequenceNo: integer("sequence_no").notNull(),
	status: varchar({ length: 16 }).notNull(),
	observationType: varchar("observation_type", { length: 64 }).notNull(),
	inputEvidenceRef: text("input_evidence_ref"),
	outputEvidenceRef: text("output_evidence_ref"),
	blockedReason: text("blocked_reason"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("intervention_run_step_run_idx").using("btree", table.runId.asc().nullsLast().op("int4_ops"), table.sequenceNo.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [interventionRun.runId],
			name: "intervention_run_step_run_id_fkey"
		}),
	unique("intervention_run_step_unique_seq").on(table.runId, table.sequenceNo),
	check("intervention_run_step_sequence_ck", sql`sequence_no >= 0`),
]);

export const flywaySchemaHistory = pgTable("flyway_schema_history", {
	installedRank: integer("installed_rank").primaryKey().notNull(),
	version: varchar({ length: 50 }),
	description: varchar({ length: 200 }).notNull(),
	type: varchar({ length: 20 }).notNull(),
	script: varchar({ length: 1000 }).notNull(),
	checksum: integer(),
	installedBy: varchar("installed_by", { length: 100 }).notNull(),
	installedOn: timestamp("installed_on", { mode: 'string' }).defaultNow().notNull(),
	executionTime: integer("execution_time").notNull(),
	success: boolean().notNull(),
}, (table) => [
	index("flyway_schema_history_s_idx").using("btree", table.success.asc().nullsLast().op("bool_ops")),
]);

export const experiments = pgTable("experiments", {
	id: uuid().primaryKey().notNull(),
	experimentKey: varchar("experiment_key", { length: 60 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	hypothesis: text(),
	pinnedProvider: varchar("pinned_provider", { length: 30 }),
	pinnedModel: varchar("pinned_model", { length: 100 }),
	status: varchar({ length: 16 }).default('DRAFT').notNull(),
	params: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("experiments_experiment_key_key").on(table.experimentKey),
	check("ck_experiment_status", sql`(status)::text = ANY ((ARRAY['DRAFT'::character varying, 'RUNNING'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'ARCHIVED'::character varying])::text[])`),
]);

export const modelVersions = pgTable("model_versions", {
	id: uuid().primaryKey().notNull(),
	registryKey: varchar("registry_key", { length: 60 }).notNull(),
	version: varchar({ length: 30 }).notNull(),
	params: jsonb().notNull(),
	provenance: varchar({ length: 300 }),
	notes: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("uq_model_version").on(table.registryKey, table.version),
]);

export const interventionRunEvidence = pgTable("intervention_run_evidence", {
	id: uuid().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	evidenceRef: varchar("evidence_ref", { length: 512 }).notNull(),
	role: varchar({ length: 32 }).notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("intervention_run_evidence_run_idx").using("btree", table.runId.asc().nullsLast().op("timestamptz_ops"), table.capturedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [interventionRun.runId],
			name: "intervention_run_evidence_run_id_fkey"
		}),
]);

export const revisionNote = pgTable("revision_note", {
	noteId: varchar("note_id", { length: 256 }).primaryKey().notNull(),
	topicOrder: integer("topic_order").notNull(),
	topicTitle: varchar("topic_title", { length: 512 }).notNull(),
	subtopicOrder: integer("subtopic_order").notNull(),
	subtopicTitle: varchar("subtopic_title", { length: 512 }).notNull(),
	noteOrder: integer("note_order").notNull(),
	title: varchar({ length: 512 }).notNull(),
	bodyMd: text("body_md").notNull(),
	specMap: jsonb("spec_map").default({}).notNull(),
	specPointCodes: text("spec_point_codes").default('').notNull(),
	sourceUrl: text("source_url"),
	ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: 'string' }).notNull(),
	corpusVersion: varchar("corpus_version", { length: 128 }).notNull(),
}, (table) => [
	index("revision_note_tree_idx").using("btree", table.topicOrder.asc().nullsLast().op("int4_ops"), table.subtopicOrder.asc().nullsLast().op("int4_ops"), table.noteOrder.asc().nullsLast().op("int4_ops")),
	unique("revision_note_order_unique").on(table.noteOrder, table.subtopicOrder, table.topicOrder),
]);

export const revisionNoteAsset = pgTable("revision_note_asset", {
	filename: varchar({ length: 512 }).primaryKey().notNull(),
	contentType: varchar("content_type", { length: 128 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	// TODO: failed to parse database type 'bytea'
	bytes: bytea("bytes").notNull(),
	ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	check("revision_note_asset_name_ck", sql`(filename)::text !~ '[/\\]'::text`),
]);

export const revisionNoteViewed = pgTable("revision_note_viewed", {
	id: uuid().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	noteId: varchar("note_id", { length: 256 }).notNull(),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("revision_note_viewed_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.viewedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "revision_note_viewed_user_id_fkey"
		}),
	unique("revision_note_viewed_unique").on(table.noteId, table.userId),
]);

export const bootstrapAdminState = pgTable("bootstrap_admin_state", {
	id: integer().primaryKey().notNull(),
	state: varchar({ length: 10 }).default('PENDING').notNull(),
	claimedBy: uuid("claimed_by"),
	claimedAt: timestamp("claimed_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.claimedBy],
			foreignColumns: [users.id],
			name: "bootstrap_admin_state_claimed_by_fkey"
		}),
	check("bootstrap_admin_state_id_check", sql`id = 1`),
	check("ck_bas_state", sql`(state)::text = ANY ((ARRAY['PENDING'::character varying, 'CONSUMED'::character varying, 'EXPIRED'::character varying])::text[])`),
]);

export const interventionRun = pgTable("intervention_run", {
	runId: uuid("run_id").primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	subjectId: uuid("subject_id"),
	curriculumVersionId: uuid("curriculum_version_id"),
	status: varchar({ length: 16 }).notNull(),
	origin: varchar({ length: 64 }).notNull(),
	targetSpecificationPoints: jsonb("target_specification_points").default([]).notNull(),
	questionPartIds: jsonb("question_part_ids").default([]).notNull(),
	evidenceRefs: jsonb("evidence_refs").default([]).notNull(),
	diagnosisSnapshotRef: text("diagnosis_snapshot_ref"),
	learnerStateSnapshotRef: text("learner_state_snapshot_ref"),
	diagnosisVersion: varchar("diagnosis_version", { length: 128 }),
	actionType: varchar("action_type", { length: 32 }).notNull(),
	interventionVersion: varchar("intervention_version", { length: 128 }).notNull(),
	interventionHash: varchar("intervention_hash", { length: 128 }).notNull(),
	allowedToolIds: jsonb("allowed_tool_ids").default([]).notNull(),
	terminalOutcome: varchar("terminal_outcome", { length: 64 }),
	currentStep: integer("current_step"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("intervention_run_learner_created_idx").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "intervention_run_learner_id_fkey"
		}),
	check("intervention_run_status_ck", sql`(status)::text = ANY ((ARRAY['CREATED'::character varying, 'ACTIVE'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])`),
	check("intervention_run_terminal_ck", sql`(((status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])) AND (terminal_outcome IS NOT NULL)) OR ((status)::text <> ALL ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[]))`),
]);

export const documents = pgTable("documents", {
	id: uuid().primaryKey().notNull(),
	documentId: varchar("document_id", { length: 80 }).notNull(),
	schemaVersion: varchar("schema_version", { length: 10 }).notNull(),
	docVersion: integer("doc_version").default(1).notNull(),
	kind: varchar({ length: 20 }).notNull(),
	sourceUri: varchar("source_uri", { length: 500 }).notNull(),
	fileName: varchar("file_name", { length: 300 }),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	checksum: varchar({ length: 128 }).notNull(),
	checksumAlgorithm: varchar("checksum_algorithm", { length: 20 }).default('SHA-256').notNull(),
	pageCount: integer("page_count").notNull(),
	elementCount: integer("element_count").notNull(),
	textElementCount: integer("text_element_count").notNull(),
	chunkCount: integer("chunk_count").default(0).notNull(),
	sourceEngine: varchar("source_engine", { length: 60 }).notNull(),
	sourceEngineVersion: varchar("source_engine_version", { length: 40 }).notNull(),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }),
	canonicalJson: jsonb("canonical_json").notNull(),
	ingestedBy: uuid("ingested_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	validationState: varchar("validation_state", { length: 20 }).default('SUGGESTED').notNull(),
}, (table) => [
	index("ix_documents_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_documents_kind").using("btree", table.kind.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_documents_canonical_id").using("btree", table.documentId.asc().nullsLast().op("text_ops"), table.docVersion.asc().nullsLast().op("int4_ops")),
	uniqueIndex("uq_documents_checksum").using("btree", table.checksum.asc().nullsLast().op("text_ops")),
	check("ck_documents_kind", sql`(kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[])`),
	check("ck_documents_validation_state", sql`(validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])`),
	check("documents_chunk_count_check", sql`chunk_count >= 0`),
	check("documents_doc_version_check", sql`doc_version > 0`),
	check("documents_element_count_check", sql`element_count >= 0`),
	check("documents_page_count_check", sql`page_count > 0`),
	check("documents_text_element_count_check", sql`text_element_count >= 0`),
]);

export const questionSpecPoints = pgTable("question_spec_points", {
	id: uuid().primaryKey().notNull(),
	questionId: uuid("question_id").notNull(),
	specPointNodeId: uuid("spec_point_node_id").notNull(),
	role: varchar({ length: 10 }).notNull(),
	provenance: varchar({ length: 40 }).default('AI_VALIDATED').notNull(),
	validationState: varchar("validation_state", { length: 16 }).default('AI_VALIDATED').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_qsp_node").using("btree", table.specPointNodeId.asc().nullsLast().op("uuid_ops")),
	index("ix_qsp_question").using("btree", table.questionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "question_spec_points_question_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.specPointNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "question_spec_points_spec_point_node_id_fkey"
		}),
	unique("uq_question_spec_point").on(table.questionId, table.specPointNodeId),
	check("ck_qsp_role", sql`(role)::text = ANY ((ARRAY['PRIMARY'::character varying, 'SECONDARY'::character varying])::text[])`),
	check("ck_qsp_state", sql`(validation_state)::text = ANY ((ARRAY['AI_VALIDATED'::character varying, 'HUMAN_VALIDATED'::character varying])::text[])`),
]);

export const documentChunks = pgTable("document_chunks", {
	id: uuid().primaryKey().notNull(),
	documentRowId: uuid("document_row_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	pageStart: integer("page_start"),
	pageEnd: integer("page_end"),
	elementIds: jsonb("element_ids").notNull(),
	tokenEstimate: integer("token_estimate").notNull(),
	embedding: vector({ dimensions: 768 }),
	embeddingModel: varchar("embedding_model", { length: 60 }),
	embeddedAt: timestamp("embedded_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// TODO: failed to parse database type 'tsvector'
	contentTsv: tsvector("content_tsv").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, content)`),
	kind: varchar({ length: 20 }),
	subjectId: uuid("subject_id"),
	series: varchar({ length: 3 }),
	year: integer(),
	paperCode: varchar("paper_code", { length: 20 }),
	atomNumber: varchar("atom_number", { length: 10 }),
	specCodes: jsonb("spec_codes"),
	embedRev: integer("embed_rev").default(1).notNull(),
}, (table) => [
	index("idx_document_chunks_content_tsv").using("gin", table.contentTsv.asc().nullsLast().op("tsvector_ops")),
	index("ix_document_chunks_document").using("btree", table.documentRowId.asc().nullsLast().op("uuid_ops")),
	index("ix_document_chunks_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("ix_document_chunks_pending").using("btree", table.documentRowId.asc().nullsLast().op("uuid_ops")).where(sql`(embedding IS NULL)`),
	index("ix_document_chunks_spec_codes").using("gin", table.specCodes.asc().nullsLast().op("jsonb_ops")).where(sql`(spec_codes IS NOT NULL)`),
	index("ix_document_chunks_subject_kind").using("btree", table.subjectId.asc().nullsLast().op("text_ops"), table.kind.asc().nullsLast().op("uuid_ops")).where(sql`(subject_id IS NOT NULL)`),
	index("ix_document_chunks_subject_year_series").using("btree", table.subjectId.asc().nullsLast().op("text_ops"), table.year.asc().nullsLast().op("uuid_ops"), table.series.asc().nullsLast().op("int4_ops")).where(sql`(subject_id IS NOT NULL)`),
	foreignKey({
			columns: [table.documentRowId],
			foreignColumns: [documents.id],
			name: "document_chunks_document_row_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjects.id],
			name: "document_chunks_subject_id_fkey"
		}),
	unique("uq_document_chunk").on(table.chunkIndex, table.documentRowId),
	check("ck_document_chunks_kind", sql`(kind IS NULL) OR ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[]))`),
	check("ck_document_chunks_series", sql`(series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[]))`),
	check("document_chunks_chunk_index_check", sql`chunk_index >= 0`),
	check("document_chunks_embed_rev_check", sql`embed_rev > 0`),
	check("document_chunks_token_estimate_check", sql`token_estimate > 0`),
]);

export const questionAsset = pgTable("question_asset", {
	filename: varchar({ length: 512 }).primaryKey().notNull(),
	contentType: varchar("content_type", { length: 128 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	// TODO: failed to parse database type 'bytea'
	bytes: bytea("bytes").notNull(),
	ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	check("question_asset_name_ck", sql`(filename)::text !~ '[/\\]'::text`),
]);

export const decayJobRuns = pgTable("decay_job_runs", {
	windowStart: timestamp("window_start", { withTimezone: true, mode: 'string' }).primaryKey().notNull(),
	executedAt: timestamp("executed_at", { withTimezone: true, mode: 'string' }).notNull(),
	triggerKind: varchar("trigger_kind", { length: 20 }).notNull(),
	decayed: integer().notNull(),
	reviewsScheduled: integer("reviews_scheduled").notNull(),
});

export const learnerSelfMarks = pgTable("learner_self_marks", {
	id: uuid().primaryKey().notNull(),
	answerId: uuid("answer_id").notNull(),
	learnerId: uuid("learner_id").notNull(),
	marksAwarded: integer("marks_awarded").notNull(),
	comment: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_lsm_answer").using("btree", table.answerId.asc().nullsLast().op("uuid_ops")),
	index("ix_lsm_learner").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.answerId],
			foreignColumns: [answers.id],
			name: "learner_self_marks_answer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "learner_self_marks_learner_id_fkey"
		}).onDelete("cascade"),
	check("learner_self_marks_marks_awarded_check", sql`marks_awarded >= 0`),
]);

export const tutorTopicEngagements = pgTable("tutor_topic_engagements", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	evidenceCount: integer("evidence_count").notNull(),
	refused: boolean().notNull(),
	answerModel: varchar("answer_model", { length: 120 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	signalType: varchar("signal_type", { length: 24 }).default('TOPIC_ENGAGEMENT').notNull(),
	surface: varchar({ length: 24 }).default('FREE_TUTOR').notNull(),
	responseMode: varchar("response_mode", { length: 20 }),
	contextKind: varchar("context_kind", { length: 32 }),
	contextReference: uuid("context_reference"),
	classifierVersion: varchar("classifier_version", { length: 48 }).default('tutor-signals/v1').notNull(),
}, (table) => [
	index("ix_tte_learner_recent").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("uuid_ops")),
	index("ix_tte_learner_signal").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops"), table.signalType.asc().nullsLast().op("text_ops")),
	index("ix_tte_learner_surface").using("btree", table.learnerId.asc().nullsLast().op("text_ops"), table.surface.asc().nullsLast().op("text_ops"), table.occurredAt.desc().nullsFirst().op("uuid_ops")),
	index("ix_tte_node").using("btree", table.nodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "tutor_topic_engagements_learner_id_fkey"
		}).onDelete("cascade"),
	check("ck_tte_signal", sql`(signal_type)::text = ANY ((ARRAY['TOPIC_ENGAGEMENT'::character varying, 'EXPLANATION_REQUEST'::character varying, 'DOUBT_SIGNAL'::character varying, 'MISCONCEPTION_RELATED'::character varying, 'PREREQUISITE_HELP'::character varying, 'CLARIFICATION_REQUEST'::character varying])::text[])`),
	check("ck_tte_surface", sql`(surface)::text = ANY ((ARRAY['FREE_TUTOR'::character varying, 'CONTEXTUAL_ASSISTANT'::character varying])::text[])`),
]);

export const contentReviewAudit = pgTable("content_review_audit", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	actorUserId: uuid("actor_user_id"),
	actorLabel: varchar("actor_label", { length: 254 }).default('').notNull(),
	action: varchar({ length: 24 }).notNull(),
	targetType: varchar("target_type", { length: 24 }).notNull(),
	targetId: uuid("target_id").notNull(),
	fromState: varchar("from_state", { length: 12 }),
	toState: varchar("to_state", { length: 12 }),
	detail: text().default('').notNull(),
}, (table) => [
	index("ix_cra_actor").using("btree", table.actorUserId.asc().nullsLast().op("uuid_ops")),
	index("ix_cra_occurred").using("btree", table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_cra_target").using("btree", table.targetType.asc().nullsLast().op("uuid_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [users.id],
			name: "content_review_audit_actor_user_id_fkey"
		}).onDelete("set null"),
	check("ck_cra_action", sql`(action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'VALIDATE_ALL'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'UNFLAG'::character varying, 'PLACE'::character varying, 'MAP_TOPICS'::character varying])::text[])`),
	check("ck_cra_target_type", sql`(target_type)::text = ANY (ARRAY[('exam_paper'::character varying)::text, ('question_version'::character varying)::text, ('mark_scheme'::character varying)::text, ('question'::character varying)::text, ('document'::character varying)::text])`),
]);

export const glmOcrBridgeRecords = pgTable("glm_ocr_bridge_records", {
	id: uuid().primaryKey().notNull(),
	paperId: uuid("paper_id").notNull(),
	bridge: varchar({ length: 30 }).default('glm-ocr-v1').notNull(),
	qpDocumentId: varchar("qp_document_id", { length: 80 }).notNull(),
	msDocumentId: varchar("ms_document_id", { length: 80 }).notNull(),
	qpDocumentRowId: uuid("qp_document_row_id"),
	msDocumentRowId: uuid("ms_document_row_id"),
	qpChecksum: varchar("qp_checksum", { length: 128 }).notNull(),
	msChecksum: varchar("ms_checksum", { length: 128 }).notNull(),
	extractionMethods: varchar("extraction_methods", { length: 120 }).notNull(),
	reconciliationStatus: varchar("reconciliation_status", { length: 20 }).notNull(),
	reviewFindings: jsonb("review_findings").notNull(),
	qpDraft: jsonb("qp_draft").notNull(),
	msDraft: jsonb("ms_draft").notNull(),
	reconciliation: jsonb().notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_glm_ocr_bridge_reconciliation").using("btree", table.reconciliationStatus.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_glm_ocr_bridge_pair").using("btree", table.qpDocumentId.asc().nullsLast().op("text_ops"), table.msDocumentId.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_glm_ocr_bridge_paper").using("btree", table.paperId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.paperId],
			foreignColumns: [examPapers.id],
			name: "glm_ocr_bridge_records_paper_id_fkey"
		}),
	check("ck_glm_ocr_reconciliation_status", sql`(reconciliation_status)::text = ANY ((ARRAY['OK'::character varying, 'REVIEW_REQUIRED'::character varying, 'SUPERSEDED'::character varying])::text[])`),
]);

export const archiveTc27CardWave20260928 = pgTable("archive_tc27_card_wave_20260928", {
	id: uuid().primaryKey().notNull(),
	documentId: varchar("document_id", { length: 80 }).notNull(),
	schemaVersion: varchar("schema_version", { length: 10 }).notNull(),
	docVersion: integer("doc_version").default(1).notNull(),
	kind: varchar({ length: 20 }).notNull(),
	sourceUri: varchar("source_uri", { length: 500 }).notNull(),
	fileName: varchar("file_name", { length: 300 }),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	checksum: varchar({ length: 128 }).notNull(),
	checksumAlgorithm: varchar("checksum_algorithm", { length: 20 }).default('SHA-256').notNull(),
	pageCount: integer("page_count").notNull(),
	elementCount: integer("element_count").notNull(),
	textElementCount: integer("text_element_count").notNull(),
	chunkCount: integer("chunk_count").default(0).notNull(),
	sourceEngine: varchar("source_engine", { length: 60 }).notNull(),
	sourceEngineVersion: varchar("source_engine_version", { length: 40 }).notNull(),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }),
	canonicalJson: jsonb("canonical_json").notNull(),
	ingestedBy: uuid("ingested_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	validationState: varchar("validation_state", { length: 20 }).default('SUGGESTED').notNull(),
}, (table) => [
	uniqueIndex("archive_tc27_card_wave_20260928_checksum_idx").using("btree", table.checksum.asc().nullsLast().op("text_ops")),
	index("archive_tc27_card_wave_20260928_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("archive_tc27_card_wave_20260928_document_id_doc_version_idx").using("btree", table.documentId.asc().nullsLast().op("text_ops"), table.docVersion.asc().nullsLast().op("text_ops")),
	index("archive_tc27_card_wave_20260928_kind_idx").using("btree", table.kind.asc().nullsLast().op("text_ops")),
	check("ck_documents_kind", sql`(kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[])`),
	check("ck_documents_validation_state", sql`(validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])`),
	check("documents_chunk_count_check", sql`chunk_count >= 0`),
	check("documents_doc_version_check", sql`doc_version > 0`),
	check("documents_element_count_check", sql`element_count >= 0`),
	check("documents_page_count_check", sql`page_count > 0`),
	check("documents_text_element_count_check", sql`text_element_count >= 0`),
]);

export const tutorSessionTurns = pgTable("tutor_session_turns", {
	id: uuid().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	seq: integer().notNull(),
	role: varchar({ length: 16 }).notNull(),
	content: text().notNull(),
	evidenceCount: integer("evidence_count").default(0).notNull(),
	refused: boolean().default(false).notNull(),
	answerModel: varchar("answer_model", { length: 120 }),
	answerProvider: varchar("answer_provider", { length: 60 }),
	latencyMs: doublePrecision("latency_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_tutor_session_turns_session").using("btree", table.sessionId.asc().nullsLast().op("int4_ops"), table.seq.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [tutorSessions.id],
			name: "tutor_session_turns_session_id_fkey"
		}).onDelete("cascade"),
	unique("uq_tutor_session_turn_seq").on(table.seq, table.sessionId),
	check("ck_tutor_session_turn_role", sql`(role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text])`),
]);

export const flashcardRatings = pgTable("flashcard_ratings", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	cardId: varchar("card_id", { length: 64 }).notNull(),
	rating: varchar({ length: 16 }).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_fr_learner_card").using("btree", table.learnerId.asc().nullsLast().op("text_ops"), table.cardId.asc().nullsLast().op("uuid_ops")),
	index("ix_fr_learner_recent").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops"), table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	check("flashcard_ratings_rating_check", sql`(rating)::text = ANY ((ARRAY['STILL_LEARNING'::character varying, 'KNOW'::character varying])::text[])`),
]);

export const assignmentSubmissions = pgTable("assignment_submissions", {
	id: uuid().primaryKey().notNull(),
	assignmentId: uuid("assignment_id").notNull(),
	learnerId: uuid("learner_id").notNull(),
	questionsCompleted: integer("questions_completed").notNull(),
	score: integer(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_asub_assignment_recent").using("btree", table.assignmentId.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_asub_learner").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops")),
	check("assignment_submissions_questions_completed_check", sql`questions_completed >= 0`),
	check("assignment_submissions_score_check", sql`(score IS NULL) OR (score >= 0)`),
]);

export const noteVotes = pgTable("note_votes", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	nodeId: uuid("node_id").notNull(),
	noteId: varchar("note_id", { length: 64 }).notNull(),
	vote: varchar({ length: 16 }).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_nv_learner_note").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops"), table.noteId.asc().nullsLast().op("text_ops")),
	index("ix_nv_learner_recent").using("btree", table.learnerId.asc().nullsLast().op("uuid_ops"), table.occurredAt.desc().nullsFirst().op("uuid_ops")),
	check("note_votes_vote_check", sql`(vote)::text = ANY ((ARRAY['HELPFUL'::character varying, 'NOT_HELPFUL'::character varying])::text[])`),
]);

export const tutorSessions = pgTable("tutor_sessions", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }).notNull(),
	courseRef: varchar("course_ref", { length: 64 }),
}, (table) => [
	index("idx_tutor_sessions_learner_active").using("btree", table.learnerId.asc().nullsLast().op("timestamptz_ops"), table.lastActiveAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.learnerId],
			foreignColumns: [users.id],
			name: "tutor_sessions_learner_id_fkey"
		}).onDelete("cascade"),
]);

export const classes = pgTable("classes", {
	id: uuid().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	courseSlug: varchar("course_slug", { length: 64 }).notNull(),
	courseLabel: varchar("course_label", { length: 120 }).notNull(),
	name: varchar({ length: 120 }).notNull(),
	status: varchar({ length: 16 }).default('ACTIVE').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_class_teacher").using("btree", table.teacherId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("ux_class_teacher_course_name").using("btree", sql`teacher_id`, sql`course_slug`, sql`lower((name)::text)`).where(sql`((status)::text = 'ACTIVE'::text)`),
	check("classes_status_check", sql`(status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])`),
]);

export const classMembers = pgTable("class_members", {
	id: uuid().primaryKey().notNull(),
	classId: uuid("class_id").notNull(),
	studentId: uuid("student_id").notNull(),
	enrolledBy: uuid("enrolled_by").notNull(),
	enrolledAt: timestamp("enrolled_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_cmember_student").using("btree", table.studentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "fk_cmember_class"
		}).onDelete("cascade"),
	unique("ux_cmember_pair").on(table.classId, table.studentId),
]);

export const announcements = pgTable("announcements", {
	id: uuid().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	classId: uuid("class_id").notNull(),
	title: varchar({ length: 200 }).notNull(),
	body: text().notNull(),
	category: varchar({ length: 20 }).default('GENERAL').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_ann_class_recent").using("btree", table.classId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "fk_ann_class"
		}).onDelete("cascade"),
	check("announcements_category_check", sql`(category)::text = ANY ((ARRAY['GENERAL'::character varying, 'HOMEWORK'::character varying, 'NOTICE'::character varying, 'EXAM_REMINDER'::character varying, 'RESOURCE'::character varying])::text[])`),
]);

export const assignments = pgTable("assignments", {
	id: uuid().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	courseSlug: varchar("course_slug", { length: 64 }).notNull(),
	courseLabel: varchar("course_label", { length: 120 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	specRefs: jsonb("spec_refs").notNull(),
	marksTotal: integer("marks_total").notNull(),
	questionCount: integer("question_count").notNull(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: varchar({ length: 16 }).default('OPEN').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	classId: uuid("class_id"),
}, (table) => [
	index("ix_as_class").using("btree", table.classId.asc().nullsLast().op("uuid_ops")),
	index("ix_as_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("ix_as_teacher").using("btree", table.teacherId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "assignments_class_id_fkey"
		}).onDelete("set null"),
	check("assignments_marks_total_check", sql`marks_total >= 1`),
	check("assignments_question_count_check", sql`question_count >= 1`),
	check("assignments_status_check", sql`(status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[])`),
]);

export const examSeries = pgTable("exam_series", {
	id: uuid().primaryKey().notNull(),
	board: varchar({ length: 50 }).notNull(),
	qualification: varchar({ length: 50 }).notNull(),
	seriesCode: varchar("series_code", { length: 60 }).notNull(),
	label: varchar({ length: 120 }).notNull(),
	windowStart: date("window_start").notNull(),
	windowEnd: date("window_end").notNull(),
	entryDeadline: date("entry_deadline"),
	resultsDate: date("results_date"),
	published: boolean().default(true).notNull(),
	estimated: boolean().default(false).notNull(),
	sourceUrl: varchar("source_url", { length: 500 }).notNull(),
	retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_exam_series_lookup").using("btree", table.board.asc().nullsLast().op("date_ops"), table.qualification.asc().nullsLast().op("text_ops"), table.published.asc().nullsLast().op("date_ops"), table.windowStart.asc().nullsLast().op("text_ops")),
	unique("uq_exam_series").on(table.board, table.qualification, table.seriesCode),
	check("ck_exam_series_window", sql`window_end >= window_start`),
]);

export const learnerCourseEnrolments = pgTable("learner_course_enrolments", {
	id: uuid().primaryKey().notNull(),
	learnerId: uuid("learner_id").notNull(),
	courseSlug: varchar("course_slug", { length: 100 }).notNull(),
	targetSeriesId: uuid("target_series_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_learner_course_enrolment_series").using("btree", table.targetSeriesId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.targetSeriesId],
			foreignColumns: [examSeries.id],
			name: "learner_course_enrolments_target_series_id_fkey"
		}),
	unique("uq_learner_course_enrolment").on(table.courseSlug, table.learnerId),
]);

export const teachingCoverageEvents = pgTable("teaching_coverage_events", {
	id: uuid().primaryKey().notNull(),
	classId: uuid("class_id").notNull(),
	specPointNodeId: uuid("spec_point_node_id").notNull(),
	status: varchar({ length: 16 }).notNull(),
	previousStatus: varchar("previous_status", { length: 16 }),
	actorId: uuid("actor_id").notNull(),
	note: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("ix_tcov_event_point").using("btree", table.classId.asc().nullsLast().op("uuid_ops"), table.specPointNodeId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "teaching_coverage_events_class_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.specPointNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "teaching_coverage_events_spec_point_node_id_fkey"
		}),
	check("ck_tcov_event_prev", sql`(previous_status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])`),
	check("ck_tcov_event_status", sql`(status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])`),
]);

export const userRoles = pgTable("user_roles", {
	userId: uuid("user_id").notNull(),
	role: varchar({ length: 16 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.role],
			foreignColumns: [roles.name],
			name: "user_roles_role_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_roles_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.role, table.userId], name: "user_roles_pkey"}),
]);

export const announcementReads = pgTable("announcement_reads", {
	announcementId: uuid("announcement_id").notNull(),
	studentId: uuid("student_id").notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.announcementId],
			foreignColumns: [announcements.id],
			name: "fk_ann_read_ann"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.announcementId, table.studentId], name: "pk_ann_read"}),
]);

export const teachingCoverage = pgTable("teaching_coverage", {
	classId: uuid("class_id").notNull(),
	specPointNodeId: uuid("spec_point_node_id").notNull(),
	status: varchar({ length: 16 }).notNull(),
	markedBy: uuid("marked_by").notNull(),
	markedAt: timestamp("marked_at", { withTimezone: true, mode: 'string' }).notNull(),
	note: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "teaching_coverage_class_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.specPointNodeId],
			foreignColumns: [knowledgeNodes.id],
			name: "teaching_coverage_spec_point_node_id_fkey"
		}),
	primaryKey({ columns: [table.classId, table.specPointNodeId], name: "teaching_coverage_pkey"}),
	check("ck_tcov_status", sql`(status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])`),
]);
