/**
 * Workspace-document router (T-AUDIT-TIER1 run-003) — the generic envelope
 * over `user_documents` (packages/db 0025) that carries the hub's client
 * workspace stores (deck sessions, guided-flow state, progress overlays,
 * teacher classes, test-builder drafts, tutor / assistant / CLA-question
 * thread transcripts) into the account.
 *
 *   GET    /api/v1/me/documents       → WorkspaceDocList (the hydration list)
 *   GET    /api/v1/me/documents/:key  → WorkspaceDocGet (honest-null when absent)
 *   PUT    /api/v1/me/documents/:key  → WorkspaceDoc (the stored row)
 *   DELETE /api/v1/me/documents/:key  → 204
 *
 * ROUTE SECURITY (pdf-drawings posture): authenticated-only shell FIRST —
 * the 401 Boot body before any handler work; the owner id rides the JWT
 * context (getAuth(c).userId), NEVER the wire. A doc is the CALLING user's
 * by construction; there is no cross-user read on this surface.
 *
 * BINDING LAW (v2-native, pdf-drawings parity): an unknown/non-allow-list
 * key is 400 validation_failed "key: message" BEFORE any query (the
 * contracts workspaceDocKeySchema is the closed vocabulary — the five
 * dedicated-service sibling keys are REFUSED here, no shadow copies); an
 * unreadable PUT body is 400 malformed_body; a value over the 512 KB
 * serialized cap is 413 document_too_large (checked on the wire JSON — the
 * DB-side headroom law). GET of an absent doc is 200 {value:null}
 * (honest-null posture — the client's hydration path needs no 404
 * special-casing).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { WorkspaceDocs } from "../services/workspace-docs";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";
import {
  WORKSPACE_DOC_MAX_BYTES,
  workspaceDocKeySchema,
  workspaceDocPutRequestSchema,
} from "@syllabai/contracts";

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

function validationVerdict(field: string, message: string): { status: 400; body: ReturnType<typeof apiError> } {
  return { status: 400, body: apiError(400, "validation_failed", `${field}: ${message}`) };
}

export function createWorkspaceDocsRouter(docs: WorkspaceDocs): Hono {
  const r = new Hono();

  // authz shell FIRST — every surface here is caller-scoped (the JWT
  // context supplies the owner; 401 before any handler work).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — the whole doc set for the calling user (one hydration round-trip).
  r.get("/", async (c) => {
    const auth = getAuth(c)!;
    return c.json({ docs: await docs.list(auth.userId) });
  });

  // Resolve + validate the key ONCE for the :key routes — an unknown key is
  // a 400 BEFORE any query (the allow-list law).
  const keyOf = (c: Context, raw: string | undefined): { key: string } | Response => {
    const parsed = workspaceDocKeySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json(
        validationVerdict("key", issue?.message ?? "unknown workspace document key").body,
        400 as const,
      );
    }
    return { key: parsed.data };
  };

  r.get("/:key", async (c) => {
    const k = keyOf(c, c.req.param("key"));
    if (k instanceof Response) return k;
    const auth = getAuth(c)!;
    const row = await docs.get(auth.userId, k.key);
    return c.json({ key: k.key, value: row?.value ?? null, updatedAt: row?.updatedAt ?? null });
  });

  r.put("/:key", async (c) => {
    const k = keyOf(c, c.req.param("key"));
    if (k instanceof Response) return k;
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(malformedBody(), 400 as const);
    }
    const body = workspaceDocPutRequestSchema.safeParse(raw);
    if (!body.success) return c.json(malformedBody(), 400 as const);
    // 512 KB serialized cap — measured on the wire JSON (the DB headroom law).
    const serialized = JSON.stringify(body.data.value === undefined ? null : body.data.value);
    if (serialized.length > WORKSPACE_DOC_MAX_BYTES) {
      return c.json(
        apiError(413, "document_too_large", `value exceeds the ${WORKSPACE_DOC_MAX_BYTES}-byte envelope`),
        413 as const,
      );
    }
    const auth = getAuth(c)!;
    const row = await docs.put(auth.userId, k.key, body.data.value === undefined ? null : body.data.value);
    return c.json(row);
  });

  r.delete("/:key", async (c) => {
    const k = keyOf(c, c.req.param("key"));
    if (k instanceof Response) return k;
    const auth = getAuth(c)!;
    await docs.delete(auth.userId, k.key);
    return c.body(null, 204);
  });

  return r;
}

/** Composition root (the per-router builder convention). */
export function buildWorkspaceDocsRouters() {
  const sql = createSql(requireDatabaseUrl(process.env as { DATABASE_URL?: string }));
  return { workspaceDocsRoute: createWorkspaceDocsRouter(new WorkspaceDocs(sql)) };
}
