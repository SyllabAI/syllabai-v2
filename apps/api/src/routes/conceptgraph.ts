/**
 * Teacher concept-graph router — T-MIG-082 tranche A (the wire-mounts band,
 * R0). Path parity with the frozen core (syllabai-core @ 6cad6ef):
 *
 *   TeacherConceptGraphController @RequestMapping("/api/v1/teacher/concept-graph")
 *     (TeacherConceptGraphController.java :58-96):
 *     POST /activate           the deterministic idempotent 4CH1 seed —
 *                              @ResponseStatus(HttpStatus.OK) → 200, NOT 201
 *                              (:68-69); re-running reuses every canonical
 *                              node and edge
 *     GET  /edges?rootId=      the graph-derived semantic edges within the
 *                              root's PART_OF subtree PLUS the misconception
 *                              sources that attach through family edges
 *                              (:92-94 widening); deterministic order:
 *                              relation, source code, target code; PART_OF
 *                              is excluded — the tree read model owns
 *                              curriculum structure
 *
 * Route security: /api/v1/teacher/** requires TEACHER or ADMIN — the
 * requireRole("TEACHER","ADMIN") gate answers BEFORE every handler body
 * (the classroom.ts :254 per-route gate); anonymous → Boot 401, student →
 * Boot 403.
 *
 * Param law (GET /edges): MISSING rootId → 400 validation_failed "missing
 * required parameter: rootId" (GlobalExceptionHandler :185-190, the 079
 * captured law shape); malformed rootId → 400 bad_request "malformed
 * request" (:167-170 MethodArgumentTypeMismatch parity).
 *
 * Error envelopes: unknown root → 404 (the service's KnowledgeNotFoundError,
 * message verbatim — SEE THE FILED DRIFT BELOW); seed identity conflicts →
 * 409 conflict (the frozen ConflictException — SeedConflictError is the
 * 053 lane's named twin, message verbatim).
 *
 * FILED MESSAGE DRIFT (register finding, 053 t2 tranche, NOT fixed here —
 * tranche A touches ZERO services): the frozen controller throws
 * NotFoundException("knowledge node", rootId) → wire "knowledge node {id}
 * not found" (NotFoundException.java :16-18 "%s %s not found"), while the
 * ported teacherConceptEdges throws "knowledge node not found: {id}"
 * (concept-edges.ts :99). No capture pins this 404 (the corpus exercises
 * none of the unmounted families — r4b + r1c Task-33 of record); the drift
 * is filed on the card for the review lane to rule (a one-word service
 * amendment or a capture-time normalization), never silently hacked at the
 * route layer.
 *
 * Reuse-not-redeclare: services/teacher/concept-seed.ts activateConceptGraph
 * + services/teacher/concept-edges.ts teacherConceptEdges (the 053 t2
 * ports) — consumed as-is.
 */
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { activateConceptGraph, SeedConflictError } from "../services/teacher/concept-seed";
import { teacherConceptEdges } from "../services/teacher/concept-edges";
import { KnowledgeNotFoundError, type KnowledgeDeps } from "../services/knowledge";
import type { SubmitClock } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type ConceptGraphDeps = KnowledgeDeps;

function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof SeedConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  console.error("[concept-graph] unhandled error:", e);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

export function createConceptGraphRouter(deps: ConceptGraphDeps): Hono {
  const r = new Hono();

  // POST /activate (:58-69) — deterministic, idempotent; 200 SeedSummary
  // (the @ResponseStatus(HttpStatus.OK) law — POST but NOT 201)
  r.post("/activate", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    try {
      return c.json(await activateConceptGraph(deps, gate.userId), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /edges?rootId= (:71-96) — the semantic read model
  r.get("/edges", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await teacherConceptEdges(deps, rawRootId), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  return r;
}

/**
 * Live factory — the real sql client; ONE clock (the seed's created_at
 * anchor + the provenance timestamps). `seams.now` overrides the wall clock
 * for determinism.
 */
export function buildConceptGraphRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock: SubmitClock = {
    newId: () => crypto.randomUUID(),
    now: seams.now ?? (() => new Date()),
  };
  const deps: ConceptGraphDeps = { sql, clock };
  return { deps, conceptGraphRoute: createConceptGraphRouter(deps) };
}
