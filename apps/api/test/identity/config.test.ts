import { describe, expect, test } from "bun:test";
import { DEFAULT_CORS_ORIGINS, readIdentityConfig } from "../../src/services/identity/config";

/**
 * T-MIG-098 guard pins (operator order trace 1a119b4d197a2671, issue #147):
 * the faithful port of the frozen core's application.yml:110 default carried
 * the legacy apex https://syllabai.vercel.app, which is now the
 * decommission-pending zombie cluster (500 MIDDLEWARE_INVOCATION_FAILED).
 * The corrected default names the live browser origins per the topology of
 * record (R0 sweep a6e89b1): frozen-core hub + v2 hub.
 */
describe("identity config — CORS origin allowlist (T-MIG-098)", () => {
  test("DEFAULT_CORS_ORIGINS matches the corrected topology of record", () => {
    expect(DEFAULT_CORS_ORIGINS).toEqual([
      "http://localhost:3000",
      "https://syllabai-hub.vercel.app",
      "https://syllabai-hub-v2.vercel.app",
    ]);
  });

  test("the zombie apex syllabai.vercel.app is not allowlisted by default", () => {
    expect(DEFAULT_CORS_ORIGINS.includes("https://syllabai.vercel.app")).toBe(false);
  });

  test("env override wins over the default; entries are trimmed and blanks dropped", () => {
    const cfg = readIdentityConfig({
      SYLLABAI_CORS_ORIGINS: " https://a.example , ,https://b.example ",
    });
    expect(cfg.corsOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(readIdentityConfig({}).corsOrigins).toEqual([...DEFAULT_CORS_ORIGINS]);
  });
});
