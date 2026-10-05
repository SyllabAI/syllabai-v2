/**
 * ContentReviewService read-model port — the teacher content-review surfaces
 * (T-MIG-020 tranche 2). Ports the READ half of the frozen
 * ContentReviewService.java (946 lines) + the controller-inline views of
 * ContentController.java; every WRITE path (validate/reject/flag/place/
 * map-topics/ingest) stays an honest 501 at the route layer (tranche 3) and
 * never reaches this module — wave 2 is read-only.
 *
 * Route parity map (all under /api/v1/teacher/content, TEACHER/ADMIN gate —
 * the role gate lives in the route layer; this module owns the CONTENT law):
 *   GET /review-queue            → reviewQueue()        (controller :82-91)
 *   GET /review-queue-v2         → enrichedReviewQueue()  (service :431-435)
 *   GET /review-queue-v3         → enrichedReviewQueueV3()(:455-515)
 *   GET /exam-papers/{id}/review → paperReview(id)      (:866-879)
 *   GET /exam-papers/{id}/audit  → paperAudit(id)       (:810-821)
 *   GET /exam-papers/{id}/provenance → paperProvenance(id) (controller :140-159)
 *   GET /questions/{id}/topics   → questionTopicRows(id) (service :763-795)
 *
 * Captured golden cases pinned (T-MIG-004 run-002, seed state): review-queue
 * v1/v2 200 {papers:[],suggestedVersions:0,suggestedSchemes:0}; v3 200 adds
 * practicableTopicCount:0; unknown paper → 404 "exam paper <id> not found"
 * (review/audit/provenance alike); unknown question → 404 "question <id> not
 * found". The real-data tranche (F-5, Neon PAT unblocked 2026-10-05) will
 * exercise the enrichment math on populated stores.
 */
import type {
  AuditRow,
  ExamPaperRow,
  KnowledgeNodeRow,
  MarkPointRow,
  MarkSchemeRow,
  QuestionOptionRow,
  QuestionPartRow,
  QuestionRow,
  QuestionVersionRow,
} from "./assessment";
import {
  ContentReviewAuditRepository,
  GlmOcrBridgeRecordsRepository,
  KnowledgeNodesRepository,
  MarkSchemesRepository,
  QuestionTopicsRepository,
  QuestionsRepository,
  QuestionVersionsRepository,
  loadMarkPoints,
  loadOptions,
  loadParts,
} from "./assessment";
import { NotFoundException } from "../identity/errors";
import { iso, type DocumentRow, type DocumentsRepository } from "./documents";
import type { SqlFn } from "./sql";

// ── wire views (Jackson record serialization, field names verbatim) ────────

/** PaperSummary (ContentController.java:307-316). */
export interface PaperSummary {
  id: string;
  subjectId: string;
  title: string;
  paperCode: string | null;
  sessionLabel: string | null;
  board: string;
  qualification: string;
  validationState: string;
}

/** ReviewQueueView (ContentController.java:303-305). */
export interface ReviewQueueView {
  papers: PaperSummary[];
  suggestedVersions: number;
  suggestedSchemes: number;
}

/** EnrichedPaperSummary (ContentReviewService.java:835-843). */
export interface EnrichedPaperSummary {
  id: string;
  subjectId: string;
  title: string;
  paperCode: string | null;
  sessionLabel: string | null;
  board: string;
  qualification: string;
  validationState: string;
  versionCount: number;
  validatedVersions: number;
  rejectedVersions: number;
  flaggedVersions: number;
  suggestedSchemes: number;
  reconciliationStatus: string | null;
  findingCount: number;
  avgExtractionConfidence: number | null;
  createdAt: string;
}

/** EnrichedReviewQueueView (:845-847). */
export interface EnrichedReviewQueueView {
  papers: EnrichedPaperSummary[];
  suggestedVersions: number;
  suggestedSchemes: number;
}

/**
 * EnrichedPaperSummaryV3 (:656-667) — FLAT by design: every v2 signal plus
 * the §7 reviewability/value signals and the rank reasons (records serialize
 * their components; a nested base would hide the v2 fields).
 */
export interface EnrichedPaperSummaryV3 extends EnrichedPaperSummary {
  totalQuestions: number;
  mappedQuestions: number;
  questionsWithScheme: number;
  novelTopicCount: number;
  rankReasons: string[];
}

/** EnrichedReviewQueueViewV3 (:686-689). */
export interface EnrichedReviewQueueViewV3 {
  papers: EnrichedPaperSummaryV3[];
  suggestedVersions: number;
  suggestedSchemes: number;
  practicableTopicCount: number;
}

/** PaperHeader (:919-922). */
export interface PaperHeader {
  id: string;
  subjectId: string;
  title: string;
  paperCode: string | null;
  sessionLabel: string | null;
  board: string;
  qualification: string;
  validationState: string;
}

/** OptionReview (:933-935) — teacher-only: correct flag + misconception. */
export interface OptionReview {
  id: string;
  label: string;
  text: string;
  correct: boolean;
  misconceptionNodeId: string | null;
}

/** PartReview (:937-939). */
export interface PartReview {
  id: string;
  label: string;
  prompt: string;
  commandWord: string | null;
  marks: number;
}

/** PointReview (:942-944) — the deterministic marking contract per point. */
export interface PointReview {
  id: string;
  ref: string | null;
  text: string;
  marks: number;
  acceptanceCriteria: string[];
}

/** VersionReviewView (:925-930) — full answer key for the reviewer. */
export interface VersionReviewView {
  versionId: string;
  questionId: string;
  externalRef: string | null;
  type: string;
  stem: string;
  marks: number;
  version: number;
  validationState: string;
  commandWord: string | null;
  schemeId: string | null;
  schemeState: string | null;
  points: PointReview[];
  options: OptionReview[];
  parts: PartReview[];
  extractionConfidence: number | null;
  extractionMethod: string | null;
  sourceDocumentId: string | null;
}

/** PaperReviewView (:917-923). */
export interface PaperReviewView {
  paper: PaperHeader;
  versions: VersionReviewView[];
}

/** AuditRowView (:823-832) — NOTE the wire name is `actor`, not actorLabel. */
export interface AuditRowView {
  occurredAt: string | null;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  fromState: string | null;
  toState: string | null;
  detail: string;
}

/** TopicRowView (:801-802). */
export interface TopicRowView {
  nodeId: string;
  primary: boolean;
  code: string | null;
  title: string | null;
}

/** DocumentIdentity (ContentController.java:162-164). */
export interface DocumentIdentity {
  documentId: string;
  fileName: string | null;
  sourceUri: string;
  checksum: string;
  checksumAlgorithm: string;
}

/** PaperProvenanceView (:167-169) — never a serving or validation authority. */
export interface PaperProvenanceView {
  paperId: string;
  questionPaper: DocumentIdentity;
  markScheme: DocumentIdentity;
}

// ── mapping + ordering helpers ─────────────────────────────────────────────

/** PaperSummary.from (:311-315). */
export function paperSummaryView(p: ExamPaperRow): PaperSummary {
  return {
    id: p.id,
    subjectId: p.subjectId,
    title: p.title,
    paperCode: p.paperCode,
    sessionLabel: p.sessionLabel,
    board: p.board,
    qualification: p.qualification,
    validationState: p.validationState,
  };
}

/**
 * Java String.format("%.2f") — fixed two decimals, HALF_UP on ties. JS
 * toFixed matches for the values the enrichment produces (0..1 doubles);
 * boundary ties (…5 exactly at the binary limit) are avoided by the data.
 */
const format2f = (c: number): string => c.toFixed(2);

/**
 * java.util.UUID.compareTo — msb/lsb compared as SIGNED 64-bit halves. This
 * is the v3 final tie-break (:511), not string order; implemented exactly.
 */
export function compareUuid(a: string, b: string): number {
  const half = (hex: string): bigint => {
    const v = BigInt("0x" + hex);
    return v >= BigInt("0x8000000000000000")
      ? v - BigInt("0x10000000000000000")
      : v;
  };
  const A = a.replace(/-/g, "");
  const B = b.replace(/-/g, "");
  const am = half(A.slice(0, 16));
  const bm = half(B.slice(0, 16));
  if (am !== bm) return am < bm ? -1 : 1;
  const al = half(A.slice(16));
  const bl = half(B.slice(16));
  if (al !== bl) return al < bl ? -1 : 1;
  return 0;
}

/**
 * The §7 rank reasons (:612-648) — only signals that actually hold, in the
 * priority order the queue sorts by. Never a fabricated number; absent
 * confidence is simply not stated.
 */
function rankReasons(
  p: EnrichedPaperSummary,
  totalQuestions: number,
  mappedQuestions: number,
  withScheme: number,
  novelTopicCount: number,
): string[] {
  const reasons: string[] = [];
  if (p.reconciliationStatus === "OK") {
    reasons.push("bridge reconciled OK");
  }
  if (totalQuestions > 0) {
    if (withScheme >= totalQuestions) {
      reasons.push(`mark scheme linked for all ${totalQuestions} question(s)`);
    } else if (withScheme > 0) {
      reasons.push(
        `mark scheme linked for ${withScheme}/${totalQuestions} question(s)`,
      );
    } else {
      reasons.push("no mark scheme linked yet");
    }
    if (mappedQuestions >= totalQuestions) {
      reasons.push(`all ${totalQuestions} question(s) mapped to curriculum`);
    } else if (mappedQuestions > 0) {
      reasons.push(
        `${mappedQuestions}/${totalQuestions} question(s) mapped to curriculum`,
      );
    }
  }
  if (novelTopicCount > 0) {
    reasons.push(
      `brings ${novelTopicCount} topic(s) not yet practicable from validated content`,
    );
  }
  if (p.avgExtractionConfidence != null) {
    reasons.push(`mean extraction confidence ${format2f(p.avgExtractionConfidence)}`);
  }
  if (p.findingCount === 0 && p.reconciliationStatus === "OK") {
    reasons.push("no parser findings");
  }
  return reasons;
}

/** scheme-linkage ratio for ordering (:596-599) — no questions sorts last. */
const schemeRatio = (p: EnrichedPaperSummaryV3): number =>
  p.totalQuestions === 0 ? -1.0 : p.questionsWithScheme / p.totalQuestions;

/** mapping ratio for ordering (:602-605). */
const mappingRatio = (p: EnrichedPaperSummaryV3): number =>
  p.totalQuestions === 0 ? -1.0 : p.mappedQuestions / p.totalQuestions;

/** versions still awaiting a decision, from the enrichment already computed */
function suggestedVersionCount(enriched: EnrichedPaperSummary[]): number {
  return enriched.reduce(
    (sum, p) =>
      sum + (p.versionCount - p.validatedVersions - p.rejectedVersions - p.flaggedVersions),
    0,
  );
}

/** schemes still awaiting a decision, from the enrichment already computed */
function suggestedSchemeCount(enriched: EnrichedPaperSummary[]): number {
  return enriched.reduce((sum, p) => sum + p.suggestedSchemes, 0);
}

/** the v2 ordering comparator (:570-577) — stable sort keeps findSuggested order */
function compareV2(a: EnrichedPaperSummary, b: EnrichedPaperSummary): number {
  const ok = (p: EnrichedPaperSummary) => (p.reconciliationStatus === "OK" ? 0 : 1);
  if (ok(a) !== ok(b)) return ok(a) - ok(b);
  const ca = a.avgExtractionConfidence ?? 0.0;
  const cb = b.avgExtractionConfidence ?? 0.0;
  if (ca !== cb) return cb - ca; // confidence desc, null sorts as 0.0
  if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
  return b.createdAt.localeCompare(a.createdAt); // newest first (ISO strings)
}

/**
 * the v3 ordering comparator (:500-511) — its OWN chain (not v2's): OK-first,
 * scheme-linkage ratio, mapping ratio, novel topics, confidence, findings,
 * newest, then the Java-UUID tie-break. Stable sort keeps findSuggested order
 * for full ties (documented in the v2 comparator note).
 */
function compareV3(a: EnrichedPaperSummaryV3, b: EnrichedPaperSummaryV3): number {
  const ok = (p: { reconciliationStatus: string | null }) =>
    p.reconciliationStatus === "OK" ? 0 : 1;
  if (ok(a) !== ok(b)) return ok(a) - ok(b);
  const sr = schemeRatio(b) - schemeRatio(a);
  if (sr !== 0) return sr;
  const mr = mappingRatio(b) - mappingRatio(a);
  if (mr !== 0) return mr;
  if (a.novelTopicCount !== b.novelTopicCount) return a.novelTopicCount - b.novelTopicCount;
  const ca = a.avgExtractionConfidence ?? 0.0;
  const cb = b.avgExtractionConfidence ?? 0.0;
  if (ca !== cb) return cb - ca;
  if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
  if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
  return compareUuid(a.id, b.id);
}

/** jsonb acceptance criteria → the List<String> the Java entity carries. */
function parseCriteria(raw: unknown): string[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("stored mark-point acceptance criteria failed to parse");
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error("stored mark-point acceptance criteria is not a list");
  }
  return parsed.map((item) => String(item));
}

// ── the service ─────────────────────────────────────────────────────────────

export class ContentReviewService {
  constructor(
    private readonly sql: SqlFn,
    private readonly examPapers: {
      findById(id: string): Promise<ExamPaperRow | null>;
      findSuggested(): Promise<ExamPaperRow[]>;
      findValidated(): Promise<ExamPaperRow[]>;
    },
    private readonly questionVersions: QuestionVersionsRepository,
    private readonly markSchemes: MarkSchemesRepository,
    private readonly questions: QuestionsRepository,
    private readonly questionTopics: QuestionTopicsRepository,
    private readonly knowledgeNodes: KnowledgeNodesRepository,
    private readonly bridgeRecords: GlmOcrBridgeRecordsRepository,
    private readonly reviewAudit: ContentReviewAuditRepository,
    private readonly documents: DocumentsRepository,
  ) {}

  /** v1 review queue (ContentController.java:82-91) — the exact three calls. */
  async reviewQueue(): Promise<ReviewQueueView> {
    const papers = await this.examPapers.findSuggested();
    const versions = await this.questionVersions.findSuggested();
    const schemes = await this.markSchemes.findSuggested();
    return {
      papers: papers.map(paperSummaryView),
      suggestedVersions: versions.length,
      suggestedSchemes: schemes.length,
    };
  }

  /**
   * v2 quality-enriched review queue (:431-435 + baseEnrichment :518-579).
   * The bridge lookup stays a PER-PAPER call — the application-issued call
   * sequence is parity (see assessment.ts fetch-strategy note).
   */
  async enrichedReviewQueue(): Promise<EnrichedReviewQueueView> {
    const enriched = await this.baseEnrichment();
    return {
      papers: enriched,
      suggestedVersions: suggestedVersionCount(enriched),
      suggestedSchemes: suggestedSchemeCount(enriched),
    };
  }

  /** the v2 enrichment over the SUGGESTED papers (shared by v2 and v3). */
  private async baseEnrichment(): Promise<EnrichedPaperSummary[]> {
    const papers = await this.examPapers.findSuggested();

    // one aggregate query each, grouped per paper in memory (:521-542);
    // rows with a null paper id (questions outside any paper) are grouped
    // by the frozen query too but never looked up — dropped here, identical.
    const versionCounts = new Map<string, Map<string, number>>();
    for (const r of await this.questionVersions.countByPaperAndState()) {
      if (r.paperId == null) continue;
      const m = versionCounts.get(r.paperId) ?? new Map<string, number>();
      m.set(r.state, (m.get(r.state) ?? 0) + r.count);
      versionCounts.set(r.paperId, m);
    }
    const schemeCounts = new Map<string, Map<string, number>>();
    for (const r of await this.markSchemes.countByPaperAndState()) {
      if (r.paperId == null) continue;
      const m = schemeCounts.get(r.paperId) ?? new Map<string, number>();
      m.set(r.state, (m.get(r.state) ?? 0) + r.count);
      schemeCounts.set(r.paperId, m);
    }
    const confidence = new Map<string, number>();
    for (const r of await this.questionVersions.avgExtractionConfidenceByPaper()) {
      if (r.paperId == null) continue;
      confidence.set(r.paperId, r.avgConfidence);
    }

    const enriched: EnrichedPaperSummary[] = [];
    for (const paper of papers) {
      const vc = versionCounts.get(paper.id) ?? new Map<string, number>();
      const sc = schemeCounts.get(paper.id) ?? new Map<string, number>();
      const bridge = await this.bridgeRecords.findByPaperId(paper.id);
      let findingCount = 0;
      if (bridge != null && bridge.reviewFindings != null) {
        findingCount = bridge.reviewFindings.split('"source"').length - 1;
      }
      let versionCount = 0;
      for (const c of vc.values()) versionCount += c;
      enriched.push({
        id: paper.id,
        subjectId: paper.subjectId,
        title: paper.title,
        paperCode: paper.paperCode,
        sessionLabel: paper.sessionLabel,
        board: paper.board,
        qualification: paper.qualification,
        validationState: paper.validationState,
        versionCount,
        validatedVersions: vc.get("VALIDATED") ?? 0,
        rejectedVersions: vc.get("REJECTED") ?? 0,
        flaggedVersions: vc.get("FLAGGED") ?? 0,
        suggestedSchemes: sc.get("SUGGESTED") ?? 0,
        reconciliationStatus: bridge == null ? null : bridge.reconciliationStatus,
        findingCount,
        avgExtractionConfidence: confidence.get(paper.id) ?? null,
        createdAt: iso(paper.createdAt),
      });
    }

    enriched.sort(compareV2);
    return enriched;
  }

  /**
   * v3 (:455-515) — the v2 enrichment PLUS mark-scheme linkage, curriculum
   * mapping coverage and novel-coverage signals, each paper carrying its
   * human-legible rank REASONS. Deterministic ordering — a triage aid that
   * never promotes anything or weakens any gate.
   */
  async enrichedReviewQueueV3(): Promise<EnrichedReviewQueueViewV3> {
    const base = await this.baseEnrichment();

    // §7 signals — one batched query each, grouped per paper in memory
    const questionsWithScheme = new Map<string, number>();
    for (const r of await this.markSchemes.countQuestionsWithSchemesByPaper()) {
      questionsWithScheme.set(r.paperId, r.count);
    }
    const questionCensus = new Map<string, { total: number; mapped: number }>();
    for (const r of await this.questions.countAndMappedByPaper()) {
      questionCensus.set(r.paperId, { total: r.total, mapped: r.mapped });
    }
    const mappedTopicsByPaper = new Map<string, Set<string>>();
    for (const r of await this.questionTopics.findMappingsByPaper()) {
      const set = mappedTopicsByPaper.get(r.paperId) ?? new Set<string>();
      set.add(r.nodeId);
      mappedTopicsByPaper.set(r.paperId, set);
    }

    // the topics the pilot can already practise: primary topics AND mapped
    // topics of every VALIDATED paper's questions (:477-485)
    const validatedIds = (await this.examPapers.findValidated()).map((p) => p.id);
    const practicableTopics = new Set<string>(
      await this.questions.findDistinctPrimaryTopicsByPaperIds(validatedIds),
    );
    for (const [paperId, topics] of mappedTopicsByPaper) {
      if (validatedIds.includes(paperId)) {
        for (const t of topics) practicableTopics.add(t);
      }
    }

    const enriched: EnrichedPaperSummaryV3[] = [];
    for (const p of base) {
      const census = questionCensus.get(p.id) ?? { total: 0, mapped: 0 };
      const withScheme = questionsWithScheme.get(p.id) ?? 0;
      const novel = new Set(mappedTopicsByPaper.get(p.id) ?? []);
      for (const t of practicableTopics) novel.delete(t);
      enriched.push({
        ...p,
        totalQuestions: census.total,
        mappedQuestions: census.mapped,
        questionsWithScheme: withScheme,
        novelTopicCount: novel.size,
        rankReasons: rankReasons(p, census.total, census.mapped, withScheme, novel.size),
      });
    }

    enriched.sort(compareV3);

    return {
      papers: enriched,
      suggestedVersions: suggestedVersionCount(base),
      suggestedSchemes: suggestedSchemeCount(base),
      practicableTopicCount: practicableTopics.size,
    };
  }

  /**
   * Full review view of one paper (:866-879) — every question version with
   * its content, answer key and mark-scheme state. Still a read-only
   * projection: no serving-boundary change, SUGGESTED content remains
   * un-servable for learners.
   */
  async paperReview(paperId: string): Promise<PaperReviewView> {
    const paper = await this.examPapers.findById(paperId);
    if (paper == null) {
      throw new NotFoundException("exam paper", paperId);
    }
    const versions = await this.questionVersions.findByPaperId(paperId);
    const questionIds = [...new Set(versions.map((v) => v.questionId))];
    const [questionMap, optionMap, partMap, schemeMap] = await Promise.all([
      this.questions.findByIds(questionIds),
      loadOptions(this.sql, questionIds),
      loadParts(this.sql, versions.map((v) => v.id)),
      this.markSchemes.findFirstByQuestionVersionIds(versions.map((v) => v.id)),
    ]);
    const schemeIds = [...schemeMap.values()].map((s) => s.id);
    const pointMap = await loadMarkPoints(this.sql, schemeIds);

    const reviewViews = versions.map((v) =>
      this.toVersionReviewView(v, questionMap, optionMap, partMap, schemeMap, pointMap),
    );
    return {
      paper: {
        id: paper.id,
        subjectId: paper.subjectId,
        title: paper.title,
        paperCode: paper.paperCode,
        sessionLabel: paper.sessionLabel,
        board: paper.board,
        qualification: paper.qualification,
        validationState: paper.validationState,
      },
      versions: reviewViews,
    };
  }

  /** toVersionReviewView (:881-911) — stem/marks fallbacks are load-bearing. */
  private toVersionReviewView(
    version: QuestionVersionRow,
    questionMap: Map<string, QuestionRow>,
    optionMap: Map<string, QuestionOptionRow[]>,
    partMap: Map<string, QuestionPartRow[]>,
    schemeMap: Map<string, MarkSchemeRow>,
    pointMap: Map<string, MarkPointRow[]>,
  ): VersionReviewView {
    const question = questionMap.get(version.questionId);
    if (question == null) {
      // FK question_versions.question_id NOT NULL — a missing parent is a
      // corrupted store; fail loud server-side, never echo row content (R10)
      throw new Error(`parent question row missing for version ${version.id}`);
    }
    const scheme = schemeMap.get(version.id) ?? null;
    const points: PointReview[] =
      scheme == null
        ? []
        : (pointMap.get(scheme.id) ?? []).map((mp) => ({
            id: mp.id,
            ref: mp.ref,
            text: mp.text,
            marks: mp.marks,
            acceptanceCriteria: parseCriteria(mp.acceptanceCriteria),
          }));
    return {
      versionId: version.id,
      questionId: question.id,
      externalRef: question.externalRef,
      type: question.questionType,
      stem: version.stem == null ? question.stem : version.stem,
      marks: version.marks > 0 ? version.marks : question.marks,
      version: version.version,
      validationState: version.validationState,
      commandWord: version.commandWord,
      schemeId: scheme == null ? null : scheme.id,
      schemeState: scheme == null ? null : scheme.validationState,
      points,
      options: (optionMap.get(question.id) ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        text: o.optionText,
        correct: o.isCorrect,
        misconceptionNodeId: o.misconceptionNodeId,
      })),
      parts: (partMap.get(version.id) ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        prompt: p.prompt,
        commandWord: p.commandWord,
        marks: p.marks,
      })),
      extractionConfidence: version.extractionConfidence,
      extractionMethod: version.extractionMethod,
      sourceDocumentId: version.sourceDocumentId,
    };
  }

  /**
   * V22 audit history (:810-821) — the paper's own rows plus every row of
   * its question versions, mark schemes and questions; the reviewer sees
   * WHO decided WHAT and WHEN.
   */
  async paperAudit(paperId: string): Promise<AuditRowView[]> {
    const paper = await this.examPapers.findById(paperId);
    if (paper == null) {
      throw new NotFoundException("exam paper", paperId);
    }
    const versionIds = (await this.questionVersions.findByPaperId(paperId)).map((v) => v.id);
    const schemeIds = (await this.markSchemes.findByPaperId(paperId)).map((s) => s.id);
    const questionIds = (
      await this.questions.findAllByExamPaperIdOrderByDifficultyAsc(paperId)
    ).map((q) => q.id);
    const rows = await this.reviewAudit.findPaperAudit(
      paperId,
      versionIds,
      schemeIds,
      questionIds,
    );
    return rows.map((r) => this.auditRowView(r));
  }

  /** AuditRowView.from (:826-832) — occurredAt null-guarded, actor renamed. */
  private auditRowView(row: AuditRow): AuditRowView {
    return {
      occurredAt: iso(row.occurredAt),
      actor: row.actorLabel,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      fromState: row.fromState,
      toState: row.toState,
      detail: row.detail,
    };
  }

  /**
   * Provenance view (ContentController.java:140-159) — the source identities
   * that pin the original QP/MS files. Fail-closed: a paper whose QP or MS
   * document row is missing has no provenance to expose.
   */
  async paperProvenance(paperId: string): Promise<PaperProvenanceView> {
    const paper = await this.examPapers.findById(paperId);
    if (paper == null) {
      throw new NotFoundException("exam paper", paperId);
    }
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
    // the content store keeps one row per doc_version; the imported source
    // identity is its latest version
    const qp = await this.documents.findTopByDocumentIdOrderByDocVersionDesc(qpDocId);
    if (qp == null) {
      throw new NotFoundException("provenance for exam paper", paperId);
    }
    const ms = await this.documents.findTopByDocumentIdOrderByDocVersionDesc(msDocId);
    if (ms == null) {
      throw new NotFoundException("provenance for exam paper", paperId);
    }
    return {
      paperId: paper.id,
      questionPaper: documentIdentity(qp),
      markScheme: documentIdentity(ms),
    };
  }

  /**
   * Current mapping of a question (:763-795) — its topic rows, anchor state
   * visible. Ingested questions carry their ingestion anchor ONLY in
   * primary_topic_node_id; when no primary row exists the anchor row is
   * synthesized so a reviewer can map a question OFF an anchor they can see.
   */
  async questionTopicRows(questionId: string): Promise<TopicRowView[]> {
    const question = await this.questions.findById(questionId);
    if (question == null) {
      throw new NotFoundException("question", questionId);
    }
    const topicRows = await this.questionTopics.findByQuestionId(questionId);
    const nodes = await this.knowledgeNodes.findByIds(topicRows.map((r) => r.nodeId));
    const rows: TopicRowView[] = topicRows.map((r) => {
      const node: KnowledgeNodeRow | undefined = nodes.get(r.nodeId);
      return {
        nodeId: r.nodeId,
        primary: r.isPrimary,
        code: node == null ? null : node.code,
        title: node == null ? null : node.title,
      };
    });
    const hasPrimaryRow = rows.some((r) => r.primary);
    if (!hasPrimaryRow) {
      const anchor = question.primaryTopicNodeId;
      if (anchor != null) {
        const node = (await this.knowledgeNodes.findByIds([anchor])).get(anchor);
        const anchorRow: TopicRowView = {
          nodeId: anchor,
          primary: true,
          code: node == null ? null : node.code,
          title: node == null ? null : node.title,
        };
        return [anchorRow, ...rows.filter((r) => !r.primary)];
      }
    }
    return rows;
  }
}

/** DocumentIdentity mapping (ContentController.java:154-158). */
function documentIdentity(d: DocumentRow): DocumentIdentity {
  return {
    documentId: d.documentId,
    fileName: d.fileName,
    sourceUri: d.sourceUri,
    checksum: d.checksum,
    checksumAlgorithm: d.checksumAlgorithm,
  };
}
