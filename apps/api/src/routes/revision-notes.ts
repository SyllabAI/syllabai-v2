/**
 * Revision-notes routers — T-MIG-082 tranche-1 (r4b mount band).
 * Path parity with the frozen core (syllabai-core @ 6cad6ef):
 *
 *   RevisionNoteLearnerController  @RequestMapping("/api/v1/learners/me/revision-notes")
 *     (:24-69) — 5 endpoints: GET "" (index :34-36), GET "/{noteId}"
 *     (:39-41), GET "/assets/{filename}" (:48-55), GET "/progress"
 *     (:57-59), POST "/progress/views" (:63-67, @ResponseStatus 204 via
 *     ResponseEntity.noContent).
 *   RevisionNoteAdminController   @RequestMapping("/api/v1/admin/revision-notes")
 *     (:24-52) — 2 endpoints: POST "/ingest" (multipart part "file",
 *     :33-46), GET "/status" (:49-51).
 *
 * Route security (SecurityConfig parity):
 *   - learner paths fall under the frozen anyRequest().authenticated() rule
 *     — the router owns its authz internally via the requireAuth gate
 *     (middleware/auth.ts :100); anonymous callers get the Boot 401 shell
 *     body {timestamp,status,error:"Unauthorized",path} BEFORE any handler
 *     work (the learnerkg.ts T-MIG-079 precedent);
 *   - /api/v1/admin/** requires hasRole("ADMIN") (SecurityConfig :87) — the
 *     router-level M5 shell requireRole(c, "ADMIN") (the sme.ts :60-66
 *     precedent), BEFORE the multipart bind.
 *
 * The services are the T-MIG-053 tranche-3 ports (REUSE-not-redeclare):
 *   revisionNotesIndex / revisionNoteBody / revisionNoteAsset /
 *   revisionNoteMarkViewed / revisionNoteProgress (services/revision-notes/
 *   learner.ts) + RevisionNoteIngestService (ingest.ts :226 — ingest bytes /
 *   status()). The wire schemas are pre-ratified in @syllabai/contracts
 *   (revision-notes.ts — index/body/progress/summary/status views, 9 pins);
 *   the routes serialize the service views verbatim.
 *
 * Error envelopes (the frozen GlobalExceptionHandler law, mapped locally —
 * everything else falls to the app-level 500 boundary, never guessed):
 *   - NotFoundError → 404 not_found "revision note {id} not found" /
 *     "revision note asset {filename} not found" (RevisionNoteService :89
 *     and :98-99, the shared NotFoundException rendering);
 *   - BadRequestError → 400 bad_request "invalid revision-notes package: …"
 *     (the ingest fail-closed vocabulary) and the multipart part law
 *     "multipart part 'file' (the corpus ZIP) is required" (:37-40);
 *   - ArchiveFormatError → 400 bad_request (the ZIP walker's structural
 *     law, the sme service's own mapping precedent — the frozen service
 *     wraps zip failures as the shared BadRequestException family).
 *
 * Multipart law (POST /ingest, the sme.ts :72-90 precedent verbatim):
 *   - non-multipart / unreadable body → the part is absent → 400
 *     "multipart part 'file' (the corpus ZIP) is required";
 *   - file == null || file.size === 0 → the controller guard verbatim
 *     (:37-40) → the same 400;
 *   - file.size > MULTIPART_MAX_FILE_BYTES (application.yml :44, the core's
 *     own global multipart cap) → 413 payload_too_large (disclosed; the
 *     frozen 500s through the catch-all);
 *   - otherwise the raw ZIP bytes go to the ingest seam exactly like the
 *     frozen @RequestPart byte[] hand-off.
 *
 * markViewed body law (MarkNoteViewedRequest, RevisionNoteDtos :53 —
 * @Size(max = 80) String noteId, NOT @NotBlank): jakarta constraints SKIP
 * null, so {"noteId": null} and {} bind noteId=null and REACH the service,
 * which answers 404 "revision note null not found" (RevisionNoteService
 * :104-107 — findById(null) is empty). The route therefore binds
 * string|null and enforces the size bound ONLY for non-null strings
 * (400 validation_failed "noteId: size must be between 0 and 80"); an
 * unreadable body → 400 bad_request "request body is not readable (check
 * field types and enum values)" (GlobalExceptionHandler :175-180). The
 * controller discards the service's ViewedView and returns 204 no content.
 *
 * Asset headers (the frozen :48-55 verbatim): Content-Type =
 * MediaType.parseMediaType(asset.contentType) and Cache-Control =
 * CacheControl.maxAge(1, HOURS).cachePrivate() → "max-age=3600, private".
 *
 * Determinism (ADR-031): markViewed stamps the ONE injected clock anchor;
 * production keeps the fresh per-request clock.
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import type { SqlFn } from "../services/assessment/sql";
import type { SubmitClock } from "../services/selfmark";
import { BadRequestError, NotFoundError } from "../services/selfmark";
import {
  RevisionNoteIngestService,
  revisionNoteAsset,
  revisionNoteBody,
  revisionNoteMarkViewed,
  revisionNoteProgress,
  revisionNotesIndex,
} from "../services/revision-notes";
import { ArchiveFormatError } from "../services/sme/zip";
import { MULTIPART_MAX_FILE_BYTES } from "./sme";

/** The verbatim controller guard message (:37-40, shared with sme.ts). */
const FILE_PART_REQUIRED = "multipart part 'file' (the corpus ZIP) is required";

/** The frozen GlobalExceptionHandler :175-180 unreadable-body envelope. */
const BODY_NOT_READABLE =
  "request body is not readable (check field types and enum values)";

/** MarkNoteViewedRequest wire: @Size(max = 80), null/absent-tolerant (header). */
const markViewedBody = z.object({
  noteId: z.string().max(80, "size must be between 0 and 80").nullish(),
});

/** The router's deps (one TxSqlFn — the ingest transaction seam — + clock). */
export interface RevisionNotesDeps {
  sql: SqlFn & { transaction: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T> };
  clock: SubmitClock;
}

/** The shared local error map (the frozen handler law; header). */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  if (e instanceof ArchiveFormatError) return c.json(apiError(400, "bad_request", e.message), 400);
  return null;
}

/** Learner router — the 5 authenticated read/progress endpoints. */
export function createLearnerRevisionNotesRouter(deps: RevisionNotesDeps): Hono {
  const r = new Hono();

  // GET "" (:34-36) — the full tree + the caller's viewed markers.
  r.get("/", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNotesIndex(deps.sql, gate.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/assets/{filename}" (:48-55) — the authenticated blob leg with the
  // private 1h cache headers (header law); the raw-Response serving is the
  // content/index.ts question-asset precedent.
  r.get("/assets/:filename", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      const asset = await revisionNoteAsset(deps.sql, c.req.param("filename"));
      return new Response(asset.bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": asset.contentType,
          "Cache-Control": "max-age=3600, private",
        },
      });
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/progress" (:57-59) — the caller's viewed markers (the rings).
  // Registered BEFORE /:noteId: Spring's handler mapping sorts literal
  // patterns ahead of templates (:57 vs :39), so the router must resolve
  // /progress before /:noteId can swallow it (registration order).
  r.get("/progress", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNoteProgress(deps.sql, gate.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/{noteId}" (:39-41) — one note body with prev/next; String path
  // var (NOT a UUID — the corpus ids are slugs), so no UUID law here.
  r.get("/:noteId", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNoteBody(deps.sql, c.req.param("noteId")), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST "/progress/views" (:63-67) — idempotent first-view-wins; the
  // null-tolerant @Size(max=80) body law (header); 204 no content.
  r.post("/progress/views", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(apiError(400, "bad_request", BODY_NOT_READABLE), 400);
    }
    const parsed = markViewedBody.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json(
        apiError(400, "validation_failed", `noteId: ${issue?.message ?? "request invalid"}`),
        400,
      );
    }
    try {
      // the null-tolerant bind (header): noteId=null/absent REACHES the
      // service — its 404-first lookup renders the frozen "revision note
      // null not found"; the cast carries the Jackson null through the
      // port's string-typed seam untouched.
      await revisionNoteMarkViewed(
        deps.sql,
        deps.clock,
        gate.userId,
        (parsed.data.noteId ?? null) as string,
      );
      return c.body(null, 204);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/** Admin router — the operator corpus pair behind the ADMIN shell. */
export function createAdminRevisionNotesRouter(deps: RevisionNotesDeps): Hono {
  const r = new Hono();
  const ingest = new RevisionNoteIngestService(deps.sql, deps.clock);

  // Authz shell (SecurityConfig /api/v1/admin/** hasRole("ADMIN")) —
  // scoped to this router only (the sme.ts :60-66 precedent).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST "/ingest" (:33-46) — the multipart law (header) + the seam.
  r.post("/ingest", async (c) => {
    try {
      let file: unknown;
      try {
        const form = await c.req.formData();
        file = form.get("file");
      } catch {
        // non-multipart / unreadable body — the part is absent (disclosed
        // binding-class 400; the sme.ts :75-80 precedent)
        throw new BadRequestError(FILE_PART_REQUIRED);
      }
      if (file === null || !(file instanceof File) || file.size === 0) {
        throw new BadRequestError(FILE_PART_REQUIRED);
      }
      if (file.size > MULTIPART_MAX_FILE_BYTES) {
        // the global multipart cap (application.yml :44) — disclosed 413
        return c.json(apiError(413, "payload_too_large", "request body exceeds the allowed size"), 413);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return c.json(await ingest.ingest(bytes), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/status" (:49-51) — what is live; un-ingested reads honest nulls.
  r.get("/status", async (c) => c.json(await ingest.status(), 200));

  return r;
}

/**
 * Module + router composition for the app root — the buildSmeRouters shape
 * (env → requireDatabaseUrl → createSql adapter; the adapter's transaction
 * seam is what the ingest replace-all runs inside, ADR-026 evidence-safe).
 * ONE sql + ONE clock shared by both routers. `opts.now` injects the clock
 * (determinism law); production default is the fresh per-request clock.
 */
export function buildRevisionNotesRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock: SubmitClock = {
    newId: () => crypto.randomUUID(),
    now: opts.now ?? (() => new Date()),
  };
  return {
    learnerRevisionNotesRoute: createLearnerRevisionNotesRouter({ sql, clock }),
    adminRevisionNotesRoute: createAdminRevisionNotesRouter({ sql, clock }),
  };
}
