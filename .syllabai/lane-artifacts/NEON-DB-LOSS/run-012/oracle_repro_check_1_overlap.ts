// Oracle reproduction check — READ ONLY.
// Law of record (run-006 decision): the surviving 14,141 pre-snapshot mark_points are the
// validation oracle. Idempotent re-derivation over identical inputs must REPRODUCE them on
// shared keys; material divergence = derivation defect, rebuild does not ship.
// This script measures, on the CURRENT overlap between survivor rows and the in-flight
// writer's new rows, whether reproduction is EXACT — never writes.
import postgres from 'postgres'

const sql = postgres(process.env.DB_URL, { max: 1, prepare: false })
const B = '2026-10-21T00:43:12Z' // snapshot boundary of record (run-003)

const q = async (label, fn) => {
  const t = Date.now()
  const r = await fn()
  console.log(`[${label}] ${Date.now() - t}ms`)
  return r
}

// 0) current estate + writer heartbeat
const estate = await q('estate', () => sql`
  select count(*)::int as total,
         count(*) filter (where created_at < ${B}::timestamptz)::int as survivors,
         count(*) filter (where created_at >= ${B}::timestamptz)::int as newrows,
         max(created_at) as newest
  from mark_points`)
console.log('estate:', estate[0])

// 1) shared-key overlap at POINT level: question_part_id present in BOTH planes
//    (question_parts survived the loss — they are content plane, gate-PASS inputs)
const overlap = await q('overlap', () => sql`
  select
    (select count(distinct question_part_id) from mark_points where created_at < ${B}::timestamptz)::int as survivor_parts,
    (select count(distinct question_part_id) from mark_points where created_at >= ${B}::timestamptz)::int as new_parts,
    (select count(*)::int from (
       select distinct question_part_id from mark_points where created_at < ${B}::timestamptz
       intersect
       select distinct question_part_id from mark_points where created_at >= ${B}::timestamptz
    ) t) as shared_parts`)
console.log('part-level overlap:', overlap[0])

// 2) scheme-level: do new schemes reference the same question_version_id + source_document_id
//    as survivor schemes? (the cleanest shared key for the EQ-bank plane)
const sch = await q('schemes', () => sql`
  select
    (select count(*)::int from mark_schemes where created_at < ${B}::timestamptz) as survivor_schemes,
    (select count(*)::int from mark_schemes where created_at >= ${B}::timestamptz) as new_schemes,
    (select count(*)::int from (
       select question_version_id, coalesce(source_document_id,'') as sd
       from mark_schemes where created_at < ${B}::timestamptz
       intersect
       select question_version_id, coalesce(source_document_id,'') as sd
       from mark_schemes where created_at >= ${B}::timestamptz
    ) t) as shared_scheme_keys`)
console.log('scheme-level overlap:', sch[0])

await sql.end()
