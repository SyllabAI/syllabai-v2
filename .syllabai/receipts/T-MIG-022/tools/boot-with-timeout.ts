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
import app from "../../../../apps/api/src/index.ts";

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  idleTimeout: 255, // Bun max (seconds) — covers the 581KB listing on cold compute
  fetch: app.fetch,
});

console.log("wrapper: serving apps/api default export with idleTimeout=255");
