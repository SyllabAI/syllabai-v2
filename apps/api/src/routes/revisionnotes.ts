/**
 * Revision-notes wire router — T-MIG-082 (learner, 5 endpoints) +
 * T-MIG-083 (admin, 2 endpoints). Path parity with the frozen core
 * (syllabai-core @ 6cad6ef):
 *
 *   RevisionNoteLearnerController (:24-69)  @RequestMapping("/api/v1/learners/me/revision-notes")
 *     GET  /                     → RevisionNotesIndexView     (list :34)
 *     GET  /{noteId}             → RevisionNoteBodyView       (:39)
 *     GET  /assets/{filename}    → the authenticated blob leg (:44)
 *     GET  /progress             → RevisionNoteProgressView   (:58)
 *     POST /progress/views       → the viewed marker          (:63)
 *   RevisionNoteAdminController (:24-52)    @RequestMapping("/api/v1/admin/revision-notes")
 *     POST /ingest               → RevisionNoteIngestSummary  (multipart, 200)
 *     GET  /status               → RevisionNoteStatusView
 *
 * Services are the ALREADY-PORTED 053-t3 ports (services/revision-notes/**,
 * zero new service code here): the learner functions are plain seams over
 * SqlFn; the admin side is the RevisionNoteIngestService class over the
 * TxSqlFn transaction seam. The route layer owns EXACTLY what the 053-t3
 * barrel deferred to it: the multipart envelope, the asset blob headers
 * (the private 1-hour cache-control — learner.ts header law), and the zod
 * request pin for the views body.
 *
 * Route security (SecurityConfig parity, mirrored from routes/sme.ts +
 * routes/learnerkg.ts):
 *   - learner: /api/v1/learners/me/** falls under
 *     anyRequest().authenticated() (:87-91) — the router owns its authz
 *     internally via the requireAuth shell; anonymous callers get the Boot
 *     401 body {timestamp,status,error:"Unauthorized",path} BEFORE any
 *     handler work;
 *   - admin: /api/v1/admin/** hasRole("ADMIN") (:86) — the requireRole
 *     shell answers 403 (Boot Forbidden body) for authenticated non-admins,
 *     401 for anonymous (the captured w3-sme-* sibling postures; the
 *     revision-notes family carries no captures of its own — the corpus
 *     exercises none of it, the 053 card's disclosed gap).
 *
 * Wire law (zod pins from @syllabai/contracts revision-notes.ts):
 *   - POST /progress/views body = markNoteViewedRequestSchema
 *     (MarkNoteViewedRequest :53, the @Size(max=80) bound). Two-envelope
 *     classifier parity with routes/learnerme.ts: non-object / unreadable
 *     body → 400 malformed_body (Jackson binding class); noteId absent →
 *     400 validation_failed "noteId: must not be null"; noteId over 80 →
 *     400 validation_failed "noteId: size must be between 0 and 80" (the
 *     jakarta @Size default). The 200 response is the service's marker —
 *     the RevisionNoteViewedView record (the hub's request<void> caller
 *     ignores the body; the service's honest return is served, never an
 *     invented empty).
 *   - responses for index/body/progress/ingest/status are the service
 *     views, which the contracts' STRICT response schemas pin (the 053-t3
 *     construction law); the route tests parse every 200 against them.
 *
 * Multipart law (mirrored from the captured SME sibling, routes/sme.ts
 * :37-87 — the same frozen admin-controller family): a missing or EMPTY
 * "file" part → 400 bad_request with the guard message; a compressed
 * upload beyond the 64 MB multipart cap (application.yml:44) → 413
 * payload_too_large (the core's JsonBodyLimitFilter law). DISCLOSED: the
 * frozen RevisionNoteAdminController's own guard wording (:33-46 class) is
 * not on disk in this lane (frozen core not cloned) — the message below is
 * the sibling's captured shape with this family's package vocabulary, NOT
 * a verbatim claim; the ingest service's own 400 vocabulary IS verbatim
 * (ingest.ts, 34 pins).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import { markNoteViewedRequestSchema } from "@syllabai/contracts";
import {
  revisionNoteAsset,
  revisionNoteBody,
  revisionNoteMarkViewed,
  revisionNoteProgress,
  revisionNotesIndex,
} from "../services/revision-notes/learner";
import { RevisionNoteIngestService } from "../services/revision-notes/ingest";
import { BadRequestError, NotFoundError, type SubmitClock } from "../services/selfmark";
import type { SqlFn } from "../services/assessment/sql";
import type { TxSqlFn } from "../services/sme/index.js";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth, requireRole } from "../middleware/auth";
import { MULTIPART_MAX_FILE_BYTES } from "./sme";

/** application.yml:44 multipart cap — REUSED from the sme router (one law,
 *  not two: the frozen cap is app-wide over multipart uploads). */
export { MULTIPART_MAX_FILE_BYTES };

/** The admin envelope guard (see header: sibling-shaped, DISCLOSED). */
const FILE_PART_REQUIRED =
  "multipart part 'file' (the revision-notes package) is required";

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

// ── the learner router (T-MIG-082) ───────────────────────────────────────────

export interface LearnerRevisionNotesDeps {
  sql: SqlFn;
  clock: SubmitClock;
}

/** The shared error mapping for the learner routes (GlobalExceptionHandler
 *  parity): NotFoundError → 404 not_found (verbatim "revision note[s asset]
 *  {id} not found"), BadRequest → 400 bad_request; everything else falls
 *  through to the app-level 500 boundary, never guessed here. */
function mapLearnerErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  return null;
}

/**
 * The views-body two-envelope classifier (the learnerme.ts law, the
 * single-string-field edition): a present-but-wrong JSON type is a Jackson
 * BINDING failure (malformed_body — the record's String field binds before
 * @Valid, and Jackson's scalar coercion is NOT honored by the ratified zod
 * pin); an absent field is the @NotNull-class constraint; the too-big case
 * is the @Size(max=80) constraint with its jakarta default message.
 */
function classifyViewsBodyError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = String(first.path[0] ?? "noteId");
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    return { kind: "validation", message: `${field}: must not be null` };
  }
  if (first.code === "too_big") {
    const max = (first as { maximum?: number }).maximum ?? 80;
    return { kind: "validation", message: `${field}: size must be between 0 and ${max}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

export function createLearnerRevisionNotesRouter(deps: LearnerRevisionNotesDeps): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:87-91 anyRequest().authenticated())
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — RevisionNoteLearnerController.list (:34) → RevisionNoteService
  // index (:35-77): the canonical tree + the caller's viewed markers; the
  // un-ingested corpus reads honest nulls + empty arrays (the service's
  // early return).
  r.get("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    try {
      const view = await revisionNotesIndex(deps.sql, auth.userId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapLearnerErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /progress — the ring input (:58 → :117-124): viewed markers only,
  // newest first.
  r.get("/progress", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await revisionNoteProgress(deps.sql, auth.userId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapLearnerErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /assets/{filename} — the authenticated blob leg (:44 → :96-100);
  // the route layer owns the private 1-hour cache-control envelope (the
  // frozen :52-53 law carried on the service's header). Content-Type is
  // the STORED allowlisted type (R14 — never script-capable).
  r.get("/assets/:filename", async (c) => {
    const auth = getAuth(c)!;
    try {
      const asset = await revisionNoteAsset(deps.sql, c.req.param("filename"));
      // the content assetRoute serving pattern (routes/content/index.ts):
      // a bare binary Response with the stored type + the cache envelope
      return new Response(asset.bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": asset.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e) {
      const mapped = mapLearnerErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /progress/views — markViewed (:63 → :104-115): 404-first, then
  // IDEMPOTENT first-view-wins. 200 with the marker record (the frozen
  // controller has no created-status annotation in the ported law; the
  // hub's request<void> caller ignores the body either way).
  r.post("/progress/views", async (c) => {
    const auth = getAuth(c)!;
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(malformedBody(), 400);
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json(malformedBody(), 400);
    }
    const parsed = markNoteViewedRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const verdict = classifyViewsBodyError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const view = await revisionNoteMarkViewed(
        deps.sql,
        deps.clock,
        auth.userId,
        parsed.data.noteId,
      );
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapLearnerErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /{noteId} — one note's render payload (:39 → :79-94). Registered
  // LAST so the static paths above stay authoritative (first-match law in
  // the TrieRouter fallback; RegExpRouter is static-first regardless).
  r.get("/:noteId", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await revisionNoteBody(deps.sql, c.req.param("noteId"));
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapLearnerErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

// ── the admin router (T-MIG-083) ─────────────────────────────────────────────

export interface AdminRevisionNotesModule {
  ingest: RevisionNoteIngestService;
}

export function createAdminRevisionNotesRouter(module: AdminRevisionNotesModule): Hono {
  const r = new Hono();

  // Domain-error mapping (GlobalExceptionHandler parity, the sme.ts router
  // pattern): BadRequest (every fail-closed validation message of the
  // ingest + the envelope guard) → 400 bad_request with the detail
  // message; everything else falls through to the app boundary (500).
  r.onError((err, c) => {
    if (err instanceof BadRequestError) return c.json(apiError(400, "bad_request", err.message), 400);
    console.error("[revision-notes] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // authz shell FIRST (SecurityConfig :86 /api/v1/admin/** hasRole("ADMIN"))
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ingest (:33-47) — multipart part "file" = the corpus ZIP →
  // 200 RevisionNoteIngestSummary (ResponseEntity.ok, NOT 201). The
  // fail-closed validation 400s are the SERVICE's verbatim vocabulary.
  r.post("/ingest", async (c) => {
    let file: unknown;
    try {
      const form = await c.req.formData();
      file = form.get("file");
    } catch {
      // non-multipart / unreadable body — the part is absent (the
      // disclosed binding-class 400, sme.ts parity)
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    if (file === null || !(file instanceof File) || file.size === 0) {
      // the empty-part guard law (file == null || file.isEmpty())
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    if (file.size > MULTIPART_MAX_FILE_BYTES) {
      // the compressed multipart cap (application.yml:44) — the core's 413
      // law (sme.ts parity)
      return c.json(apiError(413, "payload_too_large", "request body exceeds the allowed size"), 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = await module.ingest.ingest(bytes);
    return c.json(summary, 200);
  });

  // GET /status (:49-52) — what is live; honest nulls before the first
  // ingest (:108-116).
  r.get("/status", async (c) => c.json(await module.ingest.status(), 200));

  return r;
}

// ── composition for the app root ─────────────────────────────────────────────

/**
 * Live factory — the buildSmeRouters shape (env → requireDatabaseUrl →
 * createSql; the createSql adapter carries the transaction seam, so ONE sql
 * serves both the learner reads and the admin TxSqlFn). `opts.now` injects
 * the clock (the ADR-031 determinism law); production default is the fresh
 * per-request clock.
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
    learnerRoute: createLearnerRevisionNotesRouter({ sql, clock }),
    adminRoute: createAdminRevisionNotesRouter({
      ingest: new RevisionNoteIngestService(sql as TxSqlFn, clock),
    }),
  };
}
