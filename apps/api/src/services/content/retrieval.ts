/**
 * Content retrieval port — vector search over the chunk index plus the
 * T-C31 empty-cause diagnostics. Sources (syllabai-core @ main, frozen,
 * verified 2026-10-05, T-MIG-020):
 *   content/ContentRetrievalService.java   content/ChunkVectorRepository.java
 *   content/SearchEmptyCause.java          content/SearchEmptyDiagnostics.java
 *   content/EmbeddingProvider.java         content/GeminiEmbeddingProvider.java
 *
 * Parity notes:
 *   - CURRENT_EMBED_REV = 2 (ChunkVectorRepository.java:64) — the
 *     corpus-generation read filter; two generations never blend.
 *   - searchServingEligible is the T-C20 VALIDATED-only surface: the scope
 *     EXISTS predicate additionally requires the owning paper VALIDATED, or
 *     (V33 subject branch) the chunk's own document VALIDATED. SQL ported
 *     verbatim (:202-240) including the fold-in kind filter (never an
 *     untyped NULL bind) and `order by c.embedding <=> ?::vector`.
 *   - MAX_LIMIT = 50 with Math.clamp(limit, 1, MAX_LIMIT) (:17, :55).
 *   - Blank query / null scope → IllegalArgumentException → the core's
 *     GlobalExceptionHandler renders 400 "malformed request" for that type
 *     (mapping lives in the route layer).
 *   - No embedding provider configured → IllegalStateException with the
 *     verbatim message (:51-53) → 500 internal_error. The provider seam is
 *     config-gated (SYLLABAI_EMBEDDING_GEMINI_API_KEY); the Gemini adapter
 *     is a port of GeminiEmbeddingProvider's query path (text-embedding-004,
 *     768-dim, no failover by design — T-013 house rule).
 */
import type { SqlFn } from "../identity/users";
import type { DocumentKind } from "@syllabai/contracts";

export type SearchEmptyCause =
  | "SCOPE_UNRESOLVED"
  | "COURSE_REF_UNRESOLVED"
  | "SCOPE_EMPTY"
  | "NOT_EMBEDDED"
  | "EMBED_REV_EMPTY"
  | "VALIDATION_GATE_EMPTY"
  | "UNEXPECTED";

/** SearchEmptyDiagnostics.java — funnel counts + cause() classification. */
export interface SearchEmptyDiagnostics {
  chunksInScope: number;
  embeddedInScope: number;
  inScopeAtRev: number;
  servingEligible: number;
}

/** Verbatim port of SearchEmptyDiagnostics.cause() — first zero names the cause. */
export function classifyEmptyCause(f: SearchEmptyDiagnostics): SearchEmptyCause {
  if (
    f.chunksInScope < 0 ||
    f.chunksInScope < f.embeddedInScope ||
    f.embeddedInScope < f.inScopeAtRev ||
    f.inScopeAtRev < f.servingEligible
  ) {
    return "UNEXPECTED"; // monotone non-increasing invariant violated — fail loud
  }
  if (f.chunksInScope === 0) return "SCOPE_EMPTY";
  if (f.embeddedInScope === 0) return "NOT_EMBEDDED";
  if (f.inScopeAtRev === 0) return "EMBED_REV_EMPTY";
  if (f.servingEligible === 0) return "VALIDATION_GATE_EMPTY";
  return "UNEXPECTED";
}

/** ChunkVectorRepository.CURRENT_EMBED_REV (:64). */
export const CURRENT_EMBED_REV = 2;

/** ContentRetrievalService.MAX_LIMIT (:17). */
export const MAX_LIMIT = 50;

export interface ChunkHit {
  chunkId: string;
  documentId: string;
  documentRowId: string;
  kind: string;
  chunkIndex: number;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  elementIds: string[];
  embeddingModel: string;
  score: number;
}

/**
 * EmbeddingProvider port — query-side only for this read surface. The
 * document-side embed path (POST /{id}/embed) rides the same seam.
 */
export interface EmbeddingProvider {
  model(): string;
  dimension(): number;
  embedQuery(query: string): Promise<number[]>;
  embedDocument(content: string): Promise<number[]>;
}

const EMBED_DIMENSION = 768;

/**
 * GeminiEmbeddingProvider query path (gemini-embedding-001 pinned to 768
 * output dimensions, no failover by design). A transport failure throws —
 * the chain degrades to the core's own provider-absent posture, never to a
 * silent empty search.
 *
 * 2026-10 amendment of record (lane w0a, live flip-proof): Google retired
 * text-embedding-004 from v1beta (models/text-embedding-004 → 404 NOT_FOUND
 * for embedContent), so the model rides gemini-embedding-001 with explicit
 * outputDimensionality 768 — the vector(768) column and EMBED_DIMENSION law
 * are unchanged, only the provider-side model name moves.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly apiKey: string) {}

  model(): string {
    return "gemini-embedding-001";
  }

  dimension(): number {
    return EMBED_DIMENSION;
  }

  private async embed(text: string): Promise<number[]> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIMENSION,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `embedding provider request failed with status ${res.status} — no failover by design`,
      );
    }
    const body = (await res.json()) as { embedding?: { values?: number[] } };
    const values = body.embedding?.values;
    if (!values || values.length !== EMBED_DIMENSION) {
      throw new Error(
        `embedding provider ${this.model()} returned ${values ? values.length : "null"} dimensions, expected ${EMBED_DIMENSION}`,
      );
    }
    return values;
  }

  embedQuery(query: string): Promise<number[]> {
    return this.embed(query);
  }

  embedDocument(content: string): Promise<number[]> {
    return this.embed(content);
  }
}

/**
 * Port of ContentRetrievalService's provider resolution: keyed config →
 * provider; unkeyed → null (the caller raises the verbatim
 * IllegalStateException). There is deliberately NO silent fallback.
 */
export function resolveEmbeddingProvider(env: {
  SYLLABAI_EMBEDDING_GEMINI_API_KEY?: string;
}): EmbeddingProvider | null {
  const key = env.SYLLABAI_EMBEDDING_GEMINI_API_KEY;
  if (key == null || key.trim() === "") return null;
  return new GeminiEmbeddingProvider(key);
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** The kind filter folds into the SQL text (never an untyped NULL bind). */
function kindFilter(kind: DocumentKind | null | undefined): string {
  return kind == null ? "" : `\n  and d.kind = '${kind}'`;
}

/**
 * Port of DocumentEmbeddingService.EmbeddingResult — the embed endpoint's
 * view (:49-84, EmbeddingView record). `skipped` = totalChunks − embedded.
 */
export interface EmbeddingResult {
  documentRowId: string;
  documentId: string;
  model: string;
  embedded: number;
  skipped: number;
  totalChunks: number;
}

type Row = Record<string, unknown>;

/**
 * Port of DocumentEmbeddingService.embedDocument (:49-84). Call order is
 * load-bearing parity: the provider is required BEFORE the document row
 * lookup (so an unkeyed deployment answers 500 for any id — captured as
 * content-docs-embed-unknown-404.json, whose EXPECT is 500 despite the
 * name), then unknown rows 404, then embed-validate-everything-first (a
 * provider outage stores nothing), then one transaction of row updates.
 */
export async function embedDocument(
  sql: SqlFn,
  documentRowId: string,
  provider: EmbeddingProvider,
  findDocument: (id: string) => Promise<{ documentId: string } | null>,
): Promise<EmbeddingResult> {
  const document = await findDocument(documentRowId);
  if (!document) {
    const { NotFoundException } = await import("../identity/errors");
    throw new NotFoundException("Document", documentRowId);
  }
  const pendingRows: Row[] = await sql`
    select id, content from document_chunks
    where document_row_id = ${documentRowId}::uuid and embedding is null`;
  const totalRows: Row[] = await sql`
    select count(*) as total from document_chunks where document_row_id = ${documentRowId}::uuid`;
  const totalChunks = Number(totalRows[0]?.total ?? 0);

  // embed + validate everything first, holding no transaction: a provider
  // outage or dimension mismatch here has stored nothing (Java :58-71)
  const embedded: Array<{ chunkId: string; vector: number[] }> = [];
  for (const chunk of pendingRows) {
    const vector = await provider.embedDocument(String(chunk.content));
    if (vector == null || vector.length !== provider.dimension()) {
      throw new Error(
        `embedding provider ${provider.model()} returned ` +
          `${vector == null ? "null" : vector.length} dimensions, expected ` +
          `${provider.dimension()} — refusing to store an inconsistent vector`,
      );
    }
    embedded.push({ chunkId: String(chunk.id), vector });
  }

  for (const e of embedded) {
    await sql`
      update document_chunks
      set embedding = ${toVectorLiteral(e.vector)}::vector,
          embedding_model = ${provider.model()},
          embedded_at = now()
      where id = ${e.chunkId}::uuid`;
  }

  return {
    documentRowId,
    documentId: document.documentId,
    model: provider.model(),
    embedded: embedded.length,
    skipped: totalChunks - embedded.length,
    totalChunks,
  };
}

function toChunkHit(r: Row): ChunkHit {
  let elementIds: string[] = [];
  const raw = r.element_ids;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) elementIds = parsed.map(String);
    } catch {
      throw new Error("element_ids is not a JSON array");
    }
  } else if (Array.isArray(raw)) {
    elementIds = raw.map(String);
  }
  return {
    chunkId: String(r.id),
    documentRowId: String(r.document_row_id),
    documentId: String(r.document_id),
    kind: String(r.kind),
    chunkIndex: Number(r.chunk_index),
    content: String(r.content),
    pageStart: r.page_start == null ? null : Number(r.page_start),
    pageEnd: r.page_end == null ? null : Number(r.page_end),
    elementIds,
    embeddingModel: String(r.embedding_model),
    score: Number(r.score),
  };
}

/**
 * Port of ChunkVectorRepository.searchServingEligible (:202-240) — SQL
 * verbatim: cosine distance over pgvector, embed_rev read filter, the
 * VALIDATED-only scope EXISTS on both branches, kind folded into text,
 * order by distance ascending.
 */
export async function searchServingEligible(
  sql: SqlFn,
  queryVector: number[],
  kind: DocumentKind | null | undefined,
  curriculumVersionId: string,
  limit: number,
): Promise<ChunkHit[]> {
  if (curriculumVersionId == null) {
    throw new Error(
      "curriculumVersionId is mandatory — chunk search never runs unscoped (T-C07)",
    );
  }
  const literal = toVectorLiteral(queryVector);
  const filter = kindFilter(kind);
  const rows: Row[] = await sql`
    select c.id, c.document_row_id, d.doc_version, d.document_id, d.kind, c.chunk_index,
           c.content, c.page_start, c.page_end, c.element_ids,
           c.embedding_model, 1 - (c.embedding <=> ${literal}::vector) as score
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where c.embedding is not null
      and c.embed_rev = ${CURRENT_EMBED_REV}
      and (
            exists (
                  select 1 from exam_papers p
                  join subjects s on s.id = p.subject_id
                  where s.curriculum_version_id = ${curriculumVersionId}
                    and p.validation_state = 'VALIDATED'
                    and (p.question_paper_document_id = d.document_id
                      or p.mark_scheme_document_id = d.document_id))
         or exists (
                  select 1 from subjects s2
                  where s2.curriculum_version_id = ${curriculumVersionId}
                    and s2.id = c.subject_id
                    and d.validation_state = 'VALIDATED'))${filter}
    order by c.embedding <=> ${literal}::vector
    limit ${limit}`;
  return rows.map(toChunkHit);
}

/**
 * Port of ChunkVectorRepository.diagnoseEmpty (:244-283) — the stage funnel
 * behind an EMPTY search. Call ONLY after searchServingEligible returned
 * empty — never on the happy path. The servingEligible count runs the EXACT
 * searchServingEligible WHERE predicate (drift-guarded by the golden cases).
 */
export async function diagnoseEmpty(
  sql: SqlFn,
  kind: DocumentKind | null | undefined,
  curriculumVersionId: string,
): Promise<SearchEmptyDiagnostics> {
  if (curriculumVersionId == null) {
    throw new Error(
      "curriculumVersionId is mandatory — diagnostics never run unscoped (T-C07)",
    );
  }
  const filter = kindFilter(kind);
  const funnelRows: Row[] = await sql`
    select count(*) as chunks_in_scope,
           count(*) filter (where c.embedding is not null) as embedded_in_scope,
           count(*) filter (where c.embedding is not null
                              and c.embed_rev = ${CURRENT_EMBED_REV}) as in_scope_at_rev
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where exists (
              select 1 from exam_papers p
              join subjects s on s.id = p.subject_id
              where s.curriculum_version_id = ${curriculumVersionId}
                and (p.question_paper_document_id = d.document_id
                  or p.mark_scheme_document_id = d.document_id))
         or exists (
              select 1 from subjects s2
              where s2.curriculum_version_id = ${curriculumVersionId}
                and s2.id = c.subject_id)${filter}`;
  const funnel = funnelRows[0]!;
  const eligibleRows: Row[] = await sql`
    select count(*) as eligible
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where c.embedding is not null
      and c.embed_rev = ${CURRENT_EMBED_REV}
      and (
            exists (
                  select 1 from exam_papers p
                  join subjects s on s.id = p.subject_id
                  where s.curriculum_version_id = ${curriculumVersionId}
                    and p.validation_state = 'VALIDATED'
                    and (p.question_paper_document_id = d.document_id
                      or p.mark_scheme_document_id = d.document_id))
         or exists (
                  select 1 from subjects s2
                  where s2.curriculum_version_id = ${curriculumVersionId}
                    and s2.id = c.subject_id
                    and d.validation_state = 'VALIDATED'))${filter}`;
  const diagnostics: SearchEmptyDiagnostics = {
    chunksInScope: Number(funnel.chunks_in_scope ?? 0),
    embeddedInScope: Number(funnel.embedded_in_scope ?? 0),
    inScopeAtRev: Number(funnel.in_scope_at_rev ?? 0),
    servingEligible: Number(eligibleRows[0]?.eligible ?? 0),
  };
  return diagnostics;
}
