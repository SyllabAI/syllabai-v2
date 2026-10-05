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
  const sql = createSql(databaseUrl);

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

  const app: ContentReadApp = {
    documents,
    questionAssets,
    review,
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
