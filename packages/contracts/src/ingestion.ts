/**
 * Tranche-B ingestion wire contracts — ported from the frozen Java core
 * (T-MIG-082 tranche B; sources syllabai-core @ 6cad6ef, raw reads
 * 2026-10-07):
 *
 *   src/main/java/com/syllabai/content/RoutingController.java
 *       (GET /api/v1/teacher/content/{fetch,enumerate,enumerate/structured})
 *   src/main/java/com/syllabai/content/FetchService.java        (views)
 *   src/main/java/com/syllabai/content/EnumerateService.java    (views)
 *   src/main/java/com/syllabai/content/FetchQueryParser.java    (parsed echo)
 *   src/main/java/com/syllabai/teacher/GlmOcrIngestionController.java
 *       (POST /api/v1/teacher/content/glm-ocr/pairs — PairRequestView/
 *        PairResultView; GET /papers/{paperId}/findings — FindingView)
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrPaperDraftDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrMarkSchemeDraftDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrReconciliationDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/ExamSeriesDatasetDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/ExamSeriesImportService.java
 *       (ImportSummary)
 *
 * JACKSON FACTS (the content-writes.ts conventions carried forward):
 *   - REQUEST-side: @JsonIgnoreProperties(ignoreUnknown = true) on every
 *     draft DTO → zod strip; missing reference components bind null
 *     (.nullable().default(null)); missing PRIMITIVE components bind the
 *     JVM default (.default(<jvm-default>) and null rejected); the
 *     scalar-coercion set is the javaJson* preprocessor family.
 *     EXCEPTION: ExamSeriesDatasetDto.SeriesRow is
 *     @JsonIgnoreProperties(ignoreUnknown = FALSE) — an unknown ROW field
 *     fails binding → 400 malformed_body (mirrored with z.strictObject);
 *     the dataset TOP LEVEL keeps the Boot default (unknowns stripped).
 *   - RESPONSE-side: records serialize EVERY component (absent never
 *     happens; null does) → .nullable() for plausible-null references,
 *     never .optional().
 *   - NO golden captures exist for any of these families (the 178-case
 *     corpus exercises none of them — r1c Task-33 of record) — the
 *     acceptance baseline is the Java declaration itself, pinned in
 *     test/ingestion/** (the T-MIG-006 precedent verbatim).
 */
import { z } from "zod";
import {
  javaJsonBool,
  javaJsonDouble,
  javaJsonInt,
  canonicalDocumentSchema,
  type CanonicalDocument,
} from "./content-writes";

// ── Fetch / Enumerate wire views (RoutingController :120-169 + services) ────

/**
 * ParsedFetchQuery (FetchQueryParser.java:63-98) — the response echo.
 * empty: the T-MIG-100 CLASS A wire law — the frozen serializer merges the
 * record's derived isEmpty() boolean getter into the JSON as an ALWAYS-PRESENT
 * property (golden-captures/t-mig-088 legs 05/06 carry empty:true on the empty
 * parse; a Jackson boolean getter never omits, so successful parses carry
 * empty:false). Derived at the wire boundary; the internal parser shape is the
 * untouched 9-field port.
 */
export const parsedFetchQuerySchema = z.object({
  paperCode: z.string().nullable(),
  unit: z.string().nullable(),
  series: z.string().nullable(),
  year: z.number().int().nullable(),
  qnum: z.number().int().nullable(),
  part: z.string().nullable(),
  msSeeking: z.boolean(),
  normalized: z.string(),
  partRoman: z.string().nullable(),
  empty: z.boolean(),
});
export type ParsedFetchQuery = z.infer<typeof parsedFetchQuerySchema>;

/** MarkPointView (FetchService.java:50). */
export const markPointViewSchema = z.object({
  ref: z.string().nullable(),
  text: z.string().nullable(),
  marks: z.number().int().nullable(),
});
export type MarkPointView = z.infer<typeof markPointViewSchema>;

/** PartView (FetchService.java:53). */
export const partViewSchema = z.object({
  label: z.string().nullable(),
  prompt: z.string().nullable(),
  marks: z.number().int().nullable(),
});
export type PartView = z.infer<typeof partViewSchema>;

/** FetchQuestionView (RoutingController.java:122-125). */
export const fetchQuestionViewSchema = z.object({
  questionId: z.string().uuid(),
  externalRef: z.string().nullable(),
  stem: z.string().nullable(),
  marks: z.number().int().nullable(),
  questionType: z.string().nullable(),
  commandWord: z.string().nullable(),
  parts: z.array(partViewSchema),
  markPoints: z.array(markPointViewSchema),
});
export type FetchQuestionView = z.infer<typeof fetchQuestionViewSchema>;

/** FetchPaperView (RoutingController.java:133-137) — question null when no qnum parsed. */
export const fetchPaperViewSchema = z.object({
  paperId: z.string().uuid(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  series: z.string().nullable(),
  year: z.number().int().nullable(),
  validationState: z.string().nullable(),
  qpDocumentId: z.string().nullable(),
  msDocumentId: z.string().nullable(),
  question: fetchQuestionViewSchema.nullable(),
});
export type FetchPaperView = z.infer<typeof fetchPaperViewSchema>;

/**
 * FetchView (RoutingController.java:146-157). The unresolved-scope empty
 * view: parsed null, ambiguous false, parseDefect false, papers [].
 */
export const fetchViewSchema = z.object({
  parsed: parsedFetchQuerySchema.nullable(),
  ambiguous: z.boolean(),
  parseDefect: z.boolean(),
  papers: z.array(fetchPaperViewSchema),
});
export type FetchView = z.infer<typeof fetchViewSchema>;

/** EnumeratedQuestion (EnumerateService.java:62-72) — paper fields via the LEFT JOIN. */
export const enumeratedQuestionSchema = z.object({
  questionId: z.string().uuid(),
  externalRef: z.string().nullable(),
  stemExcerpt: z.string().nullable(),
  marks: z.number().int().nullable(),
  questionType: z.string().nullable(),
  paperId: z.string().uuid().nullable(),
  paperCode: z.string().nullable(),
  sessionLabel: z.string().nullable(),
  series: z.string().nullable(),
  year: z.number().int().nullable(),
});
export type EnumeratedQuestion = z.infer<typeof enumeratedQuestionSchema>;

/** EnumerateResult (EnumerateService.java:74-77). */
export const enumerateResultSchema = z.object({
  mode: z.string(),
  resolvedNodeCode: z.string().nullable(),
  resolvedNodeTitle: z.string().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  ambiguous: z.boolean(),
  questions: z.array(enumeratedQuestionSchema),
});
export type EnumerateResult = z.infer<typeof enumerateResultSchema>;

/**
 * EnumerateView (RoutingController.java:159-169) — the record WRAPS the
 * result one level down ({ "result": { … } }); the empty view is
 * { result: { mode: "unscoped", …, questions: [] } }.
 */
export const enumerateViewSchema = z.object({
  result: enumerateResultSchema,
});
export type EnumerateView = z.infer<typeof enumerateViewSchema>;

// ── GLM-OCR draft contracts (parser schema 1.0 — the §27 shared schemas) ───

export const GLM_OCR_SUPPORTED_SCHEMA = "1.0";

/** FigureRef (GlmOcrPaperDraftDto.java:129-152) — both corpus generations. */
export const glmFigureRefSchema = z.object({
  elementId: z.string().nullable().default(null),
  sourceName: z.string().nullable().default(null),
  format: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  availability: z.string().nullable().default(null),
  assetId: z.string().nullable().default(null),
  sha256: z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  width: javaJsonInt.nullable().default(null),
  height: javaJsonInt.nullable().default(null),
  formatMismatch: javaJsonBool.nullable().default(null),
});
export type GlmFigureRef = z.infer<typeof glmFigureRefSchema>;

/** PaperMeta (GlmOcrPaperDraftDto.java:62-74) — shared by QP and MS drafts. */
export const glmPaperMetaSchema = z.object({
  board: z.string().nullable().default(null),
  qualification: z.string().nullable().default(null),
  subject: z.string().nullable().default(null),
  paperReference: z.string().nullable().default(null),
  logNumber: z.string().nullable().default(null),
  publicationCode: z.string().nullable().default(null),
  session: z.string().nullable().default(null),
  examDate: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  canonicalDocumentId: z.string().nullable().default(null),
});
export type GlmPaperMeta = z.infer<typeof glmPaperMetaSchema>;

/** McqOption (GlmOcrPaperDraftDto.java:118-122). */
export const glmMcqOptionSchema = z.object({
  letter: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
});
export type GlmMcqOption = z.infer<typeof glmMcqOptionSchema>;

/** PartDraft (GlmOcrPaperDraftDto.java:97-112) — marks Integer (unknown = null). */
export const glmPartDraftSchema = z.object({
  partId: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  marks: javaJsonInt.nullable().default(null),
  qwc: javaJsonBool.default(false),
  figures: z.array(glmFigureRefSchema).default([]),
  answerPrompts: z.array(z.string()).default([]),
  confidence: javaJsonDouble.default(0.0),
});
export type GlmPartDraft = z.infer<typeof glmPartDraftSchema>;

/** QuestionDraft (GlmOcrPaperDraftDto.java:77-95) — primitives bind JVM defaults. */
export const glmQuestionDraftSchema = z.object({
  questionId: z.string().nullable().default(null),
  number: javaJsonInt.default(0),
  numberingStyle: z.string().nullable().default(null),
  section: z.string().nullable().default(null),
  stem: z.string().nullable().default(null),
  mcq: javaJsonBool.default(false),
  options: z.array(glmMcqOptionSchema).default([]),
  parts: z.array(glmPartDraftSchema).default([]),
  figures: z.array(glmFigureRefSchema).default([]),
  tableElementIds: z.array(z.string()).default([]),
  marks: javaJsonInt.default(0),
  marksKnown: javaJsonBool.default(false),
  qwc: javaJsonBool.default(false),
  answerPrompts: z.array(z.string()).default([]),
  confidence: javaJsonDouble.default(0.0),
});
export type GlmQuestionDraft = z.infer<typeof glmQuestionDraftSchema>;

/**
 * GlmOcrPaperDraftDto (:29-52). NOTE: `figureRefs`-style null-preservation
 * does NOT apply here — frontMatterFigures IS null-normalized by the
 * compact constructor; `paper` stays nullable (the QP cover may yield
 * nothing); `warnings` null-normalized to [].
 */
export const glmPaperDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  reviewRequired: javaJsonBool.default(false),
  paper: glmPaperMetaSchema.nullable().default(null),
  questions: z.array(glmQuestionDraftSchema).default([]),
  questionTotals: z.record(z.string(), javaJsonInt).default({}),
  paperTotal: javaJsonInt.nullable().default(null),
  sectionTotals: z.record(z.string(), javaJsonInt).default({}),
  frontMatterFigures: z.array(glmFigureRefSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type GlmPaperDraft = z.infer<typeof glmPaperDraftSchema>;

/** MarkPoint (:112-129) — marks null = the segment carried no marker. */
export const glmMarkPointSchema = z.object({
  ordinal: javaJsonInt.default(0),
  text: z.string().nullable().default(null),
  marks: javaJsonInt.nullable().default(null),
  dependentOn: z.array(z.string()).default([]),
  ecf: javaJsonBool.default(false),
  alternatives: z.array(z.string()).default([]),
  anyTwoFrom: javaJsonBool.default(false),
  reject: javaJsonBool.default(false),
  rawText: z.string().nullable().default(null),
});
export type GlmMarkPoint = z.infer<typeof glmMarkPointSchema>;

/** GuidanceLine (:134-139). */
export const glmGuidanceLineSchema = z.object({
  kind: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
});
export type GlmGuidanceLine = z.infer<typeof glmGuidanceLineSchema>;

/** IcTable (:142-152) — rows null-normalized, location nullable. */
export const glmIcTableSchema = z.object({
  rows: z.array(z.array(z.string())).default([]),
  location: z.string().nullable().default(null),
});
export type GlmIcTable = z.infer<typeof glmIcTableSchema>;

/** MarkSchemeEntry (:81-108) — marks Integer (rowspan-deferred = null). */
export const glmMarkSchemeEntrySchema = z.object({
  entryId: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  number: javaJsonInt.default(0),
  qwc: javaJsonBool.default(false),
  mcq: javaJsonBool.default(false),
  correctOption: z.string().nullable().default(null),
  answerText: z.string().nullable().default(null),
  markPoints: z.array(glmMarkPointSchema).default([]),
  guidance: z.array(glmGuidanceLineSchema).default([]),
  marks: javaJsonInt.nullable().default(null),
  marksCellSource: z.string().nullable().default(null),
  confidence: javaJsonDouble.default(0.0),
});
export type GlmMarkSchemeEntry = z.infer<typeof glmMarkSchemeEntrySchema>;

/**
 * GlmOcrMarkSchemeDraftDto (:44-58). figureRefs deliberately NOT
 * null-normalized — null means "produced by a pre-figureRefs engine"
 * (the distinction is review-visible; the compact-constructor comment).
 */
export const glmMarkSchemeDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  reviewRequired: javaJsonBool.default(false),
  paper: glmPaperMetaSchema.nullable().default(null),
  entries: z.array(glmMarkSchemeEntrySchema).default([]),
  questionTotals: z.record(z.string(), javaJsonInt).default({}),
  paperTotal: javaJsonInt.nullable().default(null),
  icTable: glmIcTableSchema.nullable().default(null),
  figureRefs: z.array(glmFigureRefSchema).nullable().default(null),
  warnings: z.array(z.string()).default([]),
});
export type GlmMarkSchemeDraft = z.infer<typeof glmMarkSchemeDraftSchema>;

/** Finding (GlmOcrReconciliationDto.java:47-53). */
export const glmReconciliationFindingSchema = z.object({
  questionNumber: z.string().nullable().default(null),
  qpMarks: javaJsonInt.nullable().default(null),
  msMarks: javaJsonInt.nullable().default(null),
  severity: z.string().nullable().default(null),
});
export type GlmReconciliationFinding = z.infer<typeof glmReconciliationFindingSchema>;

/** GlmOcrReconciliationDto (:29-40). */
export const glmReconciliationSchema = z.object({
  findings: z.array(glmReconciliationFindingSchema).default([]),
  qpPaperTotal: javaJsonInt.nullable().default(null),
  msPaperTotal: javaJsonInt.nullable().default(null),
  paperTotalConflict: javaJsonBool.default(false),
  mismatchCount: javaJsonInt.default(0),
});
export type GlmReconciliation = z.infer<typeof glmReconciliationSchema>;

/**
 * The pair request envelope (PairRequestView, controller :89-94): five
 * JsonNode subtrees bound verbatim — ANY JSON binds at this layer
 * (including null); the subtree SHAPES are parsed where the service reads
 * them (a non-parsing subtree = the frozen treeToValue runtime failure →
 * the catch-all 500, never a guessed 400).
 */
export const glmPairRequestEnvelopeSchema = z.object({
  qpCanonical: z.unknown(),
  msCanonical: z.unknown(),
  qpDraft: z.unknown(),
  msDraft: z.unknown(),
  reconciliation: z.unknown(),
});
export type GlmPairRequestEnvelope = z.infer<typeof glmPairRequestEnvelopeSchema>;

/** The typed pair request the service receives (GlmOcrPairRequest :273-281). */
export interface GlmPairRequest {
  qpCanonical: CanonicalDocument;
  qpCanonicalJson: string;
  msCanonical: CanonicalDocument;
  msCanonicalJson: string;
  qpDraft: GlmPaperDraft;
  msDraft: GlmMarkSchemeDraft;
  reconciliation: GlmReconciliation;
}

// ── GLM-OCR response views (controller :108-165) ────────────────────────────

/** DocumentStatusView (:108-113) — DUPLICATE | INGESTED. */
export const glmDocumentStatusViewSchema = z.object({
  status: z.string(),
  documentId: z.string(),
  chunks: z.number().int(),
});
export type GlmDocumentStatusView = z.infer<typeof glmDocumentStatusViewSchema>;

/** PaperStatusView (:115-120). */
export const glmPaperStatusViewSchema = z.object({
  status: z.string(),
  paperId: z.string().uuid().nullable(),
  title: z.string().nullable(),
});
export type GlmPaperStatusView = z.infer<typeof glmPaperStatusViewSchema>;

/** ReconciliationView (:122-128) — the parser verdict relayed verbatim. */
export const glmReconciliationViewSchema = z.object({
  status: z.string(),
  mismatchCount: z.number().int(),
  paperTotalConflict: z.boolean(),
  qpPaperTotal: z.number().int().nullable(),
  msPaperTotal: z.number().int().nullable(),
});
export type GlmReconciliationView = z.infer<typeof glmReconciliationViewSchema>;

/** FindingView (:130-136) — one review-visible finding. */
export const glmFindingViewSchema = z.object({
  source: z.string().nullable(),
  severity: z.string().nullable(),
  questionNumber: z.string().nullable(),
  qpMarks: z.number().int().nullable(),
  msMarks: z.number().int().nullable(),
  detail: z.string().nullable(),
});
export type GlmFindingView = z.infer<typeof glmFindingViewSchema>;

/** PairResultView (:138-150) — the 201 body. */
export const glmPairResultViewSchema = z.object({
  qpDocument: glmDocumentStatusViewSchema,
  msDocument: glmDocumentStatusViewSchema,
  examPaper: glmPaperStatusViewSchema,
  questions: z.number().int(),
  parts: z.number().int(),
  markSchemes: z.number().int(),
  markPoints: z.number().int(),
  qpChunks: z.number().int(),
  msChunks: z.number().int(),
  reconciliation: glmReconciliationViewSchema,
  reviewFindings: z.array(glmFindingViewSchema),
  embeddingSkipped: z.boolean(),
});
export type GlmPairResultView = z.infer<typeof glmPairResultViewSchema>;

// ── Exam-series import (ExamSeriesDatasetDto + ImportSummary) ───────────────

/**
 * The governed qualification vocabulary (SeriesRow enum, :66-70): frozen in
 * the importer, not in the DB column — widening is a code change with tests.
 */
export const examSeriesQualificationSchema = z.enum(["INTERNATIONAL_GCSE", "IAL"]);
export type ExamSeriesQualification = z.infer<typeof examSeriesQualificationSchema>;

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "local date (yyyy-MM-dd)");
const instantSchema = z.string().datetime({ offset: true });

/**
 * SeriesRow (:44-58) — STRICT binding (@JsonIgnoreProperties(ignoreUnknown
 * = false)): an unknown row field fails binding → 400 malformed_body.
 * Missing reference fields bind null (no @Valid on the controller — bean
 * validation NEVER runs; the service's own gates + NPEs are the law).
 */
export const examSeriesRowSchema = z.strictObject({
  qualification: examSeriesQualificationSchema.nullable().default(null),
  seriesCode: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  windowStart: localDateSchema.nullable().default(null),
  windowEnd: localDateSchema.nullable().default(null),
  entryDeadline: localDateSchema.nullable().default(null),
  resultsDate: localDateSchema.nullable().default(null),
  published: javaJsonBool.nullable().default(null),
  estimated: javaJsonBool.nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
});
export type ExamSeriesRow = z.infer<typeof examSeriesRowSchema>;

/**
 * ExamSeriesDatasetDto (:29-38) — TOP level keeps the Boot default
 * (unknowns stripped): board/retrievedAt/series are the only known fields.
 */
export const examSeriesDatasetSchema = z.object({
  board: z.string().nullable().default(null),
  retrievedAt: instantSchema.nullable().default(null),
  series: z.array(examSeriesRowSchema).nullable().default(null),
});
export type ExamSeriesDataset = z.infer<typeof examSeriesDatasetSchema>;

/** ImportSummary (ExamSeriesImportService.java:56). */
export const examSeriesImportSummarySchema = z.object({
  imported: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
});
export type ExamSeriesImportSummary = z.infer<typeof examSeriesImportSummarySchema>;

/** Re-export for route-level reuse (the typed canonical parse). */
export { canonicalDocumentSchema };
