import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanSnapshot, verdictForPair } from "./preflight_f2";

const dir = import.meta.dir;
const snapshotPath = join(dir, "../../drizzle/meta/0000_snapshot.json");

describe("preflight_f2 (T-MIG-002-R F2)", () => {
  it("declared pair (kit ^0.30.0 + orm ^0.38.0) is KNOWN_BAD with both failure modes", () => {
    const v = verdictForPair("^0.30.0", "^0.38.0");
    expect(v.usable).toBe(false);
    expect(v.reasons.length).toBe(2);
    expect(v.reasons[0]).toMatch(/gel-core/);
    expect(v.reasons[1]).toMatch(/squasher/);
  });

  it("pair is KNOWN_BAD even with a gel-capable orm (squasher crash is kit-side)", () => {
    const v = verdictForPair("^0.30.0", "0.45.3");
    expect(v.usable).toBe(false);
    expect(v.reasons.length).toBe(1);
    expect(v.reasons[0]).toMatch(/squasher/);
  });

  it("D1-proven pair (0.31.11 + 0.45.x) is usable", () => {
    const v = verdictForPair("0.31.11", "0.45.3");
    expect(v.usable).toBe(true);
    expect(v.reasons.length).toBe(0);
    expect(v.recommendation).toMatch(/never edits it/);
  });

  it("checked-in snapshot (produced by kit 0.31.11): 87 indexes, 11 partial, ZERO crash-shape columns", () => {
    const s = scanSnapshot(JSON.parse(readFileSync(snapshotPath, "utf8")));
    expect(s.indexCount).toBe(87);
    // 11 partial indexes: 8 null-flavored (IS NULL / IS NOT NULL) + 3
    // value-predicate (is_correct, active, status='ACTIVE')
    expect(s.partialIndexes.length).toBe(11);
    expect(s.crashShape.length).toBe(0);
  });

  it("detects the exact 0.30.x squashIdx ZodError shape on a synthetic snapshot", () => {
    const synthetic = {
      tables: {
        "public.exam_papers": {
          indexes: {
            ix_partial: {
              columns: [
                { expression: "paper_code", isExpression: false },
                { expression: null },
                { expression: "series", isExpression: false },
              ],
              where: "(paper_code IS NOT NULL)",
            },
          },
        },
      },
    };
    const s = scanSnapshot(synthetic);
    expect(s.crashShape.length).toBe(1);
    expect(s.crashShape[0]).toEqual({
      table: "public.exam_papers",
      index: "ix_partial",
      column: 1,
    });
  });
});
