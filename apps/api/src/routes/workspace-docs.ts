/**
 * Workspace-docs router — T-AUDIT-TIER1 run-003 (v2-NATIVE, additive; NO
 * frozen-core counterpart). The workspace-document plane, all under the
 * @RequestMapping-equivalent "/api/v1/me/documents":
 *
 *   GET    /            → 200 WorkspaceDocList (updated_at ascending)
 *   GET    /{key}       → 200 WorkspaceDocGet (honest null — never a 404)
 *   PUT    /{key}       ← PutWorkspaceDocRequest → 200 WorkspaceDoc
 *   DELETE /{key}       → 204
 *
 * Route security: the shell runs requireAuth FIRST (the Boot 401 before
 * any handler work — the classroom.ts shell law). NO role gate: this plane
 * is every signed-in account's own working state (learner AND teacher —
 * the tutor/assistant/CLA pools are learner surfaces; the run-004
 * teacher-classes key rides the same plane).
 *
 * Exception law (the teacher-me family, verbatim):
 *   unknown key           → 400 validation_failed BEFORE any query (the
 *                           closed-vocabulary routing law — the key IS the
 *                           routing decision; workspaceDocKeySchema)
 *   key length            → 400 validation_failed "key: ..." (same law)
 *   body binding failures → 400 malformed_body (the two-envelope R-1 law)
 *   absent value field    → 400 validation_failed "value: must not be null"
 *                           (the jakarta default law)
 *   >512KB value          → 413 document_too_large (the plane cap,
 *                           WORKSPACE_DOC_MAX_BYTES — measured on the
 *                           serialized value, before any query)
 *   constraint violations → 400 validation_failed (first field error)
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  putWorkspaceDocRequestSchema,
  WORKSPACE_DOC_MAX_BYTES,
  workspaceDocKeySchema,
} from "@syllabai/contracts";
import { WorkspaceDocs } from "../services/workspace-docs";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { getAuth, requireAuth } from "../middleware/auth";

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

/** The two-envelope classifier — the teacher-me edition of the learner-me
 *  law (R-1): binding failures beat constraints; the absent field is the
 *  jakarta default ("must not be null"). */
function classifyBodyError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    return { kind: "validation", message: `${field}: must not be null` };
  }
  return { kind: "validation", message: `${field}: ${first.message}` };
}

/** The closed-vocabulary key gate — the routing decision runs BEFORE any
 *  query (fail-closed: an unknown key can never be read, written or
 *  deleted into existence). */
function keyOf(raw: string): { ok: true; key: string } | { ok: false; status: 400 } {
  const parsed = workspaceDocKeySchema.safeParse(raw);
  if (parsed.success) return { ok: true, key: parsed.data };
  return { ok: false, status: 400 };
}

const keyRejected = (raw: string) => {
  const parsed = workspaceDocKeySchema.safeParse(raw);
  const message = parsed.success
    ? "invalid key"
    : `key: ${parsed.error.issues[0]?.message ?? "invalid key"}`;
  return apiError(400, "validation_failed", message);
};

export function createWorkspaceDocsRouter(module: WorkspaceDocs): Hono {
  const r = new Hono();

  // authz shell FIRST: the Boot 401 before any handler work — the
  // classroom.ts shell law. No role gate (every signed-in account owns
  // this plane).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — every stored doc for the account (updated_at ascending).
  r.get("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    return c.json({ documents: await module.list(auth.userId) }, 200);
  });

  // GET /{key} — the honest-null read (200 value:null updatedAt:null for
  // an absent doc, never a 404 on a fresh account).
  r.get("/:key", async (c) => {
    const keyGate = keyOf(c.req.param("key"));
    if (!keyGate.ok) return c.json(keyRejected(c.req.param("key")), 400);
    const auth = getAuth(c)!; // shell invariant
    const doc = await module.get(auth.userId, keyGate.key);
    return c.json(
      { key: keyGate.key, value: doc?.value ?? null, updatedAt: doc?.updatedAt ?? null },
      200,
    );
  });

  // PUT /{key} — the upsert of record: 200 receipt (key echoed, value
  // as-normalized, server updatedAt). Order of law: key gate → body
  // binding → value envelope → 413 cap → write.
  r.put("/:key", async (c) => {
    const rawKey = c.req.param("key");
    const keyGate = keyOf(rawKey);
    if (!keyGate.ok) return c.json(keyRejected(rawKey), 400);
    const raw = await readJsonBody(c);
    if (!raw) return c.json(malformedBody(), 400);
    const parsed = putWorkspaceDocRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    if (JSON.stringify(parsed.data.value)?.length > WORKSPACE_DOC_MAX_BYTES) {
      return c.json(
        apiError(
          413,
          "document_too_large",
          `value exceeds the ${WORKSPACE_DOC_MAX_BYTES}-byte workspace-document plane cap`,
        ),
        413,
      );
    }
    const auth = getAuth(c)!; // shell invariant
    return c.json(await module.put(auth.userId, keyGate.key, parsed.data.value), 200);
  });

  // DELETE /{key} — 204; deleting an absent doc is idempotent (still 204 —
  // the desired end-state already holds).
  r.delete("/:key", async (c) => {
    const rawKey = c.req.param("key");
    const keyGate = keyOf(rawKey);
    if (!keyGate.ok) return c.json(keyRejected(rawKey), 400);
    const auth = getAuth(c)!; // shell invariant
    await module.delete(auth.userId, keyGate.key);
    return c.body(null, 204);
  });

  return r;
}

export function buildWorkspaceDocsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return { workspaceDocsRoute: createWorkspaceDocsRouter(new WorkspaceDocs(sql)) };
}
