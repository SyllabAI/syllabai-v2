/**
 * T-MIG-037 (r8-hub) scratch rig — ephemeral local postgres for the live
 * dual-run verification. NOT committed (scratch/** fence; T-MIG-035
 * harness precedent). Spins a PGlite (real postgres, WASM) behind the
 * pglite-socket wire server on 127.0.0.1:15432 and seeds the repo's own
 * drizzle baseline (packages/db/drizzle/0000_organic_mauler.sql).
 * Zero cloud contact, zero production contact, data dies with the dir.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, rmSync } from "node:fs";

const DATA = "/home/z/my-project/scratch-pg/pgdata";
rmSync(DATA, { recursive: true, force: true }); // always start from a clean store
const db = new PGlite(DATA, { extensions: { vector } });
await db.exec("CREATE EXTENSION IF NOT EXISTS vector;"); // pgvector type for document_chunks.embedding

// Extract the SQL from the drizzle file: it wraps the statements in a
// /* ... */ "uncomment to execute" block after two leading -- comment lines.
const raw = readFileSync(
  "/home/z/my-project/syllabai-v2/packages/db/drizzle/0000_organic_mauler.sql",
  "utf8",
);
const start = raw.indexOf("/*");
const end = raw.lastIndexOf("*/");
if (start < 0 || end < 0) throw new Error("drizzle sql wrapper not found");
const body = raw.slice(start + 2, end);
const statements = body
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => {
    // RIG-ONLY accommodation (disclosed in the receipt, zero repo changes):
    // the introspected baseline carries mangled explicit btree operator
    // classes (text_ops on uuid columns, uuid_ops on varchar, ...) — the
    // real repair belongs to T-MIG-002-R. For the harness we strip every
    // explicit opclass so each column takes its type's default btree
    // opclass (what a normally-created production index has).
    if (/^CREATE (UNIQUE )?INDEX/i.test(s)) {
      return s.replace(/\b(text_ops|uuid_ops|int4_ops|int8_ops|timestamptz_ops|date_ops|jsonb_ops|numeric_ops|bool_ops|float4_ops|float8_ops|time_ops|timetz_ops|bytea_ops|inet_ops|cidr_ops|macaddr_ops|money_ops|interval_ops|char_ops|varchar_ops|tsvector_ops|tsquery_ops|uuid_ops)\b/g, "").replace(/\s+/g, " ");
    }
    return s;
  });

let applied = 0;
for (const stmt of statements) {
  await db.exec(stmt);
  applied++;
}
// Reference data the empty baseline lacks (production carries it): the
// register flow inserts user_roles.role = STUDENT under roles FK.
for (const role of ["STUDENT", "TEACHER", "ADMIN"]) {
  await db.exec(`INSERT INTO roles (name, description) VALUES ('${role}', 'T-MIG-037 rig reference seed')`);
}
console.log(`[pglite-rig] applied ${applied} baseline statements + 3 roles reference rows`);

const tables = await db.exec<{ n: string }>(
  "select table_name as n from information_schema.tables where table_schema='public' order by 1",
);
console.log(`[pglite-rig] ${tables.length} public tables seeded`);

const server = new PGLiteSocketServer({ db, port: 15432, host: "127.0.0.1", maxConnections: 8 });
await server.start();
console.log("[pglite-rig] wire server up on 127.0.0.1:15432");
setInterval(() => {}, 1 << 30); // keep the event loop alive
