/**
 * Revision-notes routers — T-MIG-082 tranche A (the wire-mounts band, R0).
 * Path parity with the frozen core (syllabai-core @ 6cad6ef), TWO routers:
 *
 *   RevisionNoteLearnerController @RequestMapping("/api/v1/learners/me/revision-notes")
 *     (RevisionNoteLearnerController.java :26-68) — learnerRouter:
 *     GET  /                     index(learnerId) — tree + viewed markers
 *     GET  /:noteId              body(noteId) — canonical-order 404-first
 *     GET  /assets/:filename     asset(filename) — 200 bytes + stored
 *                                Content-Type + CacheControl
 *                                maxAge(1,HOURS).cachePrivate() → the header
 *                                "max-age=3600, private" (Spring renders
 *                                max-age first, then private)
 *     GET  /progress             progress(learnerId) — the ring input
 *     POST /progress/views       markViewed(learnerId, {noteId}) → 204
 *                                noContent, idempotent first-view-wins
 *
 *   RevisionNoteAdminController @RequestMapping("/api/v1/admin/revision-notes")
 *     (RevisionNoteAdminController.java :20-52) — adminRouter:
 *     POST /ingest               multipart part "file"; empty/missing part →
 *                                400 bad_request "multipart part 'file' (the
 *                                corpus ZIP) is required" (:37-40, the EXACT
 *                                sme.ts :47 law); 200 summary — ResponseEntity.ok,
 *                                NOT 201; parse+validate BEFORE the transaction,
 *                                replace-all + orphan sweep inside ONE
 *                                transaction (the frozen @Transactional)
 *     GET  /status               live corpus snapshot
 *
 * Route security (SecurityConfig parity): the learner notes fall under
 * anyRequest().authenticated() → requireAuth per route (the 079 learnerkg
 * pattern; the Boot 401 shell answers BEFORE any param parsing); the admin
 * pair is /api/v1/admin/** hasRole("ADMIN") + @PreAuthorize
 * ("hasRole('ADMIN')") defense-in-depth (:27-29) → the requireRole("ADMIN")
 * shell BEFORE every handler (the sme.ts :63 precedent).
 *
 * Path vars are @PathVariable String (NOT UUID) in the frozen controller
 * (:38/:46/:51) — no UUID parse; the canonical-scan 404 owns the unknown law.
 *
 * Param/body laws (GlobalExceptionHandler + jakarta parity):
 *   - unknown noteId → 404 not_found "revision note {noteId} not found"
 *     (RevisionNoteService :89 — canonical-order scan, NotFoundError);
 *   - unknown asset → 404 not_found "revision note asset {filename} not
 *     found" (:98-99);
 *   - markViewed body noteId is @Size(max=80) ONLY — NOT @NotBlank — so an
 *     absent/null noteId BINDS (constraints skip null) and dies honestly at
 *     the 404-first note lookup ("revision note null not found"); a noteId
 *     longer than 80 → 400 validation_failed "noteId: size must be between
 *     0 and 80" (:158-165 first-field law, the too_big rendering); a
 *     non-string field → 400 malformed_body "request body is not readable
 *     (check field types and enum values)" (:175-180, the F-0 binding-class
 *     law); a non-JSON/empty body → the same malformed_body envelope.
 *
 * Reuse-not-redeclare: ZERO services touched — the 053 t3 ports
 * (services/revision-notes/learner.ts + ingest.ts) are consumed as-is.
 * The asset endpoint is the ONE route that returns bytes: Content-Type from
 * the stored content_type column (MediaType.parseMediaType parity), body
 * the raw asset bytes (Uint8Array).
 */
import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  revisionNotesIndex,
  revisionNoteBody,
  revisionNoteAsset,
  revisionNoteProgress,
  revisionNoteMarkViewed,
} from "../services/revision-notes/learner";
import { RevisionNoteIngestService } from "../services/revision-notes/ingest";
import { BadRequestError, NotFoundError, type SubmitClock } from "../services/selfmark";

/** the markViewed body law: @Size(max=80) — the ONLY constraint on noteId */
const NOTE_ID_MAX = 80;
/** the frozen unreadable-body envelope (GlobalExceptionHandler :175-180) */
const MALFORMED_BODY = "request body is not readable (check field types and enum values)";

export interface RevisionNotesDeps {
  sql: ReturnType<typeof createSql>;
  clock: SubmitClock;
}

// ── learner router (/api/v1/learners/me/revision-notes) ─────────────────────

export function createRevisionNoteLearnerRouter(deps: RevisionNotesDeps): Hono {
  const r = new Hono();

  // REGISTRATION ORDER LAW: Hono matches in registration order, the frozen
  // Spring MVC resolves EXACT mappings before path variables — so the
  // static segments (/progress, /assets/:filename, /progress/views) MUST
  // register BEFORE the dynamic /:noteId, or GET /progress would be eaten
  // by the body route as noteId="progress".

  // GET / — the full tree + the caller's viewed markers (one request per
  // view mount; the empty-corpus early return lives in the service).
  r.get("/", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNotesIndex(deps.sql, gate.userId), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /progress — the ring input, newest first.
  r.get("/progress", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNoteProgress(deps.sql, gate.userId), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // POST /progress/views — idempotent: opening the same note twice never
  // conflicts; the frozen answers 204 noContent (:64-67).
  r.post("/progress/views", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const raw = await c.req.text();
    if (!raw) {
      // an EMPTY stream is an unreadable document (HttpMessageNotReadable
      // :175-180); the JSON-null-root bind is the lawful null ({} below)
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    const noteId = (body as { noteId?: unknown }).noteId;
    if (noteId !== undefined && noteId !== null && typeof noteId !== "string") {
      // wrong JSON type = a BIND failure (F-0): beats every constraint
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    if (typeof noteId === "string" && noteId.length > NOTE_ID_MAX) {
      // @Size(max=80) — the too_big rendering, first-field law
      return c.json(
        apiError(400, "validation_failed", "noteId: size must be between 0 and 80"),
        400,
      );
    }
    try {
      await revisionNoteMarkViewed(
        deps.sql,
        deps.clock,
        gate.userId,
        // the absent/null bind is LAWFUL (@Size skips null) — it dies at the
        // 404-first lookup with "revision note null not found" (the frozen
        // repository serves the same empty scan for a null id)
        (noteId ?? null) as string,
      );
      return c.body(null, 204);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /assets/:filename — authenticated asset bytes (blob-fetched by the
  // frontend); corpus-stable → short private caching is safe (:52-59). The
  // ONE route that serves bytes: stored content_type + the cache-control law.
  r.get("/assets/:filename", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      const asset = await revisionNoteAsset(deps.sql, c.req.param("filename"));
      // new Uint8Array(typedArray) copies into a FRESH non-shared ArrayBuffer
      // (the Hono Data law wants Uint8Array<ArrayBuffer>)
      return c.body(new Uint8Array(asset.bytes), 200, {
        "Content-Type": asset.contentType,
        "Cache-Control": "max-age=3600, private",
      });
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /:noteId — the one note body; 404-first on the canonical scan.
  // Registered LAST: the dynamic segment comes after every static sibling
  // (the Spring exact-first mapping law — see the registration-order note).
  r.get("/:noteId", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    try {
      return c.json(await revisionNoteBody(deps.sql, c.req.param("noteId")), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  return r;
}

/** the controller guard's verbatim message (:38-39 — the sme.ts twin law) */
const FILE_PART_REQUIRED = "multipart part 'file' (the corpus ZIP) is required";

export function createRevisionNoteAdminRouter(deps: RevisionNotesDeps): Hono {
  const r = new Hono();
  const ingest = new RevisionNoteIngestService(deps.sql, deps.clock);

  r.onError((err, c) => {
    if (err instanceof BadRequestError) return c.json(apiError(400, "bad_request", err.message), 400);
    console.error("[revision-notes] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // authz shell FIRST — /api/v1/admin/** hasRole("ADMIN") + @PreAuthorize
  // defense-in-depth (:27-29); anonymous → Boot 401, non-admin → Boot 403.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ingest (:34-47) — the multipart law is the EXACT sme.ts contract
  // (the frozen guards are verbatim twins); 200 summary, NOT 201.
  r.post("/ingest", async (c) => {
    let file: unknown;
    try {
      const form = await c.req.formData();
      file = form.get("file");
    } catch {
      // non-multipart / unreadable body — the part is absent (the disclosed
      // binding-class 400; see the sme.ts header — the "400, not 500" session-56
      // convention)
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    if (file === null || !(file instanceof File) || file.size === 0) {
      // the controller guard verbatim (:37-40): file == null || file.isEmpty()
      throw new BadRequestError(FILE_PART_REQUIRED);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = await ingest.ingest(bytes);
    return c.json(summary);
  });

  // GET /status (:49-52) — what is live
  r.get("/status", async (c) => c.json(await ingest.status()));

  return r;
}

// ── shared error mapping (the learnerkg mapErrors shape) ────────────────────

function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  console.error("[revision-notes] unhandled error:", e);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

// ── live factory ────────────────────────────────────────────────────────────

/**
 * Live factory — the real sql client; ONE sql + ONE clock shared by the
 * learner routes and the ingest service. `seams.clock` injects the clock
 * (determinism law); production default is the fresh per-request clock +
 * crypto.randomUUID ids (the buildSmeRouters shape).
 */
export function buildRevisionNoteRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() };
  const deps: RevisionNotesDeps = { sql, clock };
  return { deps, learnerRoute: createRevisionNoteLearnerRouter(deps), adminRoute: createRevisionNoteAdminRouter(deps) };
}
