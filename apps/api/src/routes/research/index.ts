/**
 * T-MIG-062 — research calibration router (frozen law @ 6cad6ef, syllabai-core).
 * Path parity with the frozen core: ResearchCalibrationController
 * @RequestMapping("/api/v1/research/learner-model") GET /calibration →
 * CalibrationReport (:34-39).
 *
 * Route security (SecurityConfig.java:88-90): /api/v1/research/** falls
 * under hasAnyRole("TEACHER", "ADMIN") — "research aggregates span ALL
 * learners (S2/ADR-033) — teacher+ here, re-gated at the controller method
 * level as well". The frozen method-level @PreAuthorize re-gate collapses
 * into this one shell check in the port: same 401 unauthenticated (Boot
 * body) / 403 wrong-role outcomes, and there is no second layer to bypass
 * in a single-router mount. The captured w3/w4 unauthed-401 envelope law
 * applies (bootErrorBody).
 *
 * Query binding: nodeId @RequestParam(required = false) UUID — an
 * unparseable value raises MethodArgumentTypeMismatchException → the
 * shared :167-172 handler → 400 bad_request "malformed request" (the FIXED
 * body — the same law the selfmark path-variable pins carry). A present
 * and parseable value is canonicalized to lowercase (UUID.fromString
 * accepts mixed case; UUID.toString() emits lowercase — the service
 * compares payload.nodeId with STRICT string equality against that
 * canonical form).
 *
 * The response is the CalibrationReport wire (contracts/research.ts —
 * LearnerModelCalibrationService's records :289-385): pooled Brier/ECE +
 * ten equal-width bins, the seven per-format segments and six per-gap
 * segments in fixed render order, k-anonymity suppression rendered as
 * null statistics with visible counts (ADR-036 binds the port).
 */
import { Hono } from "hono";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { apiError } from "../../services/identity/errors";
import { requireRole } from "../../middleware/auth";
import { buildResearchModule, type ResearchModule } from "../../services/research";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function createResearchRouter(module: ResearchModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:88-90 parity — hasAnyRole
  // TEACHER/ADMIN; the method-level @PreAuthorize re-gate is collapsed here,
  // same outcomes). Runs before ANY query touches the module.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /learner-model/calibration — ResearchCalibrationController.calibration
  r.get("/learner-model/calibration", async (c) => {
    const rawNodeId = c.req.query("nodeId");
    let nodeId: string | null = null;
    if (rawNodeId !== undefined) {
      if (!UUID_RE.test(rawNodeId)) {
        // @RequestParam UUID unparseable → MethodArgumentTypeMismatchException
        // → the :167-172 handler's FIXED "malformed request" body
        return c.json(apiError(400, "bad_request", "malformed request"), 400);
      }
      nodeId = rawNodeId.toLowerCase(); // UUID.fromString/toString canonical form
    }
    const report = await module.calibrationReport(nodeId);
    return c.json(report, 200);
  });

  return r;
}

export function buildResearchRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildResearchModule(sql);
  return { module, researchRoute: createResearchRouter(module) };
}
