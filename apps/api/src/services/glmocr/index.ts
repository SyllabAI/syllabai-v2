/**
 * GlmOcrIngestion module composition root (T-MIG-089) — mirrors
 * buildCurriculumModule / buildContentApp: repos + the service built from an
 * injected sql adapter (structural SqlFn — ./sql), so the module stays
 * driver-agnostic through the T-MIG-014 dispatch.
 *
 * Write-band seam: `writePath` (the T-013 ContentIngestionService port +
 * the T-011 PastPaperIngestionService port) is NOT wired in this lane —
 * those ingestion services are separate porting families (the content write
 * surfaces answer 501 owned-by-T-MIG-023 today). Without it the module's
 * ingestPair is absent and the route answers the honest 501 after the
 * deterministic prefix; reviewFindingsForPaper is fully live over the
 * frozen glm_ocr_bridge_records table. Passing writePath (when the write
 * band lands) flips POST /pairs to the 201-backed port with ZERO route
 * changes — the full call sequence is already gated by tests over fakes.
 */
import {
  ExamPaperReadRepository,
  GlmOcrBridgeRepository,
  GlmOcrIngestionService,
  MarkPointReadRepository,
  MarkSchemeReadRepository,
  QuestionVersionReadRepository,
  type GlmOcrWritePath,
  type PairResult,
} from "./service";
import type { GlmOcrFindingView, GlmOcrPairRequest } from "@syllabai/contracts";
import type { SqlFn } from "./sql";

export {
  ExamPaperReadRepository,
  GlmOcrBridgeRepository,
  GlmOcrIngestionService,
  GlmOcrWritePathNotPortedError,
  MarkPointReadRepository,
  MarkSchemeReadRepository,
  QuestionVersionReadRepository,
  deserializeFindings,
  deserializeReconciliation,
  validateBundle,
} from "./service";
export type {
  BridgeRecordRow,
  ContentIngestionPort,
  DocumentStatus,
  PairResult,
  PastPaperIngestionPort,
  PaperStatus,
  ReconciliationStatus,
} from "./service";
export { assembleReviewFindings, BRIDGE_METHOD, duplicatePartLabelFindings, markPointRef, normalizePart, toPastPaperDraft } from "./draft-mapper";
export type { SqlFn } from "./sql";

/** What the route factory consumes (dependency-inverted for tests). */
export interface GlmOcrModule {
  /**
   * The controlled pair ingestion (POST /glm-ocr/pairs → 201). With the
   * writePath UNWIRED (this lane's composition — the T-013/T-011 write band
   * is unported) the call raises GlmOcrWritePathNotPortedError and the route
   * answers the honest 501 after binding + bundle validation (never a
   * fabricated 200).
   */
  ingestPair(pair: GlmOcrPairRequest, ingestedBy: string | null): Promise<PairResult>;
  /** The review surface (GET .../findings): null = missing bridge record. */
  findingsForPaper(paperId: string): Promise<GlmOcrFindingView[] | null>;
}

export function buildGlmOcrModule(
  sql: SqlFn,
  options: { writePath?: GlmOcrWritePath } = {},
): GlmOcrModule {
  const bridgeRecords = new GlmOcrBridgeRepository(sql);
  const service = new GlmOcrIngestionService(
    sql,
    bridgeRecords,
    new ExamPaperReadRepository(sql),
    new QuestionVersionReadRepository(sql),
    new MarkSchemeReadRepository(sql),
    new MarkPointReadRepository(sql),
    options.writePath ?? null,
  );
  return {
    ingestPair: (pair: GlmOcrPairRequest, ingestedBy: string | null) =>
      service.ingestPair(pair, ingestedBy),
    findingsForPaper: (paperId: string) => service.reviewFindingsForPaper(paperId),
  };
}
