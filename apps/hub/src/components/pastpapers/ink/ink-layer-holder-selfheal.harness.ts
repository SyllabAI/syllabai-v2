/**
 * ink-layer-holder-selfheal.harness.ts — the T-MG-INK-7 run-001 test
 * environment (test infra, not a test: bun test only picks up *.test.*).
 *
 * CHAINS THE T-MG-INK-6 HARNESS: the base module (and its import-order
 * LAW — jsdom globals must land before react-dom evaluates its module
 * init) provides document/act-environment/ResizeObserver stub/canvas
 * 2d-context proxy/pointer-capture stubs and the page-box law. This
 * extension adds ONLY what the full-InkLayer mount needs beyond it:
 *
 *   - MutationObserver on globalThis (the base harness's fixed
 *     global-copy list predates the T-MG-INK-7 eviction law, which mounts
 *     the FULL InkLayer — its holder observer constructs one). jsdom
 *     implements MutationObserver natively; it is re-homed onto
 *     globalThis exactly like the base loop does, so the component code
 *     reads one global.
 *
 * No other environment deltas — every T-MG-INK-6 environment law holds
 * verbatim through the chain.
 */
import "./ink-layer-pointerdown.harness";

import { doc } from "./ink-layer-pointerdown.harness";

const g = globalThis as unknown as Record<string, unknown>;

// The base harness's jsdom instance is reachable through the document it
// installed; its defaultView carries MutationObserver.
const jsdomWindow = (doc as unknown as { defaultView: Window & { MutationObserver?: unknown } | null })
  .defaultView;

if (!jsdomWindow || typeof jsdomWindow.MutationObserver !== "function") {
  throw new Error(
    "ink-layer-holder-selfheal.harness: jsdom window/MutationObserver unavailable — import-order law violated (this module must be the first import of its test file)",
  );
}

g.MutationObserver = jsdomWindow.MutationObserver;
