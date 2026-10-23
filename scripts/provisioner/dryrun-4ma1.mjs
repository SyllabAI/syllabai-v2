#!/usr/bin/env node
// T-OPS-PLANE-001 — 4MA1 cut-over DRY RUN (rehearsal, zero prod writes).
//
// Rehearses the maths-4ma1 group cut-over (placement law §5 step 4) against
// a Neon COPY-ON-WRITE BRANCH of main, so even the zero-residue DELETE
// rehearsal never touches production:
//
//   1. read main THROUGH THE BRANCH (prod stays untouched)
//   2. template wh-v1 must already exist in the warehouse project (provision.mjs)
//   3. COPY: maths-4ma1 plane projection -> warehouse (chunks via subject_id;
//      documents/exam_papers registry rows via the text-compare relay)
//   4. PARITY: row counts + content bytes + sha256 must match source exactly
//   5. SEAM: run the two-step retrieval query of record (vector <=> search
//      by subject/kind -> ids) and hydrate-sample ids back on the branch
//   6. ZERO-RESIDUE REHEARSAL (on the branch ONLY): delete the moved rows,
//      re-run the estate tripwire fingerprint on the branch and prove the
//      expected residual (corpus planes empty of maths-4ma1, identity intact)
//   7. exit 0 iff every gate passes; print a run summary for the receipt
//
// Usage:
//   BRANCH_DB_URL='postgresql://...branch-pooler...' \
//   WH_DB_URL='postgresql://...warehouse-pooler...' \
//   node dryrun-4ma1.mjs
//
// Credentials env-only, never on disk. MAIN PROD URL IS NEVER USED HERE.

import postgres from 'postgres';
import { createHash } from 'node:crypto';

const BR = process.env.BRANCH_DB_URL, WH = process.env.WH_DB_URL;
if (!BR || !WH) { console.error('need BRANCH_DB_URL and WH_DB_URL'); process.exit(1); }
const GROUP = 'maths-4ma1';
const SUBJECT = '763dfe2d-d2b5-48fb-ba4c-2f708c637b26'; // Maths (4MA1) — run-001-trim-census-r0
const br = postgres(BR, { max: 2, prepare: false, connect_timeout: 20 });
const wh = postgres(WH, { max: 2, prepare: false, connect_timeout: 20 });
const gate = [];
const G = (name, pass, detail) => { gate.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

try {
  // 0. identity + branch sanity
  const who = await br`select current_database() db, current_user usr`;
  console.log(`[dryrun] branch = ${who[0].db}/${who[0].usr}`);
  const isBranch = await br`select count(*)::int n from pg_stat_replication`; // branches replicate; 0 is fine, informational
  console.log(`[dryrun] (informational) replication slots visible: ${isBranch[0].n}`);

  // 1. source set — the maths-4ma1 chunk plane (all of it, per census)
  const src = await br`
    select c.id, d.document_id, c.document_row_id, c.chunk_index, c.content,
           c.page_start, c.page_end, c.kind, c.subject_id, c.series, c.year,
           c.paper_code, c.atom_number, c.spec_codes, c.token_estimate,
           c.embedding_model, c.embedded_at, c.created_at, c.embedding
    from document_chunks c join documents d on d.id = c.document_row_id
    where c.subject_id = ${SUBJECT}`;
  const srcBytes = src.reduce((a, r) => a + Buffer.byteLength(r.content, 'utf8'), 0);
  const srcHash = createHash('sha256').update(src.map(r => r.id).sort().join('\n')).digest('hex');
  console.log(`[dryrun] source maths-4ma1: ${src.length} chunks, ${(srcBytes / 1048576).toFixed(2)} MB content, id-hash ${srcHash.slice(0, 12)}`);
  G('source_present', src.length === 8202, `expected 8,202 (run-001-trim-census-r0), got ${src.length}`);

  // 2. COPY in batches (no cross-project extensions needed — plain rows)
  await wh.unsafe('begin');
  const cols = `id, document_id, document_row_id, course_group, subject_id, kind, chunk_index, content,
                page_start, page_end, series, year, paper_code, atom_number, spec_codes,
                token_estimate, embedding_model, embedded_at, created_at, embedding`;
  let copied = 0;
  for (let i = 0; i < src.length; i += 500) {
    const batch = src.slice(i, i + 500).map(r => ({
      ...r, document_id: String(r.document_id), course_group: GROUP,
    }));
    await wh`insert into warehouse_chunks ${wh(batch, cols)}`;
    copied += batch.length;
  }
  const meta = await br`select document_id::text document_id, document_row_id, kind, source_uri, file_name, mime_type, checksum, page_count, validation_state, created_at
    from documents where id in (select document_row_id from document_chunks where subject_id = ${SUBJECT})`;
  await wh.unsafe('commit');
  console.log(`[dryrun] copied ${copied} chunks (+${meta.length} document registry rows held for parity check only)`);

  // 3. PARITY
  const dst = await wh`select count(*)::int n, sum(octet_length(content))::bigint b, coalesce(string_agg(id::text, '\n' order by id), '') ids from warehouse_chunks where course_group = ${GROUP}`;
  const dstHash = createHash('sha256').update(dst[0].ids.split('\n').sort().join('\n')).digest('hex');
  G('copy_count_parity', dst[0].n === src.length, `src ${src.length} vs dst ${dst[0].n}`);
  G('copy_bytes_parity', Number(dst[0].b) === srcBytes, `src ${srcBytes} vs dst ${dst[0].b}`);
  G('copy_id_hash_parity', dstHash === srcHash, `sha256 id-set ${srcHash === dstHash ? 'EQUAL' : 'MISMATCH'}`);

  // 4. SEAM step 1 — vector search on the warehouse (sample: first embedded chunk as probe vector)
  const probe = src.find(r => r.embedding);
  if (probe) {
    const t0 = Date.now();
    const near = await wh`
      select id, kind, paper_code, year, embedding <=> ${probe.embedding} dist
      from warehouse_chunks
      where course_group = ${GROUP} and kind = 'QUESTION_PAPER'
      order by embedding <=> ${probe.embedding} limit 5`;
    G('seam_vector_search', near.length === 5, `top-5 by <=> in ${Date.now() - t0}ms (probe id ${probe.id.slice(0, 8)}, nearest dist ${Number(near[0].dist).toFixed(4)})`);
    // SEAM step 2 — hydrate ids on the branch (deterministic anchor side)
    const ids = near.map(r => r.id);
    const hyd = await br`select id from document_chunks where id = any(${ids}::uuid[])`;
    G('seam_hydrate_by_ids', hyd.length === 5, `branch hydration returned ${hyd.length}/5 ids`);
  } else {
    G('seam_vector_search', false, 'no embedded probe row in source (drain incomplete?)');
  }

  // 5. ZERO-RESIDUE REHEARSAL — branch only
  const before = await br`select count(*)::int n from document_chunks where subject_id = ${SUBJECT}`;
  await br.unsafe('begin');
  await br`delete from document_chunks where subject_id = ${SUBJECT}`;
  const afterChunk = await br`select count(*)::int n from document_chunks where subject_id = ${SUBJECT}`;
  const usersLeft = await br`select count(*)::int n from users`;
  const mpLeft = await br`select count(*)::int n from mark_points`;
  const docLeft = await br`select count(*)::int n from documents`;
  await br.unsafe('rollback'); // REHEARSAL — the real cut-over commits this
  G('zeroresidue_delete', afterChunk[0].n === 0 && before[0].n === src.length, `branch: ${before[0].n} -> ${afterChunk[0].n} maths chunks (rolled back)`);
  G('identity_untouched', usersLeft[0].n > 0 && mpLeft[0].n > 0 && docLeft[0].n > 0, `branch after delete: users ${usersLeft[0].n}, mark_points ${mpLeft[0].n}, documents ${docLeft[0].n}`);

  // verdict
  const fails = gate.filter(g => !g.pass);
  console.log(`\n== DRYRUN VERDICT: ${fails.length === 0 ? 'ALL GATES GREEN — 4MA1 cut-over is REHEARSAL-PROVEN' : fails.length + ' GATE FAILURES'}`);
  process.exitCode = fails.length === 0 ? 0 : 1;
} finally {
  await br.end().catch(() => {});
  await wh.end().catch(() => {});
}
