// estate-tripwire.mjs — whole-estate loss-detection fingerprint (READ ONLY)
// Of-record instrument for T-OPS-TRIPWIRE-001 (usage law: run-005 receipt).
//
// Usage:  DB_URL='<pooler>' node estate-tripwire.mjs        # JSON to stdout
//         DB_URL='...' OUT=/tmp/r2.json node estate-tripwire.mjs
//
// Recipe v2 (re-derived post sandbox-wipe 2026-10-24; r0/r1 fingerprint
// values are NOT byte-comparable across the recipe gap — gate pins remain
// the comparable basis; r2 onward is self-consistent):
//   ddl_fingerprint    = sha256( lines(table|column|data_type|is_nullable,
//                                       tables sorted, columns by ordinal) )
//   estate_fingerprint = sha256( lines(table|exact_rows, tables sorted) )
// Gate pins baseline = run-005 r0 (2026-10-23T13:49:06Z).
// Session-level READ ONLY transaction: any write attempt aborts the probe.

import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const DB_URL = process.env.DB_URL
if (!DB_URL) { console.error('FATAL: DB_URL env required'); process.exit(2) }

const sha = (s) => createHash('sha256').update(s).digest('hex')

// run-005 r0 gate pins (of record)
const GATE_PINS = {
  table_count: 75,
  mark_points: 14141,
  mark_schemes: 6733,
  document_chunks: 13765,
  documents: 1354,
  question_asset: 585,
  revision_note_asset: 194,
  users: 587,
  exam_papers_4MA1: 110,
}
const SATELLITE_NAMES = ['Assignment', 'AssignmentClass', 'AssignmentTask', 'AssignmentTaskState', 'Class', 'Enrollment', 'Resource']

const sql = postgres(DB_URL, { max: 1, prepare: false })

const out = {
  instrument: 'estate-tripwire',
  recipe_version: 'v2-rederived-post-wipe',
  measured_at_utc: null,
  read_only: true,
}

try {
  await sql.begin(async (tx) => {
    await tx.unsafe('SET TRANSACTION READ ONLY')

    out.measured_at_utc = (await tx`select now() as t`)[0].t.toISOString()

    // 1. all public base tables
    const tabs = (await tx`
      select c.relname as table
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`)
    const names = tabs.map((r) => r.table)
    out.table_count = names.length

    // 2. exact row counts + bytes per table
    out.tables = []
    for (const t of names) {
      const r = await tx.unsafe(`select count(*)::bigint as n from "${t}"`)
      const b = await tx.unsafe(`select pg_total_relation_size('"public"."${t}"'::regclass)::bigint as b`)
      out.tables.push({ table: t, rows: Number(r[0].n), bytes: Number(b[0].b) })
    }

    // 3. fingerprints
    const cols = (await tx`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`)
    const ddlLines = cols.map((c) => `${c.table_name}|${c.column_name}|${c.data_type}|${c.is_nullable}`)
    const estateLines = out.tables.map((t) => `${t.table}|${t.rows}`)
    out.fingerprints = { ddl: sha(ddlLines.join('\n')), estate_rows: sha(estateLines.join('\n')) }

    // 4. named-plane helpers
    const cnt = async (t) => Number((await tx.unsafe(`select count(*)::bigint as n from "${t}"`))[0].n)
    out.documents_by_kind = (await tx`select kind, count(*)::int as n from documents group by 1 order by 1`)
      .map((r) => ({ kind: r.kind, n: r.n }))

    // exam_papers by qualification (column name discovered, not assumed)
    const qualCol = (await tx`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='exam_papers' and column_name ~* 'qual'
      order by 1 limit 1`)
    out.exam_papers_by_qualification = qualCol.length
      ? (await tx.unsafe(`select "${qualCol[0].column_name}" as q, count(*)::int as n from exam_papers group by 1 order by 1`))
          .map((r) => ({ qualification: r.q, papers: r.n }))
      : [{ note: 'no qualification column found' }]
    out.exam_papers_total = await cnt('exam_papers')

    // 5. drain + sizes
    const drain = (await tx`
      select count(*)::int as total,
             count(*) filter (where embedding is null)::int as no_vec
      from document_chunks`)[0]
    out.drain = { chunks_total: drain.total, no_vec: drain.no_vec, embedded: drain.total - drain.no_vec }
    const dbsize = (await tx`select pg_database_size(current_database())::bigint as b, pg_size_pretty(pg_database_size(current_database())) as p`)[0]
    out.db_size_bytes = Number(dbsize.b)
    out.db_size_pretty = dbsize.p

    // 6. flyway head
    try {
      const fw = (await tx.unsafe(
        `select version, description, success from flyway_schema_history order by installed_rank desc limit 1`))[0]
      out.flyway_head = fw ? { version: fw.version, description: fw.description, success: fw.success } : null
    } catch { out.flyway_head = { note: 'flyway_schema_history not reachable' } }

    // 7. satellite quarantine check
    out.satellite_tables_present = names.filter((t) => SATELLITE_NAMES.includes(t)).length

    // 8. gate-pin comparison vs r0
    const live = {
      table_count: out.table_count,
      mark_points: Number(out.tables.find((t) => t.table === 'mark_points')?.rows ?? -1),
      mark_schemes: Number(out.tables.find((t) => t.table === 'mark_schemes')?.rows ?? -1),
      document_chunks: out.drain.chunks_total,
      documents: out.documents_by_kind.reduce((a, k) => a + k.n, 0),
      question_asset: Number(out.tables.find((t) => t.table === 'question_asset')?.rows ?? -1),
      revision_note_asset: Number(out.tables.find((t) => t.table === 'revision_note_asset')?.rows ?? -1),
      users: Number(out.tables.find((t) => t.table === 'users')?.rows ?? -1),
      exam_papers_4MA1: Number((out.exam_papers_by_qualification.find((q) => q.qualification === '4MA1') ?? { papers: -1 }).papers),
    }
    out.gate_pins = {
      baseline: 'run-005 r0 (2026-10-23T13:49:06Z)',
      results: Object.entries(GATE_PINS).map(([k, v]) => ({ pin: k, baseline: v, live: live[k], state: live[k] === v ? 'PASS' : 'DRIFT' })),
      all_stable: Object.entries(GATE_PINS).every(([k, v]) => live[k] === v),
    }
  })
  await sql.end()
} catch (e) {
  out.error = String(e && e.message ? e.message : e)
  try { await sql.end() } catch {}
}

const txt = JSON.stringify(out, null, 1)
if (process.env.OUT) { writeFileSync(process.env.OUT, txt) }
console.log(txt)
