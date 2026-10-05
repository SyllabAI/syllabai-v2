import { relations } from "drizzle-orm/relations";
import { curriculumVersions, subjects, knowledgeNodes, knowledgeEdges, users, misconceptionStates, telemetryEvents, questions, questionTopics, questionOptions, questionVersions, markSchemes, attempts, examPapers, questionParts, markPoints, answers, smartMarkResults, skillStates, humanMarks, smartMarkAgreementEvaluations, struggleInferences, reviewSchedules, interventionRun, interventionRunStep, interventionRunEvidence, revisionNoteViewed, bootstrapAdminState, questionSpecPoints, documents, documentChunks, learnerSelfMarks, tutorTopicEngagements, contentReviewAudit, glmOcrBridgeRecords, tutorSessions, tutorSessionTurns, classes, classMembers, announcements, assignments, examSeries, learnerCourseEnrolments, teachingCoverageEvents, roles, userRoles, announcementReads, teachingCoverage } from "./schema";

export const subjectsRelations = relations(subjects, ({one, many}) => ({
	curriculumVersion: one(curriculumVersions, {
		fields: [subjects.curriculumVersionId],
		references: [curriculumVersions.id]
	}),
	examPapers: many(examPapers),
	documentChunks: many(documentChunks),
}));

export const curriculumVersionsRelations = relations(curriculumVersions, ({many}) => ({
	subjects: many(subjects),
}));

export const knowledgeEdgesRelations = relations(knowledgeEdges, ({one}) => ({
	knowledgeNode_sourceNodeId: one(knowledgeNodes, {
		fields: [knowledgeEdges.sourceNodeId],
		references: [knowledgeNodes.id],
		relationName: "knowledgeEdges_sourceNodeId_knowledgeNodes_id"
	}),
	knowledgeNode_targetNodeId: one(knowledgeNodes, {
		fields: [knowledgeEdges.targetNodeId],
		references: [knowledgeNodes.id],
		relationName: "knowledgeEdges_targetNodeId_knowledgeNodes_id"
	}),
}));

export const knowledgeNodesRelations = relations(knowledgeNodes, ({many}) => ({
	knowledgeEdges_sourceNodeId: many(knowledgeEdges, {
		relationName: "knowledgeEdges_sourceNodeId_knowledgeNodes_id"
	}),
	knowledgeEdges_targetNodeId: many(knowledgeEdges, {
		relationName: "knowledgeEdges_targetNodeId_knowledgeNodes_id"
	}),
	struggleInferences: many(struggleInferences),
	questionSpecPoints: many(questionSpecPoints),
	teachingCoverageEvents: many(teachingCoverageEvents),
	teachingCoverages: many(teachingCoverage),
}));

export const misconceptionStatesRelations = relations(misconceptionStates, ({one}) => ({
	user: one(users, {
		fields: [misconceptionStates.learnerId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	misconceptionStates: many(misconceptionStates),
	telemetryEvents: many(telemetryEvents),
	attempts: many(attempts),
	skillStates: many(skillStates),
	struggleInferences_learnerId: many(struggleInferences, {
		relationName: "struggleInferences_learnerId_users_id"
	}),
	struggleInferences_overriddenBy: many(struggleInferences, {
		relationName: "struggleInferences_overriddenBy_users_id"
	}),
	reviewSchedules: many(reviewSchedules),
	revisionNoteVieweds: many(revisionNoteViewed),
	bootstrapAdminStates: many(bootstrapAdminState),
	interventionRuns: many(interventionRun),
	learnerSelfMarks: many(learnerSelfMarks),
	tutorTopicEngagements: many(tutorTopicEngagements),
	contentReviewAudits: many(contentReviewAudit),
	tutorSessions: many(tutorSessions),
	userRoles: many(userRoles),
}));

export const telemetryEventsRelations = relations(telemetryEvents, ({one}) => ({
	user: one(users, {
		fields: [telemetryEvents.learnerId],
		references: [users.id]
	}),
}));

export const questionTopicsRelations = relations(questionTopics, ({one}) => ({
	question: one(questions, {
		fields: [questionTopics.questionId],
		references: [questions.id]
	}),
}));

export const questionsRelations = relations(questions, ({one, many}) => ({
	questionTopics: many(questionTopics),
	questionOptions: many(questionOptions),
	attempts: many(attempts),
	questionVersions: many(questionVersions),
	examPaper: one(examPapers, {
		fields: [questions.examPaperId],
		references: [examPapers.id]
	}),
	questionSpecPoints: many(questionSpecPoints),
}));

export const questionOptionsRelations = relations(questionOptions, ({one}) => ({
	question: one(questions, {
		fields: [questionOptions.questionId],
		references: [questions.id]
	}),
}));

export const markSchemesRelations = relations(markSchemes, ({one, many}) => ({
	questionVersion: one(questionVersions, {
		fields: [markSchemes.questionVersionId],
		references: [questionVersions.id]
	}),
	markPoints: many(markPoints),
	smartMarkResults: many(smartMarkResults),
}));

export const questionVersionsRelations = relations(questionVersions, ({one, many}) => ({
	markSchemes: many(markSchemes),
	question: one(questions, {
		fields: [questionVersions.questionId],
		references: [questions.id]
	}),
	questionParts: many(questionParts),
}));

export const attemptsRelations = relations(attempts, ({one, many}) => ({
	user: one(users, {
		fields: [attempts.learnerId],
		references: [users.id]
	}),
	question: one(questions, {
		fields: [attempts.questionId],
		references: [questions.id]
	}),
	answers: many(answers),
}));

export const examPapersRelations = relations(examPapers, ({one, many}) => ({
	subject: one(subjects, {
		fields: [examPapers.subjectId],
		references: [subjects.id]
	}),
	smartMarkAgreementEvaluations: many(smartMarkAgreementEvaluations),
	questions: many(questions),
	glmOcrBridgeRecords: many(glmOcrBridgeRecords),
}));

export const questionPartsRelations = relations(questionParts, ({one, many}) => ({
	questionVersion: one(questionVersions, {
		fields: [questionParts.questionVersionId],
		references: [questionVersions.id]
	}),
	markPoints: many(markPoints),
	answers: many(answers),
}));

export const markPointsRelations = relations(markPoints, ({one}) => ({
	markScheme: one(markSchemes, {
		fields: [markPoints.markSchemeId],
		references: [markSchemes.id]
	}),
	questionPart: one(questionParts, {
		fields: [markPoints.questionPartId],
		references: [questionParts.id]
	}),
}));

export const answersRelations = relations(answers, ({one, many}) => ({
	attempt: one(attempts, {
		fields: [answers.attemptId],
		references: [attempts.id]
	}),
	questionPart: one(questionParts, {
		fields: [answers.questionPartId],
		references: [questionParts.id]
	}),
	smartMarkResults: many(smartMarkResults),
	humanMarks: many(humanMarks),
	learnerSelfMarks: many(learnerSelfMarks),
}));

export const smartMarkResultsRelations = relations(smartMarkResults, ({one}) => ({
	answer: one(answers, {
		fields: [smartMarkResults.answerId],
		references: [answers.id]
	}),
	markScheme: one(markSchemes, {
		fields: [smartMarkResults.markSchemeId],
		references: [markSchemes.id]
	}),
}));

export const skillStatesRelations = relations(skillStates, ({one}) => ({
	user: one(users, {
		fields: [skillStates.learnerId],
		references: [users.id]
	}),
}));

export const humanMarksRelations = relations(humanMarks, ({one}) => ({
	answer: one(answers, {
		fields: [humanMarks.answerId],
		references: [answers.id]
	}),
}));

export const smartMarkAgreementEvaluationsRelations = relations(smartMarkAgreementEvaluations, ({one}) => ({
	examPaper: one(examPapers, {
		fields: [smartMarkAgreementEvaluations.examPaperId],
		references: [examPapers.id]
	}),
}));

export const struggleInferencesRelations = relations(struggleInferences, ({one}) => ({
	user_learnerId: one(users, {
		fields: [struggleInferences.learnerId],
		references: [users.id],
		relationName: "struggleInferences_learnerId_users_id"
	}),
	user_overriddenBy: one(users, {
		fields: [struggleInferences.overriddenBy],
		references: [users.id],
		relationName: "struggleInferences_overriddenBy_users_id"
	}),
	knowledgeNode: one(knowledgeNodes, {
		fields: [struggleInferences.topicNodeId],
		references: [knowledgeNodes.id]
	}),
}));

export const reviewSchedulesRelations = relations(reviewSchedules, ({one}) => ({
	user: one(users, {
		fields: [reviewSchedules.learnerId],
		references: [users.id]
	}),
}));

export const interventionRunStepRelations = relations(interventionRunStep, ({one}) => ({
	interventionRun: one(interventionRun, {
		fields: [interventionRunStep.runId],
		references: [interventionRun.runId]
	}),
}));

export const interventionRunRelations = relations(interventionRun, ({one, many}) => ({
	interventionRunSteps: many(interventionRunStep),
	interventionRunEvidences: many(interventionRunEvidence),
	user: one(users, {
		fields: [interventionRun.learnerId],
		references: [users.id]
	}),
}));

export const interventionRunEvidenceRelations = relations(interventionRunEvidence, ({one}) => ({
	interventionRun: one(interventionRun, {
		fields: [interventionRunEvidence.runId],
		references: [interventionRun.runId]
	}),
}));

export const revisionNoteViewedRelations = relations(revisionNoteViewed, ({one}) => ({
	user: one(users, {
		fields: [revisionNoteViewed.userId],
		references: [users.id]
	}),
}));

export const bootstrapAdminStateRelations = relations(bootstrapAdminState, ({one}) => ({
	user: one(users, {
		fields: [bootstrapAdminState.claimedBy],
		references: [users.id]
	}),
}));

export const questionSpecPointsRelations = relations(questionSpecPoints, ({one}) => ({
	question: one(questions, {
		fields: [questionSpecPoints.questionId],
		references: [questions.id]
	}),
	knowledgeNode: one(knowledgeNodes, {
		fields: [questionSpecPoints.specPointNodeId],
		references: [knowledgeNodes.id]
	}),
}));

export const documentChunksRelations = relations(documentChunks, ({one}) => ({
	document: one(documents, {
		fields: [documentChunks.documentRowId],
		references: [documents.id]
	}),
	subject: one(subjects, {
		fields: [documentChunks.subjectId],
		references: [subjects.id]
	}),
}));

export const documentsRelations = relations(documents, ({many}) => ({
	documentChunks: many(documentChunks),
}));

export const learnerSelfMarksRelations = relations(learnerSelfMarks, ({one}) => ({
	answer: one(answers, {
		fields: [learnerSelfMarks.answerId],
		references: [answers.id]
	}),
	user: one(users, {
		fields: [learnerSelfMarks.learnerId],
		references: [users.id]
	}),
}));

export const tutorTopicEngagementsRelations = relations(tutorTopicEngagements, ({one}) => ({
	user: one(users, {
		fields: [tutorTopicEngagements.learnerId],
		references: [users.id]
	}),
}));

export const contentReviewAuditRelations = relations(contentReviewAudit, ({one}) => ({
	user: one(users, {
		fields: [contentReviewAudit.actorUserId],
		references: [users.id]
	}),
}));

export const glmOcrBridgeRecordsRelations = relations(glmOcrBridgeRecords, ({one}) => ({
	examPaper: one(examPapers, {
		fields: [glmOcrBridgeRecords.paperId],
		references: [examPapers.id]
	}),
}));

export const tutorSessionTurnsRelations = relations(tutorSessionTurns, ({one}) => ({
	tutorSession: one(tutorSessions, {
		fields: [tutorSessionTurns.sessionId],
		references: [tutorSessions.id]
	}),
}));

export const tutorSessionsRelations = relations(tutorSessions, ({one, many}) => ({
	tutorSessionTurns: many(tutorSessionTurns),
	user: one(users, {
		fields: [tutorSessions.learnerId],
		references: [users.id]
	}),
}));

export const classMembersRelations = relations(classMembers, ({one}) => ({
	class: one(classes, {
		fields: [classMembers.classId],
		references: [classes.id]
	}),
}));

export const classesRelations = relations(classes, ({many}) => ({
	classMembers: many(classMembers),
	announcements: many(announcements),
	assignments: many(assignments),
	teachingCoverageEvents: many(teachingCoverageEvents),
	teachingCoverages: many(teachingCoverage),
}));

export const announcementsRelations = relations(announcements, ({one, many}) => ({
	class: one(classes, {
		fields: [announcements.classId],
		references: [classes.id]
	}),
	announcementReads: many(announcementReads),
}));

export const assignmentsRelations = relations(assignments, ({one}) => ({
	class: one(classes, {
		fields: [assignments.classId],
		references: [classes.id]
	}),
}));

export const learnerCourseEnrolmentsRelations = relations(learnerCourseEnrolments, ({one}) => ({
	examSery: one(examSeries, {
		fields: [learnerCourseEnrolments.targetSeriesId],
		references: [examSeries.id]
	}),
}));

export const examSeriesRelations = relations(examSeries, ({many}) => ({
	learnerCourseEnrolments: many(learnerCourseEnrolments),
}));

export const teachingCoverageEventsRelations = relations(teachingCoverageEvents, ({one}) => ({
	class: one(classes, {
		fields: [teachingCoverageEvents.classId],
		references: [classes.id]
	}),
	knowledgeNode: one(knowledgeNodes, {
		fields: [teachingCoverageEvents.specPointNodeId],
		references: [knowledgeNodes.id]
	}),
}));

export const userRolesRelations = relations(userRoles, ({one}) => ({
	role: one(roles, {
		fields: [userRoles.role],
		references: [roles.name]
	}),
	user: one(users, {
		fields: [userRoles.userId],
		references: [users.id]
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	userRoles: many(userRoles),
}));

export const announcementReadsRelations = relations(announcementReads, ({one}) => ({
	announcement: one(announcements, {
		fields: [announcementReads.announcementId],
		references: [announcements.id]
	}),
}));

export const teachingCoverageRelations = relations(teachingCoverage, ({one}) => ({
	class: one(classes, {
		fields: [teachingCoverage.classId],
		references: [classes.id]
	}),
	knowledgeNode: one(knowledgeNodes, {
		fields: [teachingCoverage.specPointNodeId],
		references: [knowledgeNodes.id]
	}),
}));