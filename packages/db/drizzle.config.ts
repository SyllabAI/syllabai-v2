import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — schema is GENERATED from the live Neon schema, not
 * hand-written (docs/BASELINE_DB.md).
 *
 * Target discipline (T-MIG-002):
 *   - Run `db:pull` ONLY against a Neon BRANCH of the production database,
 *     never the production branch itself, and never with a write-intent.
 *   - The generated schema reflects the END-STATE of 63 Flyway migrations
 *     (V1..V61+) maintained by the frozen Java core. That end-state is the
 *     contract; the migration history is not replayed in TypeScript.
 *   - `flyway_schema_history` and any Java-core bookkeeping tables MUST be
 *     kept. Drizzle must never drop or "clean up" tables it did not model —
 *     configure table filters to exclude nothing until every table is
 *     accounted for in the baseline inventory.
 *
 * Schema-path shape (T-MIG-105): this config points at the FILE
 * `./src/schema/schema.ts`, not the directory. drizzle-kit 0.30.6 loads EVERY
 * entry of a directory-schema as a JavaScript module with no extension
 * filtering and dies on `src/schema/README.md` (the load-bearing T-MIG-002
 * baseline doc) — and exits 0 having generated nothing (a silent-success CI
 * trap; first-hand repro: .syllabai/tasks/T-MIG-105-*, shape A). The file
 * schema loads schema.ts plus its transitive import (custom_types.ts) and is
 * DDL-complete (relations.ts is query-time-only). `db:pull` is unaffected by
 * the shape change: introspection artifacts are written to the `out` dir in
 * both shapes (first-hand probe of record in the T-MIG-105 receipt).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
