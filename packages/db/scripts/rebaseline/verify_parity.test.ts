import { describe, expect, it } from "bun:test";
import { verifyParity } from "./verify_parity";

/**
 * The LIVING form of T-MIG-002's "579/579 columns.parity" verification:
 * the checked-in generated schema must match the machine-readable baseline
 * snapshot exactly — table set, column names, notNull, literal defaults.
 * Any regeneration that diverges fails here.
 */
describe("verify_parity (T-MIG-002-R, successor of the D1 one-shot check)", () => {
  it("checked-in baseline: 62/62 tables, 579/579 columns, 0 mismatches", async () => {
    const r = await verifyParity();
    expect(r.snapshotTables).toBe(62);
    expect(r.runtimeTables).toBe(62);
    expect(r.snapshotColumns).toBe(579);
    expect(r.runtimeColumns).toBe(579);
    expect(r.checked).toBe(579);
    expect(r.mismatches).toEqual([]);
    expect(r.missingInRuntime).toEqual([]);
    expect(r.missingInSnapshot).toEqual([]);
  });

  it("literal defaults are actually compared (not skipped) — sanity via count", async () => {
    const r = await verifyParity();
    // The baseline carries 5 empty-string defaults plus many literal defaults
    // (names, numbers, booleans); if comparison logic silently skipped
    // literals this would drop well below the observed count.
    expect(r.literalDefaultChecked).toBeGreaterThan(50);
  });
});
