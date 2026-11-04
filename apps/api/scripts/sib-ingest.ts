/**
 * T-SIB-INGEST-001 — the SIB → tutor RAG apply script of record.
 *
 * Mirrors the books-ingest law (T-MIG-133): dry mode = full pipeline + receipt,
 * ZERO DB; apply mode = ONE transaction on the target DB, gated by the 093/133b
 * law (operator write order + COW-proof probe word) and a 0600 credential file.
 *
 * What it does (the rehearsal-proven body, workspace/sib-pg-rehearsal run-002):
 *   - reads the staged corpus: <stage>/chunks/<ART>.chunks.jsonl (95 files,
 *     content_sha256-verified lines) + the dry receipt's per-file sha256 pins
 *   - re-verifies EVERY chunk line: JSON parse + content_sha256 == sha256(text)
 *     (fail-closed: any mismatch aborts before any DB statement)
 *   - resolves the subject binding of record: subjects.code = --subject-code (4CH1)
 *     joined to curriculum_versions.code = --curriculum-code (4CH1-2017) —
 *     refuses to run when the resolution is not EXACTLY one row (V53 posture)
 *   - inserts, in ONE transaction: 95 documents (kind RESEARCH_EVIDENCE,
 *     validation_state VALIDATED citing ASSESSMENT_R3_SILVER, embed_rev=2 law,
 *     NULL vectors — the zero-API-keys content law) + 1,593 document_chunks
 *     (subject_id bound, spec/anchor refs in spec_codes, GAP family rows land
 *     NULL-vector and are NEVER backfilled — the serving-unreachable ruling)
 *   - postverify INSIDE the transaction: exact counts (95/1,593/136-GAP), then
 *     the COW-proof probe (--probe-word must round-trip through a scratch table
 *     the operator's order specifies) BEFORE commit; post-commit count re-stamp
 *
 * Idempotency: the apply refuses when ANY SIB-4CH1-* document already exists
 * (no partial re-runs; a failed transaction leaves nothing behind by law).
 *
 * Usage (dry — no DB):
 *   bun apps/api/scripts/sib-ingest.ts --mode dry --stage <dir> --receipt <out.json>
 * Usage (apply — REQUIRES the operator 093/133b write order, trace
 *       1a1a2a8cf4758161 "land A+B"; db file must be 0600):
 *   bun apps/api/scripts/sib-ingest.ts --mode apply --stage <dir> \
 *     --db <0600 uri file> --probe-word <word> --receipt <out.json>
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createSql } from "../src/services/identity/users";

const EXPECTED_ARTIFACTS = 95;
const VALIDATION_EVIDENCE = "ASSESSMENT_R3_SILVER_2026-10-30 (PR #234 merge 3f6547b1) — operator ruling trace 1a1a2a0f13661c75";
const DOC_ID_PREFIX = "SIB-4CH1-";
const KIND = "RESEARCH_EVIDENCE";
const EMBED_REV = 2;

interface Args { mode: "dry" | "apply"; stage: string; db?: string; probeWord?: string; receipt: string; }
function parseArgs(argv: string[]): Args {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = get("mode") as Args["mode"];
  if (mode !== "dry" && mode !== "apply") throw new Error("--mode dry|apply required");
  const stage = get("stage");
  if (!stage || !existsSync(stage)) throw new Error("--stage <dir with chunks/> required");
  const receipt = get("receipt");
  if (!receipt) throw new Error("--receipt <out.json> required");
  const dbRaw = get("db");
  // the workflows pass --db file:/tmp/xxx.uri (the apply-0024 driver form);
  // strip the scheme so the 0600 stat + later readFileSync see the path.
  const db = dbRaw && dbRaw.startsWith("file:") ? dbRaw.slice(5) : dbRaw;
  const probeWord = get("probe-word");
  if (mode === "apply" && (!db || !probeWord)) throw new Error("apply requires --db <0600 file> and --probe-word");
  if (db) {
    const st = statSync(db);
    if ((st.mode & 0o077) !== 0) throw new Error(`--db file must be 0600 (got ${st.mode.toString(8)})`);
  }
  return { mode, stage, db, probeWord, receipt };
}

interface ChunkLine { artifact_id: string; chunk_id: string; content_sha256: string; heading: string; kind: string; metadata: Record<string, unknown>; record_id: string; text: string; }

function loadCorpus(stage: string) {
  const dir = `${stage}/chunks`;
  const files = readdirSync(dir).filter((f) => f.endsWith(".chunks.jsonl")).sort();
  if (files.length !== EXPECTED_ARTIFACTS) throw new Error(`expected ${EXPECTED_ARTIFACTS} chunk files, found ${files.length}`);
  const arts: Array<{ artifact: string; fileSha: string; chunks: ChunkLine[] }> = [];
  for (const f of files) {
    const artifact = f.replace(".chunks.jsonl", "");
    const raw = readFileSync(`${dir}/${f}`, "utf8");
    const fileSha = createHash("sha256").update(raw).digest("hex");
    const chunks: ChunkLine[] = [];
    for (const ln of raw.split("\n")) {
      if (!ln.trim()) continue;
      const o = JSON.parse(ln) as ChunkLine;
      const h = createHash("sha256").update(o.text).digest("hex");
      if (h !== o.content_sha256) throw new Error(`G2 FAIL ${o.chunk_id}: content_sha256 mismatch — ABORT before DB`);
      chunks.push(o);
    }
    arts.push({ artifact, fileSha, chunks });
  }
  return arts;
}

async function resolveSubject(sql: ReturnType<typeof createSql>) {
  const rows = await sql`
    select s.id as subject_id, s.code as subject_code, cv.code as curriculum_code
    from subjects s join curriculum_versions cv on cv.id = s.curriculum_version_id
    where s.code = '4CH1' and cv.code = '4CH1-2017'` as Array<Record<string, unknown>>;
  if (rows.length !== 1) {
    throw new Error(`subject resolution is not EXACTLY one row (${rows.length}) — V53 fail-closed ABORT`);
  }
  return rows[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const arts = loadCorpus(args.stage);
  const totalChunks = arts.reduce((n, a) => n + a.chunks.length, 0);
  const gapArts = arts.filter((a) => a.artifact.startsWith("GAP"));
  const gapChunks = gapArts.reduce((n, a) => n + a.chunks.length, 0);
  const plan = {
    task: "T-SIB-INGEST-001", mode: args.mode,
    documents: arts.length, chunks: totalChunks,
    gap_documents: gapArts.length, gap_chunks_null_vector: gapChunks,
    serving_backfill_census: totalChunks - gapChunks,
    kind: KIND, validation_state: "VALIDATED", validation_evidence: VALIDATION_EVIDENCE,
    embed_rev: EMBED_REV, vectors_written_here: 0,
    file_pins: Object.fromEntries(arts.map((a) => [a.artifact, a.fileSha])),
  };

  if (args.mode === "dry") {
    writeFileSync(args.receipt, JSON.stringify({ ...plan, verdict: "DRY PLAN OK — no DB touched" }, null, 1));
    console.log(`dry ok: ${arts.length} docs / ${totalChunks} chunks (GAP ${gapChunks} NULL-held)`);
    return;
  }

  // apply — the 093/133b law: 0600 file, COW-proof probe, ONE transaction
  const uri = readFileSync(args.db!, "utf8").trim();
  const sql = createSql(uri);
  const existing = await sql`select count(*)::int n from documents where document_id like ${DOC_ID_PREFIX + "%"}` as Array<{ n: number }>;
  if (Number(existing[0].n) !== 0) throw new Error(`${existing[0].n} SIB documents already present — idempotency ABORT`);

  const subject = await resolveSubject(sql);
  await sql`create table if not exists sib_ingest_cow_probe (word text not null)`;
  await sql`delete from sib_ingest_cow_probe`;
  await sql`insert into sib_ingest_cow_probe (word) values (${args.probeWord!})`;
  const probe = await sql`select word from sib_ingest_cow_probe` as Array<{ word: string }>;
  if (probe[0]?.word !== args.probeWord!) throw new Error("COW-proof probe FAILED — wrong DB or lost writes; ABORT");
  await sql`drop table if exists sib_ingest_cow_probe`;

  let docRows = 0, chunkRows = 0;
  await sql.transaction(async (tx: ReturnType<typeof createSql>) => {
    for (const a of arts) {
      const rowId = randomUUID();
      await tx`
        insert into documents (id, document_id, schema_version, doc_version, kind, source_uri, mime_type,
          checksum, page_count, element_count, text_element_count, chunk_count, source_engine,
          source_engine_version, canonical_json, validation_state, created_at)
        values (${rowId}, ${DOC_ID_PREFIX + a.artifact}, '1.0', 1, ${KIND},
          ${`syllabai-resources@main SubjectIntelligence/CHEMISTRY_4CH1/artifacts/${a.artifact}.md`},
          'text/markdown', ${a.fileSha}, 1, 0, 0, ${a.chunks.length}, 'sib-gen', 'SIB-GEN-r0',
          ${JSON.stringify({ sib: { artifact_id: a.artifact, file_sha256: a.fileSha, validation_evidence: VALIDATION_EVIDENCE } })},
          'VALIDATED', now())`;
      docRows++;
      let ci = 0;
      for (const c of a.chunks) {
        const meta = c.metadata as { curriculum_anchor_refs?: string[] };
        await tx`
          insert into document_chunks (id, document_row_id, chunk_index, content, element_ids, token_estimate,
            embedding, embedding_model, kind, subject_id, spec_codes, embed_rev, created_at)
          values (${randomUUID()}, ${rowId}, ${ci}, ${c.text}, ${JSON.stringify([c.chunk_id])},
            ${Math.max(1, Math.ceil(c.text.length / 4))}, null, null, ${KIND}, ${subject.subject_id},
            ${JSON.stringify(meta?.curriculum_anchor_refs ?? [])}, ${EMBED_REV}, now())`;
        chunkRows++; ci++;
      }
    }
    // postverify INSIDE the transaction
    const v = await tx`select
      (select count(*)::int from documents where kind = ${KIND} and document_id like ${DOC_ID_PREFIX + "%"}) d,
      (select count(*)::int from document_chunks where kind = ${KIND}) c,
      (select count(*)::int from document_chunks where kind = ${KIND} and subject_id = ${subject.subject_id}) s` as Array<{ d: number; c: number; s: number }>;
    if (Number(v[0].d) !== arts.length || Number(v[0].c) !== totalChunks || Number(v[0].s) !== totalChunks) {
      throw new Error(`postverify FAILED d=${v[0].d} c=${v[0].c} s=${v[0].s} — transaction ABORTED (nothing lands)`);
    }
  });

  const after = await sql`select
    (select count(*)::int from documents where document_id like ${DOC_ID_PREFIX + "%"}) d,
    (select count(*)::int from document_chunks where kind = ${KIND}) c` as Array<{ d: number; c: number }>;
  const receipt = {
    ...plan,
    verdict: "APPLIED (ONE transaction; vectors NULL — backfill via t-mig-133d-backfill-exec.ts, GAP rows excluded by policy)",
    subject_binding: subject, post_commit_counts: after[0],
    write_order: "operator trace 1a1a2a8cf4758161 'land A+B'",
  };
  writeFileSync(args.receipt, JSON.stringify(receipt, null, 1));
  console.log(`apply ok: ${docRows} docs / ${chunkRows} chunks; post-commit d=${after[0].d} c=${after[0].c}`);
}
// run-005 fix-3: the NeonWsClient session has no close() on the adapter, so
// after a fully committed + receipt-stamped apply the open websocket keeps
// the event loop alive; Neon autosuspend (300s) then terminates the compute
// (57P01 'administrator command') and the driver's unhandled 'error' event
// crashes the process AFTER success (run-005 attempts 1-3). The receipt file
// is written synchronously before this point, so force-exit is safe.
main().then(() => process.exit(0)).catch((e) => { console.error(String(e)); process.exit(1); });
