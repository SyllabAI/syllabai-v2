/**
 * LLM chain-observability route — path parity with the frozen Java core
 * (T-MIG-090; verified 2026-10-09):
 *   LlmAdminController  @RequestMapping("/api/v1/admin/llm")
 *     GET /chain-health   (LlmAdminController.java:30-36)
 *
 * MOUNT — the exact proposed line for apps/api/src/index.ts (NOT applied by
 * this card — index.ts is out of fence; precedent: the T-MIG-010/020/060
 * out-of-fence mount disclosures):
 *     app.route("/api/v1/admin/llm", llmadmin.llmAdminRoute);
 *
 * Route security: /api/v1/admin/** requires ADMIN (SecurityConfig rule +
 * @PreAuthorize("hasRole('ADMIN')") deep-audit M5 defense in depth) —
 * anonymous callers get the Boot 401 body, authenticated non-admin callers
 * the Boot 403 body (requireRole). The gate runs BEFORE the handler body.
 *
 * Response shape (chainHealth() :31-35): a LinkedHashMap with exactly two
 * keys — "chainAvailable" (chain.available(): any member available) and
 * "providers" (memberHealth(): per-provider ADR-023 snapshots keyed by the
 * §26.1 chain order groq → gemini → openrouter). The snapshot NEVER carries
 * credential material — API keys, authorization headers, prompts or learner
 * data (the frozen LlmAdminControllerTest.snapshotsNeverCarrySecrets law).
 *
 * The chain reads the same config seam the existing v2 LLM services gate
 * their generation behind (the dormant LlmProvider port posture) — the
 * §26.1 provider-chain config projection (SYLLABAI_LLM_*, the syllabai.llm.*
 * relaxed-binding mirror) with the frozen zero-key boot semantics: with no
 * keys the application boots, the report shows what is missing, and
 * chainAvailable is honestly false.
 */
import { Hono } from "hono";
import { buildLlmChain, type FailoverLlmChain } from "../services/llmchain";
import { requireRole } from "../middleware/auth";
import {
  chainHealthReportSchema,
  type ChainHealthReport,
} from "@syllabai/contracts";

/** LlmAdminController.chainHealth() — the two-key report, schema-pinned. */
function chainHealth(chain: FailoverLlmChain): ChainHealthReport {
  const report = {
    chainAvailable: chain.available(),
    providers: chain.memberHealth(),
  };
  return chainHealthReportSchema.parse(report);
}

/**
 * LLM admin router — LlmAdminController. Mounted at "/api/v1/admin/llm".
 * ADMIN only.
 */
export function createLlmAdminRouter(chain: FailoverLlmChain): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/admin/** + @PreAuthorize
  // parity): the gate answers before every handler below.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /chain-health (:30-36) — mode-free aggregate + per-provider
  // ADR-023 fields (enabled/configured/healthy/coolingDown/requestsToday/
  // dailyBudget/remainingLocalBudget/lastFailureClass/effectiveModel).
  r.get("/chain-health", (c) => c.json(chainHealth(chain)));

  return r;
}

/**
 * Module + routers composition for the app root (the index.ts mount lane):
 *     const llmadmin = buildLlmAdminRouters();
 *     app.route("/api/v1/admin/llm", llmadmin.llmAdminRoute);
 */
export function buildLlmAdminRouters(env: Record<string, string | undefined> = process.env) {
  const chain = buildLlmChain(env);
  return { chain, llmAdminRoute: createLlmAdminRouter(chain) };
}
