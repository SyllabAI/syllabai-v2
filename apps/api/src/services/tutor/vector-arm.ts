/**
 * T-MIG-060 tranche 2 — the sql-backed vector arm (frozen law @ 6cad6ef).
 *
 * Line-against-line port of tutor/ContentVectorRetriever.java :55-93 (the
 * adapter law) over the ChunkVectorRepository#searchServingEligible SQL
 * (:202-240 — the SAME verbatim SQL services/content/retrieval.ts carries,
 * plus the documents.doc_version projection the frozen adapter reads).
 *
 * WHY THIS EXISTS BESIDE THE LANDED CONTENT MODULE (the composition law's
 * documented exception, consolidation ruling requested at PR review): the
 * frozen law itself binds the document-version provenance to the SEARCH SQL
 * — "the adapter reads hit.docVersion() directly and never re-reads the
 * document row per hit; the per-hit findById() this class used to perform
 * was a T-C32-class N+1 on the serving path, one extra query per evidence
 * candidate, every ask". The landed content module's ChunkHit projection
 * drops doc_version, so composing it would force either a null provenance
 * field on chunk evidence or exactly the T-C32 N+1 the law removed. This
 * arm carries the verbatim SQL + the doc_version column; when the content
 * ChunkHit gains doc_version, the arm collapses onto searchServingEligible.
 *
 * Kind-agnostic by design: a learner question may be answered by a mark
 * scheme, the specification or a worked question — the fuser decides which
 * source wins, not a hard-coded filter. Candidates below the cosine floor
 * are dropped: pgvector always returns the top-N regardless of relevance,
 * and rank-only fusion cannot express "the vector side found nothing" — a
 * zero-similarity chunk would otherwise tie with genuine KG evidence. When
 * no embedding provider is configured the arm degrades honestly: empty
 * candidates, KG-only evidence (never a pipeline failure). Transport
 * failures PROPAGATE (the frozen arm catches only the provider-absent
 * IllegalStateException).
 */
import type { SqlFn } from "./sql";
import { MIN_COSINE, type VectorRetriever } from "./karag";
import { evidenceFromChunk } from "./evidence";
import type { EmbeddingProvider } from "../content/retrieval";

/** CURRENT_EMBED_REV = 2 (ChunkVectorRepository.java:64) — the
 *  corpus-generation read filter; two generations never blend. */
const EMBED_REV = 2;

/** MAX_LIMIT = 50 with Math.clamp(limit, 1, MAX_LIMIT) (:17, :55). */
const MAX_LIMIT = 50;

export function buildSqlVectorArm(
  sql: SqlFn,
  provider: EmbeddingProvider | null,
): VectorRetriever {
  return async (query, limit, scope) => {
    if (scope == null) {
      throw new Error(
        "curriculum scope is mandatory — retrieval never runs unscoped (T-C07)",
      );
    }
    if (provider == null) {
      // no embedding provider keyed — document evidence unavailable, not a
      // pipeline failure (the IllegalStateException catch, :85-91)
      return [];
    }
    const vector = await provider.embedQuery(query);
    const clamped = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const literal = `[${vector.join(",")}]`;
    const rows = (await sql`
    select c.id, c.document_row_id, d.doc_version, d.document_id, d.kind, c.chunk_index,
           c.content, c.page_start, c.page_end, c.element_ids,
           c.embedding_model, 1 - (c.embedding <=> ${literal}::vector) as score
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where c.embedding is not null
      and c.embed_rev = ${EMBED_REV}
      and (
            exists (
                  select 1 from exam_papers p
                  join subjects s on s.id = p.subject_id
                  where s.curriculum_version_id = ${scope.curriculumVersionId}
                    and p.validation_state = 'VALIDATED'
                    and (p.question_paper_document_id = d.document_id
                      or p.mark_scheme_document_id = d.document_id))
         or exists (
                  select 1 from subjects s2
                  where s2.curriculum_version_id = ${scope.curriculumVersionId}
                    and s2.id = c.subject_id
                    and d.validation_state = 'VALIDATED'))
    order by c.embedding <=> ${literal}::vector
    limit ${clamped}`) as Array<Record<string, unknown>>;
    return rows
      .map((r) => ({
        chunkId: String(r.id),
        documentRowId: String(r.document_row_id),
        documentId: String(r.document_id),
        documentVersion: Number(r.doc_version),
        kind: r.kind == null ? null : String(r.kind),
        chunkIndex: Number(r.chunk_index),
        content: String(r.content),
        pageStart: r.page_start == null ? null : Number(r.page_start),
        pageEnd: r.page_end == null ? null : Number(r.page_end),
        elementIds: jsonbStringArray(r.element_ids),
        embeddingModel: String(r.embedding_model),
        score: Number(r.score),
      }))
      .filter((hit) => hit.score >= MIN_COSINE)
      .map((hit) =>
        evidenceFromChunk({
          documentRowId: hit.documentRowId,
          documentId: hit.documentId,
          documentVersion: hit.documentVersion,
          chunkId: hit.chunkId,
          chunkIndex: hit.chunkIndex,
          kind: hit.kind,
          content: hit.content,
          pageStart: hit.pageStart,
          pageEnd: hit.pageEnd,
          elementIds: hit.elementIds,
          embeddingModel: hit.embeddingModel,
          cosine: hit.score,
        }),
      );
  };
}

function jsonbStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* the honest empty */
    }
  }
  return [];
}
