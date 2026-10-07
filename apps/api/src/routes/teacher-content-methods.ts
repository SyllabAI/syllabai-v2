/**
 * ContentController teacher-methods router — the T-MIG-088 mount slice of
 * the r4b mount band (operator mount order trace 1a114e45f09db04d; frozen
 * sources @ 6cad6ef).
 *
 * OWNS EXACTLY (the r4b census's unmounted ContentController paths the
 * T-MIG-020 read router never claimed):
 *   GET /api/v1/teacher/content/enumerate
 *   GET /api/v1/teacher/content/enumerate/structured
 *   GET /api/v1/teacher/content/fetch
 *
 * OWNS NOTHING ELSE on the base: the T-MIG-020 router (routes/content) is
 * mounted first at "/api/v1/teacher/content" and keeps every path it
 * already serves — including the §10 topic-mapping pair this card also
 * tracks:
 *   GET  /api/v1/teacher/content/questions/{questionId}/topics — ALREADY
 *        200-backed at the wire by the T-MIG-020 router (service seam:
 *        ContentReviewService.questionTopicRows, the frozen
 *        ContentController.java:763-797 port with the V20 anchor
 *        synthesis). This lane re-verified the seam (pins in
 *        test/teacher/content-methods-routes.test.ts); NO new route here —
 *        a second handler would only risk shadowing.
 *   POST /api/v1/teacher/content/questions/{questionId}/topics — ALREADY
 *        mounted as the honest 501 by the T-MIG-020 router (the mapping
 *        WRITE — ContentReviewService.java:797-800 over question_topics +
 *        questions.primary_topic_node_id — exists NOWHERE in the services
 *        tree: review-repos.ts is read-only, and the only
 *        `insert into question_topics` in the tree (services/sme) is the
 *        SME package-ingestion path, a different law). Contracts exist
 *        (topicMappingRequestSchema/topicMappingResultSchema, T-MIG-006);
 *        the write service does not. Inventing it here would fabricate
 *        behaviour — the existing 501 stands; its owning-task pointer is
 *        T-MIG-023's filing and stays untouched.
 *
 * WHY THE THREE GETs ARE HONEST 501s (not fabricated 200s): the frozen
 * ContentController's enumerate/enumerate-structured/fetch wire truth is
 * UN-CAPTURED (the 178-case golden corpus exercises none of this family —
 * r4b census; the frozen core repo is not reachable from this lane), the
 * hub emits NO caller for any of the three paths (api.ts has zero
 * enumerate/fetch wrappers at HEAD and in history — the census's "3 refs"
 * were prose comments, verified by grep), and no service logic, repository
 * query, or contracts schema for them exists ANYWHERE in the tree. There is
 * nothing to decompose without inventing behaviour. Per the honest-501
 * discipline (routes/content header; T-MIG-010 precedent) each path answers
 * 501 {status, error:"not_implemented", message:"not yet ported — owned by
 * <task>", timestamp} — never a fabricated 200, never a silent drop. When
 * the capture pass lands the frozen wire truth, these seams are replaced by
 * the real mounts INSIDE THIS MODULE (the sibling routers stay untouched).
 *
 * Route security (SecurityConfig parity): /api/v1/teacher/** →
 * hasAnyRole('TEACHER','ADMIN') (:87) — the shell answers the Boot 401/403
 * bodies BEFORE every handler, including the 501s (the T-MIG-020 router
 * shell pattern; its shell runs first on the shared base and falls through
 * for teachers).
 *
 * Mount proposal (operator integrates index.ts centrally — this file does
 * NOT touch it):
 *   import { buildTeacherContentMethodsRouters } from "./routes/teacher-content-methods";
 *   const contentMethods = buildTeacherContentMethodsRouters();
 *   app.route("/api/v1/teacher/content", contentMethods.teacherContentMethodsRoute);
 * placed AFTER the T-MIG-020 content mount. The three owned paths are
 * static (no params), so the mount cannot shadow any T-MIG-020 handler.
 */
import { Hono, type Context } from "hono";
import { apiError } from "../services/identity/errors";
import { requireRole } from "../middleware/auth";

/** Honest 501 for surfaces whose wire truth is not yet captured. */
function notImplemented(c: Context, owningTask: string): Response {
  return c.json(
    apiError(501, "not_implemented", `not yet ported — owned by ${owningTask}`),
    501,
  );
}

const CONTENT_ENUMERATE_TASK =
  "T-MIG-088 capture pass (frozen ContentController.java enumerate/enumerate-structured/fetch — wire truth un-captured, no service seam in the tree; replaced in this module when captured)";

/**
 * ContentController teacher-methods router — mounted at
 * "/api/v1/teacher/content" AFTER the T-MIG-020 read router. TEACHER/ADMIN
 * shell (SecurityConfig :87 parity). Static paths only; no service deps
 * (every owned path is the honest seam — see the header).
 */
export function createTeacherContentMethodsRouter(): Hono {
  const r = new Hono();

  // Authz shell FIRST (the T-MIG-020 router pattern): the gate answers the
  // Boot 401/403 bodies before every handler below, including the 501s.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /enumerate — frozen ContentController (un-captured wire truth) → 501
  r.get("/enumerate", (c) => notImplemented(c, CONTENT_ENUMERATE_TASK));

  // GET /enumerate/structured — frozen ContentController (un-captured) → 501
  r.get("/enumerate/structured", (c) => notImplemented(c, CONTENT_ENUMERATE_TASK));

  // GET /fetch — frozen ContentController (un-captured) → 501
  r.get("/fetch", (c) => notImplemented(c, CONTENT_ENUMERATE_TASK));

  return r;
}

/**
 * Composition root for the app root's central mount (the
 * buildTeacherCoverageRouters shape). Deliberately env-free: the module
 * owns no persistence path (every handler is the disclosed 501), so a
 * DATABASE_URL is not required to construct it.
 */
export function buildTeacherContentMethodsRouters() {
  return {
    teacherContentMethodsRoute: createTeacherContentMethodsRouter(),
  };
}
