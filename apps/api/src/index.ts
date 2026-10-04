/**
 * syllabai-v2 api — the TypeScript port target of the frozen Java core.
 *
 * Entry contract with the frozen world (docs/GOLDEN_MASTER.md):
 *   - Path parity: routes mirror the Java core's paths (e.g. /actuator/health,
 *     /api/auth/**) so recorded golden cases replay unchanged and the hub
 *     import can switch API base URL with zero path rewrites.
 *   - Fail fast: missing secrets abort boot (see src/env.ts) — inherited
 *     verbatim from the Java core's boot discipline.
 *
 * Deployment: Vercel (this module's default export is the fetch handler);
 * locally run `bun run dev:api` at the repo root.
 */
import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { authRoute } from "./routes/auth";

const app = new Hono();

app.route("/", healthRoute);
app.route("/api/auth", authRoute);

/**
 * Global error shape — keep it boring and stable; golden-master diffs will
 * compare it. Java core returns RFC-ish problem JSON on failures; port the
 * exact shapes per-module WITH the module (T-MIG-0xx tasks), not speculatively.
 */
app.onError((err, c) => {
  console.error("[api] unhandled error:", err);
  return c.json({ status: 500, error: "Internal Server Error" }, 500);
});

export default app;

// Local dev server (bun). On Vercel, the default export above is the entry.
if (typeof Bun !== "undefined") {
  const port = Number(process.env.PORT ?? 8080);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`[syllabai-v2 api] listening on :${port}`);
}
