/**
 * GLM-OCR bridge contracts — ported from the frozen Java core (T-MIG-089).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-09):
 *   src/main/java/com/syllabai/teacher/GlmOcrIngestionController.java
 *       (POST /api/v1/teacher/content/glm-ocr/pairs — PairRequestView body,
 *        PairResultView 201 body; GET .../papers/{paperId}/findings —
 *        List<FindingView>)
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrPaperDraftDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrMarkSchemeDraftDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/GlmOcrReconciliationDto.java
 *
 * REQUEST-side Jackson facts (the content-writes.ts conventions apply
 * unchanged — same web layer, same DTO generation):
 *   - @JsonIgnoreProperties(ignoreUnknown = true) on every draft DTO →
 *     unknown JSON keys are IGNORED (zod strip default is the exact mirror).
 *   - Missing object/List/String components bind as null; missing PRIMITIVE
 *     components bind as JVM defaults (0 / 0.0 / false). Every
 *     object/reference field uses `.nullable().default(null)`; primitives
 *     use `.default(<jvm-default>)` and REJECT explicit null.
 *   - The record compactors (``questions = questions == null ? List.of() :
 *     …``) bind absent AND null collections to the empty immutable —
 *     mirrored with `.default(null).transform(x => x ?? [])`. The ONE
 *     deliberate exception is the MS draft's `figureRefs`, which the Java
 *     record does NOT null-normalize ("null means produced by a
 *     pre-figureRefs engine" — the distinction is review-visible), so it
 *     stays `.nullable().default(null)` with no transform.
 *   - The controller body (PairRequestView) holds FIVE raw JsonNode
 *     subtrees — they are bound here as the parsed DTOs (the controller's
 *     own toServiceRequest() does treeToValue into exactly these types).
 *     A null subtree reaches GlmOcrIngestionService.validateBundle's
 *     Objects.requireNonNull → NPE → 500 internal_error (route mirrors).
 *
 * RESPONSE-side Jackson facts: records serialize every component (absent
 * never happens; null does) — response schemas use .nullable() for
 * reference fields, never .optional(), and keep the declaration order.
 */
import { z } from "zod";
import {
  canonicalDocumentSchema,
  javaJsonBool,
  javaJsonDouble,
  javaJsonInt,
} from "./content-writes";

// ── shared draft pieces ─────────────────────────────────────────────────────

/** GlmOcrPaperDraftDto.PaperMeta (:47-57) — all ten components are String. */
export const glmOcrPaperMetaSchema = z.object({
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
export type GlmOcrPaperMeta = z.infer<typeof glmOcrPaperMetaSchema>;

/**
 * FigureRef (GlmOcrPaperDraftDto.java:139-151) — two corpus generations
 * share the contract; the enrichment fields are opt-in and omitted for
 * unresolvable references (all nullable Strings/Integers/Boolean).
 */
export const glmOcrFigureRefSchema = z.object({
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
  formatMismatch: z.boolean().nullable().default(null),
});
export type GlmOcrFigureRef = z.infer<typeof glmOcrFigureRefSchema>;

/** McqOption (:109-112) — letters may arrive out of order (corpus defect #9). */
export const glmOcrMcqOptionSchema = z.object({
  letter: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
});
export type GlmOcrMcqOption = z.infer<typeof glmOcrMcqOptionSchema>;

/** PartDraft (:91-105) — marks is Integer (boxed, null = unknown). */
export const glmOcrPartDraftSchema = z.object({
  partId: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  marks: javaJsonInt.nullable().default(null),
  qwc: javaJsonBool.default(false),
  figures: z.array(glmOcrFigureRefSchema).nullable().default(null).transform((f) => f ?? []),
  answerPrompts: z.array(z.string()).nullable().default(null).transform((a) => a ?? []),
  confidence: javaJsonDouble.default(0),
});
export type GlmOcrPartDraft = z.infer<typeof glmOcrPartDraftSchema>;

/** QuestionDraft (:62-87) — primitives default, lists compact to []. */
export const glmOcrQuestionDraftSchema = z.object({
  questionId: z.string().nullable().default(null),
  number: javaJsonInt.default(0),
  numberingStyle: z.string().nullable().default(null),
  section: z.string().nullable().default(null),
  stem: z.string().nullable().default(null),
  mcq: javaJsonBool.default(false),
  options: z.array(glmOcrMcqOptionSchema).nullable().default(null).transform((o) => o ?? []),
  parts: z.array(glmOcrPartDraftSchema).nullable().default(null).transform((p) => p ?? []),
  figures: z.array(glmOcrFigureRefSchema).nullable().default(null).transform((f) => f ?? []),
  tableElementIds: z.array(z.string()).nullable().default(null).transform((t) => t ?? []),
  marks: javaJsonInt.default(0),
  marksKnown: javaJsonBool.default(false),
  qwc: javaJsonBool.default(false),
  answerPrompts: z.array(z.string()).nullable().default(null).transform((a) => a ?? []),
  confidence: javaJsonDouble.default(0),
});
export type GlmOcrQuestionDraft = z.infer<typeof glmOcrQuestionDraftSchema>;

/**
 * GLM-OCR QP draft (GlmOcrPaperDraftDto.java:22-32) — schema 1.0,
 * extraction method glm-ocr-qp-v1. SUPPORTED_SCHEMA = "1.0" (:34); the
 * schema check happens at the content gate, NOT at binding (mirror).
 */
export const GLM_OCR_SUPPORTED_SCHEMA = "1.0";

/** Map<String, Integer> binding: object of int-nullable values; null → Map.of(). */
const javaIntMapSchema = z
  .record(z.string(), javaJsonInt.nullable().default(null))
  .nullable()
  .default(null)
  .transform((m) => m ?? {});

export const glmOcrPaperDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  reviewRequired: javaJsonBool.default(false),
  paper: glmOcrPaperMetaSchema.nullable().default(null),
  questions: z.array(glmOcrQuestionDraftSchema).nullable().default(null).transform((q) => q ?? []),
  questionTotals: javaIntMapSchema,
  paperTotal: javaJsonInt.nullable().default(null),
  sectionTotals: javaIntMapSchema,
  frontMatterFigures: z.array(glmOcrFigureRefSchema).nullable().default(null).transform((f) => f ?? []),
  warnings: z.array(z.string()).nullable().default(null).transform((w) => w ?? []),
});
export type GlmOcrPaperDraft = z.infer<typeof glmOcrPaperDraftSchema>;

// ── MS draft ────────────────────────────────────────────────────────────────

/** MarkPoint (:86-101) — marks null means the segment carried no marker. */
export const glmOcrMarkPointSchema = z.object({
  ordinal: javaJsonInt.default(0),
  text: z.string().nullable().default(null),
  marks: javaJsonInt.nullable().default(null),
  dependentOn: z.array(z.string()).nullable().default(null).transform((d) => d ?? []),
  ecf: javaJsonBool.default(false),
  alternatives: z.array(z.string()).nullable().default(null).transform((a) => a ?? []),
  anyTwoFrom: javaJsonBool.default(false),
  reject: javaJsonBool.default(false),
  rawText: z.string().nullable().default(null),
});
export type GlmOcrMarkPoint = z.infer<typeof glmOcrMarkPointSchema>;

/** GuidanceLine (:105-108) — classified by leading keyword. */
export const glmOcrGuidanceLineSchema = z.object({
  kind: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
});
export type GlmOcrGuidanceLine = z.infer<typeof glmOcrGuidanceLineSchema>;

/** IcTable (:112-119) — indicative-content table (QWC questions). */
export const glmOcrIcTableSchema = z.object({
  rows: z.array(z.array(z.string())).nullable().default(null).transform((r) => r ?? []),
  location: z.string().nullable().default(null),
});
export type GlmOcrIcTable = z.infer<typeof glmOcrIcTableSchema>;

/** MarkSchemeEntry (:60-78) — marks is the printed Mark cell (null = deferred). */
export const glmOcrMarkSchemeEntrySchema = z.object({
  entryId: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  number: javaJsonInt.default(0),
  qwc: javaJsonBool.default(false),
  mcq: javaJsonBool.default(false),
  correctOption: z.string().nullable().default(null),
  answerText: z.string().nullable().default(null),
  markPoints: z.array(glmOcrMarkPointSchema).nullable().default(null).transform((m) => m ?? []),
  guidance: z.array(glmOcrGuidanceLineSchema).nullable().default(null).transform((g) => g ?? []),
  marks: javaJsonInt.nullable().default(null),
  marksCellSource: z.string().nullable().default(null),
  confidence: javaJsonDouble.default(0),
});
export type GlmOcrMarkSchemeEntry = z.infer<typeof glmOcrMarkSchemeEntrySchema>;

/**
 * GLM-OCR MS draft (GlmOcrMarkSchemeDraftDto.java:31-41) — NOTE figureRefs
 * is deliberately NOT null-normalized (record comment :48-51): null means
 * "produced by a pre-figureRefs engine"; the distinction is review-visible.
 */
export const glmOcrMarkSchemeDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  reviewRequired: javaJsonBool.default(false),
  paper: glmOcrPaperMetaSchema.nullable().default(null),
  entries: z.array(glmOcrMarkSchemeEntrySchema).nullable().default(null).transform((e) => e ?? []),
  questionTotals: javaIntMapSchema,
  paperTotal: javaJsonInt.nullable().default(null),
  icTable: glmOcrIcTableSchema.nullable().default(null),
  figureRefs: z.array(glmOcrFigureRefSchema).nullable().default(null),
  warnings: z.array(z.string()).nullable().default(null).transform((w) => w ?? []),
});
export type GlmOcrMarkSchemeDraft = z.infer<typeof glmOcrMarkSchemeDraftSchema>;

// ── reconciliation ──────────────────────────────────────────────────────────

/** Finding (GlmOcrReconciliationDto.java:32-37) — severity
 *  "match" | "mismatch" | "qp-only" | "ms-only" | "gap" (free string here:
 *  the parser owns the vocabulary, the bridge consumes it verbatim). */
export const glmOcrReconciliationFindingSchema = z.object({
  questionNumber: z.string().nullable().default(null),
  qpMarks: javaJsonInt.nullable().default(null),
  msMarks: javaJsonInt.nullable().default(null),
  severity: z.string().nullable().default(null),
});
export type GlmOcrReconciliationFinding = z.infer<typeof glmOcrReconciliationFindingSchema>;

/** GlmOcrReconciliationDto (:19-24) — findings null → List.of() (record :26-28). */
export const glmOcrReconciliationSchema = z.object({
  findings: z.array(glmOcrReconciliationFindingSchema).nullable().default(null).transform((f) => f ?? []),
  qpPaperTotal: javaJsonInt.nullable().default(null),
  msPaperTotal: javaJsonInt.nullable().default(null),
  paperTotalConflict: javaJsonBool.default(false),
  mismatchCount: javaJsonInt.default(0),
});
export type GlmOcrReconciliation = z.infer<typeof glmOcrReconciliationSchema>;

/**
 * PairRequestView (controller :89-106) — the five parser outputs as raw
 * JSON subtrees, verbatim. Canonical subtrees are content-preserving raw
 * JSON (the source checksum pins the original file per §8).
 */
export const glmOcrPairRequestSchema = z.object({
  qpCanonical: canonicalDocumentSchema.nullable().default(null),
  msCanonical: canonicalDocumentSchema.nullable().default(null),
  qpDraft: glmOcrPaperDraftSchema.nullable().default(null),
  msDraft: glmOcrMarkSchemeDraftSchema.nullable().default(null),
  reconciliation: glmOcrReconciliationSchema.nullable().default(null),
});
export type GlmOcrPairRequest = z.infer<typeof glmOcrPairRequestSchema>;

// ── response views (controller records :108-165 — declaration order) ────────

/** FindingView (:130-136) — the review-visible evidence line. */
export const glmOcrFindingViewSchema = z.object({
  source: z.string().nullable(),
  severity: z.string().nullable(),
  questionNumber: z.string().nullable(),
  qpMarks: z.number().int().nullable(),
  msMarks: z.number().int().nullable(),
  detail: z.string().nullable(),
});
export type GlmOcrFindingView = z.infer<typeof glmOcrFindingViewSchema>;

/** DocumentStatusView (:108-113) — INGESTED (new) or DUPLICATE (idempotent rerun). */
export const glmOcrDocumentStatusViewSchema = z.object({
  status: z.enum(["INGESTED", "DUPLICATE"]),
  documentId: z.string(),
  chunks: z.number().int(),
});
export type GlmOcrDocumentStatusView = z.infer<typeof glmOcrDocumentStatusViewSchema>;

/** PaperStatusView (:115-120). */
export const glmOcrPaperStatusViewSchema = z.object({
  status: z.enum(["INGESTED", "DUPLICATE"]),
  paperId: z.string().uuid(),
  title: z.string().nullable(),
});
export type GlmOcrPaperStatusView = z.infer<typeof glmOcrPaperStatusViewSchema>;

/** ReconciliationView (:122-128) — relayed verbatim, never merged. */
export const glmOcrReconciliationViewSchema = z.object({
  status: z.string(),
  mismatchCount: z.number().int(),
  paperTotalConflict: z.boolean(),
  qpPaperTotal: z.number().int().nullable(),
  msPaperTotal: z.number().int().nullable(),
});
export type GlmOcrReconciliationView = z.infer<typeof glmOcrReconciliationViewSchema>;

/**
 * PairResultView (:138-165) — the structured bridge result (201 body;
 * @ResponseStatus CREATED). embeddingSkipped is always true by design —
 * embedding is a separate explicit T-013 operation.
 */
export const glmOcrPairResultViewSchema = z.object({
  qpDocument: glmOcrDocumentStatusViewSchema,
  msDocument: glmOcrDocumentStatusViewSchema,
  examPaper: glmOcrPaperStatusViewSchema,
  questions: z.number().int(),
  parts: z.number().int(),
  markSchemes: z.number().int(),
  markPoints: z.number().int(),
  qpChunks: z.number().int(),
  msChunks: z.number().int(),
  reconciliation: glmOcrReconciliationViewSchema,
  reviewFindings: z.array(glmOcrFindingViewSchema),
  embeddingSkipped: z.boolean(),
});
export type GlmOcrPairResultView = z.infer<typeof glmOcrPairResultViewSchema>;
