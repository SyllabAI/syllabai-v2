/**
 * Paper-assets regions router — T-MG-MP-RECT-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.1.
 *
 *   GET /api/v1/paper-assets/:id/regions
 *     → PaperAssetRegionsResponse (200) | 404 unknown paper | 400 malformed id
 *
 * The MathsGenie getRegions parity surface (their observed §1.3 contract
 * shape) over the SyllabAI planes; questionPartId WIRED. Read-only, corpus
 * content, zero PII — the auth shell mirrors the sibling corpus routers
 * (exam-papers/books: any authenticated user may list/view; the shell
 * answers before any handler body).
 *
 * Binding law (Spring parity, identical to routes/exam-papers): an
 * unparseable uuid path param is 400 bad_request "malformed request"
 * (MethodArgumentTypeMismatchException parity — a failed safeParse IS the
 * conversion failure), distinct from the 404 unknown-id path
 * (NotFoundException envelope "exam paper {uuid} not found").
 */
import { Hono } from "hono";
import { PaperRegions } from "../../services/paper-regions";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { BadRequestException } from "../../services/identity/errors";
import { requireAuth } from "../../middleware/auth";
import { paperAssetIdPathSchema } from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170): 400 bad_request, fixed client
 * message. Structural duplicate of the exam-papers helper — fence law keeps
 * the landed lanes unimported (import, never edit). */
const malformedRequest = () => new BadRequestException("malformed request");

export function createPaperRegionsRouter(regions: PaperRegions): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity — the
  // sibling exam-papers/books shells): any authenticated user reads corpus
  // geometry; zero learner rows exist on this surface.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /:id/regions — the §3.1 contract: 200 shape | 404 unknown | 400
  // malformed uuid. Honest-empty (200 negative path) for a known paper
  // with nothing grounded — never conflated with the 404.
  r.get("/:id/regions", async (c) => {
    const parsed = paperAssetIdPathSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) throw malformedRequest();
    return c.json(await regions.regions(parsed.data.id));
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildExamPapersRouters
 * shape (env → requireDatabaseUrl → createSql adapter).
 */
export function buildPaperRegionsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const regions = new PaperRegions(sql);
  return { regions, paperAssetsRoute: createPaperRegionsRouter(regions) };
}
