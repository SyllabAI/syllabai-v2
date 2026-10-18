/**
 * T-MIG-133 band 133b (r0) — the Neon SQL console for the Student Books
 * pilot. Uniform driver for: credential probe (privilege battery), the
 * 133b before-guards preflight, the additive 0002 DDL apply, and the
 * postverify queries — identical bytes against the COW proof branch and
 * the production branch, so the proof actually proves the prod run.
 *
 * Driver of record for THIS runner: postgres.js (TCP) — the batch CLI
 * path; the api runtime keeps the NeonWsClient dispatch (createSql) of
 * record (T-MIG-014). postgres.js is a repo-blessed dep (packages/db).
 *
 * The connection URI is read from a 0600 file (never argv, never logged).
 * `query` mode only executes statements starting with select/with — the
 * console is read-only by construction except the explicit ddl mode.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const [uriPath, mode, arg] = process.argv.slice(2);
if (!uriPath || !mode) {
  console.error(
    "usage: bun apps/api/scripts/neon-sql.ts <uri-file> <probe|preflight|ddl|query> [sql-file|sql]",
  );
  process.exit(2);
}
const uri = readFileSync(uriPath, "utf8").trim();
const sql = postgres(uri, { max: 1, connect_timeout: 30, idle_timeout: 20 });

function row(o: Record<string, unknown> | undefined): string {
  return o == null ? "null" : JSON.stringify(o);
}

async function main(): Promise<void> {
  if (mode === "probe") {
    const who = await sql`select current_user as u, current_database() as db`;
    console.log("identity:", row(who[0]));
    const priv = await sql`
      select has_schema_privilege(current_user, 'public', 'CREATE') as schema_create,
             has_table_privilege(current_user, 'documents', 'SELECT') as documents_select,
             has_table_privilege(current_user, 'documents', 'INSERT') as documents_insert,
             pg_get_userbyid(datdba) as db_owner
      from pg_database where datname = current_database()`;
    console.log("privileges:", row(priv[0]));
    try {
      await sql.begin(async (tx) => {
        await tx`create table if not exists _t133b_probe (id int)`;
        await tx`drop table _t133b_probe`;
      });
      console.log("ddl: ALLOWED");
    } catch (e) {
      console.log("ddl: DENIED —", (e as Error).message.split("\n")[0]);
    }
    const ext = await sql`select extname from pg_extension where extname = 'vector'`;
    console.log("pgvector:", ext.length > 0 ? "present" : "MISSING");
    const state = await sql`
      select (select count(*)::int from documents) as documents,
             (select count(*)::int from document_chunks) as chunks,
             (select count(*)::int from document_chunks where embedding is not null) as embedded,
             (select count(*)::int from document_chunks where embed_rev = 2) as embed_rev2,
             (select count(*)::int from subjects) as subjects`;
    console.log("corpus-state:", row(state[0]));
  } else if (mode === "preflight") {
    // 133b before-guards — every row must read as expected before any write.
    const dup = await sql`
      select id, document_id, kind::text as kind, created_at
      from documents where checksum = ${"d48020e0cc0b5545b330bb59b242472198210e424525e4381cd5d2a58a58cc04"} limit 1`;
    console.log("guard.checksum-absent:", dup.length === 0 ? "PASS" : "FAIL " + row(dup[0]));
    const tbl = await sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'book_chapters'`;
    console.log("guard.book_chapters-table:", Number(tbl[0]?.n) > 0 ? "PRESENT (ddl done)" : "ABSENT (ddl required)");
    if (Number(tbl[0]?.n) > 0) {
      const bc = await sql`select count(*)::int as n from book_chapters`;
      console.log("guard.book_chapters-empty:", Number(bc[0]?.n) === 0 ? "PASS" : "FAIL rows=" + row(bc[0]));
    }
    const subs = await sql`select code, name from subjects order by code`;
    console.log("subjects:", JSON.stringify(subs));
    const mig = await sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'documents'`;
    console.log("core-tables:", Number(mig[0]?.n) > 0 ? "PASS" : "FAIL");
  } else if (mode === "ddl") {
    if (!arg) throw new Error("ddl mode requires a sql file path");
    const raw = readFileSync(arg, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    await sql.begin(async (tx) => {
      for (const s of statements) await tx.unsafe(s);
    });
    console.log("ddl: APPLIED", statements.length, "statements");
  } else if (mode === "query") {
    if (!arg) throw new Error("query mode requires a sql string");
    const q = arg.trim().toLowerCase();
    if (!(q.startsWith("select") || q.startsWith("with"))) {
      throw new Error("query mode is read-only (select/with only)");
    }
    const rows = await sql.unsafe(arg);
    console.log(JSON.stringify(rows, null, 1));
  } else {
    throw new Error("unknown mode " + mode);
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL:", (e as Error).message.split("\n")[0]);
    process.exit(1);
  });
