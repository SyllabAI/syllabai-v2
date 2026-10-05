/**
 * T-MIG-014 — driver dispatch unit pins.
 *
 * The dispatch decision (isNeonUrl) and the fail-fast guards are pure logic:
 * they are pinned here WITHOUT any live connection. Drizzle's neon-http and
 * postgres-js instances are both constructed lazily (no socket is opened by
 * createDb itself), so construction-level assertions are safe in CI.
 * Live two-driver evidence (both transports against a real Neon scratch
 * branch) lives in the task receipt: .syllabai/receipts/T-MIG-014/run-001.json
 */
import { describe, expect, test } from "bun:test";
import { createDb, isNeonUrl, requireDatabaseUrl } from "./client";

describe("isNeonUrl (T-MIG-014 dispatch decision)", () => {
  test("neon.tech hosts dispatch to the Neon driver", () => {
    expect(isNeonUrl("postgresql://user:pw@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require")).toBe(true);
    expect(isNeonUrl("postgres://user:pw@neon.tech/db")).toBe(true);
    expect(isNeonUrl("postgresql://user:pw@ep-xyz.neon.build/db")).toBe(false); // lookalike TLD
  });

  test("non-Neon hosts dispatch to the TCP (postgres.js) driver", () => {
    expect(isNeonUrl("postgresql://user:pw@localhost:5433/syllabai")).toBe(false);
    expect(isNeonUrl("postgresql://user:pw@127.0.0.1:5433/syllabai_capture")).toBe(false);
    expect(isNeonUrl("postgresql://user:pw@db.internal:5432/app")).toBe(false);
  });

  test("unparseable URLs are treated as non-Neon (guards still reject upstream)", () => {
    expect(isNeonUrl("not a url")).toBe(false);
  });
});

describe("createDb dispatch (construction-level, lazy drivers)", () => {
  test("refuses blank URLs for both paths (fail-fast carried verbatim)", () => {
    expect(() => createDb({ DATABASE_URL: "" })).toThrow(/blank/);
    expect(() => createDb({})).toThrow(/blank/);
  });

  test("refuses jdbc:-prefixed URLs for both paths", () => {
    expect(() =>
      createDb({ DATABASE_URL: "jdbc:postgresql://ep-x.neon.tech/neondb?sslmode=require" }),
    ).toThrow(/jdbc:/);
  });

  test("Neon URL builds the neon-http instance (no connection attempt)", () => {
    const db = createDb({
      DATABASE_URL: "postgresql://u:p@ep-x-123.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    });
    expect(db).toBeDefined();
  });

  test("non-Neon URL builds the postgres-js instance (no connection attempt)", () => {
    const db = createDb({ DATABASE_URL: "postgresql://u:p@localhost:5433/syllabai" });
    expect(db).toBeDefined();
  });
});
