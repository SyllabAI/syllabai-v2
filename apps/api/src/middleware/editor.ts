/**
 * requireEditor — the ADR-044 editor shell (§3), composing AFTER
 * requireAuth exactly as the ADR pins: unauthenticated requests take the
 * Boot-style 401 body before anything else runs; authenticated accounts
 * without an unrevoked editor_grants row take the Boot-style 403 body;
 * grant holders proceed (with their scopes carried on the request for the
 * handlers). No new error shapes, no new auth plumbing — the teacher-me
 * class verbatim, with the grant-row predicate instead of the role check.
 *
 * The grant is checked AT REQUEST TIME against editor_grants (never a
 * token claim) — revocation writes revoked_at and is effective on the
 * next request without a token-version bump (ADR §3).
 */
import type { Context, Next } from "hono";
import type { EditorModule } from "../services/editor";
import type { EditorMeView } from "@syllabai/contracts";
import { bootErrorBody, getAuth, requireAuth } from "./auth";

const EDITOR_KEY = "syllabai.editor";

/** The editor capability carried for handlers after the gate passes. */
export function getEditor(c: Context): EditorMeView | null {
  return (c.get(EDITOR_KEY as never) as EditorMeView | undefined) ?? null;
}

export function createEditorGate(editor: EditorModule) {
  return async (c: Context, next: Next) => {
    // shell law, verbatim composition order: the Boot 401 before anything
    const authGate = requireAuth(c);
    if (authGate instanceof Response) return authGate;
    // then the grant-row check (403 for authenticated grant-less accounts)
    const view = await editor.editorMe(authGate.userId);
    if (!view) {
      return c.json(bootErrorBody(403, new URL(c.req.url).pathname), 403);
    }
    c.set(EDITOR_KEY as never, view as never);
    await next();
  };
}
