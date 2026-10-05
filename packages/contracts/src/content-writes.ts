/**
 * Write-flow contracts — ported from the frozen Java core (T-MIG-006).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/teacher/ContentController.java
 *       (/api/v1/teacher/content — POST past-papers, validate-all/validate/
 *        reject/place/flag/unflag on papers + question-versions + mark-schemes,
 *        POST questions/{id}/topics)
 *   src/main/java/com/syllabai/content/ContentDocumentController.java
 *       (POST "" canonical ingest, POST /{id}/embed)
 *   src/main/java/com/syllabai/teacher/ingestion/PastPaperDraftDto.java
 *   src/main/java/com/syllabai/teacher/ingestion/CurriculumDraftDto.java
 *   src/main/java/com/syllabai/content/CanonicalDocumentDto.java
 *   src/main/java/com/syllabai/content/CanonicalDocumentValidator.java
 *       (the core-side mirror of the parser's §8 invariants — the ingest
 *        acceptance contract beyond Jackson binding)
 *   src/main/java/com/syllabai/teacher/ContentReviewService.java:692,797
 *       (BatchResult, TopicMappingResult)
 *   src/main/java/com/syllabai/teacher/TeacherCurriculumController.java
 *       (POST /drafts, /nodes/{id}/validate|reject, /versions/{id}/validate|
 *        archive — responses reuse curriculum.ts NodeView/CurriculumOverview)
 *
 * REQUEST-side Jackson facts (these DIFFER from the response side on purpose):
 *   - @JsonIgnoreProperties(ignoreUnknown = true) on every draft DTO →
 *     unknown JSON keys are IGNORED, never rejected. Zod's default object
 *     behavior (strip) is the exact mirror.
 *   - Missing object/List/String components bind as null; missing PRIMITIVE
 *     components bind as JVM defaults (0 / 0.0 / false). No @JsonProperty(
 *     required) exists anywhere on these DTOs → nothing is "required" at
 *     the binding layer. Every object/reference field below therefore uses
 *     `.nullable().default(null)` — absent and explicit-null BOTH parse to
 *     null, exactly the Java record's bound value — while primitives use
 *     `.default(<jvm-default>)` and REJECT explicit null (coercion failure
 *     → 400). Required-ness (z.string().uuid() etc.) appears only where the
 *     JAVA enforces it (@NotNull, UUID parse).
 *   - Explicit JSON null CANNOT bind to a primitive (coercion failure →
 *     HttpMessageNotReadableException → 400). Mirrored: primitives reject
 *     null but accept absence (via the JVM default).
 *   - Jackson's default scalar coercions are mirrored so the accept set is
 *     neither narrower nor wider than Java's (index.ts rule 3): numeric
 *     strings bind to numbers ("3"→3, "1e3"→1000 — exponent forms accepted
 *     only when mathematically integral; "0x10"/"10.5"/"" rejected),
 *     "true"/"false" bind to booleans.
 *
 * RESPONSE-side Jackson facts are unchanged from content.ts: records
 * serialize every component (absent never happens; null does), so response
 * schemas use .nullable() for plausible-null reference fields and never
 * .optional().
 *
 * NO golden write captures exist (T-MIG-004 captured read surfaces; the
 * T-MIG-003 write captures are the 5 auth cases covered by auth.ts) — the
 * acceptance baseline here is the Java declaration itself, pinned in
 * content-writes.test.ts (positive pins from the records, negative pins
 * for Java-rejected inputs, and the validator's violation contract).
 */
import { z } from "zod";
import {
  validationStateSchema,
  documentKindSchema,
  paperSummarySchema,
} from "./content";
import { curriculumOverviewSchema, knowledgeNodeViewSchema } from "./curriculum";

// ── Jackson request-side scalar coercion mirrors ───────────────────────────

const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * JSON→int primitive, Jackson-default coercions: numeric strings bind
 * (exponent forms only when integral — "1e3"→1000, "10.5"/"0x10"/""
 * rejected), explicit null rejected, absence handled by the caller's
 * .default(). Mirrors _parse_int_primitive + CoercionAction defaults.
 */
export const javaJsonInt = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return NUMERIC_TEXT.test(t) && Number.isInteger(Number(t)) ? Number(t) : v;
  },
  z.number().int(),
);

/** JSON→double primitive (same coercions, fractional values allowed, finite only). */
export const javaJsonDouble = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return NUMERIC_TEXT.test(t) && Number.isFinite(Number(t)) ? Number(t) : v;
  },
  z.number(),
);

/** JSON→boolean primitive: "true"/"false" (case-insensitive) bind; everything else rejected. */
export const javaJsonBool = z.preprocess(
  (v) => (typeof v === "string" && /^(?:true|false)$/i.test(v) ? v.toLowerCase() === "true" : v),
  z.boolean(),
);

// ── supported draft schemas (the 409 guards are controller logic) ──────────

/**
 * ContentController.java:70-75 / TeacherCurriculumController.java:54-58 /
 * CanonicalDocumentValidator.java:24-27. A non-null schemaVersion that is
 * not the supported literal → 409 ConflictException (content drafts, past
 * papers) / InvalidDocumentException 400 (canonical documents). A NULL
 * schemaVersion passes the guard in all three (validator adds a violation
 * for the canonical document instead — mirrored in
 * canonicalDocumentViolations).
 */
export const PAST_PAPER_SUPPORTED_SCHEMA = "1.0";
export const CURRICULUM_DRAFT_SUPPORTED_SCHEMA = "1.1";
export const CANONICAL_DOCUMENT_SUPPORTED_SCHEMA = "1.0";

// ── PastPaperDraftDto (teacher/ingestion/PastPaperDraftDto.java) ───────────

/** PaperMeta (PastPaperDraftDto.java:28-37) — all String components, null binds. */
export const pastPaperPaperMetaSchema = z.object({
  board: z.string().nullable().default(null),
  qualification: z.string().nullable().default(null),
  subject: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  sessionLabel: z.string().nullable().default(null),
  paperCode: z.string().nullable().default(null),
  questionPaperDocumentId: z.string().nullable().default(null),
  markSchemeDocumentId: z.string().nullable().default(null),
});
export type PastPaperPaperMeta = z.infer<typeof pastPaperPaperMetaSchema>;

/** PartDraft (PastPaperDraftDto.java:53-59) — marks/confidence are primitives. */
export const pastPaperPartDraftSchema = z.object({
  label: z.string().nullable().default(null),
  prompt: z.string().nullable().default(null),
  commandWord: z.string().nullable().default(null),
  marks: javaJsonInt.default(0),
  confidence: javaJsonDouble.default(0),
});
export type PastPaperPartDraft = z.infer<typeof pastPaperPartDraftSchema>;

/** QuestionDraft (PastPaperDraftDto.java:40-50). */
export const pastPaperQuestionDraftSchema = z.object({
  externalRef: z.string().nullable().default(null),
  questionNumber: z.string().nullable().default(null),
  prompt: z.string().nullable().default(null),
  commandWord: z.string().nullable().default(null),
  marks: javaJsonInt.default(0),
  questionType: z.string().nullable().default(null) /* free string on the draft DTO — Question.Type
    enum resolution happens in the ingestion service, not at binding */,
  pageNumber: javaJsonInt.default(0),
  confidence: javaJsonDouble.default(0),
  parts: z.array(pastPaperPartDraftSchema).nullable().default(null),
});
export type PastPaperQuestionDraft = z.infer<typeof pastPaperQuestionDraftSchema>;

/** MarkPointDraft (PastPaperDraftDto.java:89-96). */
export const pastPaperMarkPointDraftSchema = z.object({
  questionRef: z.string().nullable().default(null),
  order: javaJsonInt.default(0),
  text: z.string().nullable().default(null),
  marks: javaJsonInt.default(0),
  acceptance: z.array(z.string()).nullable().default(null),
  confidence: javaJsonDouble.default(0),
});
export type PastPaperMarkPointDraft = z.infer<typeof pastPaperMarkPointDraftSchema>;

/**
 * MarkSchemeDraft (PastPaperDraftDto.java:71-86) — the compactors
 * (`points = points == null ? List.of() : …`) binds null/absent points to
 * [] (both mirrored by the transform). generalGuidance is the V34/G-3
 * optional additive field (null in pre-V34 drafts = "no guidance").
 */
export const pastPaperMarkSchemeDraftSchema = z.object({
  version: z.string().nullable().default(null),
  sourceDocumentId: z.string().nullable().default(null),
  points: z.array(pastPaperMarkPointDraftSchema).nullable().default(null).transform((p) => p ?? []),
  generalGuidance: z.string().nullable().default(null),
});
export type PastPaperMarkSchemeDraft = z.infer<typeof pastPaperMarkSchemeDraftSchema>;

/**
 * PastPaperDraftDto (PastPaperDraftDto.java:17-23) — POST
 * /api/v1/teacher/content/past-papers body. reviewRequired is a primitive
 * boolean (default false). The schemaVersion 409 guard is NOT folded in
 * here: Jackson accepts any string; the controller 409s afterwards
 * (ContentController.java:70-75) — routes mirror that two-step.
 */
export const pastPaperDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  paper: pastPaperPaperMetaSchema.nullable().default(null),
  questions: z.array(pastPaperQuestionDraftSchema).nullable().default(null),
  markScheme: pastPaperMarkSchemeDraftSchema.nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  reviewRequired: javaJsonBool.default(false),
});
export type PastPaperDraft = z.infer<typeof pastPaperDraftSchema>;

/** IngestionResultView (ContentController.java:299-301) — 201 body; "SUGGESTED" is hardcoded (line 78). */
export const pastPaperIngestionResultSchema = z.object({
  paperId: z.string().uuid(),
  questions: z.number().int(),
  parts: z.number().int(),
  markPoints: z.number().int(),
  validationState: z.literal("SUGGESTED") /* ContentController.java:78 constant */,
});
export type PastPaperIngestionResult = z.infer<typeof pastPaperIngestionResultSchema>;

// ── CurriculumDraftDto (teacher/ingestion/CurriculumDraftDto.java) ─────────

/**
 * TopicDraft (CurriculumDraftDto.java:50-58) — RECURSIVE via subtopics
 * (mirrors the Java record's self-reference; z.lazy with an explicit
 * output interface).
 */
export interface CurriculumTopicDraft {
  code: string | null;
  title: string | null;
  subtopics: CurriculumTopicDraft[] | null;
  sourceSectionId: string | null;
  sourceElementIds: string[] | null;
  pageNumber: number | null;
  confidence: number;
}

export const curriculumTopicDraftSchema: z.ZodType<CurriculumTopicDraft, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.object({
      code: z.string().nullable().default(null),
      title: z.string().nullable().default(null),
      subtopics: z.array(curriculumTopicDraftSchema).nullable().default(null),
      sourceSectionId: z.string().nullable().default(null),
      sourceElementIds: z.array(z.string()).nullable().default(null),
      pageNumber: javaJsonInt.nullable().default(null) /* Integer (boxed) — null binds, unlike the primitive confidence */,
      confidence: javaJsonDouble.default(0),
    }),
  );

/** UnitDraft (CurriculumDraftDto.java:39-47) — topics is List<TopicDraft> (not recursive). */
export const curriculumUnitDraftSchema = z.object({
  code: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  topics: z.array(curriculumTopicDraftSchema).nullable().default(null),
  sourceSectionId: z.string().nullable().default(null),
  sourceElementIds: z.array(z.string()).nullable().default(null),
  pageNumber: javaJsonInt.nullable().default(null),
  confidence: javaJsonDouble.default(0),
});
export type CurriculumUnitDraft = z.infer<typeof curriculumUnitDraftSchema>;

/** SubjectDraft (CurriculumDraftDto.java:33-36). */
export const curriculumSubjectDraftSchema = z.object({
  code: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
});

/** DraftProvenance (CurriculumDraftDto.java:61-68). */
export const curriculumDraftProvenanceSchema = z.object({
  sourceDocumentId: z.string().nullable().default(null),
  sourceChecksum: z.string().nullable().default(null),
  engine: z.string().nullable().default(null),
  engineVersion: z.string().nullable().default(null),
  extractionMethod: z.string().nullable().default(null),
  validationStatus: z.string().nullable().default(null) /* free string on the draft DTO */,
});

/**
 * CurriculumDraftDto (CurriculumDraftDto.java:20-28) — POST
 * /api/v1/teacher/curriculum/drafts body (schema 1.1). The schemaVersion
 * 409 guard mirrors ContentController's (TeacherCurriculumController.java:54-58).
 */
export const curriculumDraftSchema = z.object({
  schemaVersion: z.string().nullable().default(null),
  board: z.string().nullable().default(null),
  qualification: z.string().nullable().default(null),
  code: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  subject: curriculumSubjectDraftSchema.nullable().default(null),
  units: z.array(curriculumUnitDraftSchema).nullable().default(null),
  provenance: curriculumDraftProvenanceSchema.nullable().default(null),
});
export type CurriculumDraft = z.infer<typeof curriculumDraftSchema>;

/** IngestionResultView (TeacherCurriculumController.java:109-112) — 201 body; "SUGGESTED" hardcoded (line 62). */
export const curriculumIngestionResultSchema = z.object({
  curriculumVersionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectRootNodeId: z.string().uuid(),
  units: z.number().int(),
  topics: z.number().int(),
  subtopics: z.number().int(),
  validationState: z.literal("SUGGESTED") /* TeacherCurriculumController.java:62 constant */,
});
export type CurriculumIngestionResult = z.infer<typeof curriculumIngestionResultSchema>;

// ── ContentDocumentController writes (canonical ingest + embed) ────────────

/** SourceInfo (CanonicalDocumentDto.java:49-55). */
export const canonicalSourceInfoSchema = z.object({
  uri: z.string().nullable().default(null),
  checksum: z.string().nullable().default(null),
  checksumAlgorithm: z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  fileName: z.string().nullable().default(null),
});
export type CanonicalSourceInfo = z.infer<typeof canonicalSourceInfoSchema>;

/** PageInfo (CanonicalDocumentDto.java:58-62). */
export const canonicalPageInfoSchema = z.object({
  pageNumber: javaJsonInt.nullable().default(null),
  width: javaJsonDouble.nullable().default(null),
  height: javaJsonDouble.nullable().default(null),
});

/** SectionInfo (CanonicalDocumentDto.java:65-71). */
export const canonicalSectionInfoSchema = z.object({
  sectionId: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  level: javaJsonInt.nullable().default(null),
  pageNumber: javaJsonInt.nullable().default(null),
  elementIds: z.array(z.string()).nullable().default(null),
});

/** BoundingBox (CanonicalDocumentDto.java:74-80). */
export const canonicalBoundingBoxSchema = z.object({
  x: javaJsonDouble.nullable().default(null),
  y: javaJsonDouble.nullable().default(null),
  width: javaJsonDouble.nullable().default(null),
  height: javaJsonDouble.nullable().default(null),
  unit: z.string().nullable().default(null),
});

/**
 * RetrievalMeta (CanonicalDocumentDto.java:90-99) — doc-level retrieval
 * identity, optional AS A WHOLE. The series/year DOMAIN rules are
 * validator-enforced (CanonicalDocumentValidator.java:83-95), not binding —
 * they live in canonicalDocumentViolations, not here (a "Summer 2019"
 * series BINDS fine and is then a validation violation → 400).
 */
export const canonicalRetrievalMetaSchema = z.object({
  subjectTitle: z.string().nullable().default(null),
  subjectCode: z.string().nullable().default(null),
  series: z.string().nullable().default(null),
  year: javaJsonInt.nullable().default(null),
  paperCode: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  specCodes: z.array(z.string()).nullable().default(null),
});
export type CanonicalRetrievalMeta = z.infer<typeof canonicalRetrievalMetaSchema>;

/**
 * Element base (CanonicalDocumentDto.java:102-114) — §8 WIRE NAMES ARE
 * snake_case on the elements (top level is camelCase) and are kept as-is.
 * confidence here is a boxed Double (null binds) — unlike the draft DTOs'
 * primitive double. group_key is the Embedding-v2 atom identity.
 */
const canonicalElementBase = {
  element_id: z.string().nullable().default(null),
  element_type: z.string().nullable().default(null),
  page_number: javaJsonInt.nullable().default(null),
  bounding_box: canonicalBoundingBoxSchema.nullable().default(null),
  text: z.string().nullable().default(null) /* null legitimate: layout-only elements (validator:97-98) */,
  reading_order: javaJsonInt.nullable().default(null),
  confidence: javaJsonDouble.nullable().default(null),
  source_engine: z.string().nullable().default(null),
  source_engine_version: z.string().nullable().default(null),
  group_key: z.string().nullable().default(null),
};

/** TextBlockElement (CanonicalDocumentDto.java:102-115). */
export const canonicalTextBlockElementSchema = z.object({
  ...canonicalElementBase,
  role: z.string().nullable().default(null),
  heading_level: javaJsonInt.nullable().default(null),
});
export type CanonicalTextBlockElement = z.infer<typeof canonicalTextBlockElementSchema>;

/** TableElement (CanonicalDocumentDto.java:118-132). */
export const canonicalTableElementSchema = z.object({
  ...canonicalElementBase,
  rows: z.array(z.array(z.string())).nullable().default(null),
  row_count: javaJsonInt.nullable().default(null),
  column_count: javaJsonInt.nullable().default(null),
});
export type CanonicalTableElement = z.infer<typeof canonicalTableElementSchema>;

/** FigureElement (CanonicalDocumentDto.java:135-149). */
export const canonicalFigureElementSchema = z.object({
  ...canonicalElementBase,
  format: z.string().nullable().default(null),
  source_name: z.string().nullable().default(null),
  alt: z.string().nullable().default(null),
});
export type CanonicalFigureElement = z.infer<typeof canonicalFigureElementSchema>;

/** EquationElement (CanonicalDocumentDto.java:152-164). */
export const canonicalEquationElementSchema = z.object({
  ...canonicalElementBase,
  latex: z.string().nullable().default(null),
});
export type CanonicalEquationElement = z.infer<typeof canonicalEquationElementSchema>;

/** ProvenanceInfo (CanonicalDocumentDto.java:167-174) — extractionParams is Map<String,Object>. */
export const canonicalProvenanceInfoSchema = z.object({
  engine: z.string().nullable().default(null),
  engineVersion: z.string().nullable().default(null),
  extractedAt: z.string().nullable().default(null),
  extractionParams: z.record(z.string(), z.unknown()).nullable().default(null),
  application: z.string().nullable().default(null),
  schemaVersion: z.string().nullable().default(null),
});

/**
 * CanonicalDocumentDto (CanonicalDocumentDto.java:31-44) — the POST body of
 * /api/v1/teacher/content/documents (received as a raw JSON string and
 * parsed by Jackson; a non-parsing body → 400 InvalidDocumentException
 * "request body is not a canonical document (schema 1.0)"). This is the
 * BINDING layer; the acceptance contract beyond binding is
 * canonicalDocumentViolations below.
 */
export const canonicalDocumentSchema = z.object({
  documentId: z.string().nullable().default(null),
  schemaVersion: z.string().nullable().default(null),
  version: javaJsonInt.nullable().default(null) /* Integer (boxed) */,
  source: canonicalSourceInfoSchema.nullable().default(null),
  pageCount: javaJsonInt.nullable().default(null),
  pages: z.array(canonicalPageInfoSchema).nullable().default(null),
  sections: z.array(canonicalSectionInfoSchema).nullable().default(null),
  textBlocks: z.array(canonicalTextBlockElementSchema).nullable().default(null),
  tables: z.array(canonicalTableElementSchema).nullable().default(null),
  figures: z.array(canonicalFigureElementSchema).nullable().default(null),
  equations: z.array(canonicalEquationElementSchema).nullable().default(null),
  provenance: canonicalProvenanceInfoSchema.nullable().default(null),
  retrieval: canonicalRetrievalMetaSchema.nullable().default(null),
});
export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;

/** IngestionView (ContentDocumentController.java:195-197) — 201 body. */
export const documentIngestionViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  duplicate: z.boolean(),
  chunks: z.number().int(),
  elements: z.number().int(),
  pages: z.number().int(),
  kind: documentKindSchema /* kind.name() (line 75) */,
});
export type DocumentIngestionView = z.infer<typeof documentIngestionViewSchema>;

/** EmbeddingView (ContentDocumentController.java:214-216) — POST /{id}/embed body. */
export const documentEmbeddingViewSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string(),
  model: z.string().nullable() /* nullability: capture-unproven (EmbeddingResult.model) */,
  embedded: z.number().int(),
  skipped: z.number().int(),
  totalChunks: z.number().int(),
});
export type DocumentEmbeddingView = z.infer<typeof documentEmbeddingViewSchema>;

/**
 * derivedDocumentId — byte-exact port of CanonicalDocumentValidator.java:
 * 215-232 (which is itself the byte-exact mirror of the parser's
 * CanonicalIdentity, Master Spec §19): SHA-256 over
 * `sha256:<checksum>|engine:<engine>|version:<engineVersion>` (components
 * stripped + lowercased, null → ""), first 128 bits as a UUID with
 * version nibble 5 and RFC-4122 variant bits. JS trim() vs Java strip()
 * differ only on Unicode whitespace outside the BMP-1 range — irrelevant
 * for hex checksums/engine ids, noted for completeness.
 */
export function derivedDocumentId(
  checksumHex: string | null | undefined,
  engine: string | null | undefined,
  engineVersion: string | null | undefined,
): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const component = (value: string | null | undefined) =>
    value == null ? "" : value.trim().toLowerCase();
  const material =
    "sha256:" +
    component(checksumHex) +
    "|engine:" +
    component(engine) +
    "|version:" +
    component(engineVersion);
  const hash = createHash("sha256").update(material, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x50; // version 5
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Buffer.from(b).toString("hex");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}

const isBlank = (s: string | null | undefined) => s == null || s.trim() === "";

/**
 * canonicalDocumentViolations — constraint-for-constraint port of
 * CanonicalDocumentValidator.validate (lines 18-160). Every violation is
 * collected (never fail-fast — line 12-13: "one rejection lists them all")
 * so the v2 api can emit the SAME InvalidDocumentException 400 body as the
 * core. Order of violations follows the Java source order.
 */
export function canonicalDocumentViolations(doc: CanonicalDocument): string[] {
  const violations: string[] = [];
  const quote = (s: string | null | undefined) => (s == null ? "null" : `"${s}"`);

  if (doc.schemaVersion == null || doc.schemaVersion !== CANONICAL_DOCUMENT_SUPPORTED_SCHEMA) {
    violations.push(`schemaVersion must be "1.0" (was ${quote(doc.schemaVersion)})`);
  }
  if (isBlank(doc.documentId)) {
    violations.push("documentId is required");
  }
  if (doc.version == null || doc.version < 1) {
    violations.push(`version must be >= 1 (was ${doc.version ?? "null"})`);
  }

  if (doc.source == null) {
    violations.push("source is required");
  } else {
    if (isBlank(doc.source.uri)) violations.push("source.uri is required");
    if (isBlank(doc.source.checksum)) violations.push("source.checksum is required");
    if (isBlank(doc.source.mimeType)) violations.push("source.mimeType is required");
  }

  if (doc.pageCount == null || doc.pageCount < 1) {
    violations.push(`pageCount must be >= 1 (was ${doc.pageCount ?? "null"})`);
  }

  if (doc.provenance == null) {
    violations.push("provenance is required");
  } else {
    if (isBlank(doc.provenance.engine)) violations.push("provenance.engine is required");
    if (isBlank(doc.provenance.engineVersion)) {
      violations.push("provenance.engineVersion is required");
    }
    // P-6 mirror: documentId is DERIVED, not free-form (validator:63-76).
    if (
      !isBlank(doc.documentId) &&
      doc.source != null &&
      !isBlank(doc.source.checksum) &&
      !isBlank(doc.provenance.engine) &&
      !isBlank(doc.provenance.engineVersion)
    ) {
      const expected = derivedDocumentId(
        doc.source.checksum,
        doc.provenance.engine,
        doc.provenance.engineVersion,
      );
      if (expected !== doc.documentId) {
        violations.push(
          "documentId does not match its checksum+engine+" +
            `engineVersion derivation (expected ${expected})`,
        );
      }
    }
  }

  // retrieval identity (validator:79-95): optional as a whole; series must be
  // the canonical enum when present; year must be a plausible exam year.
  if (doc.retrieval != null) {
    const meta = doc.retrieval;
    if (
      meta.series != null &&
      !isBlank(meta.series) &&
      !["JAN", "JUN", "NOV"].includes(meta.series.trim())
    ) {
      violations.push(
        `retrieval.series must be JAN, JUN or NOV (was ${quote(meta.series)}) — ` +
          'canonicalize "Summer"→JUN, "October/November"→NOV before ingest',
      );
    }
    if (meta.year != null && (meta.year < 1950 || meta.year > 2100)) {
      violations.push(`retrieval.year must be a plausible exam year (was ${meta.year})`);
    }
  }

  // elements: shared id-universe across ALL families (validator:99-137)
  const seenIds = new Set<string>();
  const checkElement = (
    family: string,
    elementId: string | null | undefined,
    elementType: string | null | undefined,
    pageNumber: number | null | undefined,
    readingOrder: number | null | undefined,
    confidence: number | null | undefined,
    sourceEngine: string | null | undefined,
    sourceEngineVersion: string | null | undefined,
  ) => {
    let label = `${family} ${quote(elementId)}`;
    if (isBlank(elementId)) {
      violations.push(`${family} without element_id`);
      label = `${family} <blank-id>`;
    } else if (elementId != null && seenIds.has(elementId)) {
      violations.push(`duplicate element_id ${elementId}`);
    } else if (elementId != null) {
      seenIds.add(elementId);
    }
    if (isBlank(elementType)) violations.push(`${label}: element_type is required`);
    if (pageNumber == null) {
      violations.push(`${label}: page_number is required`);
    } else if (doc.pageCount == null || pageNumber < 1 || pageNumber > doc.pageCount) {
      violations.push(`${label}: page_number ${pageNumber} outside 1..${doc.pageCount ?? "null"}`);
    }
    if (readingOrder == null || readingOrder < 0) {
      violations.push(`${label}: reading_order must be >= 0 (was ${readingOrder ?? "null"})`);
    }
    if (confidence != null && (confidence < 0.0 || confidence > 1.0)) {
      violations.push(`${label}: confidence ${confidence} outside 0..1`);
    }
    if (isBlank(sourceEngine)) violations.push(`${label}: source_engine is required`);
    if (isBlank(sourceEngineVersion)) {
      violations.push(`${label}: source_engine_version is required`);
    }
  };

  for (const e of doc.textBlocks ?? []) {
    checkElement("textBlock", e.element_id, e.element_type, e.page_number, e.reading_order,
      e.confidence, e.source_engine, e.source_engine_version);
  }
  for (const e of doc.tables ?? []) {
    checkElement("table", e.element_id, e.element_type, e.page_number, e.reading_order,
      e.confidence, e.source_engine, e.source_engine_version);
  }
  for (const e of doc.equations ?? []) {
    checkElement("equation", e.element_id, e.element_type, e.page_number, e.reading_order,
      e.confidence, e.source_engine, e.source_engine_version);
  }
  for (const e of doc.figures ?? []) {
    checkElement("figure", e.element_id, e.element_type, e.page_number, e.reading_order,
      e.confidence, e.source_engine, e.source_engine_version);
  }

  // sections reference elements; a dangling reference breaks provenance (validator:139-153)
  for (const s of doc.sections ?? []) {
    if (s == null || isBlank(s.sectionId)) {
      violations.push("section without sectionId");
    } else if (s.elementIds != null) {
      for (const ref of s.elementIds) {
        if (ref != null && !seenIds.has(ref)) {
          violations.push(`section ${s.sectionId} references unknown element ${ref}`);
        }
      }
    }
  }

  return violations;
}

// ── ContentController review-action request bodies ─────────────────────────

/** PlaceRequest (ContentController.java:350) — @NotNull subjectId; missing/null → 400 validation_failed. */
export const paperPlaceRequestSchema = z.object({
  subjectId: z.string().uuid(),
});
export type PaperPlaceRequest = z.infer<typeof paperPlaceRequestSchema>;

/**
 * TopicMappingRequest (ContentController.java:261-264) — @NotNull
 * primaryNodeId; secondaryNodeIds is an unconstrained List<UUID> (null
 * binds; a non-uuid ELEMENT fails Jackson's UUID parse → 400).
 */
export const topicMappingRequestSchema = z.object({
  primaryNodeId: z.string().uuid(),
  secondaryNodeIds: z.array(z.string().uuid()).nullable().default(null),
});
export type TopicMappingRequest = z.infer<typeof topicMappingRequestSchema>;

/**
 * PointCriteriaUpdate (ContentController.java:345-347) — BOTH components
 * @NotNull: null/absent markPointId OR null/absent acceptanceCriteria →
 * 400; an EMPTY criteria list is fine (@NotNull, not @NotEmpty).
 */
export const pointCriteriaUpdateSchema = z.object({
  markPointId: z.string().uuid(),
  acceptanceCriteria: z.array(z.string()),
});
export type PointCriteriaUpdate = z.infer<typeof pointCriteriaUpdateSchema>;

/**
 * SchemeValidateRequest (ContentController.java:341-343) — the WHOLE BODY
 * is @RequestBody(required = false): no body at all = "validate the scheme
 * as-is" (controller:269-277). criteria null = same; generalGuidance null =
 * "leave any existing value untouched" (V34/G-3 javadoc).
 */
export const schemeValidateRequestSchema = z
  .object({
    criteria: z.array(pointCriteriaUpdateSchema).nullable().default(null),
    generalGuidance: z.string().nullable().default(null),
  })
  .nullable().default(null);
export type SchemeValidateRequest = z.infer<typeof schemeValidateRequestSchema>;

/**
 * validate-all `force` param (ContentController.java:178-179) — OPTIONAL
 * boxed Boolean: absent → null → false (Boolean.TRUE.equals), else Spring's
 * StringToBooleanConverter (trimmed true/false case-insensitive, anything
 * else → 400 binding). Same mirror as curriculum.ts includeArchived minus
 * the default.
 */
export const validateAllQuerySchema = z.object({
  force: z
    .preprocess(
      (v) => (v === undefined ? undefined : v),
      z
        .string()
        .refine((s) => /^(?:true|false)$/i.test(s.trim()), "must be a boolean")
        .transform((s) => s.trim().toLowerCase() === "true"),
    )
    .optional(),
});
export type ValidateAllQuery = z.infer<typeof validateAllQuerySchema>;

// ── ContentController review-action response views ─────────────────────────

/** VersionSummary (ContentController.java:318-324) — validate/reject/flag/unflag on question-versions. */
export const versionSummarySchema = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
  version: z.number().int(),
  validationState: validationStateSchema,
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;

/** SchemeSummary (ContentController.java:326-333) — validate/reject/flag/unflag on mark-schemes. */
export const schemeSummarySchema = z.object({
  id: z.string().uuid(),
  questionVersionId: z.string().uuid(),
  pointCount: z.number().int(),
  validationState: validationStateSchema,
});
export type SchemeSummary = z.infer<typeof schemeSummarySchema>;

/** BatchResult (ContentReviewService.java:692-695) — POST /exam-papers/{id}/validate-all. */
export const batchResultSchema = z.object({
  paperId: z.string().uuid(),
  paperState: validationStateSchema,
  totalVersions: z.number().int(),
  versionsValidated: z.number().int(),
  schemesValidated: z.number().int(),
});
export type BatchResult = z.infer<typeof batchResultSchema>;

/** TopicMappingResult (ContentReviewService.java:797-800) — POST /questions/{questionId}/topics. */
export const topicMappingResultSchema = z.object({
  questionId: z.string().uuid(),
  primaryNodeId: z.string().uuid(),
  primaryCode: z.string(),
  primaryTitle: z.string(),
  topicCount: z.number().int(),
});
export type TopicMappingResult = z.infer<typeof topicMappingResultSchema>;

/** TopicRowView reuse — see content.ts (already ported for the GET rows). */
export { topicRowViewSchema } from "./content";

// response aliases (the write actions return the read-side views verbatim)
export const paperActionResponseSchema = paperSummarySchema; // validate/reject/place/flag/unflag paper
export const nodeActionResponseSchema = knowledgeNodeViewSchema; // /nodes/{id}/validate|reject
export const curriculumVersionActionResponseSchema = curriculumOverviewSchema; // /versions/{id}/validate|archive
