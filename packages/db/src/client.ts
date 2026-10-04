/**
 * Neon serverless client — the same database the frozen Java core talks to
 * (operator directive 2026-10-04: "We will be connecting to the same neon
 * data base").
 *
 * Env mapping from the Java core's render.yaml:
 *   SYLLABAI_DATABASE_URL = jdbc:postgresql://ep-...neon.tech/syllabai?sslmode=require
 *     →
 *   DATABASE_URL          = postgresql://ep-...neon.tech/syllabai?sslmode=require
 *   (same host, same database, same credentials — only the jdbc: scheme
 *   prefix is dropped. Username/password stay as separate env vars in the
 *   Java core; Neon URLs carry them in the path — map accordingly.)
 *
 * Fail-fast discipline (carried over from the Java core): a blank
 * DATABASE_URL must never produce a lazily-crashing client. This module
 * refuses to build one.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export interface DbEnv {
  DATABASE_URL: string;
}

export function requireDatabaseUrl(env: Partial<DbEnv> = process.env as Partial<DbEnv>): string {
  const url = env.DATABASE_URL;
  if (!url || url.trim() === "") {
    // Fail fast and visibly — the Java core refuses boot on blank JWT/db
    // secrets; the v2 api inherits that behaviour verbatim.
    throw new Error(
      "DATABASE_URL is blank — refusing to build a DB client. " +
        "Map SYLLABAI_DATABASE_URL (jdbc:postgresql://…) by dropping the jdbc: prefix.",
    );
  }
  if (url.startsWith("jdbc:")) {
    throw new Error(
      "DATABASE_URL still carries the jdbc: prefix — strip it before passing to the Neon driver.",
    );
  }
  return url;
}

export function createDb(env: Partial<DbEnv> = process.env as Partial<DbEnv>) {
  const url = requireDatabaseUrl(env);
  return drizzle({ client: neon(url) });
}

export type Db = ReturnType<typeof createDb>;

// NOTE: schema re-exports land here when T-MIG-002 baselines the schema:
//   export * from "./schema";
// Until then the client is schema-less by design — do not hand-write tables.
