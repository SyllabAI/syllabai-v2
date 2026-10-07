/**
 * GlmOcrDraftMapper port — deterministic, side-effect-free adapter from the
 * GLM-OCR parser draft contract onto the existing T-011 PastPaperDraftDto
 * (T-MIG-089; frozen source: teacher/ingestion/GlmOcrDraftMapper.java @
 * 6cad6ef, line-against-line — this module is the ONLY translation point, so
 * field semantics stay in one auditable place).
 *
 * Mapping decisions (all documented in the frozen javadoc, nothing inferred):
 *   - paper identity comes from the MS draft (the real corpus MS carries
 *     board/qualification/paperReference/logNumber/publicationCode/session
 *     while the QP front matter yielded none). Subject is NOT inferred.
 *   - Session and paper reference come from the QUESTION PAPER side first
 *     (the exam paper is the authority on its own session; MS covers of
 *     newer series print the PUBLICATION month) — msMeta.session is only a
 *     fallback for papers whose QP cover the OCR lost entirely.
 *   - mark points: MS entries split on "(N)" markers become one point each;
 *     entries whose answer cell carried no markers (MCQ rationale rows,
 *     unsplit cells) become ONE whole-entry point. Unknown marks (null)
 *     materialize as 0 (unknown), never a guess.
 *   - part references: MS labels "13(b)(i)" become refs "13-b-i", matching
 *     the QP part-label convention — a mechanical re-formatting, not an
 *     inference. Unmatched refs attach at question level with the ref
 *     preserved.
 *   - MCQ options / QWC / guidance / IC table / figure refs / warnings /
 *     numbering style / answer prompts / marks-known states / log-publication
 *     identifiers are not representable in the T-011 DTO — the bridge record
 *     persists the verbatim drafts (JSONB) so nothing is discarded.
 *   - command words are NOT guessed from stems.
 *   - GLM-OCR Markdown exports are single-page → pageNumber 1.
 */
import type {
  GlmOcrMarkSchemeDraft,
  GlmOcrPaperDraft,
  GlmOcrReconciliation,
  PastPaperDraft,
} from "@syllabai/contracts";
import type { GlmOcrFindingView } from "@syllabai/contracts";

/** GlmOcrDraftMapper.BRIDGE_METHOD (:46) — pinned by the paper-review capture. */
export const BRIDGE_METHOD = "glm-ocr-qp-v1+glm-ocr-ms-v1";

/** MS part string "bi" (parens already stripped) → QP label convention "b-i". */
const LETTER_THEN_ROMAN = /^([a-h])([ivx]+)$/;

/**
 * toPastPaperDraft (:56-141) — GLM-OCR QP + MS drafts → the existing T-011
 * past-paper draft. Fed straight into PastPaperIngestionService.ingest —
 * every SUGGESTED validation guarantee of that path applies unchanged.
 */
export function toPastPaperDraft(
  qpDraft: GlmOcrPaperDraft,
  msDraft: GlmOcrMarkSchemeDraft,
): PastPaperDraft {
  const qpMeta = qpDraft.paper;
  const msMeta = msDraft.paper;

  // Session and paper reference come from the QUESTION PAPER side first —
  // msMeta covers newer-series publications ("November 2020" on a June MS).
  const session = qpMeta != null && qpMeta.session != null ? qpMeta.session : msMeta == null ? null : msMeta.session;
  const paperReference =
    qpMeta != null && qpMeta.paperReference != null ? qpMeta.paperReference : msMeta == null ? null : msMeta.paperReference;

  const paper = {
    board: msMeta == null ? null : msMeta.board,
    qualification: msMeta == null ? null : msMeta.qualification,
    subject: null, // subject: never inferred
    unit: null, // unit: not extracted
    sessionLabel: session,
    paperCode: paperReference,
    questionPaperDocumentId: qpMeta == null ? null : qpMeta.canonicalDocumentId,
    markSchemeDocumentId: msMeta == null ? null : msMeta.canonicalDocumentId,
  };

  const questions = qpDraft.questions.map((q) => ({
    externalRef: q.questionId,
    questionNumber: String(q.number),
    prompt: q.stem == null ? "" : q.stem,
    commandWord: null, // command word: not guessed
    marks: q.marks,
    questionType: null, // T-011 ingests STRUCTURED
    pageNumber: 1, // GLM-OCR Markdown exports are single-page
    confidence: q.confidence,
    parts: q.parts.map((p) => ({
      label: p.label,
      prompt: p.text == null ? "" : p.text,
      commandWord: null, // command word: not guessed
      marks: p.marks == null ? 0 : p.marks, // null = unknown, not zero-credit
      confidence: p.confidence,
    })),
  }));

  const points: Array<NonNullable<PastPaperDraft["markScheme"]>["points"][number]> = [];
  for (const entry of msDraft.entries) {
    const ref = markPointRef(entry);
    if (entry.markPoints.length === 0) {
      // no "(N)" markers in the cell: the whole entry is the marking
      // statement (MCQ rationale rows, unsplit cells). One point keeps
      // the evidence.
      points.push({
        questionRef: ref,
        order: 0,
        text: entry.answerText == null ? "" : entry.answerText,
        marks: entry.marks == null ? 0 : entry.marks,
        acceptance: [], // acceptance criteria are teacher-authored
        confidence: entry.confidence,
      });
    } else {
      for (const mp of entry.markPoints) {
        points.push({
          questionRef: ref,
          order: mp.ordinal - 1,
          text: mp.text == null ? "" : mp.text,
          marks: mp.marks == null ? 0 : mp.marks,
          acceptance: [],
          confidence: entry.confidence,
        });
      }
    }
  }

  return {
    schemaVersion: "1.0" /* PastPaperDraftDto.SUPPORTED_SCHEMA */,
    paper,
    questions,
    markScheme: {
      version: "1",
      sourceDocumentId: msMeta == null ? null : msMeta.canonicalDocumentId,
      points,
      generalGuidance: null,
    },
    extractionMethod: BRIDGE_METHOD,
    reviewRequired: qpDraft.reviewRequired || msDraft.reviewRequired,
  };
}

/**
 * assembleReviewFindings (:149-181) — the review-visible findings for the
 * bridge record: the parser reconciliation findings verbatim, the
 * paper-total conflict (if any), and the QP/MS draft warnings (defect
 * evidence). Parser warnings are relayed, never repaired.
 *
 * Detail strings are the EXACT frozen concatenations (Java string concat
 * renders null as "null" — mirrored with String()).
 */
export function assembleReviewFindings(
  qpDraft: GlmOcrPaperDraft,
  msDraft: GlmOcrMarkSchemeDraft,
  reconciliation: GlmOcrReconciliation,
): GlmOcrFindingView[] {
  const findings: GlmOcrFindingView[] = [];
  for (const f of reconciliation.findings) {
    findings.push({
      source: "RECONCILIATION",
      severity: f.severity,
      questionNumber: f.questionNumber,
      qpMarks: f.qpMarks,
      msMarks: f.msMarks,
      detail:
        "Q" +
        nullSafe(f.questionNumber, "?") +
        ": QP total " +
        (f.qpMarks == null ? "unknown" : String(f.qpMarks)) +
        " vs MS total " +
        (f.msMarks == null ? "unknown" : String(f.msMarks)) +
        " (" +
        String(f.severity) +
        ")",
    });
  }
  if (reconciliation.paperTotalConflict) {
    findings.push({
      source: "RECONCILIATION",
      severity: "paper-total-conflict",
      questionNumber: null,
      qpMarks: reconciliation.qpPaperTotal,
      msMarks: reconciliation.msPaperTotal,
      detail:
        "QP paper total " +
        String(reconciliation.qpPaperTotal) +
        " vs MS paper total " +
        String(reconciliation.msPaperTotal) +
        " — both preserved, never merged (evidence-first)",
    });
  }
  for (const warning of qpDraft.warnings) {
    findings.push({
      source: "QP_WARNING",
      severity: "warning",
      questionNumber: null,
      qpMarks: null,
      msMarks: null,
      detail: warning,
    });
  }
  for (const warning of msDraft.warnings) {
    findings.push({
      source: "MS_WARNING",
      severity: "warning",
      questionNumber: null,
      qpMarks: null,
      msMarks: null,
      detail: warning,
    });
  }
  findings.push(...duplicatePartLabelFindings(qpDraft));
  return findings;
}

/**
 * duplicatePartLabelFindings (:191-217) — parser fragmentation: the same
 * part label appearing twice within one question (a marks-bearing row plus
 * an empty continuation). The persistence layer keeps both rows and
 * suffixes later labels deterministically (`b-ii` → `b-ii.2`); this finding
 * tells the reviewer WHERE that happened so they can merge or reject during
 * review — content is never silently dropped.
 */
export function duplicatePartLabelFindings(qpDraft: GlmOcrPaperDraft | null): GlmOcrFindingView[] {
  const findings: GlmOcrFindingView[] = [];
  if (qpDraft == null || qpDraft.questions == null) {
    return findings;
  }
  for (const q of qpDraft.questions) {
    if (q.parts == null) {
      continue;
    }
    const counts = new Map<string, number>(); // insertion-ordered (LinkedHashMap parity)
    for (const p of q.parts) {
      if (p.label != null) {
        counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
      }
    }
    for (const [label, count] of counts) {
      if (count > 1) {
        findings.push({
          source: "QP_WARNING",
          severity: "duplicate-part-label",
          questionNumber: String(q.number),
          qpMarks: null,
          msMarks: null,
          detail:
            `Q${q.number}: part label '${label}' occurs ${count}` +
            `x (parser fragmentation) — later rows relabelled '${label}` +
            `.2', '.3' … for review; merge or reject`,
        });
      }
    }
  }
  return findings;
}

/**
 * markPointRef (:223-234) — MS entry label → T-011 mark-point ref.
 * "11" → "11" (question-level); "13(a)" → "13-a"; "13(b)(i)" → "13-b-i"
 * (the QP part-label convention). A leading QWC asterisk is stripped
 * ("*14" is Q14 with quality-of-communication marking).
 */
export function markPointRef(entry: { label: string | null; number: number }): string {
  const printed = entry.label == null ? String(entry.number) : entry.label;
  const noStar = printed.startsWith("*") ? printed.slice(1) : printed;
  const paren = noStar.indexOf("(");
  const number = String(entry.number);
  if (paren < 0) {
    return noStar.trim().length === 0 ? number : noStar;
  }
  const part = noStar.slice(paren).replaceAll("(", "").replaceAll(")", "");
  return number + "-" + normalizePart(part);
}

/** normalizePart (:237-246) — "a" → "a"; "bi" → "b-i" (letter + roman subpart). */
export function normalizePart(part: string | null): string {
  if (part == null || part.trim().length === 0) {
    return "x";
  }
  const m = LETTER_THEN_ROMAN.exec(part);
  if (m != null) {
    return m[1]! + "-" + m[2]!;
  }
  return part;
}

/** nullSafe (:248-250) — null or blank → fallback. */
function nullSafe(value: string | null, fallback: string): string {
  return value == null || value.trim().length === 0 ? fallback : value;
}
