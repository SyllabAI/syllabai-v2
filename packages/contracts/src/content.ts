/**
 * Content-domain contracts — Wave 2 read surfaces (T-MIG-020).
 *
 * SOURCES (frozen core @ 6cad6ef, read-only):
 *   content/ContentDocumentController.java   — DocumentSummaryView:199,
 *     ChunkHitView:218, EmbeddingView:214, EMPTY_CAUSE_HEADER:45
 *   content/ContentReaderController.java     — CitationDocumentView:117,
 *     PaperRef:135
 *   teacher/ContentController.java           — ReviewQueueView:303,
 *     PaperSummary:307, DocumentIdentity:162, PaperProvenanceView:167
 *   teacher/ContentReviewService.java        — EnrichedPaperSummary:845,
 *     EnrichedReviewQueueView:845, EnrichedReviewQueueViewV3:686,
 *     AuditRowView:823, TopicRowView:801
 *   content/Document.java                    — Kind enum:28
 *   content/SearchEmptyCause.java            — header cause values:18
 *
 * These are RESPONSE-VIEW contracts (server-built records): fields are
 * pinned so golden replay and the hub's typed client compile against the
 * same shapes. Jackson serialization parity notes per field where the Java
 * representation differs from the wire form (Instant → ISO-8601 string via
 * JSR-310; enum → name(); UUID → string; Long → JSON number).
 */
import { z } from "zod";

/** Document.Kind names (Document.java:28-32). */
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

/** SearchEmptyCause names that ride X-Search-Empty-Cause on EMPTY search results
 *  (SearchEmptyCause.java:18+; the runner does NOT compare headers (T-MIG-004
 *  F-3) but the port must still emit them — T-C31). */
export const searchEmptyCauseSchema = z.enum([
  "SCOPE_UNRESOLVED",
  "COURSE_REF_UNRESOLVED",
  "NO_CHUNKS",
  "NO_EMBEDDED_CHUNKS",
  "NO_SERVING_ELIGIBLE",
]);
export type SearchEmptyCause = z.infer<typeof searchEmptyCauseSchema>;

/** ContentDocumentController.DocumentSummaryView:199-212.
 *  title = fileName ?? sourceUri (the controller's from(), :207). */
export const documentSummaryViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  docVersion: z.number().int(),
  kind: documentKindSchema,
  title: z.string(),
  pageCount: z.number().int(),
  elementCount: z.number().int(),
  textElementCount: z.number().int(),
  chunkCount: z.number().int(),
  sourceEngine: z.string(),
  sourceEngineVersion: z.string(),
  checksum: z.string(),
  createdAt: z.string(), // Instant → ISO-8601 (JSR-310)
});
export type DocumentSummaryView = z.infer<typeof documentSummaryViewSchema>;

/** ContentDocumentController.ChunkHitView:218-227. */
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
  score: z.number(), // double — never golden-gated (embedding-dependent path)
});
export type ChunkHitView = z.infer<typeof chunkHitViewSchema>;

/** ContentDocumentController.EmbeddingView:214-216. Emitted only when an
 *  embedding provider is configured (requireProvider passes); provider-less
 *  boots 500 before this shape can be built (capture evidence). */
export const embeddingViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  model: z.string(),
  embedded: z.number().int(),
  skipped: z.number().int(),
  totalChunks: z.number().int(),
});
export type EmbeddingView = z.infer<typeof embeddingViewSchema>;

/** ContentReaderController.PaperRef:135 — QP/MS paper identity behind a
 *  citation; role is "QP" or "MS" by construction (:93). */
export const paperRefSchema = z.object({
  paperId: z.string().uuid(),
  paperCode: z.string(),
  sessionLabel: z.string(),
  role: z.enum(["QP", "MS"]),
});
export type PaperRef = z.infer<typeof paperRefSchema>;

/** ContentReaderController.CitationDocumentView:117-126. One record, two
 *  shapes: header (page/text null) vs page drill-in; paper null for
 *  non-paper rows. */
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

/** ContentController.PaperSummary:307-316. subjectId is a nullable UUID in
 *  the entity (ExamPaper.java:34) — null until placed. */
export const paperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  title: z.string(),
  paperCode: z.string(),
  sessionLabel: z.string(),
  board: z.string(),
  qualification: z.string(),
  validationState: z.enum(["SUGGESTED", "VALIDATED", "REJECTED", "FLAGGED"]),
});
export type PaperSummary = z.infer<typeof paperSummarySchema>;

/** ContentController.ReviewQueueView:303-305 (v1 queue). */
export const reviewQueueViewSchema = z.object({
  papers: z.array(paperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type ReviewQueueView = z.infer<typeof reviewQueueViewSchema>;

/** ContentReviewService.EnrichedPaperSummary:845-861 (v2 per-paper signals).
 *  Long counters → JSON numbers; avgExtractionConfidence Double → nullable. */
export const enrichedPaperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  title: z.string(),
  paperCode: z.string(),
  sessionLabel: z.string(),
  board: z.string(),
  qualification: z.string(),
  validationState: z.enum(["SUGGESTED", "VALIDATED", "REJECTED", "FLAGGED"]),
  versionCount: z.number().int(),
  validatedVersions: z.number().int(),
  rejectedVersions: z.number().int(),
  flaggedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  reconciliationStatus: z.string(),
  findingCount: z.number().int(),
  avgExtractionConfidence: z.number().nullable(),
  createdAt: z.string(), // Instant → ISO-8601
});
export type EnrichedPaperSummary = z.infer<typeof enrichedPaperSummarySchema>;

/** ContentReviewService.EnrichedReviewQueueView:845 (v2 queue). */
export const enrichedReviewQueueViewSchema = z.object({
  papers: z.array(enrichedPaperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type EnrichedReviewQueueView = z.infer<typeof enrichedReviewQueueViewSchema>;

/** ContentReviewService.EnrichedPaperSummaryV3 — the v2 summary plus the
 *  §7 linkage/coverage/novel signals and rank reasons (from() tail at
 *  :680-689; reasons are human-legible rank explanations, deterministic). */
export const enrichedPaperSummaryV3Schema = enrichedPaperSummarySchema.extend({
  totalQuestions: z.number().int(),
  mappedQuestions: z.number().int(),
  withScheme: z.number().int(),
  novelTopicCount: z.number().int(),
  reasons: z.array(z.string()),
});
export type EnrichedPaperSummaryV3 = z.infer<typeof enrichedPaperSummaryV3Schema>;

/** ContentReviewService.EnrichedReviewQueueViewV3:686-690. */
export const enrichedReviewQueueViewV3Schema = z.object({
  papers: z.array(enrichedPaperSummaryV3Schema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  practicableTopicCount: z.number().int(),
});
export type EnrichedReviewQueueViewV3 = z.infer<typeof enrichedReviewQueueViewV3Schema>;

/** ContentReviewService.AuditRowView:823-831 (V22 durable audit projection;
 *  occurredAt/fromState/toState/detail all nullable in the entity). */
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

/** ContentReviewService.TopicRowView:801 (code/title null when the node row
 *  vanished — the service maps null explicitly). */
export const topicRowViewSchema = z.object({
  nodeId: z.string().uuid(),
  primary: z.boolean(),
  code: z.string().nullable(),
  title: z.string().nullable(),
});
export type TopicRowView = z.infer<typeof topicRowViewSchema>;

/** ContentController.DocumentIdentity:162-164 + PaperProvenanceView:167-169
 *  (source identity of one ingested QP/MS pair; never mutated post-ingestion). */
export const documentIdentitySchema = z.object({
  documentId: z.string(),
  fileName: z.string().nullable(), // entity field is nullable — Jackson sends null
  sourceUri: z.string(),
  checksum: z.string(),
  checksumAlgorithm: z.string(),
});
export type DocumentIdentity = z.infer<typeof documentIdentitySchema>;

export const paperProvenanceViewSchema = z.object({
  paperId: z.string().uuid(),
  questionPaper: documentIdentitySchema,
  markScheme: documentIdentitySchema,
});
export type PaperProvenanceView = z.infer<typeof paperProvenanceViewSchema>;

/** GET /api/v1/teacher/content/documents/search query params
 *  (ContentDocumentController.java:134-139): query @NotBlank (Spring Boot 4
 *  built-in method validation fires it — blank → HandlerMethodValidation-
 *  Exception → unmapped → 500 internal_error, capture-pinned; MISSING →
 *  400 validation_failed "missing required parameter: query"); kind optional
 *  enum; limit default 10; courseRef optional (blank-treated-as-absent at
 *  the service layer, :140). */
export const documentSearchQuerySchema = z.object({
  query: z.string(),
  kind: documentKindSchema.nullish(),
  limit: z.coerce.number().int().default(10),
  courseRef: z.string().nullish(),
});
export type DocumentSearchQuery = z.infer<typeof documentSearchQuerySchema>;
