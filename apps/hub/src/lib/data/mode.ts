/**
 * Data-mode resolution — env-only, import-free.
 *
 * Split out of lib/data/index.ts by the perf/hub-bundle-offload band: the
 * old shape had lib/config.ts (imported by the ROOT LAYOUT for the mode
 * badges) reach `@/lib/data` for `resolveDataMode()`, and that edge dragged
 * the whole factory with it — including `data/mock.ts`, whose module body
 * statically imports and Zod-parses seven igcse-chemistry-19 JSON files
 * (~3.4MB) at import time. Net effect: every serverless function in the app
 * carried the mock corpus bake, on top of the corpus copies the tracer
 * added. Mode resolution is five lines of env checks; it now lives here
 * with ZERO imports, so the layout chain stays corpus-free and the mock
 * bake rides only the surfaces that actually call getDataProvider().
 *
 * Consumers:
 *   - lib/config.ts (root layout badge chain) → this module directly
 *   - lib/data/index.ts (the provider factory) → this module
 *   - lib/data/core-api.ts re-exports isCoreApiConfigured for compat
 *
 * Selection order (unchanged):
 *   1. HUB_DATA_MODE env ("mock" | "core-api") — explicit override
 *   2. core-api when SYLLABAI_CORE_BASE_URL is set
 *   3. mock (always available — the bundled-corpus default)
 */
export type DataMode = "mock" | "core-api";

export function resolveDataMode(): DataMode {
  const forced = process.env.HUB_DATA_MODE as DataMode | undefined;
  if (forced === "mock" || forced === "core-api") return forced;
  if (isCoreApiConfigured()) return "core-api";
  return "mock";
}

export const isCoreApiConfigured = () => Boolean(process.env.SYLLABAI_CORE_BASE_URL);
