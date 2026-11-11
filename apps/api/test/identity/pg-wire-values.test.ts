/**
 * toPgWireValue law tests (T-MG-REGIONS-500 run-001).
 *
 * The defect of record (live 2026-11-11): @neondatabase/serverless 0.10.2
 * JSON-stringifies non-scalar bind parameters (the bundled pg prepareValue),
 * so a JS array bound to `any($1::uuid[])` reached Postgres as
 * '["a","b"]' — a malformed array literal — and every array-binding query
 * (paper regions, regrade rects, teach-me spec-points, assignment packs)
 * 500ed on the production Neon path while the postgres.js replay path
 * bound arrays natively and kept CI green.
 *
 * The law pinned here: arrays leave the adapter as canonical QUOTED pg
 * array literals (scalar wire values, parsed by the call-site ::casts);
 * scalars, null and objects pass through byte-identical.
 */
import { describe, expect, test } from "bun:test";
import { toPgWireValue } from "../../src/services/identity/users";

const U1 = "47000000-0000-4000-8000-000000000001";
const U2 = "47000000-0000-4000-8000-000000000002";

describe("toPgWireValue — the Neon array-bind law", () => {
  test("a uuid array becomes a quoted pg array literal (not JSON)", () => {
    expect(toPgWireValue([U1, U2])).toBe(`{"${U1}","${U2}"}`);
  });

  test("the literal parses as the ::uuid[] cast target — JSON form does not", () => {
    // the defect shape, for the record: JSON.stringify([U1]) is a malformed
    // array literal for Postgres; the literal form is not.
    expect(JSON.stringify([U1])).toBe(`["${U1}"]`);
    expect(toPgWireValue([U1])).toBe(`{"${U1}"}`);
    expect(toPgWireValue([U1])).not.toBe(JSON.stringify([U1]));
  });

  test("empty array → {} (any() over it matches no rows — never an error)", () => {
    expect(toPgWireValue([])).toBe("{}");
  });

  test("null / undefined elements render as NULL", () => {
    expect(toPgWireValue([U1, null, U2])).toBe(`{"${U1}",NULL,"${U2}"}`);
  });

  test("numbers and booleans render bare", () => {
    expect(toPgWireValue([1, 2.5, true, false])).toBe("{1,2.5,true,false}");
  });

  test("quotes and backslashes are escaped per the pg quoting rule", () => {
    expect(toPgWireValue(['a"b', "c\\d"])).toBe('{"a\\"b","c\\\\d"}');
  });

  test("scalars pass through byte-identical (no behaviour change)", () => {
    expect(toPgWireValue("plain")).toBe("plain");
    expect(toPgWireValue(42)).toBe(42);
    expect(toPgWireValue(true)).toBe(true);
    expect(toPgWireValue(null)).toBe(null);
    expect(toPgWireValue(undefined)).toBe(undefined);
  });

  test("objects pass through unchanged (the driver's JSON law is untouched)", () => {
    const obj = { a: 1 };
    expect(toPgWireValue(obj)).toBe(obj);
  });
});
