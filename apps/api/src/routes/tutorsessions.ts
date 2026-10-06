/**
 * Tutor session router — T-MIG-060 tranche 2. Path parity with the frozen
 * core (syllabai-core @ 6cad6ef), TutorSessionController.java @
 * /api/v1/tutor/sessions (spec §22, s140/s143):
 *
 *   POST   /           → 201 CreatedSessionView(sessionId, createdAt)
 *   GET    /           → 200 list of summaries (newest activity first, the
 *                        opening question as the DERIVED title, turn count,
 *                        recency stamps — transcript fetched on demand)
 *   GET    /latest     → 200 SessionView | 204 no-content (refresh
 *                        hydration, cross-device) — ORDER MATTERS: /latest
 *                        must not be captured by the {sessionId} path
 *                        variable (the controller's own comment :73)
 *   GET    /:sessionId → 200 SessionView (full transcript, seq-ordered)
 *   DELETE /:sessionId → 204; a foreign-or-unknown id 404s exactly like
 *                        every other session operation — never a signal
 *                        about what exists
 *
 * Route security: /api/v1/tutor/** falls under anyRequest().authenticated()
 * (SecurityConfig.java:91) — the authz shell runs FIRST and the router owns
 * its authz internally.
 *
 * Exception law: NotFoundError → 404 not_found (e.message verbatim — the
 * error names the type and the id, no existence signal);
 * path uuid mismatch → 400 bad_request "malformed request"
 * (MethodArgumentTypeMismatchException :167-170).
 */
import { Hono } from "hono";
import type { TutorModule } from "../services/tutor";
import { ArgumentError, ConflictError, NotFoundError } from "../services/tutor";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The shared error mapping for the session routes (the frozen handler). */
function mapSessionErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof ArgumentError) {
    return c.json(apiError(400, "bad_request", "malformed request"), 400);
  }
  return null;
}

export function createTutorSessionsRouter(module: TutorModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST / — TutorSessionController.create (:55-60) → 201 CreatedSessionView
  r.post("/", async (c) => {
    const auth = getAuth(c)!;
    try {
      const created = await module.sessionStore.create(auth.userId);
      return c.json({ sessionId: created.sessionId, createdAt: created.createdAt }, 201);
    } catch (e) {
      const mapped = mapSessionErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET / — TutorSessionController.list (:68-71): summaries only (s143)
  r.get("/", async (c) => {
    const auth = getAuth(c)!;
    try {
      const sessions = await module.sessionStore.list(auth.userId);
      return c.json(sessions, 200);
    } catch (e) {
      const mapped = mapSessionErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /latest — TutorSessionController.latest (:74-79): order matters,
  // /latest must not be captured by the {sessionId} path variable
  r.get("/latest", async (c) => {
    const auth = getAuth(c)!;
    try {
      const latest = await module.sessionStore.latest(auth.userId);
      return latest == null ? c.body(null, 204) : c.json(latest, 200);
    } catch (e) {
      const mapped = mapSessionErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /:sessionId — TutorSessionController.view (:81-85): the §22
  // retrieval; the caller's own transcript, seq-ordered
  r.get("/:sessionId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("sessionId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const view = await module.sessionStore.view(auth.userId, rawId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapSessionErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // DELETE /:sessionId — TutorSessionController.delete (:92-97): 204 on
  // success; foreign-or-unknown 404s like every other session operation
  r.delete("/:sessionId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("sessionId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      await module.sessionStore.delete(auth.userId, rawId);
      return c.body(null, 204);
    } catch (e) {
      const mapped = mapSessionErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}
