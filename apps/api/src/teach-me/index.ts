/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/index.ts
 *
 * The Teach-Me router — mounted once at "/api/v1/learners/me" in src/index.ts
 * (the T-TEACH-012 one-mount-line precedent for additive mounts):
 *   POST /teach-me/sessions            create (flags + G1–G4 + quota + objectives LLM call 1)
 *   POST /teach-me/sessions/:id/message  word floor → overlap → combined judge call
 *   POST /teach-me/sessions/:id/end    async review generation (LLM call N)
 *   GET  /teach-me/sessions?course=    history (today/earlier, course, status)
 *   GET  /teach-me/sessions/:id        permalink payload (session + transcript + review)
 *
 * This file is HTTP mapping ONLY — every law lives in service.ts (ADR-040
 * D1–D4), every read/write in sql.ts, every constant in config.ts. The
 * composition root injects THE ONE LLM CHAIN OF RECORD and the real store.
 */
import { Hono, type Context } from "hono";
import { ZodError } from "zod";
import { getAuth } from "../middleware/auth";
import { createTeachMeService, TeachMeFailClosed, TeachMeNotFound, TeachMeProviderUnavailable } from "./service";
import type { TeachMeChain, TeachMeStore } from "./types";

/** Typed error → HTTP status (the contract's closed error vocabulary). */
const statusFor = (code: TeachMeFailClosed["code"]): 403 | 409 =>
  code === "NOT_OWNER" ? 403 : 409;

const userIdOf = (c: Context): string | null => getAuth(c)?.userId ?? null;

export function buildTeachMeRouters(deps: { chain: TeachMeChain; store: TeachMeStore }) {
  const service = createTeachMeService({
    store: deps.store,
    chain: deps.chain,
    clock: { now: () => new Date() },
    idgen: { uuid: () => crypto.randomUUID() },
  });

  const r = new Hono();

  r.onError((err, c) => {
    if (err instanceof TeachMeFailClosed) {
      return c.json({ error: err.code, message: err.message }, statusFor(err.code));
    }
    if (err instanceof TeachMeNotFound) {
      return c.json({ error: "NOT_FOUND", message: err.message }, 404);
    }
    if (err instanceof TeachMeProviderUnavailable) {
      return c.json({ error: "PROVIDER_UNAVAILABLE", message: err.message }, 503);
    }
    if (err instanceof ZodError) {
      return c.json({ error: "INVALID_REQUEST", message: "request body failed the teach-me contract" }, 400);
    }
    throw err;
  });

  const auth = userIdOf;

  r.post("/teach-me/sessions", async (c) => {
    const userId = auth(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED", message: "bearer identity required" }, 401);
    const body = await c.req.json();
    const out = await service.createSession(userId, body);
    return c.json(out);
  });

  r.post("/teach-me/sessions/:id/message", async (c) => {
    const userId = auth(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED", message: "bearer identity required" }, 401);
    const body = await c.req.json();
    const out = await service.postMessage(userId, c.req.param("id"), body);
    return c.json(out);
  });

  r.post("/teach-me/sessions/:id/end", async (c) => {
    const userId = auth(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED", message: "bearer identity required" }, 401);
    const out = await service.endSession(userId, c.req.param("id"));
    return c.json(out);
  });

  r.get("/teach-me/sessions", async (c) => {
    const userId = auth(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED", message: "bearer identity required" }, 401);
    const course = c.req.query("course") ?? null;
    return c.json(await service.listSessions(userId, course));
  });

  r.get("/teach-me/sessions/:id", async (c) => {
    const userId = auth(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED", message: "bearer identity required" }, 401);
    return c.json(await service.getSession(userId, c.req.param("id")));
  });

  return { teachMeRoute: r };
}
