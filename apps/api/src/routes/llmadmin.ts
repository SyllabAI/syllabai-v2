/**
 * LLM chain-observability route — path parity with the frozen Java core
 * (T-MIG-090; first-hand verified 2026-10-07):
 *   LlmAdminController  @RequestMapping("/api/v1/admin/llm")
 *     GET /chain-health   (LlmAdminController.java, frozen @ 6cad6ef)
 *
 * MOUNT: applied in apps/api/src/index.ts at "/api/v1/admin/llm" — the
 * mount lines are EXPLICITLY in the 090 card scope.allowed (unlike the
 * T-MIG-010/020/060/033 out-of-fence disclosures; disclosed in the PR body
 * regardless, per the band discipline).
 *
 * Route security: /api/v1/admin/** requires ADMIN (SecurityConfig rule +
 * @PreAuthorize("hasRole('ADMIN')") deep-audit M5 defense in depth) —
 * anonymous callers get the Boot 401 body, authenticated non-admin callers
 * the Boot 403 body (requireRole). The gate runs BEFORE the handler body.
 * Pins of record: golden-captures/t-mig-090/ legs 01-03.
 *
 * Response shape (chainHealth()): a LinkedHashMap with exactly two keys —
 * "chainAvailable" (chain.available(): any member available) and
 * "providers" (memberHealth(): per-provider ADR-023 snapshots keyed by the
 * §26.1 chain order groq → gemini → openrouter). The snapshot NEVER
 * carries credential material — API keys, authorization headers, prompts
 * or learner data (the frozen LlmAdminControllerTest.snapshotsNeverCarrySecrets
 * law; re-pinned against the r4b leg-04 golden).
 *
 * CONFIG: the three-layer projection of record (R0-arbitration/ruling4 §2)
 * — SYLLABAI_LLM_* relaxed-binding env > the frozen application.yml
 * @ 6cad6ef layer (capture-corroborated: groq openai/gpt-oss-120b via
 * SYLLABAI_GROQ_MODEL, gemini gemini-3.6-flash, openrouter
 * nvidia/nemotron-3-super-120b-a12b:free, chain 60/60/3/1000, enabled
 * bridges default true) > the record compactor targets. The ZERO-KEY boot
 * of record (ruling4 §3): with no keys the application boots, the report
 * shows what is missing, and chainAvailable is honestly false.
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

  // GET /chain-health — mode-free aggregate + per-provider ADR-023 fields
  // in the captured key order (the leg-04 golden is the acceptance gate).
  r.get("/chain-health", (c) => c.json(chainHealth(chain)));

  return r;
}

/**
 * Module + routers composition for the app root (the index.ts mount lane):
 *     const llmadmin = buildLlmAdminRouters();
 *     app.route("/api/v1/admin/llm", llmadmin.llmAdminRoute);
 */
export function buildLlmAdminRouters(
  env: Record<string, string | undefined> = process.env,
  shared?: FailoverLlmChain,
) {
  // the composition root passes the ONE chain of record (health counters,
  // cooldowns and budgets are per-chain state — five separate chains would
  // fragment the observability the report exists for)
  const chain = shared ?? buildLlmChain(env);
  return { chain, llmAdminRoute: createLlmAdminRouter(chain) };
}
