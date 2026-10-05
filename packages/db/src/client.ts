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
 *
 * Driver dispatch (T-MIG-014): the golden-master replay gate needs a target
 * api whose db state MATCHES the capture state (GOLDEN_MASTER §2/§4). The
 * T-MIG-004 content cases are pinned to the Flyway-seed state, which no
 * production-copy Neon branch reproduces — replay targets must also be able
 * to run against a plain Postgres (local scratch / CI). Dispatch rule:
 *   - host ends with "neon.tech"  → neon-http (unchanged, production path)
 *   - any other host              → postgres.js over TCP (local scratch / CI /
 *                                   self-hosted; also speaks plain Neon TCP)
 * The guards below run for BOTH drivers — a blank or jdbc:-prefixed URL is
 * refused before any driver is chosen.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ⚠️ VERSION COMPATIBILITY (T-MIG-014 live finding): drizzle-orm 0.38.x's
// neon-http session calls neon(strings, values, options) — a call form that
// @neondatabase/serverless 1.x REMOVED (tagged-template only). The break is
// invisible to unit tests (construction is lazy) and only fires on a live
// Neon call. Pin stays at 0.10.x until drizzle-orm is bumped as a whole;
// do not "modernize" this dependency alone. Verified live on t-mig-014/r3a.

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

/** True when the URL points at Neon's managed service (the production path). */
export function isNeonUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "neon.tech" || host.endsWith(".neon.tech");
  } catch {
    return false; // URL parse failure is caught by requireDatabaseUrl consumers; treat as non-Neon
  }
}

/**
 * The two drizzle instances are structurally equivalent for the query
 * surface this monorepo uses (select/insert/execute + sql template) but are
 * distinct TS types; the dispatch returns a widened union typed at the
 * call sites through `Db`. The cast is confined to this boundary — see
 * docs/BASELINE_DB.md: the schema is driver-agnostic (generated once by
 * drizzle-kit pull), only the transport changes.
 */
export function createDb(env: Partial<DbEnv> = process.env as Partial<DbEnv>): Db {
  const url = requireDatabaseUrl(env);
  if (isNeonUrl(url)) {
    return drizzleNeon({ client: neon(url) }) as Db;
  }
  // Non-Neon Postgres (local scratch, CI, self-hosted). max 1 mirrors the
  // identity repository's serialized-session doctrine until pooling lands.
  return drizzlePostgres(postgres(url, { max: 1, prepare: false })) as Db;
}

export type Db = ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePostgres>;

// NOTE: schema re-exports landed with T-MIG-002's baseline (src/schema/schema).
export * from "./schema/schema";
