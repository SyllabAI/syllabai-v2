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
 *
 * T-MIG-133 band 133d (r0) — the Student Books serving extensions, additive
 * to the frozen retrieval law (the SQL scope, cosine floor, limits and the
 * document-version provenance are byte-identical):
 *
 *   1. `c.spec_codes` joins the projection (the corpus-wide column — books
 *      carry the chapter-scoped overlay of record, papers their parse codes)
 *      and rides the evidence as `specCodes` (the 133d fusion-boost input).
 *
 *   2. THE PAGE-TRUTH TRANSLATION (the intake decision of record: "viewer
 *      coordinates: pdf_pages (corpus-pdf/pdf.js), citations: book_pages"):
 *      a TEXTBOOK chunk's chunk pages are PDF-true (the 133b ingest law),
 *      but the learner-facing citation label and the tutor prompt must cite
 *      the PRINTED book page. After the frozen fetch, TEXTBOOK hits resolve
 *      their book_chapters registry rows (ONE batched query for the batch's
 *      document ids — never per-hit, the T-C32 law) and the page coords are
 *      translated to the book numbering via the containing chapter's
 *      constant offset (both ranges span the same page count per chapter —
 *      verified of record on the pilot: u1:c1 book 3–13 / pdf 12–22). The
 *      raw PDF coords ride `sourcePageStart/End` (the deep link's viewer
 *      coordinate), the registry's course binding rides `bookCourseId`.
 *      Chunks with no registry rows (front matter, index) stay PDF-true —
 *      the honest fallback, never a fabricated page.
 *
 *      The lookup rides the 093 inList scalar-param law (session-store's
 *      inList — a bound JS array is a single wire value and 500s the Neon
 *      WebSocket wire).
 */
import type { SqlFn } from "./sql";
import { inList } from "./session-store";
import { MIN_COSINE, type VectorRetriever } from "./karag";
import { evidenceFromChunk, type EvidenceItem } from "./evidence";
import type { EmbeddingProvider } from "../content/retrieval";
import type { WarehouseServingSeam } from "../warehouse/serving";

/** CURRENT_EMBED_REV = 2 (ChunkVectorRepository.java:64) — the
 *  corpus-generation read filter; two generations never blend. */
const EMBED_REV = 2;

/** MAX_LIMIT = 50 with Math.clamp(limit, 1, MAX_LIMIT) (:17, :55). */
const MAX_LIMIT = 50;

/** One chapter's registry coords (the book_chapters projection the
 *  translation reads — book_pages citation coords + pdf_pages viewer coords,
 *  the intake decision of record). */
interface BookChapterCoords {
  document_id: string;
  course_id: string;
  book_page_start: number | null;
  book_page_end: number | null;
  pdf_page_start: number | null;
  pdf_page_end: number | null;
}

export function buildSqlVectorArm(
  sql: SqlFn,
  provider: EmbeddingProvider | null,
  serving?: WarehouseServingSeam | null,
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
    let rows: Array<Record<string, unknown>> | null = null;
    if (serving != null) {
      // T-OPS-PLANE-001 run-004: the warehouse serving seam (ADR-038 §3.3
      // flip law) resolves the two-step plane for covered scopes. null =
      // not covered / not provisioned → the verbatim main-plane SQL below
      // serves, byte-identical to the pre-flip law. Transport or config
      // failures PROPAGATE — the seam never silently re-routes to main.
      rows = await serving.searchRows({
        vector,
        kind: null, // kind-agnostic by design (the frozen adapter law)
        curriculumVersionId: scope.curriculumVersionId,
        limit: clamped,
      });
    }
    if (rows == null) {
      const literal = `[${vector.join(",")}]`;
      rows = (await sql`
    select c.id, c.document_row_id, d.doc_version, d.document_id, d.kind, c.chunk_index,
           c.content, c.page_start, c.page_end, c.element_ids, c.spec_codes,
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
    }
    return rowsToEvidence(sql, rows);
  };
}

/**
 * The rows→evidence pipeline SHARED by both serving planes (run-004): the
 * frozen mapping (cosine-floor filter, doc_version provenance, spec_codes,
 * the 133d page-truth translation) is plane-agnostic — it reads the same
 * row shape whether the cosine order came from main's HNSW or from a
 * course-group warehouse via the two-step seam. The book_chapters registry
 * read stays on MAIN for both planes (books cut over in a later group
 * wave, DATA-PLANE-PLACEMENT §2).
 */
export async function rowsToEvidence(
  sql: SqlFn,
  rows: Array<Record<string, unknown>>,
): Promise<EvidenceItem[]> {
  const hits = rows
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
        specCodes: jsonbStringArray(r.spec_codes),
        embeddingModel: String(r.embedding_model),
        score: Number(r.score),
      }))
      .filter((hit) => hit.score >= MIN_COSINE);

    // the 133d page-truth translation — ONE batched registry read for the
    // batch's TEXTBOOK document ids (never per-hit, the T-C32 law)
    const bookDocIds = [
      ...new Set(hits.filter((h) => h.kind === "TEXTBOOK").map((h) => h.documentId)),
    ];
    const registry = new Map<string, BookChapterCoords[]>();
    if (bookDocIds.length > 0) {
      const registryRows = (await sql(
        ...inList(
          "select document_id, course_id, book_page_start, book_page_end, pdf_page_start, pdf_page_end from book_chapters where document_id in (",
          bookDocIds,
          ") order by unit_index nulls first, chapter_index",
        ),
      )) as unknown as BookChapterCoords[];
      for (const row of registryRows) {
        const list = registry.get(row.document_id) ?? [];
        list.push(row);
        registry.set(row.document_id, list);
      }
    }

    return hits.map((hit) => {
      if (hit.kind !== "TEXTBOOK") {
        return evidenceFromChunk({
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
          specCodes: hit.specCodes,
        });
      }
      const chapters = registry.get(hit.documentId);
      const coords =
        hit.pageStart == null
          ? null
          : (chapters ?? []).find(
                (c) =>
                  c.pdf_page_start != null &&
                  c.pdf_page_end != null &&
                  hit.pageStart! >= c.pdf_page_start &&
                  hit.pageStart! <= c.pdf_page_end,
              ) ??
            [...(chapters ?? [])]
              .reverse()
              .find((c) => c.pdf_page_start != null && c.pdf_page_start <= hit.pageStart!);
      if (coords == null || coords.book_page_start == null || coords.pdf_page_start == null) {
        // no registry row covers this chunk — the honest PDF-true fallback
        return evidenceFromChunk({
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
          specCodes: hit.specCodes,
        });
      }
      // constant per-chapter offset (both ranges span the same page count
      // per chapter — verified of record on the pilot); clamped into the
      // chapter's book range
      const offset = coords.book_page_start - coords.pdf_page_start;
      const clamp = (v: number): number =>
        coords.book_page_end != null
          ? Math.min(Math.max(v, coords.book_page_start!), coords.book_page_end)
          : Math.max(v, coords.book_page_start!);
      const bookStart = clamp(hit.pageStart! + offset);
      const bookEnd = hit.pageEnd == null ? null : clamp(hit.pageEnd + offset);
      return evidenceFromChunk({
        documentRowId: hit.documentRowId,
        documentId: hit.documentId,
        documentVersion: hit.documentVersion,
        chunkId: hit.chunkId,
        chunkIndex: hit.chunkIndex,
        kind: hit.kind,
        content: hit.content,
        pageStart: bookStart,
        pageEnd: bookEnd,
        elementIds: hit.elementIds,
        embeddingModel: hit.embeddingModel,
        cosine: hit.score,
        specCodes: hit.specCodes,
        sourcePageStart: hit.pageStart,
        sourcePageEnd: hit.pageEnd,
        bookCourseId: coords.course_id,
      });
    });
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

/** Test seam — re-exported so the unit suite can build translated items. */
export type { EvidenceItem };
