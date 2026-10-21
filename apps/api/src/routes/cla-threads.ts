/**
 * CLA thread router — DC-6 phase 3, the sync tier
 * (docs/DC6-CLA-SYNC-TIER-PLAN.md §3). V2-NATIVE additive family: there is
 * NO frozen-core controller to hold path parity against — the surface
 * vocabulary mirrors the §22 sessions family where the shapes agree
 * (create/list/view/delete + the ownership oracle), with PUT /:id as the
 * mirror write (the full-state sync law; the tutor family appends inside
 * its ask route, which is NOT portable here — the sync tier's gate/error
 * legs are client renderings only the client can persist).
 *
 *   POST   /           → 201 ClaThreadCreated(threadId, createdAt)
 *   GET    /           → 200 ClaThreadSummary[] (newest active first;
 *                        optional ?surface= &questionId= filters)
 *   GET    /:threadId  → 200 ClaThreadView (full transcript, seq-ordered)
 *   PUT    /:threadId  → 200 ClaThreadSynced(threadId, lastActiveAt) — the
 *                        full-state mirror write
 *   DELETE /:threadId  → 204 (no client call site v1 — plan §5.6)
 *
 * Route security: learner surface under /api/v1/learners/me — the authz
 * shell runs FIRST (the tutorsessions.ts:52 pattern) and the router owns
 * its authz internally. Students sync on their own identity; a foreign
 * thread id 404s exactly like an unknown one — never a signal about what
 * exists.
 *
 * Exception law (the sessions-family mapping, plan §3): NotFoundError →
 * 404 not_found (e.message verbatim); ConflictError → 409 conflict;
 * ArgumentError → 400 bad_request "malformed request". A body that fails
 * its contracts schema answers the SAME 400 "malformed request" — this
 * family is NOT the frozen cla/ask two-envelope law (that law pins the
 * byte-frozen route; plan §8 keeps that file untouched).
 */
import { Hono } from "hono";
import {
  claAssistantThreadCreateSchema,
  claAssistantThreadSyncSchema,
  claAssistantThreadViewSchema,
  claThreadCreateSchema,
  claThreadSyncSchema,
  claThreadViewSchema,
} from "@syllabai/contracts";
import type { ClaThreadStore } from "../services/cla/threads-store";
import { buildClaThreadStore } from "../services/cla/threads-store";
import { ArgumentError, ConflictError, NotFoundError } from "../services/tutor";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { defaultClock } from "../services/selfmark";
import { requireAuth, getAuth } from "../middleware/auth";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The shared error mapping (the sessions-family handler shape). */
function mapThreadErrors(
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

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createClaThreadsRouter(store: ClaThreadStore): Hono {
  const r = new Hono();

  // authz shell FIRST (the tutorsessions.ts:52 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST / — the lazy-bind moment → 201 ClaThreadCreated. The surface branch
  // is the phase-3b slit opened (plan §3): the ROW's surface law picks the
  // schema — 'assistant' admits NO questionId/questionNumber (the DB scope
  // CHECK's mirror, .strict()), 'question_cla' keeps the phase-3 law
  // byte-identical.
  r.post("/", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    const rawSurface = (body as { surface?: unknown } | undefined)?.surface;
    try {
      if (rawSurface === "assistant") {
        const parsed = claAssistantThreadCreateSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(apiError(400, "bad_request", "malformed request"), 400);
        }
        const view = await store.create(auth.userId, {
          surface: "assistant",
          questionId: null,
          questionNumber: null,
          courseSlug: parsed.data.courseSlug,
          title: parsed.data.title,
        });
        // the wire law: the view validates against the assistant contract —
        // a defensive parse (never fires; the store constructs the shape)
        const wire = claAssistantThreadViewSchema.parse(view);
        return c.json({ threadId: wire.threadId, createdAt: wire.createdAt }, 201);
      }
      const parsed = claThreadCreateSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(apiError(400, "bad_request", "malformed request"), 400);
      }
      const view = await store.create(auth.userId, parsed.data);
      // the wire law: the view validates against the ratified contract —
      // a defensive parse (never fires; the store constructs the shape)
      const wire = claThreadViewSchema.parse(view);
      return c.json(
        { threadId: wire.threadId, createdAt: wire.createdAt },
        201,
      );
    } catch (e) {
      const mapped = mapThreadErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET / — summaries only (the s143 discipline), newest active first
  r.get("/", async (c) => {
    const auth = getAuth(c)!;
    const surface = c.req.query("surface");
    const questionId = c.req.query("questionId");
    if (surface != null && surface.length > 20) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    if (questionId != null && questionId.length > 120) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const summaries = await store.list(auth.userId, { surface, questionId });
      return c.json(summaries, 200);
    } catch (e) {
      const mapped = mapThreadErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /:threadId — the §22 retrieval: the caller's own transcript,
  // seq-ordered. The ROW's surface picks the view schema (plan §3): a
  // question row can never parse as an assistant view and vice versa.
  r.get("/:threadId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("threadId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const view = await store.view(auth.userId, rawId);
      const wire =
        view.surface === "assistant"
          ? claAssistantThreadViewSchema.parse(view)
          : claThreadViewSchema.parse(view);
      return c.json(wire, 200);
    } catch (e) {
      const mapped = mapThreadErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT /:threadId — the full-state mirror write (plan §3). The ROW's
  // surface law is read BEFORE the body parse (surfaceOf — the oracle law
  // fires first): an assistant row admits ONLY the assistant sync schema,
  // a question row ONLY the phase-3 schema — the caller never picks.
  r.put("/:threadId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("threadId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const body = await readJsonBody(c);
    try {
      const surface = await store.surfaceOf(auth.userId, rawId);
      if (surface === "assistant") {
        const parsed = claAssistantThreadSyncSchema.safeParse(body);
        if (!parsed.success) {
          return c.json(apiError(400, "bad_request", "malformed request"), 400);
        }
        const synced = await store.sync(auth.userId, rawId, {
          title: parsed.data.title,
          questionNumber: null,
          courseSlug: parsed.data.courseSlug,
          messages: parsed.data.messages,
        });
        return c.json(synced, 200);
      }
      const parsed = claThreadSyncSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(apiError(400, "bad_request", "malformed request"), 400);
      }
      const synced = await store.sync(auth.userId, rawId, parsed.data);
      return c.json(synced, 200);
    } catch (e) {
      const mapped = mapThreadErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // DELETE /:threadId — 204 on success; foreign-or-unknown 404 like every
  // other thread operation
  r.delete("/:threadId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("threadId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      await store.delete(auth.userId, rawId);
      return c.body(null, 204);
    } catch (e) {
      const mapped = mapThreadErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * buildClaThreadsRouters — the phase-3 composition root (the
 * buildClaRouters shape: requireDatabaseUrl + createSql + the store over
 * the deterministic defaultClock). Kept HERE so routes/cla.ts stays
 * byte-untouched (plan §8) and index.ts rides the one-liner law.
 */
export function buildClaThreadsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const store = buildClaThreadStore(sql, defaultClock);
  return {
    claThreadsRoute: createClaThreadsRouter(store),
  };
}
