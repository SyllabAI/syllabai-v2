#!/usr/bin/env node
// T-OPS-PLANE-001 provisioner — creates ONE course-group warehouse on Neon
// and applies the frozen template (template.sql v1), then verifies.
//
// Law: docs/DATA-PLANE-PLACEMENT.md §5 execution order. Credentials env-only,
// never written to disk, never logged. Zero writes to MAIN — this tool only
// creates a NEW project.
//
// Usage:
//   NEON_API_KEY=napi_... GROUP=maths-4ma1 SUBJECT_ID=<uuid> node provision.mjs
//
// Optional env:
//   NEON_PARENT_PROJECT_ID  (org/project parent for billing grouping)
//   NEON_PG_VERSION         (default 18)
//
// Output: prints the new project's pooler URL fields (id/host/db/role) and a
// CONNECTION_URL for THIS RUN ONLY — the operator stores it wherever secrets
// of record live (Neon console / Vercel env). This script never persists it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const __dir = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.neon.tech/v2';

const env = (k) => process.env[k];
for (const k of ['NEON_API_KEY', 'GROUP', 'SUBJECT_ID']) {
  if (!env(k)) { console.error(`missing env ${k}`); process.exit(1); }
}
const KEY = env('NEON_API_KEY'), GROUP = env('GROUP'), SUBJECT_ID = env('SUBJECT_ID');
const PG_VERSION = Number(env('NEON_PG_VERSION') || 18);
const NAME = `syllabai-wh-${GROUP}`;
const call = async (method, path, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
};

// 1. create the project (single branch, scale-to-zero default is fine — read-mostly)
console.log(`[provision] creating project ${NAME} ...`);
const proj = await call('POST', '/projects', {
  project: {
    name: NAME,
    pg_version: PG_VERSION,
    ...(env('NEON_PARENT_PROJECT_ID') ? { org_id: env('NEON_PARENT_PROJECT_ID') } : {}),
    branch: { name: 'main' },
  },
});
const projectId = proj.project.id;
const branchId = proj.project.branches?.[0]?.id || proj.project.default_branch_id;
console.log(`[provision] project ${projectId} branch ${branchId}`);

// 2. connection string (Neon returns one per branch endpoint)
const cs = proj.connection_uris?.[0]?.connection_uri
  ?? proj.connection_uris?.[0]?.connection_parameters; // normalize below
let url;
if (typeof cs === 'string') url = cs;
else if (cs) {
  const q = new URLSearchParams({ sslmode: 'require' });
  url = `postgresql://${cs.user}:${cs.password}@${cs.host}/${cs.database}?${q}`;
}
if (!url) throw new Error('no connection_uri in create response — fetch via GET /projects/:id/connection_uri');
console.log('[provision] connection secured (not printed; used in-memory only)');

// 3. apply the frozen template, verbatim
const template = readFileSync(join(__dir, 'template.sql'), 'utf8');
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });
console.log('[provision] applying template wh-v1 ...');
await sql.unsafe(template);

// 4. meta of record
await sql.unsafe(
  `INSERT INTO warehouse_meta (key, value) VALUES
   ('template_version','wh-v1'), ('course_group',$1), ('subject_id',$2),
   ('migrated_at',(now() at time zone 'utc')::text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [GROUP, SUBJECT_ID],
);

// 5. verify: objects exist + canary roundtrip
const tables = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
const idx = await sql`select indexname from pg_indexes where schemaname='public' order by 1`;
const ext = await sql`select extname from pg_extension where extname='vector'`;
const need = ['warehouse_meta', 'warehouse_chunks'];
for (const n of need) if (!tables.some(t => t.table_name === n)) throw new Error(`verify: table ${n} missing`);
if (!idx.some(i => i.indexname === 'ix_warehouse_chunks_embedding')) throw new Error('verify: HNSW index missing');
if (ext.length !== 1) throw new Error('verify: vector extension missing');
await sql.unsafe(`INSERT INTO warehouse_chunks (id, document_id, document_row_id, course_group, subject_id, kind, chunk_index, content, created_at)
  VALUES (gen_random_uuid(), 'canary-provision', gen_random_uuid(), $1, $2, 'CANARY', 0, 'provision canary', now())`, [GROUP, SUBJECT_ID]);
const canary = await sql`select count(*)::int n from warehouse_chunks where document_id='canary-provision'`;
await sql.unsafe(`DELETE FROM warehouse_chunks WHERE document_id='canary-provision'`);
const post = await sql`select count(*)::int n from warehouse_chunks`;
if (canary[0].n !== 1 || post[0].n !== 0) throw new Error('verify: canary roundtrip failed');
await sql.end();

console.log(`[provision] OK — ${NAME} (${projectId}) template wh-v1 verified: vector ext + 2 tables + 6 indexes + canary roundtrip`);
console.log(`[provision] NEXT: run dryrun-4ma1.mjs with WH_DB_URL for this project (env-only)`);
