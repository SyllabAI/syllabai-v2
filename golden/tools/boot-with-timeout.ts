/**
 * T-MIG-044 PROVENANCE: repo-resident copy of
 * .syllabai/receipts/T-MIG-022/tools/boot-with-timeout.ts
 * (sha256 cddbeff94fc3167faa58b9f2bb5593f6177aaa6c36167ce24e5d6129c437c171).
 * DELTA from the receipt copy (disclosed, path-only): the app import path
 * changed from ../../../../apps/api/src/index.ts (receipt-relative) to
 * ../../apps/api/src/index.ts (golden/tools-relative). Zero other changes —
 * the serving envelope (idleTimeout=255, PORT env) is byte-identical (H-1
 * canonical boot envelope for live-replay lanes).
 */
/*
 * T-MIG-022 replay boot wrapper — harness-owned serving envelope.
 *
 * WHY: `bun apps/api/src/index.ts` auto-serves the Hono default export via
 * Bun's implicit Bun.serve() with DEFAULT options — including the 10s
 * request idleTimeout. The F-5 realdata listing case streams a 581KB body
 * assembled from 1023 rows over neon-http on cold free-tier compute, which
 * exceeds that default (observed: "[Bun.serve]: request timed out after 10
 * seconds" + ECONNRESET on the client). The frozen core was captured behind
 * Spring Boot's own server envelope; the replay harness equally owns THIS
 * envelope. The api module is imported (import.meta.main=false → no
 * auto-serve, per the module's own contract) and re-served VERBATIM with a
 * longer idleTimeout — zero api code is touched (verification-only fence).
 */
import app from "../../apps/api/src/index.ts";

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  idleTimeout: 255, // Bun max (seconds) — covers the 581KB listing on cold compute
  fetch: app.fetch,
});

console.log("wrapper: serving apps/api default export with idleTimeout=255");
