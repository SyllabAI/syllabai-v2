/**
 * syllabai-v2 api — the TypeScript port target of the frozen Java core.
 *
 * Entry contract with the frozen world (docs/GOLDEN_MASTER.md):
 *   - Path parity: routes mirror the Java core's paths so recorded golden
 *     cases replay unchanged and the hub import can switch API base URL with
 *     zero path rewrites. T-MIG-010 re-points the identity mount to the
 *     core's real surface /api/v1/auth/** (previously /api/auth) per the R0
 *     ruling recorded in the PR #2 review (note 3) and R6's orientation
 *     finding Q4. The legacy /api/auth mount is kept as a deprecated 501
 *     alias so the seed tests stay green unmodified; it is removed by the
 *     hub re-point task (T-MIG-011).
 *   - Fail fast: missing secrets abort boot (see src/env.ts and the identity
 *     runtime's JwtService boot gate) — inherited verbatim from the Java
 *     core's boot discipline.
 *
 * Composition lives in src/routes/auth/index.ts (createAuthApp) — T-MIG-010's
 * fence; this entry stays a thin delegating shell.
 *
 * Deployment: Vercel (this module's default export is the fetch handler);
 * locally run `bun run dev:api` at the repo root.
 */
import { createAuthApp } from "./routes/auth";

const app = createAuthApp();

export default app;

// Local dev server (bun). On Vercel, the default export above is the entry.
if (typeof Bun !== "undefined") {
  const port = Number(process.env.PORT ?? 8080);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`[syllabai-v2 api] listening on :${port}`);
}
