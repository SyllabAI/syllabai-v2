/**
 * Content module composition root — builds every piece of the T-MIG-020
 * read-surface port from env, fail-fast (blank DATABASE_URL refuses boot —
 * requireDatabaseUrl parity, packages/db/src/client.ts). Mirrors the
 * identity module's assembly (services/identity/index.ts): one Neon
 * WebSocket session per repository instance, repositories over the observed
 * query surfaces, pure helpers exposed for golden-facing unit tests.
 *
 * Provider seam: SYLLABAI_EMBEDDING_GEMINI_API_KEY absent →
 * requireEmbeddingProvider() throws the verbatim ContentRetrievalService
 * IllegalStateException (:51-53) → the app error boundary renders 500
 * internal_error. There is deliberately NO silent fallback — an unkeyed
 * search fails loudly, exactly like the frozen core.
 *
 * Dependency direction (no runtime cycles): routes/content imports this
 * module TYPE-ONLY; this module imports the route builders at runtime.
 */
import type { Context, Hono } from "hono";
import type {
  CitationDocumentView,
  DocumentSummaryView,
  DocumentKind,
  PaperRef,
} from "@syllabai/contracts";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../identity/users";
import { getAuth } from "../../middleware/auth";
import {
  DocumentRepository,
  ExamPaperRepository,
  QuestionAssetRepository,
  GlmOcrBridgeRepository,
  ContentReviewAuditRepository,
} from "./repositories";
import {
  QuestionVersionReadRepository,
  MarkSchemeReadRepository,
  QuestionReadRepository,
  QuestionTopicReadRepository,
  KnowledgeNodeDisplayRepository,
} from "./review-repos";
import { CurriculumScopeResolver, type CurriculumScope } from "./scope";
import { ContentReviewService } from "./review";
import {
  ContentReviewWriteService,
  type TxSqlFn,
} from "./review-writes";
import {
  ingestCanonicalDocument,
  InvalidDocumentError,
  type IngestionResult,
} from "../ingestion/canonical";
import {
  ingestPastPaperDraft,
  type IngestionSummary,
} from "../ingestion/past-paper";
import {
  canonicalDocumentSchema,
  type PastPaperDraft,
} from "@syllabai/contracts";
import {
  searchServingEligible,
  diagnoseEmpty,
  embedDocument,
  resolveEmbeddingProvider,
  type ChunkHit,
  type EmbeddingProvider,
  type EmbeddingResult,
  type SearchEmptyDiagnostics,
} from "./retrieval";
import { documentPageText, toCitationView, paperRefOf } from "./reader";
import { toDocumentSummary } from "./review";
import {
  createTeacherContentRouter,
  createContentReaderRouter,
  createQuestionAssetRouter,
} from "../../routes/content";

export interface ContentReadApp {
  documents: DocumentRepository;
  questionAssets: QuestionAssetRepository;
  review: ContentReviewService;
  /** T-MIG-107 — the §7 write half (ContentReviewService mutations + audit). */
  writes: ContentReviewWriteService;
  /** POST /documents — the ContentIngestionService.ingest port (parse +
   * validate + checksum dedup + chunking in ONE transaction). */
  ingestDocument(
    kind: "QUESTION_PAPER" | "MARK_SCHEME" | "SYLLABUS" | "OTHER" | "TEXTBOOK" | "EXTERNAL_NOTES" | "EXTERNAL_QUESTIONS",
    rawJson: string,
    ingestedBy: string | null,
  ): Promise<IngestionResult>;
  /** POST /past-papers — the PastPaperIngestionService.ingest port (whole-draft,
   * single transaction). */
  ingestPastPaper(draft: PastPaperDraft, ingestedBy: string | null): Promise<IngestionSummary>;
  scope: CurriculumScopeResolver;
  /** @CurrentUserId parity — the authenticated caller's id (search scope). */
  requesterId(c: Context): string | null;
  /** Provider seam — throws the verbatim IllegalStateException when unkeyed. */
  requireEmbeddingProvider(): EmbeddingProvider;
  searchServingEligible(
    vector: number[],
    kind: DocumentKind | null,
    scope: CurriculumScope,
    limit: number,
  ): Promise<ChunkHit[]>;
  diagnoseEmpty(kind: DocumentKind | null, scope: CurriculumScope): Promise<SearchEmptyDiagnostics>;
  embedDocument(id: string, provider: EmbeddingProvider): Promise<EmbeddingResult>;
  pageText(doc: { canonicalJson: unknown }, page: number): string;
  paperRefOf(doc: Parameters<typeof paperRefOf>[0]): Promise<PaperRef | null>;
  toCitationView(
    doc: Parameters<typeof toCitationView>[0],
    page: number | null,
    text: string | null,
    paper: PaperRef | null,
  ): CitationDocumentView;
  toDocumentSummary(doc: Parameters<typeof toDocumentSummary>[0]): DocumentSummaryView;
}

export interface ContentRouters {
  app: ContentReadApp;
  /** "/api/v1/teacher/content" — ContentController + ContentDocumentController. */
  teacherRoute: Hono;
  /** "/api/v1/content/documents" — ContentReaderController. */
  readerRoute: Hono;
  /** "/api/v1/content/question-assets" — QuestionAssetController. */
  assetRoute: Hono;
}

export function buildContentApp(
  env: Record<string, string | undefined> = process.env,
): ContentRouters {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as TxSqlFn;
  const clock = { now: () => new Date() };

  const documents = new DocumentRepository(sql);
  const questionAssets = new QuestionAssetRepository(sql);
  const papers = new ExamPaperRepository(sql);
  const review = new ContentReviewService({
    papers,
    versions: new QuestionVersionReadRepository(sql),
    schemes: new MarkSchemeReadRepository(sql),
    questions: new QuestionReadRepository(sql),
    topics: new QuestionTopicReadRepository(sql),
    nodes: new KnowledgeNodeDisplayRepository(sql),
    bridges: new GlmOcrBridgeRepository(sql),
    audit: new ContentReviewAuditRepository(sql),
    documents,
  });
  const scope = new CurriculumScopeResolver(sql);
  const provider = resolveEmbeddingProvider(env);
  const writes = new ContentReviewWriteService({ sql, clock });

  const app: ContentReadApp = {
    documents,
    questionAssets,
    review,
    writes,
    ingestDocument: async (kind, rawJson, ingestedBy) => {
      // the ContentDocumentController.parse law (:180-191): a body that
      // fails Jackson binding answers 400 invalid_document with the fixed
      // client message — request-derived excerpts stay in the log
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson) as unknown;
      } catch {
        throw new InvalidDocumentError("request body is not a canonical document (schema 1.0)", []);
      }
      const bound = canonicalDocumentSchema.safeParse(parsed);
      if (!bound.success) {
        throw new InvalidDocumentError("request body is not a canonical document (schema 1.0)", []);
      }
      return sql.transaction((tx) =>
        ingestCanonicalDocument(tx, bound.data, rawJson, kind, ingestedBy, clock.now()),
      );
    },
    ingestPastPaper: (draft, ingestedBy) =>
      sql.transaction((tx) => ingestPastPaperDraft(tx, draft, ingestedBy)),
    scope,
    requesterId: (c: Context) => getAuth(c)?.userId ?? null,
    requireEmbeddingProvider: () => {
      if (!provider) {
        throw new Error(
          "no embedding provider configured — set SYLLABAI_EMBEDDING_GEMINI_API_KEY " +
            "(free tier, ADR-009); search is unavailable until keyed",
        );
      }
      return provider;
    },
    searchServingEligible: (vector, kind, s, limit) =>
      searchServingEligible(sql, vector, kind, s.curriculumVersionId, limit),
    diagnoseEmpty: (kind, s) => diagnoseEmpty(sql, kind, s.curriculumVersionId),
    embedDocument: (id, p) => embedDocument(sql, id, p, (rowId) => documents.findById(rowId)),
    pageText: (doc, page) => documentPageText(doc.canonicalJson, page),
    paperRefOf: (doc) =>
      paperRefOf(doc, (documentId) => papers.findAllByLinkedDocumentId(documentId)),
    toCitationView,
    toDocumentSummary,
  };

  return {
    app,
    teacherRoute: createTeacherContentRouter(app),
    readerRoute: createContentReaderRouter(app),
    assetRoute: createQuestionAssetRouter(app),
  };
}
