// Oracle reproduction check #3 — READ ONLY. Final classification probes.
import postgres from 'postgres'

const sql = postgres(process.env.DB_URL, { max: 1, prepare: false })
const B = '2026-10-21T00:43:12Z'

const show = (label, rows) => { console.log(`[${label}]`); for (const r of rows) console.log(' ', JSON.stringify(r)) }

// 1) heartbeat
show('heartbeat', await sql`
  select count(*)::int as new_points, max(created_at) as newest
  from mark_points where created_at >= ${B}::timestamptz`)

// 2) duplication test: external_ref overlap between surviving and writer question rows
show('external_ref_overlap', await sql`
  select
    (select count(*)::int from questions where created_at < ${B}::timestamptz and external_ref is not null) as survivor_with_ref,
    (select count(*)::int from questions where created_at >= ${B}::timestamptz and external_ref is not null) as writer_with_ref,
    (select count(*)::int from (
       select external_ref from questions where created_at < ${B}::timestamptz and external_ref is not null
       intersect
       select external_ref from questions where created_at >= ${B}::timestamptz and external_ref is not null
    ) t) as shared_refs`)

// 3) the 4,768 no-part new points: NULL (part-less class) vs true orphan (non-null, missing row)
show('no_part_classification', await sql`
  select
    count(*) filter (where question_part_id is null)::int as null_part_id,
    count(*) filter (where question_part_id is not null and qp.id is null)::int as true_orphans,
    count(*)::int as total_new_points
  from mark_points mp
  left join question_parts qp on qp.id = mp.question_part_id
  where mp.created_at >= ${B}::timestamptz`)

// 4) sum-law sample on the writer's rows (G1 law: per-part mark_points sum == part marks)
show('sum_law_sample', await sql`
  with pairs as (
    select mp.question_part_id, sum(mp.marks)::int as pts_sum, max(qp.marks)::int as part_marks
    from mark_points mp
    join question_parts qp on qp.id = mp.question_part_id
    where mp.created_at >= ${B}::timestamptz
    group by mp.question_part_id
  )
  select count(*)::int as parts_checked,
         count(*) filter (where pts_sum = part_marks)::int as sum_ok,
         count(*) filter (where pts_sum <> part_marks)::int as sum_violations
  from pairs`)

// 5) provenance signature of the writer's question rows
show('writer_provenance', await sql`
  select q.provenance, qv.extraction_method, count(*)::int as n
  from question_versions qv join questions q on q.id = qv.question_id
  where qv.created_at >= ${B}::timestamptz
  group by 1,2 order by n desc limit 6`)

await sql.end()
