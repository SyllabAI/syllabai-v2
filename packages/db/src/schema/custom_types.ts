/**
 * GENERATED-COMPANION (T-MIG-002) — customType shims for column types
 * the declared drizzle-orm 0.38.x has no native pg-core helper for.
 *
 * drizzle-kit 0.31.11 emits these sites as `unknown("col")` (and never
 * imports `unknown` — unresolvable on any orm version). The shim maps
 * the DB types byte-for-byte via dataType(); driverData passes the
 * driver buffer/string through untouched.
 *
 * Applied by scripts/fix_kit_empty_default.py — deterministic, logged
 * in .syllabai/receipts/T-MIG-002/. Re-runnable after a future
 * drizzle-kit pull (schema.ts edits only; this file is idempotent).
 */
import { customType } from "drizzle-orm/pg-core";

/** Postgres `bytea` — binary payload (revision_note_asset.bytes). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Postgres `tsvector` — generated full-text column (content.content_tsv). */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});
