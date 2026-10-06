/**
 * SME question-bank admin router — path parity with the frozen core
 * (T-MIG-033 tranche 3): SmeQuestionAdminController
 * @RequestMapping("/api/v1/admin/question-bank"), two endpoints (:34-52
 * @ 6cad6ef):
 *   POST /ingest   (multipart/form-data, part "file" = the corpus ZIP)
 *                  → 200 IngestSummary
 *   GET  /status   → 200 BankStatusView {activeQuestions, activeMcq,
 *                  activeStructured, specPointMappings, assets}
 *
 * Route security (SecurityConfig :86 "/api/v1/admin/**" hasRole("ADMIN") +
 * @PreAuthorize("hasRole('ADMIN')") :25 defense-in-depth): the shell answers
 * before every handler (ADMIN only; anonymous → Boot 401 body, authenticated
 * non-admin → Boot 403 body via requireRole — the captured
 * w3-sme-status-unauthed-401 / w3-sme-status-student-403 /
 * w3-sme-status-teacher-403 / w3-sme-ingest-unauthed-401 postures; the
 * TEACHER 403 is the truth the capture pins).
 *
 * Multipart law: the controller guard (:37-40) — a missing or EMPTY "file"
 * part → 400 bad_request "multipart part 'file' (the corpus ZIP) is
 * required". DISCLOSED R-1-class divergence (the "400, not 500" convention,
 * session-56 class): in the frozen core a part MISSING at the framework
 * layer (MissingServletRequestPartException / non-multipart body) 500s
 * through the advice catch-all before the guard is reachable; the port
 * serves the guard's honest 400 for every binding-class failure of the
 * part. A compressed upload beyond the 64 MB multipart cap
 * (application.yml:44) → 413 payload_too_large "request body exceeds the
 * allowed size" — the core's own JsonBodyLimitFilter 413 law (frozen
 * MaxUploadSizeExceededException falls to the 500 catch-all).
 *
 * Error envelopes: BadRequestError (every fail-closed validation message of
 * the ingest, the ZIP budgets, the not-a-ZIP translation) → 400 bad_request
 * with the detail message (GlobalExceptionHandler :126-131 parity); status
 * code 200 on success — ResponseEntity.ok, NOT 201 (:42).
 */
import { Hono } from "hono";
import { buildSmeModule, type SmeModule } from "../services/sme";
import { BadRequestError } from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireRole } from "../middleware/auth";

/** application.yml:44 max-file-size (the COMPRESSED upload cap) */
export const MULTIPART_MAX_FILE_BYTES = 64 * 1024 * 1024;
/** the controller guard's verbatim message (:38-39) */
const FILE_PART_REQUIRED = "multipart part 'file' (the corpus ZIP) is required";

export function createSmeRouter(module: SmeModule): Hono {
  const r = new Hono();

  // Domain-error mapping (GlobalExceptionHandler parity, the 032/033t2
  // router pattern): BadRequest → 400 with the detail message; everything
  // else falls through to the app boundary (500).
  r.onError((err, c) => {
    if (err instanceof BadRequestError) return c.json(apiError(400, "bad_request", err.message), 400);
    console.error("[sme] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // authz shell FIRST (SecurityConfig /api/v1/admin/** hasRole("ADMIN"))
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ingest (:34-47) — multipart part "file"; 200 IngestSummary
  r.post("/ingest", async (c) => {
    let file: unknown;
    try {
      const form = await c.req.formData();
      file = form.get("file");
    } catch {
      // non-multipart / unreadable body — the part is absent (disclosed
      // binding-class 400; see header)
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    if (file === null || !(file instanceof File) || file.size === 0) {
      // the controller guard verbatim (:37-40): file == null || file.isEmpty()
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    if (file.size > MULTIPART_MAX_FILE_BYTES) {
      // the compressed multipart cap (application.yml:44) — the core's own
      // 413 law (disclosed; frozen 500s through the catch-all)
      return c.json(apiError(413, "payload_too_large", "request body exceeds the allowed size"), 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = await module.ingestService.ingest(bytes);
    return c.json(summary);
  });

  // GET /status (:49-52) — live bank snapshot
  r.get("/status", async (c) => c.json(await module.ingestService.status()));

  return r;
}

/**
 * Live factory — the real sql client with the adapter's transaction seam
 * (the ADR-026 evidence-safe replace runs inside one begin/commit/rollback);
 * clock defaults to the wall clock.
 */
export function buildSmeRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: import("../services/selfmark").SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() };
  const module = buildSmeModule(sql, clock);
  return { module, adminRoute: createSmeRouter(module) };
}
