/**
 * ContentReviewRepository port (T-MIG-020) — the teacher §7 validation
 * READ surfaces. Sources (frozen core @ 6cad6ef):
 *   teacher/ContentController.java — reviewQueue:82-91, provenance
 *     paperProvenance:139-159, views:299-352
 *   teacher/ContentReviewService.java — baseEnrichment:518-577 (v2 signals:
 *     per-paper version/scheme state counts, OCR-bridge reconciliation +
 *     finding count from review_findings '"'source'"' occurrences, mean
 *     extraction confidence; deterministic ordering :573-578),
 *     enrichedReviewQueueV3:455-507 (scheme linkage, question census,
 *     mapped topics, practicable topics over VALIDATED papers, novel set,
 *     rank reasons, documented deterministic sort),
 *     paperAudit:810-828 + ContentReviewAuditRepository.findPaperAudit:14-33
 *     (own rows + versions + schemes + questions, occurredAt desc),
 *     questionTopicRows:763-795 (anchor synthesis when no primary row —
 *     the V20 production-battery finding).
 */
import { createSql } from "../identity/users";
import { NotFoundException } from "../identity/errors";

type Sql = ReturnType<typeof createSql>;

const VALIDATION_STATES = ["SUGGESTED", "VALIDATED", "REJECTED", "FLAGGED"] as const;

export class ContentReviewRepository {
  constructor(private sql: Sql) {}

  /** ExamPaperRepository.findAllByLinkedDocumentId (assessment repo:34) —
   *  the citation reader's QP/MS paper-identity lookup; the T-013 bridge
   *  writes the link exactly once per imported pair, so findFirst is
   *  bounded by construction (ContentReaderController.java:90-94). */
  async findExamPaperByLinkedDocumentId(documentId: string): Promise<{
    id: string;
    paperCode: string;
    sessionLabel: string;
  } | null> {
    const rows = (await this.sql`
      select id, paper_code, session_label from exam_papers
      where question_paper_document_id = ${documentId} or mark_scheme_document_id = ${documentId}
      limit 1`) as Array<Record<string, unknown>>;
    const r = rows[0];
    return r
      ? { id: r.id as string, paperCode: r.paper_code as string, sessionLabel: r.session_label as string }
      : null;
  }

  /** ContentController.reviewQueue:82-91 — findSuggested papers as
   *  PaperSummary + GLOBAL suggested version/scheme counts. */
  async reviewQueue() {
    const papers = (await this.sql`
      select id, subject_id, title, paper_code, session_label, board,
             qualification, validation_state, created_at
      from exam_papers where validation_state = 'SUGGESTED'
      order by created_at desc`) as Array<Record<string, unknown>>;
    const versions = (await this.sql`
      select count(*) as n from question_versions where validation_state = 'SUGGESTED'`) as Array<{ n: string }>;
    const schemes = (await this.sql`
      select count(*) as n from mark_schemes where validation_state = 'SUGGESTED'`) as Array<{ n: string }>;
    return {
      papers: papers.map((p) => this.paperSummary(p)),
      suggestedVersions: Number(versions[0]?.n ?? 0),
      suggestedSchemes: Number(schemes[0]?.n ?? 0),
    };
  }

  private paperSummary(p: Record<string, unknown>) {
    return {
      id: p.id as string,
      subjectId: (p.subject_id as string | null) ?? null,
      title: p.title as string,
      paperCode: p.paper_code as string,
      sessionLabel: p.session_label as string,
      board: p.board as string,
      qualification: p.qualification as string,
      validationState: p.validation_state as string,
    };
  }

  /**
   * baseEnrichment (v2) — per SUGGESTED paper: version state counts, mean
   * extraction confidence, OCR-bridge reconciliation/finding count
   * (review_findings carries one '"'source'"' token per finding — the
   * split-count port is verbatim), deterministic reconciled-first order.
   */
  private async baseEnrichment() {
    const papers = (await this.sql`
      select id, subject_id, title, paper_code, session_label, board,
             qualification, validation_state, created_at
      from exam_papers where validation_state = 'SUGGESTED'
      order by created_at desc`) as Array<Record<string, unknown>>;
    if (papers.length === 0) return [];
    const versionCounts = (await this.sql`
      select v.exam_paper_id as paper_id, v.validation_state as state, count(*) as n
      from question_versions v join questions q on q.id = v.question_id
      group by v.exam_paper_id, v.validation_state`) as Array<Record<string, unknown>>;
    const schemeCounts = (await this.sql`
      select q.exam_paper_id as paper_id, m.validation_state as state, count(*) as n
      from mark_schemes m join question_versions v on v.id = m.question_version_id
      join questions q on q.id = v.question_id
      group by q.exam_paper_id, m.validation_state`) as Array<Record<string, unknown>>;
    const confidence = (await this.sql`
      select q.exam_paper_id as paper_id, avg(v.extraction_confidence) as avg
      from question_versions v join questions q on q.id = v.question_id
      where v.extraction_confidence is not null
      group by q.exam_paper_id`) as Array<Record<string, unknown>>;
    const bridges = (await this.sql`
      select paper_id, reconciliation_status, review_findings
      from glm_ocr_bridge_records`) as Array<Record<string, unknown>>;
    const vMap = this.groupCounts(versionCounts);
    const sMap = this.groupCounts(schemeCounts);
    const cMap = new Map(confidence.map((c) => [c.paper_id as string, Number(c.avg)]));
    const bMap = new Map(bridges.map((b) => [b.paper_id as string, b]));
    const enriched = papers.map((p) => {
      const vc = vMap.get(p.id as string) ?? new Map<string, number>();
      const sc = sMap.get(p.id as string) ?? new Map<string, number>();
      const bridge = bMap.get(p.id as string);
      const findings = bridge?.review_findings as string | null | undefined;
      return {
        ...this.paperSummary(p),
        versionCount: [...vc.values()].reduce((a, b) => a + b, 0),
        validatedVersions: vc.get("VALIDATED") ?? 0,
        rejectedVersions: vc.get("REJECTED") ?? 0,
        flaggedVersions: vc.get("FLAGGED") ?? 0,
        suggestedSchemes: sc.get("SUGGESTED") ?? 0,
        reconciliationStatus: (bridge?.reconciliation_status as string | null) ?? null,
        findingCount: findings ? findings.split('"source"').length - 1 : 0,
        avgExtractionConfidence: cMap.get(p.id as string) ?? null,
        createdAt: new Date(p.created_at as string).toISOString(),
      };
    });
    // reconciled first, confidence desc, findings asc, newest first
    enriched.sort((a, b) => {
      const ra = a.reconciliationStatus === "OK" ? 0 : 1;
      const rb = b.reconciliationStatus === "OK" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const ca = a.avgExtractionConfidence ?? 0;
      const cb = b.avgExtractionConfidence ?? 0;
      if (ca !== cb) return cb - ca;
      if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return enriched;
  }

  private groupCounts(rows: Array<Record<string, unknown>>) {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const key = r.paper_id as string;
      if (!m.has(key)) m.set(key, new Map());
      m.get(key)!.set(r.state as string, Number(r.n));
    }
    return m;
  }

  /** enrichedReviewQueue (v2) — suggestedVersionCount/SuggestedSchemeCount
   *  derive from the enrichment (ContentReviewService.java:579-593). */
  async enrichedReviewQueue() {
    const enriched = await this.baseEnrichment();
    return {
      papers: enriched,
      suggestedVersions: enriched.reduce(
        (a, p) => a + p.versionCount - p.validatedVersions - p.rejectedVersions - p.flaggedVersions,
        0,
      ),
      suggestedSchemes: enriched.reduce((a, p) => a + p.suggestedSchemes, 0),
    };
  }

  /** enrichedReviewQueueV3 — v2 signals + scheme linkage, curriculum mapping
   *  census, novel topics vs the practicable set (VALIDATED papers' primary
   *  + mapped topics), rank reasons, documented deterministic sort. */
  async enrichedReviewQueueV3() {
    const base = await this.baseEnrichment();
    const ids = base.map((p) => p.id);
    const withSchemeRows = ids.length === 0 ? [] : ((await this.sql`
      select q.exam_paper_id as paper_id, count(distinct q.id) as n
      from questions q
      join question_versions v on v.question_id = q.id
      join mark_schemes m on m.question_version_id = v.id
      where q.exam_paper_id = any(${ids}::uuid[])
      group by q.exam_paper_id`) as Array<Record<string, unknown>>);
    const censusRows = ids.length === 0 ? [] : ((await this.sql`
      select exam_paper_id as paper_id, count(*) as total,
             count(case when primary_topic_node_id is not null then 1 end) as mapped
      from questions where exam_paper_id = any(${ids}::uuid[])
      group by exam_paper_id`) as Array<Record<string, unknown>>);
    const mappedRows = ids.length === 0 ? [] : ((await this.sql`
      select q.exam_paper_id as paper_id, t.node_id as node_id
      from question_topics t join questions q on q.id = t.question_id
      where q.exam_paper_id = any(${ids}::uuid[])`) as Array<Record<string, unknown>>);
    const validatedIds = ((await this.sql`
      select id from exam_papers where validation_state = 'VALIDATED'`) as Array<{ id: string }>).map(
      (r) => r.id,
    );
    const practicableRows = validatedIds.length === 0 ? [] : ((await this.sql`
      select distinct primary_topic_node_id as node_id from questions
      where exam_paper_id = any(${validatedIds}::uuid[]) and primary_topic_node_id is not null`) as Array<{ node_id: string }>);
    const mappedTopicsByPaper = new Map<string, Set<string>>();
    for (const r of mappedRows) {
      const k = r.paper_id as string;
      if (!mappedTopicsByPaper.has(k)) mappedTopicsByPaper.set(k, new Set());
      mappedTopicsByPaper.get(k)!.add(r.node_id as string);
    }
    const practicableTopics = new Set(practicableRows.map((r) => r.node_id as string));
    for (const [paperId, topics] of mappedTopicsByPaper) {
      if (validatedIds.includes(paperId)) for (const t of topics) practicableTopics.add(t);
    }
    const withScheme = new Map(withSchemeRows.map((r) => [r.paper_id as string, Number(r.n)]));
    const census = new Map(censusRows.map((r) => [r.paper_id as string, [Number(r.total), Number(r.mapped)] as const]));
    const papers = base.map((p) => {
      const [total, mapped] = census.get(p.id) ?? [0, 0];
      const novel = new Set(mappedTopicsByPaper.get(p.id) ?? new Set<string>());
      for (const t of novel) if (practicableTopics.has(t)) novel.delete(t);
      const ws = withScheme.get(p.id) ?? 0;
      return {
        ...p,
        totalQuestions: total,
        mappedQuestions: mapped,
        withScheme: ws,
        novelTopicCount: novel.size,
        reasons: this.rankReasons(p, total, mapped, ws, novel.size),
      };
    });
    papers.sort((a, b) => {
      const ra = a.reconciliationStatus === "OK" ? 0 : 1;
      const rb = b.reconciliationStatus === "OK" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const sa = a.totalQuestions === 0 ? -1 : a.withScheme / a.totalQuestions;
      const sb = b.totalQuestions === 0 ? -1 : b.withScheme / b.totalQuestions;
      if (sa !== sb) return sb - sa;
      const ma = a.totalQuestions === 0 ? -1 : a.mappedQuestions / a.totalQuestions;
      const mb = b.totalQuestions === 0 ? -1 : b.mappedQuestions / b.totalQuestions;
      if (ma !== mb) return mb - ma;
      if (a.novelTopicCount !== b.novelTopicCount) return a.novelTopicCount - b.novelTopicCount;
      const ca = a.avgExtractionConfidence ?? 0;
      const cb = b.avgExtractionConfidence ?? 0;
      if (ca !== cb) return cb - ca;
      if (a.findingCount !== b.findingCount) return a.findingCount - b.findingCount;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return {
      papers,
      suggestedVersions: base.reduce(
        (a, p) => a + p.versionCount - p.validatedVersions - p.rejectedVersions - p.flaggedVersions,
        0,
      ),
      suggestedSchemes: base.reduce((a, p) => a + p.suggestedSchemes, 0),
      practicableTopicCount: practicableTopics.size,
    };
  }

  /** rankReasons — human-legible triage reasons (deterministic, never
   *  promotes; the Java builds the same classes of reason strings). */
  private rankReasons(
    p: { reconciliationStatus: string | null; avgExtractionConfidence: number | null; findingCount: number; suggestedSchemes: number },
    total: number,
    mapped: number,
    withScheme: number,
    novel: number,
  ): string[] {
    const reasons: string[] = [];
    if (p.reconciliationStatus === "OK") reasons.push("reconciled");
    if (p.avgExtractionConfidence != null)
      reasons.push(`mean extraction confidence ${(p.avgExtractionConfidence * 100).toFixed(1)}%`);
    if (p.findingCount > 0) reasons.push(`${p.findingCount} parser finding(s)`);
    if (total > 0 && withScheme === 0) reasons.push("no mark-scheme linkage");
    if (total > 0 && mapped === 0) reasons.push("not mapped to the curriculum yet");
    if (novel > 0) reasons.push(`${novel} novel topic(s) for the pilot`);
    if (p.suggestedSchemes === 0 && total > 0) reasons.push("no SUGGESTED schemes");
    return reasons;
  }

  /** paperAudit (V22) — the paper's own rows + every row of its question
   *  versions, mark schemes and questions, occurredAt desc. */
  async paperAudit(paperId: string) {
    const paper = await this.sql`select id from exam_papers where id = ${paperId}::uuid`;
    if (!paper[0]) throw new NotFoundException("exam paper", paperId);
    const rows = (await this.sql`
      select occurred_at, actor_label, action, target_type, target_id, from_state, to_state, detail
      from content_review_audit
      where target_id = ${paperId}::uuid
         or target_id in (select v.id from question_versions v join questions q on q.id = v.question_id where q.exam_paper_id = ${paperId}::uuid)
         or target_id in (select m.id from mark_schemes m join question_versions v on v.id = m.question_version_id join questions q on q.id = v.question_id where q.exam_paper_id = ${paperId}::uuid)
         or (target_type = 'question' and target_id in (select id from questions where exam_paper_id = ${paperId}::uuid))
      order by occurred_at desc`) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      occurredAt: r.occurred_at ? new Date(r.occurred_at as string).toISOString() : null,
      actor: (r.actor_label as string) ?? "",
      action: r.action as string,
      targetType: r.target_type as string,
      targetId: r.target_id as string,
      fromState: (r.from_state as string | null) ?? null,
      toState: (r.to_state as string | null) ?? null,
      detail: (r.detail as string | null) ?? null,
    }));
  }

  /** questionTopicRows (:763-795) — the question's topic rows; when no
   *  primary row exists but primary_topic_node_id holds the ingestion
   *  anchor, the anchor row is synthesized FIRST (the V20 finding: a
   *  reviewer cannot map off an anchor they cannot see). */
  async questionTopicRows(questionId: string) {
    const q = await this.sql`select id, primary_topic_node_id from questions where id = ${questionId}::uuid`;
    if (!q[0]) throw new NotFoundException("question", questionId);
    const rows = (await this.sql`
      select t.node_id as node_id, t.is_primary as is_primary, kn.code as code, kn.title as title
      from question_topics t left join knowledge_nodes kn on kn.id = t.node_id
      where t.question_id = ${questionId}::uuid`) as Array<Record<string, unknown>>;
    const view = rows.map((r) => ({
      nodeId: r.node_id as string,
      primary: r.is_primary === true,
      code: (r.code as string | null) ?? null,
      title: (r.title as string | null) ?? null,
    }));
    const hasPrimaryRow = view.some((r) => r.primary);
    if (!hasPrimaryRow) {
      const anchor = q[0].primary_topic_node_id as string | null;
      if (anchor) {
        const node = await this.sql`select code, title from knowledge_nodes where id = ${anchor}::uuid`;
        return [
          {
            nodeId: anchor,
            primary: true,
            code: (node[0]?.code as string | null) ?? null,
            title: (node[0]?.title as string | null) ?? null,
          },
          ...view.filter((r) => !r.primary),
        ];
      }
    }
    return view;
  }

  /** provenance read model (ContentController.java:139-159): fail-closed —
   *  a paper whose QP or MS document row is missing has NO provenance.
   *  DocumentIdentity sends fileName VERBATIM (nullable in the entity →
   *  JSON null) and the row's own checksum_algorithm (default 'SHA-256'). */
  async provenance(
    findTop: (docId: string) => Promise<{
      documentId: string;
      fileName: string | null;
      sourceUri: string;
      checksum: string;
      checksumAlgorithm: string;
    } | null>,
    paperId: string,
  ) {
    const papers = (await this.sql`
      select id, question_paper_document_id, mark_scheme_document_id
      from exam_papers where id = ${paperId}::uuid`) as Array<Record<string, unknown>>;
    const paper = papers[0];
    if (!paper) throw new NotFoundException("exam paper", paperId);
    const qpDocId = paper.question_paper_document_id as string | null;
    const msDocId = paper.mark_scheme_document_id as string | null;
    if (!qpDocId || qpDocId.trim() === "" || !msDocId || msDocId.trim() === "") {
      throw new NotFoundException("provenance for exam paper", paperId);
    }
    const qp = await findTop(qpDocId);
    const ms = await findTop(msDocId);
    if (!qp || !ms) throw new NotFoundException("provenance for exam paper", paperId);
    const identity = (d: {
      documentId: string;
      fileName: string | null;
      sourceUri: string;
      checksum: string;
      checksumAlgorithm: string;
    }) => ({
      documentId: d.documentId,
      fileName: d.fileName,
      sourceUri: d.sourceUri,
      checksum: d.checksum,
      checksumAlgorithm: d.checksumAlgorithm,
    });
    return {
      paperId: paper.id as string,
      questionPaper: identity(qp),
      markScheme: identity(ms),
    };
  }

  /** Guard against accidental state-list widening. */
  static get validationStates() {
    return VALIDATION_STATES;
  }
}
