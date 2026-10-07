/**
 * Global knowledge-tree router — T-MIG-082 tranche-1 (r4b mount band).
 * Path parity with the frozen core (syllabai-core @ 6cad6ef):
 *
 *   KnowledgeController @RequestMapping("/api/v1/knowledge") (:17-46) —
 *   4 GETs: "/nodes/{id}" (:32-34 → NodeView.flat(graph.node(id))),
 *   "/nodes/{id}/tree" (:36-41, the includeMisconceptions boolean fold),
 *   "/nodes/{id}/prerequisites" (:43-45), "/nodes/{id}/misconceptions"
 *   (:47-49). Read-only over the V2 knowledge spine (Master Spec §22).
 *
 * Route security (SecurityConfig parity): all four paths fall under the
 * frozen anyRequest().authenticated() rule — the router owns its authz
 * internally via the requireAuth gate (middleware/auth.ts :100); anonymous
 * callers get the Boot 401 shell body {timestamp,status,error:"Unauthorized",
 * path} BEFORE any handler work (the learnerkg.ts T-MIG-079 precedent).
 *
 * Param laws (Spring MVC parity, GlobalExceptionHandler.java):
 *   - {id} is a @PathVariable UUID → malformed UUID → 400 bad_request
 *     "malformed request" (:167-170 MethodArgumentTypeMismatchException —
 *     the UUID_RE law, checked BEFORE any sql);
 *   - includeMisconceptions is @RequestParam(defaultValue = "false")
 *     boolean: absent → false; Spring's StringToBooleanConverter accepts
 *     true/on/yes/1 and false/off/no/0 CASE-INSENSITIVE; anything else is
 *     a ConversionFailedException surfaced as
 *     MethodArgumentTypeMismatchException → 400 bad_request "malformed
 *     request" (disclosed conversion-set fidelity; only true/false are
 *     hub-emitted today).
 *
 * Error envelopes (the frozen handler law): the service's
 * KnowledgeNotFoundError → 404 not_found "knowledge node {id} not found"
 * (the 404-first node law, KnowledgeGraphService node reads); everything
 * else falls through to the app-level 500 boundary, never guessed here.
 *
 * Reuse-not-redeclare — the services are the T-MIG-053 tranche-1 ports
 * (services/knowledge/index.ts, fakeSql-pinned in test/knowledge/):
 * knowledgeNode / knowledgeTree / knowledgePrerequisites /
 * knowledgeMisconceptions. The 30s TTL snapshot cache is wire-invisible
 * and not ported (disclosed in the service header). The views serialize
 * verbatim (the NodeView flat shape, contracts knowledge.ts nodeViewSchema).
 *
 * Scope honesty: this router owns EXACTLY the four paths above. The
 * teacher/class-scoped KG and coverage families are the T-MIG-082
 * teacher-kg router (separate mount, the M5 TEACHER/ADMIN shell there).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  knowledgeMisconceptions,
  knowledgeNode,
  knowledgePrerequisites,
  knowledgeTree,
  KnowledgeNotFoundError,
  type KnowledgeDeps,
} from "../services/knowledge";
import type { SubmitClock } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Spring StringToBooleanConverter sets (header law). */
const TRUE_WORDS = new Set(["true", "on", "yes", "1"]);
const FALSE_WORDS = new Set(["false", "off", "no", "0"]);

/** The includeMisconceptions conversion law — absent means the default false. */
function parseIncludeMisconceptions(
  raw: string | undefined,
): { ok: true; value: boolean } | { ok: false } {
  if (raw === undefined) return { ok: true, value: false }; // defaultValue = "false"
  const w = raw.toLowerCase();
  if (TRUE_WORDS.has(w)) return { ok: true, value: true };
  if (FALSE_WORDS.has(w)) return { ok: true, value: false };
  return { ok: false }; // conversion failure — the caller renders the 400
}

export function createKnowledgeRouter(deps: KnowledgeDeps): Hono {
  const r = new Hono();

  // GET /nodes/{id} (:32-34) — the flat node read; 404-first.
  r.get("/nodes/:id", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await knowledgeNode(deps, id), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /nodes/{id}/tree (:36-41) — the PART_OF subtree with the optional
  // misconception fold; the boolean conversion law (header).
  r.get("/nodes/:id/tree", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const include = parseIncludeMisconceptions(c.req.query("includeMisconceptions"));
    if (!include.ok) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(
        await knowledgeTree(deps, id, include.value),
        200,
      );
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /nodes/{id}/prerequisites (:43-45) — the closure chain, depth-first.
  r.get("/nodes/:id/prerequisites", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await knowledgePrerequisites(deps, id), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /nodes/{id}/misconceptions (:47-49) — the MISCONCEPTION_OF family.
  r.get("/nodes/:id/misconceptions", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await knowledgeMisconceptions(deps, id), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildLearnerKgRouters
 * shape (env → requireDatabaseUrl → createSql adapter). `opts.now` injects
 * the clock (determinism law); production default is the fresh per-request
 * clock (the knowledge services' clock use is the coverage module's — the
 * tree reads never fabricate instants).
 */
export function buildKnowledgeRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
): { knowledgeRoute: Hono } {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock: SubmitClock = {
    newId: () => crypto.randomUUID(),
    now: opts.now ?? (() => new Date()),
  };
  return { knowledgeRoute: createKnowledgeRouter({ sql, clock }) };
}
