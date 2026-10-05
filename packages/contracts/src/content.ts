/**
 * Wave-2 content-read contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen, verified 2026-10-05 by T-MIG-005):
 *   src/main/java/com/syllabai/content/ContentDocumentController.java
 *       (/api/v1/teacher/content/documents — list/get/canonical/search)
 *   src/main/java/com/syllabai/content/ContentReaderController.java
 *       (/api/v1/content/documents/{id} — the citation view)
 *   src/main/java/com/syllabai/sme/QuestionAssetController.java
 *       (/api/v1/content/question-assets/{filename} — binary surface)
 *   src/main/java/com/syllabai/teacher/ContentController.java
 *       (/api/v1/teacher/content — review queues v1/v2/v3, paper
 *        review/audit/provenance, question topic rows)
 *   src/main/java/com/syllabai/teacher/ContentReviewService.java
 *       (EnrichedPaperSummary{,V3}, EnrichedReviewQueueView{,V3},
 *        PaperReviewView, AuditRowView, TopicRowView)
 *   src/main/java/com/syllabai/content/Document.java:28      (Kind)
 *   src/main/java/com/syllabai/assessment/ExamPaper.java:26  (ValidationState)
 *   src/main/java/com/syllabai/assessment/Question.java:26   (Type)
 *
 * SCOPE (T-MIG-005, ratification requested in the PR): READ surfaces only —
 * MIGRATION_PLAN §5 Wave 2 ports "content/curriculum/question-asset read
 * surfaces". Write-flow request DTOs and their responses in the same
 * controllers (ingest / embed / validate / reject / place / flag / topics
 * mapping / mark-scheme criteria) are deliberately NOT ported here; they
 * belong to their owning waves' contracts tasks. Nothing below forbids a
 * later task from adding them to this file.
 *
 * Cross-checks: every 200/400/401/404 shape below that has a captured
 * golden case (T-MIG-004, 38 cases on main) was diffed against it; the
 * empty-state captures pin ReviewQueueView/EnrichedReviewQueueViewV3 and
 * the two error envelopes in errors.ts. The real-data tranche (documents
 * with ingested rows, review queues with SUGGESTED papers, embedded-chunk
 * search hits) is gated on T-MIG-004 F-5 (NEON_PAT unblock) — fields whose
 * nullability no capture proves carry a `nullability: capture-unproven`
 * tag and are the FIRST things to tighten when that tranche lands.
 *
 * Jackson wire facts (Boot defaults, no override in the frozen repo):
 *   - Responses are record serialization: every component is present;
 *     absent never happens, null does. So response schemas use
 *     `.nullable()` for plausible-null reference fields and never
 *     `.optional()`.
 *   - java.time.Instant serializes as an ISO-8601 string
 *     (jackson-datatype-jsr310, WRITE_DATES_AS_TIMESTAMPS disabled by
 *     Boot) — the same form the golden captures show in error bodies'
 *     `timestamp`.
 *   - jakarta @NotBlank on the search `query` param is mirrored by the
 *     shared notBlank refine (auth.ts precedent). CAPTURED DIVERGENCE
 *     (T-MIG-004 F-2): the deployed core returns 500 internal_error for a
 *     present-but-blank `query` (the annotation does not fire on that
 *     path). The schema keeps the DECLARED constraint; the divergence
 *     belongs to R0 + the T-MIG-020 port (do not silently "fix" either
 *     direction).
 */
import { z } from "zod";
import { notBlank } from "./auth";

/** Document.java:28-32 — Kind, valueOf is case-sensitive on the wire. */
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

/**
 * ExamPaper.java:26, QuestionVersion.java:35, MarkScheme.java:32 — three
 * byte-identical local enums; one shared schema (validationState().name()
 * is what every view below serializes).
 */
export const contentValidationStateSchema = z.enum([
  "SUGGESTED",
  "VALIDATED",
  "REJECTED",
  "FLAGGED",
]);
export type ContentValidationState = z.infer<typeof contentValidationStateSchema>;

/** Question.java:26 — MCQ end-to-end; STRUCTURED = multi-part (V8). */
export const questionTypeSchema = z.enum(["MCQ_SINGLE", "SHORT_ANSWER", "STRUCTURED"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

// ── query/path parameter binding (Spring @RequestParam semantics) ──────────

/**
 * Spring @RequestParam int/Integer binding, mirrored exactly:
 * StringToNumberConverterFactory → NumberUtils.parseNumber — ALL
 * whitespace is trimmed (" 1 0 " binds), optional sign + digits only
 * ("1e3"/"0x10"/"10.5" → 400), Integer.parseInt range (overflow → 400).
 * Non-string JSON numbers pass through for typed-client convenience (the
 * wire form is always a string). NaN from a failed parse is rejected by
 * z.number(), matching the converter's ConversionFailedException → 400.
 */
const int32Text = (s: string): number => {
  const t = s.replace(/\s+/g, "");
  if (!/^[+-]?\d+$/.test(t)) return NaN;
  const n = Number(t);
  return Math.abs(n) > 2147483647 ? NaN : n;
};
const javaIntParamSchema = z.preprocess(
  (v) => (typeof v === "string" ? int32Text(v) : v),
  z.number().int(),
);

/**
 * GET /api/v1/teacher/content/documents/search params.
 *
 * Java binding facts:
 *   query     @RequestParam @NotBlank String — REQUIRED (absent = 400,
 *             captured: content-docs-search-missing-query-400 — custom
 *             advice shape "validation_failed"); blank = declared-rejected
 *             (F-2 divergence note in the header).
 *   kind      optional Document.Kind — an unknown value fails enum
 *             conversion → 400 (valueOf is case-sensitive).
 *   limit     @RequestParam(defaultValue = "10") int — NO @Min/@Max, so no
 *             bounds are invented here; non-integer text fails int binding
 *             → 400. `limit=""` is a 400 for the primitive int (null
 *             cannot bind), mirrored by the NaN reject.
 *   courseRef optional String, unconstrained.
 */
export const contentSearchQuerySchema = z.object({
  query: z.string().refine(notBlank("must not be blank"), "must not be blank"),
  // Spring's StringToEnumConverterFactory TRIMS before valueOf (case-sensitive) —
  // a padded " QUESTION_PAPER " binds; "question_paper" fails conversion → 400.
  kind: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), documentKindSchema)
    .optional(),
  limit: z.preprocess((v) => (v === undefined ? "10" : v), javaIntParamSchema),
  courseRef: z.string().optional(),
});
export type ContentSearchQuery = z.infer<typeof contentSearchQuerySchema>;

/** UUID path variables — a non-uuid path segment fails binding → 400 (captured: curriculum-subject-bad-uuid-400). */
export const uuidPathSchema = z.string().uuid();

/** GET /api/v1/content/documents/{id} `page` param — boxed Integer: "" binds to null (absent-equivalent); non-integer text → 400 (binding). */
export const contentReaderPageParamSchema = z.preprocess(
  (v) => (v === "" ? undefined : v),
  javaIntParamSchema.optional(),
);
export type ContentReaderPageParam = z.infer<typeof contentReaderPageParamSchema>;

// ── ContentDocumentController views ────────────────────────────────────────

/**
 * DocumentSummaryView (ContentDocumentController.java:199-212) — serves
 * GET "" (list) and GET "/{id}". `title` is fileName, falling back to
 * sourceUri; `kind` is d.kind().name(); `createdAt` is
 * Instant.toString(). Fields the empty-state capture cannot prove
 * non-null carry the capture-unproven tag.
 */
export const documentSummaryViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  docVersion: z.number().int(),
  kind: documentKindSchema,
  title: z.string().nullable() /* nullability: capture-unproven (fileName ?? sourceUri) */,
  pageCount: z.number().int(),
  elementCount: z.number().int(),
  textElementCount: z.number().int(),
  chunkCount: z.number().int(),
  sourceEngine: z.string().nullable() /* nullability: capture-unproven */,
  sourceEngineVersion: z.string().nullable() /* nullability: capture-unproven */,
  checksum: z.string().nullable() /* nullability: capture-unproven */,
  createdAt: z.string() /* Instant.toString(), ISO-8601 */,
});
export type DocumentSummaryView = z.infer<typeof documentSummaryViewSchema>;

/**
 * ChunkHitView (ContentDocumentController.java:218-227) — search hit.
 * pageStart/pageEnd are Integers (null when the chunk has no page span).
 * The real-hits tranche is F-5-gated; shapes are record-derived.
 */
export const chunkHitViewSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string(),
  kind: documentKindSchema,
  chunkIndex: z.number().int(),
  content: z.string(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  elementIds: z.array(z.string()).nullable() /* nullability: capture-unproven */,
  embeddingModel: z.string().nullable() /* nullability: capture-unproven */,
  score: z.number(),
});
export type ChunkHitView = z.infer<typeof chunkHitViewSchema>;

/** GET …/search 200 body — List<ChunkHitView> (empty-state capture pins the []). */
export const contentSearchResponseSchema = z.array(chunkHitViewSchema);
export type ContentSearchResponse = z.infer<typeof contentSearchResponseSchema>;

/** GET …/documents (list) and GET …/documents/{id} bodies. */
export const documentListResponseSchema = z.array(documentSummaryViewSchema);
export const documentGetResponseSchema = documentSummaryViewSchema;

/**
 * GET …/documents/{id}/canonical — the stored canonical document JSON
 * serialized AS A JSON STRING (controller returns String with produces
 * application/json). Wire shape: a JSON document whose schema is the
 * ingested corpus's own (not a core DTO) — the contract is therefore
 * "a string containing parseable JSON", pinned, not invented.
 */
export const documentCanonicalResponseSchema = z
  .string()
  .refine((s) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }, "canonical body must be a JSON-encoded string");
export type DocumentCanonicalResponse = z.infer<typeof documentCanonicalResponseSchema>;

// ── ContentReaderController views ──────────────────────────────────────────

/**
 * PaperRef (ContentReaderController.java:135) — F-022 tranche 2: the
 * T-011 exam-paper identity of a paper citation. role is "QP" or "MS"
 * (javadoc: "which side of the pair this document is").
 */
export const paperRefSchema = z.object({
  paperId: z.string().uuid(),
  paperCode: z.string(),
  sessionLabel: z.string(),
  role: z.enum(["QP", "MS"]),
});
export type PaperRef = z.infer<typeof paperRefSchema>;

/**
 * CitationDocumentView (ContentReaderController.java:117-126) — GET
 * /api/v1/content/documents/{id}?page=N. page/text are null for the
 * header shape; paper is null for non-paper rows (javadoc: one record
 * keeps the deep-link a single fetch). The 200-with-real-text tranche is
 * F-5-gated (uncaptured); shape is record-derived.
 */
export const citationDocumentViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  docVersion: z.number().int(),
  kind: documentKindSchema,
  title: z.string().nullable() /* nullability: capture-unproven (fileName ?? sourceUri) */,
  pageCount: z.number().int(),
  page: z.number().int().nullable(),
  text: z.string().nullable(),
  paper: paperRefSchema.nullable(),
});
export type CitationDocumentView = z.infer<typeof citationDocumentViewSchema>;

// ── QuestionAssetController (binary surface, documented contract) ─────────

/**
 * GET /api/v1/content/question-assets/{filename} — ResponseEntity<byte[]>.
 * There is NO JSON view: 200 is binary asset bytes (image/* or
 * application/*), 404 on unknown filename has an EMPTY body (T-MIG-004
 * F-8 — golden case uses the runner's <non-json> sentinel), 401 the
 * Boot-default envelope (errors.ts bootDefaultErrorSchema). The filename
 * carries no declared constraints (@PathVariable String) — any
 * non-empty segment binds.
 */
export const questionAssetFilenameParamSchema = z.string().min(1);

// ── ContentController (/api/v1/teacher/content) read views ────────────────

/**
 * PaperSummary (ContentController.java:307-316) — queue row.
 * subjectId is null until §7 placement (PlaceRequest exists to set it);
 * the metadata strings' nullability for TEACHER_AUTHORED rows is
 * capture-unproven.
 */
export const paperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable() /* nullability: capture-unproven (unplaced papers) */,
  title: z.string(),
  paperCode: z.string().nullable() /* nullability: capture-unproven */,
  sessionLabel: z.string().nullable() /* nullability: capture-unproven */,
  board: z.string().nullable() /* nullability: capture-unproven */,
  qualification: z.string().nullable() /* nullability: capture-unproven */,
  validationState: contentValidationStateSchema,
});
export type PaperSummary = z.infer<typeof paperSummarySchema>;

/** ReviewQueueView (ContentController.java:303-305) — GET /review-queue (v1). */
export const reviewQueueViewSchema = z.object({
  papers: z.array(paperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type ReviewQueueView = z.infer<typeof reviewQueueViewSchema>;

/**
 * EnrichedPaperSummary (ContentReviewService.java:835-843) — GET
 * /review-queue-v2 row. Counts are longs (≤ 2^53 for any real corpus →
 * int-safe); avgExtractionConfidence is a boxed Double (null when no
 * extraction confidence exists). createdAt is Instant → ISO string.
 */
export const enrichedPaperSummarySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable() /* nullability: capture-unproven (unplaced papers) */,
  title: z.string(),
  paperCode: z.string().nullable() /* nullability: capture-unproven */,
  sessionLabel: z.string().nullable() /* nullability: capture-unproven */,
  board: z.string().nullable() /* nullability: capture-unproven */,
  qualification: z.string().nullable() /* nullability: capture-unproven */,
  validationState: contentValidationStateSchema,
  versionCount: z.number().int(),
  validatedVersions: z.number().int(),
  rejectedVersions: z.number().int(),
  flaggedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  reconciliationStatus: z.string() /* capture-unproven value domain (string on the record) */,
  findingCount: z.number().int(),
  avgExtractionConfidence: z.number().nullable(),
  createdAt: z.string() /* Instant.toString(), ISO-8601 */,
});
export type EnrichedPaperSummary = z.infer<typeof enrichedPaperSummarySchema>;

/** EnrichedReviewQueueView (ContentReviewService.java:845-847). */
export const enrichedReviewQueueViewSchema = z.object({
  papers: z.array(enrichedPaperSummarySchema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
});
export type EnrichedReviewQueueView = z.infer<typeof enrichedReviewQueueViewSchema>;

/**
 * EnrichedPaperSummaryV3 (ContentReviewService.java:656-684) — v3 is the
 * FLAT v2 shape plus the new signals (javadoc: records serialize their
 * components; a nested base would hide the v2 fields).
 */
export const enrichedPaperSummaryV3Schema = enrichedPaperSummarySchema.extend({
  totalQuestions: z.number().int(),
  mappedQuestions: z.number().int(),
  questionsWithScheme: z.number().int(),
  novelTopicCount: z.number().int(),
  rankReasons: z.array(z.string()),
});
export type EnrichedPaperSummaryV3 = z.infer<typeof enrichedPaperSummaryV3Schema>;

/** EnrichedReviewQueueViewV3 (ContentReviewService.java:686-689) — pinned by the v3 empty-state capture. */
export const enrichedReviewQueueViewV3Schema = z.object({
  papers: z.array(enrichedPaperSummaryV3Schema),
  suggestedVersions: z.number().int(),
  suggestedSchemes: z.number().int(),
  practicableTopicCount: z.number().int(),
});
export type EnrichedReviewQueueViewV3 = z.infer<typeof enrichedReviewQueueViewV3Schema>;

/** OptionReview (ContentReviewService.java:933-935) — teacher-only: includes the correct flag + misconception. */
export const optionReviewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  text: z.string(),
  correct: z.boolean(),
  misconceptionNodeId: z.string().uuid().nullable(),
});
export type OptionReview = z.infer<typeof optionReviewSchema>;

/** PartReview (ContentReviewService.java:937-939). */
export const partReviewSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  prompt: z.string(),
  commandWord: z.string().nullable() /* nullability: capture-unproven */,
  marks: z.number().int(),
});
export type PartReview = z.infer<typeof partReviewSchema>;

/** PointReview (ContentReviewService.java:942-944) — the deterministic marking contract per mark point. */
export const pointReviewSchema = z.object({
  id: z.string().uuid(),
  ref: z.string(),
  text: z.string(),
  marks: z.number().int(),
  acceptanceCriteria: z.array(z.string()).nullable() /* nullability: capture-unproven */,
});
export type PointReview = z.infer<typeof pointReviewSchema>;

/**
 * VersionReviewView (ContentReviewService.java:925-930) — full review of
 * one question version INCLUDING the answer key (§7). `type` is
 * Question.Type.name(); `schemeId`/`schemeState` are null when no mark
 * scheme exists yet.
 */
export const versionReviewViewSchema = z.object({
  versionId: z.string().uuid(),
  questionId: z.string().uuid(),
  externalRef: z.string().nullable() /* Question.external_ref length 80, nullable column */,
  type: questionTypeSchema,
  stem: z.string(),
  marks: z.number().int(),
  version: z.number().int(),
  validationState: contentValidationStateSchema,
  commandWord: z.string().nullable() /* nullability: capture-unproven */,
  schemeId: z.string().uuid().nullable(),
  schemeState: contentValidationStateSchema.nullable(),
  points: z.array(pointReviewSchema).nullable() /* nullability: capture-unproven (no scheme) */,
  options: z.array(optionReviewSchema).nullable() /* nullability: capture-unproven (non-MCQ) */,
  parts: z.array(partReviewSchema).nullable() /* nullability: capture-unproven (non-STRUCTURED) */,
  extractionConfidence: z.number().nullable(),
  extractionMethod: z.string().nullable() /* nullability: capture-unproven */,
  sourceDocumentId: z.string().nullable() /* nullability: capture-unproven */,
});
export type VersionReviewView = z.infer<typeof versionReviewViewSchema>;

/** PaperReviewView (ContentReviewService.java:917-923) — GET /exam-papers/{id}/review. */
export const paperReviewViewSchema = z.object({
  paper: z.object({
    id: z.string().uuid(),
    subjectId: z.string().uuid().nullable() /* nullability: capture-unproven */,
    title: z.string(),
    paperCode: z.string().nullable() /* nullability: capture-unproven */,
    sessionLabel: z.string().nullable() /* nullability: capture-unproven */,
    board: z.string().nullable() /* nullability: capture-unproven */,
    qualification: z.string().nullable() /* nullability: capture-unproven */,
    validationState: contentValidationStateSchema,
  }),
  versions: z.array(versionReviewViewSchema),
});
export type PaperReviewView = z.infer<typeof paperReviewViewSchema>;

/**
 * AuditRowView (ContentReviewService.java:823-832) — GET
 * /exam-papers/{id}/audit rows. occurredAt is explicitly null-able in the
 * mapper (row.occurredAt() == null ? null : toString()); fromState/toState/
 * detail mirror nullable audit columns (capture-unproven).
 */
export const auditRowViewSchema = z.object({
  occurredAt: z.string().nullable() /* Instant.toString() or null (mapper) */,
  actor: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid(),
  fromState: z.string().nullable() /* nullability: capture-unproven */,
  toState: z.string().nullable() /* nullability: capture-unproven */,
  detail: z.string().nullable() /* nullability: capture-unproven */,
});
export type AuditRowView = z.infer<typeof auditRowViewSchema>;

/** GET /exam-papers/{id}/audit body. */
export const paperAuditResponseSchema = z.array(auditRowViewSchema);

/** DocumentIdentity (ContentController.java:162-164) — never mutated post-ingestion. */
export const documentIdentitySchema = z.object({
  documentId: z.string(),
  fileName: z.string().nullable() /* nullability: capture-unproven */,
  sourceUri: z.string().nullable() /* nullability: capture-unproven */,
  checksum: z.string(),
  checksumAlgorithm: z.string(),
});
export type DocumentIdentity = z.infer<typeof documentIdentitySchema>;

/**
 * PaperProvenanceView (ContentController.java:167-169) — GET
 * /exam-papers/{id}/provenance. Fail-closed: a paper without BOTH QP and
 * MS document rows 404s (controller lines 145-147) — the view itself
 * always carries both identities when it appears.
 */
export const paperProvenanceViewSchema = z.object({
  paperId: z.string().uuid(),
  questionPaper: documentIdentitySchema,
  markScheme: documentIdentitySchema,
});
export type PaperProvenanceView = z.infer<typeof paperProvenanceViewSchema>;

/** TopicRowView (ContentReviewService.java:801-802) — GET /questions/{questionId}/topics rows. */
export const topicRowViewSchema = z.object({
  nodeId: z.string().uuid(),
  primary: z.boolean(),
  code: z.string(),
  title: z.string(),
});
export type TopicRowView = z.infer<typeof topicRowViewSchema>;

/** GET /questions/{questionId}/topics body. */
export const questionTopicRowsResponseSchema = z.array(topicRowViewSchema);
