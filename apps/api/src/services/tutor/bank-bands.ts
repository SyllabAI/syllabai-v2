/**
 * T-MIG-128/129 — the tutor bank bands: two DETERMINISTIC read resolvers the
 * operator ordered (trace 1a14080256278b41). Post-core v2-native surfaces —
 * NOT frozen-core parity (no @ 6cad6ef counterpart exists); the laws they
 * ride are the repo's own of-record determinism:
 *
 *   band (1) question listing — "give me all questions related to 'organic
 *     chemistry' / a spec point". Node resolution over the ACTIVE scope's KG
 *     surface (T-C07 fail-closed: matched nodes outside the surface never
 *     resolve), then a bank census under FETCH semantics:
 *       - active-policy AGNOSTIC (gold-v1 FETCH law, fetch-bank.ts — the
 *         bank's paper-anchored rows are the paper's content whether or not
 *         the learner surface has activated them; production truth: the
 *         4CH1 bank rows are active=false),
 *       - the V20 paper-level gate (a REJECTED/FLAGGED exam paper blocks
 *         EVERYTHING under it — servable.ts blockingPaperIds law),
 *       - paperless rows serve with paper=null (the card-bank rows),
 *         honestly disclosed by the nullable paper ref.
 *     Axis precedence (deterministic, one axis binds): nodeId > spec > topic.
 *
 *   band (2) whole-paper fetch — "give me the full 2019 june paper 1". The
 *     frozen Fetch bank resolves the identity (parseFetchQuery + bank SQL —
 *     REJECTED papers invisible, year = minimum anchor, MAX_PAPERS bound);
 *     the band then BINDS first-unit-match (unitCandidates order, the
 *     resolver's first-match-wins posture: "paper 1" → 1C outranks 1CR) and
 *     serves ONE view: paper + structured bank questions (external_ref
 *     order, marks included) + the paired QP and MS chunks. Document law =
 *     the resolver's branch-1 posture (paper-question.ts:284-295): the
 *     paper row is VALIDATED; the linked document row may sit SUGGESTED,
 *     but a REJECTED top version never serves and the kind must match.
 *     Sibling VALIDATED candidates are disclosed, never hidden.
 *
 * STRUCTURAL SEAM (the fetch-parser doctrine): findTopByDocumentId /
 * chunksByRowId are the paper-question port's private SQL re-carried here —
 * the seam collapses if/when a canonical content-band port lands. Zero LLM,
 * zero vector calls on every path. SQL note: the createSql adapter
 * (identity/users toQuery) serializes $N params only — every statement here
 * is ONE flat template, fully parameterized (no fragments, no .raw).
 */
import type { SqlFn } from "./sql";
import { parseFetchQuery, parsedIsEmpty } from "./fetch-parser";
import { buildTutorFetchBank } from "./fetch-bank";
import { unitCandidates, unitFromPaperCode } from "./paper-question";
import { hygienicStem } from "./stem-hygiene";
import { figuresByQuestionNumber, questionNumberOf } from "./paper-figures";
import type {
  TutorBankPaperChunk,
  TutorBankPaperDocumentView,
  TutorBankPaperFullView,
  TutorBankPaperRef,
  TutorBankQuestionItem,
  TutorBankQuestionsParams,
  TutorBankQuestionsView,
  TutorBankResolvedNode,
  TutorQuestionFigure,
} from "@syllabai/contracts";

/** The scope the bands read (CurriculumScopeResolver satisfies structurally). */
export interface BankBandsScope {
  curriculumVersionId: string;
  code: string;
  /** The KG intent surface — matched nodes outside it never resolve (T-C07). */
  surface: ReadonlySet<string>;
}

/** Honest per-kind cap on a whole-paper chunk dump (live truth: 18 QP / 12 MS
 * chunks for 4CH1/1C JUN-2019; the cap only fires on pathological corpora). */
export const MAX_PAPER_CHUNKS_PER_KIND = 500;

// ── node resolution (band 1) ────────────────────────────────────────────────

interface NodeRow {
  id: string;
  node_type: string;
  title: string;
  code: string | null;
}

const nodeOf = (r: NodeRow): TutorBankResolvedNode => ({
  id: String(r.id),
  nodeType: String(r.node_type),
  title: String(r.title),
  code: r.code == null ? null : String(r.code),
});

/** Surface filter in code (T-C07): a matched node outside the active KG
 * surface never resolves. */
function inSurface(rows: NodeRow[], surface: ReadonlySet<string>): NodeRow[] {
  if (surface.size === 0) return [];
  return rows.filter((r) => surface.has(String(r.id)));
}

/**
 * Topic name → node ids. Exact (case-insensitive) title matches win at any
 * count; otherwise every substring match resolves (a superset answer,
 * disclosed by resolvedNodes — "all questions related to X" is intentionally
 * generous).
 */
async function topicNodeIds(sql: SqlFn, topic: string): Promise<string[]> {
  const exact = (await sql`
    select n.id from knowledge_nodes n where lower(n.title) = lower(${topic})`) as Array<{ id: string }>;
  if (exact.length > 0) return exact.map((r) => String(r.id));
  const sub = (await sql`
    select n.id from knowledge_nodes n where n.title ilike ${`%${topic}%`}`) as Array<{ id: string }>;
  return sub.map((r) => String(r.id));
}

/**
 * Spec-point code → SUBTOPIC spec-node ids. Exact code match first; then the
 * bare-suffix form ("2.44" resolves "4CH1-2.44" — the subject prefix is the
 * code's own dash).
 */
async function specNodeIds(sql: SqlFn, spec: string): Promise<string[]> {
  const exact = (await sql`
    select n.id from knowledge_nodes n where lower(n.code) = lower(${spec})`) as Array<{ id: string }>;
  if (exact.length > 0) return exact.map((r) => String(r.id));
  const sub = (await sql`
    select n.id from knowledge_nodes n where lower(n.code) like ${`%-${spec.toLowerCase()}`}`) as Array<{ id: string }>;
  return sub.map((r) => String(r.id));
}

/** Verbatim subtree CTE shape (scope.ts subtreeIds law): children via
 * PART_OF edges whose target is the parent. */
async function subtreeIds(sql: SqlFn, rootId: string): Promise<string[]> {
  const rows = (await sql`
    WITH RECURSIVE subtree AS (
        SELECT n.id
        FROM knowledge_nodes n
        WHERE n.id = ${rootId}
        UNION
        SELECT e.source_node_id
        FROM knowledge_edges e
        JOIN subtree s ON e.target_node_id = s.id
        WHERE e.relation_type = 'PART_OF'
    )
    SELECT n.id FROM knowledge_nodes n WHERE n.id IN (SELECT id FROM subtree)`) as Array<{ id: string }>;
  return rows.map((r) => String(r.id));
}

async function nodeRowsByIds(sql: SqlFn, ids: string[], surface: ReadonlySet<string>): Promise<NodeRow[]> {
  if (ids.length === 0) return [];
  const rows = (await sql`
    select n.id, n.node_type, n.title, n.code
    from knowledge_nodes n
    where n.id = any(${ids}::uuid[])`) as unknown as NodeRow[];
  return inSurface(rows, surface);
}

export interface ResolvedNodes {
  nodes: NodeRow[];
  /** spec mode maps questions through question_spec_points; topic/nodeId
   * mode through primary_topic_node_id / question_topics. */
  mode: "nodeId" | "spec" | "topic";
}

/** Axis precedence nodeId > spec > topic — deterministic, one axis binds. */
async function resolveNodes(
  sql: SqlFn,
  params: Pick<TutorBankQuestionsParams, "nodeId" | "spec" | "topic">,
  scope: BankBandsScope,
): Promise<ResolvedNodes> {
  if (params.nodeId != null) {
    return { nodes: await nodeRowsByIds(sql, [params.nodeId], scope.surface), mode: "nodeId" };
  }
  if (params.spec != null) {
    const ids = await specNodeIds(sql, params.spec);
    return { nodes: await nodeRowsByIds(sql, ids, scope.surface), mode: "spec" };
  }
  const topic = params.topic ?? "";
  const matched = await topicNodeIds(sql, topic);
  // topic mode expands: a UNIT resolves to its TOPIC children, a TOPIC to
  // its SUBTOPICs — the mapping set is matched ∪ subtree(matched)
  const ids = new Set<string>();
  for (const id of matched) {
    ids.add(id);
    for (const sub of await subtreeIds(sql, id)) {
      ids.add(sub);
    }
  }
  return {
    nodes: await nodeRowsByIds(sql, [...ids], scope.surface),
    mode: "topic",
  };
}

// ── the listing (band 1) ────────────────────────────────────────────────────

interface ListingRow {
  id: string;
  external_ref: string | null;
  question_type: string | null;
  stem: string;
  marks: number;
  command_word: string | null;
  paper_id: string | null;
  paper_title: string | null;
  paper_code: string | null;
  session_label: string | null;
  paper_series: string | null;
  paper_year: number | null;
  paper_state: string | null;
}

const paperRefOf = (r: ListingRow): TutorBankPaperRef | null =>
  r.paper_id == null
    ? null
    : {
        paperId: String(r.paper_id),
        title: r.paper_title == null ? null : String(r.paper_title),
        paperCode: r.paper_code == null ? null : String(r.paper_code),
        sessionLabel: r.session_label == null ? null : String(r.session_label),
        series: r.paper_series == null ? null : String(r.paper_series),
        year: r.paper_year == null ? null : Number(r.paper_year),
        validationState: String(r.paper_state ?? ""),
      };

/** Batched spec codes per question id (code-ordered; the T-C28 dialect,
 * code-only projection). */
async function specCodesByQuestion(sql: SqlFn, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = (await sql`
    select qsp.question_id, kn.code
    from question_spec_points qsp
    join knowledge_nodes kn on kn.id = qsp.spec_point_node_id
    where qsp.question_id = any(${ids}::uuid[])
    order by kn.code`) as Array<{ question_id: string; code: string }>;
  for (const r of rows) {
    const qid = String(r.question_id);
    const list = map.get(qid);
    if (list) list.push(String(r.code));
    else map.set(qid, [String(r.code)]);
  }
  return map;
}

const itemOf = (
  r: ListingRow,
  codes: string[],
  figures: TutorQuestionFigure[] = [],
): TutorBankQuestionItem => ({
  questionId: String(r.id),
  externalRef: r.external_ref == null ? null : String(r.external_ref),
  questionType: r.question_type == null ? null : String(r.question_type),
  // run-004 proposal #1: the serve-side stem-hygiene projection — the stored
  // row of record is untouched; the learner-facing stem never carries the
  // extraction-furniture/math-markup classes (census-cited law).
  stem: hygienicStem(String(r.stem)),
  marks: Number(r.marks),
  commandWord: r.command_word == null ? null : String(r.command_word),
  specPointCodes: codes,
  paper: paperRefOf(r),
  // lane #3: the parser's own figure attribution, page-resolved — the
  // honest empty [] when the paper carries no figure data of record.
  figures,
});

// ── the whole-paper fetch (band 2) ──────────────────────────────────────────

interface DocumentRow {
  id: string;
  document_id: string;
  doc_version: number;
  kind: string | null;
  validation_state: string;
}

interface ChunkRow {
  id: string;
  chunk_index: number;
  content: string;
  page_start: number | null;
  page_end: number | null;
  atom_number: string | null;
}

/** paper-question.ts:142-153 verbatim shape (top version by doc_version). */
async function findTopByDocumentId(sql: SqlFn, documentId: string): Promise<DocumentRow | null> {
  const rows = (await sql`
    select id, document_id, doc_version, kind, validation_state
    from documents
    where document_id = ${documentId}
    order by doc_version desc
    limit 1`) as unknown as DocumentRow[];
  return rows[0] ?? null;
}

/** paper-question.ts:176-182 verbatim shape, full order by chunk_index. */
async function chunksByRowId(sql: SqlFn, rowId: string): Promise<ChunkRow[]> {
  return (await sql`
    select id, chunk_index, content, page_start, page_end, atom_number
    from document_chunks
    where document_row_id = ${rowId}
    order by chunk_index asc`) as unknown as ChunkRow[];
}

/**
 * Branch-1 document acceptance (paper-question.ts:284-295 posture): the
 * paper row is VALIDATED (the caller gates it); the document's own
 * SUGGESTED state does not block, a REJECTED top version never serves, and
 * the kind must match.
 */
function acceptsDocument(doc: DocumentRow | null, expectedKind: string): boolean {
  return doc != null && doc.validation_state !== "REJECTED" && doc.kind === expectedKind;
}

const chunkOf = (doc: DocumentRow, c: ChunkRow): TutorBankPaperChunk => ({
  chunkIndex: Number(c.chunk_index),
  // the F-022 reader law: /sources/{row} resolves a DOCUMENTS.id row
  // (existsCitable) — the evidence chain carries doc.id under this field
  // (paper-question.ts evidence()), and the band view now does too. The
  // chunk's own identity is the (documentRowId, chunkIndex) pair.
  documentRowId: String(doc.id),
  documentId: String(doc.document_id),
  pageStart: c.page_start == null ? null : Number(c.page_start),
  pageEnd: c.page_end == null ? null : Number(c.page_end),
  content: String(c.content),
  atomNumber: c.atom_number == null ? null : String(c.atom_number),
});

async function documentView(
  sql: SqlFn,
  documentId: string | null,
  expectedKind: string,
): Promise<TutorBankPaperDocumentView> {
  if (documentId == null) return { documentId: null, chunkCount: 0, chunks: [] };
  const top = await findTopByDocumentId(sql, documentId);
  if (top == null || !acceptsDocument(top, expectedKind)) {
    // honest absence — the linked row is REJECTED (or kind-confected)
    return { documentId: top?.document_id ?? documentId, chunkCount: 0, chunks: [] };
  }
  const rows = await chunksByRowId(sql, top.id);
  const chunks = rows.slice(0, MAX_PAPER_CHUNKS_PER_KIND).map((c) => chunkOf(top, c));
  return { documentId: String(top.document_id), chunkCount: chunks.length, chunks };
}

const bankQuestionItemOf = (
  r: Pick<ListingRow, "id" | "external_ref" | "question_type" | "stem" | "marks" | "command_word">,
  codes: string[],
  paper: TutorBankPaperRef,
  figures: TutorQuestionFigure[] = [],
): TutorBankQuestionItem => ({
  questionId: String(r.id),
  externalRef: r.external_ref == null ? null : String(r.external_ref),
  questionType: r.question_type == null ? null : String(r.question_type),
  // the same stem-hygiene projection as the listing (one law, both bands)
  stem: hygienicStem(String(r.stem)),
  marks: Number(r.marks),
  commandWord: r.command_word == null ? null : String(r.command_word),
  specPointCodes: codes,
  paper,
  // lane #3: same projection as the listing (one law, both bands)
  figures,
});

// ── the module ──────────────────────────────────────────────────────────────

export type PaperFetchResult =
  | { status: "FULL"; view: TutorBankPaperFullView }
  | { status: "NOT_FOUND"; label: string };

export function buildBankBands(sql: SqlFn) {
  const bank = buildTutorFetchBank(sql);

  async function listQuestions(
    params: TutorBankQuestionsParams,
    scope: BankBandsScope,
  ): Promise<TutorBankQuestionsView> {
    const resolved = await resolveNodes(sql, params, scope);
    const ids = resolved.nodes.map((n) => String(n.id));
    if (ids.length === 0) {
      return { resolvedNodes: resolved.nodes.map(nodeOf), total: 0, items: [] };
    }

    // One flat template: the axis predicate branches on a boolean param
    // (spec maps through question_spec_points; topic/nodeId map through
    // primary_topic_node_id | question_topics), then the V20 paper gate +
    // the optional paper filters. Paperless rows pass the paper gate
    // (exam_paper_id is null) — the nullable ref discloses them.
    const isSpec = resolved.mode === "spec";
    const rows = (await sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks, q.command_word,
             ep.id as paper_id, ep.title as paper_title, ep.paper_code,
             ep.session_label, ep.series as paper_series, ep.year as paper_year,
             ep.validation_state as paper_state
      from questions q
      left join exam_papers ep on ep.id = q.exam_paper_id
      where (
              (${isSpec}::boolean and exists (
                    select 1 from question_spec_points qsp
                    where qsp.question_id = q.id
                      and qsp.spec_point_node_id = any(${ids}::uuid[])))
              or
              (not (${isSpec})::boolean and (
                    q.primary_topic_node_id = any(${ids}::uuid[]) or exists (
                      select 1 from question_topics qt
                      where qt.question_id = q.id
                        and qt.node_id = any(${ids}::uuid[]))))
            )
        and (q.exam_paper_id is null or not exists (
              select 1 from exam_papers b
              where b.id = q.exam_paper_id
                and b.validation_state in ('REJECTED', 'FLAGGED')))
        and (${params.paperCode ?? null}::varchar is null or ep.paper_code = ${params.paperCode ?? null}::varchar)
        and (${params.year ?? null}::int is null or ep.year = ${params.year ?? null}::int)
        and (${params.series ?? null}::varchar(3) is null or ep.series = ${params.series ?? null}::varchar(3))
      order by (ep.id is null), ep.year desc nulls last, ep.paper_code nulls last,
               q.external_ref nulls last, q.id`) as unknown as ListingRow[];

    const codes = await specCodesByQuestion(
      sql,
      rows.map((r) => String(r.id)),
    );
    // lane #3: figure maps for the SHOWN items' distinct papers (after the
    // limit cut — the census total never pays for figures). Each resolve is
    // two small fail-open reads; a listing spans a handful of papers.
    const shown = rows.slice(0, params.limit);
    const figMaps = new Map<string, Map<string, TutorQuestionFigure[]>>();
    for (const pid of [...new Set(shown.map((r) => r.paper_id).filter((p): p is string => p != null))]) {
      figMaps.set(String(pid), await figuresByQuestionNumber(sql, String(pid)));
    }
    return {
      resolvedNodes: resolved.nodes.map(nodeOf),
      total: rows.length,
      items: shown.map((r) =>
        itemOf(
          r,
          codes.get(String(r.id)) ?? [],
          r.paper_id == null
            ? []
            : (figMaps.get(String(r.paper_id))?.get(
                questionNumberOf(r.external_ref == null ? null : String(r.external_ref)) ?? "",
              ) ?? []),
        ),
      ),
    };
  }

  async function fetchPaper(query: string, scope: BankBandsScope): Promise<PaperFetchResult> {
    const parsed = parseFetchQuery(query);
    if (parsedIsEmpty(parsed)) {
      return { status: "NOT_FOUND", label: query.trim() };
    }
    const fetch = await bank(query, scope);
    const label = fetch.parsed.normalized || query.trim();
    // Serving law: only a VALIDATED paper row serves a whole-paper view
    // (branch-1 posture; the bank already hides REJECTED rows).
    const candidates = fetch.papers.filter((p) => p.validationState === "VALIDATED");
    if (candidates.length === 0) {
      return { status: "NOT_FOUND", label };
    }
    // First-unit-match binding (unitCandidates order — "paper 1" → 1C
    // outranks 1CR; explicit code binds exactly; no hint → home units
    // first). Deterministic, disclosed: the unbound candidates ride the
    // view as siblings.
    const units = unitCandidates(fetch.parsed, query);
    let bound = candidates[0]!;
    for (const unit of units) {
      const hit = candidates.find(
        (p) => p.paperCode != null && unitFromPaperCode(p.paperCode) === unit,
      );
      if (hit != null) {
        bound = hit;
        break;
      }
    }
    const paperRef: TutorBankPaperRef = {
      paperId: bound.paperId,
      title: null,
      paperCode: bound.paperCode,
      sessionLabel: bound.sessionLabel,
      series: bound.series,
      year: bound.year,
      validationState: bound.validationState,
    };
    // title from the bound row (the bank hit carries no title — one read)
    const titleRows = (await sql`
      select ep.title from exam_papers ep where ep.id = ${bound.paperId}`) as Array<{ title: string | null }>;
    paperRef.title = titleRows[0]?.title ?? null;

    const [questionPaper, markScheme] = await Promise.all([
      documentView(sql, bound.qpDocumentId, "QUESTION_PAPER"),
      documentView(sql, bound.msDocumentId, "MARK_SCHEME"),
    ]);

    // The structured bank rows of the bound paper — active-policy AGNOSTIC
    // (gold-v1 FETCH semantics), external_ref order, marks included.
    const rows = (await sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks, q.command_word
      from questions q
      where q.exam_paper_id = ${bound.paperId}
      order by q.external_ref, q.id`) as unknown as Array<
      Pick<ListingRow, "id" | "external_ref" | "question_type" | "stem" | "marks" | "command_word">
    >;
    const codes = await specCodesByQuestion(
      sql,
      rows.map((r) => String(r.id)),
    );
    // lane #3: the bound paper's figure map — the parser's own attribution
    // (the GLM draft refs) resolved to canonical pages, fail-open.
    const figMap = await figuresByQuestionNumber(sql, bound.paperId);
    const questions = rows.map((r) =>
      bankQuestionItemOf(
        r,
        codes.get(String(r.id)) ?? [],
        paperRef,
        figMap.get(
          questionNumberOf(r.external_ref == null ? null : String(r.external_ref)) ?? "",
        ) ?? [],
      ),
    );

    const siblings = candidates
      .filter((p) => p.paperId !== bound.paperId)
      .map<TutorBankPaperRef>((p) => ({
        paperId: p.paperId,
        title: null,
        paperCode: p.paperCode,
        sessionLabel: p.sessionLabel,
        series: p.series,
        year: p.year,
        validationState: p.validationState,
      }));

    return {
      status: "FULL",
      view: { paper: paperRef, questions, questionPaper, markScheme, siblings },
    };
  }

  return { listQuestions, fetchPaper };
}
