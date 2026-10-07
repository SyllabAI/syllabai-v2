/**
 * FetchService + EnumerateService ports — the deterministic Fetch/Enumerate
 * paths (R4, plan §7; T-MIG-082 tranche B1). Byte-faithful ports of the
 * frozen content/FetchService.java (221 lines) and content/EnumerateService.
 * java (273 lines) @ 6cad6ef, verified line-against-line 2026-10-07.
 *
 * Shared resolution contract (T-C07 — "enumerate never runs unscoped"):
 * both paths resolve the caller's curriculum scope BEFORE any bank SQL and
 * refuse with the honest empty view when unresolved (the ROUTER renders
 * FetchView.empty()/EnumerateView.empty(); the services themselves throw on
 * a null scope — the frozen IllegalArgumentException guard is kept for the
 * direct-call layer).
 *
 * Fetch (FetchService.java:71-100): parse → candidate codes → papers →
 * question assembly by external_ref atom prefix (zero-padding tolerant,
 * '-'-anchored — "q1-" never matches "q10-…"); MAX_PAPERS 6, MAX_MARK_POINTS
 * 60; ambiguous = resolved>1 || (no qnum && papers>1); a query that parses
 * to nothing is a parse defect (honest empty + echo, vector fallback allowed
 * per plan §7). The 4CH0 legacy alias rides LAST (pre-2016 papers are
 * 4CH0-coded while the pilot subject is 4CH1 — bridge alias decision Task 31).
 *
 * Enumerate (EnumerateService.java:86-134): paper axis (the Fetch grammar +
 * the literal word "paper"), spec-point axis (a 4CH[01]-… code in the text),
 * topic axis ("… about <topic> [from YYYY to YYYY]", length-guarded ≤300 —
 * R12 backtracking bound), else "unparsed". Set semantics: topic/spec
 * questions are PAST_PAPER + active; the paper axis is active-policy
 * AGNOSTIC (the C13 import ships paper-anchored rows active=false); paper
 * info attaches via a LEFT JOIN that hides REJECTED papers but keeps their
 * questions listable; dedup key (paper_code, atom, kind) — plan §7.
 */
import type { SqlFn } from "../identity/users";
import type { CurriculumScope } from "../content/scope";
import { parseFetchQuery, type ParsedFetchQuery } from "./fetch-parser";

type Row = Record<string, unknown>;

export const MAX_PAPERS = 6;
export const MAX_MARK_POINTS = 60;
export const MAX_ROWS = 400;

// ── shared view types (the frozen records; serialized by the routes) ───────

export interface MarkPointView {
  ref: string | null;
  text: string | null;
  marks: number | null;
}
export interface PartView {
  label: string | null;
  prompt: string | null;
  marks: number | null;
}
export interface FetchQuestion {
  questionId: string;
  externalRef: string | null;
  stem: string | null;
  marks: number | null;
  questionType: string | null;
  commandWord: string | null;
  parts: PartView[];
  markPoints: MarkPointView[];
}
export interface FetchPaperHit {
  paperId: string;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
  validationState: string | null;
  qpDocumentId: string | null;
  msDocumentId: string | null;
  question: FetchQuestion | null;
}
export interface FetchResult {
  parsed: ParsedFetchQuery;
  ambiguous: boolean;
  parseDefect: boolean;
  papers: FetchPaperHit[];
}

export interface EnumeratedQuestion {
  questionId: string;
  externalRef: string | null;
  stemExcerpt: string | null;
  marks: number | null;
  questionType: string | null;
  paperId: string | null;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
}
export interface EnumerateResult {
  mode: string;
  resolvedNodeCode: string | null;
  resolvedNodeTitle: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  ambiguous: boolean;
  questions: EnumeratedQuestion[];
}

const specCode = /\b(4CH[01]-[0-9][0-9A-Za-z.]*)\b/i;
const topicText = /^.*?(?:about|for)\s+(.+?)(?:\s+from\s+\d{4}\s+to\s+\d{4})?\s*$/is;
const yearWindow = /\bfrom\s+(\d{4})\s+to\s+(\d{4})\b/i;

// ── FetchService ─────────────────────────────────────────────────────────────

interface PaperRow {
  id: string;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
  validationState: string | null;
  qpDocumentId: string | null;
  msDocumentId: string | null;
}

/** Deterministic Fetch: parse → resolve → assemble, no vector calls (:71-100). */
export async function fetchQuery(
  sql: SqlFn,
  query: string,
  scope: CurriculumScope | null,
): Promise<FetchResult> {
  if (query == null || query.trim() === "") {
    throw new Error("query must not be blank");
  }
  if (scope == null) {
    throw new Error(
      "curriculum scope is mandatory — fetch never runs unscoped (T-C07)",
    );
  }
  const parsed = parseFetchQuery(query);
  if (
    parsed.paperCode === null && parsed.unit === null && parsed.series === null &&
    parsed.year === null && parsed.qnum === null
  ) {
    // parse defect: logged, returned honestly as empty with the echo
    return { parsed, ambiguous: false, parseDefect: true, papers: [] };
  }

  const codes = await candidateCodes(sql, parsed, scope);
  const papers = await resolvePapers(sql, parsed, codes, scope);
  const hits: FetchPaperHit[] = [];
  let resolved = 0;
  for (const paper of papers) {
    const question =
      parsed.qnum === null ? null : await resolveQuestion(sql, paper.id, parsed);
    if (question !== null) resolved++;
    hits.push({
      paperId: paper.id,
      paperCode: paper.paperCode,
      sessionLabel: paper.sessionLabel,
      series: paper.series,
      year: paper.year,
      validationState: paper.validationState,
      qpDocumentId: paper.qpDocumentId,
      msDocumentId: paper.msDocumentId,
      question,
    });
  }
  const ambiguous = resolved > 1 || (parsed.qnum === null && papers.length > 1);
  return { parsed, ambiguous, parseDefect: false, papers: hits };
}

/**
 * Candidate paper codes (:108-125): explicit code wins; a bare unit
 * resolves against every subject code in the scope (alphabetical) plus the
 * 4CH0 legacy alias LAST.
 */
async function candidateCodes(
  sql: SqlFn,
  parsed: ParsedFetchQuery,
  scope: CurriculumScope,
): Promise<string[]> {
  if (parsed.paperCode !== null) return [parsed.paperCode];
  if (parsed.unit === null) return [];
  const rows: Row[] = await sql`
    select distinct s.code from subjects s
    where s.curriculum_version_id = ${scope.curriculumVersionId}::uuid and s.code is not null
    order by s.code`;
  const codes = rows
    .map((r) => `${String(r.code)}/${parsed.unit}`)
    .concat(`4CH0/${parsed.unit}`);
  return [...new Set(codes)];
}

async function resolvePapers(
  sql: SqlFn,
  parsed: ParsedFetchQuery,
  codes: string[],
  scope: CurriculumScope,
): Promise<PaperRow[]> {
  if (parsed.year === null) {
    return []; // a year is the minimum anchor for a deterministic fetch
  }
  const codeFilter = codes.length === 0 ? null : codes;
  const rows: Row[] = await sql`
    select ep.id, ep.paper_code, ep.session_label, ep.series, ep.year,
           ep.validation_state, ep.question_paper_document_id, ep.mark_scheme_document_id
    from exam_papers ep
    join subjects s on s.id = ep.subject_id
    where ep.validation_state <> 'REJECTED'
      and s.curriculum_version_id = ${scope.curriculumVersionId}::uuid
      and ep.year = ${parsed.year}
      and (${parsed.series}::varchar(3) is null or ep.series = ${parsed.series}::varchar(3))
      and (${codeFilter}::text[] is null or ep.paper_code = any(${codeFilter}::text[]))
    order by ep.paper_code, ep.session_label
    limit ${MAX_PAPERS}`;
  return rows.map((r) => ({
    id: String(r.id),
    paperCode: r.paper_code == null ? null : String(r.paper_code),
    sessionLabel: r.session_label == null ? null : String(r.session_label),
    series: r.series == null ? null : String(r.series),
    year: r.year == null ? null : Number(r.year),
    validationState: r.validation_state == null ? null : String(r.validation_state),
    qpDocumentId: r.question_paper_document_id == null ? null : String(r.question_paper_document_id),
    msDocumentId: r.mark_scheme_document_id == null ? null : String(r.mark_scheme_document_id),
  }));
}

/**
 * external_ref atom prefix ("q01-<hash>" / "q1-<hash>") — zero-padding
 * tolerant, never a prefix collision ("q1-" does not match "q10-…" because
 * '-' anchors). Active-policy AGNOSTIC (gold-v1 FETCH semantics — :166-171).
 */
async function resolveQuestion(
  sql: SqlFn,
  paperId: string,
  parsed: ParsedFetchQuery,
): Promise<FetchQuestion | null> {
  const refPattern = `^q0*${parsed.qnum}-.*`;
  const hits: Row[] = await sql`
    select q.id, q.external_ref, q.stem, q.marks, q.question_type, q.command_word
    from questions q
    where q.exam_paper_id = ${paperId}::uuid and q.external_ref ~ ${refPattern}
    order by q.external_ref
    limit 1`;
  if (hits.length === 0 || !hits[0]) return null;
  const row = hits[0];
  const questionId = String(row.id);
  return {
    questionId,
    externalRef: row.external_ref == null ? null : String(row.external_ref),
    stem: row.stem == null ? null : String(row.stem),
    marks: row.marks == null ? null : Number(row.marks),
    questionType: row.question_type == null ? null : String(row.question_type),
    commandWord: row.command_word == null ? null : String(row.command_word),
    parts: await questionParts(sql, questionId),
    markPoints: await questionMarkPoints(sql, questionId),
  };
}

/** Latest version's parts in ordering (:192-203). */
async function questionParts(sql: SqlFn, questionId: string): Promise<PartView[]> {
  const rows: Row[] = await sql`
    select qp.label, qp.prompt, qp.marks
    from question_parts qp
    join question_versions qv on qv.id = qp.question_version_id
    where qv.question_id = ${questionId}::uuid
      and qv.version = (select max(version) from question_versions where question_id = ${questionId}::uuid)
    order by qp.ordering`;
  return rows.map((r) => ({
    label: r.label == null ? null : String(r.label),
    prompt: r.prompt == null ? null : String(r.prompt),
    marks: r.marks == null ? null : Number(r.marks),
  }));
}

/** Latest version's mark points (non-REJECTED schemes), version_label then ordering, cap 60 (:205-219). */
async function questionMarkPoints(sql: SqlFn, questionId: string): Promise<MarkPointView[]> {
  const rows: Row[] = await sql`
    select mp.ref, mp.text, mp.marks
    from mark_points mp
    join mark_schemes ms on ms.id = mp.mark_scheme_id
    join question_versions qv on qv.id = ms.question_version_id
    where qv.question_id = ${questionId}::uuid
      and qv.version = (select max(version) from question_versions where question_id = ${questionId}::uuid)
      and ms.validation_state <> 'REJECTED'
    order by ms.version_label, mp.ordering
    limit ${MAX_MARK_POINTS}`;
  return rows.map((r) => ({
    ref: r.ref == null ? null : String(r.ref),
    text: r.text == null ? null : String(r.text),
    marks: r.marks == null ? null : Number(r.marks),
  }));
}

// ── EnumerateService ─────────────────────────────────────────────────────────

/** Plan §7 dedup rule: one hit per (paper_code, atom_number, kind) (:246-252). */
function dedup(rows: EnumeratedQuestion[]): EnumeratedQuestion[] {
  const byKey = new Map<string, EnumeratedQuestion>();
  for (const row of rows) {
    const key = `${row.paperCode ?? "-"}|${
      row.externalRef === null ? "-" : row.externalRef.split("-")[0] ?? "-"
    }|bank`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/** stem excerpt: strip, then cap at 240 chars with the ellipsis (:254-260). */
function excerpt(stem: string | null): string | null {
  if (stem === null) return null;
  const stripped = stem.trim();
  return stripped.length <= 240 ? stripped : `${stripped.slice(0, 240)}…`;
}

/** "from YYYY to YYYY" window or the open window (:262-268). */
function parseWindow(query: string): [number, number] {
  const w = yearWindow.exec(query);
  if (w) return [Number.parseInt(w[1]!, 10), Number.parseInt(w[2]!, 10)];
  return [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
}

/**
 * Enumerates by natural-language query (:86-120): paper axis → spec axis →
 * topic axis → honest "unparsed" empty. The topic axis is length-guarded
 * (R12): real queries never approach 300 chars.
 */
export async function enumerateQuery(
  sql: SqlFn,
  query: string,
  scope: CurriculumScope | null,
): Promise<EnumerateResult> {
  if (query == null || query.trim() === "") {
    throw new Error("query must not be blank");
  }
  if (scope == null) {
    throw new Error(
      "curriculum scope is mandatory — enumerate never runs unscoped (T-C07)",
    );
  }
  const q = query.trim();

  // 1. paper axis — the Fetch grammar resolves code/series/year
  const parsed = parseFetchQuery(q);
  if (
    parsed.paperCode !== null &&
    parsed.year !== null &&
    /\bpaper\b/i.test(q)
  ) {
    return enumeratePaper(sql, parsed, scope);
  }

  // 2. spec-point axis — explicit statement code in the text
  const spec = specCode.exec(q);
  if (spec) {
    return enumerateByNode(sql, spec[1]!, null, parseWindow(q), scope, "spec", null, null);
  }

  // 3. topic axis — "… about <topic>" with an optional year window
  if (q.length <= 300) {
    const topic = topicText.exec(q);
    if (topic && topic[1] != null) {
      const text = topic[1].trim();
      if (text !== "" && text.length >= 3) {
        return enumerateByNode(sql, null, text, parseWindow(q), scope, "topic", null, null);
      }
    }
  }
  return {
    mode: "unparsed", resolvedNodeCode: null, resolvedNodeTitle: null,
    yearFrom: null, yearTo: null, ambiguous: false, questions: [],
  };
}

/** Structured enumeration (no NL parse): node code or title + filters (:122-134). */
export async function enumerateStructured(
  sql: SqlFn,
  nodeCode: string | null,
  nodeTitle: string | null,
  yearFrom: number | null,
  yearTo: number | null,
  marks: number | null,
  questionType: string | null,
  specAxis: boolean,
  scope: CurriculumScope | null,
): Promise<EnumerateResult> {
  if (scope == null) {
    throw new Error(
      "curriculum scope is mandatory — enumerate never runs unscoped (T-C07)",
    );
  }
  return enumerateByNode(
    sql,
    nodeCode,
    nodeTitle,
    [yearFrom ?? Number.MIN_SAFE_INTEGER, yearTo ?? Number.MAX_SAFE_INTEGER],
    scope,
    specAxis ? "spec" : "topic",
    marks,
    questionType,
  );
}

interface PaperIdRow {
  id: string;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
}

/** Paper-axis enumeration (:136-175) — active-policy AGNOSTIC question list. */
async function enumeratePaper(
  sql: SqlFn,
  parsed: ParsedFetchQuery,
  scope: CurriculumScope,
): Promise<EnumerateResult> {
  const paperRows: Row[] = await sql`
    select ep.id, ep.paper_code, ep.session_label, ep.series, ep.year
    from exam_papers ep
    join subjects s on s.id = ep.subject_id
    where ep.validation_state <> 'REJECTED'
      and s.curriculum_version_id = ${scope.curriculumVersionId}::uuid
      and ep.paper_code = ${parsed.paperCode}
      and ep.year = ${parsed.year}
      and (${parsed.series}::varchar(3) is null or ep.series = ${parsed.series}::varchar(3))
    order by ep.paper_code, ep.session_label`;
  if (paperRows.length === 0) {
    return {
      mode: "paper", resolvedNodeCode: parsed.paperCode, resolvedNodeTitle: null,
      yearFrom: null, yearTo: null, ambiguous: false, questions: [],
    };
  }
  // deterministic: exactly one live paper per (code, series, year) — the
  // §8.2 duplicate guard (V35) enforces this invariant at the data layer
  const p = paperRows[0]!;
  const paper: PaperIdRow = {
    id: String(p.id),
    paperCode: p.paper_code == null ? null : String(p.paper_code),
    sessionLabel: p.session_label == null ? null : String(p.session_label),
    series: p.series == null ? null : String(p.series),
    year: p.year == null ? null : Number(p.year),
  };
  const rows: Row[] = await sql`
    select q.id, q.external_ref, q.stem, q.marks, q.question_type
    from questions q
    where q.exam_paper_id = ${paper.id}::uuid and q.provenance = 'PAST_PAPER'
    order by q.external_ref`;
  const questions: EnumeratedQuestion[] = rows.map((r) => ({
    questionId: String(r.id),
    externalRef: r.external_ref == null ? null : String(r.external_ref),
    stemExcerpt: excerpt(r.stem == null ? null : String(r.stem)),
    marks: r.marks == null ? null : Number(r.marks),
    questionType: r.question_type == null ? null : String(r.question_type),
    paperId: paper.id,
    paperCode: paper.paperCode,
    sessionLabel: paper.sessionLabel,
    series: paper.series,
    year: paper.year,
  }));
  return {
    mode: "paper",
    resolvedNodeCode: paper.paperCode,
    resolvedNodeTitle: paper.sessionLabel,
    yearFrom: parsed.year,
    yearTo: parsed.year,
    ambiguous: paperRows.length > 1,
    questions: dedup(questions),
  };
}

/** topic walks question_topics, spec walks the ratified question_spec_points (:237-243). */
function axisTable(mode: string): string {
  return mode === "spec" ? "question_spec_points axis" : "question_topics axis";
}
function axisNodeColumn(mode: string): string {
  return mode === "spec" ? "axis.spec_point_node_id" : "axis.node_id";
}

/**
 * Node-driven enumeration (:181-234). The node lookup is the frozen law —
 * BOTH keys optional, lower()=lower() exact match, order by code, limit 1:
 * a structured call with neither code nor title resolves the FIRST node in
 * code order (replicated verbatim, never "fixed"). Two full SQL variants
 * (no dynamic fragment interpolation — the fragment seams are compile-time
 * constants chosen by the mode enum).
 */
async function enumerateByNode(
  sql: SqlFn,
  nodeCode: string | null,
  nodeTitle: string | null,
  window: [number, number],
  scope: CurriculumScope,
  mode: string,
  marks: number | null,
  questionType: string | null,
): Promise<EnumerateResult> {
  const nodeRows: Row[] = await sql`
    select kn.id, kn.code, kn.title
    from knowledge_nodes kn
    where (${nodeCode}::text is null or lower(kn.code) = lower(${nodeCode}::text))
      and (${nodeTitle}::text is null or lower(kn.title) = lower(${nodeTitle}::text))
    order by kn.code
    limit 1`;
  if (nodeRows.length === 0 || !nodeRows[0]) {
    return {
      mode, resolvedNodeCode: nodeCode, resolvedNodeTitle: nodeTitle,
      yearFrom: null, yearTo: null, ambiguous: false, questions: [],
    };
  }
  const node = {
    id: String(nodeRows[0].id),
    code: nodeRows[0].code == null ? null : String(nodeRows[0].code),
    title: nodeRows[0].title == null ? null : String(nodeRows[0].title),
  };
  const fromYear = window[0] === Number.MIN_SAFE_INTEGER ? null : String(window[0]);
  const toYear = window[1] === Number.MAX_SAFE_INTEGER ? null : String(window[1]);
  const fromNum = fromYear === null ? null : Number(fromYear);
  const toNum = toYear === null ? null : Number(toYear);
  // The frozen :formatted(axisTable, axisNodeColumn) seam — two compile-time
  // constant variants, written out verbatim (the v2 sql seam has no fragment
  // composition; the mode is a closed enum, so the pair is exhaustive).
  const rows: Row[] =
    mode === "spec"
      ? await sql`
    select q.id, q.external_ref, q.stem, q.marks, q.question_type,
           ep.id paper_id, ep.paper_code, ep.session_label, ep.series, ep.year
    from question_spec_points axis
    join questions q on q.id = axis.question_id and q.provenance = 'PAST_PAPER' and q.active
    join knowledge_nodes kn on kn.id = axis.spec_point_node_id
    left join exam_papers ep on ep.id = q.exam_paper_id
         and ep.validation_state <> 'REJECTED'
    where kn.id = ${node.id}::uuid
      and (${fromNum}::int is null or ep.year >= ${fromNum}::int)
      and (${toNum}::int is null or ep.year <= ${toNum}::int)
      and (${marks}::int is null or q.marks = ${marks}::int)
      and (${questionType}::text is null or q.question_type = ${questionType}::text)
    order by ep.year nulls last, ep.series nulls last, ep.paper_code nulls last,
             q.external_ref nulls last
    limit ${MAX_ROWS}`
      : await sql`
    select q.id, q.external_ref, q.stem, q.marks, q.question_type,
           ep.id paper_id, ep.paper_code, ep.session_label, ep.series, ep.year
    from question_topics axis
    join questions q on q.id = axis.question_id and q.provenance = 'PAST_PAPER' and q.active
    join knowledge_nodes kn on kn.id = axis.node_id
    left join exam_papers ep on ep.id = q.exam_paper_id
         and ep.validation_state <> 'REJECTED'
    where kn.id = ${node.id}::uuid
      and (${fromNum}::int is null or ep.year >= ${fromNum}::int)
      and (${toNum}::int is null or ep.year <= ${toNum}::int)
      and (${marks}::int is null or q.marks = ${marks}::int)
      and (${questionType}::text is null or q.question_type = ${questionType}::text)
    order by ep.year nulls last, ep.series nulls last, ep.paper_code nulls last,
             q.external_ref nulls last
    limit ${MAX_ROWS}`;
  const questions: EnumeratedQuestion[] = rows.map((r) => ({
    questionId: String(r.id),
    externalRef: r.external_ref == null ? null : String(r.external_ref),
    stemExcerpt: excerpt(r.stem == null ? null : String(r.stem)),
    marks: r.marks == null ? null : Number(r.marks),
    questionType: r.question_type == null ? null : String(r.question_type),
    paperId: r.paper_id == null ? null : String(r.paper_id),
    paperCode: r.paper_code == null ? null : String(r.paper_code),
    sessionLabel: r.session_label == null ? null : String(r.session_label),
    series: r.series == null ? null : String(r.series),
    year: r.year == null ? null : Number(r.year),
  }));
  return {
    mode,
    resolvedNodeCode: node.code,
    resolvedNodeTitle: node.title,
    yearFrom: fromYear === null ? null : Number(fromYear),
    yearTo: toYear === null ? null : Number(toYear),
    ambiguous: false,
    questions: dedup(questions),
  };
}
