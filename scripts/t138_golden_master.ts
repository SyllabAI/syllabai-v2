/**
 * t138_golden_master.ts — READ-ONLY golden-master peek at the chemistry
 * corpus of record (4CH1/2C JUN 2019 + corpus census + the 4MA1 subjects row).
 * Zero writes. DSN from 0600 file, never printed.
 * Usage: bun scripts/t138_golden_master.ts <dsn-file>
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const dsnFile = process.argv[2];
if (!dsnFile) throw new Error("usage: bun scripts/t138_golden_master.ts <dsn-file>");
const dsn = readFileSync(dsnFile, "utf8").trim();
const sql = postgres(dsn, { max: 2, prepare: false });

const out: Record<string, unknown> = {};
let docs: Array<Record<string, unknown>> = [];

// 1) the golden exam_papers row
const papers = await sql`
  select id, subject_id, title, board, qualification, unit, session_label,
         paper_code, question_paper_document_id, mark_scheme_document_id,
         validation_state, provenance, extraction_method, series, year
  from exam_papers
  where paper_code = '4CH1/2C' and year = 2019 and series = 'JUN'
  limit 2`;
out.goldenPaper = papers;
const paper = papers[0];

// 2) the linked documents
if (paper) {
  docs = await sql`
    select id, document_id, doc_version, kind, validation_state, file_name,
           schema_version, source_engine, source_engine_version, mime_type,
           page_count, chunk_count, element_count
    from documents
    where document_id = any(${[String(paper.question_paper_document_id), String(paper.mark_scheme_document_id)]}::text[])`;
  out.goldenDocs = docs;
}

// 3) the qcard doc + its chunks
const card = await sql`
  select id, document_id, doc_version, kind, validation_state, file_name, chunk_count
  from documents where file_name = 'qcard-4CH1-2C-JUN-2019.txt' limit 1`;
out.goldenCard = card;
if (card[0]) {
  const cardChunks = await sql`
    select chunk_index, atom_number, page_start, page_end, left(content, 240) as head,
           token_estimate, embed_rev, (embedding is null) as emb_null
    from document_chunks where document_row_id = ${card[0].id} order by chunk_index limit 4`;
  out.goldenCardChunks = cardChunks;
}

// 4) QP/MS chunk samples (identity mirror shape)
if (docs && docs.length > 0) {
  const docIds = docs.map((d) => d.id);
  const chunkSamples = await sql`
    select d.document_id, d.kind, c.chunk_index, c.atom_number, c.page_start, c.page_end,
           c.kind as chunk_kind, c.series, c.year, c.paper_code, c.spec_codes,
           c.token_estimate, c.embed_rev, (c.embedding is null) as emb_null,
           left(c.content, 200) as head
    from document_chunks c join documents d on d.id = c.document_row_id
    where d.id = any(${docIds}::uuid[]) order by d.kind, c.chunk_index limit 8`;
  out.goldenChunks = chunkSamples;
}

// 5) corpus census: documents by kind x validation_state; exam_papers by subject code
const docCensus = await sql`
  select kind, validation_state, count(*)::int as n from documents group by 1, 2 order by 3 desc`;
out.documentsCensus = docCensus;
const paperCensus = await sql`
  select s.code as subject, p.validation_state, count(*)::int as n
  from exam_papers p join subjects s on s.id = p.subject_id
  group by 1, 2 order by 3 desc`;
out.examPapersCensus = paperCensus;

// 6) the subjects rows (chemistry + maths) — the exam_papers.subject_id target
const subjects = await sql`
  select id, code, name, curriculum_version_id from subjects where code = any(${['4CH1','4MA1','4MB1','4PH1']}::text[])`;
out.subjects = subjects;

// 7) chunk totals for the corpus
const chunkTotals = await sql`
  select count(*)::int as total,
         count(*) filter (where embed_rev = 2)::int as rev2,
         count(*) filter (where embedding is not null)::int as embedded,
         count(*) filter (where paper_code like '4CH%')::int as chem,
         count(*) filter (where paper_code like '4MA%')::int as maths,
         count(*) filter (where paper_code like '4PH%')::int as phys,
         count(*) filter (where paper_code like '4MB%')::int as mathsB
  from document_chunks`;
out.chunkTotals = chunkTotals;

console.log(JSON.stringify(out, null, 1));
await sql.end();
