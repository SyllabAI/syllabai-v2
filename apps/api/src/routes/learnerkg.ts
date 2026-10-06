/**
 * Learner KG + smart-lesson router — T-MIG-079 (Wave-7 port band, r3a).
 * Path parity with the frozen core (syllabai-core @ 6cad6ef), both under
 * @RequestMapping("/api/v1/learners/me"):
 *
 *   LearnerStateController  @GetMapping("/knowledge-graph") (:178-183)
 *                           @RequestParam UUID rootId →
 *                           LearnerKnowledgeGraphService.graphFor
 *                           (:46-147 — the F-034 personalized read model)
 *   SmartLessonController   @GetMapping("/smart-lesson") (:28-38)
 *                           @RequestParam UUID rootId (declared FIRST),
 *                           @RequestParam UUID topicNodeId →
 *                           SmartLessonService.lessonFor (the deterministic
 *                           8-rung ladder — NO LLM in the loop, the t4 law)
 *
 * Route security (SecurityConfig parity): both paths fall under the frozen
 * anyRequest().authenticated() rule (SecurityConfig.java:87-91) — the router
 * owns its authz internally via the requireAuth gate (middleware/auth.ts
 * :100); anonymous callers get the Boot 401 shell body
 * {timestamp,status,error:"Unauthorized",path} (the captured
 * w4-knowledge-graph-unauthed-401 / w4-smart-lesson-unauthed-401; the shell
 * fires BEFORE any handler work or param parsing).
 *
 * Param law (Spring MVC parity, GlobalExceptionHandler.java):
 *   - missing required query param → 400 validation_failed
 *     "missing required parameter: {name}" (:185-190) — checked in SIGNATURE
 *     ORDER (rootId before topicNodeId, the Java declaration order; the
 *     captured w4-smart-lesson-missing-params-400 pins the rootId case
 *     verbatim, and the learnerme.ts :202-208 recommendations precedent
 *     established the shape);
 *   - malformed UUID → 400 bad_request "malformed request"
 *     (:167-170 MethodArgumentTypeMismatchException).
 *
 * Error envelopes (verbatim, the capture law):
 *   - smart-lesson topic outside the root subtree → 404 not_found
 *     "curriculum topic in this subject {id} not found"
 *     (SmartLessonService :189 NotFoundException; captured
 *     w4-smart-lesson-unknown-topic-404 — the hard-isolation law);
 *   - KG unknown root → 404 not_found "knowledge node {id} not found"
 *     (thrown by the tree read, the KnowledgeGraphService 404-first law).
 *
 * Reuse-not-redeclare — the services are this lane's own ports:
 *   learnerGraphFor (services/knowledge/graphs.ts :872 — the t1 F-034 port,
 *   fakeSql-pinned in test/knowledge/class-graph.test.ts);
 *   smartLessonFor  (services/learner/smart-lesson.ts :182 — the t4 port of
 *   the 934-line service, 13 pins in test/learner/smart-lesson.test.ts).
 * The wire schemas are pre-ratified in @syllabai/contracts (learner.ts
 * :440 learnerKnowledgeGraphViewSchema / :583 smartLessonViewSchema) — the
 * service views are wire-ready (asOf already the ISO instant, node keys
 * frozen-camelCase), so the route serializes by returning the view.
 *
 * Scope honesty: this router owns EXACTLY the two paths above. Every other
 * learner-me path falls through — state/course-stats = T-MIG-041's router,
 * agenda/flashcards/assignments/… = T-MIG-043's learnerme router (Hono
 * resolves per router; first-match-wins registration keeps every router
 * authoritative for its own paths), and anything unclaimed lands on the
 * app-level 404-after-auth fallback. The W5 teacher KG/coverage/analytics
 * band stays in the T-MIG-053 surfaces (routes are the hub lanes' per the
 * tranche doctrine).
 *
 * Determinism (ADR-031): both services derive `now` from the ONE injected
 * clock anchor per call; production keeps the fresh per-request clock, the
 * route threads an injected `now` factory (default () => new Date()).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  learnerGraphFor,
  KnowledgeNotFoundError,
  type ClassGraphDeps,
} from "../services/knowledge";
import { smartLessonFor, type SmartLessonDeps } from "../services/learner/smart-lesson";
import { NotFoundError, BadRequestError } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The router's two-service deps (structurally one {sql, clock} pair). */
export interface LearnerKgDeps {
  graph: ClassGraphDeps;
  lesson: SmartLessonDeps;
}

/**
 * The shared error mapping for the two routes (the frozen handler law):
 * the two 404 classes verbatim, the tolerant-parse 400 class — everything
 * else falls through to the app-level 500 boundary, never guessed here.
 */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  return null;
}

export function createLearnerKgRouter(deps: LearnerKgDeps): Hono {
  const r = new Hono();

  // GET /api/v1/learners/me/knowledge-graph?rootId= — LearnerStateController
  // :178-183 → LearnerKnowledgeGraphService.graphFor (F-034). One required
  // UUID param; the 404-first tree read owns the unknown-root law.
  r.get("/knowledge-graph", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const view = await learnerGraphFor(deps.graph, gate.userId, rawRootId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /api/v1/learners/me/smart-lesson?rootId=&topicNodeId= —
  // SmartLessonController :28-38 → SmartLessonService.lessonFor. TWO
  // required UUID params checked in signature order (rootId FIRST — the
  // captured w4-smart-lesson-missing-params-400 pins its message); the
  // service owns the hard-isolation 404 (a topic outside the subtree).
  r.get("/smart-lesson", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const rawTopicNodeId = c.req.query("topicNodeId");
    if (rawTopicNodeId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: topicNodeId"), 400);
    }
    if (!UUID_RE.test(rawTopicNodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const view = await smartLessonFor(deps.lesson, gate.userId, rawRootId, rawTopicNodeId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildLearnerRouters
 * shape (env → requireDatabaseUrl → createSql adapter; the structural SqlFn
 * keeps both services driver-agnostic through the T-MIG-014 dispatch). ONE
 * sql + ONE clock shared by the two services. `opts.now` injects the clock
 * (determinism law); production default is the fresh per-request clock.
 */
export function buildLearnerKgRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = {
    newId: () => crypto.randomUUID(),
    now: opts.now ?? (() => new Date()),
  };
  const shared = { sql, clock };
  return {
    learnerKgRoute: createLearnerKgRouter({ graph: shared, lesson: shared }),
  };
}
