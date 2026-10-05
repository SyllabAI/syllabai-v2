/**
 * Content read-surface contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen; ported by T-MIG-020, verified
 * 2026-10-05):
 *   src/main/java/com/syllabai/content/ContentDocumentController.java   (views)
 *   src/main/java/com/syllabai/content/ContentReaderController.java     (views)
 *   src/main/java/com/syllabai/content/DocumentRepository.java          (kind enum)
 *   src/main/java/com/syllabai/sme/QuestionAssetController.java         (binary)
 *   src/main/java/com/syllabai/teacher/ContentController.java           (views)
 *   src/main/java/com/syllabai/teacher/ContentReviewService.java        (views)
 *
 * Wire facts verified in the frozen sources (T-MIG-020 evidence):
 *   - Document.Kind (DocumentRepository.java check + documents ck constraint):
 *     exactly { QUESTION_PAPER, MARK_SCHEME, SYLLABUS, OTHER, TEXTBOOK,
 *     EXTERNAL_NOTES, EXTERNAL_QUESTIONS }.
 *   - ValidationState (exam_papers / question_versions / mark_schemes /
 *     documents ck constraints): exactly { SUGGESTED, VALIDATED, REJECTED,
 *     FLAGGED }.
 *   - Java records serialize component names as-is; nullable Java types
 *     (paperCode, sessionLabel, fileName, reconciliationStatus,
 *     avgExtractionConfidence, ...) map to `|null` here — NEVER optional
 *     (`.optional()`): Jackson writes nulls for null record components, it
 *     does not omit them. A missing key on the wire would be a divergence.
 *   - Instant fields (createdAt, occurredAt) render via Jackson JSR-310 as
 *     ISO-8601 with up to nanosecond precision ("…T19:02:17.282858846Z").
 *     JS Date.toISOString() caps at milliseconds; the api port formats
 *     timestamps through its own ISO writer. Golden tolerance treats these
 *     as volatile fields until a real-data capture says otherwise.
 *   - READ-surface request binding (search): `query` is @NotBlank in Java
 *     but the captured behaviour (T-MIG-004 F-2, case
 *     content-docs-search-blank-query-500) is: ABSENT → 400 validation_failed
 *     "missing required parameter: query"; PRESENT-BUT-BLANK → 500
 *     internal_error. The route layer reproduces those captured outcomes —
 *     the schema below documents the domain shape, it does not pre-empt the
 *     captured binding behaviour (never widen to make a case pass; never
 *     "fix" a captured divergence silently).
 *   - `limit` binds as int (non-integer → 400 malformed request,
 *     MethodArgumentTypeMismatchException parity) and is clamped 1..50 by
 *     ContentRetrievalService.MAX_LIMIT (Math.clamp parity, Java:55).
 */
import { z } from "zod";

/** Document.Kind — documents.kind ck constraint (baseline schema.ts:802). */
export const documentKindSchema = z.enum([
  "QUESTION_PAPER",
  "MARK_SCHEME",
  "SYLLABUS",
  "OTHER",
  "TEXTBOOK",
  "EXTERNAL_NOTES",
  "EXTERNAL_QUESTIONS",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** ValidationState — the four-state ck constraint shared by the content tables. */
export const validationStateSchema = z.enum([
  "SUGGESTED",
  "VALIDATED",
  "REJECTED",
  "FLAGGED",
]);
export type ValidationState = z.infer<typeof validationStateSchema>;

/** ContentDocumentController.DocumentSummaryView (:199-212). */
export const documentSummaryViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  docVersion: z.number().int(),
  kind: documentKindSchema,
  /** Java: d.fileName() == null ? d.sourceUri() : d.fileName() */
  title: z.string(),
  pageCount: z.number().int(),
  elementCount: z.number().int(),
  textElementCount: z.number().int(),
  chunkCount: z.number().int(),
  sourceEngine: z.string(),
  sourceEngineVersion: z.string(),
  checksum: z.string(),
  createdAt: z.string(),
});
export type DocumentSummaryView = z.infer<typeof documentSummaryViewSchema>;

/** ContentDocumentController.ChunkHitView (:218-227). */
export const chunkHitViewSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string(),
  kind: documentKindSchema,
  chunkIndex: z.number().int(),
  content: z.string(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  elementIds: z.array(z.string()),
  embeddingModel: z.string(),
  score: z.number(),
});
export type ChunkHitView = z.infer<typeof chunkHitViewSchema>;

/** ContentReaderController.PaperRef (:135) — F-022 tranche 2 paper identity. */
export const paperRefSchema = z.object({
  paperId: z.string().uuid(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  role: z.enum(["QP", "MS"]),
});
export type PaperRef = z.infer<typeof paperRefSchema>;

/** ContentReaderController.CitationDocumentView (:117-126). */
export const citationDocumentViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  docVersion: z.number().int(),
  kind: documentKindSchema,
  title: z.string(),
  pageCount: z.number().int(),
  page: z.number().int().nullable(),
  text: z.string().nullable(),
  paper: paperRefSchema.nullable(),
});
export type CitationDocumentView = z.infer<typeof citationDocumentViewSchema>;

/** ContentController.PaperSummary (:307-309). */
export const paperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  board: z.string(),
  qualification: z.string(),
  validationState: validationStateSchema,
});
export type PaperSummary = z.infer<typeof paperSummarySchema>;

/** ContentController.ReviewQueueView (:303-305) — review-queue v1. */
export const reviewQueueViewSchema = z.object({
  papers: z.array(paperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type ReviewQueueView = z.infer<typeof reviewQueueViewSchema>;

/** ContentReviewService.EnrichedPaperSummary (V20, baseEnrichment :569-587). */
export const enrichedPaperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  board: z.string(),
  qualification: z.string(),
  validationState: validationStateSchema,
  versionCount: z.number().int(),
  validatedVersions: z.number().int(),
  rejectedVersions: z.number().int(),
  flaggedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  /** GlmOcrBridgeRecord.reconciliationStatus — null when no bridge record. */
  reconciliationStatus: z.string().nullable(),
  findingCount: z.number().int(),
  avgExtractionConfidence: z.number().nullable(),
  createdAt: z.string(),
});
export type EnrichedPaperSummary = z.infer<typeof enrichedPaperSummarySchema>;

/** ContentReviewService.EnrichedReviewQueueView — review-queue v2. */
export const enrichedReviewQueueViewSchema = z.object({
  papers: z.array(enrichedPaperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type EnrichedReviewQueueView = z.infer<typeof enrichedReviewQueueViewSchema>;

/**
 * ContentReviewService.EnrichedPaperSummaryV3 (:679-703) — FLAT by design:
 * every v2 signal plus the §7 reviewability/value signals and rank reasons.
 */
export const enrichedPaperSummaryV3Schema = enrichedPaperSummarySchema.extend({
  totalQuestions: z.number().int(),
  mappedQuestions: z.number().int(),
  questionsWithScheme: z.number().int(),
  novelTopicCount: z.number().int(),
  rankReasons: z.array(z.string()),
});
export type EnrichedPaperSummaryV3 = z.infer<typeof enrichedPaperSummaryV3Schema>;

/** ContentReviewService.EnrichedReviewQueueViewV3 (:686-688) — queue v3. */
export const enrichedReviewQueueViewV3Schema = z.object({
  papers: z.array(enrichedPaperSummaryV3Schema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  practicableTopicCount: z.number().int(),
});
export type EnrichedReviewQueueViewV3 = z.infer<typeof enrichedReviewQueueViewV3Schema>;

/** ContentReviewService.TopicRowView (:770) — §10 question-topic mapping row. */
export const topicRowViewSchema = z.object({
  nodeId: z.string().uuid(),
  primary: z.boolean(),
  code: z.string().nullable(),
  title: z.string().nullable(),
});
export type TopicRowView = z.infer<typeof topicRowViewSchema>;

/** ContentReviewService.AuditRowView (:818-825) — V22 audit projection. */
export const auditRowViewSchema = z.object({
  occurredAt: z.string().nullable(),
  actor: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid(),
  fromState: z.string().nullable(),
  toState: z.string().nullable(),
  detail: z.string().nullable(),
});
export type AuditRowView = z.infer<typeof auditRowViewSchema>;

/** ContentController.DocumentIdentity (:162-163) — source identity of one document. */
export const documentIdentitySchema = z.object({
  documentId: z.string(),
  fileName: z.string().nullable(),
  sourceUri: z.string(),
  checksum: z.string(),
  checksumAlgorithm: z.string(),
});
export type DocumentIdentity = z.infer<typeof documentIdentitySchema>;

/** ContentController.PaperProvenanceView (:167-169). */
export const paperProvenanceViewSchema = z.object({
  paperId: z.string().uuid(),
  questionPaper: documentIdentitySchema,
  markScheme: documentIdentitySchema,
});
export type PaperProvenanceView = z.infer<typeof paperProvenanceViewSchema>;

/** ContentReviewService.PaperReviewView.PaperHeader (:919-922). */
export const paperReviewHeaderSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  board: z.string(),
  qualification: z.string(),
  validationState: validationStateSchema,
});

/** ContentReviewService.VersionReviewView.PointReview (:941-943). */
export const pointReviewSchema = z.object({
  id: z.string().uuid(),
  ref: z.string().nullable(),
  text: z.string(),
  marks: z.number().int(),
  acceptanceCriteria: z.array(z.string()),
});

/** ContentReviewService.VersionReviewView.OptionReview (:934-936) — teacher-only. */
export const optionReviewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  text: z.string(),
  correct: z.boolean(),
  misconceptionNodeId: z.string().uuid().nullable(),
});

/** ContentReviewService.VersionReviewView.PartReview (:938-940). */
export const partReviewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  prompt: z.string(),
  commandWord: z.string().nullable(),
  marks: z.number().int(),
});

/** ContentReviewService.VersionReviewView (:925-931). */
export const versionReviewViewSchema = z.object({
  versionId: z.string().uuid(),
  questionId: z.string().uuid(),
  externalRef: z.string().nullable(),
  type: z.string().nullable(),
  stem: z.string(),
  marks: z.number().int(),
  version: z.number().int(),
  validationState: validationStateSchema,
  commandWord: z.string().nullable(),
  schemeId: z.string().uuid().nullable(),
  schemeState: validationStateSchema.nullable(),
  points: z.array(pointReviewSchema),
  options: z.array(optionReviewSchema),
  parts: z.array(partReviewSchema),
  extractionConfidence: z.number().nullable(),
  extractionMethod: z.string().nullable(),
  sourceDocumentId: z.string().nullable(),
});
export type VersionReviewView = z.infer<typeof versionReviewViewSchema>;

/** ContentReviewService.PaperReviewView (:917-923) — full review of one paper. */
export const paperReviewViewSchema = z.object({
  paper: paperReviewHeaderSchema,
  versions: z.array(versionReviewViewSchema),
});
export type PaperReviewView = z.infer<typeof paperReviewViewSchema>;

/**
 * Search request binding (ContentDocumentController.search :134-139).
 * Domain shape only — the captured binding behaviours live at the route
 * layer (see file header): absent query → 400 validation_failed; blank
 * query → 500 (captured); bad kind/limit → 400 malformed request.
 */
export const searchRequestSchema = z.object({
  query: z.string(),
  kind: documentKindSchema.nullable().optional(),
  limit: z.number().int().nullable().optional(),
  courseRef: z.string().nullable().optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

/**
 * X-Search-Empty-Cause header values (SearchEmptyCause.java:18-55) — the
 * additive T-C31 observability header on EMPTY search results only. The
 * JSON body stays a bare array on every path.
 */
export const searchEmptyCauseSchema = z.enum([
  "SCOPE_UNRESOLVED",
  "COURSE_REF_UNRESOLVED",
  "SCOPE_EMPTY",
  "NOT_EMBEDDED",
  "EMBED_REV_EMPTY",
  "VALIDATION_GATE_EMPTY",
  "UNEXPECTED",
]);
export type SearchEmptyCause = z.infer<typeof searchEmptyCauseSchema>;
