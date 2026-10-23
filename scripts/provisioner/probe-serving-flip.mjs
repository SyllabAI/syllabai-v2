#!/usr/bin/env bun
/**
 * probe-serving-flip.mjs — T-OPS-PLANE-001 run-004 live evidence.
 *
 * Proves the ADR-038 §3.3 two-step serving seam against the LIVE planes,
 * read-only everywhere:
 *   PATH A (main plane of record): the verbatim searchServingEligible SQL
 *     over main's document_chunks (the pre-flip serving law).
 *   PATH B (warehouse seam): step 1 on W1 (course-group HNSW, overfetch
 *     candidates) → step 2 hydrate on main with the verbatim serving-
 *     eligible predicate → warehouse cosine order → trim.
 *
 * Query vector of record: an EXISTING embedded 4MA1 chunk's own vector
 * (self-retrieval — PATH A's top hit should be that chunk itself; PATH B
 * must agree). Zero external calls: no embedding provider, no Neon API.
 *
 * Read-only law: main runs inside a session-level READ ONLY transaction;
 * the warehouse session is likewise read-only. No writes of any kind —
 * the probe cannot drift either plane.
 *
 * Env (all required, never committed):
 *   MAIN_DB_URL  main pooler URL  (ep-ancient-cake-a52e4kfd-…)
 *   WH_DB_URL    W1 pooler URL    (ep-calm-queen-az36lppq-pooler…)
 *   PROBE_SUBJECT_ID  optional, default the 4MA1 subject of record
 *
 * Registry disclosure: migration 0013 is NOT applied to main at probe time
 * (its application is a T1 cut-over step) — the probe injects the run-003
 * registry row in code (the rig-seam path the unit suite pins). The api's
 * real registry read is exercised by the unit suite + the flip window.
 *
 * Output: run-004-serving-flip-probe-r0.json in the T-OPS-PLANE-001
 * receipts dir (pass a --out override as argv[2] for a dry rehearsal).
 *
 * postgres-js lessons of record (run-003): the insert-builder rest.flat()
 * law (pass column LISTS as arrays) — this probe writes nothing, so the
 * lesson survives as a comment — and max:1 (a begin/commit via unsafe()
 * does not pin a pool connection; with max>1 a txn block can span two).
 */
import postgres from "postgres";

const MAIN_DB_URL = process.env.MAIN_DB_URL ?? "";
const WH_DB_URL = process.env.WH_DB_URL ?? "";
const SUBJECT_ID =
  process.env.PROBE_SUBJECT_ID ?? "763dfe2d-d2b5-48fb-ba4c-2f708c637b26"; // maths-4ma1 of record
const COURSE_GROUP = process.env.PROBE_COURSE_GROUP ?? "maths-4ma1";
const LIMIT = 12; // the tutor's TUTOR_VECTOR_CANDIDATES
const OVERFETCH = 3;
const EMBED_REV = 2; // CURRENT_EMBED_REV

for (const [k, v] of Object.entries({ MAIN_DB_URL, WH_DB_URL })) {
  if (!v || !v.trim()) {
    console.error(`[probe] fail-fast: ${k} is blank — refusing to run`);
    process.exit(2);
  }
}

const main = postgres(MAIN_DB_URL, { max: 1, prepare: false });
const wh = postgres(WH_DB_URL, { max: 1, prepare: false });

const ms = (n) => (n == null ? null : Number(n));
const out = {
  instrument: "probe-serving-flip.mjs",
  run: "T-OPS-PLANE-001 run-004 (serving flip build)",
  at: new Date().toISOString(),
  read_only_law: "main: begin read only; warehouse: begin read only; zero writes",
  subject_id: SUBJECT_ID,
  course_group: COURSE_GROUP,
  limit: LIMIT,
  overfetch: OVERFETCH,
  embed_rev: EMBED_REV,
};

try {
  // ── pre-flight: identity + freshness of both planes ─────────────────────
  const whWho = await wh`select current_database() as db, inet_server_addr()::text as addr, version() as v`;
  const whMeta = await wh`select key, value from warehouse_meta order by key`;
  out.warehouse = {
    database: whWho[0]?.db,
    version: (whWho[0]?.v ?? "").split(",")[0],
    meta: Object.fromEntries(whMeta.map((r) => [r.key, r.value])),
  };
  const whCounts = await wh`
    select count(*) as total,
           count(*) filter (where embedding is not null) as embedded,
           count(*) filter (where embedding is null) as no_vec,
           count(distinct kind) as kinds
    from warehouse_chunks
    where course_group = ${COURSE_GROUP}`;
  out.warehouse.plane = {
    total: Number(whCounts[0]?.total),
    embedded: Number(whCounts[0]?.embedded),
    no_vec: Number(whCounts[0]?.no_vec),
    kinds: Number(whCounts[0]?.kinds),
  };

  // registry rehearsal (0013 not applied yet — expect does-not-exist)
  let registryState = "ABSENT";
  try {
    await main`select course_group, status from warehouse_registry limit 1`;
    registryState = "PRESENT";
  } catch (e) {
    registryState = /does not exist/i.test(String(e?.message ?? e)) ? "ABSENT" : `ERROR: ${e}`;
  }
  out.registry_state_on_main = registryState;

  // ── main: curriculum version of the subject of record + seed vector ─────
  await main.unsafe("begin read only");
  await wh.unsafe("begin read only");

  const cvRows = await main`
    select id, curriculum_version_id, code, name from subjects where id = ${SUBJECT_ID}`;
  if (cvRows.length !== 1) throw new Error(`subject ${SUBJECT_ID} not found on main`);
  const cvId = cvRows[0].curriculum_version_id;
  out.subject = { id: cvRows[0].id, code: cvRows[0].code, name: cvRows[0].name, curriculum_version_id: cvId };

  // self-retrieval seed: an embedded, serving-eligible 4MA1 chunk
  const seedRows = await main`
    select c.id, c.document_row_id, c.content, c.embedding::text as emb
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where c.subject_id = ${SUBJECT_ID}
      and c.embedding is not null
      and c.embed_rev = ${EMBED_REV}
    order by c.created_at desc
    limit 1`;
  if (seedRows.length !== 1) throw new Error("no embedded 4MA1 chunk found for the seed");
  const seed = seedRows[0];
  out.seed = { chunk_id: seed.id, document_row_id: seed.document_row_id, content_head: String(seed.content).slice(0, 80) };

  const literal = seed.emb; // a pgvector text literal straight from main

  // ── PATH A: the verbatim main-plane search (pre-flip law) ───────────────
  const t0 = performance.now();
  const pathA = await main`
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
                  where s.curriculum_version_id = ${cvId}
                    and p.validation_state = 'VALIDATED'
                    and (p.question_paper_document_id = d.document_id
                      or p.mark_scheme_document_id = d.document_id))
         or exists (
                  select 1 from subjects s2
                  where s2.curriculum_version_id = ${cvId}
                    and s2.id = c.subject_id
                    and d.validation_state = 'VALIDATED'))
    order by c.embedding <=> ${literal}::vector
    limit ${LIMIT}`;
  out.path_a_main_plane = {
    ms: ms(performance.now() - t0),
    rows: pathA.length,
    top: pathA.map((r) => ({ id: r.id, kind: r.kind, score: Number(r.score) })),
    seed_is_top: pathA[0]?.id === seed.id,
  };

  // ── PATH B: the two-step warehouse seam (the flip law) ──────────────────
  const t1 = performance.now();
  const candidates = await wh`
    select id, 1 - (embedding <=> ${literal}::vector) as score
    from warehouse_chunks
    where course_group = ${COURSE_GROUP}
      and embedding is not null
    order by embedding <=> ${literal}::vector
    limit ${LIMIT * OVERFETCH}`;
  const step1Ms = ms(performance.now() - t1);
  const scored = new Map(candidates.map((r) => [String(r.id), Number(r.score)]));
  out.path_b_step1_warehouse = {
    ms: step1Ms,
    candidates: candidates.length,
    seed_in_candidates: scored.has(seed.id),
    seed_rank: candidates.findIndex((r) => String(r.id) === seed.id) + 1,
  };

  const ids = [...scored.keys()];
  const t2 = performance.now();
  // NOTE: the probe's driver is postgres-js — the idiom here is = any(${ids})
  // (a bound uuid[] single wire value). The api's serving seam uses the 093
  // inList scalar-placeholder construction instead because the api's Neon
  // WebSocket wire 500s on array binds — same predicate, per-driver bind law.
  const hydrated = await main`
    select c.id, c.document_row_id, d.doc_version, d.document_id, d.kind, c.chunk_index,
           c.content, c.page_start, c.page_end, c.element_ids, c.spec_codes,
           c.embedding_model
    from document_chunks c
    join documents d on d.id = c.document_row_id
    where c.id = any(${ids})
      and c.embedding is not null
      and c.embed_rev = ${EMBED_REV}
      and (
            exists (
                  select 1 from exam_papers p
                  join subjects s on s.id = p.subject_id
                  where s.curriculum_version_id = ${cvId}
                    and p.validation_state = 'VALIDATED'
                    and (p.question_paper_document_id = d.document_id
                      or p.mark_scheme_document_id = d.document_id))
         or exists (
                  select 1 from subjects s2
                  where s2.curriculum_version_id = ${cvId}
                    and s2.id = c.subject_id
                    and d.validation_state = 'VALIDATED'))`;
  const hydrateMs = ms(performance.now() - t2);
  const ordered = hydrated
    .map((row) => ({ row, score: scored.get(String(row.id)) ?? 0 }))
    .sort((a, b) => b.score - a.score || String(a.row.id).localeCompare(String(b.row.id)))
    .slice(0, LIMIT)
    .map(({ row, score }) => ({ id: String(row.id), kind: row.kind, score }));
  out.path_b_warehouse_seam = {
    hydrate_ms: hydrateMs,
    hydrated: hydrated.length,
    dropped_by_eligibility: candidates.length - hydrated.length,
    served: ordered.length,
    top: ordered,
    seed_is_top: ordered[0]?.id === seed.id,
    total_ms: ms(performance.now() - t1),
  };

  // ── agreement of record ─────────────────────────────────────────────────
  const a = pathA.map((r) => String(r.id));
  const b = ordered.map((r) => r.id);
  const setA = new Set(a);
  const overlap = b.filter((id) => setA.has(id));
  let rankAgreement = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) rankAgreement++;
  const scoreByKey = new Map(pathA.map((r) => [String(r.id), Number(r.score)]));
  let maxDelta = 0;
  for (const r of ordered) {
    const aScore = scoreByKey.get(r.id);
    if (aScore != null) maxDelta = Math.max(maxDelta, Math.abs(aScore - r.score));
  }
  out.agreement = {
    overlap_at_limit: `${overlap.length}/${LIMIT}`,
    rank_identical_positions: rankAgreement,
    max_score_delta_on_shared: maxDelta,
    verdict:
      overlap.length === LIMIT && rankAgreement === LIMIT && maxDelta < 1e-9
        ? "IDENTICAL"
        : overlap.length >= LIMIT - 2
          ? "NEAR-IDENTICAL (recall margin — see the run-004 receipt's overfetch law)"
          : "DIVERGENT — investigate before any flip",
  };

  out.pass =
    out.path_b_warehouse_seam.seed_is_top &&
    (out.agreement.verdict.startsWith("IDENTICAL") || out.agreement.verdict.startsWith("NEAR"));

  // ── close read-only sessions ────────────────────────────────────────────
  await main.unsafe("commit");
  await wh.unsafe("commit");
} catch (err) {
  out.error = String(err?.message ?? err);
  try { await main.unsafe("rollback"); } catch {}
  try { await wh.unsafe("rollback"); } catch {}
  out.pass = false;
} finally {
  await main.end({ timeout: 5 });
  await wh.end({ timeout: 5 });
}

const fs = await import("node:fs");
const outFile =
  process.argv[2] ??
  new URL("../../.syllabai/receipts/T-OPS-PLANE-001/run-004-serving-flip-probe-r0.json", import.meta.url)
    .pathname;
fs.mkdirSync(new URL(".", `file://${outFile}`).pathname, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ pass: out.pass, verdict: out.agreement?.verdict, out: outFile }, null, 2));
if (!out.pass) process.exit(1);
