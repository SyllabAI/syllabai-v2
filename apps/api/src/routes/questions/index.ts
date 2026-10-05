/**
 * Questions read router — path parity with the frozen core (T-MIG-031
 * tranche 2): QuestionController @RequestMapping("/api/v1/questions")
 * (syllabai-core @ 6cad6ef), five @GetMapping surfaces:
 *
 *   GET  /api/v1/questions                list(:39-51) — optional topicNodeId |
 *                                          rootId (precedence topicNodeId →
 *                                          rootId-subtree → all-active)
 *   GET  /api/v1/questions/families       families(:60-70) — same scoping,
 *                                          whole-question reassembly
 *   GET  /api/v1/questions/topics         topics(:79-82) — taxonomy, unknown
 *                                          root 404s inside the service
 *   GET  /api/v1/questions/{id}           get(:84-88) — 404 NotFoundException
 *                                          ("question", id) when unservable
 *   GET  /api/v1/questions/{id}/mark-scheme  markScheme(:97-102) — 200 reveal
 *                                          | 204 withheld (policy law)
 *
 * Route security: /api/v1/questions/** falls under anyRequest().
 * authenticated() (SecurityConfig.java:91 — NO role-specific matchers for
 * this prefix; any authenticated user lists/views, matching the captured
 * unauthed-401/student-200 pairs) — the authz shell answers before any
 * handler body.
 *
 * Parameter binding law (Spring parity, same as routes/curriculum +
 * routes/assessment):
 *   - @RequestParam UUID (topicNodeId/rootId): conversion precedes
 *     everything — an unparseable value fails Spring's UUID conversion →
 *     400 bad_request "malformed request"
 *     (MethodArgumentTypeMismatchException :167-170 parity; the zod .uuid()
 *     rejects the same set — a failed safeParse IS the conversion failure).
 *     Only DECLARED parameters bind — Spring ignores undeclared query
 *     params, so /topics parses rootId only (questionsListParamsSchema.
 *     pick), never topicNodeId.
 *   - @PathVariable UUID: unparseable → 400 bad_request "malformed request",
 *     distinct from the 404 unknown-id path.
 * Unknown/unservable resources keep the frozen envelope: 404 not_found
 * "question {uuid} not found" / "knowledge node {uuid} not found"
 * (NotFoundException.java:16-19 — w3-question-unknown-authed-404 captures
 * the exact body; the app-level onError maps the typed errors).
 *
 * The mark-scheme 200/204/404 law lives in MarkSchemeRevealService (ported
 * at tranche-1): 200 with the scheme when the policy serves it, 204 empty
 * body when it withholds (pending teacher validation / rejected / flagged),
 * 404 when the question itself is not servable — unservable questions 404
 * BEFORE any scheme lookup (reveal rides the servability gate incl. the V20
 * paper gate). Policy source: SYLLABAI_MARKSCHEME_REVEAL_POLICY (the yaml's
 * named equivalent of syllabai.assessment.markscheme-reveal-policy), default
 * VALIDATED_ONLY, fail-fast at construction — a bad value kills boot exactly
 * like the frozen @Value + valueOf.
 */
import { Hono } from "hono";
import { buildQuestionsModule, type QuestionsModule } from "../../services/questions";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { NotFoundException, BadRequestException } from "../../services/identity/errors";
import { requireAuth } from "../../middleware/auth";
import {
  questionIdPathSchema,
  questionsListParamsSchema,
} from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170): 400 bad_request, fixed client
 * message. Structural duplicate of the curriculum helper — fence law keeps
 * the landed lanes unimported (import, never edit). */
const malformedRequest = () => new BadRequestException("malformed request");

/** UUID path-variable conversion parity (@PathVariable UUID). */
function parseUuid(raw: string): string {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)
  ) {
    throw malformedRequest();
  }
  return raw;
}

/** Query → schema conversion (the declared @RequestParam UUID pair). */
function parseListParams(
  c: { req: { query(name: string): string | undefined } },
): { topicNodeId?: string; rootId?: string } {
  const parsed = questionsListParamsSchema.safeParse({
    topicNodeId: c.req.query("topicNodeId"),
    rootId: c.req.query("rootId"),
  });
  if (!parsed.success) throw malformedRequest();
  return parsed.data;
}

export function createQuestionsRouter(module: QuestionsModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity): the
  // captured 401 shells (w3-questions-*-unauthed-401) pin the Boot body
  // before any handler work.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — list(:39-51). Precedence is controller law: topicNodeId, else
  // rootId (subject PART_OF subtree), else all-active.
  r.get("/", async (c) => {
    const params = parseListParams(c);
    const views = params.topicNodeId
      ? await module.servable.activeByTopic(params.topicNodeId)
      : params.rootId
        ? await module.servable.activeWithin(await module.subtreeIds(params.rootId))
        : await module.servable.allActive();
    return c.json(views);
  });

  // GET /families — families(:60-70): the same scoping params, rows
  // reassembled into WHOLE questions (session-121 serving unit). Registered
  // before /:id for readability; Hono resolves the static segment first.
  r.get("/families", async (c) => {
    const params = parseListParams(c);
    const views = params.topicNodeId
      ? await module.familiesByTopic(params.topicNodeId)
      : params.rootId
        ? await module.familiesWithin(await module.subtreeIds(params.rootId))
        : await module.allFamilies();
    return c.json(views);
  });

  // GET /topics — topics(:79-82): taxonomy census; ONLY rootId binds
  // (Spring ignores undeclared query params — parse the picked schema so a
  // stray topicNodeId=garbage is ignored, not a 400). Unknown root 404s
  // inside the service (graph.node(rootId) runs first), exactly "like list".
  r.get("/topics", async (c) => {
    const parsed = questionsListParamsSchema.pick({ rootId: true }).safeParse({
      rootId: c.req.query("rootId"),
    });
    if (!parsed.success) throw malformedRequest();
    return c.json(await module.taxonomy.taxonomy(parsed.data.rootId ?? null));
  });

  // GET /:id — get(:84-88): servable findById (never throws for
  // missing/unservable — the controller maps null to the 404).
  r.get("/:id", async (c) => {
    const parsed = questionIdPathSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) throw malformedRequest();
    const id = parseUuid(parsed.data.id);
    const view = await module.servable.findById(id);
    if (view === null) throw new NotFoundException("question", id);
    return c.json(view);
  });

  // GET /:id/mark-scheme — markScheme(:97-102): 200 body | 204 noContent().
  // The 404 (unservable question) throws inside the reveal service — it
  // rides the servability gate BEFORE any scheme lookup.
  r.get("/:id/mark-scheme", async (c) => {
    const parsed = questionIdPathSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) throw malformedRequest();
    const id = parseUuid(parsed.data.id);
    const view = await module.reveal.reveal(id);
    if (view === null) return c.body(null, 204);
    return c.json(view);
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildContentApp /
 * buildSelfMarkRouters shape (env → requireDatabaseUrl → createSql adapter;
 * the structural SqlFn keeps the module driver-agnostic through the
 * T-MIG-014 dispatch). The reveal-policy env value rides the same env bag
 * (SYLLABAI_MARKSCHEME_REVEAL_POLICY, default VALIDATED_ONLY, fail-fast).
 */
export function buildQuestionsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildQuestionsModule(sql, env.SYLLABAI_MARKSCHEME_REVEAL_POLICY);
  return { module, questionsRoute: createQuestionsRouter(module) };
}
