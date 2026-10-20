/**
 * Data-provider factory. Selection order:
 *
 *   1. HUB_DATA_MODE env ("mock" | "core-api") — explicit override
 *   2. core-api when SYLLABAI_CORE_BASE_URL is set
 *   3. mock (always available — the bundled-corpus default)
 *
 * The neon provider was removed at promotion (ADR-029): a production
 * frontend must not bypass the core domain layer and touch a database
 * directly. mock | core-api are the only two modes.
 *
 * Bundle-offload note (perf band): mode RESOLUTION lives in ./mode.ts —
 * an import-free module — so mode-only consumers (lib/config.ts ← root
 * layout) never reach this factory, and the mock.ts corpus bake stays
 * confined to call sites that actually resolve a provider. Import the
 * mode module directly when you only need resolveDataMode.
 */
import "server-only";
import type { DemoDataProvider } from "./types";
import { mockProvider } from "./mock";
import { coreApiProvider } from "./core-api";
import { resolveDataMode } from "./mode";

export type { DataMode } from "./mode";
export { resolveDataMode, isCoreApiConfigured } from "./mode";

export function getDataProvider(): DemoDataProvider {
  switch (resolveDataMode()) {
    case "core-api":
      return coreApiProvider();
    default:
      return mockProvider();
  }
}
