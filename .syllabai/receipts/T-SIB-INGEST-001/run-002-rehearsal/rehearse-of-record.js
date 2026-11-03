#!/usr/bin/env node
/**
 * T-SIB-INGEST-001 run-002 — GATE-A REHEARSAL of record (disposable PGlite, zero prod contact).
 *
 * Chain under test (real Postgres semantics via WASM, pgvector bundled):
 *   1. apply ALL drizzle migrations 0000..0023 sequentially (statement-breakpoint split)
 *      -> proves 0023 widens both kind CHECKs and RESEARCH_EVIDENCE lands
 *   2. seed the minimal rehearsal fixture: curriculum_version (4CH1-2017) + subject (Chemistry)
 *   3. run the APPLY transaction body of record: 95 documents + 1,593 chunks
 *      (kind RESEARCH_EVIDENCE, VALIDATED, embed_rev=2, NULL vectors; GAP chunks NULL = held)
 *      plus a 14-row rehearsal embedding subset (fake 768-dim vectors, rehearsal-only) so the
 *      serving SQL is exercisable
 *   4. run the vector-arm serving SQL VERBATIM (both subject-branch legs) with a fake query vector:
 *      assert chemistry-scope SIB rows return; GAP-held rows NEVER return; foreign scope returns none
 *   5. receipt -> rehearsal-receipt.json (this file's dir)
 */
const { PGlite } = require("@electric-sql/pglite");
const { vector } = require("@electric-sql/pglite/vector");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DRIZZLE = "/home/z/my-project/v2/packages/db/drizzle";
const STAGE = "/home/z/my-project/workspace/sib-staging";
const receipt = { task: "T-SIB-INGEST-001 run-002 (rehearsal)", steps: [], asserts: [] };
const ok = (name, cond, detail = "") => {
  receipt.asserts.push({ name, pass: !!cond, detail });
  if (!cond) { console.error(`ASSERT FAIL: ${name} ${detail}`); process.exitCode = 1; }
  else console.log(`  ok: ${name} ${detail}`);
};

(async () => {
  const db = new PGlite({ extensions: { vector } });
  // 1. migrations 0000..0012, mid-chain seed (the 0013 warehouse seed of record
  //    requires the REAL maths subject id 763dfe2d to pre-exist — prod data
  //    precondition), then 0013..0023
  const files = fs.readdirSync(DRIZZLE).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
  ok("migration_count_24", files.length === 24, `(${files.length})`);
  let applied = 0;
  const applyOne = async (f) => {
    const sql = fs.readFileSync(path.join(DRIZZLE, f), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await db.exec(s);
    }
    applied++;
  };
  for (const f of files.filter(f => f < "0013")) await applyOne(f);
  await db.exec(`insert into curriculum_versions (id, board, qualification, code, title, status, created_at)
    values ('11111111-1111-1111-1111-111111111111','Edexcel','International GCSE','4CH1-2017','Edexcel International GCSE Chemistry (2017)','ACTIVE', now())`);
  await db.exec(`insert into subjects (id, curriculum_version_id, code, name, created_at)
    values ('763dfe2d-d2b5-48fb-ba4c-2f708c637b26','11111111-1111-1111-1111-111111111111','4MA1','Mathematics', now())`);
  for (const f of files.filter(f => f >= "0013")) await applyOne(f);
  receipt.steps.push({ step: "migrations", applied });
  ok("migrations_applied", applied === 24);

  const kindDomain = (await db.query(
    `select (select pg_get_constraintdef(oid) from pg_constraint where conname='ck_documents_kind' and conrelid='public.documents'::regclass) as d`)).rows[0].d;
  ok("documents_kind_widened", kindDomain.includes("RESEARCH_EVIDENCE"));
  const chunkDomain = (await db.query(
    `select pg_get_constraintdef(oid) as d from pg_constraint where conname='ck_document_chunks_kind' and conrelid='public.document_chunks'::regclass`)).rows[0].d;
  ok("chunks_kind_widened", chunkDomain.includes("RESEARCH_EVIDENCE"));

  // 2. rehearsal fixture: the chemistry subject (curriculum row seeded mid-chain above)
  await db.exec(`insert into subjects (id, curriculum_version_id, code, name, created_at) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','4CH1','Chemistry', now())`);
  const subj = (await db.query(`select id from subjects where code='4CH1'`)).rows;
  ok("subject_resolved", subj.length === 1);
  const subjectId = subj[0].id;

  // 3. the APPLY transaction body of record
  const arts = JSON.parse(fs.readFileSync(path.join(STAGE, "sib-ingest-dry-receipt.json"), "utf8")).per_artifact;
  const ingestor = " rehearsal-fixture";
  const GAP = new Set(arts.filter(a => a.artifact_id.startsWith("GAP")).map(a => a.artifact_id));
  // rehearsal embedding subset: first 2 chunk rows of 7 non-GAP families' first artifact + 2 GAP chunks stay NULL
  const embedTargets = new Set();
  for (const fam of ["ASM", "MIS", "EXP", "MS", "TUT", "PRO", "PED"]) { embedTargets.add(`${fam}-01:0`); embedTargets.add(`${fam}-01:1`); }
  let docs = 0, chunks = 0, gapChunks = 0, fakeEmbeds = 0;
  await db.exec("begin");
  for (const a of arts) {
    const docId = `SIB-4CH1-${a.artifact_id}`;
    const rowId = crypto.randomUUID();
    await db.query(
      `insert into documents (id, document_id, schema_version, doc_version, kind, source_uri, mime_type,
        checksum, page_count, element_count, text_element_count, chunk_count, source_engine,
        source_engine_version, canonical_json, validation_state, created_at)
       values ($1,$2,'1.0',1,'RESEARCH_EVIDENCE',$3,'text/markdown',$4,1,0,0,$5,'sib-gen','SIB-GEN-r0',$6,'VALIDATED',now())`,
      [rowId, docId,
       `syllabai-resources@main SubjectIntelligence/CHEMISTRY_4CH1/artifacts/${a.artifact_id}.md`,
       a.file_sha256, a.chunk_count,
       JSON.stringify({ sib: { artifact_id: a.artifact_id, family: a.family, words: a.words,
         validation_evidence: "ASSESSMENT_R3_SILVER_2026-10-30 (PR #234 merge 3f6547b1) — operator ruling 1a1a2a0f13661c75" } })]);
    docs++;
    const lines = fs.readFileSync(path.join(STAGE, "chunks", `${a.artifact_id}.chunks.jsonl`), "utf8")
      .split("\n").filter(l => l.trim());
    let ci = 0;
    for (const ln of lines) {
      const o = JSON.parse(ln);
      const isGap = GAP.has(a.artifact_id);
      const wantFake = embedTargets.has(`${a.artifact_id}:${ci}`);
      const vec = wantFake ? `[${Array.from({length:768}, () => 0.001).join(",")}]` : null;
      await db.query(
        `insert into document_chunks (id, document_row_id, chunk_index, content, element_ids,
          token_estimate, embedding, embedding_model, kind, subject_id, spec_codes, embed_rev, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'RESEARCH_EVIDENCE',$9,$10,2,now())`,
        [crypto.randomUUID(), rowId, ci, o.text, JSON.stringify([o.chunk_id]),
         Math.max(1, Math.ceil(o.text.length / 4)), vec,
         wantFake ? "rehearsal-fake-768" : null, subjectId,
         JSON.stringify((o.metadata?.curriculum_anchor_refs || []))]);
      chunks++;
      if (isGap) gapChunks++;
      if (wantFake) fakeEmbeds++;
      ci++;
    }
  }
  await db.exec("commit");
  receipt.steps.push({ step: "apply", documents: docs, chunks, gap_chunks: gapChunks, fake_embeds: fakeEmbeds });
  ok("documents_95", docs === 95, `(${docs})`);
  ok("chunks_1593", chunks === 1593, `(${chunks})`);
  ok("gap_chunks_136", gapChunks === 136, `(${gapChunks})`);
  ok("fake_embeds_14", fakeEmbeds === 14, `(${fakeEmbeds})`);

  const dbCounts = (await db.query(`select
    (select count(*) from documents where kind='RESEARCH_EVIDENCE') d,
    (select count(*) from document_chunks where kind='RESEARCH_EVIDENCE') c,
    (select count(*) from document_chunks where kind='RESEARCH_EVIDENCE' and embedding is not null) e`)).rows[0];
  ok("db_counts", Number(dbCounts.d) === 95 && Number(dbCounts.c) === 1593 && Number(dbCounts.e) === 14,
     `d=${dbCounts.d} c=${dbCounts.c} e=${dbCounts.e}`);

  // 4. the vector-arm serving SQL, VERBATIM shape (both legs), fake query vector
  const qv = `[${Array.from({length:768}, () => 0.002).join(",")}]`;
  const scopeId = "11111111-1111-1111-1111-111111111111";
  const armSql = `select d.kind, c.id, 1 - (c.embedding <=> $1::vector) as score
    from document_chunks c join documents d on d.id = c.document_row_id
    where c.embedding is not null and c.embed_rev = 2
      and ((exists (select 1 from exam_papers p join subjects s on s.id = p.subject_id
              where s.curriculum_version_id = $2 and p.validation_state='VALIDATED'
                and (p.question_paper_document_id = d.document_id or p.mark_scheme_document_id = d.document_id)))
        or (exists (select 1 from subjects s2 where s2.curriculum_version_id = $2
              and s2.id = c.subject_id and d.validation_state='VALIDATED')))
    order by c.embedding <=> $1::vector limit 50`;
  const inScope = (await db.query(armSql, [qv, scopeId])).rows;
  ok("in_scope_serving_rows", inScope.length === 14, `(${inScope.length})`);
  ok("all_returned_are_research_evidence", inScope.every(r => r.kind === "RESEARCH_EVIDENCE"));
  const foreign = (await db.query(armSql, [qv, "99999999-9999-9999-9999-999999999999"])).rows;
  ok("foreign_scope_empty", foreign.length === 0, `(${foreign.length})`);
  const gapReachable = (await db.query(
    `select count(*)::int n from document_chunks c join documents d on d.id=c.document_row_id
     where d.document_id like 'SIB-4CH1-GAP%' and c.embedding is not null`)).rows[0].n;
  ok("gap_never_embedded", Number(gapReachable) === 0, `(${gapReachable})`);

  receipt.verdict = receipt.asserts.every(a => a.pass) ? "REHEARSAL CLEAN — Gate A mechanics proven end-to-end" : "REHEARSAL FAILED";
  fs.writeFileSync(path.join(__dirname, "rehearsal-receipt.json"), JSON.stringify(receipt, null, 1));
  console.log(`\n${receipt.verdict}`);
  await db.close();
})();
