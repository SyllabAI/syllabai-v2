/**
 * T-MIG-060 tranche 1b — the tutor-band Fetch bank seam (frozen law
 * @ 6cad6ef).
 *
 * Line-against-line port of the FetchService surfaces the paper-question
 * resolver consumes (content/FetchService.java :36-164, R4 plan §7 FETCH):
 * parse → bank SQL → paper hits. ZERO vector calls on the happy path —
 * resolution is pure metadata (series/year/paper/qnum) served from the bank
 * tables (V35 canonical series/year columns).
 *
 * STRUCTURAL SEAM (the nba.ts/learner-model doctrine, consolidation ruling
 * requested at PR review): the frozen service lives in the content package
 * and the landed content module has not ported it — this per-module copy
 * carries exactly what the tutor band's fail-open guard needs. DISCLOSED
 * TRIM: the FetchQuestion view assembly (resolveQuestion's parts/markPoints
 * loading, FetchService.java :192-219) is the CLA FETCH surface's
 * consumption, not the tutor band's — the question row is still resolved
 * per paper (its existence DRIVES the ambiguity law, :98, verbatim) and the
 * row fields ride the hit, but the parts/markPoints list loading is deferred
 * to the content band's own port. The identity/ambiguity/parse-defect laws
 * are byte-exact.
 *
 * Resolution contract (class javadoc, verbatim):
 *   - papers resolve within the caller's curriculum scope (T-C07) and never
 *     serve REJECTED rows — §8.2 superseded duplicates are invisible;
 *   - an explicit paper code pins candidates; a bare unit resolves against
 *     every subject code of the scope plus the 4CH0 legacy alias; no paper
 *     reference means every (series, year) paper of the scope — multiple
 *     candidates mark the result ambiguous (deterministic order, the
 *     surface narrows, we never guess);
 *   - the question inside a resolved paper is matched by the external_ref
 *     atom prefix (q01-…, zero-padding tolerant; '-' anchors so 'q1-' never
 *     matches 'q10-…'); ACTIVE-POLICY AGNOSTIC (gold-v1 FETCH semantics —
 *     the C13 import ships bank rows active=false and they still serve);
 *   - a query that parses to nothing is a parse defect (returned honestly
 *     as empty with the echo).
 */
import type { SqlFn } from "./sql";
import {
  parseFetchQuery,
  parsedIsEmpty,
  type ParsedFetchQuery,
} from "./fetch-parser";

/** The curriculum scope the bank reads (CurriculumScopePort structural
 *  projection — the sql-backed scopes port satisfies it). */
export interface BankScope {
  curriculumVersionId: string;
}

/** FetchService.FetchQuestion :56-59 — the row fields only; the
 *  parts/markPoints view assembly is the content band's port (disclosed). */
export interface BankQuestionRow {
  questionId: string;
  externalRef: string;
  stem: string | null;
  marks: number | null;
  questionType: string | null;
  commandWord: string | null;
}

/** FetchService.FetchPaperHit :61-65. */
export interface BankPaperHit {
  paperId: string;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
  validationState: string;
  qpDocumentId: string | null;
  msDocumentId: string | null;
  question: BankQuestionRow | null;
}

/** FetchService.FetchResult :67-69. */
export interface BankFetchResult {
  parsed: ParsedFetchQuery;
  ambiguous: boolean;
  parseDefect: boolean;
  papers: BankPaperHit[];
}

/** FetchService.fetch :72-100 — the port the resolver injects. */
export type TutorFetchPort = (
  query: string,
  scope: BankScope,
) => Promise<BankFetchResult>;

const MAX_PAPERS = 6; // FetchService :41

interface PaperRow {
  id: string;
  paper_code: string | null;
  session_label: string | null;
  series: string | null;
  year: number | null;
  validation_state: string;
  question_paper_document_id: string | null;
  mark_scheme_document_id: string | null;
}

/**
 * Candidate paper codes (:108-125): explicit code wins; a bare unit
 * resolves against every subject code in the scope plus the 4CH0 legacy
 * alias (pre-2016 papers are 4CH0-coded while the pilot subject is 4CH1 —
 * prod truth, bridge alias decision Task 31). Deterministic: subject codes
 * first (alphabetical), legacy alias last.
 */
async function candidateCodes(
  sql: SqlFn,
  parsed: ParsedFetchQuery,
  scope: BankScope,
): Promise<string[]> {
  if (parsed.paperCode != null) {
    return [parsed.paperCode];
  }
  if (parsed.unit == null) {
    return [];
  }
  const rows = (await sql`
    select distinct s.code from subjects s
    where s.curriculum_version_id = ${scope.curriculumVersionId} and s.code is not null
    order by s.code`) as Array<{ code: string }>;
  const codes = rows.map((r) => `${String(r.code)}/${parsed.unit}`);
  codes.push(`4CH0/${parsed.unit}`);
  return [...new Set(codes)];
}

/**
 * resolvePapers (:132-164): a year is the minimum anchor for a
 * deterministic fetch. SQL verbatim (V35 canonical series/year columns;
 * REJECTED invisible; deterministic order; MAX_PAPERS bound).
 */
async function resolvePapers(
  sql: SqlFn,
  parsed: ParsedFetchQuery,
  codes: string[],
  scope: BankScope,
): Promise<PaperRow[]> {
  if (parsed.year == null) {
    return []; // a year is the minimum anchor for a deterministic fetch
  }
  const codeFilter = codes.length === 0 ? null : codes;
  return (await sql`
    select ep.id, ep.paper_code, ep.session_label, ep.series, ep.year,
           ep.validation_state, ep.question_paper_document_id, ep.mark_scheme_document_id
    from exam_papers ep
    join subjects s on s.id = ep.subject_id
    where ep.validation_state <> 'REJECTED'
      and s.curriculum_version_id = ${scope.curriculumVersionId}
      and ep.year = ${parsed.year}
      and (${parsed.series}::varchar(3) is null or ep.series = ${parsed.series}::varchar(3))
      and (${codeFilter}::text[] is null or ep.paper_code = any(${codeFilter}::text[]))
    order by ep.paper_code, ep.session_label
    limit ${MAX_PAPERS}`) as unknown as PaperRow[];
}

/**
 * resolveQuestion (:166-190): the external_ref atom prefix —
 * '^q0*{n}-.*' — zero-padding tolerant, never a prefix collision ('q1-'
 * does not match 'q10-…' because '-' anchors). Active-policy AGNOSTIC
 * (gold-v1 FETCH semantics): the bank's paper-anchored rows are the
 * paper's content whether or not the learner surface has activated them.
 */
async function resolveQuestion(
  sql: SqlFn,
  paperId: string,
  parsed: ParsedFetchQuery,
): Promise<BankQuestionRow | null> {
  const refPattern = `^q0*${parsed.qnum}-.*`;
  const rows = (await sql`
    select q.id, q.external_ref, q.stem, q.marks, q.question_type, q.command_word
    from questions q
    where q.exam_paper_id = ${paperId} and q.external_ref ~ ${refPattern}
    order by q.external_ref
    limit 1`) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (row == null) return null;
  return {
    questionId: String(row.id),
    externalRef: String(row.external_ref),
    stem: row.stem == null ? null : String(row.stem),
    marks: row.marks == null ? null : Number(row.marks),
    questionType: row.question_type == null ? null : String(row.question_type),
    commandWord: row.command_word == null ? null : String(row.command_word),
  };
}

/**
 * The tutor-band Fetch bank port — FetchService.fetch :72-100, minus the
 * disclosed parts/markPoints view assembly.
 */
export function buildTutorFetchBank(sql: SqlFn): TutorFetchPort {
  return async (query, scope) => {
    if (query == null || query.trim() === "") {
      // IllegalArgumentException("query must not be blank") :74 — the
      // resolver guards before calling; the port keeps the law local
      throw new Error("query must not be blank");
    }
    if (scope == null) {
      // IllegalArgumentException("curriculum scope is mandatory — fetch
      // never runs unscoped (T-C07)") :77
      throw new Error("curriculum scope is mandatory — fetch never runs unscoped (T-C07)");
    }
    const parsed = parseFetchQuery(query);
    if (parsedIsEmpty(parsed)) {
      // parse defect: logged by the frozen LOG.warn :81 (server-side detail);
      // returned honestly as empty with the echo
      return { parsed, ambiguous: false, parseDefect: true, papers: [] };
    }

    const codes = await candidateCodes(sql, parsed, scope);
    const paperRows = await resolvePapers(sql, parsed, codes, scope);
    const hits: BankPaperHit[] = [];
    let resolved = 0;
    for (const paper of paperRows) {
      const question = parsed.qnum == null ? null : await resolveQuestion(sql, String(paper.id), parsed);
      if (question != null) {
        resolved++;
      }
      hits.push({
        paperId: String(paper.id),
        paperCode: paper.paper_code,
        sessionLabel: paper.session_label,
        series: paper.series,
        year: paper.year,
        validationState: paper.validation_state,
        qpDocumentId: paper.question_paper_document_id,
        msDocumentId: paper.mark_scheme_document_id,
        question,
      });
    }
    // :98 — the ambiguity law, verbatim
    const ambiguous = resolved > 1 || (parsed.qnum == null && paperRows.length > 1);
    return { parsed, ambiguous, parseDefect: false, papers: hits };
  };
}
