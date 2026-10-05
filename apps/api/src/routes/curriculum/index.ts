/**
 * Curriculum read-surface routers — path parity with the frozen Java core
 * (T-MIG-021 tranche 2; verified 2026-10-05):
 *   CurriculumController          @RequestMapping("/api/v1/curriculum")
 *   TeacherCurriculumController   @RequestMapping("/api/v1/teacher/curriculum")
 *
 * Route security (SecurityConfig parity + @PreAuthorize deep-audit M5):
 * /api/v1/curriculum/** is authenticated (the captured 401 pins the
 * anonymous Boot body; student 200s pin learner access);
 * /api/v1/teacher/curriculum/** requires TEACHER/ADMIN — anonymous callers
 * get the Boot 401 body, authenticated non-teacher callers the Boot 403
 * body (requireRole). Both gates run BEFORE any handler body.
 *
 * Error shapes (GlobalExceptionHandler parity, ported in identity/errors):
 *   - unknown subject id   → 404 not_found "subject {uuid} not found"
 *     (NotFoundException.java:16-19 — captured envelope
 *     curriculum-subject-unknown-404)
 *   - malformed uuid (path or query binding) / unknown status enum value
 *     → 400 bad_request "malformed request" (Spring
 *     MethodArgumentTypeMismatchException + StringToEnumConverterFactory
 *     parity — conversion precedes validation, R1's contract schemas model
 *     the binding; a failed safeParse IS the conversion failure)
 *   - F-1 (captured as-is, R0 divergence call pending): GET
 *     /versions/{unknown}/nodes → 200 [] — NO existence check
 *     (CurriculumReviewService.nodes iterates the version's subjects, an
 *     unknown version simply has none; test-pinned).
 *
 * Honest 501 discipline (T-MIG-020 ratified convention): the teacher WRITE
 * flows (drafts ingest, node validate/reject, version gate/archive) are
 * outside T-MIG-021's READ title and answer 501 {status,
 * error:"not_implemented", message:"not yet ported — owned by <task>",
 * timestamp} — never a fabricated 200, never a silent drop.
 */
import { Hono, type Context } from "hono";
import {
  buildCurriculumModule,
  versionView,
  subjectView,
  type CurriculumModule,
} from "../../services/curriculum";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import {
  apiError,
  NotFoundException,
  BadRequestException,
} from "../../services/identity/errors";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  curriculumVersionsQuerySchema,
  curriculumSubjectsQuerySchema,
  teacherCurriculumNodesQuerySchema,
  type TeacherCurriculumNodesQuery,
} from "@syllabai/contracts";

/** Honest 501 for surfaces outside this task's READ title. */
function notImplemented(c: Context, owningTask: string): Response {
  return c.json(
    apiError(501, "not_implemented", `not yet ported — owned by ${owningTask}`),
    501,
  );
}

const CURRICULUM_WRITE_TASK =
  "the wave-3 curriculum-write lane (to be filed by R0) — T-MIG-021 ports the captured READ surfaces only";

/**
 * Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170): 400 bad_request with the fixed
 * client message.
 */
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

/**
 * Learner curriculum router — CurriculumController (:36-62). Mounted at
 * "/api/v1/curriculum". Authenticated (isAuthenticated parity): the gate
 * answers 401 before every handler below.
 */
export function createLearnerCurriculumRouter(module: CurriculumModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/curriculum/** authenticated
  // parity): the gate answers before every handler below.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /versions?includeArchived=… (:39-46)
  r.get("/versions", async (c) => {
    const parsed = curriculumVersionsQuerySchema.safeParse({
      includeArchived: c.req.query("includeArchived"),
    });
    if (!parsed.success) throw malformedRequest(); // StringToBooleanConverter parity
    const rows = parsed.data.includeArchived
      ? await module.versions.findAllByOrderByCreatedAtDesc()
      : await module.versions.findActiveByOrderByCreatedAtDesc();
    return c.json(rows.map(versionView));
  });

  // GET /subjects?versionId=… (:48-55) — registered before /:id for
  // readability; Hono resolves the static segment first anyway.
  r.get("/subjects", async (c) => {
    const parsed = curriculumSubjectsQuerySchema.safeParse({
      versionId: c.req.query("versionId"),
    });
    if (!parsed.success) throw malformedRequest(); // UUID conversion parity
    const versionId = parsed.data.versionId;
    const rows =
      versionId === undefined
        ? await module.subjects.findAllByOrderByCode()
        : await module.subjects.findByCurriculumVersionIdOrderByCode(versionId);
    return c.json(rows.map(subjectView));
  });

  // GET /subjects/:id (:57-61) — orElseThrow NotFoundException("subject", id)
  r.get("/subjects/:id", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const subject = await module.subjects.findById(id);
    if (!subject) throw new NotFoundException("subject", id);
    return c.json(subjectView(subject));
  });

  return r;
}

/**
 * Teacher curriculum READ router — TeacherCurriculumController (:69-91,
 * read methods only). Mounted at "/api/v1/teacher/curriculum".
 * TEACHER/ADMIN (SecurityConfig /api/v1/teacher/** + @PreAuthorize parity).
 */
export function createTeacherCurriculumRouter(module: CurriculumModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** parity): the gate
  // answers before every handler below, including the 501s.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /versions — review.versions() (:76-78): overview counts per version
  r.get("/versions", async (c) => c.json(await module.review.overviewRows()));

  // GET /versions/:id/nodes?status=… (:80-86) — F-1: unknown version → 200 []
  r.get("/versions/:id/nodes", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const statusRaw = c.req.query("status");
    let status: TeacherCurriculumNodesQuery["status"];
    if (statusRaw !== undefined) {
      const parsed = teacherCurriculumNodesQuerySchema.safeParse({ status: statusRaw });
      if (!parsed.success) throw malformedRequest(); // valueOf case-sensitivity parity
      status = parsed.data.status;
    }
    return c.json(await module.review.nodeRows(id, status));
  });

  // ── write surfaces OUTSIDE this task's READ title — honest 501s ──────────
  // TeacherCurriculumController.java:57-67 (ingest), :93-96 (validateNode),
  // :99-102 (rejectNode), :105-108 (validateVersion), :111-114 (archiveVersion)
  r.post("/drafts", (c) => notImplemented(c, CURRICULUM_WRITE_TASK));
  r.post("/nodes/:id/validate", (c) => notImplemented(c, CURRICULUM_WRITE_TASK));
  r.post("/nodes/:id/reject", (c) => notImplemented(c, CURRICULUM_WRITE_TASK));
  r.post("/versions/:id/validate", (c) => notImplemented(c, CURRICULUM_WRITE_TASK));
  r.post("/versions/:id/archive", (c) => notImplemented(c, CURRICULUM_WRITE_TASK));

  return r;
}

/**
 * Module + routers composition for the app root — mirrors buildContentApp's
 * shape exactly (env → requireDatabaseUrl → createSql adapter from the
 * identity module's tagged-template seam; the structural SqlFn keeps the
 * curriculum repositories driver-agnostic through the T-MIG-014 dispatch).
 */
export function buildCurriculumRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildCurriculumModule(sql);
  return {
    module,
    learnerRoute: createLearnerCurriculumRouter(module),
    teacherRoute: createTeacherCurriculumRouter(module),
  };
}
