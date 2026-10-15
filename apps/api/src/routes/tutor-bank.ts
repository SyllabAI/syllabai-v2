/**
 * Tutor bank bands router — T-MIG-128/129 (post-core v2-native surfaces, the
 * operator's deterministic bands, trace 1a14080256278b41):
 *
 *   GET /api/v1/tutor/bank/questions  → band (1): deterministic question
 *     listing by topic | spec point | node (TutorBankQuestionsView)
 *   GET /api/v1/tutor/bank/paper?q=…  → band (2): whole-paper fetch — the
 *     resolved paper + its bank questions with marks + the paired QP/MS
 *     chunks in ONE view (TutorBankPaperFullView)
 *
 * Route security: mounted under /api/v1/tutor/bank, which (like /questions
 * and /exam-papers) falls under anyRequest().authenticated() — the authz
 * shell runs FIRST and the router owns its authz internally. Read-only
 * surfaces: zero LLM, zero vector calls, zero writes.
 *
 * Scope law (T-C07): both surfaces resolve the ACTIVE curriculum scope
 * (CurriculumScopeResolver.resolveActive — deterministic, fail-closed; zero
 * or ≥2 owners → null) and NEVER serve across curricula. An unresolvable
 * scope degrades honestly: /questions → the empty view (200, total 0);
 * /paper → 404 (a wrong-corpus answer is worse than a refusal — ADR-030).
 *
 * Binding laws (the questions/exam-papers router parity): a failed
 * safeParse IS the conversion failure → 400 bad_request "malformed request";
 * band (2) requires a parseable identity — a blank/absent q is a 400, an
 * identity that binds no VALIDATED paper is the honest 404
 * ("exam paper {label} not found").
 */
import { Hono } from "hono";
import { buildBankBands, type BankBandsScope } from "../services/tutor/bank-bands";
import { CurriculumScopeResolver } from "../services/content/scope";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { NotFoundException, BadRequestException } from "../services/identity/errors";
import { requireAuth } from "../middleware/auth";
import { tutorBankQuestionsParamsSchema } from "@syllabai/contracts";
import type { TutorBankQuestionsParams } from "@syllabai/contracts";

const malformedRequest = () => new BadRequestException("malformed request");

/** Binding axes from the query binding: the schema's refine guarantees at
 * least one axis; absent keys are stripped so the service precedence
 * (nodeId > spec > topic) reads the binding axis alone. */
function parseQuestionsParams(c: {
  req: { query(name: string): string | undefined };
}): TutorBankQuestionsParams {
  const parsed = tutorBankQuestionsParamsSchema.safeParse({
    topic: c.req.query("topic"),
    spec: c.req.query("spec"),
    nodeId: c.req.query("nodeId"),
    paperCode: c.req.query("paperCode"),
    year: c.req.query("year"),
    series: c.req.query("series"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) throw malformedRequest();
  const params = parsed.data;
  return {
    limit: params.limit,
    ...(params.nodeId != null ? { nodeId: params.nodeId } : {}),
    ...(params.spec != null ? { spec: params.spec } : {}),
    ...(params.topic != null ? { topic: params.topic } : {}),
    ...(params.paperCode != null ? { paperCode: params.paperCode } : {}),
    ...(params.year != null ? { year: params.year } : {}),
    ...(params.series != null ? { series: params.series } : {}),
  };
}

/**
 * Router factory — bands + the scope port injected (tests pass fakes; the
 * env composition below passes the sql-backed pair). The scope port returns
 * null when the ACTIVE scope cannot resolve (T-C07 fail-closed).
 */
export function createTutorBankRouter(
  bands: ReturnType<typeof buildBankBands>,
  resolveScope: () => Promise<BankBandsScope | null>,
): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /questions — band (1): the deterministic listing.
  r.get("/questions", async (c) => {
    const axes = parseQuestionsParams(c);
    const scope = await resolveScope();
    if (scope == null) {
      // T-C07 fail-closed degrade: the honest empty census
      return c.json({ resolvedNodes: [], total: 0, items: [] });
    }
    return c.json(await bands.listQuestions(axes, scope));
  });

  // GET /paper — band (2): the whole-paper one-view fetch.
  r.get("/paper", async (c) => {
    const q = c.req.query("q");
    if (q == null || q.trim() === "") throw malformedRequest();
    const scope = await resolveScope();
    if (scope == null) {
      // never serve across curricula — the honest 404
      throw new NotFoundException("exam paper", q.trim());
    }
    const result = await bands.fetchPaper(q, scope);
    if (result.status === "NOT_FOUND") {
      throw new NotFoundException("exam paper", result.label);
    }
    return c.json(result.view);
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildQuestionsRouters
 * shape (env → requireDatabaseUrl → createSql adapter → the sql-backed
 * bands + the ACTIVE scope resolver).
 */
export function buildTutorBankRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const bands = buildBankBands(sql);
  const scopes = new CurriculumScopeResolver(sql);
  const resolveScope = async (): Promise<BankBandsScope | null> => {
    const scope = await scopes.resolveActive(null);
    if (scope == null) return null;
    return {
      curriculumVersionId: scope.curriculumVersionId,
      code: scope.code,
      surface: scope.surface,
    };
  };
  return { bands, tutorBankRoute: createTutorBankRouter(bands, resolveScope) };
}
