// Oracle reproduction check #2 — READ ONLY.
// Q: why zero shared keys? Did the writer regenerate the question plane (duplication),
//    or do new schemes/points hang off surviving question rows under different scheme keys?
import postgres from 'postgres'

const sql = postgres(process.env.DB_URL, { max: 1, prepare: false })
const B = '2026-10-21T00:43:12Z'

const show = (label, rows) => { console.log(`[${label}]`); for (const r of rows) console.log(' ', JSON.stringify(r)) }

// 1) question-plane growth across the boundary (was the question bank duplicated?)
show('question-plane-counts', await sql`
  select 'questions' as t, count(*)::int as total,
         count(*) filter (where created_at >= ${B}::timestamptz)::int as post_boundary
  from questions
  union all
  select 'question_versions', count(*)::int,
         count(*) filter (where created_at >= ${B}::timestamptz)::int
  from question_versions
  union all
  select 'question_parts', count(*)::int,
         count(*) filter (where created_at >= ${B}::timestamptz)::int
  from question_parts`)

// 2) do the NEW mark_schemes resolve to real question_versions? and when were those created?
show('new-scheme-version-resolution', await sql`
  select
    count(*)::int as new_schemes,
    count(*) filter (where qv.id is null)::int as orphaned_no_version,
    count(*) filter (where qv.created_at >= ${B}::timestamptz)::int as version_created_post_boundary,
    count(*) filter (where qv.created_at < ${B}::timestamptz)::int as version_pre_existing
  from mark_schemes ms
  left join question_versions qv on qv.id = ms.question_version_id
  where ms.created_at >= ${B}::timestamptz`)

// 3) do the NEW mark_points resolve to real question_parts? when were the parts created?
show('new-point-part-resolution', await sql`
  select
    count(*)::int as new_points,
    count(*) filter (where qp.id is null)::int as orphaned_no_part,
    count(*) filter (where qp.created_at >= ${B}::timestamptz)::int as part_created_post_boundary,
    count(*) filter (where qp.created_at < ${B}::timestamptz)::int as part_pre_existing
  from mark_points mp
  left join question_parts qp on qp.id = mp.question_part_id
  where mp.created_at >= ${B}::timestamptz`)

// 4) signature of the new question rows: extraction/provenance columns if present
const qcols = await sql`select column_name from information_schema.columns where table_name='questions' order by ordinal_position`
console.log('[questions cols]', qcols.map(c => c.column_name).join(','))
const vcols = await sql`select column_name from information_schema.columns where table_name='question_versions' order by ordinal_position`
console.log('[question_versions cols]', vcols.map(c => c.column_name).join(','))

await sql.end()
