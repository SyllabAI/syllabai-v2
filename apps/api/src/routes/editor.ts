/**
 * Editor router — ADR-044 run-002 Phase 1 (v2-NATIVE, additive; NO
 * frozen-core counterpart). The capability surface of record, mounted
 * under "/api/v1/editor" (the teacher-me class verbatim):
 *
 *   GET  /me   → 200 EditorMeView ({ editor: true, scopes }) for a holder
 *                of an unrevoked editor_grants row; the Boot 403 body
 *                otherwise; the Boot 401 body unauthenticated.
 *
 * DELIBERATELY NO MORE (ADR §8/§10): the banks/preflight/proposals/review/
 * receipts surfaces are Phase 2; there is deliberately NO editor-reachable
 * serve or merge-to-main endpoint in ANY phase — step 7 of the pipeline
 * belongs to the lane machinery alone.
 *
 * Route security: the shell runs requireAuth FIRST (the Boot 401 before
 * any handler work — the classroom.ts shell law), then the grant-row
 * predicate (the requireEditor composition — ADR §3), then the handler.
 *
 * Exception law: this Phase 1 surface is a single read with no request
 * body — the two-envelope classifier has nothing to classify; the honest
 * failure modes are exactly 401 / 403 / 500 (infrastructure, never masked).
 */
import { Hono } from "hono";
import { buildEditorModule, type EditorModule } from "../services/editor";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { createEditorGate, getEditor } from "../middleware/editor";

export function createEditorRouter(module: EditorModule): Hono {
  const r = new Hono();

  // authz shell FIRST: the Boot 401 (unauthenticated) then the Boot 403
  // (authenticated-but-grant-less) — the teacher-me shell law with the
  // requireEditor predicate (ADR-044 §3).
  r.use("*", createEditorGate(module));

  // GET /me — the capability surface (ADR §8). The view is assembled by
  // the gate; the handler just renders it (the grant is read once per
  // request, never cached into a token — the revocation law).
  r.get("/me", async (c) => {
    return c.json(getEditor(c)!, 200); // gate invariant
  });

  return r;
}

export function buildEditorRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildEditorModule(sql);
  return { module, editorRoute: createEditorRouter(module) };
}
