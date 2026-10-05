import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRendererFixes } from "./render_fixes";

const dir = import.meta.dir;
const raw = readFileSync(join(dir, "fixtures/kit0311-raw.ts.txt"), "utf8");
const canonical = readFileSync(join(dir, "fixtures/expected-canonical.ts.txt"), "utf8");
const schemaPath = join(dir, "../../src/schema/schema.ts");

describe("render_fixes (T-MIG-002-R F3, in-repo port of the D1 script)", () => {
  it("rewrites a raw kit-0.31.11 fragment to the canonical bytes", () => {
    const r = applyRendererFixes(raw);
    expect(r.text).toBe(canonical);
    expect(r.sites.filter((s) => s.kind === "empty-default").length).toBe(1);
    expect(r.sites.filter((s) => s.kind === "unknown-shim").length).toBe(2);
    expect(r.sites.filter((s) => s.kind === "import").length).toBe(1);
  });

  it("is idempotent on its own output (0 sites on re-run)", () => {
    const once = applyRendererFixes(raw);
    const twice = applyRendererFixes(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.sites.length).toBe(0);
  });

  it("checked-in schema.ts is a fixed point (repair-friendliness proven)", () => {
    const before = readFileSync(schemaPath, "utf8");
    const r = applyRendererFixes(before);
    expect(r.sites.length).toBe(0);
    expect(r.text).toBe(before);
  });

  it("reversed fixes round-trip byte-identically (codemod reproduces the checked-in baseline from raw-kit shape)", () => {
    const original = readFileSync(schemaPath, "utf8");
    const reversed = original
      .replace(/\.default\(''\)/g, ".default(')")
      .replace(/bytea\("bytes"\)/g, 'unknown("bytes")')
      .replace(/tsvector\("content_tsv"\)/g, 'unknown("content_tsv")')
      .replace(/import \{ bytea, tsvector \} from "\.\/custom_types"\n/, "");
    // sanity: reversal actually reintroduced the defect shapes
    expect((reversed.match(/\.default\('\)/g) ?? []).length).toBe(5);
    expect((reversed.match(/unknown\(/g) ?? []).length).toBe(3);
    const refixed = applyRendererFixes(reversed);
    expect(refixed.text).toBe(original);
    expect(refixed.sites.filter((s) => s.kind === "empty-default").length).toBe(5);
    expect(refixed.sites.filter((s) => s.kind === "unknown-shim").length).toBe(3);
  });

  it("refuses to rewrite unknown( without a TODO type comment", () => {
    expect(() => applyRendererFixes('\tx: unknown("x").notNull(),\n')).toThrow(/refusing to guess/);
  });

  it("refuses a dangling TODO with no column", () => {
    expect(() =>
      applyRendererFixes("// TODO: failed to parse database type 'bytea'\n)\n"),
    ).toThrow(/dangling/);
  });
});
