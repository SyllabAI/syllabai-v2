/**
 * T-MIG-082 — learner revision-notes wire routes (r3a; mount-band card 082,
 * operator mount order trace 1a114e1f1aab2521).
 *
 * Path parity with RevisionNoteLearnerController (syllabai-core @ 6cad6ef
 * :25-69), all under "/api/v1/learners/me/revision-notes". The router mounts
 * at the shared /api/v1/learners/me prefix beside the 041/043/079 routers
 * (each owns its specific paths; Hono resolves per router; the /api/v1/*
 * fallback stays the 404-after-auth path for NO router claimed):
 *
 *   RevisionNoteLearnerController:
 *     GET  /revision-notes                     index     (:35-77)
 *     GET  /revision-notes/{noteId}            body      (:79-94)
 *     GET  /revision-notes/assets/{filename}   asset     (:96-100)
 *     GET  /revision-notes/progress            progress  (:117-124)
 *     POST /revision-notes/progress/views      markViewed(:104-115) → 200
 *
 * Route security: /api/v1/learners/me/** falls under the frozen
 * anyRequest().authenticated() rule (SecurityConfig.java:87-91) — the authz
 * shell runs FIRST (learnerme/assessment/content precedent) and this router
 * owns its authz internally.
 *
 * Error law (GlobalExceptionHandler parity): the service throws the shared
 * selfmark NotFoundError — "revision note X not found" (body :89),
 * "revision note asset X not found" (asset :98-99), and markViewed 404s a
 * missing note BEFORE touching the viewed table (:105-107) — mapped to
 * 404 not_found with the message verbatim.
 *
 * Asset envelope: Content-Type = the stored content_type;
 * Cache-Control: private, max-age=3600 — the private 1-hour cache law is
 * the ROUTE layer's (frozen RevisionNoteController :52-53; the service
 * port documents the hand-off explicitly). Bytes are served raw (the
 * content/question-assets serving precedent).
 *
 * markViewed request law (MarkNoteViewedRequest, RevisionNoteDtos :53 —
 * the @Size(max = 80) wire bound, NO @NotNull documented): Jackson binds
 * before @Valid, so —
 *   - present wrong JSON type  → 400 malformed_body (binding failure);
 *   - >80 chars                → 400 validation_failed "noteId: size must
 *                                be between 0 and 80" (jakarta @Size default);
 *   - ABSENT / null noteId     → null binds, @Size treats null as valid →
 *                                the service 404s "revision note null not
 *                                found" — CAPTURE-ADJUDICATED shape: the
 *                                golden case captured from the frozen core
 *                                pins the truth; this route adjusts if the
 *                                capture diverges (never silently).
 *
 * CAPTURE GATE (the T-MIG-082 card sequence): the 178-case corpus exercises
 * NONE of this family (r4b census 6450ff5; r1c Task-33 e5cd4b8), so the
 * golden cases for these 5 surfaces are captured from the frozen core per
 * GOLDEN_MASTER §2 BEFORE V2_SURFACE_PREFIXES widens (the flip law:
 * widening requires a new golden-verified surface). This mount is INERT
 * until then: the hub keeps routing the family to the core
 * (api.v2-surface.test.ts pins "/api/v1/learners/me/revision-notes"
 * core-only), so mounting is dual-run-safe and reversible.
 */
import { Hono } from "hono";
import { markNoteViewedRequestSchema } from "@syllabai/contracts";
import {
  revisionNoteAsset,
  revisionNoteBody,
  revisionNoteMarkViewed,
  revisionNoteProgress,
  revisionNotesIndex,
} from "../services/revision-notes";
import {
  BadRequestError,
  NotFoundError,
  defaultClock,
  type SubmitClock,
} from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";
import type { SqlFn } from "../services/assessment/sql";

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The shared error mapping for the revision-notes routes (the frozen
 *  GlobalExceptionHandler; the learnerme mapErrors precedent). */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  return null;
}

export function createRevisionNotesRouter(sql: SqlFn, clock: SubmitClock): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /revision-notes — index (:35-77); the un-ingested corpus reads
  // honest nulls + empty arrays (:37-39), viewed NOT queried on early return
  r.get("/revision-notes", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    try {
      return c.json(await revisionNotesIndex(sql, auth.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /revision-notes/:noteId — body (:79-94); 404-first, canonical
  // prev/next by linear scan, specMapJson passed through as TEXT
  r.get("/revision-notes/:noteId", async (c) => {
    const auth = getAuth(c)!;
    try {
      return c.json(await revisionNoteBody(sql, c.req.param("noteId")), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /revision-notes/assets/:filename — asset (:96-100); the stored
  // content type + the private 1-hour cache envelope (frozen :52-53)
  r.get("/revision-notes/assets/:filename", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await revisionNoteAsset(sql, c.req.param("filename"));
      return new Response(view.bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": view.contentType,
          "Content-Length": String(view.bytes.byteLength),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /revision-notes/progress — the ring input (:117-124), newest first
  r.get("/revision-notes/progress", async (c) => {
    const auth = getAuth(c)!;
    try {
      return c.json(await revisionNoteProgress(sql, auth.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /revision-notes/progress/views — markViewed (:104-115) → 200;
  // 404-first, then IDEMPOTENT first-view-wins (the existing marker is
  // returned untouched). Request law: MarkNoteViewedRequest (:53) — see
  // the file header for the Jackson-bind + @Size(max=80) envelope.
  r.post("/revision-notes/progress/views", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = markNoteViewedRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue && issue.path[0] === "noteId") {
        if (issue.code === "too_big") {
          return c.json(
            apiError(400, "validation_failed", "noteId: size must be between 0 and 80"),
            400,
          );
        }
        const received = (issue as { received?: unknown }).received;
        // absent/JSON-null noteId BINDS as null (@Size passes null — the
        // Jackson law in the header); only a present WRONG TYPE is a
        // binding failure. CAPTURE-ADJUDICATED: the frozen-core case pins
        // the final truth.
        if (received !== "undefined" && received !== "null") {
          return c.json(malformedBody(), 400);
        }
      }
    }
    const noteId = parsed.success ? parsed.data.noteId : null;
    try {
      if (noteId === null) {
        // null passed validation in the frozen controller → the service's
        // 404-first law fires with the null id verbatim (:105-107).
        throw new NotFoundError("revision note", "null");
      }
      const view = await revisionNoteMarkViewed(sql, clock, auth.userId, noteId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

export function buildRevisionNotesRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return { revisionNotesRoute: createRevisionNotesRouter(sql, defaultClock) };
}
