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
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
