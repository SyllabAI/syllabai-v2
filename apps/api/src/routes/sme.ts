/**
 * SME admin router — path parity with the frozen core (T-MIG-033 tranche 3):
 * SmeQuestionAdminController @RequestMapping("/api/v1/admin/question-bank")
 * (:20-62 @ 6cad6ef), two surfaces:
 *   POST /ingest   (multipart/form-data, part "file") → IngestSummary (:34-47)
 *   GET  /status                                     → BankStatusView (:49-52)
 *
 * Route security (SecurityConfig "/api/v1/admin/**" hasRole("ADMIN") :86 +
 * the controller's @PreAuthorize("hasRole('ADMIN')") :22-25 defense-in-depth):
 * the shell answers before every handler — anonymous → Boot 401 body,
 * authenticated non-admin → Boot 403 body (the captured
 * w3-sme-{status-unauthed-401,status-student-403,status-teacher-403,
 * ingest-unauthed-401} postures; student AND teacher both 403).
 *
 * Multipart error parity (each pin is a frozen-handler class, not an
 * invention — GlobalExceptionHandler has NO specific mapping for any of
 * them, so all three fall to the catch-all :224-230 → 500 "internal_error"
 * / "an internal error occurred"):
 *   - wrong content-type (not multipart/form-data)
 *     == HttpMediaTypeNotSupportedException (consumes = MULTIPART_FORM_DATA)
 *   - oversize upload (servlet multipart cap max-file-size/max-request-size
 *     64MB, application.yml :41-45) == MaxUploadSizeExceededException
 *   - unreadable multipart body == MultipartException
 *   - missing "file" part == MissingServletRequestPartException
 *     (the @RequestPart default required=true rejects BEFORE the controller
 *     body — the controller's own null check is unreachable for absence;
 *     present-but-EMPTY is what reaches it, :37-40)
 *   - present-but-empty part → 400 BadRequestException, verbatim
 *     "multipart part 'file' (the corpus ZIP) is required" (:38-39)
 *   - read failure of the part bytes → 400 "could not read the uploaded
 *     corpus package" (:43-46 — the IOException translation)
 *
 * Disclosed deviation (fail-closed, DoS-bound only): the servlet cap checks
 * the declared Content-Length before the body is read; a body that lies
 * smaller and streams larger is bounded by Bun's buffered parsing rather
 * than mid-stream abort. The REAL decompression protection is the ZipSafety
 * port (per-entry/total/count budgets enforced without allocating past a
 * cap) — the 64MB compressed cap is only the outer gate.
 */
import { Hono, type Context } from "hono";
import { BadRequestError, type SubmitClock } from "../services/selfmark";
import { apiError } from "../services/identity/errors";
import { requireRole } from "../middleware/auth";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { buildSmeModule, type SmeModule, type SmeTxSql } from "../services/sme";

/** application.yml :44-45 — spring.servlet.multipart max-file-size/request-size */
export const MULTIPART_MAX_BYTES = 64 * 1024 * 1024;

/**
 * The servlet cap fast path: a DECLARED Content-Length over 64MB aborts
 * before the body is read (MaxUploadSizeExceededException → frozen 500).
 * Exported for unit pinning (Request constructors treat content-length as
 * a forbidden header, so the route-level pin goes through this predicate).
 */
export function declaredMultipartOverCap(
  contentLength: string | undefined,
): boolean {
  const declared = Number(contentLength ?? "0");
  return Number.isFinite(declared) && declared > MULTIPART_MAX_BYTES;
}

export function createSmeRouter(module: SmeModule): Hono {
  const r = new Hono();

  // Domain-error mapping (GlobalExceptionHandler parity, the 032/033-t2
  // router pattern): BadRequest → 400 "bad_request" with the detail
  // message; everything else falls to the catch-all 500 the frozen
  // handler serves (:224-230) — INCLUDING the multipart 4xx-classes
  // documented above (they are 500s in the frozen core too).
  r.onError((err, c) => {
    if (err instanceof BadRequestError) {
      return c.json(apiError(400, "bad_request", err.message), 400);
    }
    console.error("[sme] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // authz shell FIRST (SecurityConfig /api/v1/admin/** :86 + @PreAuthorize :25)
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ingest (:34-47) — the ADR-026 replace, one transaction
  r.post("/ingest", async (c: Context) => {
    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("multipart/form-data")) {
      // consumes = MULTIPART_FORM_DATA (:34) — HttpMediaTypeNotSupportedException
      throw new Error("unsupported content-type: " + contentType);
    }
    const declaredLength = c.req.header("content-length");
    if (declaredMultipartOverCap(declaredLength)) {
      // MaxUploadSizeExceededException (application.yml :44-45 cap)
      throw new Error("multipart upload exceeds the 64MB servlet cap");
    }

    let file: File | undefined;
    try {
      const form = await c.req.parseBody();
      const part = form["file"];
      if (part instanceof File) {
        file = part;
      }
    } catch {
      // MultipartException — unreadable body
      throw new Error("multipart body could not be parsed");
    }
    if (file === undefined) {
      // MissingServletRequestPartException — required part absent
      throw new Error("required multipart part 'file' is absent");
    }
    if (file.size === 0) {
      // the controller's own guard (:37-40), verbatim
      throw new BadRequestError(
        "multipart part 'file' (the corpus ZIP) is required",
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      // the IOException translation (:43-46), verbatim
      throw new BadRequestError("could not read the uploaded corpus package");
    }
    return c.json(await module.ingest(bytes));
  });

  // GET /status (:49-52) — the live bank snapshot
  r.get("/status", async (c) => c.json(await module.status()));

  return r;
}

/**
 * Live factory — the createSql client carries the begin/commit/rollback
 * transaction affordance the ADR-026 one-transaction replace needs; clock
 * defaults to the wall clock + crypto UUIDs (row ids / created_at).
 */
export function buildSmeRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { sql?: SmeTxSql; clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  // createSql's client structurally carries the transaction affordance
  // (identity/users.ts :75-86) — the same bridge every write-path factory uses
  const sql = (seams.sql ?? createSql(databaseUrl)) as SmeTxSql;
  const module = buildSmeModule(sql, seams.clock);
  return { module, smeRoute: createSmeRouter(module) };
}
