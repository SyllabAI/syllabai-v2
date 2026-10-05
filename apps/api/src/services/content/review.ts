/**
 * Teacher content review READ projections — ported from the frozen
 * teacher/ContentController.java (read endpoints) +
 * teacher/ContentReviewService.java (read-only methods; verified
 * 2026-10-05, T-MIG-020). The WRITE surfaces (ingest, validate-*, place,
 * reject, flag/unflag, topics mapping POST, past-papers POST) are NOT in
 * T-MIG-020's title (MIGRATION_PLAN §5 Wave-2 READ scope) — the route layer
 * answers them with the honest 501 + owning-task id, never a fabricated 200.
 *
 * Parity notes:
 *   - v1 queue (ContentController.reviewQueue :82-91): SUGGESTED papers +
 *     findSuggested version/scheme counts from the enrichment maps.
 *     Ordering: the Java findSuggested is unordered (derived query); v1
 *     returns it as-is.
 *   - v2 (enrichedReviewQueue :424-441): baseEnrichment sorts reconciled-OK
 *     first, then confidence desc, fewer findings, newest (:590-596).
 *   - v3 (enrichedReviewQueueV3 :448-514): adds scheme-linkage ratio,
 *     mapping ratio, novel-topic count, mean confidence, fewer findings,
 *     newest, id (:516-525) + practicableTopicCount (primary topics of
 *     VALIDATED papers ∪ mapped topics of VALIDATED papers, :470-481).
 *   - suggestedVersionCount/suggestedSchemeCount (:598-610) derive from the
 *     enrichment, NOT from a separate count query — ported as pure
 *     functions (unit-tested).
 *   - rankReasons (:621-659) — only signals that actually hold; absent
 *     confidence is never stated; String.format("%.2f") rounding ported.
 *   - findingCount (:575-577): bridge.reviewFindings().split("\"source\"").length - 1
 *     — the literal count of "source" occurrences in the findings JSON.
 *   - provenance (ContentController.paperProvenance :139-159): fail-closed —
 *     every missing piece (paper row, either doc id blank, either latest
 *     document row) throws NotFoundException("provenance for exam paper", id).
 *   - questionTopicRows (:763-797): synthesizes the ingestion-anchor row
 *     when the question carries primary_topic_node_id but no primary
 *     question_topics row (V20 production-battery finding).
 */
import type {
  AuditRowView,
  DocumentSummaryView,
  EnrichedPaperSummary,
  EnrichedPaperSummaryV3,
  PaperProvenanceView,
  PaperReviewView,
  PaperSummary,
  ReviewQueueView,
  TopicRowView,
  ValidationState,
} from "@syllabai/contracts";
import { NotFoundException } from "../identity/errors";
import type { DocumentRepository, DocumentRow, ExamPaperRepository, ExamPaperRow } from "./repositories";
import {
  GlmOcrBridgeRepository,
  ContentReviewAuditRepository,
} from "./repositories";
import type {
  KnowledgeNodeDisplayRepository,
  MarkSchemeReadRepository,
  QuestionReadRepository,
  QuestionTopicReadRepository,
  QuestionVersionReadRepository,
} from "./review-repos";

/** Port of DocumentSummaryView.from (ContentDocumentController.java:205-211). */
export function toDocumentSummary(d: DocumentRow): DocumentSummaryView {
  return {
    id: d.id,
    documentId: d.documentId,
    docVersion: d.docVersion,
    kind: d.kind as DocumentSummaryView["kind"],
    title: d.fileName == null ? d.sourceUri : d.fileName,
    pageCount: d.pageCount,
    elementCount: d.elementCount,
    textElementCount: d.textElementCount,
    chunkCount: d.chunkCount,
    sourceEngine: d.sourceEngine,
    sourceEngineVersion: d.sourceEngineVersion,
    checksum: d.checksum,
    createdAt: d.createdAt,
  };
}

/** Port of ContentController.PaperSummary.from (:311-315). */
export function toPaperSummary(p: ExamPaperRow): PaperSummary {
  return {
    id: p.id,
    subjectId: p.subjectId,
    title: p.title,
    paperCode: p.paperCode,
    sessionLabel: p.sessionLabel,
    board: p.board,
    qualification: p.qualification,
    validationState: p.validationState as ValidationState,
  };
}

/** Port of suggestedVersionCount (:598-603) — pure. */
export function suggestedVersionCount(enriched: EnrichedPaperSummary[]): number {
  return enriched.reduce(
    (sum, p) => sum + (p.versionCount - p.validatedVersions - p.rejectedVersions - p.flaggedVersions),
    0,
  );
}

/** Port of suggestedSchemeCount (:605-610) — pure. */
export function suggestedSchemeCount(enriched: EnrichedPaperSummary[]): number {
  return enriched.reduce((sum, p) => sum + p.suggestedSchemes, 0);
}

/** Port of rankReasons (:621-659) — pure; only signals that hold are stated. */
export function rankReasons(
  p: EnrichedPaperSummary,
  totalQuestions: number,
  mappedQuestions: number,
  withScheme: number,
  novelTopicCount: number,
): string[] {
  const reasons: string[] = [];
  if (p.reconciliationStatus === "OK") reasons.push("bridge reconciled OK");
  if (totalQuestions > 0) {
    if (withScheme >= totalQuestions) {
      reasons.push(`mark scheme linked for all ${totalQuestions} question(s)`);
    } else if (withScheme > 0) {
      reasons.push(`mark scheme linked for ${withScheme}/${totalQuestions} question(s)`);
    } else {
      reasons.push("no mark scheme linked yet");
    }
    if (mappedQuestions >= totalQuestions) {
      reasons.push(`all ${totalQuestions} question(s) mapped to curriculum`);
    } else if (mappedQuestions > 0) {
      reasons.push(`${mappedQuestions}/${totalQuestions} question(s) mapped to curriculum`);
    }
  }
  if (novelTopicCount > 0) {
    reasons.push(
      `brings ${novelTopicCount} topic(s) not yet practicable from validated content`,
    );
  }
  if (p.avgExtractionConfidence != null) {
    reasons.push(`mean extraction confidence ${p.avgExtractionConfidence.toFixed(2)}`);
  }
  if (p.findingCount === 0 && p.reconciliationStatus === "OK") {
    reasons.push("no parser findings");
  }
  return reasons;
}

/** scheme-linkage ratio for ordering (:612-616) — no questions sorts last. */
function schemeRatio(p: EnrichedPaperSummaryV3): number {
  return p.totalQuestions === 0 ? -1 : p.questionsWithScheme / p.totalQuestions;
}

/** mapping ratio for ordering (:618-622). */
function mappingRatio(p: EnrichedPaperSummaryV3): number {
  return p.totalQuestions === 0 ? -1 : p.mappedQuestions / p.totalQuestions;
}

/**
 * Port of the v2 sort (:590-596): reconciled first, then confidence desc
 * (null = 0.0), fewer findings, newest. Comparator semantics preserved:
 * Java Comparator.comparing with reverseOrder on the double.
 */
export function sortEnrichedV2(papers: EnrichedPaperSummary[]): EnrichedPaperSummary[] {
  return [...papers].sort((a, b) => {
    const aOk = a.reconciliationStatus === "OK" ? 0 : 1;
    const bOk = b.reconciliationStatus === "OK" ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    const aConf = a.avgExtractionConfidence ?? 0.0;
    const bConf = b.avgExtractionConfidence ?? 0.0;
    if (aConf !== bConf) return bConf - aConf;
    if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Port of the v3 sort (:516-525): reconciled-OK first, schemeRatio desc,
 * mappingRatio desc, novelTopicCount asc, confidence desc, findings asc,
 * createdAt desc, id asc.
 */
export function sortEnrichedV3(papers: EnrichedPaperSummaryV3[]): EnrichedPaperSummaryV3[] {
  return [...papers].sort((a, b) => {
    const aOk = a.reconciliationStatus === "OK" ? 0 : 1;
    const bOk = b.reconciliationStatus === "OK" ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    const sr = schemeRatio(b) - schemeRatio(a);
    if (sr !== 0) return sr;
    const mr = mappingRatio(b) - mappingRatio(a);
    if (mr !== 0) return mr;
    if (a.novelTopicCount !== b.novelTopicCount) return a.novelTopicCount - b.novelTopicCount;
    const aConf = a.avgExtractionConfidence ?? 0.0;
    const bConf = b.avgExtractionConfidence ?? 0.0;
    if (aConf !== bConf) return bConf - aConf;
    if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
    const ct = b.createdAt.localeCompare(a.createdAt);
    if (ct !== 0) return ct;
    return a.id.localeCompare(b.id);
  });
}

/** Deps the review service needs — assembled once in index.ts. */
export interface ContentReviewDeps {
  papers: ExamPaperRepository;
  versions: QuestionVersionReadRepository;
  schemes: MarkSchemeReadRepository;
  questions: QuestionReadRepository;
  topics: QuestionTopicReadRepository;
  nodes: KnowledgeNodeDisplayRepository;
  bridges: GlmOcrBridgeRepository;
  audit: ContentReviewAuditRepository;
  documents: DocumentRepository;
}

export class ContentReviewService {
  constructor(private readonly d: ContentReviewDeps) {}

  /** Port of ContentController.reviewQueue (:82-91) — review-queue v1. */
  async reviewQueue(): Promise<ReviewQueueView> {
    const papers = await this.d.papers.findSuggested();
    const versionCounts = await this.d.versions.countByPaperAndState();
    const schemeCounts = await this.d.schemes.countByPaperAndState();
    const vByState = new Map<string, number>();
    for (const r of versionCounts) vByState.set(r.state, (vByState.get(r.state) ?? 0) + r.count);
    const sByState = new Map<string, number>();
    for (const r of schemeCounts) sByState.set(r.state, (sByState.get(r.state) ?? 0) + r.count);
    // Java: versions.size() / schemes.size() over the flat SUGGESTED lists —
    // the same totals the per-state groups carry.
    return {
      papers: papers.map(toPaperSummary),
      suggestedVersions: vByState.get("SUGGESTED") ?? 0,
      suggestedSchemes: sByState.get("SUGGESTED") ?? 0,
    };
  }

  /** Port of baseEnrichment (:524-597) — the shared v2/v3 enrichment. */
  private async baseEnrichment(): Promise<EnrichedPaperSummary[]> {
    const papers = await this.d.papers.findSuggested();
    const versionRows = await this.d.versions.countByPaperAndState();
    const schemeRows = await this.d.schemes.countByPaperAndState();
    const confidenceRows = await this.d.versions.avgExtractionConfidenceByPaper();

    const versionCounts = new Map<string, Map<string, number>>();
    for (const r of versionRows) {
      const m = versionCounts.get(r.paperId) ?? new Map<string, number>();
      m.set(r.state, (m.get(r.state) ?? 0) + r.count);
      versionCounts.set(r.paperId, m);
    }
    const schemeCounts = new Map<string, Map<string, number>>();
    for (const r of schemeRows) {
      const m = schemeCounts.get(r.paperId) ?? new Map<string, number>();
      m.set(r.state, (m.get(r.state) ?? 0) + r.count);
      schemeCounts.set(r.paperId, m);
    }
    const confidence = new Map<string, number>();
    for (const r of confidenceRows) confidence.set(r.paperId, r.avg);

    const enriched: EnrichedPaperSummary[] = [];
    for (const paper of papers) {
      const vc = versionCounts.get(paper.id);
      const sc = schemeCounts.get(paper.id);
      const bridge = await this.d.bridges.findByPaperId(paper.id);
      let findingCount = 0;
      if (bridge != null && bridge.reviewFindings != null) {
        findingCount = bridge.reviewFindings.split('"source"').length - 1;
      }
      const stateSum = (m: Map<string, number> | undefined) =>
        m == null ? 0 : [...m.values()].reduce((a, b) => a + b, 0);
      enriched.push({
        id: paper.id,
        subjectId: paper.subjectId,
        title: paper.title,
        paperCode: paper.paperCode,
        sessionLabel: paper.sessionLabel,
        board: paper.board,
        qualification: paper.qualification,
        validationState: paper.validationState as ValidationState,
        versionCount: stateSum(vc),
        validatedVersions: vc?.get("VALIDATED") ?? 0,
        rejectedVersions: vc?.get("REJECTED") ?? 0,
        flaggedVersions: vc?.get("FLAGGED") ?? 0,
        suggestedSchemes: sc?.get("SUGGESTED") ?? 0,
        reconciliationStatus: bridge?.reconciliationStatus ?? null,
        findingCount,
        avgExtractionConfidence: confidence.get(paper.id) ?? null,
        createdAt: paper.createdAt,
      });
    }
    return sortEnrichedV2(enriched);
  }

  /** Port of enrichedReviewQueue (:424-441) — review-queue v2. */
  async enrichedReviewQueue() {
    const enriched = await this.baseEnrichment();
    return {
      papers: enriched,
      suggestedVersions: suggestedVersionCount(enriched),
      suggestedSchemes: suggestedSchemeCount(enriched),
    };
  }

  /** Port of enrichedReviewQueueV3 (:448-514) — review-queue v3. */
  async enrichedReviewQueueV3() {
    const base = await this.baseEnrichment();

    const questionsWithScheme = new Map<string, number>();
    for (const r of await this.d.schemes.countQuestionsWithSchemesByPaper()) {
      questionsWithScheme.set(r.paperId, r.count);
    }
    const questionCensus = new Map<string, { total: number; mapped: number }>();
    for (const r of await this.d.questions.countAndMappedByPaper()) {
      questionCensus.set(r.paperId, { total: r.total, mapped: r.mapped });
    }
    const mappedTopicsByPaper = new Map<string, Set<string>>();
    for (const r of await this.d.topics.findMappingsByPaper()) {
      const s = mappedTopicsByPaper.get(r.paperId) ?? new Set<string>();
      s.add(r.nodeId);
      mappedTopicsByPaper.set(r.paperId, s);
    }

    // the topics the pilot can already practise (§1 census: both are node ids)
    const validatedIds = (await this.d.papers.findValidated()).map((p) => p.id);
    const practicableTopics = await this.d.questions.findDistinctPrimaryTopicsByPaperIds(
      validatedIds,
    );
    const validatedSet = new Set(validatedIds);
    for (const [paperId, topics] of mappedTopicsByPaper) {
      if (validatedSet.has(paperId)) {
        for (const t of topics) practicableTopics.add(t);
      }
    }

    const enriched: EnrichedPaperSummaryV3[] = base.map((p) => {
      const census = questionCensus.get(p.id) ?? { total: 0, mapped: 0 };
      const withScheme = questionsWithScheme.get(p.id) ?? 0;
      const novel = new Set(mappedTopicsByPaper.get(p.id) ?? []);
      for (const t of practicableTopics) novel.delete(t);
      return {
        ...p,
        totalQuestions: census.total,
        mappedQuestions: census.mapped,
        questionsWithScheme: withScheme,
        novelTopicCount: novel.size,
        rankReasons: rankReasons(p, census.total, census.mapped, withScheme, novel.size),
      };
    });

    return {
      papers: sortEnrichedV3(enriched),
      suggestedVersions: suggestedVersionCount(base),
      suggestedSchemes: suggestedSchemeCount(base),
      practicableTopicCount: practicableTopics.size,
    };
  }

  /** Port of paperReview (:866-879) — full review of one paper (read-only). */
  async paperReview(paperId: string): Promise<PaperReviewView> {
    const paper = await this.d.papers.findById(paperId);
    if (!paper) throw new NotFoundException("exam paper", paperId);
    const versionRows = await this.d.versions.findFullByPaperId(paperId);
    const versions: PaperReviewView["versions"] = [];
    for (const v of versionRows) {
      const scheme = await this.d.schemes.findFirstByQuestionVersionIdOrderByCreatedAtDesc(
        v.versionId,
      );
      const options = (await this.d.questions.findOptionsByQuestionId(v.questionId)).map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        correct: o.correct,
        misconceptionNodeId: o.misconceptionNodeId,
      }));
      const parts = (await this.d.versions.findPartsByVersionId(v.versionId)).map((p) => ({
        id: p.id,
        label: p.label,
        prompt: p.prompt,
        commandWord: p.commandWord,
        marks: p.marks,
      }));
      const points: PaperReviewView["versions"][number]["points"] = [];
      if (scheme) {
        for (const mp of await this.d.schemes.findPointsBySchemeId(scheme.id)) {
          let criteria: string[] = [];
          const raw = mp.acceptanceCriteria;
          if (Array.isArray(raw)) criteria = raw.map(String);
          else if (typeof raw === "string" && raw.trim() !== "") {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) criteria = parsed.map(String);
            } catch {
              criteria = [];
            }
          }
          points.push({
            id: mp.id,
            ref: mp.ref,
            text: mp.text,
            marks: mp.marks,
            acceptanceCriteria: criteria,
          });
        }
      }
      versions.push({
        versionId: v.versionId,
        questionId: v.questionId,
        externalRef: v.externalRef,
        type: v.questionType,
        stem: v.stem == null ? v.questionStem : v.stem,
        marks: v.marks > 0 ? v.marks : v.questionMarks,
        version: v.version,
        validationState: v.validationState as ValidationState,
        commandWord: v.commandWord,
        schemeId: scheme?.id ?? null,
        schemeState: (scheme?.validationState as ValidationState | undefined) ?? null,
        points,
        options,
        parts,
        extractionConfidence: v.extractionConfidence,
        extractionMethod: v.extractionMethod,
        sourceDocumentId: v.sourceDocumentId,
      });
    }
    return {
      paper: {
        id: paper.id,
        subjectId: paper.subjectId,
        title: paper.title,
        paperCode: paper.paperCode,
        sessionLabel: paper.sessionLabel,
        board: paper.board,
        qualification: paper.qualification,
        validationState: paper.validationState as ValidationState,
      },
      versions,
    };
  }

  /** Port of paperAudit (:810-826). */
  async paperAudit(paperId: string): Promise<AuditRowView[]> {
    const paper = await this.d.papers.findById(paperId);
    if (!paper) throw new NotFoundException("exam paper", paperId);
    const versionIds = (await this.d.versions.findByPaperId(paperId)).map((v) => v.id);
    const schemeIds = (await this.d.schemes.findByPaperId(paperId)).map((s) => s.id);
    const questionIds = (
      await this.d.questions.findAllByExamPaperIdOrderByDifficultyAsc(paperId)
    ).map((q) => q.id);
    const rows = await this.d.audit.findPaperAudit(paperId, versionIds, schemeIds, questionIds);
    return rows.map((r) => ({
      occurredAt: r.occurredAt,
      actor: r.actorLabel,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      fromState: r.fromState,
      toState: r.toState,
      detail: r.detail,
    }));
  }

  /** Port of ContentController.paperProvenance (:139-159) — fail-closed. */
  async paperProvenance(paperId: string): Promise<PaperProvenanceView> {
    const paper = await this.d.papers.findById(paperId);
    if (!paper) throw new NotFoundException("exam paper", paperId);
    const qpDocId = paper.questionPaperDocumentId;
    const msDocId = paper.markSchemeDocumentId;
    if (
      qpDocId == null ||
      qpDocId.trim() === "" ||
      msDocId == null ||
      msDocId.trim() === ""
    ) {
      throw new NotFoundException("provenance for exam paper", paperId);
    }
    const qp = await this.d.documents.findTopByDocumentIdOrderByDocVersionDesc(qpDocId);
    if (!qp) throw new NotFoundException("provenance for exam paper", paperId);
    const ms = await this.d.documents.findTopByDocumentIdOrderByDocVersionDesc(msDocId);
    if (!ms) throw new NotFoundException("provenance for exam paper", paperId);
    return {
      paperId: paper.id,
      questionPaper: {
        documentId: qp.documentId,
        fileName: qp.fileName,
        sourceUri: qp.sourceUri,
        checksum: qp.checksum,
        checksumAlgorithm: qp.checksumAlgorithm,
      },
      markScheme: {
        documentId: ms.documentId,
        fileName: ms.fileName,
        sourceUri: ms.sourceUri,
        checksum: ms.checksum,
        checksumAlgorithm: ms.checksumAlgorithm,
      },
    };
  }

  /**
   * Port of questionTopicRows (:763-797) — with the V20 anchor-synthesis:
   * ingested questions carry their anchor ONLY in primary_topic_node_id, so
   * a question with no primary question_topics row still shows its anchor.
   */
  async questionTopicRows(questionId: string): Promise<TopicRowView[]> {
    const question = await this.d.questions.findById(questionId);
    if (!question) throw new NotFoundException("question", questionId);
    const topicRows = await this.d.topics.findByQuestionId(questionId);
    const rows: TopicRowView[] = [];
    for (const row of topicRows) {
      const node = await this.d.nodes.findById(row.nodeId);
      rows.push({
        nodeId: row.nodeId,
        primary: row.primary,
        code: node?.code ?? null,
        title: node?.title ?? null,
      });
    }
    const hasPrimaryRow = rows.some((r) => r.primary);
    if (!hasPrimaryRow && question.primaryTopicNodeId != null) {
      const anchor = question.primaryTopicNodeId;
      const node = await this.d.nodes.findById(anchor);
      const anchorRow: TopicRowView = {
        nodeId: anchor,
        primary: true,
        code: node?.code ?? null,
        title: node?.title ?? null,
      };
      const out = [anchorRow, ...rows.filter((r) => !r.primary)];
      return out;
    }
    return rows;
  }
}
